import * as Blockly from 'blockly';

const HUE = '#2196a8';

export function registerBytearrayBlocks(): void {
  /** Create empty bytearray of given length */
  Blockly.Blocks['upy_bytearray_create'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('LENGTH').appendField('create empty bytearray with length');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Create an empty bytearray: bytearray(n)');
    },
  };

  /** Append a single byte (0–0xff) to bytearray */
  Blockly.Blocks['upy_bytearray_append'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Bytearray')
        .appendField(new Blockly.FieldVariable('barray'), 'BARRAY')
        .appendField('append');
      this.appendValueInput('VALUE');
      this.appendDummyInput().appendField('(0 ~ 0xff)');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Append a byte value to bytearray: bytearray.append(v)');
    },
  };

  /** Extend bytearray with another iterable */
  Blockly.Blocks['upy_bytearray_extend'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Bytearray')
        .appendField(new Blockly.FieldVariable('barray'), 'BARRAY')
        .appendField('extend');
      this.appendValueInput('VALUE');
      this.appendDummyInput().appendField('(0 ~ 0xff)');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Extend bytearray with another iterable: bytearray.extend(v)');
    },
  };

  /** Decode bytearray to string with given encoding */
  Blockly.Blocks['upy_bytearray_decode'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('bytearray')
        .appendField(new Blockly.FieldVariable('barray'), 'BARRAY')
        .appendField('decode')
        .appendField(
          new Blockly.FieldDropdown([
            ['utf-8', 'utf-8'],
            ['ascii', 'ascii'],
            ['latin-1', 'latin-1'],
          ]),
          'ENCODING',
        );
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Decode bytearray to string: bytearray.decode(encoding)');
    },
  };
}
