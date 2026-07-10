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
  SelectionMode,
  useReactFlow,
  useStoreApi,
  useViewport,
  useStore,
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
  Tabs,
  Tab,
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
  Checkbox,
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
import WidgetsIcon from '@mui/icons-material/Widgets';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
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
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import BoltIcon from '@mui/icons-material/Bolt';
import StorageIcon from '@mui/icons-material/Storage';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
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
import CropFreeIcon from '@mui/icons-material/CropFree';
import PanToolIcon from '@mui/icons-material/PanTool';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import GridViewIcon from '@mui/icons-material/GridView';
import TerminalIcon from '@mui/icons-material/Terminal';
import ClearAllIcon from '@mui/icons-material/ClearAll';
// MdEditor (TipTap + wszystkie customowe rozszerzenia: CadViewEmbed, EventBlock,
// InfoMark, PluginScript, …) jest ciężki — ładujemy go leniwie, tylko gdy scena
// faktycznie zawiera blok MarkdownView renderowany jako bogaty viewer.
const MdEditor = React.lazy(() => import('../../components/mdeditor/MdEditor'));
import { PdfViewContent, usePdfNumPages, invalidatePdfCache, type DocView } from './PdfView';
import { ShapeNode, defaultShapeTransform, defaultShapeProps, type ShapeType } from './ShapeNode';
import { DjvuViewContent, useDjvuNumPages, invalidateDjvuCache } from './DjvuView';
import { PyodideRuntime, emptyPyodideConfig, type PyodideProgress } from '../../modules/pyodide/PyodideRuntime';
import { PyodideLoadingOverlay } from '../../modules/pyodide/PyodideLoadingOverlay';
import { PYODIDE_BUILTIN_PACKAGES } from '../../modules/pyodide/builtinPackages';

// ─── Types ───────────────────────────────────────────────────────────────────

// Modele danych bloczków sceny dash przeniesione do @mhersztowski/core (core/models/DashModel).
import type {
  DashValue, QFieldType, QObjectRefValue, FieldDef, DashTransform, DashObject,
  HandlerFn, LegacyDashObject, DataSourceEntry, FunctionCallObject, VarObject,
  FcEdge, ClassObjItem, GetPropObject, SetPropObject, DashScene,
  UmlMember, UmlClassDef, UmlSource,
} from '@mhersztowski/core';
import { TextEditorWorkspace } from '@mhersztowski/texteditor';

const FIELD_TYPES: QFieldType[] = ['QString', 'QNumber', 'QFilePath', 'QObjectRef', 'QChildsObjectRef', 'QIcon', 'QImage', 'QArray', 'QMap'];

const isObjectRef = (v: DashValue): v is QObjectRefValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'filePath' in v && 'objectPath' in v;

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

import { useNotification } from '../../modules/notification';
import { useAlliApi } from '../../modules/automate/engine/useAlliApi';
import type { AutomateSystemApiInterface } from '../../modules/automate/engine/AutomateSystemApi';
import { loadLibrary } from '../../components/mdeditor/extensions/automateLibraries';
import { DashJsonPanel } from './DashJsonPanel';
import { ensureQtLib, buildQtWidget } from '../../modules/qtui/qtLib';
import type { QtUiScene, QtWidgetNode as QtUiWidgetNode } from '../../modules/qtui/QtUiTypes';

// MinisQt (core/browser/qt) widget types offered in Scene → New → Qt Widget.
// Each entry seeds a `qt-widget` DashObject with a sensible default size + props.
const QT_WIDGETS: { type: string; w: number; h: number; props: Record<string, DashValue> }[] = [
  { type: 'QPushButton',    w: 120, h: 32,  props: { text: 'Button' } },
  { type: 'QToolButton',    w: 40,  h: 40,  props: { text: '…' } },
  { type: 'QRadioButton',   w: 120, h: 24,  props: { text: 'Radio', checked: false } },
  { type: 'QCheckBox',      w: 120, h: 24,  props: { text: 'CheckBox', checked: false } },
  { type: 'QLabel',         w: 100, h: 24,  props: { text: 'Label' } },
  { type: 'QLineEdit',      w: 160, h: 28,  props: { text: '' } },
  { type: 'QTextEdit',      w: 200, h: 120, props: {} },
  { type: 'QComboBox',      w: 140, h: 28,  props: {} },
  { type: 'QSlider',        w: 160, h: 28,  props: { min: 0, max: 100, value: 50 } },
  { type: 'QDial',          w: 80,  h: 80,  props: { min: 0, max: 100, value: 30 } },
  { type: 'QScrollBar',     w: 160, h: 16,  props: { min: 0, max: 100, value: 0 } },
  { type: 'QSpinBox',       w: 100, h: 28,  props: { min: 0, max: 100, value: 0 } },
  { type: 'QDoubleSpinBox', w: 110, h: 28,  props: { min: 0, max: 100, value: 0 } },
  { type: 'QProgressBar',   w: 180, h: 22,  props: { min: 0, max: 100, value: 60 } },
  { type: 'QGroupBox',      w: 200, h: 140, props: { text: 'Group' } },
  { type: 'QFrame',         w: 160, h: 100, props: {} },
  { type: 'QListWidget',    w: 160, h: 140, props: {} },
  { type: 'QTabWidget',     w: 220, h: 160, props: {} },
  { type: 'QStackedWidget', w: 220, h: 160, props: {} },
  { type: 'QScrollArea',    w: 200, h: 160, props: {} },
  { type: 'QInkCanvas',     w: 220, h: 160, props: {} },
  { type: 'QWidget',        w: 160, h: 120, props: {} },
];

interface ConsoleEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  fcLabel?: string;
  ts: number;
}

const LEVEL_COLORS: Record<ConsoleEntry['level'], string> = {
  log: 'text.primary',
  info: 'info.light',
  warn: 'warning.main',
  error: 'error.main',
  debug: 'text.secondary',
};

const argsToStr = (args: unknown[]): string =>
  args.map((a) => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
  }).join(' ');

type TEWProps = React.ComponentProps<typeof TextEditorWorkspace>;
interface DashEditorPanelProps {
  userName: string;
  filePath: string;
  // Opcjonalny kompleksowy edytor (TextEditorWorkspace) jako panel po prawej —
  // te same instancje FS/pluginów co panel Drive (przekazywane z DrivePage).
  workspaceFs?: TEWProps['provider'] | null;
  workspaceProjectDeps?: TEWProps['projectDeps'];
  workspaceExtraPlugins?: TEWProps['extraPlugins'];
  workspaceInitialPath?: string;
}

// Jednolita pozycja drzewa SCENE — obejmuje WSZYSTKIE typy bloczków (object/var/fc/…),
// dzięki czemu każdy da się zgrupować pod group (a grupy zagnieżdżać).
type UTreeItemType = 'object' | 'var' | 'fc' | 'classObj' | 'getProp' | 'setProp';
interface UTreeItem {
  id: string;
  parentId?: string;
  type: UTreeItemType;
  kind?: 'group' | 'qt-widget' | 'shape';   // tylko dla type==='object'
  name: string;
  sub?: string;                    // className / sufiks (fn/var/obj/get/set)
}

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

// ─── Transformy lokalne (scene version 2) ─────────────────────────────────────
// transform.{x,y} obiektu z parentId jest LOKALNY względem globalnej pozycji
// rodzica. Global = suma pozycji łańcucha rodziców + lokalny transform.
// Akumulujemy tylko x/y (bez dziedziczenia scale/rot rodzica — ograniczenie v1).
// qt-widget jako rodzic renderuje dzieci we własnym reżimie (real Qt parent) —
// tej gałęzi NIE akumulujemy (pozostaje jak dziś).
const MAX_PARENT_DEPTH = 64; // bezpiecznik anti-cykl

/** Globalna pozycja (x,y) rodzica o danym id — suma łańcucha do korzenia. */
const getParentGlobal = (
  objects: DashObject[],
  parentId: string | undefined,
): { x: number; y: number } => {
  let x = 0, y = 0;
  let cur = parentId;
  let depth = 0;
  while (cur && depth < MAX_PARENT_DEPTH) {
    const p = objects.find((o) => o.id === cur);
    if (!p || p.kind === 'qt-widget') break;
    const t = getTransform(p);
    x += t.x; y += t.y;
    cur = p.parentId;
    depth++;
  }
  return { x, y };
};

/** Globalna pozycja (x,y) obiektu DashObject = rodzic-global + lokalny transform. */
const getGlobalXY = (
  objects: DashObject[],
  obj: DashObject & { x?: number; y?: number },
): { x: number; y: number } => {
  const t = getTransform(obj);
  const g = getParentGlobal(objects, obj.parentId);
  return { x: g.x + t.x, y: g.y + t.y };
};

/** Globalna pozycja (x,y) węzła płaskiego (fc/var/classObj/getProp/setProp). */
const getFlatGlobalXY = (
  objects: DashObject[],
  node: { x: number; y: number; parentId?: string },
): { x: number; y: number } => {
  const g = getParentGlobal(objects, node.parentId);
  return { x: g.x + node.x, y: g.y + node.y };
};

/** Konwersja pozycji GLOBALNEJ na LOKALNĄ względem rodzica o danym id. */
const toLocalXY = (
  objects: DashObject[],
  parentId: string | undefined,
  gx: number,
  gy: number,
): { x: number; y: number } => {
  const g = getParentGlobal(objects, parentId);
  return { x: gx - g.x, y: gy - g.y };
};

const STYLED_TAB_H = 30; // wysokość paska zakładek kontenera Tab

/** Wynik layoutu grup stylizowanych (Tab/Table) — współdzielony przez builder RF
 *  (nadpisania pozycji/hidden) i logikę dropu (hosty = panele, nie kontener). */
interface StyledLayout {
  styledPos: Map<string, { x: number; y: number }>;  // nadpisane pozycje (panele + poddrzewa)
  styledHidden: Set<string>;                          // ukryte (nieaktywne zakładki / komórki poza siatką)
  styledPanel: Set<string>;                           // grupy będące panelem (bez ramki/nagłówka)
  containerIds: Set<string>;                          // grupy tab/table (nie są bezpośrednim hostem dropu)
  panelOrigin: Map<string, { x: number; y: number }>; // wyświetlany origin panelu (global)
  dropRects: Array<{ id: string; x: number; y: number; w: number; h: number }>; // regiony paneli do hit-testu dropu
  clipBox: Map<string, { x: number; y: number; w: number; h: number }>; // prostokąt klipowania (global) dla dzieci grup z clip=true
}

/** Oblicz layout wszystkich grup stylizowanych (Tab/Table) w scenie. */
const computeStyledLayout = (
  objects: DashObject[],
  flats: Array<{ id: string; x: number; y: number; parentId?: string }>,
): StyledLayout => {
  const styledPos = new Map<string, { x: number; y: number }>();
  const styledHidden = new Set<string>();
  const styledPanel = new Set<string>();
  const containerIds = new Set<string>();
  const panelOrigin = new Map<string, { x: number; y: number }>();
  const dropRects: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];

  const globalOfId = (id: string): { x: number; y: number } => {
    const o = objects.find((x) => x.id === id);
    if (o) return getGlobalXY(objects, o);
    const f = flats.find((x) => x.id === id);
    return f ? getFlatGlobalXY(objects, f) : { x: 0, y: 0 };
  };
  const eachDescendant = (rootId: string, cb: (id: string) => void) => {
    const stack = [rootId]; const visited = new Set<string>();
    while (stack.length) {
      const pid = stack.pop()!;
      for (const o of objects) if (o.parentId === pid && !visited.has(o.id)) { visited.add(o.id); cb(o.id); stack.push(o.id); }
      for (const f of flats) if (f.parentId === pid && !visited.has(f.id)) { visited.add(f.id); cb(f.id); }
    }
  };
  const layoutPanel = (cg: DashObject, origin: { x: number; y: number }) => {
    styledPanel.add(cg.id);
    panelOrigin.set(cg.id, origin);
    const cur = getGlobalXY(objects, cg);
    const dx = origin.x - cur.x, dy = origin.y - cur.y;
    styledPos.set(cg.id, origin);
    eachDescendant(cg.id, (id) => { const gp = globalOfId(id); styledPos.set(id, { x: gp.x + dx, y: gp.y + dy }); });
  };

  for (const G of objects) {
    if (G.kind !== 'group') continue;
    const gStyle = (G.properties?.style as string) ?? 'normal';
    if (gStyle !== 'tab' && gStyle !== 'table') continue;
    containerIds.add(G.id);
    const Gg = getGlobalXY(objects, G);
    const gt = getTransform(G);
    const W = gt.width > 0 ? gt.width : 320, H = gt.height > 0 ? gt.height : 240;
    const cellGroups = objects.filter((o) => o.parentId === G.id && o.kind === 'group');
    if (gStyle === 'tab') {
      const active = Math.min(Math.max(0, Math.floor(Number(G.properties?.activeTab ?? 0))), Math.max(0, cellGroups.length - 1));
      cellGroups.forEach((cg, i) => {
        if (i !== active) { styledHidden.add(cg.id); eachDescendant(cg.id, (id) => styledHidden.add(id)); return; }
        const origin = { x: Gg.x, y: Gg.y + STYLED_TAB_H };
        layoutPanel(cg, origin);
        dropRects.push({ id: cg.id, x: origin.x, y: origin.y, w: W, h: Math.max(0, H - STYLED_TAB_H) });
      });
    } else {
      const cols = Math.max(1, Math.floor(Number(G.properties?.columns ?? 2)));
      const rowsN = Math.max(1, Math.floor(Number(G.properties?.rows ?? 2)));
      const cellW = W / cols, cellH = H / rowsN;
      cellGroups.forEach((cg, k) => {
        const col = k % cols, row = Math.floor(k / cols);
        if (row >= rowsN) { styledHidden.add(cg.id); eachDescendant(cg.id, (id) => styledHidden.add(id)); return; }
        const origin = { x: Gg.x + col * cellW, y: Gg.y + row * cellH };
        layoutPanel(cg, origin);
        dropRects.push({ id: cg.id, x: origin.x, y: origin.y, w: cellW, h: cellH });
      });
    }
  }

  // Klipowanie: dla każdego węzła znajdź NAJBLIŻSZĄ grupę-przodka z clip=true i przypisz
  // prostokąt przycięcia (global). Dla kontenera Tab/Table clip = region panelu/komórki
  // (dropRect grupy-dziecka na ścieżce); dla zwykłej grupy clip = prostokąt grupy.
  const clipBox = new Map<string, { x: number; y: number; w: number; h: number }>();
  if (objects.some((o) => o.kind === 'group' && o.properties?.clip === true)) {
    const objById = new Map(objects.map((o) => [o.id, o]));
    const dropRectById = new Map(dropRects.map((r) => [r.id, r]));
    const rectOfGroup = (g: DashObject) => { const gg = getGlobalXY(objects, g); const t = getTransform(g); return { x: gg.x, y: gg.y, w: t.width > 0 ? t.width : 320, h: t.height > 0 ? t.height : 240 }; };
    const allNodes: Array<{ id: string; parentId?: string }> = [...objects, ...flats];
    for (const node of allNodes) {
      let cur: { id: string; parentId?: string } = node;
      let parent = node.parentId ? objById.get(node.parentId) : undefined;
      let depth = 0;
      while (parent && depth < MAX_PARENT_DEPTH) {
        if (parent.kind === 'group' && parent.properties?.clip === true) {
          const st = parent.properties?.style;
          const dr = (st === 'tab' || st === 'table') ? dropRectById.get(cur.id) : undefined;
          clipBox.set(node.id, dr ? { x: dr.x, y: dr.y, w: dr.w, h: dr.h } : rectOfGroup(parent));
          break;
        }
        cur = parent; parent = parent.parentId ? objById.get(parent.parentId) : undefined; depth++;
      }
    }
  }
  return { styledPos, styledHidden, styledPanel, containerIds, panelOrigin, dropRects, clipBox };
};

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
const executeFunctionFromSource = async (api: AutomateSystemApiInterface, code: string, symbolPath: string, args: unknown[], thisValue?: unknown): Promise<unknown> => {
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
    ? new Function('api', '__args__', '__thisValue__', `${stripped}\n${callExpr}`)
    : new Function('api', '__args__', `${stripped}\n${callExpr}`);
  const result = thisValue !== undefined ? fn(api, args, thisValue) : fn(api, args);
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
  version: 2,
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

// A single editable row for a MinisQt Q_PROPERTY (enumerated via
// QObject.metaProperties). Read-only props (no setter, e.g. `count`) are disabled.
// Złożone typy Qt → rodzaj strukturalnego edytora w popupie.
const QT_COMPLEX: Record<string, 'color' | 'rect' | 'size' | 'point' | 'margins' | 'font'> = {
  color: 'color', qcolor: 'color',
  qrect: 'rect', qrectf: 'rect',
  qsize: 'size', qsizef: 'size',
  qpoint: 'point', qpointf: 'point',
  qmargins: 'margins', qmarginsf: 'margins',
  qfont: 'font',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseQtObj = (v: unknown): Record<string, any> => {
  if (v == null) return {};
  if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === 'object') return v as any;
  return {};
};
const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, '0');

// Strukturalny edytor złożonego typu Qt (zawartość popupu).
const QtComplexEditor: React.FC<{
  kind: 'color' | 'rect' | 'size' | 'point' | 'margins' | 'font';
  value: DashValue | undefined;
  onChange: (v: DashValue) => void;
}> = ({ kind, value, onChange }) => {
  const obj = parseQtObj(value);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (patch: Record<string, any>) => onChange({ ...obj, ...patch } as DashValue);
  const numRow = (label: string, key: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography sx={{ fontSize: 11, width: 70, color: 'text.secondary', fontFamily: 'monospace' }}>{label}</Typography>
      <TextField size="small" variant="standard" type="number" value={obj[key] ?? 0}
        onChange={(e) => set({ [key]: e.target.value === '' ? 0 : Number(e.target.value) })}
        inputProps={{ style: { fontSize: 12, width: 96 } }} />
    </Box>
  );

  if (kind === 'color') {
    const hex = typeof value === 'string' && value ? value
      : (obj._r != null ? `#${toHex(obj._r)}${toHex(obj._g)}${toHex(obj._b)}` : '');
    const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#888888';
    return (
      <Box sx={{ p: 1.5, minWidth: 200 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1 }}>Kolor</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <input type="color" value={safe} onChange={(e) => onChange(e.target.value)}
            style={{ width: 44, height: 34, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
          <TextField size="small" variant="standard" placeholder="#rrggbb lub nazwa" value={hex}
            onChange={(e) => onChange(e.target.value)} inputProps={{ style: { fontSize: 12, fontFamily: 'monospace', width: 120 } }} />
        </Box>
        <Button size="small" onClick={() => onChange('')} sx={{ fontSize: 10, mt: 1, textTransform: 'none' }}>Wyczyść (domyślny)</Button>
      </Box>
    );
  }
  if (kind === 'rect') return <Box sx={{ p: 1.5, minWidth: 190 }}><Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1 }}>QRect</Typography>{numRow('x', '_x')}{numRow('y', '_y')}{numRow('width', '_w')}{numRow('height', '_h')}</Box>;
  if (kind === 'size') return <Box sx={{ p: 1.5, minWidth: 190 }}><Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1 }}>QSize</Typography>{numRow('width', '_w')}{numRow('height', '_h')}</Box>;
  if (kind === 'point') return <Box sx={{ p: 1.5, minWidth: 190 }}><Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1 }}>QPoint</Typography>{numRow('x', '_x')}{numRow('y', '_y')}</Box>;
  if (kind === 'margins') return <Box sx={{ p: 1.5, minWidth: 190 }}><Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1 }}>QMargins</Typography>{numRow('left', '_l')}{numRow('top', '_t')}{numRow('right', '_r')}{numRow('bottom', '_b')}</Box>;
  // font
  return (
    <Box sx={{ p: 1.5, minWidth: 220 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1 }}>QFont</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontSize: 11, width: 70, color: 'text.secondary', fontFamily: 'monospace' }}>family</Typography>
        <TextField size="small" variant="standard" value={obj._family ?? ''} onChange={(e) => set({ _family: e.target.value })} inputProps={{ style: { fontSize: 12, width: 130 } }} />
      </Box>
      {numRow('size', '_size')}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}><Switch size="small" checked={(obj._weight ?? 400) >= 600} onChange={(_, c) => set({ _weight: c ? 700 : 400 })} /><Typography sx={{ fontSize: 11 }}>bold</Typography></Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}><Switch size="small" checked={!!obj._italic} onChange={(_, c) => set({ _italic: c })} /><Typography sx={{ fontSize: 11 }}>italic</Typography></Box>
      </Box>
    </Box>
  );
};

const QtPropertyField: React.FC<{
  name: string; type: string; settable: boolean;
  value: DashValue | undefined; dflt: unknown;
  onChange: (v: DashValue) => void;
}> = ({ name, type, settable, value, dflt, onChange }) => {
  const effective = value !== undefined ? value : (dflt as DashValue | undefined);
  const t = (type || '').toLowerCase();
  const complex = QT_COMPLEX[t];
  const isBool = !complex && (t === 'bool' || t === 'boolean' || typeof effective === 'boolean');
  const isNum = !isBool && !complex && (t === 'number' || t === 'int' || t === 'double' || t === 'float' || typeof effective === 'number');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const summary = effective == null ? '' : (typeof effective === 'object' ? JSON.stringify(effective) : String(effective));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, opacity: settable ? 1 : 0.55 }}>
      <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#26c6da', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={`${name}: ${type}${settable ? '' : ' (read-only)'}`}>{name}</Typography>
      {isBool ? (
        <Switch size="small" checked={!!effective} disabled={!settable} onChange={(_, c) => onChange(c)} />
      ) : isNum ? (
        <TextField size="small" variant="standard" type="number" disabled={!settable}
          value={effective ?? ''} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          inputProps={{ style: { fontSize: 11, width: 66, textAlign: 'right', fontFamily: 'monospace' } }} />
      ) : (
        <>
          {complex === 'color' && /^#[0-9a-f]{6}$/i.test(summary) && (
            <Box sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: summary, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
          )}
          <TextField size="small" variant="standard" disabled={!settable}
            value={summary} onChange={(e) => onChange(e.target.value)}
            inputProps={{ style: { fontSize: 11, width: complex ? 68 : 90, fontFamily: 'monospace' } }} />
          {complex && settable && (
            <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.25 }} title={`Edytuj ${type}…`}>
              <TuneIcon sx={{ fontSize: 15, color: '#26c6da' }} />
            </IconButton>
          )}
        </>
      )}
      {complex && (
        <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <QtComplexEditor kind={complex} value={effective} onChange={onChange} />
        </Popover>
      )}
    </Box>
  );
};

// Properties dla bloczka PdfView — wybór strony (bloczek renderuje TYLKO tę stronę).
// Wspólne Properties dla dokumentów binarnych (PDF/DjVu): strona + ShowNavigation.
const DocViewProperties: React.FC<{
  filePath: string; page: number; numPages: number | null; label: string; accent: string;
  onPageChange: (p: number) => void; showNavigation: boolean; onToggleNavigation: (v: boolean) => void;
  region: boolean; onToggleRegion: (v: boolean) => void; onResetView: () => void;
  zoom: number; onZoomChange: (z: number) => void;
}> = ({ filePath, page, numPages, label, accent, onPageChange, showNavigation, onToggleNavigation, region, onToggleRegion, onResetView, zoom, onZoomChange }) => {
  const fileName = filePath.split('/').filter(Boolean).pop() ?? filePath;
  const cur = Math.min(Math.max(1, Math.floor(page) || 1), numPages ?? 9999);
  const set = (p: number) => onPageChange(Math.min(Math.max(1, Math.floor(p) || 1), numPages ?? 9999));
  return (
    <>
      <Divider sx={{ my: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
        <ArticleIcon sx={{ fontSize: 14, color: accent }} />
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>{label}</Typography>
      </Box>
      <Box title={filePath} sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.primary', bgcolor: 'action.hover',
        borderRadius: 1, px: 0.75, py: 0.5, mb: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid', borderColor: 'divider' }}>
        {fileName}
      </Box>
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Strona</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <IconButton size="small" disabled={cur <= 1} onClick={() => set(cur - 1)} sx={{ p: 0.5 }}>
          <ChevronRightIcon sx={{ fontSize: 18, transform: 'rotate(180deg)' }} />
        </IconButton>
        <TextField size="small" type="number" variant="outlined" value={cur}
          onChange={(e) => set(parseInt(e.target.value, 10))}
          inputProps={{ min: 1, max: numPages ?? undefined, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 56 } }} />
        <IconButton size="small" disabled={numPages != null && cur >= numPages} onClick={() => set(cur + 1)} sx={{ p: 0.5 }}>
          <ChevronRightIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', ml: 0.5 }}>
          {numPages != null ? `z ${numPages}` : '…'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>ShowNavigation</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>Przyciski nawigacji na canvasie</Typography>
        </Box>
        <Switch size="small" checked={showNavigation} onChange={(_, v) => onToggleNavigation(v)}
          sx={{ '& .MuiSwitch-thumb': { bgcolor: accent }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: `${accent}60` } }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Tryb wyświetlania</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>
            {region ? 'Region: przeciągaj = przesuwasz widok; kółko = zoom' : 'Cała strona dopasowana do szerokości'}
          </Typography>
        </Box>
        <Select size="small" variant="outlined" value={region ? 'region' : 'page'}
          onChange={(e) => onToggleRegion(e.target.value === 'region')}
          sx={{ fontSize: 12, height: 28, minWidth: 118, '& .MuiSelect-select': { py: 0.25 } }}>
          <MenuItem value="page" sx={{ fontSize: 12 }}>Cała strona</MenuItem>
          <MenuItem value="region" sx={{ fontSize: 12 }}>Region</MenuItem>
        </Select>
      </Box>
      {region && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Zoom</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TextField size="small" type="number" variant="outlined" value={Number(zoom.toFixed(2))}
                onChange={(e) => { const z = Number(e.target.value); if (Number.isFinite(z)) onZoomChange(Math.min(8, Math.max(0.2, z))); }}
                inputProps={{ min: 0.2, max: 8, step: 0.1, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 56 } }} />
              <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>×</Typography>
            </Box>
          </Box>
          <Button size="small" variant="outlined" onClick={onResetView} sx={{ mt: 0.75, fontSize: 11, textTransform: 'none' }}>
            Resetuj widok
          </Button>
        </>
      )}
    </>
  );
};

const PdfViewProperties: React.FC<{
  userName: string; filePath: string; page: number; onPageChange: (p: number) => void;
  showNavigation: boolean; onToggleNavigation: (v: boolean) => void;
  region: boolean; onToggleRegion: (v: boolean) => void; onResetView: () => void;
  zoom: number; onZoomChange: (z: number) => void;
}> = (p) => <DocViewProperties {...p} numPages={usePdfNumPages(p.userName, p.filePath)} label="Dokument PDF" accent="#ef5350" />;

const DjvuViewProperties: React.FC<{
  userName: string; filePath: string; page: number; onPageChange: (p: number) => void;
  showNavigation: boolean; onToggleNavigation: (v: boolean) => void;
  region: boolean; onToggleRegion: (v: boolean) => void; onResetView: () => void;
  zoom: number; onZoomChange: (z: number) => void;
}> = (p) => <DocViewProperties {...p} numPages={useDjvuNumPages(p.userName, p.filePath)} label="Dokument DjVu" accent="#7c4dff" />;

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
  const [mdPickerOpen, setMdPickerOpen] = useState(false);

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

      {/* Źródło Markdown — dedykowany wybór pliku .md z dysku usera (VFS). Ustawia
          property `src` na ścieżkę VFS; scena renderuje go bogatym viewerem MdEditor. */}
      {object.className === 'MarkdownView' && (() => {
        const srcVal = String(object.properties['src'] ?? '');
        const isFile = srcVal.trim().startsWith('/');
        const fileName = isFile ? (srcVal.split('/').filter(Boolean).pop() ?? srcVal) : '';
        return (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <ArticleIcon sx={{ fontSize: 14, color: '#4fc3f7' }} />
              <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>Plik Markdown</Typography>
            </Box>
            <Box title={srcVal || '(brak — wybierz plik .md)'} sx={{
              fontSize: 11, fontFamily: 'monospace', color: isFile ? 'text.primary' : 'text.disabled',
              bgcolor: 'action.hover', borderRadius: 1, px: 0.75, py: 0.5, mb: 0.75,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid', borderColor: 'divider',
            }}>
              {isFile ? fileName : (srcVal ? '(treść inline)' : '(brak pliku)')}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button size="small" variant="contained" startIcon={<FolderOpenIcon sx={{ fontSize: 14 }} />}
                onClick={() => setMdPickerOpen(true)}
                sx={{ fontSize: 11, textTransform: 'none', flex: 1 }}>
                Wybierz plik .md…
              </Button>
              {srcVal && (
                <Tooltip title="Wyczyść źródło">
                  <IconButton size="small" onClick={() => onPropertyChange(object.id, 'src', '')} sx={{ p: 0.5 }}>
                    <CloseIcon sx={{ fontSize: 14, color: 'error.light' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <FilePickerDialog
              open={mdPickerOpen}
              onClose={() => setMdPickerOpen(false)}
              userName={userName}
              currentPath={srcVal}
              filterExt=".md"
              onSelect={(p) => onPropertyChange(object.id, 'src', p)}
            />
          </>
        );
      })()}

      {object.className === 'PdfView' && (
        <PdfViewProperties
          userName={userName}
          filePath={String(object.properties['filePath'] ?? '')}
          page={Number(object.properties['page'] ?? 1)}
          onPageChange={(p) => onPropertyChange(object.id, 'page', p)}
          showNavigation={object.properties['showNavigation'] === true}
          onToggleNavigation={(v) => onPropertyChange(object.id, 'showNavigation', v)}
          region={object.properties['region'] === true}
          onToggleRegion={(v) => onPropertyChange(object.id, 'region', v)}
          onResetView={() => onPropertyChange(object.id, 'view', { x: 0, y: 0, zoom: 1 })}
          zoom={Number((object.properties['view'] as { zoom?: number } | undefined)?.zoom ?? 1)}
          onZoomChange={(z) => { const v = (object.properties['view'] as { x?: number; y?: number } | undefined) ?? {}; onPropertyChange(object.id, 'view', { x: v.x ?? 0, y: v.y ?? 0, zoom: z }); }}
        />
      )}

      {object.className === 'DjvuView' && (
        <DjvuViewProperties
          userName={userName}
          filePath={String(object.properties['filePath'] ?? '')}
          page={Number(object.properties['page'] ?? 1)}
          onPageChange={(p) => onPropertyChange(object.id, 'page', p)}
          showNavigation={object.properties['showNavigation'] === true}
          onToggleNavigation={(v) => onPropertyChange(object.id, 'showNavigation', v)}
          region={object.properties['region'] === true}
          onToggleRegion={(v) => onPropertyChange(object.id, 'region', v)}
          onResetView={() => onPropertyChange(object.id, 'view', { x: 0, y: 0, zoom: 1 })}
          zoom={Number((object.properties['view'] as { zoom?: number } | undefined)?.zoom ?? 1)}
          onZoomChange={(z) => { const v = (object.properties['view'] as { x?: number; y?: number } | undefined) ?? {}; onPropertyChange(object.id, 'view', { x: v.x ?? 0, y: v.y ?? 0, zoom: z }); }}
        />
      )}

      {object.kind === 'shape' && (() => {
        const shp = String(object.properties['shape'] ?? 'rect');
        const isLine = shp === 'line' || shp === 'arrow';
        const isText = shp === 'text';
        const fill = String(object.properties['fill'] ?? '#4fc3f7');
        const stroke = String(object.properties['stroke'] ?? '#1976d2');
        const sw = Number(object.properties['strokeWidth'] ?? 2);
        const colorRow = (label: string, val: string, key: string) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 74, flexShrink: 0 }}>{label}</Typography>
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : '#000000'}
              onChange={(e) => onPropertyChange(object.id, key, e.target.value)}
              style={{ width: 28, height: 24, padding: 0, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: 'text.disabled' }}>{val}</Typography>
          </Box>
        );
        return (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>
              Kształt: {shp}
            </Typography>
            {isText ? (
              <>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 0.25 }}>Treść (markdown)</Typography>
                <TextField size="small" fullWidth multiline minRows={4} maxRows={12}
                  value={String(object.properties['text'] ?? '')}
                  onChange={(e) => onPropertyChange(object.id, 'text', e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  inputProps={{ style: { fontSize: 12, fontFamily: 'monospace', lineHeight: 1.4 } }}
                  sx={{ mb: 1 }} />
                {colorRow('Kolor', String(object.properties['color'] ?? '#1a1a1a'), 'color')}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 74, flexShrink: 0 }}>Rozmiar</Typography>
                  <TextField size="small" type="number" variant="outlined" value={Number(object.properties['fontSize'] ?? 14)}
                    onChange={(e) => onPropertyChange(object.id, 'fontSize', Math.max(6, Number(e.target.value) || 14))}
                    inputProps={{ min: 6, max: 96, step: 1, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 52 } }} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 74, flexShrink: 0 }}>Wyrównanie</Typography>
                  <Select size="small" variant="outlined" value={String(object.properties['align'] ?? 'left')}
                    onChange={(e) => onPropertyChange(object.id, 'align', e.target.value)}
                    sx={{ fontSize: 12, '& .MuiSelect-select': { py: '4px' } }}>
                    <MenuItem value="left" sx={{ fontSize: 12 }}>Do lewej</MenuItem>
                    <MenuItem value="center" sx={{ fontSize: 12 }}>Wyśrodkuj</MenuItem>
                    <MenuItem value="right" sx={{ fontSize: 12 }}>Do prawej</MenuItem>
                  </Select>
                </Box>
              </>
            ) : (
              <>
                {!isLine && colorRow('Wypełnienie', fill, 'fill')}
                {colorRow(isLine ? 'Kolor' : 'Obrys', stroke, 'stroke')}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 74, flexShrink: 0 }}>Grubość</Typography>
                  <TextField size="small" type="number" variant="outlined" value={sw}
                    onChange={(e) => onPropertyChange(object.id, 'strokeWidth', Math.max(0, Number(e.target.value) || 0))}
                    inputProps={{ min: 0, max: 40, step: 1, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 52 } }} />
                </Box>
                {shp === 'rect' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary', width: 74, flexShrink: 0 }}>Zaokrąglenie</Typography>
                    <TextField size="small" type="number" variant="outlined" value={Number(object.properties['radius'] ?? 0)}
                      onChange={(e) => onPropertyChange(object.id, 'radius', Math.max(0, Number(e.target.value) || 0))}
                      inputProps={{ min: 0, max: 60, step: 1, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 52 } }} />
                  </Box>
                )}
                {isLine && (
                  <Button size="small" variant="outlined" onClick={() => onPropertyChange(object.id, 'flipDiag', object.properties['flipDiag'] !== true)}
                    sx={{ fontSize: 11, textTransform: 'none', mt: 0.5 }}>
                    Zamień kierunek przekątnej
                  </Button>
                )}
              </>
            )}
          </>
        );
      })()}

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
      {object.kind === 'group' && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Show frame</Typography>
          <Switch size="small" checked={object.properties.showFrame !== false}
            onChange={(_, checked) => onPropertyChange(object.id, 'showFrame', checked)}
            sx={{ '& .MuiSwitch-thumb': { bgcolor: '#7c4dff' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#7c4dff60' } }} />
        </Box>
      )}
      {object.kind === 'group' && (() => {
        const style = (object.properties.style as string) ?? 'normal';
        return (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Style</Typography>
              <Select size="small" variant="outlined" value={style}
                onChange={(e) => onPropertyChange(object.id, 'style', e.target.value)}
                sx={{ fontSize: 12, height: 28, minWidth: 100, '& .MuiSelect-select': { py: 0.25 } }}>
                <MenuItem value="normal" sx={{ fontSize: 12 }}>Normal</MenuItem>
                <MenuItem value="tab" sx={{ fontSize: 12 }}>Tab</MenuItem>
                <MenuItem value="table" sx={{ fontSize: 12 }}>Table</MenuItem>
              </Select>
            </Box>
            {style === 'table' && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Rows</Typography>
                  <TextField size="small" type="number" variant="outlined" value={Number(object.properties.rows ?? 2)}
                    onChange={(e) => onPropertyChange(object.id, 'rows', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    inputProps={{ min: 1, step: 1, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 40 } }} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Columns</Typography>
                  <TextField size="small" type="number" variant="outlined" value={Number(object.properties.columns ?? 2)}
                    onChange={(e) => onPropertyChange(object.id, 'columns', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    inputProps={{ min: 1, step: 1, style: { textAlign: 'center', fontSize: 13, padding: '4px 6px', width: 40 } }} />
                </Box>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Clip content</Typography>
              <Switch size="small" checked={object.properties.clip === true}
                onChange={(_, checked) => onPropertyChange(object.id, 'clip', checked)}
                sx={{ '& .MuiSwitch-thumb': { bgcolor: '#7c4dff' }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#7c4dff60' } }} />
            </Box>
          </>
        );
      })()}
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

/** Top-level Python functions from a `.py` source (draggable → PyFunctionCall). */
const parsePythonSource = (code: string): CodeSymbol[] => {
  const syms: CodeSymbol[] = [];
  const seen = new Set<string>();
  // A top-level def has `def`/`async def` at column 0 (no indentation → excludes
  // class methods and nested defs). Single-line parameter list.
  const re = /^(async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(([^)]*)\)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const [, asyncKw, name, params] = m;
    if (seen.has(name)) continue;
    seen.add(name);
    syms.push({ kind: 'function', name, mods: asyncKw ? ['async'] : [], params: params.trim(), children: [] });
  }
  return syms;
};

// Liczba parametrów z tekstu (np. "a: number, b = 1") — dzieli po przecinkach
// na poziomie 0 (ignoruje zagnieżdżone <>, (), [], {}). Pomija `self`/`cls` (Python).
const countTopLevelParams = (params: string, isPython?: boolean): number => {
  const p = (params || '').trim();
  if (!p) return 0;
  let depth = 0; const parts: string[] = []; let cur = '';
  for (const ch of p) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  let names = parts.map((s) => s.trim()).filter(Boolean);
  if (isPython) names = names.filter((n) => !/^(self|cls)\b/.test(n));
  return names.length;
};

// Spłaszcza symbole data source do listy wywoływalnych funkcji (top-level + metody klas).
const flattenHandlerFns = (
  symbols: CodeSymbol[] | undefined, src: DataSourceEntry, parent?: string,
): HandlerFn[] => {
  const out: HandlerFn[] = [];
  for (const s of symbols || []) {
    const path = parent ? `${parent}.${s.name}` : s.name;
    if (s.kind === 'function' || s.kind === 'arrow' || s.kind === 'method') {
      out.push({
        sourceId: src.id, sourceName: src.name, fileType: src.fileType, symbolPath: path,
        params: s.params || '', paramCount: countTopLevelParams(s.params || '', src.fileType === 'python'),
        ...(src.fileType === 'python' ? { lang: 'python' as const } : {}),
      });
    }
    if (s.children && s.children.length) out.push(...flattenHandlerFns(s.children, src, path));
  }
  return out;
};

// Lazily-loaded TypeScript compiler — strips types from `.ts` data sources
// before they run in `new Function()`. Loaded from a CDN on first use (same
// approach as Pyodide) so the ~8 MB compiler never bloats the app bundle.
interface TsCompilerLike {
  transpileModule(input: string, opts: { compilerOptions: Record<string, unknown> }): { outputText: string };
  ScriptTarget: Record<string, number>;
  ModuleKind: Record<string, number>;
}
let _tsCompiler: TsCompilerLike | null = null;
const transpileTs = async (source: string): Promise<string> => {
  if (!_tsCompiler) {
    const cdnUrl = 'https://esm.sh/typescript@5.3.3';
    const mod = await import(/* @vite-ignore */ cdnUrl) as { default?: TsCompilerLike } & TsCompilerLike;
    _tsCompiler = mod.default ?? mod;
  }
  const ts = _tsCompiler;
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
  }).outputText;
};

const loadDataSourceContent = (content: string, fileType: DataSourceEntry['fileType']): JsonNode => {
  if (fileType === 'pdf' || fileType === 'djvu' || fileType === 'dash') return { _binary: true } as unknown as JsonNode; // binarne/osobne — obsłużone gdzie indziej
  if (fileType === 'json') return JSON.parse(content) as JsonNode;
  if (fileType === 'python') return parsePythonSource(content) as unknown as JsonNode;
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

// Własny scrollbar (szeroki, dotykalny). Mobilne przeglądarki (Chromium/Samsung)
// IGNORUJĄ `::-webkit-scrollbar { width }`, więc na dotyku pasek zawsze był cienki.
// Tu chowamy natywny pasek i rysujemy własny 14px kciuk (przeciągalny palcem).
const TouchScrollbar: React.FC<{ children: React.ReactNode; maxHeight?: number | string; fill?: boolean }> = ({ children, maxHeight, fill }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);
  const recompute = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (clientHeight === 0 || scrollHeight <= clientHeight + 2) { setThumb(null); return; }
    const h = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
    const maxTop = clientHeight - h;
    const top = (scrollHeight - clientHeight) > 0 ? maxTop * (scrollTop / (scrollHeight - clientHeight)) : 0;
    setThumb({ top, height: h });
  }, []);
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    recompute();
    el.addEventListener('scroll', recompute, { passive: true });
    const ro = new ResizeObserver(recompute); ro.observe(el);
    const mo = new MutationObserver(recompute); mo.observe(el, { childList: true, subtree: true });
    return () => { el.removeEventListener('scroll', recompute); ro.disconnect(); mo.disconnect(); };
  }, [recompute]);
  const onThumbDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const el = scrollRef.current; const th = thumb; if (!el || !th) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* pointer nieaktywny (np. syntetyczny) */ }
    const startY = e.clientY; const startScroll = el.scrollTop;
    // Skala wizualna kontenera (np. zoom viewportu ReactFlow, gdzie scrollbar jest
    // w skalowanym węźle): ruch kursora jest w pikselach EKRANU, a scrollTop/track
    // w logicznych. Bez korekty o skalę thumb rozjeżdża się z kursorem przy zoom≠1.
    const rect = el.getBoundingClientRect();
    const scale = el.clientHeight > 0 ? rect.height / el.clientHeight : 1;
    const track = el.clientHeight - th.height;
    const ratio = track > 0 ? (el.scrollHeight - el.clientHeight) / track : 0;
    const onMove = (me: PointerEvent) => { el.scrollTop = startScroll + ((me.clientY - startY) / (scale || 1)) * ratio; };
    const onTouch = (te: TouchEvent) => { if (te.cancelable) te.preventDefault(); };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('touchmove', onTouch, { capture: true } as unknown as EventListenerOptions);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('touchmove', onTouch, { passive: false, capture: true });
    window.addEventListener('pointerup', onUp);
  }, [thumb]);
  return (
    <Box sx={{ position: 'relative', ...(fill ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}) }}>
      {/* nodrag nopan → gdy scrollbar żyje w węźle ReactFlow, dotyk/scroll treści nie
          przeciąga węzła ani nie panuje canvasu (stopPropagation na React onPointerDown
          nie zatrzymuje natywnego touchstart d3-drag). Poza ReactFlow klasy są no-op. */}
      <Box ref={scrollRef} className="nodrag nopan" sx={{ overflow: 'auto',
        ...(fill ? { flex: 1, minHeight: 0 } : { maxHeight }),
        '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
        {children}
      </Box>
      {thumb && (
        <Box className="nodrag nopan" onPointerDown={onThumbDown}
          sx={{ position: 'absolute', right: 1, top: thumb.top, height: thumb.height, width: 14, borderRadius: 7,
            bgcolor: 'rgba(150,150,160,0.7)', border: '3px solid transparent', backgroundClip: 'content-box',
            touchAction: 'none', cursor: 'pointer', zIndex: 6, '&:active': { bgcolor: 'rgba(185,185,195,0.95)' } }} />
      )}
    </Box>
  );
};

// Wiersz źródła PDF w panelu Data — przeciągnij na scenę, by utworzyć bloczek PdfView.
// Ten sam datasource można przeciągnąć wiele razy (każdy PdfView = inna strona).
const PdfSourceRow: React.FC<{ sourceId: string; filePath: string; name: string }> = ({ sourceId, filePath, name }) => {
  const payload = () => ({ mime: 'application/dash-pdf-ref', data: JSON.stringify({ sourceId, filePath }), label: `PDF: ${name}` });
  const dragRef = useMemo(() => makeDragRef(payload), [sourceId, filePath, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/dash-pdf-ref', JSON.stringify({ sourceId, filePath }));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <Box ref={dragRef} draggable onDragStart={onDragStart}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.5, cursor: 'grab', borderRadius: 0.5,
        touchAction: 'none', '&:hover': { bgcolor: 'rgba(239,83,80,0.14)' }, '&:active': { cursor: 'grabbing' } }}>
      <PictureAsPdfIcon sx={{ fontSize: 15, color: '#ef5350', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Przeciągnij na scenę → PdfView
      </Typography>
      <Box sx={{ fontSize: 10, color: '#ef535088', pr: '2px', flexShrink: 0 }}>⠿</Box>
    </Box>
  );
};

// Wiersz źródła DjVu — jak PdfSourceRow, tworzy bloczek DjvuView.
const DjvuSourceRow: React.FC<{ sourceId: string; filePath: string; name: string }> = ({ sourceId, filePath, name }) => {
  const payload = () => ({ mime: 'application/dash-djvu-ref', data: JSON.stringify({ sourceId, filePath }), label: `DjVu: ${name}` });
  const dragRef = useMemo(() => makeDragRef(payload), [sourceId, filePath, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/dash-djvu-ref', JSON.stringify({ sourceId, filePath }));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <Box ref={dragRef} draggable onDragStart={onDragStart}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.5, cursor: 'grab', borderRadius: 0.5,
        touchAction: 'none', '&:hover': { bgcolor: 'rgba(124,77,255,0.14)' }, '&:active': { cursor: 'grabbing' } }}>
      <ArticleIcon sx={{ fontSize: 15, color: '#7c4dff', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Przeciągnij na scenę → DjvuView
      </Typography>
      <Box sx={{ fontSize: 10, color: '#7c4dff88', pr: '2px', flexShrink: 0 }}>⠿</Box>
    </Box>
  );
};

// Wiersz źródła sceny *.dash.json — tworzy transparentny bloczek SceneEmbed renderujący
// zawartość osadzonej sceny (read-only).
const DashSourceRow: React.FC<{ sourceId: string; filePath: string; name: string }> = ({ sourceId, filePath, name }) => {
  const payload = () => ({ mime: 'application/dash-scene-ref', data: JSON.stringify({ sourceId, filePath }), label: `Scena: ${name}` });
  const dragRef = useMemo(() => makeDragRef(payload), [sourceId, filePath, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/dash-scene-ref', JSON.stringify({ sourceId, filePath }));
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <Box ref={dragRef} draggable onDragStart={onDragStart}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.5, cursor: 'grab', borderRadius: 0.5,
        touchAction: 'none', '&:hover': { bgcolor: 'rgba(77,182,172,0.14)' }, '&:active': { cursor: 'grabbing' } }}>
      <AccountTreeIcon sx={{ fontSize: 15, color: '#4db6ac', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Przeciągnij na scenę → SceneEmbed
      </Typography>
      <Box sx={{ fontSize: 10, color: '#4db6ac88', pr: '2px', flexShrink: 0 }}>⠿</Box>
    </Box>
  );
};

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

      <TouchScrollbar fill>
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
                {src.fileType === 'pdf'
                  ? <PictureAsPdfIcon sx={{ fontSize: 13, color: '#ef5350', flexShrink: 0 }} />
                  : src.fileType === 'djvu'
                  ? <ArticleIcon sx={{ fontSize: 13, color: '#7c4dff', flexShrink: 0 }} />
                  : <StorageIcon sx={{ fontSize: 12, color: src.fileType === 'json' ? '#81c784' : src.fileType === 'python' ? '#4fc3f7' : src.fileType === 'ts' ? '#3178c6' : '#ffb74d', flexShrink: 0 }} />}
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
                <Box sx={{ mx: 1.25, mb: 0.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1,
                  border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                  <TouchScrollbar maxHeight={280}>
                    <Box sx={{ px: 0.75, py: 0.5 }}>
                      {data === undefined ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={10} />
                          <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Loading…</Typography>
                        </Box>
                      ) : data === null ? (
                        <Typography sx={{ fontSize: 10, color: 'error.light', fontStyle: 'italic' }}>Failed to load</Typography>
                      ) : src.fileType === 'pdf' ? (
                        <PdfSourceRow sourceId={src.id} filePath={src.filePath} name={src.name} />
                      ) : src.fileType === 'djvu' ? (
                        <DjvuSourceRow sourceId={src.id} filePath={src.filePath} name={src.name} />
                      ) : src.fileType === 'dash' ? (
                        <DashSourceRow sourceId={src.id} filePath={src.filePath} name={src.name} />
                      ) : src.fileType === 'js' || src.fileType === 'python' || src.fileType === 'ts' ? (
                        <SourceTreeView symbols={data as unknown as CodeSymbol[]} sourceId={src.id} />
                      ) : (
                        <JsonTreeNode value={data} sourceId={src.id} filePath={src.filePath} />
                      )}
                    </Box>
                  </TouchScrollbar>
                </Box>
              )}
            </Box>
          );
        })}
      </TouchScrollbar>

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

// Osadzony MdEditor renderuje treść pliku razem z customowymi rozszerzeniami
// (CadViewEmbed, PluginScript, InfoMark…). Jeśli KTÓREKOLWIEK z nich rzuci przy
// renderze/interakcji, a nie ma bariery, wyjątek leci do roota i rozmontowuje
// CAŁĄ stronę Drive (objaw: „strona się resetuje"). Ta bariera izoluje krach do
// jednego bloczka — reszta sceny działa dalej. `resetKey` (ścieżka+długość treści)
// automatycznie kasuje stan błędu, gdy zmieni się źródło (np. wybór innego .md).
const MD_MAX_AUTO_RETRY = 3;
class MdRenderBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { failed: boolean; retries: number }
> {
  state = { failed: false, retries: 0 };
  private lastKey = this.props.resetKey;
  private retryTimer = 0;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    // Błąd „editor view is not available" jest przejściowy (wyścig montażu TipTap w
    // świeżo ułożonym węźle) — automatycznie remontujemy kilka razy, zwykle druga
    // próba trafia w stabilny layout i renderuje poprawnie. Dopiero po wyczerpaniu
    // limitu pokazujemy fallback (chroni przed pętlą przy trwale zepsutym bloku).
    // eslint-disable-next-line no-console
    console.error('[MarkdownView] render error (izolowany, strona działa dalej):', error);
    if (this.state.retries < MD_MAX_AUTO_RETRY) {
      this.retryTimer = window.setTimeout(
        () => this.setState((s) => ({ failed: false, retries: s.retries + 1 })),
        120,
      );
    }
  }
  componentWillUnmount() { if (this.retryTimer) clearTimeout(this.retryTimer); }
  render() {
    if (this.props.resetKey !== this.lastKey) {
      this.lastKey = this.props.resetKey;
      if (this.state.failed || this.state.retries) this.setState({ failed: false, retries: 0 });
    }
    if (this.state.failed) {
      return (
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'flex-start' }}>
          <Typography sx={{ fontSize: 11, color: 'error.main', fontWeight: 600 }}>Nie udało się wyrenderować markdown</Typography>
          <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>Plik zawiera blok, który rzucił wyjątek. Reszta sceny działa normalnie.</Typography>
          <Button size="small" variant="outlined" sx={{ fontSize: 10, textTransform: 'none' }}
            onClick={() => this.setState({ failed: false, retries: 0 })}>Spróbuj ponownie</Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

// Memo: bloczek qt/dash re-renderuje się bardzo często (selekcja/drag ReactFlow).
// Bez memo osadzony MdEditor (ciężki TipTap) re-renderowałby się przy każdej zmianie
// propsów węzła — kosztownie i zwiększa ryzyko wyścigów init/destroy ProseMirror.
const MarkdownViewContent = React.memo(({ src, userName }: { src: string; userName: string }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Gate montażu: TipTap rzuca „editor view is not available", gdy montuje się do
  // kontenera, którego ReactFlow jeszcze nie zmierzył/ułożył (świeżo dodany węzeł,
  // node poza kadrem). Czekamy 2× rAF, aż węzeł ma stabilny layout, dopiero wtedy
  // montujemy edytor — to eliminuje wyścig, zamiast tylko go łapać barierą.
  const [layoutReady, setLayoutReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setLayoutReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

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
  if (!layoutReady) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 40 }}>
        <CircularProgress size={16} />
      </Box>
    );
  }
  // Bogaty render: ten sam edytor markdown co reszta aplikacji, w trybie read-only
  // (`editable={false}`) — dzięki temu w scenie działają WSZYSTKIE customowe
  // rozszerzenia (CadViewEmbed, EventBlock, InfoMark, PluginScript, galerie, mapy…),
  // czyli dokładnie to co widać w normalnym edytorze markdown. MdEditor zamraża
  // `initialContent` przy montażu, więc remontujemy go przez `key`, gdy zmieni się
  // źródło/treść. `filePath` przekazujemy tylko dla ścieżek VFS (kontekst dla /event).
  return (
    <Box sx={{ '& .ProseMirror': { outline: 'none' }, '& [contenteditable]': { cursor: 'default' } }}>
      <MdRenderBoundary resetKey={`${trimmed}:${content.length}`}>
        <React.Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}><CircularProgress size={16} /></Box>}>
          <MdEditor
            key={`${trimmed}:${content.length}`}
            initialContent={content}
            editable={false}
            autoSaveDelay={0}
            filePath={isPath ? trimmed : undefined}
            minimalView          /* w scenie: bez marginesów i bez nagłówków/ramek osadzonych bloczków */
            fullWidth            /* w scenie: treść na całą szerokość węzła — bez limitu 900px */
          />
        </React.Suspense>
      </MdRenderBoundary>
    </Box>
  );
});
MarkdownViewContent.displayName = 'MarkdownViewContent';

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
  const isPdfView = data.className === 'PdfView';
  const isDjvuView = data.className === 'DjvuView';
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
    window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: true }));
    let raf = 0; let pending: { w: number; h: number } | null = null;
    const flush = () => { raf = 0; if (pending) { data.onResizeDrag(pending.w, pending.h); pending = null; } };
    const onMove = (me: PointerEvent) => {
      const zoom = getZoom();
      const dw = (me.clientX - startX) / zoom;
      const dh = (me.clientY - startY) / zoom;
      const newW = Math.max(150, Math.round(startW + dw));
      const newH = startH > 0 ? Math.max(80, Math.round(startH + dh)) : Math.max(80, Math.round(dh));
      pending = { w: newW, h: newH };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (me: PointerEvent) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (pending) { data.onResizeDrag(pending.w, pending.h); pending = null; }
      window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: false }));
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
      {/* Drag bar — always visible, used as ReactFlow dragHandle.
          touchAction:'none' → mobile nie interpretuje dotyku jako scroll, więc d3-drag
          ReactFlow dostaje czysty gest przeciągania (inaczej węzeł „ciężko się rusza").
          Dla MarkdownView pasek jest wyższy + z ikoną/etykietą, bo treść (edytor md) z
          klasą nodrag zajmuje prawie cały węzeł — bez wyraźnego uchwytu trudno go złapać. */}
      <Box className="dash-drag-handle" title="Przeciągnij, aby przesunąć" sx={{
        flexShrink: 0, height: isMarkdownView ? 26 : 12, cursor: 'grab', touchAction: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
        bgcolor: data.selected ? '#4fc3f728' : (isMarkdownView ? '#4fc3f712' : 'action.hover'),
        borderBottom: '1px solid', borderColor: 'divider',
        borderRadius: '2px 2px 0 0',
        '&:active': { cursor: 'grabbing' },
      }}>
        {isMarkdownView ? (
          <>
            <DragIndicatorIcon sx={{ fontSize: 15, color: '#4fc3f7', opacity: 0.9 }} />
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: '#4fc3f7', letterSpacing: 0.3, userSelect: 'none' }}>Przeciągnij</Typography>
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: '3px', opacity: 0.35 }}>
            {[0,1,2,3,4].map((i) => <Box key={i} sx={{ width: 3, height: 3, bgcolor: 'text.primary', borderRadius: '50%' }} />)}
          </Box>
        )}
      </Box>

      {/* Resize handle — bottom-right */}
      <div
        className="nodrag nopan"
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
            {isPdfView && <PictureAsPdfIcon sx={{ fontSize: 11, color: '#ef5350' }} />}
            {isDjvuView && <ArticleIcon sx={{ fontSize: 11, color: '#7c4dff' }} />}
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
      ) : isPdfView ? (
        // Renderuje jedną stronę PDF (numer z properties). Wiele PdfView = jeden datasource.
        // key wymusza remount przy zmianie pliku/strony (nowy dokument/strona do renderu).
        <Box onPointerDown={(e) => e.stopPropagation()}
          sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', ...(t.height === 0 ? { height: 480 } : {}) }}>
          <PdfViewContent
            key={String(data.properties['filePath'] ?? '')}
            userName={data.userName}
            filePath={String(data.properties['filePath'] ?? '')}
            page={Number(data.properties['page'] ?? 1)}
            showNavigation={data.properties['showNavigation'] === true}
            region={data.properties['region'] === true}
            view={(data.properties['view'] as unknown as DocView) ?? undefined}
            onViewChange={(v) => data.onPropertyChange('view', v as unknown as DashValue)}
            onPageChange={(p) => data.onPropertyChange('page', p)}
          />
        </Box>
      ) : isDjvuView ? (
        <Box onPointerDown={(e) => e.stopPropagation()}
          sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', ...(t.height === 0 ? { height: 480 } : {}) }}>
          <DjvuViewContent
            key={String(data.properties['filePath'] ?? '')}
            userName={data.userName}
            filePath={String(data.properties['filePath'] ?? '')}
            page={Number(data.properties['page'] ?? 1)}
            showNavigation={data.properties['showNavigation'] === true}
            region={data.properties['region'] === true}
            view={(data.properties['view'] as unknown as DocView) ?? undefined}
            onViewChange={(v) => data.onPropertyChange('view', v as unknown as DashValue)}
            onPageChange={(p) => data.onPropertyChange('page', p)}
          />
        </Box>
      ) : isMarkdownView ? (
        // Szeroki, mobilny scrollbar (TouchScrollbar) zamiast natywnego — spójny z panelem Data.
        // Węzeł ze stałą wysokością: scroll wypełnia bloczek (fill). Bez wysokości: cap 400px.
        <Box onPointerDown={(e) => e.stopPropagation()}
          sx={{ touchAction: 'pan-y', ...(t.height > 0 ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}) }}>
          <TouchScrollbar {...(t.height > 0 ? { fill: true } : { maxHeight: 400 })}>
            <MarkdownViewContent
              src={String(data.properties['src'] ?? '')}
              userName={data.userName}
            />
          </TouchScrollbar>
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
  lang?: 'python';
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
      {/* exec_in — top edge */}
      <Handle type="target" position={Position.Top} id="exec_in"
        title="Connect exec_out of a previous node here to chain execution"
        style={{ width: 14, height: 14, background: '#ffffffcc', border: '2px solid #7c4dff', borderRadius: 2, pointerEvents: 'all', cursor: 'crosshair' }} />
      <Box sx={{ height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff06', borderBottom: '1px solid #ffffff11', borderRadius: '4px 4px 0 0', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 7, color: '#ffffff44', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec in</Typography>
      </Box>
      {/* Header — also serves as drag handle */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.75, borderBottom: '1px solid #7c4dff44', bgcolor: '#7c4dff18', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CodeIcon sx={{ fontSize: 13, color: data.lang === 'python' ? '#4fc3f7' : '#ce93d8', flexShrink: 0 }} />
          {data.lang === 'python' && (
            <Box component="span" sx={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: '#0d0d0d', bgcolor: '#4fc3f7', borderRadius: 0.5, px: 0.4, py: '1px', flexShrink: 0 }}>PY</Box>
          )}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {scope && <Typography component="div" sx={{ fontSize: 9, color: '#ce93d866', fontFamily: 'monospace', lineHeight: 1 }}>{scope}</Typography>}
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: data.lang === 'python' ? '#4fc3f7' : '#ce93d8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fn}()</Typography>
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
      {/* exec_out — bottom edge */}
      <Box sx={{ height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff0a', borderTop: '1px solid #ffffff18', borderRadius: '0 0 4px 4px', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 7, color: '#ffffffaa', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec out ▶</Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="exec_out"
        title="Drag to exec_in of next node to chain execution"
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
  onEdit?: () => void;   // gdy podane → w popupie pojawia się przycisk „Edytuj…"
}> = ({ jsonValue, accentColor = '#81c784', label = 'Value', onEdit }) => {
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
          {onEdit && (
            <Button size="small" variant="outlined" fullWidth startIcon={<EditIcon sx={{ fontSize: 14 }} />}
              onClick={() => { setAnchorEl(null); onEdit(); }}
              sx={{ mt: 1.5, fontSize: 11, py: 0.25, textTransform: 'none', borderColor: accentColor + '66', color: accentColor, '&:hover': { borderColor: accentColor, bgcolor: accentColor + '11' } }}>
              Edytuj wartość…
            </Button>
          )}
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
  onEditValue: () => void;   // otwiera edytor wartości (VarInitDialog)
  onValueChange: (json: string) => void;  // inline edycja Array/Object na bloczku
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
      {/* Wartość: dla Array/Object — inline edytor (także wielowymiarowy) wprost na
          bloczku; dla skalarów — przycisk podglądu „Value" (edycja w VarInitDialog). */}
      {parsedVal !== null && typeof parsedVal === 'object' ? (
        <Box className="nodrag" onPointerDown={(e) => e.stopPropagation()}
          sx={{ px: 1, py: 0.75, borderBottom: '1px solid #81c78411', maxHeight: 240, overflow: 'auto',
            display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 8, color: '#81c784', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {Array.isArray(parsedVal) ? `Array [${(parsedVal as unknown[]).length}]` : `Object {${Object.keys(parsedVal as object).length}}`}
            </Typography>
            <Tooltip title="Zmień typ / edytuj w oknie">
              <IconButton size="small" className="nodrag" sx={{ p: 0.125 }} onClick={data.onEditValue}>
                <EditIcon sx={{ fontSize: 11, color: '#81c78499' }} />
              </IconButton>
            </Tooltip>
          </Box>
          <JsonValueEditor value={parsedVal} accent="#81c784"
            onChange={(v) => data.onValueChange(JSON.stringify(v))} />
        </Box>
      ) : (
        <ValuePreviewButton jsonValue={data.varValue} accentColor="#81c784" label="Value" onEdit={data.onEditValue} />
      )}
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
      {/* exec_in — top edge */}
      <Handle type="target" position={Position.Top} id="exec_in"
        title="Connect exec_out of a previous node here"
        style={{ width: 14, height: 14, background: '#ffffffcc', border: '2px solid #7c4dff', borderRadius: 2, pointerEvents: 'all', cursor: 'crosshair' }} />
      <Box sx={{ height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff06', borderBottom: '1px solid #ffffff11', borderRadius: '4px 4px 0 0', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 6, color: '#ffffff44', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec in</Typography>
      </Box>
      {/* Header */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: `${accent}12`, borderBottom: `1px solid ${accent}22`, cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
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
      {/* exec_out — bottom edge */}
      <Box sx={{ height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff0a', borderTop: '1px solid #ffffff18', borderRadius: '0 0 4px 4px', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 6, color: '#ffffffaa', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec out ▶</Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="exec_out"
        title="Drag to exec_in of next node to chain execution"
        style={{ width: 14, height: 14, background: '#ffffffee', border: '2px solid #7c4dff', borderRadius: 2, pointerEvents: 'all', cursor: 'crosshair' }} />
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
      {/* exec_in — top edge */}
      <Handle type="target" position={Position.Top} id="exec_in"
        title="Connect exec_out of a previous node here"
        style={{ width: 14, height: 14, background: '#ffffffcc', border: '2px solid #7c4dff', borderRadius: 2, pointerEvents: 'all', cursor: 'crosshair' }} />
      <Box sx={{ height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff06', borderBottom: '1px solid #ffffff11', borderRadius: '4px 4px 0 0', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 6, color: '#ffffff44', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec in</Typography>
      </Box>
      {/* Header */}
      <Box className="dash-drag-handle" sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: `${accent}12`, borderBottom: `1px solid ${accent}22`, cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
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
      {/* exec_out — bottom edge */}
      <Box sx={{ height: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#ffffff0a', borderTop: '1px solid #ffffff18', borderRadius: '0 0 4px 4px', pointerEvents: 'none' }}>
        <Typography sx={{ fontSize: 6, color: '#ffffffaa', letterSpacing: 1.5, userSelect: 'none', textTransform: 'uppercase' }}>exec out ▶</Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="exec_out"
        title="Drag to exec_in of next node to chain execution"
        style={{ width: 14, height: 14, background: '#ffffffee', border: '2px solid #7c4dff', borderRadius: 2, pointerEvents: 'all', cursor: 'crosshair' }} />
    </Box>
  );
};

// ─── Group node — labeled container box that moves its children with it ─────────
interface GroupNodeData extends Record<string, unknown> {
  objectId: string;
  objectName: string;
  transform: DashTransform;
  selected: boolean;
  childCount: number;
  showFrame: boolean;   // pokazuje/ukrywa wizualną ramkę grupy (border + tło)
  style?: 'normal' | 'tab' | 'table';  // kontener: Normal | Tab (zakładki) | Table (siatka)
  isPanel?: boolean;    // ta grupa jest aktywną zakładką/komórką rodzica-kontenera (bez ramki/nagłówka)
  rows?: number;        // Table: liczba wierszy siatki
  columns?: number;     // Table: liczba kolumn siatki
  activeTab?: number;   // Tab: indeks aktywnej zakładki
  tabCaptions?: string[]; // Tab/Table: podpisy zakładek/komórek (objectName grup-dzieci)
  onActiveTabChange?: (i: number) => void;
  onObjectNameChange: (name: string) => void;
  onResizeDrag: (width: number, height: number) => void;
}

const GroupNode: React.FC<NodeProps<Node<GroupNodeData>>> = ({ data }) => {
  const { getZoom } = useReactFlow();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(data.objectName);
  useEffect(() => { setNameVal(data.objectName); }, [data.objectName]);
  const t = data.transform;
  const w = t.width > 0 ? t.width : 320;
  const h = t.height > 0 ? t.height : 240;

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation();
    const el = e.currentTarget; el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const startW = w, startH = h;
    window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: true }));
    let raf = 0; let pending: { w: number; h: number } | null = null;
    const flush = () => { raf = 0; if (pending) { data.onResizeDrag(pending.w, pending.h); pending = null; } };
    const onMove = (me: PointerEvent) => {
      const zoom = getZoom();
      const newW = Math.max(120, Math.round(startW + (me.clientX - startX) / zoom));
      const newH = Math.max(80, Math.round(startH + (me.clientY - startY) / zoom));
      pending = { w: newW, h: newH };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (me: PointerEvent) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (pending) { data.onResizeDrag(pending.w, pending.h); pending = null; }
      window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: false }));
      el.releasePointerCapture(me.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, [w, h, getZoom, data]);

  const commitName = () => { setEditingName(false); if (nameVal.trim() && nameVal !== data.objectName) data.onObjectNameChange(nameVal.trim()); };

  // „Show frame" wyłączony → grupa jest CAŁKOWICIE niewidzialna (bez ramki, tła,
  // cienia, nagłówka i uchwytu) — czysto logiczne grupowanie. Nadal działa: przesuwa
  // dzieci i da się ją zaznaczyć (na scenie lub w drzewie SCENE, potem włączyć ramkę).
  const showVisual = data.showFrame;

  return (
    <Box sx={{
      width: w, height: h, position: 'relative',
      border: '2px dashed', borderColor: !showVisual ? 'transparent' : (data.selected ? '#4fc3f7' : '#7c4dff77'),
      borderRadius: 1.5, bgcolor: !showVisual ? 'transparent' : (data.selected ? '#4fc3f70d' : '#7c4dff0a'),
      boxShadow: (showVisual && data.selected) ? '0 0 0 2px #4fc3f755' : 'none',
      cursor: 'grab', '&:active': { cursor: 'grabbing' }, userSelect: 'none',
      ...(t.rot !== 0 || t.scale !== 1
        ? { transform: `${t.rot !== 0 ? `rotate(${t.rot}deg) ` : ''}${t.scale !== 1 ? `scale(${t.scale})` : ''}`.trim() }
        : {}),
    }}>
      {/* Header label (sits just above the box) */}
      {showVisual && <Box sx={{
        position: 'absolute', top: 0, left: -2, transform: 'translateY(-100%)',
        display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.25,
        bgcolor: data.selected ? '#4fc3f7' : '#7c4dff', color: '#fff',
        borderRadius: '4px 4px 0 0', maxWidth: w + 4, whiteSpace: 'nowrap',
      }}>
        <GroupIcon sx={{ fontSize: 13 }} />
        {editingName
          ? <TextField value={nameVal} autoFocus variant="standard" onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setNameVal(e.target.value)} onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
              inputProps={{ style: { fontSize: 11, color: '#fff', padding: 0 } }} sx={{ width: 120 }} />
          : <Typography sx={{ fontSize: 11, fontWeight: 600, cursor: 'text' }}
              onPointerDown={(e) => e.stopPropagation()} onDoubleClick={() => setEditingName(true)}>
              {data.objectName}
            </Typography>}
        <Typography sx={{ fontSize: 10, opacity: 0.8 }}>· {data.childCount}</Typography>
      </Box>}
      {/* Tab: pasek zakładek u góry kontenera. Każda zakładka = bezpośrednia grupa-dziecko. */}
      {data.style === 'tab' && !data.isPanel && (
        <Box className="nodrag nopan" onPointerDown={(e) => e.stopPropagation()}
          sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30, borderBottom: '1px solid #7c4dff44',
            bgcolor: 'rgba(30,30,34,0.6)', borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
          {(data.tabCaptions?.length ?? 0) > 0 ? (
            <Tabs value={Math.min(data.activeTab ?? 0, Math.max(0, (data.tabCaptions?.length ?? 1) - 1))}
              onChange={(_, v) => data.onActiveTabChange?.(v as number)}
              variant="scrollable" scrollButtons={false}
              sx={{ minHeight: 30, '& .MuiTabs-indicator': { bgcolor: '#7c4dff' } }}>
              {(data.tabCaptions ?? []).map((c, i) => (
                <Tab key={i} label={c || `Tab ${i + 1}`}
                  sx={{ minHeight: 30, py: 0, px: 1.25, fontSize: 11, textTransform: 'none', color: 'rgba(255,255,255,0.6)', '&.Mui-selected': { color: '#fff' } }} />
              ))}
            </Tabs>
          ) : (
            <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', px: 1, lineHeight: '30px' }}>
              Dodaj grupy-dzieci jako zakładki
            </Typography>
          )}
        </Box>
      )}
      {/* Table: linie siatki (rows × columns) jako tło — każda komórka = grupa-dziecko. */}
      {data.style === 'table' && !data.isPanel && (() => {
        const cols = Math.max(1, data.columns ?? 2), rowsN = Math.max(1, data.rows ?? 2);
        const lines: React.ReactNode[] = [];
        for (let c = 1; c < cols; c++) lines.push(<Box key={`v${c}`} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${(c / cols) * 100}%`, width: '1px', bgcolor: '#7c4dff55', pointerEvents: 'none' }} />);
        for (let r = 1; r < rowsN; r++) lines.push(<Box key={`h${r}`} sx={{ position: 'absolute', left: 0, right: 0, top: `${(r / rowsN) * 100}%`, height: '1px', bgcolor: '#7c4dff55', pointerEvents: 'none' }} />);
        return <>{lines}</>;
      })()}
      {/* Resize handle (bottom-right corner) — tylko gdy ramka widoczna/zaznaczona */}
      {showVisual && <div className="nodrag nopan" onPointerDown={onResizePointerDown} style={{
        position: 'absolute', width: 16, height: 16, bottom: -8, right: -8,
        cursor: 'se-resize', background: data.selected ? '#4fc3f7' : '#7c4dff', borderRadius: 2, touchAction: 'none',
      }} />}
    </Box>
  );
};

// ─── QtWidgetNode ─────────────────────────────────────────────────────────────
// A live MinisQt (core/browser/qt) widget rendered directly on the flow canvas —
// the same surface as Var/GetProp/FunctionCall. A parent widget renders its
// qt-widget children *nested inside* it (real Qt parent/child), and an edge/
// corner gizmo resizes the widget graphically (writes back to its transform).
interface QtWidgetSpec {
  id: string;
  className: string;
  properties: Record<string, unknown>;
  transform: DashTransform;
  parentId?: string;
}

interface QtWidgetNodeData extends Record<string, unknown> {
  objectId: string;
  objectName: string;
  className: string;
  spec: QtWidgetSpec;         // the root widget of this node
  children: QtWidgetSpec[];   // qt-widget descendants (BFS order: parents first)
  transform: DashTransform;
  nodeX: number;              // GLOBALNA pozycja węzła (akumulacja rodziców) — do hit-testu Select QT
  nodeY: number;
  selected: boolean;
  selectMode?: boolean;                // "Select QT" mode active → click selects nested widgets
  selectedDescendants?: string[];      // ids of this subtree's selected children (for highlight)
  onSelectWidget?: (id: string, additive: boolean) => void;
  onResizeDrag: (width: number, height: number) => void;
  actionMode?: boolean;                // "Action" mode → widget is live, native clicks fire signals
  signalHandlersMap?: Record<string, Record<string, { sourceId: string; symbolPath: string }>>;
  onSignal?: (sceneId: string, signal: string, args: unknown[]) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Odtwarza właściwą instancję typu Qt z zapisanej wartości (JSON `{_x,..}` / hex),
// by generyczny setter (def.set) dostał to, czego oczekuje.
function reviveQtValue(g: any, type: string, val: any): any {
  const t = (type || '').toLowerCase();
  if (val == null) return val;
  const o = (typeof val === 'string') ? (() => { try { return JSON.parse(val); } catch { return null; } })() : val;
  if (t === 'qcolor' || t === 'color') {
    if (typeof val === 'string') return val;                          // setter przyjmuje hex/nazwę
    if (o && o._r != null && g.QColor) return g.QColor.fromRgb(o._r, o._g, o._b, o._a ?? 255);
    return val;
  }
  if ((t === 'qrect' || t === 'qrectf') && o && g.QRect) return new g.QRect(o._x || 0, o._y || 0, o._w || 0, o._h || 0);
  if ((t === 'qsize' || t === 'qsizef') && o && g.QSize) return new g.QSize(o._w || 0, o._h || 0);
  if ((t === 'qpoint' || t === 'qpointf') && o && g.QPoint) return new g.QPoint(o._x || 0, o._y || 0);
  if ((t === 'qmargins' || t === 'qmarginsf') && o && g.QMargins) return new g.QMargins(o._l || 0, o._t || 0, o._r || 0, o._b || 0);
  if (t === 'qfont' && o && g.QFont) {
    const f = new g.QFont(o._family || undefined, o._size || 14, o._weight || 400);
    if (o._italic != null && typeof f.setItalic === 'function') f.setItalic(!!o._italic);
    if (o._underline != null && typeof f.setUnderline === 'function') f.setUnderline(!!o._underline);
    return f;
  }
  return val;
}

// Reflection-based widget builder. `geom` (when given) overrides the widget's own
// transform — used so the root fills the node's canvas while children keep their
// own geometry (relative to their Qt parent).
// Grupuje meta-właściwości/sygnały klasy Qt wg klasy, która je DEKLARUJE (jak w Qt
// Designer). Zwraca grupy od najbardziej pochodnej klasy do bazowej; każda nazwa
// trafia do pierwszej (najbardziej pochodnej) klasy, która ją deklaruje.
function qtMetaGroups(Cls: any, kind: 'properties' | 'signals'): Array<{ className: string; own: Record<string, any>; names: string[] }> {
  const chain: any[] = [];
  let c = Cls;
  while (typeof c === 'function' && c !== Object && c !== Function.prototype) {
    chain.push(c);
    c = Object.getPrototypeOf(c);
  }
  const claimed = new Set<string>();
  const groups: Array<{ className: string; own: Record<string, any>; names: string[] }> = [];
  for (const k of chain) {  // od najbardziej pochodnej do bazowej
    const own = Object.prototype.hasOwnProperty.call(k, kind) ? k[kind] : null;
    if (!own || typeof own !== 'object') continue;
    const names = Object.keys(own).filter((n) => !claimed.has(n));
    if (!names.length) continue;
    names.forEach((n) => claimed.add(n));
    groups.push({ className: k.name || '?', own, names });
  }
  return groups;
}

function buildQtInstance(spec: QtWidgetSpec, g: any, geom: { x: number; y: number; w: number; h: number } | null): any {
  const Cls = g[spec.className];
  if (typeof Cls !== 'function') return null;
  const p = (spec.properties ?? {}) as Record<string, any>;
  const hasText = /Button|Label|CheckBox|GroupBox/.test(spec.className);
  let w: any;
  try { w = hasText && p.text != null ? new Cls(String(p.text)) : new Cls(); }
  catch { try { w = new Cls(); } catch { return null; } }
  const call = (m: string, ...a: any[]) => { if (typeof w[m] === 'function') { try { w[m](...a); } catch { /* best-effort */ } } };
  call('setObjectName', spec.id);
  if (p.text != null) call('setText', String(p.text));
  if (p.min != null) call('setMinimum', Number(p.min));
  if (p.max != null) call('setMaximum', Number(p.max));
  if (p.value != null) call('setValue', Number(p.value));
  if (p.checked != null) call('setChecked', !!p.checked);
  // Generycznie aplikuj pozostałe zadeklarowane Q_PROPERTY (color, font, alignment,
  // frameShape, toolTip, contentsMargins…) — pomijając te sterowane transformem node'a.
  try {
    const meta = g.QObject?.metaProperties?.(Cls) || {};
    const skip = new Set(['objectName', 'geometry', 'pos', 'size', 'x', 'y', 'width', 'height', 'text', 'value', 'minimum', 'maximum', 'checked', 'min', 'max']);
    for (const key of Object.keys(p)) {
      if (skip.has(key)) continue;
      const def = meta[key];
      if (!def || typeof def.set !== 'function') continue;
      const raw = p[key];
      if (raw === undefined || raw === null || raw === '') continue;
      try { def.set(w, reviveQtValue(g, def.type, raw)); } catch { /* best-effort */ }
    }
  } catch { /* ignore */ }
  const t = spec.transform;
  const gx = geom ? geom.x : t.x, gy = geom ? geom.y : t.y;
  const gw = geom ? geom.w : t.width, gh = geom ? geom.h : t.height;
  call('setGeometry', Math.round(gx), Math.round(gy), Math.max(8, Math.round(gw)), Math.max(8, Math.round(gh)));
  return w;
}

// Mapuje właściwości węzła .qtui.json na `properties` DashObjectu (klucze zgodne z
// buildQtInstance / panelem Properties: text/checked/min/max/value/color/…).
function qtuiNodeToDashProps(node: QtUiWidgetNode, g: any): Record<string, DashValue> {
  const p: Record<string, DashValue> = {};
  if (node.text != null) p.text = node.text;
  if (node.checked != null) p.checked = node.checked;
  if (node.min != null) p.min = node.min;
  if (node.max != null) p.max = node.max;
  if (node.value != null) p.value = node.value;
  if (node.textVisible != null) p.textVisible = node.textVisible;
  // qtui `color`: dla QPushButton to kolor tła, dla reszty (QLabel…) kolor tekstu.
  if (node.color != null) { if (node.class === 'QPushButton') p.backgroundColor = node.color; else p.color = node.color; }
  if (node.background != null) p.backgroundColor = node.background;
  if (node.font) p.font = { _family: 'system-ui, sans-serif', _size: node.font.pixelSize ?? 14, _weight: node.font.bold ? 700 : 400, _italic: false, _underline: false } as unknown as DashValue;
  if (node.alignment && g?.Qt && typeof g.Qt[node.alignment] === 'number') p.alignment = g.Qt[node.alignment] as number;
  return p;
}

// Konwertuje scenę .qtui.json na poddrzewo DashObjectów (qt-widget). Buduje scenę na
// żywo (buildQtWidget) i ustawia geometrię roota — layouty liczą się synchronicznie
// (setGeometry → _relayout), więc odczytujemy policzoną geometrię każdego widgetu
// (względem rodzica) i spłaszczamy drzewo do DashObjectów. Root ląduje na (spawnX,
// spawnY); dzieci zachowują geometrię względną → renderują się w JEDNYM node'u.
function qtuiSceneToDashObjects(scene: QtUiScene, g: any, spawnX: number, spawnY: number): DashObject[] {
  const W = scene.width || 320, H = scene.height || 240;
  // 1) Zbuduj żywe drzewo i policz geometrię.
  const geomById = new Map<string, { x: number; y: number; w: number; h: number }>();
  try {
    const root = buildQtWidget(scene.root, g);
    if (root && typeof root.setGeometry === 'function') {
      try { root.setGeometry(0, 0, W, H); } catch { /* ignore */ }
      const collect = (wdg: any) => {
        if (!wdg) return;
        const name = typeof wdg.objectName === 'function' ? wdg.objectName() : null;
        const gm = typeof wdg.geometry === 'function' ? wdg.geometry() : null;
        if (name && gm) geomById.set(name, { x: gm.x(), y: gm.y(), w: gm.width(), h: gm.height() });
        for (const c of (wdg._children || [])) collect(c);
      };
      collect(root);
    }
  } catch { /* fallback: użyjemy node.geometry */ }

  // 2) Spłaszcz drzewo QtWidgetNode → DashObject[] (BFS: rodzice przed dziećmi).
  const out: DashObject[] = [];
  const walk = (node: QtUiWidgetNode, parentId: string | null, isRoot: boolean) => {
    const measured = geomById.get(node.id);
    const geo = node.geometry;
    const rel = isRoot
      ? { x: spawnX, y: spawnY, w: W, h: H }
      : measured ?? (geo ? { x: geo[0], y: geo[1], w: geo[2], h: geo[3] } : { x: 8, y: 8, w: 120, h: 28 });
    const id = makeId();
    out.push({
      id, className: node.class, kind: 'qt-widget',
      objectName: node.id || node.class.replace(/^Q/, ''),
      transform: { x: Math.round(rel.x), y: Math.round(rel.y), rot: 0, scale: 1, width: Math.max(8, Math.round(rel.w)), height: Math.max(8, Math.round(rel.h)) },
      properties: qtuiNodeToDashProps(node, g),
      ...(parentId ? { parentId } : {}),
    });
    for (const c of node.children ?? []) walk(c, id, false);
  };
  walk(scene.root, null, true);
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const QT_RESIZE_DIRS = ['e', 's', 'se'] as const;
type QtResizeDir = typeof QT_RESIZE_DIRS[number];

// Diagnostyka renderowania qt-widgetów (np. znikanie na mobile przy przesuwaniu).
// Ustaw `window.__QT_DEBUG = false` w konsoli, by wyciszyć.
const QT_DEBUG_DEFAULT = true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qlog = (...args: any[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (globalThis as any).__QT_DEBUG;
  if (on === false) return;
  if (on === undefined && !QT_DEBUG_DEFAULT) return;
  // Serializuj obiekty inline — mobilne konsole często nie rozwijają obiektów,
  // więc treść musi być widoczna wprost na zrzucie ekranu.
  const parts = args.map((a) => {
    if (a === null || typeof a !== 'object') return String(a);
    try { return JSON.stringify(a); } catch { return String(a); }
  });
  // eslint-disable-next-line no-console
  console.log('[dash-qt] ' + parts.join(' '));
};

const QtWidgetNode: React.FC<NodeProps<Node<QtWidgetNodeData>>> = ({ data }) => {
  const { getZoom, screenToFlowPosition } = useReactFlow();
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);
  const buildCountRef = useRef(0);
  const [ready, setReady] = useState(false);
  const t = data.transform;
  const w = t.width > 0 ? t.width : 160;
  const h = t.height > 0 ? t.height : 120;

  useEffect(() => {
    qlog('mount', data.objectId, { w, h, children: data.children.length });
    return () => qlog('unmount', data.objectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureQtLib().then((g) => { if (!cancelled) { gRef.current = g; setReady(true); qlog('qtlib ready', data.objectId); } }).catch((e) => qlog('qtlib ERROR', data.objectId, String(e)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Content key that captures ONLY what affects the rendered widget subtree
  // (class, properties, size, children geometry) — NOT the node's own x/y nor the
  // `selected`/callback churn from rfNodesBase recomputes. This keeps the qt-canvas
  // from rebuilding (and blanking) on every selection/drag re-render.
  const specKey = useMemo(() => JSON.stringify({
    c: data.spec.className, p: data.spec.properties, w, h,
    ch: data.children.map((x) => ({ id: x.id, c: x.className, p: x.properties, t: x.transform, pid: x.parentId })),
  }), [data.spec.className, data.spec.properties, data.children, w, h]);

  // Klucz zależności do (re)podpięcia sygnałów: zmienia się gdy przełączamy tryb
  // Action albo gdy zmienią się handlery tego poddrzewa (spec + dzieci).
  const sigKey = useMemo(() => {
    const ids = [data.spec.id, ...data.children.map((c) => c.id)];
    const map = data.signalHandlersMap ?? {};
    return JSON.stringify({ a: !!data.actionMode, h: ids.map((id) => [id, map[id] ?? null]) });
  }, [data.spec.id, data.children, data.actionMode, data.signalHandlersMap]);

  // (Re)build the whole widget subtree whenever geometry or the spec changes.
  useEffect(() => {
    if (!ready || !hostRef.current) { qlog('build skip', data.objectId, { ready, host: !!hostRef.current }); return; }
    const g = gRef.current;
    const tag: string = g.QtCanvas?.__tag ?? 'qt-canvas';
    let canvas = canvasRef.current;
    const canvasExisted = !!canvas;
    if (!canvas) { canvas = document.createElement(tag); hostRef.current.innerHTML = ''; hostRef.current.appendChild(canvas); canvasRef.current = canvas; }
    canvas.style.cssText = `width:${w}px;height:${h}px;display:block;`;
    const n = ++buildCountRef.current;
    qlog('build#' + n, data.objectId, { w, h, canvasExisted, attached: !!(canvas.isConnected), childrenSpecs: data.children.length });
    const raf = requestAnimationFrame(() => {
      const root = canvas.root;
      if (!root) { qlog('build#' + n + ' NO ROOT (blank!)', data.objectId, { hasCanvas: !!canvas, connected: !!(canvas && canvas.isConnected), tag }); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (canvas.__built) for (const wd of canvas.__built as any[]) { try { wd.setParent?.(null); } catch { /* ignore */ } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const built: any[] = [];
      const rootW = buildQtInstance(data.spec, g, { x: 0, y: 0, w, h });
      if (rootW) { try { rootW.setParent?.(root); } catch { /* ignore */ } byId.set(data.spec.id, rootW); built.push(rootW); }
      for (const c of data.children) {
        const cw = buildQtInstance(c, g, null);
        if (!cw) continue;
        const parent = (c.parentId && byId.get(c.parentId)) || rootW || root;
        try { cw.setParent?.(parent); } catch { /* ignore */ }
        byId.set(c.id, cw); built.push(cw);
      }
      canvas.__built = built;
      canvas.__byId = byId;
      // ── Tryb Action: podepnij sygnały żywych widgetów pod handlery z data source ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (canvas.__sigConns) for (const c of canvas.__sigConns as any[]) { try { c.disconnect?.(); } catch { /* ignore */ } }
      canvas.__sigConns = [];
      if (data.actionMode && data.onSignal) {
        const map = data.signalHandlersMap ?? {};
        for (const [sid, widget] of byId) {
          const hs = map[sid];
          if (!hs) continue;
          for (const sigName of Object.keys(hs)) {
            const sig = widget[sigName];
            if (sig && typeof sig.connect === 'function') {
              try { canvas.__sigConns.push(sig.connect((...sargs: unknown[]) => data.onSignal!(sid, sigName, sargs))); } catch { /* ignore */ }
            }
          }
        }
        qlog('build#' + n + ' action wired', data.objectId, { conns: canvas.__sigConns.length });
      }
      try { root.update?.(); } catch (e) { qlog('build#' + n + ' root.update ERROR', data.objectId, String(e)); }
      qlog('build#' + n + ' done', data.objectId, { builtCount: built.length, rootChildren: (root.children && root.children.length) });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, specKey, sigKey]);

  const startResize = useCallback((dir: QtResizeDir) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation();
    const el = e.currentTarget; el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY, startW = w, startH = h;
    // Sygnalizuj resize głównemu edytorowi → wyłącza drag/pan węzłów (na touch RF
    // potrafił mimo to przesuwać bloczki). rAF-throttle: 1 update/klatkę (mniej
    // przebudów qt-canvasu → brak „pływania"/jittera).
    window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: true }));
    let raf = 0; let pending: { nw: number; nh: number } | null = null;
    const flush = () => { raf = 0; if (pending) { data.onResizeDrag(pending.nw, pending.nh); pending = null; } };
    const onMove = (me: PointerEvent) => {
      const zoom = getZoom() || 1;
      const nw = dir.includes('e') ? Math.max(16, Math.round(startW + (me.clientX - startX) / zoom)) : startW;
      const nh = dir.includes('s') ? Math.max(16, Math.round(startH + (me.clientY - startY) / zoom)) : startH;
      pending = { nw, nh };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (me: PointerEvent) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (pending) { data.onResizeDrag(pending.nw, pending.nh); pending = null; }
      window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: false }));
      el.releasePointerCapture(me.pointerId); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
  }, [w, h, getZoom, data]);

  // Absolute geometry (canvas-local) of every widget in this subtree — the root
  // fills the node (0,0,w,h); each child accumulates its parent's origin. Used for
  // both hit-testing (Select QT mode) and drawing selection highlights.
  const absRects = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number; depth: number }>();
    map.set(data.spec.id, { x: 0, y: 0, w, h, depth: 0 });
    for (const c of data.children) {
      const p = (c.parentId && map.get(c.parentId)) || map.get(data.spec.id)!;
      map.set(c.id, { x: p.x + c.transform.x, y: p.y + c.transform.y, w: c.transform.width, h: c.transform.height, depth: p.depth + 1 });
    }
    return map;
  }, [data.spec, data.children, w, h]);

  const onSelectPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!data.selectMode || !data.onSelectWidget) return;
    // Convert the click to node-local logical coords via ReactFlow's own
    // screen→flow mapping (robust to any zoom/pan), then subtract the node's flow
    // position. Falls back to a rect measurement if the helper is unavailable.
    let px: number, py: number;
    if (typeof screenToFlowPosition === 'function') {
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Węzeł renderowany jest na pozycji GLOBALNEJ (nodeX/nodeY), nie na lokalnym
      // transformie — dla widgetu w grupie transform jest lokalny.
      px = flow.x - data.nodeX;
      py = flow.y - data.nodeY;
    } else if (hostRef.current) {
      const rect = hostRef.current.getBoundingClientRect();
      const zoom = getZoom() || 1;
      px = (e.clientX - rect.left) / zoom;
      py = (e.clientY - rect.top) / zoom;
    } else return;
    // Deepest widget whose rect contains the point wins (children render on top).
    let hit: string | null = null; let bestDepth = -1;
    for (const [id, r] of absRects) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h && r.depth > bestDepth) { hit = id; bestDepth = r.depth; }
    }
    if (hit) { e.stopPropagation(); e.preventDefault(); data.onSelectWidget(hit, e.shiftKey || e.ctrlKey || e.metaKey); }
  }, [data, getZoom, screenToFlowPosition, absRects]);

  const selDesc = data.selectedDescendants ?? [];
  return (
    <Box sx={{ width: w, height: h, position: 'relative', userSelect: 'none',
      border: '1px solid',
      borderColor: data.actionMode ? '#66bb6a' : data.selected ? '#26c6da' : 'rgba(38,198,218,0.35)',
      borderRadius: 0.5, boxShadow: data.actionMode ? '0 0 0 1px #66bb6a88' : data.selected ? '0 0 0 2px #26c6da88' : 'none',
      cursor: data.actionMode ? 'pointer' : data.selectMode ? 'pointer' : 'grab',
      '&:active': { cursor: data.actionMode ? 'pointer' : data.selectMode ? 'pointer' : 'grabbing' }, bgcolor: '#0d1416' }}>
      {/* Label chip (sits just above the widget) */}
      <Box sx={{ position: 'absolute', top: 0, left: -1, transform: 'translateY(-100%)',
        display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: '1px', whiteSpace: 'nowrap',
        bgcolor: data.actionMode ? '#66bb6a' : data.selected ? '#26c6da' : '#0d3d44', color: '#fff', borderRadius: '4px 4px 0 0' }}>
        <WidgetsIcon sx={{ fontSize: 12 }} />
        <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{data.objectName}</Typography>
        <Typography sx={{ fontSize: 9, opacity: 0.75 }}>:{data.className}</Typography>
      </Box>
      {/* Live qt-canvas — pointer-transparent normally (node stays draggable); in
          Select QT mode it captures clicks to hit-test the nested widget; in Action
          mode it goes fully live (native mouse events fire the widget's signals). */}
      <Box ref={hostRef}
        // nodrag nopan → ReactFlow nie przeciąga/panuje gdy dotykasz widgetu (Action:
        // dotyk = eventy do widgetu; Select QT: klik = zaznaczenie zagnieżdżonego widgetu).
        className={(data.selectMode || data.actionMode) ? 'nodrag nopan' : undefined}
        onPointerDown={data.selectMode ? onSelectPointerDown : data.actionMode ? ((e) => e.stopPropagation()) : undefined}
        sx={{ position: 'absolute', inset: 0, pointerEvents: (data.selectMode || data.actionMode) ? 'auto' : 'none', overflow: 'hidden' }} />
      {/* Selection highlights for nested child widgets — tylko w trybie Select QT.
          Po wyłączeniu trybu highlight znika (inaczej zaznaczony widget zostawał
          podświetlony innym kolorem). */}
      {data.selectMode && selDesc.map((id) => {
        const r = absRects.get(id);
        if (!r) return null;
        return <Box key={`sel-${id}`} sx={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
          border: '1.5px solid #ffab40', boxShadow: '0 0 0 1px #ffab4066', borderRadius: '2px', pointerEvents: 'none', zIndex: 4 }} />;
      })}
      {/* Resize gizmo (edge + corner handles, shown when selected). */}
      {data.selected && QT_RESIZE_DIRS.map((dir) => {
        // touchAction:'none' → przeglądarka nie potraktuje dotyku jako scroll/pan, więc
        // pointermove dochodzi do resize'u. className="nodrag nopan" → ReactFlow nie
        // zacznie przeciągać węzła z uchwytu (na touch stopPropagation nie wystarcza).
        const st: React.CSSProperties = { position: 'absolute', background: '#26c6da', border: '1px solid #fff', borderRadius: 2, pointerEvents: 'auto', zIndex: 5, touchAction: 'none' };
        if (dir === 'e') Object.assign(st, { right: -7, top: '50%', marginTop: -7, width: 14, height: 14, cursor: 'ew-resize' });
        if (dir === 's') Object.assign(st, { bottom: -7, left: '50%', marginLeft: -7, width: 14, height: 14, cursor: 'ns-resize' });
        if (dir === 'se') Object.assign(st, { right: -8, bottom: -8, width: 16, height: 16, cursor: 'nwse-resize' });
        return <div key={dir} className="nodrag nopan" onPointerDown={startResize(dir)} style={st} />;
      })}
    </Box>
  );
};

const NODE_TYPES = { dashObject: DashObjectNode, group: GroupNode, qtWidget: QtWidgetNode, shape: ShapeNode, fcNode: FunctionCallNode, varNode: VarNode, objNode: ObjNode, getPropNode: GetPropNode, setPropNode: SetPropNode };

// ─── JsonValueEditor: rekurencyjny edytor wartości JSON ───────────────────────
// Edytuje dowolną wartość JSON: skalary, TABLICE (także wielowymiarowe — element
// może sam być tablicą/obiektem) oraz OBIEKTY. Zmiana typu elementu przez mały
// selektor „kind". Skalary komitują onBlur (bez skoków kursora); zmiany struktury
// (dodaj/usuń/typ/rename) komitują natychmiast w górę przez onChange.
type JKind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';

const jsonKind = (v: unknown): JKind =>
  v === null ? 'null'
    : Array.isArray(v) ? 'array'
    : typeof v === 'object' ? 'object'
    : typeof v === 'number' ? 'number'
    : typeof v === 'boolean' ? 'boolean'
    : 'string';

const defaultForKind = (k: JKind): unknown =>
  k === 'string' ? '' : k === 'number' ? 0 : k === 'boolean' ? false : k === 'null' ? null : k === 'array' ? [] : {};

const JKIND_OPTS: JKind[] = ['string', 'number', 'boolean', 'null', 'array', 'object'];

const KindPicker: React.FC<{ kind: JKind; onChange: (k: JKind) => void }> = ({ kind, onChange }) => (
  <Select size="small" variant="standard" value={kind} className="nodrag" disableUnderline
    onChange={(e) => onChange(e.target.value as JKind)}
    sx={{
      fontSize: 9, mt: 0.25, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 0.75,
      border: '1px solid rgba(255,255,255,0.18)',
      '& .MuiSelect-select': { py: '1px', pl: 0.5, pr: '16px !important', fontSize: 9, color: 'rgba(255,255,255,0.85)', fontFamily: 'monospace' },
      '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.6)' },
      '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' },
    }}>
    {JKIND_OPTS.map((k) => <MenuItem key={k} value={k} sx={{ fontSize: 11 }}>{k}</MenuItem>)}
  </Select>
);

// Wspólny styl inputu edytora JSON — czytelny na ciemnym tle bloczka (tło + ramka).
const jsonInputSx = {
  '& .MuiInput-root': { bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 0.75, px: 0.5 },
  '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.28)' },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottomColor: 'rgba(255,255,255,0.5)' },
} as const;

const ScalarInput: React.FC<{ value: unknown; kind: JKind; onCommit: (v: unknown) => void; accent: string }> = ({ value, kind, onCommit, accent }) => {
  const [draft, setDraft] = useState(kind === 'number' ? String(value ?? 0) : String(value ?? ''));
  useEffect(() => { setDraft(kind === 'number' ? String(value ?? 0) : String(value ?? '')); }, [value, kind]);
  if (kind === 'boolean') {
    return (
      <ToggleButtonGroup exclusive size="small" value={value ? 'true' : 'false'} className="nodrag"
        onChange={(_, v) => { if (v) onCommit(v === 'true'); }}>
        <ToggleButton value="true" sx={{ py: 0, px: 0.75, fontSize: 9, color: '#ffb74d', '&.Mui-selected': { color: '#ffb74d', bgcolor: '#ffb74d22' } }}>true</ToggleButton>
        <ToggleButton value="false" sx={{ py: 0, px: 0.75, fontSize: 9, color: '#ef535088', '&.Mui-selected': { color: '#ef5350', bgcolor: '#ef535022' } }}>false</ToggleButton>
      </ToggleButtonGroup>
    );
  }
  if (kind === 'null') return <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)', mt: 0.5 }}>null</Typography>;
  return (
    <TextField size="small" variant="standard" fullWidth className="nodrag"
      type={kind === 'number' ? 'number' : 'text'} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(kind === 'number' ? (parseFloat(draft) || 0) : draft)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      sx={jsonInputSx}
      inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', color: accent, padding: '1px 2px' } }} />
  );
};

const ObjectKeyInput: React.FC<{ keyName: string; onRename: (k: string) => void }> = ({ keyName, onRename }) => {
  const [draft, setDraft] = useState(keyName);
  useEffect(() => setDraft(keyName), [keyName]);
  return (
    <TextField size="small" variant="standard" className="nodrag" value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onRename(draft.trim())}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', color: '#7fd4ff', padding: '1px 2px' } }}
      sx={{ width: 54, flexShrink: 0, mt: 0.25, ...jsonInputSx }} />
  );
};

const JsonValueEditor: React.FC<{ value: unknown; onChange: (v: unknown) => void; depth?: number; accent?: string }> = ({ value, onChange, depth = 0, accent = '#81c784' }) => {
  const kind = jsonKind(value);
  if (kind === 'array') {
    const arr = value as unknown[];
    return (
      <Box sx={{ pl: depth ? 0.5 : 0, borderLeft: depth ? '1px solid #81c78433' : 'none' }}>
        {arr.map((item, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.25, mb: 0.25 }}>
            <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', mt: 0.5, minWidth: 12, textAlign: 'right', fontFamily: 'monospace' }}>{i}</Typography>
            <KindPicker kind={jsonKind(item)} onChange={(k) => onChange(arr.map((it, j) => j === i ? defaultForKind(k) : it))} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <JsonValueEditor value={item} depth={depth + 1} accent={accent}
                onChange={(nv) => onChange(arr.map((it, j) => j === i ? nv : it))} />
            </Box>
            <IconButton size="small" className="nodrag" sx={{ p: 0.125, color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#ef5350' } }} onClick={() => onChange(arr.filter((_, j) => j !== i))}>
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 11 }} />} className="nodrag"
          onClick={() => onChange([...arr, ''])} sx={{ fontSize: 9, py: 0, minWidth: 0, color: accent, textTransform: 'none' }}>item</Button>
      </Box>
    );
  }
  if (kind === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj);
    return (
      <Box sx={{ pl: depth ? 0.5 : 0, borderLeft: depth ? '1px solid #4fc3f733' : 'none' }}>
        {entries.map(([k, v], i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.25, mb: 0.25 }}>
            <ObjectKeyInput keyName={k} onRename={(nk) => { if (nk && nk !== k) onChange(Object.fromEntries(entries.map(([ek, ev]) => [ek === k ? nk : ek, ev]))); }} />
            <KindPicker kind={jsonKind(v)} onChange={(nk) => onChange(Object.fromEntries(entries.map(([ek, ev]) => [ek, ek === k ? defaultForKind(nk) : ev])))} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <JsonValueEditor value={v} depth={depth + 1} accent={accent}
                onChange={(nv) => onChange(Object.fromEntries(entries.map(([ek, ev]) => [ek, ek === k ? nv : ev])))} />
            </Box>
            <IconButton size="small" className="nodrag" sx={{ p: 0.125, color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#ef5350' } }} onClick={() => { const n = { ...obj }; delete n[k]; onChange(n); }}>
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        <Button size="small" startIcon={<AddIcon sx={{ fontSize: 11 }} />} className="nodrag"
          onClick={() => { let nk = 'key'; let n = 1; while (nk in obj) nk = `key${n++}`; onChange({ ...obj, [nk]: '' }); }}
          sx={{ fontSize: 9, py: 0, minWidth: 0, color: '#4fc3f7', textTransform: 'none' }}>key</Button>
      </Box>
    );
  }
  return <ScalarInput value={value} kind={kind} accent={accent} onCommit={onChange} />;
};

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
  // Edytowalna struktura dla Array/Object (obsługuje wielowymiarowość / zagnieżdżenia).
  const [structVal, setStructVal] = useState<unknown>([]);

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
      else if (Array.isArray(v)) { setSelType('Array'); setStructVal(v); }
      else { setSelType('Object'); setStructVal(v); }
    } catch { setSelType('QString'); setRawValue(currentJson); }
  }, [open, currentJson]);

  const handleTypeChange = (t: VarInitType) => {
    setSelType(t);
    const def = VAR_TYPES.find((x) => x.id === t)!;
    setRawValue(def.defaultRaw);
    if (t === 'Array') setStructVal([]);
    if (t === 'Object') setStructVal({});
  };

  const isStruct = selType === 'Array' || selType === 'Object';
  const preview = isStruct ? JSON.stringify(structVal) : buildVarJson(selType, rawValue);
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
        {selType === 'null' && (
          <Box sx={{ px: 1.5, py: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: accent }}>{preview}</Typography>
          </Box>
        )}
        {isStruct && (
          <Box sx={{ px: 1, py: 1, borderRadius: 1, bgcolor: 'action.hover', maxHeight: 320, overflow: 'auto' }}>
            <JsonValueEditor value={structVal} onChange={setStructVal} accent={accent} />
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

// ─── Nakładki canvas: krzyżyk 0,0 + linijki ──────────────────────────────────
// Renderowane WEWNĄTRZ ReactFlowProvider (obok ReactFlow), pozycjonowane z
// bieżącego viewportu (x,y,zoom): flow (fx,fy) → ekran (fx*zoom + x, fy*zoom + y).

// Krzyżyk w początku układu sceny (0,0).
const OriginCross: React.FC = () => {
  const { x, y } = useViewport();
  return (
    <Box sx={{ position: 'absolute', left: 0, top: 0, zIndex: 5, pointerEvents: 'none' }}>
      <Box sx={{ position: 'absolute', left: x - 14, top: y - 1, width: 28, height: 2, bgcolor: '#ff5252', opacity: 0.85 }} />
      <Box sx={{ position: 'absolute', left: x - 1, top: y - 14, width: 2, height: 28, bgcolor: '#ff5252', opacity: 0.85 }} />
      <Box sx={{ position: 'absolute', left: x + 5, top: y + 4, fontSize: 9, fontFamily: 'monospace', color: '#ff5252', fontWeight: 700 }}>0,0</Box>
    </Box>
  );
};

// „Ładny" krok linijki (1/2/5 × 10^n) tak, by etykiety były ~80px od siebie.
const niceStep = (zoom: number): number => {
  const raw = 80 / zoom;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const mul = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return mul * pow;
};

// Linijki na górnej i lewej krawędzi + znacznik pozycji kursora (flow units wokół 0,0).
const RulerOverlay: React.FC<{ cursor: { x: number; y: number } | null }> = ({ cursor }) => {
  const { x: vx, y: vy, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const RW = 18;
  const step = niceStep(zoom);
  const stepPx = step * zoom;
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000)}k` : String(Math.round(v)));

  // Ticki: pierwszy widoczny flow-multiple kroku.
  const ticksX: { px: number; label: string }[] = [];
  if (stepPx > 4 && width > 0) {
    const firstFx = Math.ceil((-vx / zoom) / step) * step;
    for (let fx = firstFx, guard = 0; fx * zoom + vx <= width && guard < 400; fx += step, guard++) {
      ticksX.push({ px: fx * zoom + vx, label: fmt(fx) });
    }
  }
  const ticksY: { px: number; label: string }[] = [];
  if (stepPx > 4 && height > 0) {
    const firstFy = Math.ceil((-vy / zoom) / step) * step;
    for (let fy = firstFy, guard = 0; fy * zoom + vy <= height && guard < 400; fy += step, guard++) {
      ticksY.push({ px: fy * zoom + vy, label: fmt(fy) });
    }
  }

  const rulerBg = '#12161c';
  const line = 'rgba(255,255,255,0.28)';
  const labelCol = 'rgba(255,255,255,0.7)';
  const curCol = '#4fc3f7';

  return (
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none' }}>
      {/* Narożnik */}
      <Box sx={{ position: 'absolute', left: 0, top: 0, width: RW, height: RW, bgcolor: rulerBg, borderRight: `1px solid ${line}`, borderBottom: `1px solid ${line}` }} />
      {/* Górna linijka */}
      <Box sx={{ position: 'absolute', left: RW, top: 0, right: 0, height: RW, bgcolor: rulerBg, borderBottom: `1px solid ${line}`, overflow: 'hidden' }}>
        {ticksX.map((t, i) => (
          <Box key={i} sx={{ position: 'absolute', left: t.px - RW, top: 0, height: '100%' }}>
            <Box sx={{ position: 'absolute', left: 0, bottom: 0, width: '1px', height: 6, bgcolor: line }} />
            <Typography sx={{ position: 'absolute', left: 2, top: 1, fontSize: 8, fontFamily: 'monospace', color: labelCol, whiteSpace: 'nowrap' }}>{t.label}</Typography>
          </Box>
        ))}
        {cursor && cursor.x >= RW && (
          <Box sx={{ position: 'absolute', left: cursor.x - RW, top: 0, width: '1px', height: '100%', bgcolor: curCol }} />
        )}
      </Box>
      {/* Lewa linijka */}
      <Box sx={{ position: 'absolute', left: 0, top: RW, bottom: 0, width: RW, bgcolor: rulerBg, borderRight: `1px solid ${line}`, overflow: 'hidden' }}>
        {ticksY.map((t, i) => (
          <Box key={i} sx={{ position: 'absolute', top: t.px - RW, left: 0, width: '100%' }}>
            <Box sx={{ position: 'absolute', top: 0, right: 0, height: '1px', width: 6, bgcolor: line }} />
            <Typography sx={{ position: 'absolute', top: 1, left: 1, fontSize: 8, fontFamily: 'monospace', color: labelCol, writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>{t.label}</Typography>
          </Box>
        ))}
        {cursor && cursor.y >= RW && (
          <Box sx={{ position: 'absolute', top: cursor.y - RW, left: 0, width: '100%', height: '1px', bgcolor: curCol }} />
        )}
      </Box>
    </Box>
  );
};

// Siatka WYŚWIETLACZA — grubsze linie (2px) co rzeczywisty rozmiar ekranu (w×h
// jednostek sceny), zaczynając od 0,0. Tworzy „prostokąty" o rozmiarze wyświetlacza.
const DisplayGridOverlay: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const { x: vx, y: vy, zoom } = useViewport();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  if (w <= 0 || h <= 0 || width === 0 || height === 0) return null;
  const col = 'rgba(79,195,247,0.65)'; // wyraźny błękit
  const linesX: number[] = [];
  const linesY: number[] = [];
  if (w * zoom > 3) {
    const firstK = Math.floor(-vx / zoom / w);
    for (let k = firstK, g = 0; k * w * zoom + vx <= width && g < 600; k++, g++) {
      const px = k * w * zoom + vx;
      if (px >= 0) linesX.push(px);
    }
  }
  if (h * zoom > 3) {
    const firstK = Math.floor(-vy / zoom / h);
    for (let k = firstK, g = 0; k * h * zoom + vy <= height && g < 600; k++, g++) {
      const px = k * h * zoom + vy;
      if (px >= 0) linesY.push(px);
    }
  }
  return (
    <Box sx={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>
      {linesX.map((px, i) => <Box key={`dx${i}`} sx={{ position: 'absolute', left: px, top: 0, width: '2px', height: '100%', bgcolor: col }} />)}
      {linesY.map((px, i) => <Box key={`dy${i}`} sx={{ position: 'absolute', top: px, left: 0, height: '2px', width: '100%', bgcolor: col }} />)}
    </Box>
  );
};

// ─── Main editor ─────────────────────────────────────────────────────────────

const DashEditorInner: React.FC<DashEditorPanelProps> = ({ userName, filePath, workspaceFs, workspaceProjectDeps, workspaceExtraPlugins, workspaceInitialPath }) => {
  const alliApi = useAlliApi();
  const { notify } = useNotification();
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const consoleScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (consoleScrollRef.current) {
      consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;
    }
  }, [consoleLogs]);
  const isMobile = useMediaQuery('(pointer: coarse)');
  const { setCenter, screenToFlowPosition, setViewport, getViewport } = useReactFlow();
  const rfStoreApi = useStoreApi();
  const flowWrapRef = useRef<HTMLDivElement>(null);

  // Niezawodny „fit" — liczony z DANYCH sceny + ustawiany RĘCZNIE przez setViewport
  // (omija kaprysy RF fitView/fitBounds na mobile). Odrzuca skrajne outliery, żeby
  // jeden „zbłąkany" (np. wyrzucony daleko) bloczek nie robił z reszty niewidocznej kropki.
  const fitAllNodes = useCallback(() => {
    const sc = sceneRef.current;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (const o of sc.objects) { const t = getTransform(o); rects.push({ x: t.x, y: t.y, w: t.width > 0 ? t.width : 180, h: t.height > 0 ? t.height : 80 }); }
    for (const f of sc.functionCalls ?? []) rects.push({ x: f.x, y: f.y, w: 220, h: 140 });
    for (const v of sc.vars ?? []) rects.push({ x: v.x, y: v.y, w: 160, h: 90 });
    for (const o of sc.classObjs ?? []) rects.push({ x: o.x, y: o.y, w: 200, h: 120 });
    for (const n of sc.getProps ?? []) rects.push({ x: n.x, y: n.y, w: 170, h: 110 });
    for (const n of sc.setProps ?? []) rects.push({ x: n.x, y: n.y, w: 170, h: 110 });
    const valid = rects.filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h));
    if (!valid.length) return;

    // Odrzuć skrajne outliery: policz medianę środków i MAD odległości, zostaw tylko
    // node'y w rozsądnym promieniu (albo wszystkie, gdy rozrzut jest równomierny).
    const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
    const cxAll = valid.map((r) => r.x + r.w / 2), cyAll = valid.map((r) => r.y + r.h / 2);
    const mx = med(cxAll), my = med(cyAll);
    const dists = valid.map((r) => Math.hypot(r.x + r.w / 2 - mx, r.y + r.h / 2 - my));
    const medDist = med(dists) || 0;
    const threshold = Math.max(medDist * 8, 3000);
    let core = valid.filter((r) => Math.hypot(r.x + r.w / 2 - mx, r.y + r.h / 2 - my) <= threshold);
    if (!core.length) core = valid;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of core) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); }
    // Wymiary panelu z WEWNĘTRZNEGO stanu ReactFlow (RF mierzy je ResizeObserverem —
    // wiarygodniejsze niż odczyt clientWidth owijki, który na mobile bywał 108).
    const st = rfStoreApi.getState() as unknown as { width?: number; height?: number };
    const rfEl = (flowWrapRef.current?.querySelector('.react-flow') as HTMLElement | null);
    const rfRect = rfEl?.getBoundingClientRect();
    const cw = (st.width && st.width > 1) ? st.width : (rfRect && rfRect.width > 1 ? rfRect.width : (flowWrapRef.current?.clientWidth || 800));
    const ch = (st.height && st.height > 1) ? st.height : (rfRect && rfRect.height > 1 ? rfRect.height : (flowWrapRef.current?.clientHeight || 600));
    const pad = 60;
    const bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2;
    let zoom = Math.min(cw / bw, ch / bh);
    if (!Number.isFinite(zoom) || zoom <= 0) zoom = 1;
    zoom = Math.max(0.05, Math.min(zoom, 1.5));
    const bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
    const tx = cw / 2 - bcx * zoom, ty = ch / 2 - bcy * zoom;
    // Instant (bez animacji — animowany setViewport na mobile bywa „zjadany" przez
    // re-render po dragu). Ponawiamy w rAF, gdy RF się ustabilizuje.
    const apply = () => { try { setViewport({ x: tx, y: ty, zoom }); } catch { /* ignore */ } };
    apply();
    requestAnimationFrame(apply);
  }, [setViewport]);
  const didFitRef = useRef(false);
  const [scene, setScene] = useState<DashScene>({ type: 'dash-scene', version: 2, objects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [umlSources, setUmlSources] = useState<UmlSource[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Python runtime (Pyodide, in a Web Worker) — created lazily when enabled.
  const pyodideRef = useRef<PyodideRuntime | null>(null);
  const [pyodideProgress, setPyodideProgress] = useState<PyodideProgress>({ phase: 'idle', message: '' });
  const getPyodide = useCallback((): PyodideRuntime => {
    if (!pyodideRef.current) pyodideRef.current = new PyodideRuntime((p) => setPyodideProgress(p));
    return pyodideRef.current;
  }, []);
  useEffect(() => () => { pyodideRef.current?.dispose(); pyodideRef.current = null; }, []);

  // Auto-fit raz po załadowaniu sceny (zastępuje wbudowany `fitView` prop, który
  // na mobile potrafi „nie zadziałać" gdy node'y są rozrzucone/poza ekranem).
  useEffect(() => {
    if (loading || didFitRef.current) return;
    const sc = sceneRef.current;
    const has = sc.objects.length || (sc.functionCalls?.length ?? 0) || (sc.vars?.length ?? 0) || (sc.classObjs?.length ?? 0) || (sc.getProps?.length ?? 0) || (sc.setProps?.length ?? 0);
    if (!has) return;
    didFitRef.current = true;
    const id = setTimeout(() => fitAllNodes(), 200);
    return () => clearTimeout(id);
  }, [loading, fitAllNodes]);

  // Parallel Python launch: when enabled, boot the worker and lazily preload the
  // configured packages in the background (the overlay tracks progress). Skips
  // packages already loaded, so tweaking the list only fetches the delta.
  const pyodideKey = scene.pyodide?.enabled
    ? `on|${(scene.pyodide.packages ?? []).join(',')}|${(scene.pyodide.pypi ?? []).join(',')}`
    : 'off';
  useEffect(() => {
    const cfg = scene.pyodide;
    if (!cfg?.enabled) return;
    void getPyodide().loadPackages({ packages: cfg.packages, pypi: cfg.pypi }).catch(() => { /* overlay shows error */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pyodideKey, getPyodide]);
  const [importPathLoading, setImportPathLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<DataSourceEntry[]>([]);
  const [dsData, setDsData] = useState<Record<string, JsonNode | null | undefined>>({});
  // Obiekty osadzonych scen (SceneEmbed) — read-only dzieci renderowane wewnątrz węzła.
  // Nie należą do scene.objects (nie są zapisywane), ładowane z pliku ref na żywo.
  const [externalObjects, setExternalObjects] = useState<DashObject[]>([]);
  const [embedReload, setEmbedReload] = useState(0); // bump → przeładuj osadzone sceny (po edycji)
  const [dsPickerOpen, setDsPickerOpen] = useState(false);
  const [sourceCtxMenu, setSourceCtxMenu] = useState<{ mouseX: number; mouseY: number; sourceId: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [canvasMode, setCanvasMode] = useState<'pan' | 'select'>('pan');
  // "Select QT" mode: click inside a QtWidgetNode to select the nested child widget
  // under the cursor (children have no ReactFlow node of their own).
  const [qtSelectMode, setQtSelectMode] = useState(false);
  // "Action" (runtime/preview) mode: pan/zoom on empty canvas, but clicking a block
  // triggers its event handling — qt-widgets go live (native mouse events fire their
  // signals, connected data-source handlers run: e.g. clicked → onClick()).
  const [actionMode, setActionMode] = useState(false);
  // The loaded MinisQt lib (globalThis-like) — used to enumerate Q_PROPERTY metadata
  // (QObject.metaProperties) for the Properties panel of a selected qt-widget.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [qtLib, setQtLib] = useState<any>(null);
  useEffect(() => { let c = false; ensureQtLib().then((g) => { if (!c) setQtLib(g); }).catch(() => {}); return () => { c = true; }; }, []);
  const [selectedField, setSelectedField] = useState<{ objId: string; fieldName: string } | null>(null);
  const [clipboard, setClipboard] = useState<{ objects: DashObject[] } | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [qtMenuAnchor, setQtMenuAnchor] = useState<HTMLElement | null>(null);
  const [qtuiPickerOpen, setQtuiPickerOpen] = useState(false);
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
  // Scene tree: collapsed groups + in-progress drag (object id) / hovered drop group.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [treeDragId, setTreeDragId] = useState<string | null>(null);
  const [treeDragOverId, setTreeDragOverId] = useState<string | null>(null);
  // Własny rubber-band (prostokąt selekcji) dla mobile — RF selectionOnDrag nie
  // odpala się na dotyku. Prostokąt trzymany w współrzędnych względem flowWrapRef.
  const [rubberBand, setRubberBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Po tym jak rubber-band ustawi zaznaczenie, ReactFlow potrafi odpalić 'select' change
  // (pane-click deselect), który przez onNodesChange wyczyściłby NASZ wybór. Ta flaga
  // każe onNodesChange zignorować sync 'select' przez krótkie okno po bandzie.
  const rubberSuppressRef = useRef(false);
  // Podczas resize gizmo węzła wyłączamy drag/pan ReactFlow (na touch RF potrafił
  // mimo `nodrag` przesuwać bloczki — „pływanie"). Sygnał przez CustomEvent z node'ów.
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    const h = (e: Event) => setIsResizing(!!(e as CustomEvent).detail);
    window.addEventListener('dash-resize-active', h as EventListener);
    return () => window.removeEventListener('dash-resize-active', h as EventListener);
  }, []);
  const [visiblePanels, setVisiblePanels] = useState<string[]>(['scene', 'properties']);
  // Kompleksowy edytor (TextEditorWorkspace) jako panel po prawej — chowany domyślnie.
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [wsWidth, setWsWidth] = useState(520);
  const wsResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onWsResizeDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    wsResizeRef.current = { startX: e.clientX, startW: wsWidth };
    const onMove = (me: PointerEvent) => {
      if (!wsResizeRef.current) return;
      // Przeciąganie w LEWO poszerza panel (splitter jest na jego lewej krawędzi).
      const dx = wsResizeRef.current.startX - me.clientX;
      setWsWidth(Math.max(280, Math.min(1100, wsResizeRef.current.startW + dx)));
    };
    const onUp = () => { wsResizeRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [wsWidth]);
  // Ustawienia widoku canvas — czytane z sceny (scene.view), utrwalane w backend
  // przy zapisie sceny. Zmieniane w Ustawieniach przez updateScene (patrz setView niżej).
  const view = scene.view;
  const gridEnabled = !!view?.grid;
  const gridSpacing = view?.gridSpacing ?? 20;
  const showOrigin = !!view?.origin;
  const showRulers = !!view?.rulers;
  const displayEnabled = !!view?.display?.enabled;
  const displayW = view?.display?.width ?? 800;
  const displayH = view?.display?.height ?? 480;
  // Pozycja kursora względem kontenera canvas (do znacznika na linijkach).
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [fcRunning, setFcRunning] = useState<Set<string>>(new Set());
  const [varInitDialogOpen, setVarInitDialogOpen] = useState(false);
  const [varInitTargetId, setVarInitTargetId] = useState<string | null>(null);
  // Dialog wyboru handlera dla sygnału qt (który sygnał którego obiektu łączymy).
  const [signalPicker, setSignalPicker] = useState<{ objId: string; signal: string; params: string[] } | null>(null);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  // Overlay for mid-drag positions — avoids writing scene during drag (prevents feedback loop/flying).
  const [dragNodePositions, setDragNodePositions] = useState<Map<string, { x: number; y: number }> | null>(null);
  const dragNodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const sceneRef = useRef<DashScene>({ type: 'dash-scene', version: 2, objects: [] });
  const [dirty, setDirty] = useState(false); // niezapisane zmiany (auto-save wyłączony)
  // Stos nawigacji do osadzonych scen (Otwórz → push, Zamknij → pop). Aktywny plik =
  // wierzchołek stosu albo prop `filePath` (scena główna). Load/save operują na activeFilePath.
  const [navStack, setNavStack] = useState<string[]>([]);
  const activeFilePath = navStack.length ? navStack[navStack.length - 1] : filePath;

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

  // AUTO-SAVE WYŁĄCZONY (na życzenie) — zapis wyłącznie przyciskiem „Save" (saveNow),
  // do activeFilePath. Dzięki temu edycja osadzonej sceny (Otwórz) nigdy nie nadpisze
  // sceny nadrzędnej „w tle". `dirty` = są niezapisane zmiany.
  const updateScene = useCallback((updater: (prev: DashScene) => DashScene) => {
    setScene((prev) => { const next = updater(prev); sceneRef.current = next; setDirty(true); return next; });
  }, []);
  // Patch ustawień widoku (scene.view) — utrwalane w scenie przy zapisie.
  const setView = useCallback((patch: Partial<NonNullable<DashScene['view']>>) => {
    updateScene((p) => ({ ...p, view: { ...p.view, ...patch } }));
  }, [updateScene]);
  // Znacznik kursora na linijkach — nasłuch na POZIOMIE OKNA, by aktualizował się
  // również w trakcie przeciągania bloczka (ReactFlow przechwytuje pointer capture
  // na węźle, ale zdarzenia i tak bąblują do window).
  useEffect(() => {
    if (!showRulers) { setCursorPos(null); return; }
    const onMove = (e: PointerEvent) => {
      const r = flowWrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = e.clientX - r.left, y = e.clientY - r.top;
      setCursorPos(x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [showRulers]);

  // Nawigacja do osadzonej sceny (edytowalnej) i powrót. Load effect reaguje na activeFilePath.
  // Auto-save wyłączony → ostrzegamy przed utratą niezapisanych zmian przy przełączaniu.
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const openEmbeddedScene = useCallback((path: string) => {
    if (!path) return;
    if (dirtyRef.current && !window.confirm('Masz niezapisane zmiany (auto-save wyłączony). Otworzyć osadzoną scenę bez zapisu?')) return;
    setNavStack((s) => [...s, path]);
  }, []);
  const closeEmbeddedScene = useCallback(() => {
    if (dirtyRef.current && !window.confirm('Masz niezapisane zmiany (auto-save wyłączony). Zamknąć bez zapisu?')) return;
    setNavStack((s) => s.slice(0, -1)); setEmbedReload((n) => n + 1);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const text = await vfsRead(userName, activeFilePath);
        const raw = JSON.parse(text) as Omit<DashScene, 'objects'> & { objects: LegacyDashObject[]; umlProjectPath?: string };
        const parsed: DashScene = {
          ...raw,
          objects: raw.objects.map((o): DashObject => ({
            id: o.id, className: o.className, objectName: o.objectName,
            customFields: o.customFields, properties: o.properties,
            transform: o.transform ?? defaultTransform(o.x ?? 0, o.y ?? 0),
            ...(o.kind ? { kind: o.kind } : {}),
            ...(o.parentId ? { parentId: o.parentId } : {}),
            ...(o.signalHandlers ? { signalHandlers: o.signalHandlers } : {}),
            ...(o.zIndex !== undefined ? { zIndex: o.zIndex } : {}),
          })),
        };
        // Migracja transformów GLOBALNYCH (v1) → LOKALNYCH (v2). W v1 wszystkie
        // transformy są globalne, więc lokalny dziecka = global dziecka − global
        // BEZPOŚREDNIEGO rodzica (dla obiektów global == stored transform). Czytamy
        // globalne pozycje rodziców ze stanu SPRZED konwersji (jeden przebieg).
        const migrated: DashScene = ((raw.version ?? 1) === 2) ? parsed : (() => {
          const legacyGlobalOfObj = new Map<string, { x: number; y: number }>();
          for (const o of parsed.objects) legacyGlobalOfObj.set(o.id, { x: o.transform.x, y: o.transform.y });
          const migrateFlat = <T extends { x: number; y: number; parentId?: string }>(n: T): T => {
            if (!n.parentId) return n;
            const pg = legacyGlobalOfObj.get(n.parentId);
            return pg ? { ...n, x: n.x - pg.x, y: n.y - pg.y } : n;
          };
          return {
            ...parsed,
            version: 2 as const,
            objects: parsed.objects.map((o) => {
              if (!o.parentId) return o;
              const parent = parsed.objects.find((x) => x.id === o.parentId);
              if (parent?.kind === 'qt-widget') return o; // reżim Qt-lokalny — nie migrujemy
              const pg = legacyGlobalOfObj.get(o.parentId);
              return pg ? { ...o, transform: { ...o.transform, x: o.transform.x - pg.x, y: o.transform.y - pg.y } } : o;
            }),
            ...(parsed.functionCalls ? { functionCalls: parsed.functionCalls.map(migrateFlat) } : {}),
            ...(parsed.vars ? { vars: parsed.vars.map(migrateFlat) } : {}),
            ...(parsed.classObjs ? { classObjs: parsed.classObjs.map(migrateFlat) } : {}),
            ...(parsed.getProps ? { getProps: parsed.getProps.map(migrateFlat) } : {}),
            ...(parsed.setProps ? { setProps: parsed.setProps.map(migrateFlat) } : {}),
          };
        })();
        setScene(migrated);
        sceneRef.current = migrated;
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
            // PDF/DjVu/Dash — nie parsujemy jako tekst; ładuje osobny mechanizm (bloczek/efekt).
            if (dsType === 'pdf' || dsType === 'djvu' || dsType === 'dash') { setDsData((prev) => ({ ...prev, [dsId]: { _binary: true } as unknown as JsonNode })); continue; }
            vfsRead(userName, ds.filePath)
              .then((text) => { setDsData((prev) => ({ ...prev, [dsId]: loadDataSourceContent(text, dsType) })); })
              .catch(() => setDsData((prev) => ({ ...prev, [dsId]: null })));
          }
        }
        setDirty(false); // świeżo wczytana scena = brak niezapisanych zmian
      } catch {
        // Nowy/pusty plik → scena demo; zapisz od razu (jednorazowa inicjalizacja pliku).
        const demo = makeDemoScene();
        setScene(demo); sceneRef.current = demo; setDirty(false);
        void vfsWrite(userName, activeFilePath, JSON.stringify(demo, null, 2)).catch(() => {});
      } finally {
        setLoading(false);
      }
    })();
  }, [userName, activeFilePath]);

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
    const name = filePath.split('/').pop()?.replace(/\.(dash\.json|json|js|py|ts|pdf|djvu)$/i, '') ?? filePath;
    const fileType: DataSourceEntry['fileType'] =
      /\.dash\.json$/i.test(filePath) ? 'dash'   // osadzona scena — MUSI być przed .json
      : filePath.endsWith('.py') ? 'python'
      : filePath.endsWith('.ts') ? 'ts'
      : filePath.endsWith('.js') ? 'js'
      : /\.pdf$/i.test(filePath) ? 'pdf'
      : /\.djvu$/i.test(filePath) ? 'djvu'
      : 'json';
    const id = makeId();
    const entry: DataSourceEntry = { id, name, filePath, fileType };
    // PDF/DjVu/Dash są binarne/osobne — nie parsujemy ich jako tekst/JSON. Dash-scenę
    // ładuje osobny efekt (external objects) po jej osadzeniu. W panelu Data trzymamy marker.
    if (fileType === 'pdf' || fileType === 'djvu' || fileType === 'dash') {
      setDsData((prev) => ({ ...prev, [id]: { _binary: true } as unknown as JsonNode }));
    } else {
      setDsData((prev) => ({ ...prev, [id]: undefined }));
      try {
        const text = await vfsRead(userName, filePath);
        setDsData((prev) => ({ ...prev, [id]: loadDataSourceContent(text, fileType) }));
      } catch (e) {
        setDsData((prev) => ({ ...prev, [id]: { _error: (e as Error).message } as unknown as JsonNode }));
      }
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
    if (src.fileType === 'pdf' || src.fileType === 'djvu') {
      // Zrzuć cache dokumentu — bloczki PdfView/DjvuView przeładują się.
      if (src.fileType === 'pdf') invalidatePdfCache(userName, src.filePath);
      else invalidateDjvuCache(userName, src.filePath);
      setDsData((prev) => ({ ...prev, [id]: { _binary: true, _v: Date.now() } as unknown as JsonNode }));
      return;
    }
    setDsData((prev) => ({ ...prev, [id]: undefined }));
    try {
      const text = await vfsRead(userName, src.filePath);
      setDsData((prev) => ({ ...prev, [id]: loadDataSourceContent(text, src.fileType) }));
    } catch (e) {
      setDsData((prev) => ({ ...prev, [id]: { _error: (e as Error).message } as unknown as JsonNode }));
    }
  }, [dataSources, userName]);

  // ─── FunctionCall + Var + ClassObj management ──────────────────────────────

  const createFunctionCall = useCallback((x: number, y: number, sourceId: string, symbolPath: string, paramNames: string[], lang?: 'python') => {
    const newFc: FunctionCallObject = { id: makeId(), sourceId, symbolPath, paramNames, argOverrides: {}, result: null, error: null, x, y, ...(lang ? { lang } : {}) };
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

  const runGetPropRef = useRef<((id: string) => void) | null>(null);
  const runSetPropRef = useRef<((id: string) => void) | null>(null);

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
      // Ujednolicone z automatyzacją Markdown: wstrzyknij wbudowane biblioteki
      // (Three.js / Lit) zgodnie z ustawieniami tej dashboard, zanim skrypt ruszy.
      // Klient MQTT jest już dostępny w skrypcie przez `api.mqtt`.
      try {
        const libs = sceneRef.current.libs;
        if (libs?.three) await loadLibrary('three');
        if (libs?.lit) await loadLibrary('lit');
      } catch (e) {
        notify(`Library preload failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
      const prevNotifLen = alliApi.notifications.length;
      const prevLogLen = alliApi.logs.length;
      // Intercept console.* during script execution
      const fcLabel = fc.symbolPath;
      const captured: ConsoleEntry[] = [];
      const origConsole = {
        log: console.log, warn: console.warn, error: console.error,
        info: console.info, debug: console.debug,
      } as Record<string, (...args: unknown[]) => void>;
      const makeCapture = (level: ConsoleEntry['level']) =>
        (...args: unknown[]) => {
          captured.push({ id: makeId(), level, message: argsToStr(args), fcLabel, ts: Date.now() });
          origConsole[level]?.(...args);
        };
      (console as unknown as Record<string, unknown>).log = makeCapture('log');
      (console as unknown as Record<string, unknown>).warn = makeCapture('warn');
      (console as unknown as Record<string, unknown>).error = makeCapture('error');
      (console as unknown as Record<string, unknown>).info = makeCapture('info');
      (console as unknown as Record<string, unknown>).debug = makeCapture('debug');
      let result: unknown;
      // Expose Python to scripts as `api.python` when Pyodide is enabled:
      //   await api.python.run("import numpy as np; np.arange(5).sum()", { x: 1 })
      const runApi = sceneRef.current.pyodide?.enabled
        ? Object.assign(Object.create(alliApi as object), {
            python: {
              run: (code: string, globals?: Record<string, unknown>) => getPyodide().runPython(code, globals),
              loadPackages: (p: { packages?: string[]; pypi?: string[] }) => getPyodide().loadPackages(p),
            },
          }) as typeof alliApi
        : alliApi;
      try {
        if (fc.lang === 'python') {
          // Run the .py source in Pyodide (defines the functions), then call the
          // target with the resolved args. Result is converted to JS and flows
          // through the normal return edge → Var / GetProp / SetProp.
          const rt = getPyodide();
          const safeArgs = argValues.map((a) => (a === undefined ? null : a));
          const fnName = fc.symbolPath.split('.').pop() || fc.symbolPath;
          const pyCode = [
            'import json as _dash_json',
            '_dash_args = _dash_json.loads(_dash_args_json)',
            text,
            `_dash_result = ${fnName}(*_dash_args)`,
            '_dash_result',
          ].join('\n');
          result = await rt.runPython(pyCode, { _dash_args_json: JSON.stringify(safeArgs) });
        } else {
          // .ts sources are stripped of types → JS before running in new Function().
          const source = ds.fileType === 'ts' ? await transpileTs(text) : text;
          result = await executeFunctionFromSource(runApi, source, fc.symbolPath, argValues, thisValue);
        }
      } finally {
        // Restore console
        Object.assign(console, origConsole);
        // Collect api.log.* entries added during execution
        for (const l of alliApi.logs.slice(prevLogLen)) {
          captured.push({ id: makeId(), level: l.level, message: l.message, fcLabel, ts: l.timestamp });
        }
        if (captured.length > 0) {
          setConsoleLogs((prev) => [...prev, ...captured]);
          setConsoleOpen(true);
        }
      }
      for (const n of alliApi.notifications.slice(prevNotifLen)) {
        notify(n.message, n.severity as 'success' | 'info' | 'warning' | 'error' | undefined);
      }
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
      setConsoleLogs((prev) => [...prev, { id: makeId(), level: 'error', message: `${fc?.symbolPath ?? fcId}: ${msg}`, fcLabel: fc?.symbolPath, ts: Date.now() }]);
      setConsoleOpen(true);
      updateScene((prev) => ({
        ...prev,
        functionCalls: (prev.functionCalls ?? []).map((f) => f.id === fcId ? { ...f, error: msg, result: null } : f),
      }));
    } finally {
      setFcRunning((prev) => { const n = new Set(prev); n.delete(fcId); return n; });
      // Follow exec_out → exec_in chain (FC, GetProp, SetProp)
      const execEdge = (sceneRef.current.fcEdges ?? []).find((e) => e.source === fcId && e.sourceHandle === 'exec_out' && e.targetHandle === 'exec_in');
      if (execEdge) {
        const nextId = execEdge.target;
        if ((sceneRef.current.functionCalls ?? []).some((f) => f.id === nextId)) {
          void callFunctionForNode(nextId);
        } else if ((sceneRef.current.getProps ?? []).some((n) => n.id === nextId)) {
          runGetPropRef.current?.(nextId);
        } else if ((sceneRef.current.setProps ?? []).some((n) => n.id === nextId)) {
          runSetPropRef.current?.(nextId);
        }
      }
    }
  }, [dataSources, userName, updateScene, alliApi, notify, setConsoleLogs, setConsoleOpen]);

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
    // Follow exec_out → exec_in chain
    const execEdge = (sceneRef.current.fcEdges ?? []).find((e) => e.source === nodeId && e.sourceHandle === 'exec_out' && e.targetHandle === 'exec_in');
    if (execEdge) {
      const nextId = execEdge.target;
      if ((sceneRef.current.functionCalls ?? []).some((f) => f.id === nextId)) {
        void callFunctionForNode(nextId);
      } else if ((sceneRef.current.getProps ?? []).some((n) => n.id === nextId)) {
        runGetPropRef.current?.(nextId);
      } else if ((sceneRef.current.setProps ?? []).some((n) => n.id === nextId)) {
        runSetPropRef.current?.(nextId);
      }
    }
  }, [updateScene, callFunctionForNode]);
  runGetPropRef.current = runGetProp;

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
    // Follow exec_out → exec_in chain
    const execEdge = (sceneRef.current.fcEdges ?? []).find((e) => e.source === nodeId && e.sourceHandle === 'exec_out' && e.targetHandle === 'exec_in');
    if (execEdge) {
      const nextId = execEdge.target;
      if ((sceneRef.current.functionCalls ?? []).some((f) => f.id === nextId)) {
        void callFunctionForNode(nextId);
      } else if ((sceneRef.current.getProps ?? []).some((n) => n.id === nextId)) {
        runGetPropRef.current?.(nextId);
      } else if ((sceneRef.current.setProps ?? []).some((n) => n.id === nextId)) {
        runSetPropRef.current?.(nextId);
      }
    }
  }, [updateScene, callFunctionForNode]);
  runSetPropRef.current = runSetProp;

  const processDropAt = useCallback((clientX: number, clientY: number, mime: string, data: string) => {
    const pos = screenToFlowPosition({ x: clientX, y: clientY });
    if (mime === 'application/dash-function') {
      try {
        const { sourceId, symbolPath, paramNames } = JSON.parse(data) as { sourceId: string; symbolPath: string; paramNames: string[] };
        // A function from a Python (.py) data source becomes a PyFunctionCall
        // (executed via Pyodide). Its result flows through the same edges → Var /
        // GetProp / SetProp work unchanged.
        const lang = sceneRef.current.dataSources?.find((s) => s.id === sourceId)?.fileType === 'python' ? 'python' : undefined;
        createFunctionCall(pos.x, pos.y, sourceId, symbolPath, paramNames, lang);
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
    } else if (mime === 'application/dash-pdf-ref') {
      try {
        const { sourceId, filePath: pdfPath } = JSON.parse(data) as { sourceId: string; filePath: string };
        const count = sceneRef.current.objects.filter((o) => o.className === 'PdfView').length;
        // Wiele PdfView może wskazywać JEDEN datasource (sourceId) — każdy z własną stroną.
        const obj: DashObject = {
          id: makeId(),
          className: 'PdfView',
          objectName: `pdfView${count + 1}`,
          transform: { x: pos.x, y: pos.y, rot: 0, scale: 1, width: 420, height: 560 },
          properties: { sourceId, filePath: pdfPath, page: 1 },
        };
        updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
        setSelectedIds(new Set([obj.id]));
      } catch { /* ignore bad drag data */ }
    } else if (mime === 'application/dash-djvu-ref') {
      try {
        const { sourceId, filePath: djvuPath } = JSON.parse(data) as { sourceId: string; filePath: string };
        const count = sceneRef.current.objects.filter((o) => o.className === 'DjvuView').length;
        const obj: DashObject = {
          id: makeId(),
          className: 'DjvuView',
          objectName: `djvuView${count + 1}`,
          transform: { x: pos.x, y: pos.y, rot: 0, scale: 1, width: 420, height: 560 },
          properties: { sourceId, filePath: djvuPath, page: 1 },
        };
        updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
        setSelectedIds(new Set([obj.id]));
      } catch { /* ignore bad drag data */ }
    } else if (mime === 'application/dash-scene-ref') {
      try {
        const { sourceId, filePath: scenePath } = JSON.parse(data) as { sourceId: string; filePath: string };
        const count = sceneRef.current.objects.filter((o) => o.className === 'SceneEmbed').length;
        // Transparentny kontener-grupa: renderuje (read-only) zawartość osadzonej sceny jako
        // swoje dzieci. Jako grupa uczestniczy w Tab/Table/clip/lokalnych transformach.
        const obj: DashObject = {
          id: makeId(),
          className: 'SceneEmbed',
          objectName: scenePath.split('/').pop()?.replace(/\.dash\.json$/i, '') ?? `scena${count + 1}`,
          kind: 'group',
          transform: { x: pos.x, y: pos.y, rot: 0, scale: 1, width: 360, height: 280 },
          properties: { sourceId, filePath: scenePath, showFrame: false },
        };
        updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
        setSelectedIds(new Set([obj.id]));
      } catch { /* ignore bad drag data */ }
    }
  }, [screenToFlowPosition, createFunctionCall, createClassObj, updateScene]);

  useEffect(() => {
    _touchDropCb = (cx, cy, payload) => {
      // Touch/pen DnD dostarcza drop bezwarunkowo (w przeciwieństwie do HTML5 onDrop
      // podpiętego tylko na ReactFlow). Panele Data/Types/Properties są flex-siblingami
      // POZA `.react-flow`, więc puszczenie symbolu NAD panelem Data nie może dodać
      // bloczka — akceptujemy tylko drop nad samym canvasem. Ghost ma pointerEvents:none,
      // więc elementFromPoint zwraca element pod nim.
      const el = document.elementFromPoint(cx, cy);
      if (!el || !el.closest('.react-flow')) return;
      processDropAt(cx, cy, payload.mime, payload.data);
    };
    return () => { _touchDropCb = null; };
  }, [processDropAt]);

  const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rawFn = e.dataTransfer.getData('application/dash-function');
    const rawCls = e.dataTransfer.getData('application/dash-class');
    const rawRef = e.dataTransfer.getData('application/dash-json-ref');
    const rawPdf = e.dataTransfer.getData('application/dash-pdf-ref');
    const rawDjvu = e.dataTransfer.getData('application/dash-djvu-ref');
    const rawScene = e.dataTransfer.getData('application/dash-scene-ref');
    const mime = rawFn ? 'application/dash-function' : rawCls ? 'application/dash-class' : rawRef ? 'application/dash-json-ref' : rawPdf ? 'application/dash-pdf-ref' : rawDjvu ? 'application/dash-djvu-ref' : rawScene ? 'application/dash-scene-ref' : '';
    const data = rawFn || rawCls || rawRef || rawPdf || rawDjvu || rawScene;
    if (mime && data) processDropAt(e.clientX, e.clientY, mime, data);
  }, [processDropAt]);

  const saveNow = useCallback(() => {
    // Zapisz AKTYWNY plik (scena główna LUB osadzona otwarta przez „Otwórz"), nie prop filePath.
    void vfsWrite(userName, activeFilePath, JSON.stringify(sceneRef.current, null, 2))
      .then(() => setDirty(false))
      .catch((e) => console.error('[DashEditor] save failed:', e));
  }, [userName, activeFilePath]);

  // Nowe elementy z Types (kształty / build-in) trafiają na ŚRODEK widocznego canvas
  // (a nie w stały róg) — użytkownik dodaje je tam, gdzie aktualnie patrzy. Mały kaskadowy
  // offset, by kolejne dodania się nie idealnie nakładały.
  const centeredTransform = useCallback((width: number, height: number, count: number): DashTransform => {
    const el = document.querySelector('.react-flow');
    let cx = 200, cy = 160;
    if (el && typeof screenToFlowPosition === 'function') {
      const r = el.getBoundingClientRect();
      const c = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      cx = c.x; cy = c.y;
    }
    const cascade = (count % 6) * 22;
    const w = width > 0 ? width : 220, h = height > 0 ? height : 140;
    return { x: Math.round(cx - w / 2 + cascade), y: Math.round(cy - h / 2 + cascade), rot: 0, scale: 1, width, height };
  }, [screenToFlowPosition]);

  // Środek WIDOCZNEGO canvas w współrzędnych flow. Menu „New" otwiera się z drzewa
  // SCENE (lewy panel), więc pozycja kursora nie odpowiada miejscu na canvasie —
  // nowe bloczki (Var/GetProp/SetProp/Group/Qt) trafiają tam, gdzie użytkownik
  // patrzy, a nie poza kadr. Mały kaskadowy offset, by kolejne się nie nakładały.
  const viewportCenterFlow = useCallback((): { x: number; y: number } => {
    const el = document.querySelector('.react-flow');
    let cx = 200, cy = 160;
    if (el && typeof screenToFlowPosition === 'function') {
      const r = el.getBoundingClientRect();
      const c = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      cx = c.x; cy = c.y;
    }
    const cascade = (sceneRef.current.objects.length % 6) * 22;
    return { x: Math.round(cx - 90 + cascade), y: Math.round(cy - 40 + cascade) };
  }, [screenToFlowPosition]);

  const createObject = useCallback((cls: UmlClassDef) => {
    const count = sceneRef.current.objects.length;
    const isCustom = cls.name === 'Unknown';
    const props: Record<string, DashValue> = {};
    for (const f of cls.fields) props[f.name] = defaultForType(detectFieldType(f.type));
    const size = cls.name === 'MarkdownView' ? { width: 320, height: 400 }
      : cls.name === 'ObjectRef' ? { width: 280, height: 0 }
      : { width: 0, height: 0 };
    const transform: DashTransform = centeredTransform(size.width, size.height, count);
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
  }, [updateScene, centeredTransform]);

  // ── Groups ──────────────────────────────────────────────────────────────
  const createGroup = useCallback((x: number, y: number) => {
    const count = sceneRef.current.objects.filter((o) => o.kind === 'group').length;
    const group: DashObject = {
      id: makeId(), className: 'Group', kind: 'group',
      objectName: `group${count}`,
      transform: { x, y, rot: 0, scale: 1, width: 320, height: 240 },
      properties: {},
    };
    updateScene((prev) => ({ ...prev, objects: [group, ...prev.objects] }));
    setSelectedIds(new Set([group.id]));
  }, [updateScene]);

  // ── Kształty (rect/rhombus/ellipse/line/arrow) ────────────────────────────
  const createShape = useCallback((shapeType: ShapeType) => {
    const count = sceneRef.current.objects.filter((o) => o.kind === 'shape').length;
    const def = defaultShapeTransform(shapeType, 0, 0);
    const c = centeredTransform(def.width, def.height, count);
    const shape: DashObject = {
      id: makeId(), className: 'Shape', kind: 'shape',
      objectName: `${shapeType}${count + 1}`,
      transform: { ...def, x: c.x, y: c.y },
      properties: { shape: shapeType, ...defaultShapeProps(shapeType) },
    };
    updateScene((prev) => ({ ...prev, objects: [...prev.objects, shape] }));
    setSelectedIds(new Set([shape.id]));
  }, [updateScene, centeredTransform]);

  // ── Qt widgets (MinisQt / core/browser/qt) ────────────────────────────────
  const createQtWidget = useCallback((type: string, _x: number, _y: number) => {
    const def = QT_WIDGETS.find((w) => w.type === type) ?? { type, w: 120, h: 40, props: {} };
    const count = sceneRef.current.objects.filter((o) => o.kind === 'qt-widget').length;
    const base = type.replace(/^Q/, '');
    // Spawn on the visible Render surface with a cascade — the scene-panel menu
    // position maps through the ReactFlow viewport and can land off-canvas.
    const sx = 40 + (count % 8) * 28;
    const sy = 40 + (count % 6) * 28;
    const obj: DashObject = {
      id: makeId(), className: type, kind: 'qt-widget',
      objectName: `${base.charAt(0).toLowerCase()}${base.slice(1)}${count}`,
      transform: { x: sx, y: sy, rot: 0, scale: 1, width: def.w, height: def.h },
      properties: { ...def.props },
    };
    updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
    setSelectedIds(new Set([obj.id]));
  }, [updateScene]);

  // Osadza scenę .qtui.json jako poddrzewo qt-widgetów (jeden root-node z zagnieżdżonymi
  // dziećmi). Zaznaczanie przez Select QT i podpinanie sygnałów działa jak dla natywnych
  // qt-widgetów, bo to zwykłe DashObjecty.
  const embedQtuiScene = useCallback(async (filePath: string) => {
    try {
      const text = (await vfsRead(userName, filePath)).trim();
      // Pusty plik = scena jeszcze niezapisana na dysku. Edytor qtui po cichu
      // pokazuje wtedy pustą scenę (defaultScene), więc „działa w panelu", ale tu
      // JSON.parse('') rzuciłby „Unexpected end of JSON input".
      if (!text) {
        notify('Plik .qtui.json jest pusty. Otwórz go w edytorze qtui, dodaj widgety i zapisz (Ctrl+S), a potem spróbuj ponownie.', 'warning');
        return;
      }
      let scene: QtUiScene;
      try { scene = JSON.parse(text) as QtUiScene; }
      catch { notify('Plik .qtui.json nie jest poprawnym JSON-em (uszkodzony lub niezapisany).', 'error'); return; }
      if (!scene || scene.type !== 'qt_ui_scene' || !scene.root) { notify('To nie jest poprawna scena .qtui.json', 'error'); return; }
      const g = await ensureQtLib();
      const count = sceneRef.current.objects.filter((o) => o.kind === 'qt-widget' && !o.parentId).length;
      const spawnX = 40 + (count % 5) * 32, spawnY = 40 + (count % 5) * 32;
      const objs = qtuiSceneToDashObjects(scene, g, spawnX, spawnY);
      if (!objs.length) { notify('Scena .qtui.json jest pusta', 'warning'); return; }
      updateScene((prev) => ({ ...prev, objects: [...prev.objects, ...objs] }));
      setSelectedIds(new Set([objs[0].id]));
      notify(`Osadzono scenę: ${objs.length} widget(ów)`, 'success');
    } catch (e) {
      notify(`Nie udało się osadzić sceny: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, [userName, updateScene, notify]);

  // Wrap the selected (non-group) objects in a new Group covering their bbox.
  const groupSelection = useCallback(() => {
    const sel = sceneRef.current.objects.filter((o) => selectedIds.has(o.id) && o.kind !== 'group');
    if (sel.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of sel) {
      const t = getTransform(o);
      const w = t.width > 0 ? t.width : 200;
      const h = t.height > 0 ? t.height : 120;
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
    }
    const pad = 24;
    const groupId = makeId();
    const count = sceneRef.current.objects.filter((o) => o.kind === 'group').length;
    const group: DashObject = {
      id: groupId, className: 'Group', kind: 'group',
      objectName: `group${count}`,
      transform: { x: minX - pad, y: minY - pad, rot: 0, scale: 1, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 },
      properties: {},
    };
    const ids = new Set(sel.map((o) => o.id));
    updateScene((prev) => ({
      ...prev,
      objects: [group, ...prev.objects.map((o) => ids.has(o.id) ? { ...o, parentId: groupId } : o)],
    }));
    setSelectedIds(new Set([groupId]));
  }, [selectedIds, updateScene]);

  // Remove the selected group(s); detach their children (clear parentId).
  const ungroupSelected = useCallback(() => {
    const groupIds = new Set(
      [...selectedIds].filter((id) => sceneRef.current.objects.find((o) => o.id === id)?.kind === 'group'),
    );
    if (groupIds.size === 0) return;
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects
        .filter((o) => !groupIds.has(o.id))
        .map((o) => (o.parentId && groupIds.has(o.parentId)) ? { ...o, parentId: undefined } : o),
    }));
    setSelectedIds(new Set());
  }, [selectedIds, updateScene]);

  const updateProperty = useCallback((objId: string, field: string, value: DashValue) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, properties: { ...o.properties, [field]: value } } : o) }));
  }, [updateScene]);

  const updateObjectName = useCallback((objId: string, name: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, objectName: name } : o) }));
  }, [updateScene]);

  const updateTransform = useCallback((objId: string, patch: Partial<DashTransform>) => {
    // Model lokalny: ruch grupy zmienia tylko jej lokalny transform — dzieci (lokalne
    // względem rodzica) NIE są offsetowane; podążają automatycznie przez akumulację.
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, transform: { ...getTransform(o), ...patch } } : o) }));
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
      objects: prev.objects
        .filter((o) => !selectedIds.has(o.id))
        .map((o) => (o.parentId && selectedIds.has(o.parentId)) ? { ...o, parentId: undefined } : o),
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

  // Registered Q_PROPERTY metadata for the selected qt-widget (enumerated from the
  // MinisQt class via QObject.metaProperties — merges QObject/QWidget/subclass).
  const selectedQtProps = useMemo((): Array<{ className: string; props: Array<{ name: string; type: string; settable: boolean; dflt: unknown }> }> | null => {
    if (!selectedObject || selectedObject.kind !== 'qt-widget' || !qtLib) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Nieznana/własna klasa → i tak każdy qt-widget dziedziczy po QWidget, więc
    // pokazujemy przynajmniej właściwości QWidget/QObject zamiast pustej listy.
    const Cls = (typeof qtLib[selectedObject.className] === 'function') ? qtLib[selectedObject.className] : qtLib.QWidget;
    if (typeof Cls !== 'function') return [];
    let inst: any = null;
    try { inst = new Cls(); } catch { inst = null; }
    // Grupowanie wg klasy deklarującej (QPushButton / QAbstractButton / QWidget / QObject…).
    return qtMetaGroups(Cls, 'properties').map((grp) => ({
      className: grp.className,
      props: grp.names.map((name) => {
        const def = grp.own[name];
        let dflt: unknown = undefined;
        try { dflt = def && typeof def.get === 'function' && inst ? def.get(inst) : undefined; } catch { dflt = undefined; }
        const type = (def && def.type) || (dflt === null || dflt === undefined ? 'string' : typeof dflt);
        return { name, type, settable: !!(def && def.set), dflt };
      }),
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [selectedObject, qtLib]);

  // Zadeklarowane sygnały qt zaznaczonego widgetu, pogrupowane wg klasy deklarującej.
  const selectedQtSignals = useMemo((): Array<{ className: string; signals: Array<{ name: string; params: string[] }> }> | null => {
    if (!selectedObject || selectedObject.kind !== 'qt-widget' || !qtLib) return null;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const Cls = (typeof qtLib[selectedObject.className] === 'function') ? qtLib[selectedObject.className] : qtLib.QWidget;
    if (typeof Cls !== 'function') return [];
    return qtMetaGroups(Cls, 'signals').map((grp) => ({
      className: grp.className,
      signals: grp.names.map((name) => ({ name, params: (grp.own[name] && Array.isArray(grp.own[name].params)) ? grp.own[name].params : [] })),
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }, [selectedObject, qtLib]);

  // Wszystkie wywoływalne funkcje ze wszystkich data sources (do wyboru jako handler).
  const connectableFunctions = useMemo((): HandlerFn[] => {
    const out: HandlerFn[] = [];
    for (const src of dataSources) {
      if (src.fileType === 'json') continue;
      const syms = dsData[src.id] as unknown as CodeSymbol[] | undefined;
      if (Array.isArray(syms)) out.push(...flattenHandlerFns(syms, src));
    }
    return out;
  }, [dataSources, dsData]);

  const updateSignalHandler = useCallback((objId: string, signal: string, handler: { sourceId: string; symbolPath: string } | null) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => {
        if (o.id !== objId) return o;
        const next = { ...(o.signalHandlers ?? {}) };
        if (handler) next[signal] = handler; else delete next[signal];
        return { ...o, signalHandlers: Object.keys(next).length ? next : undefined };
      }),
    }));
  }, [updateScene]);

  // Mapa scena-id → (sygnał → handler) dla trybu Action. Przekazywana do każdego
  // qt-node, który po zbudowaniu żywych widgetów podpina sygnały pod runSignalHandler.
  const signalHandlersMap = useMemo((): Record<string, Record<string, { sourceId: string; symbolPath: string }>> => {
    const m: Record<string, Record<string, { sourceId: string; symbolPath: string }>> = {};
    for (const o of scene.objects) if (o.signalHandlers && Object.keys(o.signalHandlers).length) m[o.id] = o.signalHandlers;
    return m;
  }, [scene.objects]);

  // Runtime trybu Action: wywołanie sygnału qt-widgetu (np. clicked) uruchamia
  // podłączoną funkcję z data source. Współdzieli console-capture i notyfikacje
  // z callFunctionForNode, ale argumenty biorą się wprost z sygnału (nie z edge'y).
  const runSignalHandler = useCallback(async (sceneId: string, signal: string, args: unknown[]) => {
    const obj = sceneRef.current.objects.find((o) => o.id === sceneId);
    const handler = obj?.signalHandlers?.[signal];
    if (!handler) return;
    const ds = (sceneRef.current.dataSources ?? dataSources).find((d) => d.id === handler.sourceId);
    if (!ds) { notify(`Brak data source dla handlera „${handler.symbolPath}"`, 'warning'); return; }
    // Sygnały qt niosą instancje QObject/klas Qt — nieserializowalne przez JSON i
    // niepotrzebne skryptowi. Przekazujemy tylko wartości proste (np. checked:boolean).
    const safeArgs = (args ?? []).filter((a) => a === null || typeof a !== 'object');
    const label = `${obj?.objectName ?? sceneId}.${signal} → ${handler.symbolPath}`;
    const prevNotifLen = alliApi.notifications.length;
    const prevLogLen = alliApi.logs.length;
    const captured: ConsoleEntry[] = [];
    const origConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug } as Record<string, (...a: unknown[]) => void>;
    const makeCapture = (level: ConsoleEntry['level']) => (...a: unknown[]) => { captured.push({ id: makeId(), level, message: argsToStr(a), fcLabel: label, ts: Date.now() }); origConsole[level]?.(...a); };
    (console as unknown as Record<string, unknown>).log = makeCapture('log');
    (console as unknown as Record<string, unknown>).warn = makeCapture('warn');
    (console as unknown as Record<string, unknown>).error = makeCapture('error');
    (console as unknown as Record<string, unknown>).info = makeCapture('info');
    (console as unknown as Record<string, unknown>).debug = makeCapture('debug');
    try {
      const text = await vfsRead(userName, ds.filePath);
      if (ds.fileType === 'python') {
        const rt = getPyodide();
        const fnName = handler.symbolPath.split('.').pop() || handler.symbolPath;
        const pyArgs = safeArgs.map((a) => (a === undefined ? null : a));
        const pyCode = ['import json as _dash_json', '_dash_args = _dash_json.loads(_dash_args_json)', text, `_dash_result = ${fnName}(*_dash_args)`, '_dash_result'].join('\n');
        await rt.runPython(pyCode, { _dash_args_json: JSON.stringify(pyArgs) });
      } else {
        const source = ds.fileType === 'ts' ? await transpileTs(text) : text;
        await executeFunctionFromSource(alliApi, source, handler.symbolPath, safeArgs);
      }
    } catch (e) {
      captured.push({ id: makeId(), level: 'error', message: e instanceof Error ? e.message : String(e), fcLabel: label, ts: Date.now() });
      notify(`Handler „${handler.symbolPath}": ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      Object.assign(console, origConsole);
      for (const l of alliApi.logs.slice(prevLogLen)) captured.push({ id: makeId(), level: l.level as ConsoleEntry['level'], message: l.message, fcLabel: label, ts: l.timestamp });
      for (const n of alliApi.notifications.slice(prevNotifLen)) notify(n.message, n.severity as 'success' | 'info' | 'warning' | 'error' | undefined);
      if (captured.length) { setConsoleLogs((prev) => [...prev, ...captured]); setConsoleOpen(true); }
    }
  }, [dataSources, userName, alliApi, notify, setConsoleLogs, setConsoleOpen]);

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

  // Ładowanie osadzonych scen (SceneEmbed): czyta plik ref, spłaszcza jego obiekty i
  // wpina je jako read-only dzieci węzła SceneEmbed (id prefiksowane `${embedId}::`).
  // Uwaga: brak rekurencji (osadzone sceny wewnątrz osadzonych są pomijane w v1).
  const embedSig = JSON.stringify(scene.objects.filter((o) => o.className === 'SceneEmbed').map((o) => [o.id, o.properties?.filePath]));
  useEffect(() => {
    let alive = true;
    const embeds = scene.objects.filter((o) => o.className === 'SceneEmbed' && o.properties?.filePath);
    if (embeds.length === 0) { setExternalObjects((prev) => (prev.length ? [] : prev)); return; }
    void (async () => {
      const all: DashObject[] = [];
      for (const embed of embeds) {
        const path = String(embed.properties.filePath);
        try {
          const text = await vfsRead(userName, path);
          const raw = JSON.parse(text) as { objects?: DashObject[] };
          const objs = (raw.objects ?? []).filter((o) => o.className !== 'SceneEmbed');
          if (!objs.length) continue;
          const gmap = new Map<string, { x: number; y: number }>();
          for (const o of objs) gmap.set(o.id, getGlobalXY(objs, o));
          const minX = Math.min(...objs.map((o) => gmap.get(o.id)!.x));
          const minY = Math.min(...objs.map((o) => gmap.get(o.id)!.y));
          for (const o of objs) {
            const gg = gmap.get(o.id)!;
            all.push({ ...o, id: `${embed.id}::${o.id}`, parentId: embed.id,
              transform: { ...getTransform(o), x: gg.x - minX, y: gg.y - minY } });
          }
        } catch { /* ignore missing/broken ref */ }
      }
      if (alive) setExternalObjects(all);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, embedReload, embedSig]);

  // Lista obiektów do RENDEROWANIA = scena + osadzone (read-only). Edycje operują tylko na scene.objects.
  const renderObjects = useMemo(() => (externalObjects.length ? [...scene.objects, ...externalObjects] : scene.objects), [scene.objects, externalObjects]);

  const rfNodesBase = useMemo((): Node[] => {
    // ── Layout grup stylizowanych (Tab/Table) ────────────────────────────────
    // Dla grupy G ze stylem tab/table każda bezpośrednia grupa-dziecko = zakładka/
    // komórka (panel). Zawartość panelu = poddrzewo tej grupy. Ustalamy nadpisania
    // pozycji (przeniesienie panelu + poddrzewa o deltę) i ukrycie (hidden) dla
    // nieaktywnych zakładek / komórek poza siatką. Węzły to nadal edytowalne
    // węzły RF — jedynie repozycjonowane/filtrowane.
    const styledFlats: Array<{ id: string; x: number; y: number; parentId?: string }> = [
      ...(scene.functionCalls ?? []), ...(vars ?? []), ...(scene.classObjs ?? []),
      ...(scene.getProps ?? []), ...(scene.setProps ?? []),
    ];
    const { styledPos, styledHidden, styledPanel, clipBox } = computeStyledLayout(renderObjects, styledFlats);
    // clip-path (polygon) w LOKALNYCH współrzędnych węzła — prostokąt widoczny = przecięcie
    // z clipBox grupy z clip=true. NIEZALEŻNY od rozmiaru węzła (kluczowe dla węzłów
    // auto-rozmiarowych: inset od prawej/dołu wymagałby znajomości rozmiaru → over-clip →
    // węzeł znikał). Skaluje się z zoomem viewportu (jednostki flow).
    const clipStyleFor = (id: string, px: number, py: number): { clipPath: string } | undefined => {
      const cb = clipBox.get(id);
      if (!cb) return undefined;
      const L = cb.x - px, T = cb.y - py, R = cb.x + cb.w - px, B = cb.y + cb.h - py;
      return { clipPath: `polygon(${L}px ${T}px, ${R}px ${T}px, ${R}px ${B}px, ${L}px ${B}px)` };
    };

    const dashNodes: Node[] = [];
    for (const obj of renderObjects) {
      const t = getTransform(obj);
      const g = getGlobalXY(renderObjects, obj); // pozycja globalna z akumulacji łańcucha rodziców
      const pos = styledPos.get(obj.id) ?? g;    // nadpisanie pozycji przez layout Tab/Table
      const hidden = styledHidden.has(obj.id);   // ukrycie nieaktywnych zakładek/komórek
      if (obj.kind === 'group') {
        const childCount = renderObjects.filter((o) => o.parentId === obj.id).length;
        const gStyle = ((obj.properties?.style as string) ?? 'normal') as 'normal' | 'tab' | 'table';
        const isPanel = styledPanel.has(obj.id);
        const cellGroups = (gStyle === 'tab' || gStyle === 'table')
          ? renderObjects.filter((o) => o.parentId === obj.id && o.kind === 'group') : [];
        const activeTab = Math.min(Math.max(0, Math.floor(Number(obj.properties?.activeTab ?? 0))), Math.max(0, cellGroups.length - 1));
        // Głębokość w drzewie — grupa MUSI mieć NIŻSZY zIndex niż jej potomkowie (grupy i
        // treść), by klik/drag bloczka WEWNĄTRZ Tab/Table/grupy trafiał w bloczek, nie w
        // kontener. Deeper = wyżej; wszystkie grupy < treść (zIndex 0).
        let gDepth = 0; { let pw = obj.parentId, dd = 0; while (pw && dd < MAX_PARENT_DEPTH) { const pp = scene.objects.find((o) => o.id === pw); if (!pp) break; gDepth++; pw = pp.parentId; dd++; } }
        dashNodes.push({
          id: obj.id, type: 'group',
          position: pos,
          hidden,
          // Give ReactFlow the node's real size so its selection/interaction box
          // matches the visual group box — otherwise a resize grows the inner box
          // while the cached DOM-measured bbox (and selection outline) lag behind.
          // border/background:none — typ 'group' jest WBUDOWANY w ReactFlow i dokłada
          // domyślny styl `.react-flow__node-group` (ciemny border + szare tło). Chcemy,
          // by CAŁY wygląd (i „Show frame") kontrolował wyłącznie nasz GroupNode.
          style: { width: t.width > 0 ? t.width : 320, height: t.height > 0 ? t.height : 240, border: 'none', background: 'transparent', ...clipStyleFor(obj.id, pos.x, pos.y) },
          selected: selectedIds.has(obj.id),
          zIndex: obj.zIndex ?? (-50 + gDepth),
          data: {
            objectId: obj.id, objectName: obj.objectName, transform: t,
            selected: selectedIds.has(obj.id), childCount,
            // Panel (aktywna zakładka/komórka) nie ma własnej ramki ani nagłówka.
            showFrame: isPanel ? false : obj.properties?.showFrame !== false,
            style: gStyle, isPanel,
            rows: Math.max(1, Math.floor(Number(obj.properties?.rows ?? 2))),
            columns: Math.max(1, Math.floor(Number(obj.properties?.columns ?? 2))),
            activeTab, tabCaptions: cellGroups.map((c) => c.objectName),
            onActiveTabChange: (i: number) => updateProperty(obj.id, 'activeTab', i),
            onObjectNameChange: (name: string) => updateObjectName(obj.id, name),
            onResizeDrag: (width: number, height: number) => updateTransform(obj.id, { width, height }),
          } as GroupNodeData,
        });
        continue;
      }
      if (obj.kind === 'shape') {
        dashNodes.push({
          id: obj.id, type: 'shape',
          position: pos,
          hidden,
          style: { width: t.width > 0 ? t.width : 120, height: t.height > 0 ? t.height : 80, ...clipStyleFor(obj.id, pos.x, pos.y) },
          selected: selectedIds.has(obj.id),
          zIndex: obj.zIndex ?? 0,
          data: {
            objectId: obj.id, objectName: obj.objectName,
            shapeType: (obj.properties?.shape as ShapeType) ?? 'rect',
            transform: t, properties: obj.properties ?? {},
            selected: selectedIds.has(obj.id),
            onGizmo: (patch: Partial<DashTransform>) => updateTransform(obj.id, patch),
            onFlipDiag: () => updateProperty(obj.id, 'flipDiag', obj.properties?.flipDiag !== true),
          },
        });
        continue;
      }
      if (obj.kind === 'qt-widget') {
        const parentObj = obj.parentId ? scene.objects.find((o) => o.id === obj.parentId) : undefined;
        // A qt-widget nested under another qt-widget is drawn *inside* its parent
        // node (real Qt parent/child) — it gets no top-level node of its own.
        if (parentObj && parentObj.kind === 'qt-widget') continue;
        // Gather qt-widget descendants (BFS → parents before children) so the node
        // rebuilds the whole subtree with correct setParent() ordering.
        const descendants: QtWidgetSpec[] = [];
        const queue = scene.objects.filter((o) => o.parentId === obj.id && o.kind === 'qt-widget');
        while (queue.length) {
          const c = queue.shift()!;
          descendants.push({ id: c.id, className: c.className, properties: c.properties, transform: getTransform(c), parentId: c.parentId });
          for (const gc of scene.objects.filter((o) => o.parentId === c.id && o.kind === 'qt-widget')) queue.push(gc);
        }
        dashNodes.push({
          id: obj.id, type: 'qtWidget',
          position: pos,
          hidden,
          style: { width: t.width > 0 ? t.width : 160, height: t.height > 0 ? t.height : 120, ...clipStyleFor(obj.id, pos.x, pos.y) },
          selected: selectedIds.has(obj.id),
          // In Select QT / Action mode the node is not draggable — clicks select nested
          // widgets (Select QT) or go live to the widget (Action). Both modes also disable
          // RF node selection: in Select QT selection is driven manually via onSelectWidget
          // (letting RF also fire a select change for the container node would add it to
          // selectedIds → size 2 → Properties shows "No selection"); in Action a widget
          // click must not select the RF node at all.
          draggable: !qtSelectMode && !actionMode,
          selectable: !actionMode && !qtSelectMode,
          zIndex: obj.zIndex ?? 0,
          data: {
            objectId: obj.id, objectName: obj.objectName, className: obj.className,
            spec: { id: obj.id, className: obj.className, properties: obj.properties, transform: t },
            children: descendants,
            transform: t, nodeX: pos.x, nodeY: pos.y, selected: selectedIds.has(obj.id),
            selectMode: qtSelectMode,
            actionMode,
            signalHandlersMap,
            onSignal: runSignalHandler,
            selectedDescendants: descendants.filter((d) => selectedIds.has(d.id)).map((d) => d.id),
            onSelectWidget: (id: string, additive: boolean) => setSelectedIds((prev) => {
              if (additive) { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }
              return new Set([id]);
            }),
            onResizeDrag: (width: number, height: number) => updateTransform(obj.id, { width, height }),
          } as QtWidgetNodeData,
        });
        continue;
      }
      const isCustom = obj.className === 'Unknown' || obj.customFields !== undefined;
      const fields: FieldDef[] = isCustom ? (obj.customFields ?? []) : (classMap.get(obj.className)?.fields ?? []);
      dashNodes.push({
        id: obj.id, type: 'dashObject',
        position: pos,
        hidden,
        style: clipStyleFor(obj.id, pos.x, pos.y),
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
      });
    }

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
      const fcP = styledPos.get(fc.id) ?? getFlatGlobalXY(scene.objects, fc);
      return {
        id: fc.id, type: 'fcNode',
        position: fcP,
        hidden: styledHidden.has(fc.id),
        style: clipStyleFor(fc.id, fcP.x, fcP.y),
        selected: selectedIds.has(fc.id),
        data: {
          fcId: fc.id, symbolPath: fc.symbolPath, paramNames: fc.paramNames,
          argOverrides: fc.argOverrides, result: fc.result, error: fc.error,
          running: fcRunning.has(fc.id), connectedArgValues, connectedThisValue,
          selected: selectedIds.has(fc.id),
          pinsFlipped: fc.pinsFlipped ?? false,
          lang: fc.lang,
          onCall: () => { void callFunctionForNode(fc.id); },
          onArgOverrideChange: (idx: number, val: string) => updateFcArgOverride(fc.id, idx, val),
        } as FcNodeData,
      };
    });

    const varNodes: Node<VarNodeData>[] = vars.map((v) => {
      const vP = styledPos.get(v.id) ?? getFlatGlobalXY(scene.objects, v);
      return {
      id: v.id, type: 'varNode',
      position: vP,
      hidden: styledHidden.has(v.id),
      style: clipStyleFor(v.id, vP.x, vP.y),
      selected: selectedIds.has(v.id),
      data: {
        varId: v.id, varName: v.varName, varValue: v.varValue,
        selected: selectedIds.has(v.id),
        pinsFlipped: v.pinsFlipped ?? false,
        onNameChange: (name: string) => updateVarName(v.id, name),
        onEditValue: () => { setVarInitTargetId(v.id); setVarInitDialogOpen(true); },
        onValueChange: (json: string) => updateScene((p) => ({ ...p, vars: (p.vars ?? []).map((vr) => vr.id === v.id ? { ...vr, varValue: json } : vr) })),
      } as VarNodeData,
    }; });

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
      const objP = styledPos.get(obj.id) ?? getFlatGlobalXY(scene.objects, obj);
      return {
        id: obj.id, type: 'objNode',
        position: objP,
        hidden: styledHidden.has(obj.id),
        style: clipStyleFor(obj.id, objP.x, objP.y),
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

    const getPropNodes: Node<GetPropNodeData>[] = (scene.getProps ?? []).map((n) => {
      const nP = styledPos.get(n.id) ?? getFlatGlobalXY(scene.objects, n);
      return {
      id: n.id, type: 'getPropNode',
      position: nP,
      hidden: styledHidden.has(n.id),
      style: clipStyleFor(n.id, nP.x, nP.y),
      selected: selectedIds.has(n.id),
      data: {
        nodeId: n.id, propNameOverride: n.propNameOverride,
        result: n.result, error: n.error,
        selected: selectedIds.has(n.id),
        onRun: () => { runGetProp(n.id); },
        onPropNameChange: (v: string) => { updateGetPropName(n.id, v); },
      } as GetPropNodeData,
    }; });

    const setPropNodes: Node<SetPropNodeData>[] = (scene.setProps ?? []).map((n) => {
      const nP = styledPos.get(n.id) ?? getFlatGlobalXY(scene.objects, n);
      return {
      id: n.id, type: 'setPropNode',
      position: nP,
      hidden: styledHidden.has(n.id),
      style: clipStyleFor(n.id, nP.x, nP.y),
      selected: selectedIds.has(n.id),
      data: {
        nodeId: n.id, propNameOverride: n.propNameOverride,
        result: n.result, error: n.error,
        selected: selectedIds.has(n.id),
        onRun: () => { runSetProp(n.id); },
        onPropNameChange: (v: string) => { updateSetPropName(n.id, v); },
      } as SetPropNodeData,
    }; });

    // Obiekty osadzonej sceny (id z `::`) są READ-ONLY: nie przeciągalne/zaznaczalne,
    // by nie trafiały do edycji/zapisu głównej sceny.
    const readonlyDash = dashNodes.map((n) => n.id.includes('::') ? { ...n, draggable: false, selectable: false } : n);
    const all = [...readonlyDash, ...fcNodes, ...varNodes, ...classObjNodes, ...getPropNodes, ...setPropNodes];
    // MiniMap renderuje węzeł tylko gdy ma wymiary (measured ?? width ?? initialWidth).
    // Auto-rozmiarowe węzły (bez width w style) i te niezmierzone znikały z minimapy —
    // dokładamy initialWidth/initialHeight (hint, nie usztywnia auto-rozmiaru).
    const MM_DEF: Record<string, [number, number]> = {
      group: [320, 240], shape: [120, 80], qtWidget: [160, 120], dashObject: [220, 140],
      fcNode: [220, 120], varNode: [180, 70], objNode: [200, 120], getPropNode: [180, 90], setPropNode: [180, 90],
    };
    return all.map((n) => {
      const sw = typeof n.style?.width === 'number' ? n.style.width as number : undefined;
      const sh = typeof n.style?.height === 'number' ? n.style.height as number : undefined;
      const [dw, dh] = MM_DEF[n.type ?? ''] ?? [180, 100];
      return { ...n, initialWidth: sw ?? dw, initialHeight: sh ?? dh };
    });
  }, [renderObjects, scene.objects, scene.fcEdges, scene.classObjs, scene.getProps, scene.setProps, classMap, selectedIds, selectedField, userName, qtSelectMode,
      actionMode, signalHandlersMap, runSignalHandler,
      updateProperty, updateObjectName, addCustomField, removeCustomField, changeCustomFieldType, renameCustomField, updateTransform,
      functionCalls, vars, fcRunning, callFunctionForNode, updateFcArgOverride, updateVarName,
      applyClassObj, flipClassObj, runGetProp, runSetProp, updateGetPropName, updateSetPropName]);

  // Overlay drag positions on top of base nodes without touching scene state.
  const rfNodes = useMemo((): Node[] => {
    if (!dragNodePositions) return rfNodesBase;
    return rfNodesBase.map((n) => {
      const pos = dragNodePositions.get(n.id);
      return pos ? { ...n, position: pos } : n;
    });
  }, [rfNodesBase, dragNodePositions]);

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
          ? { stroke: isSelected ? '#ef5350' : '#7c4dff', strokeWidth: isSelected ? 3 : 2, strokeDasharray: '6 3' }
          : { stroke: isSelected ? '#ef5350' : '#81c784', strokeWidth: isSelected ? 2.5 : 1.5 },
        deletable: true,
      };
    });
    return [...propEdges, ...flowEdges];
  }, [scene.objects, scene.fcEdges, objectIds, selectedEdgeIds]);

  const MAX_DRAG_STEP = 2000;
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Mid-drag: aktualizuj tylko lekką nakładkę pozycji (ReactFlow w trybie
    // controlled potrzebuje pozycji z propa, by node się przesuwał). Aby ograniczyć
    // koszt na mobile, ciężkie panele są zmemoizowane (patrz useMemo niżej).
    const validMidDrag: Array<{ id: string; x: number; y: number }> = [];
    for (const c of changes) {
      if (c.type !== 'position' || !c.dragging || !c.position) continue;
      if (!Number.isFinite(c.position.x) || !Number.isFinite(c.position.y)) continue;
      const lastKnown = dragNodePositionsRef.current.get(c.id);
      let baseX: number, baseY: number;
      if (lastKnown) { baseX = lastKnown.x; baseY = lastKnown.y; }
      else {
        const sc = sceneRef.current;
        const obj = sc.objects.find((o) => o.id === c.id);
        if (obj) { const gp = getGlobalXY(sc.objects, obj); baseX = gp.x; baseY = gp.y; }
        else {
          const it = (sc.functionCalls ?? []).find((f) => f.id === c.id) || (sc.vars ?? []).find((v) => v.id === c.id)
            || (sc.classObjs ?? []).find((o) => o.id === c.id) || (sc.getProps ?? []).find((n) => n.id === c.id) || (sc.setProps ?? []).find((n) => n.id === c.id);
          if (it) { const gp = getFlatGlobalXY(sc.objects, it); baseX = gp.x; baseY = gp.y; } else { baseX = c.position.x; baseY = c.position.y; }
        }
      }
      if (Math.abs(c.position.x - baseX) > MAX_DRAG_STEP || Math.abs(c.position.y - baseY) > MAX_DRAG_STEP) continue;
      validMidDrag.push({ id: c.id, x: c.position.x, y: c.position.y });
    }
    // Live-follow group children (WSZYSTKIE typy, rekurencyjnie dla zagnieżdżonych grup).
    if (validMidDrag.length > 0) {
      const sc = sceneRef.current;
      const dragged = new Set(validMidDrag.map((m) => m.id));
      const others = [...(sc.functionCalls ?? []), ...(sc.vars ?? []), ...(sc.classObjs ?? []), ...(sc.getProps ?? []), ...(sc.setProps ?? [])];
      const extra: Array<{ id: string; x: number; y: number }> = [];
      // Layout Tab/Table: dzieci-panele mają WYŚWIETLANĄ pozycję (styledPos), nie stored.
      const layout = computeStyledLayout(sc.objects, others);
      const dispG = (id: string, o: DashObject): { x: number; y: number } => layout.styledPos.get(id) ?? getGlobalXY(sc.objects, o);
      const dispF = (id: string, f: { x: number; y: number; parentId?: string }): { x: number; y: number } => layout.styledPos.get(id) ?? getFlatGlobalXY(sc.objects, f);
      // Overlay pozycji jest GLOBALNY: dziecko podąża o tę samą globalną deltę co grupa
      // (bazując na pozycji WYŚWIETLANEJ; ukryte zakładki/komórki pomijamy).
      const follow = (groupId: string, dx: number, dy: number) => {
        for (const child of sc.objects) {
          if (child.parentId !== groupId) continue;
          if (!dragged.has(child.id) && !layout.styledHidden.has(child.id)) { const cg = dispG(child.id, child); extra.push({ id: child.id, x: cg.x + dx, y: cg.y + dy }); }
          if (child.kind === 'group') follow(child.id, dx, dy);   // zagnieżdżona grupa → jej dzieci też
        }
        for (const child of others) {
          if (child.parentId !== groupId || dragged.has(child.id) || layout.styledHidden.has(child.id)) continue;
          const cg = dispF(child.id, child);
          extra.push({ id: child.id, x: cg.x + dx, y: cg.y + dy });
        }
      };
      for (const m of validMidDrag) {
        const grp = sc.objects.find((o) => o.id === m.id && o.kind === 'group');
        if (!grp) continue;
        const g0 = dispG(grp.id, grp);
        follow(grp.id, m.x - g0.x, m.y - g0.y);
      }
      validMidDrag.push(...extra);
    }
    if (validMidDrag.length > 0) {
      for (const p of validMidDrag) dragNodePositionsRef.current.set(p.id, { x: p.x, y: p.y });
      setDragNodePositions((prev) => { const m = new Map(prev); for (const p of validMidDrag) m.set(p.id, { x: p.x, y: p.y }); return m; });
    }
    // Nie synchronizuj 'select' z ReactFlow, gdy rubber-band właśnie ustawił zaznaczenie —
    // inaczej pane-click deselect ReactFlow wyczyściłby nasz wybór (band pokazywał
    // selectedCount>0, ale wizualnie nic).
    const selChanges = changes.filter((c) => c.type === 'select');
    if (selChanges.length > 0 && !rubberSuppressRef.current) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of selChanges) { if (c.type === 'select') { if (c.selected) next.add(c.id); else next.delete(c.id); } }
        return next;
      });
    }
  }, []);

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
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !target) return;
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

  // WSZYSTKIE elementy sceny jako jednolite pozycje drzewa (mają parentId → można je
  // grupować pod group; grupy też mogą być zagnieżdżane). Typ steruje ikoną/kolorem.
  const unifiedItems = useMemo((): UTreeItem[] => {
    const out: UTreeItem[] = [];
    for (const o of scene.objects) out.push({ id: o.id, parentId: o.parentId, type: 'object', kind: o.kind, name: o.objectName, sub: o.className });
    for (const f of scene.functionCalls ?? []) out.push({ id: f.id, parentId: f.parentId, type: 'fc', name: (f.symbolPath.split('.').pop() || f.symbolPath) + '()', sub: 'fn' });
    for (const v of scene.vars ?? []) out.push({ id: v.id, parentId: v.parentId, type: 'var', name: v.varName, sub: 'var' });
    for (const o of scene.classObjs ?? []) out.push({ id: o.id, parentId: o.parentId, type: 'classObj', name: o.className, sub: 'obj' });
    for (const n of scene.getProps ?? []) out.push({ id: n.id, parentId: n.parentId, type: 'getProp', name: n.propNameOverride || 'getProp', sub: 'get' });
    for (const n of scene.setProps ?? []) out.push({ id: n.id, parentId: n.parentId, type: 'setProp', name: n.propNameOverride || 'setProp', sub: 'set' });
    return out;
  }, [scene.objects, scene.functionCalls, scene.vars, scene.classObjs, scene.getProps, scene.setProps]);

  // Hierarchy for the Scene tree: containers (group / qt-widget) hold children
  // (dowolny typ pod group; tylko qt-widgety pod qt-widget). Każda pozycja raz.
  const treeRows = useMemo((): Array<{ item: UTreeItem; depth: number; childCount: number }> => {
    const q = searchText.toLowerCase();
    const filtered = searchText ? unifiedItems.filter((i) => i.name.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q)) : unifiedItems;
    const present = new Set(filtered.map((i) => i.id));
    const childrenOf = (id: string) => filtered.filter((c) => c.parentId === id);
    const isContainer = (i: UTreeItem) => i.type === 'object' && (i.kind === 'group' || i.kind === 'qt-widget');
    const rows: Array<{ item: UTreeItem; depth: number; childCount: number }> = [];
    const emit = (item: UTreeItem, depth: number) => {
      const kids = childrenOf(item.id);
      rows.push({ item, depth, childCount: kids.length });
      if (isContainer(item) && kids.length && !collapsedGroups.has(item.id)) {
        for (const c of kids) emit(c, depth + 1);
      }
    };
    for (const item of filtered) {
      const isRoot = !item.parentId || !present.has(item.parentId);
      if (isRoot) emit(item, 0);
    }
    return rows;
  }, [unifiedItems, searchText, collapsedGroups]);

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds((prev) => {
      if (multi) { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }
      return new Set([id]);
    });
  }, []);

  const flyTo = useCallback((objId: string) => {
    const sc = sceneRef.current;
    const obj = sc.objects.find((o) => o.id === objId);
    let cx: number, cy: number;
    if (obj) { const t = getTransform(obj); cx = t.x + (t.width > 0 ? t.width / 2 : 100); cy = t.y + (t.height > 0 ? t.height / 2 : 60); }
    else {
      const n = (sc.functionCalls ?? []).find((f) => f.id === objId) || (sc.vars ?? []).find((v) => v.id === objId)
        || (sc.classObjs ?? []).find((o) => o.id === objId) || (sc.getProps ?? []).find((g) => g.id === objId) || (sc.setProps ?? []).find((s) => s.id === objId);
      if (!n) return; cx = n.x + 100; cy = n.y + 60;
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    setCenter(cx, cy, { zoom: 1, duration: 0 }); // instant (animowany bywa ignorowany na mobile)
  }, [setCenter]);

  // Odzyskiwanie: układa WSZYSTKIE node'y (także te z zepsutą/skrajną pozycją) w
  // czytelną siatkę i dopasowuje widok. Ratunek po „wyrzuceniu" bloczka poza kadr.
  const gatherNodes = useCallback(() => {
    updateScene((prev) => {
      let i = 0;
      const cols = 6, gapX = 240, gapY = 150, x0 = 40, y0 = 40;
      const next = () => { const c = i % cols, r = Math.floor(i / cols); i++; return { x: x0 + c * gapX, y: y0 + r * gapY }; };
      // Dzieci qt-widgetów pozycjonują się względem rodzica — ich nie ruszamy.
      const qtChildIds = new Set(prev.objects.filter((o) => o.parentId && prev.objects.some((p) => p.id === o.parentId && p.kind === 'qt-widget')).map((o) => o.id));
      return {
        ...prev,
        objects: prev.objects.map((o) => { if (qtChildIds.has(o.id)) return o; const p = next(); return { ...o, transform: { ...getTransform(o), x: p.x, y: p.y } }; }),
        functionCalls: (prev.functionCalls ?? []).map((f) => { const p = next(); return { ...f, x: p.x, y: p.y }; }),
        vars: (prev.vars ?? []).map((v) => { const p = next(); return { ...v, x: p.x, y: p.y }; }),
        classObjs: (prev.classObjs ?? []).map((o) => { const p = next(); return { ...o, x: p.x, y: p.y }; }),
        getProps: (prev.getProps ?? []).map((n) => { const p = next(); return { ...n, x: p.x, y: p.y }; }),
        setProps: (prev.setProps ?? []).map((n) => { const p = next(); return { ...n, x: p.x, y: p.y }; }),
      };
    });
    setTimeout(() => fitAllNodes(), 120);
  }, [updateScene, fitAllNodes]);

  // Re-parent DOWOLNY element sceny (object/var/fc/classObj/getProp/setProp) do grupy.
  // Grupy można zagnieżdżać (group→group). qt-widgety mieszczą tylko qt-widgety.
  const reparentObject = useCallback((itemId: string, newParentId: string | undefined) => {
    if (itemId === newParentId) return;
    const sc = sceneRef.current;
    const parentIdOf = (id: string): string | undefined => {
      const o = sc.objects.find((x) => x.id === id); if (o) return o.parentId;
      const f = (sc.functionCalls ?? []).find((x) => x.id === id); if (f) return f.parentId;
      const v = (sc.vars ?? []).find((x) => x.id === id); if (v) return v.parentId;
      const c = (sc.classObjs ?? []).find((x) => x.id === id); if (c) return c.parentId;
      const g = (sc.getProps ?? []).find((x) => x.id === id); if (g) return g.parentId;
      const s = (sc.setProps ?? []).find((x) => x.id === id); if (s) return s.parentId;
      return undefined;
    };
    const draggedObj = sc.objects.find((o) => o.id === itemId);
    const type: UTreeItemType | null =
      draggedObj ? 'object'
      : (sc.functionCalls ?? []).some((f) => f.id === itemId) ? 'fc'
      : (sc.vars ?? []).some((v) => v.id === itemId) ? 'var'
      : (sc.classObjs ?? []).some((o) => o.id === itemId) ? 'classObj'
      : (sc.getProps ?? []).some((n) => n.id === itemId) ? 'getProp'
      : (sc.setProps ?? []).some((n) => n.id === itemId) ? 'setProp'
      : null;
    if (!type) return;
    if (newParentId) {
      const parent = sc.objects.find((o) => o.id === newParentId);
      if (!parent) return;                                         // rodzic musi być kontenerem (DashObject)
      if (parent.kind === 'qt-widget') {
        if (!(type === 'object' && draggedObj?.kind === 'qt-widget')) return;  // qt-widget mieści tylko qt-widgety
      } else if (parent.kind !== 'group') {
        return;                                                    // tylko group / qt-widget są kontenerami
      }
      // Guard cykli: nowy rodzic nie może być potomkiem przeciąganego elementu.
      let cur: string | undefined = newParentId;
      while (cur) { if (cur === itemId) return; cur = parentIdOf(cur); }
    }
    const setP = <T extends { id: string; parentId?: string }>(arr: T[] | undefined): T[] | undefined =>
      arr?.map((x) => x.id === itemId ? { ...x, parentId: newParentId } : x);
    updateScene((prev) => {
      switch (type) {
        case 'object': return { ...prev, objects: prev.objects.map((o) => o.id === itemId ? { ...o, parentId: newParentId } : o) };
        case 'fc': return { ...prev, functionCalls: setP(prev.functionCalls) };
        case 'var': return { ...prev, vars: setP(prev.vars) };
        case 'classObj': return { ...prev, classObjs: setP(prev.classObjs) };
        case 'getProp': return { ...prev, getProps: setP(prev.getProps) };
        case 'setProp': return { ...prev, setProps: setP(prev.setProps) };
      }
    });
  }, [updateScene]);

  // Drag&drop drzewa SCENE oparty na Pointer Events (natywne HTML5 DnD nie odpala się
  // na mobile). Drag startuje z DEDYKOWANEGO uchwytu (grip) — uchwyt ma
  // `touch-action:none`, więc przeciąganie NIGDY nie scrolluje listy (brak konfliktu
  // scroll↔drag; reszta wiersza normalnie się przewija i zaznacza tapnięciem).
  const treeDragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; started: boolean } | null>(null);
  const beginTreeRowDrag = useCallback((objId: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();   // z uchwytu: nie zaznaczaj wiersza
    const st = { id: objId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, started: false };
    treeDragRef.current = st;
    const findOver = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      const row = el?.closest('[data-tree-id]') as HTMLElement | null;
      const id = row?.getAttribute('data-tree-id') ?? null;
      if (!id || id === st.id) return null;
      const t = sceneRef.current.objects.find((o) => o.id === id);
      return (t && (t.kind === 'group' || t.kind === 'qt-widget')) ? id : null;
    };
    const onMove = (me: PointerEvent) => {
      if (me.pointerId !== st.pointerId) return;
      if (!st.started) {
        if (Math.abs(me.clientX - st.startX) < 5 && Math.abs(me.clientY - st.startY) < 5) return;
        st.started = true; setTreeDragId(st.id);
      }
      setTreeDragOverId(findOver(me.clientX, me.clientY));
    };
    const onUp = (ue: PointerEvent) => {
      if (st.started) {
        const over = findOver(ue.clientX, ue.clientY);
        if (over) reparentObject(st.id, over);
        else if (document.elementFromPoint(ue.clientX, ue.clientY)?.closest('[data-tree-panel]')) reparentObject(st.id, undefined);
      }
      cleanup();
    };
    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (treeDragRef.current === st) treeDragRef.current = null;
      setTreeDragId(null); setTreeDragOverId(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [reparentObject]);

  // Rubber-band selekcji (desktop I mobile) z auto-panem przy krawędzi. Startuje gdy
  // tryb Rect Select jest aktywny i wskaźnik pada na pustą powierzchnię (pane), nie na
  // bloczek/handle. Zastępuje natywne selectionOnDrag RF (które nie auto-panuje).
  const rubberRef = useRef<{ startCX: number; startCY: number; ox: number; oy: number; pointerId: number; started: boolean; lastX: number; lastY: number } | null>(null);
  const onFlowPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (canvasMode !== 'select' || e.button !== 0) return;
    const target = e.target as HTMLElement;
    // W trybie Rect Select rubber-band startuje TAKŻE nad obiektami (nie tylko z pustego
    // miejsca) — inaczej w gęstej scenie nie sposób objąć wszystkich węzłów. Pomijamy tylko
    // uchwyty połączeń (`react-flow__handle`) i gizmo/nav (`nodrag`), by nie kolidować z
    // ich obsługą. UWAGA: klasy `nopan` NIE używamy — ReactFlow dodaje ją do KAŻDEGO węzła,
    // więc blokowałaby band nad wszystkim; body węzła ma `nopan` ale nie `nodrag`.
    if (target.closest('.react-flow__handle') || target.closest('.nodrag')) return;
    const wrap = flowWrapRef.current;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const st = { startCX: e.clientX, startCY: e.clientY, ox: wr.left, oy: wr.top, pointerId: e.pointerId, started: false, lastX: e.clientX, lastY: e.clientY };
    rubberRef.current = st;
    // Auto-pan TYLKO gdy palec dojedzie do krawędzi widoku — inaczej widok stoi.
    let panRaf = 0;
    const EDGE = 44, SPEED = 14;
    const drawBand = () => setRubberBand({ x0: st.startCX - st.ox, y0: st.startCY - st.oy, x1: st.lastX - st.ox, y1: st.lastY - st.oy });
    const autoPan = () => {
      panRaf = 0;
      if (!st.started) return;
      const r = wrap.getBoundingClientRect();
      let dx = 0, dy = 0;
      if (st.lastX < r.left + EDGE) dx = SPEED; else if (st.lastX > r.right - EDGE) dx = -SPEED;
      if (st.lastY < r.top + EDGE) dy = SPEED; else if (st.lastY > r.bottom - EDGE) dy = -SPEED;
      if (dx || dy) {
        const vp = getViewport();
        setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
        drawBand();
        panRaf = requestAnimationFrame(autoPan);
      }
    };
    const maybeAutoPan = () => {
      const r = wrap.getBoundingClientRect();
      const near = st.lastX < r.left + EDGE || st.lastX > r.right - EDGE || st.lastY < r.top + EDGE || st.lastY > r.bottom - EDGE;
      if (near && !panRaf) panRaf = requestAnimationFrame(autoPan);
    };
    const onMove = (me: PointerEvent) => {
      if (me.pointerId !== st.pointerId) return;
      if (!st.started && Math.abs(me.clientX - st.startCX) < 6 && Math.abs(me.clientY - st.startCY) < 6) return;
      st.started = true; st.lastX = me.clientX; st.lastY = me.clientY;
      drawBand();
      maybeAutoPan();
    };
    const cleanup = () => {
      if (panRaf) { cancelAnimationFrame(panRaf); panRaf = 0; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      rubberRef.current = null;
      setRubberBand(null);
    };
    const onUp = (ue: PointerEvent) => {
      const started = st.started;
      // Nasze zaznaczenie jest autorytatywne — zablokuj sync 'select' z ReactFlow na krótko,
      // by pane-click deselect ReactFlow (po pointerup) nie wyczyścił naszego wyboru.
      rubberSuppressRef.current = true;
      setTimeout(() => { rubberSuppressRef.current = false; }, 220);
      cleanup();
      if (!started) {
        // Klik bez przeciągnięcia: zaznacz pojedynczy węzeł pod kursorem (albo wyczyść).
        // Band ma pointerEvents:none, więc elementFromPoint zwraca właściwy węzeł.
        const el = document.elementFromPoint(ue.clientX, ue.clientY);
        const nodeEl = el ? el.closest('.react-flow__node') : null;
        const id = nodeEl ? nodeEl.getAttribute('data-id') : null;
        setSelectedIds(id ? new Set([id]) : new Set());
        return;
      }
      const x0 = Math.min(st.startCX, ue.clientX), y0 = Math.min(st.startCY, ue.clientY);
      const x1 = Math.max(st.startCX, ue.clientX), y1 = Math.max(st.startCY, ue.clientY);
      const ids = new Set<string>();
      wrap.querySelectorAll('.react-flow__node').forEach((n) => {
        const b = (n as HTMLElement).getBoundingClientRect();
        if (b.right > x0 && b.left < x1 && b.bottom > y0 && b.top < y1) {
          const id = (n as HTMLElement).getAttribute('data-id');
          if (id) ids.add(id);
        }
      });
      setSelectedIds(ids);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [canvasMode, getViewport, setViewport]);

  const onNodeDragStop = useCallback((_evt: React.MouseEvent | React.TouchEvent, _node: Node, _draggedNodes: Node[]) => {
    // Użyj naszej zwalidowanej nakładki (nie draggedNodes RF — bywają złe na mobile).
    const finalPos = new Map(dragNodePositionsRef.current);
    dragNodePositionsRef.current.clear();
    setDragNodePositions(null);
    if (finalPos.size === 0) return; // nothing moved
    updateScene((prev) => {
      // Layout grup stylizowanych (Tab/Table) — kontenery nie są bezpośrednim hostem
      // dropu; ich widoczne panele (zakładka/komórka) są regionami dropu (dropRects).
      const layoutFlats = [
        ...(prev.functionCalls ?? []), ...(prev.vars ?? []), ...(prev.classObjs ?? []),
        ...(prev.getProps ?? []), ...(prev.setProps ?? []),
      ];
      const { containerIds, panelOrigin, dropRects } = computeStyledLayout(prev.objects, layoutFlats);
      // Group boxes at their final GLOBAL positions — for drag-into/out detection.
      // finalPos jest globalny (overlay); grupy nieprzesunięte liczymy z akumulacji.
      // Wykluczamy kontenery Tab/Table (host = ich panel, nie kontener) i same panele
      // (są reprezentowane przez dropRects w ich WYŚWIETLANYM regionie).
      const normalRects = prev.objects.filter((o) => o.kind === 'group' && !containerIds.has(o.id) && !panelOrigin.has(o.id)).map((o) => {
        const t = getTransform(o); const fp = finalPos.get(o.id);
        const gp = fp ? { x: fp.x, y: fp.y } : getGlobalXY(prev.objects, o);
        return { id: o.id, x: gp.x, y: gp.y, w: t.width > 0 ? t.width : 320, h: t.height > 0 ? t.height : 240 };
      });
      // Panele (dropRects) mają pierwszeństwo — drop w widocznej zakładce/komórce trafia
      // do grupy-panelu, nie do zewnętrznej grupy obejmującej kontener.
      const groupRects = [...dropRects, ...normalRects];
      const hostGroupAt = (cx: number, cy: number) => groupRects.find((g) => cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h);
      // Konwersja pozycji GLOBALNEJ na LOKALNĄ względem hosta. Dla panelu używamy jego
      // WYŚWIETLANEGO origin (layout), nie stored transform — inaczej dziecko skoczyłoby.
      const toLocalForHost = (hostId: string | undefined, gx: number, gy: number) => {
        if (hostId && panelOrigin.has(hostId)) { const o = panelOrigin.get(hostId)!; return { x: gx - o.x, y: gy - o.y }; }
        return toLocalXY(prev.objects, hostId, gx, gy);
      };
      // Czy któryś PRZODEK elementu został przesunięty w tym dragu? Jeśli tak, element
      // został „zmieciony" razem z przodkiem — jego LOKALNY transform pozostaje bez zmian
      // (finalPos zawiera jego nowy global tylko z powodu ruchu przodka).
      const ancestorMoved = (parentId: string | undefined): boolean => {
        let cur = parentId, depth = 0;
        while (cur && depth < MAX_PARENT_DEPTH) {
          if (finalPos.has(cur)) return true;
          const p = prev.objects.find((o) => o.id === cur);
          if (!p) break;
          cur = p.parentId; depth++;
        }
        return false;
      };
      // Model lokalny: przesunięty bloczek → nowa pozycja LOKALNA względem grupy-hosta
      // pod środkiem; zmieciony przez przodka lub nieprzesunięty → bez zmian.
      const repos = <T extends { id: string; x: number; y: number; parentId?: string }>(item: T): T => {
        const p = finalPos.get(item.id);
        if (!p || ancestorMoved(item.parentId)) return item;
        const host = hostGroupAt(p.x + 70, p.y + 25);
        // Brak trafienia w grupę → ZACHOWAJ dotychczasowego rodzica (nie odłączaj przy
        // wyciągnięciu poza ramkę). Odłączenie tylko przez menu „Odłącz od rodzica".
        const targetParent = host ? host.id : item.parentId;
        const local = toLocalForHost(targetParent, p.x, p.y);
        const next = { ...item, x: local.x, y: local.y } as T;
        if (targetParent) next.parentId = targetParent; else delete next.parentId;
        return next;
      };
      // Czy candidateId jest potomkiem ancestorId (guard cyklu przy przypinaniu grupy do grupy).
      const isDescendantOf = (candidateId: string, ancestorId: string): boolean => {
        let cur: string | undefined = candidateId, depth = 0;
        while (cur && depth < MAX_PARENT_DEPTH) {
          if (cur === ancestorId) return true;
          cur = prev.objects.find((o) => o.id === cur)?.parentId; depth++;
        }
        return false;
      };
      return {
        ...prev,
        objects: prev.objects.map((obj) => {
          if (obj.kind === 'group') {
            const p = finalPos.get(obj.id);
            if (!p || ancestorMoved(obj.parentId)) return obj; // nieprzesunięty lub zmieciony → lokalny bez zmian
            const t = getTransform(obj);
            const w = t.width > 0 ? t.width : 320, h = t.height > 0 ? t.height : 240;
            const host = hostGroupAt(p.x + w / 2, p.y + h / 2);
            // guard: nie przypinaj do samej siebie ani do własnego potomka (cykl)
            const valid = host && host.id !== obj.id && !isDescendantOf(host.id, obj.id);
            // Brak poprawnego trafienia → zachowaj dotychczasowego rodzica (nie odłączaj).
            const targetParent = valid ? host!.id : obj.parentId;
            const local = toLocalForHost(targetParent, p.x, p.y);
            const next: DashObject = { ...obj, transform: { ...t, x: local.x, y: local.y } };
            if (targetParent) next.parentId = targetParent; else delete next.parentId;
            return next;
          }
          const p = finalPos.get(obj.id);
          if (p && !ancestorMoved(obj.parentId)) {
            const t = getTransform(obj);
            const w = t.width > 0 ? t.width : 200, h = t.height > 0 ? t.height : 120;
            // qt-widget-dziecko qt-widgetu zostaje przy nim (real Qt parent) — pozycja lokalna surowa.
            const parentObj = obj.parentId ? prev.objects.find((o) => o.id === obj.parentId) : undefined;
            if (parentObj?.kind === 'qt-widget') return { ...obj, transform: { ...t, x: p.x, y: p.y } };
            const host = hostGroupAt(p.x + w / 2, p.y + h / 2);
            // Brak trafienia w grupę → zachowaj dotychczasowego rodzica (nie odłączaj przy
            // wyciągnięciu poza ramkę). Odłączenie tylko przez menu „Odłącz od rodzica".
            const targetParent = host ? host.id : obj.parentId;
            const local = toLocalForHost(targetParent, p.x, p.y);
            const next: DashObject = { ...obj, transform: { ...t, x: local.x, y: local.y } };
            if (targetParent) next.parentId = targetParent; else delete next.parentId;
            return next;
          }
          return obj;
        }),
        functionCalls: (prev.functionCalls ?? []).map(repos),
        vars: (prev.vars ?? []).map(repos),
        classObjs: (prev.classObjs ?? []).map(repos),
        getProps: (prev.getProps ?? []).map(repos),
        setProps: (prev.setProps ?? []).map(repos),
      };
    });
    // Po dragu mobilny GPU potrafi zostawić warstwę viewportu NIEPRZEMALOWANĄ
    // (node'y są, ale niewidoczne — Fit je „odsłania" bo zmienia transform).
    // Wymuszamy przemalowanie niewidocznym drgnięciem viewportu (x+1 → x).
    try {
      const v = getViewport();
      if (v && Number.isFinite(v.x)) {
        setViewport({ x: v.x + 1, y: v.y, zoom: v.zoom });
        setTimeout(() => { try { setViewport({ x: v.x, y: v.y, zoom: v.zoom }); } catch { /* ignore */ } }, 60);
      }
    } catch { /* ignore */ }
  }, [updateScene, getViewport, setViewport]);

  const showTypes = visiblePanels.includes('types');
  const showScene = visiblePanels.includes('scene');
  const showProperties = visiblePanels.includes('properties');
  const showDataSource = visiblePanels.includes('data');
  const showJson = visiblePanels.includes('json');

  if (loading) return <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={28} /></Box>;

  const pyodideLoading = pyodideProgress.phase === 'runtime' || pyodideProgress.phase === 'packages';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {pyodideLoading && <PyodideLoadingOverlay progress={pyodideProgress} />}

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
        <Tooltip title={canvasMode === 'select' ? 'Switch to Pan mode' : 'Rect Select: drag on canvas to select multiple nodes'}>
          <IconButton
            size="small"
            onClick={() => setCanvasMode((m) => m === 'select' ? 'pan' : 'select')}
            sx={{ p: 0.5, bgcolor: canvasMode === 'select' ? 'primary.main' : 'transparent', color: canvasMode === 'select' ? 'primary.contrastText' : 'inherit', borderRadius: 1, '&:hover': { bgcolor: canvasMode === 'select' ? 'primary.dark' : 'action.hover' } }}>
            {canvasMode === 'select' ? <CropFreeIcon sx={{ fontSize: 18 }} /> : <PanToolIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
        <Tooltip title={qtSelectMode ? 'Select QT: ON — kliknij zagnieżdżony widget na scenie, by go zaznaczyć' : 'Select QT: kliknij, by zaznaczać dzieci widgetów Qt na scenie'}>
          <IconButton
            size="small"
            onClick={() => setQtSelectMode((v) => { const nv = !v; if (nv) setActionMode(false); else setSelectedIds(new Set()); return nv; })}
            sx={{ p: 0.5, bgcolor: qtSelectMode ? '#26c6da' : 'transparent', color: qtSelectMode ? '#04252b' : 'inherit', borderRadius: 1, '&:hover': { bgcolor: qtSelectMode ? '#1eb0c4' : 'action.hover' } }}>
            <WidgetsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={actionMode ? 'Action: ON — bloczki są żywe (qt: signal/slot np. clicked). Pan/zoom na pustym tle.' : 'Action: uruchom obsługę zdarzeń bloczków — qt-widgety żyją (clicked → handler). Pan/zoom po tle.'}>
          <IconButton
            size="small"
            onClick={() => setActionMode((v) => { const nv = !v; if (nv) setQtSelectMode(false); return nv; })}
            sx={{ p: 0.5, bgcolor: actionMode ? '#66bb6a' : 'transparent', color: actionMode ? '#0a2a12' : 'inherit', borderRadius: 1, '&:hover': { bgcolor: actionMode ? '#4fa254' : 'action.hover' } }}>
            <PlayArrowIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit all nodes in view">
          <IconButton size="small" onClick={() => fitAllNodes()} sx={{ p: 0.5 }}>
            <FitScreenIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zbierz wszystkie bloczki w siatkę (ratunek gdy bloczek wypadł poza kadr)">
          <IconButton size="small" onClick={gatherNodes} sx={{ p: 0.5 }}>
            <GridViewIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {(selectedIds.size > 0 || selectedEdgeIds.size > 0) && (
          <Tooltip title="Delete selected (nodes + connections)">
            <IconButton size="small" color="error" onClick={deleteSelected} sx={{ p: 0.5 }}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={consoleOpen ? 'Hide Console' : 'Show Console'}>
          <IconButton size="small" onClick={() => setConsoleOpen((v) => !v)}
            sx={{ p: 0.5, color: consoleLogs.length > 0 && !consoleOpen ? 'warning.main' : 'inherit', position: 'relative' }}>
            <TerminalIcon sx={{ fontSize: 18 }} />
            {consoleLogs.length > 0 && !consoleOpen && (
              <Box component="span" sx={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }} />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Ustawienia (wbudowane biblioteki sandboxu)">
          <IconButton size="small" onClick={() => setShowSettings(true)} sx={{ p: 0.5 }}>
            <SettingsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {navStack.length > 0 && (
          <>
            <Typography sx={{ fontSize: 11, color: '#4db6ac', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ⤷ {activeFilePath.split('/').pop()}
            </Typography>
            <Tooltip title="Zamknij osadzoną scenę — wróć do sceny nadrzędnej">
              <Button size="small" variant="contained" color="warning" onClick={closeEmbeddedScene}
                startIcon={<CloseIcon sx={{ fontSize: 15 }} />} sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>
                Zamknij scenę
              </Button>
            </Tooltip>
          </>
        )}
        {workspaceFs && (
          <Tooltip title={showWorkspace ? 'Ukryj edytor (workspace)' : 'Pokaż edytor plików (workspace: zakładki, IntelliSense, terminal, agent)'}>
            <IconButton size="small" onClick={() => setShowWorkspace((v) => !v)}
              sx={{ p: 0.5, bgcolor: showWorkspace ? 'primary.main' : 'transparent', color: showWorkspace ? 'primary.contrastText' : 'inherit', borderRadius: 1, '&:hover': { bgcolor: showWorkspace ? 'primary.dark' : 'action.hover' } }}>
              <CodeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
        <Button size="small" variant="outlined" onClick={() => { setImportError(null); setShowImportDialog(true); }}
          sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>Import UML</Button>
        <Button size="small" variant={dirty ? 'contained' : 'outlined'} color={dirty ? 'primary' : 'inherit'} onClick={saveNow}
          sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>{dirty ? '● Save' : 'Save'}</Button>
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
              {/* Kształty — klik dodaje figurę na scenę (edytowalną gizmo/uchwytami). */}
              <Box sx={{ px: 1, pt: 0.75, pb: 0.25 }}>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>Kształty</Typography>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pb: 0.75 }}>
                {([
                  { type: 'rect', label: 'Prostokąt', svg: <rect x="3" y="6" width="18" height="12" rx="1" /> },
                  { type: 'rhombus', label: 'Romb', svg: <polygon points="12,3 21,12 12,21 3,12" /> },
                  { type: 'ellipse', label: 'Koło', svg: <circle cx="12" cy="12" r="9" /> },
                  { type: 'line', label: 'Linia', svg: <line x1="4" y1="20" x2="20" y2="4" stroke="#4fc3f7" strokeWidth="2.5" fill="none" /> },
                  { type: 'arrow', label: 'Strzałka', svg: <g stroke="#4fc3f7" strokeWidth="2.5" fill="#4fc3f7"><line x1="4" y1="20" x2="17" y2="7" /><polygon points="14,4 21,4 21,11" stroke="none" /></g> },
                  { type: 'text', label: 'Text', svg: <g stroke="none" fill="#4fc3f7"><rect x="4" y="5" width="16" height="2.4" rx="1" /><rect x="4" y="10" width="16" height="2.4" rx="1" /><rect x="4" y="15" width="10" height="2.4" rx="1" /></g> },
                ] as { type: ShapeType; label: string; svg: React.ReactNode }[]).map((s) => (
                  <Tooltip key={s.type} title={s.label} arrow>
                    <Box component="button" onClick={() => createShape(s.type)}
                      sx={{ width: 52, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.25,
                        border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', cursor: 'pointer',
                        '&:hover': { borderColor: '#4fc3f7', bgcolor: 'action.hover' } }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#4fc3f7" stroke="#1976d2" strokeWidth="1">{s.svg}</svg>
                      <Typography sx={{ fontSize: 7.5, color: 'text.secondary', lineHeight: 1 }}>{s.label}</Typography>
                    </Box>
                  </Tooltip>
                ))}
              </Box>

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
                        : cls.name === 'MarkdownView' ? 'viewer .md z rozszerzeniami (CAD/Event/Plugin…)'
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
              {canvasMode === 'select' && selectedIds.size > 0 && (
                <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, mr: 0.5 }}>{selectedIds.size}</Typography>
              )}
              <Tooltip title="Search"><IconButton size="small" onClick={() => setShowSearch((v) => !v)}><SearchIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Box>
            {showSearch && (
              <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <TextField size="small" placeholder="Filter…" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  autoFocus fullWidth inputProps={{ style: { fontSize: 11 } }} />
              </Box>
            )}
            <Box data-tree-panel sx={{ flex: 1, overflow: 'auto', touchAction: 'pan-y' }}
              onContextMenu={(e) => openSceneCtx(e, null)}>
              {treeRows.length === 0 && (
                <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1.5, fontStyle: 'italic' }}>
                  {unifiedItems.length === 0 ? 'Right-click to add' : 'No matches'}
                </Typography>
              )}
              <List dense disablePadding>
                {treeRows.map(({ item, depth, childCount }) => {
                  const isGroup = item.type === 'object' && item.kind === 'group';
                  const isQt = item.type === 'object' && item.kind === 'qt-widget';
                  const isContainer = isGroup || isQt;
                  const collapsed = collapsedGroups.has(item.id);
                  const isDropTarget = isContainer && treeDragOverId === item.id;
                  const sel = selectedIds.has(item.id);
                  const dotColor: Record<string, string> = { classObj: '#4fc3f7', getProp: '#4dd0e1', setProp: '#ffb74d' };
                  return (
                  <ListItemButton key={item.id} selected={sel}
                    data-tree-id={item.id}
                    onClick={(e) => toggleSelect(item.id, canvasMode === 'select' || e.ctrlKey || e.metaKey)}
                    onDoubleClick={() => flyTo(item.id)}
                    onContextMenu={(e) => openSceneCtx(e, item.id)}
                    sx={{ minHeight: 24, py: 0.125, pr: 1, pl: (canvasMode === 'select' ? 0.5 : 1.5) + depth * 2,
                      ...(treeDragId === item.id ? { opacity: 0.4 } : {}),
                      ...(isDropTarget ? { outline: '2px solid #7c4dff', outlineOffset: '-2px', bgcolor: '#7c4dff22' } : {}),
                      '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText' }, '&.Mui-selected:hover': { bgcolor: 'primary.dark' } }}>
                    {canvasMode === 'select' && (
                      <Checkbox size="small" checked={sel} tabIndex={-1} disableRipple
                        sx={{ p: 0.25, mr: 0.5, color: 'text.disabled', '&.Mui-checked': { color: 'primary.contrastText' } }} />
                    )}
                    {/* Slot chevronu o STAŁEJ szerokości dla KAŻDego wiersza — także liści. */}
                    <Box component="span"
                      onClick={isContainer && childCount > 0 ? (e) => { e.stopPropagation(); setCollapsedGroups((prev) => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }); } : undefined}
                      sx={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', mr: 0.25, cursor: isContainer && childCount > 0 ? 'pointer' : 'default' }}>
                      {isContainer && childCount > 0 ? (collapsed ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />) : null}
                    </Box>
                    {isGroup && <GroupIcon sx={{ fontSize: 14, color: sel ? 'inherit' : '#7c4dff', mr: 0.5, flexShrink: 0 }} />}
                    {isQt && <WidgetsIcon sx={{ fontSize: 14, color: sel ? 'inherit' : '#26c6da', mr: 0.5, flexShrink: 0 }} />}
                    {item.type === 'fc' && <CodeIcon sx={{ fontSize: 13, color: sel ? 'inherit' : '#ce93d8', mr: 0.5, flexShrink: 0 }} />}
                    {item.type === 'var' && <StorageIcon sx={{ fontSize: 13, color: sel ? 'inherit' : '#81c784', mr: 0.5, flexShrink: 0 }} />}
                    {(item.type === 'classObj' || item.type === 'getProp' || item.type === 'setProp') && <CircleIcon sx={{ fontSize: 10, color: sel ? 'inherit' : dotColor[item.type], mr: 0.5, flexShrink: 0 }} />}
                    <ListItemText sx={{ my: 0, minWidth: 0 }}
                      primary={<Typography component="span" sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        <strong>{item.name}</strong>
                        {isGroup
                          ? <Typography component="span" sx={{ fontSize: 11, color: sel ? 'inherit' : 'text.disabled' }}> · {childCount}</Typography>
                          : item.type === 'object'
                            ? <Typography component="span" sx={{ fontSize: 11, color: sel ? 'inherit' : 'text.secondary' }}> :{item.sub}{isQt && childCount > 0 ? ` · ${childCount}` : ''}</Typography>
                            : <Typography component="span" sx={{ fontSize: 10, color: sel ? 'inherit' : 'text.disabled', fontStyle: 'italic' }}> {item.sub}</Typography>}
                      </Typography>}
                    />
                    {/* Uchwyt do przeciągania: reparent/grupowanie. Każdy element (też grupa —
                        zagnieżdżanie). touch-action:none → przeciąganie NIE scrolluje listy. */}
                    <Box component="span" onPointerDown={beginTreeRowDrag(item.id)} onClick={(e) => e.stopPropagation()}
                      title="Przeciągnij, aby zmienić grupę/rodzica"
                      sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 0.5, px: 0.25, cursor: 'grab', touchAction: 'none',
                        color: sel ? 'inherit' : 'text.disabled', opacity: 0.7, '&:active': { cursor: 'grabbing' } }}>
                      <DragIndicatorIcon sx={{ fontSize: 16 }} />
                    </Box>
                  </ListItemButton>
                  );
                })}
              </List>
            </Box>
          </Box>
        )}

        {/* ── Canvas ── */}
        {/* touchAction:none prevents browser from stealing pointer events as scroll/pan mid-drag.
            stopPropagation on pointerdown stops parent windows (GlobalWindow drag handler) from
            interfering with ReactFlow's pointer capture. */}
        <Box
          ref={flowWrapRef}
          sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', touchAction: 'none', userSelect: 'none',
            // Mobile touch/pen: po ~0.5s przytrzymania przeglądarka odpala natywny
            // long-press (callout „zapisz obraz" / natywny drag / zaznaczanie), co
            // przejmowało i GASIŁO przeciągany bloczek. Wyłączamy to na node'ach.
            WebkitTouchCallout: 'none',
            // RF ustawia node'om `visibility:hidden` gdy uzna je za „niezmierzone"
            // po odlocie poza ekran (na mobile ResizeObserver ich nie mierzy → zostają
            // ukryte na stałe). Wymuszamy widoczność, by nie znikały (a jeśli odlecą,
            // Fit je odzyska).
            '& .react-flow__node': { visibility: 'visible !important' as unknown as 'visible' },
            '& .react-flow__node, & .react-flow__node *': {
              WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              WebkitUserDrag: 'none' as any, touchAction: 'none',
            } }}
          onPointerDown={onFlowPointerDown}>
          {error && <Alert severity="error" onClose={() => setError(null)} sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 10 }}>{error}</Alert>}
          {/* Wizualny prostokąt własnej selekcji (mobile) */}
          {rubberBand && (
            <Box sx={{ position: 'absolute', zIndex: 8, pointerEvents: 'none',
              left: Math.min(rubberBand.x0, rubberBand.x1), top: Math.min(rubberBand.y0, rubberBand.y1),
              width: Math.abs(rubberBand.x1 - rubberBand.x0), height: Math.abs(rubberBand.y1 - rubberBand.y0),
              border: '1.5px solid #4fc3f7', bgcolor: 'rgba(79,195,247,0.18)', borderRadius: '2px' }} />
          )}
          <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            minZoom={0.05} maxZoom={3} style={{ width: '100%', height: '100%' }}
            connectionMode={ConnectionMode.Strict}
            deleteKeyCode={null}
            connectionRadius={20}
            autoPanOnNodeDrag={!isMobile}
            // NIE podnoś zIndex zaznaczonego węzła (+1000). Nasze zIndexy są celowe:
            // grupa/kontener MUSI zostać pod treścią. Elevacja zaznaczonego kontenera
            // wynosiła go NAD osadzone bloczki → klik trafiał w kontener, nie w bloczek.
            elevateNodesOnSelect={false}
            nodeExtent={[[-20000, -20000], [20000, 20000]]}
            // W trakcie resize gizmo blokujemy drag/pan, by bloczki nie „pływały".
            // W trybie Rect Select wyłączamy przeciąganie węzłów — inaczej naciśnięcie węzła
            // uruchamia d3-drag ReactFlow RÓWNOLEGLE z naszym rubber-bandem (konflikt: węzeł
            // się przesuwa zamiast zaznaczać). Do przesuwania węzłów → tryb pan.
            nodesDraggable={!isResizing && canvasMode !== 'select'}
            // Rect Select obsługuje NASZ rubber-band (onFlowPointerDown) — desktop I mobile
            // — z auto-panem przy krawędzi. Natywne selectionOnDrag RF wyłączone (nie
            // auto-panuje), a pan w trybie select wyłączony (drag = rysowanie prostokąta).
            selectionOnDrag={false}
            panOnDrag={isResizing ? false : canvasMode === 'select' ? false : true}
            zoomOnPinch
            panOnScroll={false}
            selectionMode={SelectionMode.Partial}
            isValidConnection={(c) => {
              const srcExec = c.sourceHandle === 'exec_out';
              const tgtExec = c.targetHandle === 'exec_in';
              const srcData = !srcExec;
              const tgtData = c.targetHandle !== 'exec_in';
              // exec_out może łączyć się tylko z exec_in; data source nie może z exec_in
              if (srcExec) return tgtExec;
              if (tgtExec) return false;
              return srcData && tgtData;
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={handleCanvasDrop}>
            <Background
              variant={gridEnabled ? BackgroundVariant.Lines : BackgroundVariant.Dots}
              gap={gridEnabled ? Math.max(2, gridSpacing) : 20}
              // Tło canvasu RF jest jasne — kolor siatki musi być kontrastowy (jasnoszary),
              // inaczej „nic się nie pokazuje" (poprzednio białe linie na białym).
              color={gridEnabled ? '#aeb6be' : undefined}
            />
            {displayEnabled && <DisplayGridOverlay w={displayW} h={displayH} />}
            {showOrigin && <OriginCross />}
            {showRulers && <RulerOverlay cursor={cursorPos} />}
            <Controls />
            {!isMobile && (
              <MiniMap
                pannable
                zoomable
                ariaLabel="Minimapa"
                nodeStrokeWidth={2}
                nodeBorderRadius={2}
                // Domyślna minimapa pobiera kolor z tła węzła — grupy (transparent) i
                // jasne bloczki bywały NIEWIDOCZNE. Nadajemy każdemu typowi wyraźny kolor.
                nodeColor={(n) => {
                  switch (n.type) {
                    case 'group': return 'rgba(124,77,255,0.28)';
                    case 'shape': return String((n.data as { properties?: { fill?: string } })?.properties?.fill || '#4fc3f7');
                    case 'qtWidget': return '#26c6da';
                    case 'fcNode': return '#7c4dff';
                    case 'varNode': return '#81c784';
                    case 'objNode': return '#4fc3f7';
                    case 'getPropNode': return '#4dd0e1';
                    case 'setPropNode': return '#ffb74d';
                    default: return '#78909c';
                  }
                }}
                nodeStrokeColor={(n) => (n.selected ? '#0288d1' : 'rgba(0,0,0,0.25)')}
              />
            )}
          </ReactFlow>
        </Box>

        {/* ── JSON source (drive text editor) — right-side toggleable split ── */}
        {showJson && (
          <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
            onPointerDown={(e) => e.stopPropagation()}>
            <DashJsonPanel scene={scene} onApply={(parsed) => updateScene(() => parsed as DashScene)} />
          </Box>
        )}

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
              ) : (selectedObject && selectedObject.kind === 'qt-widget') ? (
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 9, color: '#26c6da', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>«{selectedObject.className}»</Typography>
                  <TextField size="small" variant="standard" fullWidth
                    value={selectedObject.objectName}
                    onChange={(e) => updateObjectName(selectedObject.id, e.target.value)}
                    inputProps={{ style: { fontSize: 13, fontWeight: 700 } }} sx={{ mb: 1 }} />
                  <Divider sx={{ mb: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Geometry</Typography>
                  <TransformField label="X" value={selectedObject.transform.x} onChange={(v) => updateTransform(selectedObject.id, { x: v })} />
                  <TransformField label="Y" value={selectedObject.transform.y} onChange={(v) => updateTransform(selectedObject.id, { y: v })} />
                  <TransformField label="W" value={selectedObject.transform.width} onChange={(v) => updateTransform(selectedObject.id, { width: v })} />
                  <TransformField label="H" value={selectedObject.transform.height} onChange={(v) => updateTransform(selectedObject.id, { height: v })} />
                  <Divider sx={{ my: 1 }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Qt Properties</Typography>
                  {!qtLib && <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>Ładowanie metadanych Qt…</Typography>}
                  {selectedQtProps && selectedQtProps.every((g) => g.props.length === 0) && <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>Brak zarejestrowanych properties.</Typography>}
                  {selectedQtProps && selectedQtProps.map((grp) => grp.props.length === 0 ? null : (
                    <Box key={grp.className} sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#26c6da', letterSpacing: 0.4, mt: 0.5, mb: 0.25, opacity: 0.85, borderBottom: '1px solid rgba(38,198,218,0.18)', pb: 0.1 }}>« {grp.className} »</Typography>
                      {grp.props.map((pr) => (
                        <QtPropertyField key={pr.name} name={pr.name} type={pr.type} settable={pr.settable}
                          value={selectedObject.properties[pr.name]} dflt={pr.dflt}
                          onChange={(val) => updateProperty(selectedObject.id, pr.name, val)} />
                      ))}
                    </Box>
                  ))}

                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                    <BoltIcon sx={{ fontSize: 14, color: '#ffb74d' }} />
                    <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>Signals</Typography>
                  </Box>
                  {/* Sloty odpalają się TYLKO w trybie Action — bez tego klik widgetu nic nie robi.
                      Pokazujemy status/CTA, gdy widget ma podłączone handlery, by uniknąć „nic się nie dzieje". */}
                  {selectedObject.signalHandlers && Object.keys(selectedObject.signalHandlers).length > 0 && (
                    actionMode ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75, px: 0.75, py: 0.5, borderRadius: 1, bgcolor: 'rgba(102,187,106,0.1)', border: '1px solid rgba(102,187,106,0.3)' }}>
                        <PlayArrowIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
                        <Typography sx={{ fontSize: 9.5, color: '#a5d6a7', lineHeight: 1.3 }}>Tryb Action włączony — kliknij widget na scenie, aby uruchomić sloty.</Typography>
                      </Box>
                    ) : (
                      <Tooltip title="Sloty (np. clicked → funkcja) wykonują się tylko w trybie Action. Kliknij, aby włączyć.">
                        <Box onClick={() => { setActionMode(true); setQtSelectMode(false); }}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75, px: 0.75, py: 0.5, borderRadius: 1, cursor: 'pointer',
                            bgcolor: 'rgba(255,183,77,0.08)', border: '1px solid rgba(255,183,77,0.3)', '&:hover': { bgcolor: 'rgba(255,183,77,0.16)' } }}>
                          <PlayArrowIcon sx={{ fontSize: 15, color: '#ffb74d' }} />
                          <Typography sx={{ fontSize: 9.5, color: '#ffcc80', lineHeight: 1.3 }}>Włącz tryb <b>Action</b>, aby uruchamiać sloty po kliknięciu widgetu.</Typography>
                        </Box>
                      </Tooltip>
                    )
                  )}
                  {selectedQtSignals && selectedQtSignals.every((g) => g.signals.length === 0) && <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>Brak zarejestrowanych sygnałów.</Typography>}
                  {selectedQtSignals && selectedQtSignals.map((grp) => grp.signals.length === 0 ? null : (
                    <Box key={grp.className} sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#ffb74d', letterSpacing: 0.4, mt: 0.5, mb: 0.25, opacity: 0.85, borderBottom: '1px solid rgba(255,183,77,0.18)', pb: 0.1 }}>« {grp.className} »</Typography>
                      {grp.signals.map((sig) => {
                    const handler = selectedObject.signalHandlers?.[sig.name];
                    const fn = handler ? connectableFunctions.find((f) => f.sourceId === handler.sourceId && f.symbolPath === handler.symbolPath) : undefined;
                    const missing = !!handler && !fn;
                    const argMismatch = !!fn && fn.paramCount > sig.params.length;
                    return (
                      <Box key={sig.name} sx={{ mb: 0.5, px: 0.75, py: 0.5, borderRadius: 1, bgcolor: 'rgba(255,183,77,0.05)', border: '1px solid rgba(255,183,77,0.15)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#ffb74d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={`${sig.name}(${sig.params.join(', ')})`}>{sig.name}({sig.params.join(', ')})</Typography>
                          <Tooltip title={handler ? 'Zmień handler…' : 'Połącz z funkcją…'}>
                            <IconButton size="small" onClick={() => setSignalPicker({ objId: selectedObject.id, signal: sig.name, params: sig.params })} sx={{ p: 0.25 }}>
                              <LinkIcon sx={{ fontSize: 15, color: '#ffb74d' }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        {handler ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 1, mt: 0.25 }}>
                            {missing ? <WarningIcon sx={{ fontSize: 13, color: '#ef5350', flexShrink: 0 }} />
                              : argMismatch ? <Tooltip title={`Funkcja oczekuje ${fn!.paramCount} arg, sygnał podaje ${sig.params.length}`}><WarningIcon sx={{ fontSize: 13, color: '#ffca28', flexShrink: 0 }} /></Tooltip>
                              : <CheckCircleIcon sx={{ fontSize: 13, color: '#81c784', flexShrink: 0 }} />}
                            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: missing ? '#ef5350' : 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={fn ? `${fn.sourceName}: ${fn.symbolPath}(${fn.params})` : `${handler.symbolPath} — źródło/funkcja niedostępne`}>
                              → {fn ? `${fn.sourceName}:` : ''}{handler.symbolPath}{fn ? ` (${fn.paramCount})` : ' (?)'}
                            </Typography>
                            <Tooltip title="Rozłącz">
                              <IconButton size="small" onClick={() => updateSignalHandler(selectedObject.id, sig.name, null)} sx={{ p: 0.25 }}>
                                <CloseIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: 9, color: 'text.disabled', pl: 1, fontStyle: 'italic' }}>— nie połączony</Typography>
                        )}
                      </Box>
                    );
                  })}
                    </Box>
                  ))}
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

        {/* ── Kompleksowy edytor (TextEditorWorkspace) jako panel po prawej ── */}
        {showWorkspace && workspaceFs && (
          <>
            {/* Splitter — przeciągnij, aby zmienić szerokość panelu edytora. */}
            <Box onPointerDown={onWsResizeDown}
              sx={{ flexShrink: 0, width: 6, cursor: 'col-resize', bgcolor: 'divider',
                position: 'relative', zIndex: 3, '&:hover': { bgcolor: 'primary.main' },
                '&:active': { bgcolor: 'primary.main' },
                touchAction: 'none' }} />
            <Box sx={{ width: wsWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}
              onPointerDown={(e) => e.stopPropagation()}>
              <TextEditorWorkspace
                key={`dash-ws-${userName}`}
                provider={workspaceFs}
                initialPath={workspaceInitialPath}
                projectDeps={workspaceProjectDeps}
                extraPlugins={workspaceExtraPlugins}
              />
            </Box>
          </>
        )}

      </Box>

      {/* ── Dialog: połącz sygnał qt z funkcją-handlerem z data source ── */}
      {signalPicker && (
        <Dialog open onClose={() => setSignalPicker(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontSize: 14, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <BoltIcon sx={{ fontSize: 18, color: '#ffb74d' }} />
            <Box>
              <Box component="span">Połącz sygnał </Box>
              <Box component="span" sx={{ fontFamily: 'monospace', color: '#ffb74d' }}>{signalPicker.signal}({signalPicker.params.join(', ')})</Box>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: '4px !important' }}>
            {connectableFunctions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                Brak funkcji. Dodaj plik <code>.js</code> / <code>.ts</code> / <code>.py</code> w panelu <strong>DATA</strong> — jego funkcje pojawią się tutaj jako handlery.
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Wybierz funkcję. Sygnał podaje <strong>{signalPicker.params.length}</strong> arg{signalPicker.params.length === 1 ? '' : ''} ({signalPicker.params.join(', ') || '—'}).
                </Typography>
                {Object.entries(connectableFunctions.reduce((acc, f) => { (acc[f.sourceName] ??= []).push(f); return acc; }, {} as Record<string, HandlerFn[]>)).map(([srcName, fns]) => (
                  <Box key={srcName} sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#4fc3f7', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>
                      {srcName} <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>· {fns[0].fileType}</Box>
                    </Typography>
                    {fns.map((f) => {
                      const tooMany = f.paramCount > signalPicker.params.length;
                      return (
                        <Box key={f.symbolPath} onClick={() => { updateSignalHandler(signalPicker.objId, signalPicker.signal, { sourceId: f.sourceId, symbolPath: f.symbolPath }); setSignalPicker(null); }}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                          {tooMany ? <Tooltip title={`Funkcja oczekuje ${f.paramCount} arg — sygnał podaje tylko ${signalPicker.params.length}. Nadmiarowe będą undefined.`}><WarningIcon sx={{ fontSize: 15, color: '#ffca28', flexShrink: 0 }} /></Tooltip>
                            : <CheckCircleIcon sx={{ fontSize: 15, color: '#81c784', flexShrink: 0 }} />}
                          <Box sx={{ flex: 1, overflow: 'hidden' }}>
                            <Typography sx={{ fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.symbolPath}<Box component="span" sx={{ color: 'text.disabled' }}>({f.params})</Box>
                            </Typography>
                          </Box>
                          <Box component="span" sx={{ fontSize: 10, color: tooMany ? '#ffca28' : 'text.disabled', fontFamily: 'monospace', flexShrink: 0 }}>{f.paramCount} arg</Box>
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1.5 }}>
            <Button size="small" onClick={() => setSignalPicker(null)}>Anuluj</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ── Ustawienia: wbudowane biblioteki sandboxu ── */}
      {showSettings && (
        <Dialog open onClose={() => setShowSettings(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontSize: 14, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ fontSize: 18 }} /> Ustawienia
          </DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            {/* ── Widok canvas ── */}
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>
              Widok canvas
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
              <Box>
                <Typography variant="body2">Siatka</Typography>
                <Typography variant="caption" color="text.secondary">Linie pomocnicze z ustawianym rozstawem</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {gridEnabled && (
                  <TextField type="number" size="small" value={gridSpacing}
                    onChange={(e) => setView({ gridSpacing: Math.max(2, Math.min(500, Number(e.target.value) || 20)) })}
                    label="Rozstaw (px)" sx={{ width: 96 }}
                    inputProps={{ min: 2, max: 500, style: { fontSize: 12 } }} InputLabelProps={{ sx: { fontSize: 11 } }} />
                )}
                <Switch checked={gridEnabled} onChange={(e) => setView({ grid: e.target.checked })} />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
              <Box>
                <Typography variant="body2">Początek 0,0 (krzyżyk)</Typography>
                <Typography variant="caption" color="text.secondary">Znacznik początku układu sceny</Typography>
              </Box>
              <Switch checked={showOrigin} onChange={(e) => setView({ origin: e.target.checked })} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
              <Box>
                <Typography variant="body2">Linijki</Typography>
                <Typography variant="caption" color="text.secondary">Miarki na górnej/lewej krawędzi + pozycja kursora</Typography>
              </Box>
              <Switch checked={showRulers} onChange={(e) => setView({ rulers: e.target.checked })} />
            </Box>
            {/* Siatka wyświetlacza — grubsze prostokąty o rzeczywistym rozmiarze ekranu. */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
              <Box>
                <Typography variant="body2">Siatka wyświetlacza</Typography>
                <Typography variant="caption" color="text.secondary">Prostokąty o rzeczywistym rozmiarze ekranu</Typography>
              </Box>
              <Switch checked={displayEnabled} onChange={(e) => setView({ display: { ...view?.display, enabled: e.target.checked } })} />
            </Box>
            {displayEnabled && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1, pb: 0.5 }}>
                <TextField type="number" size="small" value={displayW}
                  onChange={(e) => setView({ display: { ...view?.display, width: Math.max(1, Number(e.target.value) || 800) } })}
                  label="Szer. (px)" sx={{ width: 100 }}
                  inputProps={{ min: 1, style: { fontSize: 12 } }} InputLabelProps={{ sx: { fontSize: 11 } }} />
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>×</Typography>
                <TextField type="number" size="small" value={displayH}
                  onChange={(e) => setView({ display: { ...view?.display, height: Math.max(1, Number(e.target.value) || 480) } })}
                  label="Wys. (px)" sx={{ width: 100 }}
                  inputProps={{ min: 1, style: { fontSize: 12 } }} InputLabelProps={{ sx: { fontSize: 11 } }} />
              </Box>
            )}

            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mt: 2, mb: 0.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              Sandbox
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Wbudowane biblioteki dostępne w skryptach JS tej dashboard — tak samo jak w skryptach
              automatyzacji w edytorze Markdown. Klient MQTT jest zawsze dostępny przez <code>api.mqtt</code>.
            </Typography>
            {([
              { key: 'three' as const, label: 'Three.js', hint: 'globalThis.THREE · api.three' },
              { key: 'lit' as const, label: 'Lit', hint: 'globalThis.Lit · api.lit' },
            ]).map(({ key, label, hint }) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                <Box>
                  <Typography variant="body2">{label}</Typography>
                  <Typography variant="caption" color="text.secondary">{hint}</Typography>
                </Box>
                <Switch
                  checked={!!scene.libs?.[key]}
                  onChange={(e) => {
                    const on = e.target.checked;
                    updateScene((p) => ({ ...p, libs: { ...p.libs, [key]: on } }));
                    if (on) loadLibrary(key).catch(() => { /* preload best-effort */ });
                  }}
                />
              </Box>
            ))}

            {/* ── Python (Pyodide) ── */}
            <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2">Python (Pyodide)</Typography>
                  <Typography variant="caption" color="text.secondary">
                    CPython w Web Workerze · <code>api.python.run(kod)</code>
                  </Typography>
                </Box>
                <Switch
                  checked={!!scene.pyodide?.enabled}
                  onChange={(e) => updateScene((p) => ({
                    ...p,
                    pyodide: { ...(p.pyodide ?? emptyPyodideConfig()), enabled: e.target.checked },
                  }))}
                />
              </Box>

              {scene.pyodide?.enabled && (
                <Box sx={{ mt: 1 }}>
                  <Typography sx={{ fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>
                    Pakiety wbudowane
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
                    {PYODIDE_BUILTIN_PACKAGES.map((pkg) => {
                      const sel = (scene.pyodide?.packages ?? []).includes(pkg.name);
                      return (
                        <Chip
                          key={pkg.name}
                          label={pkg.label}
                          size="small"
                          variant={sel ? 'filled' : 'outlined'}
                          color={sel ? 'primary' : 'default'}
                          onClick={() => updateScene((p) => {
                            const cur = p.pyodide ?? emptyPyodideConfig();
                            const has = cur.packages.includes(pkg.name);
                            const packages = has ? cur.packages.filter((x) => x !== pkg.name) : [...cur.packages, pkg.name];
                            return { ...p, pyodide: { ...cur, packages } };
                          })}
                          sx={{ fontSize: 10, height: 22 }}
                        />
                      );
                    })}
                  </Box>
                  <Typography sx={{ fontSize: 10, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mt: 1.25, mb: 0.25 }}>
                    Pakiety PyPI (micropip)
                  </Typography>
                  <TextField
                    fullWidth size="small" placeholder="np. plotly, requests, rich"
                    value={(scene.pyodide?.pypi ?? []).join(', ')}
                    onChange={(e) => updateScene((p) => ({
                      ...p,
                      pyodide: {
                        ...(p.pyodide ?? emptyPyodideConfig()),
                        pypi: e.target.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
                      },
                    }))}
                    inputProps={{ style: { fontSize: 12 } }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                    Pakiety ładują się <b>leniwie</b> — środowisko (~kilka MB) i wybrane paczki pobierają się w tle
                    przy uruchomieniu, z ekranem ładowania.
                  </Typography>
                </Box>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 1.5 }}>
            <Button size="small" onClick={() => setShowSettings(false)}>Zamknij</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ── Console ── */}
      {consoleOpen && (
        <Box sx={{ flexShrink: 0, borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', height: 200, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.25, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, gap: 0.5 }}>
            <TerminalIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
              Console {consoleLogs.length > 0 && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>({consoleLogs.length})</Box>}
            </Typography>
            {consoleLogs.length > 0 && (
              <Tooltip title="Clear console">
                <IconButton size="small" onClick={() => setConsoleLogs([])} sx={{ p: 0.25 }}>
                  <ClearAllIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={() => setConsoleOpen(false)} sx={{ p: 0.25 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Box ref={consoleScrollRef} sx={{ flex: 1, overflow: 'auto', fontFamily: 'monospace' }}>
            {consoleLogs.length === 0 ? (
              <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1 }}>
                No output yet. Use <Box component="code" sx={{ bgcolor: 'action.selected', px: 0.5, borderRadius: 0.5 }}>console.log()</Box> or <Box component="code" sx={{ bgcolor: 'action.selected', px: 0.5, borderRadius: 0.5 }}>api.log.*</Box> in your scripts.
              </Typography>
            ) : (
              consoleLogs.map((entry) => (
                <Box key={entry.id} sx={{ px: 1, py: 0.15, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 0.75, alignItems: 'flex-start', '&:hover': { bgcolor: 'action.hover' } }}>
                  <Typography component="span" sx={{ fontSize: 9, mt: 0.4, flexShrink: 0, textTransform: 'uppercase', fontWeight: 700, color: LEVEL_COLORS[entry.level], width: 36 }}>
                    {entry.level}
                  </Typography>
                  {entry.fcLabel && (
                    <Typography component="span" sx={{ fontSize: 10, mt: 0.2, flexShrink: 0, color: '#ce93d8', fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.fcLabel}
                    </Typography>
                  )}
                  <Typography component="span" sx={{ fontSize: 11, fontFamily: 'monospace', color: LEVEL_COLORS[entry.level], whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                    {entry.message}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}

      {/* New-object submenu (used from within scene context menu) */}
      <Menu anchorEl={newMenuAnchor} open={Boolean(newMenuAnchor)} onClose={() => setNewMenuAnchor(null)} MenuListProps={{ dense: true }}>
        {classes.map((cls) => (
          <MenuItem key={cls.name} onClick={() => { createObject(cls); setNewMenuAnchor(null); closeSceneCtx(); }} sx={{ fontSize: 13 }}>{cls.name}</MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => {
          const pos = viewportCenterFlow();
          createVar(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <StorageIcon sx={{ fontSize: 16, color: '#81c784' }} />Var
        </MenuItem>
        <MenuItem onClick={() => {
          const pos = viewportCenterFlow();
          createGetProp(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <ArrowUpwardIcon sx={{ fontSize: 16, color: '#4dd0e1' }} />GetProp
        </MenuItem>
        <MenuItem onClick={() => {
          const pos = viewportCenterFlow();
          createSetProp(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <ArrowDownwardIcon sx={{ fontSize: 16, color: '#ffb74d' }} />SetProp
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          const pos = viewportCenterFlow();
          createGroup(pos.x, pos.y);
          setNewMenuAnchor(null); closeSceneCtx();
        }} sx={{ fontSize: 13, gap: 1 }}>
          <GroupIcon sx={{ fontSize: 16, color: '#7c4dff' }} />Group
        </MenuItem>
        <Divider />
        <MenuItem onClick={(e) => setQtMenuAnchor(e.currentTarget)} sx={{ fontSize: 13, gap: 1 }}>
          <WidgetsIcon sx={{ fontSize: 16, color: '#26c6da' }} />Qt Widget
          <ChevronRightIcon sx={{ fontSize: 16, ml: 'auto', opacity: 0.6 }} />
        </MenuItem>
      </Menu>

      {/* Qt widget submenu — all MinisQt widget types */}
      <Menu anchorEl={qtMenuAnchor} open={Boolean(qtMenuAnchor)} onClose={() => setQtMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        MenuListProps={{ dense: true, sx: { maxHeight: 380 } }}>
        <MenuItem onClick={() => { setQtMenuAnchor(null); setNewMenuAnchor(null); closeSceneCtx(); setQtuiPickerOpen(true); }}
          sx={{ fontSize: 13, gap: 1, color: '#66bb6a' }}>
          <WidgetsIcon sx={{ fontSize: 15, color: '#66bb6a' }} />Osadź scenę .qtui.json…
        </MenuItem>
        <Divider />
        {QT_WIDGETS.map((w) => (
          <MenuItem key={w.type} sx={{ fontSize: 13, gap: 1 }}
            onClick={() => {
              const pos = viewportCenterFlow();
              createQtWidget(w.type, pos.x, pos.y);
              setQtMenuAnchor(null); setNewMenuAnchor(null); closeSceneCtx();
            }}>
            <WidgetsOutlinedIcon sx={{ fontSize: 15, color: '#26c6da' }} />{w.type}
          </MenuItem>
        ))}
      </Menu>

      {/* Osadzanie sceny .qtui.json jako poddrzewa qt-widgetów */}
      <FilePickerDialog open={qtuiPickerOpen} onClose={() => setQtuiPickerOpen(false)}
        userName={userName} currentPath="" filterExt=".qtui.json"
        onSelect={(p) => { if (p) void embedQtuiScene(p); }} />

      {/* Scene context menu */}
      <Menu
        open={Boolean(sceneCtxMenu)}
        onClose={closeSceneCtx}
        anchorReference="anchorPosition"
        anchorPosition={sceneCtxMenu ? { top: sceneCtxMenu.mouseY, left: sceneCtxMenu.mouseX } : undefined}
        MenuListProps={{ dense: true }}
      >
        {(() => {
          const obj = sceneCtxMenu?.objId ? scene.objects.find((o) => o.id === sceneCtxMenu.objId) : null;
          if (!obj || obj.className !== 'SceneEmbed' || !obj.properties?.filePath) return null;
          return [
            <MenuItem key="open-scene" onClick={() => { openEmbeddedScene(String(obj.properties.filePath)); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1, color: '#4db6ac' }}>
              <AccountTreeIcon fontSize="small" sx={{ color: '#4db6ac' }} />Otwórz scenę
            </MenuItem>,
            <Divider key="open-scene-div" />,
          ];
        })()}
        <MenuItem onClick={(e) => { setNewMenuAnchor(e.currentTarget); }} sx={{ fontSize: 13, gap: 1 }}>
          <AddIcon fontSize="small" />New…
        </MenuItem>
        <Divider />
        <MenuItem disabled={!scene.objects.some((o) => selectedIds.has(o.id) && o.kind !== 'group')}
          onClick={() => { groupSelection(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <GroupIcon fontSize="small" />Group selection
        </MenuItem>
        <MenuItem disabled={!scene.objects.some((o) => selectedIds.has(o.id) && o.kind === 'group')}
          onClick={() => { ungroupSelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <GroupIcon fontSize="small" sx={{ opacity: 0.55 }} />Ungroup
        </MenuItem>
        {/* Odłącz od rodzica (parent=null) — zawsze dostępne, niezależnie od scrolla/
            pełności drzewa (drag-drop na puste miejsce bywa niedostępny przy pełnej scenie). */}
        {(() => {
          const targets = new Set<string>(selectedIds);
          if (sceneCtxMenu?.objId) targets.add(sceneCtxMenu.objId);
          const hasParented = [...targets].some((id) => scene.objects.find((o) => o.id === id)?.parentId);
          return (
            <MenuItem disabled={!hasParented}
              onClick={() => { for (const id of targets) { if (scene.objects.find((o) => o.id === id)?.parentId) reparentObject(id, undefined); } closeSceneCtx(); }}
              sx={{ fontSize: 13, gap: 1 }}>
              <LinkOffIcon fontSize="small" />Odłącz od rodzica
            </MenuItem>
          );
        })()}
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
          filterExt=".json,.js,.py,.ts,.pdf,.djvu"
          onSelect={(p) => { void addDataSource(p); setDsPickerOpen(false); }} />
      )}
    </Box>
  );
};

const DashEditorPanel: React.FC<DashEditorPanelProps> = (props) => (
  <ReactFlowProvider><DashEditorInner {...props} /></ReactFlowProvider>
);

export default DashEditorPanel;
