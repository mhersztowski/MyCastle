import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import * as Blockly from 'blockly';

// MjdBlocklyEditor — build the MJD data document (a JSON object) graphically with
// Blockly blocks. It edits the SAME value as the Form/Visual views (round-trips
// through plain JSON), so switching modes keeps everything in sync.
//
// Block set covers every JSON construct: object, member (key→value), array,
// element, string, number, boolean, null. Value blocks share the 'json' output
// type so any value can plug into any slot.

let blocksDefined = false;
function ensureBlocks() {
  if (blocksDefined) return;
  blocksDefined = true;
  Blockly.defineBlocksWithJsonArray([
    { type: 'json_object', message0: 'object %1 %2', args0: [
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'MEMBERS', check: 'json_member' },
    ], output: 'json', colour: 230, tooltip: 'JSON object' },
    { type: 'json_member', message0: 'key %1 value %2', args0: [
      { type: 'field_input', name: 'KEY', text: 'key' },
      { type: 'input_value', name: 'VALUE', check: 'json' },
    ], previousStatement: 'json_member', nextStatement: 'json_member', colour: 230, inputsInline: true, tooltip: 'Object property' },
    { type: 'json_array', message0: 'array %1 %2', args0: [
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'ELEMENTS', check: 'json_element' },
    ], output: 'json', colour: 160, tooltip: 'JSON array' },
    { type: 'json_element', message0: 'item %1', args0: [
      { type: 'input_value', name: 'VALUE', check: 'json' },
    ], previousStatement: 'json_element', nextStatement: 'json_element', colour: 160, inputsInline: true, tooltip: 'Array element' },
    { type: 'json_string', message0: 'text %1', args0: [
      { type: 'field_input', name: 'VALUE', text: '' },
    ], output: 'json', colour: 60, tooltip: 'String value' },
    { type: 'json_number', message0: 'number %1', args0: [
      { type: 'field_number', name: 'VALUE', value: 0 },
    ], output: 'json', colour: 210, tooltip: 'Number value' },
    { type: 'json_boolean', message0: '%1', args0: [
      { type: 'field_dropdown', name: 'VALUE', options: [['true', 'TRUE'], ['false', 'FALSE']] },
    ], output: 'json', colour: 120, tooltip: 'Boolean value' },
    { type: 'json_null', message0: 'null', output: 'json', colour: 0, tooltip: 'Null value' },
  ]);
}

const TOOLBOX = {
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'block', type: 'json_object' },
    { kind: 'block', type: 'json_member' },
    { kind: 'block', type: 'json_array' },
    { kind: 'block', type: 'json_element' },
    { kind: 'block', type: 'json_string' },
    { kind: 'block', type: 'json_number' },
    { kind: 'block', type: 'json_boolean' },
    { kind: 'block', type: 'json_null' },
  ],
};

// ── value → Blockly serialization state ─────────────────────────────────────
type BState = { type: string; fields?: Record<string, unknown>; inputs?: Record<string, { block: BState }>; next?: { block: BState } };

function chain(items: BState[]): BState | null {
  if (!items.length) return null;
  for (let i = 0; i < items.length - 1; i++) items[i].next = { block: items[i + 1] };
  return items[0];
}

function valueToBlock(v: unknown): BState {
  if (v === null || v === undefined) return { type: 'json_null' };
  if (typeof v === 'string') return { type: 'json_string', fields: { VALUE: v } };
  if (typeof v === 'number') return { type: 'json_number', fields: { VALUE: v } };
  if (typeof v === 'boolean') return { type: 'json_boolean', fields: { VALUE: v ? 'TRUE' : 'FALSE' } };
  if (Array.isArray(v)) {
    const els = v.map((item) => ({ type: 'json_element', inputs: { VALUE: { block: valueToBlock(item) } } } as BState));
    const head = chain(els);
    return { type: 'json_array', ...(head ? { inputs: { ELEMENTS: { block: head } } } : {}) };
  }
  const members = Object.entries(v as Record<string, unknown>).map(([k, val]) => ({
    type: 'json_member', fields: { KEY: k }, inputs: { VALUE: { block: valueToBlock(val) } },
  } as BState));
  const head = chain(members);
  return { type: 'json_object', ...(head ? { inputs: { MEMBERS: { block: head } } } : {}) };
}

// ── Blockly block → value ───────────────────────────────────────────────────
function blockToValue(block: Blockly.Block): unknown {
  switch (block.type) {
    case 'json_string': return block.getFieldValue('VALUE') ?? '';
    case 'json_number': return Number(block.getFieldValue('VALUE') ?? 0);
    case 'json_boolean': return block.getFieldValue('VALUE') === 'TRUE';
    case 'json_null': return null;
    case 'json_array': {
      const arr: unknown[] = [];
      let el = block.getInputTargetBlock('ELEMENTS');
      while (el) {
        if (el.type === 'json_element') {
          const vb = el.getInputTargetBlock('VALUE');
          arr.push(vb ? blockToValue(vb) : null);
        }
        el = el.getNextBlock();
      }
      return arr;
    }
    case 'json_object':
    default: {
      const obj: Record<string, unknown> = {};
      let m = block.getInputTargetBlock('MEMBERS');
      while (m) {
        if (m.type === 'json_member') {
          const key = (m.getFieldValue('KEY') || '').trim();
          const vb = m.getInputTargetBlock('VALUE');
          if (key) obj[key] = vb ? blockToValue(vb) : null;
        }
        m = m.getNextBlock();
      }
      return obj;
    }
  }
}

interface Props {
  value: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

export function MjdBlocklyEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The initial document is captured once; we deliberately don't re-seed on
  // every `value` change to avoid clobbering the workspace mid-edit (the parent
  // shares `value`, so our own edits would otherwise reload and reset blocks).
  const initialRef = useRef(value);

  useEffect(() => {
    ensureBlocks();
    const container = containerRef.current;
    if (!container) return;
    const workspace = Blockly.inject(container, {
      toolbox: TOOLBOX,
      trashcan: true,
      scrollbars: true,
      renderer: 'thrasos',
    });

    let loading = true;
    const state = {
      blocks: { languageVersion: 0, blocks: [{ ...valueToBlock(initialRef.current ?? {}), x: 24, y: 24 }] },
    };
    try { (Blockly as unknown as { serialization: { workspaces: { load: (s: unknown, w: Blockly.Workspace) => void } } }).serialization.workspaces.load(state, workspace); }
    catch { /* malformed initial value — start empty */ }
    loading = false;

    requestAnimationFrame(() => Blockly.svgResize(workspace));
    setTimeout(() => Blockly.svgResize(workspace), 200);

    const emit = () => {
      const top = workspace.getTopBlocks(false).find((b) => b.type === 'json_object');
      const out = top ? blockToValue(top) : {};
      onChangeRef.current((out && typeof out === 'object' && !Array.isArray(out)) ? out as Record<string, unknown> : {});
    };

    const listener = (e: Blockly.Events.Abstract) => {
      if (loading) return;
      if ((e as { isUiEvent?: boolean }).isUiEvent) return;
      emit();
    };
    workspace.addChangeListener(listener);

    const ro = new ResizeObserver(() => Blockly.svgResize(workspace));
    ro.observe(container);

    return () => {
      ro.disconnect();
      workspace.removeChangeListener(listener);
      workspace.dispose();
    };
    // Mount once per mode-switch; value is intentionally read via initialRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Box ref={containerRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }} />;
}

export default MjdBlocklyEditor;
