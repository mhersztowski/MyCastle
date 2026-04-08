export { UPythonGenerator } from './UPythonGenerator';
export { Order } from './Order';

import { UPythonGenerator } from './UPythonGenerator';
import type { UPythonBoardManager } from '../boards/BoardManager';

import { registerEventGenerators } from './event';
import { registerPinGenerators, registerPinV2Generators } from './pin';
import { registerAdcGenerators, registerAdcV2Generators } from './adc';
import { registerPwmGenerators, registerPwmV2Generators } from './pwm';
import { registerTimeGenerators } from './time';
import { registerTimerGenerators, registerTimerV2Generators } from './timer';
import { registerDisplayGenerators } from './display';
import { registerUartGenerators, registerUartV2Generators } from './uart';
import { registerI2cGenerators, registerI2cV2Generators } from './i2c';
import { registerSpeakerGenerators } from './speaker';
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
import { registerListGenerators } from './lists';
import { registerTupleGenerators } from './tuples';
import { registerMapGenerators } from './maps';
import { registerJsonGenerators } from './json';
import { registerBytearrayGenerators } from './bytearray';
import { registerBytesGenerators } from './bytes';
import { registerSdcardGenerators } from './sdcard';
import { registerCanGenerators } from './can';
import { registerI2sGenerators } from './i2s';
import { registerSpiV2Generators } from './spi_v2';
import { registerWdtGenerators } from './wdt';
import { registerRtcGenerators } from './rtc';
import { registerButtonGenerators } from './button';
import { registerRgbIrGenerators } from './rgb_ir';

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
  registerPinV2Generators(generator);
  registerAdcGenerators(generator);
  registerAdcV2Generators(generator);
  registerPwmGenerators(generator);
  registerPwmV2Generators(generator);
  registerTimeGenerators(generator);
  registerTimerGenerators(generator);
  registerTimerV2Generators(generator);
  registerDisplayGenerators(generator);
  registerUartGenerators(generator);
  registerUartV2Generators(generator);
  registerI2cGenerators(generator);
  registerI2cV2Generators(generator);
  registerSpeakerGenerators(generator);
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
  registerListGenerators(generator);
  registerTupleGenerators(generator);
  registerMapGenerators(generator);
  registerJsonGenerators(generator);
  registerBytearrayGenerators(generator);
  registerBytesGenerators(generator);
  registerSdcardGenerators(generator);
  registerCanGenerators(generator);
  registerI2sGenerators(generator);
  registerSpiV2Generators(generator);
  registerWdtGenerators(generator);
  registerRtcGenerators(generator);
  registerButtonGenerators(generator);
  registerRgbIrGenerators(generator);

  return generator;
}
