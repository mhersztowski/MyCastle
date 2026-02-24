/**
 * Arduino (C++) code generator for Blockly v12+.
 * Ported from the original Ardublockly arduino.js (Closure / Blockly.Generator)
 * to a typed TypeScript class extending Blockly.CodeGenerator.
 */

import * as Blockly from 'blockly';

import type { BoardManager } from '../boards/BoardManager';
import { Order } from './Order';
import type { PinType } from './PinTypes';

// inputTypes.VALUE is not re-exported through blockly's public API in v12,
// but its numeric value (1) matches ConnectionType.INPUT_VALUE.
const INPUT_TYPE_VALUE = 1;

// ---------------------------------------------------------------------------
// Type mapping helpers
// ---------------------------------------------------------------------------

/**
 * Blockly type-id to Arduino C++ type string.
 * The keys mirror Blockly.Types.*.typeId from the original Ardublockly
 * static-typing system. When blocks carry typed connections we look up
 * the typeId here; when no block is connected we default to "int".
 */
const BLOCKLY_TYPE_TO_ARDUINO: Record<string, string> = {
  Short_Number: 'char',
  Number: 'int',
  Large_Number: 'long',
  Decimal: 'float',
  Text: 'String',
  Character: 'char',
  Boolean: 'boolean',
  Null: 'void',
  Undef: 'undefined',
  ChildBlockMissing: 'int',
};

// ---------------------------------------------------------------------------
// Reserved words
// ---------------------------------------------------------------------------

const RESERVED_WORDS = [
  'Blockly',
  'setup', 'loop', 'if', 'else', 'for', 'switch', 'case', 'while', 'do',
  'break', 'continue', 'return', 'goto',
  'define', 'include', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP',
  'true', 'false', 'integer', 'constants', 'floating', 'point',
  'void', 'boolean', 'char', 'unsigned', 'byte', 'int', 'word', 'long',
  'float', 'double', 'string', 'String', 'array', 'static', 'volatile',
  'const', 'sizeof',
  'pinMode', 'digitalWrite', 'digitalRead', 'analogReference', 'analogRead',
  'analogWrite', 'tone', 'noTone', 'shiftOut', 'shiftIn', 'pulseIn',
  'millis', 'micros', 'delay', 'delayMicroseconds',
  'min', 'max', 'abs', 'constrain', 'map', 'pow', 'sqrt',
  'sin', 'cos', 'tan', 'randomSeed', 'random',
  'lowByte', 'highByte', 'bitRead', 'bitWrite', 'bitSet', 'bitClear', 'bit',
  'attachInterrupt', 'detachInterrupt', 'interrupts', 'noInterrupts',
].join(',');

// ---------------------------------------------------------------------------
// ArduinoGenerator
// ---------------------------------------------------------------------------

/**
 * Code generator that translates Blockly blocks into an Arduino C++ sketch.
 *
 * Usage:
 * ```ts
 * const boardManager = new BoardManager('uno');
 * const generator = new ArduinoGenerator(boardManager);
 * const code = generator.workspaceToCode(workspace);
 * ```
 */
export class ArduinoGenerator extends Blockly.CodeGenerator {
  readonly boardManager: BoardManager;

  // Dictionaries populated during init() and consumed in finish().
  // They are re-created on every generation pass to avoid stale data.
  includes_: Record<string, string> = Object.create(null);
  variables_: Record<string, string> = Object.create(null);
  declarations_: Record<string, string> = Object.create(null);
  codeFunctions_: Record<string, string> = Object.create(null);
  userFunctions_: Record<string, string> = Object.create(null);
  setups_: Record<string, string> = Object.create(null);
  pins_: Record<string, string> = Object.create(null);

  // Persistent entries registered from external config — survive init() resets.
  private baseIncludes_: Record<string, string> = Object.create(null);
  private baseSetups_: Record<string, string> = Object.create(null);

  constructor(boardManager: BoardManager) {
    super('Arduino');
    this.boardManager = boardManager;

    this.addReservedWords(RESERVED_WORDS);

    this.isInitialized = false;
  }

  // -------------------------------------------------------------------
  // Lifecycle hooks called by workspaceToCode → blockToCode pipeline
  // -------------------------------------------------------------------

  /**
   * Initialise dictionaries before code generation begins.
   * Called automatically by `workspaceToCode`.
   */
  override init(workspace: Blockly.Workspace): void {
    super.init(workspace);

    this.includes_ = Object.create(null);
    this.variables_ = Object.create(null);
    this.declarations_ = Object.create(null);
    this.codeFunctions_ = Object.create(null);
    this.userFunctions_ = Object.create(null);
    this.setups_ = Object.create(null);
    this.pins_ = Object.create(null);

    // Restore persistent entries from external config
    Object.assign(this.includes_, this.baseIncludes_);
    Object.assign(this.setups_, this.baseSetups_);

    if (!this.nameDB_) {
      this.nameDB_ = new Blockly.Names(RESERVED_WORDS);
    } else {
      this.nameDB_.reset();
    }

    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.nameDB_.populateVariables(workspace);
    this.nameDB_.populateProcedures(workspace);

    this.isInitialized = true;
  }

  /**
   * Assemble the final Arduino sketch from the collected dictionaries.
   * Produces: includes -> variables -> declarations -> functions -> setup() -> loop().
   */
  override finish(code: string): string {
    const includes: string[] = [];
    const variables: string[] = [];
    const declarations: string[] = [];
    const functions: string[] = [];

    for (const key in this.includes_) {
      includes.push(this.includes_[key]);
    }
    if (includes.length) includes.push('\n');

    for (const key in this.variables_) {
      variables.push(this.variables_[key]);
    }
    if (variables.length) variables.push('\n');

    for (const key in this.declarations_) {
      declarations.push(this.declarations_[key]);
    }
    if (declarations.length) declarations.push('\n');

    for (const key in this.codeFunctions_) {
      functions.push(this.codeFunctions_[key]);
    }
    for (const key in this.userFunctions_) {
      functions.push(this.userFunctions_[key]);
    }
    if (functions.length) functions.push('\n');

    // Build setup() body; userSetupCode goes last without leading indent
    const setupEntries: string[] = [''];
    let userSetupCode = '';
    if (this.setups_['userSetupCode'] !== undefined) {
      userSetupCode = '\n' + this.setups_['userSetupCode'];
      delete this.setups_['userSetupCode'];
    }
    for (const key in this.setups_) {
      setupEntries.push(this.setups_[key]);
    }
    if (userSetupCode) {
      setupEntries.push(userSetupCode);
    }

    // Clean up temporary data
    this.nameDB_?.reset();

    const allDefs =
      includes.join('\n') +
      variables.join('\n') +
      declarations.join('\n') +
      functions.join('\n\n');

    const setup = 'void setup() {' + setupEntries.join('\n  ') + '\n}\n\n';
    const loop = 'void loop() {\n  ' + code.replace(/\n/g, '\n  ') + '\n}';

    return allDefs + setup + loop;
  }

  /**
   * Chain statements together and prepend block comments.
   */
  override scrub_(
    block: Blockly.Block,
    code: string,
    opt_thisOnly?: boolean,
  ): string {
    if (code === null) return '';

    let commentCode = '';

    // Collect comments for non-inline (statement-level) blocks
    if (!block.outputConnection || !block.outputConnection.targetConnection) {
      const comment = block.getCommentText();
      if (comment) {
        commentCode += this.prefixLines(comment, '// ') + '\n';
      }
      // Collect comments from value inputs
      // inputTypes.VALUE is not re-exported by blockly, but its numeric value is 1
      for (const input of block.inputList) {
        if ((input.type as number) === INPUT_TYPE_VALUE) {
          const childBlock = input.connection?.targetBlock();
          if (childBlock) {
            const childComment = this.allNestedComments(childBlock);
            if (childComment) {
              commentCode += this.prefixLines(childComment, '// ');
            }
          }
        }
      }
    }

    const nextBlock = block.nextConnection?.targetBlock() ?? null;
    const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);

    return commentCode + code + nextCode;
  }

  /**
   * Naked values (top-level value blocks not connected to anything)
   * need a trailing semicolon in C++.
   */
  override scrubNakedValue(line: string): string {
    return line + ';\n';
  }

  // -------------------------------------------------------------------
  // Helper methods called by per-block generators
  // -------------------------------------------------------------------

  /**
   * Register an #include directive. Idempotent per tag.
   * When called outside of code generation (e.g. from config script),
   * the include persists across generation passes.
   */
  addInclude(includeTag: string, code: string): void {
    if (this.includes_[includeTag] === undefined) {
      this.includes_[includeTag] = code;
    }
    if (!this.isInitialized) {
      this.baseIncludes_[includeTag] = code;
    }
  }

  /**
   * Register a global declaration (after variables, before functions).
   * Idempotent per tag.
   */
  addDeclaration(declarationTag: string, code: string): void {
    if (this.declarations_[declarationTag] === undefined) {
      this.declarations_[declarationTag] = code;
    }
  }

  /**
   * Register a global variable.
   * @param overwrite When true, replaces any previous value for this variable.
   * @returns true if the variable was (over)written.
   */
  addVariable(varName: string, code: string, overwrite = false): boolean {
    if (overwrite || this.variables_[varName] === undefined) {
      this.variables_[varName] = code;
      return true;
    }
    return false;
  }

  /**
   * Register code to run inside setup().
   * @param overwrite When true, replaces any previous value for this tag.
   * @returns true if the setup entry was (over)written.
   */
  addSetup(setupTag: string, code: string, overwrite = false): boolean {
    if (overwrite || this.setups_[setupTag] === undefined) {
      this.setups_[setupTag] = code;
      if (!this.isInitialized) {
        this.baseSetups_[setupTag] = code;
      }
      return true;
    }
    return false;
  }

  /**
   * Register a helper function generated by the code generator.
   * Uses provideFunction_ internally to guarantee unique names.
   * @returns The actual (potentially de-duplicated) function name.
   */
  addFunction(preferredName: string, code: string): string {
    if (this.codeFunctions_[preferredName] === undefined) {
      const uniqueName = this.nameDB_!.getDistinctName(
        preferredName,
        Blockly.Names.NameType.DEVELOPER_VARIABLE,
      );
      this.codeFunctions_[preferredName] = code.replace(
        this.FUNCTION_NAME_PLACEHOLDER_REGEXP_,
        uniqueName,
      );
      this.functionNames_[preferredName] = uniqueName;
    }
    return this.functionNames_[preferredName];
  }

  /**
   * Track pin usage and warn if the same pin is used for conflicting types.
   */
  reservePin(
    block: Blockly.Block,
    pin: string,
    pinType: PinType,
    warningTag: string,
  ): void {
    if (this.pins_[pin] !== undefined) {
      if (this.pins_[pin] !== pinType) {
        block.setWarningText(
          `Pin ${pin} is used as ${warningTag} (${pinType}) ` +
            `but was already reserved as ${this.pins_[pin]}.`,
          warningTag,
        );
      } else {
        block.setWarningText(null, warningTag);
      }
    } else {
      this.pins_[pin] = pinType;
      block.setWarningText(null, warningTag);
    }
  }

  /**
   * Convert a Blockly type-id string to the corresponding Arduino C++ type.
   * Falls back to "int" for unknown / missing types.
   */
  getArduinoType(typeId: string): string {
    return BLOCKLY_TYPE_TO_ARDUINO[typeId] ?? 'int';
  }

  /**
   * Encode a string as a properly escaped Arduino string literal with quotes.
   */
  quote_(text: string): string {
    const escaped = text
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\\n')
      .replace(/\$/g, '\\$')
      .replace(/'/g, "\\'");
    return `"${escaped}"`;
  }

  // Re-export Order as a static property so block generators can reference
  // it conveniently: `generator.ORDER.ATOMIC` etc.
  static readonly ORDER = Order;
}
