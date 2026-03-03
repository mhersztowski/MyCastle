import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerI2cGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_i2c_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const freq = block.getFieldValue('FREQ');
    g.addImport('machine.I2C', 'from machine import I2C');
    g.addInit(`i2c_${id}`, `_i2c${id} = I2C(${id}, freq=${freq})`, true);
    return '';
  };

  gen.forBlock['upy_i2c_scan'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const id = block.getFieldValue('ID');
    g.addImport('machine.I2C', 'from machine import I2C');
    g.addInit(`i2c_${id}`, `_i2c${id} = I2C(${id}, freq=400000)`);
    return [`_i2c${id}.scan()`, Order.ATOMIC];
  };

  gen.forBlock['upy_i2c_writeto'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0x00';
    const data = g.valueToCode(block, 'DATA', Order.NONE) || "b''";
    g.addImport('machine.I2C', 'from machine import I2C');
    g.addInit(`i2c_${id}`, `_i2c${id} = I2C(${id}, freq=400000)`);
    return `_i2c${id}.writeto(${addr}, ${data})\n`;
  };

  gen.forBlock['upy_i2c_readfrom'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const id = block.getFieldValue('ID');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0x00';
    const nbytes = g.valueToCode(block, 'NBYTES', Order.NONE) || '1';
    g.addImport('machine.I2C', 'from machine import I2C');
    g.addInit(`i2c_${id}`, `_i2c${id} = I2C(${id}, freq=400000)`);
    return [`_i2c${id}.readfrom(${addr}, ${nbytes})`, Order.ATOMIC];
  };
}
