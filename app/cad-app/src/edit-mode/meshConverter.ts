import * as THREE from 'three';
import type { EditableMesh, EMEdge, EMFace, EMVertex } from './types';

const MERGE_EPS = 1e-5;

function key(x: number, y: number, z: number): string {
  const r = (v: number) => Math.round(v / MERGE_EPS);
  return `${r(x)},${r(y)},${r(z)}`;
}

/** Convert any BufferGeometry to an editable mesh (merges near-duplicate vertices). */
export function geometryToEditable(inputGeo: THREE.BufferGeometry): EditableMesh {
  const geo = inputGeo.index ? inputGeo.toNonIndexed() : inputGeo.clone();
  const pos = geo.attributes['position'] as THREE.BufferAttribute;

  const keyToId = new Map<string, number>();
  const vertices: EMVertex[] = [];
  const rawToMerged: number[] = [];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = key(x, y, z);
    if (!keyToId.has(k)) {
      const id = vertices.length;
      keyToId.set(k, id);
      vertices.push({ id, pos: new THREE.Vector3(x, y, z), selected: false });
    }
    rawToMerged.push(keyToId.get(k)!);
  }

  const faces: EMFace[] = [];
  const edgeMap = new Map<string, EMEdge>();

  for (let i = 0; i < rawToMerged.length; i += 3) {
    const v0 = rawToMerged[i], v1 = rawToMerged[i + 1], v2 = rawToMerged[i + 2];
    if (v0 === v1 || v1 === v2 || v0 === v2) continue;
    faces.push({ id: faces.length, v0, v1, v2, selected: false });

    for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]] as [number, number][]) {
      const ea = Math.min(a, b), eb = Math.max(a, b);
      const ek = `${ea}-${eb}`;
      if (!edgeMap.has(ek)) edgeMap.set(ek, { id: edgeMap.size, v0: ea, v1: eb, selected: false });
    }
  }

  return { vertices, edges: [...edgeMap.values()], faces };
}

/** Convert EditableMesh back to unindexed BufferGeometry with computed normals. */
export function editableToGeometry(mesh: EditableMesh): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const f of mesh.faces) {
    for (const vi of [f.v0, f.v1, f.v2]) {
      const v = mesh.vertices[vi];
      positions.push(v.pos.x, v.pos.y, v.pos.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Produce {positions, normals} arrays for storing as MeshNode bufferData. */
export function editableToBufferData(mesh: EditableMesh): { positions: number[]; normals: number[] } {
  const geo = editableToGeometry(mesh);
  const posAttr = geo.attributes['position'] as THREE.BufferAttribute;
  const norAttr = geo.attributes['normal'] as THREE.BufferAttribute;
  const positions: number[] = [], normals: number[] = [];
  for (let i = 0; i < posAttr.count; i++) {
    positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    normals.push(norAttr.getX(i), norAttr.getY(i), norAttr.getZ(i));
  }
  return { positions, normals };
}

export function cloneEditableMesh(mesh: EditableMesh): EditableMesh {
  return {
    vertices: mesh.vertices.map(v => ({ ...v, pos: v.pos.clone() })),
    edges: mesh.edges.map(e => ({ ...e })),
    faces: mesh.faces.map(f => ({ ...f })),
  };
}

/** Quick-evaluate a GeometryDescriptor to THREE.BufferGeometry (no R3F context needed). */
export function evaluateDescriptor(desc: {
  type: string;
  params?: Record<string, number>;
  code?: string;
  bufferData?: { positions: number[]; normals?: number[]; indices?: number[] };
  nodesGraph?: unknown;
}): THREE.BufferGeometry {
  const p = desc.params ?? {};
  switch (desc.type) {
    case 'box':
      return new THREE.BoxGeometry(p['width'] ?? 1, p['height'] ?? 1, p['depth'] ?? 1, p['wSeg'] ?? 1, p['hSeg'] ?? 1, p['dSeg'] ?? 1);
    case 'sphere':
      return new THREE.SphereGeometry(p['radius'] ?? 1, p['widthSegments'] ?? 32, p['heightSegments'] ?? 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(p['radiusTop'] ?? 1, p['radiusBottom'] ?? 1, p['height'] ?? 2, p['radialSegments'] ?? 32);
    case 'plane':
      return new THREE.PlaneGeometry(p['width'] ?? 1, p['height'] ?? 1, p['wSeg'] ?? 1, p['hSeg'] ?? 1);
    case 'cone':
      return new THREE.ConeGeometry(p['radius'] ?? 1, p['height'] ?? 2, p['radialSegments'] ?? 32);
    case 'torus':
      return new THREE.TorusGeometry(p['radius'] ?? 1, p['tube'] ?? 0.4, p['radialSegments'] ?? 16, p['tubularSegments'] ?? 100);
    case 'custom': {
      if (!desc.bufferData) return new THREE.BoxGeometry();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(desc.bufferData.positions, 3));
      if (desc.bufferData.normals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(desc.bufferData.normals, 3));
      if (desc.bufferData.indices) geo.setIndex(desc.bufferData.indices);
      if (!desc.bufferData.normals) geo.computeVertexNormals();
      return geo;
    }
    case 'procedural': {
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const fn = new Function('THREE', desc.code ?? '');
        const result = fn(THREE);
        if (result instanceof THREE.BufferGeometry) return result;
      } catch { /* fall through */ }
      return new THREE.SphereGeometry(1, 8, 4);
    }
    default:
      return new THREE.BoxGeometry();
  }
}
