import * as Blockly from 'blockly';
import type { UPythonBoardManager } from '../boards/BoardManager';

const HUE = 60;

export function registerPwmBlocks(boardManager: UPythonBoardManager): void {
  const pins = () => boardManager.selected.pwmPins;

  // ── Advanced blocks (UIFlow2-style, named _pwm_X object) ──────────────────

  /**
   * Initialize PWM with frequency and 10-bit duty cycle.
   * Creates _pwm_X = PWM(Pin(x), freq=..., duty=...) at module level.
   */
  Blockly.Blocks['upy_pwm_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('FREQ')
        .appendField('Init Pin')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('freq')
        .setCheck('Number');
      this.appendValueInput('DUTY')
        .appendField('Hz (1~40000000) duty')
        .setCheck('Number');
      this.appendDummyInput().appendField('(0~1023)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Initialize PWM on a pin with frequency (Hz) and 10-bit duty cycle (0–1023). ' +
        'Must be called before using other PWM blocks for this pin.',
      );
    },
  };

  /** Read current 10-bit duty cycle: pwm.duty() → 0–1023 */
  Blockly.Blocks['upy_pwm_get_duty'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('get PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('duty');
      this.setOutput(true, 'Number');
      this.setTooltip('Read current 10-bit duty cycle (0–1023): pwm.duty()');
    },
  };

  /** Read current duty cycle as 16-bit: pwm.duty_u16() → 0–65535 */
  Blockly.Blocks['upy_pwm_get_duty_u16'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('get PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('duty u16');
      this.setOutput(true, 'Number');
      this.setTooltip('Read current duty cycle as 16-bit (0–65535): pwm.duty_u16()');
    },
  };

  /** Read current PWM frequency: pwm.freq() → Hz */
  Blockly.Blocks['upy_pwm_get_freq'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('get PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('freq');
      this.setOutput(true, 'Number');
      this.setTooltip('Read current PWM frequency in Hz: pwm.freq()');
    },
  };

  /** Set 16-bit duty cycle: pwm.duty_u16(value) — 0–65535 */
  Blockly.Blocks['upy_pwm_set_duty_u16'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('DUTY')
        .appendField('Set PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('duty u16')
        .setCheck('Number');
      this.appendDummyInput().appendField('(0~65535)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set PWM duty cycle as 16-bit value (0–65535): pwm.duty_u16(value)');
    },
  };

  // ── Simple / legacy blocks (kept for backward compatibility) ─────────────

  /** Set 10-bit duty cycle: pwm.duty(value) — 0–1023 */
  Blockly.Blocks['upy_pwm_duty'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('DUTY')
        .appendField('Set PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('duty')
        .setCheck('Number');
      this.appendDummyInput().appendField('(0~1023)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set PWM 10-bit duty cycle (0–1023): pwm.duty(value)');
    },
  };

  /** Set PWM frequency */
  Blockly.Blocks['upy_pwm_freq'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('FREQ')
        .appendField('Set PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('freq')
        .setCheck('Number');
      this.appendDummyInput().appendField('Hz (1~40000000)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set PWM frequency in Hz: pwm.freq(value)');
    },
  };

  /** Stop PWM on a pin */
  Blockly.Blocks['upy_pwm_deinit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('PWM')
        .appendField(new Blockly.FieldDropdown(pins), 'PIN')
        .appendField('deinit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Stop (deinitialize) PWM on a pin: pwm.deinit()');
    },
  };
}
