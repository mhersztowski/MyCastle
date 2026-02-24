import type { BoardManager } from '../boards/BoardManager';
import { registerIoBlocks } from './io';
import { registerSerialBlocks } from './serial';
import { registerTimeBlocks } from './time';
import { registerServoBlocks } from './servo';
import { registerStepperBlocks } from './stepper';
import { registerSpiBlocks } from './spi';
import { registerAudioBlocks } from './audio';
import { registerMapBlocks } from './map';
import { registerVariablesBlocks } from './variables';

export {
  registerIoBlocks,
  registerSerialBlocks,
  registerTimeBlocks,
  registerServoBlocks,
  registerStepperBlocks,
  registerSpiBlocks,
  registerAudioBlocks,
  registerMapBlocks,
  registerVariablesBlocks,
};

/**
 * Register all Arduino block definitions with Blockly.
 * Must be called once before any workspace uses these blocks.
 */
export function registerAllBlocks(boardManager: BoardManager): void {
  registerIoBlocks(boardManager);
  registerSerialBlocks(boardManager);
  registerTimeBlocks(boardManager);
  registerServoBlocks(boardManager);
  registerStepperBlocks(boardManager);
  registerSpiBlocks(boardManager);
  registerAudioBlocks(boardManager);
  registerMapBlocks(boardManager);
  registerVariablesBlocks(boardManager);
}
