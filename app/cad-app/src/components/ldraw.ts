/**
 * LDraw bridge for the Lego page. Loads parts from the official library served by
 * cad-backend (/api/ldraw/lib/…), then *bakes* the resulting THREE meshes into
 * core-scene3d MeshNodes (geometry.type 'custom') so LDraw parts live in the same
 * SceneGraph as the simple box+stud bricks — selectable, movable, colourable via
 * the existing gizmo/tree/properties. Also parses imported .ldr/.mpd models and
 * serialises the scene back to LDraw line-type-1 syntax for export.
 */
import * as THREE from 'three';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js';
import { GroupNode, MeshNode, type SceneNode } from '@mhersztowski/core-scene3d';

// Library base (relative → cad-app dev proxies /api → cad-backend; prod same-origin).
export const LDRAW_BASE = '/api/ldraw/lib/';

// 1 stud pitch = 20 LDU = 1 scene unit, so 1 LDU = 0.05 units. Also flip LDraw's
// Y-down/Z conventions via a 180° rotation about X (the standard conversion).
const LDU = 1 / 20;

// Palette hex ⇄ LDraw colour code (covers LegoView's COLORS + a few common extras).
const HEX_TO_CODE: Record<string, number> = {
  '#d01012': 4, '#0055bf': 1, '#f2cd37': 14, '#237841': 2, '#ffffff': 15,
  '#1b2a34': 0, '#a0a5a9': 7, '#fe8a18': 25, '#901f76': 5, '#582a12': 6,
};
export function hexToCode(hex: string): number {
  return HEX_TO_CODE[hex.toLowerCase()] ?? 16; // 16 = "current"/main colour
}

let loaderPromise: Promise<LDrawLoader> | null = null;
async function getLoader(): Promise<LDrawLoader> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const loader = new LDrawLoader();
      loader.setPartsLibraryPath(LDRAW_BASE);
      // Required before parsing: material for LDraw type-5 conditional edge lines
      // (WebGLRenderer variant). We skip baking the lines, but the parser needs it.
      loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
      loader.smoothNormals = true;
      await loader.preloadMaterials(LDRAW_BASE + 'LDConfig.ldr');
      return loader;
    })().catch((e) => { loaderPromise = null; throw e; });
  }
  return loaderPromise;
}

function stdMaterial(color: string) {
  return {
    type: 'MeshStandardMaterial' as const, color, opacity: 1, transparent: false,
    wireframe: false, side: 'front' as const, blending: 'normal' as const,
    depthTest: true, depthWrite: true, alphaTest: 0, vertexColors: false,
    forceSinglePass: false, roughness: 0.55, metalness: 0.0,
  };
}

/** Bake every THREE.Mesh under `root` (transform flattened into vertices) into
 *  MeshNodes wrapped in one GroupNode; drops the group so its lowest point sits
 *  on y=0. Line segments (edges) are skipped. */
function bakeGroup(root: THREE.Object3D, name: string, meta: Record<string, unknown>): GroupNode {
  root.rotation.x = Math.PI;      // LDraw Y-down → three Y-up
  root.scale.setScalar(LDU);
  root.updateMatrixWorld(true);

  // Pass 1: bake every mesh into world-space vertex arrays and collect the bbox.
  const baked: { positions: number[]; normals?: number[]; indices?: number[]; color: string }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(mesh.matrixWorld);
    const pos = geom.getAttribute('position');
    if (!pos) return;
    const positions = Array.from(pos.array as Float32Array);
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const normAttr = geom.getAttribute('normal');
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const color = '#' + ((mat as THREE.MeshStandardMaterial).color?.getHexString?.() ?? '888888');
    baked.push({
      positions,
      normals: normAttr ? Array.from(normAttr.array as Float32Array) : undefined,
      indices: geom.index ? Array.from(geom.index.array as Uint16Array | Uint32Array) : undefined,
      color,
    });
    geom.dispose();
  });

  // Origin at the footprint centre, at the base (y=0) — so the gizmo/bounding box
  // sit centred under the brick, and the brick rests on the baseplate.
  const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
  const cz = Number.isFinite(minZ) ? (minZ + maxZ) / 2 : 0;
  const by = Number.isFinite(minY) ? minY : 0;

  // Remember where the LDraw part origin (originally at 0,0,0) now sits in local
  // space, so export can place the part reference correctly despite the recentre.
  const group = new GroupNode({ name, metadata: { ...meta, ldrawOrigin: [-cx, -by, -cz] } });
  baked.forEach((b, meshIdx) => {
    const positions = b.positions.slice();
    for (let i = 0; i < positions.length; i += 3) { positions[i] -= cx; positions[i + 1] -= by; positions[i + 2] -= cz; }
    group.addChild(new MeshNode({
      name: `mesh_${meshIdx}`,
      geometry: { type: 'custom', bufferData: { positions, normals: b.normals, indices: b.indices } },
      material: stdMaterial(b.color),
    }));
  });
  return group;
}

/** Load a single library part (e.g. '3001.dat') coloured by a palette hex, as a
 *  scene GroupNode tagged with LDraw metadata for round-trip export. */
export async function loadPart(partFile: string, hexColor: string, label?: string): Promise<GroupNode> {
  const loader = await getLoader();
  const code = hexToCode(hexColor);
  // Reference the part from a 1-line model so LDrawLoader applies the colour to
  // "current colour" (code 16) faces — the standard way to colour a bare part.
  const text = `0 ${label ?? partFile}\n1 ${code} 0 0 0 1 0 0 0 1 0 0 0 1 ${partFile}\n`;
  const model: THREE.Group = await new Promise((resolve, reject) => {
    try { loader.parse(text, resolve, reject); } catch (e) { reject(e); }
  });
  return bakeGroup(model, label ?? partFile.replace(/\.dat$/i, ''), { ldrawPart: partFile, ldrawColor: code, ldrawHex: hexColor });
}

/** Parse an imported .ldr/.mpd model into one movable GroupNode (whole model). */
export async function importModel(text: string, name: string): Promise<GroupNode> {
  const loader = await getLoader();
  const model: THREE.Group = await new Promise((resolve, reject) => {
    try { loader.parse(text, resolve, reject); } catch (e) { reject(e); }
  });
  return bakeGroup(model, name, { ldrawImport: name });
}

// ── Export ────────────────────────────────────────────────────────────────────

// Scene (three, Y-up, 1u = 20 LDU) → LDraw (Y-down). Flip = diag(1,-1,-1).
const F = new THREE.Matrix4().makeScale(1, -1, -1);

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
}

/** Serialise the scene tree to a .ldr string, recursing through group nodes and
 *  accumulating their transforms. Each LDraw-tagged brick becomes a line-type-1
 *  reference with its world matrix. Baked (non-part) leaves contribute nothing. */
export function exportScene(nodes: SceneNode[], modelName = 'model'): string {
  const lines: string[] = [`0 ${modelName}`, '0 Name: ' + modelName + '.ldr', '0 Author: MyCastle Lego'];
  const S = 1 / LDU; // scene units → LDU

  const localMatrix = (n: SceneNode) => new THREE.Matrix4().compose(
    new THREE.Vector3(n.position[0], n.position[1], n.position[2]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(n.rotation[0], n.rotation[1], n.rotation[2])),
    new THREE.Vector3(n.scale[0], n.scale[1], n.scale[2]),
  );

  const walk = (n: SceneNode, parent: THREE.Matrix4) => {
    const world = parent.clone().multiply(localMatrix(n));
    const part = n.metadata?.ldrawPart as string | undefined;
    if (part) {
      const code = (n.metadata?.ldrawColor as number | undefined) ?? 16;
      // Shift to the LDraw part origin (bricks are recentred to their base) before
      // the basis conversion, so the emitted position matches the part's own origin.
      const o = n.metadata?.ldrawOrigin as [number, number, number] | undefined;
      const worldForExport = o ? world.clone().multiply(new THREE.Matrix4().makeTranslation(o[0], o[1], o[2])) : world;
      const ld = F.clone().multiply(worldForExport).multiply(F); // three basis → LDraw basis
      const e = ld.elements; // column-major
      const x = e[12] * S, y = e[13] * S, z = e[14] * S;
      const a = e[0], b = e[4], c = e[8];
      const d = e[1], ee = e[5], f = e[9];
      const g = e[2], h = e[6], i = e[10];
      lines.push(`1 ${code} ${fmt(x)} ${fmt(y)} ${fmt(z)} ${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(ee)} ${fmt(f)} ${fmt(g)} ${fmt(h)} ${fmt(i)} ${part}`);
      return; // a brick is a leaf for export
    }
    for (const c of n.children) walk(c, world);
  };

  for (const n of nodes) walk(n, new THREE.Matrix4());
  lines.push('0');
  return lines.join('\n');
}

export interface LdrawStatus { installed: boolean; installing?: boolean }
export async function ldrawStatus(): Promise<LdrawStatus> {
  const r = await fetch('/api/ldraw/status');
  return r.json();
}
export async function ldrawInstall(): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch('/api/ldraw/install', { method: 'POST' });
  return r.json();
}
export interface LdrawPart { file: string; desc: string }
export async function ldrawParts(opts: { search?: string; category?: string } = {}): Promise<{ parts: LdrawPart[]; installed: boolean }> {
  const q = new URLSearchParams();
  if (opts.search) q.set('search', opts.search);
  if (opts.category) q.set('category', opts.category);
  const r = await fetch('/api/ldraw/parts?' + q.toString());
  return r.json();
}
export interface LdrawCategory { name: string; count: number }
export async function ldrawCategories(): Promise<{ categories: LdrawCategory[]; installed: boolean }> {
  const r = await fetch('/api/ldraw/categories');
  return r.json();
}
export async function ldrawGetFavorites(): Promise<LdrawPart[]> {
  const r = await fetch('/api/ldraw/favorites');
  return (await r.json()).favorites ?? [];
}
export async function ldrawSaveFavorites(favorites: LdrawPart[]): Promise<void> {
  await fetch('/api/ldraw/favorites', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorites }),
  });
}
