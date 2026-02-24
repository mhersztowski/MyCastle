export { ArduinoGenerator } from './ArduinoGenerator';
export { Order } from './Order';
export { PinType } from './PinTypes';

import { ArduinoGenerator } from './ArduinoGenerator';
import type { BoardManager } from '../boards/BoardManager';

import { registerIoGenerators } from './io';
import { registerSerialGenerators } from './serial';
import { registerTimeGenerators } from './time';
import { registerServoGenerators } from './servo';
import { registerStepperGenerators } from './stepper';
import { registerSpiGenerators } from './spi';
import { registerAudioGenerators } from './audio';
import { registerMapGenerators } from './map';
import { registerVariablesGenerators } from './variables';
import { registerLogicGenerators } from './logic';
import { registerLoopsGenerators } from './loops';
import { registerMathGenerators } from './math';
import { registerTextGenerators } from './text';
import { registerProceduresGenerators } from './procedures';

/**
 * Create a fully configured ArduinoGenerator with all block generators registered.
 */
export function createArduinoGenerator(boardManager: BoardManager): ArduinoGenerator {
  const generator = new ArduinoGenerator(boardManager);

  // Arduino-specific blocks
  registerIoGenerators(generator);
  registerSerialGenerators(generator);
  registerTimeGenerators(generator);
  registerServoGenerators(generator);
  registerStepperGenerators(generator);
  registerSpiGenerators(generator);
  registerAudioGenerators(generator);
  registerMapGenerators(generator);
  registerVariablesGenerators(generator);

  // Built-in blocks
  registerLogicGenerators(generator);
  registerLoopsGenerators(generator);
  registerMathGenerators(generator);
  registerTextGenerators(generator);
  registerProceduresGenerators(generator);

  return generator;
}
