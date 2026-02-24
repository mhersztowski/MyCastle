import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Variables blocks. */
const HUE = 330;

/** Arduino type options for the variable casting dropdown. */
const ARDUINO_TYPES: [string, string][] = [
  ['Boolean', 'BOOLEAN'],
  ['Character', 'CHARACTER'],
  ['Number', 'NUMBER'],
  ['Long', 'LARGE_NUMBER'],
  ['Decimal', 'DECIMAL'],
  ['Text', 'TEXT'],
];

export function registerVariablesBlocks(_boardManager: BoardManager): void {
  Blockly.Blocks['variables_set_type'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/HomePage');
      this.setColour(HUE);
      this.appendValueInput('VARIABLE_SETTYPE_INPUT');
      this.appendDummyInput()
        .appendField('as')
        .appendField(
          new Blockly.FieldDropdown(ARDUINO_TYPES),
          'VARIABLE_SETTYPE_TYPE',
        );
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Cast a value to a specific Arduino type');
    },
  };
}
