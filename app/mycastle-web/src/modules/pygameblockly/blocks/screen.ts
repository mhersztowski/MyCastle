import * as Blockly from 'blockly';

const HUE = '#4A8FD4';

export function registerScreenBlocks(): void {
  Blockly.Blocks['pg_screen_width'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('screen width');
      this.setOutput(true, 'Number');
      this.setTooltip('Current screen width in pixels');
    },
  };

  Blockly.Blocks['pg_screen_height'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('screen height');
      this.setOutput(true, 'Number');
      this.setTooltip('Current screen height in pixels');
    },
  };

  Blockly.Blocks['pg_set_caption'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TITLE').setCheck('String').appendField('set window title');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Change the window title at runtime');
    },
  };

  Blockly.Blocks['pg_wait'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('MS').setCheck('Number').appendField('wait (ms)');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Pause execution for given milliseconds (blocks the game loop!)');
    },
  };
}
