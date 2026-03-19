import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerDrawGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_fill_bg'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(0, 0, 0)';
    return `_screen.fill(${color})\n`;
  };

  gen.forBlock['pg_draw_rect'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    const w = g.valueToCode(block, 'W', Order.NONE) || '100';
    const h = g.valueToCode(block, 'H', Order.NONE) || '100';
    const radius = g.valueToCode(block, 'RADIUS', Order.NONE) || '0';
    return `pygame.draw.rect(_screen, ${color}, (${x}, ${y}, ${w}, ${h}), 0, ${radius})\n`;
  };

  gen.forBlock['pg_draw_circle'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    const r = g.valueToCode(block, 'R', Order.NONE) || '50';
    return `pygame.draw.circle(_screen, ${color}, (${x}, ${y}), ${r})\n`;
  };

  gen.forBlock['pg_draw_line'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x1 = g.valueToCode(block, 'X1', Order.NONE) || '0';
    const y1 = g.valueToCode(block, 'Y1', Order.NONE) || '0';
    const x2 = g.valueToCode(block, 'X2', Order.NONE) || '100';
    const y2 = g.valueToCode(block, 'Y2', Order.NONE) || '100';
    const width = g.valueToCode(block, 'WIDTH', Order.NONE) || '1';
    return `pygame.draw.line(_screen, ${color}, (${x1}, ${y1}), (${x2}, ${y2}), ${width})\n`;
  };

  gen.forBlock['pg_draw_text'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    const size = g.valueToCode(block, 'SIZE', Order.NONE) || '24';
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '(255, 255, 255)';
    const x = g.valueToCode(block, 'X', Order.NONE) || '0';
    const y = g.valueToCode(block, 'Y', Order.NONE) || '0';
    // Use a cached font per size to avoid recreating every frame
    const fontKey = `_font_${size.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    g.addInit(fontKey, `${fontKey} = pygame.font.SysFont(None, ${size})`);
    return (
      `_text_surf = ${fontKey}.render(str(${text}), True, ${color})\n` +
      `_screen.blit(_text_surf, (${x}, ${y}))\n`
    );
  };
}
