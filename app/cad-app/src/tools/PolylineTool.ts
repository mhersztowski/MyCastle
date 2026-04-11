import type { Point2D } from '@mhersztowski/core-cad';
import type { PreviewGeometry, Tool, ToolContext } from './types';

export class PolylineTool implements Tool {
  name = 'polyline' as const;
  private points: Point2D[] = [];
  private current: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (this.points.length === 0) return null;
    const pts = this.current ? [...this.points, this.current] : this.points;
    return { type: 'polyline', points: pts };
  }

  onPointerDown(point: Point2D): void {
    this.points.push(point);
    this.current = point;
  }

  onPointerMove(point: Point2D): void {
    this.current = point;
  }

  onPointerUp(): void {}

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if ((key === 'Enter' || key === 'Return') && this.points.length >= 2) {
      ctx.project.addEntity({
        type: 'polyline',
        layerId: ctx.project.layerSystem.getActiveId(),
        points: [...this.points],
        closed: false,
        color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
        visible: true, locked: false, extrudeHeight: 0,
      });
      this.reset();
    }
    if (key === 'c' && this.points.length >= 3) {
      ctx.project.addEntity({
        type: 'polyline',
        layerId: ctx.project.layerSystem.getActiveId(),
        points: [...this.points],
        closed: true,
        color: 'bylayer', lineType: 'bylayer', lineWidth: 'bylayer',
        visible: true, locked: false, extrudeHeight: 0,
      });
      this.reset();
    }
  }

  reset(): void {
    this.points = [];
    this.current = null;
  }
}
