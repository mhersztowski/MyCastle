/**
 * DashQtRender — a live design surface for the `.dash.json` editor. Renders every
 * `qt-widget` scene object with the real MinisQt runtime (packages/core/browser/qt)
 * on a <qt-canvas>, and overlays HTML move/resize handles that write back to each
 * object's transform. Selection is shared with the rest of the editor.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { ensureQtLib } from '../../modules/qtui/qtLib';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface QtTransform { x: number; y: number; width: number; height: number; rot?: number; scale?: number }
export interface QtRenderObject {
  id: string;
  className: string;                 // widget type, e.g. 'QPushButton'
  transform: QtTransform;
  properties?: Record<string, unknown>;
}

interface Props {
  objects: QtRenderObject[];
  selectedIds: Set<string>;
  width?: number;
  height?: number;
  onSelect: (id: string, additive: boolean) => void;
  /** Persist a transform change (fired on drag end). */
  onTransform: (id: string, patch: Partial<QtTransform>) => void;
}

const DEFAULT_W = 800;
const DEFAULT_H = 480;
const MIN_SIZE = 8;

type HandleDir = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const RESIZE_HANDLES: Exclude<HandleDir, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_CURSOR: Record<string, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

/** Reflection-based widget builder (a lean version of qtLib.buildQtWidget for the
 *  flat DashObject shape — text/value/checked/min/max applied best-effort). */
function buildWidget(obj: QtRenderObject, g: any): any {
  const Cls = g[obj.className];
  if (typeof Cls !== 'function') return null;
  const p = (obj.properties ?? {}) as Record<string, any>;
  const hasText = /Button|Label|CheckBox|GroupBox/.test(obj.className);
  let w: any;
  try { w = hasText && p.text != null ? new Cls(String(p.text)) : new Cls(); }
  catch { try { w = new Cls(); } catch { return null; } }
  const call = (m: string, ...a: any[]) => { if (typeof w[m] === 'function') { try { w[m](...a); } catch { /* best-effort */ } } };
  call('setObjectName', obj.id);
  if (p.text != null) call('setText', String(p.text));
  if (p.min != null) call('setMinimum', Number(p.min));
  if (p.max != null) call('setMaximum', Number(p.max));
  if (p.value != null) call('setValue', Number(p.value));
  if (p.checked != null) call('setChecked', !!p.checked);
  const t = obj.transform;
  call('setGeometry', t.x, t.y, Math.max(MIN_SIZE, t.width), Math.max(MIN_SIZE, t.height));
  return w;
}

export function DashQtRender({ objects, selectedIds, width, height, onSelect, onTransform }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const widgetsRef = useRef<Map<string, any>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);
  // Design surface size — fills the whole Render panel (measured live). Props
  // `width`/`height`, if given, override the measured size (fixed-canvas mode).
  const [size, setSize] = useState<{ w: number; h: number }>({ w: width ?? DEFAULT_W, h: height ?? DEFAULT_H });
  const surfaceW = width ?? size.w;
  const surfaceH = height ?? size.h;
  // Live overlay geometry during a drag (id → transform) so handles track smoothly.
  const [live, setLive] = useState<Record<string, QtTransform>>({});
  const drag = useRef<{ id: string; dir: HandleDir; sx: number; sy: number; t0: QtTransform } | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureQtLib()
      .then((g) => { if (!cancelled) { gRef.current = g; setStatus('ready'); } })
      .catch((e) => { if (!cancelled) { setErr(e instanceof Error ? e.message : String(e)); setStatus('error'); } });
    return () => { cancelled = true; };
  }, []);

  // Track the container size so the qt-canvas always fills the whole Render
  // panel (unless fixed width/height props are supplied).
  useEffect(() => {
    if (width != null && height != null) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // (Re)build the whole scene when objects change (not during a live drag — that
  // updates the single dragged widget's geometry directly for smoothness).
  useEffect(() => {
    if (status !== 'ready' || !hostRef.current) return;
    const g = gRef.current;
    const tag: string = g.QtCanvas?.__tag ?? 'qt-canvas';
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement(tag);
      hostRef.current.innerHTML = '';
      hostRef.current.appendChild(canvas);
      canvasRef.current = canvas;
    }
    // Keep the qt-canvas pixel size in sync with the design surface.
    canvas.style.cssText = `width:${surfaceW}px;height:${surfaceH}px;display:block;`;
    const raf = requestAnimationFrame(() => {
      const root = canvas.root;
      if (!root) return;
      // Drop previous widgets.
      for (const w of widgetsRef.current.values()) { try { w.setParent?.(null); } catch { /* ignore */ } }
      widgetsRef.current.clear();
      for (const obj of objects) {
        const w = buildWidget(obj, g);
        if (!w) continue;
        try { w.setParent?.(root); } catch { /* ignore */ }
        widgetsRef.current.set(obj.id, w);
      }
      try { root.update?.(); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, [status, objects, surfaceW, surfaceH]);

  const geomOf = useCallback((o: QtRenderObject): QtTransform => live[o.id] ?? o.transform, [live]);

  // Drag uses native window listeners (added on pointer-down) so it keeps
  // tracking outside the element and works reliably across React's synthetic
  // event boundary. onTransform is committed on pointer-up.
  const startDrag = (e: React.PointerEvent, obj: QtRenderObject, dir: HandleDir) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(obj.id, e.shiftKey || e.ctrlKey || e.metaKey);
    const d = { id: obj.id, dir, sx: e.clientX, sy: e.clientY, t0: { ...obj.transform } };
    drag.current = d;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      const t = { ...d.t0 };
      if (d.dir === 'move') { t.x += dx; t.y += dy; }
      else {
        if (d.dir.includes('e')) t.width = Math.max(MIN_SIZE, d.t0.width + dx);
        if (d.dir.includes('s')) t.height = Math.max(MIN_SIZE, d.t0.height + dy);
        if (d.dir.includes('w')) { const nw = Math.max(MIN_SIZE, d.t0.width - dx); t.x = d.t0.x + (d.t0.width - nw); t.width = nw; }
        if (d.dir.includes('n')) { const nh = Math.max(MIN_SIZE, d.t0.height - dy); t.y = d.t0.y + (d.t0.height - nh); t.height = nh; }
      }
      setLive((m) => ({ ...m, [d.id]: t }));
      const w = widgetsRef.current.get(d.id);
      if (w?.setGeometry) { try { w.setGeometry(Math.round(t.x), Math.round(t.y), Math.round(t.width), Math.round(t.height)); canvasRef.current?.root?.update?.(); } catch { /* ignore */ } }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      drag.current = null;
      const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
      const t = { ...d.t0 };
      if (d.dir === 'move') { t.x += dx; t.y += dy; }
      else {
        if (d.dir.includes('e')) t.width = Math.max(MIN_SIZE, d.t0.width + dx);
        if (d.dir.includes('s')) t.height = Math.max(MIN_SIZE, d.t0.height + dy);
        if (d.dir.includes('w')) { const nw = Math.max(MIN_SIZE, d.t0.width - dx); t.x = d.t0.x + (d.t0.width - nw); t.width = nw; }
        if (d.dir.includes('n')) { const nh = Math.max(MIN_SIZE, d.t0.height - dy); t.y = d.t0.y + (d.t0.height - nh); t.height = nh; }
      }
      onTransform(d.id, { x: Math.round(t.x), y: Math.round(t.y), width: Math.round(t.width), height: Math.round(t.height) });
      setLive((m) => { const n = { ...m }; delete n[d.id]; return n; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (status === 'error') {
    return <Box sx={{ p: 2 }}><Typography variant="caption" color="error">Nie udało się załadować renderera Qt: {err}</Typography></Box>;
  }

  const isFixed = width != null && height != null;
  return (
    <Box ref={wrapRef} sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: isFixed ? 'auto' : 'hidden', bgcolor: '#181c20', position: 'relative' }}>
      {status === 'loading' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, zIndex: 2 }}>
          <CircularProgress size={16} /><Typography variant="caption" color="text.secondary">Ładowanie renderera Qt…</Typography>
        </Box>
      )}
      {/* Design surface: qt-canvas + absolutely-positioned handle overlay (1:1 px).
          Fills the whole Render panel unless fixed width/height props are given. */}
      <Box sx={{ position: isFixed ? 'relative' : 'absolute', inset: isFixed ? 'auto' : 0, width: surfaceW, height: surfaceH, m: isFixed ? 2 : 0 }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect('', false); }}>
        <Box ref={hostRef} sx={{ position: 'absolute', inset: 0 }} />
        {/* Handles overlay */}
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {objects.map((obj) => {
            const t = geomOf(obj);
            const sel = selectedIds.has(obj.id);
            return (
              <Box key={obj.id}
                onPointerDown={(e) => startDrag(e, obj, 'move')}
                sx={{
                  position: 'absolute', left: t.x, top: t.y, width: t.width, height: t.height,
                  pointerEvents: 'auto', cursor: 'move',
                  outline: sel ? '1.5px solid #4fc3f7' : '1px dashed rgba(255,255,255,0.25)',
                  outlineOffset: 0, boxSizing: 'border-box',
                }}>
                {sel && RESIZE_HANDLES.map((h) => {
                  const pos: any = { position: 'absolute', width: 9, height: 9, bgcolor: '#4fc3f7', border: '1px solid #fff', borderRadius: '2px', pointerEvents: 'auto', cursor: HANDLE_CURSOR[h] };
                  const half = -5;
                  if (h.includes('n')) pos.top = half; if (h.includes('s')) pos.bottom = half;
                  if (h.includes('w')) pos.left = half; if (h.includes('e')) pos.right = half;
                  if (h === 'n' || h === 's') { pos.left = '50%'; pos.marginLeft = half; }
                  if (h === 'e' || h === 'w') { pos.top = '50%'; pos.marginTop = half; }
                  return <Box key={h} onPointerDown={(e) => startDrag(e, obj, h)} sx={pos} />;
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

export default DashQtRender;
