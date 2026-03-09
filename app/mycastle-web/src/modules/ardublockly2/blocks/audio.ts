import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Audio/Tone blocks. */
const HUE = 250;

export function registerAudioBlocks(boardManager: BoardManager): void {
  Blockly.Blocks['io_tone'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('https://www.arduino.cc/en/Reference/tone');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('set tone on pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'TONEPIN',
        );
      this.appendValueInput('FREQUENCY')
        .setCheck('Number')
        .appendField('frequency');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Generate a square wave tone on a pin at the specified frequency',
      );
    },

    onchange: function (
      this: Blockly.Block,
      event: Blockly.Events.Abstract,
    ) {
      if (!this.workspace) return;
      if (
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.CLICK
      ) {
        return;
      }

      // Check if frequency input has a connected block with a numeric value
      const freqInput = this.getInput('FREQUENCY');
      if (freqInput && freqInput.connection && freqInput.connection.targetBlock()) {
        const targetBlock = freqInput.connection.targetBlock();
        if (targetBlock && targetBlock.type === 'math_number') {
          const freq = Number(targetBlock.getFieldValue('NUM'));
          if (freq < 31 || freq > 65535) {
            this.setWarningText(
              'Frequency must be between 31 and 65535 Hz',
              'io_tone',
            );
            return;
          }
        }
      }
      this.setWarningText(null, 'io_tone');
    },
  };

  Blockly.Blocks['io_notone'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('https://www.arduino.cc/en/Reference/noTone');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('stop tone on pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'TONEPIN',
        );
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Stop tone generation on the specified pin');
    },
  };
}
