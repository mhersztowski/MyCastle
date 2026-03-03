import * as Blockly from 'blockly';

const HUE = 140;

const TIMER_IDS: [string, string][] = [
  ['timer0', '0'],
  ['timer1', '1'],
  ['timer2', '2'],
  ['timer3', '3'],
];

const MODE_OPTIONS: Blockly.MenuGenerator = [
  ['PERIODIC', 'PERIODIC'],
  ['ONE_SHOT', 'ONE_SHOT'],
];

export function registerTimerBlocks(): void {
  /**
   * Create a new Timer object: _timerN = Timer(N)
   * Placed as an inline statement (matches UIFlow2 style where Timer() is called in setup).
   */
  Blockly.Blocks['upy_timer_new'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('New')
        .appendField(new Blockly.FieldDropdown(TIMER_IDS), 'ID');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Create a new Timer object: _timerN = Timer(N)');
    },
  };

  /**
   * Initialize a timer with mode and period, referencing the auto-named callback.
   * The matching "callback" block must also be placed to define the callback function.
   */
  Blockly.Blocks['upy_timer_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('PERIOD')
        .appendField(new Blockly.FieldDropdown(TIMER_IDS), 'ID')
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE')
        .appendField('period')
        .setCheck('Number');
      this.appendDummyInput().appendField('milliseconds');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Initialize timer with mode (PERIODIC/ONE_SHOT) and period in ms. ' +
        'Links to the matching callback block: timer.init(mode=..., period=..., callback=_timerN_cb)',
      );
    },
  };

  /**
   * Define the timer callback function (C-shaped block).
   * Generates: def _timerN_cb(t): ...
   * Can be placed anywhere on the workspace — always adds to user functions section.
   */
  Blockly.Blocks['upy_timer_callback'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendStatementInput('BODY')
        .appendField(new Blockly.FieldDropdown(TIMER_IDS), 'ID')
        .appendField('callback');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Define the callback function for a timer. ' +
        'Called automatically when the timer fires. ' +
        'Generates: def _timerN_cb(t): ...',
      );
    },
  };

  /** Stop a timer: timer.deinit() */
  Blockly.Blocks['upy_timer_deinit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(TIMER_IDS), 'ID')
        .appendField('deinit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Stop and deinitialize a timer: timer.deinit()');
    },
  };
}
