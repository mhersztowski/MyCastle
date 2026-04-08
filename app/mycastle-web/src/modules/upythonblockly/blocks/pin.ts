import * as Blockly from 'blockly';
import type { UPythonBoardManager } from '../boards/BoardManager';

const HUE = 250;

const MODE_OPTIONS: Blockly.MenuGenerator = [
  ['IN', 'IN'],
  ['OUT', 'OUT'],
  ['OPEN_DRAIN', 'OPEN_DRAIN'],
];

const PULL_OPTIONS: Blockly.MenuGenerator = [
  ['NONE', 'NONE'],
  ['UP', 'PULL_UP'],
  ['DOWN', 'PULL_DOWN'],
];

/** Register UIFlow2-style variable-based Pin blocks (no boardManager needed). */
export function registerPinV2Blocks(): void {
  /** Initialize a pin object stored in a user variable */
  Blockly.Blocks['upy_pin2_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Init Pin');
      this.appendValueInput('PIN');
      this.appendDummyInput()
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE')
        .appendField('pull')
        .appendField(new Blockly.FieldDropdown(PULL_OPTIONS), 'PULL')
        .appendField('→')
        .appendField(new Blockly.FieldVariable('pin'), 'VAR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Initialize Pin object: pin = Pin(n, mode=Pin.IN)');
    },
  };

  Blockly.Blocks['upy_pin2_get_value'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('get')
        .appendField(new Blockly.FieldVariable('pin'), 'VAR')
        .appendField('value');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Read pin level: pin.value()');
    },
  };

  Blockly.Blocks['upy_pin2_on'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('pin'), 'VAR')
        .appendField('on');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Drive pin HIGH: pin.on()');
    },
  };

  Blockly.Blocks['upy_pin2_off'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('pin'), 'VAR')
        .appendField('off');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Drive pin LOW: pin.off()');
    },
  };

  /** Set pin value via boolean dropdown → pin.value(1) or pin.value(0) */
  Blockly.Blocks['upy_pin2_set_bool'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Set')
        .appendField(new Blockly.FieldVariable('pin'), 'VAR')
        .appendField('value')
        .appendField(
          new Blockly.FieldDropdown([
            ['True', '1'],
            ['False', '0'],
          ]),
          'BOOL_VAL',
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Set pin output: pin.value(1) or pin.value(0)');
    },
  };

  /** Set pin value via numeric input → pin.value(x) */
  Blockly.Blocks['upy_pin2_set_value'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Set')
        .appendField(new Blockly.FieldVariable('pin'), 'VAR')
        .appendField('value');
      this.appendValueInput('VAL');
      this.appendDummyInput().appendField('(0 or 1)');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Set pin output to value: pin.value(x)');
    },
  };
}

export function registerPinBlocks(boardManager: UPythonBoardManager): void {
  // ── Simple output/input blocks (legacy, use _pin_out_X / _pin_in_X) ────────

  /** Write a value (1/0) to a digital output pin */
  Blockly.Blocks['upy_pin_write'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE')
        .appendField('set pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN')
        .appendField('to')
        .setCheck('Number');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set a digital pin HIGH (1) or LOW (0)');
    },
  };

  /** Read the digital value of a pin */
  Blockly.Blocks['upy_pin_read'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN');
      this.setOutput(true, 'Number');
      this.setTooltip('Read the value of a digital pin (0 or 1)');
    },
  };

  /** Toggle a digital output pin */
  Blockly.Blocks['upy_pin_toggle'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('toggle pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Toggle the output value of a digital pin');
    },
  };

  /** Set the built-in LED */
  Blockly.Blocks['upy_builtin_led'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE')
        .appendField('set built-in LED')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.builtinLed), 'LED')
        .appendField('to')
        .setCheck('Number');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set the built-in LED HIGH (1) or LOW (0)');
    },
  };

  /** High/Low constant */
  Blockly.Blocks['upy_highlow'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown([['HIGH (1)', '1'], ['LOW (0)', '0']]),
        'STATE',
      );
      this.setOutput(true, 'Number');
      this.setTooltip('Select HIGH (1) or LOW (0)');
    },
  };

  // ── Advanced pin blocks (UIFlow2-style, named _pin_X object) ────────────────

  /** Initialize a pin with mode (IN/OUT/OPEN_DRAIN) and optional pull resistor */
  Blockly.Blocks['upy_pin_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init Pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN')
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE')
        .appendField('pull')
        .appendField(new Blockly.FieldDropdown(PULL_OPTIONS), 'PULL');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Initialize a Pin with direction mode and optional pull resistor. ' +
        'Must be called before using on/off/value blocks for this pin.',
      );
    },
  };

  /** Drive a pin HIGH via pin.on() */
  Blockly.Blocks['upy_pin_on'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN')
        .appendField('on');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Drive pin HIGH: pin.on()');
    },
  };

  /** Drive a pin LOW via pin.off() */
  Blockly.Blocks['upy_pin_off'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN')
        .appendField('off');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Drive pin LOW: pin.off()');
    },
  };

  /** Read pin value via pin.value() */
  Blockly.Blocks['upy_pin_get_value'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('get Pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN')
        .appendField('value');
      this.setOutput(true, 'Number');
      this.setTooltip('Read current pin level: pin.value()');
    },
  };

  /** Set pin value via pin.value(x) with a connected value input */
  Blockly.Blocks['upy_pin_set_value'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE')
        .appendField('Set Pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.digitalPins), 'PIN')
        .appendField('value');
      this.appendDummyInput().appendField('(0 or 1)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set pin output level: pin.value(x). Accepts 0/1 or True/False.');
    },
  };

  /** Unused-pin constant: returns -1 (MicroPython convention for "no pin") */
  Blockly.Blocks['upy_pin_unused'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Pin unused');
      this.setOutput(true, 'Number');
      this.setTooltip('Represents an unused pin (-1). Used as placeholder in SPI/I2C configs.');
    },
  };
}
