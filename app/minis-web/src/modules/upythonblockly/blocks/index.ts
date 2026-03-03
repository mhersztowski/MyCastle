import type { UPythonBoardManager } from '../boards/BoardManager';
import { registerEventBlocks } from './event';
import { registerPinBlocks } from './pin';
import { registerAdcBlocks } from './adc';
import { registerPwmBlocks } from './pwm';
import { registerTimeBlocks } from './time';
import { registerTimerBlocks } from './timer';
import { registerUartBlocks } from './uart';
import { registerI2cBlocks } from './i2c';
import { registerWifiBlocks } from './wifi';
import { registerBitsBlocks } from './bits';
import { registerTypeConvBlocks } from './typeconv';
import { registerControlBlocks } from './control';
import { registerMathBlocks } from './math';

export function registerAllBlocks(boardManager: UPythonBoardManager): void {
  registerEventBlocks();
  registerPinBlocks(boardManager);
  registerAdcBlocks(boardManager);
  registerPwmBlocks(boardManager);
  registerTimeBlocks();
  registerTimerBlocks();
  registerUartBlocks(boardManager);
  registerI2cBlocks(boardManager);
  registerWifiBlocks();
  registerBitsBlocks();
  registerTypeConvBlocks();
  registerControlBlocks();
  registerMathBlocks();
}
