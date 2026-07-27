import type { BoundingBox2D, EntityType, LineType, Point2D } from '../types';

export interface EntityBase {
  id: string;
  type: EntityType;
  layerId: string;
  color: string | 'bylayer';
  lineType: LineType | 'bylayer';
  lineWidth: number | 'bylayer';
  visible: boolean;
  locked: boolean;
  extrudeHeight: number; // 0 = flat 2D
  boundingBox: BoundingBox2D;
}

export interface LineEntity extends EntityBase {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CircleEntity extends EntityBase {
  type: 'circle';
  cx: number;
  cy: number;
  radius: number;
}

export interface PointEntity extends EntityBase {
  type: 'point';
  x: number;
  y: number;
}

export interface PolylineEntity extends EntityBase {
  type: 'polyline';
  points: Point2D[];
  closed: boolean;
  /**
   * Metadane kształtu parametrycznego (slot / arc slot / b-spline). Gdy obecne, edytor pokazuje
   * gripy dla `ctrl` (punktów kontrolnych), a przy przeciąganiu odbudowuje `points` z tych parametrów.
   */
  construction?: {
    kind: 'slot' | 'arcSlot' | 'bspline';
    ctrl: Point2D[];         // punkty kontrolne (grips)
    radius?: number;         // slot / arcSlot — promień/szerokość
    interpolating?: boolean; // bspline — przez punkty (by knots)
    periodic?: boolean;      // bspline — zamknięty
  };
}

export interface RectEntity extends EntityBase {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArcEntity extends EntityBase {
  type: 'arc';
  cx: number;
  cy: number;
  radius: number;
  startAngle: number; // radians
  endAngle: number;   // radians
}

export interface TextEntity extends EntityBase {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;   // world units
  fontFamily: string;
  angle: number;      // radians
}

export interface ImageEntity extends EntityBase {
  type: 'image';
  x: number;          // bottom-left
  y: number;
  width: number;
  height: number;
  src: string;        // data URL or external URL
}

export interface FreehandEntity extends EntityBase {
  type: 'freehand';
  points: Point2D[];
  strokeWidth: number;
  smooth: boolean;
}

/**
 * Anchors a dimension endpoint to a feature of another entity so it follows
 * that entity when the shape moves or is reshaped ("intelligent dimension").
 * `point-on` lets the endpoint ride any point along an edge (param t / angle).
 */
export interface DimAnchor {
  entityId: string;
  kind: 'endpoint' | 'midpoint' | 'center' | 'point-on';
  /** endpoint/midpoint index, or polyline segment, or rect edge (0..3). */
  index?: number;
  /** parameter [0..1] along a segment/edge (point-on line/polyline/rect). */
  t?: number;
  /** radians on a circle/arc (point-on circle/arc). */
  angle?: number;
  /** When true the anchor is kept but ignored — the endpoint behaves as a literal point. */
  disabled?: boolean;
}

export interface DimensionEntity extends EntityBase {
  type: 'dimension';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset: number; // signed perpendicular distance from p1-p2 line to dimension line
  /**
   * Rodzaj wymiaru. 'diameter' → rysowany wewnętrznie jako dwustronna strzałka przez
   * środek okręgu (p1,p2 to końce średnicy), a opis „⌀value" leży w kierunku linii
   * w odległości `labelDist` od środka. Brak = zwykły wymiar liniowy.
   */
  dimType?: 'diameter';
  /** Dla `dimType:'diameter'` — odległość opisu (⌀value) od środka wzdłuż linii wymiarowej. */
  labelDist?: number;
  /** When set, x1,y1 are resolved live from this anchor (follows the shape). */
  anchor1?: DimAnchor;
  /** When set, x2,y2 are resolved live from this anchor (follows the shape). */
  anchor2?: DimAnchor;
  /** Driving (stały) constraint — geometria jest utrzymywana tak, by wymiar == `value`. */
  driving?: boolean;
  /** Docelowa wartość wymiaru napędzającego (mm). */
  value?: number;
  /**
   * Wymiar do osi układu: 'x' = do osi X (y=0), 'y' = do osi Y (x=0).
   * Stopa prostopadłej (x2,y2) jest wyliczana z zakotwiczonego końca (x1,y1),
   * więc podąża za wierzchołkiem — pomiar odległości od CAŁEJ linii osi, nie od punktu.
   */
  axis?: 'x' | 'y';
}

// 3D primitive entities — placed in XY plane, extruding along +Z
export interface Box3dEntity extends EntityBase {
  type: 'box3d';
  cx: number;  // center X
  cy: number;  // center Y
  width: number;
  depth: number;   // Y dimension (footprint depth)
  height: number;  // Z extrusion height
}

export interface Cylinder3dEntity extends EntityBase {
  type: 'cylinder3d';
  cx: number;
  cy: number;
  radius: number;
  height: number;  // Z extrusion height
}

export interface Sphere3dEntity extends EntityBase {
  type: 'sphere3d';
  cx: number;
  cy: number;
  radius: number;
}

export type Entity =
  | LineEntity
  | CircleEntity
  | PointEntity
  | PolylineEntity
  | RectEntity
  | ArcEntity
  | TextEntity
  | ImageEntity
  | FreehandEntity
  | DimensionEntity
  | Box3dEntity
  | Cylinder3dEntity
  | Sphere3dEntity;

// Input types for creating entities (id and boundingBox auto-generated)
export type EntityInput =
  | Omit<LineEntity, 'id' | 'boundingBox'>
  | Omit<CircleEntity, 'id' | 'boundingBox'>
  | Omit<PointEntity, 'id' | 'boundingBox'>
  | Omit<PolylineEntity, 'id' | 'boundingBox'>
  | Omit<RectEntity, 'id' | 'boundingBox'>
  | Omit<ArcEntity, 'id' | 'boundingBox'>
  | Omit<TextEntity, 'id' | 'boundingBox'>
  | Omit<ImageEntity, 'id' | 'boundingBox'>
  | Omit<FreehandEntity, 'id' | 'boundingBox'>
  | Omit<DimensionEntity, 'id' | 'boundingBox'>
  | Omit<Box3dEntity, 'id' | 'boundingBox'>
  | Omit<Cylinder3dEntity, 'id' | 'boundingBox'>
  | Omit<Sphere3dEntity, 'id' | 'boundingBox'>;
