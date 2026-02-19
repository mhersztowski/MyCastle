import { SceneNode } from '../scene/SceneNode';
import type { SceneNodeData } from '../scene/SceneNode';

export type LightType = 'ambient' | 'directional' | 'point' | 'spot';

export interface LightNodeData extends SceneNodeData {
  type: 'light';
  lightType: LightType;
  color: string;
  intensity: number;
}

export class LightNode extends SceneNode {
  lightType: LightType;
  color: string;
  intensity: number;

  constructor(data?: Partial<LightNodeData>) {
    super({ ...data, type: 'light' });
    this.lightType = data?.lightType ?? 'directional';
    this.color = data?.color ?? '#ffffff';
    this.intensity = data?.intensity ?? 1;
  }

  setColor(color: string): void {
    this.color = color;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const light = this._threeObject as any;
    if (light?.color?.set) light.color.set(color);
    this.notifyChange();
  }

  setIntensity(intensity: number): void {
    this.intensity = intensity;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const light = this._threeObject as any;
    if (light && 'intensity' in light) light.intensity = intensity;
    this.notifyChange();
  }

  setLightType(lightType: LightType): void {
    this.lightType = lightType;
    this.notifyChange();
  }

  override setProperty(property: string, value: unknown): boolean {
    switch (property) {
      case 'light.color':
        this.setColor(value as string);
        return true;
      case 'light.intensity':
        this.setIntensity(value as number);
        return true;
      default:
        return super.setProperty(property, value);
    }
  }

  override toData(): LightNodeData {
    return {
      ...super.toData(),
      type: 'light',
      lightType: this.lightType,
      color: this.color,
      intensity: this.intensity,
    };
  }
}
