import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Divider,
  Typography,
  IconButton,
  Tooltip,
  useMediaQuery,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Alert,
  Menu,
  MenuItem,
  CircularProgress,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Switch,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import CircleIcon from '@mui/icons-material/Circle';
import AbcIcon from '@mui/icons-material/Abc';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import ViewListIcon from '@mui/icons-material/ViewList';
import TuneIcon from '@mui/icons-material/Tune';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RefreshIcon from '@mui/icons-material/Refresh';
// Icon registry
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import HomeIcon from '@mui/icons-material/Home';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StarIcon from '@mui/icons-material/Star';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventIcon from '@mui/icons-material/Event';
import ImageIcon from '@mui/icons-material/Image';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CodeIcon from '@mui/icons-material/Code';
import CloudIcon from '@mui/icons-material/Cloud';
import MailIcon from '@mui/icons-material/Mail';
import ShareIcon from '@mui/icons-material/Share';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorageIcon from '@mui/icons-material/Storage';
import LockIcon from '@mui/icons-material/Lock';
import PhoneIcon from '@mui/icons-material/Phone';
import MapIcon from '@mui/icons-material/Map';
import ArticleIcon from '@mui/icons-material/Article';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import WifiIcon from '@mui/icons-material/Wifi';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DataObjectIcon from '@mui/icons-material/DataObject';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SyncIcon from '@mui/icons-material/Sync';
import ReactMarkdown from 'react-markdown';

// ─── Types ───────────────────────────────────────────────────────────────────

type DashValue =
  | string
  | number
  | boolean
  | null
  | DashValue[]
  | { [k: string]: DashValue };

type QFieldType = 'QIcon' | 'QImage' | 'QString' | 'QNumber' | 'QArray' | 'QMap' | 'QObjectRef' | 'QChildsObjectRef' | 'QFilePath';

const FIELD_TYPES: QFieldType[] = ['QString', 'QNumber', 'QFilePath', 'QObjectRef', 'QChildsObjectRef', 'QIcon', 'QImage', 'QArray', 'QMap'];

interface QObjectRefValue { filePath: string; objectPath: string; [k: string]: DashValue; }
const isObjectRef = (v: DashValue): v is QObjectRefValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'filePath' in v && 'objectPath' in v;

interface FieldDef { name: string; type: string; }

// Base transform — every DashObject has this (like Qt's QWidget geometry)
interface DashTransform {
  x: number;
  y: number;
  rot: number;
  scale: number;
  width: number;
  height: number;
}

interface DashObject {
  id: string;
  className: string;
  objectName: string;
  transform: DashTransform;
  customFields?: FieldDef[];
  properties: Record<string, DashValue>;
  showPins?: boolean;
  showDetails?: boolean;
  showHeader?: boolean;
  zIndex?: number;
}

// Used only when parsing old scenes that stored x/y directly (no transform)
type LegacyDashObject = Omit<DashObject, 'transform'> & { transform?: DashTransform; x?: number; y?: number };

interface DataSourceEntry {
  id: string;
  name: string;
  filePath: string;
  fileType: 'json' | 'js';
}

interface FunctionCallObject {
  id: string;
  sourceId: string;       // DataSourceEntry.id
  symbolPath: string;     // e.g. "ClassName.methodName" or "functionName"
  paramNames: string[];
  argOverrides: Record<number, string>;  // manual arg values when no Var connected
  result: string | null;  // JSON-serialized last result
  error: string | null;
  x: number;
  y: number;
  pinsFlipped?: boolean;  // when true: arg handles on right, return on right
}

interface VarObject {
  id: string;
  varName: string;
  varValue: string | null;  // JSON-serialized value
  x: number;
  y: number;
  pinsFlipped?: boolean;  // when true: both pins on right side
}

interface FcEdge {
  id: string;
  source: string;
  sourceHandle: string;   // 'return' on FunctionCall, 'value_out' on Var, 'get_X'/'instance_out' on ClassObj
  target: string;
  targetHandle: string;   // 'arg_N'/'this' on FunctionCall, 'value_in' on Var, 'set_X'/'instance_in' on ClassObj
}

interface ClassObjItem {
  id: string;
  sourceId: string;
  className: string;
  fieldNames: string[];       // ordered list of field/getter names
  instanceValue: string | null; // JSON-serialized current instance
  x: number;
  y: number;
  pinsFlipped?: boolean;      // when true: SET pins on right, GET pins on left
}

interface GetPropObject {
  id: string;
  propNameOverride: string;   // inline fallback when propname_in not connected
  result: string | null;
  error: string | null;
  x: number;
  y: number;
}

interface SetPropObject {
  id: string;
  propNameOverride: string;
  result: string | null;
  error: string | null;
  x: number;
  y: number;
}

interface DashScene {
  type: 'dash-scene';
  version: 1;
  umlProjectPath?: string;
  umlSources?: Array<{ id: string; path: string }>;
  dataSources?: DataSourceEntry[];
  functionCalls?: FunctionCallObject[];
  vars?: VarObject[];
  classObjs?: ClassObjItem[];
  getProps?: GetPropObject[];
  setProps?: SetPropObject[];
  fcEdges?: FcEdge[];
  objects: DashObject[];
}

interface UmlMember { id: string; kind: 'field' | 'method'; text: string; }

interface UmlClassDef {
  name: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum';
  fields: FieldDef[];
}

interface UmlSource {
  id: string;
  path: string;
  name: string;
  classes: UmlClassDef[];
}

interface DashObjectNodeData extends Record<string, unknown> {
  objectId: string;
  objectName: string;
  className: string;
  fields: FieldDef[];
  properties: Record<string, DashValue>;
  transform: DashTransform;
  selected: boolean;
  userName: string;
  isCustom: boolean;
  showPins: boolean;
  onPropertyChange: (field: string, value: DashValue) => void;
  onObjectNameChange: (name: string) => void;
  onFieldAdd: (name: string, type: string) => void;
  onFieldRemove: (name: string) => void;
  onFieldTypeChange: (name: string, newType: string) => void;
  onFieldRename: (oldName: string, newName: string) => void;
  onResizeDrag: (width: number, height: number) => void;
  showDetails: boolean;
  showHeader: boolean;
  selectedFieldName: string | null;
  onFieldSelect: (fieldName: string | null) => void;
}

interface DashEditorPanelProps { userName: string; filePath: string; }

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Resolve the runtime value carried by an edge, reading from current scene state. */
const resolveSource = (edge: FcEdge, scene: DashScene): unknown => {
  const dashObjSrc = scene.objects?.find((o) => o.id === edge.source);
  if (dashObjSrc && edge.sourceHandle === 'value_out') {
    return dashObjSrc.properties;
  }
  const varSrc = scene.vars?.find((v) => v.id === edge.source);
  if (varSrc?.varValue !== null && varSrc?.varValue !== undefined) {
    if (edge.sourceHandle.startsWith('get_')) {
      const f = edge.sourceHandle.slice(4);
      try { return (JSON.parse(varSrc.varValue) as Record<string, unknown>)[f]; } catch { return undefined; }
    }
    try { return JSON.parse(varSrc.varValue); } catch { return varSrc.varValue; }
  }
  const fcSrc = scene.functionCalls?.find((f) => f.id === edge.source);
  if (fcSrc?.result !== null && fcSrc?.result !== undefined) {
    try { return JSON.parse(fcSrc.result); } catch { return fcSrc.result; }
  }
  const objSrc = scene.classObjs?.find((o) => o.id === edge.source);
  if (objSrc?.instanceValue !== null && objSrc?.instanceValue !== undefined) {
    if (edge.sourceHandle === 'instance_out') {
      try { return JSON.parse(objSrc.instanceValue); } catch { return objSrc.instanceValue; }
    } else if (edge.sourceHandle.startsWith('get_')) {
      const f = edge.sourceHandle.slice(4);
      try { return (JSON.parse(objSrc.instanceValue) as Record<string, unknown>)[f]; } catch { return undefined; }
    }
  }
  const getPropSrc = scene.getProps?.find((n) => n.id === edge.source);
  if (getPropSrc?.result !== null && getPropSrc?.result !== undefined) {
    try { return JSON.parse(getPropSrc.result); } catch { return getPropSrc.result; }
  }
  const setPropSrc = scene.setProps?.find((n) => n.id === edge.source);
  if (setPropSrc?.result !== null && setPropSrc?.result !== undefined) {
    try { return JSON.parse(setPropSrc.result); } catch { return setPropSrc.result; }
  }
  return undefined;
};

const detectFieldType = (typeStr: string): QFieldType => {
  const t = typeStr.trim();
  if (t.endsWith('[]')) return 'QArray';
  if (t === 'QIcon') return 'QIcon';
  if (t === 'QImage') return 'QImage';
  if (t === 'QNumber') return 'QNumber';
  if (t === 'QArray') return 'QArray';
  if (t === 'QMap') return 'QMap';
  if (t === 'QObjectRef') return 'QObjectRef';
  if (t === 'QChildsObjectRef') return 'QChildsObjectRef';
  if (t === 'QFilePath') return 'QFilePath';
  return 'QString';
};

const defaultForType = (t: QFieldType): DashValue => {
  if (t === 'QNumber') return 0;
  if (t === 'QArray') return [];
  if (t === 'QMap') return {};
  if (t === 'QObjectRef' || t === 'QChildsObjectRef') return { filePath: '', objectPath: '' } as DashValue;
  return '';
};

const defaultTransform = (x = 0, y = 0): DashTransform =>
  ({ x, y, rot: 0, scale: 1, width: 0, height: 0 });

// Migration: old scenes had x/y directly on the object
const getTransform = (obj: DashObject & { x?: number; y?: number }): DashTransform =>
  obj.transform ?? defaultTransform(obj.x ?? 0, obj.y ?? 0);

const autoTransform = (count: number): DashTransform => ({
  x: 50 + (count % 4) * 260,
  y: 50 + Math.floor(count / 4) * 220,
  rot: 0,
  scale: 1,
  width: 0,
  height: 0,
});

// ─── Touch / pen drag-and-drop ────────────────────────────────────────────────
// HTML5 DnD doesn't fire on touch/pen. We use touchstart/touchmove/touchend
// with { passive: false } so we can preventDefault() to block browser scroll.
// Pen uses pointerdown + { passive:false } native listeners.
interface TDPayload { mime: string; data: string; label: string; }
let _touchDropCb: ((cx: number, cy: number, payload: TDPayload) => void) | null = null;
let _ghostEl: HTMLDivElement | null = null;

function _showTDGhost(text: string, x: number, y: number) {
  _removeTDGhost(); // clean any leftover from previous drag
  _ghostEl = document.createElement('div');
  _ghostEl.textContent = '⊕ ' + text;
  Object.assign(_ghostEl.style, {
    position: 'fixed', zIndex: '99999', pointerEvents: 'none',
    padding: '4px 10px', background: '#7c4dff', color: '#fff',
    borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace',
    opacity: '0.92', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    transform: 'translate(-50%,-120%)', left: x + 'px', top: y + 'px',
  });
  document.body.appendChild(_ghostEl);
  // Failsafe: capture-phase listener guarantees ghost removal on any lift event,
  // even if the source element's onPenUp/onTouchEnd is bypassed by ReactFlow.
  const remove = () => { _removeTDGhost(); };
  document.addEventListener('pointerup', remove, { once: true, capture: true });
  document.addEventListener('pointercancel', remove, { once: true, capture: true });
  document.addEventListener('touchend', remove, { once: true, capture: true });
  document.addEventListener('touchcancel', remove, { once: true, capture: true });
}
function _moveTDGhost(x: number, y: number) {
  if (_ghostEl) { _ghostEl.style.left = x + 'px'; _ghostEl.style.top = y + 'px'; }
}
function _removeTDGhost() {
  if (_ghostEl) { try { document.body.removeChild(_ghostEl); } catch {} _ghostEl = null; }
}

/**
 * Attach touch/pen drag-and-drop to an element.
 * Call from a React ref-callback or imperatively. Uses native (non-React)
 * listeners with passive:false so preventDefault() stops browser scroll.
 */
function attachDragSource(el: HTMLElement, getPayload: () => TDPayload) {
  // ── Touch (finger) ──────────────────────────────────────────────────────────
  let startX = 0, startY = 0, dragStarted = false, activeTD: TDPayload | null = null;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    dragStarted = false; activeTD = null;
  };

  const onTouchMove = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    const d = Math.hypot(t.clientX - startX, t.clientY - startY);
    if (!dragStarted && d > 8) {
      dragStarted = true;
      activeTD = getPayload();
      _showTDGhost(activeTD.label, t.clientX, t.clientY);
    }
    if (dragStarted) {
      e.preventDefault(); // stops scroll once drag begins
      _moveTDGhost(t.clientX, t.clientY);
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (dragStarted && _touchDropCb && activeTD) {
      const t = e.changedTouches[0];
      _touchDropCb(t.clientX, t.clientY, activeTD);
    }
    _removeTDGhost();
    dragStarted = false; activeTD = null;
  };

  // ── Pen (stylus) ────────────────────────────────────────────────────────────
  let penStarted = false, penTD: TDPayload | null = null, penPID = -1;

  const onPenDown = (e: PointerEvent) => {
    if (e.pointerType !== 'pen') return;
    e.preventDefault();
    penPID = e.pointerId;
    penStarted = false; penTD = null;
    startX = e.clientX; startY = e.clientY;
    el.setPointerCapture(e.pointerId);
  };

  const onPenMove = (e: PointerEvent) => {
    if (e.pointerType !== 'pen' || e.pointerId !== penPID) return;
    const d = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (!penStarted && d > 8) {
      penStarted = true;
      penTD = getPayload();
      _showTDGhost(penTD.label, e.clientX, e.clientY);
    }
    if (penStarted) _moveTDGhost(e.clientX, e.clientY);
  };

  const onPenUp = (e: PointerEvent) => {
    if (e.pointerType !== 'pen' || e.pointerId !== penPID) return;
    if (penStarted && _touchDropCb && penTD) _touchDropCb(e.clientX, e.clientY, penTD);
    _removeTDGhost();
    penStarted = false; penTD = null; penPID = -1;
  };

  const onPenCancel = (e: PointerEvent) => {
    if (e.pointerType !== 'pen') return;
    _removeTDGhost();
    penStarted = false; penTD = null; penPID = -1;
  };

  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: false });
  el.addEventListener('touchcancel', onTouchEnd, { passive: false });
  el.addEventListener('pointerdown', onPenDown, { passive: false });
  el.addEventListener('pointermove', onPenMove, { passive: false });
  el.addEventListener('pointerup', onPenUp, { passive: false });
  el.addEventListener('pointercancel', onPenCancel, { passive: false });

  return () => {
    el.removeEventListener('touchstart', onTouchStart);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('touchcancel', onTouchEnd);
    el.removeEventListener('pointerdown', onPenDown);
    el.removeEventListener('pointermove', onPenMove);
    el.removeEventListener('pointerup', onPenUp);
    el.removeEventListener('pointercancel', onPenCancel);
  };
}

/** React ref callback — attaches drag source listeners to a DOM element. */
function makeDragRef(getPayload: () => TDPayload): (el: HTMLElement | null) => void {
  let cleanup: (() => void) | null = null;
  return (el) => {
    if (cleanup) { cleanup(); cleanup = null; }
    if (el) cleanup = attachDragSource(el, getPayload);
  };
}
// ─────────────────────────────────────────────────────────────────────────────

const apiBase = (userName: string) => `/api/users/${encodeURIComponent(userName)}/vfs`;
const authToken = () => {
  try {
    const raw = localStorage.getItem('minis_current_user');
    if (!raw) return '';
    return (JSON.parse(raw) as { token?: string }).token ?? '';
  } catch { return ''; }
};

// Backend VFS requires absolute paths rooted at /data/Minis/Users/{u}.
// Drive-relative paths (e.g. "uml/foo.dash.json") get expanded here.
const toAbsVfsPath = (userName: string, rel: string): string => {
  if (rel.startsWith('/data/Minis/')) return rel;          // already absolute
  const cleaned = rel.replace(/^\/+|\/+$/g, '');
  return cleaned
    ? `/data/Minis/Users/${userName}/drive/${cleaned}`
    : `/data/Minis/Users/${userName}/drive`;
};

const b64ToText = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
};
const textToB64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const vfsRead = async (userName: string, path: string): Promise<string> => {
  const r = await fetch(`${apiBase(userName)}/readFile?path=${encodeURIComponent(toAbsVfsPath(userName, path))}`,
    { headers: { Authorization: `Bearer ${authToken()}` } });
  if (!r.ok) throw new Error(`readFile ${r.status}`);
  const j = (await r.json()) as { data?: string };
  return b64ToText(j.data ?? '');
};

const vfsWrite = async (userName: string, path: string, text: string): Promise<void> => {
  const r = await fetch(`${apiBase(userName)}/writeFile?path=${encodeURIComponent(toAbsVfsPath(userName, path))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
    body: JSON.stringify({ data: textToB64(text), options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeFile ${r.status}`);
};

const vfsReaddir = async (userName: string, path: string): Promise<Array<{ name: string; isDir: boolean }>> => {
  const r = await fetch(`${apiBase(userName)}/readdir?path=${encodeURIComponent(toAbsVfsPath(userName, path))}`,
    { headers: { Authorization: `Bearer ${authToken()}` } });
  const j = (await r.json()) as { entries?: Array<{ name: string; type: number }> };
  return (j.entries ?? [])
    .map((e) => ({ name: e.name, isDir: e.type === 2 }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
};

const makeId = () => Math.random().toString(36).slice(2, 10);

// Executes a named function/method from a JS source string.
// Strips ES module syntax (import/export) so new Function() can run the code.
const executeFunctionFromSource = async (code: string, symbolPath: string, args: unknown[], thisValue?: unknown): Promise<unknown> => {
  const stripped = code
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+\{[^}]*\}\s*(?:from\s+['"][^'"]*['"])?\s*;?/gm, '')
    .replace(/^\s*export\s+/gm, '')
    .replace(/^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"][^'"]*['"]\s*;?/gm, '')
    .replace(/^\s*import\s+['"][^'"]*['"]\s*;?/gm, '');
  const parts = symbolPath.split('.');
  // __invoke__: calls fn(...args), silently retries with new if it's a class constructor
  const invokeHelper = `function __invoke__(fn, args) {
  try { return fn(...args); } catch(e) {
    if (e instanceof TypeError && /class constructor|cannot be invoked without/i.test(e.message))
      return new fn(...args);
    throw e;
  }
}`;
  let callExpr: string;
  if (parts.length === 1 || parts[parts.length - 1] === 'constructor') {
    // Standalone function OR ClassName.constructor → just construct/call with auto-new
    const target = parts[0];
    callExpr = [
      invokeHelper,
      `if (typeof ${target} === 'undefined') throw new Error('Symbol "${target}" not found in source');`,
      `if (typeof ${target} !== 'function') throw new Error('"${target}" is not a function');`,
      `return __invoke__(${target}, __args__);`,
    ].join('\n');
  } else if (thisValue !== undefined) {
    // ClassName.method with explicit `this` object provided via handle
    callExpr = [
      `const __inst__ = Object.assign(Object.create(Object.getPrototypeOf(__thisValue__) ?? Object.prototype), __thisValue__);`,
      `if (typeof ${parts[0]} !== 'undefined') Object.setPrototypeOf(__inst__, ${parts[0]}.prototype);`,
      `if (typeof __inst__['${parts[parts.length - 1]}'] !== 'function') throw new Error('"${symbolPath}" is not a method');`,
      `return __inst__['${parts[parts.length - 1]}'](...__args__);`,
    ].join('\n');
  } else {
    // ClassName.method → instantiate class (no args), then call method
    callExpr = [
      invokeHelper,
      `if (typeof ${parts[0]} === 'undefined') throw new Error('Class "${parts[0]}" not found in source');`,
      `const __inst__ = __invoke__(${parts[0]}, []);`,
      `if (typeof __inst__['${parts[parts.length - 1]}'] !== 'function') throw new Error('"${symbolPath}" is not a method');`,
      `return __inst__['${parts[parts.length - 1]}'](...__args__);`,
    ].join('\n');
  }
  // eslint-disable-next-line no-new-func
  const fn = thisValue !== undefined
    ? new Function('__args__', '__thisValue__', `${stripped}\n${callExpr}`)
    : new Function('__args__', `${stripped}\n${callExpr}`);
  const result = thisValue !== undefined ? fn(args, thisValue) : fn(args);
  return result instanceof Promise ? await result : result;
};

const parseMemberText = (text: string): FieldDef | null => {
  const stripped = text.replace(/^[+\-#~]\s*/, '');
  const colonIdx = stripped.indexOf(':');
  if (colonIdx === -1) return null;
  const name = stripped.slice(0, colonIdx).trim();
  const rest = stripped.slice(colonIdx + 1).trim();
  const type = rest.split('=')[0].trim();
  if (!name || name.includes('(')) return null;
  return { name, type };
};

const parseUmlProject = (json: string): UmlClassDef[] => {
  try {
    const proj = JSON.parse(json) as {
      diagrams?: Array<{ nodes?: Array<{ data?: { name?: string; kind?: string; members?: UmlMember[] } }> }>;
    };
    const defs: UmlClassDef[] = [];
    for (const diagram of proj.diagrams ?? []) {
      for (const node of diagram.nodes ?? []) {
        const d = node.data;
        if (!d?.name) continue;
        const kind = (d.kind ?? 'class') as UmlClassDef['kind'];
        if (kind === 'interface' || kind === 'enum') continue;
        const fields: FieldDef[] = [];
        for (const m of d.members ?? []) {
          if (m.kind !== 'field') continue;
          const parsed = parseMemberText(m.text);
          if (parsed) fields.push(parsed);
        }
        if (!defs.find((x) => x.name === d.name)) defs.push({ name: d.name, kind, fields });
      }
    }
    return defs;
  } catch { return []; }
};

// ─── Icon registry ────────────────────────────────────────────────────────────

const ICON_REGISTRY: Record<string, React.ElementType> = {
  Home: HomeIcon, Settings: SettingsIcon, Person: PersonIcon, Group: GroupIcon,
  Favorite: FavoriteIcon, Star: StarIcon, Notifications: NotificationsIcon,
  Dashboard: DashboardIcon, Assignment: AssignmentIcon, Event: EventIcon,
  Image: ImageIcon, Camera: CameraAltIcon, Code: CodeIcon, Cloud: CloudIcon,
  Mail: MailIcon, Share: ShareIcon, Edit: EditIcon, Delete: DeleteIcon,
  Build: BuildIcon, Info: InfoIcon, Warning: WarningIcon, CheckCircle: CheckCircleIcon,
  Storage: StorageIcon, Lock: LockIcon, Phone: PhoneIcon, Map: MapIcon,
  Article: ArticleIcon, BarChart: BarChartIcon, Emoji: EmojiEmotionsIcon, Wifi: WifiIcon,
};

const MuiIconPreview: React.FC<{ name: string; size?: number }> = ({ name, size = 18 }) => {
  const IconComp = ICON_REGISTRY[name] as React.FC<{ sx?: object }> | undefined;
  if (!IconComp) return <BrokenImageIcon sx={{ fontSize: size, color: 'text.disabled' }} />;
  return <IconComp sx={{ fontSize: size }} />;
};

// ─── Built-in classes ─────────────────────────────────────────────────────────

const BUILT_IN_CLASSES: UmlClassDef[] = [
  { name: 'Unknown', kind: 'class', fields: [] },
  {
    name: 'View', kind: 'class',
    fields: [
      { name: 'icon', type: 'QIcon' }, { name: 'thumbnail', type: 'QImage' },
      { name: 'label', type: 'QString' }, { name: 'order', type: 'QNumber' },
      { name: 'tags', type: 'QArray' }, { name: 'metadata', type: 'QMap' },
    ],
  },
  {
    name: 'MarkdownView', kind: 'class',
    fields: [{ name: 'src', type: 'QString' }, { name: 'title', type: 'QString' }],
  },
  {
    name: 'ObjectRef', kind: 'class',
    fields: [{ name: 'filePath', type: 'QString' }, { name: 'objectPath', type: 'QString' }],
  },
];

const makeDemoScene = (): DashScene => ({
  type: 'dash-scene',
  version: 1,
  objects: [
    {
      id: 'view1', className: 'View', objectName: 'mainView',
      transform: defaultTransform(100, 80),
      properties: { icon: 'Home', thumbnail: '', label: 'Main View', order: 1, tags: ['ui', 'main'], metadata: { version: '1.0' } },
    },
    {
      id: 'unknown1', className: 'Unknown', objectName: 'myObject',
      transform: defaultTransform(430, 80),
      customFields: [{ name: 'title', type: 'QString' }, { name: 'count', type: 'QNumber' }],
      properties: { title: 'Hello', count: 0 },
    },
  ],
});

// ─── Field widgets ────────────────────────────────────────────────────────────

const QStringWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);
  if (editing) {
    return <TextField size="small" value={draft} autoFocus variant="standard"
      inputProps={{ style: { fontSize: 11, fontFamily: 'monospace' } }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); onChange(draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(draft); } if (e.key === 'Escape') { setEditing(false); setDraft(String(value ?? '')); } }}
      sx={{ width: '100%' }} />;
  }
  return <Typography sx={{ fontSize: 11, fontFamily: 'monospace', cursor: 'text', color: value ? 'text.primary' : 'text.disabled', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 0.25 }}
    onClick={() => { setDraft(String(value ?? '')); setEditing(true); }}>{String(value ?? '') || '…'}</Typography>;
};

const fmtNum = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  // Trim to 4 decimal places, strip trailing zeros
  return Number(n.toFixed(4)).toString();
};

const QNumberWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; step?: number }> = ({ value, onChange, step = 1 }) => {
  const numVal = typeof value === 'number' ? value : (Number(value) || 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => { setDraft(fmtNum(numVal)); setEditing(true); };
  const commit = (raw: string) => { setEditing(false); onChange(Number(raw) || 0); };
  const nudge = (dir: 1 | -1) => {
    const next = Math.round((numVal + dir * step) * 10000) / 10000;
    onChange(next);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="span"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); nudge(-1); }}
        sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: 1, fontWeight: 400, userSelect: 'none', '&:hover': { bgcolor: 'action.selected' } }}>
        −
      </Box>
      {editing ? (
        <TextField size="small" type="text" variant="standard" value={draft} autoFocus
          inputProps={{ style: { fontSize: 12, fontFamily: 'monospace', textAlign: 'center' } }}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (/^-?\d*\.?\d*$/.test(e.target.value)) setDraft(e.target.value); }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { commit(draft); }
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); setEditing(false); }
            if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); setEditing(false); }
          }}
          sx={{ flex: 1, minWidth: 0, '& .MuiInput-root:after': { borderColor: '#4fc3f7' } }} />
      ) : (
        <Box onPointerDown={(e) => e.stopPropagation()} onClick={startEdit} sx={{
          flex: 1, textAlign: 'center', cursor: 'text',
          bgcolor: 'action.hover', borderRadius: '8px', px: 1, py: '3px',
          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
          color: 'primary.main', letterSpacing: 0.3,
          border: '1px solid transparent',
          '&:hover': { borderColor: 'divider', bgcolor: 'action.selected' },
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {fmtNum(numVal)}
        </Box>
      )}
      <Box component="span"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); nudge(1); }}
        sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: 1, fontWeight: 400, userSelect: 'none', '&:hover': { bgcolor: 'action.selected' } }}>
        +
      </Box>
    </Box>
  );
};

const QIconWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [custom, setCustom] = useState(String(value ?? ''));
  const name = typeof value === 'string' ? value : '';
  useEffect(() => { setCustom(name); }, [name]);
  return (
    <>
      <Box onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget as HTMLElement); setCustom(name); }}
        onPointerDown={(e) => e.stopPropagation()}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', px: 0.5, py: 0.25, borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }}>
        <MuiIconPreview name={name} size={16} />
        <Typography sx={{ fontSize: 11, color: name ? 'text.primary' : 'text.disabled' }}>{name || '(none)'}</Typography>
      </Box>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} PaperProps={{ sx: { p: 1.5, width: 290 } }}>
        <TextField size="small" fullWidth label="Icon name" value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onChange(custom.trim()); setAnchor(null); } }} sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
          {Object.entries(ICON_REGISTRY).map(([iconName, IconComp]) => {
            const IC = IconComp as React.FC<{ sx?: object }>;
            return <Tooltip key={iconName} title={iconName}>
              <IconButton size="small" onClick={() => { onChange(iconName); setAnchor(null); }}
                sx={{ p: 0.5, bgcolor: name === iconName ? 'primary.main' : undefined, color: name === iconName ? 'primary.contrastText' : 'inherit', borderRadius: 0.5 }}>
                <IC sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>;
          })}
        </Box>
      </Popover>
    </>
  );
};

const QImageWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ value, onChange, userName }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const path = typeof value === 'string' ? value : '';
  useEffect(() => { if (!editing) setDraft(path); }, [path, editing]);
  useEffect(() => {
    let revoke: string | null = null;
    if (path && !path.startsWith('http') && !path.startsWith('data:')) {
      fetch(`${apiBase(userName)}/readFile?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${authToken()}` } })
        .then(async (r) => {
          if (!r.ok) return;
          const j = (await r.json()) as { data?: string };
          if (!j.data) return;
          const binary = atob(j.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes]));
          revoke = url; setBlobUrl(url);
        }).catch(() => {});
    } else { setBlobUrl(null); }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [path, userName]);
  const imgSrc = path.startsWith('http') || path.startsWith('data:') ? path : (blobUrl ?? undefined);
  return (
    <Box>
      {path && <Box sx={{ mb: 0.5, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 0.5, overflow: 'hidden' }}>
        {imgSrc ? <img src={imgSrc} alt="" style={{ maxHeight: 48, maxWidth: '100%', objectFit: 'contain' }} />
          : <BrokenImageIcon sx={{ fontSize: 20, color: 'text.disabled' }} />}
      </Box>}
      {editing
        ? <TextField size="small" value={draft} autoFocus variant="standard" placeholder="path or URL"
            inputProps={{ style: { fontSize: 10, fontFamily: 'monospace' } }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); onChange(draft); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(draft); } if (e.key === 'Escape') setEditing(false); }}
            sx={{ width: '100%' }} />
        : <Typography sx={{ fontSize: 10, fontFamily: 'monospace', cursor: 'text', color: path ? 'text.secondary' : 'text.disabled', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 0.25, wordBreak: 'break-all' }}
            onClick={() => { setDraft(path); setEditing(true); }}>{path || '(no image)'}</Typography>}
    </Box>
  );
};

const QArrayWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const items: DashValue[] = Array.isArray(value) ? (value as DashValue[]) : [];
  const [expanded, setExpanded] = useState(false);
  const [newItem, setNewItem] = useState('');
  const addItem = () => { if (!newItem.trim()) return; onChange([...items, newItem.trim()]); setNewItem(''); };
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }} onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>[{items.length} items]</Typography>
      </Box>
      {expanded && <Box sx={{ pl: 1, pt: 0.25 }}>
        {items.map((item, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.125, mb: 0.125 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === 0} onClick={() => moveItem(i, -1)}>
                <ArrowUpwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === items.length - 1} onClick={() => moveItem(i, 1)}>
                <ArrowDownwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{JSON.stringify(item)}</Typography>
            <IconButton size="small" sx={{ p: 0.125 }} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5 }}>
          <TextField size="small" variant="standard" placeholder="add item…" value={newItem}
            onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
            inputProps={{ style: { fontSize: 10 } }} sx={{ flex: 1 }} />
          <IconButton size="small" sx={{ p: 0.25 }} disabled={!newItem.trim()} onClick={addItem}><AddIcon sx={{ fontSize: 12 }} /></IconButton>
        </Box>
      </Box>}
    </Box>
  );
};

const QMapWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const isObj = value !== null && typeof value === 'object' && !Array.isArray(value);
  const map = isObj ? (value as Record<string, DashValue>) : {};
  const entries = Object.entries(map);
  const [expanded, setExpanded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const addPair = () => { if (!newKey.trim()) return; onChange({ ...map, [newKey.trim()]: newVal }); setNewKey(''); setNewVal(''); };
  const movePair = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(Object.fromEntries(next));
  };
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }} onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{'{' + entries.length + ' keys}'}</Typography>
      </Box>
      {expanded && <Box sx={{ pl: 1, pt: 0.25 }}>
        {entries.map(([k, v], i) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.125, mb: 0.125 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === 0} onClick={() => movePair(i, -1)}>
                <ArrowUpwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === entries.length - 1} onClick={() => movePair(i, 1)}>
                <ArrowDownwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#4fc3f7', whiteSpace: 'nowrap', flexShrink: 0 }}>{k}:</Typography>
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{JSON.stringify(v)}</Typography>
            <IconButton size="small" sx={{ p: 0.125 }} onClick={() => { const n = { ...map }; delete n[k]; onChange(n); }}>
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5 }}>
          <TextField size="small" variant="standard" placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)}
            inputProps={{ style: { fontSize: 10 } }} sx={{ width: 60, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }}>:</Typography>
          <TextField size="small" variant="standard" placeholder="value" value={newVal} onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPair(); }} inputProps={{ style: { fontSize: 10 } }} sx={{ flex: 1 }} />
          <IconButton size="small" sx={{ p: 0.25 }} disabled={!newKey.trim()} onClick={addPair}><AddIcon sx={{ fontSize: 12 }} /></IconButton>
        </Box>
      </Box>}
    </Box>
  );
};

// ─── JsonPathPickerDialog ─────────────────────────────────────────────────────

type JsonNode = string | number | boolean | null | JsonNode[] | { [k: string]: JsonNode };

const JsonPathTree: React.FC<{
  node: JsonNode;
  path: string;
  selectedPath: string;
  onSelect: (path: string) => void;
}> = ({ node, path, selectedPath, onSelect }) => {
  const [open, setOpen] = useState(false);
  const isObject = typeof node === 'object' && node !== null && !Array.isArray(node);
  const isArray = Array.isArray(node);
  const isLeaf = !isObject && !isArray;

  const label = path === '' ? '(root)' : path.split(/[.\[]/).pop()?.replace(/\]$/, '') ?? path;
  const preview = isLeaf ? ` = ${JSON.stringify(node)}` : isArray ? ` [${(node as JsonNode[]).length}]` : ` {${Object.keys(node as object).length}}`;
  const isSel = selectedPath === path;

  if (isLeaf) {
    return (
      <ListItemButton dense selected={isSel} onClick={() => onSelect(path)}
        sx={{ pl: Math.max(1, (path.split(/[.\[]/).length) * 1.5) + 'rem', py: 0.25, fontSize: 12, borderRadius: 0.5 }}>
        <Typography component="span" sx={{ fontSize: 11, fontFamily: 'monospace', color: isSel ? '#4fc3f7' : 'text.primary' }}>{label}</Typography>
        <Typography component="span" sx={{ fontSize: 10, fontFamily: 'monospace', color: 'text.disabled', ml: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{preview}</Typography>
      </ListItemButton>
    );
  }

  const depth = path === '' ? 0 : path.split(/[.\[]/).length;
  return (
    <>
      <ListItemButton dense selected={isSel} onClick={() => { setOpen(!open); onSelect(path); }}
        sx={{ pl: Math.max(1, depth * 1.5) + 'rem', py: 0.25, borderRadius: 0.5 }}>
        {open ? <ExpandMoreIcon sx={{ fontSize: 13, mr: 0.5, flexShrink: 0 }} /> : <ChevronRightIcon sx={{ fontSize: 13, mr: 0.5, flexShrink: 0 }} />}
        <Typography component="span" sx={{ fontSize: 11, fontFamily: 'monospace', color: isSel ? '#4fc3f7' : 'text.primary' }}>{label || '(root)'}</Typography>
        <Typography component="span" sx={{ fontSize: 10, fontFamily: 'monospace', color: 'text.disabled', ml: 0.5 }}>{preview}</Typography>
      </ListItemButton>
      {open && isObject && Object.entries(node as Record<string, JsonNode>).map(([k, v]) => (
        <JsonPathTree key={k} node={v} path={path ? `${path}.${k}` : k} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
      {open && isArray && (node as JsonNode[]).map((v, i) => (
        <JsonPathTree key={i} node={v} path={`${path}[${i}]`} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </>
  );
};

const JsonPathPickerDialog: React.FC<{
  open: boolean; onClose: () => void;
  filePath: string; userName: string;
  currentPath: string; onSelect: (path: string) => void;
}> = ({ open, onClose, filePath, userName, currentPath, onSelect }) => {
  const [root, setRoot] = useState<JsonNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(currentPath);

  useEffect(() => {
    if (!open || !filePath) return;
    setLoading(true); setError(null); setRoot(null); setSelected(currentPath);
    vfsRead(userName, filePath)
      .then((text) => { setRoot(JSON.parse(text) as JsonNode); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open, filePath, userName, currentPath]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 14, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AccountTreeIcon sx={{ fontSize: 16, color: '#4fc3f7' }} />
        Select JSON Path
        <Typography sx={{ fontSize: 11, color: 'text.secondary', fontFamily: 'monospace', ml: 1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filePath}</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important', pb: 1 }}>
        <Box sx={{ mb: 1, px: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: 12, color: selected ? '#4fc3f7' : 'text.disabled', minHeight: 28 }}>
          {selected || '(root)'}
        </Box>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>}
        {error && <Alert severity="error" sx={{ fontSize: 12 }}>{error}</Alert>}
        {!loading && !error && root !== null && (
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 340, overflow: 'auto' }}>
            <List dense disablePadding>
              <JsonPathTree node={root} path="" selectedPath={selected} onSelect={setSelected} />
            </List>
          </Box>
        )}
        {!filePath && <Alert severity="warning" sx={{ fontSize: 12 }}>Set FilePath first.</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" variant="contained" onClick={() => { onSelect(selected); onClose(); }}>Select</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── FilePickerDialog ─────────────────────────────────────────────────────────

const FilePickerDialog: React.FC<{
  open: boolean; onClose: () => void;
  userName: string; currentPath: string;
  startDir?: string;
  filterExt?: string;
  onSelect: (path: string) => void;
}> = ({ open, onClose, userName, currentPath, startDir, filterExt = '.json', onSelect }) => {
  const [path, setPath] = useState(currentPath);
  const defaultStart = startDir ?? `/data/Minis/Users/${userName}`;
  useEffect(() => { if (open) setPath(currentPath); }, [open, currentPath]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 14, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FolderOpenIcon sx={{ fontSize: 16, color: '#4fc3f7' }} />
        Select File
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important', pb: 1 }}>
        <TextField size="small" fullWidth label="Path" value={path} onChange={(e) => setPath(e.target.value)}
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} sx={{ mb: 1 }} />
        <VfsFilePicker userName={userName} filterExt={filterExt} startDir={defaultStart} onSelect={(p) => setPath(p)} />
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" variant="contained" onClick={() => { onSelect(path); onClose(); }}>Select</Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── QObjectRefWidget ─────────────────────────────────────────────────────────

const QObjectRefWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ value, onChange, userName }) => {
  const ref: QObjectRefValue = isObjectRef(value) ? value : { filePath: '', objectPath: '' };
  const [fileOpen, setFileOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);

  const update = (patch: Partial<QObjectRefValue>) =>
    onChange({ ...ref, ...patch } as DashValue);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {/* FilePath row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', width: 64, flexShrink: 0 }}>FilePath</Typography>
        <Box sx={{
          flex: 1, fontSize: 11, fontFamily: 'monospace', color: ref.filePath ? 'text.primary' : 'text.disabled',
          bgcolor: 'action.hover', borderRadius: '6px', px: 0.75, py: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={ref.filePath || '(none)'}>
          {ref.filePath || '(none)'}
        </Box>
        <Tooltip title="Browse file">
          <IconButton size="small" sx={{ p: 0.25 }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setFileOpen(true); }}>
            <FolderOpenIcon sx={{ fontSize: 14, color: '#4fc3f7' }} />
          </IconButton>
        </Tooltip>
      </Box>
      {/* ObjectPath row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', width: 64, flexShrink: 0 }}>ObjectPath</Typography>
        <Box sx={{
          flex: 1, fontSize: 11, fontFamily: 'monospace', color: ref.objectPath ? '#4fc3f7' : 'text.disabled',
          bgcolor: 'action.hover', borderRadius: '6px', px: 0.75, py: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={ref.objectPath || '(root)'}>
          {ref.objectPath || '(root)'}
        </Box>
        <Tooltip title={ref.filePath ? 'Browse JSON structure' : 'Set FilePath first'}>
          <span>
            <IconButton size="small" sx={{ p: 0.25 }} disabled={!ref.filePath}
              onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setPathOpen(true); }}>
              <AccountTreeIcon sx={{ fontSize: 14, color: ref.filePath ? '#4fc3f7' : 'text.disabled' }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <FilePickerDialog open={fileOpen} onClose={() => setFileOpen(false)}
        userName={userName} currentPath={ref.filePath}
        onSelect={(p) => { update({ filePath: p, objectPath: '' }); }} />
      <JsonPathPickerDialog open={pathOpen} onClose={() => setPathOpen(false)}
        filePath={ref.filePath} userName={userName} currentPath={ref.objectPath}
        onSelect={(p) => update({ objectPath: p })} />
    </Box>
  );
};

// ─── QChildsObjectRef ─────────────────────────────────────────────────────────

const resolveJsonPath = (root: JsonNode, path: string): JsonNode | undefined => {
  if (!path) return root;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: JsonNode = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (Number.isNaN(idx)) return undefined;
      cur = cur[idx] as JsonNode;
    } else {
      cur = (cur as Record<string, JsonNode>)[p] as JsonNode;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
};

const ChildItemCard: React.FC<{ item: JsonNode; index: number }> = ({ item, index }) => {
  const [collapsed, setCollapsed] = useState(false);
  const isObj = typeof item === 'object' && item !== null && !Array.isArray(item);
  const isArr = Array.isArray(item);
  const entries = isObj ? Object.entries(item as Record<string, JsonNode>) : [];

  return (
    <Box sx={{
      border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 0.5,
      bgcolor: 'background.paper', overflow: 'hidden',
    }}>
      {/* Child header */}
      <Box
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          px: 0.75, py: 0.25, cursor: 'pointer', bgcolor: 'action.hover',
          '&:hover': { bgcolor: 'action.selected' },
        }}
      >
        {collapsed
          ? <ChevronRightIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
          : <ExpandMoreIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />}
        <Box sx={{
          fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
          bgcolor: '#4fc3f722', color: '#4fc3f7', borderRadius: '4px', px: 0.5, flexShrink: 0,
        }}>#{index}</Box>
        {isObj && (
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {entries.slice(0, 3).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('  ')}
          </Typography>
        )}
        {isArr && (
          <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>[array {(item as JsonNode[]).length}]</Typography>
        )}
        {!isObj && !isArr && (
          <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.primary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {JSON.stringify(item)}
          </Typography>
        )}
      </Box>
      {/* Child fields */}
      {!collapsed && isObj && (
        <Box sx={{ px: 0.75, pt: 0.25, pb: 0.5 }}>
          {entries.map(([k, v]) => (
            <Box key={k} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, py: '2px', borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
              <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#4fc3f7aa', flexShrink: 0, width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</Typography>
              <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.primary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                ...(typeof v === 'number' ? { color: '#81c784' } : {}),
                ...(typeof v === 'boolean' ? { color: '#ffb74d' } : {}),
                ...(v === null ? { color: 'text.disabled', fontStyle: 'italic' } : {}),
              }}>
                {v === null ? 'null' : JSON.stringify(v)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {!collapsed && isArr && (
        <Box sx={{ px: 0.75, py: 0.5 }}>
          <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>[{(item as JsonNode[]).length} items]</Typography>
        </Box>
      )}
    </Box>
  );
};

const QChildsObjectRefWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ value, onChange, userName }) => {
  const ref: QObjectRefValue = isObjectRef(value) ? value : { filePath: '', objectPath: '' };
  const [fileOpen, setFileOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(!ref.filePath);
  const [items, setItems] = useState<JsonNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const update = (patch: Partial<QObjectRefValue>) =>
    onChange({ ...ref, ...patch } as DashValue);

  // Load children from VFS whenever filePath/objectPath changes
  useEffect(() => {
    if (!ref.filePath) { setItems([]); setLoadError(null); return; }
    setLoading(true); setLoadError(null);
    vfsRead(userName, ref.filePath)
      .then((text) => {
        const root = JSON.parse(text) as JsonNode;
        const node = resolveJsonPath(root, ref.objectPath);
        setItems(Array.isArray(node) ? (node as JsonNode[]) : []);
      })
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoading(false));
  }, [ref.filePath, ref.objectPath, userName]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      {/* Config header toggle */}
      <Box
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setConfigOpen(!configOpen); }}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
          px: 0.5, py: '2px', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {configOpen ? <ExpandMoreIcon sx={{ fontSize: 12, color: 'text.disabled' }} /> : <ChevronRightIcon sx={{ fontSize: 12, color: 'text.disabled' }} />}
        <AccountTreeIcon sx={{ fontSize: 12, color: '#4fc3f7' }} />
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: ref.filePath ? '#4fc3f7' : 'text.disabled', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ref.filePath ? `${ref.filePath}${ref.objectPath ? ' → ' + ref.objectPath : ''}` : 'not configured'}
        </Typography>
        {loading && <CircularProgress size={10} />}
        {!loading && items.length > 0 && (
          <Box sx={{ fontSize: 10, fontFamily: 'monospace', color: 'text.secondary', bgcolor: 'action.hover', borderRadius: '4px', px: 0.5, flexShrink: 0 }}>{items.length}</Box>
        )}
      </Box>

      {/* Collapsible config rows */}
      {configOpen && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pl: 0.5, borderLeft: '2px solid', borderColor: 'divider' }}>
          {/* FilePath */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', width: 64, flexShrink: 0 }}>FilePath</Typography>
            <Box sx={{
              flex: 1, fontSize: 11, fontFamily: 'monospace', color: ref.filePath ? 'text.primary' : 'text.disabled',
              bgcolor: 'action.hover', borderRadius: '6px', px: 0.75, py: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={ref.filePath || '(none)'}>{ref.filePath || '(none)'}</Box>
            <Tooltip title="Browse file">
              <IconButton size="small" sx={{ p: 0.25 }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setFileOpen(true); }}>
                <FolderOpenIcon sx={{ fontSize: 14, color: '#4fc3f7' }} />
              </IconButton>
            </Tooltip>
          </Box>
          {/* ObjectPath */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', width: 64, flexShrink: 0 }}>ObjectPath</Typography>
            <Box sx={{
              flex: 1, fontSize: 11, fontFamily: 'monospace', color: ref.objectPath ? '#4fc3f7' : 'text.disabled',
              bgcolor: 'action.hover', borderRadius: '6px', px: 0.75, py: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={ref.objectPath || '(root)'}>{ref.objectPath || '(root)'}</Box>
            <Tooltip title={ref.filePath ? 'Browse JSON structure' : 'Set FilePath first'}>
              <span>
                <IconButton size="small" sx={{ p: 0.25 }} disabled={!ref.filePath}
                  onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setPathOpen(true); }}>
                  <AccountTreeIcon sx={{ fontSize: 14, color: ref.filePath ? '#4fc3f7' : 'text.disabled' }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      )}

      {/* Error */}
      {loadError && <Alert severity="error" sx={{ fontSize: 11, py: 0.25 }}>{loadError}</Alert>}

      {/* Children list */}
      {!loading && !loadError && items.length === 0 && ref.filePath && (
        <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic', px: 0.5 }}>Empty array at path</Typography>
      )}
      {items.map((item, i) => <ChildItemCard key={i} item={item} index={i} />)}

      <FilePickerDialog open={fileOpen} onClose={() => setFileOpen(false)}
        userName={userName} currentPath={ref.filePath}
        onSelect={(p) => { update({ filePath: p, objectPath: '' }); }} />
      <JsonPathPickerDialog open={pathOpen} onClose={() => setPathOpen(false)}
        filePath={ref.filePath} userName={userName} currentPath={ref.objectPath}
        onSelect={(p) => update({ objectPath: p })} />
    </Box>
  );
};

const QFilePathWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ value, onChange, userName }) => {
  const path = typeof value === 'string' ? value : '';
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{
        flex: 1, fontSize: 11, fontFamily: 'monospace',
        color: path ? 'text.primary' : 'text.disabled',
        bgcolor: 'action.hover', borderRadius: '6px', px: 0.75, py: '3px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={path || '(none)'}>{path || '(none)'}</Box>
      <Tooltip title="Browse file">
        <IconButton size="small" sx={{ p: 0.25 }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
          <FolderOpenIcon sx={{ fontSize: 14, color: '#4fc3f7' }} />
        </IconButton>
      </Tooltip>
      <FilePickerDialog open={open} onClose={() => setOpen(false)}
        userName={userName} currentPath={path}
        onSelect={(p) => onChange(p)} />
    </Box>
  );
};

const FieldWidget: React.FC<{ fieldType: QFieldType; value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ fieldType, value, onChange, userName }) => {
  switch (fieldType) {
    case 'QIcon':              return <QIconWidget value={value} onChange={onChange} />;
    case 'QImage':             return <QImageWidget value={value} onChange={onChange} userName={userName} />;
    case 'QNumber':            return <QNumberWidget value={value} onChange={onChange} />;
    case 'QArray':             return <QArrayWidget value={value} onChange={onChange} />;
    case 'QMap':               return <QMapWidget value={value} onChange={onChange} />;
    case 'QObjectRef':         return <QObjectRefWidget value={value} onChange={onChange} userName={userName} />;
    case 'QChildsObjectRef':   return <QChildsObjectRefWidget value={value} onChange={onChange} userName={userName} />;
    case 'QFilePath':          return <QFilePathWidget value={value} onChange={onChange} userName={userName} />;
    default:                   return <QStringWidget value={value} onChange={onChange} />;
  }
};

// ─── Unknown mode helpers ─────────────────────────────────────────────────────

const AddFieldRow: React.FC<{ onAdd: (name: string, type: QFieldType) => void }> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<QFieldType>('QString');
  const commit = () => { if (!name.trim()) return; onAdd(name.trim(), type); setName(''); setType('QString'); setOpen(false); };
  if (!open) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
      <Tooltip title="Add field"><IconButton size="small" onClick={() => setOpen(true)} sx={{ opacity: 0.4, '&:hover': { opacity: 1 }, p: 0.25 }}><AddIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, pt: 0.5, flexWrap: 'wrap', borderTop: '1px dashed', borderColor: 'divider', mt: 0.5 }}>
      <TextField size="small" variant="standard" placeholder="field name" value={name} autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setOpen(false); }}
        inputProps={{ style: { fontSize: 11 } }} sx={{ width: 90, flexShrink: 0 }} />
      <Select size="small" value={type} onChange={(e) => setType(e.target.value as QFieldType)} variant="standard"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        MenuProps={{ onClick: (e: React.MouseEvent) => e.stopPropagation(), disablePortal: false }}
        sx={{ fontSize: 10, minWidth: 72, flexShrink: 0, '& .MuiSelect-select': { py: 0, fontSize: 10 } }}>
        {FIELD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 11 }}>{t}</MenuItem>)}
      </Select>
      <IconButton size="small" sx={{ p: 0.25 }} disabled={!name.trim()} onClick={commit}><CheckIcon sx={{ fontSize: 14, color: 'success.main' }} /></IconButton>
      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
    </Box>
  );
};

const EditableFieldName: React.FC<{ name: string; onRename: (n: string) => void }> = ({ name, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = () => { setEditing(false); if (draft.trim() && draft !== name) onRename(draft.trim()); };
  if (editing) return <TextField size="small" variant="standard" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
    onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(name); } }}
    inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', width: 80 } }} />;
  return <Tooltip title="Double-click to rename">
    <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', cursor: 'default', '&:hover': { color: 'text.primary' } }}
      onDoubleClick={() => { setDraft(name); setEditing(true); }}>{name}</Typography>
  </Tooltip>;
};

// ─── VFS file picker ─────────────────────────────────────────────────────────

const VfsFilePicker: React.FC<{ userName: string; filterExt: string; startDir?: string; onSelect: (path: string) => void }> = ({ userName, filterExt, startDir = '/', onSelect }) => {
  const filterExts = filterExt ? filterExt.split(',').map((s) => s.trim()) : [];
  const [dir, setDir] = useState(startDir);
  const [entries, setEntries] = useState<Array<{ name: string; isDir: boolean }>>([]);
  const [busy, setBusy] = useState(false);

  const loadDir = useCallback(async (d: string) => {
    setBusy(true);
    try { setEntries(await vfsReaddir(userName, d)); }
    catch { setEntries([]); }
    finally { setBusy(false); }
  }, [userName]);

  useEffect(() => { void loadDir(dir); }, [dir, loadDir]);

  const join = (d: string, name: string) => (d === '/' ? '' : d) + '/' + name;
  const goUp = () => { const p = dir.split('/').slice(0, -1).join('/') || '/'; setDir(p); };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
        {dir !== '/' && (
          <IconButton size="small" sx={{ p: 0.25 }} onClick={goUp}>
            <ChevronRightIcon sx={{ fontSize: 14, transform: 'rotate(180deg)' }} />
          </IconButton>
        )}
        <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir}</Typography>
        {busy && <CircularProgress size={10} />}
      </Box>
      <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
        {entries.length === 0 && !busy && (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1, fontStyle: 'italic' }}>Empty</Typography>
        )}
        {entries.map((e) => {
          const fullPath = join(dir, e.name);
          const isMatch = !e.isDir && (filterExts.length === 0 || filterExts.some((ext) => e.name.endsWith(ext)));
          if (!e.isDir && !isMatch) return null;
          return (
            <ListItemButton key={e.name} sx={{ py: 0.375, px: 1 }}
              onClick={() => { if (e.isDir) setDir(fullPath); else onSelect(fullPath); }}>
              {e.isDir
                ? <ChevronRightIcon sx={{ fontSize: 14, color: 'text.disabled', mr: 0.5, flexShrink: 0 }} />
                : <ArticleIcon sx={{ fontSize: 14, color: '#4fc3f7', mr: 0.5, flexShrink: 0 }} />}
              <Typography sx={{ fontSize: 12 }}>{e.name}</Typography>
            </ListItemButton>
          );
        })}
      </Box>
    </Box>
  );
};

const UmlImportDialog: React.FC<{
  open: boolean; onClose: () => void; userName: string;
  onImport: (path: string) => Promise<void>; loading: boolean; importError: string | null;
}> = ({ open, onClose, userName, onImport, loading, importError }) => {
  const [path, setPath] = useState('');
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 14, py: 1.5 }}>Import UML Types</DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        {importError && <Alert severity="error" sx={{ mb: 1 }}>{importError}</Alert>}
        <TextField fullWidth size="small" label="UML project path" value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && path.trim()) void onImport(path); }}
          placeholder="uml/Project.umlproj.json"
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
        <VfsFilePicker userName={userName} filterExt=".umlproj.json" startDir={toAbsVfsPath(userName, 'uml')} onSelect={setPath} />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!path.trim() || loading}
          onClick={() => void onImport(path)}>
          {loading ? <CircularProgress size={14} /> : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Properties panel ─────────────────────────────────────────────────────────

const TransformField: React.FC<{ label: string; value: number; step?: number; onChange: (v: number) => void }> = ({ label, value, step = 1, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { if (!editing) setDraft(String(Math.round(value * 100) / 100)); }, [value, editing]);
  const commit = () => { setEditing(false); onChange(parseFloat(draft) || 0); };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.375 }}>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', width: 38, flexShrink: 0, fontFamily: 'monospace' }}>{label}</Typography>
      {editing
        ? <TextField size="small" variant="standard" value={draft} autoFocus type="number"
            inputProps={{ step, style: { fontSize: 11, fontFamily: 'monospace' } }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            sx={{ flex: 1 }} />
        : <Typography sx={{ fontSize: 11, fontFamily: 'monospace', cursor: 'text', color: 'text.primary', flex: 1, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 0.25 }}
            onClick={() => { setDraft(String(value)); setEditing(true); }}>{Math.round(value * 100) / 100}</Typography>}
    </Box>
  );
};

const PropertiesPanel: React.FC<{
  object: DashObject | null;
  fields: FieldDef[];
  userName: string;
  onObjectNameChange: (id: string, name: string) => void;
  onTransformChange: (id: string, patch: Partial<DashTransform>) => void;
  onPropertyChange: (id: string, field: string, value: DashValue) => void;
  showDetails: boolean;
  onToggleShowDetails: () => void;
  showHeader: boolean;
  onToggleShowHeader: () => void;
  showPins: boolean;
  onToggleShowPins: () => void;
  zIndex: number;
  onZIndexChange: (id: string, v: number) => void;
  selectedFieldDef: FieldDef | null;
  isCustom: boolean;
  onFieldTypeChange: (fieldName: string, newType: string) => void;
}> = ({ object, fields, userName, onObjectNameChange, onTransformChange, onPropertyChange, showDetails, onToggleShowDetails, showHeader, onToggleShowHeader, showPins, onToggleShowPins, zIndex, onZIndexChange, selectedFieldDef, isCustom, onFieldTypeChange }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [refFilePickerOpen, setRefFilePickerOpen] = useState(false);
  const [refObjPathDraft, setRefObjPathDraft] = useState('');

  useEffect(() => { setEditingName(false); }, [object?.id]);

  useEffect(() => {
    if (selectedFieldDef && object) {
      setRefObjPathDraft(String(object.properties[refPathKey(selectedFieldDef.name)] ?? ''));
    }
  }, [selectedFieldDef?.name, object?.id]);

  if (!object) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No selection</Typography>
      </Box>
    );
  }

  const t = getTransform(object);
  const commitName = () => { setEditingName(false); if (nameDraft.trim() && nameDraft !== object.objectName) onObjectNameChange(object.id, nameDraft.trim()); };

  return (
    <Box sx={{ p: 1, overflow: 'auto', height: '100%' }}>
      {/* Identity */}
      <Typography sx={{ fontSize: 9, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>«{object.className}»</Typography>
      {editingName
        ? <TextField size="small" value={nameDraft} autoFocus variant="standard" fullWidth
            inputProps={{ style: { fontSize: 13, fontWeight: 700 } }}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            sx={{ mb: 1 }} />
        : <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1, cursor: 'text', borderRadius: 0.5, px: 0.25, '&:hover': { bgcolor: 'action.hover' } }}
            onDoubleClick={() => { setNameDraft(object.objectName); setEditingName(true); }}>
            {object.objectName}
          </Typography>}

      <Divider sx={{ mb: 1 }} />

      {/* Transform */}
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Transform</Typography>
      <TransformField label="X" value={t.x} onChange={(v) => onTransformChange(object.id, { x: v })} />
      <TransformField label="Y" value={t.y} onChange={(v) => onTransformChange(object.id, { y: v })} />
      <TransformField label="Rot" value={t.rot} step={0.1} onChange={(v) => onTransformChange(object.id, { rot: v })} />
      <TransformField label="Scale" value={t.scale} step={0.01} onChange={(v) => onTransformChange(object.id, { scale: v })} />
      <TransformField label="Width" value={t.width} onChange={(v) => onTransformChange(object.id, { width: v })} />
      <TransformField label="Height" value={t.height} onChange={(v) => onTransformChange(object.id, { height: v })} />

      {/* Fields */}
      {fields.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Properties</Typography>
          {fields.map((f) => {
            const qtype = detectFieldType(f.type);
            const val = object.properties[f.name] ?? defaultForType(qtype);
            const { file: refFile, path: refPath } = getRefBinding(object.properties, f.name);
            const isBound = !!refFile;
            return (
              <Box key={f.name} sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                  <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace' }}>
                    {f.name}
                    <Typography component="span" sx={{ fontSize: 9, color: '#4fc3f7aa', fontStyle: 'italic' }}> : {f.type}</Typography>
                  </Typography>
                  {isBound && (
                    <Tooltip title={`Bound from: ${refFile}${refPath ? ` → ${refPath}` : ''}`}>
                      <AccountTreeIcon sx={{ fontSize: 10, color: '#7c4dff88', flexShrink: 0 }} />
                    </Tooltip>
                  )}
                </Box>
                {isBound
                  ? <BoundFieldDisplay filePath={refFile} objPath={refPath} userName={userName} />
                  : <FieldWidget fieldType={qtype} value={val} onChange={(v) => onPropertyChange(object.id, f.name, v)} userName={userName} />}
              </Box>
            );
          })}
        </>
      )}

      {/* Display */}
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Display</Typography>
      <TransformField label="Z-Index" value={zIndex} step={1} onChange={(v) => onZIndexChange(object.id, Math.round(v))} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Show header</Typography>
        <Switch size="small" checked={showHeader} onChange={onToggleShowHeader} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Show field types</Typography>
        <Switch size="small" checked={showDetails} onChange={onToggleShowDetails} />
      </Box>
      {object?.className === 'ObjectRef' && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Show pins</Typography>
          <Switch size="small" checked={showPins} onChange={onToggleShowPins} sx={{ '& .MuiSwitch-thumb': { bgcolor: '#81c784' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#81c78460' } }} />
        </Box>
      )}

      {/* Selected Field */}
      {selectedFieldDef && (() => {
        const sfName = selectedFieldDef.name;
        const curRefFile = String(object.properties[refFileKey(sfName)] ?? '');
        const hasBound = !!curRefFile;
        const setRefFile = (v: string) => onPropertyChange(object.id, refFileKey(sfName), v);
        const setRefPath = (v: string) => onPropertyChange(object.id, refPathKey(sfName), v);
        const clearBinding = () => { setRefFile(''); setRefPath(''); setRefObjPathDraft(''); };
        return (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Selected Field</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <Typography sx={{ fontSize: 10, color: 'text.disabled', width: 38, flexShrink: 0 }}>Name</Typography>
              <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.primary' }}>{sfName}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
              <Typography sx={{ fontSize: 10, color: 'text.disabled', width: 38, flexShrink: 0 }}>Type</Typography>
              {isCustom ? (
                <Select size="small" value={detectFieldType(selectedFieldDef.type)} variant="standard"
                  onChange={(e) => onFieldTypeChange(sfName, e.target.value)}
                  sx={{ fontSize: 11, '& .MuiSelect-select': { py: 0, fontSize: 11, fontFamily: 'monospace', color: '#4fc3f7' } }}>
                  {FIELD_TYPES.map((tp) => <MenuItem key={tp} value={tp} sx={{ fontSize: 11 }}>{tp}</MenuItem>)}
                </Select>
              ) : (
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#4fc3f7', fontStyle: 'italic' }}>{selectedFieldDef.type}</Typography>
              )}
            </Box>

            {/* Ref binding */}
            <Box sx={{ bgcolor: hasBound ? '#7c4dff10' : 'action.hover', borderRadius: 1, p: 0.75, border: '1px solid', borderColor: hasBound ? '#7c4dff44' : 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <AccountTreeIcon sx={{ fontSize: 11, color: hasBound ? '#7c4dff' : 'text.disabled', mr: 0.5 }} />
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: hasBound ? '#7c4dff' : 'text.secondary', flex: 1 }}>Ref binding</Typography>
                {hasBound && (
                  <Tooltip title="Clear binding">
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={clearBinding}>
                      <CloseIcon sx={{ fontSize: 11, color: 'error.light' }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              {/* RefFilePath row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', width: 44, flexShrink: 0 }}>FilePath</Typography>
                <Box sx={{ flex: 1, fontSize: 10, fontFamily: 'monospace', color: curRefFile ? 'text.primary' : 'text.disabled',
                  bgcolor: 'background.paper', borderRadius: '4px', px: 0.5, py: '2px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid', borderColor: 'divider' }}
                  title={curRefFile || '(none)'}>
                  {curRefFile || '(none)'}
                </Box>
                <Tooltip title="Browse file">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setRefFilePickerOpen(true)}>
                    <FolderOpenIcon sx={{ fontSize: 13, color: '#4fc3f7' }} />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* RefObjPath row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', width: 44, flexShrink: 0 }}>ObjPath</Typography>
                <TextField size="small" variant="standard" placeholder="a.b[0].c"
                  value={refObjPathDraft}
                  onChange={(e) => setRefObjPathDraft(e.target.value)}
                  onBlur={() => setRefPath(refObjPathDraft)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setRefPath(refObjPathDraft); }}
                  inputProps={{ style: { fontSize: 10, fontFamily: 'monospace' } }}
                  sx={{ flex: 1, '& .MuiInput-root': { fontSize: 10 } }} />
              </Box>
            </Box>

            {refFilePickerOpen && (
              <FilePickerDialog open onClose={() => setRefFilePickerOpen(false)}
                userName={userName} currentPath={curRefFile}
                onSelect={(p) => { setRefFile(p); setRefFilePickerOpen(false); }} />
            )}
          </>
        );
      })()}
    </Box>
  );
};

// ─── DataSource: parse + tree ─────────────────────────────────────────────────

// ─── JS/TS source structure parser ────────────────────────────────────────────

interface CodeSymbol {
  kind: 'class' | 'function' | 'arrow' | 'method' | 'field' | 'interface' | 'type' | 'enum';
  name: string;
  mods: string[];   // export, async, static, abstract, public, private, protected
  params?: string;
  children?: CodeSymbol[];
}

const extractBraceBody = (str: string, openPos: number): string => {
  let depth = 0, start = -1;
  for (let i = openPos; i < str.length; i++) {
    if (str[i] === '{') { if (start === -1) start = i + 1; depth++; }
    else if (str[i] === '}') { if (--depth === 0) return str.slice(start, i); }
  }
  return '';
};

const parseClassBody = (body: string): CodeSymbol[] => {
  const members: CodeSymbol[] = [];
  const seen = new Set<string>();
  const methodRe = /(?:(public|private|protected)\s+)?(?:(override|abstract)\s+)?(?:(static)\s+)?(?:(async)\s+)?(?:(get|set)\s+)?(\w+)\s*(?:<[^>]*)?\(([^)]*)\)\s*(?::\s*[\w<>[\]|&\s,.?]+?)?\s*(?:\{|;|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = methodRe.exec(body)) !== null) {
    const [, vis, mod2, isStatic, isAsync, accessor, name, params] = m;
    if (['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) continue;
    const key = accessor ? `${accessor} ${name}` : name;
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({
      kind: 'method',
      name: key,
      mods: [vis, mod2, isStatic && 'static', isAsync && 'async'].filter(Boolean) as string[],
      params: params.trim(),
    });
  }
  // fields: [vis] name [?]: type [= ...];
  const fieldRe = /(?:(public|private|protected|readonly)\s+)+(\w+)\s*[?!]?\s*(?::\s*[\w<>[\]|&\s,.?]+?)?\s*(?:=|;)/gm;
  while ((m = fieldRe.exec(body)) !== null) {
    const [, , name] = m;
    if (!name || seen.has(name) || name === 'constructor') continue;
    seen.add(name);
    members.push({ kind: 'field', name, mods: [m[1]] });
  }
  return members;
};

const parseJsSource = (code: string): CodeSymbol[] => {
  // Strip comments
  const clean = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const symbols: CodeSymbol[] = [];
  // Classes
  const classRe = /(?:(export)\s+)?(?:(abstract)\s+)?class\s+(\w+)(?:<[^>]*)?\s*(?:extends\s+[\w.<>,\s]+?)?\s*(?:implements\s+[\w,\s.<>]+?)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(clean)) !== null) {
    const body = extractBraceBody(clean, m.index + m[0].length - 1);
    symbols.push({
      kind: 'class',
      name: m[3],
      mods: [m[1] && 'export', m[2] && 'abstract'].filter(Boolean) as string[],
      children: parseClassBody(body),
    });
  }

  // Interfaces
  const ifaceRe = /(?:(export)\s+)?interface\s+(\w+)(?:<[^>]*)?\s*(?:extends\s+[\w,\s.<>]+?)?\s*\{/g;
  while ((m = ifaceRe.exec(clean)) !== null) {
    const body = extractBraceBody(clean, m.index + m[0].length - 1);
    const children = parseClassBody(body);
    symbols.push({ kind: 'interface', name: m[2], mods: m[1] ? ['export'] : [], children });
  }

  // Enums
  const enumRe = /(?:(export)\s+)?(?:const\s+)?enum\s+(\w+)/g;
  while ((m = enumRe.exec(clean)) !== null) {
    symbols.push({ kind: 'enum', name: m[2], mods: m[1] ? ['export'] : [] });
  }

  // Type aliases
  const typeRe = /(?:^|[\n;])[ \t]*(?:(export)\s+)?type\s+(\w+)(?:<[^>]*)?\s*=/gm;
  while ((m = typeRe.exec(clean)) !== null) {
    symbols.push({ kind: 'type', name: m[2], mods: m[1] ? ['export'] : [] });
  }

  // Named functions
  const fnRe = /(?:^|[\n;])[ \t]*(?:(export)\s+)?(?:(async)\s+)?function\s+(\w+)\s*(?:<[^>]*)?\(([^)]*)\)/gm;
  while ((m = fnRe.exec(clean)) !== null) {
    symbols.push({ kind: 'function', name: m[3], mods: [m[1] && 'export', m[2] && 'async'].filter(Boolean) as string[], params: m[4].trim() });
  }

  // Arrow / function expressions (const foo = ...)
  const arrowRe = /(?:^|[\n;])[ \t]*(?:(export)\s+)?const\s+(\w+)\s*(?::\s*[^=]+?)?\s*=\s*(?:(async)\s+)?(?:\([^)]*\)|\w+)\s*=>/gm;
  while ((m = arrowRe.exec(clean)) !== null) {
    symbols.push({ kind: 'arrow', name: m[2], mods: [m[1] && 'export', m[3] && 'async'].filter(Boolean) as string[] });
  }

  return symbols;
};

const loadDataSourceContent = (content: string, fileType: 'json' | 'js'): JsonNode => {
  if (fileType === 'json') return JSON.parse(content) as JsonNode;
  return parseJsSource(content) as unknown as JsonNode;
};

const JsonTreeNode: React.FC<{
  value: JsonNode; depth?: number; label?: string; maxDepth?: number;
  path?: string; sourceId?: string; filePath?: string;
}> = ({ value, depth = 0, label, maxDepth = 8, path = '', sourceId, filePath }) => {
  const [open, setOpen] = useState(depth < 2);
  if (depth > maxDepth) return null;

  const isArr = Array.isArray(value);
  const isObj = !isArr && value !== null && typeof value === 'object';

  if (isArr || isObj) {
    const children = isArr
      ? (value as JsonNode[]).map((v, i) => ({ k: String(i), v, childPath: path ? `${path}[${i}]` : `[${i}]` }))
      : Object.entries(value as Record<string, JsonNode>).map(([k, v]) => ({ k, v, childPath: path ? `${path}.${k}` : k }));
    const summary = isArr ? `[${children.length}]` : `{${children.length}}`;
    const isDraggable = !!(sourceId && filePath && path);
    const handleDragStart = (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData('application/dash-json-ref', JSON.stringify({ sourceId, filePath, objectPath: path }));
      e.dataTransfer.effectAllowed = 'copy';
    };
    const jsonDragRef = isDraggable ? makeDragRef(() => ({
      mime: 'application/dash-json-ref',
      data: JSON.stringify({ sourceId, filePath, objectPath: path }),
      label: path,
    })) : null;
    return (
      <Box>
        <Box
          ref={jsonDragRef ?? undefined}
          draggable={isDraggable}
          onDragStart={isDraggable ? handleDragStart : undefined}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.25, py: '1px', cursor: isDraggable ? 'grab' : 'pointer', borderRadius: 0.5,
            '&:hover': { bgcolor: isDraggable ? 'rgba(124,77,255,0.12)' : 'action.hover' },
            '&:active': isDraggable ? { cursor: 'grabbing' } : {},
            touchAction: isDraggable ? 'none' : 'auto',
          }}
          onClick={() => setOpen((v) => !v)}>
          {open
            ? <ExpandMoreIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
            : <ChevronRightIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />}
          <Typography sx={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.5, userSelect: 'none', flex: 1 }}>
            {label !== undefined && <span style={{ color: '#ce93d8' }}>{label}: </span>}
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{summary}</span>
          </Typography>
          {isDraggable && <Box sx={{ fontSize: 9, color: '#7c4dff66', pr: '2px', flexShrink: 0 }}>⠿</Box>}
        </Box>
        {open && (
          <Box sx={{ pl: 1.5, borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
            {children.map(({ k, v, childPath }) => (
              <JsonTreeNode key={k} value={v} depth={depth + 1} label={k} maxDepth={maxDepth}
                path={childPath} sourceId={sourceId} filePath={filePath} />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  const primitiveColor = value === null ? '#ef9a9a' : typeof value === 'number' ? '#81c784' : typeof value === 'boolean' ? '#ffb74d' : '#f48fb1';
  const primitiveDisplay = value === null ? 'null'
    : typeof value === 'string' ? `"${value.length > 60 ? value.slice(0, 60) + '…' : value}"`
    : String(value);
  return (
    <Box sx={{ py: '1px' }}>
      <Typography sx={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.5 }}>
        {label !== undefined && <span style={{ color: '#ce93d8' }}>{label}: </span>}
        <span style={{ color: primitiveColor }}>{primitiveDisplay}</span>
      </Typography>
    </Box>
  );
};

// ─── Source tree rendering ────────────────────────────────────────────────────

const KIND_COLOR: Record<string, string> = {
  class:     '#569cd6',  // VS Code class — blue
  interface: '#4ec9b0',  // teal
  enum:      '#b5cea8',  // light green-gray
  type:      '#9cdcfe',  // light sky
  function:  '#dcdcaa',  // VS Code fn — yellow
  arrow:     '#dcdcaa',
  method:    '#dcdcaa',
  field:     '#9cdcfe',  // property — light sky
};
const KIND_LABEL: Record<string, string> = {
  class: 'class', interface: 'interface', enum: 'enum', type: 'type',
  function: 'fn', arrow: 'fn', method: 'method', field: 'field',
};

const SourceSymbolRow: React.FC<{
  sym: CodeSymbol; depth: number; sourceId: string; parentName?: string;
}> = ({ sym, depth, sourceId, parentName }) => {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (sym.children?.length ?? 0) > 0;
  const color = KIND_COLOR[sym.kind] ?? '#aaa';
  const tag = KIND_LABEL[sym.kind] ?? sym.kind;
  const modStr = sym.mods.filter((m) => !['export', 'declare'].includes(m)).join(' ');
  const isCallable = sym.kind === 'function' || sym.kind === 'arrow' || sym.kind === 'method';
  const isClass = sym.kind === 'class';
  const symbolPath = parentName ? `${parentName}.${sym.name}` : sym.name;
  const paramNames = sym.params
    ? sym.params.split(',').map((p) => p.trim().split(':')[0].trim().split('=')[0].trim().split('?')[0].trim()).filter(Boolean)
    : [];

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/dash-function', JSON.stringify({ sourceId, symbolPath, paramNames }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleClassDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    const fieldNames = (sym.children ?? [])
      .filter((c) => c.kind === 'field' || (c.kind === 'method' && c.name.startsWith('get ')))
      .map((c) => c.kind === 'method' && c.name.startsWith('get ') ? c.name.slice(4) : c.name)
      .filter((v, i, a) => a.indexOf(v) === i);
    e.dataTransfer.setData('application/dash-class', JSON.stringify({ sourceId, className: sym.name, fieldNames }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const dragRef = useMemo(() => (isCallable || isClass) ? makeDragRef(() => {
    if (isCallable) return { mime: 'application/dash-function', data: JSON.stringify({ sourceId, symbolPath, paramNames }), label: symbolPath };
    const flds = (sym.children ?? [])
      .filter((c) => c.kind === 'field' || (c.kind === 'method' && c.name.startsWith('get ')))
      .map((c) => c.kind === 'method' && c.name.startsWith('get ') ? c.name.slice(4) : c.name)
      .filter((v, i, a) => a.indexOf(v) === i);
    return { mime: 'application/dash-class', data: JSON.stringify({ sourceId, className: sym.name, fieldNames: flds }), label: sym.name };
  }) : null, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Box
        ref={dragRef ?? undefined}
        draggable={isCallable || isClass}
        onDragStart={isCallable ? handleDragStart : isClass ? handleClassDragStart : undefined}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.25, py: '2px', pl: depth * 1.5,
          cursor: isCallable ? 'grab' : hasChildren ? 'pointer' : 'default',
          borderRadius: 0.5,
          '&:hover': { bgcolor: isCallable ? '#7c4dff1a' : 'action.hover' },
          '&:active': (isCallable || isClass) ? { cursor: 'grabbing' } : {},
          touchAction: (isCallable || isClass) ? 'none' : 'auto',
        }}
        onClick={() => { if (hasChildren) setOpen((v) => !v); }}>
        {hasChildren
          ? (open ? <ExpandMoreIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} /> : <ChevronRightIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />)
          : <Box sx={{ width: 12, flexShrink: 0 }} />}
        <Box component="span" sx={{ fontSize: 9, fontFamily: 'monospace', color, bgcolor: `${color}1a`,
          border: `1px solid ${color}44`, borderRadius: '3px', px: '3px', lineHeight: '14px',
          flexShrink: 0, mr: 0.5 }}>{tag}</Box>
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {modStr && <span style={{ color: '#ce93d8', marginRight: 4 }}>{modStr}</span>}
          <span style={{ color, fontWeight: 600 }}>{sym.name}</span>
          {sym.params !== undefined && (
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>({sym.params.length > 30 ? sym.params.slice(0, 30) + '…' : sym.params})</span>
          )}
          {sym.mods.includes('export') && <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 6, fontSize: 9 }}>export</span>}
        </Typography>
        {isCallable && <Box sx={{ fontSize: 9, color: '#7c4dff99', flexShrink: 0, pr: '2px', userSelect: 'none' }}>⠿</Box>}
        {isClass && <Box sx={{ fontSize: 9, color: '#569cd666', flexShrink: 0, pr: '2px', userSelect: 'none' }}>⧉</Box>}
      </Box>
      {open && hasChildren && (
        <Box sx={{ borderLeft: `1px solid ${color}33`, ml: depth * 1.5 + 0.75 }}>
          {sym.children!.map((child, i) => (
            <SourceSymbolRow key={i} sym={child} depth={depth + 1} sourceId={sourceId}
              parentName={sym.kind === 'class' || sym.kind === 'interface' ? sym.name : parentName} />
          ))}
        </Box>
      )}
    </Box>
  );
};

const SourceTreeView: React.FC<{ symbols: CodeSymbol[]; sourceId: string }> = ({ symbols, sourceId }) => {
  if (symbols.length === 0) {
    return <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>No symbols found</Typography>;
  }
  return (
    <Box>
      {symbols.map((sym, i) => <SourceSymbolRow key={i} sym={sym} depth={0} sourceId={sourceId} />)}
    </Box>
  );
};

interface DsCtxState { x: number; y: number; id: string; }

const DataSourcePanel: React.FC<{
  sources: DataSourceEntry[];
  loadedData: Record<string, JsonNode | null | undefined>;
  onNew: () => void;
  onDelete: (id: string) => void;
  onReload: (id: string) => void;
}> = ({ sources, loadedData, onNew, onDelete, onReload }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<DsCtxState | null>(null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Data</Typography>
        <Tooltip title="Add file…">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={onNew}>
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {sources.length === 0 && (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1.5, fontStyle: 'italic' }}>Click + to add a JSON/JS file</Typography>
        )}
        {sources.map((src) => {
          const expanded = expandedIds.has(src.id);
          const data = loadedData[src.id];
          return (
            <Box key={src.id} sx={{ '&:hover .ds-actions': { opacity: 1 } }}>
              <ListItemButton
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, id: src.id }); }}
                onClick={() => setExpandedIds((prev) => { const n = new Set(prev); expanded ? n.delete(src.id) : n.add(src.id); return n; })}
                sx={{ py: 0.5, px: 1, gap: 0.5 }}>
                {expanded
                  ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />
                  : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />}
                <StorageIcon sx={{ fontSize: 12, color: src.fileType === 'json' ? '#81c784' : '#ffb74d', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 11, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {src.name}
                </Typography>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', flexShrink: 0 }}>.{src.fileType}</Typography>
                <Box className="ds-actions" sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s', ml: 0.5 }}>
                  <Tooltip title="Reload">
                    <IconButton size="small" sx={{ p: '2px' }} onClick={(e) => { e.stopPropagation(); onReload(src.id); }}>
                      <RefreshIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" sx={{ p: '2px' }} onClick={(e) => { e.stopPropagation(); onDelete(src.id); }}>
                      <DeleteOutlineIcon sx={{ fontSize: 13, color: 'error.light' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </ListItemButton>
              {expanded && (
                <Box sx={{ mx: 1.25, mb: 0.5, px: 0.75, py: 0.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1,
                  border: '1px solid', borderColor: 'divider', maxHeight: 280, overflow: 'auto' }}>
                  {data === undefined ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={10} />
                      <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Loading…</Typography>
                    </Box>
                  ) : data === null ? (
                    <Typography sx={{ fontSize: 10, color: 'error.light', fontStyle: 'italic' }}>Failed to load</Typography>
                  ) : src.fileType === 'js' ? (
                    <SourceTreeView symbols={data as unknown as CodeSymbol[]} sourceId={src.id} />
                  ) : (
                    <JsonTreeNode value={data} sourceId={src.id} filePath={src.filePath} />
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Menu open={Boolean(ctxMenu)} onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.y, left: ctxMenu.x } : undefined}
        MenuListProps={{ dense: true }}>
        <MenuItem onClick={() => { if (ctxMenu) onReload(ctxMenu.id); setCtxMenu(null); }} sx={{ fontSize: 13, gap: 1 }}>
          <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />Reload
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (ctxMenu) onDelete(ctxMenu.id); setCtxMenu(null); }} sx={{ fontSize: 13, gap: 1, color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" />Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

// ─── Bound field display (read-only value from external JSON file) ────────────

const refFileKey = (name: string) => `_ref_${name}_file`;
const refPathKey = (name: string) => `_ref_${name}_path`;
const getRefBinding = (props: Record<string, DashValue>, name: string) => ({
  file: String(props[refFileKey(name)] ?? ''),
  path: String(props[refPathKey(name)] ?? ''),
});

const BoundFieldDisplay: React.FC<{ filePath: string; objPath: string; userName: string; compact?: boolean }> = ({ filePath, objPath, userName, compact }) => {
  const [val, setVal] = useState<JsonNode | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) return;
    setLoading(true); setError(null);
    vfsRead(userName, filePath)
      .then((text) => setVal(resolveJsonPath(JSON.parse(text) as JsonNode, objPath)))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [filePath, objPath, userName]);

  if (loading) return <CircularProgress size={10} />;
  if (error) return <Typography sx={{ fontSize: 10, color: 'error.main', fontFamily: 'monospace' }}>{error}</Typography>;

  const display = val === undefined ? '—' : val === null ? 'null' : Array.isArray(val) ? `[${(val as JsonNode[]).length}]` : typeof val === 'object' ? `{${Object.keys(val as object).length}}` : String(val);
  const color = typeof val === 'number' ? '#81c784' : typeof val === 'boolean' ? '#ffb74d' : val === null || val === undefined ? 'text.disabled' : 'text.primary';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AccountTreeIcon sx={{ fontSize: 11, color: '#7c4dff88' }} />
      </Box>
      <Typography sx={{ fontSize: compact ? 11 : 12, fontFamily: 'monospace', color, flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: val === null || val === undefined ? 'italic' : 'normal' }}>
        {display}
      </Typography>
    </Box>
  );
};

// ─── Markdown viewer ──────────────────────────────────────────────────────────

const MarkdownViewContent: React.FC<{ src: string; userName: string }> = ({ src, userName }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const trimmed = src.trim();
  const isPath = trimmed.startsWith('/');

  useEffect(() => {
    if (!trimmed) { setContent(''); setLoadError(null); return; }
    if (!isPath) { setContent(trimmed); setLoadError(null); return; }

    setLoading(true);
    setLoadError(null);
    vfsRead(userName, trimmed)
      .then((text) => { setContent(text); setLoadError(null); })
      .catch((e: unknown) => { setLoadError(`Cannot load: ${(e as Error).message}`); setContent(''); })
      .finally(() => setLoading(false));
  }, [trimmed, isPath, userName]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress size={16} />
      </Box>
    );
  }
  if (loadError) {
    return <Typography sx={{ fontSize: 10, color: 'error.main', p: 1, fontFamily: 'monospace' }}>{loadError}</Typography>;
  }
  if (!content) {
    return (
      <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1, fontStyle: 'italic' }}>
        Set «src» in Properties to a VFS path (starts with /) or inline markdown.
      </Typography>
    );
  }
  return (
    <Box sx={{
      fontSize: 13, lineHeight: 1.6, p: 1,
      '& h1': { fontSize: 17, fontWeight: 700, m: 0, mb: 0.75 },
      '& h2': { fontSize: 14, fontWeight: 700, m: 0, mt: 1.25, mb: 0.5 },
      '& h3': { fontSize: 12, fontWeight: 700, m: 0, mt: 1, mb: 0.375 },
      '& p': { m: 0, mb: 0.75 },
      '& ul, & ol': { pl: 2.5, m: 0, mb: 0.75 },
      '& li': { mb: 0.25 },
      '& code': { fontSize: 11, fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
      '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, fontSize: 11, overflow: 'auto', m: 0, mb: 0.75 },
      '& pre code': { bgcolor: 'transparent', p: 0 },
      '& a': { color: '#4fc3f7', textDecoration: 'underline' },
      '& blockquote': { borderLeft: '3px solid', borderColor: 'divider', pl: 1.5, ml: 0, my: 0.5, color: 'text.secondary' },
      '& hr': { border: 'none', borderTop: '1px solid', borderColor: 'divider', my: 1 },
      '& table': { borderCollapse: 'collapse', width: '100%', mb: 0.75, fontSize: 12 },
      '& th, & td': { border: '1px solid', borderColor: 'divider', px: 0.75, py: 0.375 },
      '& th': { bgcolor: 'action.hover', fontWeight: 700 },
      '& img': { maxWidth: '100%' },
    }}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </Box>
  );
};

// ─── ObjectRef node content ───────────────────────────────────────────────────

interface RefNodeData {
  userName: string;
  properties: Record<string, DashValue>;
  onPropertyChange: (field: string, value: DashValue) => void;
  height: number;
}

const RefConfigRows: React.FC<{
  filePath: string; objectPath: string; userName: string;
  onFileChange: (p: string) => void; onPathChange: (p: string) => void;
}> = ({ filePath, objectPath, userName, onFileChange, onPathChange }) => {
  const [fileOpen, setFileOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, px: 0.75, py: 0.5,
      borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#4fc3f708' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', width: 60, flexShrink: 0 }}>FilePath</Typography>
        <Box sx={{ flex: 1, fontSize: 10, fontFamily: 'monospace', color: filePath ? 'text.primary' : 'text.disabled',
          bgcolor: 'action.hover', borderRadius: '5px', px: 0.75, py: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={filePath || '(none)'}>{filePath || '(none)'}</Box>
        <Tooltip title="Browse file">
          <IconButton size="small" sx={{ p: 0.25 }} onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setFileOpen(true); }}>
            <FolderOpenIcon sx={{ fontSize: 13, color: '#4fc3f7' }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', width: 60, flexShrink: 0 }}>ObjPath</Typography>
        <Box sx={{ flex: 1, fontSize: 10, fontFamily: 'monospace', color: objectPath ? '#4fc3f7' : 'text.disabled',
          bgcolor: 'action.hover', borderRadius: '5px', px: 0.75, py: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={objectPath || '(root)'}>{objectPath || '(root)'}</Box>
        <Tooltip title={filePath ? 'Browse JSON structure' : 'Set FilePath first'}>
          <span>
            <IconButton size="small" sx={{ p: 0.25 }} disabled={!filePath}
              onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setPathOpen(true); }}>
              <AccountTreeIcon sx={{ fontSize: 13, color: filePath ? '#4fc3f7' : 'text.disabled' }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <FilePickerDialog open={fileOpen} onClose={() => setFileOpen(false)}
        userName={userName} currentPath={filePath} onSelect={onFileChange} />
      <JsonPathPickerDialog open={pathOpen} onClose={() => setPathOpen(false)}
        filePath={filePath} userName={userName} currentPath={objectPath} onSelect={onPathChange} />
    </Box>
  );
};

// Unified — auto-detects array vs object vs primitive at objectPath
const ObjectRefNodeContent: React.FC<RefNodeData> = ({ userName, properties, onPropertyChange, height }) => {
  const filePath = String(properties['filePath'] ?? '');
  const objectPath = String(properties['objectPath'] ?? '');
  const [node, setNode] = useState<JsonNode | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) { setNode(undefined); setError(null); return; }
    setLoading(true); setError(null);
    vfsRead(userName, filePath)
      .then((text) => setNode(resolveJsonPath(JSON.parse(text) as JsonNode, objectPath)))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [filePath, objectPath, userName]);

  const isArr = Array.isArray(node);
  const isObj = !isArr && node !== null && node !== undefined && typeof node === 'object';
  const objEntries = isObj ? Object.entries(node as Record<string, JsonNode>) : [];

  return (
    <>
      <RefConfigRows filePath={filePath} objectPath={objectPath} userName={userName}
        onFileChange={(p) => { onPropertyChange('filePath', p); onPropertyChange('objectPath', ''); }}
        onPathChange={(p) => onPropertyChange('objectPath', p)} />
      <Box onPointerDown={(e) => e.stopPropagation()}
        sx={{ flex: 1, overflow: 'auto', touchAction: 'pan-y', ...(height === 0 ? { maxHeight: 400 } : {}) }}>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}><CircularProgress size={16} /></Box>}
        {error && <Alert severity="error" sx={{ fontSize: 10, py: 0.25, px: 0.75 }}>{error}</Alert>}
        {!loading && !error && node === undefined && filePath && (
          <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic', px: 1, py: 0.5 }}>Nothing at path</Typography>
        )}
        {!loading && !error && !filePath && (
          <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic', px: 1, py: 0.5 }}>Configure FilePath above</Typography>
        )}
        {/* Array → list of ChildItemCards */}
        {isArr && (
          <Box sx={{ px: 0.75, py: 0.5 }}>
            {(node as JsonNode[]).length === 0 && (
              <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>Empty array</Typography>
            )}
            {(node as JsonNode[]).map((item, i) => <ChildItemCard key={i} item={item} index={i} />)}
          </Box>
        )}
        {/* Object → key-value rows */}
        {isObj && objEntries.length > 0 && (
          <Box sx={{ px: 0.75, py: 0.5 }}>
            {objEntries.map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, py: '2px',
                borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' } }}>
                <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#4fc3f7aa', flexShrink: 0,
                  width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</Typography>
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: typeof v === 'number' ? '#81c784' : typeof v === 'boolean' ? '#ffb74d' : v === null ? 'text.disabled' : 'text.primary',
                  fontStyle: v === null ? 'italic' : 'normal',
                }}>{v === null ? 'null' : JSON.stringify(v)}</Typography>
              </Box>
            ))}
          </Box>
        )}
        {/* Primitive */}
        {!isArr && !isObj && node !== undefined && node !== null && (
          <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.primary', px: 1, py: 0.5 }}>
            {JSON.stringify(node)}
          </Typography>
        )}
      </Box>
    </>
  );
};

// ─── ReactFlow node (compact — just fields, no property editing, that's in the panel) ───

const HANDLE_SIZE = 10; // px — square handle size

const DashObjectNode: React.FC<NodeProps<Node<DashObjectNodeData>>> = ({ data }) => {
  const { getZoom } = useReactFlow();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(data.objectName);
  useEffect(() => { setNameVal(data.objectName); }, [data.objectName]);
  const isUnknown = data.isCustom;
  const isMarkdownView = data.className === 'MarkdownView';
  const isObjectRefNode = data.className === 'ObjectRef';
  const t = data.transform;
  const visible = data.selected;

  // Resize handle — pointer capture so ReactFlow cannot steal the drag
  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = t.width > 0 ? t.width : 200;
    const startH = t.height > 0 ? t.height : 0;

    const onMove = (me: PointerEvent) => {
      const zoom = getZoom();
      const dw = (me.clientX - startX) / zoom;
      const dh = (me.clientY - startY) / zoom;
      const newW = Math.max(150, Math.round(startW + dw));
      const newH = startH > 0 ? Math.max(80, Math.round(startH + dh)) : Math.max(80, Math.round(dh));
      data.onResizeDrag(newW, newH);
    };
    const onUp = (me: PointerEvent) => {
      el.releasePointerCapture(me.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, [t.width, t.height, getZoom, data]);

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: '#4fc3f7',
    border: '2px solid #1a1a1a',
    borderRadius: 2,
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.15s',
    zIndex: 10,
  };

  return (
    <Box sx={{ position: 'relative', minWidth: 190, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', border: '2px solid', borderColor: data.selected ? '#4fc3f7' : 'divider', borderRadius: 1, boxShadow: data.selected ? '0 0 0 2px #4fc3f755' : 1, userSelect: 'none',
      ...(t.width > 0 ? { width: t.width } : {}),
      ...(t.height > 0 ? { height: t.height } : {}),
      ...(t.rot !== 0 || t.scale !== 1 ? { transform: `${t.rot !== 0 ? `rotate(${t.rot}deg) ` : ''}${t.scale !== 1 ? `scale(${t.scale})` : ''}`.trim() } : {}),
    }}>
      {/* Drag bar — always visible, used as ReactFlow dragHandle */}
      <Box className="dash-drag-handle" title="Drag to move" sx={{
        flexShrink: 0, height: 12, cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: data.selected ? '#4fc3f718' : 'action.hover',
        borderBottom: '1px solid', borderColor: 'divider',
        borderRadius: '2px 2px 0 0',
        '&:active': { cursor: 'grabbing' },
      }}>
        <Box sx={{ display: 'flex', gap: '3px', opacity: 0.35 }}>
          {[0,1,2,3,4].map((i) => <Box key={i} sx={{ width: 3, height: 3, bgcolor: 'text.primary', borderRadius: '50%' }} />)}
        </Box>
      </Box>

      {/* Resize handle — bottom-right */}
      <div
        onPointerDown={onResizePointerDown}
        title="Drag to resize"
        style={{
          ...handleStyle,
          bottom: -HANDLE_SIZE / 2 - 1,
          right: -HANDLE_SIZE / 2 - 1,
          cursor: 'se-resize',
          touchAction: 'none',
        }}
      />

      {/* value_out — data pin, visible based on showPins */}
      {(data.className !== 'ObjectRef' || data.showPins) && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="value_out"
            style={{ width: 10, height: 10, background: '#81c784', border: '2px solid #1a1028', borderRadius: 2, pointerEvents: 'all',
              opacity: data.selected ? 1 : 0.45, transition: 'opacity 0.15s',
            }}
          />
          <Box sx={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', fontSize: 8, color: '#81c78488', fontFamily: 'monospace',
            whiteSpace: 'nowrap', userSelect: 'none',
          }}>value</Box>
        </>
      )}

      {/* Header */}
      {data.showHeader && (
        <Box sx={{ flexShrink: 0,
          bgcolor: isMarkdownView ? '#4fc3f70a' : isObjectRefNode ? '#7c4dff14' : isUnknown ? '#ffffff08' : '#4fc3f714',
          textAlign: 'center', borderBottom: '1px solid', borderColor: 'divider', px: 1, py: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
            {isUnknown && <HelpOutlineIcon sx={{ fontSize: 11, color: 'text.disabled' }} />}
            {isMarkdownView && <ArticleIcon sx={{ fontSize: 11, color: '#4fc3f7' }} />}
            {isObjectRefNode && <AccountTreeIcon sx={{ fontSize: 11, color: '#7c4dff' }} />}
            <Typography sx={{ fontSize: 10, fontStyle: 'italic', color: 'text.secondary' }}>«{data.className}»</Typography>
          </Box>
          {editingName
            ? <TextField size="small" value={nameVal} autoFocus variant="standard"
                inputProps={{ style: { fontSize: 12, textAlign: 'center', fontWeight: 700 } }}
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={() => { setEditingName(false); if (nameVal !== data.objectName) data.onObjectNameChange(nameVal); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setEditingName(false); if (nameVal !== data.objectName) data.onObjectNameChange(nameVal); }
                  if (e.key === 'Escape') { setNameVal(data.objectName); setEditingName(false); }
                }}
                sx={{ width: '100%' }} />
            : <Typography sx={{ fontWeight: 700, color: isUnknown ? 'text.primary' : '#4fc3f7', fontSize: 12, cursor: 'text' }}
                onDoubleClick={() => setEditingName(true)}>{data.objectName}</Typography>}
        </Box>
      )}

      {/* Fields / Markdown / ObjectRef / ChildsObjectRef content */}
      {isObjectRefNode ? (
        <ObjectRefNodeContent userName={data.userName} properties={data.properties}
          onPropertyChange={data.onPropertyChange} height={t.height} />
      ) : isMarkdownView ? (
        <Box onPointerDown={(e) => e.stopPropagation()} sx={{ flex: 1, overflow: 'auto', touchAction: 'pan-y', ...(t.height === 0 ? { height: 400 } : {}) }}>
          <MarkdownViewContent
            src={String(data.properties['src'] ?? '')}
            userName={data.userName}
          />
        </Box>
      ) : (
        <Box onPointerDown={(e) => e.stopPropagation()} sx={{ px: 1, py: 0.25, flex: 1, overflow: 'auto', touchAction: 'pan-y', ...(t.height === 0 ? { maxHeight: 320 } : {}) }}>
          {data.fields.length === 0 && !isUnknown && (
            <Typography sx={{ fontSize: 10, color: 'text.disabled', py: 0.5, fontStyle: 'italic' }}>no fields</Typography>
          )}
          {data.fields.map((f) => {
            const qtype = detectFieldType(f.type);
            const val = data.properties[f.name] ?? defaultForType(qtype);
            const isFieldSelected = data.selectedFieldName === f.name;
            const { file: refFile, path: refPath } = getRefBinding(data.properties, f.name);
            const isBound = !!refFile;
            return (
              <Box key={f.name}
                onClick={(e) => { e.stopPropagation(); data.onFieldSelect(f.name); }}
                sx={{
                  py: 0.375, borderBottom: '1px solid', borderColor: 'divider',
                  cursor: 'pointer',
                  bgcolor: isFieldSelected ? 'rgba(79,195,247,0.1)' : 'transparent',
                  borderLeft: isFieldSelected ? '2px solid #4fc3f7' : '2px solid transparent',
                  pl: isFieldSelected ? 0.25 : 0,
                }}>
                {(isUnknown || data.showDetails) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.125 }}>
                    {isUnknown ? (
                      <>
                        <EditableFieldName name={f.name} onRename={(n) => data.onFieldRename(f.name, n)} />
                        <Select size="small" value={qtype} onChange={(e) => data.onFieldTypeChange(f.name, e.target.value)} variant="standard"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          MenuProps={{ onClick: (e: React.MouseEvent) => e.stopPropagation(), disablePortal: false }}
                          sx={{ fontSize: 9, '& .MuiSelect-select': { py: 0, fontSize: 9, color: '#4fc3f7aa', fontStyle: 'italic', fontFamily: 'monospace' } }}>
                          {FIELD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 11 }}>{t}</MenuItem>)}
                        </Select>
                        <Box sx={{ flex: 1 }} />
                        <IconButton size="small" sx={{ p: 0.125 }} onClick={(e) => { e.stopPropagation(); data.onFieldRemove(f.name); }}>
                          <CloseIcon sx={{ fontSize: 11, color: 'error.main', opacity: 0.5 }} />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{f.name}</Typography>
                        <Typography sx={{ fontSize: 9, color: '#4fc3f7aa', fontStyle: 'italic', fontFamily: 'monospace' }}>{f.type}</Typography>
                        {isBound && <AccountTreeIcon sx={{ fontSize: 9, color: '#7c4dff88', ml: 'auto' }} />}
                      </>
                    )}
                  </Box>
                )}
                {isBound
                  ? <BoundFieldDisplay filePath={refFile} objPath={refPath} userName={data.userName} compact />
                  : <FieldWidget fieldType={qtype} value={val} onChange={(v) => data.onPropertyChange(f.name, v)} userName={data.userName} />}
              </Box>
            );
          })}
          {isUnknown && <AddFieldRow onAdd={(name, type) => data.onFieldAdd(name, type)} />}
        </Box>
      )}
    </Box>
  );
};

// ─── FunctionCall node ───────────────────────────────────────────────────────

interface FcNodeData extends Record<string, unknown> {
  fcId: string;
  symbolPath: string;
  paramNames: string[];
  argOverrides: Record<number, string>;
  result: string | null;
  error: string | null;
  running: boolean;
  connectedArgValues: Record<number, unknown>;
  connectedThisValue: unknown | undefined;
  selected: boolean;
  pinsFlipped: boolean;
  onCall: () => void;
  onArgOverrideChange: (index: number, value: string) => void;
}

const FunctionCallNode: React.FC<NodeProps<Node<FcNodeData>>> = ({ data }) => {
  const parts = data.symbolPath.split('.');
  const scope = parts.length > 1 ? parts.slice(0, -1).join('.') : '';
  const fn = parts[parts.length - 1];
  const flipped = data.pinsFlipped;
  const argPos = flipped ? Position.Right : Position.Left;
  const retPos = flipped ? Position.Right : Position.Left;
  const argStyle = (offset: number): React.CSSProperties => ({
    position: 'absolute',
    [flipped ? 'right' : 'left']: offset,
    top: '50%', transform: 'translateY(-50%)',
    width: 10, height: 10, background: '#7c4dff', border: '1.5px solid #0d0020', borderRadius: 2,
    pointerEvents: 'all',
  });
  const retHandleStyle: React.CSSProperties = {
    position: 'absolute',
    [flipped ? 'right' : 'left']: -5,
    top: '50%', transform: 'translateY(-50%)',
    width: 10, height: 10, background: '#81c784', border: '1.5px solid #001a0d', borderRadius: 2,
    pointerEvents: 'all',
  };
  const rowPadding = flipped
    ? { pl: 1, pr: 1.5, justifyContent: 'flex-end' }
    : { pl: 1.5, pr: 1 };

  return (
    <Box sx={{ minWidth: 200, bgcolor: '#1a1028', border: '2px solid', borderColor: data.selected ? '#ce93d8' : '#7c4dff55', borderRadius: 1.5, userSelect: 'none', position: 'relative' }}>
      {/* exec_in — handle at top edge */}
      <Handle type="target" position={Position.Top} id="exec_in"
        title="Execution input — drag exec_out of another node here"
        style={{ width: 14, height: 14, background: '#ffffffcc', border: '2px solid #1a1028', borderRadius: 2, pointerEvents: 'all', cursor: 'default' }} />
      <Box sx={{ height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff06', borderBottom: '1px solid #ffffff11', borderRadius: '4px 4px 0 0', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 7, color: '#ffffff44', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec in</Typography>
      </Box>
      {/* Header — also serves as drag handle */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.75, borderBottom: '1px solid #7c4dff44', bgcolor: '#7c4dff18', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CodeIcon sx={{ fontSize: 13, color: '#ce93d8', flexShrink: 0 }} />
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {scope && <Typography component="div" sx={{ fontSize: 9, color: '#ce93d866', fontFamily: 'monospace', lineHeight: 1 }}>{scope}</Typography>}
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#ce93d8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fn}()</Typography>
          </Box>
          <Tooltip title={data.running ? 'Running…' : 'Call function'}>
            <span className="nodrag">
              <IconButton size="small" sx={{ p: 0.25 }} disabled={data.running}
                onClick={(e) => { e.stopPropagation(); data.onCall(); }}>
                {data.running
                  ? <CircularProgress size={14} sx={{ color: '#ce93d8' }} />
                  : <PlayArrowIcon sx={{ fontSize: 16, color: '#ce93d8' }} />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
      {/* This/self row — shown for class methods (symbolPath has a dot and is not a constructor) */}
      {parts.length > 1 && parts[parts.length - 1] !== 'constructor' && (
        <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', py: '3px', borderBottom: '1px solid #ffb74d22', position: 'relative', gap: 0.75, ...rowPadding }}>
          <Handle type="target" position={argPos} id="this"
            style={{ position: 'absolute', [flipped ? 'right' : 'left']: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#ffb74d', border: '1.5px solid #1a1000', borderRadius: 2, pointerEvents: 'all' }} />
          {flipped && data.connectedThisValue !== undefined && (
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#ffb74d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {JSON.stringify(data.connectedThisValue).slice(0, 20)}… →
            </Typography>
          )}
          <Typography sx={{ fontSize: 10, color: data.connectedThisValue !== undefined ? '#ffb74d' : '#ffb74d55', fontFamily: 'monospace', flexShrink: 0, fontStyle: 'italic' }}>this</Typography>
          {!flipped && data.connectedThisValue !== undefined && (
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#ffb74d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ← {JSON.stringify(data.connectedThisValue).slice(0, 20)}
            </Typography>
          )}
        </Box>
      )}
      {/* Param rows */}
      {data.paramNames.length === 0 && (
        <Box className="nodrag" sx={{ px: 1.5, py: 0.5, borderBottom: '1px solid #7c4dff22' }}>
          <Typography sx={{ fontSize: 9, color: 'text.disabled', fontStyle: 'italic', fontFamily: 'monospace' }}>no params</Typography>
        </Box>
      )}
      {data.paramNames.map((param, i) => {
        const hasConnected = data.connectedArgValues[i] !== undefined;
        return (
          <Box key={i} className="nodrag" sx={{ display: 'flex', alignItems: 'center', py: '3px', borderBottom: '1px solid #7c4dff22', position: 'relative', gap: 0.75, ...rowPadding }}>
            <Handle type="target" position={argPos} id={`arg_${i}`} style={argStyle(-5)} />
            {flipped && hasConnected && (
              <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#81c784', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {JSON.stringify(data.connectedArgValues[i])} →
              </Typography>
            )}
            {flipped && !hasConnected && (
              <TextField size="small" variant="standard" placeholder="—"
                className="nodrag"
                value={data.argOverrides[i] ?? ''}
                onChange={(e) => data.onArgOverrideChange(i, e.target.value)}
                inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', padding: '0 2px', textAlign: 'right' } }}
                sx={{ flex: 1, '& .MuiInput-underline:before': { borderBottomColor: '#7c4dff44' } }} />
            )}
            <Typography sx={{ fontSize: 10, color: hasConnected ? '#7c4dff' : '#ce93d888', fontFamily: 'monospace', flexShrink: 0, minWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(flipped ? { textAlign: 'right' } : {}) }}>{param}</Typography>
            {!flipped && hasConnected && (
              <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#81c784', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ← {JSON.stringify(data.connectedArgValues[i])}
              </Typography>
            )}
            {!flipped && !hasConnected && (
              <TextField size="small" variant="standard" placeholder="—"
                className="nodrag"
                value={data.argOverrides[i] ?? ''}
                onChange={(e) => data.onArgOverrideChange(i, e.target.value)}
                inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', padding: '0 2px' } }}
                sx={{ flex: 1, '& .MuiInput-underline:before': { borderBottomColor: '#7c4dff44' } }} />
            )}
          </Box>
        );
      })}
      {/* Result row */}
      {/* Return handle row */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', py: '2px', px: 1, position: 'relative', borderTop: '1px solid #7c4dff22',
        ...(flipped ? { justifyContent: 'flex-start' } : { justifyContent: 'flex-end' }) }}>
        <Handle type="source" position={retPos} id="return" style={retHandleStyle} />
        <Typography sx={{ fontSize: 9, color: '#81c78466', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase',
          ...(data.error ? { color: '#ef535066' } : {}) }}>
          {data.error ? 'error' : '↩ return'}
        </Typography>
      </Box>
      {/* Result preview */}
      <ValuePreviewButton jsonValue={data.error ?? data.result} accentColor={data.error ? '#ef5350' : '#81c784'} label="Result" />
      {/* exec_out — visual bar + handle at bottom edge */}
      <Box sx={{ height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff0a', borderTop: '1px solid #ffffff18', borderRadius: '0 0 4px 4px', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 7, color: '#ffffffaa', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec out ▶</Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="exec_out"
        title="Drag to connect to exec_in of next node"
        style={{ width: 14, height: 14, background: '#ffffffee', border: '2px solid #7c4dff', borderRadius: 2, pointerEvents: 'all', cursor: 'crosshair' }} />
    </Box>
  );
};

// ─── Value preview (shared by Var + FunctionCall) ────────────────────────────

const ValuePreview: React.FC<{ jsonValue: string | null; accentColor?: string; expanded?: boolean }> = ({ jsonValue, accentColor = '#81c784', expanded = false }) => {
  if (jsonValue === null || jsonValue === undefined) {
    return (
      <Box sx={{ px: 1, py: 0.5, my: (expanded ? 0 : 0.25), mx: (expanded ? 0 : 0.75), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: 'text.disabled', fontStyle: 'italic' }}>—</Typography>
      </Box>
    );
  }

  let parsed: unknown;
  let parseError = false;
  try { parsed = JSON.parse(jsonValue); } catch { parsed = jsonValue; parseError = true; }

  const isComplex = !parseError && parsed !== null && typeof parsed === 'object';

  let color = 'rgba(255,255,255,0.85)';
  if (!parseError) {
    if (parsed === null) color = 'rgba(255,255,255,0.3)';
    else if (typeof parsed === 'number') color = '#81c784';
    else if (typeof parsed === 'boolean') color = '#ffb74d';
    else if (typeof parsed === 'string') color = accentColor;
  }

  const prettyLines = isComplex
    ? JSON.stringify(parsed, null, 2).split('\n')
    : null;
  const maxLines = 6;
  const trimmed = !expanded && prettyLines && prettyLines.length > maxLines;
  const displayLines = trimmed ? [...prettyLines!.slice(0, maxLines), '…'] : prettyLines;

  return (
    <Box sx={{ px: 0.75, py: 0.5, my: (expanded ? 0 : 0.25), mx: (expanded ? 0 : 0.75), borderRadius: 1,
      bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${accentColor}22`,
      maxHeight: isComplex ? (expanded ? 300 : 110) : 'auto', overflow: isComplex ? 'auto' : 'hidden' }}
      className="nodrag nowheel">
      {isComplex ? (
        displayLines!.map((line, i) => (
          <Typography key={i} component="div" sx={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.45, whiteSpace: 'pre', color: line.trimStart().startsWith('"') ? accentColor : 'rgba(255,255,255,0.7)' }}>
            {line}
          </Typography>
        ))
      ) : (
        <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color, wordBreak: 'break-all', lineHeight: 1.4 }}>
          {parseError ? jsonValue : String(parsed)}
        </Typography>
      )}
    </Box>
  );
};

// ─── Value preview button (compact row → Popover with full preview) ──────────
const ValuePreviewButton: React.FC<{
  jsonValue: string | null;
  accentColor?: string;
  label?: string;
}> = ({ jsonValue, accentColor = '#81c784', label = 'Value' }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const hasValue = jsonValue !== null && jsonValue !== undefined;

  let summary = '—';
  let summaryColor = 'rgba(255,255,255,0.25)';
  if (hasValue) {
    try {
      const p = JSON.parse(jsonValue!);
      if (p === null) { summary = 'null'; summaryColor = 'rgba(255,255,255,0.35)'; }
      else if (typeof p === 'number') { summary = String(p); summaryColor = '#81c784'; }
      else if (typeof p === 'boolean') { summary = String(p); summaryColor = '#ffb74d'; }
      else if (typeof p === 'string') {
        const s = p.length > 14 ? p.slice(0, 14) + '…' : p;
        summary = `"${s}"`;
        summaryColor = accentColor;
      } else if (Array.isArray(p)) { summary = `[${p.length}]`; summaryColor = accentColor; }
      else { summary = '{…}'; summaryColor = accentColor; }
    } catch {
      const raw = String(jsonValue);
      summary = raw.length > 14 ? raw.slice(0, 14) + '…' : raw;
      summaryColor = '#ef5350';
    }
  }

  return (
    <>
      <Box
        className="nodrag"
        onClick={(e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); }}
        sx={{
          display: 'flex', alignItems: 'center', px: 1, py: '3px', gap: 0.75, cursor: 'pointer',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
        }}
      >
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: hasValue ? accentColor : 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
        <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'monospace', flexShrink: 0 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: summaryColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </Typography>
      </Box>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            bgcolor: '#12101e', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 1.5,
            minWidth: 220, maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
          },
        }}
      >
        <Box sx={{ p: 1.5 }}>
          <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', mb: 1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'monospace' }}>
            {label}
          </Typography>
          <ValuePreview jsonValue={jsonValue} accentColor={accentColor} expanded />
        </Box>
      </Popover>
    </>
  );
};

// ─── Var node ─────────────────────────────────────────────────────────────────

interface VarNodeData extends Record<string, unknown> {
  varId: string;
  varName: string;
  varValue: string | null;
  selected: boolean;
  pinsFlipped: boolean;
  onNameChange: (name: string) => void;
}

const VarNode: React.FC<NodeProps<Node<VarNodeData>>> = ({ data }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(data.varName);
  useEffect(() => { setNameVal(data.varName); }, [data.varName]);

  const flipped = data.pinsFlipped;
  // Default: both main pins on RIGHT. Flipped: both main pins on LEFT.
  const pinPos = flipped ? Position.Left : Position.Right;
  const pinSide = flipped ? 'left' : 'right';
  // Field rows: SET on opposite side, GET on pin side
  const fieldSetPos = flipped ? Position.Right : Position.Left;
  const fieldSetSide = flipped ? 'right' : 'left';

  // Auto-detect object fields from stored JSON value
  const parsedVal = useMemo(() => {
    if (!data.varValue) return null;
    try { return JSON.parse(data.varValue); } catch { return null; }
  }, [data.varValue]);
  const fieldKeys = useMemo((): string[] => {
    if (parsedVal === null || typeof parsedVal !== 'object' || Array.isArray(parsedVal)) return [];
    return Object.keys(parsedVal as Record<string, unknown>);
  }, [parsedVal]);

  return (
    <Box sx={{ minWidth: 140, bgcolor: '#0f1a14', border: '2px solid', borderColor: data.selected ? '#81c784' : '#81c78444', borderRadius: 1.5, userSelect: 'none', position: 'relative' }}>
      {/* Name row — also serves as drag handle */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.5, borderBottom: '1px solid #81c78422', display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#81c78412', borderRadius: '4px 4px 0 0', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <StorageIcon sx={{ fontSize: 11, color: '#81c784', flexShrink: 0 }} />
        {editingName
          ? <TextField size="small" value={nameVal} autoFocus variant="standard"
              className="nodrag"
              inputProps={{ style: { fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#81c784', padding: '0 2px' } }}
              sx={{ flex: 1, '& .MuiInput-underline:before': { borderBottomColor: '#81c78444' } }}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={() => { setEditingName(false); if (nameVal !== data.varName) data.onNameChange(nameVal); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setEditingName(false); if (nameVal !== data.varName) data.onNameChange(nameVal); }
                if (e.key === 'Escape') { setNameVal(data.varName); setEditingName(false); }
              }} />
          : <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#81c784', fontFamily: 'monospace', flex: 1, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onDoubleClick={() => setEditingName(true)}>{data.varName}</Typography>
        }
      </Box>
      {/* Set row (value_in) */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: '2px', minHeight: 22, position: 'relative', borderBottom: '1px solid #81c78411',
        justifyContent: flipped ? 'flex-start' : 'flex-end' }}>
        <Handle type="target" position={pinPos} id="value_in"
          style={{ position: 'absolute', [pinSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#4db6ac', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
        <Typography sx={{ fontSize: 9, color: '#4db6ac', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>Set</Typography>
      </Box>
      {/* Value preview */}
      <ValuePreviewButton jsonValue={data.varValue} accentColor="#81c784" label="Value" />
      {/* Get row (value_out) */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: '2px', minHeight: 22, position: 'relative', borderTop: '1px solid #81c78411',
        justifyContent: flipped ? 'flex-start' : 'flex-end', borderBottom: fieldKeys.length > 0 ? '2px solid #81c78422' : 'none' }}>
        <Handle type="source" position={pinPos} id="value_out"
          style={{ position: 'absolute', [pinSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#aed581', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
        <Typography sx={{ fontSize: 9, color: '#aed581', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>Get</Typography>
      </Box>
      {/* Per-field rows (auto-detected from object keys) */}
      {fieldKeys.map((key, i) => {
        const val = (parsedVal as Record<string, unknown>)[key];
        const valStr = val === null ? 'null'
          : typeof val === 'string' ? (val.length > 12 ? `"${val.slice(0, 12)}…"` : `"${val}"`)
          : typeof val === 'object' ? (Array.isArray(val) ? `[…]` : `{…}`)
          : String(val);
        return (
          <Box key={key} className="nodrag" sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 20, position: 'relative',
            pl: flipped ? 1.5 : 2, pr: flipped ? 2 : 1.5,
            borderBottom: i < fieldKeys.length - 1 ? '1px solid #81c78408' : 'none',
          }}>
            {/* SET pin on opposite side */}
            <Handle type="target" position={fieldSetPos} id={`set_${key}`}
              style={{ position: 'absolute', [fieldSetSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, background: '#4db6ac66', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
            {/* GET pin on main side */}
            <Handle type="source" position={pinPos} id={`get_${key}`}
              style={{ position: 'absolute', [pinSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 9, height: 9, background: '#aed58188', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
            <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: '#81c784aa', flexShrink: 0 }}>{key}</Typography>
            <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: '#81c78455', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textAlign: flipped ? 'left' : 'right' }}>
              {valStr}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

// ─── ObjNode ──────────────────────────────────────────────────────────────────

interface ObjNodeData extends Record<string, unknown> {
  objId: string;
  className: string;
  fieldNames: string[];
  instanceValue: string | null;
  connectedSetValues: Record<string, unknown>;  // field → value from connected SET edge
  selected: boolean;
  pinsFlipped: boolean;
  onApply: () => void;    // merge connectedSetValues into instanceValue
  onFlip: () => void;
}

const ObjNode: React.FC<NodeProps<Node<ObjNodeData>>> = ({ data }) => {
  const flipped = data.pinsFlipped;
  // Default: SET (target) left, GET (source) right
  const setPos = flipped ? Position.Right : Position.Left;
  const getPos = flipped ? Position.Left : Position.Right;
  const setSide = flipped ? 'right' : 'left';
  const getSide = flipped ? 'left' : 'right';

  const parsedInstance = useMemo(() => {
    if (!data.instanceValue) return null;
    try { return JSON.parse(data.instanceValue) as Record<string, unknown>; } catch { return null; }
  }, [data.instanceValue]);

  const rowPadding = flipped ? { pl: 2, pr: 1.5 } : { pl: 1.5, pr: 2 };

  return (
    <Box sx={{ minWidth: 190, bgcolor: '#0a1520', border: '2px solid', borderColor: data.selected ? '#4fc3f7' : '#4fc3f744', borderRadius: 1.5, userSelect: 'none', position: 'relative' }}>
      {/* Header */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.5, borderBottom: '1px solid #4fc3f722', display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#4fc3f712', borderRadius: '4px 4px 0 0', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <DataObjectIcon sx={{ fontSize: 11, color: '#4fc3f7', flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#4fc3f7', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {data.className}
        </Typography>
        <Tooltip title="Apply SET values to instance">
          <IconButton size="small" className="nodrag" onClick={data.onApply} sx={{ p: '2px' }}>
            <SyncIcon sx={{ fontSize: 11, color: '#4fc3f7aa' }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Flip pins">
          <IconButton size="small" className="nodrag" onClick={data.onFlip} sx={{ p: '2px' }}>
            <SwapHorizIcon sx={{ fontSize: 11, color: '#4fc3f755' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* instance_in (target) */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', minHeight: 20, position: 'relative', borderBottom: '1px solid #4fc3f711', ...rowPadding,
        justifyContent: flipped ? 'flex-end' : 'flex-start' }}>
        <Handle type="target" position={setPos} id="instance_in"
          style={{ position: 'absolute', [setSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#ffb74d', border: '1.5px solid #1a1000', borderRadius: 2, pointerEvents: 'all' }} />
        <Typography sx={{ fontSize: 9, color: '#ffb74d88', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>in</Typography>
      </Box>

      {/* Value preview */}
      <ValuePreviewButton jsonValue={data.instanceValue} accentColor="#4fc3f7" label="Instance" />

      {/* instance_out (source) */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', minHeight: 20, position: 'relative', borderTop: '1px solid #4fc3f711', borderBottom: '2px solid #4fc3f722', ...rowPadding,
        justifyContent: flipped ? 'flex-start' : 'flex-end' }}>
        <Handle type="source" position={getPos} id="instance_out"
          style={{ position: 'absolute', [getSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#ffa726', border: '1.5px solid #1a1000', borderRadius: 2, pointerEvents: 'all' }} />
        <Typography sx={{ fontSize: 9, color: '#ffa72688', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>out</Typography>
      </Box>

      {/* Per-field rows: SET (target) left | name | value | GET (source) right */}
      {data.fieldNames.map((fieldName, i) => {
        const currentVal = parsedInstance?.[fieldName];
        const isConnectedSet = data.connectedSetValues[fieldName] !== undefined;
        const valStr = currentVal !== undefined
          ? (typeof currentVal === 'string' ? `"${currentVal}"` : JSON.stringify(currentVal))
          : undefined;
        return (
          <Box key={fieldName} className="nodrag" sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 22, position: 'relative',
            borderBottom: i < data.fieldNames.length - 1 ? '1px solid #4fc3f708' : 'none',
            ...rowPadding,
          }}>
            <Handle type="target" position={setPos} id={`set_${fieldName}`}
              style={{ position: 'absolute', [setSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: isConnectedSet ? '#4db6ac' : '#4db6ac55', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
            <Handle type="source" position={getPos} id={`get_${fieldName}`}
              style={{ position: 'absolute', [getSide]: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#aed581', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#4fc3f7cc', flexShrink: 0 }}>{fieldName}</Typography>
            {valStr !== undefined && (
              <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: '#4fc3f755', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: flipped ? 'left' : 'right' }}>
                {valStr.length > 16 ? valStr.slice(0, 16) + '…' : valStr}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

// ─── GetPropNode ──────────────────────────────────────────────────────────────

interface GetPropNodeData extends Record<string, unknown> {
  nodeId: string;
  propNameOverride: string;
  result: string | null;
  error: string | null;
  selected: boolean;
  onRun: () => void;
  onPropNameChange: (v: string) => void;
}

const GetPropNode: React.FC<NodeProps<Node<GetPropNodeData>>> = ({ data }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.propNameOverride);
  useEffect(() => { setDraft(data.propNameOverride); }, [data.propNameOverride]);

  const accent = '#4dd0e1';
  const handleStyle = (bg: string): React.CSSProperties => ({
    position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)',
    width: 10, height: 10, background: bg, border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all',
  });

  return (
    <Box sx={{ minWidth: 160, bgcolor: '#061a1c', border: '2px solid', borderColor: data.selected ? accent : `${accent}44`, borderRadius: 1.5, userSelect: 'none', position: 'relative' }}>
      {/* Header */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: `${accent}12`, borderBottom: `1px solid ${accent}22`, borderRadius: '4px 4px 0 0', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <ArrowUpwardIcon sx={{ fontSize: 11, color: accent, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: accent, fontFamily: 'monospace', flex: 1 }}>GetProp</Typography>
        <Tooltip title="Run">
          <IconButton size="small" className="nodrag" onClick={data.onRun} sx={{ p: '2px' }}>
            <PlayArrowIcon sx={{ fontSize: 12, color: `${accent}aa` }} />
          </IconButton>
        </Tooltip>
      </Box>
      {/* this_in */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 1.5, minHeight: 22, position: 'relative', borderBottom: `1px solid ${accent}11` }}>
        <Handle type="target" position={Position.Left} id="this_in" style={handleStyle('#ffb74d')} />
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#ffb74d99', fontStyle: 'italic' }}>this</Typography>
      </Box>
      {/* propname_in + inline override */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 1, gap: 0.5, minHeight: 22, position: 'relative', borderBottom: `2px solid ${accent}22` }}>
        <Handle type="target" position={Position.Left} id="propname_in" style={{ ...handleStyle('#90a4ae'), background: '#90a4ae' }} />
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#90a4ae99', flexShrink: 0 }}>prop</Typography>
        {editing
          ? <TextField size="small" autoFocus variant="standard" value={draft} className="nodrag"
              inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', color: accent, padding: '0 2px' } }}
              sx={{ flex: 1, '& .MuiInput-underline:before': { borderBottomColor: `${accent}44` } }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { setEditing(false); data.onPropNameChange(draft); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { setEditing(false); data.onPropNameChange(draft); } }} />
          : <Typography className="nodrag" sx={{ fontSize: 10, fontFamily: 'monospace', color: data.propNameOverride ? accent : `${accent}44`, flex: 1, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onDoubleClick={() => setEditing(true)}>
              {data.propNameOverride || '…'}
            </Typography>
        }
      </Box>
      {/* result_out */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 1.5, pr: 2, minHeight: 22, position: 'relative', justifyContent: 'flex-end', borderBottom: data.result || data.error ? `1px solid ${accent}11` : 'none' }}>
        <Handle type="source" position={Position.Right} id="result_out"
          style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#aed581', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
        <Typography sx={{ fontSize: 9, color: '#aed58188', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>result</Typography>
      </Box>
      {(data.result !== null || data.error) && (
        <ValuePreviewButton jsonValue={data.result} accentColor={data.error ? '#ef5350' : accent} label={data.error ?? 'Result'} />
      )}
    </Box>
  );
};

// ─── SetPropNode ──────────────────────────────────────────────────────────────

interface SetPropNodeData extends Record<string, unknown> {
  nodeId: string;
  propNameOverride: string;
  result: string | null;
  error: string | null;
  selected: boolean;
  onRun: () => void;
  onPropNameChange: (v: string) => void;
}

const SetPropNode: React.FC<NodeProps<Node<SetPropNodeData>>> = ({ data }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.propNameOverride);
  useEffect(() => { setDraft(data.propNameOverride); }, [data.propNameOverride]);

  const accent = '#ffb74d';
  const handleStyle = (bg: string): React.CSSProperties => ({
    position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)',
    width: 10, height: 10, background: bg, border: '1.5px solid #1a1000', borderRadius: 2, pointerEvents: 'all',
  });

  return (
    <Box sx={{ minWidth: 160, bgcolor: '#1a1100', border: '2px solid', borderColor: data.selected ? accent : `${accent}44`, borderRadius: 1.5, userSelect: 'none', position: 'relative' }}>
      {/* Header */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: `${accent}12`, borderBottom: `1px solid ${accent}22`, borderRadius: '4px 4px 0 0', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <ArrowDownwardIcon sx={{ fontSize: 11, color: accent, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: accent, fontFamily: 'monospace', flex: 1 }}>SetProp</Typography>
        <Tooltip title="Run">
          <IconButton size="small" className="nodrag" onClick={data.onRun} sx={{ p: '2px' }}>
            <PlayArrowIcon sx={{ fontSize: 12, color: `${accent}aa` }} />
          </IconButton>
        </Tooltip>
      </Box>
      {/* this_in */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 1.5, minHeight: 22, position: 'relative', borderBottom: `1px solid ${accent}11` }}>
        <Handle type="target" position={Position.Left} id="this_in" style={handleStyle('#ffb74d')} />
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#ffb74d99', fontStyle: 'italic' }}>this</Typography>
      </Box>
      {/* propname_in + inline override */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 1, gap: 0.5, minHeight: 22, position: 'relative', borderBottom: `1px solid ${accent}11` }}>
        <Handle type="target" position={Position.Left} id="propname_in" style={{ ...handleStyle('#90a4ae'), background: '#90a4ae' }} />
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#90a4ae99', flexShrink: 0 }}>prop</Typography>
        {editing
          ? <TextField size="small" autoFocus variant="standard" value={draft} className="nodrag"
              inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', color: accent, padding: '0 2px' } }}
              sx={{ flex: 1, '& .MuiInput-underline:before': { borderBottomColor: `${accent}44` } }}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { setEditing(false); data.onPropNameChange(draft); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { setEditing(false); data.onPropNameChange(draft); } }} />
          : <Typography className="nodrag" sx={{ fontSize: 10, fontFamily: 'monospace', color: data.propNameOverride ? accent : `${accent}44`, flex: 1, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onDoubleClick={() => setEditing(true)}>
              {data.propNameOverride || '…'}
            </Typography>
        }
      </Box>
      {/* value_in */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 1.5, minHeight: 22, position: 'relative', borderBottom: `2px solid ${accent}22` }}>
        <Handle type="target" position={Position.Left} id="value_in" style={{ ...handleStyle('#aed581'), background: '#aed581' }} />
        <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#aed58199' }}>value</Typography>
      </Box>
      {/* result_out */}
      <Box className="nodrag" sx={{ display: 'flex', alignItems: 'center', pl: 1.5, pr: 2, minHeight: 22, position: 'relative', justifyContent: 'flex-end', borderBottom: data.result || data.error ? `1px solid ${accent}11` : 'none' }}>
        <Handle type="source" position={Position.Right} id="result_out"
          style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#aed581', border: '1.5px solid #001a0d', borderRadius: 2, pointerEvents: 'all' }} />
        <Typography sx={{ fontSize: 9, color: '#aed58188', fontFamily: 'monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>result</Typography>
      </Box>
      {(data.result !== null || data.error) && (
        <ValuePreviewButton jsonValue={data.result} accentColor={data.error ? '#ef5350' : accent} label={data.error ?? 'Result'} />
      )}
    </Box>
  );
};

const NODE_TYPES = { dashObject: DashObjectNode, fcNode: FunctionCallNode, varNode: VarNode, objNode: ObjNode, getPropNode: GetPropNode, setPropNode: SetPropNode };

// ─── VarInitDialog ────────────────────────────────────────────────────────────

type VarInitType = 'QNumber' | 'QString' | 'QBool' | 'QDate' | 'Array' | 'Object' | 'null';

const VAR_TYPES: { id: VarInitType; label: string; color: string; defaultRaw: string }[] = [
  { id: 'QNumber', label: 'QNumber', color: '#81c784', defaultRaw: '0' },
  { id: 'QString', label: 'QString', color: '#4fc3f7', defaultRaw: '' },
  { id: 'QBool',   label: 'QBool',   color: '#ffb74d', defaultRaw: 'false' },
  { id: 'QDate',   label: 'QDate',   color: '#ce93d8', defaultRaw: new Date().toISOString().slice(0, 10) },
  { id: 'Array',   label: 'Array',   color: '#80cbc4', defaultRaw: '' },
  { id: 'Object',  label: 'Object',  color: '#bcaaa4', defaultRaw: '' },
  { id: 'null',    label: 'null',    color: '#757575', defaultRaw: '' },
];

const buildVarJson = (type: VarInitType, raw: string): string => {
  switch (type) {
    case 'QNumber': return JSON.stringify(parseFloat(raw) || 0);
    case 'QString': return JSON.stringify(raw);
    case 'QBool':   return raw === 'true' ? 'true' : 'false';
    case 'QDate':   return JSON.stringify(raw);
    case 'Array':   return '[]';
    case 'Object':  return '{}';
    case 'null':    return 'null';
  }
};

const VarInitDialog: React.FC<{
  open: boolean;
  currentJson: string | null;
  onConfirm: (json: string) => void;
  onClose: () => void;
}> = ({ open, currentJson, onConfirm, onClose }) => {
  const [selType, setSelType] = useState<VarInitType>('QNumber');
  const [rawValue, setRawValue] = useState('0');

  useEffect(() => {
    if (!open) return;
    if (currentJson === null) { setSelType('QNumber'); setRawValue('0'); return; }
    try {
      const v = JSON.parse(currentJson);
      if (v === null) { setSelType('null'); setRawValue(''); }
      else if (typeof v === 'boolean') { setSelType('QBool'); setRawValue(String(v)); }
      else if (typeof v === 'number') { setSelType('QNumber'); setRawValue(String(v)); }
      else if (typeof v === 'string') {
        if (/^\d{4}-\d{2}-\d{2}/.test(v)) { setSelType('QDate'); setRawValue(v.slice(0, 10)); }
        else { setSelType('QString'); setRawValue(v); }
      }
      else if (Array.isArray(v)) { setSelType('Array'); setRawValue(''); }
      else { setSelType('Object'); setRawValue(''); }
    } catch { setSelType('QString'); setRawValue(currentJson); }
  }, [open, currentJson]);

  const handleTypeChange = (t: VarInitType) => {
    setSelType(t);
    const def = VAR_TYPES.find((x) => x.id === t)!;
    setRawValue(def.defaultRaw);
  };

  const preview = buildVarJson(selType, rawValue);
  const accent = VAR_TYPES.find((x) => x.id === selType)?.color ?? '#81c784';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 14, fontWeight: 700, pb: 1 }}>Set Var value</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {/* Type chips */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {VAR_TYPES.map((t) => (
            <Chip key={t.id} label={t.label} size="small" clickable
              onClick={() => handleTypeChange(t.id)}
              sx={{
                fontFamily: 'monospace', fontSize: 11,
                bgcolor: selType === t.id ? t.color + '33' : 'transparent',
                border: `1.5px solid ${selType === t.id ? t.color : t.color + '55'}`,
                color: selType === t.id ? t.color : 'text.secondary',
                fontWeight: selType === t.id ? 700 : 400,
              }} />
          ))}
        </Box>

        {/* Value input */}
        {selType === 'QNumber' && (
          <TextField label="Value" type="number" fullWidth size="small" value={rawValue}
            onChange={(e) => setRawValue(e.target.value)} autoFocus />
        )}
        {selType === 'QString' && (
          <TextField label="Value" fullWidth size="small" value={rawValue}
            onChange={(e) => setRawValue(e.target.value)} autoFocus />
        )}
        {selType === 'QBool' && (
          <ToggleButtonGroup exclusive value={rawValue} onChange={(_, v) => { if (v) setRawValue(v); }} size="small" fullWidth>
            <ToggleButton value="true" sx={{ fontFamily: 'monospace', color: '#ffb74d', '&.Mui-selected': { bgcolor: '#ffb74d22', color: '#ffb74d' } }}>true</ToggleButton>
            <ToggleButton value="false" sx={{ fontFamily: 'monospace', color: '#ef535088', '&.Mui-selected': { bgcolor: '#ef535022', color: '#ef5350' } }}>false</ToggleButton>
          </ToggleButtonGroup>
        )}
        {selType === 'QDate' && (
          <TextField label="Date" type="date" fullWidth size="small" value={rawValue}
            onChange={(e) => setRawValue(e.target.value)} autoFocus
            InputLabelProps={{ shrink: true }} />
        )}
        {(selType === 'Array' || selType === 'Object' || selType === 'null') && (
          <Box sx={{ px: 1.5, py: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: accent }}>{preview}</Typography>
          </Box>
        )}

        {/* Preview */}
        {selType !== 'Array' && selType !== 'Object' && selType !== 'null' && (
          <Box sx={{ mt: 1.5, px: 1.5, py: 0.75, borderRadius: 1, bgcolor: 'action.hover', border: `1px solid ${accent}33` }}>
            <Typography sx={{ fontSize: 10, color: 'text.disabled', mb: 0.25 }}>JSON preview</Typography>
            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: accent }}>{preview}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" variant="contained" onClick={() => { onConfirm(preview); onClose(); }}
          sx={{ bgcolor: accent, '&:hover': { bgcolor: accent + 'cc' } }}>
          Set
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Main editor ─────────────────────────────────────────────────────────────

const DashEditorInner: React.FC<DashEditorPanelProps> = ({ userName, filePath }) => {
  const isMobile = useMediaQuery('(pointer: coarse)');
  const { setCenter, screenToFlowPosition } = useReactFlow();
  const [scene, setScene] = useState<DashScene>({ type: 'dash-scene', version: 1, objects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [umlSources, setUmlSources] = useState<UmlSource[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPathLoading, setImportPathLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<DataSourceEntry[]>([]);
  const [dsData, setDsData] = useState<Record<string, JsonNode | null | undefined>>({});
  const [dsPickerOpen, setDsPickerOpen] = useState(false);
  const [sourceCtxMenu, setSourceCtxMenu] = useState<{ mouseX: number; mouseY: number; sourceId: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedField, setSelectedField] = useState<{ objId: string; fieldName: string } | null>(null);
  const [clipboard, setClipboard] = useState<{ objects: DashObject[] } | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [sceneCtxMenu, setSceneCtxMenu] = useState<{ mouseX: number; mouseY: number; objId: string | null } | null>(null);

  const openSceneCtx = useCallback((e: React.MouseEvent, objId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (objId) setSelectedIds(new Set([objId]));
    setSceneCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, objId });
  }, []);

  const closeSceneCtx = useCallback(() => setSceneCtxMenu(null), []);
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState<string[]>(['scene', 'properties']);
  const [fcRunning, setFcRunning] = useState<Set<string>>(new Set());
  const [varInitDialogOpen, setVarInitDialogOpen] = useState(false);
  const [varInitTargetId, setVarInitTargetId] = useState<string | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef = useRef<DashScene>({ type: 'dash-scene', version: 1, objects: [] });

  const classes = useMemo<UmlClassDef[]>(() => {
    const allUser = umlSources.flatMap((s) => s.classes);
    const userNames = new Set(allUser.map((c) => c.name));
    return [...BUILT_IN_CLASSES.filter((c) => !userNames.has(c.name)), ...allUser];
  }, [umlSources]);

  const classMap = useMemo(() => {
    const m = new Map<string, UmlClassDef>();
    for (const c of classes) m.set(c.name, c);
    return m;
  }, [classes]);

  const functionCalls = useMemo(() => scene.functionCalls ?? [], [scene]);
  const vars = useMemo(() => scene.vars ?? [], [scene]);

  const scheduleSave = useCallback((s: DashScene) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      vfsWrite(userName, filePath, JSON.stringify(s, null, 2))
        .catch((e) => console.error('[DashEditor] save failed:', e));
    }, 1500);
  }, [userName, filePath]);

  const updateScene = useCallback((updater: (prev: DashScene) => DashScene) => {
    setScene((prev) => { const next = updater(prev); sceneRef.current = next; scheduleSave(next); return next; });
  }, [scheduleSave]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const text = await vfsRead(userName, filePath);
        const raw = JSON.parse(text) as Omit<DashScene, 'objects'> & { objects: LegacyDashObject[]; umlProjectPath?: string };
        const parsed: DashScene = {
          ...raw,
          objects: raw.objects.map((o): DashObject => ({
            id: o.id, className: o.className, objectName: o.objectName,
            customFields: o.customFields, properties: o.properties,
            transform: o.transform ?? defaultTransform(o.x ?? 0, o.y ?? 0),
          })),
        };
        setScene(parsed);
        sceneRef.current = parsed;
        // Migrate old single-path format + load all sources
        const sourcePaths: Array<{ id: string; path: string }> =
          parsed.umlSources ??
          (raw.umlProjectPath ? [{ id: makeId(), path: raw.umlProjectPath }] : []);
        if (sourcePaths.length > 0) {
          const results = await Promise.all(sourcePaths.map(async (src) => {
            try {
              const clsList = parseUmlProject(await vfsRead(userName, src.path));
              const name = src.path.split('/').pop()?.replace(/\.umlproj\.json$/, '') ?? src.path;
              return { ...src, name, classes: clsList } as UmlSource;
            } catch { return null; }
          }));
          setUmlSources(results.filter((r): r is UmlSource => r !== null));
        }
        // Load data sources
        const dsEntries = parsed.dataSources ?? [];
        if (dsEntries.length > 0) {
          setDataSources(dsEntries);
          const initData: Record<string, undefined> = {};
          for (const ds of dsEntries) initData[ds.id] = undefined;
          setDsData(initData);
          for (const ds of dsEntries) {
            const dsId = ds.id;
            const dsType = ds.fileType;
            vfsRead(userName, ds.filePath)
              .then((text) => { setDsData((prev) => ({ ...prev, [dsId]: loadDataSourceContent(text, dsType) })); })
              .catch(() => setDsData((prev) => ({ ...prev, [dsId]: null })));
          }
        }
      } catch {
        const demo = makeDemoScene();
        setScene(demo); sceneRef.current = demo; scheduleSave(demo);
      } finally {
        setLoading(false);
      }
    })();
  }, [userName, filePath, scheduleSave]);

  const importUmlSource = useCallback(async (path: string) => {
    const p = path.trim();
    if (!p) return;
    setImportPathLoading(true);
    setImportError(null);
    try {
      const clsList = parseUmlProject(await vfsRead(userName, p));
      const name = p.split('/').pop()?.replace(/\.umlproj\.json$/, '') ?? p;
      // Compute next outside updater to avoid calling setState inside setState
      const prev = umlSources;
      const existing = prev.find((s) => s.path === p);
      const next: UmlSource[] = existing
        ? prev.map((s) => s.path === p ? { ...s, classes: clsList } : s)
        : [...prev, { id: makeId(), path: p, name, classes: clsList }];
      const newId = existing ? null : next[next.length - 1].id;
      setUmlSources(next);
      updateScene((sc) => ({ ...sc, umlSources: next.map((s) => ({ id: s.id, path: s.path })) }));
      if (newId) setExpandedSources((ex) => { const n = new Set(ex); n.add(newId); return n; });
      setShowImportDialog(false);
    } catch (e) {
      setImportError(`Cannot load: ${(e as Error).message}`);
    } finally {
      setImportPathLoading(false);
    }
  }, [userName, umlSources, updateScene]);

  const reloadUmlSource = useCallback(async (sourceId: string) => {
    const src = umlSources.find((s) => s.id === sourceId);
    if (!src) return;
    try {
      const clsList = parseUmlProject(await vfsRead(userName, src.path));
      setUmlSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, classes: clsList } : s));
    } catch (e) { setError(`Reload failed: ${(e as Error).message}`); }
  }, [umlSources, userName]);

  const removeUmlSource = useCallback((sourceId: string) => {
    setUmlSources((prev) => {
      const next = prev.filter((s) => s.id !== sourceId);
      updateScene((sc) => ({ ...sc, umlSources: next.map((s) => ({ id: s.id, path: s.path })) }));
      return next;
    });
  }, [updateScene]);

  const addDataSource = useCallback(async (filePath: string) => {
    const name = filePath.split('/').pop()?.replace(/\.(json|js)$/, '') ?? filePath;
    const fileType: 'json' | 'js' = filePath.endsWith('.js') ? 'js' : 'json';
    const id = makeId();
    const entry: DataSourceEntry = { id, name, filePath, fileType };
    setDsData((prev) => ({ ...prev, [id]: undefined }));
    try {
      const text = await vfsRead(userName, filePath);
      setDsData((prev) => ({ ...prev, [id]: loadDataSourceContent(text, fileType) }));
    } catch (e) {
      setDsData((prev) => ({ ...prev, [id]: { _error: (e as Error).message } as unknown as JsonNode }));
    }
    setDataSources((prev) => {
      const next = [...prev, entry];
      updateScene((sc) => ({ ...sc, dataSources: next }));
      return next;
    });
  }, [userName, updateScene]);

  const removeDataSource = useCallback((id: string) => {
    setDataSources((prev) => {
      const next = prev.filter((s) => s.id !== id);
      updateScene((sc) => ({ ...sc, dataSources: next }));
      return next;
    });
    setDsData((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }, [updateScene]);

  const reloadDataSource = useCallback(async (id: string) => {
    const src = dataSources.find((s) => s.id === id);
    if (!src) return;
    setDsData((prev) => ({ ...prev, [id]: undefined }));
    try {
      const text = await vfsRead(userName, src.filePath);
      setDsData((prev) => ({ ...prev, [id]: loadDataSourceContent(text, src.fileType) }));
    } catch (e) {
      setDsData((prev) => ({ ...prev, [id]: { _error: (e as Error).message } as unknown as JsonNode }));
    }
  }, [dataSources, userName]);

  // ─── FunctionCall + Var + ClassObj management ──────────────────────────────

  const createFunctionCall = useCallback((x: number, y: number, sourceId: string, symbolPath: string, paramNames: string[]) => {
    const newFc: FunctionCallObject = { id: makeId(), sourceId, symbolPath, paramNames, argOverrides: {}, result: null, error: null, x, y };
    updateScene((prev) => ({ ...prev, functionCalls: [...(prev.functionCalls ?? []), newFc] }));
    setSelectedIds(new Set([newFc.id]));
  }, [updateScene]);

  const createVar = useCallback((x: number, y: number) => {
    const count = sceneRef.current.vars?.length ?? 0;
    const newVar: VarObject = { id: makeId(), varName: `var${count}`, varValue: null, x, y };
    updateScene((prev) => ({ ...prev, vars: [...(prev.vars ?? []), newVar] }));
    setSelectedIds(new Set([newVar.id]));
  }, [updateScene]);

  const createClassObj = useCallback((x: number, y: number, sourceId: string, className: string, fieldNames: string[]) => {
    const newObj: ClassObjItem = { id: makeId(), sourceId, className, fieldNames, instanceValue: null, x, y };
    updateScene((prev) => ({ ...prev, classObjs: [...(prev.classObjs ?? []), newObj] }));
    setSelectedIds(new Set([newObj.id]));
  }, [updateScene]);

  const applyClassObj = useCallback((objId: string) => {
    const obj = sceneRef.current.classObjs?.find((o) => o.id === objId);
    if (!obj) return;
    const current: Record<string, unknown> = (() => {
      if (!obj.instanceValue) return {};
      try { return JSON.parse(obj.instanceValue) as Record<string, unknown>; } catch { return {}; }
    })();
    const setEdges = (sceneRef.current.fcEdges ?? []).filter((e) => e.target === objId && e.targetHandle.startsWith('set_'));
    const updates: Record<string, unknown> = {};
    for (const edge of setEdges) {
      const field = edge.targetHandle.slice(4);
      const varSrc = sceneRef.current.vars?.find((v) => v.id === edge.source);
      if (varSrc?.varValue !== null && varSrc?.varValue !== undefined) {
        try { updates[field] = JSON.parse(varSrc.varValue); } catch { updates[field] = varSrc.varValue; }
        continue;
      }
      const fcSrc = sceneRef.current.functionCalls?.find((f) => f.id === edge.source);
      if (fcSrc?.result !== null && fcSrc?.result !== undefined) {
        try { updates[field] = JSON.parse(fcSrc.result); } catch { updates[field] = fcSrc.result; }
        continue;
      }
      const objSrc = sceneRef.current.classObjs?.find((o) => o.id === edge.source);
      if (objSrc?.instanceValue !== null && objSrc?.instanceValue !== undefined) {
        if (edge.sourceHandle === 'instance_out') {
          try { updates[field] = JSON.parse(objSrc.instanceValue); } catch { updates[field] = objSrc.instanceValue; }
        } else if (edge.sourceHandle.startsWith('get_')) {
          const srcField = edge.sourceHandle.slice(4);
          try { const inst = JSON.parse(objSrc.instanceValue) as Record<string, unknown>; updates[field] = inst[srcField]; } catch {}
        }
      }
    }
    const merged = JSON.stringify({ ...current, ...updates });
    updateScene((prev) => ({
      ...prev,
      classObjs: (prev.classObjs ?? []).map((o) => o.id !== objId ? o : { ...o, instanceValue: merged }),
    }));
  }, [updateScene]);

  const flipClassObj = useCallback((objId: string) => {
    updateScene((prev) => ({
      ...prev,
      classObjs: (prev.classObjs ?? []).map((o) => o.id !== objId ? o : { ...o, pinsFlipped: !(o.pinsFlipped ?? false) }),
    }));
  }, [updateScene]);

  const updateFcArgOverride = useCallback((fcId: string, argIndex: number, value: string) => {
    updateScene((prev) => ({
      ...prev,
      functionCalls: (prev.functionCalls ?? []).map((f) =>
        f.id !== fcId ? f : { ...f, argOverrides: { ...f.argOverrides, [argIndex]: value } }
      ),
    }));
  }, [updateScene]);

  const updateVarName = useCallback((varId: string, name: string) => {
    updateScene((prev) => ({
      ...prev,
      vars: (prev.vars ?? []).map((v) => v.id !== varId ? v : { ...v, varName: name }),
    }));
  }, [updateScene]);

  const callFunctionForNode = useCallback(async (fcId: string) => {
    const fc = sceneRef.current.functionCalls?.find((f) => f.id === fcId);
    if (!fc) return;
    const ds = dataSources.find((d) => d.id === fc.sourceId);
    if (!ds) return;
    setFcRunning((prev) => new Set([...prev, fcId]));
    try {
      const fcEdges = sceneRef.current.fcEdges ?? [];

      const argValues: unknown[] = fc.paramNames.map((_, i) => {
        const edge = fcEdges.find((e) => e.target === fcId && e.targetHandle === `arg_${i}`);
        if (edge) {
          const v = resolveSource(edge, sceneRef.current);
          if (v !== undefined) return v;
        }
        const override = fc.argOverrides[i];
        if (override !== undefined && override.trim() !== '') {
          const num = Number(override);
          if (!isNaN(num)) return num;
          if (override === 'true') return true;
          if (override === 'false') return false;
          if (override === 'null') return null;
          return override;
        }
        return undefined;
      });

      // Resolve "this" value
      const thisEdge = fcEdges.find((e) => e.target === fcId && e.targetHandle === 'this');
      const thisValue: unknown = thisEdge ? resolveSource(thisEdge, sceneRef.current) : undefined;

      const text = await vfsRead(userName, ds.filePath);
      const result = await executeFunctionFromSource(text, fc.symbolPath, argValues, thisValue);
      const resultJson = JSON.stringify(result);
      updateScene((prev) => {
        const outEdges = (prev.fcEdges ?? []).filter((e) => e.source === fcId && e.sourceHandle === 'return');
        // Propagate result to classObjs (instance_in or set_${field})
        const classObjPatch: Record<string, string> = {};
        for (const edge of outEdges.filter((e) => (prev.classObjs ?? []).some((o) => o.id === e.target))) {
          const obj = (prev.classObjs ?? []).find((o) => o.id === edge.target);
          if (!obj) continue;
          if (edge.targetHandle === 'instance_in') {
            classObjPatch[edge.target] = resultJson;
          } else if (edge.targetHandle.startsWith('set_')) {
            const field = edge.targetHandle.slice(4);
            const base: Record<string, unknown> = classObjPatch[edge.target] !== undefined
              ? (JSON.parse(classObjPatch[edge.target]) as Record<string, unknown>)
              : (() => { try { return obj.instanceValue ? (JSON.parse(obj.instanceValue) as Record<string, unknown>) : {}; } catch { return {}; } })();
            classObjPatch[edge.target] = JSON.stringify({ ...base, [field]: result });
          }
        }
        return {
          ...prev,
          functionCalls: (prev.functionCalls ?? []).map((f) => f.id === fcId ? { ...f, result: resultJson, error: null } : f),
          vars: (prev.vars ?? []).map((v) => {
            const matchEdge = outEdges.find((e) => e.target === v.id);
            if (!matchEdge) return v;
            if (matchEdge.targetHandle === 'value_in') return { ...v, varValue: resultJson };
            if (matchEdge.targetHandle.startsWith('set_')) {
              const field = matchEdge.targetHandle.slice(4);
              const cur: Record<string, unknown> = v.varValue
                ? (() => { try { return JSON.parse(v.varValue) as Record<string, unknown>; } catch { return {}; } })()
                : {};
              return { ...v, varValue: JSON.stringify({ ...cur, [field]: result }) };
            }
            return v;
          }),
          classObjs: (prev.classObjs ?? []).map((o) => classObjPatch[o.id] !== undefined ? { ...o, instanceValue: classObjPatch[o.id] } : o),
        };
      });
    } catch (e) {
      const msg = (e as Error).message;
      updateScene((prev) => ({
        ...prev,
        functionCalls: (prev.functionCalls ?? []).map((f) => f.id === fcId ? { ...f, error: msg, result: null } : f),
      }));
    } finally {
      setFcRunning((prev) => { const n = new Set(prev); n.delete(fcId); return n; });
      // Follow exec_out → exec_in chain
      const execEdge = (sceneRef.current.fcEdges ?? []).find((e) => e.source === fcId && e.sourceHandle === 'exec_out' && e.targetHandle === 'exec_in');
      if (execEdge) {
        const nextFcId = execEdge.target;
        const nextExists = (sceneRef.current.functionCalls ?? []).some((f) => f.id === nextFcId);
        if (nextExists) void callFunctionForNode(nextFcId);
      }
    }
  }, [dataSources, userName, updateScene]);

  const createGetProp = useCallback((x: number, y: number) => {
    const newNode: GetPropObject = { id: makeId(), propNameOverride: '', result: null, error: null, x, y };
    updateScene((prev) => ({ ...prev, getProps: [...(prev.getProps ?? []), newNode] }));
    setSelectedIds(new Set([newNode.id]));
  }, [updateScene]);

  const createSetProp = useCallback((x: number, y: number) => {
    const newNode: SetPropObject = { id: makeId(), propNameOverride: '', result: null, error: null, x, y };
    updateScene((prev) => ({ ...prev, setProps: [...(prev.setProps ?? []), newNode] }));
    setSelectedIds(new Set([newNode.id]));
  }, [updateScene]);

  const updateGetPropName = useCallback((nodeId: string, name: string) => {
    updateScene((prev) => ({
      ...prev,
      getProps: (prev.getProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, propNameOverride: name }),
    }));
  }, [updateScene]);

  const updateSetPropName = useCallback((nodeId: string, name: string) => {
    updateScene((prev) => ({
      ...prev,
      setProps: (prev.setProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, propNameOverride: name }),
    }));
  }, [updateScene]);

  const runGetProp = useCallback((nodeId: string) => {
    const node = sceneRef.current.getProps?.find((n) => n.id === nodeId);
    if (!node) return;
    const fcEdges = sceneRef.current.fcEdges ?? [];
    const thisEdge = fcEdges.find((e) => e.target === nodeId && e.targetHandle === 'this_in');
    const propNameEdge = fcEdges.find((e) => e.target === nodeId && e.targetHandle === 'propname_in');
    const thisVal = thisEdge ? resolveSource(thisEdge, sceneRef.current) : undefined;
    const propName = propNameEdge
      ? String(resolveSource(propNameEdge, sceneRef.current) ?? '')
      : node.propNameOverride;
    if (!propName) {
      updateScene((prev) => ({
        ...prev,
        getProps: (prev.getProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, error: 'No property name', result: null }),
      }));
      return;
    }
    try {
      const obj = typeof thisVal === 'object' && thisVal !== null ? (thisVal as Record<string, unknown>) : {};
      const result = obj[propName];
      const resultJson = JSON.stringify(result) ?? 'null';
      updateScene((prev) => {
        const outEdges = (prev.fcEdges ?? []).filter((e) => e.source === nodeId && e.sourceHandle === 'result_out');
        return {
          ...prev,
          getProps: (prev.getProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, result: resultJson, error: null }),
          vars: (prev.vars ?? []).map((v) => {
            const edge = outEdges.find((e) => e.target === v.id);
            if (!edge) return v;
            if (edge.targetHandle === 'value_in') return { ...v, varValue: resultJson };
            if (edge.targetHandle.startsWith('set_')) {
              const field = edge.targetHandle.slice(4);
              const cur: Record<string, unknown> = v.varValue ? (() => { try { return JSON.parse(v.varValue) as Record<string, unknown>; } catch { return {}; } })() : {};
              return { ...v, varValue: JSON.stringify({ ...cur, [field]: result }) };
            }
            return v;
          }),
        };
      });
    } catch (e) {
      updateScene((prev) => ({
        ...prev,
        getProps: (prev.getProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, error: (e as Error).message, result: null }),
      }));
    }
  }, [updateScene]);

  const runSetProp = useCallback((nodeId: string) => {
    const node = sceneRef.current.setProps?.find((n) => n.id === nodeId);
    if (!node) return;
    const fcEdges = sceneRef.current.fcEdges ?? [];
    const thisEdge = fcEdges.find((e) => e.target === nodeId && e.targetHandle === 'this_in');
    const propNameEdge = fcEdges.find((e) => e.target === nodeId && e.targetHandle === 'propname_in');
    const valueEdge = fcEdges.find((e) => e.target === nodeId && e.targetHandle === 'value_in');
    const thisVal = thisEdge ? resolveSource(thisEdge, sceneRef.current) : undefined;
    const propName = propNameEdge
      ? String(resolveSource(propNameEdge, sceneRef.current) ?? '')
      : node.propNameOverride;
    const value = valueEdge ? resolveSource(valueEdge, sceneRef.current) : undefined;
    if (!propName) {
      updateScene((prev) => ({
        ...prev,
        setProps: (prev.setProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, error: 'No property name', result: null }),
      }));
      return;
    }
    try {
      const obj = typeof thisVal === 'object' && thisVal !== null ? { ...(thisVal as Record<string, unknown>) } : {};
      obj[propName] = value;
      const resultJson = JSON.stringify(obj);
      updateScene((prev) => {
        const outEdges = (prev.fcEdges ?? []).filter((e) => e.source === nodeId && e.sourceHandle === 'result_out');
        return {
          ...prev,
          setProps: (prev.setProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, result: resultJson, error: null }),
          vars: (prev.vars ?? []).map((v) => {
            const edge = outEdges.find((e) => e.target === v.id);
            if (!edge) return v;
            if (edge.targetHandle === 'value_in') return { ...v, varValue: resultJson };
            if (edge.targetHandle.startsWith('set_')) {
              const field = edge.targetHandle.slice(4);
              const cur: Record<string, unknown> = v.varValue ? (() => { try { return JSON.parse(v.varValue) as Record<string, unknown>; } catch { return {}; } })() : {};
              return { ...v, varValue: JSON.stringify({ ...cur, [field]: obj }) };
            }
            return v;
          }),
        };
      });
    } catch (e) {
      updateScene((prev) => ({
        ...prev,
        setProps: (prev.setProps ?? []).map((n) => n.id !== nodeId ? n : { ...n, error: (e as Error).message, result: null }),
      }));
    }
  }, [updateScene]);

  const processDropAt = useCallback((clientX: number, clientY: number, mime: string, data: string) => {
    const pos = screenToFlowPosition({ x: clientX, y: clientY });
    if (mime === 'application/dash-function') {
      try {
        const { sourceId, symbolPath, paramNames } = JSON.parse(data) as { sourceId: string; symbolPath: string; paramNames: string[] };
        createFunctionCall(pos.x, pos.y, sourceId, symbolPath, paramNames);
      } catch { /* ignore bad drag data */ }
    } else if (mime === 'application/dash-class') {
      try {
        const { sourceId, className, fieldNames } = JSON.parse(data) as { sourceId: string; className: string; fieldNames: string[] };
        createClassObj(pos.x, pos.y, sourceId, className, fieldNames);
      } catch { /* ignore bad drag data */ }
    } else if (mime === 'application/dash-json-ref') {
      try {
        const { filePath: refFilePath, objectPath } = JSON.parse(data) as { sourceId: string; filePath: string; objectPath: string };
        const count = sceneRef.current.objects.length;
        const obj: DashObject = {
          id: makeId(),
          className: 'ObjectRef',
          objectName: `objectRef${count}`,
          transform: { x: pos.x, y: pos.y, rot: 0, scale: 1, width: 280, height: 0 },
          properties: { filePath: refFilePath, objectPath },
        };
        updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
        setSelectedIds(new Set([obj.id]));
      } catch { /* ignore bad drag data */ }
    }
  }, [screenToFlowPosition, createFunctionCall, createClassObj, updateScene]);

  useEffect(() => {
    _touchDropCb = (cx, cy, payload) => processDropAt(cx, cy, payload.mime, payload.data);
    return () => { _touchDropCb = null; };
  }, [processDropAt]);

  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rawFn = e.dataTransfer.getData('application/dash-function');
    const rawCls = e.dataTransfer.getData('application/dash-class');
    const rawRef = e.dataTransfer.getData('application/dash-json-ref');
    const mime = rawFn ? 'application/dash-function' : rawCls ? 'application/dash-class' : rawRef ? 'application/dash-json-ref' : '';
    const data = rawFn || rawCls || rawRef;
    if (mime && data) processDropAt(e.clientX, e.clientY, mime, data);
  }, [processDropAt]);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    void vfsWrite(userName, filePath, JSON.stringify(sceneRef.current, null, 2));
  }, [userName, filePath]);

  const saveRaw = useCallback(() => {
    const raw = sceneRef.current.objects.map((obj) => ({
      objectName: obj.objectName,
      className: obj.className,
      properties: obj.properties,
    }));
    const rawPath = toAbsVfsPath(userName, filePath).replace(/\.[^./]+$/, '') + '.data.json';
    void vfsWrite(userName, rawPath, JSON.stringify(raw, null, 2));
  }, [userName, filePath]);

  const createObject = useCallback((cls: UmlClassDef) => {
    const count = sceneRef.current.objects.length;
    const isCustom = cls.name === 'Unknown';
    const props: Record<string, DashValue> = {};
    for (const f of cls.fields) props[f.name] = defaultForType(detectFieldType(f.type));
    const base = autoTransform(count);
    const transform: DashTransform =
      cls.name === 'MarkdownView' ? { ...base, width: 320, height: 400 }
      : cls.name === 'ObjectRef' ? { ...base, width: 280, height: 0 }
      : base;
    const obj: DashObject = {
      id: makeId(),
      className: cls.name,
      objectName: `${cls.name.charAt(0).toLowerCase()}${cls.name.slice(1)}${count}`,
      transform,
      ...(isCustom ? { customFields: [] } : {}),
      properties: props,
    };
    updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
    setSelectedIds(new Set([obj.id]));
  }, [updateScene]);

  const updateProperty = useCallback((objId: string, field: string, value: DashValue) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, properties: { ...o.properties, [field]: value } } : o) }));
  }, [updateScene]);

  const updateObjectName = useCallback((objId: string, name: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, objectName: name } : o) }));
  }, [updateScene]);

  const updateTransform = useCallback((objId: string, patch: Partial<DashTransform>) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, transform: { ...getTransform(o), ...patch } } : o),
    }));
  }, [updateScene]);

  const addCustomField = useCallback((objId: string, name: string, type: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => {
      if (o.id !== objId) return o;
      if ((o.customFields ?? []).find((f) => f.name === name)) return o;
      return { ...o, customFields: [...(o.customFields ?? []), { name, type }], properties: { ...o.properties, [name]: defaultForType(detectFieldType(type)) } };
    })}));
  }, [updateScene]);

  const removeCustomField = useCallback((objId: string, fieldName: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => {
      if (o.id !== objId) return o;
      const props = { ...o.properties }; delete props[fieldName];
      return { ...o, customFields: (o.customFields ?? []).filter((f) => f.name !== fieldName), properties: props };
    })}));
  }, [updateScene]);

  const changeCustomFieldType = useCallback((objId: string, fieldName: string, newType: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id !== objId ? o : {
      ...o,
      customFields: (o.customFields ?? []).map((f) => f.name === fieldName ? { ...f, type: newType } : f),
      properties: { ...o.properties, [fieldName]: defaultForType(detectFieldType(newType)) },
    })}));
  }, [updateScene]);

  const renameCustomField = useCallback((objId: string, oldName: string, newName: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => {
      if (o.id !== objId) return o;
      const props = { ...o.properties, [newName]: o.properties[oldName] }; delete props[oldName];
      return { ...o, customFields: (o.customFields ?? []).map((f) => f.name === oldName ? { ...f, name: newName } : f), properties: props };
    })}));
  }, [updateScene]);

  const toggleShowDetails = useCallback((objId: string) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, showDetails: !o.showDetails } : o),
    }));
  }, [updateScene]);

  const toggleShowHeader = useCallback((objId: string) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, showHeader: !(o.showHeader ?? false) } : o),
    }));
  }, [updateScene]);

  const updateZIndex = useCallback((objId: string, v: number) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, zIndex: v } : o),
    }));
  }, [updateScene]);

  const updateShowPins = useCallback((objId: string, v: boolean) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, showPins: v } : o),
    }));
  }, [updateScene]);

  const deleteSelected = useCallback(() => {
    if (!selectedIds.size && !selectedEdgeIds.size) return;
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.filter((o) => !selectedIds.has(o.id)),
      functionCalls: (prev.functionCalls ?? []).filter((f) => !selectedIds.has(f.id)),
      vars: (prev.vars ?? []).filter((v) => !selectedIds.has(v.id)),
      classObjs: (prev.classObjs ?? []).filter((o) => !selectedIds.has(o.id)),
      getProps: (prev.getProps ?? []).filter((n) => !selectedIds.has(n.id)),
      setProps: (prev.setProps ?? []).filter((n) => !selectedIds.has(n.id)),
      fcEdges: (prev.fcEdges ?? []).filter((e) =>
        !selectedEdgeIds.has(e.id) && !selectedIds.has(e.source) && !selectedIds.has(e.target)
      ),
    }));
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
  }, [selectedIds, selectedEdgeIds, updateScene]);

  const cutSelected = useCallback(() => {
    const objs = sceneRef.current.objects.filter((o) => selectedIds.has(o.id));
    if (!objs.length) return;
    setClipboard({ objects: objs });
    updateScene((prev) => ({ ...prev, objects: prev.objects.filter((o) => !selectedIds.has(o.id)) }));
    setSelectedIds(new Set());
  }, [selectedIds, updateScene]);

  const copySelected = useCallback(() => {
    const objs = sceneRef.current.objects.filter((o) => selectedIds.has(o.id));
    if (!objs.length) return;
    setClipboard({ objects: objs });
  }, [selectedIds]);

  const paste = useCallback(() => {
    if (!clipboard) return;
    const count = sceneRef.current.objects.length;
    const newObjs = clipboard.objects.map((o, i) => {
      const t = getTransform(o);
      return { ...o, id: makeId(), transform: { ...t, x: autoTransform(count + i).x, y: autoTransform(count + i).y } };
    });
    updateScene((prev) => ({ ...prev, objects: [...prev.objects, ...newObjs] }));
    setSelectedIds(new Set(newObjs.map((o) => o.id)));
  }, [clipboard, updateScene]);

  const objectIds = useMemo(() => new Set(scene.objects.map((o) => o.id)), [scene.objects]);

  const selectedObject = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return scene.objects.find((o) => o.id === id) ?? null;
  }, [scene.objects, selectedIds]);

  const selectedFc = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return (scene.functionCalls ?? []).find((f) => f.id === id) ?? null;
  }, [scene.functionCalls, selectedIds]);

  const selectedVar = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return (scene.vars ?? []).find((v) => v.id === id) ?? null;
  }, [scene.vars, selectedIds]);

  const selectedGetProp = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return (scene.getProps ?? []).find((n) => n.id === id) ?? null;
  }, [scene.getProps, selectedIds]);

  const selectedSetProp = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return (scene.setProps ?? []).find((n) => n.id === id) ?? null;
  }, [scene.setProps, selectedIds]);

  const selectedFields = useMemo((): FieldDef[] => {
    if (!selectedObject) return [];
    const isCustom = selectedObject.className === 'Unknown' || selectedObject.customFields !== undefined;
    return isCustom ? (selectedObject.customFields ?? []) : (classMap.get(selectedObject.className)?.fields ?? []);
  }, [selectedObject, classMap]);

  useEffect(() => { setSelectedField(null); }, [selectedIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!selectedIds.size && !selectedEdgeIds.size) return;
      e.preventDefault();
      deleteSelected();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, selectedEdgeIds, deleteSelected]);

  const selectedFieldDef = useMemo((): FieldDef | null => {
    if (!selectedField || !selectedObject) return null;
    if (selectedField.objId !== selectedObject.id) return null;
    return selectedFields.find((f) => f.name === selectedField.fieldName) ?? null;
  }, [selectedField, selectedObject, selectedFields]);

  const rfNodes = useMemo((): Node[] => {
    const dashNodes: Node<DashObjectNodeData>[] = scene.objects.map((obj) => {
      const isCustom = obj.className === 'Unknown' || obj.customFields !== undefined;
      const fields: FieldDef[] = isCustom ? (obj.customFields ?? []) : (classMap.get(obj.className)?.fields ?? []);
      const t = getTransform(obj);
      return {
        id: obj.id, type: 'dashObject',
        position: { x: t.x, y: t.y },
        selected: selectedIds.has(obj.id),
        zIndex: obj.zIndex ?? 0,
        data: {
          objectId: obj.id,
          objectName: obj.objectName, className: obj.className, fields, properties: obj.properties,
          transform: t, selected: selectedIds.has(obj.id), userName, isCustom,
          showPins: obj.showPins ?? true,
          onPropertyChange: (field: string, value: DashValue) => updateProperty(obj.id, field, value),
          onObjectNameChange: (name: string) => updateObjectName(obj.id, name),
          onFieldAdd: (name: string, type: string) => addCustomField(obj.id, name, type),
          onFieldRemove: (name: string) => removeCustomField(obj.id, name),
          onFieldTypeChange: (name: string, newType: string) => changeCustomFieldType(obj.id, name, newType),
          onFieldRename: (oldName: string, newName: string) => renameCustomField(obj.id, oldName, newName),
          onResizeDrag: (width: number, height: number) => updateTransform(obj.id, { width, height }),
          showDetails: obj.showDetails ?? false,
          showHeader: obj.showHeader ?? false,
          selectedFieldName: selectedField?.objId === obj.id ? selectedField.fieldName : null,
          onFieldSelect: (fieldName: string | null) => setSelectedField(fieldName ? { objId: obj.id, fieldName } : null),
        },
      };
    });

    const fcNodes: Node<FcNodeData>[] = (functionCalls ?? []).map((fc) => {
      const connectedArgValues: Record<number, unknown> = {};
      for (const edge of (scene.fcEdges ?? []).filter((e) => e.target === fc.id)) {
        const m = edge.targetHandle.match(/^arg_(\d+)$/);
        if (m) {
          const idx = parseInt(m[1]);
          const varNode = vars.find((v) => v.id === edge.source);
          if (varNode?.varValue !== null && varNode?.varValue !== undefined) {
            if (edge.sourceHandle.startsWith('get_')) {
              const field = edge.sourceHandle.slice(4);
              try { connectedArgValues[idx] = (JSON.parse(varNode.varValue) as Record<string, unknown>)[field]; } catch {}
            } else {
              try { connectedArgValues[idx] = JSON.parse(varNode.varValue); } catch { connectedArgValues[idx] = varNode.varValue; }
            }
          }
        }
      }
      // Resolve connectedThisValue from edge with targetHandle === "this"
      const thisEdge = (scene.fcEdges ?? []).find((e) => e.target === fc.id && e.targetHandle === 'this');
      let connectedThisValue: unknown = undefined;
      if (thisEdge) {
        const varSrc = vars.find((v) => v.id === thisEdge.source);
        if (varSrc?.varValue !== null && varSrc?.varValue !== undefined) {
          try { connectedThisValue = JSON.parse(varSrc.varValue); } catch { connectedThisValue = varSrc.varValue; }
        } else {
          const fcSrc = (functionCalls ?? []).find((f) => f.id === thisEdge.source);
          if (fcSrc?.result !== null && fcSrc?.result !== undefined) {
            try { connectedThisValue = JSON.parse(fcSrc.result); } catch { connectedThisValue = fcSrc.result; }
          } else {
            const objSrc = scene.objects.find((o) => o.id === thisEdge.source);
            if (objSrc && thisEdge.sourceHandle === 'value_out') connectedThisValue = objSrc.properties;
          }
        }
      }
      return {
        id: fc.id, type: 'fcNode',
        position: { x: fc.x, y: fc.y },
        selected: selectedIds.has(fc.id),
        data: {
          fcId: fc.id, symbolPath: fc.symbolPath, paramNames: fc.paramNames,
          argOverrides: fc.argOverrides, result: fc.result, error: fc.error,
          running: fcRunning.has(fc.id), connectedArgValues, connectedThisValue,
          selected: selectedIds.has(fc.id),
          pinsFlipped: fc.pinsFlipped ?? false,
          onCall: () => { void callFunctionForNode(fc.id); },
          onArgOverrideChange: (idx: number, val: string) => updateFcArgOverride(fc.id, idx, val),
        } as FcNodeData,
      };
    });

    const varNodes: Node<VarNodeData>[] = vars.map((v) => ({
      id: v.id, type: 'varNode',
      position: { x: v.x, y: v.y },
      selected: selectedIds.has(v.id),
      data: {
        varId: v.id, varName: v.varName, varValue: v.varValue,
        selected: selectedIds.has(v.id),
        pinsFlipped: v.pinsFlipped ?? false,
        onNameChange: (name: string) => updateVarName(v.id, name),
      } as VarNodeData,
    }));

    const classObjs = scene.classObjs ?? [];
    const classObjNodes: Node<ObjNodeData>[] = classObjs.map((obj) => {
      const connectedSetValues: Record<string, unknown> = {};
      for (const edge of (scene.fcEdges ?? []).filter((e) => e.target === obj.id && e.targetHandle.startsWith('set_'))) {
        const field = edge.targetHandle.slice(4);
        const varSrc = vars.find((v) => v.id === edge.source);
        if (varSrc?.varValue !== null && varSrc?.varValue !== undefined) {
          try { connectedSetValues[field] = JSON.parse(varSrc.varValue); } catch { connectedSetValues[field] = varSrc.varValue; }
          continue;
        }
        const fcSrc = (functionCalls ?? []).find((f) => f.id === edge.source);
        if (fcSrc?.result !== null && fcSrc?.result !== undefined) {
          try { connectedSetValues[field] = JSON.parse(fcSrc.result); } catch { connectedSetValues[field] = fcSrc.result; }
        }
      }
      return {
        id: obj.id, type: 'objNode',
        position: { x: obj.x, y: obj.y },
        selected: selectedIds.has(obj.id),
        data: {
          objId: obj.id, className: obj.className, fieldNames: obj.fieldNames,
          instanceValue: obj.instanceValue,
          connectedSetValues, selected: selectedIds.has(obj.id),
          pinsFlipped: obj.pinsFlipped ?? false,
          onApply: () => { applyClassObj(obj.id); },
          onFlip: () => { flipClassObj(obj.id); },
        } as ObjNodeData,
      };
    });

    const getPropNodes: Node<GetPropNodeData>[] = (scene.getProps ?? []).map((n) => ({
      id: n.id, type: 'getPropNode',
      position: { x: n.x, y: n.y },
      selected: selectedIds.has(n.id),
      data: {
        nodeId: n.id, propNameOverride: n.propNameOverride,
        result: n.result, error: n.error,
        selected: selectedIds.has(n.id),
        onRun: () => { runGetProp(n.id); },
        onPropNameChange: (v: string) => { updateGetPropName(n.id, v); },
      } as GetPropNodeData,
    }));

    const setPropNodes: Node<SetPropNodeData>[] = (scene.setProps ?? []).map((n) => ({
      id: n.id, type: 'setPropNode',
      position: { x: n.x, y: n.y },
      selected: selectedIds.has(n.id),
      data: {
        nodeId: n.id, propNameOverride: n.propNameOverride,
        result: n.result, error: n.error,
        selected: selectedIds.has(n.id),
        onRun: () => { runSetProp(n.id); },
        onPropNameChange: (v: string) => { updateSetPropName(n.id, v); },
      } as SetPropNodeData,
    }));

    return [...dashNodes, ...fcNodes, ...varNodes, ...classObjNodes, ...getPropNodes, ...setPropNodes];
  }, [scene.objects, scene.fcEdges, scene.classObjs, scene.getProps, scene.setProps, classMap, selectedIds, selectedField, userName,
      updateProperty, updateObjectName, addCustomField, removeCustomField, changeCustomFieldType, renameCustomField, updateTransform,
      functionCalls, vars, fcRunning, callFunctionForNode, updateFcArgOverride, updateVarName,
      applyClassObj, flipClassObj, runGetProp, runSetProp, updateGetPropName, updateSetPropName]);

  const rfEdges = useMemo((): Edge[] => {
    const propEdges: Edge[] = [];
    for (const obj of scene.objects) {
      for (const [field, val] of Object.entries(obj.properties)) {
        if (typeof val === 'string' && objectIds.has(val))
          propEdges.push({ id: `${obj.id}-${field}-${val}`, source: obj.id, target: val, label: field });
      }
    }
    const flowEdges: Edge[] = (scene.fcEdges ?? []).map((e) => {
      const isExec = e.sourceHandle === 'exec_out' && e.targetHandle === 'exec_in';
      const isSelected = selectedEdgeIds.has(e.id);
      return {
        id: e.id, source: e.source, sourceHandle: e.sourceHandle,
        target: e.target, targetHandle: e.targetHandle,
        selected: isSelected,
        animated: !isExec,
        style: isExec
          ? { stroke: isSelected ? '#ef5350' : '#ffffffbb', strokeWidth: isSelected ? 3 : 2.5, strokeDasharray: '6 3' }
          : { stroke: isSelected ? '#ef5350' : '#81c784', strokeWidth: isSelected ? 2.5 : 1.5 },
        deletable: true,
      };
    });
    return [...propEdges, ...flowEdges];
  }, [scene.objects, scene.fcEdges, objectIds, selectedEdgeIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const posChanges = changes.filter(
      (c) => c.type === 'position' && c.position &&
        Number.isFinite(c.position.x) && Number.isFinite(c.position.y),
    );
    if (posChanges.length > 0) {
      updateScene((prev) => ({
        ...prev,
        objects: prev.objects.map((obj) => {
          const pc = posChanges.find((c) => c.type === 'position' && c.id === obj.id);
          if (pc && pc.type === 'position' && pc.position)
            return { ...obj, transform: { ...getTransform(obj), x: pc.position.x, y: pc.position.y } };
          return obj;
        }),
        functionCalls: (prev.functionCalls ?? []).map((fc) => {
          const pc = posChanges.find((c) => c.type === 'position' && c.id === fc.id);
          if (pc && pc.type === 'position' && pc.position) return { ...fc, x: pc.position.x, y: pc.position.y };
          return fc;
        }),
        vars: (prev.vars ?? []).map((v) => {
          const pc = posChanges.find((c) => c.type === 'position' && c.id === v.id);
          if (pc && pc.type === 'position' && pc.position) return { ...v, x: pc.position.x, y: pc.position.y };
          return v;
        }),
        classObjs: (prev.classObjs ?? []).map((o) => {
          const pc = posChanges.find((c) => c.type === 'position' && c.id === o.id);
          if (pc && pc.type === 'position' && pc.position) return { ...o, x: pc.position.x, y: pc.position.y };
          return o;
        }),
        getProps: (prev.getProps ?? []).map((n) => {
          const pc = posChanges.find((c) => c.type === 'position' && c.id === n.id);
          if (pc && pc.type === 'position' && pc.position) return { ...n, x: pc.position.x, y: pc.position.y };
          return n;
        }),
        setProps: (prev.setProps ?? []).map((n) => {
          const pc = posChanges.find((c) => c.type === 'position' && c.id === n.id);
          if (pc && pc.type === 'position' && pc.position) return { ...n, x: pc.position.x, y: pc.position.y };
          return n;
        }),
      }));
    }
    const selChanges = changes.filter((c) => c.type === 'select');
    if (selChanges.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of selChanges) { if (c.type === 'select') { if (c.selected) next.add(c.id); else next.delete(c.id); } }
        return next;
      });
    }
  }, [updateScene]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removedIds.length > 0) {
      updateScene((prev) => ({ ...prev, fcEdges: (prev.fcEdges ?? []).filter((e) => !removedIds.includes(e.id)) }));
      setSelectedEdgeIds((prev) => { const next = new Set(prev); removedIds.forEach((id) => next.delete(id)); return next; });
    }
    const selChanges = changes.filter((c) => c.type === 'select');
    if (selChanges.length > 0) {
      setSelectedEdgeIds((prev) => {
        const next = new Set(prev);
        for (const c of selChanges) { if (c.type === 'select') { if (c.selected) next.add(c.id); else next.delete(c.id); } }
        return next;
      });
    }
  }, [updateScene]);

  const onConnect = useCallback((connection: Connection) => {
    let { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !target) return;
    // Normalize exec edge direction — user may drag from either end in Loose mode
    if (sourceHandle === 'exec_in' && targetHandle === 'exec_out') {
      [source, sourceHandle, target, targetHandle] = [target, 'exec_out', source, 'exec_in'];
    }
    const fcIds = new Set((sceneRef.current.functionCalls ?? []).map((f) => f.id));
    const varIds = new Set((sceneRef.current.vars ?? []).map((v) => v.id));
    const classObjIds = new Set((sceneRef.current.classObjs ?? []).map((o) => o.id));
    const getPropIds = new Set((sceneRef.current.getProps ?? []).map((n) => n.id));
    const setPropIds = new Set((sceneRef.current.setProps ?? []).map((n) => n.id));
    const isKnownSrc = fcIds.has(source) || varIds.has(source) || classObjIds.has(source) || getPropIds.has(source) || setPropIds.has(source);
    const isKnownTgt = fcIds.has(target) || varIds.has(target) || classObjIds.has(target) || getPropIds.has(target) || setPropIds.has(target);
    if (isKnownSrc && isKnownTgt) {
      const newEdge: FcEdge = { id: `fce_${makeId()}`, source, sourceHandle: sourceHandle ?? '', target, targetHandle: targetHandle ?? '' };
      updateScene((prev) => ({ ...prev, fcEdges: [...(prev.fcEdges ?? []), newEdge] }));
    }
  }, [updateScene]);

  const filteredObjects = useMemo(() => {
    if (!searchText) return scene.objects;
    const q = searchText.toLowerCase();
    return scene.objects.filter((o) => o.objectName.toLowerCase().includes(q) || o.className.toLowerCase().includes(q));
  }, [scene.objects, searchText]);

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds((prev) => {
      if (multi) { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }
      return new Set([id]);
    });
  }, []);

  const flyTo = useCallback((objId: string) => {
    const obj = sceneRef.current.objects.find((o) => o.id === objId);
    if (!obj) return;
    const t = getTransform(obj);
    const cx = t.x + (t.width > 0 ? t.width / 2 : 100);
    const cy = t.y + (t.height > 0 ? t.height / 2 : 60);
    setCenter(cx, cy, { zoom: 1.2, duration: 450 });
  }, [setCenter]);

  const showTypes = visiblePanels.includes('types');
  const showScene = visiblePanels.includes('scene');
  const showProperties = visiblePanels.includes('properties');
  const showDataSource = visiblePanels.includes('data');

  if (loading) return <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={28} /></Box>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, bgcolor: 'background.paper' }}>
        <ToggleButtonGroup size="small" value={visiblePanels} onChange={(_, val: string[]) => setVisiblePanels(val)}>
          <ToggleButton value="data" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <StorageIcon sx={{ fontSize: 16 }} />
            Data
          </ToggleButton>
          <ToggleButton value="types" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <ViewSidebarIcon sx={{ fontSize: 16, transform: 'scaleX(-1)' }} />
            Types
          </ToggleButton>
          <ToggleButton value="scene" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <ViewListIcon sx={{ fontSize: 16 }} />
            Scene
          </ToggleButton>
          <ToggleButton value="properties" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <TuneIcon sx={{ fontSize: 16 }} />
            Properties
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {(selectedIds.size > 0 || selectedEdgeIds.size > 0) && (
          <Tooltip title="Delete selected (nodes + connections)">
            <IconButton size="small" color="error" onClick={deleteSelected} sx={{ p: 0.5 }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Button size="small" variant="outlined" onClick={() => { setImportError(null); setShowImportDialog(true); }}
          sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>Import UML</Button>
        <Button size="small" variant="outlined" onClick={saveNow}
          sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>Save</Button>
        <Tooltip title={`Saves only objects + properties to ${filePath.replace(/\.[^./]+$/, '')}.data.json`}>
          <Button size="small" variant="outlined" onClick={saveRaw}
            sx={{ fontSize: 11, py: 0.25, textTransform: 'none', color: 'text.secondary' }}>Save Raw</Button>
        </Tooltip>
      </Box>

      {/* ── Main area ── */}
      <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── DataSource ── */}
        {showDataSource && (
          <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <DataSourcePanel
              sources={dataSources}
              loadedData={dsData}
              onNew={() => setDsPickerOpen(true)}
              onDelete={removeDataSource}
              onReload={(id) => { void reloadDataSource(id); }}
            />
          </Box>
        )}

        {/* ── Types ── */}
        {showTypes && (
          <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Types</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {/* Built-in group */}
              <Box sx={{ px: 1, pt: 0.75, pb: 0.25 }}>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>Built-in</Typography>
              </Box>
              <List dense disablePadding>
                {BUILT_IN_CLASSES.map((cls) => (
                  <ListItemButton key={cls.name} onClick={() => createObject(cls)} sx={{ py: 0.375, px: 1.5 }}>
                    <Box sx={{ mr: 0.75, display: 'flex', alignItems: 'center' }}>
                      {cls.name === 'Unknown' ? <HelpOutlineIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                        : cls.name === 'MarkdownView' ? <ArticleIcon sx={{ fontSize: 13, color: '#4fc3f7' }} />
                        : cls.name === 'ObjectRef' ? <AccountTreeIcon sx={{ fontSize: 13, color: '#7c4dff' }} />
                        : <CircleIcon sx={{ fontSize: 9, color: '#4fc3f7' }} />}
                    </Box>
                    <ListItemText
                      primary={cls.name}
                      secondary={
                        cls.name === 'Unknown' ? 'dynamic fields'
                        : cls.name === 'MarkdownView' ? 'renders markdown content'
                        : cls.name === 'ObjectRef' ? 'JSON object or array'
                        : cls.fields.map((f) => f.name).join(', ')
                      }
                      primaryTypographyProps={{ fontSize: 12 }}
                      secondaryTypographyProps={{ fontSize: 9, noWrap: true, fontStyle: cls.name === 'Unknown' ? 'italic' : 'normal' }}
                    />
                  </ListItemButton>
                ))}
              </List>
              {/* UML sources */}
              {umlSources.map((src) => {
                const expanded = expandedSources.has(src.id);
                return (
                  <Box key={src.id}>
                    <Divider />
                    <ListItemButton
                      onContextMenu={(e) => { e.preventDefault(); setSourceCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, sourceId: src.id }); }}
                      onClick={() => setExpandedSources((prev) => { const n = new Set(prev); expanded ? n.delete(src.id) : n.add(src.id); return n; })}
                      sx={{ py: 0.5, px: 1, gap: 0.5 }}>
                      {expanded ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} /> : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />}
                      <AbcIcon sx={{ fontSize: 14, color: '#4fc3f7', flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</Typography>
                    </ListItemButton>
                    {expanded && (
                      <List dense disablePadding>
                        {src.classes.length === 0 && (
                          <Typography sx={{ fontSize: 10, color: 'text.disabled', px: 3, py: 0.5, fontStyle: 'italic' }}>No classes</Typography>
                        )}
                        {src.classes.map((cls) => (
                          <ListItemButton key={cls.name} onClick={() => createObject(cls)} sx={{ py: 0.375, pl: 3, pr: 1 }}>
                            <Box sx={{ mr: 0.75, display: 'flex', alignItems: 'center' }}>
                              {cls.kind === 'abstract' ? <AbcIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                                : <CircleIcon sx={{ fontSize: 9, color: '#4fc3f7' }} />}
                            </Box>
                            <ListItemText
                              primary={cls.name}
                              secondary={cls.fields.map((f) => f.name).join(', ')}
                              primaryTypographyProps={{ fontSize: 12 }}
                              secondaryTypographyProps={{ fontSize: 9, noWrap: true }}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* ── Scene ── */}
        {showScene && (
          <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Scene</Typography>
              <Tooltip title="Search"><IconButton size="small" onClick={() => setShowSearch((v) => !v)}><SearchIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Box>
            {showSearch && (
              <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <TextField size="small" placeholder="Filter…" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  autoFocus fullWidth inputProps={{ style: { fontSize: 11 } }} />
              </Box>
            )}
            <Box sx={{ flex: 1, overflow: 'auto' }} onContextMenu={(e) => openSceneCtx(e, null)}>
              {filteredObjects.length === 0 && (
                <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1.5, fontStyle: 'italic' }}>
                  {scene.objects.length === 0 ? 'Right-click to add' : 'No matches'}
                </Typography>
              )}
              <List dense disablePadding>
                {filteredObjects.map((obj) => (
                  <ListItemButton key={obj.id} selected={selectedIds.has(obj.id)}
                    onClick={(e) => toggleSelect(obj.id, e.ctrlKey || e.metaKey)}
                    onDoubleClick={() => flyTo(obj.id)}
                    onContextMenu={(e) => openSceneCtx(e, obj.id)}
                    sx={{ py: 0.5, px: 1.5, '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText' }, '&.Mui-selected:hover': { bgcolor: 'primary.dark' } }}>
                    <ListItemText
                      primary={<Typography component="span" sx={{ fontSize: 12 }}>
                        <strong>{obj.objectName}</strong>
                        <Typography component="span" sx={{ fontSize: 11, color: selectedIds.has(obj.id) ? 'inherit' : 'text.secondary' }}> :{obj.className}</Typography>
                      </Typography>}
                    />
                  </ListItemButton>
                ))}
                {(scene.functionCalls ?? []).map((fc) => (
                  <ListItemButton key={fc.id} selected={selectedIds.has(fc.id)}
                    onClick={(e) => toggleSelect(fc.id, e.ctrlKey || e.metaKey)}
                    sx={{ py: 0.5, px: 1.5, '&.Mui-selected': { bgcolor: '#7c4dff', color: '#fff' }, '&.Mui-selected:hover': { bgcolor: '#6939e0' } }}>
                    <ListItemText
                      primary={<Typography component="span" sx={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CodeIcon sx={{ fontSize: 13, color: selectedIds.has(fc.id) ? '#fff' : '#ce93d8' }} />
                        <strong>{fc.symbolPath.split('.').pop()}()</strong>
                        <Typography component="span" sx={{ fontSize: 10, color: selectedIds.has(fc.id) ? 'rgba(255,255,255,0.7)' : 'text.disabled', fontStyle: 'italic' }}> fn</Typography>
                      </Typography>}
                    />
                  </ListItemButton>
                ))}
                {(scene.vars ?? []).map((v) => (
                  <ListItemButton key={v.id} selected={selectedIds.has(v.id)}
                    onClick={(e) => toggleSelect(v.id, e.ctrlKey || e.metaKey)}
                    sx={{ py: 0.5, px: 1.5, '&.Mui-selected': { bgcolor: '#388e3c', color: '#fff' }, '&.Mui-selected:hover': { bgcolor: '#2e7d32' } }}>
                    <ListItemText
                      primary={<Typography component="span" sx={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <StorageIcon sx={{ fontSize: 13, color: selectedIds.has(v.id) ? '#fff' : '#81c784' }} />
                        <strong>{v.varName}</strong>
                        <Typography component="span" sx={{ fontSize: 10, color: selectedIds.has(v.id) ? 'rgba(255,255,255,0.7)' : 'text.disabled', fontStyle: 'italic' }}> var</Typography>
                      </Typography>}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          </Box>
        )}

        {/* ── Canvas ── */}
        <Box sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
          {error && <Alert severity="error" onClose={() => setError(null)} sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 10 }}>{error}</Alert>}
          <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            fitView minZoom={0.2} maxZoom={3} style={{ width: '100%', height: '100%' }}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={null}
            connectionRadius={40}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={handleCanvasDrop}>
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
            {!isMobile && <MiniMap />}
          </ReactFlow>
        </Box>

        {/* ── Properties ── */}
        {showProperties && (
          <Box sx={{ width: 220, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Properties</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {selectedFc ? (
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 9, color: '#ce93d8', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>«FunctionCall»</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', mb: 1, color: '#ce93d8', wordBreak: 'break-all' }}>{selectedFc.symbolPath}()</Typography>
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Position</Typography>
                  <TransformField label="X" value={selectedFc.x} onChange={(v) => updateScene((p) => ({ ...p, functionCalls: (p.functionCalls ?? []).map((f) => f.id === selectedFc.id ? { ...f, x: v } : f) }))} />
                  <TransformField label="Y" value={selectedFc.y} onChange={(v) => updateScene((p) => ({ ...p, functionCalls: (p.functionCalls ?? []).map((f) => f.id === selectedFc.id ? { ...f, y: v } : f) }))} />
                  {selectedFc.paramNames.length > 0 && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Parameters</Typography>
                      {selectedFc.paramNames.map((param, i) => (
                        <Box key={i} sx={{ mb: 0.75 }}>
                          <Typography sx={{ fontSize: 10, color: '#ce93d888', fontFamily: 'monospace', mb: 0.25 }}>{param}</Typography>
                          <TextField size="small" variant="standard" fullWidth placeholder="—"
                            value={selectedFc.argOverrides[i] ?? ''}
                            onChange={(e) => updateFcArgOverride(selectedFc.id, i, e.target.value)}
                            inputProps={{ style: { fontSize: 11, fontFamily: 'monospace' } }} />
                        </Box>
                      ))}
                    </>
                  )}
                  {selectedFc.result !== null && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Last result</Typography>
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#81c784', wordBreak: 'break-all' }}>{selectedFc.result}</Typography>
                    </>
                  )}
                  {selectedFc.error && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#ef5350', wordBreak: 'break-all' }}>{selectedFc.error}</Typography>
                    </>
                  )}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Flip pins</Typography>
                    <Switch size="small" checked={selectedFc.pinsFlipped ?? false}
                      onChange={(_, checked) => updateScene((p) => ({ ...p, functionCalls: (p.functionCalls ?? []).map((f) => f.id === selectedFc.id ? { ...f, pinsFlipped: checked } : f) }))} />
                  </Box>
                </Box>
              ) : selectedVar ? (
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 9, color: '#81c784', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>«Var»</Typography>
                  <TextField size="small" variant="standard" fullWidth
                    value={selectedVar.varName}
                    onChange={(e) => updateVarName(selectedVar.id, e.target.value)}
                    inputProps={{ style: { fontSize: 13, fontWeight: 700 } }}
                    sx={{ mb: 1 }} />
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Position</Typography>
                  <TransformField label="X" value={selectedVar.x} onChange={(v) => updateScene((p) => ({ ...p, vars: (p.vars ?? []).map((vr) => vr.id === selectedVar.id ? { ...vr, x: v } : vr) }))} />
                  <TransformField label="Y" value={selectedVar.y} onChange={(v) => updateScene((p) => ({ ...p, vars: (p.vars ?? []).map((vr) => vr.id === selectedVar.id ? { ...vr, y: v } : vr) }))} />
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>Value</Typography>
                    <Button size="small" variant="outlined"
                      onClick={() => { setVarInitTargetId(selectedVar.id); setVarInitDialogOpen(true); }}
                      sx={{ fontSize: 10, py: 0.25, px: 1, minWidth: 0, borderColor: '#81c78466', color: '#81c784',
                        '&:hover': { borderColor: '#81c784', bgcolor: '#81c78411' } }}>
                      {selectedVar.varValue !== null ? 'Change…' : 'Set…'}
                    </Button>
                  </Box>
                  {selectedVar.varValue !== null && selectedVar.varValue !== undefined && (
                    <Box sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: 'rgba(129,199,132,0.06)', border: '1px solid rgba(129,199,132,0.15)', mb: 0.5 }}>
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#81c784', wordBreak: 'break-all' }}>{selectedVar.varValue}</Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Flip pins</Typography>
                    <Switch size="small" checked={selectedVar.pinsFlipped ?? false}
                      onChange={(_, checked) => updateScene((p) => ({ ...p, vars: (p.vars ?? []).map((vr) => vr.id === selectedVar.id ? { ...vr, pinsFlipped: checked } : vr) }))} />
                  </Box>
                </Box>
              ) : selectedGetProp ? (
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 9, color: '#4dd0e1', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>«GetProp»</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', mb: 1, color: '#4dd0e1' }}>Get property value</Typography>
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Property name</Typography>
                  <TextField size="small" variant="standard" fullWidth placeholder="propName"
                    value={selectedGetProp.propNameOverride}
                    onChange={(e) => updateGetPropName(selectedGetProp.id, e.target.value)}
                    inputProps={{ style: { fontSize: 12, fontFamily: 'monospace', color: '#4dd0e1' } }}
                    sx={{ mb: 1 }} />
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Position</Typography>
                  <TransformField label="X" value={selectedGetProp.x} onChange={(v) => updateScene((p) => ({ ...p, getProps: (p.getProps ?? []).map((n) => n.id === selectedGetProp.id ? { ...n, x: v } : n) }))} />
                  <TransformField label="Y" value={selectedGetProp.y} onChange={(v) => updateScene((p) => ({ ...p, getProps: (p.getProps ?? []).map((n) => n.id === selectedGetProp.id ? { ...n, y: v } : n) }))} />
                  {selectedGetProp.result !== null && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Last result</Typography>
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#81c784', wordBreak: 'break-all' }}>{selectedGetProp.result}</Typography>
                    </>
                  )}
                  {selectedGetProp.error && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#ef5350', wordBreak: 'break-all' }}>{selectedGetProp.error}</Typography>
                    </>
                  )}
                </Box>
              ) : selectedSetProp ? (
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 9, color: '#ffb74d', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>«SetProp»</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', mb: 1, color: '#ffb74d' }}>Set property value</Typography>
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Property name</Typography>
                  <TextField size="small" variant="standard" fullWidth placeholder="propName"
                    value={selectedSetProp.propNameOverride}
                    onChange={(e) => updateSetPropName(selectedSetProp.id, e.target.value)}
                    inputProps={{ style: { fontSize: 12, fontFamily: 'monospace', color: '#ffb74d' } }}
                    sx={{ mb: 1 }} />
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Position</Typography>
                  <TransformField label="X" value={selectedSetProp.x} onChange={(v) => updateScene((p) => ({ ...p, setProps: (p.setProps ?? []).map((n) => n.id === selectedSetProp.id ? { ...n, x: v } : n) }))} />
                  <TransformField label="Y" value={selectedSetProp.y} onChange={(v) => updateScene((p) => ({ ...p, setProps: (p.setProps ?? []).map((n) => n.id === selectedSetProp.id ? { ...n, y: v } : n) }))} />
                  {selectedSetProp.result !== null && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Last result</Typography>
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#81c784', wordBreak: 'break-all' }}>{selectedSetProp.result}</Typography>
                    </>
                  )}
                  {selectedSetProp.error && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#ef5350', wordBreak: 'break-all' }}>{selectedSetProp.error}</Typography>
                    </>
                  )}
                </Box>
              ) : (
                <PropertiesPanel
                  object={selectedObject}
                  fields={selectedFields}
                  userName={userName}
                  onObjectNameChange={updateObjectName}
                  onTransformChange={updateTransform}
                  onPropertyChange={updateProperty}
                  showDetails={selectedObject?.showDetails ?? false}
                  onToggleShowDetails={() => { if (selectedObject) toggleShowDetails(selectedObject.id); }}
                  showHeader={selectedObject?.showHeader ?? false}
                  onToggleShowHeader={() => { if (selectedObject) toggleShowHeader(selectedObject.id); }}
                  showPins={selectedObject?.showPins ?? true}
                  onToggleShowPins={() => { if (selectedObject) updateShowPins(selectedObject.id, !(selectedObject.showPins ?? true)); }}
                  zIndex={selectedObject?.zIndex ?? 0}
                  onZIndexChange={updateZIndex}
                  selectedFieldDef={selectedFieldDef}
                  isCustom={selectedObject?.className === 'Unknown' || selectedObject?.customFields !== undefined}
                  onFieldTypeChange={(fieldName, newType) => { if (selectedObject) changeCustomFieldType(selectedObject.id, fieldName, newType); }}
                />
              )}
            </Box>
          </Box>
        )}

      </Box>

      {/* New-object submenu (used from within scene context menu) */}
      <Menu anchorEl={newMenuAnchor} open={Boolean(newMenuAnchor)} onClose={() => setNewMenuAnchor(null)} MenuListProps={{ dense: true }}>
        {classes.map((cls) => (
          <MenuItem key={cls.name} onClick={() => { createObject(cls); setNewMenuAnchor(null); closeSceneCtx(); }} sx={{ fontSize: 13 }}>{cls.name}</MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => {
          const pos = sceneCtxMenu ? screenToFlowPosition({ x: sceneCtxMenu.mouseX, y: sceneCtxMenu.mouseY }) : { x: 80, y: 80 };
          createVar(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <StorageIcon sx={{ fontSize: 16, color: '#81c784' }} />Var
        </MenuItem>
        <MenuItem onClick={() => {
          const pos = sceneCtxMenu ? screenToFlowPosition({ x: sceneCtxMenu.mouseX, y: sceneCtxMenu.mouseY }) : { x: 80, y: 80 };
          createGetProp(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <ArrowUpwardIcon sx={{ fontSize: 16, color: '#4dd0e1' }} />GetProp
        </MenuItem>
        <MenuItem onClick={() => {
          const pos = sceneCtxMenu ? screenToFlowPosition({ x: sceneCtxMenu.mouseX, y: sceneCtxMenu.mouseY }) : { x: 80, y: 80 };
          createSetProp(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <ArrowDownwardIcon sx={{ fontSize: 16, color: '#ffb74d' }} />SetProp
        </MenuItem>
      </Menu>

      {/* Scene context menu */}
      <Menu
        open={Boolean(sceneCtxMenu)}
        onClose={closeSceneCtx}
        anchorReference="anchorPosition"
        anchorPosition={sceneCtxMenu ? { top: sceneCtxMenu.mouseY, left: sceneCtxMenu.mouseX } : undefined}
        MenuListProps={{ dense: true }}
      >
        <MenuItem onClick={(e) => { setNewMenuAnchor(e.currentTarget); }} sx={{ fontSize: 13, gap: 1 }}>
          <AddIcon fontSize="small" />New…
        </MenuItem>
        <Divider />
        <MenuItem disabled={!selectedIds.size} onClick={() => { cutSelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <ContentCutIcon fontSize="small" />Cut
        </MenuItem>
        <MenuItem disabled={!selectedIds.size} onClick={() => { copySelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <ContentCopyIcon fontSize="small" />Copy
        </MenuItem>
        <MenuItem disabled={!clipboard} onClick={() => { paste(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <ContentPasteIcon fontSize="small" />Paste
        </MenuItem>
        <Divider />
        <MenuItem disabled={!selectedIds.size} onClick={() => { deleteSelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1, color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" />Delete
        </MenuItem>
      </Menu>

      {/* UML source context menu */}
      <Menu
        open={Boolean(sourceCtxMenu)}
        onClose={() => setSourceCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={sourceCtxMenu ? { top: sourceCtxMenu.mouseY, left: sourceCtxMenu.mouseX } : undefined}
        MenuListProps={{ dense: true }}
      >
        <MenuItem onClick={() => { if (sourceCtxMenu) { void reloadUmlSource(sourceCtxMenu.sourceId); } setSourceCtxMenu(null); }} sx={{ fontSize: 13, gap: 1 }}>
          <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />Reload
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (sourceCtxMenu) removeUmlSource(sourceCtxMenu.sourceId); setSourceCtxMenu(null); }} sx={{ fontSize: 13, gap: 1, color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" />Remove
        </MenuItem>
      </Menu>

      {/* Var init dialog */}
      <VarInitDialog
        open={varInitDialogOpen}
        currentJson={(scene.vars ?? []).find((v) => v.id === varInitTargetId)?.varValue ?? null}
        onConfirm={(json) => {
          if (varInitTargetId) updateScene((p) => ({ ...p, vars: (p.vars ?? []).map((vr) => vr.id === varInitTargetId ? { ...vr, varValue: json } : vr) }));
          setVarInitDialogOpen(false);
        }}
        onClose={() => setVarInitDialogOpen(false)}
      />

      {/* Import UML dialog */}
      <UmlImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        userName={userName}
        onImport={importUmlSource}
        loading={importPathLoading}
        importError={importError}
      />

      {/* DataSource file picker */}
      {dsPickerOpen && (
        <FilePickerDialog open onClose={() => setDsPickerOpen(false)}
          userName={userName} currentPath=""
          filterExt=".json,.js"
          onSelect={(p) => { void addDataSource(p); setDsPickerOpen(false); }} />
      )}
    </Box>
  );
};

const DashEditorPanel: React.FC<DashEditorPanelProps> = (props) => (
  <ReactFlowProvider><DashEditorInner {...props} /></ReactFlowProvider>
);

export default DashEditorPanel;
