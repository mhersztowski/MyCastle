import * as THREE from 'three';
import type { Entity, Layer } from '@mhersztowski/core-cad';

const SELECTION_COLOR = new THREE.Color('#4fc3f7');
const PREVIEW_COLOR = new THREE.Color('#ffcc00');
const CIRCLE_SEGMENTS = 64;

function getEntityColor(entity: Entity, layer: Layer | undefined): THREE.Color {
  if (entity.color !== 'bylayer') {
    return new THREE.Color(entity.color);
  }
  return new THREE.Color(layer?.color ?? '#ffffff');
}

function makeLineMaterial(color: THREE.Color, isSelected: boolean): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: isSelected ? SELECTION_COLOR : color,
    linewidth: 1,
  });
}

function circlePoints(cx: number, cy: number, r: number, segments = CIRCLE_SEGMENTS): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a), 0);
  }
  return pts;
}

export function buildEntityObject(entity: Entity, layer: Layer | undefined, isSelected: boolean): THREE.Object3D {
  const color = getEntityColor(entity, layer);
  const mat = makeLineMaterial(color, isSelected);

  switch (entity.type) {
    case 'line': {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        entity.x1, entity.y1, 0,
        entity.x2, entity.y2, 0,
      ], 3));
      const line = new THREE.Line(geo, mat);
      line.userData['entityId'] = entity.id;
      return line;
    }

    case 'circle': {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(
        circlePoints(entity.cx, entity.cy, entity.radius), 3
      ));
      const line = new THREE.Line(geo, mat);
      line.userData['entityId'] = entity.id;
      return line;
    }

    case 'rect': {
      const { x, y, width: w, height: h } = entity;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        x, y, 0,
        x + w, y, 0,
        x + w, y + h, 0,
        x, y + h, 0,
        x, y, 0,
      ], 3));
      const line = new THREE.Line(geo, mat);
      line.userData['entityId'] = entity.id;
      return line;
    }

    case 'polyline': {
      const pts: number[] = [];
      for (const p of entity.points) pts.push(p.x, p.y, 0);
      if (entity.closed && entity.points.length > 0) {
        pts.push(entity.points[0].x, entity.points[0].y, 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(geo, mat);
      line.userData['entityId'] = entity.id;
      return line;
    }

    case 'arc': {
      const pts: number[] = [];
      const totalAngle = entity.endAngle - entity.startAngle;
      const segs = Math.max(8, Math.ceil(Math.abs(totalAngle) / (Math.PI / 16)));
      for (let i = 0; i <= segs; i++) {
        const a = entity.startAngle + (i / segs) * totalAngle;
        pts.push(entity.cx + entity.radius * Math.cos(a), entity.cy + entity.radius * Math.sin(a), 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(geo, mat);
      line.userData['entityId'] = entity.id;
      return line;
    }

    default: {
      // Fallback: invisible group
      const g = new THREE.Group();
      g.userData['entityId'] = (entity as Entity).id;
      return g;
    }
  }
}

export function buildPreviewObject(type: string, points: { x: number; y: number }[], radius?: number): THREE.Object3D | null {
  const mat = new THREE.LineBasicMaterial({ color: PREVIEW_COLOR, linewidth: 1 });

  if (type === 'line' && points.length === 2) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      points[0].x, points[0].y, 0,
      points[1].x, points[1].y, 0,
    ], 3));
    return new THREE.Line(geo, mat);
  }

  if (type === 'circle' && points.length >= 2 && radius !== undefined && radius > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      circlePoints(points[0].x, points[0].y, radius), 3
    ));
    return new THREE.Line(geo, mat);
  }

  if (type === 'rect' && points.length === 2) {
    const x = Math.min(points[0].x, points[1].x);
    const y = Math.min(points[0].y, points[1].y);
    const w = Math.abs(points[1].x - points[0].x);
    const h = Math.abs(points[1].y - points[0].y);
    if (w < 0.001 || h < 0.001) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      x, y, 0, x + w, y, 0, x + w, y + h, 0, x, y + h, 0, x, y, 0
    ], 3));
    return new THREE.Line(geo, mat);
  }

  if (type === 'polyline' && points.length >= 2) {
    const pts: number[] = [];
    for (const p of points) pts.push(p.x, p.y, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.Line(geo, mat);
  }

  return null;
}
