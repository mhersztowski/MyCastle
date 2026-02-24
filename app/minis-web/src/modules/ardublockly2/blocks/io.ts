import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all IO blocks. */
const HUE = 250;

export function registerIoBlocks(boardManager: BoardManager): void {
  Blockly.Blocks['io_digitalwrite'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/DigitalWrite');
      this.setColour(HUE);
      this.appendValueInput('STATE')
        .appendField('set digital pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'PIN',
        )
        .appendField('to')
        .setCheck('Boolean');
      this.setInputsInline(false);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Write digital value HIGH or LOW to a specific pin');
    },
  };

  Blockly.Blocks['io_digitalread'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/DigitalRead');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read digital pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'PIN',
        );
      this.setOutput(true, 'Boolean');
      this.setTooltip('Read digital value (HIGH or LOW) from a specific pin');
    },
  };

  Blockly.Blocks['io_builtin_led'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/DigitalWrite');
      this.setColour(HUE);
      this.appendValueInput('STATE')
        .appendField('set built-in LED')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.builtinLed),
          'BUILT_IN_LED',
        )
        .appendField('to')
        .setCheck('Boolean');
      this.setInputsInline(false);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set the built-in LED to a state (HIGH or LOW)');
    },
  };

  Blockly.Blocks['io_analogwrite'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/AnalogWrite');
      this.setColour(HUE);
      this.appendValueInput('NUM')
        .appendField('set analog pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.pwmPins),
          'PIN',
        )
        .appendField('to')
        .setCheck('Number');
      this.setInputsInline(false);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Write analog value (PWM 0~255) to a specific pin',
      );
    },
  };

  Blockly.Blocks['io_analogread'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/AnalogRead');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read analog pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.analogPins),
          'PIN',
        );
      this.setOutput(true, 'Number');
      this.setTooltip('Read analog value (0~1023) from a specific pin');
    },
  };

  Blockly.Blocks['io_highlow'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/Constants');
      this.setColour(HUE);
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown([
          ['HIGH', 'HIGH'],
          ['LOW', 'LOW'],
        ]),
        'STATE',
      );
      this.setOutput(true, 'Boolean');
      this.setTooltip('Select a digital state: HIGH or LOW');
    },
  };

  Blockly.Blocks['io_pulsein'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('https://www.arduino.cc/en/Reference/PulseIn');
      this.setColour(HUE);
      this.appendValueInput('PULSETYPE')
        .appendField('measure')
        .setCheck('Boolean');
      this.appendDummyInput()
        .appendField('pulse on pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'PULSEPIN',
        );
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip(
        'Measure the duration of a HIGH or LOW pulse on a pin in microseconds',
      );
    },
  };

  Blockly.Blocks['io_pulsetimeout'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('https://www.arduino.cc/en/Reference/PulseIn');
      this.setColour(HUE);
      this.appendValueInput('PULSETYPE')
        .appendField('measure')
        .setCheck('Boolean');
      this.appendDummyInput()
        .appendField('pulse on pin')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'PULSEPIN',
        );
      this.appendValueInput('TIMEOUT')
        .appendField('timeout after')
        .setCheck('Number');
      this.appendDummyInput().appendField('\u00B5s');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip(
        'Measure the duration of a pulse on a pin with a timeout (in microseconds)',
      );
    },
  };
}
