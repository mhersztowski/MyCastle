import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerVariablesGenerators(gen: UPythonGenerator): void {
  gen.forBlock['variables_get'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    g.variables_.add(varName);
    return [varName, Order.ATOMIC];
  };

  gen.forBlock['variables_set'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    g.variables_.add(varName);
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || 'None';
    return `${varName} = ${val}\n`;
  };
}
