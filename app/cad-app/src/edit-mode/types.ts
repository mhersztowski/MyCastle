import type * as THREE from 'three';

export type SelectMode = 'vertex' | 'edge' | 'face';

export interface EMVertex {
  id: number;
  pos: THREE.Vector3;
  selected: boolean;
}

export interface EMEdge {
  id: number;
  v0: number; // vertex id (smaller index)
  v1: number; // vertex id (larger index)
  selected: boolean;
}

export interface EMFace {
  id: number;
  v0: number;
  v1: number;
  v2: number;
  selected: boolean;
}

export interface EditableMesh {
  vertices: EMVertex[];
  edges: EMEdge[];
  faces: EMFace[];
}
