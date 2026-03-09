import * as Blockly from 'blockly';

const HUE = 140;

export function registerTimeBlocks(): void {
  Blockly.Blocks['upy_sleep_ms'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('MS')
        .appendField('sleep')
        .setCheck('Number');
      this.appendDummyInput().appendField('ms');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Pause execution for the given number of milliseconds');
    },
  };

  Blockly.Blocks['upy_sleep_us'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('US')
        .appendField('sleep')
        .setCheck('Number');
      this.appendDummyInput().appendField('µs');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Pause execution for the given number of microseconds');
    },
  };

  Blockly.Blocks['upy_ticks_ms'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('ticks_ms()');
      this.setOutput(true, 'Number');
      this.setTooltip('Return millisecond counter (wraps around)');
    },
  };

  Blockly.Blocks['upy_ticks_us'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('ticks_us()');
      this.setOutput(true, 'Number');
      this.setTooltip('Return microsecond counter (wraps around)');
    },
  };

}
