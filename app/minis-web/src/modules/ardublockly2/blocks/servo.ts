import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Servo blocks. */
const HUE = 60;

export function registerServoBlocks(boardManager: BoardManager): void {
  Blockly.Blocks['servo_write'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/ServoWrite');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('set servo pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'SERVO_PIN',
        );
      this.setInputsInline(false);
      this.appendValueInput('SERVO_ANGLE')
        .setCheck('Number')
        .appendField('to');
      this.appendDummyInput().appendField('degrees (0~180)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set a servo to a specified angle (0~180 degrees)');
    },
  };

  Blockly.Blocks['servo_read'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/ServoRead');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read servo pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'SERVO_PIN',
        );
      this.setOutput(true, 'Number');
      this.setTooltip('Read the angle of a servo attached to a specific pin');
    },
  };
}
