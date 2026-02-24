import * as Blockly from 'blockly';
import type { ArduinoGenerator } from './ArduinoGenerator';
import { Order } from './Order';

export function registerTextGenerators(generator: ArduinoGenerator): void {
  generator.forBlock['text'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const code = gen.quote_(block.getFieldValue('TEXT'));
    return [code, Order.ATOMIC];
  };

  generator.forBlock['text_join'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const itemCount = (block as any).itemCount_ ?? 0;

    if (itemCount === 0) {
      return ['""', Order.ATOMIC];
    } else if (itemCount === 1) {
      const argument0 =
        gen.valueToCode(block, 'ADD0', Order.UNARY_POSTFIX) || '""';
      const code = 'String(' + argument0 + ')';
      return [code, Order.UNARY_POSTFIX];
    } else {
      const parts: string[] = [];
      for (let n = 0; n < itemCount; n++) {
        const argument = gen.valueToCode(
          block,
          'ADD' + n,
          Order.NONE,
        );
        if (argument === '') {
          parts[n] = '""';
        } else {
          parts[n] = 'String(' + argument + ')';
        }
      }
      const code = parts.join(' + ');
      return [code, Order.UNARY_POSTFIX];
    }
  };

  generator.forBlock['text_append'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const varName =
      gen.nameDB_?.getName(
        block.getFieldValue('VAR'),
        Blockly.Names.NameType.VARIABLE,
      ) ?? block.getFieldValue('VAR');
    let argument0 = gen.valueToCode(
      block,
      'TEXT',
      Order.UNARY_POSTFIX,
    );
    if (argument0 === '') {
      argument0 = '""';
    } else {
      argument0 = 'String(' + argument0 + ')';
    }
    return varName + ' += ' + argument0 + ';\n';
  };

  generator.forBlock['text_length'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const argument0 =
      gen.valueToCode(block, 'VALUE', Order.UNARY_POSTFIX) || '""';
    const code = 'String(' + argument0 + ').length()';
    return [code, Order.UNARY_POSTFIX];
  };

  generator.forBlock['text_isEmpty'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const func = [
      'boolean ' + gen.FUNCTION_NAME_PLACEHOLDER_ + '(String msg) {',
      '  if (msg.length() == 0) {',
      '    return true;',
      '  } else {',
      '    return false;',
      '  }',
      '}',
    ];
    const funcName = gen.addFunction(
      'isStringEmpty',
      func.join('\n'),
    );
    let argument0 = gen.valueToCode(
      block,
      'VALUE',
      Order.UNARY_POSTFIX,
    );
    if (argument0 === '') {
      argument0 = '""';
    } else {
      argument0 = 'String(' + argument0 + ')';
    }
    const code = funcName + '(' + argument0 + ')';
    return [code, Order.UNARY_POSTFIX];
  };

  generator.forBlock['text_prompt_ext'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const serialId = 'Serial';
    const returnType = block.getFieldValue('TYPE');

    const func: string[] = [];
    const toNumber = returnType === 'NUMBER';
    if (toNumber) {
      func.push(
        'int ' + gen.FUNCTION_NAME_PLACEHOLDER_ + '(String msg) {',
      );
    } else {
      func.push(
        'String ' + gen.FUNCTION_NAME_PLACEHOLDER_ + '(String msg) {',
      );
    }
    func.push('  ' + serialId + '.println(msg);');
    func.push('  boolean stringComplete = false;');
    if (toNumber) {
      func.push('  int content = 0;');
    } else {
      func.push('  String content = "";');
    }
    func.push('  while (stringComplete == false) {');
    func.push('    if (' + serialId + '.available()) {');
    if (toNumber) {
      func.push(
        '      content = ' + serialId + '.parseInt();',
      );
      func.push('      stringComplete = true;');
    } else {
      func.push(
        '      char readChar = (char)' + serialId + '.read();',
      );
      func.push(
        "      if (readChar == '\\n' || readChar == '\\r') {",
      );
      func.push('        stringComplete = true;');
      func.push('      } else {');
      func.push('        content += readChar;');
      func.push('      }');
    }
    func.push('    }');
    func.push('  }');
    func.push(
      '  while(Serial.available()) { Serial.read(); };',
    );
    func.push('  return content;');
    func.push('}');
    const funcName = gen.addFunction(
      'getUserInputPrompt' + returnType,
      func.join('\n'),
    );

    const setupCode = serialId + '.begin(9600);';
    gen.addSetup('serial_' + serialId, setupCode, false);

    const msg =
      gen.valueToCode(block, 'TEXT', Order.NONE) || '""';
    const code = funcName + '(' + msg + ')';

    return [code, Order.UNARY_POSTFIX];
  };
}
