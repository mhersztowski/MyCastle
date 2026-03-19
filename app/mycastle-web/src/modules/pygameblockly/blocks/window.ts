import * as Blockly from 'blockly';

const HUE = '#4A8FD4';

export function registerWindowBlocks(): void {
  Blockly.Blocks['pg_set_window'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('WIDTH')
        .setCheck('Number')
        .appendField('window  width');
      this.appendValueInput('HEIGHT')
        .setCheck('Number')
        .appendField('height');
      this.appendValueInput('TITLE')
        .setCheck('String')
        .appendField('title');
      this.appendValueInput('FPS')
        .setCheck('Number')
        .appendField('FPS');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Set window size, title and target FPS');
    },
  };
}
