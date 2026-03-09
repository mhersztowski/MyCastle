/**
 * Arduino code generators for variable blocks.
 * Ported from ardublockly/blockly/generators/arduino/variables.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerVariablesGenerators(
  generator: ArduinoGenerator,
): void {
  /**
   * Variable (X) getter.
   * Arduino code: loop { X }
   */
  generator.forBlock['variables_get'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const varName = gen.getVariableName(block.getFieldValue('VAR'));
    return [varName, Order.ATOMIC];
  };

  /**
   * Variable (X) setter (Y).
   * Arduino code: type X;
   *               loop { X = Y; }
   */
  generator.forBlock['variables_set'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const argument0 =
      gen.valueToCode(block, 'VALUE', Order.ASSIGNMENT) || '0';
    const varName = gen.getVariableName(block.getFieldValue('VAR'));
    return varName + ' = ' + argument0 + ';\n';
  };

  /**
   * Variable (X) type casting (Y).
   * Arduino code: loop { (Y)X }
   */
  generator.forBlock['variables_set_type'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const argument0 =
      gen.valueToCode(block, 'VARIABLE_SETTYPE_INPUT', Order.ASSIGNMENT) ||
      '0';
    const typeId = block.getFieldValue('VARIABLE_SETTYPE_TYPE');
    const varType = gen.getArduinoType(typeId);
    const code = '(' + varType + ')(' + argument0 + ')';
    return [code, Order.ATOMIC];
  };
}
