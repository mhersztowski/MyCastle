import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export type GeometryType = 'box' | 'sphere' | 'cylinder' | 'plane' | 'cone' | 'torus' | 'custom';

export interface BufferGeometryData {
  positions: number[];
  normals?: number[];
  indices?: number[];
}

export interface GeometryDescriptor {
  type: GeometryType;
  params?: Record<string, number>;
  bufferData?: BufferGeometryData;
  fileName?: string;
}

export interface MaterialDescriptor {
  color: string;
  opacity: number;
  wireframe: boolean;
}

export interface MeshNodeData extends SceneNodeData {
  type: 'mesh';
  geometry: GeometryDescriptor;
  material: MaterialDescriptor;
}

export class MeshNode extends SceneNode {
  geometry: GeometryDescriptor;
  material: MaterialDescriptor;

  constructor(data?: Partial<MeshNodeData>) {
    super({ ...data, type: 'mesh' });
    this.geometry = data?.geometry ?? { type: 'box' };
    this.material = data?.material ?? {
      color: '#4fc3f7',
      opacity: 1,
      wireframe: false,
    };
  }

  setMaterialColor(color: string): void {
    this.material.color = color;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = (this._threeObject as any)?.material;
    if (mat?.color?.set) mat.color.set(color);
    this.notifyChange();
  }

  setMaterialOpacity(opacity: number): void {
    this.material.opacity = opacity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = (this._threeObject as any)?.material;
    if (mat) {
      mat.opacity = opacity;
      mat.transparent = opacity < 1;
    }
    this.notifyChange();
  }

  setMaterialWireframe(wireframe: boolean): void {
    this.material.wireframe = wireframe;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = (this._threeObject as any)?.material;
    if (mat) mat.wireframe = wireframe;
    this.notifyChange();
  }

  setGeometry(geometry: GeometryDescriptor): void {
    this.geometry = geometry;
    this.notifyChange();
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'material.color':
        this.setMaterialColor(value as string);
        return true;
      case 'material.opacity':
        this.setMaterialOpacity(value as number);
        return true;
      case 'material.wireframe':
        this.setMaterialWireframe(value as boolean);
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): MeshNodeData {
    return {
      ...super.toData(),
      type: 'mesh',
      geometry: { ...this.geometry },
      material: { ...this.material },
    };
  }
}
