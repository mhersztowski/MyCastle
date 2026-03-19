import { registerEventBlocks } from './event';
import { registerWindowBlocks } from './window';
import { registerDrawBlocks } from './draw';
import { registerColorBlocks } from './color';
import { registerEventsInputBlocks } from './events_input';
import { registerTimeBlocks } from './time';

export function registerAllBlocks(): void {
  registerEventBlocks();
  registerWindowBlocks();
  registerDrawBlocks();
  registerColorBlocks();
  registerEventsInputBlocks();
  registerTimeBlocks();
}
