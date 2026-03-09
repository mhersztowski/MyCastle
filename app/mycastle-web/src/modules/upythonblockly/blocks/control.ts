import * as Blockly from 'blockly';

const LOOP_HUE = 120;
const CONTROL_HUE = 30;
const SWITCH_HUE = 260;
const EVENT_HUE = 330;

export function registerControlBlocks(): void {
  // ── for var in range(n) ────────────────────────────────────────────────────

  /** Iterate a variable over range(n) — simpler alternative to controls_for */
  Blockly.Blocks['upy_for_in_range'] = {
    init(this: Blockly.Block) {
      this.setColour(LOOP_HUE);
      this.appendValueInput('TIMES')
        .appendField('for')
        .appendField(new Blockly.FieldVariable('k'), 'VAR')
        .appendField('in range');
      this.appendStatementInput('DO').appendField('do');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Iterate variable over range(n): for var in range(n)');
    },
  };

  // ── try / except ───────────────────────────────────────────────────────────

  /** Exception handling: try a block of code and catch any error */
  Blockly.Blocks['upy_try_except'] = {
    init(this: Blockly.Block) {
      this.setColour(CONTROL_HUE);
      this.appendStatementInput('TRY').appendField('try');
      this.appendStatementInput('EXCEPT').appendField('except');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Try/except error handling');
    },
  };

  // ── switch / case (match-like) ─────────────────────────────────────────────

  /**
   * Switch-case block with a dynamic number of cases (mutator).
   * Generates if/elif/else for MicroPython compatibility.
   */
  Blockly.Blocks['upy_switch'] = {
    itemCount_: 1,

    init(this: Blockly.Block) {
      this.setColour(SWITCH_HUE);
      this.appendValueInput('EXPR').appendField('switch');
      this.appendValueInput('CASE0').appendField('case');
      this.appendStatementInput('DO0');
      this.appendStatementInput('DEFAULT').appendField('default');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setMutator(new Blockly.icons.MutatorIcon(['upy_switch_case_item'], this as Blockly.BlockSvg));
      this.setTooltip('Switch/case: generates if/elif/else (MicroPython compatible). Use the mutator to add/remove cases.');
    },

    mutationToDom(this: Blockly.Block): Element {
      const container = Blockly.utils.xml.createElement('mutation');
      container.setAttribute('items', String((this as any).itemCount_));
      return container;
    },

    domToMutation(this: Blockly.Block, xmlElement: Element): void {
      (this as any).itemCount_ = parseInt(xmlElement.getAttribute('items') ?? '1', 10);
      (this as any).updateShape_();
    },

    decompose(this: Blockly.Block, workspace: Blockly.WorkspaceSvg): Blockly.Block {
      const container = workspace.newBlock('upy_switch_mutator');
      (container as any).initSvg();
      let conn = container.getInput('STACK')!.connection!;
      for (let i = 0; i < (this as any).itemCount_; i++) {
        const item = workspace.newBlock('upy_switch_case_item');
        (item as any).initSvg();
        conn.connect(item.previousConnection!);
        conn = item.nextConnection!;
      }
      return container;
    },

    compose(this: Blockly.Block, container: Blockly.Block): void {
      // Collect saved connections from mutator popup items
      let item = container.getInputTargetBlock('STACK');
      const caseConns: Array<Blockly.Connection | null> = [];
      const doConns: Array<Blockly.Connection | null> = [];
      while (item && item.type === 'upy_switch_case_item') {
        caseConns.push((item as any).valueConnection_ ?? null);
        doConns.push((item as any).statementConnection_ ?? null);
        item = item.getNextBlock();
      }
      (this as any).itemCount_ = caseConns.length;
      (this as any).updateShape_();
      for (let i = 0; i < caseConns.length; i++) {
        if (caseConns[i]) this.getInput(`CASE${i}`)?.connection?.connect(caseConns[i]!);
        if (doConns[i]) this.getInput(`DO${i}`)?.connection?.connect(doConns[i]!);
      }
    },

    saveConnections(this: Blockly.Block, container: Blockly.Block): void {
      let item = container.getInputTargetBlock('STACK');
      let i = 0;
      while (item && item.type === 'upy_switch_case_item') {
        (item as any).valueConnection_ =
          this.getInput(`CASE${i}`)?.connection?.targetConnection ?? null;
        (item as any).statementConnection_ =
          this.getInput(`DO${i}`)?.connection?.targetConnection ?? null;
        i++;
        item = item.getNextBlock();
      }
    },

    updateShape_(this: Blockly.Block): void {
      let i = 0;
      while (this.getInput(`CASE${i}`)) {
        this.removeInput(`CASE${i}`);
        this.removeInput(`DO${i}`);
        i++;
      }
      if (this.getInput('DEFAULT')) this.removeInput('DEFAULT');
      for (let j = 0; j < (this as any).itemCount_; j++) {
        this.appendValueInput(`CASE${j}`).appendField('case');
        this.appendStatementInput(`DO${j}`);
      }
      this.appendStatementInput('DEFAULT').appendField('default');
    },
  };

  /** Mutator popup container for upy_switch */
  Blockly.Blocks['upy_switch_mutator'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('switch');
      this.appendStatementInput('STACK');
      this.setColour(SWITCH_HUE);
      this.setTooltip('Add or remove case entries');
      this.contextMenu = false;
    },
  };

  /** Mutator popup item representing one case */
  Blockly.Blocks['upy_switch_case_item'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('case');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(SWITCH_HUE);
      this.setTooltip('One case entry');
      this.contextMenu = false;
    },
  };

  // ── when variable changes ──────────────────────────────────────────────────

  /**
   * Detects when a variable changes value and runs DO, otherwise runs ELSE.
   * Internally tracks the previous value in a _old_{var} helper variable.
   */
  Blockly.Blocks['upy_when_var_changes'] = {
    init(this: Blockly.Block) {
      this.setColour(EVENT_HUE);
      this.appendDummyInput()
        .appendField('When')
        .appendField(new Blockly.FieldVariable('i'), 'VAR')
        .appendField('is change');
      this.appendStatementInput('DO').appendField('do');
      this.appendStatementInput('ELSE').appendField('else');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Run "do" when variable changes value, "else" otherwise. Creates a hidden tracking variable.',
      );
    },
  };
}
