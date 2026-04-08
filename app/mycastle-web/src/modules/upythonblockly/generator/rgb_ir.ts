import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

// MicroPython helper injected when HSV mode is used
const HSV_TO_RGB_HELPER = `\
def _hsv_to_rgb(h, s, v):
    s /= 100.0; v /= 100.0
    if s == 0:
        c = int(v * 255)
        return (c << 16) | (c << 8) | c
    h /= 60.0
    i = int(h) % 6
    f = h - int(h)
    p, q, t = v*(1-s), v*(1-s*f), v*(1-s*(1-f))
    r, g, b = [(v,t,p),(q,v,p),(p,v,t),(p,q,v),(t,p,v),(v,p,q)][i]
    return (int(r*255) << 16) | (int(g*255) << 8) | int(b*255)`;

export function registerRgbIrGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_ui_color'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const mode = block.getFieldValue('MODE') as string;
    switch (mode) {
      case 'RGB': {
        const r = block.getFieldValue('R') || '0';
        const gr = block.getFieldValue('G') || '0';
        const b = block.getFieldValue('B') || '0';
        return [`(${r} << 16) | (${gr} << 8) | ${b}`, Order.BITWISE_OR];
      }
      case 'HSV': {
        const h = block.getFieldValue('H') || '0';
        const s = block.getFieldValue('S') || '100';
        const v = block.getFieldValue('V') || '100';
        g.addFunction('_hsv_to_rgb', HSV_TO_RGB_HELPER);
        return [`_hsv_to_rgb(${h}, ${s}, ${v})`, Order.ATOMIC];
      }
      case 'HEX': {
        const hex = (block.getFieldValue('HEX') || 'FF0000').replace(/^#/, '').toUpperCase();
        return [`0x${hex}`, Order.ATOMIC];
      }
      default: { // PALETTE
        const color = block.getFieldValue('COLOR') as string;
        return [color || '0x000000', Order.ATOMIC];
      }
    }
  };

  gen.forBlock['upy_rgb_init'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_rgb', 'from hardware import RGB');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    return `${varName} = RGB()\n`;
  };

  gen.forBlock['upy_rgb_set_color'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const idx = g.valueToCode(block, 'IDX', Order.NONE) || '0';
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '0xff0000';
    return `${varName}.set_color(${idx}, ${color})\n`;
  };

  gen.forBlock['upy_rgb_fill_color'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const color = g.valueToCode(block, 'COLOR', Order.NONE) || '0xff0000';
    return `${varName}.fill_color(${color})\n`;
  };

  gen.forBlock['upy_rgb_set_brightness'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const brightness = g.valueToCode(block, 'BRIGHTNESS', Order.NONE) || '100';
    return `${varName}.set_brightness(${brightness})\n`;
  };

  gen.forBlock['upy_ir_init'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_ir', 'from hardware import IR');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    return `${varName} = IR()\n`;
  };

  gen.forBlock['upy_ir_send'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const addr = g.valueToCode(block, 'ADDR', Order.NONE) || '0';
    const data = g.valueToCode(block, 'DATA', Order.NONE) || '0';
    return `${varName}.tx(${addr}, ${data})\n`;
  };
}
