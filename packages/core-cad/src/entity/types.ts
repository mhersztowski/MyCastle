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

export type Entity = LineEntity | CircleEntity | PolylineEntity | RectEntity | ArcEntity;

// Input types for creating entities (id and boundingBox auto-generated)
export type EntityInput =
  | Omit<LineEntity, 'id' | 'boundingBox'>
  | Omit<CircleEntity, 'id' | 'boundingBox'>
  | Omit<PolylineEntity, 'id' | 'boundingBox'>
  | Omit<RectEntity, 'id' | 'boundingBox'>
  | Omit<ArcEntity, 'id' | 'boundingBox'>;
