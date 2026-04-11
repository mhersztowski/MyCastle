import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

export class RectTool implements Tool {
  name = 'rect' as const;
  private corner: Point2D | null = null;
  private current: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (!this.corner || !this.current) return null;
    return { type: 'rect', points: [this.corner, this.current] };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.corner || !this.current) return [];
    const w = Math.abs(this.current.x - this.corner.x);
    const h = Math.abs(this.current.y - this.corner.y);
    if (w < 0.01 || h < 0.01) return [];
    const x0 = Math.min(this.corner.x, this.current.x);
    const y0 = Math.min(this.corner.y, this.current.y);
    return [
      // Width: below bottom edge, horizontal center
      { worldX: x0 + w / 2, worldY: y0, text: `W: ${w.toFixed(2)}`, offsetY: 16, variant: 'primary' },
      // Height: right of right edge, vertical center
      { worldX: x0 + w, worldY: y0 + h / 2, text: `H: ${h.toFixed(2)}`, offsetX: 8, variant: 'secondary' },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.corner) {
      this.corner = point;
      this.current = point;
    } else {
      const x = Math.min(this.corner.x, point.x);
      const y = Math.min(this.corner.y, point.y);
      const w = Math.abs(point.x - this.corner.x);
      const h = Math.abs(point.y - this.corner.y);
      if (w > 0 && h > 0) {
        ctx.project.addEntity({
          type: 'rect',
          layerId: ctx.project.layerSystem.getActiveId(),
          x, y, width: w, height: h,
          color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
          visible: true, locked: false, extrudeHeight: 0,
        });
      }
      this.reset();
    }
  }

  onPointerMove(point: Point2D): void {
    this.current = point;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.corner = null;
    this.current = null;
  }
}
