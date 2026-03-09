import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerTimeGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_sleep_ms'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const ms = g.valueToCode(block, 'MS', Order.NONE) || '1000';
    g.addImport('time', 'import time');
    return `time.sleep_ms(${ms})\n`;
  };

  gen.forBlock['upy_sleep_us'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const us = g.valueToCode(block, 'US', Order.NONE) || '100';
    g.addImport('time', 'import time');
    return `time.sleep_us(${us})\n`;
  };

  gen.forBlock['upy_ticks_ms'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('time', 'import time');
    return ['time.ticks_ms()', Order.ATOMIC];
  };

  gen.forBlock['upy_ticks_us'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('time', 'import time');
    return ['time.ticks_us()', Order.ATOMIC];
  };
}
