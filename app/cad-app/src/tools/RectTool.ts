import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

export class RectTool implements Tool {
  name = 'rect' as const;
  private corner: Point2D | null = null;
  private current: Point2D | null = null;
  private lastCtx: ToolContext | null = null;

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
      {
        worldX: x0 + w / 2, worldY: y0,
        text: `W: ${w.toFixed(2)}`,
        offsetY: 16,
        variant: 'primary',
        editable: true,
        onEdit: (newW: number) => {
          if (!this.corner || !this.current || !this.lastCtx) return;
          const signX = this.current.x >= this.corner.x ? 1 : -1;
          this.commitRect({ x: this.corner.x + signX * newW, y: this.current.y }, this.lastCtx);
        },
      },
      {
        worldX: x0 + w, worldY: y0 + h / 2,
        text: `H: ${h.toFixed(2)}`,
        offsetX: 8,
        variant: 'secondary',
        editable: true,
        onEdit: (newH: number) => {
          if (!this.corner || !this.current || !this.lastCtx) return;
          const signY = this.current.y >= this.corner.y ? 1 : -1;
          this.commitRect({ x: this.current.x, y: this.corner.y + signY * newH }, this.lastCtx);
        },
      },
    ];
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (!this.corner) {
      this.corner = point;
      this.current = point;
    } else {
      this.commitRect(point, ctx);
    }
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    this.current = point;
    this.lastCtx = ctx;
  }

  onPointerUp(): void {}

  onKeyDown(key: string): void {
    if (key === 'Escape') this.reset();
  }

  private commitRect(end: Point2D, ctx: ToolContext): void {
    if (!this.corner) return;
    const x = Math.min(this.corner.x, end.x);
    const y = Math.min(this.corner.y, end.y);
    const w = Math.abs(end.x - this.corner.x);
    const h = Math.abs(end.y - this.corner.y);
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

  reset(): void {
    this.corner = null;
    this.current = null;
    this.lastCtx = null;
  }
}
