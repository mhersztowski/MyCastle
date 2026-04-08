import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

export function registerBytearrayGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_bytearray_create'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const length = g.valueToCode(block, 'LENGTH', Order.NONE) || '1';
    return [`bytearray(${length})`, Order.ATOMIC];
  };

  gen.forBlock['upy_bytearray_append'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const barray = getVarName(block, 'BARRAY');
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return `${barray}.append(${value})\n`;
  };

  gen.forBlock['upy_bytearray_extend'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const barray = getVarName(block, 'BARRAY');
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return `${barray}.extend(${value})\n`;
  };

  gen.forBlock['upy_bytearray_decode'] = function (
    block: Blockly.Block,
  ): [string, Order] {
    const barray = getVarName(block, 'BARRAY');
    const encoding = block.getFieldValue('ENCODING');
    return [`${barray}.decode('${encoding}')`, Order.ATOMIC];
  };
}
