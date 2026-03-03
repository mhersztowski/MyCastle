import * as Blockly from 'blockly';

const HUE = 20;

export function registerBitsBlocks(): void {
  /** Bitwise binary operation: AND, OR, XOR, shift left, shift right */
  Blockly.Blocks['upy_bitwise'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('A').setCheck('Number');
      this.appendValueInput('B')
        .appendField(
          new Blockly.FieldDropdown([
            ['& (AND)', 'AND'],
            ['| (OR)', 'OR'],
            ['^ (XOR)', 'XOR'],
            ['<< (shift L)', 'LSHIFT'],
            ['>> (shift R)', 'RSHIFT'],
          ]),
          'OP',
        )
        .setCheck('Number');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Bitwise binary operation on two integers');
    },
  };

  /** Bitwise NOT (~value) */
  Blockly.Blocks['upy_bitnot'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE').appendField('~').setCheck('Number');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Bitwise NOT: ~value');
    },
  };

  /** Read a single bit at a given position (returns 0 or 1) */
  Blockly.Blocks['upy_bit_get'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAR').appendField('get');
      this.appendValueInput('BIT').appendField('bit').setCheck('Number');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Get the value of a specific bit (returns 0 or 1): (val >> bit) & 0x01');
    },
  };

  /** Set a specific bit to 1 */
  Blockly.Blocks['upy_bit_set'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAR').appendField('set');
      this.appendValueInput('BIT').appendField('bit').setCheck('Number');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Set a specific bit to 1: val | (0x01 << bit)');
    },
  };

  /** Clear a specific bit to 0 */
  Blockly.Blocks['upy_bit_clear'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAR').appendField('clear');
      this.appendValueInput('BIT').appendField('bit').setCheck('Number');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Clear a specific bit to 0: val & ~(0x01 << bit)');
    },
  };

  /** Toggle (flip) a specific bit */
  Blockly.Blocks['upy_bit_toggle'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAR').appendField('reverse');
      this.appendValueInput('BIT').appendField('bit').setCheck('Number');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Toggle (flip) a specific bit: val ^ (0x01 << bit)');
    },
  };

  /** Convert a bytes/bytearray value to int with explicit byte order */
  Blockly.Blocks['upy_int_from_bytes'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE').appendField('int from bytes');
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown([
          ['big', 'big'],
          ['little', 'little'],
        ]),
        'BYTEORDER',
      );
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Convert bytes to integer: int.from_bytes(value, byteorder)');
    },
  };
}
