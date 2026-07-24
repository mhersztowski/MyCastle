import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

type Seg = { a: Point2D; b: Point2D };

/** Kąt w stopniach, znormalizowany do [0, 360). */
function toDeg(rad: number): number {
  let d = (rad * 180) / Math.PI;
  while (d < 0) d += 360;
  while (d >= 360) d -= 360;
  return d;
}

/**
 * Line tool (FreeCAD-style) — łańcuch odcinków z edytowalną DŁUGOŚCIĄ i KĄTEM.
 * Podczas rysowania pokazuje wymiar długości (podwójna strzałka) + łuk kąta, a wartości
 * L/∠ można wpisywać z klawiatury (Tab przełącza) — geometria zmienia się na żywo.
 */
export class LineTool implements Tool {
  name = 'line' as const;
  private start: Point2D | null = null;
  private cursor: Point2D | null = null;
  private lockLen: number | null = null;    // wpisana długość
  private lockAngle: number | null = null;  // wpisany kąt (rad)
  private pxw = 1;                            // world units / pixel (do skalowania adnotacji)

  private effAngle(): number {
    if (this.lockAngle != null) return this.lockAngle;
    if (!this.start || !this.cursor) return 0;
    return Math.atan2(this.cursor.y - this.start.y, this.cursor.x - this.start.x);
  }
  private effLen(): number {
    if (this.lockLen != null) return this.lockLen;
    if (!this.start || !this.cursor) return 0;
    return Math.hypot(this.cursor.x - this.start.x, this.cursor.y - this.start.y);
  }
  private effEnd(): Point2D | null {
    if (!this.start) return null;
    const a = this.effAngle(), l = this.effLen();
    return { x: this.start.x + Math.cos(a) * l, y: this.start.y + Math.sin(a) * l };
  }

  private arrowHead(tip: Point2D, dir: Point2D, size: number): Seg[] {
    // dwie kreski „V" wskazujące w kierunku `dir`
    const ang = Math.atan2(dir.y, dir.x);
    const a1 = ang + Math.PI * 0.85, a2 = ang - Math.PI * 0.85;
    return [
      { a: tip, b: { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size } },
      { a: tip, b: { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size } },
    ];
  }

  private buildGhost(): Seg[] {
    const s = this.start!, e = this.effEnd()!;
    const dx = e.x - s.x, dy = e.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;   // wzdłuż
    const px = -uy, py = ux;              // prostopadła (w lewo)
    const off = this.pxw * 18;            // odsunięcie linii wymiarowej
    const arrow = this.pxw * 7;
    const segs: Seg[] = [{ a: s, b: e }]; // główna linia

    // Wymiar długości: linia równoległa z odsunięciem + linie odniesienia + strzałki.
    const d1 = { x: s.x + px * off, y: s.y + py * off };
    const d2 = { x: e.x + px * off, y: e.y + py * off };
    segs.push({ a: d1, b: d2 }, { a: s, b: d1 }, { a: e, b: d2 });
    segs.push(...this.arrowHead(d1, { x: ux, y: uy }, arrow));
    segs.push(...this.arrowHead(d2, { x: -ux, y: -uy }, arrow));

    // Kąt: pozioma linia odniesienia ze startu + łuk 0→kąt + strzałka.
    if (len > this.pxw * 6) {
      const r = this.pxw * 26;
      segs.push({ a: s, b: { x: s.x + r * 1.25, y: s.y } });
      const a0 = 0, a1 = this.effAngle();
      let sweep = a1 - a0; while (sweep <= -Math.PI) sweep += Math.PI * 2; while (sweep > Math.PI) sweep -= Math.PI * 2;
      const N = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
      let prev = { x: s.x + Math.cos(a0) * r, y: s.y + Math.sin(a0) * r };
      for (let i = 1; i <= N; i++) {
        const a = a0 + (i / N) * sweep;
        const p = { x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r };
        segs.push({ a: prev, b: p }); prev = p;
      }
      const tang = { x: -Math.sin(a1) * Math.sign(sweep || 1), y: Math.cos(a1) * Math.sign(sweep || 1) };
      segs.push(...this.arrowHead(prev, tang, arrow));
    }
    return segs;
  }

  getPreview(): PreviewGeometry | null {
    if (!this.start || !this.cursor) return null;
    if (this.effLen() < 1e-4) return { type: 'line', points: [this.start, this.start] };
    return { type: 'ghost', points: [], ghostSegments: this.buildGhost() };
  }

  getDimensionLabels(): DimensionLabel[] {
    const e = this.effEnd();
    if (!this.start || !e) return [];
    const len = this.effLen();
    if (len < 0.01) return [];
    const a = this.effAngle();
    const nx = -Math.sin(a), ny = Math.cos(a);
    const midX = (this.start.x + e.x) / 2, midY = (this.start.y + e.y) / 2;
    return [
      {
        id: 'length',
        worldX: midX, worldY: midY, text: `L: ${len.toFixed(2)}`,
        offsetX: nx * 30, offsetY: -ny * 30, variant: 'primary',
        editable: true, onEdit: (v: number) => { this.lockLen = v; },
      },
      {
        id: 'angle',
        worldX: e.x, worldY: e.y, text: `${toDeg(a).toFixed(2)} °`,
        offsetX: 34, offsetY: -16, variant: 'secondary',
        editable: true, onEdit: (deg: number) => { this.lockAngle = (deg * Math.PI) / 180; },
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    this.pxw = ctx.pixelToWorld ?? this.pxw;
    if (!this.start) { this.start = point; this.cursor = point; }
    else { this.cursor = point; this.commitLine(ctx); }
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    this.cursor = point;
    this.pxw = ctx.pixelToWorld ?? this.pxw;
  }

  onPointerUp(): void {}

  /** Enter / ✓ — zatwierdza bieżący odcinek z wpisanych wartości i kontynuuje łańcuch. */
  commitDraft(ctx: ToolContext): boolean {
    if (!this.start || this.effLen() < 0.01) return false;
    this.commitLine(ctx);
    return true;
  }

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  private commitLine(ctx: ToolContext): void {
    const s = this.start, e = this.effEnd();
    if (!s || !e) return;
    ctx.project.addEntity({
      type: 'line',
      layerId: ctx.project.layerSystem.getActiveId(),
      x1: s.x, y1: s.y, x2: e.x, y2: e.y,
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    // Po zatwierdzeniu — start od nowa (BEZ łańcucha): kolejna linia wymaga nowego 1. kliku.
    this.reset();
  }

  reset(): void {
    this.start = null;
    this.cursor = null;
    this.lockLen = null;
    this.lockAngle = null;
  }
}
