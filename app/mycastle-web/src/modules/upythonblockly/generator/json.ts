import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerJsonGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_json_dumps'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    g.addImport('json', 'import json');
    const obj = g.valueToCode(block, 'OBJ', Order.NONE) || 'None';
    return [`json.dumps(${obj})`, Order.ATOMIC];
  };

  gen.forBlock['upy_json_loads'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    g.addImport('json', 'import json');
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return [`json.loads(${text})`, Order.ATOMIC];
  };
}
