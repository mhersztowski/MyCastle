import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import * as Blockly from 'blockly';

// MySchemaBlocklyEditor — Blockly surface for *.myschema.json: define CLASSES
// and ENUMS graphically, then reference one from another.
//
// Blocks:
//   • class <Name> { fields… }   — a named, self-contained definition block
//   • enum  <Name> { values… }   — a named enum definition block
//   • field <name> : <type>      — a class member; the type is plugged in
//   • type blocks (output 'schema_type'):
//       text default <v> / number default <v> / boolean default <v>
//         → primitive field; the value next to it is the field DEFAULT
//       ref <Name>
//         → the field's type is another class or enum
//
// Serializes to:
//   { "classes": { "Person": { "fields": {
//       "name": { "kind":"text",    "default":"" },
//       "age":  { "kind":"number",  "default":0 },
//       "role": { "kind":"ref",     "ref":"Role" } } } },
//     "enums":   { "Role": { "values": ["admin","user"] } } }

interface SchemaType {
  kind: 'text' | 'number' | 'boolean' | 'ref';
  default?: string | number | boolean;
  ref?: string;
}
interface SchemaValue {
  classes?: Record<string, { fields?: Record<string, SchemaType> }>;
  enums?: Record<string, { values?: unknown[] }>;
}

let blocksDefined = false;
function ensureBlocks() {
  if (blocksDefined) return;
  blocksDefined = true;
  Blockly.defineBlocksWithJsonArray([
    // Top-level definitions (free-floating; no connections).
    { type: 'schema_class', message0: 'class %1', args0: [{ type: 'field_input', name: 'NAME', text: 'MyClass' }],
      message1: 'fields %1', args1: [{ type: 'input_statement', name: 'FIELDS', check: 'schema_field' }],
      colour: 230, tooltip: 'Class definition' },
    { type: 'schema_enum', message0: 'enum %1', args0: [{ type: 'field_input', name: 'NAME', text: 'MyEnum' }],
      message1: 'values %1', args1: [{ type: 'input_statement', name: 'VALUES', check: 'schema_enum_value' }],
      colour: 290, tooltip: 'Enum definition' },
    // Class member: name + a plugged-in type.
    { type: 'schema_field', message0: 'field %1 : %2', args0: [
        { type: 'field_input', name: 'NAME', text: 'field' },
        { type: 'input_value', name: 'TYPE', check: 'schema_type' },
      ], previousStatement: 'schema_field', nextStatement: 'schema_field', colour: 160, inputsInline: true, tooltip: 'Class field' },
    { type: 'schema_enum_value', message0: 'value %1', args0: [{ type: 'field_input', name: 'VALUE', text: 'VALUE' }],
      previousStatement: 'schema_enum_value', nextStatement: 'schema_enum_value', colour: 290, tooltip: 'Enum value' },
    // Types — primitives carry a default; ref points at another class/enum.
    { type: 'type_text', message0: 'text default %1', args0: [{ type: 'field_input', name: 'DEFAULT', text: '' }],
      output: 'schema_type', colour: 60, tooltip: 'Text field — value is the default' },
    { type: 'type_number', message0: 'number default %1', args0: [{ type: 'field_number', name: 'DEFAULT', value: 0 }],
      output: 'schema_type', colour: 210, tooltip: 'Number field — value is the default' },
    { type: 'type_boolean', message0: 'boolean default %1', args0: [{ type: 'field_dropdown', name: 'DEFAULT', options: [['true', 'TRUE'], ['false', 'FALSE']] }],
      output: 'schema_type', colour: 120, tooltip: 'Boolean field — value is the default' },
    { type: 'type_ref', message0: 'ref %1', args0: [{ type: 'field_input', name: 'REF', text: 'OtherType' }],
      output: 'schema_type', colour: 20, tooltip: 'Reference another class or enum by name' },
  ]);
}

const TOOLBOX = {
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'block', type: 'schema_class' },
    { kind: 'block', type: 'schema_enum' },
    { kind: 'block', type: 'schema_field' },
    { kind: 'block', type: 'schema_enum_value' },
    { kind: 'block', type: 'type_text' },
    { kind: 'block', type: 'type_number' },
    { kind: 'block', type: 'type_boolean' },
    { kind: 'block', type: 'type_ref' },
  ],
};

// ── value → Blockly serialization state ─────────────────────────────────────
type BState = { type: string; x?: number; y?: number; fields?: Record<string, unknown>; inputs?: Record<string, { block: BState }>; next?: { block: BState } };

function chain(items: BState[]): BState | null {
  if (!items.length) return null;
  for (let i = 0; i < items.length - 1; i++) items[i].next = { block: items[i + 1] };
  return items[0];
}

function typeToBlock(t: SchemaType | undefined): BState {
  const k = t?.kind ?? 'text';
  if (k === 'number') return { type: 'type_number', fields: { DEFAULT: typeof t?.default === 'number' ? t.default : 0 } };
  if (k === 'boolean') return { type: 'type_boolean', fields: { DEFAULT: t?.default ? 'TRUE' : 'FALSE' } };
  if (k === 'ref') return { type: 'type_ref', fields: { REF: t?.ref ?? '' } };
  return { type: 'type_text', fields: { DEFAULT: t?.default != null ? String(t.default) : '' } };
}

function buildState(value: SchemaValue): { blocks: { languageVersion: number; blocks: BState[] } } {
  const top: BState[] = [];
  let y = 24;
  const classes = value.classes && typeof value.classes === 'object' ? value.classes : {};
  for (const [name, def] of Object.entries(classes)) {
    const fields = def?.fields && typeof def.fields === 'object' ? def.fields : {};
    const fieldBlocks: BState[] = Object.entries(fields).map(([fname, ftype]) => ({
      type: 'schema_field', fields: { NAME: fname }, inputs: { TYPE: { block: typeToBlock(ftype) } },
    }));
    const head = chain(fieldBlocks);
    top.push({ type: 'schema_class', x: 24, y, fields: { NAME: name }, ...(head ? { inputs: { FIELDS: { block: head } } } : {}) });
    y += 80 + fieldBlocks.length * 44;
  }
  let ey = 24;
  const enums = value.enums && typeof value.enums === 'object' ? value.enums : {};
  for (const [name, def] of Object.entries(enums)) {
    const vals = Array.isArray(def?.values) ? def!.values! : [];
    const valBlocks: BState[] = vals.map((v) => ({ type: 'schema_enum_value', fields: { VALUE: String(v) } }));
    const head = chain(valBlocks);
    top.push({ type: 'schema_enum', x: 360, y: ey, fields: { NAME: name }, ...(head ? { inputs: { VALUES: { block: head } } } : {}) });
    ey += 80 + valBlocks.length * 36;
  }
  return { blocks: { languageVersion: 0, blocks: top } };
}

// ── Blockly block → value ───────────────────────────────────────────────────
function typeFromBlock(b: Blockly.Block | null): SchemaType {
  if (!b) return { kind: 'text', default: '' };
  switch (b.type) {
    case 'type_number': return { kind: 'number', default: Number(b.getFieldValue('DEFAULT') ?? 0) };
    case 'type_boolean': return { kind: 'boolean', default: b.getFieldValue('DEFAULT') === 'TRUE' };
    case 'type_ref': return { kind: 'ref', ref: (b.getFieldValue('REF') || '').trim() };
    case 'type_text':
    default: return { kind: 'text', default: b.getFieldValue('DEFAULT') ?? '' };
  }
}

function workspaceToValue(workspace: Blockly.WorkspaceSvg): SchemaValue {
  const classes: NonNullable<SchemaValue['classes']> = {};
  const enums: NonNullable<SchemaValue['enums']> = {};
  for (const top of workspace.getTopBlocks(false)) {
    if (top.type === 'schema_class') {
      const name = (top.getFieldValue('NAME') || '').trim();
      if (!name) continue;
      const fields: Record<string, SchemaType> = {};
      let m = top.getInputTargetBlock('FIELDS');
      while (m) {
        if (m.type === 'schema_field') {
          const fname = (m.getFieldValue('NAME') || '').trim();
          if (fname) fields[fname] = typeFromBlock(m.getInputTargetBlock('TYPE'));
        }
        m = m.getNextBlock();
      }
      classes[name] = { fields };
    } else if (top.type === 'schema_enum') {
      const name = (top.getFieldValue('NAME') || '').trim();
      if (!name) continue;
      const values: unknown[] = [];
      let v = top.getInputTargetBlock('VALUES');
      while (v) {
        if (v.type === 'schema_enum_value') values.push(v.getFieldValue('VALUE') ?? '');
        v = v.getNextBlock();
      }
      enums[name] = { values };
    }
  }
  return { classes, enums };
}

interface Props {
  value: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

export function MySchemaBlocklyEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(value);

  useEffect(() => {
    ensureBlocks();
    const container = containerRef.current;
    if (!container) return;
    const workspace = Blockly.inject(container, { toolbox: TOOLBOX, trashcan: true, scrollbars: true, renderer: 'thrasos' });

    let loading = true;
    try {
      const state = buildState((initialRef.current ?? {}) as SchemaValue);
      (Blockly as unknown as { serialization: { workspaces: { load: (s: unknown, w: Blockly.Workspace) => void } } })
        .serialization.workspaces.load(state, workspace);
    } catch { /* malformed initial value — start empty */ }
    loading = false;

    requestAnimationFrame(() => Blockly.svgResize(workspace));
    setTimeout(() => Blockly.svgResize(workspace), 200);

    const listener = (e: Blockly.Events.Abstract) => {
      if (loading) return;
      if ((e as { isUiEvent?: boolean }).isUiEvent) return;
      onChangeRef.current(workspaceToValue(workspace as Blockly.WorkspaceSvg) as Record<string, unknown>);
    };
    workspace.addChangeListener(listener);

    const ro = new ResizeObserver(() => Blockly.svgResize(workspace));
    ro.observe(container);

    return () => {
      ro.disconnect();
      workspace.removeChangeListener(listener);
      workspace.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Box ref={containerRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }} />;
}

export default MySchemaBlocklyEditor;
