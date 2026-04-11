import type { Point2D } from '@mhersztowski/core-cad';
import type { PreviewGeometry, Tool, ToolContext } from './types';

export class LineTool implements Tool {
  name = 'line' as const;
  private start: Point2D | null = null;
  private current: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (!this.start || !this.current) return null;
    return { type: 'line', points: [this.start, this.current] };
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.start) {
      this.start = point;
      this.current = point;
    } else {
      this.commitLine(point, ctx);
    }
  }

  onPointerMove(point: Point2D): void {
    this.current = point;
  }

  onPointerUp(): void {}

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if ((key === 'Enter' || key === 'Return') && this.start && this.current) {
      this.commitLine(this.current, ctx);
    }
  }

  private commitLine(end: Point2D, ctx: ToolContext): void {
    const { start } = this;
    if (!start) return;
    ctx.project.addEntity({
      type: 'line',
      layerId: ctx.project.layerSystem.getActiveId(),
      x1: start.x, y1: start.y,
      x2: end.x, y2: end.y,
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
    });
    // Chain: next line starts from end point
    this.start = end;
    this.current = end;
  }

  reset(): void {
    this.start = null;
    this.current = null;
  }
}
