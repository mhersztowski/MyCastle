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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DownloadIcon from '@mui/icons-material/Download';
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
  MTimer: 'timer',
  MStateMachine: 'fsm',
  MEventBus: 'bus',
  MCommandStack: 'commandstack',
  MListModel: 'listmodel',
  MLogger: 'logger',
};

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
    const signals = [...BUILTIN_SIGNALS[baseKind], ...parseSignalPorts(body)];
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
      entities.push({ id: nextId(), varName, label: `${varName}:${className}`, kind: builtinKind, signals: [...BUILTIN_SIGNALS[builtinKind]], slots: [], constructorArgs, paramDefs: BUILTIN_PARAM_DEFS[builtinKind] ?? [] });
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

function replaceModelContent(model: monaco.editor.ITextModel, newCode: string) {
  const full = model.getFullModelRange();
  model.pushEditOperations([], [{ range: full, text: newCode }], () => null);
  markDirty(model.uri.path);
  // pushEditOperations doesn't fire onDidChangeContent when graph tab is active —
  // keep _state.currentCode in sync so next patch has the correct base
  _state = { ..._state, currentCode: newCode };
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
  return true;
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

/* ── Add-node toolbar ────────────────────────────────────────────────────────*/

interface FlatEntry { packageName: string; className: string; paramDefs?: ParamDef[]; }

function AddNodeMenu({ uri: _uri, externalClassDefs, importedClasses, entities }: { uri: string; externalClassDefs: ExternalClassEntry[]; importedClasses: ImportedClass[]; entities: MinisEntity[] }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [filter, setFilter] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (anchorEl) setTimeout(() => filterRef.current?.focus(), 50);
    else setFilter('');
  }, [anchorEl]);

  // Build flat list: manifest entries first, then plain imports (deduplicated)
  const allEntries: FlatEntry[] = useMemo(() => {
    const manifestNames = new Set(externalClassDefs.map((e) => e.className));
    const fromManifest: FlatEntry[] = externalClassDefs.map((e) => ({
      packageName: e.packageName, className: e.className, paramDefs: e.def.paramDefs,
    }));
    const fromImports: FlatEntry[] = importedClasses
      .filter(({ className }) => !manifestNames.has(className))
      .map(({ packageName, className }) => ({ packageName, className }));
    return [...fromManifest, ...fromImports];
  }, [externalClassDefs, importedClasses]);

  const q = filter.toLowerCase();
  const visible = q
    ? allEntries.filter((e) => e.className.toLowerCase().includes(q) || e.packageName.toLowerCase().includes(q))
    : allEntries;

  if (allEntries.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, gap: 0.75, borderBottom: '1px solid #313244', background: '#13131e' }}>
        <ExportManifestButton uri={_uri} entities={entities} />
      </Box>
    );
  }

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
            <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>🧩</span>
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

  const selectedEntity = selectedEntityId ? entities.find((e) => e.id === selectedEntityId) ?? null : null;

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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#181825' }}>
      {/* Add-node toolbar — always visible when a valid file is open */}
      <AddNodeMenu uri={uri} externalClassDefs={externalClassDefs} importedClasses={importedClasses} entities={entities} />

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
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={(changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns))}
          onEdgesChange={(changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es))}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#181825' }}
        >
          <Background color="#313244" variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls style={{ background: '#1e1e2e', border: '1px solid #313244' }} showInteractive={false} />
        </ReactFlow>
      </Box>

      {/* Properties panel — shown when a node is selected */}
      {selectedEntity && (
        <PropertiesPanel entity={selectedEntity} onClose={() => setSelectedEntityId(null)} />
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

/* ── Plugin definition ───────────────────────────────────────────────────────*/

const PLUGIN_ID = 'builtin.visual-minislib';

export const VisualMinisLibPlugin = defineEditorPlugin(
  {
    id: PLUGIN_ID,
    name: 'Visual MinisLib',
    version: '1.1.0',
    description: 'Signal-Slot visual graph + properties panel for @mhersztowski/minislib',
    contributes: ['commandpalette'],
  },

  (api) => {
    let currentUri = '';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    _onInsertCode = (code) => insertAtEnd(code, currentUri);

    api.commands.register('open', () => {
      api.openEditorTab({ uri: 'virtual://visual-minislib', title: 'MinisLib Graph', component: VisualMinisLibPanelWrapped });
    });
    api.ui.commandpalette.register({ command: `${PLUGIN_ID}:open`, title: 'Open Signal-Slot Graph', category: 'MinisLib' });

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
