import * as THREE from 'three';
import type { Box3dEntity, Cylinder3dEntity, DimensionEntity, Entity, FreehandEntity, ImageEntity, Layer, Sphere3dEntity, TextEntity } from '@mhersztowski/core-cad';

const SELECTION_COLOR = new THREE.Color('#4fc3f7');
const PREVIEW_COLOR = new THREE.Color('#ffcc00');
const DIM_COLOR_DEFAULT = '#c0c0c0';
const CIRCLE_SEGMENTS = 64;
const SELECTION_EMISSIVE = new THREE.Color('#1a6080');

function getEntityColor(entity: Entity, layer: Layer | undefined): THREE.Color {
  if (entity.color !== 'bylayer') {
    return new THREE.Color(entity.color as string);
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

function makeTextSprite(text: string, colorHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 28px monospace';
  ctx.fillStyle = colorHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 24);
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}

const textureCache = new Map<string, THREE.Texture>();

function buildTextObject(entity: TextEntity, layer: Layer | undefined, isSelected: boolean): THREE.Object3D {
  const colorHex = isSelected ? '#4fc3f7'
    : entity.color !== 'bylayer' ? entity.color as string
    : (layer?.color ?? '#ffffff');

  const PX_PER_UNIT = 12;
  const canvas = document.createElement('canvas');
  const ctx2d = canvas.getContext('2d')!;
  const fontPx = Math.max(8, Math.ceil(entity.fontSize * PX_PER_UNIT));
  ctx2d.font = `${fontPx}px ${entity.fontFamily}`;
  const metrics = ctx2d.measureText(entity.content || ' ');
  const cw = Math.ceil(metrics.width) + 8;
  const ch = Math.ceil(fontPx * 1.5);
  canvas.width = cw;
  canvas.height = ch;
  ctx2d.font = `${fontPx}px ${entity.fontFamily}`;
  ctx2d.fillStyle = colorHex;
  ctx2d.textBaseline = 'alphabetic';
  ctx2d.fillText(entity.content || '', 4, ch * 0.78);

  const texture = new THREE.CanvasTexture(canvas);
  const worldW = cw / PX_PER_UNIT;
  const worldH = ch / PX_PER_UNIT;
  const geo = new THREE.PlaneGeometry(worldW, worldH);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(entity.x + worldW / 2, entity.y + worldH / 2, 0.2);
  if (entity.angle) mesh.rotation.z = entity.angle;

  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;
  group.add(mesh);

  if (isSelected) {
    const bPts = [0, 0, 0.3, worldW, 0, 0.3, worldW, worldH, 0.3, 0, worldH, 0.3, 0, 0, 0.3];
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPts, 3));
    const bLine = new THREE.Line(bGeo, new THREE.LineBasicMaterial({ color: SELECTION_COLOR }));
    bLine.position.set(entity.x, entity.y, 0);
    if (entity.angle) bLine.rotation.z = entity.angle;
    group.add(bLine);
  }

  return group;
}

function buildImageObject(entity: ImageEntity, _layer: Layer | undefined, isSelected: boolean): THREE.Object3D {
  const cached = textureCache.get(entity.src);
  let texture: THREE.Texture;
  if (cached) {
    texture = cached;
  } else {
    texture = new THREE.TextureLoader().load(entity.src, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(entity.src, t);
    });
  }

  const geo = new THREE.PlaneGeometry(entity.width, entity.height);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(entity.x + entity.width / 2, entity.y + entity.height / 2, 0.1);

  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;
  group.add(mesh);

  if (isSelected) {
    const { x, y, width: w, height: h } = entity;
    const bPts = [x, y, 0.3, x + w, y, 0.3, x + w, y + h, 0.3, x, y + h, 0.3, x, y, 0.3];
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPts, 3));
    group.add(new THREE.Line(bGeo, new THREE.LineBasicMaterial({ color: SELECTION_COLOR })));
  }

  return group;
}

function buildFreehandObject(entity: FreehandEntity, layer: Layer | undefined, isSelected: boolean): THREE.Object3D {
  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;

  if (entity.points.length < 2) return group;

  const color = getEntityColor(entity, layer);
  const vectors = entity.points.map(p => new THREE.Vector3(p.x, p.y, 0));

  let curve: THREE.Curve<THREE.Vector3>;
  if (entity.smooth && vectors.length >= 3) {
    curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
  } else {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < vectors.length - 1; i++) {
      path.add(new THREE.LineCurve3(vectors[i], vectors[i + 1]));
    }
    curve = path as unknown as THREE.Curve<THREE.Vector3>;
  }

  const radius = Math.max(0.5, entity.strokeWidth * 0.5);
  const tubularSegs = Math.min(500, Math.max(20, entity.points.length * (entity.smooth ? 5 : 2)));

  try {
    const geo = new THREE.TubeGeometry(curve, tubularSegs, radius, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: isSelected ? SELECTION_COLOR : color,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData['entityId'] = entity.id;
    group.add(mesh);
  } catch {
    // degenerate path (coincident points) — render nothing
  }

  return group;
}

function addLineSegment(group: THREE.Group, mat: THREE.Material, pts: number[]): void {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.Line(geo, mat));
}

function arrowHeadLines(
  tip: { x: number; y: number },
  dx: number,
  dy: number,
  size: number,
): [number[], number[]] {
  const angle = 0.4;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const side1 = [
    tip.x, tip.y, 0,
    tip.x - (dx * cos - dy * sin) * size,
    tip.y - (dx * sin + dy * cos) * size,
    0,
  ];
  const side2 = [
    tip.x, tip.y, 0,
    tip.x - (dx * cos + dy * sin) * size,
    tip.y - (-dx * sin + dy * cos) * size,
    0,
  ];
  return [side1, side2];
}

function buildDimensionObject(entity: DimensionEntity, layer: Layer | undefined, isSelected: boolean): THREE.Group {
  const colorHex = isSelected
    ? '#4fc3f7'
    : entity.color !== 'bylayer'
      ? (entity.color as string)
      : (layer?.color ?? DIM_COLOR_DEFAULT);
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(colorHex), linewidth: 1 });

  const { x1, y1, x2, y2, offset } = entity;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;

  if (len < 0.001) return group;

  const ux = dx / len, uy = dy / len;    // unit along p1→p2
  const nx = -uy, ny = ux;               // perpendicular unit (left of p1→p2)
  const offSign = offset >= 0 ? 1 : -1;

  // Dimension line endpoints
  const d1 = { x: x1 + nx * offset, y: y1 + ny * offset };
  const d2 = { x: x2 + nx * offset, y: y2 + ny * offset };

  const gap = offSign * 2;
  const overshoot = offSign * 5;

  // Extension line 1: from p1 (with gap) to past dim line
  addLineSegment(group, mat, [
    x1 + nx * gap, y1 + ny * gap, 0,
    d1.x + nx * overshoot, d1.y + ny * overshoot, 0,
  ]);

  // Extension line 2: from p2 (with gap) to past dim line
  addLineSegment(group, mat, [
    x2 + nx * gap, y2 + ny * gap, 0,
    d2.x + nx * overshoot, d2.y + ny * overshoot, 0,
  ]);

  // Dimension line
  addLineSegment(group, mat, [d1.x, d1.y, 0, d2.x, d2.y, 0]);

  // Arrowheads (size = 3% of length, min 4)
  const arrowSize = Math.max(4, len * 0.04);

  // Arrow at d1 pointing toward d2
  const [a1s1, a1s2] = arrowHeadLines(d1, ux, uy, arrowSize);
  addLineSegment(group, mat, a1s1);
  addLineSegment(group, mat, a1s2);

  // Arrow at d2 pointing toward d1
  const [a2s1, a2s2] = arrowHeadLines(d2, -ux, -uy, arrowSize);
  addLineSegment(group, mat, a2s1);
  addLineSegment(group, mat, a2s2);

  // Measurement text sprite
  const midX = (d1.x + d2.x) / 2;
  const midY = (d1.y + d2.y) / 2;
  const sprite = makeTextSprite(len.toFixed(2), colorHex);
  const textH = Math.max(6, len * 0.08);
  sprite.scale.set(textH * (256 / 48), textH, 1);
  sprite.position.set(midX + nx * (offSign * 6), midY + ny * (offSign * 6), 2);
  group.add(sprite);

  return group;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function buildEntityObject(entity: Entity, layer: Layer | undefined, isSelected: boolean): THREE.Object3D {
  if (entity.type === 'dimension') {
    return buildDimensionObject(entity, layer, isSelected);
  }
  if (entity.type === 'freehand') {
    return buildFreehandObject(entity, layer, isSelected);
  }
  if (entity.type === 'text') {
    return buildTextObject(entity, layer, isSelected);
  }
  if (entity.type === 'image') {
    return buildImageObject(entity, layer, isSelected);
  }

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
      const g = new THREE.Group();
      g.userData['entityId'] = (entity as Entity).id;
      return g;
    }
  }
}

// ── 3D mesh builders ───────────────────────────────────────────────────────────

function makeSolidMaterial(color: THREE.Color, isSelected: boolean): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: isSelected ? SELECTION_COLOR : color,
    emissive: isSelected ? SELECTION_EMISSIVE : new THREE.Color(0x000000),
    shininess: 60,
    side: THREE.DoubleSide,
  });
}

function addEdges(group: THREE.Group, geo: THREE.BufferGeometry): void {
  const edges = new THREE.EdgesGeometry(geo);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  group.add(new THREE.LineSegments(edges, mat));
}

function buildBox3dObject(entity: Box3dEntity, layer: Layer | undefined, isSelected: boolean): THREE.Group {
  const color = getEntityColor(entity, layer);
  const geo = new THREE.BoxGeometry(entity.width, entity.depth, entity.height);
  const mesh = new THREE.Mesh(geo, makeSolidMaterial(color, isSelected));
  mesh.position.set(entity.cx, entity.cy, entity.height / 2);
  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;
  group.add(mesh);
  addEdges(group, geo);
  group.children[1].position.copy(mesh.position);
  return group;
}

function buildCylinder3dObject(entity: Cylinder3dEntity, layer: Layer | undefined, isSelected: boolean): THREE.Group {
  const color = getEntityColor(entity, layer);
  const geo = new THREE.CylinderGeometry(entity.radius, entity.radius, entity.height, 32);
  geo.rotateX(Math.PI / 2); // align to Z-up
  const mesh = new THREE.Mesh(geo, makeSolidMaterial(color, isSelected));
  mesh.position.set(entity.cx, entity.cy, entity.height / 2);
  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;
  group.add(mesh);
  const edges = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  const edgeLines = new THREE.LineSegments(edges, edgeMat);
  edgeLines.position.copy(mesh.position);
  group.add(edgeLines);
  return group;
}

function buildSphere3dObject(entity: Sphere3dEntity, layer: Layer | undefined, isSelected: boolean): THREE.Group {
  const color = getEntityColor(entity, layer);
  const geo = new THREE.SphereGeometry(entity.radius, 32, 16);
  const mesh = new THREE.Mesh(geo, makeSolidMaterial(color, isSelected));
  mesh.position.set(entity.cx, entity.cy, entity.radius);
  const group = new THREE.Group();
  group.userData['entityId'] = entity.id;
  group.add(mesh);
  return group;
}

// Build extruded version of a 2D entity (extrudeHeight > 0)
function buildExtruded2dObject(entity: Entity, layer: Layer | undefined, isSelected: boolean): THREE.Object3D | null {
  if (entity.type === 'circle') {
    const color = getEntityColor(entity, layer);
    const geo = new THREE.CylinderGeometry(entity.radius, entity.radius, entity.extrudeHeight, 32);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, makeSolidMaterial(color, isSelected));
    mesh.position.set(entity.cx, entity.cy, entity.extrudeHeight / 2);
    const group = new THREE.Group();
    group.userData['entityId'] = entity.id;
    group.add(mesh);
    const edges = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    const edgeLines = new THREE.LineSegments(edges, edgeMat);
    edgeLines.position.copy(mesh.position);
    group.add(edgeLines);
    return group;
  }

  if (entity.type === 'rect') {
    const color = getEntityColor(entity, layer);
    const geo = new THREE.BoxGeometry(entity.width, entity.height, entity.extrudeHeight);
    const mesh = new THREE.Mesh(geo, makeSolidMaterial(color, isSelected));
    mesh.position.set(entity.x + entity.width / 2, entity.y + entity.height / 2, entity.extrudeHeight / 2);
    const group = new THREE.Group();
    group.userData['entityId'] = entity.id;
    group.add(mesh);
    addEdges(group, geo);
    group.children[1].position.copy(mesh.position);
    return group;
  }

  if (entity.type === 'polyline' && entity.closed && entity.points.length >= 3) {
    const color = getEntityColor(entity, layer);
    const shape = new THREE.Shape();
    shape.moveTo(entity.points[0].x, entity.points[0].y);
    for (let i = 1; i < entity.points.length; i++) shape.lineTo(entity.points[i].x, entity.points[i].y);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: entity.extrudeHeight, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, makeSolidMaterial(color, isSelected));
    const group = new THREE.Group();
    group.userData['entityId'] = entity.id;
    group.add(mesh);
    addEdges(group, geo);
    return group;
  }

  return null;
}

// Build entity in 3D view mode
export function build3dEntityObject(entity: Entity, layer: Layer | undefined, isSelected: boolean): THREE.Object3D {
  switch (entity.type) {
    case 'box3d': return buildBox3dObject(entity, layer, isSelected);
    case 'cylinder3d': return buildCylinder3dObject(entity, layer, isSelected);
    case 'sphere3d': return buildSphere3dObject(entity, layer, isSelected);
    case 'dimension': return buildDimensionObject(entity, layer, isSelected);
    default: {
      if (entity.extrudeHeight > 0) {
        const obj = buildExtruded2dObject(entity, layer, isSelected);
        if (obj) return obj;
      }
      // Fall back to flat 2D rendering (lifted slightly above ground)
      const obj = buildEntityObject(entity, layer, isSelected);
      // Lift flat entities above Z=0 so they're visible over the grid
      obj.position.z = 0.5;
      return obj;
    }
  }
}

export function buildPreviewObject(
  type: string,
  points: { x: number; y: number }[],
  radius?: number,
  ghostSegments?: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>,
  options?: { startAngle?: number; endAngle?: number },
): THREE.Object3D | null {
  const mat = new THREE.LineBasicMaterial({ color: PREVIEW_COLOR, linewidth: 1 });

  if (type === 'ghost' && ghostSegments && ghostSegments.length > 0) {
    const pts: number[] = [];
    for (const seg of ghostSegments) {
      pts.push(seg.a.x, seg.a.y, 0);
      pts.push(seg.b.x, seg.b.y, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, mat);
  }

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

  if (type === 'arc' && points.length >= 1 && radius !== undefined && radius > 0) {
    const sa = options?.startAngle ?? 0;
    const ea = options?.endAngle ?? Math.PI * 2;
    const cx = points[0].x, cy = points[0].y;
    let sweep = ea - sa;
    // Normalize to CCW sweep in [0, 2π]
    if (sweep <= 0) sweep += Math.PI * 2;
    const segs = Math.max(8, Math.ceil(sweep / (Math.PI / 16)));
    const pts: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = sa + (i / segs) * sweep;
      pts.push(cx + radius * Math.cos(a), cy + radius * Math.sin(a), 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
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
