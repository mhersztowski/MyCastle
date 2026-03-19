import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerRectGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_make_rect'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    const w = g.valueToCode(block, 'W', Order.NONE) || '100';
    const h = g.valueToCode(block, 'H', Order.NONE) || '100';
    return [`pygame.Rect(${x}, ${y}, ${w}, ${h})`, Order.ATOMIC];
  };

  gen.forBlock['pg_rect_move_ip'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const rect = g.valueToCode(block, 'RECT', Order.ATOMIC) || '_rect';
    const dx = g.valueToCode(block, 'DX', Order.NONE) || '0';
    const dy = g.valueToCode(block, 'DY', Order.NONE) || '0';
    return `${rect}.move_ip(${dx}, ${dy})\n`;
  };

  gen.forBlock['pg_rect_clamp_ip'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const rect = g.valueToCode(block, 'RECT', Order.ATOMIC) || '_rect';
    return `${rect}.clamp_ip(pygame.Rect(0, 0, _screen_width, _screen_height))\n`;
  };

  gen.forBlock['pg_rect_attr'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const rect = g.valueToCode(block, 'RECT', Order.ATOMIC) || '_rect';
    const attr = block.getFieldValue('ATTR');
    return [`${rect}.${attr}`, Order.ATOMIC];
  };

  gen.forBlock['pg_rect_set_attr'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const rect = g.valueToCode(block, 'RECT', Order.ATOMIC) || '_rect';
    const attr = block.getFieldValue('ATTR');
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return `${rect}.${attr} = ${value}\n`;
  };

  gen.forBlock['pg_rects_collide'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const r1 = g.valueToCode(block, 'RECT1', Order.ATOMIC) || '_rect1';
    const r2 = g.valueToCode(block, 'RECT2', Order.NONE) || '_rect2';
    return [`${r1}.colliderect(${r2})`, Order.ATOMIC];
  };

  gen.forBlock['pg_point_in_rect'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const rect = g.valueToCode(block, 'RECT', Order.ATOMIC) || '_rect';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    return [`${rect}.collidepoint(${x}, ${y})`, Order.ATOMIC];
  };

  gen.forBlock['pg_draw_rect_obj'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const rect = g.valueToCode(block, 'RECT', Order.NONE) || '_rect';
    return `pygame.draw.rect(_screen, ${color}, ${rect})\n`;
  };
}
