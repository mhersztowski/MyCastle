import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Map blocks. */
const HUE = 230;

export function registerMapBlocks(_boardManager: BoardManager): void {
  Blockly.Blocks['base_map'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/map');
      this.setColour(HUE);
      this.appendValueInput('NUM')
        .appendField('map')
        .setCheck('Number');
      this.appendValueInput('DMAX')
        .appendField('to [0 ~')
        .setCheck('Number');
      this.appendDummyInput().appendField(']');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip(
        'Re-map a number from [0 ~ 1023] to a new range defined by [0 ~ value]',
      );
    },
  };
}
