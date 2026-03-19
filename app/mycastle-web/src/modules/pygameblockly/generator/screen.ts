import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerScreenGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_screen_width'] = function (): [string, Order] {
    return ['_screen_width', Order.ATOMIC];
  };

  gen.forBlock['pg_screen_height'] = function (): [string, Order] {
    return ['_screen_height', Order.ATOMIC];
  };

  gen.forBlock['pg_set_caption'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const title = g.valueToCode(block, 'TITLE', Order.NONE) || "''";
    return `pygame.display.set_caption(${title})\n`;
  };

  gen.forBlock['pg_wait'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const ms = g.valueToCode(block, 'MS', Order.NONE) || '0';
    return `pygame.time.wait(${ms})\n`;
  };
}
