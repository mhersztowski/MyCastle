/**
 * Graphical UML class-diagram editor with multi-diagram projects, per-member
 * elements and a git-like version history (commits + branches).
 *
 * A *project* is a single `*.umlproj.json` file in the user's VFS under
 * `drive/uml/`. It holds:
 *   • a working tree (`diagrams`) — what you currently edit
 *   • a `history` (commits keyed by id, branches → commit-tip, current `head`)
 *
 * Every class member (field / method) is a first-class element with its own
 * id, so history and editing operate at member granularity.
 *
 * Associations work on two levels:
 *   • project ↔ a directory in the user's filesystem (`linkedPath`)
 *   • class (node) ↔ a source file (`data.linkedFile`)
 */
import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { useParams } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  ConnectionMode,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box, Button, Stack, Typography, IconButton, Tooltip, Divider, TextField, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemButton,
  ListItemText, ListItemIcon, Collapse, Paper, Snackbar, Alert, Chip, Breadcrumbs,
  Link as MuiLink, CircularProgress, useMediaQuery, useTheme, Popover, Tabs, Tab, Checkbox,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import TuneIcon from '@mui/icons-material/Tune';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import AddBoxIcon from '@mui/icons-material/AddBox';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SchemaIcon from '@mui/icons-material/Schema';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import CommitIcon from '@mui/icons-material/Commit';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import RestoreIcon from '@mui/icons-material/Restore';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { readUserJson, writeUserJson } from '../../services/userJson';
import { minisApi } from '../../services/MinisApiService';
import { useLayoutChrome } from '../../components/Layout';
import { AccountMenu } from '../../components/AccountMenu';

// ──────────────────────────────────────────────────────────────────────────
// Model
// ──────────────────────────────────────────────────────────────────────────

type UmlKind = 'class' | 'abstract' | 'interface' | 'enum' | 'struct' | 'module';
type MemberKind = 'field' | 'method';

/**
 * Metadane dokumentacji w standardzie TSDoc — ten sam kształt, co `DocMeta`
 * w devtools, żeby import „Z kodu" był kopiowaniem, a nie tłumaczeniem.
 */
interface UmlDoc {
  summary?: string;
  remarks?: string;
  /** Opisy argumentów po nazwie (`@param`). */
  params?: Record<string, string>;
  returns?: string;
  examples?: string[];
  deprecated?: string;
  see?: string[];
  tags?: string[];
}

interface UmlMember { id: string; kind: MemberKind; text: string; category?: string; doc?: UmlDoc }

/** Aktywny filtr kategorii składowych — null = pokaż wszystkie. */
const CategoryFilterContext = createContext<string | null>(null);

/**
 * Składa metadane TSDoc w tekst do podpowiedzi. Kolejność jak w dokumentacji:
 * opis, uwagi, argumenty, zwracana wartość, przykład — dzięki temu najważniejsze
 * zdanie widać od razu, bez rozwijania.
 */
function docTooltip(doc?: UmlDoc): string {
  if (!doc) return '';
  const lines: string[] = [];
  if (doc.deprecated !== undefined) lines.push(`⚠ Przestarzałe${doc.deprecated ? `: ${doc.deprecated}` : ''}`);
  if (doc.summary) lines.push(doc.summary);
  if (doc.remarks) lines.push(doc.remarks);
  const params = Object.entries(doc.params ?? {});
  if (params.length) {
    lines.push('Argumenty:');
    for (const [name, description] of params) lines.push(`  • ${name} — ${description}`);
  }
  if (doc.returns) lines.push(`Zwraca: ${doc.returns}`);
  if (doc.examples?.length) lines.push(`Przykład:\n${doc.examples[0]}`);
  if (doc.see?.length) lines.push(`Zobacz: ${doc.see.join(', ')}`);
  return lines.join('\n');
}

/** Czy element ma jakąkolwiek dokumentację (do pokazania znacznika na węźle). */
function hasDoc(doc?: UmlDoc): boolean {
  return !!doc && Object.values(doc).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''));
}

/** Deterministyczny kolor kropki kategorii (ta sama nazwa → ten sam kolor). */
function categoryColor(cat: string): string {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

interface UmlNodeData extends Record<string, unknown> {
  kind: UmlKind;
  name: string;
  members: UmlMember[];
  /** User-root-relative path of a source file this class maps to. */
  linkedFile?: string;
  /** Dokumentacja TSDoc klasy/interfejsu/modułu (z kodu albo dopisana ręcznie). */
  doc?: UmlDoc;
}
type UmlNode = Node<UmlNodeData>;

type RelType =
  | 'association' | 'directed' | 'aggregation' | 'composition'
  | 'generalization' | 'realization' | 'dependency';

interface UmlEdgeData extends Record<string, unknown> { relType: RelType; label?: string }

interface UmlDiagram { id: string; name: string; nodes: UmlNode[]; edges: Edge<UmlEdgeData>[] }

interface ProjectSnapshot { diagrams: UmlDiagram[]; linkedPath?: string }
interface UmlCommit { id: string; message: string; at: number; parents: string[]; snapshot: ProjectSnapshot }
interface UmlHistory {
  commits: Record<string, UmlCommit>;
  branches: Record<string, string>; // branchName → tip commit id
  head: string;                     // current branch
}

interface UmlProject {
  type: 'uml-project';
  version: 2;
  name: string;
  linkedPath?: string;
  diagrams: UmlDiagram[]; // working tree
  history: UmlHistory;
  updatedAt: number;
  /** Output files generated from the model (JSON Schema / .d.ts), by rel path. */
  outputs?: string[];
}

const KIND_META: Record<UmlKind, { stereotype: string | null; color: string; label: string }> = {
  class: { stereotype: null, color: '#1976d2', label: 'Class' },
  abstract: { stereotype: '«abstract»', color: '#6a1b9a', label: 'Abstract' },
  interface: { stereotype: '«interface»', color: '#00838f', label: 'Interface' },
  enum: { stereotype: '«enumeration»', color: '#ef6c00', label: 'Enum' },
  struct: { stereotype: '«struct»', color: '#546e7a', label: 'Struct' },
  module: { stereotype: '«module»', color: '#37474f', label: 'Module' },
};

const REL_META: Record<RelType, { label: string; markerStart?: string; markerEnd?: string; dashed?: boolean }> = {
  association: { label: 'Association' },
  directed: { label: 'Directed', markerEnd: 'url(#uml-arrow-open)' },
  dependency: { label: 'Dependency', markerEnd: 'url(#uml-arrow-open)', dashed: true },
  generalization: { label: 'Generalization (extends)', markerEnd: 'url(#uml-triangle)' },
  realization: { label: 'Realization (implements)', markerEnd: 'url(#uml-triangle)', dashed: true },
  aggregation: { label: 'Aggregation', markerStart: 'url(#uml-diamond-hollow)' },
  composition: { label: 'Composition', markerStart: 'url(#uml-diamond-filled)' },
};

const REL_ORDER: RelType[] = ['association', 'directed', 'aggregation', 'composition', 'generalization', 'realization', 'dependency'];

const UML_DIR = 'drive/uml';
const PROJ_EXT = '.umlproj.json';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ──────────────────────────────────────────────────────────────────────────
// VFS helpers
// ──────────────────────────────────────────────────────────────────────────

const FILE_TYPE = 1;
const DIR_TYPE = 2;
interface VfsEntry { name: string; type: number }

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

function userRootPath(userName: string, rel = ''): string {
  const cleaned = rel.replace(/^\/+|\/+$/g, '');
  return `/data/Minis/Users/${userName}${cleaned ? `/${cleaned}` : ''}`;
}

/**
 * Prefiks ścieżek wskazujących na drzewo źródeł MyCastle (montowane w VFS jako
 * `/mycastle-code`). Trzymamy go w ścieżce, a nie w osobnym polu, bo `linkedPath`
 * projektu to jeden string — dzięki temu powiązanie z `packages/…` zapisuje się
 * i wczytuje bez zmiany formatu pliku projektu.
 */
const CODE_PREFIX = 'mycastle-code';

function isCodePath(rel: string): boolean {
  return rel === CODE_PREFIX || rel.startsWith(`${CODE_PREFIX}/`);
}

/** Ścieżka w VFS dla dowolnego źródła — katalog użytkownika albo kod aplikacji. */
function vfsPathFor(userName: string, rel: string): string {
  const cleaned = rel.replace(/^\/+|\/+$/g, '');
  if (isCodePath(cleaned)) return `/${cleaned}`;
  return userRootPath(userName, cleaned);
}

async function vfsReaddir(userName: string, rel: string): Promise<VfsEntry[]> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readdir`, window.location.origin);
  u.searchParams.set('path', vfsPathFor(userName, rel));
  const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
  if (!r.ok) return [];
  const json = await r.json() as { entries?: VfsEntry[] };
  return (json.entries ?? []).sort((a, b) => (a.type !== b.type ? (a.type === DIR_TYPE ? -1 : 1) : a.name.localeCompare(b.name)));
}

async function vfsReadText(userName: string, rel: string): Promise<string | null> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readFile`, window.location.origin);
  u.searchParams.set('path', vfsPathFor(userName, rel));
  const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
  if (!r.ok) return null;
  const json = await r.json() as { data?: string };
  if (!json.data) return '';
  const binary = atob(json.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function vfsWriteText(userName: string, rel: string, text: string): Promise<void> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/writeFile`, window.location.origin);
  u.searchParams.set('path', userRootPath(userName, rel));
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const r = await fetch(u.pathname + u.search, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data: btoa(binary), options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeText ${rel}: HTTP ${r.status}`);
}

// ── Code generation from the UML model ──────────────────────────────────────
interface GenField { name: string; type: string; optional: boolean }

function umlStripSigil(text: string): string {
  let t = text.trim();
  if (t && ['+', '-', '#', '~'].includes(t[0])) t = t.slice(1).trim();
  return t;
}
function umlParseField(text: string): GenField {
  const t = umlStripSigil(text);
  const i = t.indexOf(':');
  let namePart = (i < 0 ? t : t.slice(0, i)).trim();
  const type = i < 0 ? 'any' : t.slice(i + 1).trim();
  // `name?: type` → optional field (the `?` is dropped from the property name).
  const optional = namePart.endsWith('?');
  if (optional) namePart = namePart.slice(0, -1).trim();
  return { name: namePart, type, optional };
}
/** True if a field member's text uses the `name?: type` optional form. */
function fieldNameOptional(text: string): boolean {
  const t = umlStripSigil(text);
  const i = t.indexOf(':');
  return (i < 0 ? t : t.slice(0, i)).trim().endsWith('?');
}
/** Tag any `name?: type` field with the "optional" category (e.g. after a code import). */
function normalizeOptionalProject(p: UmlProject): UmlProject {
  return {
    ...p,
    diagrams: p.diagrams.map((d) => ({
      ...d,
      nodes: d.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          members: (n.data as UmlNodeData).members.map((m) =>
            (m.kind === 'field' && m.category !== 'optional' && fieldNameOptional(m.text) ? { ...m, category: 'optional' } : m)),
        },
      })),
    })),
  };
}
// Collect every class/enum across ALL diagrams. A type shown on more than one
// diagram (often once with members, once as a bare reference) is MERGED by name
// — fields/methods/enum-values are unioned — so nothing is dropped when a later,
// emptier occurrence would otherwise overwrite the rich one.
function umlCollectModel(diagrams: UmlDiagram[]): {
  classes: { name: string; fields: GenField[]; methods: string[] }[];
  enums: { name: string; values: string[] }[];
} {
  interface ClassAcc { name: string; fields: GenField[]; fieldNames: Set<string>; methods: string[]; methodSet: Set<string> }
  interface EnumAcc { name: string; values: string[]; valueSet: Set<string> }
  const classes = new Map<string, ClassAcc>();
  const enums = new Map<string, EnumAcc>();
  for (const d of diagrams) for (const n of d.nodes) {
    const data = n.data as UmlNodeData;
    const name = (data.name || '').trim();
    if (!name) continue;
    if (data.kind === 'enum') {
      let e = enums.get(name);
      if (!e) { e = { name, values: [], valueSet: new Set() }; enums.set(name, e); }
      for (const m of data.members) {
        if (m.kind !== 'field') continue;
        const v = umlStripSigil(m.text);
        if (v && !e.valueSet.has(v)) { e.valueSet.add(v); e.values.push(v); }
      }
    } else {
      let c = classes.get(name);
      if (!c) { c = { name, fields: [], fieldNames: new Set(), methods: [], methodSet: new Set() }; classes.set(name, c); }
      for (const m of data.members) {
        if (m.kind === 'field') {
          const p = umlParseField(m.text);
          if (!p.name || c.fieldNames.has(p.name)) continue;
          c.fieldNames.add(p.name);
          c.fields.push({ ...p, optional: p.optional || m.category === 'optional' });
        } else {
          const t = umlStripSigil(m.text);
          if (t && !c.methodSet.has(t)) { c.methodSet.add(t); c.methods.push(t); }
        }
      }
    }
  }
  return {
    classes: [...classes.values()].map((c) => ({ name: c.name, fields: c.fields, methods: c.methods })),
    enums: [...enums.values()].map((e) => ({ name: e.name, values: e.values })),
  };
}

const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

// Map a UML/TS-ish type string to a JSON Schema fragment. `ref` resolves a named
// type to a $ref target (in-document `#/$defs/X` vs sibling-file `X.schema.json`).
function jsonTypeFromTs(ts: string, ref: (name: string) => string): Record<string, unknown> {
  const t = ts.trim().replace(/;$/, '');
  const arr = t.match(/^(.+)\[\]$/) || t.match(/^Array<(.+)>$/);
  if (arr) return { type: 'array', items: jsonTypeFromTs(arr[1], ref) };
  // Literal types are constant values, NOT type references — emit const/enum so
  // a discriminator like `type: "person"` doesn't become a bogus `$ref`.
  const strLit = t.match(/^"([^"]*)"$/) || t.match(/^'([^']*)'$/);
  if (strLit) return { type: 'string', const: strLit[1] };
  if (/^(['"][^'"]*['"]\s*\|\s*)+['"][^'"]*['"]$/.test(t)) {
    return { type: 'string', enum: t.split('|').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) };
  }
  if (/^-?\d+(\.\d+)?$/.test(t)) return { type: 'number', const: Number(t) };
  if (t === 'true' || t === 'false') return { type: 'boolean', const: t === 'true' };
  switch (t.toLowerCase()) {
    case 'string': return { type: 'string' };
    case 'number': case 'int': case 'integer': case 'long': case 'float': case 'double': return { type: 'number' };
    case 'boolean': case 'bool': return { type: 'boolean' };
    case '': case 'any': case 'unknown': case 'object': return {};
    default: return { $ref: ref(t) };
  }
}
// Split schema: one file per type (cross-referenced by sibling-file $ref) plus a
// `{baseName}.schema.json` index that $refs every type.
function generateUmlJsonSchemaFiles(diagrams: UmlDiagram[], baseName: string): { name: string; content: string }[] {
  const { classes, enums } = umlCollectModel(diagrams);
  const ref = (n: string) => `${n}.schema.json`;
  const files: { name: string; content: string }[] = [];
  for (const e of enums) {
    files.push({ name: `${e.name}.schema.json`, content: JSON.stringify({ $schema: JSON_SCHEMA_DIALECT, $id: `${e.name}.schema.json`, title: e.name, enum: e.values }, null, 2) + '\n' });
  }
  for (const c of classes) {
    const properties: Record<string, unknown> = {};
    for (const f of c.fields) properties[f.name] = jsonTypeFromTs(f.type, ref);
    const required = c.fields.filter((f) => !f.optional).map((f) => f.name);
    files.push({ name: `${c.name}.schema.json`, content: JSON.stringify({ $schema: JSON_SCHEMA_DIALECT, $id: `${c.name}.schema.json`, title: c.name, type: 'object', properties, ...(required.length ? { required } : {}) }, null, 2) + '\n' });
  }
  const $defs: Record<string, unknown> = {};
  for (const e of enums) $defs[e.name] = { $ref: ref(e.name) };
  for (const c of classes) $defs[c.name] = { $ref: ref(c.name) };
  files.push({ name: `${baseName}.schema.json`, content: JSON.stringify({ $schema: JSON_SCHEMA_DIALECT, title: baseName, $defs }, null, 2) + '\n' });
  return files;
}

const TS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function generateUmlDts(diagrams: UmlDiagram[]): string {
  const { classes, enums } = umlCollectModel(diagrams);
  const blocks: string[] = [];
  for (const e of enums) {
    const union = e.values.length ? e.values.map((v) => JSON.stringify(v)).join(' | ') : 'never';
    blocks.push(`export type ${e.name} = ${union};`);
  }
  for (const c of classes) {
    const lines: string[] = [];
    for (const f of c.fields) lines.push(`  ${TS_IDENT.test(f.name) ? f.name : JSON.stringify(f.name)}${f.optional ? '?' : ''}: ${f.type || 'unknown'};`);
    for (const m of c.methods) lines.push(`  ${m.replace(/;$/, '')};`);
    blocks.push(`export interface ${c.name} {\n${lines.join('\n')}\n}`);
  }
  return (blocks.length ? blocks.join('\n\n') : '// (no classes/enums in the model)') + '\n';
}

async function ensureUmlDir(userName: string): Promise<void> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/mkdir`, window.location.origin);
  u.searchParams.set('path', userRootPath(userName, UML_DIR));
  try { await fetch(u.pathname + u.search, { method: 'POST', headers: authHeaders() }); } catch { /* may exist */ }
}

async function listProjectFiles(userName: string): Promise<string[]> {
  const entries = await vfsReaddir(userName, UML_DIR);
  return entries.filter((e) => e.type === FILE_TYPE && e.name.toLowerCase().endsWith(PROJ_EXT)).map((e) => e.name);
}

async function readProject(userName: string, file: string): Promise<UmlProject | null> {
  const raw = await readUserJson<unknown>(userName, `${UML_DIR}/${file}`);
  return raw ? migrateProject(raw) : null;
}

async function writeProject(userName: string, file: string, project: UmlProject): Promise<void> {
  await ensureUmlDir(userName);
  await writeUserJson(userName, `${UML_DIR}/${file}`, project);
}

async function deleteProjectFile(userName: string, file: string): Promise<void> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/delete`, window.location.origin);
  u.searchParams.set('path', userRootPath(userName, `${UML_DIR}/${file}`));
  await fetch(u.pathname + u.search, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ options: { recursive: false } }) });
}

function normaliseProjectFile(raw: string): string {
  let name = raw.trim().replace(/[\\/]+/g, '-');
  if (!name) name = 'project';
  if (!name.toLowerCase().endsWith(PROJ_EXT)) name = name.replace(/\.json$/i, '').replace(/\.umlproj$/i, '') + PROJ_EXT;
  return name;
}

function projectDisplayName(file: string): string {
  return file.replace(new RegExp(`${PROJ_EXT.replace('.', '\\.')}$`, 'i'), '');
}

// ──────────────────────────────────────────────────────────────────────────
// Factories + migration
// ──────────────────────────────────────────────────────────────────────────

let idSeq = 1;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${idSeq++}`;
const member = (kind: MemberKind, text: string, category?: string): UmlMember => ({ id: nextId('m'), kind, text, category });

// Reorder a member (by id) to another member's slot, within its own kind, while
// keeping the positions of the other kind's members untouched.
function reorderWithinKind(ms: UmlMember[], fromId: string, toId: string): UmlMember[] {
  const moving = ms.find((m) => m.id === fromId);
  if (!moving) return ms;
  const kind = moving.kind;
  const sameKind = ms.filter((m) => m.kind === kind);
  const fromIdx = sameKind.findIndex((m) => m.id === fromId);
  const toIdx = sameKind.findIndex((m) => m.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return ms;
  const [mv] = sameKind.splice(fromIdx, 1);
  sameKind.splice(toIdx, 0, mv);
  let i = 0;
  return ms.map((m) => (m.kind === kind ? sameKind[i++] : m));
}

function makeNode(kind: UmlKind, position: { x: number; y: number }): UmlNode {
  const members = kind === 'enum'
    ? [member('field', 'VALUE_A'), member('field', 'VALUE_B')]
    : [member('field', '- field: type'), member('method', '+ method(): void')];
  return { id: nextId('n'), type: 'umlClass', position, data: { kind, name: KIND_META[kind].label, members } };
}

function seedDiagram(name: string): UmlDiagram {
  const animal: UmlNode = { id: nextId('n'), type: 'umlClass', position: { x: 220, y: 40 }, data: { kind: 'abstract', name: 'Animal', members: [member('field', '- name: string'), member('method', '+ makeSound(): void')] } };
  const dog: UmlNode = { id: nextId('n'), type: 'umlClass', position: { x: 80, y: 280 }, data: { kind: 'class', name: 'Dog', members: [member('field', '- breed: string'), member('method', '+ makeSound(): void')] } };
  const owner: UmlNode = { id: nextId('n'), type: 'umlClass', position: { x: 400, y: 280 }, data: { kind: 'class', name: 'Owner', members: [member('field', '- pets: Animal[]'), member('method', '+ adopt(a: Animal): void')] } };
  return {
    id: nextId('d'), name,
    nodes: [animal, dog, owner],
    edges: [
      { id: nextId('e'), source: dog.id, target: animal.id, sourceHandle: 't', targetHandle: 'b', type: 'uml', data: { relType: 'generalization' } },
      { id: nextId('e'), source: owner.id, target: animal.id, sourceHandle: 'l', targetHandle: 'r', type: 'uml', data: { relType: 'aggregation' } },
    ],
  };
}

const emptyDiagram = (name: string): UmlDiagram => ({ id: nextId('d'), name, nodes: [], edges: [] });

function initialHistory(diagrams: UmlDiagram[], linkedPath: string | undefined, message: string): UmlHistory {
  const id = nextId('c');
  return {
    commits: { [id]: { id, message, at: Date.now(), parents: [], snapshot: { diagrams: clone(diagrams), linkedPath } } },
    branches: { main: id },
    head: 'main',
  };
}

function makeProject(name: string, seeded: boolean): UmlProject {
  const diagrams = [seeded ? seedDiagram('Diagram 1') : emptyDiagram('Diagram 1')];
  return { type: 'uml-project', version: 2, name, diagrams, history: initialHistory(diagrams, undefined, 'Początek'), updatedAt: Date.now(), outputs: [] };
}

/** Accept any saved shape (v1 string-array members or v2) → canonical v2. */
function migrateProject(raw: unknown): UmlProject {
  const r = raw as Record<string, any>;
  const migNode = (n: any): UmlNode => {
    const data = n.data ?? {};
    let members: UmlMember[];
    if (Array.isArray(data.members)) {
      members = data.members.map((m: any) => ({ id: m.id ?? nextId('m'), kind: m.kind === 'method' ? 'method' : 'field', text: String(m.text ?? ''), category: m.category || undefined, doc: m.doc || undefined }));
    } else {
      members = [
        ...(data.attributes ?? []).map((t: string) => member('field', t)),
        ...(data.methods ?? []).map((t: string) => member('method', t)),
      ];
    }
    return { id: n.id, type: 'umlClass', position: n.position ?? { x: 0, y: 0 }, data: { kind: data.kind ?? 'class', name: data.name ?? 'Class', members, linkedFile: data.linkedFile } };
  };
  const migDiagram = (d: any): UmlDiagram => ({
    id: d.id ?? nextId('d'), name: d.name ?? 'Diagram',
    nodes: (d.nodes ?? []).map(migNode),
    edges: (d.edges ?? []).map((e: any) => ({ ...e, type: 'uml' })),
  });
  // v1 single-diagram file (uml-scene) → wrap as one diagram
  const diagrams: UmlDiagram[] = Array.isArray(r.diagrams)
    ? r.diagrams.map(migDiagram)
    : [migDiagram({ id: nextId('d'), name: 'Diagram 1', nodes: r.nodes, edges: r.edges })];
  let history: UmlHistory | undefined = r.history;
  if (!history || !history.commits || !history.branches || !history.head || !history.branches[history.head]) {
    history = initialHistory(diagrams, r.linkedPath, 'Import');
  } else {
    // migrate commit snapshots too (older member shapes)
    const commits: Record<string, UmlCommit> = {};
    for (const [id, c] of Object.entries(history.commits as Record<string, any>)) {
      const snapDiagrams = (c.snapshot?.diagrams ?? []).map(migDiagram);
      commits[id] = { id: c.id, message: c.message ?? '', at: c.at ?? Date.now(), parents: c.parents ?? [], snapshot: { diagrams: snapDiagrams, linkedPath: c.snapshot?.linkedPath } };
    }
    history = { commits, branches: history.branches, head: history.head };
  }
  return { type: 'uml-project', version: 2, name: r.name ?? 'Project', linkedPath: r.linkedPath, diagrams, history, updatedAt: r.updatedAt ?? Date.now(), outputs: Array.isArray(r.outputs) ? (r.outputs.filter((x: unknown) => typeof x === 'string') as string[]) : [] };
}

const cleanNodes = (nodes: UmlNode[]): UmlNode[] => nodes.map((n) => ({ id: n.id, type: 'umlClass', position: n.position, data: n.data }));
const cleanEdges = (edges: Edge<UmlEdgeData>[]): Edge<UmlEdgeData>[] =>
  edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: 'uml', data: e.data }));

function headCommit(h: UmlHistory): UmlCommit | undefined { return h.commits[h.branches[h.head]]; }
function ancestry(h: UmlHistory, branch: string): UmlCommit[] {
  const out: UmlCommit[] = [];
  const seen = new Set<string>();
  let id: string | undefined = h.branches[branch];
  while (id !== undefined && !seen.has(id)) {
    const c: UmlCommit | undefined = h.commits[id];
    if (!c) break;
    seen.add(id);
    out.push(c);
    id = c.parents[0];
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Custom node
// ──────────────────────────────────────────────────────────────────────────

const handleStyle = { width: 9, height: 9, background: '#fff', border: '2px solid #888' };

const VIS_ORDER = ['+', '#', '~', '-'] as const;
const VIS_LABEL: Record<string, string> = { '+': 'public', '#': 'protected', '~': 'package', '-': 'private' };
const VIS_COLOR: Record<string, string> = { '+': '#4caf50', '#': '#ff9800', '~': '#2196f3', '-': '#f44336' };

/** Extract the leading visibility sigil from a rendered UML member text. */
function memberSigil(text: string): string {
  const ch = text.trimStart()[0];
  return (ch === '+' || ch === '-' || ch === '#' || ch === '~') ? ch : '+';
}

/** Replace (or prepend) the leading visibility sigil in a UML member text line. */
function changeTextSigil(text: string, sig: string): string {
  const trimmed = text.trimStart();
  const first = trimmed[0];
  if (first === '+' || first === '-' || first === '#' || first === '~') {
    return sig + trimmed.slice(1);
  }
  return sig + ' ' + trimmed;
}

function MemberLines({ members }: { members: UmlMember[] }) {
  const groups = VIS_ORDER
    .map(sig => ({ sig, items: members.filter(m => memberSigil(m.text) === sig) }))
    .filter(g => g.items.length > 0);
  const multiVis = groups.length > 1;

  return (
    <Box sx={{ px: 1, py: 0.5, minHeight: 18, borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'pre' }}>
      {members.length === 0
        ? <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>&nbsp;</Typography>
        : groups.map(({ sig, items }, gi) => (
          <Box key={sig}>
            {multiVis && gi > 0 && (
              <Box sx={{ mx: -1, px: 1, borderTop: '1px dashed', borderColor: 'divider', mt: 0.25 }}>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', fontFamily: 'monospace', lineHeight: 1.4 }}>
                  {VIS_LABEL[sig]}
                </Typography>
              </Box>
            )}
            {items.map(m => (
              // `title` (a nie Tooltip MUI) — węzły diagramu przerysowują się
              // przy każdym przesunięciu, a natywna podpowiedź nic nie kosztuje
              // i zachowuje podział na linie.
              <Typography
                key={m.id}
                title={docTooltip(m.doc)}
                sx={{
                  fontSize: 11, lineHeight: 1.5, fontFamily: 'monospace',
                  textDecoration: m.doc?.deprecated !== undefined ? 'line-through' : 'none',
                  cursor: hasDoc(m.doc) ? 'help' : 'default',
                }}
              >
                {m.category && (
                  <Box component="span" title={m.category} sx={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', bgcolor: categoryColor(m.category), mr: 0.5, verticalAlign: 'middle' }} />
                )}
                {m.text}
                {hasDoc(m.doc) && (
                  <Box component="span" sx={{ ml: 0.5, opacity: 0.5, fontSize: 9 }}>ⓘ</Box>
                )}
              </Typography>
            ))}
          </Box>
        ))
      }
    </Box>
  );
}

function UmlClassNode({ data, selected }: NodeProps<UmlNode>) {
  const meta = KIND_META[data.kind];
  const italic = data.kind === 'abstract' || data.kind === 'interface';
  const filter = useContext(CategoryFilterContext);
  const visible = (ms: UmlMember[]) => (filter ? ms.filter((m) => m.category === filter) : ms);
  const fields = visible(data.members.filter((m) => m.kind === 'field'));
  const methods = visible(data.members.filter((m) => m.kind === 'method'));
  return (
    <Box sx={{ minWidth: 160, bgcolor: 'background.paper', border: '2px solid', borderColor: selected ? meta.color : 'divider', borderRadius: 1, boxShadow: selected ? `0 0 0 2px ${meta.color}55` : 1, fontSize: 12, overflow: 'hidden' }}>
      <Handle id="t" type="source" position={Position.Top} style={handleStyle} />
      <Handle id="r" type="source" position={Position.Right} style={handleStyle} />
      <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="l" type="source" position={Position.Left} style={handleStyle} />
      <Box sx={{ px: 1, py: 0.5, textAlign: 'center', position: 'relative', bgcolor: `${meta.color}14`, borderBottom: '1px solid', borderColor: 'divider' }}>
        {data.linkedFile && (
          <Tooltip title={`Plik: ${data.linkedFile}`}><LinkIcon sx={{ position: 'absolute', top: 3, right: 3, fontSize: 13, color: meta.color }} /></Tooltip>
        )}
        {meta.stereotype && <Typography sx={{ fontSize: 10, fontStyle: 'italic', color: meta.color, lineHeight: 1.2 }}>{meta.stereotype}</Typography>}
        <Typography
          title={docTooltip(data.doc)}
          sx={{
            fontWeight: 700, fontStyle: italic ? 'italic' : 'normal', color: meta.color, lineHeight: 1.3,
            cursor: hasDoc(data.doc) ? 'help' : 'default',
          }}
        >
          {data.name || 'Unnamed'}
          {hasDoc(data.doc) && <Box component="span" sx={{ ml: 0.5, opacity: 0.55, fontSize: 10 }}>ⓘ</Box>}
        </Typography>
      </Box>
      <MemberLines members={fields} />
      <MemberLines members={methods} />
    </Box>
  );
}

function UmlEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<Edge<UmlEdgeData>>) {
  const relType = (data?.relType ?? 'association') as RelType;
  const rel = REL_META[relType];
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
  return (
    <>
      <BaseEdge id={id} path={path} markerStart={rel.markerStart} markerEnd={rel.markerEnd} style={{ stroke: selected ? '#1976d2' : '#607d8b', strokeWidth: selected ? 2 : 1.5, strokeDasharray: rel.dashed ? '6 4' : undefined }} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, fontSize: 11, background: 'rgba(255,255,255,0.85)', padding: '0 4px', borderRadius: 3, pointerEvents: 'none' }}>{data.label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { umlClass: UmlClassNode };
const EDGE_TYPES = { uml: UmlEdge };

function UmlMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        <marker id="uml-triangle" markerWidth="22" markerHeight="22" refX="15" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L15,7 L1,13 Z" fill="#fff" stroke="#607d8b" strokeWidth="1.5" /></marker>
        <marker id="uml-arrow-open" markerWidth="20" markerHeight="20" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11" fill="none" stroke="#607d8b" strokeWidth="1.5" /></marker>
        <marker id="uml-diamond-filled" markerWidth="26" markerHeight="18" refX="2" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M2,6 L11,1 L20,6 L11,11 Z" fill="#607d8b" stroke="#607d8b" strokeWidth="1" /></marker>
        <marker id="uml-diamond-hollow" markerWidth="26" markerHeight="18" refX="2" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M2,6 L11,1 L20,6 L11,11 Z" fill="#fff" stroke="#607d8b" strokeWidth="1.5" /></marker>
      </defs>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// VFS picker + file preview dialogs
// ──────────────────────────────────────────────────────────────────────────

function VfsPickerDialog({ open, userName, mode, title, onPick, onClose }: { open: boolean; userName: string; mode: 'dir' | 'file'; title: string; onPick: (rel: string, files?: string[]) => void; onClose: () => void }) {
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState<VfsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  /** Źródło plików: katalog użytkownika albo drzewo źródeł aplikacji (read-only). */
  const [source, setSource] = useState<'user' | 'code'>('user');
  /**
   * Zaznaczone pliki (ścieżki względem korzenia źródła). Pusty zbiór = bierzemy
   * cały katalog — dzięki temu dotychczasowy sposób pracy działa bez zmian,
   * a zaznaczenie zawęża diagram do wybranych klas.
   */
  const [checked, setChecked] = useState<string[]>([]);
  const toggleFile = (rel: string) =>
    setChecked((prev) => (prev.includes(rel) ? prev.filter((f) => f !== rel) : [...prev, rel]));
  const load = useCallback(async (rel: string) => { setLoading(true); try { setEntries(await vfsReaddir(userName, rel)); setCwd(rel); } finally { setLoading(false); } }, [userName]);
  useEffect(() => { if (open) { setSource('user'); setChecked([]); void load(''); } }, [open, load]);

  // Kod aplikacji zaczynamy od `packages` — po to jest ta zakładka; reszta repo
  // (node_modules, build) tylko przeszkadzałaby w wyborze.
  const switchSource = (next: 'user' | 'code') => {
    setSource(next);
    void load(next === 'code' ? `${CODE_PREFIX}/packages` : '');
  };

  // W ścieżkach kodu ukrywamy techniczny prefiks — użytkownik widzi `packages/…`.
  const displayRel = source === 'code' ? cwd.replace(new RegExp(`^${CODE_PREFIX}/?`), '') : cwd;
  const parts = displayRel ? displayRel.split('/') : [];
  const rootRel = source === 'code' ? CODE_PREFIX : '';
  const toRel = (i: number) => (source === 'code'
    ? [CODE_PREFIX, ...parts.slice(0, i + 1)].join('/')
    : parts.slice(0, i + 1).join('/'));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 320 }}>
        <Tabs
          value={source}
          onChange={(_, v: 'user' | 'code') => switchSource(v)}
          sx={{ mb: 1, minHeight: 34, '& .MuiTab-root': { minHeight: 34, textTransform: 'none' } }}
        >
          <Tab value="user" label="Moje pliki" />
          <Tab value="code" label="Kod aplikacji (packages)" />
        </Tabs>
        <Breadcrumbs sx={{ mb: 1 }}>
          <MuiLink component="button" underline="hover" onClick={() => void load(rootRel)}>
            {source === 'code' ? 'MyCastle' : '~'}
          </MuiLink>
          {parts.map((p, i) => <MuiLink key={i} component="button" underline="hover" onClick={() => void load(toRel(i))}>{p}</MuiLink>)}
        </Breadcrumbs>
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box> : (
          <List dense>
            {entries.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>Pusty katalog.</Typography>}
            {entries.map((e) => {
              const childRel = cwd ? `${cwd}/${e.name}` : e.name;
              const isDir = e.type === DIR_TYPE;
              return (
                <ListItem
                  key={e.name}
                  disablePadding
                  // W trybie katalogu pliki dostają checkbox — można wskazać sam
                  // katalog albo zawęzić wybór do konkretnych plików.
                  secondaryAction={!isDir && mode === 'dir' ? (
                    <Checkbox
                      edge="end"
                      size="small"
                      checked={checked.includes(childRel)}
                      onChange={() => toggleFile(childRel)}
                    />
                  ) : undefined}
                >
                  <ListItemButton
                    onClick={() => {
                      if (isDir) void load(childRel);
                      else if (mode === 'file') { onPick(childRel); onClose(); }
                      else toggleFile(childRel);
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>{isDir ? <FolderIcon fontSize="small" color="primary" /> : <InsertDriveFileIcon fontSize="small" />}</ListItemIcon>
                    <ListItemText primary={e.name} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        {mode === 'dir' && checked.length > 0 && (
          <>
            <Typography variant="caption" sx={{ mr: 'auto', ml: 1, color: 'text.secondary' }}>
              zaznaczono {checked.length}
            </Typography>
            <Button onClick={() => setChecked([])}>Wyczyść</Button>
            <Button
              variant="contained"
              // Ścieżki plików przekazujemy WZGLĘDEM wybranego katalogu — backend
              // sprawdza, że nie wychodzą poza niego.
              onClick={() => {
                const base = cwd ? `${cwd}/` : '';
                onPick(cwd, checked.map((f) => (f.startsWith(base) ? f.slice(base.length) : f)));
                onClose();
              }}
            >
              Wybierz zaznaczone ({checked.length})
            </Button>
          </>
        )}
        {mode === 'dir' && checked.length === 0 && (
          <Button variant="contained" onClick={() => { onPick(cwd); onClose(); }}>
            Wybierz: {source === 'code' ? `MyCastle/${displayRel}` : `~/${cwd || ''}`}
          </Button>
        )}
        <Button onClick={onClose}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

function FilePreviewDialog({ open, userName, rel, onClose }: { open: boolean; userName: string; rel: string | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!open || !rel) return; setLoading(true); setText(null); vfsReadText(userName, rel).then(setText).finally(() => setLoading(false)); }, [open, rel, userName]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontFamily: 'monospace', fontSize: 14 }}>{rel}</DialogTitle>
      <DialogContent dividers>
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          : text === null ? <Typography color="error">Nie udało się wczytać pliku.</Typography>
          : <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Box>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Zamknij</Button></DialogActions>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Commit + History dialogs
// ──────────────────────────────────────────────────────────────────────────

function CommitDialog({ open, canCommit, onCommit, onClose }: { open: boolean; canCommit: boolean; onCommit: (msg: string) => void; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  useEffect(() => { if (open) setMsg(''); }, [open]);
  const submit = () => { if (msg.trim()) { onCommit(msg.trim()); onClose(); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nowy commit</DialogTitle>
      <DialogContent>
        {!canCommit && <Alert severity="info" sx={{ mb: 1 }}>Brak zmian względem ostatniego commita.</Alert>}
        <TextField autoFocus fullWidth size="small" sx={{ mt: 1 }} label="Opis zmian" value={msg}
          onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" startIcon={<CommitIcon />} disabled={!msg.trim() || !canCommit} onClick={submit}>Commit</Button>
      </DialogActions>
    </Dialog>
  );
}

function HistoryDialog({ open, history, uncommitted, onClose, onCheckoutBranch, onNewBranch, onRestore }: {
  open: boolean; history: UmlHistory | null; uncommitted: boolean;
  onClose: () => void; onCheckoutBranch: (b: string) => void; onNewBranch: () => void; onRestore: (id: string) => void;
}) {
  if (!history) return null;
  const branchNames = Object.keys(history.branches).sort();
  const tagsByCommit: Record<string, string[]> = {};
  for (const [b, id] of Object.entries(history.branches)) (tagsByCommit[id] ??= []).push(b);
  const log = ancestry(history, history.head);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Historia projektu — gałąź: <b>{history.head}</b>{uncommitted && <Chip size="small" color="warning" label="niezacommitowane zmiany" sx={{ ml: 1 }} />}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="subtitle2">Gałęzie:</Typography>
          {branchNames.map((b) => (
            <Chip key={b} icon={<CallSplitIcon />} label={b} size="small"
              color={b === history.head ? 'primary' : 'default'} variant={b === history.head ? 'filled' : 'outlined'}
              onClick={() => onCheckoutBranch(b)} />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={onNewBranch}>Nowa gałąź</Button>
        </Stack>
        <Divider sx={{ mb: 1 }} />
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Commity (od najnowszego)</Typography>
        <List dense>
          {log.map((c) => (
            <ListItem key={c.id} alignItems="flex-start"
              secondaryAction={<Tooltip title="Przywróć ten stan do roboczego"><IconButton edge="end" size="small" onClick={() => onRestore(c.id)}><RestoreIcon fontSize="small" /></IconButton></Tooltip>}>
              <ListItemIcon sx={{ minWidth: 30, mt: 0.5 }}><CommitIcon fontSize="small" color="action" /></ListItemIcon>
              <ListItemText
                primary={<Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  <span>{c.message}</span>
                  {(tagsByCommit[c.id] ?? []).map((t) => <Chip key={t} size="small" label={t} color={t === history.head ? 'primary' : 'default'} sx={{ height: 18 }} />)}
                </Box>}
                secondary={`${c.id.slice(-6)} · ${new Date(c.at).toLocaleString()}${c.parents.length > 1 ? ' · merge' : ''}`}
                secondaryTypographyProps={{ fontFamily: 'monospace', fontSize: 11 }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Zamknij</Button></DialogActions>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Diff view — compare two commits (or the working tree) and colour the diagram
// ──────────────────────────────────────────────────────────────────────────

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';
const DIFF_COLOR: Record<DiffStatus, string> = { added: '#2e7d32', removed: '#c62828', modified: '#ef6c00', unchanged: '#9e9e9e' };

interface DiffMember extends UmlMember { status: DiffStatus; oldText?: string }
interface DiffNodeData extends Record<string, unknown> { kind: UmlKind; name: string; oldName?: string; status: DiffStatus; members: DiffMember[] }
type DiffFlowNode = Node<DiffNodeData>;
interface DiffEdgeData extends UmlEdgeData { status: DiffStatus }

const WORKING = '__working__';

/** Extract the bare member name from a UML line (strip sigil/static/params/type). */
function memberName(text: string): string {
  let s = text.trim();
  if ('+-#~'.includes(s[0])) s = s.slice(1).trim();
  if (s.startsWith('static ')) s = s.slice(7).trim();
  const paren = s.indexOf('(');
  const colon = s.indexOf(':');
  const end = paren >= 0 ? paren : (colon >= 0 ? colon : s.length);
  return s.slice(0, end).trim();
}

function diffMembers(aMembers: UmlMember[], bMembers: UmlMember[]): DiffMember[] {
  const aMap = new Map(aMembers.map((m) => [m.id, m]));
  const bMap = new Map(bMembers.map((m) => [m.id, m]));
  const out: DiffMember[] = [];
  for (const m of bMembers) {
    const am = aMap.get(m.id);
    if (!am) out.push({ ...m, status: 'added' });
    else if (am.text !== m.text) out.push({ ...m, status: 'modified', oldText: am.text });
    else out.push({ ...m, status: 'unchanged' });
  }
  const removed = aMembers.filter((m) => !bMap.has(m.id)).map((m) => ({ ...m, status: 'removed' as DiffStatus }));
  // Reconcile id mismatches by name: a removed + added pair with the same name is
  // really a signature change (e.g. `func2(arg1)` → `func2(arg1, arg2)`) — show it
  // as modified, not remove+add. Same text → unchanged (id-scheme differences).
  const usedAdded = new Set<string>();
  for (const rem of removed) {
    const cand = out.find((o) => o.status === 'added' && !usedAdded.has(o.id) && o.kind === rem.kind && memberName(o.text) === memberName(rem.text));
    if (cand) {
      usedAdded.add(cand.id);
      if (cand.text === rem.text) cand.status = 'unchanged';
      else { cand.status = 'modified'; cand.oldText = rem.text; }
    } else out.push(rem);
  }
  return out;
}

interface DiffResult { nodes: DiffFlowNode[]; edges: Edge<DiffEdgeData>[]; counts: { cls: [number, number, number]; mem: [number, number, number]; rel: [number, number] } }

function buildDiff(baseDia: UmlDiagram | undefined, targetDia: UmlDiagram | undefined): DiffResult {
  const aNodes = new Map((baseDia?.nodes ?? []).map((n) => [n.id, n]));
  const bNodes = new Map((targetDia?.nodes ?? []).map((n) => [n.id, n]));
  const nodes: DiffFlowNode[] = [];
  const counts = { cls: [0, 0, 0] as [number, number, number], mem: [0, 0, 0] as [number, number, number], rel: [0, 0] as [number, number] };
  const bumpMem = (ms: DiffMember[]) => ms.forEach((m) => { if (m.status === 'added') counts.mem[0]++; else if (m.status === 'removed') counts.mem[1]++; else if (m.status === 'modified') counts.mem[2]++; });

  for (const id of new Set([...aNodes.keys(), ...bNodes.keys()])) {
    const a = aNodes.get(id); const b = bNodes.get(id);
    if (a && b) {
      const members = diffMembers(a.data.members, b.data.members);
      const changed = a.data.name !== b.data.name || a.data.kind !== b.data.kind || members.some((m) => m.status !== 'unchanged');
      if (changed) counts.cls[2]++;
      bumpMem(members);
      nodes.push({ id, type: 'diff', position: b.position, data: { kind: b.data.kind, name: b.data.name, oldName: a.data.name !== b.data.name ? a.data.name : undefined, status: changed ? 'modified' : 'unchanged', members } });
    } else if (b) {
      counts.cls[0]++;
      const members = b.data.members.map((m) => ({ ...m, status: 'added' as DiffStatus }));
      bumpMem(members);
      nodes.push({ id, type: 'diff', position: b.position, data: { kind: b.data.kind, name: b.data.name, status: 'added', members } });
    } else if (a) {
      counts.cls[1]++;
      const members = a.data.members.map((m) => ({ ...m, status: 'removed' as DiffStatus }));
      bumpMem(members);
      nodes.push({ id, type: 'diff', position: a.position, data: { kind: a.data.kind, name: a.data.name, status: 'removed', members } });
    }
  }

  const aEdges = new Map((baseDia?.edges ?? []).map((e) => [e.id, e]));
  const bEdges = new Map((targetDia?.edges ?? []).map((e) => [e.id, e]));
  const edges: Edge<DiffEdgeData>[] = [];
  for (const id of new Set([...aEdges.keys(), ...bEdges.keys()])) {
    const a = aEdges.get(id); const b = bEdges.get(id);
    const e = (b ?? a)!;
    const status: DiffStatus = a && b ? 'unchanged' : b ? 'added' : 'removed';
    if (status === 'added') counts.rel[0]++; else if (status === 'removed') counts.rel[1]++;
    edges.push({ ...e, type: 'diffEdge', data: { ...(e.data as UmlEdgeData), status } });
  }
  return { nodes, edges, counts };
}

function DiffNode({ data }: NodeProps<DiffFlowNode>) {
  const meta = KIND_META[data.kind];
  const border = data.status === 'unchanged' ? 'divider' : DIFF_COLOR[data.status];
  const fields = data.members.filter((m) => m.kind === 'field');
  const methods = data.members.filter((m) => m.kind === 'method');
  const lineSx = (s: DiffStatus) => (s === 'unchanged' ? {} : { bgcolor: `${DIFF_COLOR[s]}22`, color: DIFF_COLOR[s], textDecoration: s === 'removed' ? 'line-through' : undefined });
  const renderMembers = (ms: DiffMember[]) => (
    <Box sx={{ px: 1, py: 0.5, minHeight: 18, borderBottom: '1px solid', borderColor: 'divider' }}>
      {ms.length === 0 ? <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>&nbsp;</Typography> : ms.map((m) => (
        <Tooltip key={m.id} title={m.status === 'modified' && m.oldText ? `było: ${m.oldText}` : ''} disableHoverListener={m.status !== 'modified'}>
          <Typography sx={{ fontSize: 11, lineHeight: 1.5, fontFamily: 'monospace', px: 0.5, borderRadius: 0.5, ...lineSx(m.status) }}>{m.text}</Typography>
        </Tooltip>
      ))}
    </Box>
  );
  return (
    <Box sx={{ minWidth: 160, bgcolor: 'background.paper', border: '2px solid', borderColor: border, borderRadius: 1, fontSize: 12, overflow: 'hidden', opacity: data.status === 'removed' ? 0.7 : 1 }}>
      <Handle id="t" type="source" position={Position.Top} style={handleStyle} />
      <Handle id="r" type="source" position={Position.Right} style={handleStyle} />
      <Handle id="b" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="l" type="source" position={Position.Left} style={handleStyle} />
      <Box sx={{ px: 1, py: 0.5, textAlign: 'center', bgcolor: data.status === 'unchanged' ? `${meta.color}14` : `${DIFF_COLOR[data.status]}22`, borderBottom: '1px solid', borderColor: 'divider' }}>
        {meta.stereotype && <Typography sx={{ fontSize: 10, fontStyle: 'italic', color: meta.color, lineHeight: 1.2 }}>{meta.stereotype}</Typography>}
        <Typography sx={{ fontWeight: 700, color: data.status === 'unchanged' ? meta.color : DIFF_COLOR[data.status], lineHeight: 1.3 }}>
          {data.oldName && <Box component="span" sx={{ textDecoration: 'line-through', opacity: 0.6, mr: 0.5, fontWeight: 400 }}>{data.oldName}</Box>}
          {data.name || 'Unnamed'}
        </Typography>
      </Box>
      {renderMembers(fields)}
      {renderMembers(methods)}
    </Box>
  );
}

function DiffEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<DiffEdgeData>>) {
  const status = (data?.status ?? 'unchanged') as DiffStatus;
  const rel = REL_META[(data?.relType ?? 'association') as RelType];
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 });
  const stroke = status === 'unchanged' ? '#90a4ae' : DIFF_COLOR[status];
  return <BaseEdge id={id} path={path} markerStart={rel.markerStart} markerEnd={rel.markerEnd} style={{ stroke, strokeWidth: status === 'unchanged' ? 1.5 : 2.2, strokeDasharray: status === 'removed' || rel.dashed ? '6 4' : undefined }} />;
}

const DIFF_NODE_TYPES = { diff: DiffNode };
const DIFF_EDGE_TYPES = { diffEdge: DiffEdgeView };

function UmlDiffDialog({ open, history, workingDiagrams, defaultDiagramId, onClose }: {
  open: boolean; history: UmlHistory | null; workingDiagrams: UmlDiagram[]; defaultDiagramId: string | null; onClose: () => void;
}) {
  const headTip = history?.branches[history.head];
  const commitOptions = useMemo(() => {
    if (!history) return [] as { id: string; label: string }[];
    const list = Object.values(history.commits).sort((a, b) => b.at - a.at)
      .map((c) => ({ id: c.id, label: `${c.message} · ${c.id.slice(-6)}` }));
    return [{ id: WORKING, label: 'Robocze (niezapisane)' }, ...list];
  }, [history]);

  const [targetId, setTargetId] = useState<string>(WORKING);
  const [baseId, setBaseId] = useState<string>(headTip ?? WORKING);
  const [diagramKey, setDiagramKey] = useState<string>(defaultDiagramId ?? '');

  useEffect(() => { if (open) { setTargetId(WORKING); setBaseId(headTip ?? WORKING); setDiagramKey(defaultDiagramId ?? ''); } }, [open, headTip, defaultDiagramId]);

  const snapOf = useCallback((id: string): UmlDiagram[] => (id === WORKING ? workingDiagrams : history?.commits[id]?.snapshot.diagrams ?? []), [history, workingDiagrams]);

  const diagramOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of [...snapOf(baseId), ...snapOf(targetId)]) if (!map.has(d.id)) map.set(d.id, d.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [snapOf, baseId, targetId]);

  const effDiagramKey = diagramOptions.some((d) => d.id === diagramKey) ? diagramKey : (diagramOptions[0]?.id ?? '');
  const { nodes, edges, counts } = useMemo(
    () => buildDiff(snapOf(baseId).find((d) => d.id === effDiagramKey), snapOf(targetId).find((d) => d.id === effDiagramKey)),
    [snapOf, baseId, targetId, effDiagramKey],
  );

  const fmt = (label: string, [a, r, m]: [number, number, number] | [number, number], hasMod: boolean) =>
    `${label}: ` + [`+${a}`, `-${r}`, hasMod ? `~${(m as number) ?? 0}` : ''].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '90vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        Diff
        <TextField select size="small" label="Od (baza)" value={baseId} onChange={(e) => setBaseId(e.target.value)} sx={{ minWidth: 220 }}>
          {commitOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>)}
        </TextField>
        <CompareArrowsIcon color="action" />
        <TextField select size="small" label="Do (cel)" value={targetId} onChange={(e) => setTargetId(e.target.value)} sx={{ minWidth: 220 }}>
          {commitOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>)}
        </TextField>
        {diagramOptions.length > 1 && (
          <TextField select size="small" label="Diagram" value={effDiagramKey} onChange={(e) => setDiagramKey(e.target.value)} sx={{ minWidth: 160 }}>
            {diagramOptions.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <Box sx={{ px: 3, pb: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip size="small" label="dodane" sx={{ bgcolor: `${DIFF_COLOR.added}22`, color: DIFF_COLOR.added }} />
        <Chip size="small" label="usunięte" sx={{ bgcolor: `${DIFF_COLOR.removed}22`, color: DIFF_COLOR.removed }} />
        <Chip size="small" label="zmienione" sx={{ bgcolor: `${DIFF_COLOR.modified}22`, color: DIFF_COLOR.modified }} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Typography variant="caption" color="text.secondary">{fmt('Klasy', counts.cls, true)} · {fmt('Pola/metody', counts.mem, true)} · {fmt('Relacje', counts.rel, false)}</Typography>
      </Box>
      <DialogContent sx={{ p: 0, borderTop: '1px solid', borderColor: 'divider' }}>
        <UmlMarkerDefs />
        <Box sx={{ width: '100%', height: '100%' }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={DIFF_NODE_TYPES} edgeTypes={DIFF_EDGE_TYPES} fitView minZoom={0.15} maxZoom={2.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: false }}>
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap zoomable pannable nodeColor={(n) => { const d = n.data as DiffNodeData; return d?.status && d.status !== 'unchanged' ? DIFF_COLOR[d.status] : (KIND_META[d?.kind ?? 'class']?.color ?? '#999'); }} />
          </ReactFlow>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Linked-files panel
// ──────────────────────────────────────────────────────────────────────────

interface Linker { className: string; diagramName: string; kind: UmlKind }
interface FileTreeNode { name: string; path: string; isFile: boolean; children: Record<string, FileTreeNode>; linkers: Linker[] }

function buildFileTree(items: { file: string; linker: Linker }[]): FileTreeNode {
  const root: FileTreeNode = { name: '', path: '', isFile: false, children: {}, linkers: [] };
  for (const { file, linker } of items) {
    const parts = file.split('/').filter(Boolean);
    let cur = root; let acc = '';
    parts.forEach((p, i) => {
      acc = acc ? `${acc}/${p}` : p;
      const isFile = i === parts.length - 1;
      if (!cur.children[p]) cur.children[p] = { name: p, path: acc, isFile, children: {}, linkers: [] };
      cur = cur.children[p];
      if (isFile) cur.linkers.push(linker);
    });
  }
  return root;
}

interface FlatRow { node: FileTreeNode; display: string; depth: number; isFile: boolean }
function flattenTree(node: FileTreeNode, depth: number, collapsed: Set<string>, out: FlatRow[]): void {
  let eff = node; let display = node.name; let keys = Object.keys(eff.children);
  while (!eff.isFile && keys.length === 1 && !eff.children[keys[0]].isFile) { eff = eff.children[keys[0]]; display = `${display}/${eff.name}`; keys = Object.keys(eff.children); }
  const children = Object.values(eff.children).sort((a, b) => (a.isFile !== b.isFile ? (a.isFile ? 1 : -1) : a.name.localeCompare(b.name)));
  out.push({ node: eff, display, depth, isFile: eff.isFile });
  if (!eff.isFile && !collapsed.has(eff.path)) for (const c of children) flattenTree(c, depth + 1, collapsed, out);
}

function LinkedFilesPanel({ projectLinkedPath, items, onPreview, onClose, width = 280, outputs = [], generating = null, onAddOutput, onRemoveOutput, onGenerate }: {
  projectLinkedPath?: string;
  items: { file: string; linker: Linker }[];
  onPreview: (rel: string) => void;
  onClose: () => void;
  width?: number;
  outputs?: string[];
  generating?: string | null;
  onAddOutput?: () => void;
  onRemoveOutput?: (file: string) => void;
  onGenerate?: (file: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildFileTree(items), [items]);
  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    const top = Object.values(tree.children).sort((a, b) => (a.isFile !== b.isFile ? (a.isFile ? 1 : -1) : a.name.localeCompare(b.name)));
    for (const c of top) flattenTree(c, 0, collapsed, out);
    return out;
  }, [tree, collapsed]);
  const toggle = (path: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  return (
    <Box sx={{ width, borderLeft: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <AccountTreeIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Powiązane pliki</Typography>
        <Tooltip title="Ukryj panel"><IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></Tooltip>
      </Box>
      {projectLinkedPath && (
        <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">Katalog projektu</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{projectLinkedPath}</Typography>
        </Box>
      )}

      {/* Output files generated from the UML model */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Pliki wyjściowe</Typography>
          {onAddOutput && <Button size="small" onClick={onAddOutput} sx={{ minWidth: 0, px: 1 }}>+ Dodaj</Button>}
        </Box>
        {outputs.length === 0 ? (
          <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, pb: 0.75, display: 'block' }}>
            Dodaj *.schema.json lub *.d.ts, aby generować z modelu.
          </Typography>
        ) : (
          <List dense disablePadding>
            {outputs.map((f) => {
              const base = f.split('/').pop() || f;
              const kind = /\.schema\.json$/i.test(f) ? 'JSON Schema' : /\.d\.ts$/i.test(f) ? 'typy TS' : '—';
              return (
                <ListItem key={f} disablePadding sx={{ pr: 0.5 }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Tooltip title={`Generuj (${kind}) z modelu UML`}>
                        <span>
                          <IconButton size="small" color="success" onClick={() => onGenerate?.(f)} disabled={generating === f}>
                            {generating === f ? <CircularProgress size={14} /> : <PlayArrowIcon sx={{ fontSize: 17 }} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      {onRemoveOutput && (
                        <Tooltip title="Usuń"><IconButton size="small" onClick={() => onRemoveOutput(f)}><CloseIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                      )}
                    </Box>
                  }>
                  <ListItemButton sx={{ py: 0.25, pr: 9 }} onClick={() => onPreview(f)}>
                    <ListItemIcon sx={{ minWidth: 26 }}><InsertDriveFileIcon sx={{ fontSize: 16 }} color="action" /></ListItemIcon>
                    <ListItemText primary={base} secondary={kind}
                      primaryTypographyProps={{ noWrap: true, fontSize: 12, fontFamily: 'monospace' }}
                      secondaryTypographyProps={{ noWrap: true, fontSize: 10 }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>Brak powiązanych plików. Zaznacz klasę i użyj „Powiąż z plikiem".</Typography>
        ) : (
          <List dense disablePadding>
            {rows.map((r) => (
              <ListItem key={(r.isFile ? 'f:' : 'd:') + r.node.path} disablePadding>
                <ListItemButton sx={{ pl: 1 + r.depth * 1.5, py: 0.25 }} onClick={() => (r.isFile ? onPreview(r.node.path) : toggle(r.node.path))}>
                  <ListItemIcon sx={{ minWidth: 26 }}>{r.isFile ? <InsertDriveFileIcon sx={{ fontSize: 16 }} color="action" /> : (collapsed.has(r.node.path) ? <FolderIcon sx={{ fontSize: 16 }} color="primary" /> : <FolderOpenIcon sx={{ fontSize: 16 }} color="primary" />)}</ListItemIcon>
                  <ListItemText primary={r.display} primaryTypographyProps={{ noWrap: true, fontSize: 12, fontFamily: r.isFile ? 'monospace' : undefined }}
                    secondary={r.isFile && r.node.linkers.length > 0 ? r.node.linkers.map((l) => `${l.className} · ${l.diagramName}`).join(', ') : undefined}
                    secondaryTypographyProps={{ noWrap: true, fontSize: 10 }} />
                  {r.isFile && <VisibilityIcon sx={{ fontSize: 15, ml: 0.5, color: 'text.disabled' }} />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────
// Category picker — compact dot button that opens a small popover
// ──────────────────────────────────────────────────────────────────────────

function CategoryPicker({ value, categories, listId, onChange }: {
  value: string; categories: string[]; listId: string; onChange: (v: string) => void;
}) {
  const [anchor, setAnchor] = useState<Element | null>(null);
  const [local, setLocal] = useState('');
  const open = (e: React.MouseEvent) => { setLocal(value); setAnchor(e.currentTarget); };
  const close = () => setAnchor(null);
  const commit = (v: string) => { onChange(v); close(); };
  return (
    <>
      <Tooltip title={value || 'Category'} placement="right">
        <Box onClick={open} sx={{ width: 32, height: 19, border: '1px solid', borderColor: 'divider', borderRadius: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', '&:hover': { borderColor: 'text.primary' } }}>
          {value
            ? <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: categoryColor(value) }} />
            : <Box sx={{ width: 8, height: 8, borderRadius: '50%', border: '1px dashed', borderColor: 'text.disabled' }} />}
        </Box>
      </Tooltip>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} PaperProps={{ sx: { p: 1, width: 200 } }}>
        <datalist id={listId + '-cat'}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <TextField size="small" fullWidth autoFocus placeholder="Category…" value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(local); if (e.key === 'Escape') close(); }}
          inputProps={{ list: listId + '-cat' }}
          InputProps={{ endAdornment: local ? <IconButton size="small" onClick={() => commit('')}><CloseIcon sx={{ fontSize: 14 }} /></IconButton> : undefined }}
        />
        {categories.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.75}>
            {categories.map((c) => (
              <Chip key={c} label={c} size="small" onClick={() => commit(c)}
                sx={{ bgcolor: categoryColor(c), color: '#fff', fontSize: 10, cursor: 'pointer', height: 20 }} />
            ))}
          </Stack>
        )}
      </Popover>
    </>
  );
}

// Member list editor (properties panel section)
// ──────────────────────────────────────────────────────────────────────────

function MemberSection({ title, members, categories, onAdd, onChange, onCategory, onDelete, onReorder }: {
  title: string; members: UmlMember[]; categories: string[];
  onAdd: () => void; onChange: (id: string, text: string) => void; onCategory: (id: string, category: string) => void; onDelete: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const listId = `uml-cat-${title.replace(/\s+/g, '-')}`;
  const dragId = useRef<string | null>(null);
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">{title}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={onAdd} sx={{ minWidth: 0 }}>Add</Button>
      </Stack>
      <Stack spacing={0.75}>
        {members.length === 0 && <Typography variant="caption" color="text.disabled">— none —</Typography>}
        {members.map((m) => {
          const sig = memberSigil(m.text);
          return (
            <Stack key={m.id} direction="row" spacing={0.5} alignItems="flex-start"
              onDragOver={(e) => { if (dragId.current) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); const from = dragId.current; dragId.current = null; if (from && from !== m.id) onReorder(from, m.id); }}>
              {/* Drag handle — reorder within this section */}
              <Box
                draggable
                onDragStart={(e) => { dragId.current = m.id; e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { dragId.current = null; }}
                title="Przeciągnij, aby zmienić kolejność"
                sx={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch', cursor: 'grab', color: 'text.disabled', '&:hover': { color: 'text.secondary' }, '&:active': { cursor: 'grabbing' } }}
              >
                <DragIndicatorIcon sx={{ fontSize: 16 }} />
              </Box>
              {/* Left column: visibility dot + category dot, stacked — together same height as text field */}
              <Stack spacing="1px" sx={{ flexShrink: 0 }}>
                <TextField
                  select size="small"
                  value={sig}
                  onChange={(e) => onChange(m.id, changeTextSigil(m.text, e.target.value))}
                  sx={{ width: 32, '& .MuiInputBase-root': { height: 19 }, '& .MuiSelect-icon': { display: 'none' }, '& .MuiOutlinedInput-input': { px: '4px !important', py: '0px !important', display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
                  SelectProps={{ renderValue: (v) => (
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: VIS_COLOR[v as string] ?? '#888', mx: 'auto' }} />
                  ) }}
                >
                  {VIS_ORDER.map((s) => (
                    <MenuItem key={s} value={s} sx={{ fontSize: 12 }}>
                      <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: VIS_COLOR[s], display: 'inline-block', mr: 0.75, flexShrink: 0 }} />
                      <Box component="span" sx={{ fontFamily: 'monospace', mr: 0.5, color: VIS_COLOR[s] }}>{s}</Box>
                      {VIS_LABEL[s]}
                    </MenuItem>
                  ))}
                </TextField>
                <CategoryPicker value={m.category ?? ''} categories={categories} listId={listId} onChange={(v) => onCategory(m.id, v)} />
              </Stack>
              {/* Text field + delete */}
              <TextField size="small" fullWidth value={m.text} onChange={(e) => onChange(m.id, e.target.value)} InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }} />
              <IconButton size="small" onClick={() => onDelete(m.id)}><DeleteOutlineIcon sx={{ fontSize: 16 }} /></IconButton>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Editor
// ──────────────────────────────────────────────────────────────────────────

// Persisted resizable-panel width (survives reloads via localStorage).
function usePersistentWidth(key: string, initial: number): [number, (w: number) => void] {
  const [width, setWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : initial; } catch { return initial; }
  });
  const set = useCallback((w: number) => {
    setWidth(w);
    try { localStorage.setItem(key, String(Math.round(w))); } catch { /* ignore */ }
  }, [key]);
  return [width, set];
}

// Vertical drag handle that resizes the adjacent side panel. `side` tells which
// side the panel sits on relative to the handle. Desktop only (panels overlay
// on mobile, where dragging makes no sense).
function ResizeHandle({ side, width, setWidth, min = 160, max = 700 }: {
  side: 'left' | 'right'; width: number; setWidth: (w: number) => void; min?: number; max?: number;
}) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <Box
      onPointerDown={(e) => { start.current = { x: e.clientX, w: width }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        const w = side === 'left' ? start.current.w + dx : start.current.w - dx;
        setWidth(Math.max(min, Math.min(max, w)));
      }}
      onPointerUp={(e) => { start.current = null; try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ } }}
      sx={{
        display: { xs: 'none', md: 'block' }, flexShrink: 0, width: '6px', cursor: 'col-resize',
        bgcolor: 'transparent', '&:hover': { bgcolor: 'primary.main', opacity: 0.5 },
        transition: 'background-color .15s', zIndex: 7,
      }}
    />
  );
}

function UmlEditor({ userName }: { userName: string }) {
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [project, setProject] = useState<UmlProject | null>(null);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  const [nodes, setNodes] = useState<UmlNode[]>([]);
  const [edges, setEdges] = useState<Edge<UmlEdgeData>[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [relType, setRelType] = useState<RelType>('association');
  const [dirty, setDirty] = useState(false);

  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);
  const [picker, setPicker] = useState<{ mode: 'dir' | 'file'; title: string; onPick: (rel: string, files?: string[]) => void } | null>(null);
  const [previewRel, setPreviewRel] = useState<string | null>(null);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [outputDialog, setOutputDialog] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // null = wszystkie kategorie
  const [commitOpen, setCommitOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [openProjOpen, setOpenProjOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const placeRef = useRef(0);
  const theme = useTheme();
  const { openNav } = useLayoutChrome();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  // Per-panel visibility — togglable on every screen size. Default: shown on
  // desktop, hidden on mobile (so the canvas gets the full width).
  const [treeOpen, setTreeOpen] = useState(!isNarrow);
  const [propsOpen, setPropsOpen] = useState(!isNarrow);
  // Resizable side-panel widths (persisted so the layout survives reloads).
  const [treeWidth, setTreeWidth] = usePersistentWidth('uml.treeWidth', 250);
  const [propsWidth, setPropsWidth] = usePersistentWidth('uml.propsWidth', 290);
  const [filesWidth, setFilesWidth] = usePersistentWidth('uml.filesWidth', 280);

  const refreshProjects = useCallback(async () => setProjectFiles(await listProjectFiles(userName)), [userName]);

  useEffect(() => {
    (async () => {
      let files: string[] = [];
      try { files = await listProjectFiles(userName); } catch { files = []; }
      setProjectFiles(files);
      if (files.length > 0) {
        try {
          const p = await readProject(userName, files[0]);
          if (p && p.diagrams.length > 0) {
            setProject(p); setProjectFile(files[0]);
            setActiveDiagramId(p.diagrams[0].id); setNodes(p.diagrams[0].nodes); setEdges(p.diagrams[0].edges);
            return;
          }
        } catch { /* fall through to a fresh seeded project */ }
      }
      const seeded = makeProject('Untitled', true);
      setProject(seeded); setProjectFile(null);
      setActiveDiagramId(seeded.diagrams[0].id); setNodes(seeded.diagrams[0].nodes); setEdges(seeded.diagrams[0].edges);
      setDirty(true);
    })();
  }, [userName]);

  const clearSelection = () => { setSelectedNodeId(null); setSelectedEdgeId(null); };

  const commitActive = useCallback((p: UmlProject): UmlProject => ({
    ...p,
    diagrams: p.diagrams.map((d) => (d.id === activeDiagramId ? { ...d, nodes: cleanNodes(nodes), edges: cleanEdges(edges) } : d)),
  }), [activeDiagramId, nodes, edges]);

  // ── Canvas ──────────────────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as UmlNode[]);
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds) as Edge<UmlEdgeData>[]);
    if (changes.some((c) => c.type !== 'select')) setDirty(true);
  }, []);
  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({ ...c, id: nextId('e'), type: 'uml', data: { relType } }, eds) as Edge<UmlEdgeData>[]);
    setDirty(true);
  }, [relType]);

  const addNode = useCallback((kind: UmlKind) => {
    const k = placeRef.current++;
    const node = makeNode(kind, { x: 120 + (k % 5) * 40, y: 120 + (k % 5) * 40 });
    setNodes((nds) => [...nds, node]); setSelectedNodeId(node.id); setSelectedEdgeId(null); setDirty(true);
  }, []);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) ?? null, [edges, selectedEdgeId]);

  const patchNodeData = useCallback((id: string, patch: Partial<UmlNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))); setDirty(true);
  }, []);
  const updateMembers = useCallback((id: string, fn: (m: UmlMember[]) => UmlMember[]) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, members: fn(n.data.members) } } : n))); setDirty(true);
  }, []);
  const patchEdgeData = useCallback((id: string, patch: Partial<UmlEdgeData>) => {
    setEdges((eds) => eds.map((e) => (e.id === id ? { ...e, data: { ...(e.data as UmlEdgeData), ...patch } } : e))); setDirty(true);
  }, []);

  const deleteSelection = useCallback(() => {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null); setDirty(true);
    } else if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId)); setSelectedEdgeId(null); setDirty(true);
    }
  }, [selectedNodeId, selectedEdgeId]);

  // ── Diagrams ─────────────────────────────────────────────────────────────
  const loadDiagramIntoCanvas = (d: UmlDiagram | undefined) => { setActiveDiagramId(d?.id ?? null); setNodes(d?.nodes ?? []); setEdges(d?.edges ?? []); clearSelection(); };
  const selectDiagram = useCallback((id: string) => {
    if (!project || id === activeDiagramId) return;
    const committed = commitActive(project); setProject(committed); loadDiagramIntoCanvas(committed.diagrams.find((d) => d.id === id));
  }, [project, activeDiagramId, commitActive]);
  const addDiagram = useCallback(() => {
    if (!project) return;
    const name = window.prompt('Nazwa nowego diagramu', `Diagram ${project.diagrams.length + 1}`); if (!name) return;
    const committed = commitActive(project); const d = emptyDiagram(name.trim());
    setProject({ ...committed, diagrams: [...committed.diagrams, d] }); loadDiagramIntoCanvas(d); setDirty(true);
  }, [project, commitActive]);
  const renameDiagram = useCallback((id: string) => {
    if (!project) return; const cur = project.diagrams.find((d) => d.id === id);
    const name = window.prompt('Nowa nazwa diagramu', cur?.name ?? ''); if (!name) return;
    setProject((p) => p && ({ ...p, diagrams: p.diagrams.map((d) => (d.id === id ? { ...d, name: name.trim() } : d)) })); setDirty(true);
  }, [project]);
  const deleteDiagram = useCallback((id: string) => {
    if (!project) return;
    if (project.diagrams.length <= 1) { setToast({ msg: 'Projekt musi mieć co najmniej jeden diagram', sev: 'info' }); return; }
    if (!window.confirm('Usunąć ten diagram?')) return;
    const committed = commitActive(project); const remaining = committed.diagrams.filter((d) => d.id !== id);
    setProject({ ...committed, diagrams: remaining }); if (id === activeDiagramId) loadDiagramIntoCanvas(remaining[0]); setDirty(true);
  }, [project, activeDiagramId, commitActive]);

  // ── Linked files aggregate ────────────────────────────────────────────────
  const linkedItems = useMemo(() => {
    if (!project) return [] as { file: string; linker: Linker }[];
    const out: { file: string; linker: Linker }[] = [];
    for (const d of project.diagrams) {
      const dn = d.id === activeDiagramId ? nodes : d.nodes;
      for (const n of dn) { const lf = (n.data as UmlNodeData).linkedFile; if (lf) out.push({ file: lf, linker: { className: n.data.name, diagramName: d.name, kind: n.data.kind } }); }
    }
    return out;
  }, [project, activeDiagramId, nodes]);

  // Wszystkie kategorie składowych w całym projekcie (aktywny diagram = żywe węzły).
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    if (project) for (const d of project.diagrams) {
      const dn = d.id === activeDiagramId ? nodes : d.nodes;
      for (const n of dn) for (const m of (n.data as UmlNodeData).members) if (m.category) set.add(m.category);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [project, activeDiagramId, nodes]);

  // Filtr przestaje być ważny, gdy jego kategoria zniknie z projektu.
  useEffect(() => { if (categoryFilter && !allCategories.includes(categoryFilter)) setCategoryFilter(null); }, [allCategories, categoryFilter]);

  // ── History (git-like) ─────────────────────────────────────────────────────
  const workingSnapshot = useCallback((p: UmlProject): ProjectSnapshot => {
    const committed = commitActive(p); return { diagrams: committed.diagrams, linkedPath: committed.linkedPath };
  }, [commitActive]);

  const uncommitted = useMemo(() => {
    if (!project) return false;
    const head = headCommit(project.history); if (!head) return true;
    return JSON.stringify(workingSnapshot(project)) !== JSON.stringify(head.snapshot);
  }, [project, workingSnapshot]);

  const doCommit = useCallback((message: string) => {
    if (!project) return;
    const committed = commitActive(project);
    const snap: ProjectSnapshot = { diagrams: clone(committed.diagrams), linkedPath: committed.linkedPath };
    const headBranch = committed.history.head;
    const parent = committed.history.branches[headBranch];
    const id = nextId('c');
    const commitObj: UmlCommit = { id, message, at: Date.now(), parents: parent ? [parent] : [], snapshot: snap };
    const history: UmlHistory = { ...committed.history, commits: { ...committed.history.commits, [id]: commitObj }, branches: { ...committed.history.branches, [headBranch]: id } };
    setProject({ ...committed, history }); setDirty(true);
    setToast({ msg: `Commit na „${headBranch}": ${message}`, sev: 'success' });
  }, [project, commitActive]);

  const checkoutBranch = useCallback((branch: string) => {
    if (!project || branch === project.history.head) { setHistoryOpen(false); return; }
    if (uncommitted && !window.confirm('Masz niezacommitowane zmiany robocze — przepadną. Przełączyć gałąź?')) return;
    const tip = project.history.branches[branch]; const snap = project.history.commits[tip]?.snapshot;
    if (!snap) return;
    const np: UmlProject = { ...project, diagrams: clone(snap.diagrams), linkedPath: snap.linkedPath, history: { ...project.history, head: branch } };
    setProject(np); loadDiagramIntoCanvas(np.diagrams[0]); setDirty(true); setHistoryOpen(false);
    setToast({ msg: `Przełączono na gałąź „${branch}"`, sev: 'info' });
  }, [project, uncommitted]);

  const newBranch = useCallback(() => {
    if (!project) return;
    const name = window.prompt('Nazwa nowej gałęzi (rozgałęzia od bieżącego commita)'); if (!name) return;
    const clean = name.trim().replace(/\s+/g, '-');
    if (project.history.branches[clean]) { setToast({ msg: 'Gałąź już istnieje', sev: 'error' }); return; }
    const tip = project.history.branches[project.history.head];
    setProject((p) => p && ({ ...p, history: { ...p.history, branches: { ...p.history.branches, [clean]: tip }, head: clean } }));
    setDirty(true); setToast({ msg: `Utworzono gałąź „${clean}" i przełączono`, sev: 'success' });
  }, [project]);

  const restoreCommit = useCallback((id: string) => {
    if (!project) return;
    if (uncommitted && !window.confirm('Niezacommitowane zmiany robocze przepadną. Przywrócić ten commit?')) return;
    const snap = project.history.commits[id]?.snapshot; if (!snap) return;
    const np: UmlProject = { ...project, diagrams: clone(snap.diagrams), linkedPath: snap.linkedPath };
    setProject(np); loadDiagramIntoCanvas(np.diagrams[0]); setDirty(true); setHistoryOpen(false);
    setToast({ msg: 'Przywrócono stan do roboczego — zacommituj, aby zapisać go w historii', sev: 'info' });
  }, [project, uncommitted]);

  // ── Project files ──────────────────────────────────────────────────────────
  const saveProject = useCallback(async () => {
    if (!project) return;
    let file = projectFile;
    if (!file) { const name = window.prompt('Nazwa projektu (zapis do drive/uml/)', project.name === 'Untitled' ? 'project' : project.name); if (!name) return; file = normaliseProjectFile(name); }
    const committed = { ...commitActive(project), name: projectDisplayName(file), updatedAt: Date.now() };
    try { await writeProject(userName, file, committed); setProject(committed); setProjectFile(file); setDirty(false); await refreshProjects(); setToast({ msg: `Zapisano ${file}`, sev: 'success' }); }
    catch (err) { setToast({ msg: `Błąd zapisu: ${(err as Error).message}`, sev: 'error' }); }
  }, [project, projectFile, commitActive, userName, refreshProjects]);

  const openProject = useCallback(async (file: string) => {
    if (file === projectFile) return;
    if (dirty && !window.confirm('Masz niezapisane zmiany — przepadną. Otworzyć inny projekt?')) return;
    const p = await readProject(userName, file);
    if (!p || !Array.isArray(p.diagrams)) { setToast({ msg: `Nie udało się wczytać ${file}`, sev: 'error' }); return; }
    setProject(p); setProjectFile(file); setDirty(false); loadDiagramIntoCanvas(p.diagrams[0]); setToast({ msg: `Wczytano ${file}`, sev: 'info' });
  }, [projectFile, dirty, userName]);

  const openOpenProjectDialog = useCallback(async () => { await refreshProjects(); setOpenProjOpen(true); }, [refreshProjects]);

  const newProject = useCallback(() => {
    if (dirty && !window.confirm('Masz niezapisane zmiany — przepadną. Utworzyć nowy projekt?')) return;
    const name = window.prompt('Nazwa nowego projektu', 'project'); if (!name) return;
    const p = makeProject(name.trim(), false); setProject(p); setProjectFile(null); loadDiagramIntoCanvas(p.diagrams[0]); setDirty(true);
  }, [dirty]);

  const renameProject = useCallback(async (file: string) => {
    const name = window.prompt('Nowa nazwa projektu', projectDisplayName(file)); if (!name) return;
    const newFile = normaliseProjectFile(name); if (newFile === file) return;
    const source = file === projectFile && project ? commitActive(project) : await readProject(userName, file); if (!source) return;
    const renamed = { ...source, name: projectDisplayName(newFile), updatedAt: Date.now() };
    await writeProject(userName, newFile, renamed); await deleteProjectFile(userName, file); await refreshProjects();
    if (file === projectFile) { setProject(renamed); setProjectFile(newFile); setDirty(false); }
    setToast({ msg: `Zmieniono nazwę → ${newFile}`, sev: 'success' });
  }, [projectFile, project, commitActive, userName, refreshProjects]);

  const removeProject = useCallback(async (file: string) => {
    if (!window.confirm(`Usunąć projekt ${projectDisplayName(file)}?`)) return;
    await deleteProjectFile(userName, file); const files = await listProjectFiles(userName); setProjectFiles(files);
    if (file === projectFile) {
      if (files.length > 0) await openProject(files[0]);
      else { const p = makeProject('Untitled', true); setProject(p); setProjectFile(null); loadDiagramIntoCanvas(p.diagrams[0]); setDirty(true); }
    }
  }, [userName, projectFile, openProject]);

  // ── Associations ──────────────────────────────────────────────────────────
  // ── Output files (generated from the model) ────────────────────────────────
  const addOutput = useCallback((file: string) => {
    const f = file.trim();
    if (!f) return;
    setProject((p) => (p && !(p.outputs ?? []).includes(f) ? { ...p, outputs: [...(p.outputs ?? []), f] } : p));
    setDirty(true);
  }, []);
  const removeOutput = useCallback((file: string) => {
    setProject((p) => p && ({ ...p, outputs: (p.outputs ?? []).filter((x) => x !== file) }));
    setDirty(true);
  }, []);
  const generateOutput = useCallback(async (file: string) => {
    if (!project) return;
    setGenerating(file);
    try {
      const diagrams = commitActive(project).diagrams; // include unsaved edits
      const base = (file.split('/').pop() || file).replace(/\.(schema\.json|d\.ts)$/i, '');
      if (/\.schema\.json$/i.test(file)) {
        // Split into one file per type inside a `{base}/` folder next to the output.
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
        const subdir = (dir ? `${dir}/` : '') + base;
        const out = generateUmlJsonSchemaFiles(diagrams, base);
        for (const ff of out) await vfsWriteText(userName, `${subdir}/${ff.name}`, ff.content);
        setToast({ msg: `Wygenerowano ${out.length} plików schematu w ${subdir}/`, sev: 'success' });
      } else if (/\.d\.ts$/i.test(file)) {
        await vfsWriteText(userName, file, generateUmlDts(diagrams));
        setToast({ msg: `Wygenerowano ${file}`, sev: 'success' });
      } else {
        setToast({ msg: 'Nieobsługiwane rozszerzenie — użyj *.schema.json lub *.d.ts', sev: 'error' });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : 'Błąd generowania', sev: 'error' });
    } finally {
      setGenerating(null);
    }
  }, [project, userName, commitActive]);
  const openOutputDialog = useCallback(() => {
    setOutputPath(project?.linkedPath ? `${project.linkedPath}/` : '');
    setOutputDialog(true);
  }, [project]);

  const pickProjectDir = useCallback(() => setPicker({ mode: 'dir', title: 'Powiąż projekt z katalogiem', onPick: (rel) => { setProject((p) => p && ({ ...p, linkedPath: rel })); setDirty(true); } }), []);
  const clearProjectDir = useCallback(() => { setProject((p) => p && ({ ...p, linkedPath: undefined })); setDirty(true); }, []);
  const pickNodeFile = useCallback((nodeId: string) => setPicker({ mode: 'file', title: 'Powiąż klasę z plikiem źródłowym', onPick: (rel) => patchNodeData(nodeId, { linkedFile: rel }) }), [patchNodeData]);

  // ── Generate / sync UML from source code (backend @mhersztowski/devtools) ──
  const runCodeSync = useCallback(async (dir: string, files?: string[]) => {
    if (!project) return;
    const scope = files?.length ? `${files.length} wybranych plików w ${dir}` : `kodu w ${dir}`;
    const hasContent = project.diagrams.some((d) => d.nodes.length > 0);
    if (hasContent && !window.confirm(`Diagram źródłowy zostanie zregenerowany z ${scope} (układ węzłów zostanie zachowany). Kontynuować?`)) return;
    setSyncing(true);
    try {
      const current = commitActive(project);
      const res = await minisApi.syncUmlFromCode<UmlProject>(userName, dir, current, current.name, files);
      // Recognise `name?: type` fields coming from the parser as "optional".
      const np: UmlProject = normalizeOptionalProject({ ...res.project, linkedPath: res.project.linkedPath ?? dir });
      setProject(np);
      loadDiagramIntoCanvas(np.diagrams[0]);
      setDirty(true);
      setToast({ msg: res.changes.length ? `Sync z kodu: ${res.summary} (${res.changes.length} zmian)` : 'Sync z kodu: brak zmian w strukturze', sev: 'success' });
    } catch (err) {
      setToast({ msg: `Błąd generowania z kodu: ${(err as Error).message}`, sev: 'error' });
    } finally {
      setSyncing(false);
    }
  }, [project, commitActive, userName]);

  const generateFromCode = useCallback(() => {
    if (!project) return;
    if (project.linkedPath) void runCodeSync(project.linkedPath);
    else setPicker({
      mode: 'dir',
      title: 'Wybierz katalog lub zaznacz pliki — Twoje pliki albo kod aplikacji (packages)',
      onPick: (rel, files) => void runCodeSync(rel, files),
    });
  }, [project, runCodeSync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void saveProject(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [saveProject]);

  const selFields = selectedNode ? selectedNode.data.members.filter((m) => m.kind === 'field') : [];
  const selMethods = selectedNode ? selectedNode.data.members.filter((m) => m.kind === 'method') : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <UmlMarkerDefs />

      {/* Toolbar */}
      <Paper square elevation={1} sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', zIndex: 2 }}>
        {/* Main app navigation + account — distinguished, separated group */}
        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1.5, px: 0.25 }}>
          <Tooltip title="Menu główne"><IconButton size="small" onClick={openNav}><MenuIcon /></IconButton></Tooltip>
          <AccountMenu isAdminView={false} userName={userName} />
        </Box>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Panel: projekty / diagramy"><IconButton size="small" color={treeOpen ? 'primary' : 'default'} onClick={() => setTreeOpen((v) => !v)}><ViewSidebarIcon /></IconButton></Tooltip>
        <Tooltip title="Otwórz projekt"><IconButton size="small" onClick={() => void openOpenProjectDialog()}><FolderOpenIcon /></IconButton></Tooltip>
        <Tooltip title="Zapisz projekt na dysku (Ctrl+S)"><span><IconButton size="small" color={dirty ? 'warning' : 'default'} onClick={() => void saveProject()}><SaveIcon /></IconButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Stack direction="row" spacing={0.5}>
          {(Object.keys(KIND_META) as UmlKind[]).map((k) => (
            <Button key={k} size="small" variant="outlined" startIcon={<AddBoxIcon />} onClick={() => addNode(k)} sx={{ borderColor: KIND_META[k].color, color: KIND_META[k].color, textTransform: 'none' }}>{KIND_META[k].label}</Button>
          ))}
        </Stack>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <TextField select size="small" label="Relacja (dla nowych połączeń)" value={relType} onChange={(e) => setRelType(e.target.value as RelType)} sx={{ minWidth: 210 }}>
          {REL_ORDER.map((r) => <MenuItem key={r} value={r}>{REL_META[r].label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Kategoria (filtr)" value={categoryFilter ?? ''} onChange={(e) => setCategoryFilter(e.target.value || null)} sx={{ minWidth: 170 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ displayEmpty: true, renderValue: (v) => (v ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: categoryColor(v as string) }} />{v as string}</Box> : <span style={{ color: '#888' }}>wszystkie</span>) }}>
          <MenuItem value="">wszystkie kategorie</MenuItem>
          {allCategories.map((c) => <MenuItem key={c} value={c}><Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: categoryColor(c), mr: 1 }} />{c}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        {/* Generate / sync from source code */}
        <Tooltip title={project?.linkedPath ? `Generuj/aktualizuj UML z kodu (${project.linkedPath})` : 'Generuj UML z kodu — wybierz katalog'}>
          <span><Button size="small" variant="outlined" startIcon={syncing ? <CircularProgress size={14} /> : <AutoFixHighIcon />} disabled={syncing} onClick={generateFromCode} sx={{ textTransform: 'none' }}>Z kodu</Button></span>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        {/* Version control */}
        <Tooltip title="Bieżąca gałąź"><Chip size="small" icon={<CallSplitIcon />} label={project?.history.head ?? '—'} color={uncommitted ? 'warning' : 'default'} variant="outlined" /></Tooltip>
        <Tooltip title="Commit (zapisz wersję w historii)"><span><IconButton size="small" disabled={!uncommitted} onClick={() => setCommitOpen(true)}><CommitIcon /></IconButton></span></Tooltip>
        <Tooltip title="Historia / gałęzie"><IconButton size="small" onClick={() => setHistoryOpen(true)}><HistoryIcon /></IconButton></Tooltip>
        <Tooltip title="Diff — porównaj dwa commity"><IconButton size="small" onClick={() => setDiffOpen(true)}><CompareArrowsIcon /></IconButton></Tooltip>
        <Tooltip title="Panel: właściwości"><IconButton size="small" color={propsOpen ? 'primary' : 'default'} onClick={() => setPropsOpen((v) => !v)}><TuneIcon /></IconButton></Tooltip>
        <Tooltip title={`Panel: powiązane pliki${linkedItems.length ? ` (${linkedItems.length})` : ''}`}><IconButton size="small" color={showFilesPanel ? 'primary' : 'default'} onClick={() => setShowFilesPanel((v) => !v)}><AccountTreeIcon /></IconButton></Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>{project ? `${project.name}${projectFile ? '' : ' (niezapisany)'}` : '—'}{dirty ? ' •' : ''}</Typography>
      </Paper>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Left: projects + diagrams — overlay on mobile so the canvas keeps full width */}
        <Box sx={{ width: treeWidth, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.paper', flexDirection: 'column',
          display: treeOpen ? 'flex' : 'none',
          position: { xs: 'absolute', md: 'relative' }, left: 0, top: 0, height: '100%', zIndex: 6, boxShadow: { xs: 6, md: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Projekty / diagramy</Typography>
            <Tooltip title="Ukryj panel"><IconButton size="small" onClick={() => setTreeOpen(false)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          <Box sx={{ px: 1, pb: 1 }}><Button fullWidth size="small" variant="outlined" startIcon={<CreateNewFolderIcon />} onClick={newProject}>Nowy projekt</Button></Box>
          <Divider />
          <List dense sx={{ flex: 1, overflowY: 'auto' }}>
            {!projectFile && project && (
              <ProjectTreeItem expanded label={project.name} active sublabel="(niezapisany)" linkedPath={project.linkedPath}
                diagrams={project.diagrams} activeDiagramId={activeDiagramId}
                onSelectDiagram={(id) => { selectDiagram(id); if (isNarrow) setTreeOpen(false); }} onAddDiagram={addDiagram} onRenameDiagram={renameDiagram} onDeleteDiagram={deleteDiagram}
                onLink={pickProjectDir} onUnlink={clearProjectDir} onRename={() => void saveProject()} onDelete={undefined} />
            )}
            {projectFiles.map((file) => {
              const isActive = file === projectFile;
              return (
                <ProjectTreeItem key={file} expanded={isActive} active={isActive} label={projectDisplayName(file)} linkedPath={isActive ? project?.linkedPath : undefined}
                  diagrams={isActive ? (project?.diagrams ?? []) : []} activeDiagramId={activeDiagramId} onOpen={() => { void openProject(file); if (isNarrow) setTreeOpen(false); }}
                  onSelectDiagram={(id) => { selectDiagram(id); if (isNarrow) setTreeOpen(false); }} onAddDiagram={addDiagram} onRenameDiagram={renameDiagram} onDeleteDiagram={deleteDiagram}
                  onLink={pickProjectDir} onUnlink={clearProjectDir} onRename={() => void renameProject(file)} onDelete={() => void removeProject(file)} />
              );
            })}
          </List>
        </Box>
        {treeOpen && <ResizeHandle side="left" width={treeWidth} setWidth={setTreeWidth} />}

        {/* Center: canvas — minWidth:0 so it never collapses; key re-fits on diagram change */}
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <CategoryFilterContext.Provider value={categoryFilter}>
            <ReactFlow key={activeDiagramId ?? 'none'} nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} connectionMode={ConnectionMode.Loose}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); }} onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }} onPaneClick={() => { clearSelection(); if (isNarrow) setTreeOpen(false); }}
              deleteKeyCode={['Delete', 'Backspace']} onNodesDelete={() => setDirty(true)} onEdgesDelete={() => setDirty(true)} fitView minZoom={0.2} maxZoom={2.5}>
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
              <Controls />
              <MiniMap zoomable pannable nodeColor={(n) => KIND_META[(n.data as UmlNodeData)?.kind ?? 'class']?.color ?? '#999'} />
            </ReactFlow>
          </CategoryFilterContext.Provider>
        </Box>

        {propsOpen && <ResizeHandle side="right" width={propsWidth} setWidth={setPropsWidth} />}
        {/* Right: properties — overlay on mobile, opens when something is selected */}
        <Box sx={{ width: propsWidth, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', overflowY: 'auto', p: 1.5, bgcolor: 'background.paper',
          display: propsOpen ? 'block' : 'none',
          position: { xs: 'absolute', md: 'relative' }, right: 0, top: 0, height: '100%', zIndex: 6, boxShadow: { xs: 6, md: 0 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>Właściwości</Typography>
            <Tooltip title="Ukryj panel"><IconButton size="small" onClick={() => setPropsOpen(false)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Box>
          {!selectedNode && !selectedEdge && <Typography variant="body2" color="text.secondary">Wybierz klasę lub relację, aby edytować właściwości. Przeciągnij od krawędzi klasy, aby utworzyć połączenie.</Typography>}

          {selectedNode && (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Class properties</Typography>
              <TextField select size="small" label="Type" value={selectedNode.data.kind} onChange={(e) => patchNodeData(selectedNode.id, { kind: e.target.value as UmlKind })}>
                {(Object.keys(KIND_META) as UmlKind[]).map((k) => <MenuItem key={k} value={k}>{KIND_META[k].label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Name" value={selectedNode.data.name} onChange={(e) => patchNodeData(selectedNode.id, { name: e.target.value })} />

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Fields</Typography></Divider>
              <MemberSection title="Fields" members={selFields} categories={allCategories}
                onAdd={() => updateMembers(selectedNode.id, (ms) => [...ms, member('field', '- field: type')])}
                onChange={(mid, text) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, text, category: fieldNameOptional(text) ? 'optional' : m.category } : m)))}
                onCategory={(mid, category) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, category: category || undefined } : m)))}
                onDelete={(mid) => updateMembers(selectedNode.id, (ms) => ms.filter((m) => m.id !== mid))}
                onReorder={(from, to) => updateMembers(selectedNode.id, (ms) => reorderWithinKind(ms, from, to))} />

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Methods</Typography></Divider>
              <MemberSection title="Methods" members={selMethods} categories={allCategories}
                onAdd={() => updateMembers(selectedNode.id, (ms) => [...ms, member('method', '+ method(): void')])}
                onChange={(mid, text) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, text } : m)))}
                onCategory={(mid, category) => updateMembers(selectedNode.id, (ms) => ms.map((m) => (m.id === mid ? { ...m, category: category || undefined } : m)))}
                onDelete={(mid) => updateMembers(selectedNode.id, (ms) => ms.filter((m) => m.id !== mid))}
                onReorder={(from, to) => updateMembers(selectedNode.id, (ms) => reorderWithinKind(ms, from, to))} />

              <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Powiązany plik</Typography></Divider>
              {selectedNode.data.linkedFile ? (
                <>
                  <Chip icon={<LinkIcon />} label={selectedNode.data.linkedFile} size="small" sx={{ maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} onDelete={() => patchNodeData(selectedNode.id, { linkedFile: undefined })} />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setPreviewRel(selectedNode.data.linkedFile!)}>Podgląd</Button>
                    <Button size="small" startIcon={<LinkIcon />} onClick={() => pickNodeFile(selectedNode.id)}>Zmień</Button>
                  </Stack>
                </>
              ) : <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => pickNodeFile(selectedNode.id)}>Powiąż z plikiem</Button>}

              <Divider />
              <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={deleteSelection}>Usuń klasę</Button>
            </Stack>
          )}

          {selectedEdge && (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Właściwości relacji</Typography>
              <TextField select size="small" label="Typ relacji" value={(selectedEdge.data as UmlEdgeData)?.relType ?? 'association'} onChange={(e) => patchEdgeData(selectedEdge.id, { relType: e.target.value as RelType })}>
                {REL_ORDER.map((r) => <MenuItem key={r} value={r}>{REL_META[r].label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Etykieta" value={(selectedEdge.data as UmlEdgeData)?.label ?? ''} onChange={(e) => patchEdgeData(selectedEdge.id, { label: e.target.value })} />
              <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={deleteSelection}>Usuń relację</Button>
            </Stack>
          )}
        </Box>

        {/* Far right: linked-files tree (toggleable) — overlay on mobile */}
        {showFilesPanel && <ResizeHandle side="right" width={filesWidth} setWidth={setFilesWidth} />}
        {showFilesPanel && (
          <Box sx={{ flexShrink: 0, position: { xs: 'absolute', md: 'relative' }, right: 0, top: 0, height: '100%', zIndex: 7, boxShadow: { xs: 6, md: 0 } }}>
            <LinkedFilesPanel width={filesWidth} projectLinkedPath={project?.linkedPath} items={linkedItems}
              outputs={project?.outputs ?? []} generating={generating}
              onAddOutput={openOutputDialog} onRemoveOutput={removeOutput} onGenerate={generateOutput}
              onPreview={(rel) => setPreviewRel(rel)} onClose={() => setShowFilesPanel(false)} />
          </Box>
        )}
      </Box>

      {picker && <VfsPickerDialog open userName={userName} mode={picker.mode} title={picker.title} onPick={picker.onPick} onClose={() => setPicker(null)} />}
      <Dialog open={outputDialog} onClose={() => setOutputDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Dodaj plik wyjściowy</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
            <TextField
              autoFocus fullWidth size="small"
              label="Ścieżka (od katalogu użytkownika)"
              placeholder="drive/uml/Model.d.ts"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && outputPath.trim()) { addOutput(outputPath); setOutputDialog(false); } }}
              helperText="Pliki w Drive zaczynają się od „drive/”. Rozszerzenie wybiera generator: *.schema.json → JSON Schema, *.d.ts → typy TS."
            />
            <Button size="small" sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
              onClick={() => setPicker({ mode: 'dir', title: 'Wybierz folder docelowy (np. w drive/…)', onPick: (rel) => {
                const fn = outputPath.split('/').pop() || 'Model.d.ts';
                setOutputPath(`${rel.replace(/\/+$/, '')}/${fn}`);
              } })}>
              Folder…
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutputDialog(false)}>Anuluj</Button>
          <Button
            variant="contained"
            disabled={!/\.(schema\.json|d\.ts)$/i.test(outputPath.trim())}
            onClick={() => { addOutput(outputPath); setOutputDialog(false); }}
          >
            Dodaj
          </Button>
        </DialogActions>
      </Dialog>
      <FilePreviewDialog open={!!previewRel} userName={userName} rel={previewRel} onClose={() => setPreviewRel(null)} />
      <CommitDialog open={commitOpen} canCommit={uncommitted} onCommit={doCommit} onClose={() => setCommitOpen(false)} />
      <HistoryDialog open={historyOpen} history={project?.history ?? null} uncommitted={uncommitted} onClose={() => setHistoryOpen(false)} onCheckoutBranch={checkoutBranch} onNewBranch={newBranch} onRestore={restoreCommit} />
      <UmlDiffDialog open={diffOpen} history={project?.history ?? null} workingDiagrams={project ? commitActive(project).diagrams : []} defaultDiagramId={activeDiagramId} onClose={() => setDiffOpen(false)} />

      <Dialog open={openProjOpen} onClose={() => setOpenProjOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Otwórz projekt UML</DialogTitle>
        <DialogContent dividers>
          {projectFiles.length === 0
            ? <Typography variant="body2" color="text.secondary">Brak zapisanych projektów w drive/uml/. Utwórz „Nowy projekt" i zapisz, albo wygeneruj „Z kodu".</Typography>
            : (
              <List dense>
                {projectFiles.map((f) => (
                  <ListItem key={f} disablePadding
                    secondaryAction={<Tooltip title="Usuń projekt"><IconButton edge="end" size="small" onClick={() => void removeProject(f)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}>
                    <ListItemButton selected={f === projectFile} onClick={() => { setOpenProjOpen(false); void openProject(f); }}>
                      <ListItemIcon sx={{ minWidth: 30 }}><SchemaIcon fontSize="small" /></ListItemIcon>
                      <ListItemText primary={projectDisplayName(f)} secondary={f === projectFile ? 'otwarty' : undefined} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void openOpenProjectDialog()}>Odśwież</Button>
          <Button onClick={() => setOpenProjOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)} variant="filled">{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Left-tree project item
// ──────────────────────────────────────────────────────────────────────────

function ProjectTreeItem({ label, sublabel, active, expanded, linkedPath, diagrams, activeDiagramId, onOpen, onSelectDiagram, onAddDiagram, onRenameDiagram, onDeleteDiagram, onLink, onUnlink, onRename, onDelete }: {
  label: string; sublabel?: string; active: boolean; expanded: boolean; linkedPath?: string;
  diagrams: UmlDiagram[]; activeDiagramId: string | null;
  onOpen?: () => void; onSelectDiagram: (id: string) => void; onAddDiagram: () => void; onRenameDiagram: (id: string) => void; onDeleteDiagram: (id: string) => void;
  onLink: () => void; onUnlink: () => void; onRename?: () => void; onDelete?: () => void;
}) {
  return (
    <>
      <ListItem disablePadding secondaryAction={active ? (
        <Stack direction="row">
          <Tooltip title={linkedPath ? `Katalog: ${linkedPath}` : 'Powiąż z katalogiem'}><IconButton size="small" edge="end" onClick={linkedPath ? onUnlink : onLink}>{linkedPath ? <LinkOffIcon fontSize="small" /> : <LinkIcon fontSize="small" />}</IconButton></Tooltip>
          {onRename && <Tooltip title="Zmień nazwę / zapisz"><IconButton size="small" edge="end" onClick={onRename}><DriveFileRenameOutlineIcon fontSize="small" /></IconButton></Tooltip>}
          {onDelete && <Tooltip title="Usuń projekt"><IconButton size="small" edge="end" onClick={onDelete}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}
        </Stack>
      ) : undefined}>
        <ListItemButton selected={active} onClick={onOpen} sx={{ pr: active ? 12 : 2 }}>
          <ListItemIcon sx={{ minWidth: 28 }}>{expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}</ListItemIcon>
          <ListItemText primary={label} secondary={sublabel ?? (linkedPath ? `→ ${linkedPath}` : undefined)} primaryTypographyProps={{ fontWeight: active ? 700 : 400, noWrap: true }} secondaryTypographyProps={{ noWrap: true, fontSize: 10 }} />
        </ListItemButton>
      </ListItem>
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <List dense disablePadding>
          {diagrams.map((d) => (
            <ListItem key={d.id} disablePadding sx={{ pl: 2 }} secondaryAction={
              <Stack direction="row">
                <Tooltip title="Zmień nazwę"><IconButton size="small" edge="end" onClick={() => onRenameDiagram(d.id)}><DriveFileRenameOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                <Tooltip title="Usuń diagram"><IconButton size="small" edge="end" onClick={() => onDeleteDiagram(d.id)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
              </Stack>}>
              <ListItemButton selected={d.id === activeDiagramId} onClick={() => onSelectDiagram(d.id)} sx={{ pl: 3, pr: 9 }}>
                <ListItemIcon sx={{ minWidth: 26 }}><SchemaIcon sx={{ fontSize: 16 }} /></ListItemIcon>
                <ListItemText primary={d.name} primaryTypographyProps={{ noWrap: true, fontSize: 13 }} />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem disablePadding sx={{ pl: 5 }}>
            <ListItemButton onClick={onAddDiagram}><ListItemIcon sx={{ minWidth: 26 }}><NoteAddIcon sx={{ fontSize: 16 }} /></ListItemIcon><ListItemText primary="Nowy diagram" primaryTypographyProps={{ fontSize: 12, color: 'text.secondary' }} /></ListItemButton>
          </ListItem>
        </List>
      </Collapse>
    </>
  );
}

export default function UmlEditorPage() {
  const { userName } = useParams<{ userName: string }>();
  if (!userName) return null;
  return (
    <ReactFlowProvider>
      <UmlEditor userName={userName} />
    </ReactFlowProvider>
  );
}
