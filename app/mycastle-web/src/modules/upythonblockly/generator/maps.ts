import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

export function registerMapGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_map_create'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const count = (block as any).pairCount_ ?? 0;
    const pairs: string[] = [];
    for (let i = 0; i < count; i++) {
      const key = g.valueToCode(block, `KEY${i}`, Order.NONE) || "''";
      const val = g.valueToCode(block, `VAL${i}`, Order.NONE) || 'None';
      pairs.push(`${key}:${val}`);
    }
    return [`{${pairs.join(',')}}`, Order.ATOMIC];
  };

  gen.forBlock['upy_map_clear'] = function (block: Blockly.Block): string {
    const map = getVarName(block, 'MAP');
    return `${map}.clear()\n`;
  };

  gen.forBlock['upy_map_contains_key'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const map = getVarName(block, 'MAP');
    const key = g.valueToCode(block, 'KEY', Order.NONE) || "''";
    return [`${key} in ${map}.keys()`, Order.COMPARISON];
  };

  gen.forBlock['upy_map_get'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const map = getVarName(block, 'MAP');
    const key = g.valueToCode(block, 'KEY', Order.NONE) || "''";
    return [`${map}[${key}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_map_add_key'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const map = getVarName(block, 'MAP');
    const key = g.valueToCode(block, 'KEY', Order.NONE) || "''";
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || 'None';
    return `${map}[${key}] = ${value}\n`;
  };

  gen.forBlock['upy_map_set_key'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const map = getVarName(block, 'MAP');
    const key = g.valueToCode(block, 'KEY', Order.NONE) || "''";
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || 'None';
    return `${map}[${key}] = ${value}\n`;
  };

  gen.forBlock['upy_map_delete_key'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const map = getVarName(block, 'MAP');
    const key = g.valueToCode(block, 'KEY', Order.NONE) || "''";
    return `${map}.pop(${key})\n`;
  };
}
