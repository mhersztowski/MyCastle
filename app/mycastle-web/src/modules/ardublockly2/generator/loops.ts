import * as Blockly from 'blockly';
import type { ArduinoGenerator } from './ArduinoGenerator';
import { Order } from './Order';

function isNumber(value: string): boolean {
  return /^\s*-?\d+(\.\d+)?\s*$/.test(value);
}

export function registerLoopsGenerators(generator: ArduinoGenerator): void {
  generator.forBlock['controls_repeat_ext'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const repeats =
      gen.valueToCode(block, 'TIMES', Order.ADDITIVE) || '0';
    const branch = gen.statementToCode(block, 'DO');

    let code = '';
    const loopVar =
      gen.nameDB_?.getDistinctName('count', Blockly.Names.NameType.VARIABLE) ??
      'count';
    let endVar = repeats;
    if (!/^\w+$/.test(repeats) && !isNumber(repeats)) {
      endVar =
        gen.nameDB_?.getDistinctName(
          'repeat_end',
          Blockly.Names.NameType.VARIABLE,
        ) ?? 'repeat_end';
      code += 'int ' + endVar + ' = ' + repeats + ';\n';
    }
    code +=
      'for (int ' +
      loopVar +
      ' = 0; ' +
      loopVar +
      ' < ' +
      endVar +
      '; ' +
      loopVar +
      '++) {\n' +
      branch +
      '}\n';
    return code;
  };

  generator.forBlock['controls_whileUntil'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    let argument0 =
      gen.valueToCode(
        block,
        'BOOL',
        until ? Order.LOGICAL_OR : Order.NONE,
      ) || 'false';
    const branch = gen.statementToCode(block, 'DO');

    if (until) {
      if (!/^\w+$/.test(argument0)) {
        argument0 = '(' + argument0 + ')';
      }
      argument0 = '!' + argument0;
    }
    return 'while (' + argument0 + ') {\n' + branch + '}\n';
  };

  generator.forBlock['controls_for'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const variable0 =
      gen.nameDB_?.getName(
        block.getFieldValue('VAR'),
        Blockly.Names.NameType.VARIABLE,
      ) ?? block.getFieldValue('VAR');
    const argument0 =
      gen.valueToCode(block, 'FROM', Order.ASSIGNMENT) || '0';
    const argument1 =
      gen.valueToCode(block, 'TO', Order.ASSIGNMENT) || '0';
    const increment =
      gen.valueToCode(block, 'BY', Order.ASSIGNMENT) || '1';
    const branch = gen.statementToCode(block, 'DO');

    let code: string;
    if (
      isNumber(argument0) &&
      isNumber(argument1) &&
      isNumber(increment)
    ) {
      const up = parseFloat(argument0) <= parseFloat(argument1);
      code =
        'for (' +
        variable0 +
        ' = ' +
        argument0 +
        '; ' +
        variable0 +
        (up ? ' <= ' : ' >= ') +
        argument1 +
        '; ' +
        variable0;
      const step = Math.abs(parseFloat(increment));
      if (step === 1) {
        code += up ? '++' : '--';
      } else {
        code += (up ? ' += ' : ' -= ') + step;
      }
      code += ') {\n' + branch + '}\n';
    } else {
      code = '';
      let startVar = argument0;
      if (!/^\w+$/.test(argument0) && !isNumber(argument0)) {
        startVar =
          gen.nameDB_?.getDistinctName(
            variable0 + '_start',
            Blockly.Names.NameType.VARIABLE,
          ) ?? variable0 + '_start';
        code += 'int ' + startVar + ' = ' + argument0 + ';\n';
      }
      let endVar = argument1;
      if (!/^\w+$/.test(argument1) && !isNumber(argument1)) {
        endVar =
          gen.nameDB_?.getDistinctName(
            variable0 + '_end',
            Blockly.Names.NameType.VARIABLE,
          ) ?? variable0 + '_end';
        code += 'int ' + endVar + ' = ' + argument1 + ';\n';
      }
      const incVar =
        gen.nameDB_?.getDistinctName(
          variable0 + '_inc',
          Blockly.Names.NameType.VARIABLE,
        ) ?? variable0 + '_inc';
      code += 'int ' + incVar + ' = ';
      if (isNumber(increment)) {
        code += Math.abs(parseFloat(increment)) + ';\n';
      } else {
        code += 'abs(' + increment + ');\n';
      }
      code += 'if (' + startVar + ' > ' + endVar + ') {\n';
      code += gen.INDENT + incVar + ' = -' + incVar + ';\n';
      code += '}\n';
      code +=
        'for (' +
        variable0 +
        ' = ' +
        startVar +
        ';\n' +
        '     ' +
        incVar +
        ' >= 0 ? ' +
        variable0 +
        ' <= ' +
        endVar +
        ' : ' +
        variable0 +
        ' >= ' +
        endVar +
        ';\n' +
        '     ' +
        variable0 +
        ' += ' +
        incVar +
        ') {\n' +
        branch +
        '}\n';
    }
    return code;
  };

  generator.forBlock['controls_flow_statements'] = function (
    block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): string {
    switch (block.getFieldValue('FLOW')) {
      case 'BREAK':
        return 'break;\n';
      case 'CONTINUE':
        return 'continue;\n';
    }
    throw new Error('Unknown flow statement.');
  };
}
