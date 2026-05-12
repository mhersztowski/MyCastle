import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';
import { Project } from '@mhersztowski/core-cad';
import type { ExtrudeFeature, Feature, FeatureTree, GrooveFeature, HelixFeature, HoleFeature, LoftCutFeature, LoftFeature, MirrorFeature, PocketFeature, RevolveFeature, ShellFeature, SketchFeature, SweepCutFeature, SweepFeature } from './types';

const SOLID_COLOR = new THREE.Color('#4fc3f7');
const SKETCH_COLOR = new THREE.Color('#4fc3f7');
const EDGE_OPACITY = 0.25;

// ── Shape extraction ──────────────────────────────────────────────────────────

function entityToShape(entity: Record<string, unknown>): THREE.Shape | null {
  const type = entity.type as string;

  if (type === 'circle') {
    const shape = new THREE.Shape();
    shape.absarc(entity.cx as number, entity.cy as number, entity.radius as number, 0, Math.PI * 2, false);
    return shape;
  }

  if (type === 'rect') {
    const shape = new THREE.Shape();
    const x = entity.x as number, y = entity.y as number;
    const w = entity.width as number, h = entity.height as number;
    shape.moveTo(x, y);
    shape.lineTo(x + w, y);
    shape.lineTo(x + w, y + h);
    shape.lineTo(x, y + h);
    shape.closePath();
    return shape;
  }

  if (type === 'polyline') {
    const pts = entity.points as Array<{ x: number; y: number }>;
    const closed = entity.closed as boolean;
    if (!closed || pts.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
    shape.closePath();
    return shape;
  }

  if (type === 'arc') {
    const shape = new THREE.Shape();
    shape.absarc(
      entity.cx as number,
      entity.cy as number,
      entity.radius as number,
      entity.startAngle as number,
      entity.endAngle as number,
      false,
    );
    return shape;
  }

  return null;
}

// ── Line-chaining for closed contour extrude ─────────────────────────────────

const CHAIN_TOLERANCE = 0.5;

interface ChainSeg {
  start: THREE.Vector2;
  end: THREE.Vector2;
  addForward(shape: THREE.Shape): void;
  addReversed(shape: THREE.Shape): void;
}

function entityToChainSeg(entity: Record<string, unknown>): ChainSeg | null {
  const type = entity.type as string;

  if (type === 'line') {
    const x1 = entity.x1 as number, y1 = entity.y1 as number;
    const x2 = entity.x2 as number, y2 = entity.y2 as number;
    return {
      start: new THREE.Vector2(x1, y1), end: new THREE.Vector2(x2, y2),
      addForward:  (s) => s.lineTo(x2, y2),
      addReversed: (s) => s.lineTo(x1, y1),
    };
  }

  if (type === 'arc') {
    const cx = entity.cx as number, cy = entity.cy as number, r = entity.radius as number;
    const a0 = entity.startAngle as number, a1 = entity.endAngle as number;
    return {
      start: new THREE.Vector2(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r),
      end:   new THREE.Vector2(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r),
      addForward:  (s) => s.absarc(cx, cy, r, a0, a1, false),
      addReversed: (s) => s.absarc(cx, cy, r, a1, a0, true),
    };
  }

  if (type === 'polyline') {
    const pts = entity.points as Array<{ x: number; y: number }>;
    if ((entity.closed as boolean) || pts.length < 2) return null;
    return {
      start: new THREE.Vector2(pts[0].x, pts[0].y),
      end:   new THREE.Vector2(pts[pts.length - 1].x, pts[pts.length - 1].y),
      addForward:  (s) => { for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y); },
      addReversed: (s) => { for (let i = pts.length - 2; i >= 0; i--) s.lineTo(pts[i].x, pts[i].y); },
    };
  }

  return null;
}

function chainToShapes(entities: Record<string, unknown>[]): THREE.Shape[] {
  const segs: ChainSeg[] = entities.map(entityToChainSeg).filter((s): s is ChainSeg => s !== null);
  const shapes: THREE.Shape[] = [];
  const used = new Array<boolean>(segs.length).fill(false);

  for (let si = 0; si < segs.length; si++) {
    if (used[si]) continue;
    used[si] = true;

    const shape = new THREE.Shape();
    shape.moveTo(segs[si].start.x, segs[si].start.y);
    segs[si].addForward(shape);

    const chainStart = segs[si].start.clone();
    const chainEnd = segs[si].end.clone();

    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        if (segs[i].start.distanceTo(chainEnd) < CHAIN_TOLERANCE) {
          segs[i].addForward(shape);
          chainEnd.copy(segs[i].end);
          used[i] = true; extended = true; break;
        }
        if (segs[i].end.distanceTo(chainEnd) < CHAIN_TOLERANCE) {
          segs[i].addReversed(shape);
          chainEnd.copy(segs[i].start);
          used[i] = true; extended = true; break;
        }
      }
    }

    if (chainEnd.distanceTo(chainStart) < CHAIN_TOLERANCE) {
      shape.closePath();
      shapes.push(shape);
    }
  }
  return shapes;
}

function entitiesToShapes(entities: Record<string, unknown>[]): THREE.Shape[] {
  const direct: THREE.Shape[] = [];
  const forChain: Record<string, unknown>[] = [];
  for (const e of entities) {
    const s = entityToShape(e);
    if (s) direct.push(s);
    else forChain.push(e);
  }
  return [...direct, ...chainToShapes(forChain)];
}

// ── Entity → line points (for sketch wireframe display) ──────────────────────

function entityToLinePoints(entity: Record<string, unknown>): THREE.Vector3[][] {
  const type = entity.type as string;
  if (type === 'line') {
    return [[
      new THREE.Vector3(entity.x1 as number, entity.y1 as number, 0),
      new THREE.Vector3(entity.x2 as number, entity.y2 as number, 0),
    ]];
  }
  if (type === 'rect') {
    const x = entity.x as number, y = entity.y as number;
    const w = entity.width as number, h = entity.height as number;
    return [[
      new THREE.Vector3(x, y, 0), new THREE.Vector3(x + w, y, 0),
      new THREE.Vector3(x + w, y + h, 0), new THREE.Vector3(x, y + h, 0),
      new THREE.Vector3(x, y, 0),
    ]];
  }
  if (type === 'circle') {
    const cx = entity.cx as number, cy = entity.cy as number, r = entity.radius as number;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    return [pts];
  }
  if (type === 'polyline') {
    const ps = entity.points as Array<{ x: number; y: number }>;
    const closed = entity.closed as boolean;
    const verts = ps.map(p => new THREE.Vector3(p.x, p.y, 0));
    if (closed && verts.length > 0) verts.push(verts[0].clone());
    return [verts];
  }
  if (type === 'arc') {
    const cx = entity.cx as number, cy = entity.cy as number, r = entity.radius as number;
    const a0 = entity.startAngle as number, a1 = entity.endAngle as number;
    const pts: THREE.Vector3[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    return [pts];
  }
  return [];
}

// ── Profile points for revolve ────────────────────────────────────────────────

function entityToProfile(entity: Record<string, unknown>): THREE.Vector2[] {
  const type = entity.type as string;
  const pts: THREE.Vector2[] = [];
  if (type === 'line') {
    pts.push(new THREE.Vector2(entity.x1 as number, entity.y1 as number));
    pts.push(new THREE.Vector2(entity.x2 as number, entity.y2 as number));
  } else if (type === 'polyline') {
    const ps = entity.points as Array<{ x: number; y: number }>;
    ps.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
  }
  return pts;
}

// ── Material helpers ──────────────────────────────────────────────────────────

function solidMat(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: SOLID_COLOR,
    side: THREE.DoubleSide,
    shininess: 40,
  });
}

function addEdges(group: THREE.Group, geo: THREE.BufferGeometry, zOffset = 0): void {
  const edges = new THREE.EdgesGeometry(geo, 15);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: EDGE_OPACITY });
  const lines = new THREE.LineSegments(edges, mat);
  lines.position.z = zOffset;
  group.add(lines);
}

// ── Plane transform ───────────────────────────────────────────────────────────

function applyPlaneTransform(group: THREE.Group, sketch: Pick<SketchFeature, 'plane' | 'offset' | 'planeMatrix'>): void {
  if (sketch.plane === 'face' && sketch.planeMatrix) {
    const mat = new THREE.Matrix4().fromArray(sketch.planeMatrix);
    mat.decompose(group.position, group.quaternion, group.scale);
    return;
  }
  switch (sketch.plane) {
    case 'XY':
      group.position.z = sketch.offset;
      break;
    case 'XZ':
      group.rotation.x = Math.PI / 2;
      group.position.y = sketch.offset;
      break;
    case 'YZ':
      group.rotation.y = Math.PI / 2;
      group.position.x = sketch.offset;
      break;
  }
}

// ── Sketch project loader ─────────────────────────────────────────────────────

function loadSketchProject(sketch: SketchFeature): Project | null {
  if (!sketch.projectData) return null;
  try {
    return Project.fromJSON(JSON.parse(sketch.projectData));
  } catch {
    return null;
  }
}

// ── Entity resolver ───────────────────────────────────────────────────────────

function resolveEntities(entityIds: string[], project: Project): Record<string, unknown>[] {
  if (entityIds.length === 0) {
    return project.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  }
  return entityIds
    .map(id => project.entityRegistry.get(id) as unknown as Record<string, unknown> | undefined)
    .filter((e): e is Record<string, unknown> => !!e);
}

// ── Loft helpers ──────────────────────────────────────────────────────────────

const LOFT_SAMPLES = 64;

function buildSketchMatrix(sketch: SketchFeature): THREE.Matrix4 {
  if (sketch.plane === 'face' && sketch.planeMatrix) {
    return new THREE.Matrix4().fromArray(sketch.planeMatrix);
  }
  const euler = new THREE.Euler();
  const pos   = new THREE.Vector3();
  const off   = sketch.offset ?? 0;
  switch (sketch.plane) {
    case 'XY': pos.set(0, 0, off); break;
    case 'XZ': euler.set(Math.PI / 2, 0, 0); pos.set(0, off, 0); break;
    case 'YZ': euler.set(0, Math.PI / 2, 0); pos.set(off, 0, 0); break;
  }
  const mat = new THREE.Matrix4();
  mat.compose(pos, new THREE.Quaternion().setFromEuler(euler), new THREE.Vector3(1, 1, 1));
  return mat;
}

function getSketchWorldPoints(sketch: SketchFeature, numPoints: number): THREE.Vector3[] | null {
  const project = loadSketchProject(sketch);
  if (!project) return null;
  const entities = project.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  const shapes = entitiesToShapes(entities);
  if (shapes.length === 0) return null;

  // getPoints(N) returns N+1 pts; last duplicates first for closed shapes
  const pts2d = shapes[0].getPoints(numPoints);
  const unique = pts2d.length > 1 && pts2d[0].distanceTo(pts2d[pts2d.length - 1]) < 0.01
    ? pts2d.slice(0, -1)
    : pts2d;

  const mat = buildSketchMatrix(sketch);
  return unique.map(p => new THREE.Vector3(p.x, p.y, 0).applyMatrix4(mat));
}

function resample(pts: THREE.Vector3[], target: number): THREE.Vector3[] {
  if (pts.length === target) return pts;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < target; i++) {
    const t   = (i / target) * (pts.length - 1);
    const lo  = Math.floor(t);
    const hi  = Math.min(lo + 1, pts.length - 1);
    out.push(new THREE.Vector3().lerpVectors(pts[lo], pts[hi], t - lo));
  }
  return out;
}

function applyLoft(feature: LoftFeature, tree: FeatureTree): THREE.Object3D | null {
  const profiles: THREE.Vector3[][] = [];

  for (const sec of feature.sections) {
    const sketch = tree.features.find(f => f.id === sec.sketchId && f.type === 'sketch') as SketchFeature | undefined;
    if (!sketch) continue;
    const pts = getSketchWorldPoints(sketch, LOFT_SAMPLES);
    if (pts && pts.length >= 3) profiles.push(pts);
  }

  if (profiles.length < 2) return null;

  const rings = feature.closed ? [...profiles, profiles[0]] : profiles;
  const n = rings.length;
  const m = LOFT_SAMPLES;
  const normalised = rings.map(p => resample(p, m));

  const verts: number[]   = [];
  const idxArr: number[]  = [];

  for (const pts of normalised) {
    for (const p of pts) verts.push(p.x, p.y, p.z);
  }

  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const a = i * m + j,  b = i * m + j1;
      const c = (i + 1) * m + j1, d = (i + 1) * m + j;
      idxArr.push(a, b, c,  a, c, d);
    }
  }

  // End caps via ShapeGeometry (flat fills for first and last section)
  const addCap = (pts: THREE.Vector3[], flip: boolean) => {
    const base = verts.length / 3;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    const cIdx = base;
    verts.push(cx, cy, cz);
    for (let j = 0; j < m; j++) verts.push(pts[j].x, pts[j].y, pts[j].z);
    for (let j = 0; j < m; j++) {
      const a = cIdx, b = cIdx + 1 + j, c = cIdx + 1 + ((j + 1) % m);
      if (flip) idxArr.push(a, c, b); else idxArr.push(a, b, c);
    }
  };

  if (!feature.closed) {
    addCap(normalised[0],     true);   // start cap — normals face away from loft
    addCap(normalised[n - 1], false);  // end cap
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, solidMat());
  mesh.userData['featureId'] = feature.id;
  group.add(mesh);
  addEdges(group, geo);
  return group;
}

// ── Sweep helpers ─────────────────────────────────────────────────────────────

const SWEEP_PATH_STEPS    = 64;
const SWEEP_PROFILE_SAMPS = 48;

function getPathWorldPoints(sketch: SketchFeature): THREE.Vector3[] {
  const project = loadSketchProject(sketch);
  if (!project) return [];
  const entities = project.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  const mat = buildSketchMatrix(sketch);
  const pts: THREE.Vector3[] = [];
  for (const entity of entities) {
    for (const strip of entityToLinePoints(entity)) {
      for (const p of strip) {
        const wp = p.clone().applyMatrix4(mat);
        if (pts.length === 0 || pts[pts.length - 1].distanceTo(wp) > 0.001) {
          pts.push(wp);
        }
      }
    }
  }
  return pts;
}

function applyExtrudeAlongPath(feature: SweepFeature, tree: FeatureTree): THREE.Object3D | null {
  const profileSketch = tree.features.find(f => f.id === feature.profileSketchId && f.type === 'sketch') as SketchFeature | undefined;
  const pathSketch    = tree.features.find(f => f.id === feature.pathSketchId    && f.type === 'sketch') as SketchFeature | undefined;
  if (!profileSketch || !pathSketch) return null;

  // Profile — 2D local points (sketch coordinate system, not world)
  const profileProj = loadSketchProject(profileSketch);
  if (!profileProj) return null;
  const profEntities = profileProj.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  const profShapes   = entitiesToShapes(profEntities);
  if (profShapes.length === 0) return null;

  const raw2d = profShapes[0].getPoints(SWEEP_PROFILE_SAMPS);
  // Drop closing duplicate for closed shapes
  const pts2d = raw2d.length > 1 && raw2d[0].distanceTo(raw2d[raw2d.length - 1]) < 0.01
    ? raw2d.slice(0, -1)
    : raw2d;
  const m = pts2d.length;

  // Path — 3D world points, smoothed with CatmullRom
  const rawPath = getPathWorldPoints(pathSketch);
  if (rawPath.length < 2) return null;
  const curve  = new THREE.CatmullRomCurve3(rawPath, false);
  const STEPS  = Math.max(rawPath.length * 4, SWEEP_PATH_STEPS);
  const frames = curve.computeFrenetFrames(STEPS, false);
  const n = STEPS + 1;

  const verts:  number[] = [];
  const idxArr: number[] = [];

  // Build one ring of profile points per path step, oriented by Frenet frame
  for (let i = 0; i < n; i++) {
    const pos = curve.getPoint(i / STEPS);
    const nor = frames.normals[i];
    const bin = frames.binormals[i];
    for (const p of pts2d) {
      verts.push(
        pos.x + nor.x * p.x + bin.x * p.y,
        pos.y + nor.y * p.x + bin.y * p.y,
        pos.z + nor.z * p.x + bin.z * p.y,
      );
    }
  }

  // Lateral faces
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const a = i * m + j,        b = i * m + j1;
      const c = (i + 1) * m + j1, d = (i + 1) * m + j;
      idxArr.push(a, b, c,  a, c, d);
    }
  }

  // Flat end caps (fan triangulation from centroid)
  const addCap = (ringBase: number, flip: boolean) => {
    const capBase = verts.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < m; j++) {
      cx += verts[(ringBase + j) * 3];
      cy += verts[(ringBase + j) * 3 + 1];
      cz += verts[(ringBase + j) * 3 + 2];
    }
    cx /= m; cy /= m; cz /= m;
    verts.push(cx, cy, cz);
    for (let j = 0; j < m; j++) {
      verts.push(verts[(ringBase + j) * 3], verts[(ringBase + j) * 3 + 1], verts[(ringBase + j) * 3 + 2]);
    }
    const cIdx = capBase;
    for (let j = 0; j < m; j++) {
      const b = cIdx + 1 + j, c = cIdx + 1 + ((j + 1) % m);
      if (flip) idxArr.push(cIdx, c, b);
      else      idxArr.push(cIdx, b, c);
    }
  };

  addCap(0,          true);   // start cap
  addCap((n - 1) * m, false); // end cap

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();

  const group = new THREE.Group();
  const mesh  = new THREE.Mesh(geo, solidMat());
  mesh.userData['featureId'] = feature.id;
  group.add(mesh);
  addEdges(group, geo);
  return group;
}

// ── Helix helpers ─────────────────────────────────────────────────────────────

const HELIX_STEPS_PER_TURN = 32;

function computeHelixSpine(feature: HelixFeature): THREE.Vector3[] {
  const { mode, pitch, height, turns, radius, taper, leftHanded, reversed } = feature;

  let h: number, t: number;
  if (mode === 'pitch_height') {
    h = height;
    t = h / Math.max(0.001, pitch);
  } else if (mode === 'pitch_turns') {
    t = Math.max(0.25, turns);
    h = Math.max(0.001, pitch) * t;
  } else {
    t = Math.max(0.25, turns);
    h = height;
  }

  const steps = Math.max(8, Math.round(t * HELIX_STEPS_PER_TURN));
  const taperRad = (taper * Math.PI) / 180;
  const dir = leftHanded ? -1 : 1;

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const angle = frac * t * Math.PI * 2 * dir;
    const y = frac * h;
    const r = Math.max(0.001, radius + y * Math.tan(taperRad));
    pts.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
  }

  if (reversed) pts.reverse();
  return pts;
}

function applyHelix(feature: HelixFeature, tree: FeatureTree): THREE.Object3D | null {
  const spine = computeHelixSpine(feature);
  if (spine.length < 2) return null;

  const group = new THREE.Group();

  const profileSketch = feature.profileSketchId
    ? tree.features.find(f => f.id === feature.profileSketchId && f.type === 'sketch') as SketchFeature | undefined
    : undefined;

  if (!profileSketch) {
    // Show spine as a thin tube when no profile is set
    const curve = new THREE.CatmullRomCurve3(spine, false);
    const tubeGeo = new THREE.TubeGeometry(curve, spine.length * 2, 1.5, 8, false);
    const mesh = new THREE.Mesh(tubeGeo, solidMat());
    mesh.userData['featureId'] = feature.id;
    group.add(mesh);
    addEdges(group, tubeGeo);
  } else {
    // Frenet sweep of profile cross-section along helix spine
    const profileProj = loadSketchProject(profileSketch);
    if (!profileProj) return null;
    const profEntities = profileProj.entityRegistry.getAll() as unknown as Record<string, unknown>[];
    const profShapes   = entitiesToShapes(profEntities);
    if (profShapes.length === 0) return null;

    const raw2d = profShapes[0].getPoints(SWEEP_PROFILE_SAMPS);
    const pts2d = raw2d.length > 1 && raw2d[0].distanceTo(raw2d[raw2d.length - 1]) < 0.01
      ? raw2d.slice(0, -1)
      : raw2d;
    const m = pts2d.length;

    const curve  = new THREE.CatmullRomCurve3(spine, false);
    const STEPS  = spine.length - 1;
    const frames = curve.computeFrenetFrames(STEPS, false);
    const n      = STEPS + 1;

    const verts:  number[] = [];
    const idxArr: number[] = [];

    for (let i = 0; i < n; i++) {
      const pos = curve.getPoint(i / STEPS);
      const nor = frames.normals[i];
      const bin = frames.binormals[i];
      for (const p of pts2d) {
        verts.push(
          pos.x + nor.x * p.x + bin.x * p.y,
          pos.y + nor.y * p.x + bin.y * p.y,
          pos.z + nor.z * p.x + bin.z * p.y,
        );
      }
    }

    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m; j++) {
        const j1 = (j + 1) % m;
        const a = i * m + j,         b = i * m + j1;
        const c = (i + 1) * m + j1,  d = (i + 1) * m + j;
        idxArr.push(a, b, c,  a, c, d);
      }
    }

    const addCap = (ringBase: number, flip: boolean) => {
      const capBase = verts.length / 3;
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < m; j++) {
        cx += verts[(ringBase + j) * 3];
        cy += verts[(ringBase + j) * 3 + 1];
        cz += verts[(ringBase + j) * 3 + 2];
      }
      cx /= m; cy /= m; cz /= m;
      verts.push(cx, cy, cz);
      for (let j = 0; j < m; j++) {
        verts.push(verts[(ringBase + j) * 3], verts[(ringBase + j) * 3 + 1], verts[(ringBase + j) * 3 + 2]);
      }
      const cIdx = capBase;
      for (let j = 0; j < m; j++) {
        const b = cIdx + 1 + j, c = cIdx + 1 + ((j + 1) % m);
        if (flip) idxArr.push(cIdx, c, b);
        else      idxArr.push(cIdx, b, c);
      }
    };

    addCap(0,           true);
    addCap((n - 1) * m, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, solidMat());
    mesh.userData['featureId'] = feature.id;
    group.add(mesh);
    addEdges(group, geo);
  }

  // Spine is computed around Y axis; rotate group to match the chosen axis
  const axis = feature.axis ?? 'Y';
  if (axis === 'sketch_horizontal' || axis === 'X') {
    group.rotation.z = -Math.PI / 2;
  } else if (axis === 'Z') {
    group.rotation.x = Math.PI / 2;
  }
  // 'sketch_vertical' | 'Y': no rotation needed

  return group;
}

// ── Loft Cut (CSG subtractive loft) ──────────────────────────────────────────

function applyLoftCut(feature: LoftCutFeature, tree: FeatureTree, accumulated: THREE.Object3D): THREE.Object3D | null {
  const asLoft: LoftFeature = { ...feature, type: 'loft' };
  const loftGroup = applyLoft(asLoft, tree);
  if (!loftGroup) return null;

  const loftGeo = mergeToSingleGeo(gatherSolidGeometries(loftGroup));
  if (!loftGeo) return null;

  const accGeo = mergeToSingleGeo(gatherSolidGeometries(accumulated));
  if (!accGeo) return null;

  try {
    const evaluator = new Evaluator();
    const brushA = new Brush(accGeo, solidMat());
    const brushB = new Brush(loftGeo, solidMat());
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    const result = evaluator.evaluate(brushA, brushB, SUBTRACTION);
    result.material = solidMat();
    result.userData['featureId'] = feature.id;

    const group = new THREE.Group();
    group.add(result);
    addEdges(group, result.geometry);
    return group;
  } catch {
    return null;
  }
}

// ── Sweep Cut (CSG subtractive sweep along path) ─────────────────────────────

function applySweepCut(feature: SweepCutFeature, tree: FeatureTree, accumulated: THREE.Object3D): THREE.Object3D | null {
  const asSweep: SweepFeature = { ...feature, type: 'sweep' };
  const sweepGroup = applyExtrudeAlongPath(asSweep, tree);
  if (!sweepGroup) return null;

  const sweepGeo = mergeToSingleGeo(gatherSolidGeometries(sweepGroup));
  if (!sweepGeo) return null;

  const accGeo = mergeToSingleGeo(gatherSolidGeometries(accumulated));
  if (!accGeo) return null;

  try {
    const evaluator = new Evaluator();
    const brushA = new Brush(accGeo, solidMat());
    const brushB = new Brush(sweepGeo, solidMat());
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    const result = evaluator.evaluate(brushA, brushB, SUBTRACTION);
    result.material = solidMat();
    result.userData['featureId'] = feature.id;

    const group = new THREE.Group();
    group.add(result);
    addEdges(group, result.geometry);
    return group;
  } catch {
    return null;
  }
}

// ── Groove (CSG subtractive revolution) ──────────────────────────────────────

function applyGroove(feature: GrooveFeature, project: Project, tree: FeatureTree, accumulated: THREE.Object3D): THREE.Object3D | null {
  // Build revolve geometry the same way as applyRevolve
  const asRevolve: RevolveFeature = { ...feature, type: 'revolve' };
  const revolveGroup = applyRevolve(asRevolve, project, tree);
  if (!revolveGroup) return null;

  const grooveGeo = mergeToSingleGeo(gatherSolidGeometries(revolveGroup));
  if (!grooveGeo) return null;

  const accGeo = mergeToSingleGeo(gatherSolidGeometries(accumulated));
  if (!accGeo) return null;

  try {
    const evaluator = new Evaluator();
    const brushA = new Brush(accGeo, solidMat());
    const brushB = new Brush(grooveGeo, solidMat());
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    const result = evaluator.evaluate(brushA, brushB, SUBTRACTION);
    result.material = solidMat();
    result.userData['featureId'] = feature.id;

    const group = new THREE.Group();
    group.add(result);
    addEdges(group, result.geometry);
    return group;
  } catch {
    return null;
  }
}

// ── Hole (CSG subtraction, parametric bore) ───────────────────────────────────

const HOLE_SEGS = 32;

/** Build a single hole geometry centred at the sketch-plane origin, drilling in -Z. */
function buildSingleHoleGeo(f: HoleFeature): THREE.BufferGeometry {
  const r  = Math.max(0.1, f.diameter / 2);
  const through = f.depthType === 'through_all';

  // For through_all: very long cylinder centred at origin (covers both directions)
  // For dimension: entry at z=0, tip at z=-depth
  const depth = through ? 10000 : Math.max(0.1, f.depth);

  const geos: THREE.BufferGeometry[] = [];

  // Helper: cylinder along Y → align to Z and position
  const cylToZ = (geo: THREE.CylinderGeometry, zCenter: number) => {
    const m = new THREE.Matrix4();
    m.makeRotationX(Math.PI / 2);                      // Y axis → Z axis
    m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, zCenter));
    geo.applyMatrix4(m);
    return geo as THREE.BufferGeometry;
  };

  // ── main bore ────────────────────────────────────────────────────────────────
  let rTop = r, rBot = r;
  if (!through && f.tapered && f.taperAngle > 0) {
    const halfRad = ((f.taperAngle / 2) * Math.PI) / 180;
    rBot = r + depth * Math.tan(halfRad);           // wider at tip
  }
  geos.push(cylToZ(new THREE.CylinderGeometry(rTop, rBot, depth, HOLE_SEGS, 1, false),
    through ? 0 : -depth / 2));

  // ── drill point (angled tip) ─────────────────────────────────────────────────
  if (!through && f.drillPoint === 'angled') {
    const tipHalfRad = (((180 - f.drillPointAngle) / 2) * Math.PI) / 180;
    const coneH      = (rBot > 0.001 ? rBot : r) / Math.tan(tipHalfRad);
    geos.push(cylToZ(new THREE.CylinderGeometry(rBot, 0, coneH, HOLE_SEGS, 1, false),
      -(depth + coneH / 2)));
  }

  // ── counterbore ──────────────────────────────────────────────────────────────
  if (f.counterType === 'counterbore' && f.counterDepth > 0) {
    const cbR = Math.max(r + 0.01, f.counterDiameter / 2);
    const cbD = f.counterDepth;
    geos.push(cylToZ(new THREE.CylinderGeometry(cbR, cbR, cbD, HOLE_SEGS, 1, false), -cbD / 2));
  }

  // ── countersink ──────────────────────────────────────────────────────────────
  if (f.counterType === 'countersink') {
    const csR         = Math.max(r + 0.01, f.counterDiameter / 2);
    const csHalfRad   = ((f.counterAngle / 2) * Math.PI) / 180;
    const csD         = (csR - r) / Math.tan(csHalfRad);
    if (csD > 0.001) {
      geos.push(cylToZ(new THREE.CylinderGeometry(csR, r, csD, HOLE_SEGS, 1, false), -csD / 2));
    }
  }

  return mergeGeometries(geos, false) ?? geos[0];
}

/** Extract circle centers (and any other prominent points) from a sketch. */
function getHoleCenters(sketch: SketchFeature): THREE.Vector2[] {
  const project = loadSketchProject(sketch);
  if (!project) return [new THREE.Vector2(0, 0)];
  const entities = project.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  const centers: THREE.Vector2[] = [];
  for (const e of entities) {
    if (e.type === 'circle')
      centers.push(new THREE.Vector2(e.cx as number, e.cy as number));
  }
  if (centers.length === 0) centers.push(new THREE.Vector2(0, 0));
  return centers;
}

function applyHole(feature: HoleFeature, tree: FeatureTree, accumulated: THREE.Object3D): THREE.Object3D | null {
  const sketch = feature.sketchId
    ? tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined
    : undefined;
  if (!sketch) return null;

  const sketchMat  = buildSketchMatrix(sketch);
  const singleGeo  = buildSingleHoleGeo(feature);
  const centers    = getHoleCenters(sketch);

  // Build all hole geometries in world space
  const allGeos: THREE.BufferGeometry[] = [];
  const reverseFlip = new THREE.Matrix4().makeRotationX(Math.PI);

  for (const c of centers) {
    const geo = singleGeo.clone();
    // Local to sketch: translate to center, optionally flip for reversed
    const localMat = new THREE.Matrix4().makeTranslation(c.x, c.y, 0);
    const holeMat  = feature.reversed
      ? sketchMat.clone().multiply(localMat).multiply(reverseFlip)
      : sketchMat.clone().multiply(localMat);
    geo.applyMatrix4(holeMat);
    allGeos.push(geo);
  }

  const holeGeo = allGeos.length === 1 ? allGeos[0] : (mergeGeometries(allGeos, false) ?? allGeos[0]);
  const accGeo  = mergeToSingleGeo(gatherSolidGeometries(accumulated));
  if (!accGeo) return null;

  try {
    const evaluator = new Evaluator();
    const brushA = new Brush(accGeo, solidMat());
    const brushB = new Brush(holeGeo, solidMat());
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    const result = evaluator.evaluate(brushA, brushB, SUBTRACTION);
    result.material = solidMat();
    result.userData['featureId'] = feature.id;

    const group = new THREE.Group();
    group.add(result);
    addEdges(group, result.geometry);
    return group;
  } catch {
    return null;
  }
}

// ── Pocket (CSG subtraction) ──────────────────────────────────────────────────

function gatherSolidGeometries(obj: THREE.Object3D): THREE.BufferGeometry[] {
  obj.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  obj.traverse(child => {
    if (child instanceof THREE.Mesh) {
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);
      geos.push(geo);
    }
  });
  return geos;
}

function mergeToSingleGeo(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0];
  return mergeGeometries(geos, false) ?? null;
}

function applyPocket(feature: PocketFeature, project: Project, tree: FeatureTree, accumulated: THREE.Object3D): THREE.Object3D | null {
  // Reuse extrude geometry builder
  const asExtrude: ExtrudeFeature = { ...feature, type: 'extrude' };
  const pocketGroup = applyExtrude(asExtrude, project, tree);
  if (!pocketGroup) return null;

  const pocketGeo = mergeToSingleGeo(gatherSolidGeometries(pocketGroup));
  if (!pocketGeo) return null;

  const accGeo = mergeToSingleGeo(gatherSolidGeometries(accumulated));
  if (!accGeo) return null;

  try {
    const evaluator = new Evaluator();
    const brushA = new Brush(accGeo, solidMat());
    const brushB = new Brush(pocketGeo, solidMat());
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    const result = evaluator.evaluate(brushA, brushB, SUBTRACTION);
    result.material = solidMat();
    result.userData['featureId'] = feature.id;

    const group = new THREE.Group();
    group.add(result);
    addEdges(group, result.geometry);
    return group;
  } catch {
    return null;
  }
}

// ── Feature applicators ───────────────────────────────────────────────────────

function applySketch(feature: SketchFeature): THREE.Object3D {
  const group = new THREE.Group();
  group.userData['featureId'] = feature.id;

  // Faint plane indicator
  const planeGeo = new THREE.PlaneGeometry(500, 500);
  const planeMat = new THREE.MeshBasicMaterial({
    color: SKETCH_COLOR, transparent: true, opacity: 0.04,
    side: THREE.DoubleSide, depthWrite: false,
  });
  group.add(new THREE.Mesh(planeGeo, planeMat));

  // Sketch entity wireframe
  const sketchProject = loadSketchProject(feature);
  if (sketchProject) {
    const lineMat = new THREE.LineBasicMaterial({ color: SKETCH_COLOR, transparent: true, opacity: 0.7 });
    const entities = sketchProject.entityRegistry.getAll() as unknown as Record<string, unknown>[];
    for (const entity of entities) {
      for (const pts of entityToLinePoints(entity)) {
        if (pts.length < 2) continue;
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geo, lineMat));
      }
    }
  }

  applyPlaneTransform(group, feature);
  return group;
}

function applyExtrude(feature: ExtrudeFeature, project: Project, tree: FeatureTree): THREE.Object3D | null {
  let sourceProject = project;
  let linkedSketch: SketchFeature | null = null;
  let hasSketch = false;

  if (feature.sketchId) {
    const sketch = tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined;
    if (sketch) {
      const sp = loadSketchProject(sketch);
      if (sp) {
        sourceProject = sp;
        linkedSketch = sketch;
        hasSketch = true;
      }
    }
  }

  const entityIds = hasSketch ? [] : feature.entityIds;
  const shapes = entitiesToShapes(resolveEntities(entityIds, sourceProject));
  if (shapes.length === 0) return null;

  const extrudeType = feature.extrudeType ?? 'dimension';
  const reversed    = feature.reversed ?? false;
  const depth       = extrudeType === 'through_all' ? 10000 : Math.abs(feature.height);
  const isSymmetric = extrudeType === 'symmetric' || (extrudeType === 'dimension' && feature.symmetric);

  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, steps: 1 });

  const taperDeg = feature.taper ?? 0;
  if (taperDeg !== 0) {
    const taperRad = (taperDeg * Math.PI) / 180;
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const t = depth > 0 ? z / depth : 0;
      const s = Math.max(0.001, 1 - t * Math.tan(taperRad));
      pos.setX(i, pos.getX(i) * s);
      pos.setY(i, pos.getY(i) * s);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  const group = new THREE.Group();
  let zOffset = 0;
  if (isSymmetric) {
    zOffset = -depth / 2;
  } else if (reversed) {
    zOffset = -depth;
  }

  const mesh = new THREE.Mesh(geo, solidMat());
  mesh.position.z = zOffset;
  mesh.userData['featureId'] = feature.id;
  group.add(mesh);
  addEdges(group, geo, zOffset);

  const direction = feature.direction ?? 'normal';
  if (direction === 'normal') {
    if (hasSketch && linkedSketch) {
      applyPlaneTransform(group, linkedSketch);
    }
  } else {
    // World-axis direction: use sketch offset for positioning, override rotation
    if (hasSketch && linkedSketch && linkedSketch.plane !== 'face') {
      const off = linkedSketch.offset ?? 0;
      if (direction === 'X') group.position.set(off, 0, 0);
      else if (direction === 'Y') group.position.set(0, off, 0);
      else group.position.set(0, 0, off); // 'Z'
    } else if (hasSketch && linkedSketch && linkedSketch.plane === 'face' && linkedSketch.planeMatrix) {
      const mat = new THREE.Matrix4().fromArray(linkedSketch.planeMatrix);
      group.position.setFromMatrixPosition(mat);
    }
    if (direction === 'X') group.rotation.set(0, Math.PI / 2, 0);
    else if (direction === 'Y') group.rotation.set(-Math.PI / 2, 0, 0);
    // 'Z': no rotation
  }

  return group;
}

// ── Shell ─────────────────────────────────────────────────────────────────────

/**
 * Creates an inner-shell geometry by displacing each vertex inward along its normal
 * and flipping triangle winding order so inner faces point inward (visible from outside
 * when looking through an open face).
 */
function createInnerShellGeo(outerGeo: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  outerGeo.computeVertexNormals();
  const pos  = outerGeo.attributes['position'] as THREE.BufferAttribute;
  const norm = outerGeo.attributes['normal']   as THREE.BufferAttribute;
  const n = pos.count;

  // Displace inward
  const innerPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    innerPos[i * 3]     = pos.getX(i) - norm.getX(i) * thickness;
    innerPos[i * 3 + 1] = pos.getY(i) - norm.getY(i) * thickness;
    innerPos[i * 3 + 2] = pos.getZ(i) - norm.getZ(i) * thickness;
  }

  const innerGeo = new THREE.BufferGeometry();

  if (outerGeo.index) {
    // Flip each triangle: [a,b,c] → [a,c,b]
    const src = outerGeo.index.array as Uint16Array | Uint32Array;
    const flipped = new Uint32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      flipped[i]     = src[i];
      flipped[i + 1] = src[i + 2];
      flipped[i + 2] = src[i + 1];
    }
    innerGeo.setAttribute('position', new THREE.BufferAttribute(innerPos, 3));
    innerGeo.setIndex(new THREE.BufferAttribute(flipped, 1));
  } else {
    // Non-indexed: swap B↔C in each 3-vertex block
    const flippedPos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) flippedPos[(i)     * 3 + k] = innerPos[(i)     * 3 + k];
      for (let k = 0; k < 3; k++) flippedPos[(i + 1) * 3 + k] = innerPos[(i + 2) * 3 + k];
      for (let k = 0; k < 3; k++) flippedPos[(i + 2) * 3 + k] = innerPos[(i + 1) * 3 + k];
    }
    innerGeo.setAttribute('position', new THREE.BufferAttribute(flippedPos, 3));
  }

  innerGeo.computeVertexNormals();
  return innerGeo;
}

function applyShell(feature: ShellFeature, accumulated: THREE.Object3D): THREE.Object3D {
  // Collect meshes first so traversal additions don't loop
  const meshes: THREE.Mesh[] = [];
  accumulated.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.renderOrder === 0) meshes.push(obj);
  });

  for (const mesh of meshes) {
    const innerGeo = createInnerShellGeo(mesh.geometry, feature.thickness);
    const innerMesh = new THREE.Mesh(innerGeo, solidMat());
    innerMesh.position.copy(mesh.position);
    innerMesh.quaternion.copy(mesh.quaternion);
    innerMesh.scale.copy(mesh.scale);
    innerMesh.userData['featureId'] = feature.id;
    const parent = (mesh.parent instanceof THREE.Group ? mesh.parent : null) ?? accumulated as THREE.Group;
    parent.add(innerMesh);
    addEdges(parent, innerGeo, mesh.position.z);
  }

  return accumulated;
}

function applyMirror(feature: MirrorFeature, accumulated: THREE.Object3D): THREE.Object3D {
  const group = new THREE.Group();
  group.add(accumulated);
  const mirror = accumulated.clone(true);
  if (feature.plane === 'YZ') mirror.scale.x = -1;
  else if (feature.plane === 'XZ') mirror.scale.y = -1;
  else if (feature.plane === 'XY') mirror.scale.z = -1;
  group.add(mirror);
  return group;
}

function applyRevolve(feature: RevolveFeature, project: Project, tree: FeatureTree): THREE.Object3D | null {
  let sourceProject = project;
  let hasSketch = false;

  if (feature.sketchId) {
    const sketch = tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined;
    if (sketch) {
      const sp = loadSketchProject(sketch);
      if (sp) { sourceProject = sp; hasSketch = true; }
    }
  }

  const allPts: THREE.Vector2[] = [];
  const entityIds = hasSketch ? [] : feature.entityIds;
  for (const entity of resolveEntities(entityIds, sourceProject)) {
    allPts.push(...entityToProfile(entity));
  }
  if (allPts.length < 2) return null;

  const revolveType = feature.revolveType ?? 'dimension';
  const reversed    = feature.reversed ?? false;
  const isSymmetric = revolveType === 'symmetric' || (revolveType === 'dimension' && (feature.symmetric ?? false));
  const angleDeg    = revolveType === 'through_all' ? 360 : Math.max(1, Math.min(360, feature.angle));
  const angleRad    = (angleDeg * Math.PI) / 180;

  let phiStart = 0;
  if (isSymmetric) {
    phiStart = -angleRad / 2;
  } else if (reversed) {
    phiStart = -angleRad;
  }

  const geo = new THREE.LatheGeometry(allPts, feature.segments, phiStart, angleRad);

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, solidMat());
  mesh.userData['featureId'] = feature.id;

  const axis = feature.axis ?? 'sketch_vertical';
  if (axis === 'sketch_horizontal' || axis === 'X') {
    mesh.rotation.z = -Math.PI / 2;
  } else if (axis === 'Z') {
    mesh.rotation.x = Math.PI / 2;
  }
  // 'sketch_vertical', 'Y': LatheGeometry revolves around Y by default — no rotation needed

  group.add(mesh);
  addEdges(group, geo);
  return group;
}

// ── Main evaluator ────────────────────────────────────────────────────────────

export function evaluateFeatureTree(tree: FeatureTree, project: Project): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'cad3d-root';

  let accumulated: THREE.Object3D | null = null;

  for (const feature of tree.features) {
    if (!feature.enabled) continue;

    // Sketches are visual guides — added to root, not accumulated into solid
    if (feature.type === 'sketch') {
      root.add(applySketch(feature as SketchFeature));
      continue;
    }

    let result: THREE.Object3D | null = null;

    switch (feature.type) {
      case 'extrude':
        result = applyExtrude(feature as ExtrudeFeature, project, tree);
        break;
      case 'revolve':
        result = applyRevolve(feature as RevolveFeature, project, tree);
        break;
      case 'loft':
        result = applyLoft(feature as LoftFeature, tree);
        break;
      case 'sweep':
        result = applyExtrudeAlongPath(feature as SweepFeature, tree);
        break;
      case 'helix':
        result = applyHelix(feature as HelixFeature, tree);
        break;
      case 'loft_cut':
        if (accumulated) {
          const loftCutResult = applyLoftCut(feature as LoftCutFeature, tree, accumulated);
          if (loftCutResult) accumulated = loftCutResult;
        }
        continue;
      case 'sweep_cut':
        if (accumulated) {
          const sweepCutResult = applySweepCut(feature as SweepCutFeature, tree, accumulated);
          if (sweepCutResult) accumulated = sweepCutResult;
        }
        continue;
      case 'groove':
        if (accumulated) {
          const grooveResult = applyGroove(feature as GrooveFeature, project, tree, accumulated);
          if (grooveResult) accumulated = grooveResult;
        }
        continue;
      case 'hole':
        if (accumulated) {
          const holeResult = applyHole(feature as HoleFeature, tree, accumulated);
          if (holeResult) accumulated = holeResult;
        }
        continue;
      case 'pocket':
        if (accumulated) {
          const pocketResult = applyPocket(feature as PocketFeature, project, tree, accumulated);
          if (pocketResult) accumulated = pocketResult;
        }
        continue;
      case 'mirror':
        if (accumulated) {
          accumulated = applyMirror(feature as MirrorFeature, accumulated);
        }
        continue;
      case 'shell':
        if (accumulated) {
          accumulated = applyShell(feature as ShellFeature, accumulated);
        }
        continue;
    }

    if (result) {
      if (accumulated) {
        const g = new THREE.Group();
        g.add(accumulated);
        g.add(result);
        accumulated = g;
      } else {
        accumulated = result;
      }
    }
  }

  if (accumulated) root.add(accumulated);
  return root;
}

export function featureEntityIds(feature: Feature): string[] {
  if (feature.type === 'extrude') return (feature as ExtrudeFeature).entityIds;
  if (feature.type === 'revolve') return (feature as RevolveFeature).entityIds;
  return [];
}
