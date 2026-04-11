import type { Point2D, SnapResult } from '@mhersztowski/core-cad';
import type { Project } from '@mhersztowski/core-cad';

export type ToolName =
  | 'select'
  | 'line'
  | 'circle'
  | 'arc'
  | 'rect'
  | 'polyline'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'offset'
  | 'trim'
  | 'fillet'
  | 'dimension'
  | 'box3d'
  | 'cylinder3d'
  | 'sphere3d';

export interface ToolContext {
  project: Project;
  snapResult: SnapResult;
}

export interface PreviewGeometry {
  type: 'line' | 'circle' | 'arc' | 'rect' | 'polyline' | 'ghost' | 'dimension-preview';
  points: Point2D[];
  radius?: number;
  // For 'arc': arc angles in radians (CCW sweep from startAngle to endAngle)
  startAngle?: number;
  endAngle?: number;
  // For 'ghost' (move/copy/rotate previews): translated/rotated line segments
  ghostSegments?: Array<{ a: Point2D; b: Point2D }>;
  // For 'dimension-preview': offset from p1-p2 line
  offset?: number;
}

/** A live dimension annotation rendered as an HTML overlay while drawing/editing. */
export interface DimensionLabel {
  /** Position in CAD world space */
  worldX: number;
  worldY: number;
  /** Text to display (e.g. "L: 50.23", "R: 12.50", "∠ 45.0°") */
  text: string;
  /** Extra pixel offset from the projected world position (for fine placement) */
  offsetX?: number;
  offsetY?: number;
  /** Visual variant */
  variant?: 'primary' | 'secondary';
}

export interface Tool {
  name: ToolName;
  getPreview(): PreviewGeometry | null;
  /** Optional live dimension labels shown while the tool is active. */
  getDimensionLabels?(): DimensionLabel[];
  onPointerDown(point: Point2D, ctx: ToolContext): void;
  onPointerMove(point: Point2D, ctx: ToolContext): void;
  onPointerUp(point: Point2D, ctx: ToolContext): void;
  onKeyDown(key: string, ctx: ToolContext): void;
  reset(): void;
}
