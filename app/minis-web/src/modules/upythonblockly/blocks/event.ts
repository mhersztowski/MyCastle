import * as Blockly from 'blockly';

const HUE = '#FF6680';

export function registerEventBlocks(): void {
  /** Hat block: code inside runs once at startup → placed in def setup() */
  Blockly.Blocks['upy_start'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('setup');
      this.appendStatementInput('DO');
      this.setTooltip('Code here runs once at startup (setup function)');
      // No setPreviousStatement — hat block, nothing connects above
    },
  };

  /** Hat block: code inside loops forever → placed in def loop() */
  Blockly.Blocks['upy_forever'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('loop');
      this.appendStatementInput('DO');
      this.setTooltip('Code here repeats forever (loop function)');
      // No setPreviousStatement — hat block
    },
  };
}
