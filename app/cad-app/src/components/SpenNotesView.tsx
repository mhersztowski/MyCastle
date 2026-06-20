import { useCallback, useEffect, useRef, useState } from 'react';
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
import GpsNotFixedIcon from '@mui/icons-material/GpsNotFixed';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import type { SvgIconProps } from '@mui/material';

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotePoint { x: number; y: number; p: number; }

interface NoteStroke {
  id: string; kind: 'stroke';
  tool: 'pencil' | 'marker';
  color: string; width: number;
  points: NotePoint[];
}

interface NoteText {
  id: string; kind: 'text';
  x: number; y: number;
  text: string; fontSize: number; color: string;
}

interface NoteImage {
  id: string; kind: 'image';
  x: number; y: number; w: number; h: number;
  src: string;
}

type NoteElement = NoteStroke | NoteText | NoteImage;
interface NotePage { id: string; elements: NoteElement[]; bgColor?: string; }
type NoteTool = 'text' | 'pencil' | 'marker' | 'eraser' | 'lasso';
type ResizeEdge = 'move' | 'top' | 'right' | 'bottom' | 'left' | 'tl' | 'tr' | 'bl' | 'br';

// ── Constants ──────────────────────────────────────────────────────────────────

const CANVAS_W = 1400;
const CANVAS_H = 900;
const DEFAULT_BG = '#1a1a1a';
const STORAGE_KEY = 'spen-notes';
const MAX_UNDO = 50;
const THUMB_W = 148;
const THUMB_H = Math.round(THUMB_W * CANVAS_H / CANVAS_W);

const PALETTE = [
  '#ffffff', '#e5e7eb', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#a855f7',
  '#ec4899', '#94a3b8',
];

const BG_THEMES: { color: string; label: string; dark: boolean }[] = [
  { color: '#000000', label: 'Black',       dark: true  },
  { color: '#1a1a1a', label: 'Dark',        dark: true  },
  { color: '#ffffff', label: 'White',       dark: false },
  { color: '#fef3c7', label: 'Paper',       dark: false },
];

const TOOLS: { t: NoteTool; label: string; Icon: React.FC<SvgIconProps> }[] = [
  { t: 'text',   label: 'Text (click to place)',  Icon: TextFieldsIcon },
  { t: 'pencil', label: 'Pencil (pressure-sensitive)', Icon: GestureIcon },
  { t: 'marker', label: 'Marker (thick, semi-transparent)', Icon: BorderColorIcon },
  { t: 'eraser', label: 'Eraser', Icon: AutoFixNormalIcon },
  { t: 'lasso',  label: 'Lasso select', Icon: GpsNotFixedIcon },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const newPage = (): NotePage => ({ id: uid(), elements: [] });

function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

const imgCache = new Map<string, HTMLImageElement>();
function getImg(src: string): HTMLImageElement {
  if (!imgCache.has(src)) {
    const img = new Image();
    img.src = src;
    imgCache.set(src, img);
  }
  return imgCache.get(src)!;
}

function hitImage(el: NoteImage, lx: number, ly: number): boolean {
  return lx >= el.x && lx <= el.x + el.w && ly >= el.y && ly <= el.y + el.h;
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
    const hi = selected.has(el.id);
    if (el.kind === 'image') {
      const img = getImg(el.src);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, el.x * sx, el.y * sy, el.w * sx, el.h * sy);
      }
      if (hi) {
        ctx.save();
        ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.strokeRect(el.x * sx, el.y * sy, el.w * sx, el.h * sy);
        ctx.restore();
      }
    } else if (el.kind === 'text') {
      ctx.font = `${el.fontSize * sy}px sans-serif`;
      ctx.fillStyle = hi ? '#60a5fa' : el.color;
      ctx.fillText(el.text, el.x * sx, el.y * sy);
    } else {
      const pts = el.points;
      if (pts.length < 2) continue;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (el.tool === 'marker') {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = hi ? '#60a5fa' : el.color;
        ctx.lineWidth = el.width * sx;
        ctx.beginPath();
        ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
        ctx.stroke();
      } else {
        ctx.strokeStyle = hi ? '#60a5fa' : el.color;
        for (let i = 1; i < pts.length; i++) {
          const pr = pts[i].p || 0.5;
          ctx.lineWidth = Math.max(0.5, el.width * pr * 2 * sx);
          ctx.beginPath();
          ctx.moveTo(pts[i-1].x * sx, pts[i-1].y * sy);
          ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: NoteStroke, sx: number, sy: number) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (stroke.tool === 'marker') {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * sx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x * sx, pts[0].y * sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * sx, pts[i].y * sy);
    ctx.stroke();
  } else {
    ctx.strokeStyle = stroke.color;
    for (let i = 1; i < pts.length; i++) {
      const pr = pts[i].p || 0.5;
      ctx.lineWidth = Math.max(0.5, stroke.width * pr * 2 * sx);
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

// ── Component ─────────────────────────────────────────────────────────────────

export function SpenNotesView() {
  // React state
  const [pages, setPages] = useState<NotePage[]>(() => loadStorage().pages);
  const [currentPageId, setCurrentPageId] = useState<string>(() => loadStorage().currentId);
  const [tool, setTool] = useState<NoteTool>('pencil');
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [textInput, setTextInput] = useState<{ x: number; y: number; val: string } | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
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
  const lassoRef = useRef<NotePoint[]>([]);
  const eraserActiveRef = useRef(false);
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

  // Stable refs for DOM event handlers
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const brushRef = useRef(brushSize);
  const selectedRef = useRef(selectedIds);
  const currentIdRef = useRef(currentPageId);
  const bgColorRef = useRef(DEFAULT_BG);
  const undoStacks = useRef<Record<string, NoteElement[][]>>({});
  const redoStacks = useRef<Record<string, NoteElement[][]>>({});

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { brushRef.current = brushSize; }, [brushSize]);
  useEffect(() => { selectedRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { currentIdRef.current = currentPageId; }, [currentPageId]);

  // Sync elementsRef + bgColorRef when pages/currentPage changes
  useEffect(() => {
    const page = pages.find(p => p.id === currentPageId);
    elementsRef.current = page?.elements ?? [];
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
    if (lassoRef.current.length > 1 && toolRef.current === 'lasso')
      renderLasso(ctx, lassoRef.current, sx, sy);
    ctx.restore();
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
  useEffect(() => { redraw(); }, [pages, currentPageId, selectedIds, redraw]);

  // Debug panel auto-refresh (2×/s when visible, zero cost when hidden)
  useEffect(() => {
    if (!debugVisible) return;
    const id = setInterval(() => setDebugTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [debugVisible]);

  // ── Commit helpers ───────────────────────────────────────────────────────────

  const triggerThumbnail = useCallback((pageId: string, elements: NoteElement[]) => {
    setTimeout(() => {
      const url = makeThumbnail({ id: pageId, elements });
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

    // ── Touch (finger) handlers: pan + pinch zoom, no drawing ───────────────
    const onTouchDown = (e: PointerEvent) => {
      dbg(`TOUCH_DN id=${e.pointerId} cx=${e.clientX.toFixed(0)} cy=${e.clientY.toFixed(0)} pan=${panPxRef.current.x.toFixed(1)},${panPxRef.current.y.toFixed(1)}`);
      activePointersRef.current.set(e.pointerId, { cx: e.clientX, cy: e.clientY });
      if (activePointersRef.current.size >= 2) {
        startPinch();
      } else {
        // Start single-finger pan
        const { bx, by } = toBufPxFromClient(e.clientX, e.clientY);
        // Guard: if canvas has no size yet, bx/by would be 0 (safe per toBufPxFromClient guard)
        // but if somehow NaN slips through, ignore this touch to protect panPxRef
        if (!isFinite(bx) || !isFinite(by)) return;
        singleTouchPanRef.current = { startBx: bx, startBy: by, startPan: { ...panPxRef.current } };
        pinchRef.current = null;
      }
    };

    const onTouchMove = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { cx: e.clientX, cy: e.clientY });

      if (pinchRef.current && activePointersRef.current.size >= 2) {
        // Pinch zoom + pan
        const { initDist, initZoom, initPan, initMidPx } = pinchRef.current;
        if (initDist < 20) return; // degenerate pinch — skip to avoid Infinity/NaN zoom
        const pts = [...activePointersRef.current.values()];
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
        return;
      }

      // Single-finger pan
      if (singleTouchPanRef.current && activePointersRef.current.size === 1) {
        const { bx, by } = toBufPxFromClient(e.clientX, e.clientY);
        const { startBx, startBy, startPan } = singleTouchPanRef.current;
        const newX = startPan.x + (bx - startBx);
        const newY = startPan.y + (by - startBy);
        // Guard: phantom touch with invalid coords (NaN/Infinity) must not corrupt pan
        if (isFinite(newX) && isFinite(newY)) {
          panPxRef.current = { x: newX, y: newY };
          redraw();
        } else {
          dbg(`PAN_BLOCKED bx=${bx} startBx=${startBx} → newX=${newX}`);
        }
      }
    };

    const onTouchUp = (e: PointerEvent) => {
      dbg(`TOUCH_UP id=${e.pointerId} remaining=${activePointersRef.current.size - 1} pan=${panPxRef.current.x.toFixed(1)},${panPxRef.current.y.toFixed(1)}`);
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) pinchRef.current = null;
      if (activePointersRef.current.size === 0) singleTouchPanRef.current = null;
      // If one finger remains after pinch, restart single-pan from current position
      if (activePointersRef.current.size === 1 && !pinchRef.current) {
        const remaining = [...activePointersRef.current.entries()][0];
        const { bx, by } = toBufPxFromClient(remaining[1].cx, remaining[1].cy);
        singleTouchPanRef.current = { startBx: bx, startBy: by, startPan: { ...panPxRef.current } };
      }
    };

    // ── Pen / mouse handlers: drawing ────────────────────────────────────────
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { onTouchDown(e); return; }
      dbg(`PEN_DN id=${e.pointerId} type=${e.pointerType} p=${e.pressure.toFixed(2)} els=${elementsRef.current.length} pan=${panPxRef.current.x.toFixed(1)},${panPxRef.current.y.toFixed(1)}`);

      c.setPointerCapture(e.pointerId);
      const { x, y } = toLogical(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const t = toolRef.current;

      if (t === 'text') return; // handled by React click

      // Image hit-test (works in all non-text tools)
      const imgs = elementsRef.current.filter((el): el is NoteImage => el.kind === 'image');
      for (let i = imgs.length - 1; i >= 0; i--) {
        if (hitImage(imgs[i], x, y)) {
          setSelectedImgId(imgs[i].id);
          return;
        }
      }
      setSelectedImgId(null);

      if (t === 'lasso') {
        setSelectedIds(new Set());
        lassoRef.current = [{ x, y, p: 1 }];
        return;
      }

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

      activeStrokeRef.current = {
        id: uid(), kind: 'stroke',
        tool: t as 'pencil' | 'marker',
        color: colorRef.current,
        width: brushRef.current,
        points: [{ x, y, p: pressure }],
      };
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { onTouchMove(e); return; }

      if (!e.buttons) return;
      const { x, y } = toLogical(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const t = toolRef.current;

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

      if (!activeStrokeRef.current) return;
      const pts = activeStrokeRef.current.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 0.8) {
        pts.push({ x, y, p: pressure });
        redraw();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') { onTouchUp(e); return; }

      eraserActiveRef.current = false;
      const t = toolRef.current;

      if (t === 'lasso') {
        const lasso = lassoRef.current;
        if (lasso.length > 3) {
          const sel = new Set<string>();
          for (const el of elementsRef.current) {
            if (el.kind === 'stroke' && strokeInLasso(el, lasso)) sel.add(el.id);
          }
          setSelectedIds(sel);
          selectedRef.current = sel;
        }
        lassoRef.current = [];
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
      dbg(`PEN_UP pts=${stroke.points.length} commit=${committed} els_before=${elementsRef.current.length} pan=${panPxRef.current.x.toFixed(1)},${panPxRef.current.y.toFixed(1)} z=${zoomRef.current.toFixed(2)}`);
      if (committed) {
        pushUndo(currentIdRef.current, elementsRef.current);
        commitElements([...elementsRef.current, stroke]);
      }
      activeStrokeRef.current = null;
      redraw();
      dbg(`PEN_UP_AFTER_REDRAW els=${elementsRef.current.length} pan=${panPxRef.current.x.toFixed(1)},${panPxRef.current.y.toFixed(1)}`);
    };

    const onCancel = (e: PointerEvent) => {
      dbg(`CANCEL type=${e.pointerType} id=${e.pointerId} activeStroke=${activeStrokeRef.current?.points.length ?? 'null'}`);
      if (e.pointerType === 'touch') { onTouchUp(e); return; }
      // Pen cancel: commit partial stroke if long enough
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
    if (toolRef.current !== 'text') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * CANVAS_W;
    const y = (e.clientY - r.top) / r.height * CANVAS_H;
    setTextInput({ x, y, val: '' });
  };

  const commitText = useCallback((text: string, x: number, y: number) => {
    setTextInput(null);
    if (!text.trim()) return;
    const el: NoteText = { id: uid(), kind: 'text', x, y, text, fontSize: 20, color: colorRef.current };
    pushUndo(currentIdRef.current, elementsRef.current);
    commitElements([...elementsRef.current, el]);
  }, [commitElements, pushUndo]);

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
      img.onload = () => insertImage(src, img.naturalWidth, img.naturalHeight);
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [insertImage]);

  const setPageBgColor = useCallback((bgColor: string) => {
    bgColorRef.current = bgColor;
    // Auto-switch ink to ensure contrast with new background
    const lightBg  = isLightColor(bgColor);
    const lightInk = isLightColor(colorRef.current);
    if (lightBg && lightInk) {
      const dark = '#1a1a1a';
      colorRef.current = dark;
      setColor(dark);
    } else if (!lightBg && !lightInk) {
      const light = '#ffffff';
      colorRef.current = light;
      setColor(light);
    }
    const pageId = currentIdRef.current;
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, bgColor } : p));
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
      case 'text': return 'text';
      case 'eraser': return 'cell';
      case 'lasso': return 'crosshair';
      default: return 'crosshair';
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const hasSelection = selectedIds.size > 0;
  const canUndo = (undoStacks.current[currentPageId]?.length ?? 0) > 0;
  const canRedo = (redoStacks.current[currentPageId]?.length ?? 0) > 0;
  void historyVer; // used to trigger re-render on undo/redo
  const currentBgColor = pages.find(p => p.id === currentPageId)?.bgColor ?? DEFAULT_BG;

  // Text input screen position
  const getTextInputPos = () => {
    if (!textInput || !canvasRef.current) return { left: 0, top: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    return {
      left: textInput.x / CANVAS_W * r.width + r.left,
      top: textInput.y / CANVAS_H * r.height + r.top - 14,
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
          bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Tool buttons */}
          {TOOLS.map(({ t, label, Icon }) => (
            <Tooltip key={t} title={label}>
              <IconButton
                size="small"
                onClick={() => { setTool(t); setSelectedIds(new Set()); }}
                sx={{
                  color: tool === t ? 'primary.main' : 'text.secondary',
                  bgcolor: tool === t ? 'action.selected' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderRadius: 1,
                }}
              >
                <Icon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          ))}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Color swatch + picker */}
          <Tooltip title="Color">
            <Box
              component="button"
              onClick={e => setColorAnchor(e.currentTarget as HTMLElement)}
              sx={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                bgcolor: color, border: '2px solid rgba(255,255,255,0.25)',
                cursor: 'pointer', outline: 'none',
                '&:hover': { borderColor: 'rgba(255,255,255,0.65)' },
              }}
            />
          </Tooltip>

          <Popover
            open={Boolean(colorAnchor)}
            anchorEl={colorAnchor}
            onClose={() => setColorAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Box sx={{ p: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 28px)', gap: 0.5, mb: 1 }}>
                {PALETTE.map(c => (
                  <Box
                    key={c}
                    component="button"
                    onClick={() => { setColor(c); setColorAnchor(null); }}
                    sx={{
                      width: 28, height: 28, borderRadius: 1, bgcolor: c,
                      border: c === color ? '2px solid white' : '2px solid transparent',
                      cursor: 'pointer', outline: 'none',
                      '&:hover': { opacity: 0.85 },
                    }}
                  />
                ))}
              </Box>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width: '100%', height: 32, cursor: 'pointer', borderRadius: 4 }}
              />
            </Box>
          </Popover>

          {/* Brush size (not for text / lasso) */}
          {tool !== 'lasso' && tool !== 'text' && (
            <Box sx={{ width: 90, mx: 1 }}>
              <Slider
                size="small"
                min={1}
                max={tool === 'marker' ? 60 : tool === 'eraser' ? 40 : 20}
                step={1}
                value={brushSize}
                onChange={(_, v) => setBrushSize(v as number)}
              />
            </Box>
          )}

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

          {/* Insert image */}
          <Tooltip title="Insert image">
            <IconButton size="small" onClick={e => setImgAnchor(e.currentTarget)}
              sx={{ color: 'text.secondary' }}>
              <AddPhotoAlternateIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
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

          {/* Debug toggle */}
          <Box sx={{ ml: 'auto' }}>
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
            style={{
              width: '100%', height: '100%', display: 'block',
              cursor: getCursor(), touchAction: 'none',
            }}
          />

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
                <TextField
                  autoFocus
                  size="small"
                  placeholder="Type, then Enter…"
                  value={textInput.val}
                  onChange={e => setTextInput(prev => prev ? { ...prev, val: e.target.value } : null)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) commitText(textInput.val, textInput.x, textInput.y);
                    if (e.key === 'Escape') setTextInput(null);
                  }}
                  onBlur={() => commitText(textInput.val, textInput.x, textInput.y)}
                  sx={{
                    minWidth: 180,
                    '& .MuiInputBase-input': { color, fontSize: 18, py: 0.4, px: 0.75 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                    '& .MuiInputBase-root': { bgcolor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' },
                  }}
                />
              </Box>
            );
          })()}
          {/* Image resize overlay — zoomPct in scope ensures re-render on zoom */}
          {(() => {
            void zoomPct; // re-render when zoom changes
            if (!selectedImgId) return null;
            const imgEl = elementsRef.current.find(
              (el): el is NoteImage => el.kind === 'image' && el.id === selectedImgId,
            );
            // Use React-state-derived position (updates after commitElements)
            const imgState = pages
              .find(p => p.id === currentPageId)
              ?.elements.find((el): el is NoteImage => el.kind === 'image' && el.id === selectedImgId);
            if (!imgEl && !imgState) return null;
            const im = imgState ?? imgEl!;

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
              if (!d || !e.buttons) return;
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
              // Imperatively update ref + redraw (no React state → no re-render lag)
              elementsRef.current = elementsRef.current.map(el =>
                el.id === selectedImgId ? { ...el, x, y, w, h } : el,
              );
              redraw();
            };

            const onDragEnd = () => {
              if (!imgDragRef.current) return;
              imgDragRef.current = null;
              // Commit to React state (triggers re-render + thumbnail)
              commitElements(elementsRef.current);
            };

            const handleSx = { position: 'absolute', bgcolor: '#60a5fa', borderRadius: '2px', zIndex: 12 } as const;
            const edgeSx   = { position: 'absolute', zIndex: 11 } as const;

            return (
              <Box
                sx={{
                  position: 'absolute',
                  left: `${pctLeft}%`, top: `${pctTop}%`,
                  width: `${pctWidth}%`, height: `${pctHeight}%`,
                  zIndex: 10, pointerEvents: 'none',
                }}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
              >
                {/* Dashed border */}
                <Box sx={{ position: 'absolute', inset: 0, border: '2px dashed #60a5fa', pointerEvents: 'none', zIndex: 10 }} />

                {/* Move area (interior) */}
                <Box sx={{ position: 'absolute', inset: HIT / 2, cursor: 'move', pointerEvents: 'auto', zIndex: 11 }}
                  onPointerDown={e => startDrag(e, 'move')} />

                {/* ── Edge handles (bar + hit zone) ── */}
                {/* Top */}
                <Box sx={{ ...edgeSx, left: HANDLE, right: HANDLE, top: -HIT / 2, height: HIT, cursor: 'n-resize', pointerEvents: 'auto' }}
                  onPointerDown={e => startDrag(e, 'top')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 32, height: HANDLE / 2 }} />
                </Box>
                {/* Bottom */}
                <Box sx={{ ...edgeSx, left: HANDLE, right: HANDLE, bottom: -HIT / 2, height: HIT, cursor: 's-resize', pointerEvents: 'auto' }}
                  onPointerDown={e => startDrag(e, 'bottom')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 32, height: HANDLE / 2 }} />
                </Box>
                {/* Left */}
                <Box sx={{ ...edgeSx, top: HANDLE, bottom: HANDLE, left: -HIT / 2, width: HIT, cursor: 'w-resize', pointerEvents: 'auto' }}
                  onPointerDown={e => startDrag(e, 'left')}>
                  <Box sx={{ ...handleSx, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: HANDLE / 2, height: 32 }} />
                </Box>
                {/* Right */}
                <Box sx={{ ...edgeSx, top: HANDLE, bottom: HANDLE, right: -HIT / 2, width: HIT, cursor: 'e-resize', pointerEvents: 'auto' }}
                  onPointerDown={e => startDrag(e, 'right')}>
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
                        onPointerDown={e => startDrag(e, edge)}>
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
    </Box>
  );
}
