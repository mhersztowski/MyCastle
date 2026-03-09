/**
 * Arduino code generator for the map block.
 * Ported from ardublockly/blockly/generators/arduino/map.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerMapGenerators(generator: ArduinoGenerator): void {
  /**
   * Map a value from one range to another.
   * Arduino code: loop { map(x, 0, 1024, 0, y) }
   */
  generator.forBlock['base_map'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const valueNum =
      gen.valueToCode(block, 'NUM', Order.NONE) || '0';
    const valueDmax =
      gen.valueToCode(block, 'DMAX', Order.ATOMIC) || '0';

    const code =
      'map(' + valueNum + ', 0, 1024, 0, ' + valueDmax + ')';
    return [code, Order.NONE];
  };
}
