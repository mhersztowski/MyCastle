import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

/**
 * Get raw numeric string from an IDX input.
 * Handles both math_number and legacy text shadows (old workspaces).
 */
function getIdxRaw(block: Blockly.Block, idxInput: string, fallback: string): string {
  const connected = block.getInputTargetBlock(idxInput);
  if (connected) {
    if (connected.type === 'math_number') return String(connected.getFieldValue('NUM') ?? fallback);
    if (connected.type === 'text') return connected.getFieldValue('TEXT') ?? fallback;
  }
  return fallback;
}

/** Compute Python index expression for position-mode blocks. 0-based input → direct Python index. */
function resolveIndex(
  g: UPythonGenerator,
  block: Blockly.Block,
  modeField: string,
  idxInput: string,
  listCode: string,
): string {
  const mode = block.getFieldValue(modeField);
  switch (mode) {
    case 'FROM_START': {
      // Use getIdxRaw so legacy text shadows ('0') work correctly
      const connected = block.getInputTargetBlock(idxInput);
      if (!connected || connected.type === 'math_number' || connected.type === 'text') {
        return getIdxRaw(block, idxInput, '0');
      }
      return g.valueToCode(block, idxInput, Order.NONE) || '0';
    }
    case 'FROM_END': {
      const connected = block.getInputTargetBlock(idxInput);
      let idx: string;
      if (!connected || connected.type === 'math_number' || connected.type === 'text') {
        idx = getIdxRaw(block, idxInput, '1');
      } else {
        idx = g.valueToCode(block, idxInput, Order.NONE) || '1';
      }
      const n = parseInt(idx, 10);
      return isNaN(n) ? `-${idx}` : String(-n);
    }
    case 'FIRST':
      return '0';
    case 'LAST':
      return '-1';
    case 'RANDOM':
      g.addImport('random', 'import random');
      return `int(random.random() * len(${listCode}))`;
    default:
      return g.valueToCode(block, idxInput, Order.NONE) || '0';
  }
}

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

export function registerListGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_list_create_empty'] = function (): [string, Order] {
    return ['[]', Order.ATOMIC];
  };

  gen.forBlock['upy_list_repeat'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const item = g.valueToCode(block, 'ITEM', Order.NONE) || 'None';
    const times = g.valueToCode(block, 'TIMES', Order.NONE) || '0';
    return [`[${item}] * ${times}`, Order.MULTIPLY];
  };

  gen.forBlock['upy_list_length'] = function (block: Blockly.Block): [string, Order] {
    const list = getVarName(block, 'LIST');
    return [`len(${list})`, Order.ATOMIC];
  };

  gen.forBlock['upy_list_is_empty'] = function (block: Blockly.Block): [string, Order] {
    const list = getVarName(block, 'LIST');
    return [`not len(${list})`, Order.UNARY];
  };

  gen.forBlock['upy_list_find'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const list = getVarName(block, 'LIST');
    const item = g.valueToCode(block, 'ITEM', Order.NONE) || 'None';
    const findType = block.getFieldValue('FIND_TYPE');
    if (findType === 'FIRST') {
      g.addFunction(
        'list_first_index',
        'def first_index(my_list, elem):\n    try: return my_list.index(elem)\n    except: return -1\n',
      );
      return [`first_index(${list}, ${item})`, Order.ATOMIC];
    } else {
      g.addFunction(
        'list_last_index',
        'def last_index(my_list, elem):\n    try: return len(my_list) - my_list[::-1].index(elem) - 1\n    except: return -1\n',
      );
      return [`last_index(${list}, ${item})`, Order.ATOMIC];
    }
  };

  gen.forBlock['upy_list_get'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const list = getVarName(block, 'LIST');
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX', list);
    return [`${list}[${idxCode}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_list_get_remove'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const list = getVarName(block, 'LIST');
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX', list);
    return [`${list}.pop(${idxCode})`, Order.ATOMIC];
  };

  gen.forBlock['upy_list_remove'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const list = getVarName(block, 'LIST');
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX', list);
    return `${list}.pop(${idxCode})\n`;
  };

  gen.forBlock['upy_list_set'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const list = getVarName(block, 'LIST');
    const value = g.valueToCode(block, 'VALUE', Order.NONE) || 'None';
    const mode = block.getFieldValue('MODE');
    if (mode === 'RANDOM') {
      g.addImport('random', 'import random');
      return (
        `tmp_x = int(random.random() * len(${list}))\n` +
        `${list}[tmp_x] = ${value}\n`
      );
    }
    const idxCode = resolveIndex(g, block, 'MODE', 'IDX', list);
    return `${list}[${idxCode}] = ${value}\n`;
  };

  gen.forBlock['upy_list_sublist'] = function (
    block: Blockly.Block,
  ): [string, Order] {
    const list = getVarName(block, 'LIST');
    const fromMode = block.getFieldValue('FROM_MODE');
    const toMode = block.getFieldValue('TO_MODE');

    // Slice start — 0-based direct index
    let fromCode = '';
    switch (fromMode) {
      case 'FROM_START': {
        const idx = getIdxRaw(block, 'FROM_IDX', '0');
        fromCode = idx === '0' ? '' : idx; // omit leading 0
        break;
      }
      case 'FROM_END': {
        const idx = getIdxRaw(block, 'FROM_IDX', '1');
        const n = parseInt(idx, 10);
        fromCode = isNaN(n) ? `-${idx}` : String(-n);
        break;
      }
      case 'FIRST':
        fromCode = '';
        break;
      case 'LAST':
        fromCode = '-1';
        break;
    }

    // Slice end — 0-based exclusive end (Python slice notation)
    let toCode = '';
    switch (toMode) {
      case 'FROM_START': {
        const idx = getIdxRaw(block, 'TO_IDX', '0');
        toCode = idx;
        break;
      }
      case 'FROM_END': {
        const idx = getIdxRaw(block, 'TO_IDX', '1');
        const n = parseInt(idx, 10);
        const end = isNaN(n) ? `-${idx} + 1` : String(-n + 1);
        toCode = end === '0' ? '' : end;
        break;
      }
      case 'FIRST':
        toCode = '1';
        break;
      case 'LAST':
        toCode = '';
        break;
    }

    return [`${list}[${fromCode}:${toCode}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_list_from_text'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    const delim = g.valueToCode(block, 'DELIM', Order.NONE) || "','";
    return [`(${text}).split(${delim})`, Order.ATOMIC];
  };

  gen.forBlock['upy_list_to_text'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const list = getVarName(block, 'LIST');
    const delim = g.valueToCode(block, 'DELIM', Order.NONE) || "','";
    return [`${delim}.join(${list})`, Order.ATOMIC];
  };
}
