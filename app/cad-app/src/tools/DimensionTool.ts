import type { Point2D, DimAnchor } from '@mhersztowski/core-cad';
import { makeDimAnchor } from '@mhersztowski/core-cad';
import type { PreviewGeometry, Tool, ToolContext } from './types';

type State = 'idle' | 'picking-p2' | 'picking-offset';

const ANCHOR_THRESHOLD_PX = 12;

function perpSignedDistance(p: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return 0;
  // Perpendicular direction: (-dy/len, dx/len)
  return (p.x - p1.x) * (-dy / len) + (p.y - p1.y) * (dx / len);
}

function buildDimensionPreviewSegments(
  p1: Point2D,
  p2: Point2D,
  offset: number,
): Array<{ a: Point2D; b: Point2D }> {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  const d1 = { x: p1.x + nx, y: p1.y + ny };
  const d2 = { x: p2.x + nx, y: p2.y + ny };
  const overshoot = offset >= 0 ? 4 : -4;
  return [
    { a: p1, b: { x: d1.x + nx / Math.abs(offset || 1) * overshoot, y: d1.y + ny / Math.abs(offset || 1) * overshoot } },
    { a: p2, b: { x: d2.x + nx / Math.abs(offset || 1) * overshoot, y: d2.y + ny / Math.abs(offset || 1) * overshoot } },
    { a: d1, b: d2 },
  ];
}

export class DimensionTool implements Tool {
  name = 'dimension' as const;
  private state: State = 'idle';
  private p1: Point2D | null = null;
  private p2: Point2D | null = null;
  private anchor1: DimAnchor | null = null;
  private anchor2: DimAnchor | null = null;
  private offset = 0;
  private previewSegments: Array<{ a: Point2D; b: Point2D }> = [];

  /** Resolve the clicked point to an intelligent anchor on the intersected shape. */
  private anchorFor(point: Point2D, ctx: ToolContext): DimAnchor | null {
    const threshold = (ctx.pixelToWorld ?? 1) * ANCHOR_THRESHOLD_PX;
    return makeDimAnchor(point, ctx.project.entityRegistry.getAll(), threshold, {
      entityId: ctx.snapResult.entityId,
      mode: ctx.snapResult.mode,
    });
  }

  getPreview(): PreviewGeometry | null {
    if (this.previewSegments.length === 0) return null;
    if (this.state === 'picking-p2' && this.p1) {
      return { type: 'ghost', points: [], ghostSegments: this.previewSegments };
    }
    if (this.state === 'picking-offset') {
      return { type: 'ghost', points: [], ghostSegments: this.previewSegments };
    }
    return null;
  }

  onPointerDown(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'idle') {
      this.p1 = point;
      this.anchor1 = this.anchorFor(point, ctx);
      this.state = 'picking-p2';
      this.previewSegments = [{ a: point, b: point }];
    } else if (this.state === 'picking-p2') {
      if (!this.p1) return;
      this.p2 = point;
      this.anchor2 = this.anchorFor(point, ctx);
      this.state = 'picking-offset';
      this.offset = 0;
      this.previewSegments = buildDimensionPreviewSegments(this.p1, point, 20);
    } else if (this.state === 'picking-offset') {
      this.commitDimension(ctx);
    }
  }

  onPointerMove(point: Point2D, ctx: ToolContext): void {
    if (this.state === 'picking-p2' && this.p1) {
      this.previewSegments = [{ a: this.p1, b: point }];
    } else if (this.state === 'picking-offset' && this.p1 && this.p2) {
      this.offset = perpSignedDistance(point, this.p1, this.p2);
      this.previewSegments = buildDimensionPreviewSegments(this.p1, this.p2, this.offset);
    }
    void ctx;
  }

  onPointerUp(_point: Point2D, _ctx: ToolContext): void {}

  onKeyDown(key: string, ctx: ToolContext): void {
    if (key === 'Escape') this.reset();
    if (key === 'Enter' && this.state === 'picking-offset') this.commitDimension(ctx);
  }

  reset(): void {
    this.state = 'idle';
    this.p1 = null;
    this.p2 = null;
    this.anchor1 = null;
    this.anchor2 = null;
    this.offset = 0;
    this.previewSegments = [];
  }

  private commitDimension(ctx: ToolContext): void {
    if (!this.p1 || !this.p2) return;
    ctx.project.addEntity({
      type: 'dimension',
      x1: this.p1.x,
      y1: this.p1.y,
      x2: this.p2.x,
      y2: this.p2.y,
      offset: this.offset || 20,
      layerId: ctx.project.layerSystem.getActiveId(),
      color: 'bylayer',
      lineType: 'bylayer',
      lineWidth: 'bylayer',
      visible: true,
      locked: false,
      extrudeHeight: 0,
      ...(this.anchor1 ? { anchor1: this.anchor1 } : {}),
      ...(this.anchor2 ? { anchor2: this.anchor2 } : {}),
    });
    // Chain: start new dimension from p2 (its anchor becomes the new start anchor)
    this.p1 = this.p2;
    this.anchor1 = this.anchor2;
    this.p2 = null;
    this.anchor2 = null;
    this.state = 'picking-p2';
    this.previewSegments = [];
  }
}
