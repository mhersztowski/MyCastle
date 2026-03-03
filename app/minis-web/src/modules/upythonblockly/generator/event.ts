import type * as Blockly from 'blockly';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerEventGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_start'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const body = g.statementToCode(block, 'DO');
    g.setup_stmts_['_start'] = body;
    return '';
  };

  gen.forBlock['upy_forever'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const body = g.statementToCode(block, 'DO');
    g.forever_stmts_['_forever'] = body;
    return '';
  };
}
