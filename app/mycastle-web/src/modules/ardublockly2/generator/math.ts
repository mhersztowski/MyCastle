import * as Blockly from 'blockly';
import type { ArduinoGenerator } from './ArduinoGenerator';
import { Order } from './Order';

export function registerMathGenerators(generator: ArduinoGenerator): void {
  generator.forBlock['math_number'] = function (
    block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    const num = parseFloat(block.getFieldValue('NUM'));
    let code: string;
    if (num === Infinity) {
      code = 'INFINITY';
    } else if (num === -Infinity) {
      code = '-INFINITY';
    } else {
      code = String(num);
    }
    return [code, Order.ATOMIC];
  };

  generator.forBlock['math_arithmetic'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const OPERATORS: Record<string, [string | null, Order]> = {
      ADD: [' + ', Order.ADDITIVE],
      MINUS: [' - ', Order.ADDITIVE],
      MULTIPLY: [' * ', Order.MULTIPLICATIVE],
      DIVIDE: [' / ', Order.MULTIPLICATIVE],
      POWER: [null, Order.NONE],
    };
    const tuple = OPERATORS[block.getFieldValue('OP')];
    const operator = tuple[0];
    const order = tuple[1];
    const argument0 = gen.valueToCode(block, 'A', order) || '0';
    const argument1 = gen.valueToCode(block, 'B', order) || '0';
    let code: string;
    if (!operator) {
      code = 'pow(' + argument0 + ', ' + argument1 + ')';
      return [code, Order.UNARY_POSTFIX];
    }
    code = argument0 + operator + argument1;
    return [code, order];
  };

  generator.forBlock['math_single'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const operator = block.getFieldValue('OP');
    let code: string | undefined;
    let arg: string;

    if (operator === 'NEG') {
      arg =
        gen.valueToCode(block, 'NUM', Order.UNARY_PREFIX) || '0';
      if (arg[0] === '-') {
        arg = ' ' + arg;
      }
      code = '-' + arg;
      return [code, Order.UNARY_PREFIX];
    }

    if (operator === 'ABS' || operator.substring(0, 5) === 'ROUND') {
      arg =
        gen.valueToCode(block, 'NUM', Order.UNARY_POSTFIX) || '0';
    } else if (
      operator === 'SIN' ||
      operator === 'COS' ||
      operator === 'TAN'
    ) {
      arg =
        gen.valueToCode(block, 'NUM', Order.MULTIPLICATIVE) || '0';
    } else {
      arg = gen.valueToCode(block, 'NUM', Order.NONE) || '0';
    }

    switch (operator) {
      case 'ABS':
        code = 'abs(' + arg + ')';
        break;
      case 'ROOT':
        code = 'sqrt(' + arg + ')';
        break;
      case 'LN':
        code = 'log(' + arg + ')';
        break;
      case 'EXP':
        code = 'exp(' + arg + ')';
        break;
      case 'POW10':
        code = 'pow(10,' + arg + ')';
        break;
      case 'ROUND':
        code = 'round(' + arg + ')';
        break;
      case 'ROUNDUP':
        code = 'ceil(' + arg + ')';
        break;
      case 'ROUNDDOWN':
        code = 'floor(' + arg + ')';
        break;
      case 'SIN':
        code = 'sin(' + arg + ' / 180.0 * M_PI)';
        break;
      case 'COS':
        code = 'cos(' + arg + ' / 180.0 * M_PI)';
        break;
      case 'TAN':
        code = 'tan(' + arg + ' / 180.0 * M_PI)';
        break;
    }
    if (code) {
      return [code, Order.UNARY_POSTFIX];
    }

    switch (operator) {
      case 'LOG10':
        code = 'log(' + arg + ') / log(10)';
        break;
      case 'ASIN':
        code = 'asin(' + arg + ') / M_PI * 180';
        break;
      case 'ACOS':
        code = 'acos(' + arg + ') / M_PI * 180';
        break;
      case 'ATAN':
        code = 'atan(' + arg + ') / M_PI * 180';
        break;
      default:
        throw new Error('Unknown math operator: ' + operator);
    }
    return [code, Order.MULTIPLICATIVE];
  };

  generator.forBlock['math_trig'] = generator.forBlock['math_single'];

  generator.forBlock['math_constant'] = function (
    block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    const CONSTANTS: Record<string, [string, Order]> = {
      PI: ['M_PI', Order.UNARY_POSTFIX],
      E: ['M_E', Order.UNARY_POSTFIX],
      GOLDEN_RATIO: ['(1 + sqrt(5)) / 2', Order.MULTIPLICATIVE],
      SQRT2: ['M_SQRT2', Order.UNARY_POSTFIX],
      SQRT1_2: ['M_SQRT1_2', Order.UNARY_POSTFIX],
      INFINITY: ['INFINITY', Order.ATOMIC],
    };
    return CONSTANTS[block.getFieldValue('CONSTANT')];
  };

  generator.forBlock['math_number_property'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const numberToCheck =
      gen.valueToCode(block, 'NUMBER_TO_CHECK', Order.MULTIPLICATIVE) ||
      '0';
    const dropdownProperty = block.getFieldValue('PROPERTY');
    let code: string;

    if (dropdownProperty === 'PRIME') {
      const func = [
        'boolean ' + gen.FUNCTION_NAME_PLACEHOLDER_ + '(int n) {',
        '  if (n == 2 || n == 3) {',
        '    return true;',
        '  }',
        '  if (isnan(n) || (n <= 1) || (n == 1) || (n % 2 == 0) || ' +
          '(n % 3 == 0)) {',
        '    return false;',
        '  }',
        '  for (int x = 6; x <= sqrt(n) + 1; x += 6) {',
        '    if (n % (x - 1) == 0 || n % (x + 1) == 0) {',
        '      return false;',
        '    }',
        '  }',
        '  return true;',
        '}',
      ];
      const funcName = gen.addFunction('mathIsPrime', func.join('\n'));
      gen.addInclude('math', '#include <math.h>');
      code = funcName + '(' + numberToCheck + ')';
      return [code, Order.UNARY_POSTFIX];
    }

    switch (dropdownProperty) {
      case 'EVEN':
        code = numberToCheck + ' % 2 == 0';
        break;
      case 'ODD':
        code = numberToCheck + ' % 2 == 1';
        break;
      case 'WHOLE':
        gen.addInclude('math', '#include <math.h>');
        code =
          '(floor(' + numberToCheck + ') == ' + numberToCheck + ')';
        break;
      case 'POSITIVE':
        code = numberToCheck + ' > 0';
        break;
      case 'NEGATIVE':
        code = numberToCheck + ' < 0';
        break;
      case 'DIVISIBLE_BY': {
        const divisor =
          gen.valueToCode(block, 'DIVISOR', Order.MULTIPLICATIVE) ||
          '0';
        code = numberToCheck + ' % ' + divisor + ' == 0';
        break;
      }
      default:
        throw new Error('Unknown property: ' + dropdownProperty);
    }
    return [code, Order.EQUALITY];
  };

  generator.forBlock['math_change'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const argument0 =
      gen.valueToCode(block, 'DELTA', Order.ADDITIVE) || '0';
    const varName =
      gen.nameDB_?.getName(
        block.getFieldValue('VAR'),
        Blockly.Names.NameType.VARIABLE,
      ) ?? block.getFieldValue('VAR');
    return varName + ' += ' + argument0 + ';\n';
  };

  generator.forBlock['math_round'] = generator.forBlock['math_single'];

  generator.forBlock['math_modulo'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const argument0 =
      gen.valueToCode(block, 'DIVIDEND', Order.MULTIPLICATIVE) || '0';
    const argument1 =
      gen.valueToCode(block, 'DIVISOR', Order.MULTIPLICATIVE) || '0';
    const code = argument0 + ' % ' + argument1;
    return [code, Order.MULTIPLICATIVE];
  };

  generator.forBlock['math_constrain'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const argument0 =
      gen.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const argument1 =
      gen.valueToCode(block, 'LOW', Order.NONE) || '0';
    const argument2 =
      gen.valueToCode(block, 'HIGH', Order.NONE) || '0';
    const code =
      '(' +
      argument0 +
      ' < ' +
      argument1 +
      ' ? ' +
      argument1 +
      ' : ( ' +
      argument0 +
      ' > ' +
      argument2 +
      ' ? ' +
      argument2 +
      ' : ' +
      argument0 +
      '))';
    return [code, Order.UNARY_POSTFIX];
  };

  generator.forBlock['math_random_int'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const argument0 =
      gen.valueToCode(block, 'FROM', Order.NONE) || '0';
    const argument1 =
      gen.valueToCode(block, 'TO', Order.NONE) || '0';
    const func = [
      'int ' + gen.FUNCTION_NAME_PLACEHOLDER_ + '(int min, int max) {',
      '  if (min > max) {',
      '    int temp = min;',
      '    min = max;',
      '    max = temp;',
      '  }',
      '  return min + (rand() % (max - min + 1));',
      '}',
    ];
    const funcName = gen.addFunction(
      'mathRandomInt',
      func.join('\n'),
    );
    const code = funcName + '(' + argument0 + ', ' + argument1 + ')';
    return [code, Order.UNARY_POSTFIX];
  };

  generator.forBlock['math_random_float'] = function (
    _block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    return ['(rand() / RAND_MAX)', Order.UNARY_POSTFIX];
  };
}
