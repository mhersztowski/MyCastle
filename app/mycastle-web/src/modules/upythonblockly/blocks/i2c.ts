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

const I2C_V2_FREQS: [string, string][] = [
  ['10K', '10000'],
  ['50K', '50000'],
  ['100K', '100000'],
  ['400K', '400000'],
  ['1M', '1000000'],
];

const I2C_V2_STOP: [string, string][] = [
  ['True', 'True'],
  ['False', 'False'],
];

export function registerI2cV2Blocks(): void {
  Blockly.Blocks['upy_i2c2_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init')
        .appendField(new Blockly.FieldDropdown([['i2c0', '0'], ['i2c1', '1']]), 'ID')
        .appendField('SCL')
        .appendField(new Blockly.FieldNumber(1, 0, 47), 'SCL')
        .appendField('SDA')
        .appendField(new Blockly.FieldNumber(2, 0, 47), 'SDA')
        .appendField('freq')
        .appendField(new Blockly.FieldDropdown(I2C_V2_FREQS), 'FREQ')
        .appendField('→')
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('Init I2C: i2c = I2C(id, scl=Pin(scl), sda=Pin(sda), freq=freq)');
    },
  };

  Blockly.Blocks['upy_i2c2_scan'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR')
        .appendField('scan device (return 7-bit address list)');
      this.setOutput(true, null);
      this.setTooltip('Scan I2C bus: i2c.scan()');
    },
  };

  Blockly.Blocks['upy_i2c2_readfrom'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('ADDR').appendField('read from addr');
      this.appendValueInput('NBYTES').appendField('nbytes');
      this.appendDummyInput()
        .appendField('STOP')
        .appendField(new Blockly.FieldDropdown(I2C_V2_STOP), 'STOP');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2c.readfrom(addr, nbytes, stop)');
    },
  };

  Blockly.Blocks['upy_i2c2_readfrom_into'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('ADDR').appendField('read from addr');
      this.appendValueInput('BUF').appendField('into buf');
      this.appendDummyInput()
        .appendField('STOP')
        .appendField(new Blockly.FieldDropdown(I2C_V2_STOP), 'STOP');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2c.readfrom_into(addr, buf, stop)');
    },
  };

  Blockly.Blocks['upy_i2c2_readfrom_mem'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('ADDR').appendField('read from addr');
      this.appendValueInput('MEMADDR').appendField('memory addr');
      this.appendValueInput('NBYTES').appendField('nbytes');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2c.readfrom_mem(addr, memaddr, nbytes)');
    },
  };

  Blockly.Blocks['upy_i2c2_readfrom_mem_into'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('ADDR').appendField('read from addr');
      this.appendValueInput('MEMADDR').appendField('memory addr');
      this.appendValueInput('BUF').appendField('into buf');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2c.readfrom_mem_into(addr, memaddr, buf)');
    },
  };

  Blockly.Blocks['upy_i2c2_writeto'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('BUF').appendField('write buf');
      this.appendValueInput('ADDR').appendField('to addr');
      this.appendDummyInput()
        .appendField('STOP')
        .appendField(new Blockly.FieldDropdown(I2C_V2_STOP), 'STOP')
        .appendField('(return nbytes written)');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('i2c.writeto(addr, buf, stop) → nbytes written');
    },
  };

  Blockly.Blocks['upy_i2c2_writeto_stmt'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('BUF').appendField('write buf');
      this.appendValueInput('ADDR').appendField('to addr');
      this.appendDummyInput()
        .appendField('STOP')
        .appendField(new Blockly.FieldDropdown(I2C_V2_STOP), 'STOP');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2c.writeto(addr, buf, stop)');
    },
  };

  Blockly.Blocks['upy_i2c2_writeto_mem'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2c'), 'VAR');
      this.appendValueInput('BUF').appendField('write buf');
      this.appendValueInput('ADDR').appendField('to addr');
      this.appendValueInput('MEMADDR').appendField('memory addr');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2c.writeto_mem(addr, memaddr, buf)');
    },
  };
}
