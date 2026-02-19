import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export interface CameraNodeData extends SceneNodeData {
  type: 'camera';
  fov: number;
  near: number;
  far: number;
}

export class CameraNode extends SceneNode {
  fov: number;
  near: number;
  far: number;

  constructor(data?: Partial<CameraNodeData>) {
    super({ ...data, type: 'camera' });
    this.fov = data?.fov ?? 75;
    this.near = data?.near ?? 0.1;
    this.far = data?.far ?? 1000;
  }

  setFov(fov: number): void {
    this.fov = fov;
    this.notifyChange();
  }

  setNear(near: number): void {
    this.near = near;
    this.notifyChange();
  }

  setFar(far: number): void {
    this.far = far;
    this.notifyChange();
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'camera.fov':
        this.setFov(value as number);
        return true;
      case 'camera.near':
        this.setNear(value as number);
        return true;
      case 'camera.far':
        this.setFar(value as number);
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): CameraNodeData {
    return {
      ...super.toData(),
      type: 'camera',
      fov: this.fov,
      near: this.near,
      far: this.far,
    };
  }
}
