import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerBitsGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_bitwise'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const opMap: Record<string, [string, Order]> = {
      AND: [' & ', Order.BITWISE_AND],
      OR: [' | ', Order.BITWISE_OR],
      XOR: [' ^ ', Order.BITWISE_XOR],
      LSHIFT: [' << ', Order.SHIFT],
      RSHIFT: [' >> ', Order.SHIFT],
    };
    const op = block.getFieldValue('OP');
    const [operator, order] = opMap[op] ?? [' & ', Order.BITWISE_AND];
    const a = g.valueToCode(block, 'A', order) || '0';
    const b = g.valueToCode(block, 'B', order) || '0';
    return [`${a}${operator}${b}`, order];
  };

  gen.forBlock['upy_bitnot'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VALUE', Order.UNARY) || '0';
    return [`~${val}`, Order.UNARY];
  };

  gen.forBlock['upy_bit_get'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VAR', Order.SHIFT) || '0';
    const bit = g.valueToCode(block, 'BIT', Order.SHIFT) || '0';
    return [`((${val} >> ${bit}) & 0x01)`, Order.ATOMIC];
  };

  gen.forBlock['upy_bit_set'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VAR', Order.BITWISE_OR) || '0';
    const bit = g.valueToCode(block, 'BIT', Order.SHIFT) || '0';
    return [`(${val} | (0x01 << ${bit}))`, Order.ATOMIC];
  };

  gen.forBlock['upy_bit_clear'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VAR', Order.BITWISE_AND) || '0';
    const bit = g.valueToCode(block, 'BIT', Order.SHIFT) || '0';
    return [`(${val} & (~(0x01 << ${bit})))`, Order.ATOMIC];
  };

  gen.forBlock['upy_bit_toggle'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VAR', Order.BITWISE_XOR) || '0';
    const bit = g.valueToCode(block, 'BIT', Order.SHIFT) || '0';
    return [`(${val} ^ (0x01 << ${bit}))`, Order.ATOMIC];
  };

  gen.forBlock['upy_int_from_bytes'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || 'b""';
    const order = block.getFieldValue('BYTEORDER');
    return [`int.from_bytes(${val}, '${order}')`, Order.ATOMIC];
  };
}
