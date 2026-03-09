/**
 * Arduino code generators for Time blocks.
 * Ported from ardublockly/blockly/generators/arduino/time.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerTimeGenerators(generator: ArduinoGenerator): void {
  /**
   * Delay in milliseconds.
   * Arduino code: loop { delay(X); }
   */
  generator.forBlock['time_delay'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const delayTime =
      gen.valueToCode(block, 'DELAY_TIME_MILI', Order.ATOMIC) || '0';
    return 'delay(' + delayTime + ');\n';
  };

  /**
   * Delay in microseconds.
   * Arduino code: loop { delayMicroseconds(X); }
   */
  generator.forBlock['time_delaymicros'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const delayTimeMs =
      gen.valueToCode(block, 'DELAY_TIME_MICRO', Order.ATOMIC) || '0';
    return 'delayMicroseconds(' + delayTimeMs + ');\n';
  };

  /**
   * Elapsed time in milliseconds.
   * Arduino code: loop { millis() }
   */
  generator.forBlock['time_millis'] = function (
    _block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    return ['millis()', Order.ATOMIC];
  };

  /**
   * Elapsed time in microseconds.
   * Arduino code: loop { micros() }
   */
  generator.forBlock['time_micros'] = function (
    _block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    return ['micros()', Order.ATOMIC];
  };

  /**
   * Wait forever (end of program).
   * Arduino code: loop { while(true); }
   */
  generator.forBlock['infinite_loop'] = function (
    _block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): string {
    return 'while(true);\n';
  };
}
