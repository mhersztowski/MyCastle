import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerMathGenerators(gen: UPythonGenerator): void {
  gen.forBlock['math_number'] = function (block: Blockly.Block): [string, Order] {
    const n = String(block.getFieldValue('NUM'));
    return [n, Order.ATOMIC];
  };

  gen.forBlock['math_arithmetic'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const opMap: Record<string, [string, Order]> = {
      ADD: [' + ', Order.ADDITIVE],
      MINUS: [' - ', Order.ADDITIVE],
      MULTIPLY: [' * ', Order.MULTIPLY],
      DIVIDE: [' / ', Order.MULTIPLY],
      POWER: [' ** ', Order.EXPONENT],
      MODULO: [' % ', Order.MULTIPLY],
    };
    const op = block.getFieldValue('OP');
    const [operator, order] = opMap[op] ?? [' + ', Order.ADDITIVE];
    const a = g.valueToCode(block, 'A', order) || '0';
    const b = g.valueToCode(block, 'B', order) || '0';
    return [`${a}${operator}${b}`, order];
  };

  gen.forBlock['math_single'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const op = block.getFieldValue('OP');
    const n = g.valueToCode(block, 'NUM', Order.NONE) || '0';
    g.addImport('math', 'import math');
    const funcs: Record<string, string> = {
      ROOT: `math.sqrt(${n})`,
      ABS: `abs(${n})`,
      NEG: `-(${n})`,
      LN: `math.log(${n})`,
      LOG10: `math.log10(${n})`,
      EXP: `math.exp(${n})`,
      POW10: `(10 ** ${n})`,
      ROUND: `round(${n})`,
      ROUNDUP: `math.ceil(${n})`,
      ROUNDDOWN: `math.floor(${n})`,
      SIN: `math.sin(math.radians(${n}))`,
      COS: `math.cos(math.radians(${n}))`,
      TAN: `math.tan(math.radians(${n}))`,
      ASIN: `math.degrees(math.asin(${n}))`,
      ACOS: `math.degrees(math.acos(${n}))`,
      ATAN: `math.degrees(math.atan(${n}))`,
    };
    return [funcs[op] ?? `abs(${n})`, Order.ATOMIC];
  };

  gen.forBlock['math_trig'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const op = block.getFieldValue('OP');
    const n = g.valueToCode(block, 'NUM', Order.NONE) || '0';
    g.addImport('math', 'import math');
    const funcs: Record<string, string> = {
      SIN: `math.sin(math.radians(${n}))`,
      COS: `math.cos(math.radians(${n}))`,
      TAN: `math.tan(math.radians(${n}))`,
      ASIN: `math.degrees(math.asin(${n}))`,
      ACOS: `math.degrees(math.acos(${n}))`,
      ATAN: `math.degrees(math.atan(${n}))`,
    };
    return [funcs[op] ?? `math.sin(${n})`, Order.ATOMIC];
  };

  gen.forBlock['math_constant'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const sym = block.getFieldValue('CONSTANT');
    g.addImport('math', 'import math');
    const consts: Record<string, string> = {
      PI: 'math.pi',
      E: 'math.e',
      GOLDEN_RATIO: '1.6180339887498948',
      SQRT2: 'math.sqrt(2)',
      SQRT1_2: 'math.sqrt(0.5)',
      INFINITY: 'float("inf")',
    };
    return [consts[sym] ?? 'math.pi', Order.ATOMIC];
  };

  gen.forBlock['math_number_property'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const prop = block.getFieldValue('PROPERTY');
    const n = g.valueToCode(block, 'NUMBER_TO_CHECK', Order.COMPARISON) || '0';
    g.addImport('math', 'import math');
    const props: Record<string, string> = {
      EVEN: `${n} % 2 == 0`,
      ODD: `${n} % 2 == 1`,
      WHOLE: `${n} % 1 == 0`,
      POSITIVE: `${n} > 0`,
      NEGATIVE: `${n} < 0`,
      PRIME: `(lambda n: n > 1 and all(n % i for i in range(2, int(n**0.5)+1)))(${n})`,
    };
    if (prop === 'DIVISIBLE_BY') {
      const div = g.valueToCode(block, 'DIVISOR', Order.COMPARISON) || '1';
      return [`${n} % ${div} == 0`, Order.COMPARISON];
    }
    return [props[prop] ?? 'False', Order.COMPARISON];
  };

  gen.forBlock['math_change'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    g.variables_.add(varName);
    const delta = g.valueToCode(block, 'DELTA', Order.ADDITIVE) || '1';
    return `${varName} += ${delta}\n`;
  };

  gen.forBlock['math_round'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const op = block.getFieldValue('OP');
    const n = g.valueToCode(block, 'NUM', Order.NONE) || '0';
    g.addImport('math', 'import math');
    const funcs: Record<string, string> = {
      ROUND: `round(${n})`,
      ROUNDUP: `math.ceil(${n})`,
      ROUNDDOWN: `math.floor(${n})`,
    };
    return [funcs[op] ?? `round(${n})`, Order.ATOMIC];
  };

  gen.forBlock['math_modulo'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const a = g.valueToCode(block, 'DIVIDEND', Order.MULTIPLY) || '0';
    const b = g.valueToCode(block, 'DIVISOR', Order.MULTIPLY) || '1';
    return [`${a} % ${b}`, Order.MULTIPLY];
  };

  gen.forBlock['math_constrain'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const v = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const lo = g.valueToCode(block, 'LOW', Order.NONE) || '0';
    const hi = g.valueToCode(block, 'HIGH', Order.NONE) || '100';
    return [`min(max(${v}, ${lo}), ${hi})`, Order.ATOMIC];
  };

  gen.forBlock['math_random_int'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const from = g.valueToCode(block, 'FROM', Order.NONE) || '0';
    const to = g.valueToCode(block, 'TO', Order.NONE) || '100';
    g.addImport('random', 'import random');
    return [`random.randint(${from}, ${to})`, Order.ATOMIC];
  };

  gen.forBlock['math_random_float'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('random', 'import random');
    return ['random.random()', Order.ATOMIC];
  };
}
