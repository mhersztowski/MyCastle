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

export interface PolylineEntity extends EntityBase {
  type: 'polyline';
  points: Point2D[];
  closed: boolean;
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

export interface DimensionEntity extends EntityBase {
  type: 'dimension';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset: number; // signed perpendicular distance from p1-p2 line to dimension line
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
  | PolylineEntity
  | RectEntity
  | ArcEntity
  | DimensionEntity
  | Box3dEntity
  | Cylinder3dEntity
  | Sphere3dEntity;

// Input types for creating entities (id and boundingBox auto-generated)
export type EntityInput =
  | Omit<LineEntity, 'id' | 'boundingBox'>
  | Omit<CircleEntity, 'id' | 'boundingBox'>
  | Omit<PolylineEntity, 'id' | 'boundingBox'>
  | Omit<RectEntity, 'id' | 'boundingBox'>
  | Omit<ArcEntity, 'id' | 'boundingBox'>
  | Omit<DimensionEntity, 'id' | 'boundingBox'>
  | Omit<Box3dEntity, 'id' | 'boundingBox'>
  | Omit<Cylinder3dEntity, 'id' | 'boundingBox'>
  | Omit<Sphere3dEntity, 'id' | 'boundingBox'>;
