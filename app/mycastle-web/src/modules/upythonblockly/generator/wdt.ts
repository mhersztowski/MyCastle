import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerWdtGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_wdt_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_wdt', 'from hardware import WDT');
    g.variables_.add('wdt');
    const timeout = g.valueToCode(block, 'TIMEOUT', Order.NONE) || '5000';
    return `wdt = WDT(timeout=${timeout})\n`;
  };

  gen.forBlock['upy_wdt_feed'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.variables_.add('wdt');
    return 'wdt.feed()\n';
  };
}
