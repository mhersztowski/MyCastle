import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

/** Register UIFlow2-style variable-based ADC generators. */
export function registerAdcV2Generators(gen: UPythonGenerator): void {
  gen.forBlock['upy_adc2_init'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_adc', 'from hardware import ADC');
    g.addImport('hardware_pin', 'from hardware import Pin');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const pin = g.valueToCode(block, 'PIN', Order.NONE) || '0';
    const atten = block.getFieldValue('ATTEN') as string;
    return `${varName} = ADC(Pin(${pin}), atten=ADC.${atten})\n`;
  };

  gen.forBlock['upy_adc2_read'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    return [`${varName}.read()`, Order.ATOMIC];
  };

  gen.forBlock['upy_adc2_read_u16'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    return [`${varName}.read_u16()`, Order.ATOMIC];
  };

  gen.forBlock['upy_adc2_read_uv'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    return [`${varName}.read_uv()`, Order.ATOMIC];
  };

  gen.forBlock['upy_adc2_atten'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_adc', 'from hardware import ADC');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const atten = block.getFieldValue('ATTEN') as string;
    return `${varName}.atten(ADC.${atten})\n`;
  };

  gen.forBlock['upy_adc2_width'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_adc', 'from hardware import ADC');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const width = block.getFieldValue('WIDTH') as string;
    return `${varName}.width(ADC.${width})\n`;
  };
}

/** Shared helper: add machine.Pin + machine.ADC imports and lazy-init the ADC object. */
function ensureAdc(g: UPythonGenerator, pin: string): void {
  g.addImport('machine.Pin', 'from machine import Pin');
  g.addImport('machine.ADC', 'from machine import ADC');
  // Lazy init without attenuation — overridden if upy_adc_init is used.
  g.addInit(`adc_${pin}`, `_adc_${pin} = ADC(Pin(${pin}))`);
}

export function registerAdcGenerators(gen: UPythonGenerator): void {
  /**
   * Initialize ADC with attenuation.
   * Generates no inline code — the configured ADC object is placed at module level via addInit
   * (with overwrite=true so it replaces the lazy default from read blocks).
   */
  gen.forBlock['upy_adc_init'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const pin = block.getFieldValue('PIN');
    const atten = block.getFieldValue('ATTEN');
    g.addImport('machine.Pin', 'from machine import Pin');
    g.addImport('machine.ADC', 'from machine import ADC');
    g.addInit(`adc_${pin}`, `_adc_${pin} = ADC(Pin(${pin}), atten=ADC.${atten})`, true);
    return '';
  };

  /** Raw read → adc.read() — result depends on width setting (default 0–4095 for 12-bit). */
  gen.forBlock['upy_adc_read'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensureAdc(g, pin);
    return [`_adc_${pin}.read()`, Order.ATOMIC];
  };

  /** Normalised 16-bit read → adc.read_u16() → 0–65535 */
  gen.forBlock['upy_adc_read_u16'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensureAdc(g, pin);
    return [`_adc_${pin}.read_u16()`, Order.ATOMIC];
  };

  /** Microvolts read → adc.read_uv() */
  gen.forBlock['upy_adc_read_uv'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    ensureAdc(g, pin);
    return [`_adc_${pin}.read_uv()`, Order.ATOMIC];
  };

  /** Set bit-width / resolution → adc.width(ADC.WIDTH_xBIT) */
  gen.forBlock['upy_adc_width'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const pin = block.getFieldValue('PIN');
    const width = block.getFieldValue('WIDTH');
    ensureAdc(g, pin);
    return `_adc_${pin}.width(ADC.${width})\n`;
  };

  /** Change attenuation at runtime → adc.atten(ADC.ATTN_xDB) */
  gen.forBlock['upy_adc_atten'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const pin = block.getFieldValue('PIN');
    const atten = block.getFieldValue('ATTEN');
    ensureAdc(g, pin);
    return `_adc_${pin}.atten(ADC.${atten})\n`;
  };
}
