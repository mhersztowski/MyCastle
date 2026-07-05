/**
 * Lego baseplate "floor" for the Lego page — replaces the plain line grid with a
 * studded plate (like a real baseplate), divided into tile seams, that grows to
 * fit the model. Built as one lightweight scene node (a plate + a single merged
 * studs mesh + merged seams) flagged `metadata.floor` so LegoView keeps it out of
 * the brick list, selection, export and save.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GroupNode, MeshNode, type SceneNode } from '@mhersztowski/core-scene3d';

// Must match LegoView's brick metrics so studs line up with placed bricks.
const U = 1;          // stud pitch
const PLATE = 0.4;    // plate thickness
const STUD_R = 0.3;   // stud radius
const STUD_H = 0.2;   // stud height

export const BASEPLATE_TILE = 8;   // studs per baseplate section (seam spacing)
const MIN_STUDS = 16;              // smallest baseplate side
const MARGIN_STUDS = 4;            // padding around the model, each side

export const FLOOR_NAME = '__baseplate__';
export const isFloor = (n: SceneNode): boolean => n.metadata?.floor === true;

function mat(color: string) {
  return {
    type: 'MeshStandardMaterial' as const, color, opacity: 1, transparent: false,
    wireframe: false, side: 'front' as const, blending: 'normal' as const,
    depthTest: true, depthWrite: true, alphaTest: 0, vertexColors: false,
    forceSinglePass: false, roughness: 0.85, metalness: 0.0,
  };
}

function extract(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  return {
    positions: Array.from(pos.array as Float32Array),
    normals: nrm ? Array.from(nrm.array as Float32Array) : undefined,
    indices: geo.index ? Array.from(geo.index.array as Uint16Array | Uint32Array) : undefined,
  };
}

/** Build a square baseplate `sideStuds`×`sideStuds`, centred at the origin, with
 *  its stud tops at y=0 (bricks placed at y=0 rest on/over the studs). */
export function buildBaseplate(sideStuds: number): GroupNode {
  const side = Math.max(1, Math.round(sideStuds));
  const w = side * U;
  const group = new GroupNode({ name: FLOOR_NAME, metadata: { floor: true } });

  // Plate body — top surface at y=0.
  group.addChild(new MeshNode({
    name: 'plate',
    geometry: { type: 'box', params: { width: w, height: PLATE, depth: w } },
    material: mat('#2b2e33'),
    position: [0, -PLATE / 2, 0],
  }));

  // Studs — one merged mesh (cheap: single draw call regardless of size).
  const proto = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 16);
  const studGeos: THREE.BufferGeometry[] = [];
  const start = -((side - 1) / 2) * U;
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const g = proto.clone();
      g.translate(start + i * U, STUD_H / 2, start + j * U);
      studGeos.push(g);
    }
  }
  const studs = mergeGeometries(studGeos, false);
  proto.dispose();
  studGeos.forEach((g) => g.dispose());
  group.addChild(new MeshNode({
    name: 'studs',
    geometry: { type: 'custom', bufferData: extract(studs) },
    material: mat('#3b4047'),
  }));
  studs.dispose();

  // Tile seams — thin grooves every BASEPLATE_TILE studs, merged into one mesh.
  const seamGeos: THREE.BufferGeometry[] = [];
  const half = w / 2;
  for (let k = 0; k <= side; k += BASEPLATE_TILE) {
    const p = -half + k * U;
    const gx = new THREE.BoxGeometry(0.05, 0.06, w); gx.translate(p, 0.02, 0); seamGeos.push(gx);
    const gz = new THREE.BoxGeometry(w, 0.06, 0.05); gz.translate(0, 0.02, p); seamGeos.push(gz);
  }
  if (seamGeos.length) {
    const seams = mergeGeometries(seamGeos, false);
    seamGeos.forEach((g) => g.dispose());
    group.addChild(new MeshNode({
      name: 'seams',
      geometry: { type: 'custom', bufferData: extract(seams) },
      material: mat('#191b1e'),
    }));
    seams.dispose();
  }

  group.metadata = { floor: true, sideStuds: side };
  return group;
}

/** Baseplate rendered as line primitives (tile-seam grid + a ring per stud),
 *  flat on y≈0 — a lightweight LeoCAD-like guide instead of solid studs. Returned
 *  as a plain THREE.Group to hand to SimpleViewer's `extraObjects`. */
export function buildBaseplateLines(sideStuds: number): THREE.Group {
  const side = Math.max(1, Math.round(sideStuds));
  const w = side * U;
  const half = w / 2;
  const group = new THREE.Group();
  group.name = '__baseplate_lines__';
  group.position.y = -0.01; // just under the brick bases to avoid z-fighting

  // Tile-seam grid: full-width lines every BASEPLATE_TILE studs (+ outer border).
  const grid: number[] = [];
  for (let k = 0; k <= side; k += BASEPLATE_TILE) {
    const p = -half + k * U;
    grid.push(p, 0, -half, p, 0, half);   // line along Z
    grid.push(-half, 0, p, half, 0, p);   // line along X
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  group.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x555a63 })));

  // A ring per stud (circle approximated by segments, in the XZ plane).
  const R = STUD_R;
  const SEG = 20;
  const circles: number[] = [];
  const start = -((side - 1) / 2) * U;
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const cx = start + i * U, cz = start + j * U;
      for (let s = 0; s < SEG; s++) {
        const a0 = (s / SEG) * Math.PI * 2, a1 = ((s + 1) / SEG) * Math.PI * 2;
        circles.push(cx + R * Math.cos(a0), 0, cz + R * Math.sin(a0), cx + R * Math.cos(a1), 0, cz + R * Math.sin(a1));
      }
    }
  }
  const circGeo = new THREE.BufferGeometry();
  circGeo.setAttribute('position', new THREE.Float32BufferAttribute(circles, 3));
  group.add(new THREE.LineSegments(circGeo, new THREE.LineBasicMaterial({ color: 0x45494f })));

  return group;
}

/** Free the geometries/materials of a line baseplate built by buildBaseplateLines. */
export function disposeBaseplateLines(group: THREE.Group): void {
  group.traverse((o) => {
    const m = o as THREE.LineSegments;
    m.geometry?.dispose?.();
    (m.material as THREE.Material)?.dispose?.();
  });
}

// ── Auto-size to the model ────────────────────────────────────────────────────

/** Approx world XZ half-extents of a mesh's geometry (rotation ignored — a margin
 *  covers it). Custom/baked geometry is measured from its baked vertices. */
function geomHalfXZ(m: MeshNode): { hx: number; hz: number; cx: number; cz: number } {
  const g = m.geometry;
  if (g.type === 'custom' && g.bufferData) {
    const p = g.bufferData.positions;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    if (!Number.isFinite(minx)) return { hx: 0, hz: 0, cx: 0, cz: 0 };
    return { hx: (maxx - minx) / 2, hz: (maxz - minz) / 2, cx: (maxx + minx) / 2, cz: (maxz + minz) / 2 };
  }
  const pr = g.params ?? {};
  if (g.type === 'box') return { hx: (pr.width ?? 1) / 2, hz: (pr.depth ?? 1) / 2, cx: 0, cz: 0 };
  if (g.type === 'cylinder') { const r = Math.max(pr.radiusTop ?? 0.5, pr.radiusBottom ?? 0.5); return { hx: r, hz: r, cx: 0, cz: 0 }; }
  if (g.type === 'sphere') { const r = pr.radius ?? 0.5; return { hx: r, hz: r, cx: 0, cz: 0 }; }
  return { hx: 0.5, hz: 0.5, cx: 0, cz: 0 };
}

function worldXZ(node: SceneNode): { x: number; z: number } {
  let x = 0, z = 0; let n: SceneNode | null = node;
  while (n) { x += n.position[0]; z += n.position[2]; n = n.parent; }
  return { x, z };
}

/** The baseplate side (in studs) needed to cover `nodes` (floor excluded),
 *  padded and snapped up to a whole number of baseplate tiles. */
export function neededBaseplateStuds(nodes: SceneNode[]): number {
  let maxAbs = 0;
  for (const top of nodes) {
    if (isFloor(top)) continue;
    top.traverse((child) => {
      if (!(child instanceof MeshNode)) return;
      const { hx, hz, cx, cz } = geomHalfXZ(child);
      const w = worldXZ(child);
      maxAbs = Math.max(maxAbs,
        Math.abs(w.x + cx - hx), Math.abs(w.x + cx + hx),
        Math.abs(w.z + cz - hz), Math.abs(w.z + cz + hz));
    });
  }
  const halfStuds = Math.ceil(maxAbs / U) + MARGIN_STUDS;
  const side = Math.ceil((2 * halfStuds) / BASEPLATE_TILE) * BASEPLATE_TILE;
  return Math.max(MIN_STUDS, side);
}
