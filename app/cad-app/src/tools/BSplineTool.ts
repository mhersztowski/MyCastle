import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';
import { sampleSpline } from './spline';

/**
 * B-spline (FreeCAD-style). Klikaj kolejne punkty; Enter kończy, Escape anuluje.
 * Tryb ustawiany z pod-menu:
 *  - interpolating: przez punkty („by knots") vs aproksymujący („by control points"),
 *  - periodic: krzywa zamknięta.
 * Zapis jako próbkowana `polyline`.
 */
export class BSplineTool implements Tool {
  name = 'bspline' as const;
  private interpolating = false;  // false = by control points, true = by knots
  private periodic = false;
  private points: Point2D[] = [];
  private cursor: Point2D | null = null;

  setMode(opts: { interpolating: boolean; periodic: boolean }): void {
    this.interpolating = opts.interpolating;
    this.periodic = opts.periodic;
  }

  private previewPts(): Point2D[] {
    const pts = this.cursor ? [...this.points, this.cursor] : this.points;
    if (pts.length < 2) return pts;
    return sampleSpline(pts, { interpolating: this.interpolating, periodic: this.periodic });
  }

  getPreview(): PreviewGeometry | null {
    if (this.points.length === 0) return null;
    return { type: 'polyline', points: this.previewPts() };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (this.points.length === 0) return [];
    // Znaczniki punktów kontrolnych (widoczne kropki rysuje CadCanvas dla polyline preview).
    return [];
  }

  onPointerDown(point: Point2D, _ctx: ToolContext): void {
    this.points.push(point);
    this.cursor = point;
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void { this.cursor = point; }
  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  commitDraft(ctx: ToolContext): boolean {
    return this.finish(ctx);
  }

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    else if (key === 'Enter' || key === 'Return') this.finish(ctx);
  }

  private finish(ctx: ToolContext): boolean {
    if (this.points.length < 2) return false;
    const curve = sampleSpline(this.points, { interpolating: this.interpolating, periodic: this.periodic });
    ctx.project.addEntity({
      type: 'polyline', points: curve, closed: this.periodic,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
      visible: true, locked: false, extrudeHeight: 0,
    });
    this.reset();
    return true;
  }

  reset(): void { this.points = []; this.cursor = null; }
}

/** Singleton — pod-menu Toolbar ustawia tryb przed aktywacją. */
export const bsplineTool = new BSplineTool();
