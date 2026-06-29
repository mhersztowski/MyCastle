// qtCanvasRenderer — a faithful-enough JS reimplementation of MinisQt's layout
// and painting, used to render the *.qtui.json scene to an HTML <canvas> for the
// drag-and-drop designer. (True pixel fidelity comes from the WASM preview; this
// mirror only needs to look right and be hit-testable.)

import type { QtUiScene, QtWidgetNode, QtAlignment } from './QtUiTypes';

export interface Rect { x: number; y: number; w: number; h: number }
export interface LaidOut { node: QtWidgetNode; rect: Rect; depth: number }

// MinisQt palette (see Qt::* in MinisQt.h).
const COL = {
  white: '#ffffff',
  blue: 'rgb(60,120,200)',
  green: 'rgb(60,180,90)',
  darkGray: 'rgb(64,64,64)',
  lightGray: 'rgb(200,200,200)',
};

function color(hex: string | undefined, fallback: string): string {
  return hex && /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : fallback;
}

const MARGIN_DEFAULT = 8;   // QLayout default
const SPACING_DEFAULT = 6;

/**
 * Compute absolute rects for every node, mirroring QBoxLayout::setGeometry and
 * absolute-geometry placement. Returns nodes in paint order (parents first).
 */
export function computeLayout(scene: QtUiScene): LaidOut[] {
  const out: LaidOut[] = [];
  const walk = (node: QtWidgetNode, x: number, y: number, w: number, h: number, depth: number) => {
    out.push({ node, rect: { x, y, w, h }, depth });
    const children = node.children ?? [];
    if (!children.length) return;
    if (node.layout && node.layout !== 'none') {
      const margin = node.margin ?? MARGIN_DEFAULT;
      const spacing = node.spacing ?? SPACING_DEFAULT;
      const ix = x + margin, iy = y + margin;
      const iw = Math.max(0, w - 2 * margin), ih = Math.max(0, h - 2 * margin);
      const n = children.length;
      if (node.layout === 'QVBoxLayout') {
        const each = Math.floor((ih - spacing * (n - 1)) / n);
        let cy = iy;
        children.forEach((c, i) => {
          const ch = i === n - 1 ? iy + ih - cy : each;
          walk(c, ix, cy, iw, ch, depth + 1);
          cy += ch + spacing;
        });
      } else { // QHBoxLayout
        const each = Math.floor((iw - spacing * (n - 1)) / n);
        let cx = ix;
        children.forEach((c, i) => {
          const cw = i === n - 1 ? ix + iw - cx : each;
          walk(c, cx, iy, cw, ih, depth + 1);
          cx += cw + spacing;
        });
      }
    } else {
      // Absolute geometry (parent has no layout).
      children.forEach((c) => {
        const g = c.geometry ?? [8, 8, Math.min(140, w - 16), 28];
        walk(c, x + g[0], y + g[1], g[2], g[3], depth + 1);
      });
    }
  };
  walk(scene.root, 0, 0, scene.width, scene.height, 0);
  return out;
}

function fontScale(px: number | undefined): number {
  const s = Math.floor(((px ?? 16) + 4) / 8);
  return s < 1 ? 1 : s;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, rad);
  else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}

// Draw fixed-cell text (8*scale px per glyph) to mirror MinisQt's bitmap font.
function drawText(ctx: CanvasRenderingContext2D, r: Rect, align: QtAlignment | undefined, text: string, fill: string, px?: number) {
  const sc = fontScale(px);
  const cell = 8 * sc;
  const tw = text.length * cell, th = cell;
  let tx = r.x, ty = r.y;
  const a = align ?? 'AlignLeft';
  if (a === 'AlignCenter' || a === 'AlignHCenter') tx = r.x + (r.w - tw) / 2;
  else if (a === 'AlignRight') tx = r.x + r.w - tw;
  // MinisQt labels default to vertical centering.
  ty = r.y + (r.h - th) / 2;
  ctx.fillStyle = fill;
  ctx.textBaseline = 'top';
  ctx.font = `${cell}px ui-monospace, "Courier New", monospace`;
  for (let i = 0; i < text.length; i++) ctx.fillText(text[i], tx + i * cell, ty);
}

function drawWidget(ctx: CanvasRenderingContext2D, lo: LaidOut) {
  const { node, rect: r } = lo;
  if (node.background) { ctx.fillStyle = node.background; ctx.fillRect(r.x, r.y, r.w, r.h); }
  const px = node.font?.pixelSize;
  const span = (n: QtWidgetNode) => Math.max(1, (n.max ?? 100) - (n.min ?? 0));

  switch (node.class) {
    case 'QLabel':
      drawText(ctx, r, node.alignment, node.text ?? '', color(node.color, COL.white), px);
      break;
    case 'QPushButton':
      roundRect(ctx, r.x, r.y, r.w, r.h, 6); ctx.fillStyle = color(node.color, COL.blue); ctx.fill();
      drawText(ctx, r, 'AlignCenter', node.text ?? '', COL.white, px);
      break;
    case 'QSlider': {
      const cy = r.y + r.h / 2;
      roundRect(ctx, r.x, cy - 3, r.w, 6, 3); ctx.fillStyle = COL.darkGray; ctx.fill();
      const hx = ((node.value ?? 0) - (node.min ?? 0)) * (r.w - 12) / span(node) + 6;
      roundRect(ctx, r.x, cy - 3, Math.max(0, hx), 6, 3); ctx.fillStyle = COL.blue; ctx.fill();
      roundRect(ctx, r.x + hx - 6, cy - 9, 12, 18, 6); ctx.fillStyle = COL.white; ctx.fill();
      break;
    }
    case 'QProgressBar': {
      roundRect(ctx, r.x, r.y, r.w, r.h, 4); ctx.fillStyle = COL.darkGray; ctx.fill();
      const fw = ((node.value ?? 0) - (node.min ?? 0)) * r.w / span(node);
      if (fw > 0) { roundRect(ctx, r.x, r.y, fw, r.h, 4); ctx.fillStyle = COL.green; ctx.fill(); }
      if (node.textVisible !== false) {
        const pct = Math.round(((node.value ?? 0) - (node.min ?? 0)) * 100 / span(node));
        drawText(ctx, r, 'AlignCenter', `${pct}%`, COL.white, px);
      }
      break;
    }
    case 'QCheckBox': {
      const s = r.h > 8 ? 20 : r.h;
      const by = (r.h - s) / 2;
      roundRect(ctx, r.x, r.y + by, s, s, 4); ctx.fillStyle = COL.darkGray; ctx.fill();
      if (node.checked) { roundRect(ctx, r.x + 3, r.y + by + 3, s - 6, s - 6, 3); ctx.fillStyle = COL.green; ctx.fill(); }
      drawText(ctx, { x: r.x + s + 8, y: r.y, w: r.w - s - 8, h: r.h }, 'AlignLeft', node.text ?? '', COL.white, px);
      break;
    }
    case 'QWidget':
    default:
      // Containers: faint dashed outline so drop targets are visible.
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.restore();
      break;
  }
}

/** Paint the whole scene; returns the laid-out list (for hit-testing). */
export function drawScene(ctx: CanvasRenderingContext2D, scene: QtUiScene, selectedId?: string): LaidOut[] {
  const laid = computeLayout(scene);
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.fillStyle = color(scene.background, 'rgb(24,26,30)');
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const lo of laid) drawWidget(ctx, lo);
  if (selectedId) {
    const sel = laid.find((l) => l.node.id === selectedId);
    if (sel) {
      ctx.save();
      ctx.strokeStyle = '#4ea1ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(sel.rect.x + 0.5, sel.rect.y + 0.5, sel.rect.w - 1, sel.rect.h - 1);
      ctx.restore();
    }
  }
  return laid;
}

/** Deepest node whose rect contains (px,py). */
export function hitTest(laid: LaidOut[], px: number, py: number): LaidOut | null {
  let best: LaidOut | null = null;
  for (const lo of laid) {
    const r = lo.rect;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      if (!best || lo.depth >= best.depth) best = lo;
    }
  }
  return best;
}

/** Deepest CONTAINER under (px,py), skipping `excludeId` and its subtree. */
export function hitContainer(laid: LaidOut[], px: number, py: number, excludeId?: string): LaidOut | null {
  let best: LaidOut | null = null;
  for (const lo of laid) {
    if (lo.node.class !== 'QWidget') continue;
    if (excludeId && (lo.node.id === excludeId)) continue;
    const r = lo.rect;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      if (!best || lo.depth >= best.depth) best = lo;
    }
  }
  return best;
}

// ── Resize handles (absolute-geometry widgets) ──────────────────────────────
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** The 8 handle anchor points around a rect. */
export function handlePoints(r: Rect): { id: HandleId; x: number; y: number }[] {
  const { x, y, w, h } = r;
  return [
    { id: 'nw', x, y }, { id: 'n', x: x + w / 2, y }, { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 }, { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h }, { id: 'sw', x, y: y + h }, { id: 'w', x, y: y + h / 2 },
  ];
}

/** Which handle (if any) is within `tol` of (px,py). */
export function hitHandle(r: Rect, px: number, py: number, tol: number): HandleId | null {
  for (const p of handlePoints(r)) {
    if (Math.abs(px - p.x) <= tol && Math.abs(py - p.y) <= tol) return p.id;
  }
  return null;
}

/** Apply a handle drag (dx,dy) to an [x,y,w,h] geometry, clamped to `min`. */
export function resizeGeom(
  orig: [number, number, number, number], handle: HandleId, dx: number, dy: number, min = 8,
): [number, number, number, number] {
  let [x, y, w, h] = orig;
  if (handle.includes('w')) { x += dx; w -= dx; }
  if (handle.includes('e')) { w += dx; }
  if (handle.includes('n')) { y += dy; h -= dy; }
  if (handle.includes('s')) { h += dy; }
  if (w < min) { if (handle.includes('w')) x -= min - w; w = min; }
  if (h < min) { if (handle.includes('n')) y -= min - h; h = min; }
  return [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
}

/** Draw the 8 resize handles for a rect (handle size in scene px). */
export function drawHandles(ctx: CanvasRenderingContext2D, r: Rect, sizeScene: number) {
  ctx.save();
  ctx.fillStyle = '#4ea1ff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  const s = sizeScene;
  for (const p of handlePoints(r)) {
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.restore();
}

/**
 * Index at which a drop at (px,py) should insert among `container`'s children,
 * based on the container's layout orientation.
 */
export function dropIndex(laid: LaidOut[], container: QtWidgetNode, px: number, py: number): number {
  const children = container.children ?? [];
  const horizontal = container.layout === 'QHBoxLayout';
  for (let i = 0; i < children.length; i++) {
    const lo = laid.find((l) => l.node.id === children[i].id);
    if (!lo) continue;
    const mid = horizontal ? lo.rect.x + lo.rect.w / 2 : lo.rect.y + lo.rect.h / 2;
    if ((horizontal ? px : py) < mid) return i;
  }
  return children.length;
}
