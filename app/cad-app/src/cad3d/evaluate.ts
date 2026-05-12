import * as THREE from 'three';
import { Project } from '@mhersztowski/core-cad';
import type { FeatureTree, SketchFeature } from './types';
import { evaluateFeatureTreeOcc } from './occ/occEvaluate';
import { preloadOcc } from './occ/occLoader';

// Start loading OCC WASM as early as possible
preloadOcc();

const SKETCH_COLOR = new THREE.Color('#4fc3f7');

// ── Sketch wireframe helpers (kept in Three.js for instant display) ──────────

function loadSketchProject(sketch: SketchFeature): Project | null {
  if (!sketch.projectData) return null;
  try { return Project.fromJSON(JSON.parse(sketch.projectData)); } catch { return null; }
}

function entityToLinePoints(entity: Record<string, unknown>): THREE.Vector3[][] {
  const type = entity['type'] as string;
  if (type === 'line') {
    return [[
      new THREE.Vector3(entity['x1'] as number, entity['y1'] as number, 0),
      new THREE.Vector3(entity['x2'] as number, entity['y2'] as number, 0),
    ]];
  }
  if (type === 'rect') {
    const x = entity['x'] as number, y = entity['y'] as number;
    const w = entity['width'] as number, h = entity['height'] as number;
    return [[
      new THREE.Vector3(x, y, 0), new THREE.Vector3(x + w, y, 0),
      new THREE.Vector3(x + w, y + h, 0), new THREE.Vector3(x, y + h, 0),
      new THREE.Vector3(x, y, 0),
    ]];
  }
  if (type === 'circle') {
    const cx = entity['cx'] as number, cy = entity['cy'] as number, r = entity['radius'] as number;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    return [pts];
  }
  if (type === 'polyline') {
    const ps = entity['points'] as Array<{ x: number; y: number }>;
    const closed = entity['closed'] as boolean;
    const verts = ps.map(p => new THREE.Vector3(p.x, p.y, 0));
    if (closed && verts.length > 0) verts.push(verts[0].clone());
    return [verts];
  }
  if (type === 'arc') {
    const cx = entity['cx'] as number, cy = entity['cy'] as number, r = entity['radius'] as number;
    const a0 = entity['startAngle'] as number, a1 = entity['endAngle'] as number;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = a0 + (a1 - a0) * (i / 32);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    return [pts];
  }
  return [];
}

function applyPlaneTransform(
  group: THREE.Group,
  sketch: Pick<SketchFeature, 'plane' | 'offset' | 'planeMatrix'>,
): void {
  if (sketch.plane === 'face' && sketch.planeMatrix) {
    const mat = new THREE.Matrix4().fromArray(sketch.planeMatrix);
    mat.decompose(group.position, group.quaternion, group.scale);
    return;
  }
  switch (sketch.plane) {
    case 'XY': group.position.z = sketch.offset; break;
    case 'XZ': group.rotation.x = Math.PI / 2; group.position.y = sketch.offset; break;
    case 'YZ': group.rotation.y = Math.PI / 2; group.position.x = sketch.offset; break;
  }
}

function applySketch(feature: SketchFeature): THREE.Object3D {
  const group = new THREE.Group();
  group.userData['featureId'] = feature.id;

  const planeGeo = new THREE.PlaneGeometry(500, 500);
  const planeMat = new THREE.MeshBasicMaterial({
    color: SKETCH_COLOR, transparent: true, opacity: 0.04,
    side: THREE.DoubleSide, depthWrite: false,
  });
  group.add(new THREE.Mesh(planeGeo, planeMat));

  const sketchProject = loadSketchProject(feature);
  if (sketchProject) {
    const lineMat = new THREE.LineBasicMaterial({ color: SKETCH_COLOR, transparent: true, opacity: 0.7 });
    const entities = (sketchProject as Project).entityRegistry.getAll() as unknown as Record<string, unknown>[];
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

/** Builds sketch wireframe objects for all sketches in the tree (sync, instant). */
export function buildSketchWireframes(tree: FeatureTree): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'sketch-wireframes';
  for (const feature of tree.features) {
    if (feature.enabled && feature.type === 'sketch') {
      root.add(applySketch(feature as SketchFeature));
    }
  }
  return root;
}

/**
 * Full async evaluation via OpenCascade.js WASM.
 * Returns a Three.js scene graph with all solid features tessellated.
 */
export async function evaluateFeatureTreeAsync(
  tree: FeatureTree,
  project: Project,
): Promise<THREE.Object3D> {
  const sketches = buildSketchWireframes(tree);
  return evaluateFeatureTreeOcc(tree, project, sketches);
}
