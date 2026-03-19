import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerGameMathGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_lerp'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const a = g.valueToCode(block, 'A', Order.ADDITIVE) || '0';
    const b = g.valueToCode(block, 'B', Order.ADDITIVE) || '0';
    const t = g.valueToCode(block, 'T', Order.MULTIPLY) || '0';
    return [`(${a} + (${b} - ${a}) * ${t})`, Order.ADDITIVE];
  };

  gen.forBlock['pg_distance'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const x1 = g.valueToCode(block, 'X1', Order.ADDITIVE) || '0';
    const y1 = g.valueToCode(block, 'Y1', Order.ADDITIVE) || '0';
    const x2 = g.valueToCode(block, 'X2', Order.ADDITIVE) || '0';
    const y2 = g.valueToCode(block, 'Y2', Order.ADDITIVE) || '0';
    g.addImport('math', 'import math');
    return [`math.hypot(${x2} - ${x1}, ${y2} - ${y1})`, Order.ATOMIC];
  };

  gen.forBlock['pg_angle_to'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const x1 = g.valueToCode(block, 'X1', Order.ADDITIVE) || '0';
    const y1 = g.valueToCode(block, 'Y1', Order.ADDITIVE) || '0';
    const x2 = g.valueToCode(block, 'X2', Order.ADDITIVE) || '0';
    const y2 = g.valueToCode(block, 'Y2', Order.ADDITIVE) || '0';
    g.addImport('math', 'import math');
    return [`math.degrees(math.atan2(${y2} - ${y1}, ${x2} - ${x1}))`, Order.ATOMIC];
  };

  gen.forBlock['pg_clamp'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const val = g.valueToCode(block, 'VAL', Order.NONE) || '0';
    const min = g.valueToCode(block, 'MIN', Order.NONE) || '0';
    const max = g.valueToCode(block, 'MAX', Order.NONE) || '100';
    return [`max(${min}, min(${max}, ${val}))`, Order.ATOMIC];
  };

  gen.forBlock['pg_sign'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const val = g.valueToCode(block, 'VAL', Order.COMPARISON) || '0';
    return [`(1 if ${val} > 0 else -1 if ${val} < 0 else 0)`, Order.CONDITIONAL];
  };
}
