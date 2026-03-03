import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

/**
 * Add machine.Timer import and a module-level None placeholder for the timer variable.
 * The actual Timer(N) instantiation is done inline by upy_timer_new.
 */
function ensureTimer(g: UPythonGenerator, id: string): void {
  g.addImport('machine.Timer', 'from machine import Timer');
  g.addInit(`timer_${id}`, `_timer${id} = None`);
}

export function registerTimerGenerators(gen: UPythonGenerator): void {
  /**
   * Create a new Timer object inline (placed where the block is in the code flow).
   * Also registers the module-level None placeholder and the import.
   */
  gen.forBlock['upy_timer_new'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    ensureTimer(g, id);
    return `_timer${id} = Timer(${id})\n`;
  };

  /**
   * Initialize the timer with mode and period, wiring up the auto-named callback.
   * The callback function _timerN_cb must be defined via the upy_timer_callback block.
   */
  gen.forBlock['upy_timer_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const mode = block.getFieldValue('MODE');
    const period = g.valueToCode(block, 'PERIOD', Order.NONE) || '1000';
    ensureTimer(g, id);
    return `_timer${id}.init(mode=Timer.${mode}, period=${period}, callback=_timer${id}_cb)\n`;
  };

  /**
   * Define the timer callback function.
   * Adds `def _timerN_cb(t): ...` to the user functions section (before setup/loop).
   * Always overwrites so the latest body from the workspace is used.
   */
  gen.forBlock['upy_timer_callback'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    ensureTimer(g, id);

    const body = g.statementToCode(block, 'BODY') || (g.INDENT + 'pass\n');
    const funcCode =
      `def _timer${id}_cb(t):\n` +
      `${g.INDENT}global _timer${id}\n` +
      body;

    // Direct assignment so the body always reflects the current workspace state.
    g.userFunctions_[`timer${id}_cb`] = funcCode;
    return '';
  };

  /** Stop and deinitialize a timer. */
  gen.forBlock['upy_timer_deinit'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    ensureTimer(g, id);
    return `_timer${id}.deinit()\n`;
  };
}
