import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerEventsInputGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_key_pressed'] = function (block: Blockly.Block): [string, Order] {
    const key = block.getFieldValue('KEY');
    return [`pygame.key.get_pressed()[pygame.K_${key}]`, Order.ATOMIC];
  };

  gen.forBlock['pg_mouse_pos'] = function (block: Blockly.Block): [string, Order] {
    const axis = block.getFieldValue('AXIS');
    const idx = axis === 'x' ? '0' : '1';
    return [`pygame.mouse.get_pos()[${idx}]`, Order.ATOMIC];
  };

  gen.forBlock['pg_mouse_button'] = function (block: Blockly.Block): [string, Order] {
    const btn = block.getFieldValue('BUTTON');
    const idx = btn === 'left' ? '0' : btn === 'middle' ? '1' : '2';
    return [`pygame.mouse.get_pressed()[${idx}]`, Order.ATOMIC];
  };
}
