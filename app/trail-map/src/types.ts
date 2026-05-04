export interface TrailRoute {
  id: string;
  name: string;
  /** [longitude, latitude, elevationMeters] */
  coordinates: [number, number, number][];
  /** Unix timestamps in seconds (optional, from GPX <time> elements) */
  timestamps?: number[];
  waypoints: Waypoint[];
  /** RGB color for solid mode */
  color: [number, number, number];
  visible: boolean;
  stats: RouteStats;
}

export interface Waypoint {
  position: [number, number, number];
  name: string;
  type: 'start' | 'end' | 'wpt';
  sym?: string;
}

export interface RouteStats {
  /** km */
  totalDistance: number;
  /** meters */
  elevationGain: number;
  /** meters (positive value) */
  elevationLoss: number;
  maxElevation: number;
  minElevation: number;
  avgElevation: number;
  pointCount: number;
  /** seconds — only if timestamps are present */
  duration?: number;
}

export interface HoverState {
  /** Index in route coordinates array */
  coordIndex: number;
  /** km from start */
  distanceFromStart: number;
  elevation: number;
  position: [number, number];
  routeId: string;
}

export type MapStyleId = 'liberty' | 'bright' | 'positron' | 'fiord';
export type ColorMode = 'solid' | 'elevation' | 'slope';
export type ViewMode = '2d' | '3d';

export interface MapStyleDef {
  id: MapStyleId;
  label: string;
  url: string;
}

export const MAP_STYLES: MapStyleDef[] = [
  { id: 'liberty', label: 'Outdoor', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'bright', label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { id: 'positron', label: 'Light', url: 'https://tiles.openfreemap.org/styles/positron' },
  { id: 'fiord', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/fiord' },
];

export const ROUTE_PALETTE: [number, number, number][] = [
  [41, 182, 246],   // blue
  [102, 187, 106],  // green
  [255, 167, 38],   // orange
  [239, 83, 80],    // red
  [171, 71, 188],   // purple
  [38, 198, 218],   // cyan
  [255, 112, 67],   // deep-orange
];
