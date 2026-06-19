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

type NoteElement = NoteStroke | NoteText;
interface NotePage { id: string; elements: NoteElement[]; bgColor?: string; }
type NoteTool = 'text' | 'pencil' | 'marker' | 'eraser' | 'lasso';

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
) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const el of elements) {
    const hi = selected.has(el.id);
    if (el.kind === 'text') {
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

  // Drawing refs (updated synchronously, not through React)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elementsRef = useRef<NoteElement[]>([]);
  const activeStrokeRef = useRef<NoteStroke | null>(null);
  const lassoRef = useRef<NotePoint[]>([]);
  const eraserActiveRef = useRef(false);

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
    renderElements(ctx, elementsRef.current, selectedRef.current, sx, sy, bgColorRef.current);
    if (activeStrokeRef.current) renderStroke(ctx, activeStrokeRef.current, sx, sy);
    if (lassoRef.current.length > 1 && toolRef.current === 'lasso')
      renderLasso(ctx, lassoRef.current, sx, sy);
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

  // ── Commit helpers ───────────────────────────────────────────────────────────

  const triggerThumbnail = useCallback((pageId: string, elements: NoteElement[]) => {
    setTimeout(() => {
      const url = makeThumbnail({ id: pageId, elements });
      setThumbnails(prev => ({ ...prev, [pageId]: url }));
    }, 0);
  }, []);

  const commitElements = useCallback((elements: NoteElement[]) => {
    elementsRef.current = elements;
    const pageId = currentIdRef.current;
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, elements } : p));
    triggerThumbnail(pageId, elements);
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

    const toLogical = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * CANVAS_W,
        y: (e.clientY - r.top) / r.height * CANVAS_H,
      };
    };

    const onDown = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      const { x, y } = toLogical(e);
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const t = toolRef.current;

      if (t === 'text') return; // handled by React click

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
      // Add final point
      const { x, y } = toLogical(e);
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 0.8)
        stroke.points.push({ x, y, p: e.pressure > 0 ? e.pressure : 0.5 });

      if (stroke.points.length >= 2) {
        pushUndo(currentIdRef.current, elementsRef.current);
        commitElements([...elementsRef.current, stroke]);
      }
      activeStrokeRef.current = null;
      redraw();
    };

    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
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

  const setPageBgColor = useCallback((color: string) => {
    bgColorRef.current = color;
    const pageId = currentIdRef.current;
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, bgColor: color } : p));
    // Redraw immediately (bgColorRef already updated)
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
      <Box sx={{
        width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column',
        bgcolor: 'background.paper', borderRight: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', px: 1, py: 0.5, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
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

          {/* Background theme presets */}
          {BG_THEMES.map(({ color: bg, label, dark }) => (
            <Tooltip key={bg} title={`Background: ${label}`}>
              <Box
                component="button"
                onClick={() => setPageBgColor(bg)}
                sx={{
                  width: 22, height: 22, borderRadius: 1, flexShrink: 0,
                  bgcolor: bg, cursor: 'pointer', outline: 'none',
                  border: currentBgColor === bg
                    ? '2px solid #60a5fa'
                    : `2px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.25)'}`,
                  '&:hover': { borderColor: '#60a5fa' },
                  transition: 'border-color 0.15s',
                }}
              />
            </Tooltip>
          ))}

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
        </Box>
      </Box>
    </Box>
  );
}
