import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerLogicGenerators(gen: UPythonGenerator): void {
  gen.forBlock['controls_if'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    let n = 0;
    let code = '';
    let branchCode: string;
    let conditionCode: string;

    if (g.STATEMENT_PREFIX) {
      g.STATEMENT_PREFIX.replace(/%1/g, String(n));
    }

    do {
      conditionCode = g.valueToCode(block, `IF${n}`, Order.NONE) || 'False';
      branchCode = g.statementToCode(block, `DO${n}`) || g.INDENT + 'pass\n';
      code += (n === 0 ? 'if ' : 'elif ') + conditionCode + ':\n' + branchCode;
      n++;
    } while (block.getInput(`IF${n}`));

    if (block.getInput('ELSE')) {
      branchCode = g.statementToCode(block, 'ELSE') || g.INDENT + 'pass\n';
      code += 'else:\n' + branchCode;
    }

    return code;
  };

  gen.forBlock['logic_compare'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const opMap: Record<string, [string, Order]> = {
      EQ: ['==', Order.COMPARISON],
      NEQ: ['!=', Order.COMPARISON],
      LT: ['<', Order.COMPARISON],
      LTE: ['<=', Order.COMPARISON],
      GT: ['>', Order.COMPARISON],
      GTE: ['>=', Order.COMPARISON],
    };
    const op = block.getFieldValue('OP');
    const [operator, order] = opMap[op] ?? ['==', Order.COMPARISON];
    const arg0 = g.valueToCode(block, 'A', order) || '0';
    const arg1 = g.valueToCode(block, 'B', order) || '0';
    return [`${arg0} ${operator} ${arg1}`, order];
  };

  gen.forBlock['logic_operation'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const op = block.getFieldValue('OP') === 'AND' ? 'and' : 'or';
    const order = op === 'and' ? Order.LOGICAL_AND : Order.LOGICAL_OR;
    const arg0 = g.valueToCode(block, 'A', order) || 'False';
    const arg1 = g.valueToCode(block, 'B', order) || 'False';
    return [`${arg0} ${op} ${arg1}`, order];
  };

  gen.forBlock['logic_negate'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const arg = g.valueToCode(block, 'BOOL', Order.LOGICAL_NOT) || 'False';
    return [`not ${arg}`, Order.LOGICAL_NOT];
  };

  gen.forBlock['logic_boolean'] = function (block: Blockly.Block): [string, Order] {
    return [block.getFieldValue('BOOL') === 'TRUE' ? 'True' : 'False', Order.ATOMIC];
  };

  gen.forBlock['logic_null'] = function (): [string, Order] {
    return ['None', Order.ATOMIC];
  };

  gen.forBlock['logic_ternary'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const cond = g.valueToCode(block, 'IF', Order.CONDITIONAL) || 'False';
    const then = g.valueToCode(block, 'THEN', Order.CONDITIONAL) || 'None';
    const els = g.valueToCode(block, 'ELSE', Order.CONDITIONAL) || 'None';
    return [`${then} if ${cond} else ${els}`, Order.CONDITIONAL];
  };
}
