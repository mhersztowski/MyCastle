export { PygameGenerator } from './PygameGenerator';
export { Order } from './Order';
export type { PygameMode } from './PygameGenerator';

import { PygameGenerator } from './PygameGenerator';
import { registerEventGenerators } from './event';
import { registerEventsKeyboardGenerators } from './events_keyboard';
import { registerWindowGenerators } from './window';
import { registerDrawGenerators } from './draw';
import { registerDrawAdvGenerators } from './draw_adv';
import { registerColorGenerators } from './color';
import { registerEventsInputGenerators } from './events_input';
import { registerTimeGenerators } from './time';
import { registerRectGenerators } from './rect';
import { registerScreenGenerators } from './screen';
import { registerGameMathGenerators } from './gamemath';
import { registerImageGenerators } from './image';
import { registerSoundGenerators } from './sound';
import { registerLogicGenerators } from './logic';
import { registerLoopsGenerators } from './loops';
import { registerMathGenerators } from './math';
import { registerTextGenerators } from './text';
import { registerVariablesGenerators } from './variables';
import { registerProceduresGenerators } from './procedures';

export function createPygameGenerator(): PygameGenerator {
  const generator = new PygameGenerator();

  // Pygame-specific event / loop structure
  registerEventGenerators(generator);
  registerEventsKeyboardGenerators(generator);

  // Pygame API blocks
  registerWindowGenerators(generator);
  registerScreenGenerators(generator);
  registerDrawGenerators(generator);
  registerDrawAdvGenerators(generator);
  registerColorGenerators(generator);
  registerEventsInputGenerators(generator);
  registerTimeGenerators(generator);
  registerRectGenerators(generator);
  registerGameMathGenerators(generator);
  registerImageGenerators(generator);
  registerSoundGenerators(generator);

  // Standard Python/Blockly blocks
  registerLogicGenerators(generator);
  registerLoopsGenerators(generator);
  registerMathGenerators(generator);
  registerTextGenerators(generator);
  registerVariablesGenerators(generator);
  registerProceduresGenerators(generator);

  return generator;
}
