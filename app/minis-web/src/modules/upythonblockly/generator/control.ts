import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerControlGenerators(gen: UPythonGenerator): void {
  // ── for var in range(n) ────────────────────────────────────────────────────

  gen.forBlock['upy_for_in_range'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    g.variables_.add(varName);
    const times = g.valueToCode(block, 'TIMES', Order.NONE) || '10';
    const body = g.statementToCode(block, 'DO') || g.INDENT + 'pass\n';
    return `for ${varName} in range(${times}):\n${body}`;
  };

  // ── for each item in list (built-in Blockly block) ─────────────────────────

  gen.forBlock['controls_forEach'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    g.variables_.add(varName);
    const list = g.valueToCode(block, 'LIST', Order.NONE) || '[]';
    const body = g.statementToCode(block, 'DO') || g.INDENT + 'pass\n';
    return `for ${varName} in ${list}:\n${body}`;
  };

  // ── try / except ───────────────────────────────────────────────────────────

  gen.forBlock['upy_try_except'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const tryBody = g.statementToCode(block, 'TRY') || g.INDENT + 'pass\n';
    const exceptBody = g.statementToCode(block, 'EXCEPT') || g.INDENT + 'pass\n';
    return `try:\n${tryBody}except:\n${exceptBody}`;
  };

  // ── switch / case → if/elif/else ───────────────────────────────────────────

  gen.forBlock['upy_switch'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const expr = g.valueToCode(block, 'EXPR', Order.NONE) || 'None';
    const count: number = (block as any).itemCount_ ?? 1;
    let code = '';
    for (let i = 0; i < count; i++) {
      const caseVal = g.valueToCode(block, `CASE${i}`, Order.COMPARISON) || 'None';
      const caseBody = g.statementToCode(block, `DO${i}`) || g.INDENT + 'pass\n';
      code += i === 0
        ? `if ${expr} == ${caseVal}:\n${caseBody}`
        : `elif ${expr} == ${caseVal}:\n${caseBody}`;
    }
    const defaultBody = g.statementToCode(block, 'DEFAULT') || g.INDENT + 'pass\n';
    code += `else:\n${defaultBody}`;
    return code;
  };

  // ── when variable changes ──────────────────────────────────────────────────

  gen.forBlock['upy_when_var_changes'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    g.variables_.add(varName);
    // Tracking variable lives at module level, initialised to None
    const trackVar = `_old_${varName}`;
    g.addInit(trackVar, `${trackVar} = None`);
    g.variables_.add(trackVar);
    const doBody = g.statementToCode(block, 'DO') || g.INDENT + 'pass\n';
    const elseBody = g.statementToCode(block, 'ELSE') || g.INDENT + 'pass\n';
    return (
      `if ${varName} != ${trackVar}:\n` +
      `${g.INDENT}${trackVar} = ${varName}\n` +
      doBody +
      `else:\n` +
      elseBody
    );
  };
}
