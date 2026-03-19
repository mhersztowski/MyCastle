import * as Blockly from 'blockly';

const HUE = '#E05C6B';

export function registerEventBlocks(): void {
  Blockly.Blocks['pg_setup'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('🎮 setup');
      this.appendStatementInput('DO');
      this.setTooltip('Code here runs once at startup');
    },
  };

  Blockly.Blocks['pg_loop'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('🔁 loop (every frame)');
      this.appendStatementInput('DO');
      this.setTooltip('Code here runs every frame');
    },
  };
}
