import * as Blockly from 'blockly';
import type { ArduinoGenerator } from './ArduinoGenerator';
import { Order } from './Order';

export function registerProceduresGenerators(
  generator: ArduinoGenerator,
): void {
  generator.forBlock['procedures_defreturn'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): null {
    const funcName =
      gen.nameDB_?.getName(
        block.getFieldValue('NAME'),
        Blockly.Names.NameType.PROCEDURE,
      ) ?? block.getFieldValue('NAME');
    let branch = gen.statementToCode(block, 'STACK');

    if (gen.STATEMENT_PREFIX) {
      const id = block.id.replace(/\$/g, '$$$$');
      branch =
        gen.prefixLines(
          gen.STATEMENT_PREFIX.replace(/%1/g, "'" + id + "'"),
          gen.INDENT,
        ) + branch;
    }
    if (gen.INFINITE_LOOP_TRAP) {
      branch =
        gen.INFINITE_LOOP_TRAP.replace(
          /%1/g,
          "'" + block.id + "'",
        ) + branch;
    }

    let returnValue =
      gen.valueToCode(block, 'RETURN', Order.NONE) || '';
    if (returnValue) {
      returnValue = gen.INDENT + 'return ' + returnValue + ';\n';
    }

    const args: string[] = [];
    const blockArgs: string[] =
      (block as any).arguments_ ?? (block as any).getVars?.() ?? [];
    for (let x = 0; x < blockArgs.length; x++) {
      const argType = (block as any).getArgType
        ? gen.getArduinoType((block as any).getArgType(blockArgs[x]))
        : 'int';
      const argName =
        gen.nameDB_?.getName(
          blockArgs[x],
          Blockly.Names.NameType.VARIABLE,
        ) ?? blockArgs[x];
      args[x] = argType + ' ' + argName;
    }

    let returnType = 'void';
    if ((block as any).getReturnType) {
      returnType = gen.getArduinoType((block as any).getReturnType());
    }

    const code =
      returnType +
      ' ' +
      funcName +
      '(' +
      args.join(', ') +
      ') {\n' +
      branch +
      returnValue +
      '}';

    gen.userFunctions_[funcName] = code;
    return null;
  };

  generator.forBlock['procedures_defnoreturn'] =
    generator.forBlock['procedures_defreturn'];

  generator.forBlock['procedures_callreturn'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const funcName =
      gen.nameDB_?.getName(
        block.getFieldValue('NAME'),
        Blockly.Names.NameType.PROCEDURE,
      ) ?? block.getFieldValue('NAME');
    const args: string[] = [];
    const blockArgs: string[] =
      (block as any).arguments_ ?? (block as any).getVars?.() ?? [];
    for (let x = 0; x < blockArgs.length; x++) {
      args[x] =
        gen.valueToCode(block, 'ARG' + x, Order.NONE) || 'null';
    }
    const code = funcName + '(' + args.join(', ') + ')';
    return [code, Order.UNARY_POSTFIX];
  };

  generator.forBlock['procedures_callnoreturn'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const funcName =
      gen.nameDB_?.getName(
        block.getFieldValue('NAME'),
        Blockly.Names.NameType.PROCEDURE,
      ) ?? block.getFieldValue('NAME');
    const args: string[] = [];
    const blockArgs: string[] =
      (block as any).arguments_ ?? (block as any).getVars?.() ?? [];
    for (let x = 0; x < blockArgs.length; x++) {
      args[x] =
        gen.valueToCode(block, 'ARG' + x, Order.NONE) || 'null';
    }
    const code = funcName + '(' + args.join(', ') + ');\n';
    return code;
  };

  generator.forBlock['procedures_ifreturn'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const condition =
      gen.valueToCode(block, 'CONDITION', Order.NONE) || 'false';
    let code = 'if (' + condition + ') {\n';
    const hasReturnValue = (block as any).hasReturnValue_;
    if (hasReturnValue) {
      const value =
        gen.valueToCode(block, 'VALUE', Order.NONE) || 'null';
      code += gen.INDENT + 'return ' + value + ';\n';
    } else {
      code += gen.INDENT + 'return;\n';
    }
    code += '}\n';
    return code;
  };
}
