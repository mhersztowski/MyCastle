import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerMathGenerators(gen: PygameGenerator): void {
  gen.forBlock['math_number'] = function (block: Blockly.Block): [string, Order] {
    return [String(block.getFieldValue('NUM')), Order.ATOMIC];
  };

  gen.forBlock['math_arithmetic'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const opMap: Record<string, [string, Order]> = {
      ADD: [' + ', Order.ADDITIVE], MINUS: [' - ', Order.ADDITIVE],
      MULTIPLY: [' * ', Order.MULTIPLY], DIVIDE: [' / ', Order.MULTIPLY],
      POWER: [' ** ', Order.EXPONENT], MODULO: [' % ', Order.MULTIPLY],
    };
    const [operator, order] = opMap[block.getFieldValue('OP')] ?? [' + ', Order.ADDITIVE];
    const a = g.valueToCode(block, 'A', order) || '0';
    const b = g.valueToCode(block, 'B', order) || '0';
    return [`${a}${operator}${b}`, order];
  };

  gen.forBlock['math_single'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const op = block.getFieldValue('OP');
    const n = g.valueToCode(block, 'NUM', Order.NONE) || '0';
    g.addImport('math', 'import math');
    const funcs: Record<string, string> = {
      ROOT: `math.sqrt(${n})`, ABS: `abs(${n})`, NEG: `-(${n})`,
      LN: `math.log(${n})`, LOG10: `math.log10(${n})`, EXP: `math.exp(${n})`,
      POW10: `(10 ** ${n})`, ROUND: `round(${n})`,
      ROUNDUP: `math.ceil(${n})`, ROUNDDOWN: `math.floor(${n})`,
      SIN: `math.sin(math.radians(${n}))`, COS: `math.cos(math.radians(${n}))`,
      TAN: `math.tan(math.radians(${n}))`,
      ASIN: `math.degrees(math.asin(${n}))`, ACOS: `math.degrees(math.acos(${n}))`,
      ATAN: `math.degrees(math.atan(${n}))`,
    };
    return [funcs[op] ?? `abs(${n})`, Order.ATOMIC];
  };

  gen.forBlock['math_number_property'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const prop = block.getFieldValue('PROPERTY');
    const n = g.valueToCode(block, 'NUMBER_TO_CHECK', Order.NONE) || '0';
    if (prop === 'EVEN') return [`(${n} % 2 == 0)`, Order.COMPARISON];
    if (prop === 'ODD') return [`(${n} % 2 != 0)`, Order.COMPARISON];
    if (prop === 'POSITIVE') return [`(${n} > 0)`, Order.COMPARISON];
    if (prop === 'NEGATIVE') return [`(${n} < 0)`, Order.COMPARISON];
    if (prop === 'WHOLE') return [`(${n} % 1 == 0)`, Order.COMPARISON];
    return [`(${n} > 0)`, Order.COMPARISON];
  };

  gen.forBlock['math_round'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const op = block.getFieldValue('OP');
    const n = g.valueToCode(block, 'NUM', Order.NONE) || '0';
    g.addImport('math', 'import math');
    if (op === 'ROUNDUP') return [`math.ceil(${n})`, Order.ATOMIC];
    if (op === 'ROUNDDOWN') return [`math.floor(${n})`, Order.ATOMIC];
    return [`round(${n})`, Order.ATOMIC];
  };

  gen.forBlock['math_random_int'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const from = g.valueToCode(block, 'FROM', Order.NONE) || '0';
    const to = g.valueToCode(block, 'TO', Order.NONE) || '100';
    g.addImport('random', 'import random');
    return [`random.randint(${from}, ${to})`, Order.ATOMIC];
  };

  gen.forBlock['math_random_float'] = function (_block: Blockly.Block, g: PygameGenerator): [string, Order] {
    g.addImport('random', 'import random');
    return ['random.random()', Order.ATOMIC];
  };

  gen.forBlock['math_constrain'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const low = g.valueToCode(block, 'LOW', Order.NONE) || '0';
    const high = g.valueToCode(block, 'HIGH', Order.NONE) || '100';
    return [`max(${low}, min(${high}, ${val}))`, Order.ATOMIC];
  };
}
