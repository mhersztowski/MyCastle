import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

/** Add import + lazy module-level init for a named _pin_X object. */
function ensurePin(g: UPythonGenerator, pin: string, mode: string): void {
  g.addImport('machine.Pin', 'from machine import Pin');
  g.addInit(`_pin_${pin}`, `_pin_${pin} = Pin(${pin}, Pin.${mode})`);
}

export function registerPinGenerators(gen: UPythonGenerator): void {
  // ── Simple blocks (separate _pin_out_X / _pin_in_X objects) ───────────────

  gen.forBlock['upy_pin_write'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    g.addImport('machine.Pin', 'from machine import Pin');
    g.addInit(`pin_out_${pin}`, `_pin_out_${pin} = Pin(${pin}, Pin.OUT)`);
    return `_pin_out_${pin}.value(${val})\n`;
  };

  gen.forBlock['upy_pin_read'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const pin = block.getFieldValue('PIN');
    g.addImport('machine.Pin', 'from machine import Pin');
    g.addInit(`pin_in_${pin}`, `_pin_in_${pin} = Pin(${pin}, Pin.IN)`);
    return [`_pin_in_${pin}.value()`, Order.ATOMIC];
  };

  gen.forBlock['upy_pin_toggle'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    g.addImport('machine.Pin', 'from machine import Pin');
    g.addInit(`pin_out_${pin}`, `_pin_out_${pin} = Pin(${pin}, Pin.OUT)`);
    return `_pin_out_${pin}.toggle()\n`;
  };

  gen.forBlock['upy_builtin_led'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const led = block.getFieldValue('LED');
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    g.addImport('machine.Pin', 'from machine import Pin');
    g.addInit(`pin_led_${led}`, `_led_${led} = Pin(${led}, Pin.OUT)`);
    return `_led_${led}.value(${val})\n`;
  };

  gen.forBlock['upy_highlow'] = function (block: Blockly.Block): [string, Order] {
    return [block.getFieldValue('STATE'), Order.ATOMIC];
  };

  // ── Advanced blocks (UIFlow2-style, named _pin_X object) ──────────────────

  /**
   * Initialize a named pin object with mode and optional pull resistor.
   * Placed at module level via addInit (overwrite=true replaces any lazy default).
   */
  gen.forBlock['upy_pin_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const mode = block.getFieldValue('MODE');
    const pull = block.getFieldValue('PULL');
    g.addImport('machine.Pin', 'from machine import Pin');
    const pullStr = pull === 'NONE' ? '' : `, pull=Pin.${pull}`;
    g.addInit(`_pin_${pin}`, `_pin_${pin} = Pin(${pin}, mode=Pin.${mode}${pullStr})`, true);
    return '';
  };

  gen.forBlock['upy_pin_on'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    ensurePin(g, pin, 'OUT');
    return `_pin_${pin}.on()\n`;
  };

  gen.forBlock['upy_pin_off'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    ensurePin(g, pin, 'OUT');
    return `_pin_${pin}.off()\n`;
  };

  gen.forBlock['upy_pin_get_value'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensurePin(g, pin, 'IN');
    return [`_pin_${pin}.value()`, Order.ATOMIC];
  };

  gen.forBlock['upy_pin_set_value'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const pin = block.getFieldValue('PIN');
    const val = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    ensurePin(g, pin, 'OUT');
    return `_pin_${pin}.value(${val})\n`;
  };

  /** Unused-pin sentinel: -1 (MicroPython convention for "no pin") */
  gen.forBlock['upy_pin_unused'] = function (): [string, Order] {
    return ['-1', Order.UNARY];
  };
}
