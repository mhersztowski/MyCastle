/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Blockly from 'blockly';

import type { BoardManager } from './boards/BoardManager';
import type { ArduinoGenerator } from './generator/ArduinoGenerator';
import { Order } from './generator/Order';

export interface ExternalConfig {
  toolboxCategories?: any[];
}

const CONFIG_PATH = 'ardublockly/config.js';

/**
 * Load and evaluate the user's config.js script from the data directory.
 * The script receives Blockly, boardManager, and generator in its scope
 * and can register custom blocks/generators. It may return an object with
 * `toolboxCategories` to append to the toolbox.
 */
export async function loadExternalConfig(
  readFile: (path: string) => Promise<{ content: string }>,
  boardManager: BoardManager,
  generator: ArduinoGenerator,
): Promise<ExternalConfig> {
  try {
    console.log('[ArduBlockly] Loading config from:', CONFIG_PATH);
    const file = await readFile(CONFIG_PATH);
    if (!file.content || !file.content.trim()) {
      console.log('[ArduBlockly] Config file is empty, using defaults');
      return {};
    }
    console.log('[ArduBlockly] Config loaded, evaluating script...');
    const config = evaluateConfigScript(file.content, boardManager, generator);
    console.log('[ArduBlockly] Config result:', config);
    return config;
  } catch (err) {
    console.warn('[ArduBlockly] Could not load config script:', err);
    return {};
  }
}

function evaluateConfigScript(
  script: string,
  boardManager: BoardManager,
  generator: ArduinoGenerator,
): ExternalConfig {
  try {
    // Wrap the script in a function that receives Blockly, boardManager, generator, Order
    const fn = new Function('Blockly', 'boardManager', 'generator', 'Order', script);
    const result = fn(Blockly, boardManager, generator, Order);
    if (result && typeof result === 'object') {
      return {
        toolboxCategories: Array.isArray(result.toolboxCategories)
          ? result.toolboxCategories
          : undefined,
      };
    }
    return {};
  } catch (err) {
    console.error('[ArduBlockly] Error evaluating config script:', err);
    return {};
  }
}
