import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerLoopsGenerators(gen: UPythonGenerator): void {
  gen.forBlock['controls_repeat_ext'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const times = g.valueToCode(block, 'TIMES', Order.NONE) || '10';
    const body = g.statementToCode(block, 'DO') || g.INDENT + 'pass\n';
    return `for _ in range(${times}):\n${body}`;
  };

  gen.forBlock['controls_whileUntil'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const until = block.getFieldValue('MODE') === 'UNTIL';
    let cond = g.valueToCode(block, 'BOOL', Order.LOGICAL_NOT) || 'False';
    if (until) cond = `not ${cond}`;
    const body = g.statementToCode(block, 'DO') || g.INDENT + 'pass\n';
    return `while ${cond}:\n${body}`;
  };

  gen.forBlock['controls_for'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    const from = g.valueToCode(block, 'FROM', Order.NONE) || '0';
    const to = g.valueToCode(block, 'TO', Order.NONE) || '10';
    const by = g.valueToCode(block, 'BY', Order.NONE) || '1';
    const body = g.statementToCode(block, 'DO') || g.INDENT + 'pass\n';
    // Include end value by using to+1 only when by is positive and literal
    const rangeArgs = by === '1' ? `${from}, ${to} + 1` : `${from}, ${to} + 1, ${by}`;
    return `for ${varName} in range(${rangeArgs}):\n${body}`;
  };

  gen.forBlock['controls_flow_statements'] = function (block: Blockly.Block): string {
    return block.getFieldValue('FLOW') === 'BREAK' ? 'break\n' : 'continue\n';
  };
}
