import type { Point2D, SnapResult } from '@mhersztowski/core-cad';
import type { Project } from '@mhersztowski/core-cad';

export type ToolName = 'select' | 'line' | 'circle' | 'rect' | 'polyline';

export interface ToolContext {
  project: Project;
  // Snap result at current cursor position
  snapResult: SnapResult;
}

export interface PreviewGeometry {
  type: 'line' | 'circle' | 'rect' | 'polyline';
  points: Point2D[];
  // For circle: points[0] = center, points[1] = edge point (radius derived)
  radius?: number;
}

export interface Tool {
  name: ToolName;
  // Returns preview geometry for the current in-progress operation
  getPreview(): PreviewGeometry | null;
  // Mouse/pointer events (all coords are world-space snap points)
  onPointerDown(point: Point2D, ctx: ToolContext): void;
  onPointerMove(point: Point2D, ctx: ToolContext): void;
  onPointerUp(point: Point2D, ctx: ToolContext): void;
  // Escape / Enter handling
  onKeyDown(key: string, ctx: ToolContext): void;
  // Called when tool is deactivated
  reset(): void;
}
