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

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

export function registerI2cV2Generators(gen: UPythonGenerator): void {
  gen.forBlock['upy_i2c2_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const scl = block.getFieldValue('SCL');
    const sda = block.getFieldValue('SDA');
    const freq = block.getFieldValue('FREQ');
    const varName = getVarName(block, 'VAR');
    g.addImport('hardware_i2c', 'from hardware import I2C');
    g.addImport('hardware_pin', 'from hardware import Pin');
    g.variables_.add(varName);
    return `${varName} = I2C(${id}, scl=Pin(${scl}), sda=Pin(${sda}), freq=${freq})\n`;
  };

  gen.forBlock['upy_i2c2_scan'] = function (block: Blockly.Block, _g: UPythonGenerator): [string, Order] {
    const varName = getVarName(block, 'VAR');
    return [`${varName}.scan()`, Order.ATOMIC];
  };

  gen.forBlock['upy_i2c2_readfrom'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const nbytes = g.valueToCode(block, 'NBYTES', Order.NONE) || '1';
    const stop = block.getFieldValue('STOP');
    return [`${varName}.readfrom(${addr}, ${nbytes}, ${stop})`, Order.ATOMIC];
  };

  gen.forBlock['upy_i2c2_readfrom_into'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    const stop = block.getFieldValue('STOP');
    return `${varName}.readfrom_into(${addr}, ${buf}, ${stop})\n`;
  };

  gen.forBlock['upy_i2c2_readfrom_mem'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const memaddr = g.valueToCode(block, 'MEMADDR', Order.NONE) || '0';
    const nbytes = g.valueToCode(block, 'NBYTES', Order.NONE) || '1';
    return [`${varName}.readfrom_mem(${addr}, ${memaddr}, ${nbytes})`, Order.ATOMIC];
  };

  gen.forBlock['upy_i2c2_readfrom_mem_into'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const memaddr = g.valueToCode(block, 'MEMADDR', Order.NONE) || '0';
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    return `${varName}.readfrom_mem_into(${addr}, ${memaddr}, ${buf})\n`;
  };

  gen.forBlock['upy_i2c2_writeto'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    const stop = block.getFieldValue('STOP');
    return [`${varName}.writeto(${addr}, ${buf}, ${stop})`, Order.ATOMIC];
  };

  gen.forBlock['upy_i2c2_writeto_stmt'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    const stop = block.getFieldValue('STOP');
    return `${varName}.writeto(${addr}, ${buf}, ${stop})\n`;
  };

  gen.forBlock['upy_i2c2_writeto_mem'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const memaddr = g.valueToCode(block, 'MEMADDR', Order.NONE) || '0';
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    return `${varName}.writeto_mem(${addr}, ${memaddr}, ${buf})\n`;
  };
}
