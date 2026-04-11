import type { BoundingBox2D, Point2D } from '../types';
import type { ArcEntity, CircleEntity, Entity, LineEntity, PolylineEntity, RectEntity } from './types';

function boundsFromPoints(points: Point2D[]): BoundingBox2D {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function lineBox(e: LineEntity): BoundingBox2D {
  return boundsFromPoints([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]);
}

function circleBox(e: CircleEntity): BoundingBox2D {
  return { minX: e.cx - e.radius, minY: e.cy - e.radius, maxX: e.cx + e.radius, maxY: e.cy + e.radius };
}

function polylineBox(e: PolylineEntity): BoundingBox2D {
  return boundsFromPoints(e.points);
}

function rectBox(e: RectEntity): BoundingBox2D {
  return { minX: e.x, minY: e.y, maxX: e.x + e.width, maxY: e.y + e.height };
}

function arcBox(e: ArcEntity): BoundingBox2D {
  // Approximate: use center ± radius
  return { minX: e.cx - e.radius, minY: e.cy - e.radius, maxX: e.cx + e.radius, maxY: e.cy + e.radius };
}

export function computeBoundingBox(entity: Entity): BoundingBox2D {
  switch (entity.type) {
    case 'line': return lineBox(entity);
    case 'circle': return circleBox(entity);
    case 'polyline': return polylineBox(entity);
    case 'rect': return rectBox(entity);
    case 'arc': return arcBox(entity);
  }
}
