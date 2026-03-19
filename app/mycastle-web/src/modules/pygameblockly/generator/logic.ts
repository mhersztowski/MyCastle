import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerLogicGenerators(gen: PygameGenerator): void {
  gen.forBlock['controls_if'] = function (block: Blockly.Block, g: PygameGenerator): string {
    let n = 0;
    let code = '';
    do {
      const cond = g.valueToCode(block, `IF${n}`, Order.NONE) || 'False';
      const branch = g.statementToCode(block, `DO${n}`) || g.INDENT + 'pass\n';
      code += (n === 0 ? 'if ' : 'elif ') + cond + ':\n' + branch;
      n++;
    } while (block.getInput(`IF${n}`));
    if (block.getInput('ELSE')) {
      const branch = g.statementToCode(block, 'ELSE') || g.INDENT + 'pass\n';
      code += 'else:\n' + branch;
    }
    return code;
  };

  gen.forBlock['logic_compare'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const opMap: Record<string, [string, Order]> = {
      EQ: ['==', Order.COMPARISON], NEQ: ['!=', Order.COMPARISON],
      LT: ['<', Order.COMPARISON], LTE: ['<=', Order.COMPARISON],
      GT: ['>', Order.COMPARISON], GTE: ['>=', Order.COMPARISON],
    };
    const [operator, order] = opMap[block.getFieldValue('OP')] ?? ['==', Order.COMPARISON];
    const a = g.valueToCode(block, 'A', order) || '0';
    const b = g.valueToCode(block, 'B', order) || '0';
    return [`${a} ${operator} ${b}`, order];
  };

  gen.forBlock['logic_operation'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const op = block.getFieldValue('OP') === 'AND' ? 'and' : 'or';
    const order = op === 'and' ? Order.LOGICAL_AND : Order.LOGICAL_OR;
    const a = g.valueToCode(block, 'A', order) || 'False';
    const b = g.valueToCode(block, 'B', order) || 'False';
    return [`${a} ${op} ${b}`, order];
  };

  gen.forBlock['logic_negate'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const arg = g.valueToCode(block, 'BOOL', Order.LOGICAL_NOT) || 'False';
    return [`not ${arg}`, Order.LOGICAL_NOT];
  };

  gen.forBlock['logic_boolean'] = function (block: Blockly.Block): [string, Order] {
    return [block.getFieldValue('BOOL') === 'TRUE' ? 'True' : 'False', Order.ATOMIC];
  };

  gen.forBlock['logic_null'] = function (): [string, Order] {
    return ['None', Order.ATOMIC];
  };

  gen.forBlock['logic_ternary'] = function (block: Blockly.Block, g: PygameGenerator): [string, Order] {
    const cond = g.valueToCode(block, 'IF', Order.CONDITIONAL) || 'False';
    const then = g.valueToCode(block, 'THEN', Order.CONDITIONAL) || 'None';
    const els = g.valueToCode(block, 'ELSE', Order.CONDITIONAL) || 'None';
    return [`${then} if ${cond} else ${els}`, Order.CONDITIONAL];
  };
}
