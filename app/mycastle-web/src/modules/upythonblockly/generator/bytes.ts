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

/** Convert 1-based user input to 0-based Python index. For numeric literals, computes directly. */
function oneBased(idx: string): string {
  const n = parseInt(idx, 10);
  return isNaN(n) ? `${idx} - 1` : String(n - 1);
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
      return oneBased(idx);
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

function resolveSliceStart(
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
      const result = oneBased(idx);
      return result === '0' ? '' : result;
    }
    case 'FROM_END': {
      const idx = isPrimitive ? getIdxRaw(block, idxInput, '1') : (g.valueToCode(block, idxInput, Order.NONE) || '1');
      const n = parseInt(idx, 10);
      return isNaN(n) ? `-${idx}` : String(-n);
    }
    case 'FIRST':
      return '';
    case 'LAST':
      return '-1';
    default:
      return '';
  }
}

function resolveSliceEnd(
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
      return isNaN(n) ? `${idx}` : String(n);
    }
    case 'FROM_END': {
      const idx = isPrimitive ? getIdxRaw(block, idxInput, '1') : (g.valueToCode(block, idxInput, Order.NONE) || '1');
      const n = parseInt(idx, 10);
      return isNaN(n) ? `-${idx} + 1` : String(-n + 1) === '0' ? '' : String(-n + 1);
    }
    case 'FIRST':
      return '1';
    case 'LAST':
      return '';
    default:
      return '';
  }
}

export function registerBytesGenerators(gen: UPythonGenerator): void {
  /** create bytes with — uses itemCount_ from lists_create_with mutator */
  gen.forBlock['upy_bytes_create'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const count = (block as Blockly.Block & { itemCount_?: number }).itemCount_ ?? 0;
    const items: string[] = [];
    for (let i = 0; i < count; i++) {
      items.push(g.valueToCode(block, `ADD${i}`, Order.NONE) || '0');
    }
    return [`bytes([${items.join(', ')}])`, Order.ATOMIC];
  };

  gen.forBlock['upy_bytes_get'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const bytes = getVarName(block, 'BYTES');
    if (block.getFieldValue('MODE') === 'RANDOM') {
      g.addImport('random', 'import random');
      return [`${bytes}[int(random.random() * len(${bytes}))]`, Order.ATOMIC];
    }
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX');
    return [`${bytes}[${idxCode}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_bytes_remove'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const bytes = getVarName(block, 'BYTES');
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX');
    return `${bytes}.pop(${idxCode})\n`;
  };

  gen.forBlock['upy_bytes_sublist'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const bytes = getVarName(block, 'BYTES');
    const fromCode = resolveSliceStart(g, block, 'FROM_MODE', 'FROM_IDX');
    const toCode = resolveSliceEnd(g, block, 'TO_MODE', 'TO_IDX');
    return [`${bytes}[${fromCode}:${toCode}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_bytes_decode'] = function (
    block: Blockly.Block,
  ): [string, Order] {
    const bytes = getVarName(block, 'BYTES');
    const encoding = block.getFieldValue('ENCODING');
    return [`${bytes}.decode('${encoding}')`, Order.ATOMIC];
  };
}
