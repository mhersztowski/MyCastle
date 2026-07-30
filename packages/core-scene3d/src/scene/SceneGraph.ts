import { SceneNode } from './SceneNode';
import type { SceneNodeData } from './SceneNode';
import { MeshNode } from '../nodes/MeshNode';
import type { MeshNodeData } from '../nodes/MeshNode';
import { LightNode } from '../nodes/LightNode';
import type { LightNodeData } from '../nodes/LightNode';
import { CameraNode } from '../nodes/CameraNode';
import type { CameraNodeData } from '../nodes/CameraNode';
import { GroupNode } from '../nodes/GroupNode';
import { AudioNode } from '../nodes/AudioNode';
import type { AudioNodeData } from '../nodes/AudioNode';
import { GeometryPointNode, GeometrySegmentNode, GeometryLineNode, GeometryAngleNode } from '../nodes/GeometryNodes';
import type { GeometryPointNodeData, GeometrySegmentNodeData, GeometryLineNodeData, GeometryAngleNodeData } from '../nodes/GeometryNodes';
import type { AnimationClip } from '../animation/types';
import type { PrefabEntry } from '../prefabs/types';

export interface SceneGraphData {
  version: string;
  root: SceneNodeData;
  animation?: AnimationClip | null;
  prefabs?: PrefabEntry[];
  /** Ścieżka VFS do pliku `.ts` uruchamianego przyciskiem „Run" (patrz `SceneGraph.script`). */
  script?: string;
}

export class SceneGraph {
  root: SceneNode;
  onChange: (() => void) | null = null;
  animation: AnimationClip | null = null;
  prefabs: PrefabEntry[] = [];
  /**
   * Ścieżka VFS do skryptu TypeScript sterującego sceną (przycisk „Run").
   *
   * Trzymana w scenie, a nie w localStorage, bo powiązanie ma jechać razem z
   * plikiem projektu — inaczej po otwarciu sceny na innym urządzeniu skrypt ginie.
   */
  script: string | null = null;

  private _notifyScheduled = false;

  private _handleChange = (): void => {
    if (!this._notifyScheduled) {
      this._notifyScheduled = true;
      queueMicrotask(() => {
        this._notifyScheduled = false;
        this.onChange?.();
      });
    }
  };

  constructor() {
    this.root = new SceneNode({ type: 'group', name: 'Scene' });
    this.root._onChange = this._handleChange;
  }

  addNode(node: SceneNode, parentId?: string): void {
    if (parentId) {
      const parent = this.root.findById(parentId);
      if (parent) {
        parent.addChild(node);
        return;
      }
    }
    this.root.addChild(node);
  }

  removeNode(id: string): void {
    const node = this.root.findById(id);
    if (node && node.parent) {
      node.parent.removeChild(id);
    }
  }

  findNode(id: string): SceneNode | null {
    return this.root.findById(id);
  }

  traverse(callback: (node: SceneNode) => void): void {
    this.root.traverse(callback);
  }

  toData(): SceneGraphData {
    return {
      version: '1.0.0',
      root: this.root.toData(),
      animation: this.animation ?? undefined,
      prefabs: this.prefabs.length > 0 ? this.prefabs : undefined,
      script: this.script || undefined,
    };
  }

  static fromData(data: SceneGraphData): SceneGraph {
    const graph = new SceneGraph();

    function baseFields(d: SceneNodeData) {
      return {
        id: d.id,
        name: d.name,
        visible: d.visible,
        position: d.position,
        rotation: d.rotation,
        scale: d.scale,
        castShadow: d.castShadow,
        receiveShadow: d.receiveShadow,
        frustumCulled: d.frustumCulled,
        renderOrder: d.renderOrder,
        userData: d.userData,
        metadata: d.metadata,
      };
    }

    function buildNode(nodeData: SceneNodeData): SceneNode {
      let node: SceneNode;

      switch (nodeData.type) {
        case 'mesh': {
          const d = nodeData as MeshNodeData;
          node = new MeshNode({
            ...baseFields(d),
            geometry: d.geometry,
            material: d.material,
          });
          break;
        }
        case 'light': {
          const d = nodeData as LightNodeData;
          node = new LightNode({
            ...baseFields(d),
            lightType: d.lightType,
            color: d.color,
            groundColor: d.groundColor,
            intensity: d.intensity,
            distance: d.distance,
            decay: d.decay,
            angle: d.angle,
            penumbra: d.penumbra,
            shadowIntensity: d.shadowIntensity,
            shadowBias: d.shadowBias,
            shadowNormalBias: d.shadowNormalBias,
            shadowRadius: d.shadowRadius,
          });
          break;
        }
        case 'camera': {
          const d = nodeData as CameraNodeData;
          node = new CameraNode({
            ...baseFields(d),
            cameraType: d.cameraType,
            fov: d.fov,
            near: d.near,
            far: d.far,
            left: d.left,
            right: d.right,
            top: d.top,
            bottom: d.bottom,
          });
          break;
        }
        case 'group':
          node = new GroupNode(baseFields(nodeData));
          break;
        case 'audio': {
          const d = nodeData as AudioNodeData;
          node = new AudioNode({
            ...baseFields(d),
            src: d.src,
            volume: d.volume,
            loop: d.loop,
            autoplay: d.autoplay,
            rolloffFactor: d.rolloffFactor,
            maxDistance: d.maxDistance,
            refDistance: d.refDistance,
            distanceModel: d.distanceModel,
            coneInnerAngle: d.coneInnerAngle,
            coneOuterAngle: d.coneOuterAngle,
            coneOuterGain: d.coneOuterGain,
          });
          break;
        }
        case 'geometry-point': {
          const d = nodeData as GeometryPointNodeData;
          node = new GeometryPointNode({ ...baseFields(d), color: d.color, pixelSize: d.pixelSize, showLabel: d.showLabel, label: d.label });
          break;
        }
        case 'geometry-segment': {
          const d = nodeData as GeometrySegmentNodeData;
          node = new GeometrySegmentNode({ ...baseFields(d), start: d.start, end: d.end, color: d.color, pixelSize: d.pixelSize, showLength: d.showLength, startBinding: d.startBinding, endBinding: d.endBinding });
          break;
        }
        case 'geometry-line': {
          const d = nodeData as GeometryLineNodeData;
          node = new GeometryLineNode({ ...baseFields(d), origin: d.origin, direction: d.direction, color: d.color, showLabel: d.showLabel, label: d.label, originBinding: d.originBinding });
          break;
        }
        case 'geometry-angle': {
          const d = nodeData as GeometryAngleNodeData;
          node = new GeometryAngleNode({ ...baseFields(d), vertex: d.vertex, p1: d.p1, p2: d.p2, color: d.color, arcPixelRadius: d.arcPixelRadius, showLabel: d.showLabel, vertexBinding: d.vertexBinding, p1Binding: d.p1Binding, p2Binding: d.p2Binding });
          break;
        }
        default:
          node = new SceneNode({ ...baseFields(nodeData), type: nodeData.type });
      }

      if (nodeData.children) {
        for (const childData of nodeData.children) {
          const child = buildNode(childData);
          node.addChild(child);
        }
      }
      return node;
    }

    graph.root = buildNode(data.root);
    graph.root.traverse((n) => { n._onChange = graph._handleChange; });
    if (data.animation) graph.animation = data.animation;
    if (data.prefabs) graph.prefabs = data.prefabs;
    if (data.script) graph.script = data.script;
    return graph;
  }
}
