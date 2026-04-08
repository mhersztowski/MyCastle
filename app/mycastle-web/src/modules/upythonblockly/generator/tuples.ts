import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

/** Get raw numeric string from an IDX input, handling both math_number and legacy text shadows. */
function getIdxRaw(block: Blockly.Block, idxInput: string, fallback: string): string {
  const connected = block.getInputTargetBlock(idxInput);
  if (connected) {
    if (connected.type === 'math_number') return String(connected.getFieldValue('NUM') ?? fallback);
    if (connected.type === 'text') return connected.getFieldValue('TEXT') ?? fallback;
  }
  return fallback;
}

function resolveIndex(
  g: UPythonGenerator,
  block: Blockly.Block,
  modeField: string,
  idxInput: string,
): string {
  const mode = block.getFieldValue(modeField);
  const connected = block.getInputTargetBlock(idxInput);
  const isPrimitive = !connected || connected.type === 'math_number' || connected.type === 'text';
  switch (mode) {
    case 'FROM_START': {
      const idx = isPrimitive ? getIdxRaw(block, idxInput, '1') : (g.valueToCode(block, idxInput, Order.NONE) || '1');
      const n = parseInt(idx, 10);
      return isNaN(n) ? `${idx} - 1` : String(n - 1);
    }
    case 'FROM_END': {
      const idx = isPrimitive ? getIdxRaw(block, idxInput, '1') : (g.valueToCode(block, idxInput, Order.NONE) || '1');
      const n = parseInt(idx, 10);
      return isNaN(n) ? `-${idx}` : String(-n);
    }
    case 'FIRST':
      return '0';
    case 'LAST':
      return '-1';
    default:
      return '0';
  }
}

export function registerTupleGenerators(gen: UPythonGenerator): void {
  /** create tuple with — uses same itemCount_ pattern as lists_create_with */
  gen.forBlock['upy_tuple_create_with'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      items.push(g.valueToCode(block, `ADD${i}`, Order.NONE) || 'None');
    }
    if (count === 0) return ['()', Order.ATOMIC];
    if (count === 1) return [`(${items[0]},)`, Order.COLLECTION];
    return [`(${items.join(', ')})`, Order.ATOMIC];
  };

  gen.forBlock['upy_tuple_length'] = function (block: Blockly.Block): [string, Order] {
    const tuple = getVarName(block, 'TUPLE');
    return [`len(${tuple})`, Order.ATOMIC];
  };

  gen.forBlock['upy_tuple_get'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const tuple = getVarName(block, 'TUPLE');
    const mode = block.getFieldValue('MODE');
    if (mode === 'RANDOM') {
      g.addImport('random', 'import random');
      return [`random.choice(${tuple})`, Order.ATOMIC];
    }
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX');
    return [`${tuple}[${idxCode}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_tuple_find'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const tuple = getVarName(block, 'TUPLE');
    const item = g.valueToCode(block, 'ITEM', Order.NONE) || 'None';
    return [`${item} in ${tuple}`, Order.COMPARISON];
  };
}
