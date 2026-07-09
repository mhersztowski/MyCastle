// ShapeNode — kształty wektorowe (prostokąt, romb, koło, linia, strzałka) w scenie
// *.dash.json, edytowalne graficznie przez gizmo/uchwyty.
//
//  • figury (rect/rhombus/ellipse): 8 uchwytów resize (rogi + krawędzie) + uchwyt rotacji,
//  • linia/strzałka: 2 uchwyty końców (przeciągasz każdy koniec) + przycisk zmiany przekątnej.
//
// Geometria trzymana w `transform` (x,y,width,height,rot) — spójnie z resztą obiektów
// (drag/drop, grupowanie, drzewo SCENE działają bez zmian). Styl (fill/stroke/…) w
// `properties`. Linia/strzałka to przekątna prostokąta ograniczającego (flipDiag wybiera
// którą), więc końce = przeciwległe rogi boxu.
import React, { useCallback, useRef } from 'react';
import { NodeProps, Node, useReactFlow } from '@xyflow/react';
import { Box, Tooltip } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DashTransform, DashValue } from '@mhersztowski/core';

export type ShapeType = 'rect' | 'rhombus' | 'ellipse' | 'line' | 'arrow' | 'text';

export interface ShapeNodeData extends Record<string, unknown> {
  objectId: string;
  objectName: string;
  shapeType: ShapeType;
  transform: DashTransform;
  properties: Record<string, DashValue>;
  selected: boolean;
  onGizmo: (patch: Partial<DashTransform>) => void;
  onFlipDiag: () => void;
}

const MIN_BOX = 10;
const MIN_LINE = 1;

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// Nowe x/y/w/h po przeciągnięciu uchwytu `dir` o (dx,dy) w LOKALNej przestrzeni boxu.
function applyGizmo(t: DashTransform, dir: Dir, dx: number, dy: number, min: number): Partial<DashTransform> {
  let { x, y, width: w, height: h } = t;
  if (dir.includes('e')) w = Math.max(min, Math.round(t.width + dx));
  if (dir.includes('s')) h = Math.max(min, Math.round(t.height + dy));
  if (dir.includes('w')) { const nw = Math.max(min, Math.round(t.width - dx)); x = t.x + (t.width - nw); w = nw; }
  if (dir.includes('n')) { const nh = Math.max(min, Math.round(t.height - dy)); y = t.y + (t.height - nh); h = nh; }
  return { x, y, width: w, height: h };
}

const S = (v: DashValue | undefined, d: string): string => (v == null || v === '' ? d : String(v));
const N = (v: DashValue | undefined, d: number): number => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ── Render SVG kształtu w obrębie width×height ─────────────────────────────────
const ShapeSvg: React.FC<{ type: ShapeType; w: number; h: number; props: Record<string, DashValue>; id: string }>
  = ({ type, w, h, props, id }) => {
  const fill = S(props.fill, '#4fc3f7');
  const stroke = S(props.stroke, '#1976d2');
  const sw = N(props.strokeWidth, 2);
  const flip = props.flipDiag === true;
  const p = sw / 2 + 0.5; // wcięcie, by kreska nie była obcinana
  const common = { fill, stroke, strokeWidth: sw, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible', pointerEvents: 'none' }}>
      {(type === 'arrow') && (
        <defs>
          <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth={Math.max(5, sw * 3)} markerHeight={Math.max(5, sw * 3)} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
          </marker>
        </defs>
      )}
      {type === 'rect' && <rect x={p} y={p} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={N(props.radius, 0)} {...common} />}
      {type === 'ellipse' && <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - p)} ry={Math.max(0, h / 2 - p)} {...common} />}
      {type === 'rhombus' && <polygon points={`${w / 2},${p} ${w - p},${h / 2} ${w / 2},${h - p} ${p},${h / 2}`} {...common} />}
      {(type === 'line' || type === 'arrow') && (
        <line
          x1={flip ? w - p : p} y1={p}
          x2={flip ? p : w - p} y2={h - p}
          stroke={stroke} strokeWidth={sw} strokeLinecap="round"
          markerEnd={type === 'arrow' ? `url(#arrow-${id})` : undefined}
        />
      )}
    </svg>
  );
};

// Kształt „text" — renderowany markdown, ZAWIJANY w obrębie prostokąta (rozmiar
// ustawiany gizmo). pointerEvents:none → węzeł nadal przeciągalny/zaznaczalny.
const TextBox: React.FC<{ w: number; h: number; props: Record<string, DashValue> }> = ({ w, h, props }) => {
  const text = S(props.text, '# Tekst\n\nEdytuj treść w **Properties**.');
  const fontSize = N(props.fontSize, 14);
  const color = S(props.color, '#1a1a1a');
  const bg = S(props.bg, 'transparent');
  const align = S(props.align, 'left') as 'left' | 'center' | 'right';
  const pad = N(props.padding, 8);
  return (
    <Box sx={{
      width: w, height: h, overflow: 'hidden', boxSizing: 'border-box', p: `${pad}px`,
      bgcolor: bg, color, fontSize, textAlign: align, lineHeight: 1.4, pointerEvents: 'none',
      wordBreak: 'break-word', overflowWrap: 'anywhere', userSelect: 'none',
      '& > :first-of-type': { mt: 0 }, '& > :last-child': { mb: 0 },
      '& h1': { fontSize: '1.7em', fontWeight: 700, m: 0, mb: '0.35em', lineHeight: 1.2 },
      '& h2': { fontSize: '1.4em', fontWeight: 700, m: 0, mb: '0.3em', lineHeight: 1.2 },
      '& h3': { fontSize: '1.15em', fontWeight: 700, m: 0, mb: '0.25em' },
      '& p': { m: 0, mb: '0.4em' },
      '& ul, & ol': { pl: '1.4em', m: 0, mb: '0.4em' },
      '& li': { mb: '0.15em' },
      '& code': { fontFamily: 'monospace', fontSize: '0.88em', bgcolor: 'rgba(0,0,0,0.06)', px: '0.3em', borderRadius: '3px' },
      '& pre': { bgcolor: 'rgba(0,0,0,0.06)', p: '0.5em', borderRadius: '4px', overflow: 'auto', m: 0, mb: '0.4em' },
      '& pre code': { bgcolor: 'transparent', p: 0 },
      '& a': { color: '#1976d2', textDecoration: 'underline' },
      '& blockquote': { borderLeft: '3px solid rgba(0,0,0,0.2)', pl: '0.6em', ml: 0, my: '0.3em', color: 'text.secondary' },
      '& table': { borderCollapse: 'collapse', fontSize: '0.9em' },
      '& th, & td': { border: '1px solid rgba(0,0,0,0.25)', px: '0.4em', py: '0.15em' },
      '& hr': { border: 'none', borderTop: '1px solid rgba(0,0,0,0.2)', my: '0.4em' },
      '& img': { maxWidth: '100%' },
      '& strong': { fontWeight: 700 },
    }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </Box>
  );
};

const handleStyle = (selected: boolean): React.CSSProperties => ({
  position: 'absolute', width: 12, height: 12, background: '#fff',
  border: `2px solid ${selected ? '#4fc3f7' : '#7c4dff'}`, borderRadius: 2,
  touchAction: 'none', zIndex: 10, transform: 'translate(-50%, -50%)',
});

export const ShapeNode: React.FC<NodeProps<Node<ShapeNodeData>>> = ({ data }) => {
  const { getZoom } = useReactFlow();
  const t = data.transform;
  const w = t.width > 0 ? t.width : 120;
  const h = t.height > 0 ? t.height : 80;
  const isLine = data.shapeType === 'line' || data.shapeType === 'arrow';
  const flip = data.properties.flipDiag === true;
  const nodeRef = useRef<HTMLDivElement>(null);

  // Wspólny handler przeciągania uchwytu resize (figury) / końca (linia).
  const startGizmo = useCallback((dir: Dir) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* syntetyczny pointer */ }
    const startX = e.clientX, startY = e.clientY;
    const t0 = { ...data.transform };
    const min = isLine ? MIN_LINE : MIN_BOX;
    // Delta ekranu → lokalna przestrzeń boxu (odwrót rotacji), by resize działał po obrocie.
    const rot = ((t0.rot || 0) * Math.PI) / 180;
    const cos = Math.cos(-rot), sin = Math.sin(-rot);
    window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: true }));
    let raf = 0; let pending: Partial<DashTransform> | null = null;
    const flush = () => { raf = 0; if (pending) { data.onGizmo(pending); pending = null; } };
    const onMove = (me: PointerEvent) => {
      const zoom = getZoom() || 1;
      const sdx = (me.clientX - startX) / zoom, sdy = (me.clientY - startY) / zoom;
      const dx = sdx * cos - sdy * sin;
      const dy = sdx * sin + sdy * cos;
      pending = applyGizmo(t0, dir, dx, dy, min);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (me: PointerEvent) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (pending) data.onGizmo(pending);
      window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: false }));
      try { el.releasePointerCapture(me.pointerId); } catch { /* ignore */ }
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
  }, [data, getZoom, isLine]);

  const startRotate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation();
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const nodeEl = nodeRef.current;
    const r = nodeEl ? nodeEl.getBoundingClientRect() : null;
    const cx = r ? r.x + r.width / 2 : e.clientX, cy = r ? r.y + r.height / 2 : e.clientY;
    window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: true }));
    let raf = 0; let pending: number | null = null;
    const flush = () => { raf = 0; if (pending != null) { data.onGizmo({ rot: pending }); pending = null; } };
    const onMove = (me: PointerEvent) => {
      // Uchwyt jest NAD figurą (północ) → wskazanie do góry = 0°.
      pending = Math.round((Math.atan2(me.clientY - cy, me.clientX - cx) * 180) / Math.PI + 90);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (me: PointerEvent) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (pending != null) data.onGizmo({ rot: pending });
      window.dispatchEvent(new CustomEvent('dash-resize-active', { detail: false }));
      try { el.releasePointerCapture(me.pointerId); } catch { /* ignore */ }
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
  }, [data]);

  // Pozycje uchwytów resize dla figur (procent boxu).
  const boxHandles: { dir: Dir; left: string; top: string; cursor: string }[] = [
    { dir: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
    { dir: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
    { dir: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
    { dir: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
    { dir: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
    { dir: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
    { dir: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
    { dir: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
  ];

  // Uchwyty końców linii/strzałki = dwa przeciwległe rogi (zależnie od flipDiag).
  const lineHandles: { dir: Dir; left: string; top: string }[] = flip
    ? [{ dir: 'ne', left: '100%', top: '0%' }, { dir: 'sw', left: '0%', top: '100%' }]
    : [{ dir: 'nw', left: '0%', top: '0%' }, { dir: 'se', left: '100%', top: '100%' }];

  return (
    <Box
      ref={nodeRef}
      sx={{
        width: w, height: h, position: 'relative', cursor: 'grab', userSelect: 'none',
        '&:active': { cursor: 'grabbing' },
        ...(t.rot ? { transform: `rotate(${t.rot}deg)` } : {}),
      }}
    >
      {/* Ramka zaznaczenia */}
      {data.selected && (
        <Box className="nodrag" sx={{
          position: 'absolute', inset: -1, border: '1px dashed #4fc3f7', borderRadius: 0.5, pointerEvents: 'none', zIndex: 5,
        }} />
      )}

      {data.shapeType === 'text'
        ? <TextBox w={w} h={h} props={data.properties} />
        : <ShapeSvg type={data.shapeType} w={w} h={h} props={data.properties} id={data.objectId} />}

      {data.selected && !isLine && boxHandles.map((hd) => (
        <div key={hd.dir} className="nodrag nopan" onPointerDown={startGizmo(hd.dir)}
          style={{ ...handleStyle(true), left: hd.left, top: hd.top, cursor: hd.cursor }} />
      ))}

      {data.selected && !isLine && (
        <Tooltip title="Obróć" arrow>
          <div className="nodrag nopan" onPointerDown={startRotate}
            style={{ ...handleStyle(true), left: '50%', top: -26, borderRadius: '50%', background: '#4fc3f7', cursor: 'grab' }} />
        </Tooltip>
      )}

      {data.selected && isLine && lineHandles.map((hd) => (
        <div key={hd.dir} className="nodrag nopan" onPointerDown={startGizmo(hd.dir)}
          style={{ ...handleStyle(true), left: hd.left, top: hd.top, width: 14, height: 14, borderRadius: '50%', cursor: 'move' }} />
      ))}
    </Box>
  );
};

export default ShapeNode;

// Domyślne wymiary/geometria dla nowo tworzonego kształtu.
export function defaultShapeTransform(type: ShapeType, x: number, y: number): DashTransform {
  if (type === 'line' || type === 'arrow') return { x, y, rot: 0, scale: 1, width: 180, height: 90 };
  if (type === 'ellipse') return { x, y, rot: 0, scale: 1, width: 120, height: 120 };
  if (type === 'text') return { x, y, rot: 0, scale: 1, width: 240, height: 140 };
  return { x, y, rot: 0, scale: 1, width: 160, height: 100 };
}

export function defaultShapeProps(type: ShapeType): Record<string, DashValue> {
  if (type === 'line' || type === 'arrow') return { stroke: '#1976d2', strokeWidth: 3, flipDiag: false };
  if (type === 'text') return { text: '# Nagłówek\n\nTekst **markdown**, który zawija się w prostokącie.\n\n- punkt A\n- punkt B', fontSize: 14, color: '#1a1a1a', align: 'left' };
  return { fill: '#4fc3f7', stroke: '#1976d2', strokeWidth: 2 };
}
