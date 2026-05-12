import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Entity, Project } from '@mhersztowski/core-cad';
import type { ViewMode } from '@mhersztowski/core-cad';
import type { Point2D } from '@mhersztowski/core-cad';
import { build3dEntityObject, buildEntityObject, buildPreviewObject } from './EntityMeshBuilder';
import type { PreviewGeometry } from '../tools/types';

export class CadRenderer {
  private scene: THREE.Scene;
  private orthoCamera: THREE.OrthographicCamera;
  private perspCamera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private meshMap = new Map<string, THREE.Object3D>();
  private entitiesGroup: THREE.Group;
  private previewGroup: THREE.Group;
  private gridGroup: THREE.Group;
  private lightsGroup: THREE.Group;
  private snapMarker: THREE.Object3D;
  private orbitControls: OrbitControls | null = null;

  // View state
  private viewMode: ViewMode = '2d';
  private zoom = 1; // world units per pixel (2D mode)
  private panX = 0;
  private panY = 0;
  private width: number;
  private height: number;

  private animFrameId = 0;
  private project: Project;
  private canvas: HTMLCanvasElement;

  onViewChange?: () => void;

  constructor(canvas: HTMLCanvasElement, project: Project) {
    this.project = project;
    this.canvas = canvas;
    this.width = canvas.clientWidth || canvas.width || 800;
    this.height = canvas.clientHeight || canvas.height || 600;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x1e1e1e, 1);
    this.renderer.shadowMap.enabled = true;

    // Orthographic camera (2D mode)
    this.orthoCamera = new THREE.OrthographicCamera(
      -this.width / 2, this.width / 2,
      this.height / 2, -this.height / 2,
      -1000, 1000
    );
    this.orthoCamera.position.set(0, 0, 100);
    this.orthoCamera.lookAt(0, 0, 0);

    // Perspective camera (3D mode)
    this.perspCamera = new THREE.PerspectiveCamera(50, this.width / this.height, 1, 50000);
    this.perspCamera.position.set(0, -600, 450);
    this.perspCamera.lookAt(0, 0, 0);
    this.perspCamera.up.set(0, 0, 1);

    // Scene
    this.scene = new THREE.Scene();
    this.gridGroup = new THREE.Group();
    this.entitiesGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.scene.add(this.gridGroup, this.entitiesGroup, this.previewGroup, this.lightsGroup);

    // Snap marker
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
    this.updateCamera();
    this.startLoop();
  }

  private get activeCamera(): THREE.Camera {
    return this.viewMode === '3d' ? this.perspCamera : this.orthoCamera;
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
    const mat = new THREE.LineBasicMaterial({ color: 0x4a4a4a, linewidth: 1 });
    this.gridGroup.add(new THREE.LineSegments(geo, mat));

    const xGeo = new THREE.BufferGeometry();
    xGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -extent, 0, -0.4, extent, 0, -0.4,
    ], 3));
    this.gridGroup.add(new THREE.LineSegments(xGeo, new THREE.LineBasicMaterial({ color: 0xcc4444 })));

    const yGeo = new THREE.BufferGeometry();
    yGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, -extent, -0.4, 0, extent, -0.4,
    ], 3));
    this.gridGroup.add(new THREE.LineSegments(yGeo, new THREE.LineBasicMaterial({ color: 0x44cc44 })));
  }

  private buildLights(): void {
    while (this.lightsGroup.children.length) this.lightsGroup.remove(this.lightsGroup.children[0]);
    if (this.viewMode !== '3d') return;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(300, -400, 600);
    const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
    dir2.position.set(-300, 300, 200);
    this.lightsGroup.add(ambient, dir1, dir2);
  }

  private startLoop(): void {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      this.orbitControls?.update();
      this.renderer.render(this.scene, this.activeCamera);
    };
    loop();
  }

  private updateCamera(): void {
    if (this.viewMode === '3d') return;
    const hw = this.width / 2;
    const hh = this.height / 2;
    this.orthoCamera.left = -hw * this.zoom + this.panX;
    this.orthoCamera.right = hw * this.zoom + this.panX;
    this.orthoCamera.top = hh * this.zoom + this.panY;
    this.orthoCamera.bottom = -hh * this.zoom + this.panY;
    this.orthoCamera.updateProjectionMatrix();
  }

  // ── View mode switch ────────────────────────────────────────────────────────

  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    if (mode === '3d') {
      this._initOrbitControls();
      this.buildLights();
    } else {
      this._destroyOrbitControls();
      this.buildLights();
      this.updateCamera();
    }
    this.syncAll();
  }

  getViewMode(): ViewMode { return this.viewMode; }

  private _initOrbitControls(): void {
    if (this.orbitControls) return;
    this.orbitControls = new OrbitControls(this.perspCamera, this.canvas);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.12;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.target.set(this.panX, this.panY, 0);
    this.orbitControls.update();
  }

  private _destroyOrbitControls(): void {
    if (!this.orbitControls) return;
    // Sync persp camera center back to 2D pan
    const t = this.orbitControls.target;
    this.panX = t.x;
    this.panY = t.y;
    this.orbitControls.dispose();
    this.orbitControls = null;
  }

  // ── Entity sync ─────────────────────────────────────────────────────────────

  syncAll(): void {
    while (this.entitiesGroup.children.length) {
      this.entitiesGroup.remove(this.entitiesGroup.children[0]);
    }
    this.meshMap.clear();

    const entities = this.project.entityRegistry.getAll();
    const selected = new Set(this.project.selectionManager.getSelected());
    for (const entity of entities) {
      if (!entity.visible) continue;
      const layer = this.project.layerSystem.get(entity.layerId);
      if (layer && !layer.visible) continue;
      const obj = this._buildObject(entity, layer, selected.has(entity.id));
      this.meshMap.set(entity.id, obj);
      this.entitiesGroup.add(obj);
    }
  }

  syncEntity(entityId: string): void {
    const entity = this.project.entityRegistry.get(entityId);
    const old = this.meshMap.get(entityId);
    if (old) { this.entitiesGroup.remove(old); this.meshMap.delete(entityId); }

    if (!entity || !entity.visible) return;
    const layer = this.project.layerSystem.get(entity.layerId);
    if (layer && !layer.visible) return;
    const selected = this.project.selectionManager.isSelected(entityId);
    const obj = this._buildObject(entity, layer, selected);
    this.meshMap.set(entityId, obj);
    this.entitiesGroup.add(obj);
  }

  private _buildObject(entity: Entity, layer: ReturnType<typeof this.project.layerSystem.get>, selected: boolean): THREE.Object3D {
    if (this.viewMode === '3d') return build3dEntityObject(entity, layer, selected);
    return buildEntityObject(entity, layer, selected);
  }

  removeEntity(entityId: string): void {
    const obj = this.meshMap.get(entityId);
    if (obj) { this.entitiesGroup.remove(obj); this.meshMap.delete(entityId); }
  }

  setPreview(preview: PreviewGeometry | null): void {
    while (this.previewGroup.children.length) this.previewGroup.remove(this.previewGroup.children[0]);
    if (!preview) return;
    const obj = buildPreviewObject(preview.type, preview.points, preview.radius, preview.ghostSegments, {
      startAngle: preview.startAngle,
      endAngle: preview.endAngle,
    });
    if (obj) this.previewGroup.add(obj);
  }

  // ── 2D helpers ──────────────────────────────────────────────────────────────

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const hw = this.width / 2;
    const hh = this.height / 2;
    const sx = (worldX - this.panX) / this.zoom + hw;
    const sy = -(worldY - this.panY) / this.zoom + hh;
    return { x: sx, y: sy };
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

  /** Raycast screen coord to Z=0 plane (3D mode). Returns null if ray is parallel. */
  screenToWorldPlane(screenX: number, screenY: number): Point2D | null {
    const ndc = new THREE.Vector2(
      (screenX / this.width) * 2 - 1,
      -(screenY / this.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.perspCamera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, target);
    if (!hit) return null;
    return { x: target.x, y: target.y };
  }

  pickEntity(screenX: number, screenY: number): string | null {
    const worldPt = this.screenToWorld(screenX, screenY);
    const threshold = 8 * this.zoom;
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

  /** Pick entity in 3D mode via raycasting against meshes */
  pickEntity3d(screenX: number, screenY: number): string | null {
    const ndc = new THREE.Vector2(
      (screenX / this.width) * 2 - 1,
      -(screenY / this.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.perspCamera);
    const intersects = raycaster.intersectObjects(this.entitiesGroup.children, true);
    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData['entityId']) return obj.userData['entityId'] as string;
        obj = obj.parent;
      }
    }
    return null;
  }

  pan(dx: number, dy: number): void {
    this.panX -= dx * this.zoom;
    this.panY += dy * this.zoom;
    this.updateCamera();
    this.onViewChange?.();
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(0.01, Math.min(100, this.zoom * factor));
    const after = this.screenToWorld(screenX, screenY);
    this.panX += (before.x - after.x);
    this.panY += (before.y - after.y);
    this.updateCamera();
    this.onViewChange?.();
  }

  getPixelToWorld(): number { return this.zoom; }

  getCanvasRect(): DOMRect { return this.canvas.getBoundingClientRect(); }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.perspCamera.aspect = width / height;
    this.onViewChange?.();
    this.perspCamera.updateProjectionMatrix();
    this.updateCamera();
  }

  rebuildGrid(): void { this.buildGrid(); }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.orbitControls?.dispose();
    this.renderer.dispose();
  }
}

// ── Geometric picking helpers ────────────────────────────────────────────────

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
      for (let i = 0; i < 4; i++) min = Math.min(min, distToSegment(pt, corners[i], corners[(i + 1) % 4]));
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
    case 'box3d': {
      const dx = Math.abs(pt.x - entity.cx) - entity.width / 2;
      const dy = Math.abs(pt.y - entity.cy) - entity.depth / 2;
      return Math.max(dx, dy); // rough 2D box distance
    }
    case 'cylinder3d':
      return Math.abs(Math.sqrt((pt.x - entity.cx) ** 2 + (pt.y - entity.cy) ** 2) - entity.radius);
    case 'sphere3d':
      return Math.abs(Math.sqrt((pt.x - entity.cx) ** 2 + (pt.y - entity.cy) ** 2) - entity.radius);
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
