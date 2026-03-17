import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerTextGenerators(gen: UPythonGenerator): void {
  gen.forBlock['text'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    return [g.quote_(block.getFieldValue('TEXT')), Order.ATOMIC];
  };

  gen.forBlock['text_join'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const n = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
    if (n === 0) return ["''", Order.ATOMIC];
    const parts = Array.from({ length: n }, (_, i) => {
      const piece = g.valueToCode(block, `ADD${i}`, Order.NONE) || "''";
      return `str(${piece})`;
    });
    return [parts.join(' + '), Order.ADDITIVE];
  };

  gen.forBlock['text_append'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `${varName} += str(${text})\n`;
  };

  gen.forBlock['text_length'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const text = g.valueToCode(block, 'VALUE', Order.NONE) || "''";
    return [`len(${text})`, Order.ATOMIC];
  };

  gen.forBlock['text_isEmpty'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const text = g.valueToCode(block, 'VALUE', Order.NONE) || "''";
    return [`not len(${text})`, Order.UNARY];
  };

  // Standard Blockly block: UPPERCASE / LOWERCASE / TITLECASE
  gen.forBlock['text_changeCase'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const op = block.getFieldValue('CASE');
    const text = g.valueToCode(block, 'VALUE', Order.NONE) || "''";
    const method = op === 'UPPERCASE' ? 'upper' : op === 'LOWERCASE' ? 'lower' : 'title';
    return [`(${text}).${method}()`, Order.ATOMIC];
  };

  // --- Custom upy_text_* blocks ---

  gen.forBlock['upy_text_count'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const sub = g.valueToCode(block, 'SUB', Order.NONE) || "''";
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return [`(${text}).count(${sub})`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_index'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    const idx = g.valueToCode(block, 'IDX', Order.NONE) || '0';
    return [`(${text})[${idx}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_replace'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const old_ = g.valueToCode(block, 'OLD', Order.NONE) || "''";
    const new_ = g.valueToCode(block, 'NEW', Order.NONE) || "''";
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return [`(${text}).replace(${old_}, ${new_})`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_trim'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const side = block.getFieldValue('SIDE');
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    const method = side === 'LEFT' ? 'lstrip' : side === 'RIGHT' ? 'rstrip' : 'strip';
    return [`(${text}).${method}()`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_prompt'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const msg = g.valueToCode(block, 'MSG', Order.NONE) || "''";
    g.addFunction(
      'text_prompt',
      'def text_prompt(msg):\n    try:\n        return raw_input(msg)\n    except NameError:\n        return input(msg)\n',
    );
    return [`text_prompt(${msg})`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_to_str'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    return [`str(${value})`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_ord'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const char = g.valueToCode(block, 'CHAR', Order.NONE) || "''";
    return [`ord(${char})`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_decode'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "b''";
    return [`(${text}).decode()`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_encode'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return [`(${text}).encode()`, Order.ATOMIC];
  };

  gen.forBlock['upy_text_format_float'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || '0';
    const decimals = g.valueToCode(block, 'DECIMALS', Order.NONE) || '0';
    return [`f'%.{${decimals}}f' % ${value}`, Order.NONE];
  };

  gen.forBlock['upy_text_to_hex'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const num = g.valueToCode(block, 'NUM', Order.NONE) || '0';
    const width = g.valueToCode(block, 'WIDTH', Order.NONE) || '0';
    const zeros = block.getFieldValue('ZEROS') === 'true';
    const prefix = block.getFieldValue('PREFIX') === 'true';
    const padChar = zeros ? '0' : '';
    const prefixStr = prefix ? '0x' : '';
    return [`f'${prefixStr}{${num}:${padChar}{${width}}X}'`, Order.ATOMIC];
  };
}
