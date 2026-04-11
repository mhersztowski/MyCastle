import type { Point2D } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

function fmt(n: number): string { return n.toFixed(2); }
function fmtAngle(rad: number): string {
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg.toFixed(1) + '°';
}

export class LineTool implements Tool {
  name = 'line' as const;
  private start: Point2D | null = null;
  private current: Point2D | null = null;

  getPreview(): PreviewGeometry | null {
    if (!this.start || !this.current) return null;
    return { type: 'line', points: [this.start, this.current] };
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.start || !this.current) return [];
    const dx = this.current.x - this.start.x;
    const dy = this.current.y - this.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return [];

    const midX = (this.start.x + this.current.x) / 2;
    const midY = (this.start.y + this.current.y) / 2;
    const angle = Math.atan2(dy, dx);

    // Length label at midpoint, offset perpendicular to line
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const perpOffsetPx = 18;

    return [
      {
        worldX: midX,
        worldY: midY,
        text: `L: ${fmt(len)}`,
        offsetX: nx * perpOffsetPx,
        offsetY: -ny * perpOffsetPx, // screen Y is flipped
        variant: 'primary',
      },
      {
        worldX: this.current.x,
        worldY: this.current.y,
        text: `∠ ${fmtAngle(angle)}`,
        offsetX: 28,
        offsetY: -12,
        variant: 'secondary',
      },
    ];
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
