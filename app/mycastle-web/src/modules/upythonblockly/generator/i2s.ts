import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVar(block: Blockly.Block): string {
  return (block.getField('VAR') as Blockly.FieldVariable)?.getText() || 'i2s';
}

export function registerI2sGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_i2s_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_i2s', 'from hardware import I2S');
    g.addImport('hardware_pin', 'from hardware import Pin');
    const varName = getVar(block);
    g.variables_.add(varName);
    const id = block.getFieldValue('ID');
    const sck = block.getFieldValue('SCK');
    const ws = block.getFieldValue('WS');
    const sd = block.getFieldValue('SD');
    const mode = block.getFieldValue('MODE');
    const bits = block.getFieldValue('BITS');
    const fmt = block.getFieldValue('FORMAT');
    const rate = block.getFieldValue('RATE');
    const ibuf = block.getFieldValue('IBUF');
    return (
      `${varName} = I2S(${id}, sck=Pin(${sck}), ws=Pin(${ws}), sd=Pin(${sd}), ` +
      `mode=I2S.${mode}, bits=${bits}, format=I2S.${fmt}, rate=${rate}, ibuf=${ibuf})\n`
    );
  };

  gen.forBlock['upy_i2s_deinit'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    return `${varName}.deinit()\n`;
  };

  gen.forBlock['upy_i2s_readinto_val'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVar(block);
    g.variables_.add(varName);
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || '_';
    return [`${varName}.readinto(${buf})`, Order.ATOMIC];
  };

  gen.forBlock['upy_i2s_readinto'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || '_';
    return `${varName}.readinto(${buf})\n`;
  };

  gen.forBlock['upy_i2s_write'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || '_';
    return `${varName}.write(${buf})\n`;
  };
}
