import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Popover from '@mui/material/Popover';
import AddIcon from '@mui/icons-material/Add';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import GestureIcon from '@mui/icons-material/Gesture';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import AutoFixNormalIcon from '@mui/icons-material/AutoFixNormal';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PaletteIcon from '@mui/icons-material/Palette';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import TuneIcon from '@mui/icons-material/Tune';
import ColorizeIcon from '@mui/icons-material/Colorize';
import LockIcon from '@mui/icons-material/Lock';
import PanToolIcon from '@mui/icons-material/PanTool';
import NearMeIcon from '@mui/icons-material/NearMe';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import RemoveIcon from '@mui/icons-material/Remove';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import PolylineIcon from '@mui/icons-material/Polyline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import FlipToFrontIcon from '@mui/icons-material/FlipToFront';
import FlipToBackIcon from '@mui/icons-material/FlipToBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import CloseIcon from '@mui/icons-material/Close';
import BoltIcon from '@mui/icons-material/Bolt';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import SvgIcon from '@mui/material/SvgIcon';
import type { SvgIconProps } from '@mui/material';

// Własne ikony kształtów (brak dokładnych odpowiedników w MUI).
const RhombusIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props}><path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="currentColor" strokeWidth="2" /></SvgIcon>
);
import { ServerFileBrowser } from './ServerFileBrowser';
import { NOTES_EXT, readFileAt, writeFileAt, buildViewerUrl } from '../vfs/cadProjectApi';
import { useRegisterFileOps } from '../fileops/FileOpsContext';
import { exportCanvasPng, exportCanvasSvg, exportCanvasPdf } from '../io/exportGraphics';
import { renderMarkdown } from '../map/markdown';

import { syncOpenUrl } from '../vfs/openTarget';
import { defaultInkFor, needsInkSwitch } from './notesInk';
import { useBooxPen } from '../native/useBooxPen';
import { describeHost, type CanvasPenPoint } from '../native/booxPen';

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotePoint { x: number; y: number; p: number; }

/** Wzór wypełnienia (dla kształtów wypełnianych — obecnych i przyszłych). */
type FillPattern = 'none' | 'diagonal' | 'cross' | 'solid';
/** Styl obrysu (wzór kreski). */
type StrokeStyle = 'solid' | 'dashed' | 'dotted';
/** Niedbałość / styl rysowania (0 = gładko, 1 = szkic, 2 = odręcznie). */
type Roughness = 0 | 1 | 2;
/** Groty strzałki: brak / grot na końcu. */
type ArrowHeads = 'none' | 'end';
/** Typ strzałki: prosta / wygięta / łamana (elbow). */
type ArrowType = 'straight' | 'curved' | 'elbow';
/** Powiązanie końca strzałki z figurą: id + pozycja względna w jej bbox (0–1). */
interface ArrowBinding { id: string; fx: number; fy: number; }

interface NoteStroke {
  id: string; kind: 'stroke';
  tool: 'pencil' | 'marker';
  color: string; width: number;
  points: NotePoint[];
  groupId?: string;
  link?: string;
  /** Krycie kreski 0–1 (domyślnie 1 / 0.4 dla markera). Opcjonalne — wstecznie zgodne. */
  opacity?: number;
  /** Czułość na nacisk: 'high' = duża zmienność grubości, 'low' = prawie stała. */
  pressure?: 'low' | 'high';
  /** Wzór wypełnienia — używany przez kształty wypełniane (przyszłe typy). */
  fill?: FillPattern;
  /** Osadzona etykieta tekstowa (w środku obiektu) + jej styl. */
  label?: string; labelFontSize?: number; labelAlign?: TextAlign; labelColor?: string;
}

interface NoteText {
  id: string; kind: 'text';
  x: number; y: number;
  text: string; fontSize: number; color: string;
  align?: 'left' | 'center' | 'right';
  rotation?: number; // radiany, obrót wokół (x,y)
  groupId?: string;
  link?: string;
}

interface NoteImage {
  id: string; kind: 'image';
  x: number; y: number; w: number; h: number;
  src: string;
  rotation?: number; // radiany, obrót wokół środka
  opacity?: number;  // krycie 0–1
  rounded?: boolean; // zaokrąglone narożniki
  groupId?: string;
  link?: string;
}

/** Grupa — lekki kontener bez geometrii. Elementy należą do grupy przez `groupId`.
 *  Trzymany w tej samej tablicy `elements` (kind:'group'), więc persystuje się sam. */
interface NoteGroup {
  id: string; kind: 'group';
  name: string;
  collapsed?: boolean;
  // Ramka transformacji grupy: środek (cx,cy) i kąt (rotation, rad). Pozwala
  // obracać grupę jak bryłę sztywną wokół stałego środka (ramka nie zmienia rozmiaru).
  cx?: number; cy?: number; rotation?: number;
}

/** Rodzaje kształtów geometrycznych. */
type ShapeKind = 'rect' | 'diamond' | 'circle' | 'line' | 'arrow';

interface NoteShape {
  id: string; kind: 'shape';
  shape: ShapeKind;
  x1: number; y1: number; x2: number; y2: number;
  color: string; width: number;
  opacity?: number; fill?: FillPattern;
  fillColor?: string; // kolor wypełnienia (osobny od obrysu `color`)
  strokeStyle?: StrokeStyle; // wzór kreski obrysu (domyślnie 'solid')
  roughness?: Roughness;     // niedbałość obrysu (domyślnie 0 = gładko)
  rounded?: boolean;         // zaokrąglone narożniki (prostokąt) / okrągłe zakończenie (linia)
  arrowHeads?: ArrowHeads;   // strzałka: groty (domyślnie 'end')
  arrowType?: ArrowType;     // strzałka: kształt trzonu (domyślnie 'straight')
  /** Wiązania końców strzałki z figurami — koniec podąża za przesuwaną figurą. */
  startBinding?: ArrowBinding;
  endBinding?: ArrowBinding;
  /** Wierzchołki linii/strzałki (multi-point). Brak → 2-punktowa wg (x1,y1)-(x2,y2). */
  points?: { x: number; y: number }[];
  /** Osadzona etykieta tekstowa (w środku obiektu) + jej styl. */
  label?: string; labelFontSize?: number; labelAlign?: TextAlign; labelColor?: string;
  rotation?: number; // radiany, obrót wokół środka bbox
  groupId?: string;
  link?: string;
  /** Powiązanie z innym obiektem sceny (id) — klik ikony przenosi widok do celu. */
  linkTo?: string;
  /** Opis w formacie Markdown — klik ikony pokazuje popup z sformatowaną treścią. */
  infoMd?: string;
}

type NoteElement = NoteStroke | NoteText | NoteImage | NoteShape | NoteGroup;
interface NotePage { id: string; elements: NoteElement[]; bgColor?: string; }
// Tryby/narzędzia: lock (blokada), pan (przesuwanie), select (zaznacz+przesuń),
// lasso, kształty (rect/diamond/circle/line), pencil, marker, text, eraser.
type NoteTool =
  | 'lock' | 'pan' | 'select' | 'lasso'
  | 'rect' | 'diamond' | 'circle' | 'line' | 'arrow'
  | 'pencil' | 'marker' | 'text' | 'eraser';
type ResizeEdge = 'move' | 'top' | 'right' | 'bottom' | 'left' | 'tl' | 'tr' | 'bl' | 'br';

// ── Constants ──────────────────────────────────────────────────────────────────

const CANVAS_W = 1400;
const CANVAS_H = 900;
const DEFAULT_BG = '#1a1a1a';
const STORAGE_KEY = 'spen-notes';
const MAX_UNDO = 50;
const THUMB_W = 148;
const THUMB_H = Math.round(THUMB_W * CANVAS_H / CANVAS_W);

/** Specjalna wartość koloru = przezroczysty. */
const TRANSPARENT = 'transparent';

/** Siatka 6×3 dostępnych kolorów (foreground + background). */
const COLOR_GRID = [
  '#ffffff', '#d1d5db', '#9ca3af', '#6b7280', '#374151', '#000000',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
];

/** Wzory wypełnienia pokazywane dla kształtów (bez 'none' — przezroczystość = kolor wypełnienia). */
const SHAPE_FILL_PATTERNS: { v: FillPattern; label: string }[] = [
  { v: 'diagonal', label: 'Linie ukośne' },
  { v: 'cross', label: 'Kratka' },
  { v: 'solid', label: 'Pełne' },
];

/** Presety szerokości kreski. */
const WIDTH_PRESETS: { v: number; label: string }[] = [
  { v: 2, label: 'Wąska' },
  { v: 5, label: 'Średnia' },
  { v: 12, label: 'Szeroka' },
];

/** Style obrysu (wzór kreski). */
const STROKE_STYLES: { v: StrokeStyle; label: string }[] = [
  { v: 'solid', label: 'Linia ciągła' },
  { v: 'dashed', label: 'Kreski' },
  { v: 'dotted', label: 'Kropki' },
];

/** Poziomy niedbałości (styl rysowania). */
const ROUGHNESS_LEVELS: { v: Roughness; label: string }[] = [
  { v: 0, label: 'Gładko' },
  { v: 1, label: 'Szkic' },
  { v: 2, label: 'Odręcznie' },
];

/** Wzór kreski (dash) dla danego stylu, skalowany szerokością. */
function dashFor(style: StrokeStyle | undefined, w: number): number[] {
  if (style === 'dashed') return [Math.max(6, w * 2.5), Math.max(6, w * 2)];
  if (style === 'dotted') return [Math.max(0.5, w * 0.4), Math.max(4, w * 1.8)];
  return [];
}

// Deterministyczny PRNG (mulberry32) + hash stringa — niedbałość nie może migotać
// między klatkami, więc perturbacja jest stała per kształt (seed z id).
function strSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// ── Rendering „odręczne" (inspirowane rough.js) ─────────────────────────────────
// Każda krawędź rysowana jest DWUKROTNIE, z wygiętym środkiem (bowing) i losowo
// przeskakującymi końcami — to daje chaotyczny, naszkicowany wygląd jak w Excalidraw.

/** Pojedyncza „odręczna" krawędź: 2 nakładające się krzywe z wygięciem i jitterem końców. */
function roughEdge(p: Path2D, x1: number, y1: number, x2: number, y2: number, mag: number, rng: () => number): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Końce mogą przeskakiwać (overshoot na narożnikach), ale nie więcej niż 1/4 długości.
  const off = Math.min(mag, len / 4);
  const nx = -dy / len, ny = dx / len; // normalna
  const r = (k: number) => (rng() * 2 - 1) * k;
  for (let pass = 0; pass < 2; pass++) {
    // Wygięcie środka — różne dla każdego przejścia → efekt podwójnej kreski.
    const bow = r(mag * 0.9);
    const t1 = 0.25 + rng() * 0.15, t2 = 0.6 + rng() * 0.15;
    const c1x = x1 + dx * t1 + nx * bow + r(off * 0.5);
    const c1y = y1 + dy * t1 + ny * bow + r(off * 0.5);
    const c2x = x1 + dx * t2 + nx * bow + r(off * 0.5);
    const c2y = y1 + dy * t2 + ny * bow + r(off * 0.5);
    p.moveTo(x1 + r(off), y1 + r(off));
    p.bezierCurveTo(c1x, c1y, c2x, c2y, x2 + r(off), y2 + r(off));
  }
}

/** „Odręczna" zamknięta krzywa (elipsa) — 2 wygięte, gładkie obrysy z jitterem wierzchołków. */
function roughClosedCurve(p: Path2D, pts: { x: number; y: number }[], mag: number, rng: () => number): void {
  const n = pts.length;
  if (n < 3) return;
  const r = (k: number) => (rng() * 2 - 1) * k;
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  for (let pass = 0; pass < 2; pass++) {
    const jp = pts.map(pt => ({ x: pt.x + r(mag * 0.6), y: pt.y + r(mag * 0.6) }));
    const start = mid(jp[n - 1], jp[0]);
    p.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const cur = jp[i], next = mid(jp[i], jp[(i + 1) % n]);
      p.quadraticCurveTo(cur.x, cur.y, next.x, next.y);
    }
  }
}

/** Figury liniowe (bez wypełnienia, bez obrotu macierzą). */
const LINEAR_SHAPES = new Set<ShapeKind>(['line', 'arrow']);

/** Wierzchołki linii/strzałki (logiczne). `points` ma priorytet; fallback do (x1,y1)-(x2,y2). */
function shapePts(s: NoteShape): { x: number; y: number }[] {
  return (s.points && s.points.length >= 2) ? s.points : [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
}
/** Ustawia wierzchołki linii/strzałki, synchronizując końce (x1,y1)/(x2,y2) dla zgodności. */
function setShapePts(s: NoteShape, pts: { x: number; y: number }[]): NoteShape {
  const clean = pts.map(p => ({ x: p.x, y: p.y }));
  return { ...s, points: clean, x1: clean[0].x, y1: clean[0].y, x2: clean[clean.length - 1].x, y2: clean[clean.length - 1].y };
}

// ── Wiązania strzałek z figurami (Excalidraw-like) ───────────────────────────────

/** Czy element nadaje się na cel wiązania (figura z polem / obraz / tekst). */
function isBindable(el: NoteElement): boolean {
  if (el.kind === 'shape') return !LINEAR_SHAPES.has(el.shape);
  return el.kind === 'image' || el.kind === 'text';
}
/** Najwyższy element pod (lx,ly) nadający się na cel wiązania → ArrowBinding (pozycja względna). */
function bindTargetAt(els: NoteElement[], lx: number, ly: number, selfId: string, tol = 6): ArrowBinding | undefined {
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.id === selfId || el.kind === 'group' || !isBindable(el)) continue;
    const b = elementBBox(el);
    if (b.w <= 0 || b.h <= 0) continue;
    if (lx >= b.x - tol && lx <= b.x + b.w + tol && ly >= b.y - tol && ly <= b.y + b.h + tol) {
      return { id: el.id, fx: (lx - b.x) / b.w, fy: (ly - b.y) / b.h };
    }
  }
  return undefined;
}
/** Rozwiązuje wiązanie na bieżącą pozycję świata; null gdy cel zniknął. */
function resolveBinding(els: NoteElement[], b: ArrowBinding): { x: number; y: number } | null {
  const el = els.find(e => e.id === b.id);
  if (!el || el.kind === 'group') return null;
  const bb = elementBBox(el);
  if (bb.w <= 0 && bb.h <= 0) return null;
  return { x: bb.x + b.fx * bb.w, y: bb.y + b.fy * bb.h };
}
/** Aktualizuje końce związanych strzałek wg bieżących pozycji figur (drop wiązania gdy cel zniknął). */
function applyArrowBindings(els: NoteElement[]): NoteElement[] {
  let any = false;
  const next = els.map(el => {
    if (el.kind !== 'shape' || el.shape !== 'arrow' || (!el.startBinding && !el.endBinding)) return el;
    any = true;
    let { x1, y1, x2, y2 } = el;
    let startBinding = el.startBinding, endBinding = el.endBinding;
    const pts = el.points ? el.points.map(p => ({ x: p.x, y: p.y })) : null;
    if (startBinding) {
      const p = resolveBinding(els, startBinding);
      if (p) { x1 = p.x; y1 = p.y; if (pts && pts.length) pts[0] = { x: p.x, y: p.y }; }
      else startBinding = undefined;
    }
    if (endBinding) {
      const p = resolveBinding(els, endBinding);
      if (p) { x2 = p.x; y2 = p.y; if (pts && pts.length) pts[pts.length - 1] = { x: p.x, y: p.y }; }
      else endBinding = undefined;
    }
    return { ...el, x1, y1, x2, y2, points: pts ?? el.points, startBinding, endBinding } as NoteElement;
  });
  return any ? next : els;
}
/** Trasowanie ortogonalne (łamana) między dwoma punktami. */
function elbowRoute(a: Pt, b: Pt): Pt[] {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
  return dx >= dy
    ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
    : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b];
}
/** Punkt kontrolny łagodnego wybrzuszenia dla 2-punktowej krzywej. */
function bowControl(a: Pt, b: Pt, sx: number): Pt {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ddx = b.x - a.x, ddy = b.y - a.y;
  const len = Math.hypot(ddx, ddy) || 1, nx = -ddy / len, ny = ddx / len;
  const bow = Math.min(len * 0.22, 60 * sx);
  return { x: mx + nx * bow, y: my + ny * bow };
}
/** Gładka krzywa Catmull-Rom przez wierzchołki → próbki (perSpan segmentów na przęsło). */
function catmullRom(verts: Pt[], perSpan: number): Pt[] {
  const out: Pt[] = [];
  const n = verts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = verts[i - 1] ?? verts[i], p1 = verts[i], p2 = verts[i + 1], p3 = verts[i + 2] ?? verts[i + 1];
    const steps = i === n - 2 ? perSpan : perSpan - 1;
    for (let j = 0; j <= steps; j++) {
      const t = j / perSpan, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

/** Końce barb grotu strzałki dla odcinka (x1,y1)->(x2,y2) o danej długości barb. */
function arrowBarbs(x1: number, y1: number, x2: number, y2: number, len: number) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a = Math.PI / 7; // ~25°
  return [
    { x: x2 - len * Math.cos(ang - a), y: y2 - len * Math.sin(ang - a) },
    { x: x2 - len * Math.cos(ang + a), y: y2 - len * Math.sin(ang + a) },
  ];
}

/** Długość barb grotu (screen px), ograniczona długością trzonu. */
function arrowHeadLen(s: NoteShape, sx: number): number {
  const len = Math.hypot((s.x2 - s.x1) * sx, (s.y2 - s.y1) * sx);
  return Math.min(len * 0.5, Math.max(14, s.width * 3.5) * sx);
}

type Pt = { x: number; y: number };
/** Trzon linii/strzałki (screen coords): finalna polilinia do rysowania + (dla strzałki) grot.
 *  Obsługuje wiele wierzchołków oraz typy prosta/wygięta/łamana. `curveSeg` = gęstość próbek krzywej. */
function arrowSpine(s: NoteShape, sx: number, sy: number, curveSeg = 24): { draw: Pt[]; head: { from: Pt; tip: Pt } | null } {
  const verts = shapePts(s).map(p => ({ x: p.x * sx, y: p.y * sy }));
  const type = s.arrowType ?? 'straight';
  const wantHead = s.shape === 'arrow' && (s.arrowHeads ?? 'end') !== 'none';
  let draw: Pt[];
  let from: Pt;
  if (verts.length === 2 && type === 'elbow') {
    draw = elbowRoute(verts[0], verts[1]); from = draw[draw.length - 2];
  } else if (verts.length === 2 && type === 'curved') {
    const c = bowControl(verts[0], verts[1], sx);
    draw = quadPoints(verts[0], c, verts[1], curveSeg); from = c;
  } else if (type === 'curved') { // >2 wierzchołków → gładka krzywa
    draw = catmullRom(verts, Math.max(3, Math.round(curveSeg / 2))); from = draw[draw.length - 2];
  } else { // prosta (lub łamana z >2 wierzchołkami) → polilinia
    draw = verts; from = verts[verts.length - 2];
  }
  const tip = draw[draw.length - 1];
  return { draw, head: wantHead ? { from, tip } : null };
}
/** Próbkuje krzywą kwadratową na n+1 punktów. */
function quadPoints(p0: Pt, c: Pt, p1: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, mt = 1 - t;
    out.push({ x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x, y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y });
  }
  return out;
}

/** Buduje „odręczny" obrys figury (screen coords). */
function buildRoughStroke(s: NoteShape, sx: number, sy: number, mag: number): Path2D {
  const rng = mulberry32(strSeed(s.id));
  const x1 = s.x1 * sx, y1 = s.y1 * sy, x2 = s.x2 * sx, y2 = s.y2 * sy;
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const p = new Path2D();
  if (LINEAR_SHAPES.has(s.shape)) {
    const sp = arrowSpine(s, sx, sy, 6); // grubsze próbkowanie krzywej dla trybu odręcznego
    for (let i = 0; i < sp.draw.length - 1; i++) roughEdge(p, sp.draw[i].x, sp.draw[i].y, sp.draw[i + 1].x, sp.draw[i + 1].y, mag, rng);
    if (sp.head) {
      const [b1, b2] = arrowBarbs(sp.head.from.x, sp.head.from.y, sp.head.tip.x, sp.head.tip.y, arrowHeadLen(s, sx));
      roughEdge(p, sp.head.tip.x, sp.head.tip.y, b1.x, b1.y, mag, rng);
      roughEdge(p, sp.head.tip.x, sp.head.tip.y, b2.x, b2.y, mag, rng);
    }
    return p;
  }
  if (s.shape === 'rect') {
    roughEdge(p, x, y, x + w, y, mag, rng);
    roughEdge(p, x + w, y, x + w, y + h, mag, rng);
    roughEdge(p, x + w, y + h, x, y + h, mag, rng);
    roughEdge(p, x, y + h, x, y, mag, rng);
    return p;
  }
  if (s.shape === 'diamond') {
    const t = { x: x + w / 2, y }, r2 = { x: x + w, y: y + h / 2 }, b = { x: x + w / 2, y: y + h }, l = { x, y: y + h / 2 };
    roughEdge(p, t.x, t.y, r2.x, r2.y, mag, rng);
    roughEdge(p, r2.x, r2.y, b.x, b.y, mag, rng);
    roughEdge(p, b.x, b.y, l.x, l.y, mag, rng);
    roughEdge(p, l.x, l.y, t.x, t.y, mag, rng);
    return p;
  }
  // circle → próbkowana elipsa rysowana jako wygięta krzywa zamknięta
  const cx = x + w / 2, cy = y + h / 2, rx = Math.max(0.5, w / 2), ry = Math.max(0.5, h / 2);
  // Mało punktów kontrolnych + gładkie krzywe → naszkicowana, ale nie „grudkowata" elipsa.
  const N = Math.min(14, Math.max(9, Math.round((rx + ry) / 40)));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  roughClosedCurve(p, pts, mag, rng);
  return p;
}

/** Presety rozmiaru tekstu (font size px) — S/M/L/XL jak w Excalidraw. */
const TEXT_SIZES: { k: string; v: number }[] = [
  { k: 'S', v: 16 }, { k: 'M', v: 24 }, { k: 'L', v: 36 }, { k: 'XL', v: 56 },
];
type TextAlign = 'left' | 'center' | 'right';

const BG_THEMES: { color: string; label: string; dark: boolean }[] = [
  { color: '#000000', label: 'Black',       dark: true  },
  { color: '#1a1a1a', label: 'Dark',        dark: true  },
  { color: '#ffffff', label: 'White',       dark: false },
  { color: '#fef3c7', label: 'Paper',       dark: false },
];

// Metadane narzędzi (ikona + etykieta tooltipa).
const TOOL_META: Record<NoteTool, { label: string; Icon: React.FC<SvgIconProps> }> = {
  lock:    { label: 'Blokada (tylko podgląd)',     Icon: LockIcon },
  pan:     { label: 'Przesuwanie',                 Icon: PanToolIcon },
  select:  { label: 'Zaznaczanie / przesuwanie',   Icon: NearMeIcon },
  lasso:   { label: 'Lasso',                       Icon: HighlightAltIcon },
  rect:    { label: 'Prostokąt',                   Icon: CropSquareIcon },
  diamond: { label: 'Romb',                        Icon: RhombusIcon },
  circle:  { label: 'Koło',                        Icon: CircleOutlinedIcon },
  line:    { label: 'Linia',                       Icon: RemoveIcon },
  arrow:   { label: 'Strzałka',                    Icon: ArrowRightAltIcon },
  pencil:  { label: 'Pióro',                       Icon: GestureIcon },
  marker:  { label: 'Marker',                      Icon: BorderColorIcon },
  text:    { label: 'Tekst (kliknij, aby wstawić)', Icon: TextFieldsIcon },
  eraser:  { label: 'Gumka',                       Icon: AutoFixNormalIcon },
};

// Kolejność toolbaru (z separatorami i przyciskiem osadzenia obrazu).
const TOOLBAR_LAYOUT: (NoteTool | 'sep' | 'image')[] = [
  'lock', 'pan', 'sep',
  'select', 'lasso', 'sep',
  'rect', 'diamond', 'circle', 'line', 'arrow', 'sep',
  'pencil', 'marker', 'sep',
  'text', 'image', 'sep',
  'eraser',
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const newPage = (): NotePage => ({ id: uid(), elements: [] });

// ── Color utilities (odcienie, hex, alpha) ───────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  if (h.length !== 6) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Miesza kolor w stronę docelowego (t=0 → oryginał, t=1 → target). */
function mixColor(hex: string, target: string, t: number): string {
  const a = hexToRgb(hex); const b = hexToRgb(target);
  if (!a || !b) return hex;
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

/** 5 odcieni koloru: 2 jaśniejsze, oryginał, 2 ciemniejsze. */
function shadesOf(hex: string): string[] {
  if (!hexToRgb(hex)) return [hex];
  return [
    mixColor(hex, '#ffffff', 0.55),
    mixColor(hex, '#ffffff', 0.28),
    hex,
    mixColor(hex, '#000000', 0.28),
    mixColor(hex, '#000000', 0.55),
  ];
}

/** Normalizuje wartość koloru wejściowego do #rrggbb (akceptuje #rgb / bez #). */
function normalizeHex(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!s.startsWith('#')) s = '#' + s;
  const rgb = hexToRgb(s);
  return rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : null;
}

const imgCache = new Map<string, HTMLImageElement>();
// Set by the component to trigger canvas redraw after async image load
let _imgRedrawCb: (() => void) | null = null;

// Module-level clipboard for cut/copy/paste across pages
let noteClipboard: NoteElement[] = [];

const SHAPE_LABEL: Record<ShapeKind, string> = { rect: 'Prostokąt', diamond: 'Romb', circle: 'Koło', line: 'Linia', arrow: 'Strzałka' };

/** Czytelna etykieta obiektu sceny (do listy wyboru LinkTo / drzewa Scene). */
function nodeLabel(el: NoteElement): string {
  if (el.kind === 'group') return el.name || 'Grupa';
  if (el.kind === 'text') return el.text?.trim().slice(0, 28) || 'Tekst';
  if (el.kind === 'image') return 'Obraz';
  if (el.kind === 'stroke') return el.tool === 'marker' ? 'Marker' : 'Pióro';
  return el.label?.trim().slice(0, 28) || SHAPE_LABEL[el.shape] || 'Figura';
}

function elLabel(el: NoteElement): string {
  if (el.kind === 'group') return el.name || 'Grupa';
  if (el.kind === 'stroke') return el.tool === 'marker' ? 'Marker stroke' : 'Pencil stroke';
  if (el.kind === 'text') return el.text ? (el.text.length > 22 ? el.text.slice(0, 22) + '…' : el.text) : 'Text';
  if (el.kind === 'shape') return SHAPE_LABEL[el.shape];
  return 'Image';
}

function getImg(src: string): HTMLImageElement {
  if (imgCache.has(src)) return imgCache.get(src)!;
  const img = new Image();
  img.onload = () => { _imgRedrawCb?.(); };
  img.src = src;
  imgCache.set(src, img);
  return img;
}

function hitImage(el: NoteImage, lx: number, ly: number): boolean {
  return lx >= el.x && lx <= el.x + el.w && ly >= el.y && ly <= el.y + el.h;
}

// ── Geometria/hit/translate dla kształtów ─────────────────────────────────────
function shapeBBox(s: NoteShape) {
  if (LINEAR_SHAPES.has(s.shape) && s.points && s.points.length >= 2) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of s.points) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Czy punkt (lx,ly) trafia w element (z tolerancją tol w jednostkach logicznych). */
function hitElement(el: NoteElement, lx: number, ly: number, tol: number): boolean {
  if (el.kind === 'group') return false;
  if (el.kind === 'image') return hitImage(el, lx, ly);
  if (el.kind === 'stroke') return strokeHitTest(el, lx, ly, Math.max(tol, el.width));
  if (el.kind === 'text') {
    const w = Math.max(20, el.text.length * el.fontSize * 0.55);
    return lx >= el.x - tol && lx <= el.x + w + tol && ly >= el.y - el.fontSize && ly <= el.y + tol;
  }
  // shape
  const b = shapeBBox(el);
  if (LINEAR_SHAPES.has(el.shape)) {
    const pts = shapePts(el);
    const thr = Math.max(tol, el.width);
    for (let i = 0; i < pts.length - 1; i++) if (distToSegment(lx, ly, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= thr) return true;
    return false;
  }
  const filled = !!el.fill && el.fill !== 'none' && el.color !== TRANSPARENT;
  const inOuter = lx >= b.x - tol && lx <= b.x + b.w + tol && ly >= b.y - tol && ly <= b.y + b.h + tol;
  if (filled) return inOuter;
  const inInner = lx >= b.x + tol && lx <= b.x + b.w - tol && ly >= b.y + tol && ly <= b.y + b.h - tol;
  return inOuter && !inInner; // tylko blisko obrysu
}

/** Bounding box elementu w jednostkach logicznych. */
function elementBBox(el: NoteElement): { x: number; y: number; w: number; h: number } {
  if (el.kind === 'group') return { x: 0, y: 0, w: 0, h: 0 };
  if (el.kind === 'image') return { x: el.x, y: el.y, w: el.w, h: el.h };
  if (el.kind === 'shape') return shapeBBox(el);
  if (el.kind === 'text') return { x: el.x, y: el.y - el.fontSize, w: Math.max(20, el.text.length * el.fontSize * 0.55), h: el.fontSize * 1.3 };
  // stroke
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of el.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function bboxIntersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

/** Łączny bbox zaznaczonych elementów (logiczny) lub null gdy brak. */
function selectionBBoxOf(els: NoteElement[], ids: ReadonlySet<string>): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  for (const el of els) {
    if (el.kind === 'group' || !ids.has(el.id)) continue;
    any = true; const b = elementBBox(el);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// Gizmo (px CSS): rozmiar uchwytu, strefa trafienia, odległość uchwytu obrotu.
const GZ_HANDLE_CSS = 9;
const GZ_HIT_CSS = 16;
const GZ_ROT_OFF_CSS = 26;

/** Geometria gizma: bbox (lokalny, nieobrócony), kąt obrotu i środek.
 *  Dla POJEDYNCZEGO obróconego elementu ramka przejmuje jego kąt — wtedy
 *  ciasno owija obrócony kształt. Dla wielu/kreski kąt = 0 (osiowa). */
function computeGizmo(els: NoteElement[], ids: ReadonlySet<string>, group?: NoteGroup | null):
  { bb: { x: number; y: number; w: number; h: number }; angle: number; cx: number; cy: number } | null {
  // Grupa: sztywna ramka — środek (group.cx,cy), kąt (group.rotation), a bbox
  // liczony w układzie LOKALNYM (po odkręceniu członków o -kąt) → stały rozmiar
  // podczas obrotu, obrót wokół środka geometrycznego.
  if (group) {
    const members = els.filter(e => e.kind !== 'group' && e.groupId === group.id);
    if (members.length === 0) return null;
    const angle = group.rotation || 0;
    // Środek: zapisany na grupie, w razie braku — środek bbox członków.
    let cx = group.cx, cy = group.cy;
    if (cx == null || cy == null) { const wb = selectionBBoxOf(els, new Set(members.map(m => m.id)))!; cx = wb.x + wb.w / 2; cy = wb.y + wb.h / 2; }
    // Lokalny AABB: odkręć narożniki bbox każdego członka o -kąt wokół (cx,cy).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of members) {
      const b = elementBBox(m);
      for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] as const) {
        const q = rotatePt(px, py, cx, cy, -angle);
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
      }
    }
    return { bb: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, angle, cx, cy };
  }
  const members = els.filter(e => e.kind !== 'group' && ids.has(e.id));
  if (members.length === 0) return null;
  if (members.length === 1) {
    const m = members[0];
    const angle = (m.kind === 'shape' && !LINEAR_SHAPES.has(m.shape)) ? (m.rotation || 0)
      : (m.kind === 'text' || m.kind === 'image') ? (m.rotation || 0) : 0;
    const bb = elementBBox(m);
    return { bb, angle, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
  }
  const bb = selectionBBoxOf(els, ids);
  if (!bb) return null;
  return { bb, angle: 0, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
}

/** Przesuwa element o (dx,dy) w jednostkach logicznych — zwraca nowy obiekt. */
function translateElement(el: NoteElement, dx: number, dy: number): NoteElement {
  if (el.kind === 'group') return el;
  if (el.kind === 'stroke') return { ...el, points: el.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) };
  if (el.kind === 'shape') {
    const base = { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    if (el.points && el.points.length >= 2) base.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    return base;
  }
  return { ...el, x: el.x + dx, y: el.y + dy }; // text, image
}

function elementCenter(el: NoteElement) { const b = elementBBox(el); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

function rotatePt(px: number, py: number, cx: number, cy: number, a: number) {
  const s = Math.sin(a), c = Math.cos(a), dx = px - cx, dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

/** Skaluje element wokół punktu (ox,oy) o (sx,sy). */
function scaleElement(el: NoteElement, sx: number, sy: number, ox: number, oy: number): NoteElement {
  if (el.kind === 'group') return el;
  const sp = (x: number, y: number) => ({ x: ox + (x - ox) * sx, y: oy + (y - oy) * sy });
  const wMul = (Math.abs(sx) + Math.abs(sy)) / 2;
  if (el.kind === 'stroke') return { ...el, width: el.width * wMul, points: el.points.map(p => { const q = sp(p.x, p.y); return { ...p, x: q.x, y: q.y }; }) };
  if (el.kind === 'shape') {
    if (LINEAR_SHAPES.has(el.shape) && el.points && el.points.length >= 2) {
      return { ...setShapePts(el, el.points.map(p => sp(p.x, p.y))), width: el.width * wMul };
    }
    const a = sp(el.x1, el.y1), b = sp(el.x2, el.y2); return { ...el, x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: el.width * wMul };
  }
  if (el.kind === 'text') { const q = sp(el.x, el.y); return { ...el, x: q.x, y: q.y, fontSize: Math.max(4, el.fontSize * Math.abs(sy)) }; }
  const q = sp(el.x, el.y); return { ...el, x: q.x, y: q.y, w: el.w * sx, h: el.h * sy }; // image
}

/** Obraca element o kąt a (rad) wokół (cx,cy). */
function rotateElement(el: NoteElement, a: number, cx: number, cy: number): NoteElement {
  if (el.kind === 'group') return el;
  if (el.kind === 'stroke') return { ...el, points: el.points.map(p => { const q = rotatePt(p.x, p.y, cx, cy, a); return { ...p, x: q.x, y: q.y }; }) };
  if (el.kind === 'shape') {
    if (LINEAR_SHAPES.has(el.shape)) {
      if (el.points && el.points.length >= 2) return setShapePts(el, el.points.map(p => rotatePt(p.x, p.y, cx, cy, a)));
      const a1 = rotatePt(el.x1, el.y1, cx, cy, a), b1 = rotatePt(el.x2, el.y2, cx, cy, a); return { ...el, x1: a1.x, y1: a1.y, x2: b1.x, y2: b1.y };
    }
    const ctr = elementCenter(el); const nc = rotatePt(ctr.x, ctr.y, cx, cy, a); const dx = nc.x - ctr.x, dy = nc.y - ctr.y;
    return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy, rotation: (el.rotation || 0) + a };
  }
  if (el.kind === 'text') { const q = rotatePt(el.x, el.y, cx, cy, a); return { ...el, x: q.x, y: q.y, rotation: (el.rotation || 0) + a }; }
  const ctr = elementCenter(el); const nc = rotatePt(ctr.x, ctr.y, cx, cy, a); const dx = nc.x - ctr.x, dy = nc.y - ctr.y; // image
  return { ...el, x: el.x + dx, y: el.y + dy, rotation: (el.rotation || 0) + a };
}

// Cache wzorów kreskowania (per pattern|color) — CanvasPattern jest niezależny od ctx.
const hatchCache = new Map<string, CanvasPattern | null>();
function hatchPattern(ctx: CanvasRenderingContext2D, color: string, kind: FillPattern): CanvasPattern | null {
  const key = `${kind}|${color}`;
  if (hatchCache.has(key)) return hatchCache.get(key)!;
  const pc = document.createElement('canvas'); pc.width = 8; pc.height = 8;
  const pctx = pc.getContext('2d');
  let pat: CanvasPattern | null = null;
  if (pctx) {
    pctx.strokeStyle = color; pctx.lineWidth = 1.2;
    pctx.beginPath(); pctx.moveTo(0, 8); pctx.lineTo(8, 0); pctx.stroke();
    if (kind === 'cross') { pctx.beginPath(); pctx.moveTo(0, 0); pctx.lineTo(8, 8); pctx.stroke(); }
    pat = ctx.createPattern(pc, 'repeat');
  }
  hatchCache.set(key, pat);
  return pat;
}

/** Czysta ścieżka figury (do wypełnienia, podświetlenia i obrysu w trybie „gładko"). */
function buildShapePath(s: NoteShape, sx: number, sy: number): Path2D {
  const x1 = s.x1 * sx, y1 = s.y1 * sy, x2 = s.x2 * sx, y2 = s.y2 * sy;
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  const p = new Path2D();
  if (s.shape === 'rect') {
    const r = s.rounded ? Math.min(w, h) * 0.18 : 0;
    if (r > 0 && typeof (p as Path2D & { roundRect?: unknown }).roundRect === 'function') {
      (p as Path2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, r);
    } else p.rect(x, y, w, h);
  }
  else if (s.shape === 'circle') p.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
  else if (s.shape === 'diamond') { p.moveTo(x + w / 2, y); p.lineTo(x + w, y + h / 2); p.lineTo(x + w / 2, y + h); p.lineTo(x, y + h / 2); p.closePath(); }
  else { // linia / strzałka (obsługa wielu wierzchołków + typu trzonu)
    const sp = arrowSpine(s, sx, sy, 28);
    p.moveTo(sp.draw[0].x, sp.draw[0].y);
    for (let i = 1; i < sp.draw.length; i++) p.lineTo(sp.draw[i].x, sp.draw[i].y);
    if (sp.head) {
      const [b1, b2] = arrowBarbs(sp.head.from.x, sp.head.from.y, sp.head.tip.x, sp.head.tip.y, arrowHeadLen(s, sx));
      p.moveTo(sp.head.tip.x, sp.head.tip.y); p.lineTo(b1.x, b1.y);
      p.moveTo(sp.head.tip.x, sp.head.tip.y); p.lineTo(b2.x, b2.y);
    }
  }
  return p;
}

function renderShape(ctx: CanvasRenderingContext2D, s: NoteShape, sx: number, sy: number, highlight = false) {
  const fillPath = buildShapePath(s, sx, sy);
  const rough = (s.roughness ?? 0);
  const alpha = s.opacity != null ? s.opacity : 1;
  ctx.save();
  // Obrót wokół środka bbox (linie obracamy przez współrzędne, więc je pomijamy).
  if (s.rotation && !LINEAR_SHAPES.has(s.shape)) {
    const b = shapeBBox(s); const cx = (b.x + b.w / 2) * sx, cy = (b.y + b.h / 2) * sy;
    ctx.translate(cx, cy); ctx.rotate(s.rotation); ctx.translate(-cx, -cy);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Wypełnienie (nie dla linii) — zawsze na czystej ścieżce, żeby pozostało spójne.
  // fillColor ma priorytet; brak → fallback na `color` (zgodność ze starymi figurami).
  const fillCol = s.fillColor ?? s.color;
  if (!LINEAR_SHAPES.has(s.shape) && s.fill && s.fill !== 'none' && fillCol !== TRANSPARENT) {
    ctx.globalAlpha = alpha;
    if (s.fill === 'solid') ctx.fillStyle = fillCol;
    else { const pat = hatchPattern(ctx, fillCol, s.fill); ctx.fillStyle = pat ?? fillCol; }
    ctx.fill(fillPath);
  }
  // Obrys — w trybie „odręcznym" rysowany jako podwójna, wygięta krzywa (rough.js-like).
  // WAŻNE: zaznaczenie NIE zmienia stylu rysowania — figura zawsze rysuje się tak samo,
  // a zaznaczenie dodaje tylko niebieską poświatę po tej samej (perturbowanej) geometrii.
  if (s.color !== TRANSPARENT || highlight) {
    const lw = Math.max(0.5, s.width * sx);
    let cap: CanvasLineCap = 'round';
    if (LINEAR_SHAPES.has(s.shape)) cap = s.rounded ? 'round' : 'butt';
    if (s.strokeStyle === 'dotted') cap = 'round';
    // Geometria obrysu (rough liczony raz, deterministycznie z id) — wspólna dla poświaty i kreski.
    let strokePath = fillPath;
    if (rough > 0) {
      const mag = (rough === 2 ? 6 : 3) * sx + lw * 0.25;
      strokePath = buildRoughStroke(s, sx, sy, mag);
    }
    // Poświata zaznaczenia (pod spodem, ta sama geometria → styl bez zmian).
    if (highlight) {
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = lw + 6 * sx;
      ctx.lineCap = cap; ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.stroke(strokePath);
    }
    // Właściwy obrys w kolorze i stylu figury.
    if (s.color !== TRANSPARENT) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = lw;
      ctx.lineCap = cap; ctx.lineJoin = 'round';
      ctx.setLineDash(dashFor(s.strokeStyle, lw).map(d => d * sx));
      ctx.stroke(strokePath);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/** Zawija tekst do maks. szerokości (po słowach; bardzo długie słowa łamie znakowo). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    const push = (w: string) => {
      if (!cur) {
        if (ctx.measureText(w).width <= maxW) { cur = w; return; }
        let chunk = '';
        for (const ch of w) {
          if (chunk && ctx.measureText(chunk + ch).width > maxW) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        cur = chunk;
        return;
      }
      if (ctx.measureText(cur + ' ' + w).width <= maxW) cur += ' ' + w;
      else { lines.push(cur); cur = ''; push(w); }
    };
    for (const w of para.split(' ')) push(w);
    lines.push(cur);
  }
  return lines;
}

/**
 * Rysuje osadzoną etykietę — tekst w środku obiektu.
 *
 * **Bez własnego tła.** Wcześniej pod napisem leżała półprzezroczysta ciemna
 * pigułka „dla czytelności" i to ona była tłem etykiety zamiast wypełnienia
 * kształtu: prostokąt wypełniony na żółto miał w środku szarą plamę, a przy
 * kilku figurach obok siebie rysunek wyglądał na posklejany z wycinków. Tłem
 * napisu jest teraz to, co i tak jest pod nim — wypełnienie kształtu — a za
 * czytelność odpowiada kolor pisma, ustawiany w lewym menu (Kolor obrysu).
 */
function renderLabel(ctx: CanvasRenderingContext2D, el: NoteShape | NoteStroke, sx: number, sy: number) {
  const label = el.label;
  if (!label || !label.trim()) return;
  const b = el.kind === 'shape' ? shapeBBox(el) : elementBBox(el);
  const fs = (el.labelFontSize ?? 20) * sx;
  const align: TextAlign = el.labelAlign ?? 'center';
  // Etykiety zapisane przed zmianą nie mają własnego koloru. Awaryjnie bierzemy
  // kolor obrysu obiektu, a nie biel: odkąd pod napisem nie ma ciemnej pigułki,
  // sztywna biel znikała na każdym jasnym wypełnieniu.
  const col = el.labelColor ?? el.color ?? '#ffffff';
  ctx.save();
  ctx.font = `${fs}px sans-serif`;
  ctx.textBaseline = 'middle';
  const lh = fs * 1.25;
  const pad = 6 * sx;
  // Zawijaj tekst do szerokości obiektu (z marginesem); dla wąskich obiektów min. szerokość.
  const wrapW = Math.max(40 * sx, b.w * sx - pad * 2);
  const lines = wrapText(ctx, label, wrapW);
  const widths = lines.map(l => ctx.measureText(l).width);
  const maxW = Math.max(1, ...widths);
  const totalH = lines.length * lh;
  const cx = (b.x + b.w / 2) * sx, cy = (b.y + b.h / 2) * sy;
  // Szerokość bloku zostaje — wyznacza punkty odniesienia dla wyrównania
  // do lewej i do prawej. Wysokość nie jest już do niczego potrzebna, odkąd
  // pod napisem nic się nie rysuje.
  const boxW = maxW + pad * 2;
  const bx0 = cx - boxW / 2;
  // Tekst.
  ctx.textAlign = align;
  ctx.fillStyle = col;
  const tx = align === 'left' ? bx0 + pad : align === 'right' ? bx0 + boxW - pad : cx;
  let ty = cy - totalH / 2 + lh / 2;
  for (const ln of lines) { ctx.fillText(ln, tx, ty); ty += lh; }
  ctx.restore();
}

function loadStorage(): { pages: NotePage[]; currentId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (Array.isArray(d.pages) && d.pages.length > 0)
        return { pages: d.pages, currentId: d.currentId ?? d.pages[0].id };
    }
  } catch { /* ignore */ }
  const p = newPage();
  return { pages: [p], currentId: p.id };
}

function saveStorage(pages: NotePage[], currentId: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ pages, currentId })); }
  catch { /* ignore */ }
}

function renderElements(
  ctx: CanvasRenderingContext2D,
  elements: NoteElement[],
  selected: ReadonlySet<string>,
  sx: number, sy: number,
  bgColor = DEFAULT_BG,
  skipBackground = false,
) {
  if (!skipBackground) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  for (const el of elements) {
    if (el.kind === 'group') continue; // grupa nie ma geometrii
    const hi = selected.has(el.id);
    if (el.kind === 'image') {
      const img = getImg(el.src);
      const rot = el.rotation || 0;
      ctx.save();
      if (rot) { const cx = (el.x + el.w / 2) * sx, cy = (el.y + el.h / 2) * sy; ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy); }
      if (el.opacity != null) ctx.globalAlpha = el.opacity;
      const ix = el.x * sx, iy = el.y * sy, iw = el.w * sx, ih = el.h * sy;
      if (img.complete && img.naturalWidth > 0) {
        if (el.rounded) {
          // Zaokrąglone narożniki — przytnij do roundRect.
          const rr = Math.min(iw, ih) * 0.12;
          ctx.save();
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(ix, iy, iw, ih, rr);
          else ctx.rect(ix, iy, iw, ih);
          ctx.clip();
          ctx.drawImage(img, ix, iy, iw, ih);
          ctx.restore();
        } else {
          ctx.drawImage(img, ix, iy, iw, ih);
        }
      }
      ctx.globalAlpha = 1;
      if (hi) {
        ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.strokeRect(el.x * sx, el.y * sy, el.w * sx, el.h * sy);
      }
      ctx.restore();
    } else if (el.kind === 'text') {
      ctx.save();
      const rot = el.rotation || 0;
      if (rot) { ctx.translate(el.x * sx, el.y * sy); ctx.rotate(rot); ctx.translate(-el.x * sx, -el.y * sy); }
      ctx.font = `${el.fontSize * sy}px sans-serif`;
      ctx.fillStyle = hi ? '#60a5fa' : el.color;
      ctx.textAlign = el.align ?? 'left';
      ctx.fillText(el.text, el.x * sx, el.y * sy);
      ctx.textAlign = 'left';
      ctx.restore();
    } else if (el.kind === 'shape') {
      renderShape(ctx, el, sx, sy, hi);
      renderLabel(ctx, el, sx, sy);
    } else {
      // Strok = single source of truth: renderStroke honoruje opacity/pressure/transparent.
      renderStroke(ctx, el, sx, sy, hi);
      renderLabel(ctx, el, sx, sy);
    }
  }
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: NoteStroke, sx: number, sy: number, highlight = false) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  if (stroke.color === TRANSPARENT && !highlight) return; // brak obrysu
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Krycie: jawne `opacity` ma priorytet; inaczej domyślne (marker 0.4 / pencil 1).
  const baseAlpha = stroke.opacity != null ? stroke.opacity : (stroke.tool === 'marker' ? 0.4 : 1);
  ctx.strokeStyle = highlight ? '#60a5fa' : stroke.color;
  if (stroke.tool === 'marker') {
    ctx.globalAlpha = baseAlpha;
    ctx.lineWidth = stroke.width * sx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
    ctx.stroke();
  } else {
    ctx.globalAlpha = baseAlpha;
    const lowPressure = stroke.pressure === 'low';
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i].p || 0.5;
      // 'high' → szeroki zakres grubości od nacisku; 'low' → prawie stała grubość.
      const factor = lowPressure ? (0.7 + pr * 0.3) : (pr * 2);
      ctx.lineWidth = Math.max(0.5, stroke.width * factor * sx);
      ctx.beginPath();
      ctx.moveTo(pts[i-1].x * sx, pts[i-1].y * sy);
      ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderLasso(ctx: CanvasRenderingContext2D, pts: NotePoint[], sx: number, sy: number) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function pointInPolygon(x: number, y: number, poly: NotePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { x: xi, y: yi } = poly[i], { x: xj, y: yj } = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function strokeInLasso(stroke: NoteStroke, lasso: NotePoint[]): boolean {
  let hit = 0;
  for (const pt of stroke.points) if (pointInPolygon(pt.x, pt.y, lasso)) hit++;
  return hit > stroke.points.length * 0.5;
}

function strokeHitTest(stroke: NoteStroke, x: number, y: number, r: number): boolean {
  for (const pt of stroke.points) if (Math.hypot(pt.x - x, pt.y - y) < r) return true;
  return false;
}

function makeThumbnail(page: NotePage): string {
  const c = document.createElement('canvas');
  c.width = THUMB_W; c.height = THUMB_H;
  const ctx = c.getContext('2d')!;
  renderElements(ctx, page.elements, new Set(), THUMB_W / CANVAS_W, THUMB_H / CANVAS_H, page.bgColor ?? DEFAULT_BG);
  return c.toDataURL();
}

// ── Reusable color picker panel (kolor / kolor tła) ─────────────────────────
// 1a tabelka 6×3 + przezroczysty · 1b odcienie (5) · 1c hex + Pipeta z kanwy.
const CHECKER_BG =
  'repeating-conic-gradient(#888 0% 25%, #ccc 0% 50%) 50% / 10px 10px';

const ColorPickerPanel: React.FC<{
  title: string;
  value: string;
  allowTransparent?: boolean;
  eyedropperActive: boolean;
  onPick: (c: string) => void;
  onEyedropper: () => void;
}> = ({ title, value, allowTransparent, eyedropperActive, onPick, onEyedropper }) => {
  const [hex, setHex] = useState(value);
  useEffect(() => { setHex(value); }, [value]);
  const baseForShades = /^#/.test(value) ? value : '#888888';
  const shades = shadesOf(baseForShades);
  const applyHex = () => { const n = normalizeHex(hex); if (n) onPick(n); };

  const Swatch = ({ c, size = 26 }: { c: string; size?: number }) => {
    const selected = c.toLowerCase() === value.toLowerCase();
    const transparent = c === TRANSPARENT;
    return (
      <Box
        component="button"
        title={c}
        onClick={() => onPick(c)}
        sx={{
          width: size, height: size, borderRadius: 1, cursor: 'pointer', p: 0,
          background: transparent ? CHECKER_BG : c,
          border: selected ? '2px solid #60a5fa' : '2px solid rgba(255,255,255,0.18)',
          outline: 'none', '&:hover': { borderColor: 'rgba(255,255,255,0.6)' },
        }}
      />
    );
  };

  return (
    <Box sx={{ width: 232 }}>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.75 }}>
        {title}
      </Typography>

      {/* 1a — siatka 6×3 (+ przezroczysty) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.5, mb: 1 }}>
        {COLOR_GRID.map(c => <Swatch key={c} c={c} />)}
        {allowTransparent && <Swatch c={TRANSPARENT} />}
      </Box>

      {/* 1b — odcienie wybranego koloru */}
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>Odcienie</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0.5, mb: 1 }}>
        {shades.map((c, i) => <Swatch key={`${c}-${i}`} c={c} />)}
      </Box>

      {/* 1c — hex + Pipeta */}
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>Kod Hex</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small" value={hex} placeholder="#rrggbb"
          onChange={e => setHex(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') applyHex(); }}
          sx={{ flex: 1, '& input': { fontFamily: 'monospace', fontSize: 13, py: 0.5 } }}
        />
        <Button size="small" variant="outlined" onClick={applyHex} sx={{ minWidth: 0, px: 1 }}>OK</Button>
        <Tooltip title="Pobierz kolor z kanwy (kliknij na rysunku)">
          <IconButton
            size="small"
            onClick={onEyedropper}
            sx={{
              color: eyedropperActive ? 'primary.main' : 'text.secondary',
              bgcolor: eyedropperActive ? 'action.selected' : 'transparent',
            }}
          >
            <ColorizeIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SpenNotesView() {
  // React state — loadStorage() called ONCE so pages[0].id === currentId (avoids mismatch when localStorage empty)
  const [_init] = useState(loadStorage);
  const [pages, setPages] = useState<NotePage[]>(_init.pages);
  const [currentPageId, setCurrentPageId] = useState<string>(_init.currentId);
  const [tool, setTool] = useState<NoteTool>('pencil');
  // Kolor pisaka dobrany do tła strony, którą właśnie przywróciliśmy. Sztywna
  // biel oznaczała, że po uruchomieniu z zapisaną białą stroną pierwsza kreska
  // była niewidoczna — objaw nie do odróżnienia od zepsutego rysowania.
  const [color, setColor] = useState(() =>
    defaultInkFor(_init.pages.find(p => p.id === _init.currentId)?.bgColor ?? DEFAULT_BG));
  const [brushSize, setBrushSize] = useState(3);
  // ── Styl rysowania (nowy lewy toolbar) ──────────────────────────────────────
  const [fillPattern, setFillPattern] = useState<FillPattern>('none');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid'); // wzór kreski obrysu
  const [roughness, setRoughness] = useState<Roughness>(0);             // niedbałość obrysu
  const [shapeRounded, setShapeRounded] = useState(false);             // zaokrąglone narożniki (prostokąt)
  const [arrowHeads, setArrowHeads] = useState<ArrowHeads>('end');      // strzałka: groty
  const [arrowType, setArrowType] = useState<ArrowType>('straight');    // strzałka: typ trzonu
  const [editPointsId, setEditPointsId] = useState<string | null>(null); // linia/strzałka w trybie edycji punktów
  const [fillColor, setFillColor] = useState<string>(TRANSPARENT); // kolor wypełnienia obiektów
  const [textSize, setTextSize] = useState(24);       // rozmiar nowego tekstu (px)
  const [textAlign, setTextAlign] = useState<TextAlign>('left'); // wyrównanie tekstu
  const [pressureLevel, setPressureLevel] = useState<'low' | 'high'>('high');
  // Intensywność 0–100%: 100 = pełna intensywność (max krycie), 0 = niewidoczne.
  const [intensityPct, setIntensityPct] = useState(100);
  // Który flyout lewego toolbaru jest otwarty: kolor / tło / styl.
  const [sidePanel, setSidePanel] = useState<null | 'color' | 'bg' | 'style' | 'text' | 'arrow'>(null);
  // Tryb pipety: pobiera kolor z kanwy do foreground ('fg') lub tła ('bg').
  const [eyedropper, setEyedropper] = useState<null | 'fg' | 'bg'>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [textInput, setTextInput] = useState<{ x: number; y: number; val: string; targetId?: string } | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [historyVer, setHistoryVer] = useState(0);
  const [dragSrc, setDragSrc] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [selectedImgId, setSelectedImgId] = useState<string | null>(null);
  const [imgAnchor, setImgAnchor] = useState<HTMLElement | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [zoomPct, setZoomPct] = useState(100);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugTick, setDebugTick] = useState(0);
  const [imgDragVer, setImgDragVer] = useState(0);
  const [scenePanelOpen, setScenePanelOpen] = useState(false);
  // Drag-and-drop drzewa sceny: id przeciąganego elementu + cel podświetlenia.
  const [treeDragId, setTreeDragId] = useState<string | null>(null);
  const [treeDropTarget, setTreeDropTarget] = useState<string | null>(null); // gid grupy lub '__root__'
  // Aktywnie zaznaczona grupa (gizmo sztywnej ramki grupy). null = zwykłe zaznaczenie.
  const selectedGroupRef = useRef<string | null>(null);
  // Menu „Inne" (kolejność warstw) na lewym pasku.
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  // Dialog ustawiania linku dla obiektu: { id, url }.
  const [linkDialog, setLinkDialog] = useState<{ id: string; url: string } | null>(null);
  // Popup linku przy obiekcie (overlay): { id, anchor }.
  const [linkPopup, setLinkPopup] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  // Dialog wyboru celu LinkTo dla kształtu: id kształtu, którego LinkTo edytujemy.
  const [linkToPicker, setLinkToPicker] = useState<string | null>(null);
  // Dialog edycji opisu Markdown (InfoMd): { id, text }.
  const [infoMdDialog, setInfoMdDialog] = useState<{ id: string; text: string } | null>(null);
  // Popup wyświetlający sformatowany opis Markdown przy obiekcie: { id, anchor }.
  const [infoMdPopup, setInfoMdPopup] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  // Ostatni tap (czas+pozycja) do wykrycia podwójnego kliknięcia (drill-in do grupy).
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const [propElId, setPropElId] = useState<string | null>(null);
  const [notesBrowser, setNotesBrowser] = useState<'open' | 'save' | null>(null);
  const [notesFile, setNotesFile] = useState<{ dir: string; name: string } | null>(null);
  const [notesToast, setNotesToast] = useState<string | null>(null);
  const notesViewerUrl = notesFile ? buildViewerUrl('notes', notesFile.dir, notesFile.name) : null;

  // Plain functions (not memoized) so they always read the latest pages/currentPageId.
  const handleNotesSave = async (dir: string, name: string) => {
    await writeFileAt(dir, name, NOTES_EXT, JSON.stringify({ version: 1, pages, currentId: currentPageId }, null, 2));
    setNotesFile({ dir, name });
    setNotesToast(`Saved "${name}"`);
  };
  const handleNotesOpen = async (dir: string, name: string) => {
    const text = await readFileAt(dir, name, NOTES_EXT);
    syncOpenUrl(`${dir}/${name}${NOTES_EXT}`);
    const data = JSON.parse(text) as { pages?: NotePage[]; currentId?: string };
    const loaded = Array.isArray(data.pages) && data.pages.length ? data.pages : [newPage()];
    const openId = data.currentId && loaded.some(p => p.id === data.currentId) ? data.currentId : loaded[0].id;
    setPages(loaded);
    setCurrentPageId(openId);
    setSelectedIds(new Set());
    setNotesFile({ dir, name });
    // Wczytany plik może mieć inne tło niż to, pod które dobrany był pisak.
    const openedBg = loaded.find(p => p.id === openId)?.bgColor ?? DEFAULT_BG;
    if (needsInkSwitch(colorRef.current, openedBg)) {
      const ink = defaultInkFor(openedBg);
      colorRef.current = ink;
      setColor(ink);
    }
  };

  // Eksport bieżącej strony do PNG/SVG/PDF (rasteryzacja kanwy notatki).
  const exportNotes = useCallback(async (fmt: 'png' | 'svg' | 'pdf') => {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = CANVAS_W * scale; c.height = CANVAS_H * scale;
    const ctx = c.getContext('2d'); if (!ctx) return;
    renderElements(ctx, elementsRef.current, new Set(), scale, scale, bgColorRef.current, false);
    const base = notesFile?.name?.replace(/\.[^.]+$/, '') || 'notes';
    try {
      if (fmt === 'png') await exportCanvasPng(c, `${base}.png`);
      else if (fmt === 'svg') exportCanvasSvg(c, `${base}.svg`);
      else exportCanvasPdf(c, `${base}.pdf`);
    } catch (e) { console.error('Notes export failed', e); }
  }, [notesFile]);

  // Register file operations with the unified top-bar File menu.
  useRegisterFileOps('notes', {
    currentName: notesFile?.name ?? null,
    server: [
      { label: 'Open Notes from Server…', run: () => setNotesBrowser('open') },
      { label: 'Save Notes to Server…', run: () => setNotesBrowser('save') },
    ],
    exportItems: [
      { label: 'Export PNG', run: () => exportNotes('png') },
      { label: 'Export SVG', run: () => exportNotes('svg') },
      { label: 'Export PDF', run: () => exportNotes('pdf') },
    ],
    viewerUrl: notesViewerUrl,
  }, [notesFile, notesViewerUrl, exportNotes]);
  const debugBufRef = useRef<string[]>([]);
  // dbg writes to ref only — zero React re-renders during drawing
  const dbg = (msg: string) => {
    const t = new Date().toISOString().slice(11, 23);
    debugBufRef.current.push(`${t} ${msg}`);
    if (debugBufRef.current.length > 80) debugBufRef.current.shift();
  };

  // Drawing refs (updated synchronously, not through React)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elementsRef = useRef<NoteElement[]>([]);
  const activeStrokeRef = useRef<NoteStroke | null>(null);
  const activeShapeRef = useRef<NoteShape | null>(null);
  const lassoRef = useRef<NotePoint[]>([]);
  const eraserActiveRef = useRef(false);
  // Pan tool: aktywne przeciąganie widoku. Select tool: przesuwanie/zaznaczanie.
  const panDragRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const moveDragRef = useRef<{ lastX: number; lastY: number; ids: Set<string>; moved: boolean } | null>(null);
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const editPointsRef = useRef<string | null>(null);
  useEffect(() => { editPointsRef.current = editPointsId; }, [editPointsId]);
  // Aktywne przeciąganie wierzchołka linii/strzałki w trybie edycji punktów.
  const pointDragRef = useRef<{ id: string; index: number } | null>(null);
  // Transformacja zaznaczenia (gizmo): skalowanie narożnikiem lub obrót uchwytem.
  const transformRef = useRef<{
    mode: 'scale' | 'rotate';
    ox: number; oy: number;        // przeciwległy narożnik (LOKALNY, nieobrócony) — punkt stały skali
    cx: number; cy: number;        // środek bbox
    startX: number; startY: number; // chwytany narożnik (LOKALNY) dla skali
    startAngle: number;            // początkowy kąt myszy (obrót)
    angle: number;                 // kąt gizma (ramki) — transformacja w jego układzie
    groupId?: string;              // gdy transformujemy grupę (aktualizuje jej rotation/center)
    startGroupRot?: number;        // kąt grupy w momencie startu obrotu
    snapshot: Map<string, NoteElement>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imgDragRef = useRef<{
    edge: ResizeEdge;
    startCX: number; startCY: number;
    startX: number; startY: number; startW: number; startH: number;
  } | null>(null);
  const zoomRef = useRef(1);
  const panPxRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { cx: number; cy: number }>>(new Map());
  const pinchRef = useRef<{
    initDist: number; initZoom: number;
    initPan: { x: number; y: number };
    initMidPx: { x: number; y: number };
  } | null>(null);
  const singleTouchPanRef = useRef<{
    startBx: number; startBy: number;
    startPan: { x: number; y: number };
  } | null>(null);
  // Gdy w trakcie dotyku pojawi się 2. palec → tryb gestu (pinch/zoom); blokuje
  // rysowanie pojedynczym palcem aż WSZYSTKIE palce zostaną podniesione (inaczej
  // resztkowy palec po pinchu zacząłby kreślić). Reset w onUp gdy size===0.
  const touchGestureRef = useRef(false);

  // Stable refs for DOM event handlers
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const brushRef = useRef(brushSize);
  const fillRef = useRef(fillPattern);
  const strokeStyleRef = useRef(strokeStyle);
  const roughnessRef = useRef(roughness);
  const shapeRoundedRef = useRef(shapeRounded);
  const arrowHeadsRef = useRef(arrowHeads);
  const arrowTypeRef = useRef(arrowType);
  const fillColorRef = useRef(fillColor);
  const textSizeRef = useRef(textSize);
  const textAlignRef = useRef(textAlign);
  const pressureRef = useRef(pressureLevel);
  const intensityRef = useRef(intensityPct);
  const eyedropperRef = useRef(eyedropper);
  const selectedRef = useRef(selectedIds);
  const currentIdRef = useRef(currentPageId);
  const bgColorRef = useRef(DEFAULT_BG);
  const undoStacks = useRef<Record<string, NoteElement[][]>>({});
  const redoStacks = useRef<Record<string, NoteElement[][]>>({});

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { brushRef.current = brushSize; }, [brushSize]);
  useEffect(() => { fillRef.current = fillPattern; }, [fillPattern]);
  useEffect(() => { strokeStyleRef.current = strokeStyle; }, [strokeStyle]);
  useEffect(() => { roughnessRef.current = roughness; }, [roughness]);
  useEffect(() => { shapeRoundedRef.current = shapeRounded; }, [shapeRounded]);
  useEffect(() => { arrowHeadsRef.current = arrowHeads; }, [arrowHeads]);
  useEffect(() => { arrowTypeRef.current = arrowType; }, [arrowType]);
  useEffect(() => { fillColorRef.current = fillColor; }, [fillColor]);
  useEffect(() => { textSizeRef.current = textSize; }, [textSize]);
  useEffect(() => { textAlignRef.current = textAlign; }, [textAlign]);
  // Gdy zaznaczono pojedynczy tekst → panel Tekst pokazuje jego rozmiar/wyrównanie.
  useEffect(() => {
    if (selectedIds.size !== 1) return;
    const el = elementsRef.current.find(e => e.id === [...selectedIds][0]);
    if (el && el.kind === 'text') { setTextSize(el.fontSize); setTextAlign(el.align ?? 'left'); }
    if (el && el.kind === 'image') { setIntensityPct(Math.round((el.opacity ?? 1) * 100)); }
    if (el && el.kind === 'shape') {
      setBrushSize(el.width);
      if (el.fill && el.fill !== 'none') setFillPattern(el.fill);
      setStrokeStyle(el.strokeStyle ?? 'solid');
      setRoughness(el.roughness ?? 0);
      setShapeRounded(!!el.rounded);
      setIntensityPct(Math.round((el.opacity ?? 1) * 100));
      if (el.shape === 'arrow') { setArrowHeads(el.arrowHeads ?? 'end'); setArrowType(el.arrowType ?? 'straight'); }
      if (el.label) { setTextSize(el.labelFontSize ?? 20); setTextAlign(el.labelAlign ?? 'center'); }
    }
    if (el && el.kind === 'stroke' && el.label) { setTextSize(el.labelFontSize ?? 20); setTextAlign(el.labelAlign ?? 'center'); }
  }, [selectedIds]);
  // Wyjdź z trybu edycji punktów, gdy zaznaczenie nie jest już tą linią/strzałką.
  useEffect(() => {
    if (editPointsId && !(selectedIds.size === 1 && selectedIds.has(editPointsId))) setEditPointsId(null);
  }, [selectedIds, editPointsId]);
  useEffect(() => { pressureRef.current = pressureLevel; }, [pressureLevel]);
  useEffect(() => { intensityRef.current = intensityPct; }, [intensityPct]);
  useEffect(() => { eyedropperRef.current = eyedropper; }, [eyedropper]);
  useEffect(() => { selectedRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { currentIdRef.current = currentPageId; }, [currentPageId]);

  // Sync elementsRef + bgColorRef when pages/currentPage changes
  useEffect(() => {
    const page = pages.find(p => p.id === currentPageId);
    const els = page?.elements ?? [];
    dbg(`SYNC_EFF id=${currentPageId} found=${!!page} els=${els.length} pages=${pages.length}`);
    elementsRef.current = els;
    bgColorRef.current = page?.bgColor ?? DEFAULT_BG;
  }, [pages, currentPageId]);

  // Persist to localStorage
  useEffect(() => { saveStorage(pages, currentPageId); }, [pages, currentPageId]);

  // Generate all thumbnails on mount
  useEffect(() => {
    const t: Record<string, string> = {};
    for (const p of pages) t[p.id] = makeThumbnail(p);
    setThumbnails(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drawing ──────────────────────────────────────────────────────────────────

  const getScale = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return { sx: 1, sy: 1 };
    return { sx: c.width / CANVAS_W, sy: c.height / CANVAS_H };
  }, []);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { sx, sy } = getScale();
    // Clamp zoom — NaN/Infinity from degenerate pinch would render all content off-screen
    const z = isFinite(zoomRef.current) && zoomRef.current > 0 ? zoomRef.current : 1;
    if (z !== zoomRef.current) { dbg(`ZOOM healed: ${zoomRef.current} → 1`); zoomRef.current = z; }
    // Clamp pan — NaN/Infinity from phantom touch or zero-size BoundingClientRect corrupts context
    const rawPx = panPxRef.current.x; const rawPy = panPxRef.current.y;
    const px = isFinite(rawPx) ? rawPx : 0;
    const py = isFinite(rawPy) ? rawPy : 0;
    if (rawPx !== px || rawPy !== py) { dbg(`PAN healed: ${rawPx},${rawPy} → 0,0`); panPxRef.current = { x: px, y: py }; }
    // Background (full canvas, no transform)
    ctx.fillStyle = bgColorRef.current;
    ctx.fillRect(0, 0, c.width, c.height);
    // Zoomed+panned content
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(z, z);
    renderElements(ctx, elementsRef.current, selectedRef.current, sx, sy, bgColorRef.current, true);
    if (activeStrokeRef.current) renderStroke(ctx, activeStrokeRef.current, sx, sy);
    if (activeShapeRef.current) renderShape(ctx, activeShapeRef.current, sx, sy);
    if (lassoRef.current.length > 1 && toolRef.current === 'lasso')
      renderLasso(ctx, lassoRef.current, sx, sy);
    // Prostokąt zaznaczania (marquee) dla narzędzia select.
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      ctx.save();
      ctx.strokeStyle = '#60a5fa'; ctx.fillStyle = 'rgba(96,165,250,0.12)';
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      const rx = Math.min(m.x1, m.x2) * sx, ry = Math.min(m.y1, m.y2) * sy;
      const rw = Math.abs(m.x2 - m.x1) * sx, rh = Math.abs(m.y2 - m.y1) * sy;
      ctx.fillRect(rx, ry, rw, rh); ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }
    ctx.restore();

    // ── Gizmo transformacji zaznaczenia (ramka + narożniki + obrót) ──────────
    // Rysowany w przestrzeni bufora (po restore), by uchwyty miały stały rozmiar.
    if (toolRef.current === 'select' && selectedRef.current.size > 0 && !marqueeRef.current && !editPointsRef.current) {
      const _grp = selectedGroupRef.current
        ? (elementsRef.current.find(el => el.kind === 'group' && el.id === selectedGroupRef.current) as NoteGroup | undefined) ?? null
        : null;
      const gz = computeGizmo(elementsRef.current, selectedRef.current, _grp);
      if (gz) {
        const { bb, angle, cx: gcx, cy: gcy } = gz;
        const rect = c.getBoundingClientRect();
        const dpr = rect.width ? c.width / rect.width : 1;
        // logiczny → bufor; uwzględnia obrót gizma wokół środka (gcx,gcy).
        const lToBuf = (lx: number, ly: number) => {
          const w = rotatePt(lx, ly, gcx, gcy, angle);
          return { bx: w.x / CANVAS_W * c.width * z + px, by: w.y / CANVAS_H * c.height * z + py };
        };
        const HS = GZ_HANDLE_CSS * dpr;
        const offY = GZ_ROT_OFF_CSS * CANVAS_H / ((rect.height || 1) * (zoomRef.current || 1));
        const lc = [
          [bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h],
        ] as const;
        const cb = lc.map(([lx, ly]) => lToBuf(lx, ly));
        const topMid = lToBuf(gcx, bb.y);
        const rotH = lToBuf(gcx, bb.y - offY);
        ctx.save();
        ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = Math.max(1, dpr);
        // Ramka (obrócona) jako wielokąt
        ctx.setLineDash([5 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(cb[0].bx, cb[0].by);
        for (let i = 1; i < 4; i++) ctx.lineTo(cb[i].bx, cb[i].by);
        ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
        // Linia + uchwyt obrotu
        ctx.beginPath(); ctx.moveTo(topMid.bx, topMid.by); ctx.lineTo(rotH.bx, rotH.by); ctx.stroke();
        ctx.beginPath(); ctx.arc(rotH.bx, rotH.by, HS * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = '#60a5fa'; ctx.fill();
        // Narożniki (skalowanie)
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#60a5fa';
        for (const p2 of cb) {
          ctx.beginPath(); ctx.rect(p2.bx - HS / 2, p2.by - HS / 2, HS, HS); ctx.fill(); ctx.stroke();
        }
        // Środkowy uchwyt PRZESUWANIA — kółko z krzyżykiem (4 strzałki).
        const ctr = lToBuf(gcx, gcy);
        const mr = HS * 1.1;
        ctx.beginPath(); ctx.arc(ctr.bx, ctr.by, mr, 0, Math.PI * 2);
        ctx.fillStyle = '#60a5fa'; ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        ctx.moveTo(ctr.bx - mr * 0.55, ctr.by); ctx.lineTo(ctr.bx + mr * 0.55, ctr.by);
        ctx.moveTo(ctr.bx, ctr.by - mr * 0.55); ctx.lineTo(ctr.bx, ctr.by + mr * 0.55);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── Uchwyty edycji punktów linii/strzałki ────────────────────────────────
    const editId = editPointsRef.current;
    if (toolRef.current === 'select' && editId) {
      const el = elementsRef.current.find(e => e.id === editId);
      if (el && el.kind === 'shape' && LINEAR_SHAPES.has(el.shape)) {
        const rect = c.getBoundingClientRect();
        const dpr = rect.width ? c.width / rect.width : 1;
        const toBuf = (lx: number, ly: number) => ({ bx: lx / CANVAS_W * c.width * z + px, by: ly / CANVAS_H * c.height * z + py });
        const pts = shapePts(el);
        const HS = GZ_HANDLE_CSS * dpr;
        ctx.save();
        ctx.lineWidth = Math.max(1, dpr);
        // Środki segmentów (puste, mniejsze) — kliknięcie dodaje nowy wierzchołek.
        ctx.strokeStyle = '#60a5fa'; ctx.fillStyle = 'rgba(24,24,24,0.9)';
        for (let i = 0; i < pts.length - 1; i++) {
          const b = toBuf((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
          ctx.beginPath(); ctx.arc(b.bx, b.by, HS * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // Wierzchołki (pełne) — przeciąganie zmienia kształt.
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2563eb';
        for (const v of pts) {
          const b = toBuf(v.x, v.y);
          ctx.beginPath(); ctx.arc(b.bx, b.by, HS * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getScale]);

  // Resize canvas buffer to match CSS size
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const dpr = window.devicePixelRatio || 1;
        c.width = e.contentRect.width * dpr;
        c.height = e.contentRect.height * dpr;
        redraw();
      }
    });
    obs.observe(c);
    return () => obs.disconnect();
  }, [redraw]);

  // Redraw when page/selection changes
  useEffect(() => { redraw(); }, [pages, currentPageId, selectedIds, editPointsId, redraw]);

  // Wire image async-load → redraw (handles data URLs that load asynchronously)
  useEffect(() => {
    _imgRedrawCb = redraw;
    return () => { _imgRedrawCb = null; };
  }, [redraw]);

  // Debug panel auto-refresh (2×/s when visible, zero cost when hidden)
  useEffect(() => {
    if (!debugVisible) return;
    const id = setInterval(() => setDebugTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [debugVisible]);

  // ── Commit helpers ───────────────────────────────────────────────────────────

  const triggerThumbnail = useCallback((pageId: string, elements: NoteElement[], bgColor?: string) => {
    const bg = bgColor ?? bgColorRef.current; // miniatura musi uwzględniać tło strony
    setTimeout(() => {
      const url = makeThumbnail({ id: pageId, elements, bgColor: bg });
      setThumbnails(prev => ({ ...prev, [pageId]: url }));
    }, 0);
  }, []);

  const commitElements = useCallback((elements: NoteElement[], { thumbnail = true } = {}) => {
    elementsRef.current = elements;
    const pageId = currentIdRef.current;
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, elements } : p));
    if (thumbnail) triggerThumbnail(pageId, elements);
  }, [triggerThumbnail]);

  const pushUndo = useCallback((pageId: string, snapshot: NoteElement[]) => {
    const s = undoStacks.current[pageId] ?? [];
    s.push([...snapshot]);
    if (s.length > MAX_UNDO) s.shift();
    undoStacks.current[pageId] = s;
    redoStacks.current[pageId] = [];
    setHistoryVer(v => v + 1);
  }, []);

  // ── Pióro sterownika Onyx Boox ───────────────────────────────────────────
  //
  // Na ekranie E Ink kreska rysowana w kanwie HTML pojawia się z opóźnieniem
  // rzędu 150–300 ms — zdarzenie wskaźnika, obsługa w JS, złożenie WebView,
  // dopiero potem panel. Sterownik Onyksa maluje wprost na panelu (~30 ms),
  // ale w zamian **zabiera pióro WebView**: dopóki tryb surowy działa, ta
  // kanwa nie zobaczy ani jednego `pointerdown` ze stylusa i dostaje zamiast
  // tego gotowe pociągnięcie po jego oderwaniu.
  //
  // Poza czytnikami Onyksa `useBooxPen` nie robi nic i obowiązuje zwykła
  // ścieżka `onDown/extendStroke/onUp` niżej.

  /** Piksele CSS względem kanwy → współrzędne logiczne rysunku (z uwzględnieniem skali i przesunięcia). */
  const canvasToLogical = useCallback((cssX: number, cssY: number) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return { x: 0, y: 0 };
    // Ta sama droga, którą idzie `toLogical` dla zdarzeń wskaźnika: najpierw na
    // piksele bufora kanwy, potem przez powiększenie i przesunięcie widoku.
    const bx = cssX / r.width * c.width;
    const by = cssY / r.height * c.height;
    const z = zoomRef.current;
    const { x: px, y: py } = panPxRef.current;
    return {
      x: (bx - px) / z / (c.width / CANVAS_W),
      y: (by - py) / z / (c.height / CANVAS_H),
    };
  }, []);

  const handleNativeStroke = useCallback((points: CanvasPenPoint[], erase: boolean) => {
    if (!points.length) return;
    const local = points.map(p => {
      const l = canvasToLogical(p.x, p.y);
      return { x: l.x, y: l.y, p: p.pressure };
    });

    if (erase) {
      // Gumka używa `strokeHitTest`, czyli dokładnie tego, czym wymazuje palec
      // i mysz. Osobna miara „dotknięcia" dawałaby dwie różne gumki w jednym
      // narzędziu, zależnie od tego, czym się ją trzyma.
      const r = Math.max(brushRef.current * 3, 6);
      const next = elementsRef.current.filter(el =>
        el.kind !== 'stroke' || !local.some(pt => strokeHitTest(el, pt.x, pt.y, r)));
      if (next.length === elementsRef.current.length) return;
      pushUndo(currentIdRef.current, elementsRef.current);
      commitElements(next);
      redraw();
      return;
    }

    // Pojedynczy punkt to zwykle przypadkowe muśnięcie ekranu, a nie kreska.
    if (local.length < 2) return;
    const tool = toolRef.current === 'marker' ? 'marker' : 'pencil';
    const intensity = Math.max(0, Math.min(1, intensityRef.current / 100));
    const base = tool === 'marker' ? 0.4 : 1;
    const stroke: NoteStroke = {
      id: uid(), kind: 'stroke', tool,
      color: colorRef.current,
      width: brushRef.current,
      points: local,
      opacity: base * intensity,
      pressure: pressureRef.current,
      fill: fillRef.current,
    };
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements([...elementsRef.current, stroke]);
    redraw();
  }, [canvasToLogical, commitElements, pushUndo, redraw]);

  /**
   * Grubość kreski, jaką ma rysować sterownik — w pikselach CSS.
   *
   * Sterownik nic nie wie o powiększeniu ani o logicznym układzie kanwy, więc
   * dostaje szerokość mierzoną na ekranie. Jedna jednostka logiczna zajmuje
   * `szerokość_kanwy / CANVAS_W * zoom` pikseli CSS.
   */
  const nativeStrokeWidth = (() => {
    const r = canvasRef.current?.getBoundingClientRect();
    const scale = r && r.width > 0 ? r.width / CANVAS_W : 1;
    return Math.max(1, brushSize * scale * zoomPct / 100);
  })();

  // Stan powłoki liczony raz — urządzenie i wersja aplikacji nie zmieniają się
  // w trakcie działania strony.
  const penHost = useMemo(() => describeHost(), []);

  const pen = useBooxPen({
    target: canvasRef,
    // Tryb surowy tylko przy rysowaniu odręcznym. Przy zaznaczaniu, kształtach
    // czy przesuwaniu widoku sterownik musi oddać pióro stronie, bo inaczej
    // kreśliłby zamiast wykonywać narzędzie. Wysunięte podmenu też je oddaje —
    // leży nad kanwą własna warstwa przechwytująca kliknięcia.
    active: (tool === 'pencil' || tool === 'marker') && !textInput && !sidePanel,
    strokeWidth: nativeStrokeWidth,
    color,
    onStroke: handleNativeStroke,
  });

  const handleCut = useCallback(() => {
    if (!selectedIds.size) return;
    noteClipboard = elementsRef.current.filter(el => selectedIds.has(el.id));
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements(elementsRef.current.filter(el => !selectedIds.has(el.id)));
    setSelectedIds(new Set());
    setSelectedImgId(null);
  }, [selectedIds, commitElements, pushUndo]);

  const handleCopy = useCallback(() => {
    if (!selectedIds.size) return;
    noteClipboard = elementsRef.current.filter(el => selectedIds.has(el.id));
  }, [selectedIds]);

  const handlePaste = useCallback(() => {
    if (!noteClipboard.length) return;
    const off = 20 / (zoomRef.current || 1);
    const pasted: NoteElement[] = noteClipboard.map(el => ({ ...translateElement(el, off, off), id: uid() }));
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements([...elementsRef.current, ...pasted]);
    setSelectedIds(new Set(pasted.map(el => el.id)));
  }, [commitElements, pushUndo]);

  const updatePropEl = useCallback((patch: Partial<NoteStroke> | Partial<NoteText> | Partial<NoteImage> | Partial<NoteShape>) => {
    if (!propElId) return;
    const next = elementsRef.current.map(el => el.id === propElId ? { ...el, ...patch } as NoteElement : el);
    commitElements(next, { thumbnail: false });
    redraw();
  }, [propElId, commitElements, redraw]);

  // ── Akcje obiektu (lewy pasek): kopiuj / usuń / kolejność / link ─────────────
  /** Duplikuje zaznaczone elementy z przesunięciem; zaznacza kopie. */
  const handleDuplicate = useCallback(() => {
    const ids = selectedRef.current;
    const sel = elementsRef.current.filter(el => el.kind !== 'group' && ids.has(el.id));
    if (!sel.length) return;
    pushUndo(currentIdRef.current, elementsRef.current);
    const off = 24 / (zoomRef.current || 1);
    const copies = sel.map(el => ({ ...translateElement(el, off, off), id: uid(), groupId: undefined } as NoteElement));
    commitElements([...elementsRef.current, ...copies]);
    const nids = new Set(copies.map(c => c.id));
    setSelectedIds(nids); selectedRef.current = nids; selectedGroupRef.current = null;
  }, [commitElements, pushUndo]);

  /** Zmiana kolejności rysowania (z-order) zaznaczonych elementów. */
  const reorderSelected = useCallback((mode: 'front' | 'back' | 'up' | 'down') => {
    const ids = selectedRef.current;
    if (!ids.size) return;
    const els = [...elementsRef.current];
    const isSel = (el: NoteElement) => ids.has(el.id);
    pushUndo(currentIdRef.current, els);
    if (mode === 'front') {
      const sel = els.filter(isSel), rest = els.filter(el => !isSel(el));
      commitElements([...rest, ...sel]);
    } else if (mode === 'back') {
      const sel = els.filter(isSel), rest = els.filter(el => !isSel(el));
      commitElements([...sel, ...rest]);
    } else if (mode === 'up') {
      // przesuń każdy zaznaczony o 1 w stronę końca (na wierzch)
      for (let i = els.length - 2; i >= 0; i--) if (isSel(els[i]) && !isSel(els[i + 1])) { [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
      commitElements(els);
    } else {
      for (let i = 1; i < els.length; i++) if (isSel(els[i]) && !isSel(els[i - 1])) { [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
      commitElements(els);
    }
    redraw();
  }, [commitElements, pushUndo, redraw]);

  /** Ustawia/zmienia link na elemencie (pusty = usuwa). */
  const setElementLink = useCallback((id: string, url: string) => {
    const u = url.trim();
    commitElements(elementsRef.current.map(el =>
      el.id === id ? ({ ...el, link: u || undefined } as NoteElement) : el), { thumbnail: false });
    redraw();
  }, [commitElements, redraw]);

  /**
   * Kolor OBRYSU/pisaka: domyślny dla nowych + zastosuj do zaznaczonych obiektów.
   *
   * Obejmuje też **kolor pisma osadzonej etykiety**. Odkąd napis nie ma
   * własnego tła, jest jedyną rzeczą, która odpowiada za jego czytelność —
   * a użytkownik szuka jej tam, gdzie ustawia każdy inny kolor kreski.
   */
  const applyStrokeColor = useCallback((col: string) => {
    setColor(col);
    const ids = selectedRef.current;
    if (!ids.size) return;
    commitElements(elementsRef.current.map(el => {
      if (!ids.has(el.id)) return el;
      if (el.kind === 'stroke' || el.kind === 'shape') {
        // `labelColor` tylko tam, gdzie etykieta w ogóle jest — inaczej
        // dopisywalibyśmy pole do każdego kształtu bez tekstu.
        return (el.label ? { ...el, color: col, labelColor: col } : { ...el, color: col }) as NoteElement;
      }
      if (el.kind === 'text') return { ...el, color: col } as NoteElement;
      return el;
    }));
    redraw();
  }, [commitElements, redraw]);

  /** Pomocnik: nakłada patch na zaznaczone elementy spełniające `pred`. */
  const patchSelected = useCallback((pred: (el: NoteElement) => boolean, patch: (el: NoteElement) => NoteElement) => {
    const ids = selectedRef.current;
    if (!ids.size) return;
    commitElements(elementsRef.current.map(el => (ids.has(el.id) && pred(el)) ? patch(el) : el));
    redraw();
  }, [commitElements, redraw]);

  /** Szerokość kreski/obrysu: domyślna + na zaznaczonych (kreska/figura). */
  const applyWidth = useCallback((v: number) => {
    setBrushSize(v);
    patchSelected(el => el.kind === 'stroke' || el.kind === 'shape', el => ({ ...el, width: v } as NoteElement));
  }, [patchSelected]);

  /** Styl obrysu (linia/kreski/kropki): domyślny + na zaznaczonych figurach. */
  const applyStrokeStyle = useCallback((v: StrokeStyle) => {
    setStrokeStyle(v);
    patchSelected(el => el.kind === 'shape', el => ({ ...el, strokeStyle: v } as NoteElement));
  }, [patchSelected]);

  /** Niedbałość (styl rysowania): domyślna + na zaznaczonych figurach. */
  const applyRoughness = useCallback((v: Roughness) => {
    setRoughness(v);
    patchSelected(el => el.kind === 'shape', el => ({ ...el, roughness: v } as NoteElement));
  }, [patchSelected]);

  /** Krawędzie figury (ostre/zaokrąglone): domyślne + na zaznaczonych figurach. */
  const applyShapeRounded = useCallback((v: boolean) => {
    setShapeRounded(v);
    patchSelected(el => el.kind === 'shape', el => ({ ...el, rounded: v } as NoteElement));
  }, [patchSelected]);

  /** Groty strzałki: domyślne + na zaznaczonych strzałkach. */
  const applyArrowHeads = useCallback((v: ArrowHeads) => {
    setArrowHeads(v);
    patchSelected(el => el.kind === 'shape' && el.shape === 'arrow', el => ({ ...el, arrowHeads: v } as NoteElement));
  }, [patchSelected]);

  /** Typ strzałki (prosta/wygięta/łamana): domyślny + na zaznaczonych strzałkach. */
  const applyArrowType = useCallback((v: ArrowType) => {
    setArrowType(v);
    patchSelected(el => el.kind === 'shape' && el.shape === 'arrow', el => ({ ...el, arrowType: v } as NoteElement));
  }, [patchSelected]);

  /** Wzór wypełnienia: domyślny + na zaznaczonych figurach. */
  const applyFillPattern = useCallback((v: FillPattern) => {
    setFillPattern(v);
    patchSelected(el => el.kind === 'shape', el => ({ ...el, fill: v } as NoteElement));
  }, [patchSelected]);

  /** Nacisk: domyślny + na zaznaczonych kreskach. */
  const applyPressure = useCallback((lvl: 'low' | 'high') => {
    setPressureLevel(lvl);
    patchSelected(el => el.kind === 'stroke', el => ({ ...el, pressure: lvl } as NoteElement));
  }, [patchSelected]);

  /** Intensywność (krycie): domyślna + na zaznaczonych (marker zachowuje bazę 0.4). */
  const applyIntensity = useCallback((v: number) => {
    setIntensityPct(v);
    const k = Math.max(0, Math.min(1, v / 100));
    patchSelected(
      el => el.kind === 'stroke' || el.kind === 'shape',
      el => {
        const base = el.kind === 'stroke' && el.tool === 'marker' ? 0.4 : 1;
        return { ...el, opacity: base * k } as NoteElement;
      });
  }, [patchSelected]);

  /** Rozmiar tekstu: domyślny dla nowego + na zaznaczonym tekście / osadzonej etykiecie. */
  const applyTextSize = useCallback((v: number) => {
    setTextSize(v);
    patchSelected(
      el => el.kind === 'text' || ((el.kind === 'shape' || el.kind === 'stroke') && !!el.label),
      el => el.kind === 'text' ? ({ ...el, fontSize: v } as NoteElement) : ({ ...el, labelFontSize: v } as NoteElement));
  }, [patchSelected]);

  /** Wyrównanie tekstu: domyślne dla nowego + na zaznaczonym tekście / osadzonej etykiecie. */
  const applyTextAlign = useCallback((a: TextAlign) => {
    setTextAlign(a);
    patchSelected(
      el => el.kind === 'text' || ((el.kind === 'shape' || el.kind === 'stroke') && !!el.label),
      el => el.kind === 'text' ? ({ ...el, align: a } as NoteElement) : ({ ...el, labelAlign: a } as NoteElement));
  }, [patchSelected]);

  /** Krawędzie obrazka: ostre / zaokrąglone — tylko na zaznaczonych obrazkach. */
  const applyImageRounded = useCallback((rounded: boolean) => {
    patchSelected(el => el.kind === 'image', el => ({ ...el, rounded } as NoteElement));
  }, [patchSelected]);

  /** Krycie obrazka (0–100%) — na zaznaczonych obrazkach. */
  const applyImageOpacity = useCallback((v: number) => {
    setIntensityPct(v);
    const k = Math.max(0, Math.min(1, v / 100));
    patchSelected(el => el.kind === 'image', el => ({ ...el, opacity: k } as NoteElement));
  }, [patchSelected]);

  /** Kolor WYPEŁNIENIA obiektu: domyślny dla nowych figur + zastosuj do zaznaczonych.
   *  transparent = brak wypełnienia. Niepusty kolor włącza wypełnienie (solid, gdy brak wzoru). */
  const applyFillColor = useCallback((col: string) => {
    const transparent = col === TRANSPARENT;
    setFillColor(col);
    if (!transparent && fillRef.current === 'none') { setFillPattern('solid'); fillRef.current = 'solid'; }
    const ids = selectedRef.current;
    if (!ids.size) return;
    commitElements(elementsRef.current.map(el => {
      if (el.kind !== 'shape' || !ids.has(el.id)) return el;
      if (transparent) return { ...el, fillColor: undefined, fill: 'none' };
      const f = (!el.fill || el.fill === 'none') ? 'solid' : el.fill;
      return { ...el, fillColor: col, fill: f };
    }));
    redraw();
  }, [commitElements, redraw]);

  // ── Grupy ──────────────────────────────────────────────────────────────────
  /** Ids członków grupy (elementy z groupId === gid). */
  const groupMemberIds = useCallback((gid: string) =>
    elementsRef.current.filter(el => el.kind !== 'group' && el.groupId === gid).map(el => el.id), []);

  /** Tworzy grupę z bieżącego zaznaczenia (≥1 element, pomija inne grupy). */
  const handleGroupSelected = useCallback(() => {
    const ids = selectedRef.current;
    const members = elementsRef.current.filter(el => el.kind !== 'group' && ids.has(el.id));
    if (members.length < 1) return;
    pushUndo(currentIdRef.current, elementsRef.current);
    const gid = uid();
    const memberSet = new Set(members.map(m => m.id));
    // Środek ramki grupy = środek bbox członków (stały pivot obrotu).
    const wb = selectionBBoxOf(elementsRef.current, memberSet)!;
    const group: NoteGroup = {
      id: gid, kind: 'group',
      name: `Grupa ${elementsRef.current.filter(e => e.kind === 'group').length + 1}`,
      cx: wb.x + wb.w / 2, cy: wb.y + wb.h / 2, rotation: 0,
    };
    const next = elementsRef.current.map(el => memberSet.has(el.id) ? ({ ...el, groupId: gid } as NoteElement) : el);
    commitElements([group, ...next]);
    selectedGroupRef.current = gid; // od razu pokaż sztywną ramkę grupy
  }, [commitElements, pushUndo]);

  /** Rozgrupuj: usuwa grupę i czyści groupId członków. */
  const handleUngroup = useCallback((gid: string) => {
    pushUndo(currentIdRef.current, elementsRef.current);
    const next = elementsRef.current
      .filter(el => !(el.kind === 'group' && el.id === gid))
      .map(el => (el.kind !== 'group' && el.groupId === gid) ? ({ ...el, groupId: undefined } as NoteElement) : el);
    commitElements(next);
  }, [commitElements, pushUndo]);

  /** Przypisuje element do grupy (gid) lub wyjmuje (gid=null). Używane przez DnD. */
  const setElementGroup = useCallback((elId: string, gid: string | null) => {
    const el = elementsRef.current.find(e => e.id === elId);
    if (!el || el.kind === 'group') return;
    if ((el.groupId ?? null) === gid) return;
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements(elementsRef.current.map(e =>
      e.id === elId ? ({ ...e, groupId: gid ?? undefined } as NoteElement) : e));
  }, [commitElements, pushUndo]);

  /** Zaznacza wszystkich członków grupy + przełącza na narzędzie Zaznaczanie,
   *  żeby na kanwie pojawił się helper transformacji (przesuwanie/skala/obrót). */
  const selectGroup = useCallback((gid: string) => {
    const ids = new Set(groupMemberIds(gid));
    setTool('select'); toolRef.current = 'select';
    setSelectedIds(ids); selectedRef.current = ids;
    selectedGroupRef.current = gid;
    setSelectedImgId(null); setPropElId(null);
    redraw();
  }, [groupMemberIds, redraw]);

  /** Zmiana nazwy grupy. */
  const renameGroup = useCallback((gid: string, name: string) => {
    commitElements(elementsRef.current.map(el => el.kind === 'group' && el.id === gid ? { ...el, name } : el), { thumbnail: false });
  }, [commitElements]);

  // ── DOM pointer events ───────────────────────────────────────────────────────

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const toBufPx = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return { bx: 0, by: 0 };
      return {
        bx: (e.clientX - r.left) / r.width * c.width,
        by: (e.clientY - r.top) / r.height * c.height,
      };
    };

    const toLogical = (e: PointerEvent) => {
      const { bx, by } = toBufPx(e);
      const z = zoomRef.current;
      const { x: px, y: py } = panPxRef.current;
      return {
        x: (bx - px) / z / (c.width / CANVAS_W),
        y: (by - py) / z / (c.height / CANVAS_H),
      };
    };

    // ── Helpers shared across handlers ──────────────────────────────────────
    const toBufPxFromClient = (cx: number, cy: number) => {
      const r = c.getBoundingClientRect();
      // Guard: zero-size rect during layout → division by zero → NaN corrupts panPxRef
      if (!r.width || !r.height) return { bx: 0, by: 0 };
      return {
        bx: (cx - r.left) / r.width * c.width,
        by: (cy - r.top) / r.height * c.height,
      };
    };
    const toPxFromTracked = (pt: { cx: number; cy: number }) =>
      toBufPxFromClient(pt.cx, pt.cy);

    const startPinch = () => {
      const pts = [...activePointersRef.current.values()];
      const p0 = toPxFromTracked(pts[0]); const p1 = toPxFromTracked(pts[1]);
      const dist = Math.hypot(p1.bx - p0.bx, p1.by - p0.by);
      // Reject degenerate pinch: NaN (invalid coords) or < 20px (too close → Infinity zoom)
      if (!isFinite(dist) || dist < 20) return;
      pinchRef.current = {
        initDist: dist,
        initZoom: zoomRef.current,
        initPan: { ...panPxRef.current },
        initMidPx: { x: (p0.bx + p1.bx) / 2, y: (p0.by + p1.by) / 2 },
      };
      singleTouchPanRef.current = null;
    };

    // Anuluje rozpoczęte rysowanie (gdy pojedynczy dotyk zmienia się w gest 2-palcowy).
    const abortActiveDraw = () => {
      activeStrokeRef.current = null;
      activeShapeRef.current = null;
      lassoRef.current = [];
      eraserActiveRef.current = false;
      panDragRef.current = null;
      moveDragRef.current = null;
      marqueeRef.current = null;
    };

    const SHAPE_TOOLS = new Set<NoteTool>(['rect', 'diamond', 'circle', 'line', 'arrow']);
    const HIT_TOL = 8; // tolerancja trafienia w jednostkach logicznych (select)

    // Pinch/zoom dwoma palcami (wspólne dla move).
    const doPinchMove = () => {
      const p = pinchRef.current;
      if (!p) return;
      const { initDist, initZoom, initPan, initMidPx } = p;
      if (initDist < 20) return; // degenerate pinch — skip to avoid Infinity/NaN zoom
      const pts = [...activePointersRef.current.values()];
      if (pts.length < 2) return;
      const p0 = toPxFromTracked(pts[0]); const p1 = toPxFromTracked(pts[1]);
      const newDist = Math.hypot(p1.bx - p0.bx, p1.by - p0.by);
      const newMid  = { x: (p0.bx + p1.bx) / 2, y: (p0.by + p1.by) / 2 };
      const rawZoom = initZoom * newDist / initDist;
      if (!isFinite(rawZoom)) return; // safety: ignore NaN/Infinity
      const newZoom = Math.max(0.25, Math.min(8, rawZoom));
      const worldMidX = (initMidPx.x - initPan.x) / initZoom;
      const worldMidY = (initMidPx.y - initPan.y) / initZoom;
      zoomRef.current = newZoom;
      panPxRef.current = { x: newMid.x - worldMidX * newZoom, y: newMid.y - worldMidY * newZoom };
      setZoomPct(Math.round(newZoom * 100));
      redraw();
    };

    // Znajduje najwyższy (ostatnio narysowany) element trafiony w (x,y).
    const topHit = (x: number, y: number): NoteElement | null => {
      const els = elementsRef.current;
      for (let i = els.length - 1; i >= 0; i--) if (hitElement(els[i], x, y, HIT_TOL)) return els[i];
      return null;
    };

    // ── Begin: dyspozytor wg narzędzia ───────────────────────────────────────
    const beginStroke = (e: PointerEvent) => {
      const t = toolRef.current;
      if (t === 'lock') return;                         // blokada — nic nie rób
      if (t === 'text') return;                         // obsługiwane przez React click

      try { c.setPointerCapture(e.pointerId); } catch { /* touch może odmówić — ignoruj */ }
      const { x, y } = toLogical(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      dbg(`DRAW_DN tool=${t} id=${e.pointerId} type=${e.pointerType}`);

      // Pan — przeciąganie widoku.
      if (t === 'pan') {
        panDragRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...panPxRef.current } };
        return;
      }

      // Select — zaznacz/przesuń istniejące elementy.
      if (t === 'select') {
        // ── Tryb edycji punktów linii/strzałki ──────────────────────────────
        const editId = editPointsRef.current;
        if (editId) {
          const el = elementsRef.current.find(e2 => e2.id === editId);
          if (el && el.kind === 'shape' && LINEAR_SHAPES.has(el.shape)) {
            const rect0 = c.getBoundingClientRect();
            const zz0 = zoomRef.current || 1;
            const tol = GZ_HIT_CSS * CANVAS_W / ((rect0.width || 1) * zz0);
            const pts = shapePts(el);
            // Podwójny tap na wierzchołku (gdy >2) → usuń wierzchołek.
            const nowT = Date.now();
            const dbl = !!lastTapRef.current && (nowT - lastTapRef.current.t) < 320
              && Math.hypot(x - lastTapRef.current.x, y - lastTapRef.current.y) < tol * 2.5;
            lastTapRef.current = { t: nowT, x, y };
            // Trafienie w wierzchołek → usuń (dbl) lub przeciągaj.
            for (let i = 0; i < pts.length; i++) {
              if (Math.hypot(x - pts[i].x, y - pts[i].y) <= tol) {
                if (dbl && pts.length > 2) {
                  pushUndo(currentIdRef.current, elementsRef.current);
                  const newPts = pts.filter((_, j) => j !== i);
                  commitElements(elementsRef.current.map(e2 => e2.id === editId && e2.kind === 'shape' ? setShapePts(e2, newPts) : e2));
                  redraw();
                  return;
                }
                pushUndo(currentIdRef.current, elementsRef.current);
                pointDragRef.current = { id: editId, index: i };
                return;
              }
            }
            // Trafienie w środek segmentu → wstaw nowy wierzchołek i przeciągaj go.
            for (let i = 0; i < pts.length - 1; i++) {
              const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
              if (Math.hypot(x - mx, y - my) <= tol) {
                pushUndo(currentIdRef.current, elementsRef.current);
                const newPts = [...pts.slice(0, i + 1), { x: mx, y: my }, ...pts.slice(i + 1)];
                elementsRef.current = elementsRef.current.map(e2 => e2.id === editId && e2.kind === 'shape' ? setShapePts(e2, newPts) : e2);
                pointDragRef.current = { id: editId, index: i + 1 };
                redraw();
                return;
              }
            }
            // Klik poza uchwytami → wyjdź z trybu edycji punktów i kontynuuj normalnie.
            setEditPointsId(null); editPointsRef.current = null;
          } else {
            setEditPointsId(null); editPointsRef.current = null;
          }
        }
        // Aktywna grupa (sztywna ramka) — jeśli zaznaczona przez Scene/klik.
        const grp = selectedGroupRef.current
          ? (elementsRef.current.find(el => el.kind === 'group' && el.id === selectedGroupRef.current) as NoteGroup | undefined) ?? null
          : null;
        const grpId = grp ? grp.id : undefined;
        const rect0 = c.getBoundingClientRect();
        const zz0 = zoomRef.current || 1;
        const clickTol = GZ_HIT_CSS * CANVAS_W / ((rect0.width || 1) * zz0);
        // Wykryj podwójny tap (drill-in do pojedynczego obiektu w grupie).
        const nowT = Date.now();
        const isDouble = !!lastTapRef.current && (nowT - lastTapRef.current.t) < 320
          && Math.hypot(x - lastTapRef.current.x, y - lastTapRef.current.y) < clickTol * 2.5;
        lastTapRef.current = { t: nowT, x, y };

        // Podwójny tap na elemencie aktywnej grupy → wybierz POJEDYNCZY obiekt.
        if (isDouble && grpId) {
          const m = topHit(x, y);
          if (m && m.kind !== 'group' && m.groupId === grpId) {
            const ids = new Set([m.id]);
            setSelectedIds(ids); selectedRef.current = ids;
            selectedGroupRef.current = null; // wyjdź z grupy → edytujesz jeden obiekt
            setSelectedImgId(m.kind === 'image' ? m.id : null);
            setPropElId(m.id);
            moveDragRef.current = { lastX: x, lastY: y, ids, moved: false };
            return;
          }
        }

        // Mobilny double-tap (dotyk/pióro) → aktywacja edycji etykiety / punktów linii.
        // Na desktopie robi to natywny onDoubleClick, więc tu tylko dla nie-myszy.
        if (isDouble && e.pointerType !== 'mouse' && activateEditRef.current(x, y)) return;

        // Najpierw gizmo: uchwyt przesuwania (środek) / obrotu / skali (narożniki).
        const gz = isDouble ? null : computeGizmo(elementsRef.current, selectedRef.current, grp);
        if (gz) {
          const { bb, angle, cx: gcx, cy: gcy } = gz;
          const tol = clickTol;
          const offY = GZ_ROT_OFF_CSS * CANVAS_H / ((rect0.height || 1) * zz0);
          const snapshot = () => {
            const m = new Map<string, NoteElement>();
            for (const el of elementsRef.current) if (selectedRef.current.has(el.id)) m.set(el.id, el);
            return m;
          };
          // Środek (świat) — uchwyt PRZESUWANIA.
          const ctrW = rotatePt(gcx, gcy, gcx, gcy, angle); // = (gcx,gcy)
          if (Math.hypot(x - ctrW.x, y - ctrW.y) <= tol * 1.3) {
            moveDragRef.current = { lastX: x, lastY: y, ids: new Set(selectedRef.current), moved: false };
            return;
          }
          // Narożniki LOKALNE + ich pozycje w świecie (obrócone o kąt gizma).
          const localCorners = [
            { hx: bb.x, hy: bb.y, ox: bb.x + bb.w, oy: bb.y + bb.h },
            { hx: bb.x + bb.w, hy: bb.y, ox: bb.x, oy: bb.y + bb.h },
            { hx: bb.x + bb.w, hy: bb.y + bb.h, ox: bb.x, oy: bb.y },
            { hx: bb.x, hy: bb.y + bb.h, ox: bb.x + bb.w, oy: bb.y },
          ];
          // Uchwyt obrotu: lokalnie nad górną krawędzią, obrócony do świata.
          const rotW = rotatePt(gcx, bb.y - offY, gcx, gcy, angle);
          if (Math.hypot(x - rotW.x, y - rotW.y) <= tol) {
            pushUndo(currentIdRef.current, elementsRef.current);
            transformRef.current = { mode: 'rotate', ox: 0, oy: 0, cx: gcx, cy: gcy, startX: x, startY: y, startAngle: Math.atan2(y - gcy, x - gcx), angle, groupId: grpId, startGroupRot: grp?.rotation || 0, snapshot: snapshot() };
            return;
          }
          for (const cn of localCorners) {
            const w = rotatePt(cn.hx, cn.hy, gcx, gcy, angle);
            if (Math.hypot(x - w.x, y - w.y) <= tol) {
              pushUndo(currentIdRef.current, elementsRef.current);
              // ox/oy/startX/startY w układzie LOKALNYM (skala w ramce gizma).
              transformRef.current = { mode: 'scale', ox: cn.ox, oy: cn.oy, cx: gcx, cy: gcy, startX: cn.hx, startY: cn.hy, startAngle: 0, angle, groupId: grpId, startGroupRot: grp?.rotation || 0, snapshot: snapshot() };
              return;
            }
          }
          // Kliknięcie WEWNĄTRZ ramki → przesuwanie całego zaznaczenia (cała ramka = uchwyt).
          const pl = rotatePt(x, y, gcx, gcy, -angle);
          if (pl.x >= bb.x - tol && pl.x <= bb.x + bb.w + tol && pl.y >= bb.y - tol && pl.y <= bb.y + bb.h + tol) {
            moveDragRef.current = { lastX: x, lastY: y, ids: new Set(selectedRef.current), moved: false };
            return;
          }
        }
        const hit = topHit(x, y);
        if (hit) {
          // Klik w element należący do grupy → zaznacz CAŁĄ grupę (przesuwa się razem).
          const gid = hit.kind !== 'group' ? hit.groupId : undefined;
          const groupIds = gid
            ? elementsRef.current.filter(el => el.kind !== 'group' && el.groupId === gid).map(el => el.id)
            : null;
          const already = selectedRef.current.has(hit.id);
          const ids = groupIds ? new Set(groupIds)
            : already ? new Set(selectedRef.current) : new Set([hit.id]);
          if (!already || groupIds) { setSelectedIds(ids); selectedRef.current = ids; }
          selectedGroupRef.current = gid ?? null; // klik w grupę → aktywna grupa; inaczej brak
          setSelectedImgId(!groupIds && hit.kind === 'image' ? hit.id : null);
          moveDragRef.current = { lastX: x, lastY: y, ids, moved: false };
        } else {
          setSelectedIds(new Set()); selectedRef.current = new Set(); setSelectedImgId(null);
          selectedGroupRef.current = null;
          marqueeRef.current = { x1: x, y1: y, x2: x, y2: y };
        }
        return;
      }

      // Lasso — zaznaczanie obszarem odręcznym.
      if (t === 'lasso') {
        setSelectedIds(new Set()); selectedRef.current = new Set();
        selectedGroupRef.current = null;
        lassoRef.current = [{ x, y, p: 1 }];
        return;
      }

      // Eraser.
      if (t === 'eraser') {
        eraserActiveRef.current = true;
        const r2 = brushRef.current * 3;
        const next = elementsRef.current.filter(el =>
          el.kind !== 'stroke' || !strokeHitTest(el, x, y, r2)
        );
        if (next.length !== elementsRef.current.length) {
          pushUndo(currentIdRef.current, elementsRef.current);
          commitElements(next);
          redraw();
        }
        return;
      }

      // Intensywność 0–1 (100% = max). Mnożona przez bazowe krycie narzędzia,
      // więc marker zachowuje swoją naturę (0.4) przy 100%, a pełną kreskę
      // dostajemy przy 100% dla pióra/kształtów.
      const intensity = Math.max(0, Math.min(1, intensityRef.current / 100));

      // Kształty: rect / diamond / circle / line.
      if (SHAPE_TOOLS.has(t)) {
        const fc = fillColorRef.current;
        activeShapeRef.current = {
          id: uid(), kind: 'shape', shape: t as ShapeKind,
          x1: x, y1: y, x2: x, y2: y,
          color: colorRef.current, width: brushRef.current,
          opacity: intensity,
          fill: fc === TRANSPARENT ? 'none' : (fillRef.current === 'none' ? 'solid' : fillRef.current),
          fillColor: fc === TRANSPARENT ? undefined : fc,
          strokeStyle: strokeStyleRef.current,
          roughness: roughnessRef.current,
          rounded: shapeRoundedRef.current,
          ...(t === 'arrow' ? { arrowHeads: arrowHeadsRef.current, arrowType: arrowTypeRef.current } : {}),
        };
        return;
      }

      // Pióro / marker.
      const base = t === 'marker' ? 0.4 : 1;
      activeStrokeRef.current = {
        id: uid(), kind: 'stroke',
        tool: t as 'pencil' | 'marker',
        color: colorRef.current,
        width: brushRef.current,
        points: [{ x, y, p: pressure }],
        opacity: base * intensity,
        pressure: pressureRef.current,
        fill: fillRef.current,
      };
    };

    // ── Move (extend) ────────────────────────────────────────────────────────
    const extendStroke = (e: PointerEvent) => {
      const t = toolRef.current;

      // Pan — aktualizuj przesunięcie widoku.
      if (t === 'pan' && panDragRef.current) {
        const r = c.getBoundingClientRect();
        if (r.width && r.height) {
          const dx = (e.clientX - panDragRef.current.startX) / r.width * c.width;
          const dy = (e.clientY - panDragRef.current.startY) / r.height * c.height;
          const nx = panDragRef.current.startPan.x + dx;
          const ny = panDragRef.current.startPan.y + dy;
          if (isFinite(nx) && isFinite(ny)) { panPxRef.current = { x: nx, y: ny }; redraw(); }
        }
        return;
      }

      if (!e.buttons && t !== 'pan') return;
      const { x, y } = toLogical(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;

      // Select — transformacja (gizmo), przesuwanie lub zaznaczanie prostokątem.
      if (t === 'select') {
        // Edycja punktów: przeciąganie wierzchołka.
        if (pointDragRef.current) {
          const { id, index } = pointDragRef.current;
          elementsRef.current = elementsRef.current.map(el => {
            if (el.id !== id || el.kind !== 'shape') return el;
            return setShapePts(el, shapePts(el).map((p, i) => i === index ? { x, y } : p));
          });
          redraw();
          return;
        }
        const tr = transformRef.current;
        if (tr) {
          if (tr.mode === 'scale') {
            // Przelicz wskaźnik do układu LOKALNego gizma (odwrotny obrót wokół środka),
            // by skalowanie szło wzdłuż osi (obróconej) ramki.
            const pl = rotatePt(x, y, tr.cx, tr.cy, -tr.angle);
            let sxf = (pl.x - tr.ox) / (tr.startX - tr.ox || 1e-3);
            let syf = (pl.y - tr.oy) / (tr.startY - tr.oy || 1e-3);
            if (!isFinite(sxf)) sxf = 1;
            if (!isFinite(syf)) syf = 1;
            if (Math.abs(sxf) < 0.05) sxf = sxf < 0 ? -0.05 : 0.05;
            if (Math.abs(syf) < 0.05) syf = syf < 0 ? -0.05 : 0.05;
            elementsRef.current = elementsRef.current.map(el =>
              tr.snapshot.has(el.id) ? scaleElement(tr.snapshot.get(el.id)!, sxf, syf, tr.ox, tr.oy) : el);
          } else {
            const delta = Math.atan2(y - tr.cy, x - tr.cx) - tr.startAngle;
            elementsRef.current = elementsRef.current.map(el =>
              tr.snapshot.has(el.id) ? rotateElement(tr.snapshot.get(el.id)!, delta, tr.cx, tr.cy) : el);
            // Grupa: zapisz kąt (środek bez zmian → sztywny obrót wokół środka).
            if (tr.groupId) {
              elementsRef.current = elementsRef.current.map(el =>
                el.kind === 'group' && el.id === tr.groupId ? { ...el, rotation: (tr.startGroupRot || 0) + delta } : el);
            }
          }
          elementsRef.current = applyArrowBindings(elementsRef.current); // związane strzałki podążają
          redraw();
          return;
        }
        const md = moveDragRef.current;
        if (md) {
          const dx = x - md.lastX, dy = y - md.lastY;
          if (dx !== 0 || dy !== 0) {
            if (!md.moved) { pushUndo(currentIdRef.current, elementsRef.current); md.moved = true; }
            const gid2 = selectedGroupRef.current;
            elementsRef.current = elementsRef.current.map(el => {
              if (md.ids.has(el.id)) return translateElement(el, dx, dy);
              // Przesuń też środek grupy, by kolejny obrót pivotował poprawnie.
              if (gid2 && el.kind === 'group' && el.id === gid2 && el.cx != null && el.cy != null)
                return { ...el, cx: el.cx + dx, cy: el.cy + dy };
              return el;
            });
            md.lastX = x; md.lastY = y;
            elementsRef.current = applyArrowBindings(elementsRef.current); // związane strzałki podążają
            redraw();
          }
          return;
        }
        if (marqueeRef.current) { marqueeRef.current.x2 = x; marqueeRef.current.y2 = y; redraw(); }
        return;
      }

      if (t === 'lasso') {
        lassoRef.current = [...lassoRef.current, { x, y, p: 1 }];
        redraw();
        return;
      }

      if (t === 'eraser' && eraserActiveRef.current) {
        const r2 = brushRef.current * 3;
        const next = elementsRef.current.filter(el =>
          el.kind !== 'stroke' || !strokeHitTest(el, x, y, r2)
        );
        if (next.length !== elementsRef.current.length) {
          commitElements(next);
          redraw();
        }
        return;
      }

      // Kształt — aktualizuj drugi narożnik (podgląd).
      if (activeShapeRef.current) {
        activeShapeRef.current.x2 = x; activeShapeRef.current.y2 = y;
        redraw();
        return;
      }

      if (!activeStrokeRef.current) return;
      const pts = activeStrokeRef.current.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 0.8) {
        pts.push({ x, y, p: pressure });
        redraw();
      }
    };

    // ── End (up) ──────────────────────────────────────────────────────────────
    const endStroke = (e: PointerEvent) => {
      eraserActiveRef.current = false;
      const t = toolRef.current;

      if (t === 'pan') { panDragRef.current = null; return; }

      // Select — zakończ transformację / przesuwanie / zaznaczanie prostokątem.
      if (t === 'select') {
        if (pointDragRef.current) {
          // Edycja punktów strzałki: jeśli przeciągnięto koniec/początek na figurę → zwiąż; poza figurą → odwiąż.
          const { id, index } = pointDragRef.current;
          let els = elementsRef.current;
          const arr = els.find(e => e.id === id);
          if (arr && arr.kind === 'shape' && arr.shape === 'arrow') {
            const pts = shapePts(arr);
            const isStart = index === 0, isEnd = index === pts.length - 1;
            if (isStart || isEnd) {
              const v = pts[index];
              const b = bindTargetAt(els, v.x, v.y, id);
              els = els.map(e => e.id === id && e.kind === 'shape'
                ? { ...e, ...(isStart ? { startBinding: b } : {}), ...(isEnd ? { endBinding: b } : {}) } as NoteElement
                : e);
              elementsRef.current = els;
            }
          }
          commitElements(applyArrowBindings(els));
          pointDragRef.current = null; return;
        }
        if (transformRef.current) {
          const tr = transformRef.current;
          // Po SKALI grupy przelicz środek ramki na nowy środek geometryczny
          // (aby kolejny obrót pivotował poprawnie). Obrót/move nie zmieniają tu środka.
          if (tr.groupId && tr.mode === 'scale') {
            const gid = tr.groupId;
            const g = elementsRef.current.find(el => el.kind === 'group' && el.id === gid) as NoteGroup | undefined;
            const gz2 = g ? computeGizmo(elementsRef.current, selectedRef.current, g) : null;
            if (g && gz2) {
              const ncx = rotatePt(gz2.bb.x + gz2.bb.w / 2, gz2.bb.y + gz2.bb.h / 2, gz2.cx, gz2.cy, gz2.angle);
              elementsRef.current = elementsRef.current.map(el =>
                el.kind === 'group' && el.id === gid ? { ...el, cx: ncx.x, cy: ncx.y } : el);
            }
          }
          commitElements(applyArrowBindings(elementsRef.current));
          transformRef.current = null;
          redraw();
          return;
        }
        if (moveDragRef.current) {
          if (moveDragRef.current.moved) commitElements(applyArrowBindings(elementsRef.current));
          moveDragRef.current = null;
          return;
        }
        if (marqueeRef.current) {
          const m = marqueeRef.current;
          const box = { x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) };
          const sel = new Set<string>();
          if (box.w > 2 || box.h > 2) {
            for (const el of elementsRef.current) if (bboxIntersects(elementBBox(el), box)) sel.add(el.id);
          }
          setSelectedIds(sel); selectedRef.current = sel;
          marqueeRef.current = null;
          redraw();
        }
        return;
      }

      if (t === 'lasso') {
        const lasso = lassoRef.current;
        if (lasso.length > 3) {
          const sel = new Set<string>();
          for (const el of elementsRef.current) {
            if (el.kind === 'stroke' && strokeInLasso(el, lasso)) sel.add(el.id);
            else if (el.kind !== 'stroke') {
              const b = elementBBox(el);
              if (pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, lasso)) sel.add(el.id);
            }
          }
          setSelectedIds(sel);
          selectedRef.current = sel;
        }
        lassoRef.current = [];
        redraw();
        return;
      }

      // Kształt — commit jeśli ma sensowny rozmiar.
      if (activeShapeRef.current) {
        const s = activeShapeRef.current;
        const big = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 3;
        if (big) {
          // Strzałka: jeśli koniec/początek leży na figurze — zapamiętaj wiązanie (pozycja względna).
          if (s.shape === 'arrow') {
            const sb = bindTargetAt(elementsRef.current, s.x1, s.y1, s.id);
            const eb = bindTargetAt(elementsRef.current, s.x2, s.y2, s.id);
            if (sb) s.startBinding = sb;
            if (eb) s.endBinding = eb;
          }
          pushUndo(currentIdRef.current, elementsRef.current);
          commitElements([...elementsRef.current, s]);
        }
        activeShapeRef.current = null;
        redraw();
        return;
      }

      if (!activeStrokeRef.current) return;
      const stroke = activeStrokeRef.current;
      const { x, y } = toLogical(e);
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 0.8)
        stroke.points.push({ x, y, p: e.pressure > 0 ? e.pressure : 0.5 });

      const committed = stroke.points.length >= 2;
      if (committed) {
        pushUndo(currentIdRef.current, elementsRef.current);
        commitElements([...elementsRef.current, stroke]);
      }
      activeStrokeRef.current = null;
      redraw();
    };

    // ── Dyspozytory zdarzeń: pen/mouse → rysowanie; dotyk: 1 palec rysuje,
    //    2 palce = pinch/zoom (anuluje rozpoczętą kreskę) ──────────────────────
    const onDown = (e: PointerEvent) => {
      // Tryb pipety: nie rysuj — próbkowanie koloru obsługuje handleCanvasClick.
      if (eyedropperRef.current) return;
      if (e.pointerType === 'touch') {
        activePointersRef.current.set(e.pointerId, { cx: e.clientX, cy: e.clientY });
        dbg(`TOUCH_DN id=${e.pointerId} n=${activePointersRef.current.size}`);
        if (activePointersRef.current.size >= 2) {
          // Drugi palec → gest: porzuć rozpoczętą kreskę i zacznij pinch.
          touchGestureRef.current = true;
          abortActiveDraw();
          startPinch();
          redraw();
          return;
        }
        // Pierwszy palec → rysowanie aktywnym narzędziem.
        touchGestureRef.current = false;
        beginStroke(e);
        return;
      }
      beginStroke(e);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (activePointersRef.current.has(e.pointerId))
          activePointersRef.current.set(e.pointerId, { cx: e.clientX, cy: e.clientY });
        if (touchGestureRef.current || activePointersRef.current.size >= 2) {
          doPinchMove();
          return;
        }
        extendStroke(e);
        return;
      }
      extendStroke(e);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const wasGesture = touchGestureRef.current;
        activePointersRef.current.delete(e.pointerId);
        dbg(`TOUCH_UP id=${e.pointerId} remaining=${activePointersRef.current.size} gesture=${wasGesture}`);
        if (activePointersRef.current.size < 2) pinchRef.current = null;
        if (activePointersRef.current.size === 0) {
          touchGestureRef.current = false;
          singleTouchPanRef.current = null;
          if (wasGesture) { abortActiveDraw(); return; } // gest się zakończył — nie commituj kreski
        }
        if (wasGesture) return; // wciąż palce na ekranie po pinchu — nie rysuj
        endStroke(e);
        return;
      }
      endStroke(e);
    };

    const onCancel = (e: PointerEvent) => {
      dbg(`CANCEL type=${e.pointerType} id=${e.pointerId} activeStroke=${activeStrokeRef.current?.points.length ?? 'null'}`);
      if (e.pointerType === 'touch') {
        activePointersRef.current.delete(e.pointerId);
        if (activePointersRef.current.size < 2) pinchRef.current = null;
        if (activePointersRef.current.size === 0) touchGestureRef.current = false;
      }
      // Cancel: commit partial stroke if long enough (dotyczy też dotyku rysującego)
      eraserActiveRef.current = false;
      lassoRef.current = [];
      if (activeStrokeRef.current && activeStrokeRef.current.points.length >= 2) {
        pushUndo(currentIdRef.current, elementsRef.current);
        commitElements([...elementsRef.current, activeStrokeRef.current]);
      }
      activeStrokeRef.current = null;
      redraw();
    };

    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onCancel);
    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onCancel);
    };
  }, [commitElements, pushUndo, redraw]);

  // ── Text tool ────────────────────────────────────────────────────────────────

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Pipeta: pobierz kolor piksela z kanwy (buffer) i ustaw fg/bg.
    if (eyedropperRef.current) {
      const target = eyedropperRef.current;
      const cv = e.currentTarget;
      const r = cv.getBoundingClientRect();
      const bx = Math.round((e.clientX - r.left) / r.width * cv.width);
      const by = Math.round((e.clientY - r.top) / r.height * cv.height);
      try {
        const ctx = cv.getContext('2d');
        const d = ctx?.getImageData(bx, by, 1, 1).data;
        if (d) {
          const hex = rgbToHex(d[0], d[1], d[2]);
          if (target === 'fg') applyStrokeColor(hex); else applyFillColor(hex);
        }
      } catch { /* getImageData może rzucić przy tainted canvas — ignoruj */ }
      setEyedropper(null);
      return;
    }
    if (toolRef.current !== 'text') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * CANVAS_W;
    const y = (e.clientY - r.top) / r.height * CANVAS_H;
    setTextInput({ x, y, val: '' });
  };

  const commitText = useCallback((text: string, x: number, y: number, targetId?: string) => {
    setTextInput(null);
    // Edycja osadzonej etykiety istniejącego obiektu (rect/romb/okrąg/strzałka/pióro/marker).
    if (targetId) {
      pushUndo(currentIdRef.current, elementsRef.current);
      commitElements(elementsRef.current.map(el => {
        if (el.id !== targetId || (el.kind !== 'shape' && el.kind !== 'stroke')) return el;
        const t = text.trim();
        return { ...el, label: t || undefined, labelFontSize: textSizeRef.current, labelAlign: textAlignRef.current, labelColor: colorRef.current } as NoteElement;
      }));
      redraw();
      return;
    }
    if (!text.trim()) return;
    const el: NoteText = { id: uid(), kind: 'text', x, y, text, fontSize: textSizeRef.current, color: colorRef.current, align: textAlignRef.current };
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements([...elementsRef.current, el]);
  }, [commitElements, pushUndo, redraw]);

  // Double-click na obiekcie (rect/romb/okrąg/strzałka/pióro/marker) → edycja osadzonej etykiety.
  /** Aktywuje edycję (etykieta / punkty linii) dla obiektu pod punktem logicznym (x,y).
   *  Wspólne dla desktopowego double-click i mobilnego double-tap. Zwraca true gdy coś aktywowano. */
  const activateEditAt = useCallback((x: number, y: number): boolean => {
    if (editPointsRef.current) return false; // w trybie edycji punktów aktywacja nie dotyczy
    const rw = canvasRef.current?.getBoundingClientRect().width || 1;
    const tol = GZ_HIT_CSS * CANVAS_W / (rw * (zoomRef.current || 1));
    const els = elementsRef.current;
    let target: (NoteShape | NoteStroke) | null = null;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.kind !== 'shape' && el.kind !== 'stroke') continue;
      const hit = (el.kind === 'shape' && !LINEAR_SHAPES.has(el.shape))
        ? (() => { const bb = shapeBBox(el); return x >= bb.x - tol && x <= bb.x + bb.w + tol && y >= bb.y - tol && y <= bb.y + bb.h + tol; })()
        : hitElement(el, x, y, Math.max(tol, 10));
      if (hit) { target = el; break; }
    }
    if (!target) return false;
    const ids = new Set([target.id]); setSelectedIds(ids); selectedRef.current = ids;
    selectedGroupRef.current = null;
    // Tylko LINIA → automatycznie tryb edycji punktów. Strzałka → edycja tekstu (niżej).
    if (target.kind === 'shape' && target.shape === 'line') {
      setSelectedImgId(null);
      setEditPointsId(target.id); editPointsRef.current = target.id;
      redraw();
      return true;
    }
    // Pozostałe (rect/romb/okrąg/strzałka/pióro/marker) → edycja osadzonej etykiety.
    const b = elementBBox(target);
    setTextSize(target.labelFontSize ?? 20);
    setTextAlign(target.labelAlign ?? 'center');
    setSidePanel('text');
    setTextInput({ x: b.x + b.w / 2, y: b.y + b.h / 2, val: target.label ?? '', targetId: target.id });
    return true;
  }, [redraw]);

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolRef.current !== 'select') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * CANVAS_W;
    const y = (e.clientY - r.top) / r.height * CANVAS_H;
    activateEditAt(x, y);
  };
  // Stabilny uchwyt dla obsługi wskaźnika (mobilny double-tap) — bez nieaktualnego domknięcia.
  const activateEditRef = useRef(activateEditAt);
  activateEditRef.current = activateEditAt;

  // ── Undo / Redo ──────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const pageId = currentIdRef.current;
    const stack = undoStacks.current[pageId];
    if (!stack?.length) return;
    const snapshot = stack.pop()!;
    const rstack = redoStacks.current[pageId] ?? [];
    rstack.push([...elementsRef.current]);
    redoStacks.current[pageId] = rstack;
    commitElements(snapshot);
    setHistoryVer(v => v + 1);
  }, [commitElements]);

  const handleRedo = useCallback(() => {
    const pageId = currentIdRef.current;
    const rstack = redoStacks.current[pageId];
    if (!rstack?.length) return;
    const snapshot = rstack.pop()!;
    const ustack = undoStacks.current[pageId] ?? [];
    ustack.push([...elementsRef.current]);
    undoStacks.current[pageId] = ustack;
    commitElements(snapshot);
    setHistoryVer(v => v + 1);
  }, [commitElements]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault(); handleRedo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedRef.current.size > 0 && !(document.activeElement instanceof HTMLInputElement)) {
          e.preventDefault(); handleDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleUndo, handleRedo]);

  // ── Delete selected ──────────────────────────────────────────────────────────

  const handleDeleteSelected = useCallback(() => {
    const sel = selectedRef.current;
    if (!sel.size) return;
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements(elementsRef.current.filter(el => !sel.has(el.id)));
    setSelectedIds(new Set());
  }, [commitElements, pushUndo]);

  // ── Page management ──────────────────────────────────────────────────────────

  const addPage = useCallback(() => {
    const p = newPage();
    setPages(prev => [...prev, p]);
    setCurrentPageId(p.id);
    setSelectedIds(new Set());
    setThumbnails(prev => ({ ...prev, [p.id]: makeThumbnail(p) }));
  }, []);

  const removePage = useCallback((id: string) => {
    setPages(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(p => p.id === id);
      const next = prev.filter(p => p.id !== id);
      if (id === currentIdRef.current) {
        const nid = next[Math.min(idx, next.length - 1)].id;
        setCurrentPageId(nid);
      }
      return next;
    });
    setThumbnails(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const switchPage = useCallback((id: string) => {
    activeStrokeRef.current = null;
    lassoRef.current = [];
    setSelectedIds(new Set());
    setCurrentPageId(id);
  }, []);

  const insertImage = useCallback((src: string, nw: number, nh: number) => {
    const maxW = CANVAS_W * 0.55;
    const maxH = CANVAS_H * 0.55;
    const scale = Math.min(maxW / nw, maxH / nh, 1);
    const w = nw * scale;
    const h = nh * scale;
    const x = (CANVAS_W - w) / 2;
    const y = (CANVAS_H - h) / 2;
    const el: NoteImage = { id: uid(), kind: 'image', x, y, w, h, src };
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements([...elementsRef.current, el]);
    setSelectedImgId(el.id);
  }, [commitElements, pushUndo]);

  const handleFileChosen = useCallback((file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        // Pre-warm cache with already-loaded image so renderElements draws it immediately
        imgCache.set(src, img);
        insertImage(src, img.naturalWidth, img.naturalHeight);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [insertImage]);

  const setPageBgColor = useCallback((bgColor: string) => {
    bgColorRef.current = bgColor;
    // Pisak zmieniamy tylko wtedy, gdy zniknąłby na nowym tle — czerwony na
    // białym zostaje czerwony (patrz `needsInkSwitch`).
    if (needsInkSwitch(colorRef.current, bgColor)) {
      const ink = defaultInkFor(bgColor);
      colorRef.current = ink;
      setColor(ink);
    }
    const pageId = currentIdRef.current;
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, bgColor } : p));
    triggerThumbnail(pageId, elementsRef.current, bgColor); // odśwież miniaturę z nowym tłem
    requestAnimationFrame(() => redraw());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyZoom = useCallback((newZoom: number, centerBufX?: number, centerBufY?: number) => {
    const c = canvasRef.current;
    const clamped = Math.max(0.25, Math.min(8, newZoom));
    if (centerBufX !== undefined && centerBufY !== undefined) {
      // Zoom toward given point
      const oldZ = zoomRef.current;
      const { x: px, y: py } = panPxRef.current;
      const worldX = (centerBufX - px) / oldZ;
      const worldY = (centerBufY - py) / oldZ;
      panPxRef.current = { x: centerBufX - worldX * clamped, y: centerBufY - worldY * clamped };
    } else if (c) {
      // Zoom toward canvas center
      const cx = c.width / 2; const cy = c.height / 2;
      const oldZ = zoomRef.current;
      const { x: px, y: py } = panPxRef.current;
      const worldX = (cx - px) / oldZ;
      const worldY = (cy - py) / oldZ;
      panPxRef.current = { x: cx - worldX * clamped, y: cy - worldY * clamped };
    }
    zoomRef.current = clamped;
    setZoomPct(Math.round(clamped * 100));
    requestAnimationFrame(() => redraw());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetZoom = useCallback(() => {
    zoomRef.current = 1;
    panPxRef.current = { x: 0, y: 0 };
    setZoomPct(100);
    requestAnimationFrame(() => redraw());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Przesuwa widok tak, by obiekt `id` znalazł się w lewym górnym rogu (z marginesem),
   *  przy bieżącym zoomie; dodatkowo zaznacza cel. */
  const panToElement = useCallback((id: string) => {
    const el = elementsRef.current.find(e => e.id === id);
    const c = canvasRef.current;
    if (!el || el.kind === 'group' || !c) return;
    const b = elementBBox(el);
    const z = zoomRef.current || 1;
    const marginBuf = 48 * (c.width / (c.getBoundingClientRect().width || 1)); // ~48 css px w px bufora
    panPxRef.current = {
      x: marginBuf - (b.x / CANVAS_W) * c.width * z,
      y: marginBuf - (b.y / CANVAS_H) * c.height * z,
    };
    const ids = new Set([id]); setSelectedIds(ids); selectedRef.current = ids;
    setPropElId(id);
    setSelectedImgId(el.kind === 'image' ? id : null);
    selectedGroupRef.current = null;
    requestAnimationFrame(() => redraw());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag-to-reorder pages
  const onDragStart = (idx: number) => setDragSrc(idx);
  const onDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOver(idx); };
  const onDrop = (idx: number) => {
    if (dragSrc === null || dragSrc === idx) { setDragSrc(null); setDragOver(null); return; }
    setPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragSrc, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragSrc(null); setDragOver(null);
  };
  const onDragEnd = () => { setDragSrc(null); setDragOver(null); };

  // ── Cursor ───────────────────────────────────────────────────────────────────

  const getCursor = () => {
    switch (tool) {
      case 'lock': return 'not-allowed';
      case 'pan': return 'grab';
      case 'select': return 'default';
      case 'text': return 'text';
      case 'eraser': return 'cell';
      default: return 'crosshair';
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const hasSelection = selectedIds.size > 0;
  // Zaznaczenie złożone wyłącznie z obrazków → panel Styl pokazuje kontrolki obrazka.
  const curEls = pages.find(p => p.id === currentPageId)?.elements ?? [];
  const selImageEls = curEls.filter(el => selectedIds.has(el.id) && el.kind === 'image');
  const imageSelected = selImageEls.length > 0
    && curEls.filter(el => selectedIds.has(el.id) && el.kind !== 'group').every(el => el.kind === 'image');
  const imgRounded = selImageEls.length > 0 && selImageEls.every(el => el.kind === 'image' && !!el.rounded);
  // Kontekst panelu Styl: figura (Excalidraw-like) vs kreska (pióro/marker).
  const selShapes = curEls.filter(el => selectedIds.has(el.id) && el.kind === 'shape') as NoteShape[];
  const selStrokeCount = curEls.filter(el => selectedIds.has(el.id) && el.kind === 'stroke').length;
  const isLineTool = tool === 'line' || tool === 'arrow';
  const isPenTool = tool === 'pencil' || tool === 'marker';
  const shapeStyleCtx = selShapes.length > 0
    ? true
    : selStrokeCount > 0
      ? false
      : !isPenTool;
  // Figura liniowa (linia/strzałka) → panel bez Wypełnienia i Krawędzi.
  const lineStyleCtx = selShapes.length > 0
    ? selShapes.every(s => s.shape === 'line' || s.shape === 'arrow')
    : (shapeStyleCtx && isLineTool);
  // Strzałka → dodatkowy panel „Tryb strzałki" (groty + typ).
  const arrowStyleCtx = selShapes.length > 0
    ? selShapes.every(s => s.shape === 'arrow') && selShapes.some(s => s.shape === 'arrow')
    : tool === 'arrow';
  // Pojedyncza zaznaczona linia/strzałka → można włączyć tryb edycji punktów.
  const singleLinearId = (selectedIds.size === 1 && selShapes.length === 1 && LINEAR_SHAPES.has(selShapes[0].shape))
    ? selShapes[0].id : null;
  const canUndo = (undoStacks.current[currentPageId]?.length ?? 0) > 0;
  const canRedo = (redoStacks.current[currentPageId]?.length ?? 0) > 0;
  void historyVer; // used to trigger re-render on undo/redo
  const currentBgColor = pages.find(p => p.id === currentPageId)?.bgColor ?? DEFAULT_BG;

  /**
   * Stopień pisma pola tekstowego w pikselach ekranu.
   *
   * Kanwa ma stały układ `CANVAS_W × CANVAS_H` rozciągany na dostępne miejsce,
   * więc rozmiar zapisany w elemencie (`textSize`) trzeba przeliczyć tą samą
   * skalą, którą rysowany jest rysunek. Sztywne 18 px znaczyło, że napis
   * podczas pisania i po zatwierdzeniu miał różną wielkość.
   */
  const textInputFontPx = (() => {
    const r = canvasRef.current?.getBoundingClientRect();
    const scale = r && r.width > 0 ? r.width / CANVAS_W : 1;
    return Math.max(10, textSize * scale);
  })();

  // Text input screen position
  const getTextInputPos = () => {
    if (!textInput || !canvasRef.current) return { left: 0, top: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    return {
      left: textInput.x / CANVAS_W * r.width + r.left,
      top: textInput.y / CANVAS_H * r.height + r.top - textInputFontPx * 0.75,
    };
  };


  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', bgcolor: 'background.default' }}>

      {/* ── Pages sidebar ──────────────────────────────────────────────────── */}
      {/* Toggle button — always visible outside sidebar */}
      <Box sx={{
        width: 28, flexShrink: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', pt: 0.5, bgcolor: 'background.paper',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Tooltip title={sidebarVisible ? 'Hide pages' : 'Show pages'} placement="right">
          <IconButton size="small" onClick={() => setSidebarVisible(v => !v)}
            sx={{ width: 24, height: 24, borderRadius: 1 }}>
            <Box sx={{
              width: 14, height: 10, display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              {[0, 1, 2].map(i => (
                <Box key={i} sx={{ height: 2, borderRadius: 1, bgcolor: 'text.secondary', width: i === 1 ? '70%' : '100%' }} />
              ))}
            </Box>
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{
        width: sidebarVisible ? 180 : 0,
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        bgcolor: 'background.paper', borderRight: sidebarVisible ? '1px solid rgba(255,255,255,0.08)' : 'none',
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', px: 1, py: 0.5, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 180,
        }}>
          <Typography variant="caption" sx={{ flex: 1, fontWeight: 700, letterSpacing: 1, color: 'text.secondary' }}>
            PAGES
          </Typography>
          <Tooltip title="Add page">
            <IconButton size="small" onClick={addPage}>
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
          {pages.map((p, idx) => (
            <Box
              key={p.id}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={e => onDragOver(e, idx)}
              onDrop={() => onDrop(idx)}
              onDragEnd={onDragEnd}
              onClick={() => switchPage(p.id)}
              sx={{
                mx: 1, mb: 0.75, p: 0.5, borderRadius: 1, cursor: 'pointer',
                border: '2px solid',
                borderColor: p.id === currentPageId
                  ? 'primary.main'
                  : dragOver === idx ? 'primary.light' : 'transparent',
                bgcolor: p.id === currentPageId ? 'action.selected' : 'transparent',
                opacity: dragSrc === idx ? 0.35 : 1,
                transition: 'border-color 0.1s, opacity 0.1s',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                <DragIndicatorIcon sx={{ fontSize: 13, color: 'text.disabled', mr: 0.25, cursor: 'grab' }} />
                <Typography variant="caption" sx={{ flex: 1, fontSize: 10, color: 'text.secondary' }}>
                  Page {idx + 1}
                </Typography>
                <Tooltip title="Delete page">
                  <span>
                    <IconButton
                      size="small"
                      disabled={pages.length <= 1}
                      onClick={e => { e.stopPropagation(); removePage(p.id); }}
                      sx={{ p: '1px', opacity: pages.length > 1 ? 0.5 : 0.15 }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              {thumbnails[p.id] ? (
                <Box
                  component="img"
                  src={thumbnails[p.id]}
                  sx={{ width: '100%', display: 'block', borderRadius: 0.5, border: '1px solid rgba(255,255,255,0.06)' }}
                />
              ) : (
                <Box sx={{ width: '100%', height: THUMB_H, bgcolor: p.bgColor ?? DEFAULT_BG, borderRadius: 0.5 }} />
              )}
            </Box>
          ))}
        </Box>

        {/* Background theme selector */}
        <Box sx={{
          flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)',
          px: 1, py: 1,
        }}>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mb: 0.75, fontSize: 9, letterSpacing: 1 }}>
            BACKGROUND
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {BG_THEMES.map(({ color: bg, label, dark }) => (
              <Box
                key={bg}
                component="button"
                title={label}
                onPointerUp={(e) => { e.stopPropagation(); setPageBgColor(bg); }}
                sx={{
                  flex: 1, height: 36, borderRadius: 1, cursor: 'pointer', outline: 'none',
                  bgcolor: bg,
                  border: currentBgColor === bg
                    ? '2.5px solid #60a5fa'
                    : `1.5px solid ${dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)'}`,
                  boxShadow: currentBgColor === bg ? '0 0 0 1px #60a5fa44' : 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  minWidth: 0, touchAction: 'none',
                  '&:active': { opacity: 0.75 },
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.25, px: 1, py: 0.5, flexShrink: 0,
          // Zawijanie zamiast obcinania. Pasek nie mieści się w węższym oknie
          // — zwłaszcza po otwarciu panelu Scene, który zabiera 240 px — a przy
          // `overflow: hidden` rodzica znikały bez śladu przyciski z końca:
          // usuwanie zaznaczenia, przełącznik sceny i DBG.
          flexWrap: 'wrap', rowGap: 0.25,
          bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Narzędzia / tryby — kolejność wg TOOLBAR_LAYOUT */}
          {TOOLBAR_LAYOUT.map((item, i) => {
            if (item === 'sep') return <Divider key={`sep${i}`} orientation="vertical" flexItem sx={{ mx: 0.5 }} />;
            if (item === 'image') return (
              <Tooltip key="image" title="Osadź obraz">
                <IconButton size="small" onClick={e => setImgAnchor(e.currentTarget)} sx={{ color: 'text.secondary' }}>
                  <AddPhotoAlternateIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            );
            const { label, Icon } = TOOL_META[item];
            const activeTool = tool === item;
            return (
              <Tooltip key={item} title={label}>
                <IconButton
                  size="small"
                  onClick={() => {
                    setTool(item);
                    // Zmiana narzędzia na rysujące czyści zaznaczenie.
                    if (item !== 'select' && item !== 'lasso') {
                      setSelectedIds(new Set()); selectedRef.current = new Set(); setSelectedImgId(null);
                    }
                  }}
                  sx={{
                    color: activeTool ? 'primary.main' : 'text.secondary',
                    bgcolor: activeTool ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    borderRadius: 1,
                  }}
                >
                  <Icon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            );
          })}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Undo / Redo */}
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={handleUndo} disabled={!canUndo}>
                <UndoIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={handleRedo} disabled={!canRedo}>
                <RedoIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Popover osadzania obrazu (otwierany z przycisku „Osadź obraz" w toolbarze) */}
          <Popover open={Boolean(imgAnchor)} anchorEl={imgAnchor} onClose={() => setImgAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box component="button" onClick={() => { cameraInputRef.current?.click(); setImgAnchor(null); }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  cursor: 'pointer', borderRadius: 1, bgcolor: 'transparent', border: 'none',
                  color: 'text.primary', fontSize: 13,
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                <CameraAltIcon sx={{ fontSize: 18 }} /> Camera
              </Box>
              <Box component="button" onClick={() => { fileInputRef.current?.click(); setImgAnchor(null); }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  cursor: 'pointer', borderRadius: 1, bgcolor: 'transparent', border: 'none',
                  color: 'text.primary', fontSize: 13,
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                <PhotoLibraryIcon sx={{ fontSize: 18 }} /> Gallery / File
              </Box>
            </Box>
          </Popover>

          {/* Delete selected — visible only when lasso selection is active */}
          {hasSelection && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>
                {selectedIds.size} selected
              </Typography>
              <Tooltip title="Delete selected (Delete)">
                <IconButton size="small" color="error" onClick={handleDeleteSelected}>
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/*
            Stan pióra sterownika — cztery przypadki, jeden wskaźnik.

            Bez tego „nie działa" ma cztery różne przyczyny wyglądające
            identycznie: pióro po prostu rysuje z opóźnieniem. Milczenie
            interfejsu jest tu najgorszą odpowiedzią, bo każe zgadywać, czy
            zawiodła strona, pakiet, czy rozpoznanie urządzenia.

            W zwykłej przeglądarce wskaźnika nie ma — na biurku nie ma czego
            diagnozować.
          */}
          {penHost.kind !== 'browser' && (() => {
            const state =
              penHost.kind === 'shell-old'
                ? { color: 'warning.main', title: 'Aplikacja bez modułu pióra — wgraj nowszy APK (MyCastleCAD)' }
                : penHost.kind === 'unsupported'
                  ? { color: 'error.main', title: `Sterownik pióra niedostępny — ${penHost.info ?? 'bez podanego powodu'}` }
                  : pen.engaged
                    ? { color: 'success.main', title: `Rysuje sterownik Boox — ${pen.info ?? ''}` }
                    : { color: 'text.disabled', title: `Sterownik gotowy, czeka na narzędzie Pióro lub Marker — ${pen.info ?? ''}` };
            return (
              <Tooltip title={state.title}>
                <BoltIcon sx={{ fontSize: 18, ml: 'auto', color: state.color }} />
              </Tooltip>
            );
          })()}

          {/* Scene panel toggle — file ops now live in the top-bar File menu */}
          <Tooltip title="Scene (object tree + properties)">
            <IconButton size="small" onClick={() => setScenePanelOpen(v => !v)}
              sx={{ ml: penHost.kind !== 'browser' ? 0.5 : 'auto', borderRadius: 1, bgcolor: scenePanelOpen ? 'primary.main' : undefined,
                color: scenePanelOpen ? '#fff' : 'text.secondary' }}>
              <AccountTreeOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          {/* Debug toggle */}
          <Box>
            <Box
              component="button"
              onClick={() => { setDebugVisible(v => !v); setDebugTick(t => t + 1); }}
              sx={{
                px: 1, py: 0.25, fontSize: 10, fontFamily: 'monospace', cursor: 'pointer',
                bgcolor: debugVisible ? '#7c3aed' : 'rgba(255,255,255,0.07)',
                color: debugVisible ? '#fff' : 'text.disabled',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 1, outline: 'none',
              }}
            >DBG</Box>
          </Box>
        </Box>

        {/* Canvas */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', bgcolor: currentBgColor }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDoubleClick}
            style={{
              width: '100%', height: '100%', display: 'block',
              cursor: eyedropper ? 'crosshair' : getCursor(), touchAction: 'none',
            }}
          />

          {/* ── Lewy pionowy toolbar (kolor / tło / styl) ─────────────────────── */}
          <Box sx={{
            position: 'absolute', top: 8, left: 8, zIndex: 30,
            display: 'flex', flexDirection: 'column', gap: 0.5,
            bgcolor: 'rgba(30,30,30,0.86)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, p: 0.5,
          }}>
            {/* 1. Kolor (foreground) */}
            <Tooltip title="Kolor" placement="right">
              <IconButton
                size="small"
                onClick={() => setSidePanel(p => p === 'color' ? null : 'color')}
                sx={{
                  width: 34, height: 34, position: 'relative',
                  color: sidePanel === 'color' ? 'primary.main' : 'text.secondary',
                  bgcolor: sidePanel === 'color' ? 'action.selected' : 'transparent',
                }}
              >
                <PaletteIcon sx={{ fontSize: 20 }} />
                <Box sx={{
                  position: 'absolute', bottom: 3, right: 3, width: 9, height: 9,
                  borderRadius: '50%', background: color === TRANSPARENT ? CHECKER_BG : color,
                  border: '1px solid rgba(0,0,0,0.5)',
                }} />
              </IconButton>
            </Tooltip>

            {/* 2. Kolor wypełnienia obiektu — bez sensu dla linii/strzałki, więc ukryty */}
            {!lineStyleCtx && (
            <Tooltip title="Kolor wypełnienia obiektu" placement="right">
              <IconButton
                size="small"
                onClick={() => setSidePanel(p => p === 'bg' ? null : 'bg')}
                sx={{
                  width: 34, height: 34, position: 'relative',
                  color: sidePanel === 'bg' ? 'primary.main' : 'text.secondary',
                  bgcolor: sidePanel === 'bg' ? 'action.selected' : 'transparent',
                }}
              >
                <FormatColorFillIcon sx={{ fontSize: 20 }} />
                <Box sx={{
                  position: 'absolute', bottom: 3, right: 3, width: 9, height: 9,
                  borderRadius: 1, background: fillColor === TRANSPARENT ? CHECKER_BG : fillColor,
                  border: '1px solid rgba(255,255,255,0.4)',
                }} />
              </IconButton>
            </Tooltip>
            )}

            {/* 3. Styl (wypełnienie / szerokość / nacisk / krycie) */}
            <Tooltip title="Styl" placement="right">
              <IconButton
                size="small"
                onClick={() => setSidePanel(p => p === 'style' ? null : 'style')}
                sx={{
                  width: 34, height: 34,
                  color: sidePanel === 'style' ? 'primary.main' : 'text.secondary',
                  bgcolor: sidePanel === 'style' ? 'action.selected' : 'transparent',
                }}
              >
                <TuneIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>

            {/* 3b. Tekst (rozmiar + wyrównanie) */}
            <Tooltip title="Tekst (rozmiar / wyrównanie)" placement="right">
              <IconButton
                size="small"
                onClick={() => setSidePanel(p => p === 'text' ? null : 'text')}
                sx={{
                  width: 34, height: 34,
                  color: sidePanel === 'text' ? 'primary.main' : 'text.secondary',
                  bgcolor: sidePanel === 'text' ? 'action.selected' : 'transparent',
                }}
              >
                <FormatSizeIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>

            {/* 3c. Tryb strzałki (groty + typ) — tylko dla strzałek */}
            {arrowStyleCtx && (
            <Tooltip title="Tryb strzałki" placement="right">
              <IconButton
                size="small"
                onClick={() => setSidePanel(p => p === 'arrow' ? null : 'arrow')}
                sx={{
                  width: 34, height: 34,
                  color: sidePanel === 'arrow' ? 'primary.main' : 'text.secondary',
                  bgcolor: sidePanel === 'arrow' ? 'action.selected' : 'transparent',
                }}
              >
                <ArrowRightAltIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
            )}

            {/* 3d. Edycja punktów — tylko dla pojedynczej linii/strzałki */}
            {singleLinearId && (
            <Tooltip title="Edytuj punkty (dodawaj/przesuwaj wierzchołki)" placement="right">
              <IconButton
                size="small"
                onClick={() => setEditPointsId(id => id === singleLinearId ? null : singleLinearId)}
                sx={{
                  width: 34, height: 34,
                  color: editPointsId === singleLinearId ? 'primary.main' : 'text.secondary',
                  bgcolor: editPointsId === singleLinearId ? 'action.selected' : 'transparent',
                }}
              >
                <PolylineIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            )}

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', my: 0.25 }} />

            {/* 4. Kopiuj (duplikuj) */}
            <Tooltip title="Kopiuj (duplikuj)" placement="right"><span>
              <IconButton size="small" disabled={!selectedIds.size} onClick={handleDuplicate}
                sx={{ width: 34, height: 34, color: 'text.secondary' }}>
                <ContentCopyIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </span></Tooltip>

            {/* 5. Usuń */}
            <Tooltip title="Usuń" placement="right"><span>
              <IconButton size="small" disabled={!selectedIds.size} onClick={handleDeleteSelected}
                sx={{ width: 34, height: 34, color: selectedIds.size ? 'error.main' : 'text.disabled' }}>
                <DeleteOutlineIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </span></Tooltip>

            {/* 6. Inne (kolejność warstw) */}
            <Tooltip title="Inne (kolejność)" placement="right"><span>
              <IconButton size="small" disabled={!selectedIds.size} onClick={e => setMoreAnchor(e.currentTarget)}
                sx={{ width: 34, height: 34, color: 'text.secondary' }}>
                <MoreVertIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </span></Tooltip>

            {/* 7. Link */}
            <Tooltip title="Link do strony" placement="right"><span>
              <IconButton
                size="small"
                disabled={selectedIds.size !== 1}
                onClick={() => {
                  const id = [...selectedIds][0];
                  const el = elementsRef.current.find(e => e.id === id);
                  setLinkDialog({ id, url: (el && 'link' in el ? el.link : '') || '' });
                }}
                sx={{ width: 34, height: 34, color: 'text.secondary' }}>
                <LinkIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </span></Tooltip>
          </Box>

          {/* Menu „Inne" — kolejność warstw */}
          <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
            <MenuItem onClick={() => { reorderSelected('front'); setMoreAnchor(null); }}>
              <ListItemIcon><FlipToFrontIcon fontSize="small" /></ListItemIcon>Przenieś na wierzch
            </MenuItem>
            <MenuItem onClick={() => { reorderSelected('up'); setMoreAnchor(null); }}>
              <ListItemIcon><ArrowUpwardIcon fontSize="small" /></ListItemIcon>Warstwa wyżej
            </MenuItem>
            <MenuItem onClick={() => { reorderSelected('down'); setMoreAnchor(null); }}>
              <ListItemIcon><ArrowDownwardIcon fontSize="small" /></ListItemIcon>Warstwa niżej
            </MenuItem>
            <MenuItem onClick={() => { reorderSelected('back'); setMoreAnchor(null); }}>
              <ListItemIcon><FlipToBackIcon fontSize="small" /></ListItemIcon>Przenieś na spód
            </MenuItem>
          </Menu>

          {/*
            Warstwa przechwytująca kliknięcie poza wysuniętym podmenu.
            
            Bez niej kliknięcie „gdzieś obok" trafiało w kanwę i **zaczynało
            rysować** — użytkownik chciał tylko schować panel, a zostawał
            z kreską albo nowym kształtem. Osobny element zamiast nasłuchu na
            kanwie, bo tylko element w DOM-ie na wierzchu sprawia, że kanwa
            tego zdarzenia w ogóle nie zobaczy; obsługa „zamknij i zignoruj"
            wewnątrz kanwy wymagałaby przeplatania warunku przez wszystkie
            ścieżki narzędzi.
            
            `zIndex: 29` — pod paskiem narzędzi (30) i pod samym panelem (31),
            więc przełączenie na inną zakładkę podmenu dalej działa jednym
            kliknięciem, a nie dwoma.
          */}
          {sidePanel && (
            <Box
              onPointerDown={(e) => { e.stopPropagation(); setSidePanel(null); }}
              sx={{ position: 'absolute', inset: 0, zIndex: 29 }}
            />
          )}

          {/* ── Flyout panelu lewego toolbaru ─────────────────────────────────── */}
          {sidePanel && (
            <Box sx={{
              position: 'absolute', top: 8, left: 52, zIndex: 31,
              bgcolor: 'rgba(28,28,28,0.97)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2,
              p: 1.25, boxShadow: 6, maxWidth: 'calc(100% - 64px)',
            }}>
              {sidePanel === 'color' && (
                <ColorPickerPanel
                  title="Kolor (obrys/pisak)" value={color} allowTransparent
                  eyedropperActive={eyedropper === 'fg'}
                  onPick={(c) => applyStrokeColor(c)}
                  onEyedropper={() => { setEyedropper(eyedropper === 'fg' ? null : 'fg'); setSidePanel(null); }}
                />
              )}
              {sidePanel === 'bg' && (
                <ColorPickerPanel
                  title="Kolor wypełnienia obiektu" value={fillColor} allowTransparent
                  eyedropperActive={eyedropper === 'bg'}
                  onPick={(c) => applyFillColor(c)}
                  onEyedropper={() => { setEyedropper(eyedropper === 'bg' ? null : 'bg'); setSidePanel(null); }}
                />
              )}
              {/* Styl dla obrazka: Krawędzie + Krycie (jak w Excalidraw) */}
              {sidePanel === 'style' && imageSelected && (
                <Box sx={{ width: 232 }}>
                  {/* Krawędzie — ostre / zaokrąglone */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Krawędzie
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {([
                      { rounded: false, label: 'Ostre narożniki',
                        svg: <rect x="3" y="3" width="24" height="24" rx="0" fill="none" stroke="currentColor" strokeWidth="2" /> },
                      { rounded: true, label: 'Zaokrąglone narożniki',
                        svg: <rect x="3" y="3" width="24" height="24" rx="7" fill="none" stroke="currentColor" strokeWidth="2" /> },
                    ]).map(({ rounded, label, svg }) => {
                      const active = imgRounded === rounded;
                      return (
                        <Tooltip key={String(rounded)} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyImageRounded(rounded)}
                            sx={{
                              flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 30" sx={{ width: 26, height: 26, flex: 'none' }}>{svg}</Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Krycie obrazka (100% = pełne) */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.25 }}>
                    Krycie — {intensityPct}%
                  </Typography>
                  <Box sx={{ px: 0.5 }}>
                    <Slider
                      size="small" min={0} max={100} step={1}
                      value={intensityPct}
                      onChange={(_, v) => setIntensityPct(v as number)}
                      onChangeCommitted={(_, v) => applyImageOpacity(v as number)}
                    />
                  </Box>
                </Box>
              )}
              {/* Styl dla figur (prostokąt / okrąg / romb) — układ jak w Excalidraw */}
              {sidePanel === 'style' && !imageSelected && shapeStyleCtx && (
                <Box sx={{ width: 232 }}>
                  {/* Wypełnienie — tylko figury z polem (nie linia/strzałka) */}
                  {!lineStyleCtx && (
                    <>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                        Wypełnienie
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5, mb: 1.25 }}>
                        {SHAPE_FILL_PATTERNS.map(({ v, label }) => (
                          <Tooltip key={v} title={label}>
                            <Box
                              component="button" aria-label={label}
                              onClick={() => applyFillPattern(v)}
                              sx={{
                                height: 36, borderRadius: 1, cursor: 'pointer', p: 0,
                                border: fillPattern === v ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                                background:
                                  v === 'solid' ? 'rgba(255,255,255,0.85)'
                                  : v === 'diagonal' ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.85) 0 2px, transparent 2px 6px)'
                                  : 'repeating-linear-gradient(45deg, rgba(255,255,255,0.85) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.85) 0 2px, transparent 2px 6px)',
                              }}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                    </>
                  )}

                  {/* Szerokość kreski */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Szerokość kreski
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {WIDTH_PRESETS.map(({ v, label }, i) => {
                      const active = brushSize === v;
                      const barH = [2, 5, 10][i];
                      return (
                        <Tooltip key={v} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyWidth(v)}
                            sx={{
                              flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box sx={{ width: '64%', height: barH, borderRadius: 999, bgcolor: active ? '#fff' : 'rgba(255,255,255,0.7)' }} />
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Styl kreski (linia / kreski / kropki) */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Styl kreski
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {STROKE_STYLES.map(({ v, label }) => {
                      const active = strokeStyle === v;
                      const dash = v === 'dashed' ? '6 4' : v === 'dotted' ? '1.5 4' : undefined;
                      return (
                        <Tooltip key={v} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyStrokeStyle(v)}
                            sx={{
                              flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 15" sx={{ width: 30, height: 15, flex: 'none' }}>
                              <line x1="2" y1="7.5" x2="28" y2="7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash} />
                            </Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Niedbałość (styl rysowania) */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Styl rysowania
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {ROUGHNESS_LEVELS.map(({ v, label }) => {
                      const active = roughness === v;
                      const d = v === 0 ? 'M2 7.5 L28 7.5'
                        : v === 1 ? 'M2 7.5 Q9 4 15 7.5 T28 7.5'
                        : 'M2 8 Q6 3 10 8 T18 8 Q22 12 26 7';
                      return (
                        <Tooltip key={v} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyRoughness(v)}
                            sx={{
                              flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 15" sx={{ width: 30, height: 15, flex: 'none' }}>
                              <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Krawędzie — figury: zaokrąglenie narożników; linia/strzałka: zakończenie kreski */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Krawędzie
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {([
                      { r: false, label: lineStyleCtx ? 'Ostre zakończenie' : 'Ostre narożniki', rx: 0 },
                      { r: true, label: lineStyleCtx ? 'Zaokrąglone zakończenie' : 'Zaokrąglone narożniki', rx: 7 },
                    ]).map(({ r, label, rx }) => {
                      const active = shapeRounded === r;
                      return (
                        <Tooltip key={String(r)} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyShapeRounded(r)}
                            sx={{
                              flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 30" sx={{ width: 24, height: 24, flex: 'none' }}>
                              {lineStyleCtx
                                ? <line x1="5" y1="15" x2="25" y2="15" stroke="currentColor" strokeWidth="4" strokeLinecap={r ? 'round' : 'butt'} />
                                : <rect x="3" y="3" width="24" height="24" rx={rx} fill="none" stroke="currentColor" strokeWidth="2" />}
                            </Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Krycie (100% = pełne) */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.25 }}>
                    Krycie — {intensityPct}%
                  </Typography>
                  <Box sx={{ px: 0.5 }}>
                    <Slider
                      size="small" min={0} max={100} step={1}
                      value={intensityPct}
                      onChange={(_, v) => setIntensityPct(v as number)}
                      onChangeCommitted={(_, v) => applyIntensity(v as number)}
                    />
                  </Box>
                </Box>
              )}

              {/* Styl dla kresek (pióro / marker) */}
              {sidePanel === 'style' && !imageSelected && !shapeStyleCtx && (
                <Box sx={{ width: 232 }}>
                  {/* Szerokość kreski */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Szerokość kreski
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {WIDTH_PRESETS.map(({ v, label }, i) => {
                      const active = brushSize === v;
                      const barH = [2, 5, 10][i];
                      return (
                        <Tooltip key={v} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyWidth(v)}
                            sx={{
                              flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box sx={{ width: '64%', height: barH, borderRadius: 999, bgcolor: active ? '#fff' : 'rgba(255,255,255,0.7)' }} />
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Nacisk */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Nacisk (pressure)
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {([
                      { lvl: 'low' as const, label: 'Niski — równa grubość',
                        svg: <rect x="2" y="6" width="26" height="3" rx="1.5" fill="currentColor" /> },
                      { lvl: 'high' as const, label: 'Wysoki — grubość zależna od nacisku',
                        svg: <path d="M2 7.5 Q15 7.5 28 2.5 L28 12.5 Q15 7.5 2 7.5 Z" fill="currentColor" /> },
                    ]).map(({ lvl, label, svg }) => {
                      const active = pressureLevel === lvl;
                      return (
                        <Tooltip key={lvl} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyPressure(lvl)}
                            sx={{
                              flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 15" sx={{ width: 30, height: 15, flex: 'none' }}>{svg}</Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Intensywność */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.25 }}>
                    Intensywność — {intensityPct}%
                  </Typography>
                  <Box sx={{ px: 0.5 }}>
                    <Slider
                      size="small" min={0} max={100} step={1}
                      value={intensityPct}
                      onChange={(_, v) => setIntensityPct(v as number)}
                      onChangeCommitted={(_, v) => applyIntensity(v as number)}
                    />
                  </Box>
                </Box>
              )}
              {sidePanel === 'text' && (
                <Box sx={{ width: 232 }}>
                  {/* Rozmiar tekstu */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Rozmiar tekstu
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {TEXT_SIZES.map(({ k, v }) => (
                      <Button
                        key={k} size="small"
                        variant={textSize === v ? 'contained' : 'outlined'}
                        onClick={() => applyTextSize(v)}
                        sx={{ flex: 1, minWidth: 0, fontSize: 12, py: 0.4 }}
                      >
                        {k}
                      </Button>
                    ))}
                  </Box>
                  {/* Wyrównanie tekstu */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Wyrównanie tekstu
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {([
                      { a: 'left' as const, Icon: FormatAlignLeftIcon, label: 'Do lewej' },
                      { a: 'center' as const, Icon: FormatAlignCenterIcon, label: 'Wyśrodkuj' },
                      { a: 'right' as const, Icon: FormatAlignRightIcon, label: 'Do prawej' },
                    ]).map(({ a, Icon, label }) => {
                      const active = textAlign === a;
                      return (
                        <Tooltip key={a} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyTextAlign(a)}
                            sx={{
                              flex: 1, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? 'primary.main' : 'text.secondary',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Icon sx={{ fontSize: 18 }} />
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              )}
              {sidePanel === 'arrow' && arrowStyleCtx && (
                <Box sx={{ width: 232 }}>
                  {/* Groty — brak / grot na końcu */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Groty
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25 }}>
                    {([
                      { v: 'none' as ArrowHeads, label: 'Bez grotu',
                        svg: <><line x1="3" y1="7.5" x2="27" y2="7.5" stroke="currentColor" strokeWidth="2" /></> },
                      { v: 'end' as ArrowHeads, label: 'Grot na końcu',
                        svg: <><line x1="3" y1="7.5" x2="25" y2="7.5" stroke="currentColor" strokeWidth="2" /><path d="M19 3 L26 7.5 L19 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> },
                    ]).map(({ v, label, svg }) => {
                      const active = arrowHeads === v;
                      return (
                        <Tooltip key={v} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyArrowHeads(v)}
                            sx={{
                              flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 15" sx={{ width: 30, height: 15, flex: 'none' }}>{svg}</Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>

                  {/* Typ strzałki — prosta / wygięta / łamana */}
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    Typ strzałki
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                    {([
                      { v: 'straight' as ArrowType, label: 'Prosta',
                        svg: <><line x1="4" y1="26" x2="24" y2="6" stroke="currentColor" strokeWidth="2" /><path d="M18 5 L25 5 L25 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> },
                      { v: 'curved' as ArrowType, label: 'Wygięta',
                        svg: <><path d="M4 26 Q6 8 24 6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M18 4 L25 6 L21 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> },
                      { v: 'elbow' as ArrowType, label: 'Łamana',
                        svg: <><path d="M4 24 L4 14 L22 14 L22 6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M17 8 L22 4 L27 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></> },
                    ]).map(({ v, label, svg }) => {
                      const active = arrowType === v;
                      return (
                        <Tooltip key={v} title={label}>
                          <Box
                            component="button" aria-label={label}
                            onClick={() => applyArrowType(v)}
                            sx={{
                              flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', borderRadius: 1, p: 0,
                              color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                              border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.2)',
                              bgcolor: active ? 'action.selected' : 'transparent',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box component="svg" viewBox="0 0 30 30" sx={{ width: 26, height: 26, flex: 'none' }}>{svg}</Box>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Debug log overlay */}
          {debugVisible && (() => {
            // debugTick referenced here so interval re-render refreshes the log text
            const _t = debugTick;
            const logText = debugBufRef.current.length
              ? debugBufRef.current.slice().reverse().join('\n')
              : `(no logs yet — tick=${_t})`;
            return (
              <Box sx={{
                position: 'absolute', top: 6, left: 6, right: 6, zIndex: 50,
                bgcolor: 'rgba(0,0,0,0.88)', borderRadius: 1,
                border: '1px solid #7c3aed', p: 0.75,
                maxHeight: '55%', overflow: 'hidden',
                pointerEvents: 'none',
              }}>
                <Box component="pre" sx={{
                  m: 0, color: '#a78bfa', fontFamily: 'monospace', fontSize: 9,
                  lineHeight: 1.35, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {logText}
                </Box>
              </Box>
            );
          })()}

          {/* Ikony linków — dla każdego obiektu z linkiem (zawsze widoczne). Klik → popup. */}
          {(() => {
            void zoomPct; void imgDragVer; // re-render na zoom/drag
            const cv = canvasRef.current;
            if (!cv) return null;
            const z = zoomRef.current; const { x: panX, y: panY } = panPxRef.current;
            const linked = elementsRef.current.filter(el => el.kind !== 'group' && el.link);
            if (!linked.length) return null;
            return linked.map(el => {
              const b = elementBBox(el);
              // narożnik prawy-górny w %
              const bufX = (b.x + b.w) / CANVAS_W * cv.width * z + panX;
              const bufY = b.y / CANVAS_H * cv.height * z + panY;
              const leftPct = bufX / cv.width * 100, topPct = bufY / cv.height * 100;
              return (
                <Box
                  key={`lnk-${el.id}`}
                  onClick={(e) => { e.stopPropagation(); setLinkPopup({ id: el.id, anchor: e.currentTarget as HTMLElement }); }}
                  title={el.kind !== 'group' ? el.link : ''}
                  sx={{
                    position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
                    transform: 'translate(-50%, -50%)', zIndex: 22, cursor: 'pointer',
                    width: 22, height: 22, borderRadius: '50%',
                    bgcolor: 'rgba(37,99,235,0.92)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #fff', boxShadow: 1,
                    '&:hover': { bgcolor: '#2563eb' },
                  }}
                >
                  <LinkIcon sx={{ fontSize: 13 }} />
                </Box>
              );
            });
          })()}

          {/* Ikony LinkTo — dla kształtów wskazujących na obiekt sceny. Klik → przenieś widok. */}
          {(() => {
            void zoomPct; void imgDragVer;
            const cv = canvasRef.current;
            if (!cv) return null;
            const z = zoomRef.current; const { x: panX, y: panY } = panPxRef.current;
            const linked = elementsRef.current.filter(el => el.kind === 'shape' && el.linkTo) as NoteShape[];
            if (!linked.length) return null;
            return linked.map(el => {
              const b = elementBBox(el);
              // narożnik lewy-górny obiektu (odróżnia od ikony URL-linku w prawym-górnym)
              const bufX = b.x / CANVAS_W * cv.width * z + panX;
              const bufY = b.y / CANVAS_H * cv.height * z + panY;
              const leftPct = bufX / cv.width * 100, topPct = bufY / cv.height * 100;
              const tgt = elementsRef.current.find(e => e.id === el.linkTo);
              return (
                <Box
                  key={`linkto-${el.id}`}
                  onClick={(e) => { e.stopPropagation(); panToElement(el.linkTo!); }}
                  title={tgt ? `Przejdź do: ${nodeLabel(tgt)}` : 'Cel nie istnieje'}
                  sx={{
                    position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
                    transform: 'translate(-50%, -50%)', zIndex: 22, cursor: 'pointer',
                    width: 22, height: 22, borderRadius: '50%',
                    bgcolor: 'rgba(22,163,74,0.92)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #fff', boxShadow: 1,
                    '&:hover': { bgcolor: '#16a34a' },
                  }}
                >
                  <MyLocationIcon sx={{ fontSize: 13 }} />
                </Box>
              );
            });
          })()}

          {/* Ikony InfoMd — dla kształtów z opisem Markdown. Klik → popup z treścią. */}
          {(() => {
            void zoomPct; void imgDragVer;
            const cv = canvasRef.current;
            if (!cv) return null;
            const z = zoomRef.current; const { x: panX, y: panY } = panPxRef.current;
            const withInfo = elementsRef.current.filter(el => el.kind === 'shape' && el.infoMd?.trim()) as NoteShape[];
            if (!withInfo.length) return null;
            return withInfo.map(el => {
              const b = elementBBox(el);
              // narożnik lewy-dolny (odróżnia od LinkTo w lewym-górnym i URL-linku w prawym-górnym)
              const bufX = b.x / CANVAS_W * cv.width * z + panX;
              const bufY = (b.y + b.h) / CANVAS_H * cv.height * z + panY;
              const leftPct = bufX / cv.width * 100, topPct = bufY / cv.height * 100;
              return (
                <Box
                  key={`info-${el.id}`}
                  onClick={(e) => { e.stopPropagation(); setInfoMdPopup({ id: el.id, anchor: e.currentTarget as HTMLElement }); }}
                  title="Pokaż opis"
                  sx={{
                    position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`,
                    transform: 'translate(-50%, -50%)', zIndex: 22, cursor: 'pointer',
                    width: 22, height: 22, borderRadius: '50%',
                    bgcolor: 'rgba(217,119,6,0.92)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid #fff', boxShadow: 1,
                    '&:hover': { bgcolor: '#d97706' },
                  }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                </Box>
              );
            });
          })()}

          {/* Zoom controls */}
          <Box sx={{
            position: 'absolute', bottom: 10, right: 10, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 0.25,
            bgcolor: 'rgba(30,30,30,0.82)', backdropFilter: 'blur(6px)',
            borderRadius: 2, px: 0.5, py: 0.25,
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <IconButton size="small" onClick={() => applyZoom(zoomRef.current / 1.25)}
              sx={{ width: 26, height: 26, color: 'text.secondary' }}>
              <Box component="span" sx={{ fontSize: 18, lineHeight: 1, userSelect: 'none' }}>−</Box>
            </IconButton>
            <Box
              component="button"
              title="Reset zoom"
              onClick={resetZoom}
              sx={{
                minWidth: 44, px: 0.5, py: 0.25, cursor: 'pointer',
                bgcolor: 'transparent', border: 'none', color: 'text.primary',
                fontSize: 11, fontFamily: 'monospace', borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {zoomPct}%
            </Box>
            <IconButton size="small" onClick={() => applyZoom(zoomRef.current * 1.25)}
              sx={{ width: 26, height: 26, color: 'text.secondary' }}>
              <Box component="span" sx={{ fontSize: 18, lineHeight: 1, userSelect: 'none' }}>+</Box>
            </IconButton>
          </Box>

          {/* Floating text input — positioned over canvas */}
          {textInput && (() => {
            const pos = getTextInputPos();
            return (
              <Box sx={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1400 }}>
                {/*
                  Pole bez ramki, bez tła i bez podpowiedzi — na ekranie zostaje
                  sam migający kursor i wpisywany tekst.

                  Powód jest taki, że to pole **udaje** tekst, który za chwilę
                  wyląduje na kanwie. Ciemna plama z obwódką nad rysunkiem
                  zasłaniała to, obok czego się pisze, a po zatwierdzeniu tekst
                  przeskakiwał: inny krój tła, inny rozmiar, inne położenie.
                  Stąd też stopień pisma liczony z `textSize` i skali kanwy —
                  to, co widać w trakcie pisania, ma być tym, co zostanie.
                */}
                <TextField
                  autoFocus
                  variant="standard"
                  size="small"
                  value={textInput.val}
                  onChange={e => setTextInput(prev => prev ? { ...prev, val: e.target.value } : null)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) commitText(textInput.val, textInput.x, textInput.y, textInput.targetId);
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                  onBlur={() => commitText(textInput.val, textInput.x, textInput.y, textInput.targetId)}
                  InputProps={{ disableUnderline: true }}
                  sx={{
                    minWidth: 180,
                    '& .MuiInputBase-input': {
                      color,
                      // Kursor bierze kolor pisaka — na jasnym tle domyślny
                      // biały byłby niewidoczny, czyli znikałby jedyny ślad,
                      // że pole w ogóle czeka na tekst.
                      caretColor: color,
                      fontSize: textInputFontPx,
                      lineHeight: 1.25,
                      p: 0,
                      // Bez `textAlign` pola: kursor ma stać dokładnie tam,
                      // gdzie użytkownik kliknął. Wyrównanie do środka
                      // odsunęłoby go o połowę szerokości pola, a pole jest
                      // przezroczyste — nie byłoby po czym poznać, dlaczego.
                    },
                    '& .MuiInputBase-root': { bgcolor: 'transparent' },
                    '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                  }}
                />
              </Box>
            );
          })()}
          {/* Image resize overlay — zoomPct/imgDragVer in scope ensures re-render on zoom/drag */}
          {(() => {
            void zoomPct;    // re-render when zoom changes
            void imgDragVer; // re-render on every drag move
            if (!selectedImgId) return null;
            // Always read from elementsRef.current — updated imperatively during drag
            const im = elementsRef.current.find(
              (el): el is NoteImage => el.kind === 'image' && el.id === selectedImgId,
            );
            if (!im) return null;

            // Account for zoom+pan in overlay positioning
            const z = zoomRef.current;
            const { x: panX, y: panY } = panPxRef.current;
            const c = canvasRef.current;
            const cW = c?.width  ?? 1;
            const cH = c?.height ?? 1;
            const bufLeft   = im.x / CANVAS_W * cW * z + panX;
            const bufTop    = im.y / CANVAS_H * cH * z + panY;
            const bufWidth  = im.w / CANVAS_W * cW * z;
            const bufHeight = im.h / CANVAS_H * cH * z;
            const pctLeft   = bufLeft   / cW * 100;
            const pctTop    = bufTop    / cH * 100;
            const pctWidth  = bufWidth  / cW * 100;
            const pctHeight = bufHeight / cH * 100;

            const HANDLE = 10; // handle visual size px
            const HIT    = 16; // hit-area px

            const startDrag = (e: React.PointerEvent, edge: ResizeEdge) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const cur = elementsRef.current.find(
                (el): el is NoteImage => el.kind === 'image' && el.id === selectedImgId,
              );
              if (!cur) return;
              pushUndo(currentIdRef.current, elementsRef.current);
              imgDragRef.current = {
                edge,
                startCX: e.clientX, startCY: e.clientY,
                startX: cur.x, startY: cur.y, startW: cur.w, startH: cur.h,
              };
            };

            const onDragMove = (e: React.PointerEvent) => {
              const d = imgDragRef.current;
              if (!d) return;
              // Note: !e.buttons guard removed — touch pointerType reports buttons=0 on some Android WebViews
              const c = canvasRef.current;
              if (!c) return;
              const r = c.getBoundingClientRect();
              const dx = (e.clientX - d.startCX) / r.width  * CANVAS_W;
              const dy = (e.clientY - d.startCY) / r.height * CANVAS_H;
              let { startX: x, startY: y, startW: w, startH: h } = d;
              switch (d.edge) {
                case 'move':   x += dx; y += dy; break;
                case 'top':    y += dy; h -= dy; break;
                case 'bottom': h += dy; break;
                case 'left':   x += dx; w -= dx; break;
                case 'right':  w += dx; break;
                case 'tl': x += dx; y += dy; w -= dx; h -= dy; break;
                case 'tr': y += dy; w += dx; h -= dy; break;
                case 'bl': x += dx; w -= dx; h += dy; break;
                case 'br': w += dx; h += dy; break;
              }
              w = Math.max(20, w); h = Math.max(20, h);
              // Update ref + redraw canvas; also bump imgDragVer so overlay re-renders in sync
              elementsRef.current = elementsRef.current.map(el =>
                el.id === selectedImgId ? { ...el, x, y, w, h } : el,
              );
              redraw();
              setImgDragVer(v => v + 1);
            };

            const onDragEnd = () => {
              if (!imgDragRef.current) return;
              imgDragRef.current = null;
              // Commit to React state (triggers re-render + thumbnail)
              commitElements(elementsRef.current);
            };

            const handleSx = { position: 'absolute', bgcolor: '#60a5fa', borderRadius: '2px', zIndex: 12 } as const;
            const edgeSx   = { position: 'absolute', zIndex: 11 } as const;
            // Drag event props applied to every interactive element — onPointerMove/Up must live on the
            // same element that received setPointerCapture (not a parent with pointer-events:none)
            const dragProps = {
              onPointerMove: onDragMove,
              onPointerUp: onDragEnd,
              style: { touchAction: 'none' } as React.CSSProperties,
            };

            return (
              <Box
                sx={{
                  position: 'absolute',
                  left: `${pctLeft}%`, top: `${pctTop}%`,
                  width: `${pctWidth}%`, height: `${pctHeight}%`,
                  zIndex: 10, pointerEvents: 'none',
                }}
              >
                {/* Dashed border */}
                <Box sx={{ position: 'absolute', inset: 0, border: '2px dashed #60a5fa', pointerEvents: 'none', zIndex: 10 }} />

                {/* Move area (interior) */}
                <Box sx={{ position: 'absolute', inset: HIT / 2, cursor: 'move', pointerEvents: 'auto', zIndex: 11 }}
                  {...dragProps} onPointerDown={e => startDrag(e, 'move')} />

                {/* ── Edge handles (bar + hit zone) ── */}
                {/* Top */}
                <Box sx={{ ...edgeSx, left: HANDLE, right: HANDLE, top: -HIT / 2, height: HIT, cursor: 'n-resize', pointerEvents: 'auto' }}
                  {...dragProps} onPointerDown={e => startDrag(e, 'top')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 32, height: HANDLE / 2 }} />
                </Box>
                {/* Bottom */}
                <Box sx={{ ...edgeSx, left: HANDLE, right: HANDLE, bottom: -HIT / 2, height: HIT, cursor: 's-resize', pointerEvents: 'auto' }}
                  {...dragProps} onPointerDown={e => startDrag(e, 'bottom')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 32, height: HANDLE / 2 }} />
                </Box>
                {/* Left */}
                <Box sx={{ ...edgeSx, top: HANDLE, bottom: HANDLE, left: -HIT / 2, width: HIT, cursor: 'w-resize', pointerEvents: 'auto' }}
                  {...dragProps} onPointerDown={e => startDrag(e, 'left')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: HANDLE / 2, height: 32 }} />
                </Box>
                {/* Right */}
                <Box sx={{ ...edgeSx, top: HANDLE, bottom: HANDLE, right: -HIT / 2, width: HIT, cursor: 'e-resize', pointerEvents: 'auto' }}
                  {...dragProps} onPointerDown={e => startDrag(e, 'right')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: HANDLE / 2, height: 32 }} />
                </Box>

                {/* ── Corner handles ── */}
                {([ ['tl','nw-resize',-HIT/2,-HIT/2], ['tr','ne-resize',undefined,-HIT/2],
                    ['bl','sw-resize',-HIT/2,undefined], ['br','se-resize',undefined,undefined] ] as const)
                  .map(([edge, cur, t, l]) => {
                    const right  = (edge === 'tr' || edge === 'br') ? -HIT/2 : undefined;
                    const bottom = (edge === 'bl' || edge === 'br') ? -HIT/2 : undefined;
                    return (
                      <Box key={edge}
                        sx={{
                          ...edgeSx, width: HIT, height: HIT,
                          ...(t      !== undefined ? { top:    t }    : {}),
                          ...(l      !== undefined ? { left:   l }    : {}),
                          ...(right  !== undefined ? { right:  right } : {}),
                          ...(bottom !== undefined ? { bottom: bottom } : {}),
                          cursor: cur, pointerEvents: 'auto',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        {...dragProps} onPointerDown={e => startDrag(e, edge)}>
                        <Box sx={{ width: HANDLE, height: HANDLE, bgcolor: '#60a5fa', borderRadius: '2px' }} />
                      </Box>
                    );
                  })}

                {/* Delete image button */}
                <Box
                  component="button"
                  title="Delete image"
                  onClick={e => {
                    e.stopPropagation();
                    pushUndo(currentIdRef.current, elementsRef.current);
                    commitElements(elementsRef.current.filter(el => el.id !== selectedImgId));
                    setSelectedImgId(null);
                  }}
                  sx={{
                    position: 'absolute', top: -28, right: 0,
                    bgcolor: '#ef4444', color: '#fff', border: 'none', borderRadius: 1,
                    px: 0.75, py: 0.25, fontSize: 11, cursor: 'pointer', pointerEvents: 'auto',
                    zIndex: 13, '&:hover': { bgcolor: '#dc2626' },
                  }}
                >
                  ✕ Delete
                </Box>
              </Box>
            );
          })()}

          {/* Hidden file inputs */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleFileChosen(e.target.files?.[0])} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => handleFileChosen(e.target.files?.[0])} />
        </Box>
      </Box>

      {/* ── Scene panel ──────────────────────────────────────────────────────── */}
      {scenePanelOpen && (() => {
        const currentPage = pages.find(p => p.id === currentPageId);
        const els = currentPage?.elements ?? [];
        const propEl = propElId ? els.find(e => e.id === propElId) ?? null : null;
        return (
          <Box sx={{
            width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.1)', bgcolor: 'background.paper',
            overflow: 'hidden',
          }}>

            {/* Header */}
            <Box sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5,
              borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, flex: 1 }}>Scene</Typography>
              {/*
                Zamknięcie z samego panelu.
                
                Jedynym przełącznikiem był dotąd przycisk w górnym pasku — ten
                sam, który panel otwiera. Otwarty panel zabiera 240 px
                szerokości środkowej kolumny, a pasek nie zawija się ani nie
                przewija, więc przy węższym oknie przycisk wypadał poza obszar
                widoczny i panelu **nie dało się już zamknąć**.
              */}
              <Tooltip title="Zamknij panel">
                <IconButton size="small" onClick={() => setScenePanelOpen(false)} sx={{ p: 0.25 }}>
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Grupuj zaznaczone"><span>
                <IconButton size="small" disabled={!selectedIds.size} onClick={handleGroupSelected}
                  sx={{ p: 0.25 }}><CreateNewFolderOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
              </span></Tooltip>
              <Tooltip title="Cut"><span>
                <IconButton size="small" disabled={!selectedIds.size} onClick={handleCut}
                  sx={{ p: 0.25 }}><ContentCutIcon sx={{ fontSize: 15 }} /></IconButton>
              </span></Tooltip>
              <Tooltip title="Copy"><span>
                <IconButton size="small" disabled={!selectedIds.size} onClick={handleCopy}
                  sx={{ p: 0.25 }}><ContentCopyIcon sx={{ fontSize: 15 }} /></IconButton>
              </span></Tooltip>
              <Tooltip title="Paste"><span>
                <IconButton size="small" disabled={!noteClipboard.length} onClick={handlePaste}
                  sx={{ p: 0.25 }}><ContentPasteIcon sx={{ fontSize: 15 }} /></IconButton>
              </span></Tooltip>
            </Box>

            {/* Object tree — grupy z zagnieżdżeniem + drag-and-drop */}
            {(() => {
              const groups = els.filter((e): e is NoteGroup => e.kind === 'group');
              const groupIds = new Set(groups.map(g => g.id));
              const memberOf = (gid: string) => els.filter(e => e.kind !== 'group' && e.groupId === gid);
              const ungrouped = els.filter(e => e.kind !== 'group' && (!e.groupId || !groupIds.has(e.groupId)));

              const iconFor = (el: NoteElement): React.FC<SvgIconProps> =>
                el.kind === 'stroke' ? (el.tool === 'marker' ? BorderColorIcon : GestureIcon)
                : el.kind === 'text' ? TextFieldsIcon
                : el.kind === 'shape' ? CropSquareIcon
                : ImageOutlinedIcon;

              const selectOne = (el: NoteElement) => {
                const next = new Set([el.id]);
                setSelectedIds(next); selectedRef.current = next;
                selectedGroupRef.current = null; // pojedynczy element, nie cała grupa
                setSelectedImgId(el.kind === 'image' ? el.id : null);
                setPropElId(el.id); redraw();
              };

              const ItemRow = (el: NoteElement, indent: boolean) => {
                const Icon = iconFor(el);
                const isSel = selectedIds.has(el.id);
                return (
                  <Box
                    key={el.id}
                    draggable
                    onDragStart={(e) => { setTreeDragId(el.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.id); }}
                    onDragEnd={() => { setTreeDragId(null); setTreeDropTarget(null); }}
                    onClick={() => selectOne(el)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.4, pl: indent ? 3 : 1,
                      cursor: 'grab', fontSize: 12, opacity: treeDragId === el.id ? 0.4 : 1,
                      bgcolor: isSel ? 'rgba(79,195,247,0.15)' : 'transparent',
                      borderLeft: isSel ? '2px solid #4fc3f7' : '2px solid transparent',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                    }}
                  >
                    <DragIndicatorIcon sx={{ fontSize: 12, color: 'text.disabled', flexShrink: 0 }} />
                    <Icon sx={{ fontSize: 14, color: el.kind === 'stroke' || el.kind === 'shape' ? el.color : 'text.secondary', flexShrink: 0 }} />
                    <Typography variant="caption" noWrap sx={{ flex: 1 }}>{elLabel(el)}</Typography>
                  </Box>
                );
              };

              return (
                <Box
                  sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}
                  onDragOver={(e) => { if (treeDragId) { e.preventDefault(); setTreeDropTarget('__root__'); } }}
                  onDrop={(e) => { e.preventDefault(); if (treeDragId) setElementGroup(treeDragId, null); setTreeDragId(null); setTreeDropTarget(null); }}
                >
                  {els.length === 0 && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', p: 1, display: 'block' }}>
                      Brak obiektów
                    </Typography>
                  )}

                  {/* Grupy */}
                  {groups.map(g => {
                    const members = memberOf(g.id);
                    const dropActive = treeDropTarget === g.id;
                    return (
                      <Box key={g.id}>
                        <Box
                          onClick={() => selectGroup(g.id)}
                          onDragOver={(e) => { if (treeDragId) { e.preventDefault(); e.stopPropagation(); setTreeDropTarget(g.id); } }}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (treeDragId) setElementGroup(treeDragId, g.id); setTreeDragId(null); setTreeDropTarget(null); }}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.4, cursor: 'pointer', fontSize: 12,
                            bgcolor: dropActive ? 'rgba(79,195,247,0.28)' : 'rgba(255,255,255,0.04)',
                            outline: dropActive ? '1px dashed #4fc3f7' : 'none',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                          }}
                        >
                          <Box component="span" onClick={(e) => { e.stopPropagation(); commitElements(elementsRef.current.map(el => el.kind === 'group' && el.id === g.id ? { ...el, collapsed: !g.collapsed } : el), { thumbnail: false }); }}
                            sx={{ width: 14, textAlign: 'center', color: 'text.secondary', userSelect: 'none' }}>
                            {g.collapsed ? '▸' : '▾'}
                          </Box>
                          <FolderOutlinedIcon sx={{ fontSize: 15, color: '#fbbf24', flexShrink: 0 }} />
                          <TextField
                            variant="standard" value={g.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => renameGroup(g.id, e.target.value)}
                            InputProps={{ disableUnderline: true, sx: { fontSize: 12, fontWeight: 600 } }}
                            sx={{ flex: 1 }}
                          />
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>{members.length}</Typography>
                          <Tooltip title="Rozgrupuj"><IconButton size="small" onClick={(e) => { e.stopPropagation(); handleUngroup(g.id); }} sx={{ p: 0.2 }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                        </Box>
                        {!g.collapsed && members.map(m => ItemRow(m, true))}
                        {!g.collapsed && members.length === 0 && (
                          <Typography variant="caption" sx={{ color: 'text.disabled', pl: 3, py: 0.4, display: 'block', fontStyle: 'italic' }}>
                            przeciągnij tutaj…
                          </Typography>
                        )}
                      </Box>
                    );
                  })}

                  {/* Bez grupy */}
                  {groups.length > 0 && ungrouped.length > 0 && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', px: 1, pt: 0.5, display: 'block', fontSize: 10 }}>— bez grupy —</Typography>
                  )}
                  {ungrouped.map(el => ItemRow(el, false))}
                </Box>
              );
            })()}

            <Divider />

            {/* Properties */}
            <Box sx={{ px: 1, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Properties</Typography>
              {propEl && (
                <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
                  {propEl.kind}
                </Typography>
              )}
            </Box>

            <Box sx={{ px: 1, pb: 1, flex: 1, overflow: 'auto', minHeight: 0 }}>
              {!propEl && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>Select an object</Typography>
              )}

              {propEl?.kind === 'stroke' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ width: 60, color: 'text.secondary' }}>Color</Typography>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: propEl.color, border: '1px solid rgba(255,255,255,0.3)' }} />
                    <Typography variant="caption">{propEl.color}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ width: 60, color: 'text.secondary' }}>Tool</Typography>
                    <Typography variant="caption">{propEl.tool}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Width: {propEl.width}</Typography>
                    <Slider size="small" min={1} max={40} value={propEl.width}
                      onChange={(_, v) => updatePropEl({ width: v as number })} />
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {propEl.points.length} points
                  </Typography>
                </Box>
              )}

              {propEl?.kind === 'text' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField size="small" label="Text" multiline maxRows={4} value={propEl.text}
                    onChange={e => updatePropEl({ text: e.target.value })}
                    sx={{ '& .MuiInputBase-root': { fontSize: 12 } }} />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField size="small" label="X" type="number" value={Math.round(propEl.x)}
                      onChange={e => updatePropEl({ x: Number(e.target.value) })}
                      sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 12 } }} />
                    <TextField size="small" label="Y" type="number" value={Math.round(propEl.y)}
                      onChange={e => updatePropEl({ y: Number(e.target.value) })}
                      sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 12 } }} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Font size: {propEl.fontSize}px</Typography>
                    <Slider size="small" min={8} max={120} value={propEl.fontSize}
                      onChange={(_, v) => updatePropEl({ fontSize: v as number })} />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ width: 40, color: 'text.secondary' }}>Color</Typography>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: propEl.color, border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}
                      onClick={() => { const c = document.createElement('input'); c.type = 'color'; c.value = propEl.color;
                        c.onchange = () => updatePropEl({ color: c.value }); c.click(); }} />
                    <Typography variant="caption">{propEl.color}</Typography>
                  </Box>
                </Box>
              )}

              {propEl?.kind === 'image' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField size="small" label="X" type="number" value={Math.round(propEl.x)}
                      onChange={e => updatePropEl({ x: Number(e.target.value) })}
                      sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 12 } }} />
                    <TextField size="small" label="Y" type="number" value={Math.round(propEl.y)}
                      onChange={e => updatePropEl({ y: Number(e.target.value) })}
                      sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 12 } }} />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField size="small" label="W" type="number" value={Math.round(propEl.w)}
                      onChange={e => updatePropEl({ w: Math.max(10, Number(e.target.value)) })}
                      sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 12 } }} />
                    <TextField size="small" label="H" type="number" value={Math.round(propEl.h)}
                      onChange={e => updatePropEl({ h: Math.max(10, Number(e.target.value)) })}
                      sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: 12 } }} />
                  </Box>
                  {propEl.src && (
                    <Box component="img" src={propEl.src}
                      sx={{ width: '100%', height: 80, objectFit: 'contain', bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 1 }} />
                  )}
                </Box>
              )}

              {propEl?.kind === 'shape' && (() => {
                const target = propEl.linkTo ? elementsRef.current.find(e => e.id === propEl.linkTo) : null;
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>LinkTo (obiekt sceny)</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Button size="small" variant="outlined" onClick={() => setLinkToPicker(propEl.id)}
                        sx={{ flex: 1, minWidth: 0, textTransform: 'none', justifyContent: 'flex-start', fontSize: 12 }}>
                        {target ? nodeLabel(target) : 'Wybierz…'}
                      </Button>
                      {propEl.linkTo && (
                        <>
                          <Tooltip title="Przejdź do obiektu">
                            <IconButton size="small" onClick={() => panToElement(propEl.linkTo!)}>
                              <MyLocationIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Usuń powiązanie">
                            <IconButton size="small" onClick={() => updatePropEl({ linkTo: undefined })}>
                              <LinkOffIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                    {target === null && propEl.linkTo && (
                      <Typography variant="caption" sx={{ color: 'warning.main' }}>Cel nie istnieje (usunięty)</Typography>
                    )}
                  </Box>
                );
              })()}

              {propEl?.kind === 'shape' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>InfoMd (opis Markdown)</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Button size="small" variant="outlined"
                      onClick={() => setInfoMdDialog({ id: propEl.id, text: propEl.infoMd ?? '' })}
                      sx={{ flex: 1, minWidth: 0, textTransform: 'none', justifyContent: 'flex-start', fontSize: 12 }}>
                      {propEl.infoMd?.trim() ? 'Edytuj opis…' : 'Dodaj opis…'}
                    </Button>
                    {propEl.infoMd?.trim() && (
                      <Tooltip title="Usuń opis">
                        <IconButton size="small" onClick={() => updatePropEl({ infoMd: undefined })}>
                          <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              )}
            </Box>

          </Box>
        );
      })()}

      {/* Server file browser (open / save .notes.json) */}
      {notesBrowser && (
        <ServerFileBrowser
          open
          mode={notesBrowser}
          title={notesBrowser === 'open' ? 'Open Notes from Server' : 'Save Notes to Server'}
          extension={NOTES_EXT}
          defaultName={notesFile?.name ?? 'untitled'}
          storageKey="notes.serverFileBrowser.dir"
          onClose={() => setNotesBrowser(null)}
          onOpen={handleNotesOpen}
          onSave={handleNotesSave}
          onDone={name => { setNotesBrowser(null); if (notesBrowser === 'open') setNotesToast(`Opened "${name}"`); }}
        />
      )}

      {/* Popup linku przy obiekcie: Otwórz / Edytuj / Usuń */}
      <Popover
        open={Boolean(linkPopup)} anchorEl={linkPopup?.anchor}
        onClose={() => setLinkPopup(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {linkPopup && (() => {
          const el = elementsRef.current.find(e => e.id === linkPopup.id);
          const url = el && 'link' in el ? el.link : '';
          return (
            <Box sx={{ p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 160 }}>
              <Typography variant="caption" sx={{ px: 1, py: 0.5, color: 'text.secondary', wordBreak: 'break-all' }}>{url}</Typography>
              <Divider />
              <Button size="small" startIcon={<OpenInNewIcon />} sx={{ justifyContent: 'flex-start' }}
                onClick={() => { if (url) window.open(url, '_blank', 'noopener'); setLinkPopup(null); }}>Otwórz</Button>
              <Button size="small" startIcon={<EditIcon />} sx={{ justifyContent: 'flex-start' }}
                onClick={() => { setLinkDialog({ id: linkPopup.id, url: url || '' }); setLinkPopup(null); }}>Edytuj</Button>
              <Button size="small" color="error" startIcon={<LinkOffIcon />} sx={{ justifyContent: 'flex-start' }}
                onClick={() => { setElementLink(linkPopup.id, ''); setLinkPopup(null); }}>Usuń link</Button>
            </Box>
          );
        })()}
      </Popover>

      {/* Dialog ustawiania/edycji linku */}
      <Dialog open={Boolean(linkDialog)} onClose={() => setLinkDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Link do strony</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" margin="dense" label="Adres URL"
            placeholder="https://…"
            value={linkDialog?.url ?? ''}
            onChange={e => setLinkDialog(d => d ? { ...d, url: e.target.value } : d)}
            onKeyDown={e => { if (e.key === 'Enter' && linkDialog) { setElementLink(linkDialog.id, linkDialog.url); setLinkDialog(null); } }}
          />
        </DialogContent>
        <DialogActions>
          {linkDialog && (
            <Button color="error" onClick={() => { setElementLink(linkDialog.id, ''); setLinkDialog(null); }}>Usuń</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setLinkDialog(null)}>Anuluj</Button>
          <Button variant="contained" onClick={() => { if (linkDialog) { setElementLink(linkDialog.id, linkDialog.url); setLinkDialog(null); } }}>Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* Wybór celu LinkTo — lista obiektów sceny z bieżącej strony */}
      <Dialog open={Boolean(linkToPicker)} onClose={() => setLinkToPicker(null)} maxWidth="xs" fullWidth>
        <DialogTitle>LinkTo — wybierz obiekt sceny</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {(() => {
            const els = elementsRef.current.filter(e => e.id !== linkToPicker && e.kind !== 'group');
            if (!els.length) return <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>Brak innych obiektów na tej stronie.</Typography>;
            return (
              <List dense disablePadding>
                {els.slice().reverse().map(e => (
                  <ListItemButton key={e.id}
                    onClick={() => {
                      const target = linkToPicker;
                      if (target) {
                        commitElements(elementsRef.current.map(x => x.id === target && x.kind === 'shape' ? { ...x, linkTo: e.id } : x), { thumbnail: false });
                        redraw();
                      }
                      setLinkToPicker(null);
                    }}>
                    <ListItemText
                      primary={nodeLabel(e)}
                      secondary={e.kind}
                      primaryTypographyProps={{ fontSize: 13 }}
                      secondaryTypographyProps={{ fontSize: 11 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkToPicker(null)}>Anuluj</Button>
        </DialogActions>
      </Dialog>

      {/* Edycja opisu Markdown (InfoMd) */}
      <Dialog open={Boolean(infoMdDialog)} onClose={() => setInfoMdDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>InfoMd — opis (Markdown)</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus fullWidth multiline minRows={6} maxRows={16} size="small"
            placeholder="# Tytuł&#10;&#10;Opis w **Markdown**, listy, `kod`, [linki](https://…)…"
            value={infoMdDialog?.text ?? ''}
            onChange={e => setInfoMdDialog(d => d ? { ...d, text: e.target.value } : d)}
            sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 13 } }}
          />
          {infoMdDialog?.text.trim() && (
            <>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5, mb: 0.5 }}>Podgląd</Typography>
              <Box sx={{ p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider', maxHeight: 200, overflowY: 'auto', fontSize: 13, '& p': { my: 0.5 }, '& h1,& h2,& h3': { my: 0.5 }, '& code': { bgcolor: 'action.selected', px: 0.5, borderRadius: 0.5 } }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(infoMdDialog.text) }} />
            </>
          )}
        </DialogContent>
        <DialogActions>
          {infoMdDialog && (
            <Button color="error" onClick={() => {
              const id = infoMdDialog.id;
              commitElements(elementsRef.current.map(x => x.id === id && x.kind === 'shape' ? { ...x, infoMd: undefined } : x), { thumbnail: false });
              redraw(); setInfoMdDialog(null);
            }}>Usuń</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setInfoMdDialog(null)}>Anuluj</Button>
          <Button variant="contained" onClick={() => {
            if (!infoMdDialog) return;
            const { id, text } = infoMdDialog;
            const val = text.trim() ? text : undefined;
            commitElements(elementsRef.current.map(x => x.id === id && x.kind === 'shape' ? { ...x, infoMd: val } : x), { thumbnail: false });
            redraw(); setInfoMdDialog(null);
          }}>Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* Popup wyświetlający sformatowany opis Markdown przy obiekcie */}
      <Popover
        open={Boolean(infoMdPopup)} anchorEl={infoMdPopup?.anchor}
        onClose={() => setInfoMdPopup(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {infoMdPopup && (() => {
          const el = elementsRef.current.find(e => e.id === infoMdPopup.id);
          const md = el && el.kind === 'shape' ? el.infoMd ?? '' : '';
          return (
            <Box sx={{
              p: 1.5, maxWidth: 360, maxHeight: 320, overflowY: 'auto', fontSize: 13,
              '& p': { my: 0.5 }, '& h1': { fontSize: 18, my: 0.5 }, '& h2': { fontSize: 16, my: 0.5 }, '& h3': { fontSize: 14, my: 0.5 },
              '& ul,& ol': { my: 0.5, pl: 2.5 }, '& code': { bgcolor: 'action.selected', px: 0.5, borderRadius: 0.5, fontFamily: 'monospace' },
              '& a': { color: 'primary.main' }, '& img': { maxWidth: '100%' },
            }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />
          );
        })()}
      </Popover>

      <Snackbar
        open={notesToast !== null}
        autoHideDuration={2500}
        onClose={() => setNotesToast(null)}
        message={notesToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
