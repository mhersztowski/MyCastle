/**
 * Bridge: converts CAD Project entities into a Three.js SceneGraph.
 *
 * Coordinate mapping:
 *   CAD X → Three.js X (right)
 *   CAD Y → Three.js Z (depth, since CAD is a top-down XY view)
 *   Extrusion → Three.js Y (up)
 *
 * Entities without extrudeHeight get a flat representation (height = 0.05).
 */
import { SceneGraph, MeshNode, LightNode, SceneSerializer } from '@mhersztowski/core-scene3d';
// SceneSerializer.serialize() is the correct method name
import type { Project } from '@mhersztowski/core-cad';

const FLAT_HEIGHT = 0.05;

function hexFromLayerOrEntity(color: string, layerColor: string): string {
  return color === 'bylayer' ? layerColor : color;
}

export function cadProjectToSceneGraph(project: Project): SceneGraph {
  const scene = new SceneGraph();

  // Default lights so the scene is visible
  scene.addNode(new LightNode({ name: 'Ambient', lightType: 'ambient', intensity: 0.4 }));
  scene.addNode(new LightNode({ name: 'Sun', lightType: 'directional', position: [10, 20, 10], intensity: 0.8 }));

  const entities = project.entityRegistry.getAll();

  for (const entity of entities) {
    if (!entity.visible) continue;

    const layer = project.layerSystem.get(entity.layerId);
    if (layer && !layer.visible) continue;

    const color = hexFromLayerOrEntity(entity.color, layer?.color ?? '#4fc3f7');
    const h = entity.extrudeHeight > 0 ? entity.extrudeHeight : FLAT_HEIGHT;

    switch (entity.type) {
      case 'circle': {
        const node = new MeshNode({
          name: `Circle (r=${entity.radius.toFixed(1)})`,
          position: [entity.cx, h / 2, entity.cy],
          geometry: {
            type: 'cylinder',
            params: { radiusTop: entity.radius, radiusBottom: entity.radius, height: h, radialSegments: 64 },
          },
          material: { color, opacity: 1, wireframe: false },
        });
        scene.addNode(node);
        break;
      }

      case 'rect': {
        const node = new MeshNode({
          name: `Rect (${entity.width.toFixed(1)}×${entity.height.toFixed(1)})`,
          position: [entity.x + entity.width / 2, h / 2, entity.y + entity.height / 2],
          geometry: {
            type: 'box',
            params: { width: entity.width, height: h, depth: entity.height },
          },
          material: { color, opacity: 1, wireframe: false },
        });
        scene.addNode(node);
        break;
      }

      case 'line': {
        const dx = entity.x2 - entity.x1;
        const dz = entity.y2 - entity.y1;
        const length = Math.sqrt(dx * dx + dz * dz);
        if (length < 0.001) break;
        const mx = (entity.x1 + entity.x2) / 2;
        const mz = (entity.y1 + entity.y2) / 2;
        const angle = -Math.atan2(dz, dx); // rotation around Y
        const node = new MeshNode({
          name: `Line (${length.toFixed(1)})`,
          position: [mx, h / 2, mz],
          rotation: [0, angle, 0],
          geometry: {
            type: 'box',
            params: { width: length, height: h, depth: 0.1 },
          },
          material: { color, opacity: 1, wireframe: false },
        });
        scene.addNode(node);
        break;
      }

      case 'polyline': {
        for (let i = 0; i < entity.points.length - 1; i++) {
          const a = entity.points[i];
          const b = entity.points[i + 1];
          const dx = b.x - a.x;
          const dz = b.y - a.y;
          const length = Math.sqrt(dx * dx + dz * dz);
          if (length < 0.001) continue;
          const angle = -Math.atan2(dz, dx);
          const node = new MeshNode({
            name: `Polyline seg ${i + 1}`,
            position: [(a.x + b.x) / 2, h / 2, (a.y + b.y) / 2],
            rotation: [0, angle, 0],
            geometry: {
              type: 'box',
              params: { width: length, height: h, depth: 0.1 },
            },
            material: { color, opacity: 1, wireframe: false },
          });
          scene.addNode(node);
        }
        break;
      }

      // arc: approximate as cylinder slice – skip for now, add as flat cylinder
      case 'arc': {
        const node = new MeshNode({
          name: `Arc (r=${entity.radius.toFixed(1)})`,
          position: [entity.cx, h / 2, entity.cy],
          geometry: {
            type: 'cylinder',
            params: { radiusTop: entity.radius, radiusBottom: entity.radius, height: h, radialSegments: 32 },
          },
          material: { color, opacity: 0.4, wireframe: true },
        });
        scene.addNode(node);
        break;
      }
    }
  }

  return scene;
}

/** Serializes a CAD project to a SceneGraph JSON string ready for RichEditor initialSceneData prop. */
export function cadProjectToSceneJson(project: Project): string {
  const graph = cadProjectToSceneGraph(project);
  return SceneSerializer.serialize(graph);
}
