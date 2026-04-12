/**
 * Pygame code generator for Blockly v12+.
 *
 * Generates a Python/Pygame script in two modes:
 *   - 'native'  — standard desktop pygame app
 *   - 'web'     — pygbag-compatible (asyncio + await asyncio.sleep(0))
 *
 * Structure:
 *   1. Import statements
 *   2. pygame.init() + global vars (_screen, _clock, _fps, ...)
 *   3. User-defined functions
 *   4. def setup()  — code from pg_setup hat blocks
 *   5. def loop()   — code from pg_loop hat blocks   [native]
 *      async def main()                               [web]
 *   6. Entry point
 */

import * as Blockly from 'blockly';
import { Order } from './Order';

export type PygameMode = 'native' | 'web';

const PYTHON_RESERVED = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
  'pygame', 'asyncio', 'sys', 'math', 'print', 'input', 'len', 'range',
  'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple', 'set',
  'abs', 'min', 'max', 'round', 'type', 'isinstance',
  '_screen', '_clock', '_fps', '_screen_width', '_screen_height', '_window_title',
].join(',');

export class PygameGenerator extends Blockly.CodeGenerator {
  /** Output mode — set by PygameBlocklyService before code generation. */
  mode_: PygameMode = 'native';

  /** Import statements: key → line */
  imports_: Record<string, string> = Object.create(null);

  /** Top-level init lines: key → line */
  inits_: Record<string, string> = Object.create(null);

  /** User-defined functions */
  userFunctions_: Record<string, string> = Object.create(null);

  /** Code from pg_setup hat blocks → def setup() */
  setup_stmts_: Record<string, string> = Object.create(null);

  /** Code from pg_loop hat blocks → def loop() / async def main() body */
  loop_stmts_: Record<string, string> = Object.create(null);

  /** Code from pg_on_events hat blocks → placed inside for _event loop */
  event_stmts_: Record<string, string> = Object.create(null);

  /** User variable names */
  variables_: Set<string> = new Set();

  constructor() {
    super('Pygame');
    this.INDENT = '    ';
    this.addReservedWords(PYTHON_RESERVED);
    this.isInitialized = false;
  }

  override init(workspace: Blockly.Workspace): void {
    super.init(workspace);

    this.imports_ = Object.create(null);
    this.inits_ = Object.create(null);
    this.userFunctions_ = Object.create(null);
    this.setup_stmts_ = Object.create(null);
    this.loop_stmts_ = Object.create(null);
    this.event_stmts_ = Object.create(null);
    this.variables_ = new Set();

    // Default window config — overridden by pg_set_window block
    this.inits_['_screen_width'] = '_screen_width = 800';
    this.inits_['_screen_height'] = '_screen_height = 600';
    this.inits_['_window_title'] = "_window_title = 'My Pygame Game'";
    this.inits_['_fps'] = '_fps = 60';

    if (!this.nameDB_) {
      this.nameDB_ = new Blockly.Names(PYTHON_RESERVED);
    } else {
      this.nameDB_.reset();
    }

    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.nameDB_.populateVariables(workspace);
    this.nameDB_.populateProcedures(workspace);

    this.isInitialized = true;
  }

  override finish(code: string): string {
    const I = this.INDENT;
    const I2 = I + I;
    const I3 = I + I + I;
    const importLines = Object.values(this.imports_);
    const funcDefs = Object.values(this.userFunctions_);
    const setupBody = Object.values(this.setup_stmts_).join('');
    const loopBodyStmts = Object.values(this.loop_stmts_).join('');

    const varNoneLines = [...this.variables_]
      .filter((v) => this.inits_[v] === undefined)
      .map((v) => `${v} = None`);

    // ---- imports ----
    const stdImports = ['import pygame', 'import sys'];
    if (this.mode_ === 'web') stdImports.push('import asyncio');
    if (importLines.length > 0) stdImports.push(...importLines);
    const importSection = stdImports.join('\n') + '\n';

    // ---- pygame init + screen (native mode only — in web mode all init goes inside async def main()) ----
    const initLines = Object.values(this.inits_);
    const pygameInitSection = [
      '\npygame.init()',
      ...initLines,
      '_screen = pygame.display.set_mode((_screen_width, _screen_height))',
      'pygame.display.set_caption(_window_title)',
      '_clock = pygame.time.Clock()',
    ].join('\n') + '\n';

    // ---- var none section ----
    const varNoneSection = varNoneLines.length > 0 ? '\n' + varNoneLines.join('\n') + '\n' : '';

    // ---- user functions ----
    const funcSection = funcDefs.length > 0 ? '\n' + funcDefs.join('\n\n') + '\n' : '';

    // ---- global decl (for user vars) ----
    const globalDecl = this.variables_.size > 0
      ? I + 'global ' + [...this.variables_].join(', ') + '\n'
      : '';

    const buildFuncBody = (alreadyIndented: string, loose: string): string => {
      const trimmedLoose = loose.trimEnd();
      const indentedLoose = trimmedLoose
        ? trimmedLoose.split('\n').map((l) => (l ? I + l : l)).join('\n') + '\n'
        : '';
      const body = alreadyIndented + indentedLoose;
      if (!body.trim()) return globalDecl + I + 'pass\n';
      return globalDecl + body;
    };

    // ---- setup() ----
    const setupFn = `\ndef setup():\n${buildFuncBody(setupBody, '')}`;

    // ---- event loop (quit always injected + user event_stmts_) ----
    const userEventCode = Object.values(this.event_stmts_).join('');
    // user event code is from statementToCode — already has 1 indent level (relative to loop body)
    // inside the for _event loop we need 2 indent levels total, so shift by I
    const shiftedUserEvent = userEventCode
      .split('\n')
      .map((l) => (l ? I + l : l))
      .join('\n');
    const quitCheck =
      I + 'for _event in pygame.event.get():\n' +
      I2 + 'if _event.type == pygame.QUIT:\n' +
      I3 + 'pygame.quit()\n' +
      I3 + 'sys.exit()\n' +
      (shiftedUserEvent.trim() ? shiftedUserEvent + '\n' : '');

    // ---- loop body (loop_stmts + loose code) ----
    const trimmedLoose = code.trimEnd();
    const indentedLoose = trimmedLoose
      ? trimmedLoose.split('\n').map((l) => (l ? I + l : l)).join('\n') + '\n'
      : '';
    const userLoopCode = loopBodyStmts + indentedLoose;

    const displayFlip = I + 'pygame.display.flip()\n';
    const clockTick = I + '_clock.tick(_fps)\n';

    let entryPoint: string;

    if (this.mode_ === 'native') {
      // def loop() + while True: loop()
      const loopBody = quitCheck + userLoopCode + displayFlip + clockTick;
      const loopFn = `\ndef loop():\n${globalDecl}${loopBody || I + 'pass\n'}`;
      entryPoint =
        `\nsetup()\n` +
        `while True:\n` +
        `${I}loop()\n`;
      this.nameDB_?.reset();
      return importSection + pygameInitSection + varNoneSection + funcSection + setupFn + loopFn + entryPoint;
    } else {
      // async def main() with await asyncio.sleep(0)
      // In pygbag/WASM, ALL pygame initialization (init, set_mode, Clock, SysFont, etc.)
      // must happen inside the asyncio event loop — not at module level. The SDL canvas
      // and WASM filesystem aren't ready until the loop starts.
      const pygameInitInMain =
        I + 'pygame.init()\n' +
        initLines.map((l) => I + l).join('\n') + (initLines.length ? '\n' : '') +
        I + '_screen = pygame.display.set_mode((_screen_width, _screen_height))\n' +
        I + 'pygame.display.set_caption(_window_title)\n' +
        I + '_clock = pygame.time.Clock()\n';
      const inlineSetup = setupBody; // already has 1-level indent from statementToCode
      const mainBody =
        pygameInitInMain +
        inlineSetup +
        I + 'while True:\n' +
        quitCheck.split('\n').map((l) => (l ? I + l : l)).join('\n') + '\n' +
        userLoopCode.split('\n').map((l) => (l ? I + l : l)).join('\n') + '\n' +
        I2 + 'pygame.display.flip()\n' +
        I2 + '_clock.tick(_fps)\n' +
        I2 + 'await asyncio.sleep(0)\n';
      const mainFn = `\nasync def main():\n${mainBody || I + 'pass\n'}`;
      entryPoint = '\nasyncio.run(main())\n';
      this.nameDB_?.reset();
      return importSection + funcSection + mainFn + entryPoint;
    }
  }

  override scrub_(block: Blockly.Block, code: string, opt_thisOnly?: boolean): string {
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

  override scrubNakedValue(line: string): string {
    return line + '\n';
  }

  addImport(key: string, stmt: string): void {
    if (this.imports_[key] === undefined) {
      this.imports_[key] = stmt;
    }
  }

  addInit(key: string, line: string, overwrite = false): void {
    if (overwrite || this.inits_[key] === undefined) {
      this.inits_[key] = line;
    }
  }

  addFunction(funcName: string, code: string): void {
    if (this.userFunctions_[funcName] === undefined) {
      this.userFunctions_[funcName] = code;
    }
  }

  quote_(text: string): string {
    return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  }

  static readonly ORDER = Order;
}
