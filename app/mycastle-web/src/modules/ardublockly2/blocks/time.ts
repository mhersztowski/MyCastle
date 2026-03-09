import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Time blocks. */
const HUE = 140;

export function registerTimeBlocks(_boardManager: BoardManager): void {
  Blockly.Blocks['time_delay'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/Delay');
      this.setColour(HUE);
      this.appendValueInput('DELAY_TIME_MILI')
        .setCheck('Number')
        .appendField('wait');
      this.appendDummyInput().appendField('milliseconds');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Wait for a specified number of milliseconds');
    },
  };

  Blockly.Blocks['time_delaymicros'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/DelayMicroseconds');
      this.setColour(HUE);
      this.appendValueInput('DELAY_TIME_MICRO')
        .setCheck('Number')
        .appendField('wait');
      this.appendDummyInput().appendField('microseconds');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Wait for a specified number of microseconds');
    },
  };

  Blockly.Blocks['time_millis'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/Millis');
      this.setColour(HUE);
      this.appendDummyInput().appendField('elapsed milliseconds');
      this.setOutput(true, 'Number');
      this.setTooltip(
        'Returns the number of milliseconds since the Arduino began running the current program (unsigned long)',
      );
    },
  };

  Blockly.Blocks['time_micros'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/Micros');
      this.setColour(HUE);
      this.appendDummyInput().appendField('elapsed microseconds');
      this.setOutput(true, 'Number');
      this.setTooltip(
        'Returns the number of microseconds since the Arduino began running the current program (unsigned long)',
      );
    },
  };

  Blockly.Blocks['infinite_loop'] = {
    init: function (this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('wait forever (end program)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setTooltip(
        'Wait indefinitely, stopping the program from continuing',
      );
    },
  };
}
