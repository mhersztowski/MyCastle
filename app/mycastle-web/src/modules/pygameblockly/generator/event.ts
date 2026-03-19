import type * as Blockly from 'blockly';
import type { PygameGenerator } from './PygameGenerator';

export function registerEventGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_setup'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const body = g.statementToCode(block, 'DO');
    g.setup_stmts_['_main'] = body;
    return '';
  };

  gen.forBlock['pg_loop'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const body = g.statementToCode(block, 'DO');
    g.loop_stmts_['_main'] = body;
    return '';
  };
}
