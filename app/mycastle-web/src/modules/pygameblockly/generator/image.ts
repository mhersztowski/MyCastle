import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerImageGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_load_image'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return [`pygame.image.load(${path}).convert_alpha()`, Order.ATOMIC];
  };

  gen.forBlock['pg_blit'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const surf = g.valueToCode(block, 'SURFACE', Order.NONE) || '_img';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    return `_screen.blit(${surf}, (${x}, ${y}))\n`;
  };

  gen.forBlock['pg_blit_rect'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const surf = g.valueToCode(block, 'SURFACE', Order.NONE) || '_img';
    const rect = g.valueToCode(block, 'RECT', Order.NONE) || '_rect';
    return `_screen.blit(${surf}, ${rect})\n`;
  };

  gen.forBlock['pg_scale_image'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const surf = g.valueToCode(block, 'SURFACE', Order.NONE) || '_img';
    const w = g.valueToCode(block, 'W', Order.NONE) || '100';
    const h = g.valueToCode(block, 'H', Order.NONE) || '100';
    return [`pygame.transform.scale(${surf}, (${w}, ${h}))`, Order.ATOMIC];
  };

  gen.forBlock['pg_rotate_image'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const surf = g.valueToCode(block, 'SURFACE', Order.NONE) || '_img';
    const angle = g.valueToCode(block, 'ANGLE', Order.NONE) || '0';
    return [`pygame.transform.rotate(${surf}, ${angle})`, Order.ATOMIC];
  };

  gen.forBlock['pg_flip_image'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const surf = g.valueToCode(block, 'SURFACE', Order.NONE) || '_img';
    const fx = block.getFieldValue('FLIP_X') === 'TRUE' ? 'True' : 'False';
    const fy = block.getFieldValue('FLIP_Y') === 'TRUE' ? 'True' : 'False';
    return [`pygame.transform.flip(${surf}, ${fx}, ${fy})`, Order.ATOMIC];
  };

  gen.forBlock['pg_image_rect'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const surf = g.valueToCode(block, 'SURFACE', Order.ATOMIC) || '_img';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    return [`${surf}.get_rect(topleft=(${x}, ${y}))`, Order.ATOMIC];
  };
}
