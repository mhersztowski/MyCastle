export { PygameGenerator } from './PygameGenerator';
export { Order } from './Order';
export type { PygameMode } from './PygameGenerator';

import { PygameGenerator } from './PygameGenerator';
import { registerEventGenerators } from './event';
import { registerWindowGenerators } from './window';
import { registerDrawGenerators } from './draw';
import { registerColorGenerators } from './color';
import { registerEventsInputGenerators } from './events_input';
import { registerTimeGenerators } from './time';
import { registerLogicGenerators } from './logic';
import { registerLoopsGenerators } from './loops';
import { registerMathGenerators } from './math';
import { registerTextGenerators } from './text';
import { registerVariablesGenerators } from './variables';
import { registerProceduresGenerators } from './procedures';

export function createPygameGenerator(): PygameGenerator {
  const generator = new PygameGenerator();

  // Pygame-specific
  registerEventGenerators(generator);
  registerWindowGenerators(generator);
  registerDrawGenerators(generator);
  registerColorGenerators(generator);
  registerEventsInputGenerators(generator);
  registerTimeGenerators(generator);

  // Standard Python/Blockly blocks
  registerLogicGenerators(generator);
  registerLoopsGenerators(generator);
  registerMathGenerators(generator);
  registerTextGenerators(generator);
  registerVariablesGenerators(generator);
  registerProceduresGenerators(generator);

  return generator;
}
