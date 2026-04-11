import type { Point2D } from '@mhersztowski/core-cad';
import { normalizeAngle } from '@mhersztowski/core-cad';
import type { DimensionLabel, PreviewGeometry, Tool, ToolContext } from './types';

type ArcState = 'idle' | 'center' | 'start';

/**
 * Arc tool: center → start point (defines radius + start angle) → end angle (CCW).
 * Three clicks: 1=center, 2=start point on arc, 3=end point on arc.
 */
export class ArcTool implements Tool {
  name = 'arc' as const;
  private state: ArcState = 'idle';
  private center: Point2D | null = null;
  private radius = 0;
  private startAngle = 0;
  private cursor: Point2D = { x: 0, y: 0 };

  getPreview(): PreviewGeometry | null {
    if (!this.center) return null;

    if (this.state === 'center') {
      // Show radial line from center to cursor
      return { type: 'line', points: [this.center, this.cursor] };
    }

    if (this.state === 'start') {
      // Show arc from startAngle to cursor angle (CCW sweep)
      const endAngle = Math.atan2(
        this.cursor.y - this.center.y,
        this.cursor.x - this.center.x,
      );
      return {
        type: 'arc',
        points: [this.center],
        radius: this.radius,
        startAngle: this.startAngle,
        endAngle,
      };
    }

    return null;
  }

  getDimensionLabels(): DimensionLabel[] {
    if (!this.center) return [];
    const labels: DimensionLabel[] = [];

    if (this.state === 'center' && this.radius > 0.01) {
      // Showing radial line → display radius near cursor
      labels.push({
        worldX: this.cursor.x,
        worldY: this.cursor.y,
        text: `R: ${this.radius.toFixed(2)}`,
        offsetX: 24, offsetY: -10,
        variant: 'primary',
      });
    } else if (this.state === 'start') {
      // Arc preview → show radius and angular span
      const endAngle = Math.atan2(this.cursor.y - this.center.y, this.cursor.x - this.center.x);
      let sweep = normalizeAngle(endAngle - this.startAngle);
      const sweepDeg = (sweep * 180 / Math.PI).toFixed(1);
      labels.push(
        { worldX: this.cursor.x, worldY: this.cursor.y, text: `R: ${this.radius.toFixed(2)}`, offsetX: 24, offsetY: -22, variant: 'primary' },
        { worldX: this.cursor.x, worldY: this.cursor.y, text: `∠ ${sweepDeg}°`, offsetX: 24, offsetY: -6, variant: 'secondary' },
      );
    }

    return labels;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      this.center = point;
      this.state = 'center';
    } else if (this.state === 'center') {
      const dx = point.x - this.center!.x;
      const dy = point.y - this.center!.y;
      this.radius = Math.sqrt(dx * dx + dy * dy);
      if (this.radius < 0.1) return;
      this.startAngle = Math.atan2(dy, dx);
      this.state = 'start';
    } else if (this.state === 'start') {
      const endAngle = Math.atan2(
        point.y - this.center!.y,
        point.x - this.center!.x,
      );
      ctx.project.addEntity({
        type: 'arc',
        cx: this.center!.x,
        cy: this.center!.y,
        radius: this.radius,
        startAngle: this.startAngle,
        endAngle,
        layerId: ctx.project.layerSystem.getActiveId(),
        color: 'bylayer',
        lineType: 'bylayer',
        lineWidth: 'bylayer',
        visible: true,
        locked: false,
        extrudeHeight: 0,
      });
      this.reset();
    }
  }

  onPointerMove(point: Point2D, _ctx: ToolContext): void {
    this.cursor = point;
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, _ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
  }

  reset(): void {
    this.state = 'idle';
    this.center = null;
    this.radius = 0;
    this.startAngle = 0;
    this.cursor = { x: 0, y: 0 };
  }
}
