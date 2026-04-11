import type { Point2D } from '@mhersztowski/core-cad';
import type { PreviewGeometry, Tool, ToolContext } from './types';

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
