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
    return [`len(${text}) == 0`, Order.COMPARISON];
  };
}
