import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneGraph } from '../scene/SceneGraph';
import { MeshNode } from '../nodes/MeshNode';
import { LightNode } from '../nodes/LightNode';
import { GroupNode } from '../nodes/GroupNode';
import type * as THREE from 'three';

export class GLTFImporter {
  static async import(url: string): Promise<SceneGraph> {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const graph = GLTFImporter.convertToSceneGraph(gltf.scene);
          resolve(graph);
        },
        undefined,
        reject,
      );
    });
  }

  static async importFromBuffer(buffer: ArrayBuffer): Promise<SceneGraph> {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.parse(
        buffer,
        '',
        (gltf) => {
          const graph = GLTFImporter.convertToSceneGraph(gltf.scene);
          resolve(graph);
        },
        reject,
      );
    });
  }

  private static convertToSceneGraph(threeScene: THREE.Group): SceneGraph {
    const graph = new SceneGraph();

    function processObject(obj: THREE.Object3D, parentId?: string): void {
      let node;

      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        node = new MeshNode({
          name: obj.name || 'Imported Mesh',
          position: [obj.position.x, obj.position.y, obj.position.z],
          rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
          geometry: { type: 'box' },
          material: {
            color:
              (mesh.material as THREE.MeshStandardMaterial).color?.getHexString?.() ??
              '#cccccc',
            opacity: (mesh.material as THREE.MeshStandardMaterial).opacity ?? 1,
            wireframe: (mesh.material as THREE.MeshStandardMaterial).wireframe ?? false,
          },
        });
      } else if ((obj as THREE.Light).isLight) {
        node = new LightNode({
          name: obj.name || 'Imported Light',
          position: [obj.position.x, obj.position.y, obj.position.z],
          color: `#${(obj as THREE.Light).color.getHexString()}`,
          intensity: (obj as THREE.Light).intensity,
        });
      } else if (obj.children.length > 0) {
        node = new GroupNode({
          name: obj.name || 'Imported Group',
          position: [obj.position.x, obj.position.y, obj.position.z],
          rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
        });
      }

      if (node) {
        graph.addNode(node, parentId);
        for (const child of obj.children) {
          processObject(child, node.id);
        }
      }
    }

    for (const child of threeScene.children) {
      processObject(child);
    }

    return graph;
  }
}
