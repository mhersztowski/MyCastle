import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

function dist(a: Point2D, b: Point2D) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export class CircleTool implements Tool {
  name = 'circle' as const;
  private center: Point2D | null = null;
  private current: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (!this.center || !this.current) return null;
    return { type: 'circle', points: [this.center, this.current], radius: dist(this.center, this.current) };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.center || !this.current) return [];
    const r = dist(this.center, this.current);
    if (r < 0.01) return [];
    // Label near cursor, slightly offset
    const angle = Math.atan2(this.current.y - this.center.y, this.current.x - this.center.x);
    const midX = this.center.x + Math.cos(angle) * r * 0.6;
    const midY = this.center.y + Math.sin(angle) * r * 0.6;
    return [
      { worldX: midX, worldY: midY, text: `R: ${r.toFixed(2)}`, offsetY: -14, variant: 'primary' },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.center) {
      this.center = point;
      this.current = point;
    } else {
      const radius = dist(this.center, point);
      if (radius > 0) {
        ctx.project.addEntity({
          type: 'circle',
          layerId: ctx.project.layerSystem.getActiveId(),
          cx: this.center.x, cy: this.center.y, radius,
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
    this.center = null;
    this.current = null;
  }
}
