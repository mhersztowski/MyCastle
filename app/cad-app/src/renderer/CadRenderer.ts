import * as THREE from 'three';
import type { Entity, Project } from '@mhersztowski/core-cad';
import type { Point2D } from '@mhersztowski/core-cad';
import { buildEntityObject, buildPreviewObject } from './EntityMeshBuilder';
import type { PreviewGeometry } from '../tools/types';

export class CadRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private meshMap = new Map<string, THREE.Object3D>();
  private entitiesGroup: THREE.Group;
  private previewGroup: THREE.Group;
  private gridGroup: THREE.Group;
  private snapMarker: THREE.Object3D;

  // View state
  private zoom = 1; // world units per pixel
  private panX = 0;
  private panY = 0;
  private width: number;
  private height: number;

  private animFrameId = 0;
  private project: Project;

  constructor(canvas: HTMLCanvasElement, project: Project) {
    this.project = project;
    this.width = canvas.clientWidth || canvas.width || 800;
    this.height = canvas.clientHeight || canvas.height || 600;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x1e1e1e, 1);

    // Camera: orthographic, 1 pixel = 1 world unit initially at zoom=1
    this.camera = new THREE.OrthographicCamera(
      -this.width / 2, this.width / 2,
      this.height / 2, -this.height / 2,
      -1000, 1000
    );
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);

    // Scene
    this.scene = new THREE.Scene();
    this.gridGroup = new THREE.Group();
    this.entitiesGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.scene.add(this.gridGroup, this.entitiesGroup, this.previewGroup);

    // Snap marker (small cross as LineSegments)
    const markerGeo = new THREE.BufferGeometry();
    const s = 5;
    markerGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -s, 0, 1, s, 0, 1, 0, -s, 1, 0, s, 1,
    ], 3));
    const markerMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 1 });
    this.snapMarker = new THREE.LineSegments(markerGeo, markerMat);
    this.snapMarker.visible = false;
    this.scene.add(this.snapMarker);

    this.buildGrid();
    this.startLoop();
  }

  private buildGrid(): void {
    while (this.gridGroup.children.length) this.gridGroup.remove(this.gridGroup.children[0]);
    const gridSize = this.project.settings.gridSize;
    const extent = 5000;
    const steps = Math.ceil(extent / gridSize);

    const pts: number[] = [];
    for (let i = -steps; i <= steps; i++) {
      const x = i * gridSize;
      pts.push(x, -extent, -0.5, x, extent, -0.5);
      pts.push(-extent, x, -0.5, extent, x, -0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
    this.gridGroup.add(new THREE.LineSegments(geo, mat));

    // Axes
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -extent, 0, -0.4, extent, 0, -0.4,
      0, -extent, -0.4, 0, extent, -0.4,
    ], 3));
    const axisMat = new THREE.LineBasicMaterial({ color: 0x555555, linewidth: 1 });
    this.gridGroup.add(new THREE.LineSegments(axisGeo, axisMat));
  }

  private startLoop(): void {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private updateCamera(): void {
    const hw = this.width / 2;
    const hh = this.height / 2;
    this.camera.left = -hw * this.zoom + this.panX;
    this.camera.right = hw * this.zoom + this.panX;
    this.camera.top = hh * this.zoom + this.panY;
    this.camera.bottom = -hh * this.zoom + this.panY;
    this.camera.updateProjectionMatrix();
  }

  // Full rebuild of entity objects from project state
  syncAll(): void {
    // Remove old
    while (this.entitiesGroup.children.length) {
      const c = this.entitiesGroup.children[0];
      this.entitiesGroup.remove(c);
    }
    this.meshMap.clear();

    const entities = this.project.entityRegistry.getAll();
    const selected = new Set(this.project.selectionManager.getSelected());
    for (const entity of entities) {
      if (!entity.visible) continue;
      const layer = this.project.layerSystem.get(entity.layerId);
      if (layer && !layer.visible) continue;
      const obj = buildEntityObject(entity, layer, selected.has(entity.id));
      this.meshMap.set(entity.id, obj);
      this.entitiesGroup.add(obj);
    }
  }

  // Partial update: sync a single entity
  syncEntity(entityId: string): void {
    const entity = this.project.entityRegistry.get(entityId);
    const old = this.meshMap.get(entityId);
    if (old) { this.entitiesGroup.remove(old); this.meshMap.delete(entityId); }

    if (!entity || !entity.visible) return;
    const layer = this.project.layerSystem.get(entity.layerId);
    if (layer && !layer.visible) return;
    const selected = this.project.selectionManager.isSelected(entityId);
    const obj = buildEntityObject(entity, layer, selected);
    this.meshMap.set(entityId, obj);
    this.entitiesGroup.add(obj);
  }

  removeEntity(entityId: string): void {
    const obj = this.meshMap.get(entityId);
    if (obj) { this.entitiesGroup.remove(obj); this.meshMap.delete(entityId); }
  }

  setPreview(preview: PreviewGeometry | null): void {
    while (this.previewGroup.children.length) this.previewGroup.remove(this.previewGroup.children[0]);
    if (!preview) return;
    const obj = buildPreviewObject(preview.type, preview.points, preview.radius);
    if (obj) this.previewGroup.add(obj);
  }

  showSnapMarker(point: Point2D | null): void {
    if (!point) { this.snapMarker.visible = false; return; }
    this.snapMarker.position.set(point.x, point.y, 1);
    this.snapMarker.visible = true;
  }

  screenToWorld(screenX: number, screenY: number): Point2D {
    const hw = this.width / 2;
    const hh = this.height / 2;
    const worldX = (screenX - hw) * this.zoom + this.panX;
    const worldY = -(screenY - hh) * this.zoom + this.panY;
    return { x: worldX, y: worldY };
  }

  // Returns entityId of the closest entity to a screen point, or null
  pickEntity(screenX: number, screenY: number): string | null {
    const worldPt = this.screenToWorld(screenX, screenY);
    const threshold = 8 * this.zoom; // 8px in world units
    let best: string | null = null;
    let bestDist = threshold;

    for (const entity of this.project.entityRegistry.getAll()) {
      const d = distanceToEntity(worldPt, entity);
      if (d < bestDist) {
        bestDist = d;
        best = entity.id;
      }
    }
    return best;
  }

  pan(dx: number, dy: number): void {
    this.panX -= dx * this.zoom;
    this.panY += dy * this.zoom;
    this.updateCamera();
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(0.01, Math.min(100, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.panX += (before.x - after.x);
    this.panY += (before.y - after.y);
    this.updateCamera();
  }

  getPixelToWorld(): number {
    return this.zoom;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.updateCamera();
  }

  rebuildGrid(): void {
    this.buildGrid();
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.dispose();
  }
}

// Simple distance from point to entity geometry
function distanceToEntity(pt: { x: number; y: number }, entity: Entity): number {
  switch (entity.type) {
    case 'line':
      return distToSegment(pt, { x: entity.x1, y: entity.y1 }, { x: entity.x2, y: entity.y2 });
    case 'circle':
      return Math.abs(Math.sqrt((pt.x - entity.cx) ** 2 + (pt.y - entity.cy) ** 2) - entity.radius);
    case 'rect': {
      const corners = [
        { x: entity.x, y: entity.y }, { x: entity.x + entity.width, y: entity.y },
        { x: entity.x + entity.width, y: entity.y + entity.height }, { x: entity.x, y: entity.y + entity.height },
      ];
      let min = Infinity;
      for (let i = 0; i < 4; i++) {
        min = Math.min(min, distToSegment(pt, corners[i], corners[(i + 1) % 4]));
      }
      return min;
    }
    case 'polyline': {
      let min = Infinity;
      for (let i = 0; i < entity.points.length - 1; i++) {
        min = Math.min(min, distToSegment(pt, entity.points[i], entity.points[i + 1]));
      }
      if (entity.closed && entity.points.length > 1) {
        min = Math.min(min, distToSegment(pt, entity.points[entity.points.length - 1], entity.points[0]));
      }
      return min;
    }
    default:
      return Infinity;
  }
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.sqrt((p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2);
}
