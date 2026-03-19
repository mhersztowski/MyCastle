import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

/** Ensure pygame.mixer is initialized once */
function ensureMixer(g: PygameGenerator): void {
  g.addInit('_mixer_init', 'pygame.mixer.init()');
}

export function registerSoundGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_load_sound'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    ensureMixer(g);
    return [`pygame.mixer.Sound(${path})`, Order.ATOMIC];
  };

  gen.forBlock['pg_play_sound'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const sound = g.valueToCode(block, 'SOUND', Order.ATOMIC) || '_snd';
    const loops = g.valueToCode(block, 'LOOPS', Order.NONE) || '0';
    return `${sound}.play(${loops})\n`;
  };

  gen.forBlock['pg_stop_sound'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const sound = g.valueToCode(block, 'SOUND', Order.ATOMIC) || '_snd';
    return `${sound}.stop()\n`;
  };

  gen.forBlock['pg_sound_volume'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const sound = g.valueToCode(block, 'SOUND', Order.ATOMIC) || '_snd';
    const vol = g.valueToCode(block, 'VOL', Order.NONE) || '1.0';
    return `${sound}.set_volume(${vol})\n`;
  };

  gen.forBlock['pg_load_music'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    ensureMixer(g);
    return `pygame.mixer.music.load(${path})\n`;
  };

  gen.forBlock['pg_play_music'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const loops = block.getFieldValue('LOOPS') ?? '-1';
    ensureMixer(g);
    return `pygame.mixer.music.play(${loops})\n`;
  };

  gen.forBlock['pg_stop_music'] = function (_block: Blockly.Block, g: PygameGenerator): string {
    ensureMixer(g);
    return 'pygame.mixer.music.stop()\n';
  };

  gen.forBlock['pg_music_volume'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const vol = g.valueToCode(block, 'VOL', Order.NONE) || '1.0';
    ensureMixer(g);
    return `pygame.mixer.music.set_volume(${vol})\n`;
  };
}
