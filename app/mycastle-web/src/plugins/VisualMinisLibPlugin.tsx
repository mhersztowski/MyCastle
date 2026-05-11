/**
 * VisualMinisLib Plugin
 *
 * Visual Signal-Slot graph for @mhersztowski/minislib.
 * - Parses the active TS file for MObject subclasses, Signal<T>, MProperty<T>, MTimer…
 * - Renders them as ReactFlow nodes; drag from signal port → slot port to connect.
 * - Clicking a node opens a Properties panel with editable constructor parameters.
 *   Changing a value patches the source code in the Monaco editor.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DownloadIcon from '@mui/icons-material/Download';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { defineEditorPlugin, globalEventBus, globalPluginRegistry } from '@mhersztowski/web-client';

/* ── Types ────────────────────────────────────────────────────────────────────*/

type EntityKind =
  | 'class'
  | 'instance'
  | 'signal'
  | 'property'
  | 'timer'
  | 'fsm'
  | 'bus'
  | 'commandstack'
  | 'listmodel'
  | 'logger';

interface SignalPort { name: string; type: string }
interface SlotPort   { name: string }

/** Schema for a single constructor parameter or class-level config field. */
interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  options?: string[];
  hint?: string;
  /** Index into the constructor argument list (for patching). */
  argIndex: number;
}

interface MinisEntity {
  id: string;
  varName: string;
  label: string;
  kind: EntityKind;
  signals: SignalPort[];
  slots: SlotPort[];
  /** Raw string constructor arguments as found in source, e.g. ["1000", "this"] */
  constructorArgs: string[];
  /** Parameter schema for this entity type. */
  paramDefs: ParamDef[];
}

interface ParsedConnection {
  id: string;
  sourceVar: string;
  signalName: string | null;
  targetVar: string;
  slotName: string;
}

/* ── Parameter schemas ────────────────────────────────────────────────────────*/

const BUILTIN_PARAM_DEFS: Partial<Record<EntityKind | string, ParamDef[]>> = {
  timer: [
    { key: 'intervalMs', label: 'Interval (ms)', type: 'number', argIndex: 0, hint: 'milliseconds' },
  ],
  property: [
    { key: 'initialValue', label: 'Initial value', type: 'string', argIndex: 0 },
  ],
  commandstack: [
    { key: 'maxSize', label: 'Max stack size', type: 'number', argIndex: 0, hint: 'default: 100' },
  ],
  logger: [
    { key: 'category', label: 'Category', type: 'string', argIndex: 0 },
    {
      key: 'minLevel', label: 'Min level', type: 'select', argIndex: 2,
      options: ["'debug'", "'info'", "'warn'", "'error'"],
    },
  ],
};

/* ── Parser ───────────────────────────────────────────────────────────────────*/

const MINISLIB_BASE_KIND: Record<string, EntityKind> = {
  MObject: 'class',
  Node: 'class',
  MTimer: 'timer',
  MStateMachine: 'fsm',
  MEventBus: 'bus',
  MCommandStack: 'commandstack',
  MListModel: 'listmodel',
  MLogger: 'logger',
};

const NODE_BUILTIN_SIGNALS: SignalPort[] = [
  { name: 'childAdded',    type: 'Node' },
  { name: 'childRemoved',  type: 'Node' },
  { name: 'parentChanged', type: 'Node | null' },
];

const BUILTIN_SIGNALS: Record<EntityKind, SignalPort[]> = {
  class: [],
  instance: [],
  signal: [],
  property: [{ name: 'changed', type: 'T, T' }],
  timer: [{ name: 'timeout', type: '' }],
  fsm: [{ name: 'stateChanged', type: 'MState' }, { name: 'transitionFailed', type: 'string' }],
  bus: [],
  commandstack: [
    { name: 'changed', type: '' },
    { name: 'canUndoChanged', type: 'boolean' },
    { name: 'canRedoChanged', type: 'boolean' },
  ],
  listmodel: [
    { name: 'rowsInserted', type: 'number, number' },
    { name: 'rowsRemoved', type: 'number, number' },
    { name: 'modelReset', type: '' },
  ],
  logger: [{ name: 'logged', type: 'LogRecord' }],
};

function extractClassBody(code: string, searchStart: number): string {
  const braceIdx = code.indexOf('{', searchStart);
  if (braceIdx === -1) return '';
  let depth = 0, i = braceIdx;
  while (i < code.length) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return code.slice(braceIdx + 1, i);
}

/** Extract the raw text between the outermost () of a call at `callStart`. */
function extractCallArgs(code: string, callStart: number): string[] {
  const parenIdx = code.indexOf('(', callStart);
  if (parenIdx === -1) return [];
  let depth = 0, i = parenIdx, end = parenIdx;
  while (i < code.length) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    i++;
  }
  const inner = code.slice(parenIdx + 1, end).trim();
  if (!inner) return [];
  // Split by top-level commas only
  const args: string[] = [];
  let cur = '', d = 0;
  for (const ch of inner) {
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') d++;
    else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') d--;
    if (ch === ',' && d === 0) { args.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function parseSignalPorts(body: string): SignalPort[] {
  const ports: SignalPort[] = [];
  const sigRe = /(?:readonly\s+)?(\w+)\s*(?:!?\s*:\s*Signal<([^>]*)>|=\s*new\s+Signal<([^>]*)>\s*[<(])/g;
  let m: RegExpExecArray | null;
  while ((m = sigRe.exec(body)) !== null)
    ports.push({ name: m[1], type: m[2] ?? m[3] ?? '' });
  const propRe = /(?:readonly\s+)?(\w+)\s*(?:!?\s*:\s*MProperty<([^>]*)>|=\s*new\s+MProperty<([^>]*)>)/g;
  while ((m = propRe.exec(body)) !== null)
    ports.push({ name: `${m[1]}.changed`, type: m[2] ?? m[3] ?? '' });
  return ports;
}

function parseSlotPorts(body: string, signalNames: Set<string>): SlotPort[] {
  const slots: SlotPort[] = [];
  const re = /\b(public\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(?:void|Promise<[^>]*>|\w[\w<>]*))?\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[2];
    if (name === 'constructor' || name === 'get' || name === 'set') continue;
    if (name.startsWith('_') || signalNames.has(name)) continue;
    slots.push({ name });
  }
  return slots;
}

function hasMinislibImport(code: string): boolean {
  return /@mhersztowski\/minislib/.test(code);
}

function parseMinisEntities(code: string, externalDefs: Map<string, ExternalClassDef> = new Map()): {
  entities: MinisEntity[];
  connections: ParsedConnection[];
} {
  if (!hasMinislibImport(code)) return { entities: [], connections: [] };

  const entities: MinisEntity[] = [];
  let counter = 0;
  const nextId = () => `e${counter++}`;
  const knownClasses = new Map<string, EntityKind>(Object.entries(MINISLIB_BASE_KIND));

  // Seed knownClasses with externally discovered classes
  for (const [className, def] of externalDefs) knownClasses.set(className, def.kind);

  // Seed with classes imported from npm packages (not relative, not minislib itself).
  // This lets main.ts show instances like `new TemperatureSensor()` even without a manifest.
  // When a manifest loads, re-parse will replace these placeholder entries with full port info.
  for (const { packageName, names } of parseNpmImports(code)) {
    if (packageName === '@mhersztowski/minislib') continue;
    for (const name of names) {
      if (!knownClasses.has(name)) knownClasses.set(name, 'instance');
    }
  }

  // 1. class X extends MObject / MTimer / ...
  const classRe = /class\s+(\w+)\s+extends\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(code)) !== null) {
    const className = m[1], parent = m[2];
    const baseKind = knownClasses.get(parent);
    if (!baseKind) continue;
    knownClasses.set(className, 'class');

    const body = extractClassBody(code, m.index + m[0].length);
    const builtinSigs = parent === 'Node' ? NODE_BUILTIN_SIGNALS : BUILTIN_SIGNALS[baseKind];
    const signals = [...builtinSigs, ...parseSignalPorts(body)];
    const signalNameSet = new Set(signals.map((s) => s.name.split('.')[0]));
    const slots = parseSlotPorts(body, signalNameSet);

    // Parse constructor params as ParamDefs from constructor signature
    const ctorMatch = /constructor\s*\(([^)]*)\)/.exec(body);
    const paramDefs: ParamDef[] = ctorMatch
      ? ctorMatch[1]
          .split(',')
          .map((p) => p.trim().replace(/^(private|public|protected|readonly)\s+/, ''))
          .filter(Boolean)
          .map((p, i) => {
            const [nameType] = p.split('=');
            const [name, rawType] = nameType.split(':').map((s) => s.trim());
            const type: ParamDef['type'] = rawType?.includes('number')
              ? 'number'
              : rawType?.includes('boolean')
              ? 'boolean'
              : 'string';
            return { key: name, label: name, type, argIndex: i };
          })
      : [];

    entities.push({ id: nextId(), varName: className, label: className, kind: 'class', signals, slots, constructorArgs: [], paramDefs });
  }

  // 2. const x = new ClassName<T>(...)
  const instanceRe = /(?:const|let|var)\s+(\w+)\s*(?::[^=\n;]+)?\s*=\s*(new\s+(\w+)\s*(?:<[^>]*>)?\s*\()/g;
  while ((m = instanceRe.exec(code)) !== null) {
    const varName = m[1], className = m[3];
    const callStart = m.index + m[1].length + (code.slice(m.index).indexOf(m[2]));
    const constructorArgs = extractCallArgs(code, callStart);

    if (className === 'Signal') {
      const tm = /new\s+Signal<([^>]*)>/.exec(code.slice(m.index, m.index + 100));
      entities.push({ id: nextId(), varName, label: varName, kind: 'signal', signals: [{ name: 'emit', type: tm?.[1] ?? '' }], slots: [], constructorArgs, paramDefs: [] });
      continue;
    }
    if (className === 'MProperty') {
      const tm = /new\s+MProperty<([^>]*)>/.exec(code.slice(m.index, m.index + 100));
      entities.push({ id: nextId(), varName, label: varName, kind: 'property', signals: [{ name: 'changed', type: tm?.[1] ?? '' }], slots: [{ name: 'value' }], constructorArgs, paramDefs: BUILTIN_PARAM_DEFS['property'] ?? [] });
      continue;
    }
    const builtinKind = MINISLIB_BASE_KIND[className];
    if (builtinKind) {
      // MTimer constructor only accepts (parent?) — interval is set via .start().
      // Interval paramDefs apply only to MTimer.create(ms, parent) handled below.
      const paramDefs = className === 'MTimer' ? [] : (BUILTIN_PARAM_DEFS[builtinKind] ?? []);
      entities.push({ id: nextId(), varName, label: `${varName}:${className}`, kind: builtinKind, signals: [...BUILTIN_SIGNALS[builtinKind]], slots: [], constructorArgs, paramDefs });
      continue;
    }
    if (knownClasses.has(className)) {
      // Check external manifest first, then fall back to in-file class definition
      const extDef = externalDefs.get(className);
      if (extDef) {
        entities.push({ id: nextId(), varName, label: `${varName}:${className}`, kind: extDef.kind, signals: extDef.signals, slots: extDef.slots, constructorArgs, paramDefs: extDef.paramDefs });
      } else {
        const proto = entities.find((e) => e.varName === className && e.kind === 'class');
        entities.push({ id: nextId(), varName, label: `${varName}:${className}`, kind: 'instance', signals: proto?.signals ?? [], slots: proto?.slots ?? [], constructorArgs, paramDefs: proto?.paramDefs ?? [] });
      }
    }
  }

  // 3. MTimer.create() / MTimer.singleShot()
  const timerCreateRe = /(?:const|let|var)\s+(\w+)\s*=\s*(MTimer\.(?:create|singleShot)\s*\()/g;
  while ((m = timerCreateRe.exec(code)) !== null) {
    const varName = m[1];
    if (entities.find((e) => e.varName === varName)) continue;
    const callStart = m.index + m[0].indexOf(m[2]);
    const constructorArgs = extractCallArgs(code, callStart);
    entities.push({ id: nextId(), varName, label: `${varName}:MTimer`, kind: 'timer', signals: [{ name: 'timeout', type: '' }], slots: [], constructorArgs, paramDefs: BUILTIN_PARAM_DEFS['timer'] ?? [] });
  }

  // 4. Existing .connect() calls
  const connections: ParsedConnection[] = [];
  const connRe = /(\w+)(?:\.(\w+))?\.connect\s*\(\s*(\w+)(?:\.(\w+))?(?:\.bind\s*\([^)]*\))?\s*\)/g;
  while ((m = connRe.exec(code)) !== null) {
    const [, p1, p2, p3, p4] = m;
    if (p4) connections.push({ id: `c${connections.length}`, sourceVar: p1, signalName: p2 ?? null, targetVar: p3, slotName: p4 });
    else if (p2) connections.push({ id: `c${connections.length}`, sourceVar: p1, signalName: null, targetVar: p3, slotName: p2 });
  }

  return { entities, connections };
}

/* ── Code generation (signal → slot) ────────────────────────────────────────*/

function generateConnectCode(src: MinisEntity, signalHandle: string, tgt: MinisEntity, slotHandle: string): string {
  const sourceExpr = src.kind === 'signal' ? src.varName : `${src.varName}.${signalHandle}`;
  let targetExpr: string;
  if (slotHandle === 'value' && tgt.kind === 'property') targetExpr = `(v) => { ${tgt.varName}.value = v; }`;
  else if (tgt.kind === 'instance' || tgt.kind === 'class') targetExpr = `${tgt.varName}.${slotHandle}.bind(${tgt.varName})`;
  else targetExpr = `${tgt.varName}.${slotHandle}`;
  return `${sourceExpr}.connect(${targetExpr});`;
}

/* ── Code patching (constructor arg update) ─────────────────────────────────*/

/**
 * Replaces one constructor argument in the source code.
 * Finds: `const varName = new ClassName(...)` or `MTimer.create(...)`
 * and rebuilds the arg list with the new value at argIndex.
 */
function patchConstructorArg(
  code: string,
  varName: string,
  argIndex: number,
  newValue: string,
): string | null {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match both `new ClassName(` and `MTimer.create(` / `MTimer.singleShot(`
  const re = new RegExp(
    `((?:const|let|var)\\s+${escaped}[^=]*=\\s*(?:new\\s+\\w+(?:<[^>]*>)?\\s*|MTimer\\.(?:create|singleShot)\\s*))(\\([^)]*\\))`,
  );
  const match = re.exec(code);
  if (!match) return null;

  const prefix = match[1];
  const argsRaw = match[2].slice(1, -1); // strip outer parens
  const args = argsRaw.split(',').map((a) => a.trim());
  while (args.length <= argIndex) args.push('undefined');
  args[argIndex] = newValue;

  const replacement = `${prefix}(${args.join(', ')})`;
  return code.slice(0, match.index) + replacement + code.slice(match.index + match[0].length);
}

/* ── Graph metadata (positions saved as a comment in the source file) ────────*/

const METADATA_PREFIX = '// @minislib-graph ';
const METADATA_RE = /^\/\/ @minislib-graph (.+)$/m;

type SavedPositions = Record<string, { x: number; y: number }>;

function parseGraphMetadata(code: string): SavedPositions {
  const m = METADATA_RE.exec(code);
  if (!m) return {};
  try { return JSON.parse(m[1]) as SavedPositions; } catch { return {}; }
}

function patchGraphMetadata(code: string, positions: SavedPositions): string {
  const line = METADATA_PREFIX + JSON.stringify(positions);
  if (METADATA_RE.test(code)) return code.replace(METADATA_RE, line);
  return (code.endsWith('\n') ? code : code + '\n') + line + '\n';
}

/* ── External package manifest loading ──────────────────────────────────────*/

interface ExternalClassDef {
  kind: EntityKind;
  signals: SignalPort[];
  slots: SlotPort[];
  paramDefs: ParamDef[];
}

interface MinislibPluginManifest {
  version: string;
  classes: Record<string, {
    kind: EntityKind;
    signals?: Array<{ name: string; type: string }>;
    slots?: Array<{ name: string }>;
    paramDefs?: ParamDef[];
  }>;
}

/** VFS REST API base — same origin as the app */
const VFS_API = '/api/vfs/readFile';

/** Parse bare npm package imports from TypeScript source. */
function parseNpmImports(code: string): { packageName: string; names: string[] }[] {
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  const result: { packageName: string; names: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const pkg = m[2];
    if (pkg.startsWith('.') || pkg.startsWith('/')) continue; // skip relative
    const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    if (names.length > 0) result.push({ packageName: pkg, names });
  }
  return result;
}

/** Derive the project root (containing node_modules) from a VFS file URI. */
function deriveProjectRoot(uri: string): string {
  const parts = uri.split('/');
  // Look for common source dirs: src, lib, dist
  for (const marker of ['src', 'lib', 'dist']) {
    const idx = parts.lastIndexOf(marker);
    if (idx > 0) return parts.slice(0, idx).join('/');
  }
  return parts.slice(0, -1).join('/');
}

const _manifestCache = new Map<string, ExternalClassDef | null>();

async function fetchManifest(projectRoot: string, packageName: string): Promise<Record<string, ExternalClassDef>> {
  const manifestPath = `${projectRoot}/node_modules/${packageName}/minislib-plugin.json`;
  const cacheKey = manifestPath;
  if (_manifestCache.has(cacheKey)) {
    const cached = _manifestCache.get(cacheKey);
    return cached ? { [packageName]: cached } : {};
  }

  try {
    const res = await fetch(`${VFS_API}?path=${encodeURIComponent(manifestPath)}`);
    if (!res.ok) { _manifestCache.set(cacheKey, null); return {}; }
    const { data } = await res.json() as { data: string };
    const manifest = JSON.parse(atob(data)) as MinislibPluginManifest;
    const result: Record<string, ExternalClassDef> = {};
    for (const [className, def] of Object.entries(manifest.classes)) {
      const resolved: ExternalClassDef = {
        kind: def.kind ?? 'class',
        signals: def.signals ?? [],
        slots: def.slots ?? [],
        paramDefs: def.paramDefs ?? [],
      };
      result[className] = resolved;
      _manifestCache.set(`${projectRoot}/node_modules/${packageName}/minislib-plugin.json:${className}`, resolved);
    }
    return result;
  } catch {
    _manifestCache.set(cacheKey, null);
    return {};
  }
}

export interface ExternalClassEntry {
  packageName: string;
  className: string;
  def: ExternalClassDef;
}

/** Load all external minislib-plugin.json manifests for packages imported in the code. */
async function loadExternalClassDefs(code: string, uri: string): Promise<{
  byClass: Map<string, ExternalClassDef>;
  entries: ExternalClassEntry[];
}> {
  const imports = parseNpmImports(code);
  if (imports.length === 0) return { byClass: new Map(), entries: [] };
  const projectRoot = deriveProjectRoot(uri);
  const byClass = new Map<string, ExternalClassDef>();
  const entries: ExternalClassEntry[] = [];
  await Promise.all(
    imports.map(async ({ packageName }) => {
      const defs = await fetchManifest(projectRoot, packageName);
      for (const [className, def] of Object.entries(defs)) {
        byClass.set(className, def);
        entries.push({ packageName, className, def });
      }
    }),
  );
  return { byClass, entries };
}

/* ── Manifest export ─────────────────────────────────────────────────────────*/

/** Build minislib-plugin.json content from parsed class entities. */
function generateManifest(entities: MinisEntity[]): string {
  const classes: Record<string, unknown> = {};
  for (const e of entities) {
    if (e.kind !== 'class') continue;
    classes[e.varName] = {
      kind: e.kind,
      signals: e.signals.map((s) => ({ name: s.name, type: s.type })),
      slots: e.slots.map((s) => ({ name: s.name })),
      paramDefs: e.paramDefs,
    };
  }
  return JSON.stringify({ version: '1.0', classes }, null, 2);
}

/** Save manifest JSON to VFS at {projectRoot}/minislib-plugin.json */
async function saveManifestToVfs(fileUri: string, json: string): Promise<void> {
  const projectRoot = deriveProjectRoot(fileUri);
  const manifestPath = `${projectRoot}/minislib-plugin.json`;
  const bytes = new TextEncoder().encode(json);
  const data = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  const res = await fetch(`/api/vfs/writeFile?path=${encodeURIComponent(manifestPath)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, options: { create: true, overwrite: true } }),
  });
  if (!res.ok) throw new Error(`VFS write failed: ${res.status}`);
  // Invalidate manifest cache so next open re-reads the updated file
  _manifestCache.clear();
}

/* ── Monaco helpers ──────────────────────────────────────────────────────────*/

function getEditorModel(targetUri: string): monaco.editor.ITextModel | null {
  return findModel(targetUri);
}

function markDirty(path: string) {
  globalEventBus.emit('system:editor:markDirty', { path });
}

/** Re-parse entities from `newCode` and notify React so the canvas updates immediately.
 *  Called after programmatic edits — pushEditOperations doesn't fire onDidChangeContent
 *  when the graph virtual tab is active, so we must refresh manually. */
function refreshStateFromEdit(newCode: string) {
  const byClass = new Map<string, ExternalClassDef>(
    _state.externalClassDefs.map((e) => [e.className, e.def]),
  );
  const { entities, connections } = parseMinisEntities(newCode, byClass);
  const savedPositions = parseGraphMetadata(newCode);
  _state = { ..._state, entities, connections, currentCode: newCode, savedPositions };
  notifyState();
}

function replaceModelContent(model: monaco.editor.ITextModel, newCode: string) {
  const full = model.getFullModelRange();
  model.pushEditOperations([], [{ range: full, text: newCode }], () => null);
  markDirty(model.uri.path);
  refreshStateFromEdit(newCode);
}

function findModel(targetUri: string): monaco.editor.ITextModel | null {
  // targetUri may lack the "file://" scheme; Monaco models always have it
  const withScheme = targetUri.startsWith('file://') ? targetUri : `file://${targetUri}`;
  const models = monaco.editor.getModels();
  return (
    models.find((m) => m.uri.toString() === targetUri) ??
    models.find((m) => m.uri.toString() === withScheme) ??
    null
  );
}

function insertAtEnd(code: string, targetUri: string): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const lastLine = model.getLineCount();
  const lastCol = model.getLineMaxColumn(lastLine);
  model.pushEditOperations(
    [],
    [{ range: new monaco.Range(lastLine, lastCol, lastLine, lastCol), text: '\n' + code }],
    () => null,
  );
  markDirty(model.uri.path);
  refreshStateFromEdit(model.getValue());
  return true;
}

function removeConnectLine(conn: ParsedConnection, targetUri: string): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const lines = model.getValue().split('\n');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const srcPart = conn.signalName ? `${esc(conn.sourceVar)}\\.${esc(conn.signalName)}` : esc(conn.sourceVar);
  const tgtPart = conn.slotName ? `${esc(conn.targetVar)}(?:\\.${esc(conn.slotName)})?` : esc(conn.targetVar);
  const re = new RegExp(`${srcPart}\\.connect\\s*\\(\\s*${tgtPart}(?:\\.bind\\s*\\([^)]*\\))?\\s*\\)`);
  const lineIdx = lines.findIndex((l) => re.test(l));
  if (lineIdx < 0) return false;
  lines.splice(lineIdx, 1);
  replaceModelContent(model, lines.join('\n'));
  return true;
}

function insertMemberIntoClass(memberCode: string, className: string, targetUri: string): boolean {
  const model = findModel(targetUri);
  if (!model) return false;
  const code = model.getValue();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Find "class ClassName ... {" and insert right after the opening brace
  const re = new RegExp(`class\\s+${esc(className)}\\b[^{]*\\{`);
  const match = re.exec(code);
  if (!match) return false;
  const insertPos = match.index + match[0].length;
  replaceModelContent(model, code.slice(0, insertPos) + '\n  ' + memberCode + code.slice(insertPos));
  return true;
}

/** Adds `name` to an existing named import from `pkg`, or inserts a new import line. */
function ensureNamedImport(name: string, pkg: string, targetUri: string): void {
  const model = findModel(targetUri);
  if (!model) return;
  const code = model.getValue();
  // Already imported?
  if (new RegExp(`\\b${name}\\b`).test(code)) return;
  // Extend existing import from the same package
  const existingRe = new RegExp(`(import\\s*\\{[^}]*)\\}\\s*from\\s*['"]${pkg.replace(/\//g, '\\/')}['"]`);
  const m = existingRe.exec(code);
  if (m) {
    replaceModelContent(model, code.slice(0, m.index) + `${m[1]}, ${name} }` + code.slice(m.index + m[0].length - (code.length - code.indexOf('}', m.index + m[1].length))));
    return;
  }
  // Insert new import at top (after last existing import line, or at position 0)
  const lines = code.split('\n');
  let lastImportIdx = -1;
  lines.forEach((l, i) => { if (/^\s*import\s/.test(l)) lastImportIdx = i; });
  const insertIdx = lastImportIdx + 1;
  lines.splice(insertIdx, 0, `import { ${name} } from '${pkg}';`);
  replaceModelContent(model, lines.join('\n'));
}

const BASE_CLASS_OPTIONS = [
  { label: 'Node', value: 'Node', pkg: '@mhersztowski/minislib' },
  { label: 'MObject', value: 'MObject', pkg: '@mhersztowski/minislib' },
] as const;

function insertNewClass(className: string, baseClass: string, pkg: string, targetUri: string): boolean {
  ensureNamedImport(baseClass, pkg, targetUri);
  return insertAtEnd(`\nclass ${className} extends ${baseClass} {\n}`, targetUri);
}

/* ── Module-level shared state ───────────────────────────────────────────────*/

interface ImportedClass { packageName: string; className: string; }

interface PluginState {
  entities: MinisEntity[];
  connections: ParsedConnection[];
  uri: string;
  isMinisFile: boolean;
  currentCode: string;
  savedPositions: SavedPositions;
  externalClassDefs: ExternalClassEntry[];
  importedClasses: ImportedClass[];
}

let _state: PluginState = { entities: [], connections: [], uri: '', isMinisFile: false, currentCode: '', savedPositions: {}, externalClassDefs: [], importedClasses: [] };
// Persists ReactFlow viewport across tab switches (component unmount/remount)
let _savedViewport: { x: number; y: number; zoom: number } | null = null;

const _stateListeners = new Set<() => void>();
function notifyState() { _stateListeners.forEach((fn) => fn()); }

function usePluginState(): PluginState {
  const [s, setS] = useState<PluginState>(_state);
  useEffect(() => {
    const fn = () => setS({ ..._state });
    _stateListeners.add(fn);
    return () => { _stateListeners.delete(fn); };
  }, []);
  return s;
}

let _onInsertCode: ((code: string) => void) | null = null;
let _vfsContentUnsub: (() => void) | null = null;

/* ── Snippets ────────────────────────────────────────────────────────────────*/

interface Snippet { id: string; code: string; inserted: boolean }
let _snippets: Snippet[] = [];
const _snippetListeners = new Set<() => void>();
function addSnippet(code: string, inserted: boolean) {
  _snippets = [{ id: `s${Date.now()}`, code, inserted }, ..._snippets.slice(0, 4)];
  _snippetListeners.forEach((fn) => fn());
}
function useSnippets() {
  const [s, setS] = useState<Snippet[]>(_snippets);
  useEffect(() => {
    const fn = () => setS([..._snippets]);
    _snippetListeners.add(fn);
    return () => { _snippetListeners.delete(fn); };
  }, []);
  return s;
}

/* ── Visual constants ────────────────────────────────────────────────────────*/

const KIND_COLOR: Record<EntityKind, string> = {
  class: '#4fc3f7', instance: '#81c784', signal: '#ffb74d', property: '#ce93d8',
  timer: '#f48fb1', fsm: '#80cbc4', bus: '#ffcc02',
  commandstack: '#a5d6a7', listmodel: '#90caf9', logger: '#bcaaa4',
};
const KIND_ICON: Record<EntityKind, string> = {
  class: '🏛', instance: '📦', signal: '⚡', property: '🔵',
  timer: '⏱', fsm: '🔄', bus: '📡', commandstack: '↩', listmodel: '📋', logger: '📝',
};

const HEADER_H = 34;
const ROW_H = 22;
const BODY_PAD = 4;

/* ── ReactFlow node ──────────────────────────────────────────────────────────*/

interface MinisNodeData extends Record<string, unknown> { entity: MinisEntity }

function MinisObjectNode({ data, selected }: NodeProps) {
  const { entity } = data as MinisNodeData;
  const color = KIND_COLOR[entity.kind] ?? '#4fc3f7';
  const icon = KIND_ICON[entity.kind] ?? '📦';
  const rowCount = Math.max(entity.signals.length, entity.slots.length);
  const bodyH = BODY_PAD + rowCount * ROW_H + BODY_PAD;
  const hasParams = entity.paramDefs.length > 0;

  return (
    <div style={{
      minWidth: 160,
      background: '#1e1e2e',
      border: `1.5px solid ${selected ? color : color + '55'}`,
      borderTop: `3px solid ${color}`,
      borderRadius: 6,
      fontSize: 11,
      color: '#cdd6f4',
      userSelect: 'none',
      boxShadow: selected ? `0 0 10px ${color}44` : '0 2px 8px rgba(0,0,0,0.5)',
    }}>
      <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', borderBottom: '1px solid #313244' }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontWeight: 600, color, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {entity.label}
        </span>
        {hasParams && (
          <span title="Has properties" style={{ fontSize: 9, color: '#585b70', marginLeft: 2 }}>⚙</span>
        )}
      </div>

      <div style={{ position: 'relative', height: bodyH }}>
        {entity.slots.map((slot, i) => (
          <div key={slot.name} style={{ position: 'absolute', top: BODY_PAD + i * ROW_H, left: 14, height: ROW_H, lineHeight: `${ROW_H}px`, fontSize: 10, color: '#a6adc8', whiteSpace: 'nowrap' }}>
            {slot.name}
          </div>
        ))}
        {entity.signals.map((sig, i) => (
          <div key={sig.name} style={{ position: 'absolute', top: BODY_PAD + i * ROW_H, right: 14, height: ROW_H, lineHeight: `${ROW_H}px`, fontSize: 10, color: '#cba6f7', textAlign: 'right', whiteSpace: 'nowrap' }}>
            {sig.name}
          </div>
        ))}
        {entity.slots.map((slot, i) => (
          <Handle key={`in-${slot.name}`} type="target" position={Position.Left} id={slot.name}
            style={{ top: BODY_PAD + i * ROW_H + ROW_H / 2, width: 8, height: 8, background: '#585b70', border: '1.5px solid #313244', borderRadius: '50%' }} />
        ))}
        {entity.signals.map((sig, i) => (
          <Handle key={`out-${sig.name}`} type="source" position={Position.Right} id={sig.name}
            style={{ top: BODY_PAD + i * ROW_H + ROW_H / 2, width: 8, height: 8, background: color, border: '1.5px solid #313244', borderRadius: '50%' }} />
        ))}
      </div>
    </div>
  );
}

const NODE_TYPES = { minisObject: MinisObjectNode };

/* ── Layout ──────────────────────────────────────────────────────────────────*/

function layoutNodes(entities: MinisEntity[], savedPositions: SavedPositions = {}): Node[] {
  const left = entities.filter((e) => e.kind === 'class' || e.kind === 'instance');
  const right = entities.filter((e) => e.kind !== 'class' && e.kind !== 'instance');
  const nodeH = (e: MinisEntity) => HEADER_H + BODY_PAD * 2 + Math.max(e.signals.length, e.slots.length) * ROW_H;
  const nodes: Node[] = [];
  let yL = 0;
  for (const e of left) {
    nodes.push({ id: e.id, type: 'minisObject', position: savedPositions[e.varName] ?? { x: 10, y: yL }, data: { entity: e } as MinisNodeData });
    yL += nodeH(e) + 24;
  }
  let yR = 0;
  for (const e of right) {
    nodes.push({ id: e.id, type: 'minisObject', position: savedPositions[e.varName] ?? { x: 230, y: yR }, data: { entity: e } as MinisNodeData });
    yR += nodeH(e) + 24;
  }
  return nodes;
}

function connectionsToEdges(connections: ParsedConnection[], entities: MinisEntity[]): Edge[] {
  return connections.flatMap((conn) => {
    const src = entities.find((e) => e.varName === conn.sourceVar);
    const tgt = entities.find((e) => e.varName === conn.targetVar);
    if (!src || !tgt) return [];
    return [{ id: conn.id, source: src.id, sourceHandle: conn.signalName ?? 'emit', target: tgt.id, targetHandle: conn.slotName, markerEnd: { type: MarkerType.ArrowClosed, color: '#cba6f7' }, style: { stroke: '#cba6f7', strokeWidth: 1.5 } }];
  });
}

/* ── Properties panel ────────────────────────────────────────────────────────*/

function PropertiesPanel({ entity, onClose }: { entity: MinisEntity; onClose: () => void }) {
  const color = KIND_COLOR[entity.kind] ?? '#4fc3f7';
  const icon = KIND_ICON[entity.kind] ?? '📦';

  // Local draft values: initialise from parsed constructorArgs
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const def of entity.paramDefs) {
      init[def.key] = entity.constructorArgs[def.argIndex] ?? '';
    }
    return init;
  });

  // Re-init when entity changes (different node selected)
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const def of entity.paramDefs) {
      init[def.key] = entity.constructorArgs[def.argIndex] ?? '';
    }
    setDrafts(init);
  }, [entity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((def: ParamDef, value: string) => {
    setDrafts((d) => ({ ...d, [def.key]: value }));
    // Patch source code immediately — always read live model content, not debounced _state.currentCode
    const { uri } = _state;
    if (!uri) return;
    const model = getEditorModel(uri);
    if (!model) return;
    const patched = patchConstructorArg(model.getValue(), entity.varName, def.argIndex, value);
    if (!patched) return;
    replaceModelContent(model, patched);
  }, [entity.varName]);

  return (
    <Box sx={{ borderTop: '1px solid #313244', background: '#13131e' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, gap: 1 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entity.label}
        </Typography>
        <Tooltip title="Close properties">
          <IconButton size="small" onClick={onClose} sx={{ color: '#45475a', p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider sx={{ borderColor: '#313244' }} />

      {entity.paramDefs.length === 0 ? (
        <Typography sx={{ fontSize: 11, color: '#45475a', px: 1.5, py: 1 }}>
          No configurable parameters.
        </Typography>
      ) : (
        <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {entity.paramDefs.map((def) => (
            <Box key={def.key}>
              <Typography sx={{ fontSize: 10, color: '#6c7086', mb: 0.25 }}>
                {def.label}{def.hint ? ` (${def.hint})` : ''}
              </Typography>
              {def.type === 'select' && def.options ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {def.options.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt.replace(/'/g, '')}
                      size="small"
                      onClick={() => handleChange(def, opt)}
                      sx={{
                        fontSize: 10, height: 20, cursor: 'pointer',
                        bgcolor: drafts[def.key] === opt ? color + '33' : '#1e1e2e',
                        color: drafts[def.key] === opt ? color : '#6c7086',
                        border: `1px solid ${drafts[def.key] === opt ? color + '88' : '#313244'}`,
                      }}
                    />
                  ))}
                </Box>
              ) : (
                <TextField
                  size="small"
                  fullWidth
                  value={drafts[def.key] ?? ''}
                  type={def.type === 'number' ? 'number' : 'text'}
                  onChange={(e) => handleChange(def, e.target.value)}
                  sx={{
                    '& .MuiInputBase-root': { fontSize: 11, background: '#1e1e2e', color: '#cdd6f4' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
                    '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: color + '88' },
                    '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: color },
                    '& input': { py: 0.5, px: 1 },
                  }}
                />
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Signals & Slots summary */}
      {(entity.signals.length > 0 || entity.slots.length > 0) && (
        <>
          <Divider sx={{ borderColor: '#1e1e2e' }} />
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 2 }}>
            {entity.signals.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 9, color: '#45475a', letterSpacing: 1, textTransform: 'uppercase', mb: 0.5 }}>Signals</Typography>
                {entity.signals.map((s) => (
                  <Typography key={s.name} sx={{ fontSize: 10, color: '#cba6f7', fontFamily: 'monospace' }}>{s.name}</Typography>
                ))}
              </Box>
            )}
            {entity.slots.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 9, color: '#45475a', letterSpacing: 1, textTransform: 'uppercase', mb: 0.5 }}>Slots</Typography>
                {entity.slots.map((s) => (
                  <Typography key={s.name} sx={{ fontSize: 10, color: '#a6adc8', fontFamily: 'monospace' }}>{s.name}</Typography>
                ))}
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

/* ── Snippet row ─────────────────────────────────────────────────────────────*/

function SnippetRow({ snippet }: { snippet: Snippet }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(snippet.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [snippet.code]);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.25, borderBottom: '1px solid #1e1e2e', '&:last-child': { borderBottom: 'none' } }}>
      <Chip label={snippet.inserted ? 'inserted' : 'copy'} size="small"
        sx={{ fontSize: 9, height: 14, bgcolor: snippet.inserted ? '#1e3a2e' : '#2d2040', color: snippet.inserted ? '#a6e3a1' : '#cba6f7', border: 'none', mr: 0.5 }} />
      <Typography sx={{ flex: 1, fontSize: 10, fontFamily: '"Fira Code","Cascadia Code",monospace', color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {snippet.code}
      </Typography>
      <Tooltip title={copied ? 'Copied!' : 'Copy'} placement="top">
        <IconButton size="small" onClick={handleCopy} sx={{ color: '#6c7086', p: 0.25 }}>
          {copied ? <CheckIcon sx={{ fontSize: 12 }} /> : <ContentCopyIcon sx={{ fontSize: 12 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/* ── Add-node templates ──────────────────────────────────────────────────────*/

function generateExternalSnippet(className: string, paramDefs: ParamDef[]): string {
  const maxIdx = paramDefs.reduce((m, p) => Math.max(m, p.argIndex), -1);
  const args: string[] = new Array(maxIdx + 1).fill('undefined');
  for (const p of paramDefs) {
    args[p.argIndex] = p.type === 'number' ? '0'
      : p.type === 'boolean' ? 'false'
      : p.options?.[0] ?? `'${p.key}'`;
  }
  const varName = className.charAt(0).toLowerCase() + className.slice(1);
  return `const ${varName} = new ${className}(${args.join(', ')});`;
}

function generateVarName(prefix: string, taken: Set<string>): string {
  if (!taken.has(prefix)) return prefix;
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

/* ── Export manifest button ──────────────────────────────────────────────────*/

type ExportState = 'idle' | 'saving' | 'saved' | 'error';

function ExportManifestButton({ uri, entities }: { uri: string; entities: MinisEntity[] }) {
  const [status, setStatus] = useState<ExportState>('idle');
  const classCount = entities.filter((e) => e.kind === 'class').length;

  const handleExport = useCallback(async () => {
    if (!uri || uri.startsWith('virtual://') || classCount === 0) return;
    setStatus('saving');
    try {
      const json = generateManifest(entities);
      await saveManifestToVfs(uri, json);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [uri, entities, classCount]);

  const label = status === 'saving' ? 'Saving…'
    : status === 'saved'  ? 'Saved!'
    : status === 'error'  ? 'Error!'
    : 'Export manifest';

  const color = status === 'saved' ? '#a6e3a1'
    : status === 'error' ? '#f38ba8'
    : '#89dceb';

  return (
    <Tooltip title={classCount === 0 ? 'No class definitions found' : 'Write minislib-plugin.json next to src/'} placement="bottom">
      <span>
        <Button
          size="small"
          startIcon={status === 'saved' ? <CheckIcon sx={{ fontSize: 13 }} /> : <DownloadIcon sx={{ fontSize: 13 }} />}
          onClick={handleExport}
          disabled={classCount === 0 || status === 'saving'}
          sx={{ fontSize: 11, color, textTransform: 'none', py: 0.25, px: 1, minWidth: 0, '&:hover': { background: '#1e3a3a' }, '&.Mui-disabled': { color: '#45475a' } }}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}

/* ── Type selector helpers ───────────────────────────────────────────────────*/

interface TypeOpt { label: string; group: string }

const BUILTIN_TYPE_OPTS: TypeOpt[] = [
  // Primitives
  { label: 'number',    group: 'Primitive' },
  { label: 'string',    group: 'Primitive' },
  { label: 'boolean',   group: 'Primitive' },
  { label: 'unknown',   group: 'Primitive' },
  { label: 'void',      group: 'Primitive' },
  { label: 'null',      group: 'Primitive' },
  { label: 'undefined', group: 'Primitive' },
  // Arrays
  { label: 'number[]',  group: 'Array' },
  { label: 'string[]',  group: 'Array' },
  { label: 'boolean[]', group: 'Array' },
  { label: 'unknown[]', group: 'Array' },
  // Collections
  { label: 'Record<string, unknown>', group: 'Collection' },
  { label: 'Record<string, number>',  group: 'Collection' },
  { label: 'Map<string, unknown>',    group: 'Collection' },
  { label: 'Set<string>',             group: 'Collection' },
  // Object shapes
  { label: '{ id: string; value: number }',          group: 'Object' },
  { label: '{ device: string; value: number }',      group: 'Object' },
  { label: '{ topic: string; payload: unknown }',    group: 'Object' },
  // Unions
  { label: 'number | null',   group: 'Union' },
  { label: 'string | null',   group: 'Union' },
  { label: 'string | number', group: 'Union' },
  { label: 'boolean | null',  group: 'Union' },
];

function defaultsForType(t: string): string[] {
  const s = t.trim();
  if (s === 'number') return ['0', '1', '-1'];
  if (s === 'string') return ["''", "'default'"];
  if (s === 'boolean') return ['false', 'true'];
  if (s === 'null') return ['null'];
  if (s === 'undefined' || s === 'unknown') return ['undefined'];
  if (s === 'void') return [];
  if (s.endsWith('[]') || s.startsWith('Array<')) return ['[]'];
  if (s.startsWith('Record') || s.startsWith('{') || s.startsWith('Map') || s.startsWith('Set')) return ['{}'];
  if (s.includes('| null') || s.includes('null |')) return ['null'];
  return ['undefined'];
}

const COMBO_PAPER_SX = { background: '#1e1e2e', border: '1px solid #313244', color: '#cdd6f4', '& .MuiAutocomplete-listbox': { p: 0 } };
const COMBO_INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    background: '#1e1e2e',
    color: '#cdd6f4',
    pr: '4px !important',
    '& fieldset': { borderColor: '#313244' },
    '&:hover fieldset': { borderColor: '#585b70' },
    '& input::placeholder': { color: '#585b70', opacity: 1 },
  },
};

function TypeComboBox({ value, onChange, placeholder, onCommit, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onCommit?: () => void;
  onCancel?: () => void;
}) {
  const classOpts: TypeOpt[] = _state.entities
    .filter((e) => e.kind === 'class')
    .map((e) => ({ label: e.varName, group: 'File classes' }));
  const opts = [...BUILTIN_TYPE_OPTS, ...classOpts];

  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={opts}
      groupBy={(o) => (typeof o === 'string' ? '' : o.group)}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      onChange={(_, v) => onChange(typeof v === 'string' ? v : v.label)}
      size="small"
      sx={COMBO_INPUT_SX}
      slotProps={{ paper: { sx: COMBO_PAPER_SX }, popper: { placement: 'top-start' } }}
      renderInput={(params) => (
        <TextField {...params} placeholder={placeholder ?? 'type'}
          onKeyDown={(e) => { if (e.key === 'Enter') onCommit?.(); if (e.key === 'Escape') onCancel?.(); }}
          inputProps={{ ...params.inputProps, style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' } }}
        />
      )}
      renderOption={(props, o) => (
        <Box component="li" {...props} sx={{ fontSize: 11, fontFamily: 'monospace', py: '2px !important', px: 1.5 }}>
          {typeof o === 'string' ? o : o.label}
        </Box>
      )}
      renderGroup={(params) => (
        <div key={params.key}>
          <Typography sx={{ fontSize: 9, color: '#45475a', px: 1.5, pt: 0.5, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {params.group}
          </Typography>
          {params.children}
        </div>
      )}
    />
  );
}

function DefaultComboBox({ typeVal, value, onChange, onCommit, onCancel }: {
  typeVal: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
}) {
  const opts = defaultsForType(typeVal);
  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={opts}
      inputValue={value}
      onInputChange={(_, v) => onChange(v)}
      onChange={(_, v) => onChange(v ?? '')}
      size="small"
      sx={COMBO_INPUT_SX}
      slotProps={{ paper: { sx: COMBO_PAPER_SX } }}
      renderInput={(params) => (
        <TextField {...params} placeholder="default value"
          onKeyDown={(e) => { if (e.key === 'Enter') onCommit?.(); if (e.key === 'Escape') onCancel?.(); }}
          inputProps={{ ...params.inputProps, style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' } }}
        />
      )}
      renderOption={(props, o) => (
        <Box component="li" {...props} sx={{ fontSize: 11, fontFamily: 'monospace', py: '2px !important', px: 1.5 }}>
          {o}
        </Box>
      )}
    />
  );
}

/* ── Slot builder — visual block editor for slot bodies ─────────────────────*/

type StmtKind = 'set-prop'|'emit'|'if'|'if-else'|'log'|'declare'|'assign'|'return'|'call'|'append'|'comment';

type SlotStmt =
  | { id: string; k: 'set-prop';  prop: string;   expr: string }
  | { id: string; k: 'emit';      signal: string; expr: string }
  | { id: string; k: 'if';        cond: string;   body: SlotStmt[] }
  | { id: string; k: 'if-else';   cond: string;   then: SlotStmt[]; els: SlotStmt[] }
  | { id: string; k: 'log';       level: string;  args: string }
  | { id: string; k: 'declare';   name: string;   expr: string }
  | { id: string; k: 'assign';    target: string; expr: string }
  | { id: string; k: 'return';    expr: string }
  | { id: string; k: 'call';      obj: string;    method: string; arg: string }
  | { id: string; k: 'append';    prop: string;   item: string;   maxLen: string }
  | { id: string; k: 'comment';   text: string };

let _sbId = 0;
const mkSid = () => `sb${_sbId++}`;

function mkStmt(k: StmtKind): SlotStmt {
  switch (k) {
    case 'set-prop':  return { id: mkSid(), k, prop: '',       expr: 'v' };
    case 'emit':      return { id: mkSid(), k, signal: '',     expr: 'v' };
    case 'if':        return { id: mkSid(), k, cond: 'v > 0',  body: [] };
    case 'if-else':   return { id: mkSid(), k, cond: 'v > 0',  then: [], els: [] };
    case 'log':       return { id: mkSid(), k, level: 'log',   args: 'v' };
    case 'declare':   return { id: mkSid(), k, name: 'result', expr: 'v' };
    case 'assign':    return { id: mkSid(), k, target: '',     expr: 'v' };
    case 'return':    return { id: mkSid(), k, expr: 'v' };
    case 'call':      return { id: mkSid(), k, obj: 'this',    method: '', arg: 'v' };
    case 'append':    return { id: mkSid(), k, prop: '',       item: 'v', maxLen: '20' };
    case 'comment':   return { id: mkSid(), k, text: '' };
  }
}

function genStmt(s: SlotStmt, d = 2): string {
  const p = '  '.repeat(d);
  const e = (x: string) => x || '_';
  switch (s.k) {
    case 'set-prop':  return `${p}this.${e(s.prop)}.value = ${e(s.expr)};`;
    case 'emit':      return `${p}this.${e(s.signal)}.emit(${e(s.expr)});`;
    case 'if':        return `${p}if (${e(s.cond)}) {\n${genStmts(s.body, d+1)}\n${p}}`;
    case 'if-else':   return `${p}if (${e(s.cond)}) {\n${genStmts(s.then, d+1)}\n${p}} else {\n${genStmts(s.els, d+1)}\n${p}}`;
    case 'log':       return `${p}console.${s.level}(${e(s.args)});`;
    case 'declare':   return `${p}const ${e(s.name)} = ${e(s.expr)};`;
    case 'assign':    return `${p}${e(s.target)} = ${e(s.expr)};`;
    case 'return':    return `${p}return ${e(s.expr)};`;
    case 'call':      return `${p}${s.obj ? s.obj + '.' : 'this.'}${e(s.method)}(${s.arg});`;
    case 'append':    return `${p}this.${e(s.prop)}.value = [...this.${e(s.prop)}.value${s.maxLen ? `.slice(-(${s.maxLen}-1))` : ''}, ${e(s.item)}];`;
    case 'comment':   return `${p}// ${s.text}`;
  }
}
function genStmts(ss: SlotStmt[], d = 2): string { return ss.map(s => genStmt(s, d)).join('\n') || `${'  '.repeat(d)}// empty`; }

interface SlotCtx { props: string[]; signals: string[]; slots: string[]; exprOpts: string[]; condOpts: string[] }

function buildSlotCtx(entity: MinisEntity): SlotCtx {
  const code = _state.currentCode;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clsMatch = new RegExp(`class\\s+${esc(entity.varName)}\\b[^{]*\\{`).exec(code);
  const body = clsMatch ? extractClassBody(code, clsMatch.index + clsMatch[0].length) : '';
  const props: string[] = [];
  let m: RegExpExecArray | null;
  const propRe = /readonly\s+(\w+)\s*=\s*new\s+MProperty/g;
  while ((m = propRe.exec(body)) !== null) props.push(m[1]);
  const signals = entity.signals.map(s => s.name).filter(n => !['changed', 'emit', 'timeout'].includes(n));
  const slots   = entity.slots.map(s => s.name);
  const exprOpts = [
    'v',
    ...props.map(p => `this.${p}.value`),
    'Number(v)', 'String(v)', 'Boolean(v)',
    'Math.round(v)', 'Math.abs(v)', 'Math.floor(v)', 'Math.ceil(v)',
    'Math.min(v, 0)', 'Math.max(v, 0)',
    'v + 1', 'v - 1', 'v * 2', 'v / 2', 'v % 2',
    'v.toFixed(2)', 'v.toString()',
    '`${v}`', '`${v} °C`', '`${v} %`', '`${v} ms`',
    'Date.now()', 'new Date().toLocaleTimeString()',
    'true', 'false', 'null', 'undefined', '[]', '{}', "''",
    ...props.map(p => `[...this.${p}.value.slice(-19), v]`),
  ];
  const condOpts = [
    'v > 0', 'v < 0', 'v >= 0', 'v <= 0',
    'v !== undefined', 'v !== null', 'v === true', 'v === false',
    ...props.map(p => `v > this.${p}.value`),
    ...props.map(p => `v < this.${p}.value`),
    ...props.map(p => `v === this.${p}.value`),
    ...props.map(p => `v !== this.${p}.value`),
    'true', 'false',
  ];
  return { props, signals, slots, exprOpts, condOpts };
}

const STMT_COLOR: Record<StmtKind, string> = {
  'set-prop': '#1565c0', 'emit':    '#6a1b9a', 'if':      '#e65100',
  'if-else':  '#bf360c', 'log':     '#2e7d32', 'declare': '#00838f',
  'assign':   '#c62828', 'return':  '#ad1457', 'call':    '#4527a0',
  'append':   '#006064', 'comment': '#37474f',
};
const STMT_LABEL: Record<StmtKind, string> = {
  'set-prop': 'set',   'emit':    'emit',   'if':      'if',
  'if-else':  'if/else','log':    'log',    'declare': 'const',
  'assign':   '=',     'return':  'return', 'call':    'call',
  'append':   'push',  'comment': '//',
};
const PALETTE_GROUPS: Array<{ label: string; items: StmtKind[] }> = [
  { label: 'State',  items: ['set-prop', 'emit', 'append'] },
  { label: 'Flow',   items: ['if', 'if-else', 'return'] },
  { label: 'Vars',   items: ['declare', 'assign'] },
  { label: 'Other',  items: ['log', 'call', 'comment'] },
];

const INLINE_INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    background: '#252535', color: '#cdd6f4', pr: '2px !important',
    '& fieldset': { borderColor: '#45475a' },
    '&:hover fieldset': { borderColor: '#585b70' },
    '& input': { padding: '1px 4px !important', fontSize: 10, fontFamily: 'monospace' },
  },
};

function ExprField({ value, onChange, opts, width }: { value: string; onChange: (v: string) => void; opts: string[]; width?: number | string }) {
  return (
    <Autocomplete freeSolo disableClearable options={opts} inputValue={value}
      onInputChange={(_, v) => onChange(v)} onChange={(_, v) => onChange(typeof v === 'string' ? v : '')}
      size="small" sx={{ width: width ?? 100, minWidth: 60 }}
      slotProps={{ paper: { sx: COMBO_PAPER_SX }, popper: { placement: 'top-start' } }}
      renderInput={(params) => (
        <TextField {...params} inputProps={{ ...params.inputProps, style: { fontSize: 10, padding: '1px 4px', fontFamily: 'monospace', color: '#cdd6f4' } }} sx={INLINE_INPUT_SX} />
      )}
      renderOption={(props, o) => <Box component="li" {...props} sx={{ fontSize: 10, fontFamily: 'monospace', py: '1px !important', px: 1 }}>{o}</Box>}
    />
  );
}

function TinyField({ value, onChange, placeholder, width = 60 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <TextField size="small" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      inputProps={{ style: { fontSize: 10, padding: '1px 4px', fontFamily: 'monospace', color: '#cdd6f4', width } }}
      sx={INLINE_INPUT_SX} />
  );
}

const IL = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>{children}</Box>
);
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <Typography sx={{ fontSize: 10, color: '#585b70', whiteSpace: 'nowrap', userSelect: 'none' }}>{children}</Typography>
);

function StmtBlockFields({ stmt, ctx, onChange }: { stmt: SlotStmt; ctx: SlotCtx; onChange: (s: SlotStmt) => void }) {
  switch (stmt.k) {
    case 'set-prop':  return <IL><Lbl>this.</Lbl><ExprField value={stmt.prop} onChange={(v) => onChange({ ...stmt, prop: v })} opts={ctx.props} width={80}/><Lbl>.value =</Lbl><ExprField value={stmt.expr} onChange={(v) => onChange({ ...stmt, expr: v })} opts={ctx.exprOpts} width={100}/></IL>;
    case 'emit':      return <IL><Lbl>this.</Lbl><ExprField value={stmt.signal} onChange={(v) => onChange({ ...stmt, signal: v })} opts={ctx.signals} width={90}/><Lbl>.emit(</Lbl><ExprField value={stmt.expr} onChange={(v) => onChange({ ...stmt, expr: v })} opts={ctx.exprOpts} width={90}/><Lbl>)</Lbl></IL>;
    case 'return':    return <IL><ExprField value={stmt.expr} onChange={(v) => onChange({ ...stmt, expr: v })} opts={ctx.exprOpts} width={140}/></IL>;
    case 'declare':   return <IL><TinyField value={stmt.name} onChange={(v) => onChange({ ...stmt, name: v })} placeholder="name"/><Lbl>=</Lbl><ExprField value={stmt.expr} onChange={(v) => onChange({ ...stmt, expr: v })} opts={ctx.exprOpts} width={100}/></IL>;
    case 'assign':    return <IL><TinyField value={stmt.target} onChange={(v) => onChange({ ...stmt, target: v })} placeholder="target"/><Lbl>=</Lbl><ExprField value={stmt.expr} onChange={(v) => onChange({ ...stmt, expr: v })} opts={ctx.exprOpts} width={100}/></IL>;
    case 'log':       return (
      <IL>
        <Autocomplete freeSolo disableClearable options={['log','warn','error']} inputValue={stmt.level} onInputChange={(_, v) => onChange({ ...stmt, level: v })} size="small" sx={{ width: 68 }} slotProps={{ paper: { sx: COMBO_PAPER_SX }, popper: { placement: 'top-start' } }} renderInput={(p) => <TextField {...p} inputProps={{ ...p.inputProps, style: { fontSize: 10, padding: '1px 4px', color: '#cdd6f4', fontFamily: 'monospace' } }} sx={INLINE_INPUT_SX}/>} renderOption={(p, o) => <Box component="li" {...p} sx={{ fontSize: 10, py: '1px !important', px: 1 }}>{o}</Box>}/>
        <Lbl>(</Lbl><ExprField value={stmt.args} onChange={(v) => onChange({ ...stmt, args: v })} opts={ctx.exprOpts} width={120}/><Lbl>)</Lbl>
      </IL>
    );
    case 'call':      return <IL><TinyField value={stmt.obj} onChange={(v) => onChange({ ...stmt, obj: v })} placeholder="this" width={45}/><Lbl>.</Lbl><ExprField value={stmt.method} onChange={(v) => onChange({ ...stmt, method: v })} opts={ctx.slots} width={90}/><Lbl>(</Lbl><ExprField value={stmt.arg} onChange={(v) => onChange({ ...stmt, arg: v })} opts={ctx.exprOpts} width={80}/><Lbl>)</Lbl></IL>;
    case 'append':    return <IL><Lbl>this.</Lbl><ExprField value={stmt.prop} onChange={(v) => onChange({ ...stmt, prop: v })} opts={ctx.props} width={80}/><Lbl>push</Lbl><ExprField value={stmt.item} onChange={(v) => onChange({ ...stmt, item: v })} opts={ctx.exprOpts} width={80}/><Lbl>max</Lbl><TinyField value={stmt.maxLen} onChange={(v) => onChange({ ...stmt, maxLen: v })} placeholder="20" width={30}/></IL>;
    case 'comment':   return <TinyField value={stmt.text} onChange={(v) => onChange({ ...stmt, text: v })} placeholder="comment…" width={160}/>;
    case 'if': case 'if-else': return <IL><ExprField value={stmt.cond} onChange={(v) => onChange({ ...stmt, cond: v } as SlotStmt)} opts={ctx.condOpts} width={160}/></IL>;
  }
}

function StmtBlock({ stmt, ctx, onChange, onDelete, onUp, onDown, canUp, canDown, depth }: {
  stmt: SlotStmt; ctx: SlotCtx; onChange: (s: SlotStmt) => void; onDelete: () => void;
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean; depth: number;
}) {
  const color = STMT_COLOR[stmt.k];
  const label = STMT_LABEL[stmt.k];
  const isNested = stmt.k === 'if' || stmt.k === 'if-else';
  return (
    <Box sx={{ mb: 0.5, border: `1px solid ${color}44`, borderRadius: 0.75, background: `${color}0d`, overflow: 'hidden' }}>
      {/* Row: badge + fields + controls */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, p: 0.5 }}>
        <Box sx={{ minWidth: 34, mt: '1px', height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, borderRadius: 0.5, flexShrink: 0 }}>
          <Typography sx={{ fontSize: 8, color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}>{label}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}><StmtBlockFields stmt={stmt} ctx={ctx} onChange={onChange} /></Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {['▲','▼','×'].map((ch, i) => (
            <Box key={ch} onClick={i===0?onUp:i===1?onDown:onDelete} sx={{
              width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 0.25, fontSize: 9,
              color: i===2?'#f38ba866':'#45475a', '&:hover':{ color: i===2?'#f38ba8':'#cdd6f4', background:'#31324422' },
              opacity: (i===0&&!canUp)||(i===1&&!canDown)?0.25:1, pointerEvents:(i===0&&!canUp)||(i===1&&!canDown)?'none':'auto',
            }}>{ch}</Box>
          ))}
        </Box>
      </Box>
      {/* Nested blocks for if / if-else */}
      {stmt.k === 'if' && (
        <Box sx={{ px: 0.75, pb: 0.5 }}>
          <StmtList stmts={stmt.body} ctx={ctx} onChange={(body) => onChange({ ...stmt, body })} depth={depth+1} />
        </Box>
      )}
      {stmt.k === 'if-else' && (
        <Box sx={{ px: 0.75, pb: 0.5 }}>
          <Typography sx={{ fontSize: 8, color: '#a6adc8', px: 0.25, pb: 0.25 }}>then:</Typography>
          <StmtList stmts={stmt.then} ctx={ctx} onChange={(then) => onChange({ ...stmt, then })} depth={depth+1} />
          <Typography sx={{ fontSize: 8, color: '#a6adc8', px: 0.25, py: 0.25 }}>else:</Typography>
          <StmtList stmts={stmt.els}  ctx={ctx} onChange={(els)  => onChange({ ...stmt, els  })} depth={depth+1} />
        </Box>
      )}
      {isNested && <Box sx={{ height: 2 }} />}
    </Box>
  );
}

function StmtList({ stmts, ctx, onChange, depth = 0 }: { stmts: SlotStmt[]; ctx: SlotCtx; onChange: (ss: SlotStmt[]) => void; depth?: number }) {
  const upd = (i: number, s: SlotStmt) => onChange(stmts.map((x, j) => j === i ? s : x));
  const del = (i: number) => onChange(stmts.filter((_, j) => j !== i));
  const mv  = (i: number, dir: -1|1) => { const j = i+dir; if (j<0||j>=stmts.length) return; const a=[...stmts];[a[i],a[j]]=[a[j],a[i]]; onChange(a); };
  const add = (k: StmtKind) => onChange([...stmts, mkStmt(k)]);
  return (
    <Box sx={{ pl: depth > 0 ? 1 : 0, borderLeft: depth > 0 ? '2px solid #31324466' : 'none', ml: depth > 0 ? 0.5 : 0 }}>
      {stmts.map((s, i) => (
        <StmtBlock key={s.id} stmt={s} ctx={ctx} depth={depth} onChange={(ns) => upd(i, ns)} onDelete={() => del(i)} onUp={() => mv(i, -1)} onDown={() => mv(i, 1)} canUp={i>0} canDown={i<stmts.length-1} />
      ))}
      {depth > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.25 }}>
          {PALETTE_GROUPS.flatMap(g => g.items).filter(k => k !== 'if' && k !== 'if-else').map(k => (
            <Box key={k} onClick={() => add(k)} sx={{ px: 0.5, py: 0.1, fontSize: 9, fontWeight: 700, borderRadius: 0.25, cursor: 'pointer', color: STMT_COLOR[k], background: STMT_COLOR[k]+'22', border: `1px solid ${STMT_COLOR[k]}44`, '&:hover': { background: STMT_COLOR[k]+'44' } }}>{STMT_LABEL[k]}</Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function SlotBuilder({ entity, onCancel, onCommit }: { entity: MinisEntity; onCancel: () => void; onCommit: (name: string, type: string, stmts: SlotStmt[]) => void }) {
  const [slotName, setSlotName] = useState('');
  const [paramType, setParamType] = useState('unknown');
  const [stmts, setStmts] = useState<SlotStmt[]>([]);
  const ctx = useMemo(() => buildSlotCtx(entity), [entity.varName]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = `${slotName||'_'}(v: ${paramType}): void {\n${genStmts(stmts)}\n  }`;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #313244', background: '#13131e', maxHeight: 420, minHeight: 280 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, gap: 1, borderBottom: '1px solid #313244', flexShrink: 0 }}>
        <Typography sx={{ fontSize: 11, color: '#89dceb', fontWeight: 600, flex: 1 }}>New Slot</Typography>
        <Button size="small" onClick={onCancel} sx={{ fontSize: 10, color: '#6c7086', textTransform: 'none', py: 0.15, px: 0.75, minWidth: 0 }}>Cancel</Button>
        <Button size="small" onClick={() => onCommit(slotName, paramType, stmts)} disabled={!slotName.trim()}
          sx={{ fontSize: 10, color: '#a6e3a1', textTransform: 'none', py: 0.15, px: 0.75, minWidth: 0, border: '1px solid #a6e3a144' }}>Add</Button>
      </Box>
      {/* Signature */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderBottom: '1px solid #313244', flexShrink: 0 }}>
        <TextField autoFocus size="small" placeholder="name" value={slotName}
          onChange={(e) => { const v = e.target.value; setSlotName(v ? v[0].toLowerCase()+v.slice(1) : v); }}
          inputProps={{ style: { fontSize: 11, padding: '2px 6px', fontFamily: 'monospace', color: '#cdd6f4' } }}
          sx={{ width: 110, '& .MuiOutlinedInput-root': { background: '#1e1e2e', '& fieldset': { borderColor: '#313244' } } }} />
        <Typography sx={{ fontSize: 11, color: '#45475a' }}>(v:</Typography>
        <TypeComboBox value={paramType} onChange={setParamType} placeholder="type" />
        <Typography sx={{ fontSize: 11, color: '#45475a' }}>)</Typography>
      </Box>
      {/* Body: palette | statements */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Palette */}
        <Box sx={{ width: 76, borderRight: '1px solid #313244', overflowY: 'auto', p: 0.5, flexShrink: 0 }}>
          {PALETTE_GROUPS.map(g => (
            <Box key={g.label} sx={{ mb: 0.75 }}>
              <Typography sx={{ fontSize: 8, color: '#45475a', textTransform: 'uppercase', letterSpacing: 0.8, px: 0.25, mb: 0.25 }}>{g.label}</Typography>
              {g.items.map(k => (
                <Box key={k} onClick={() => setStmts(prev => [...prev, mkStmt(k)])}
                  sx={{ px: 0.75, py: 0.2, mb: 0.2, fontSize: 10, fontWeight: 700, borderRadius: 0.5, cursor: 'pointer', color: STMT_COLOR[k], background: STMT_COLOR[k]+'22', border: `1px solid ${STMT_COLOR[k]}44`, '&:hover': { background: STMT_COLOR[k]+'44' } }}>
                  {STMT_LABEL[k]}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        {/* Statement list + preview */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <Box sx={{ flex: 1, overflowY: 'auto', p: 0.75 }}>
            <StmtList stmts={stmts} ctx={ctx} onChange={setStmts} />
            {stmts.length === 0 && <Typography sx={{ fontSize: 10, color: '#45475a', textAlign: 'center', pt: 2 }}>← click to add blocks</Typography>}
          </Box>
          {/* Code preview */}
          <Box sx={{ borderTop: '1px solid #313244', px: 1, py: 0.5, background: '#0d0d1a', flexShrink: 0, maxHeight: 72, overflowY: 'auto' }}>
            <Typography component="pre" sx={{ m: 0, fontSize: 9, color: '#6c7086', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{preview}</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* ── Class builder panel (shown when a class entity is selected) ─────────────*/

type ClassMemberMode = 'signal' | 'property' | 'slot';

function ClassBuilderPanel({ entity, onClose }: { entity: MinisEntity; onClose: () => void }) {
  const color = KIND_COLOR['class'];
  const [mode, setMode] = useState<ClassMemberMode | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [defaultVal, setDefaultVal] = useState('');

  const reset = () => { setMode(null); setName(''); setType(''); setDefaultVal(''); };

  // When type changes, auto-populate defaultVal with first suggestion (if still empty / was auto-set)
  const handleTypeChange = useCallback((newType: string) => {
    setType(newType);
    if (mode === 'property') {
      const suggestions = defaultsForType(newType);
      if (suggestions.length > 0) setDefaultVal(suggestions[0]);
    }
  }, [mode]);

  const commit = useCallback(() => {
    const { uri } = _state;
    if (!uri || !name.trim()) return;
    const n = name.trim();
    const t = type.trim() || 'unknown';
    let memberCode = '';
    if (mode === 'signal')        memberCode = `readonly ${n} = new Signal<${t}>(this);`;
    else if (mode === 'property') memberCode = `readonly ${n} = new MProperty<${t}>(this, ${defaultVal.trim() || 'undefined'});`;
    else if (mode === 'slot')     memberCode = `${n}(v: ${t}): void {}`;
    if (memberCode) insertMemberIntoClass(memberCode, entity.varName, uri);
    reset();
  }, [mode, name, type, defaultVal, entity.varName]);

  return (
    <Box sx={{ borderTop: '1px solid #313244', background: '#13131e' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, gap: 1 }}>
        <span style={{ fontSize: 14 }}>🏛</span>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entity.varName}
        </Typography>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} sx={{ color: '#45475a', p: 0.25 }}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider sx={{ borderColor: '#313244' }} />

      {(entity.signals.length > 0 || entity.slots.length > 0) && (
        <Box sx={{ px: 1.5, py: 0.5 }}>
          {entity.signals.length > 0 && (
            <Typography sx={{ fontSize: 10, color: '#cba6f7', lineHeight: 1.8 }}>
              ⚡ {entity.signals.map((s) => s.name).join('  ·  ')}
            </Typography>
          )}
          {entity.slots.length > 0 && (
            <Typography sx={{ fontSize: 10, color: '#89dceb', lineHeight: 1.8 }}>
              ↩ {entity.slots.map((s) => s.name).join('  ·  ')}
            </Typography>
          )}
        </Box>
      )}

      <Divider sx={{ borderColor: '#313244' }} />

      {!mode ? (
        <Box sx={{ px: 1.5, py: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {(['signal', 'property', 'slot'] as ClassMemberMode[]).map((m) => {
            const c = m === 'signal' ? '#cba6f7' : m === 'property' ? '#ce93d8' : '#89dceb';
            return (
              <Button key={m} size="small" onClick={() => setMode(m)}
                sx={{ fontSize: 10, textTransform: 'none', py: 0.25, px: 0.75, minWidth: 0, color: c, border: `1px solid ${c}44` }}>
                + {m.charAt(0).toUpperCase() + m.slice(1)}
              </Button>
            );
          })}
        </Box>
      ) : mode === 'slot' ? (
        <SlotBuilder
          entity={entity}
          onCancel={reset}
          onCommit={(slotName, paramType, stmts) => {
            const { uri } = _state;
            if (!uri || !slotName.trim()) return;
            const body = genStmts(stmts, 2);
            const memberCode = `${slotName}(v: ${paramType || 'unknown'}): void {\n${body}\n  }`;
            insertMemberIntoClass(memberCode, entity.varName, uri);
            reset();
          }}
        />
      ) : (
        <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography sx={{ fontSize: 10, color: '#a6adc8' }}>New {mode}</Typography>
          {/* name — plain text, no suggestions; first char forced lowercase */}
          <TextField size="small" autoFocus placeholder="name" value={name}
            onChange={(e) => { const v = e.target.value; setName(v ? v[0].toLowerCase() + v.slice(1) : v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') reset(); }}
            inputProps={{ style: { fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' } }}
            sx={COMBO_INPUT_SX} />
          {/* type — combobox with grouped presets + file classes */}
          <TypeComboBox
            value={type}
            onChange={handleTypeChange}
            placeholder="type"
            onCommit={commit}
            onCancel={reset}
          />
          {/* default value — combobox with type-aware suggestions (property only) */}
          {mode === 'property' && (
            <DefaultComboBox
              typeVal={type}
              value={defaultVal}
              onChange={setDefaultVal}
              onCommit={commit}
              onCancel={reset}
            />
          )}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" onClick={commit} disabled={!name.trim()}
              sx={{ fontSize: 10, color: '#a6e3a1', textTransform: 'none', py: 0.25, px: 0.75, minWidth: 0, border: '1px solid #a6e3a144' }}>
              Add
            </Button>
            <Button size="small" onClick={reset}
              sx={{ fontSize: 10, color: '#6c7086', textTransform: 'none', py: 0.25, px: 0.75, minWidth: 0 }}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ── New-class button ────────────────────────────────────────────────────────*/

function NewClassButton({ uri, onCreated }: { uri: string; onCreated: (varName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [baseIdx, setBaseIdx] = useState(0); // 0 = Node (default), 1 = MObject
  const anchorRef = useRef<HTMLButtonElement>(null);

  const handleCreate = useCallback(() => {
    if (!name.trim() || !uri) return;
    const varName = name.trim();
    const { value, pkg } = BASE_CLASS_OPTIONS[baseIdx];
    insertNewClass(varName, value, pkg, uri);
    onCreated(varName);
    setName('');
    setOpen(false);
  }, [name, uri, baseIdx, onCreated]);

  return (
    <>
      <Tooltip title="Define a new MObject subclass">
        <Button ref={anchorRef} size="small" onClick={() => setOpen((v) => !v)}
          sx={{ fontSize: 10, color: '#cba6f7', textTransform: 'none', py: 0, px: 1, minWidth: 0, borderLeft: '1px solid #313244', borderRadius: 0, '&:hover': { background: '#1e1e3e' } }}>
          + Class
        </Button>
      </Tooltip>
      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => { setOpen(false); setName(''); }}
        PaperProps={{ sx: { background: '#1e1e2e', border: '1px solid #313244', p: 1, minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }} onKeyDown={(e) => e.stopPropagation()}>
          {/* Base class toggle */}
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            {BASE_CLASS_OPTIONS.map((opt, i) => (
              <Button key={opt.value} size="small" onClick={() => setBaseIdx(i)}
                sx={{ fontSize: 10, textTransform: 'none', py: 0.2, px: 0.75, minWidth: 0, flex: 1,
                  color: baseIdx === i ? '#cba6f7' : '#45475a',
                  background: baseIdx === i ? '#2d2040' : 'transparent',
                  border: `1px solid ${baseIdx === i ? '#cba6f7' : '#313244'}`,
                }}>
                {opt.label}
              </Button>
            ))}
          </Box>
          {/* Name + Create */}
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <TextField autoFocus size="small" placeholder="ClassName" value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setOpen(false); setName(''); } }}
              inputProps={{ style: { fontSize: 11, padding: '3px 8px', fontFamily: 'monospace', color: '#cdd6f4' } }}
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { background: '#181825', color: '#cdd6f4', '& fieldset': { borderColor: '#313244' } } }} />
            <Button size="small" onClick={handleCreate} disabled={!name.trim()}
              sx={{ fontSize: 10, color: '#a6e3a1', textTransform: 'none', py: 0.25, px: 0.75, minWidth: 0, border: '1px solid #a6e3a144' }}>
              Create
            </Button>
          </Box>
        </Box>
      </Menu>
    </>
  );
}

/* ── Add-node toolbar ────────────────────────────────────────────────────────*/

interface FlatEntry { packageName: string; className: string; paramDefs?: ParamDef[]; }

const BUILTIN_MINISLIB_ENTRIES: FlatEntry[] = [
  { packageName: '@mhersztowski/minislib', className: 'MObject' },
  { packageName: '@mhersztowski/minislib', className: 'MTimer', paramDefs: BUILTIN_PARAM_DEFS['timer'] },
  { packageName: '@mhersztowski/minislib', className: 'MProperty', paramDefs: BUILTIN_PARAM_DEFS['property'] },
  { packageName: '@mhersztowski/minislib', className: 'MStateMachine' },
  { packageName: '@mhersztowski/minislib', className: 'MEventBus' },
  { packageName: '@mhersztowski/minislib', className: 'MCommandStack', paramDefs: BUILTIN_PARAM_DEFS['commandstack'] },
  { packageName: '@mhersztowski/minislib', className: 'MListModel' },
  { packageName: '@mhersztowski/minislib', className: 'MLogger', paramDefs: BUILTIN_PARAM_DEFS['logger'] },
  { packageName: '@mhersztowski/minislib', className: 'Signal' },
];

function AddNodeMenu({ uri: _uri, externalClassDefs, importedClasses, entities }: { uri: string; externalClassDefs: ExternalClassEntry[]; importedClasses: ImportedClass[]; entities: MinisEntity[] }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (anchorEl) setTimeout(() => filterRef.current?.focus(), 50);
    else setFilter('');
  }, [anchorEl]);

  // Build flat list: builtins first, then manifest entries, then plain imports (deduplicated)
  const allEntries: FlatEntry[] = useMemo(() => {
    const manifestNames = new Set(externalClassDefs.map((e) => e.className));
    const fromManifest: FlatEntry[] = externalClassDefs.map((e) => ({
      packageName: e.packageName, className: e.className, paramDefs: e.def.paramDefs,
    }));
    const fromImports: FlatEntry[] = importedClasses
      .filter(({ className }) => !manifestNames.has(className))
      .map(({ packageName, className }) => ({ packageName, className }));
    return [...BUILTIN_MINISLIB_ENTRIES, ...fromManifest, ...fromImports];
  }, [externalClassDefs, importedClasses]);

  const q = filter.toLowerCase();
  const visible = q
    ? allEntries.filter((e) => e.className.toLowerCase().includes(q) || e.packageName.toLowerCase().includes(q))
    : allEntries;

  const handleInsert = (entry: FlatEntry) => {
    setAnchorEl(null);
    const targetUri = _state.uri;
    if (!targetUri || targetUri.startsWith('virtual://')) return;
    const taken = new Set(_state.entities.map((e) => e.varName));
    const base = entry.className.charAt(0).toLowerCase() + entry.className.slice(1);
    const varName = generateVarName(base, taken);
    const snippet = entry.paramDefs
      ? generateExternalSnippet(entry.className, entry.paramDefs).replace(/^const \w+/, `const ${varName}`)
      : `const ${varName} = new ${entry.className}();\n`;
    const inserted = insertAtEnd(snippet, targetUri);
    addSnippet(snippet, inserted);
  };

  return (
    <>
      <Box sx={{
        display: 'flex', alignItems: 'center', px: 1, py: 0.5, gap: 0.75,
        borderBottom: '1px solid #313244', background: '#13131e', flexWrap: 'wrap',
      }}>
        <Button
          size="small"
          startIcon={<AddCircleOutlineIcon sx={{ fontSize: 13 }} />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ fontSize: 11, color: '#cba6f7', textTransform: 'none', py: 0.25, px: 1, minWidth: 0, '&:hover': { background: '#2d2040' } }}
        >
          Add instance
        </Button>
        <ExportManifestButton uri={_uri} entities={entities} />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { background: '#1e1e2e', border: '1px solid #313244', minWidth: 260, py: 0 } }}
      >
        {/* Filter input */}
        <Box sx={{ px: 1, pt: 1, pb: 0.5 }} onKeyDown={(e) => e.stopPropagation()}>
          <TextField
            inputRef={filterRef}
            size="small"
            placeholder="Filter classes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            fullWidth
            sx={{
              '& .MuiInputBase-root': { fontSize: 12, background: '#13131e', color: '#cdd6f4', height: 28 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#313244' },
              '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#cba6f7' },
              '& input': { py: 0, px: 1 },
            }}
          />
        </Box>
        <Divider sx={{ borderColor: '#313244' }} />

        {visible.length === 0 && (
          <Typography sx={{ fontSize: 11, color: '#45475a', px: 2, py: 1 }}>No matches</Typography>
        )}
        {visible.map((entry) => (
          <MenuItem
            key={`${entry.packageName}:${entry.className}`}
            onClick={() => handleInsert(entry)}
            sx={{ fontSize: 12, color: '#cdd6f4', py: 0.75, gap: 1.25, '&:hover': { background: '#313244' } }}
          >
            <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>
              {entry.packageName === '@mhersztowski/minislib' ? '⚡' : '🧩'}
            </span>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#81c784', fontWeight: 600, lineHeight: 1.4 }}>{entry.className}</Typography>
              <Typography sx={{ fontSize: 10, color: '#6c7086' }}>{entry.packageName}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/* ── Main panel ──────────────────────────────────────────────────────────────*/

function VisualMinisLibPanel() {
  const { entities, connections, uri, isMinisFile, savedPositions, externalClassDefs, importedClasses } = usePluginState();
  const snippets = useSnippets();
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const pendingSelectName = useRef<string | null>(null);

  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  // Ref gives handleNodeDragStop access to the current node list without stale closure
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Sync nodes when entities change; preserve positions of unchanged nodes (keyed by varName)
  useEffect(() => {
    if (entities.length === 0) { setNodes([]); setEdges([]); return; }
    setNodes((prev) => {
      // Key by varName — stable across re-parses (unlike auto-incremented e0/e1 ids)
      const posMap = new Map(prev.map((n) => [(n.data as MinisNodeData).entity.varName, n.position]));
      return layoutNodes(entities, savedPositions).map((n) => ({
        ...n,
        position: posMap.get((n.data as MinisNodeData).entity.varName) ?? n.position,
      }));
    });
    setEdges(connectionsToEdges(connections, entities));
    // Auto-select newly created class (from "+Class" button)
    if (pendingSelectName.current) {
      const match = entities.find((e) => e.varName === pendingSelectName.current && e.kind === 'class');
      if (match) { setSelectedEntityId(match.id); pendingSelectName.current = null; }
    }
  }, [entities, connections, savedPositions, setNodes, setEdges]);

  // When parser refreshes, keep selected entity only if still present
  useEffect(() => {
    if (selectedEntityId && !entities.find((e) => e.id === selectedEntityId))
      setSelectedEntityId(null);
  }, [entities, selectedEntityId]);

  // Save node positions to file as metadata comment after every drag
  const handleNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const positions: SavedPositions = {};
    for (const n of nodesRef.current) {
      const varName = (n.data as MinisNodeData).entity.varName;
      positions[varName] = n.id === draggedNode.id ? draggedNode.position : n.position;
    }
    const { uri: u } = _state;
    if (!u) return;
    const model = getEditorModel(u);
    if (!model) return;
    // Always read live model content — never use debounced _state.currentCode as base
    const currentCode = model.getValue();
    const patched = patchGraphMetadata(currentCode, positions);
    replaceModelContent(model, patched);
  }, []);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const entity = (node.data as MinisNodeData).entity;
    setSelectedEntityId((prev) => (prev === entity.id ? null : entity.id));
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    const srcNode = nodes.find((n) => n.id === connection.source);
    const tgtNode = nodes.find((n) => n.id === connection.target);
    if (!srcNode || !tgtNode || !connection.sourceHandle || !connection.targetHandle) return;
    const code = generateConnectCode(
      (srcNode.data as MinisNodeData).entity, connection.sourceHandle,
      (tgtNode.data as MinisNodeData).entity, connection.targetHandle,
    );
    const inserted = !!_onInsertCode && (_onInsertCode(code), true);
    addSnippet(code, inserted);
    setEdges((eds) => addEdge({ ...connection, markerEnd: { type: MarkerType.ArrowClosed, color: '#cba6f7' }, style: { stroke: '#cba6f7', strokeWidth: 1.5 } }, eds));
  }, [nodes, setEdges]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type === 'remove') {
        const conn = connections.find((c) => c.id === change.id);
        if (conn) removeConnectLine(conn, uri);
      }
    }
    setEdges((es) => applyEdgeChanges(changes, es));
  }, [connections, uri, setEdges]);

  const selectedEntity = selectedEntityId ? entities.find((e) => e.id === selectedEntityId) ?? null : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, []);

  if (!uri || !isMinisFile) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, p: 2, textAlign: 'center' }}>
        <AutoFixHighIcon sx={{ fontSize: 36, color: '#45475a' }} />
        <Typography sx={{ fontSize: 12, color: '#6c7086' }}>
          Open a TypeScript file that imports <code style={{ color: '#cba6f7' }}>@mhersztowski/minislib</code>
        </Typography>
        <Typography sx={{ fontSize: 11, color: '#45475a' }}>Signal / MProperty / MTimer / MObject subclasses appear here as connectable nodes.</Typography>
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#181825' }}>
      {/* Toolbar: Add instance + Define new class + Fullscreen */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #313244' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <AddNodeMenu uri={uri} externalClassDefs={externalClassDefs} importedClasses={importedClasses} entities={entities} />
        </Box>
        <NewClassButton uri={uri} onCreated={(varName) => { pendingSelectName.current = varName; }} />
        <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          <IconButton size="small" onClick={toggleFullscreen} sx={{ px: 1, borderLeft: '1px solid #313244', borderRadius: 0, color: '#585b70', '&:hover': { color: '#cdd6f4', background: '#1e1e2e' } }}>
            {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: 16 }} /> : <FullscreenIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {entities.length === 0 ? (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, p: 2, textAlign: 'center' }}>
          <AutoFixHighIcon sx={{ fontSize: 36, color: '#45475a' }} />
          <Typography sx={{ fontSize: 12, color: '#6c7086' }}>No minislib entities found.</Typography>
          <Typography sx={{ fontSize: 11, color: '#45475a' }}>
            Use <strong style={{ color: '#cba6f7' }}>Add object</strong> above, or declare classes extending{' '}
            <code style={{ color: '#4fc3f7' }}>MObject</code>.
          </Typography>
        </Box>
      ) : (
        <>
      {/* ReactFlow canvas */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }} onContextMenu={(e) => e.preventDefault()}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={(changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns))}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          defaultViewport={_savedViewport ?? { x: 0, y: 0, zoom: 1 }}
          fitView={_savedViewport === null}
          fitViewOptions={{ padding: 0.2 }}
          onMoveEnd={(_, vp) => { _savedViewport = vp; }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#181825' }}
        >
          <Background color="#313244" variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls style={{ background: '#1e1e2e', border: '1px solid #313244' }} showInteractive={false} />
        </ReactFlow>
        {edges.some((e) => e.selected) && (
          <Box sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: 0.5, background: '#313244', border: '1px solid #45475a', borderRadius: 1, px: 1, py: 0.5 }}>
            <Typography sx={{ fontSize: 11, color: '#cdd6f4' }}>Connection selected</Typography>
            <Tooltip title="Delete connection">
              <IconButton size="small" onClick={() => handleEdgesChange(edges.filter((e) => e.selected).map((e) => ({ type: 'remove' as const, id: e.id })))} sx={{ color: '#f38ba8', p: 0.25 }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Properties / class builder — shown when a node is selected */}
      {selectedEntity && (
        selectedEntity.kind === 'class'
          ? <ClassBuilderPanel entity={selectedEntity} onClose={() => setSelectedEntityId(null)} />
          : <PropertiesPanel entity={selectedEntity} onClose={() => setSelectedEntityId(null)} />
      )}

      {/* Generated snippets */}
      {snippets.length > 0 && (
        <Box sx={{ borderTop: '1px solid #313244', maxHeight: 130, overflowY: 'auto', background: '#13131e' }}>
          <Typography sx={{ fontSize: 10, color: '#45475a', px: 1.5, py: 0.5, letterSpacing: 1, textTransform: 'uppercase' }}>
            Generated
          </Typography>
          {snippets.map((s) => <SnippetRow key={s.id} snippet={s} />)}
        </Box>
      )}
        </>
      )}
    </Box>
  );
}

function VisualMinisLibPanelWrapped() {
  return <ReactFlowProvider><VisualMinisLibPanel /></ReactFlowProvider>;
}

/* ── Toolbar icons ───────────────────────────────────────────────────────────*/

const ICON_GRAPH = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="13" cy="3.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="13" cy="12.5" r="1.5" stroke="currentColor" stroke-width="1.3"/>
  <path d="M5 7.2l6.5-3M5 8.8l6.5 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

const ICON_EXPORT_MANIFEST = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M8 2v8M5.5 7.5L8 10l2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M3 11v1.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

/* ── Plugin definition ───────────────────────────────────────────────────────*/

const PLUGIN_ID = 'builtin.visual-minislib';

export const VisualMinisLibPlugin = defineEditorPlugin(
  {
    id: PLUGIN_ID,
    name: 'Visual MinisLib',
    version: '1.2.0',
    description: 'Signal-Slot visual graph + properties panel for @mhersztowski/minislib',
    contributes: ['toolbar', 'commandpalette'],
  },

  (api) => {
    let currentUri = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    _onInsertCode = (code) => insertAtEnd(code, currentUri);

    // ── Toolbar ──────────────────────────────────────────────────────────────

    type ToolbarDisposable = ReturnType<typeof api.ui.toolbar.register> | null;
    let toolbarDisposables: ToolbarDisposable[] = [];

    function clearToolbar() {
      toolbarDisposables.forEach((d) => d?.dispose());
      toolbarDisposables = [];
    }

    function updateToolbar() {
      clearToolbar();
      if (!_state.isMinisFile) return;
      toolbarDisposables = [
        api.ui.toolbar.register({ id: 'vml.open',   label: 'Open MinisLib Graph',      icon: ICON_GRAPH,            command: `${PLUGIN_ID}:open`,           group: 'right', order: 160 }),
        api.ui.toolbar.register({ id: 'vml.export', label: 'Export Plugin Manifest',   icon: ICON_EXPORT_MANIFEST,  command: `${PLUGIN_ID}:exportManifest`, group: 'right', order: 161 }),
      ];
    }

    // Re-evaluate toolbar whenever plugin state changes (isMinisFile may flip)
    _stateListeners.add(updateToolbar);

    // ── Commands ─────────────────────────────────────────────────────────────

    api.commands.register('open', () => {
      api.openEditorTab({ uri: 'virtual://visual-minislib', title: 'MinisLib Graph', component: VisualMinisLibPanelWrapped });
    });

    api.commands.register('exportManifest', async () => {
      const { uri, entities } = _state;
      if (!uri || uri.startsWith('virtual://')) return;
      const classCount = entities.filter((e) => e.kind === 'class').length;
      if (classCount === 0) { api.logger.warn('No class definitions to export'); return; }
      try {
        await saveManifestToVfs(uri, generateManifest(entities));
        api.logger.info('minislib-plugin.json exported');
      } catch (err) {
        api.logger.error(`Export failed: ${err}`);
      }
    });

    api.ui.commandpalette.register({ command: `${PLUGIN_ID}:open`,           title: 'Open Signal-Slot Graph',    category: 'MinisLib' });
    api.ui.commandpalette.register({ command: `${PLUGIN_ID}:exportManifest`, title: 'Export Plugin Manifest',    category: 'MinisLib' });

    function updateState(uri: string, code: string) {
      currentUri = uri;
      const isMinisFile = hasMinislibImport(code);
      const { entities, connections } = parseMinisEntities(code);
      const savedPositions = parseGraphMetadata(code);

      const importedClasses: ImportedClass[] = parseNpmImports(code)
        .filter(({ packageName }) => packageName !== '@mhersztowski/minislib')
        .flatMap(({ packageName, names }) =>
          names
            .filter((n) => /^[A-Z]/.test(n)) // keep only PascalCase (likely classes)
            .map((className) => ({ packageName, className })),
        );

      _state = { entities, connections, uri, isMinisFile, currentCode: code, savedPositions, externalClassDefs: [], importedClasses };
      notifyState();

      // Async: load external package manifests and re-parse with discovered classes
      if (isMinisFile) {
        loadExternalClassDefs(code, uri).then(({ byClass, entries }) => {
          if (_state.uri !== uri) return;
          const { entities: ext, connections: extConn } = parseMinisEntities(code, byClass);
          _state = { ..._state, entities: ext, connections: extConn, externalClassDefs: entries };
          notifyState();
        });
      }
    }

    api.editor.onDidOpenDocument((uri, text) => {
      if (uri.startsWith('virtual://')) return; // ignore virtual tabs (graph itself, previews)
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      updateState(uri, text);
    });
    api.editor.onDidChangeModel((uri) => {
      if (uri.startsWith('virtual://')) {
        // User switched to graph tab — flush pending debounce and sync immediately
        // so graph always shows the latest file content without waiting 600ms
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        const effectiveUri = currentUri || _state.uri;
        const model = effectiveUri ? findModel(effectiveUri) : null;
        if (model && effectiveUri) updateState(effectiveUri, model.getValue());
      } else {
        currentUri = uri;
      }
    });
    api.editor.onDidChangeContent((text) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { debounceTimer = null; updateState(currentUri, text); }, 600);
    });

    // On activation (including after HMR), scan open Monaco models to bootstrap state.
    // Without this, after a hot reload no editor events fire and the graph stays empty.
    requestAnimationFrame(() => {
      if (currentUri) return; // already set by an event that fired during activation
      const models = monaco.editor.getModels();
      for (const model of models) {
        const uri = model.uri.path || model.uri.toString();
        if (uri.startsWith('virtual://') || uri.includes('node_modules')) continue;
        const text = model.getValue();
        if (hasMinislibImport(text)) { updateState(uri, text); break; }
      }
    });

    _vfsContentUnsub = globalEventBus.on<{ path: string; content: string }>(
      'system:vfs:fileContent',
      ({ path, content }) => {
        if (path.startsWith('virtual://')) return;
        if (!/\.(ts|js|tsx|jsx)$/i.test(path)) return;
        if (!hasMinislibImport(content)) return;
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        updateState(path, content);
      },
    );

    api.logger.info('Visual MinisLib v1.1 activated');
  },

  () => {
    _vfsContentUnsub?.();
    _vfsContentUnsub = null;
    _onInsertCode = null;
    _state = { entities: [], connections: [], uri: '', isMinisFile: false, currentCode: '', savedPositions: {}, externalClassDefs: [], importedClasses: [] };
    notifyState();
  },
);

// HMR: after Vite replaces this module, re-activate the plugin so the new closure
// (new _state, new listeners) is used instead of the stale old one.
if (import.meta.hot) {
  import.meta.hot.accept(async () => {
    // Deactivate old plugin (disposes old listeners, resets old _state)
    await globalPluginRegistry.deactivate(PLUGIN_ID);
    // Replace with new plugin definition from this module evaluation
    globalPluginRegistry.unregister(PLUGIN_ID);
    globalPluginRegistry.register(VisualMinisLibPlugin);
    await globalPluginRegistry.activate(PLUGIN_ID);
  });
}
