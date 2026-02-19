import { SceneNode } from './SceneNode';
import type { SceneNodeData } from './SceneNode';
import { MeshNode } from '../nodes/MeshNode';
import type { MeshNodeData } from '../nodes/MeshNode';
import { LightNode } from '../nodes/LightNode';
import type { LightNodeData } from '../nodes/LightNode';
import { CameraNode } from '../nodes/CameraNode';
import type { CameraNodeData } from '../nodes/CameraNode';
import { GroupNode } from '../nodes/GroupNode';

export interface SceneGraphData {
  version: string;
  root: SceneNodeData;
}

export class SceneGraph {
  root: SceneNode;
  onChange: (() => void) | null = null;

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
    };
  }

  static fromData(data: SceneGraphData): SceneGraph {
    const graph = new SceneGraph();

    function buildNode(nodeData: SceneNodeData): SceneNode {
      let node: SceneNode;

      switch (nodeData.type) {
        case 'mesh': {
          const d = nodeData as MeshNodeData;
          node = new MeshNode({
            id: d.id,
            name: d.name,
            visible: d.visible,
            position: d.position,
            rotation: d.rotation,
            scale: d.scale,
            metadata: d.metadata,
            geometry: d.geometry,
            material: d.material,
          });
          break;
        }
        case 'light': {
          const d = nodeData as LightNodeData;
          node = new LightNode({
            id: d.id,
            name: d.name,
            visible: d.visible,
            position: d.position,
            rotation: d.rotation,
            scale: d.scale,
            metadata: d.metadata,
            lightType: d.lightType,
            color: d.color,
            intensity: d.intensity,
          });
          break;
        }
        case 'camera': {
          const d = nodeData as CameraNodeData;
          node = new CameraNode({
            id: d.id,
            name: d.name,
            visible: d.visible,
            position: d.position,
            rotation: d.rotation,
            scale: d.scale,
            metadata: d.metadata,
            fov: d.fov,
            near: d.near,
            far: d.far,
          });
          break;
        }
        case 'group':
          node = new GroupNode({
            id: nodeData.id,
            name: nodeData.name,
            visible: nodeData.visible,
            position: nodeData.position,
            rotation: nodeData.rotation,
            scale: nodeData.scale,
            metadata: nodeData.metadata,
          });
          break;
        default:
          node = new SceneNode({
            id: nodeData.id,
            name: nodeData.name,
            type: nodeData.type,
            visible: nodeData.visible,
            position: nodeData.position,
            rotation: nodeData.rotation,
            scale: nodeData.scale,
            metadata: nodeData.metadata,
          });
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
    return graph;
  }
}
