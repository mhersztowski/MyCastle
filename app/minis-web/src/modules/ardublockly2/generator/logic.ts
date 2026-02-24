import * as Blockly from 'blockly';
import type { ArduinoGenerator } from './ArduinoGenerator';
import { Order } from './Order';

export function registerLogicGenerators(generator: ArduinoGenerator): void {
  generator.forBlock['controls_if'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    let n = 0;
    let argument =
      gen.valueToCode(block, 'IF' + n, Order.NONE) || 'false';
    let branch = gen.statementToCode(block, 'DO' + n);
    let code = 'if (' + argument + ') {\n' + branch + '}';

    const elseifCount = (block as any).elseifCount_ ?? 0;
    for (n = 1; n <= elseifCount; n++) {
      argument =
        gen.valueToCode(block, 'IF' + n, Order.NONE) || 'false';
      branch = gen.statementToCode(block, 'DO' + n);
      code += ' else if (' + argument + ') {\n' + branch + '}';
    }

    const elseCount = (block as any).elseCount_ ?? 0;
    if (elseCount) {
      branch = gen.statementToCode(block, 'ELSE');
      code += ' else {\n' + branch + '}';
    }

    return code + '\n';
  };

  generator.forBlock['logic_compare'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const OPERATORS: Record<string, string> = {
      EQ: '==',
      NEQ: '!=',
      LT: '<',
      LTE: '<=',
      GT: '>',
      GTE: '>=',
    };
    const operator = OPERATORS[block.getFieldValue('OP')];
    const order =
      operator === '==' || operator === '!='
        ? Order.EQUALITY
        : Order.RELATIONAL;
    const argument0 = gen.valueToCode(block, 'A', order) || '0';
    const argument1 = gen.valueToCode(block, 'B', order) || '0';
    const code = argument0 + ' ' + operator + ' ' + argument1;
    return [code, order];
  };

  generator.forBlock['logic_operation'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const operator =
      block.getFieldValue('OP') === 'AND' ? '&&' : '||';
    const order =
      operator === '&&' ? Order.LOGICAL_AND : Order.LOGICAL_OR;
    let argument0 = gen.valueToCode(block, 'A', order) || 'false';
    let argument1 = gen.valueToCode(block, 'B', order) || 'false';
    if (!argument0 && !argument1) {
      argument0 = 'false';
      argument1 = 'false';
    } else {
      const defaultArgument = operator === '&&' ? 'true' : 'false';
      if (!argument0) {
        argument0 = defaultArgument;
      }
      if (!argument1) {
        argument1 = defaultArgument;
      }
    }
    const code = argument0 + ' ' + operator + ' ' + argument1;
    return [code, order];
  };

  generator.forBlock['logic_negate'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const order = Order.UNARY_PREFIX;
    const argument0 =
      gen.valueToCode(block, 'BOOL', order) || 'false';
    const code = '!' + argument0;
    return [code, order];
  };

  generator.forBlock['logic_boolean'] = function (
    block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    const code =
      block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false';
    return [code, Order.ATOMIC];
  };

  generator.forBlock['logic_null'] = function (
    _block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    return ['NULL', Order.ATOMIC];
  };

  generator.forBlock['logic_ternary'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const valueIf =
      gen.valueToCode(block, 'IF', Order.CONDITIONAL) || 'false';
    const valueThen =
      gen.valueToCode(block, 'THEN', Order.CONDITIONAL) || 'null';
    const valueElse =
      gen.valueToCode(block, 'ELSE', Order.CONDITIONAL) || 'null';
    const code = valueIf + ' ? ' + valueThen + ' : ' + valueElse;
    return [code, Order.CONDITIONAL];
  };
}
