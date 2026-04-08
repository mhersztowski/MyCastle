import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

/** Register UIFlow2-style variable-based PWM generators. */
export function registerPwmV2Generators(gen: UPythonGenerator): void {
  gen.forBlock['upy_pwm2_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_pwm', 'from hardware import PWM');
    g.addImport('hardware_pin', 'from hardware import Pin');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const pin = g.valueToCode(block, 'PIN', Order.NONE) || '0';
    const freq = g.valueToCode(block, 'FREQ', Order.NONE) || '1000';
    const duty = g.valueToCode(block, 'DUTY', Order.NONE) || '512';
    const dtype = block.getFieldValue('DTYPE') as string;
    const dutyArg = dtype === 'DUTY_U16' ? `duty_u16=${duty}` : `duty=${duty}`;
    return `${varName} = PWM(Pin(${pin}), freq=${freq}, ${dutyArg})\n`;
  };

  gen.forBlock['upy_pwm2_deinit'] = function (block: Blockly.Block): string {
    const varName = getVarName(block, 'VAR');
    return `${varName}.deinit()\n`;
  };

  gen.forBlock['upy_pwm2_get_duty'] = function (
    block: Blockly.Block,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    return [`${varName}.duty()`, Order.ATOMIC];
  };

  gen.forBlock['upy_pwm2_get_duty_u16'] = function (
    block: Blockly.Block,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    return [`${varName}.duty_u16()`, Order.ATOMIC];
  };

  gen.forBlock['upy_pwm2_get_freq'] = function (
    block: Blockly.Block,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    return [`${varName}.freq()`, Order.ATOMIC];
  };

  gen.forBlock['upy_pwm2_set_duty'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const duty = g.valueToCode(block, 'DUTY', Order.NONE) || '0';
    return `${varName}.duty(${duty})\n`;
  };

  gen.forBlock['upy_pwm2_set_duty_u16'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const duty = g.valueToCode(block, 'DUTY', Order.NONE) || '0';
    return `${varName}.duty_u16(${duty})\n`;
  };

  gen.forBlock['upy_pwm2_set_freq'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVarName(block, 'VAR');
    const freq = g.valueToCode(block, 'FREQ', Order.NONE) || '1000';
    return `${varName}.freq(${freq})\n`;
  };
}

/** Add machine.Pin + machine.PWM imports and lazy-init the PWM object. */
function ensurePwm(g: UPythonGenerator, pin: string): void {
  g.addImport('machine.Pin', 'from machine import Pin');
  g.addImport('machine.PWM', 'from machine import PWM');
  // Lazy init without freq/duty — overridden if upy_pwm_init is used.
  g.addInit(`pwm_${pin}`, `_pwm_${pin} = PWM(Pin(${pin}))`);
}

export function registerPwmGenerators(gen: UPythonGenerator): void {
  // ── Advanced blocks (UIFlow2-style, named _pwm_X object) ──────────────────

  /**
   * Initialize PWM with frequency and 10-bit duty cycle.
   * Placed at module level via addInit (overwrite=true replaces any lazy default).
   */
  gen.forBlock['upy_pwm_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const freq = g.valueToCode(block, 'FREQ', Order.NONE) || '1000';
    const duty = g.valueToCode(block, 'DUTY', Order.NONE) || '512';
    g.addImport('machine.Pin', 'from machine import Pin');
    g.addImport('machine.PWM', 'from machine import PWM');
    g.addInit(`pwm_${pin}`, `_pwm_${pin} = PWM(Pin(${pin}), freq=${freq}, duty=${duty})`, true);
    return '';
  };

  /** Read current 10-bit duty cycle: pwm.duty() → 0–1023 */
  gen.forBlock['upy_pwm_get_duty'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensurePwm(g, pin);
    return [`_pwm_${pin}.duty()`, Order.ATOMIC];
  };

  /** Read current duty cycle as 16-bit: pwm.duty_u16() → 0–65535 */
  gen.forBlock['upy_pwm_get_duty_u16'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensurePwm(g, pin);
    return [`_pwm_${pin}.duty_u16()`, Order.ATOMIC];
  };

  /** Read current PWM frequency: pwm.freq() → Hz */
  gen.forBlock['upy_pwm_get_freq'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensurePwm(g, pin);
    return [`_pwm_${pin}.freq()`, Order.ATOMIC];
  };

  /** Set 16-bit duty cycle: pwm.duty_u16(value) — 0–65535 */
  gen.forBlock['upy_pwm_set_duty_u16'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const duty = g.valueToCode(block, 'DUTY', Order.NONE) || '0';
    ensurePwm(g, pin);
    return `_pwm_${pin}.duty_u16(${duty})\n`;
  };

  // ── Simple / legacy blocks (kept for backward compatibility) ─────────────

  /** Set 10-bit duty cycle: pwm.duty(value) — 0–1023 */
  gen.forBlock['upy_pwm_duty'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const duty = g.valueToCode(block, 'DUTY', Order.NONE) || '0';
    ensurePwm(g, pin);
    return `_pwm_${pin}.duty(${duty})\n`;
  };

  /** Set PWM frequency */
  gen.forBlock['upy_pwm_freq'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const freq = g.valueToCode(block, 'FREQ', Order.NONE) || '1000';
    ensurePwm(g, pin);
    return `_pwm_${pin}.freq(${freq})\n`;
  };

  /** Stop PWM on a pin */
  gen.forBlock['upy_pwm_deinit'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    ensurePwm(g, pin);
    return `_pwm_${pin}.deinit()\n`;
  };
}
