import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

const NAMED_COLORS: Record<string, string> = {
  white: '(255, 255, 255)',
  black: '(0, 0, 0)',
  red: '(220, 50, 50)',
  green: '(50, 180, 50)',
  blue: '(50, 100, 220)',
  yellow: '(240, 200, 0)',
  orange: '(230, 120, 0)',
  purple: '(140, 50, 200)',
  cyan: '(0, 200, 200)',
  pink: '(240, 100, 180)',
  gray: '(128, 128, 128)',
  lightgray: '(200, 200, 200)',
  darkgray: '(64, 64, 64)',
};

export function registerColorGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_color_rgb'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const r = g.valueToCode(block, 'R', Order.NONE) || '0';
    const gr = g.valueToCode(block, 'G', Order.NONE) || '0';
    const b = g.valueToCode(block, 'B', Order.NONE) || '0';
    return [`(${r}, ${gr}, ${b})`, Order.ATOMIC];
  };

  gen.forBlock['pg_color_named'] = function (block: Blockly.Block): [string, Order] {
    const name = block.getFieldValue('COLOR');
    return [NAMED_COLORS[name] ?? '(255, 255, 255)', Order.ATOMIC];
  };
}
