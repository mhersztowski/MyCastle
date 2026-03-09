/**
 * MicroPython code generator for Blockly v12+.
 * Generates a UIFlow2-style MicroPython script with:
 *   1. Import statements
 *   2. Top-level object initializations
 *   3. Optional user-defined functions
 *   4. `def setup():` — code from "when program starts" hat blocks
 *   5. `def loop():` — code from "forever" hat blocks + any loose statements
 *   6. `if __name__ == '__main__': try: setup(); while True: loop()`
 */

import * as Blockly from 'blockly';
import { Order } from './Order';

const PYTHON_RESERVED_WORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
  // MicroPython builtins
  'machine', 'time', 'network', 'print', 'input', 'len', 'range',
  'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple', 'set',
  'abs', 'min', 'max', 'round', 'open', 'type', 'isinstance',
].join(',');

export class UPythonGenerator extends Blockly.CodeGenerator {
  /** Import statements: key → statement (e.g. 'machine.Pin' → 'from machine import Pin') */
  imports_: Record<string, string> = Object.create(null);

  /** Top-level init lines: key → line (e.g. 'pin_out_2' → '_pin2 = Pin(2, Pin.OUT)') */
  inits_: Record<string, string> = Object.create(null);

  /** User-defined functions: funcName → def code block */
  userFunctions_: Record<string, string> = Object.create(null);

  /** Code collected by `upy_start` hat blocks → placed in `def setup():` */
  setup_stmts_: Record<string, string> = Object.create(null);

  /** Code collected by `upy_forever` hat blocks → placed in `def loop():` */
  forever_stmts_: Record<string, string> = Object.create(null);

  /** Variable names used in workspace — added as `global` in setup()/loop() */
  variables_: Set<string> = new Set();

  constructor() {
    super('uPython');
    // PEP 8: 4-space indentation
    this.INDENT = '    ';
    this.addReservedWords(PYTHON_RESERVED_WORDS);
    this.isInitialized = false;
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  override init(workspace: Blockly.Workspace): void {
    super.init(workspace);

    this.imports_ = Object.create(null);
    // Always include standard MicroPython imports (UIFlow2 style) — must be first.
    this.imports_['__std__'] = 'import os, sys, io';
    this.inits_ = Object.create(null);
    this.userFunctions_ = Object.create(null);
    this.setup_stmts_ = Object.create(null);
    this.forever_stmts_ = Object.create(null);
    this.variables_ = new Set();

    if (!this.nameDB_) {
      this.nameDB_ = new Blockly.Names(PYTHON_RESERVED_WORDS);
    } else {
      this.nameDB_.reset();
    }

    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.nameDB_.populateVariables(workspace);
    this.nameDB_.populateProcedures(workspace);

    this.isInitialized = true;
  }

  /**
   * Assemble the final UIFlow2-style MicroPython script.
   * Structure:
   *   <imports>
   *   <inits>
   *   <user functions>
   *   def setup():
   *       <setup_stmts_>
   *   def loop():
   *       <forever_stmts_> + <loose code>
   *   if __name__ == '__main__':
   *       try:
   *           setup()
   *           while True:
   *               loop()
   *       except (Exception, KeyboardInterrupt) as e:
   *           print(e)
   */
  override finish(code: string): string {
    const importLines = Object.values(this.imports_);
    const initLines = Object.values(this.inits_);
    const funcDefs = Object.values(this.userFunctions_);

    // setup_stmts_ / forever_stmts_ come from statementToCode() — already have one INDENT level.
    // `code` (loose top-level blocks) comes from workspaceToCode() — NOT yet indented.
    const setupBody = Object.values(this.setup_stmts_).join('');
    const foreverBodyStmts = Object.values(this.forever_stmts_).join('');

    // Module-level None initialization for all user variables (UIFlow2 style).
    // Skip entries already covered by inits_ (e.g. _old_* tracking vars).
    const varNoneLines = [...this.variables_]
      .filter((v) => this.inits_[v] === undefined)
      .map((v) => `${v} = None`);

    const importSection = importLines.length > 0 ? importLines.join('\n') + '\n' : '';
    const initSection = initLines.length > 0 ? '\n' + initLines.join('\n') + '\n' : '';
    const varNoneSection = varNoneLines.length > 0 ? varNoneLines.join('\n') + '\n' : '';
    const funcSection = funcDefs.length > 0 ? '\n' + funcDefs.join('\n\n') + '\n' : '';

    // global declaration for all user variables (shared between setup/loop)
    const globalDecl = this.variables_.size > 0
      ? this.INDENT + 'global ' + [...this.variables_].join(', ') + '\n'
      : '';

    /**
     * Build the body of a def block.
     * @param alreadyIndented - code from statementToCode (one INDENT level already applied)
     * @param loose - code from workspaceToCode top-level (zero indent, needs INDENT added)
     */
    const buildFuncBody = (alreadyIndented: string, loose: string): string => {
      const trimmedLoose = loose.trimEnd();
      const indentedLoose = trimmedLoose
        ? trimmedLoose.split('\n').map((l) => (l ? this.INDENT + l : l)).join('\n') + '\n'
        : '';
      const body = alreadyIndented + indentedLoose;
      if (!body.trim()) return globalDecl + this.INDENT + 'pass\n';
      return globalDecl + body;
    };

    const setupFn = `\ndef setup():\n${buildFuncBody(setupBody, '')}`;
    const loopFn = `\ndef loop():\n${buildFuncBody(foreverBodyStmts, code)}`;
    const mainBlock =
      `\nif __name__ == '__main__':\n` +
      `    try:\n` +
      `        setup()\n` +
      `        while True:\n` +
      `            loop()\n` +
      `    except (Exception, KeyboardInterrupt) as e:\n` +
      `        print(e)\n`;

    this.nameDB_?.reset();

    return importSection + initSection + varNoneSection + funcSection + setupFn + loopFn + mainBlock;
  }

  /**
   * Chain statements and prepend block comments (Python # style).
   */
  override scrub_(
    block: Blockly.Block,
    code: string,
    opt_thisOnly?: boolean,
  ): string {
    if (code === null) return '';

    let commentCode = '';
    if (!block.outputConnection || !block.outputConnection.targetConnection) {
      const comment = block.getCommentText();
      if (comment) {
        commentCode += this.prefixLines(comment + '\n', '# ');
      }
    }

    const nextBlock = block.nextConnection?.targetBlock() ?? null;
    const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);

    return commentCode + code + nextCode;
  }

  /** Top-level value expressions just become a statement. */
  override scrubNakedValue(line: string): string {
    return line + '\n';
  }

  // -------------------------------------------------------------------
  // Helpers for block generators
  // -------------------------------------------------------------------

  /** Register an import statement. Idempotent per key. */
  addImport(key: string, stmt: string): void {
    if (this.imports_[key] === undefined) {
      this.imports_[key] = stmt;
    }
  }

  /**
   * Register a top-level initialization line.
   * @param overwrite Replace existing entry for this key.
   */
  addInit(key: string, line: string, overwrite = false): void {
    if (overwrite || this.inits_[key] === undefined) {
      this.inits_[key] = line;
    }
  }

  /** Register a user-defined function definition. Idempotent. */
  addFunction(funcName: string, code: string): void {
    if (this.userFunctions_[funcName] === undefined) {
      this.userFunctions_[funcName] = code;
    }
  }

  /** Escape and quote a string for Python. */
  quote_(text: string): string {
    return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  }

  static readonly ORDER = Order;
}
