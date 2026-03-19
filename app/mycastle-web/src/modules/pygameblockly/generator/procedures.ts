import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerProceduresGenerators(gen: PygameGenerator): void {
  gen.forBlock['procedures_defnoreturn'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const funcName = g.getProcedureName(block.getFieldValue('NAME'));
    const branch = g.statementToCode(block, 'STACK') || g.INDENT + 'pass\n';
    const args = (block as Blockly.Block & { arguments_?: string[] }).arguments_?.map(
      (a) => g.getVariableName(a),
    ) ?? [];
    g.addFunction(funcName, `def ${funcName}(${args.join(', ')}):\n${branch}`);
    return '';
  };

  gen.forBlock['procedures_defreturn'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const funcName = g.getProcedureName(block.getFieldValue('NAME'));
    const branch = g.statementToCode(block, 'STACK') || '';
    const returnVal = g.valueToCode(block, 'RETURN', Order.NONE) || 'None';
    const args = (block as Blockly.Block & { arguments_?: string[] }).arguments_?.map(
      (a) => g.getVariableName(a),
    ) ?? [];
    g.addFunction(funcName, `def ${funcName}(${args.join(', ')}):\n${branch}${g.INDENT}return ${returnVal}\n`);
    return '';
  };

  gen.forBlock['procedures_callnoreturn'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const funcName = g.getProcedureName(block.getFieldValue('NAME'));
    const args = block.getVars().map((_v, i) => g.valueToCode(block, `ARG${i}`, Order.NONE) || 'None');
    return `${funcName}(${args.join(', ')})\n`;
  };

  gen.forBlock['procedures_callreturn'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const funcName = g.getProcedureName(block.getFieldValue('NAME'));
    const args = block.getVars().map((_v, i) => g.valueToCode(block, `ARG${i}`, Order.NONE) || 'None');
    return [`${funcName}(${args.join(', ')})`, Order.ATOMIC];
  };

  gen.forBlock['procedures_ifreturn'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const cond = g.valueToCode(block, 'CONDITION', Order.NONE) || 'False';
    if ((block as unknown as { hasReturnValue_: boolean }).hasReturnValue_) {
      const val = g.valueToCode(block, 'VALUE', Order.NONE) || 'None';
      return `if ${cond}:\n${g.INDENT}return ${val}\n`;
    }
    return `if ${cond}:\n${g.INDENT}return\n`;
  };
}
