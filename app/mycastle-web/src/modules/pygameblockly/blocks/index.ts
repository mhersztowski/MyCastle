import { registerEventBlocks } from './event';
import { registerEventsKeyboardBlocks } from './events_keyboard';
import { registerWindowBlocks } from './window';
import { registerScreenBlocks } from './screen';
import { registerDrawBlocks } from './draw';
import { registerDrawAdvBlocks } from './draw_adv';
import { registerColorBlocks } from './color';
import { registerEventsInputBlocks } from './events_input';
import { registerTimeBlocks } from './time';
import { registerRectBlocks } from './rect';
import { registerGameMathBlocks } from './gamemath';
import { registerImageBlocks } from './image';
import { registerSoundBlocks } from './sound';

export function registerAllBlocks(): void {
  registerEventBlocks();
  registerEventsKeyboardBlocks();
  registerWindowBlocks();
  registerScreenBlocks();
  registerDrawBlocks();
  registerDrawAdvBlocks();
  registerColorBlocks();
  registerEventsInputBlocks();
  registerTimeBlocks();
  registerRectBlocks();
  registerGameMathBlocks();
  registerImageBlocks();
  registerSoundBlocks();
}
