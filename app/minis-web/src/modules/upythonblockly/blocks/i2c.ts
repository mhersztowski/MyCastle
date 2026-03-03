import * as Blockly from 'blockly';
import type { UPythonBoardManager } from '../boards/BoardManager';

const HUE = 170;

const I2C_FREQS: [string, string][] = [
  ['100kHz', '100000'], ['400kHz', '400000'],
];

export function registerI2cBlocks(boardManager: UPythonBoardManager): void {
  Blockly.Blocks['upy_i2c_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('init I2C')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.i2cIds), 'ID')
        .appendField('freq')
        .appendField(new Blockly.FieldDropdown(I2C_FREQS), 'FREQ');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Initialize an I2C bus (uses default SDA/SCL pins for the bus ID)');
    },
  };

  /** Scan for devices on I2C bus */
  Blockly.Blocks['upy_i2c_scan'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('I2C')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.i2cIds), 'ID')
        .appendField('scan');
      this.setOutput(true, null);
      this.setTooltip('Scan the I2C bus and return a list of device addresses');
    },
  };

  /** Write bytes to an I2C device */
  Blockly.Blocks['upy_i2c_writeto'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('ADDR')
        .appendField('I2C')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.i2cIds), 'ID')
        .appendField('write to addr')
        .setCheck('Number');
      this.appendValueInput('DATA').appendField('data');
      this.setInputsInline(false);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Write data bytes to an I2C device at the given address');
    },
  };

  /** Read bytes from an I2C device */
  Blockly.Blocks['upy_i2c_readfrom'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('ADDR')
        .appendField('I2C')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.i2cIds), 'ID')
        .appendField('read from addr')
        .setCheck('Number');
      this.appendValueInput('NBYTES').appendField('nbytes').setCheck('Number');
      this.setInputsInline(false);
      this.setOutput(true, null);
      this.setTooltip('Read n bytes from an I2C device at the given address');
    },
  };
}
