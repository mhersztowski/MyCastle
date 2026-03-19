import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerDrawAdvGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_draw_ellipse'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    const w = g.valueToCode(block, 'W', Order.NONE) || '100';
    const h = g.valueToCode(block, 'H', Order.NONE) || '60';
    return `pygame.draw.ellipse(_screen, ${color}, (${x}, ${y}, ${w}, ${h}))\n`;
  };

  gen.forBlock['pg_draw_rect_outline'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    const w = g.valueToCode(block, 'W', Order.NONE) || '100';
    const h = g.valueToCode(block, 'H', Order.NONE) || '100';
    const border = g.valueToCode(block, 'BORDER', Order.NONE) || '2';
    return `pygame.draw.rect(_screen, ${color}, (${x}, ${y}, ${w}, ${h}), ${border})\n`;
  };

  gen.forBlock['pg_draw_circle_outline'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    const r = g.valueToCode(block, 'R', Order.NONE) || '50';
    const width = g.valueToCode(block, 'WIDTH', Order.NONE) || '2';
    return `pygame.draw.circle(_screen, ${color}, (${x}, ${y}), ${r}, ${width})\n`;
  };

  gen.forBlock['pg_draw_polygon'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const points = g.valueToCode(block, 'POINTS', Order.NONE) || '[(0,0),(50,0),(25,50)]';
    return `pygame.draw.polygon(_screen, ${color}, ${points})\n`;
  };

  gen.forBlock['pg_make_point_list'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const x1 = g.valueToCode(block, 'X1', Order.NONE) || '0';
    const y1 = g.valueToCode(block, 'Y1', Order.NONE) || '0';
    const x2 = g.valueToCode(block, 'X2', Order.NONE) || '50';
    const y2 = g.valueToCode(block, 'Y2', Order.NONE) || '0';
    const x3 = g.valueToCode(block, 'X3', Order.NONE) || '25';
    const y3 = g.valueToCode(block, 'Y3', Order.NONE) || '50';
    return [`[(${x1}, ${y1}), (${x2}, ${y2}), (${x3}, ${y3})]`, Order.ATOMIC];
  };
}
