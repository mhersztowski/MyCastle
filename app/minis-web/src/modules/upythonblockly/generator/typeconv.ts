import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerTypeConvGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_to_int'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return [`int(${val})`, Order.ATOMIC];
  };

  gen.forBlock['upy_to_float'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return [`float(${val})`, Order.ATOMIC];
  };

  gen.forBlock['upy_list_sum'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const list = g.valueToCode(block, 'LIST', Order.NONE) || '[]';
    return [`sum(${list})`, Order.ATOMIC];
  };

  /** Built-in Blockly list block — output: [item0, item1, ...] */
  gen.forBlock['lists_create_with'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const count = (block as any).itemCount_ ?? 0;
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      items.push(g.valueToCode(block, `ADD${i}`, Order.NONE) || 'None');
    }
    return [`[${items.join(', ')}]`, Order.ATOMIC];
  };
}
