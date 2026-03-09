export { UPythonGenerator } from './UPythonGenerator';
export { Order } from './Order';

import { UPythonGenerator } from './UPythonGenerator';
import type { UPythonBoardManager } from '../boards/BoardManager';

import { registerEventGenerators } from './event';
import { registerPinGenerators } from './pin';
import { registerAdcGenerators } from './adc';
import { registerPwmGenerators } from './pwm';
import { registerTimeGenerators } from './time';
import { registerTimerGenerators } from './timer';
import { registerUartGenerators } from './uart';
import { registerI2cGenerators } from './i2c';
import { registerWifiGenerators } from './wifi';
import { registerLogicGenerators } from './logic';
import { registerLoopsGenerators } from './loops';
import { registerMathGenerators } from './math';
import { registerTextGenerators } from './text';
import { registerVariablesGenerators } from './variables';
import { registerProceduresGenerators } from './procedures';
import { registerBitsGenerators } from './bits';
import { registerTypeConvGenerators } from './typeconv';
import { registerControlGenerators } from './control';

/**
 * Create a fully configured UPythonGenerator with all block generators registered.
 * The boardManager parameter is reserved for future board-specific generator tweaks.
 */
export function createUPythonGenerator(_boardManager: UPythonBoardManager): UPythonGenerator {
  const generator = new UPythonGenerator();

  // UIFlow2-style event hat blocks
  registerEventGenerators(generator);

  // MicroPython hardware blocks
  registerPinGenerators(generator);
  registerAdcGenerators(generator);
  registerPwmGenerators(generator);
  registerTimeGenerators(generator);
  registerTimerGenerators(generator);
  registerUartGenerators(generator);
  registerI2cGenerators(generator);
  registerWifiGenerators(generator);

  // Standard Blockly blocks (Python syntax)
  registerLogicGenerators(generator);
  registerLoopsGenerators(generator);
  registerMathGenerators(generator);
  registerTextGenerators(generator);
  registerVariablesGenerators(generator);
  registerProceduresGenerators(generator);

  // Extended blocks
  registerBitsGenerators(generator);
  registerTypeConvGenerators(generator);
  registerControlGenerators(generator);

  return generator;
}
