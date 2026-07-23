import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

/**
 * Regular polygon tool (FreeCAD-style) — wielokąt foremny wpisany w okrąg.
 * 1. klik: środek. 2. klik (lub Enter): wierzchołek (promień + obrót).
 * Liczba boków ustawiana z pod-menu (Triangle…Octagon / Regular) i edytowalna z klawiatury.
 * Encja to zamknięta `polyline`.
 */
export class PolygonTool implements Tool {
  name = 'polygon' as const;
  private sides = 6;                    // konfigurowane z pod-menu, edytowalne z klawiatury
  private center: Point2D | null = null;
  private cursor: Point2D = { x: 0, y: 0 };
  private lockR: number | null = null;  // wpisany promień

  /** Ustaw liczbę boków (z pod-menu lub klawiatury). */
  setSides(n: number): void {
    this.sides = Math.max(3, Math.min(64, Math.round(n)));
  }

  getSides(): number { return this.sides; }

  private effR(): number {
    if (this.lockR != null) return this.lockR;
    if (!this.center) return 0;
    return Math.hypot(this.cursor.x - this.center.x, this.cursor.y - this.center.y);
  }

  private rot(): number {
    if (!this.center) return 0;
    return Math.atan2(this.cursor.y - this.center.y, this.cursor.x - this.center.x);
  }

  private vertices(r: number, a0: number): Point2D[] {
    const c = this.center!;
    const out: Point2D[] = [];
    for (let i = 0; i < this.sides; i++) {
      const a = a0 + (i / this.sides) * Math.PI * 2;
      out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
    return out;
  }

  getPreview(): PreviewGeometry | null {
    if (!this.center) return null;
    const r = this.effR();
    if (r < 0.01) return null;
    const vs = this.vertices(r, this.rot());
    return { type: 'polyline', points: [...vs, vs[0]] }; // zamknięty obrys
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.center) return [];
    const r = this.effR();
    if (r < 0.01) return [];
    const vs = this.vertices(r, this.rot());
    return [
      {
        id: 'radius',
        worldX: vs[0].x, worldY: vs[0].y, text: `R: ${r.toFixed(2)}`,
        offsetX: 22, offsetY: -12, variant: 'primary',
        editable: true, onEdit: (v: number) => { this.lockR = v; },
      },
      {
        id: 'sides',
        worldX: this.center.x, worldY: this.center.y, text: `${this.sides}`,
        offsetX: 0, offsetY: -18, variant: 'secondary', unit: 'sides',
        editable: true, onEdit: (v: number) => { this.setSides(v); },
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.center) {
      this.center = point;
      this.cursor = point;
    } else {
      this.cursor = point;
      this.commit(ctx);
    }
  }

  commitDraft(ctx: ToolContext): boolean {
    if (!this.center || this.effR() < 0.01) return false;
    this.commit(ctx);
    return true;
  }

  private commit(ctx: ToolContext): void {
    const r = this.effR();
    if (!this.center || r < 0.01) { this.reset(); return; }
    const vs = this.vertices(r, this.rot());
    ctx.project.addEntity({
      type: 'polyline',
      points: vs,
      closed: true,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    this.reset();
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.cursor = point;
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    // Zachowaj `sides` między szkicami (wygodne przy serii wielokątów).
    this.center = null;
    this.cursor = { x: 0, y: 0 };
    this.lockR = null;
  }
}

/** Singleton — pozwala pod-menu Toolbar ustawić liczbę boków przed aktywacją narzędzia. */
export const polygonTool = new PolygonTool();
