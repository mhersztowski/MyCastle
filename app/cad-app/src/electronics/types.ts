/** Pixels per grid unit (one hole pitch = 2.54 mm real, displayed as GRID px). */
export const GRID = 20;

/** Pin snap radius in grid units — cursor within this distance snaps to a pin. */
export const SNAP_RADIUS = 0.7;

export type PartCategory =
  | 'board'
  | 'microcontroller'
  | 'passive'
  | 'active'
  | 'sensor'
  | 'power'
  | 'display';

export interface Pin {
  id: string;
  /** X offset from component top-left anchor, in grid units */
  x: number;
  /** Y offset from component top-left anchor, in grid units */
  y: number;
  label?: string;
}

export type BodyShape =
  | 'breadboard'
  | 'ic'
  | 'resistor'
  | 'led'
  | 'button'
  | 'capacitor'
  | 'transistor'
  | 'dip';

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  description?: string;
  /** Size in grid units */
  width: number;
  height: number;
  pins: Pin[];
  bodyColor: string;
  bodyShape: BodyShape;
  /** Short text shown on the body */
  label?: string;
  /** LED/indicator color (for led shape) */
  indicatorColor?: string;
}

export interface ComponentPlacement {
  id: string;
  partId: string;
  /** Top-left anchor, in grid units */
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface WirePoint {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  /** Ordered list of grid-unit waypoints */
  points: WirePoint[];
  color: string;
}

export interface ElectronicsSchema {
  version: 1;
  components: ComponentPlacement[];
  wires: Wire[];
}

export const WIRE_COLORS = [
  '#ef5350', // red
  '#42a5f5', // blue
  '#66bb6a', // green
  '#ffa726', // orange
  '#ffffff',  // white
  '#000000',  // black
  '#ab47bc', // purple
  '#26c6da', // cyan
  '#ffee58', // yellow
];

export type InteractionMode = 'select' | 'place' | 'wire';
