import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerWindowGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_set_window'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const width = g.valueToCode(block, 'WIDTH', Order.NONE) || '800';
    const height = g.valueToCode(block, 'HEIGHT', Order.NONE) || '600';
    const title = g.valueToCode(block, 'TITLE', Order.NONE) || "'My Pygame Game'";
    const fps = g.valueToCode(block, 'FPS', Order.NONE) || '60';
    g.addInit('_screen_width', `_screen_width = ${width}`, true);
    g.addInit('_screen_height', `_screen_height = ${height}`, true);
    g.addInit('_window_title', `_window_title = ${title}`, true);
    g.addInit('_fps', `_fps = ${fps}`, true);
    return '';
  };
}
