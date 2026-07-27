import type { Point2D, SnapResult } from '@mhersztowski/core-cad';
import type { Project } from '@mhersztowski/core-cad';

/**
 * Raw input data from a stylus, touch, or mouse pointer.
 * Always present in ToolContext — uses mouse defaults for non-pen devices.
 */
export interface PenInput {
  /** Physical input device type. */
  pointerType: 'mouse' | 'pen' | 'touch';
  /** Normalized pressure [0, 1]. Mouse/touch default: 0.5. */
  pressure: number;
  /**
   * Plane angle in degrees between the Y–Z plane and the plane containing
   * the stylus and the Y axis. Range: −90 to +90.
   * Negative: tilted left; positive: tilted right.
   */
  tiltX: number;
  /**
   * Plane angle in degrees between the X–Z plane and the plane containing
   * the stylus and the X axis. Range: −90 to +90.
   * Negative: tilted toward the user; positive: tilted away.
   */
  tiltY: number;
  /**
   * Clockwise rotation of the transducer (barrel) around its major axis, in degrees.
   * Range: 0–359.
   */
  twist: number;
  /**
   * Normalized tangential pressure (barrel/eraser button). Range: −1 to +1.
   * 0 for devices that don't support it.
   */
  tangentialPressure: number;
}

/** Mouse/keyboard default — use when there is no real pointer event (injected commands). */
export const DEFAULT_PEN_INPUT: PenInput = {
  pointerType: 'mouse',
  pressure: 0.5,
  tiltX: 0,
  tiltY: 0,
  twist: 0,
  tangentialPressure: 0,
};

export type ToolName =
  | 'select'
  | 'line'
  | 'circle'
  | 'circle3p'
  | 'point'
  | 'arc'
  | 'arc3p'
  | 'rect'
  | 'rectCenter'
  | 'polygon'
  | 'slot'
  | 'arcSlot'
  | 'bspline'
  | 'polyline'
  | 'freehand'
  | 'text'
  | 'image'
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
  /** Input device data. Always present; uses mouse defaults for keyboard-injected actions. */
  pen: PenInput;
  /** World units per screen pixel — for screen-consistent thresholds (e.g. dimension anchoring). */
  pixelToWorld?: number;
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
  /**
   * Stable identity of this parameter (e.g. 'radius', 'startAngle', 'endAngle').
   * Lets the overlay track the active field across phase changes (np. arc:
   * promień+kąt początkowy → kąt końcowy). Falls back to array index when omitted.
   */
  id?: string;
  /** Position in CAD world space */
  worldX: number;
  worldY: number;
  /** Text to display (e.g. "L: 50.23", "R: 12.50", "∠ 45.0°") */
  text: string;
  /** Prefiks przed wartością (np. '⌀' dla średnicy). Renderowany w pigułce overlay. */
  prefix?: string;
  /** Extra pixel offset from the projected world position (for fine placement) */
  offsetX?: number;
  offsetY?: number;
  /** Visual variant */
  variant?: 'primary' | 'secondary';
  /** Jednostka wyświetlana obok wartości. Domyślnie 'mm' (lub '°' gdy tekst zawiera °). Ustaw '' by ukryć. */
  unit?: string;
  /** If true, clicking this label opens an inline input for direct numeric entry */
  editable?: boolean;
  /** Called with the new numeric value after the user commits an inline edit */
  onEdit?: (value: number) => void;
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
  /**
   * Finalizuje bieżący szkic z wpisanych parametrów (Enter w polu wymiaru).
   * Zwraca true, gdy kształt został zatwierdzony. Parametry ustawiane są przez
   * `onEdit` etykiet wymiarów (które BLOKUJĄ wartość zamiast od razu commitować).
   */
  commitDraft?(ctx: ToolContext): boolean;
}
