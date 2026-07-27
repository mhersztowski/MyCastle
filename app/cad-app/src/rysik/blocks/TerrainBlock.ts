/**
 * Scena terenu — implementacja kontraktu `SceneBlock` na Three.js.
 *
 * Podział pracy w `apply()` jest tu najważniejszy: tylko `seed` i `resolution`
 * przebudowują siatkę. Przewyższenie skaluje mesh, paleta przelicza atrybut
 * koloru, Słońce przesuwa światło — żadna z tych operacji nie dotyka geometrii.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SceneEmitter } from './SceneBlock';
import type { CameraState, ResolvedChild, SceneBlock, SceneProps, Unsub } from './SceneBlock';
import type { Primitive } from '../types';

/** Bok terenu w jednostkach świata — wysokości są do tego skalowane. */
const SIZE = 100;
const HEIGHT_UNITS = 22;

type Palette = 'hypsometric' | 'grayscale' | 'viridis';

const num = (v: Primitive | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: Primitive | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;
const str = (v: Primitive | undefined, fallback: string): string =>
  typeof v === 'string' && v !== '' ? v : fallback;

// ───────────────────────────────────────────── generator wysokości

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Znormalizowane wysokości 0–1 na siatce `res × res`. */
function buildHeights(res: number, seed: number): Float32Array {
  const out = new Float32Array(res * res);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const u = i / (res - 1);
      const v = j / (res - 1);
      let amp = 1;
      let freq = 3;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < 5; o++) {
        sum += valueNoise(u * freq, v * freq, seed + o * 977) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
      }
      // Wybrzuszenie ku środkowi — teren opada ku krawędziom kadru.
      const dx = u - 0.5;
      const dy = v - 0.5;
      const falloff = Math.max(0, 1 - 1.4 * Math.sqrt(dx * dx + dy * dy));
      const h = (sum / norm) * (0.35 + 0.65 * falloff);
      out[j * res + i] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const span = max - min || 1;
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - min) / span;
  return out;
}

// ───────────────────────────────────────────── palety

function paletteColor(p: Palette, h: number, target: THREE.Color): THREE.Color {
  const t = Math.min(1, Math.max(0, h));
  switch (p) {
    case 'grayscale':
      return target.setRGB(0.15 + 0.8 * t, 0.15 + 0.8 * t, 0.15 + 0.8 * t);
    case 'viridis': {
      // Aproksymacja wielomianowa — wystarczająca dla cieniowanego terenu.
      const r = 0.28 - 0.33 * t + 1.1 * t * t;
      const g = 0.02 + 1.05 * t - 0.2 * t * t;
      const b = 0.34 + 0.9 * t - 1.1 * t * t;
      return target.setRGB(clamp01(r), clamp01(g), clamp01(b));
    }
    default: {
      // Hipsometria: zieleń dolin → oliwka → brąz → skała → śnieg.
      const stops: [number, [number, number, number]][] = [
        [0.0, [0.16, 0.36, 0.20]],
        [0.3, [0.36, 0.46, 0.20]],
        [0.55, [0.55, 0.44, 0.25]],
        [0.78, [0.48, 0.42, 0.38]],
        [1.0, [0.95, 0.95, 0.97]],
      ];
      for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
          const [t0, c0] = stops[i - 1];
          const [t1, c1] = stops[i];
          const k = (t - t0) / (t1 - t0 || 1);
          return target.setRGB(
            c0[0] + (c1[0] - c0[0]) * k,
            c0[1] + (c1[1] - c0[1]) * k,
            c0[2] + (c1[2] - c0[2]) * k,
          );
        }
      }
      return target.setRGB(0.95, 0.95, 0.97);
    }
  }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// ───────────────────────────────────────────── blok

interface MarkerEntry {
  id: string;
  group: THREE.Group;
  pin: THREE.Mesh;
  sprite: THREE.Sprite | null;
  lon: number;
  lat: number;
}

export class TerrainBlock implements SceneBlock {
  private readonly emitter = new SceneEmitter();
  private host: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  private controls: OrbitControls | null = null;
  private raf = 0;
  private resizeObserver: ResizeObserver | null = null;

  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private contours: THREE.LineSegments | null = null;
  private markerGroup = new THREE.Group();
  private markers: MarkerEntry[] = [];
  private sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  private ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  private sunGizmo = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd54f }),
  );
  private sunRay: THREE.Line | null = null;

  private heights: Float32Array<ArrayBuffer> = new Float32Array(0);
  private props: SceneProps = {};
  private selected: string | null = null;
  private drag: { kind: 'sun' } | { kind: 'marker'; id: string } | null = null;
  private lastCameraEmit = 0;
  private disposed = false;

  // ─────────────────────────────────────────── cykl życia

  mount(host: HTMLElement, initial: SceneProps): void {
    this.host = host;
    this.props = { ...initial };

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      // Zrzut do PDF-a czyta bufor po renderze — bez tego canvas jest pusty.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.background = new THREE.Color(str(initial.background, '#0f1216'));
    this.scene.add(this.ambientLight, this.sunLight, this.sunLight.target, this.markerGroup);

    this.sunGizmo.name = 'sun-gizmo';
    this.scene.add(this.sunGizmo);
    const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.sunRay = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color: 0xffd54f, opacity: 0.35, transparent: true }));
    this.scene.add(this.sunRay);

    this.camera.position.set(90, 70, 90);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('change', () => this.emitCamera());

    this.rebuildTerrain();
    this.applyLighting();
    this.applyAppearance();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.loop();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.renderer?.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer?.domElement.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.controls?.dispose();
    this.clearMarkers();
    this.geometry?.dispose();
    this.material?.dispose();
    this.disposeContours();
    this.renderer?.dispose();
    if (this.renderer && this.host?.contains(this.renderer.domElement)) {
      this.host.removeChild(this.renderer.domElement);
    }
    this.emitter.clear();
    this.renderer = null;
    this.host = null;
  }

  on = this.emitter.on.bind(this.emitter);

  // ─────────────────────────────────────────── apply

  apply(patch: Partial<SceneProps>): void {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const before = this.props;
    this.props = { ...this.props, ...patch } as SceneProps;

    const changed = (key: string): boolean => key in patch && patch[key] !== before[key];

    // Tylko te dwa parametry uzasadniają przebudowę siatki.
    if (changed('seed') || changed('resolution')) {
      this.rebuildTerrain();
    } else {
      if (changed('exaggeration') || changed('maxElevation')) this.applyExaggeration();
      if (changed('palette')) this.applyVertexColors();
      if (changed('showContours') || changed('contourStep')) this.applyContours();
    }

    if (changed('sunAzimuth') || changed('sunElevation') || changed('ambient')) this.applyLighting();
    if (changed('wireframe') || changed('background')) this.applyAppearance();
    if (['west', 'south', 'east', 'north'].some(changed)) this.repositionMarkers();
  }

  setChildren(collection: string, items: ResolvedChild[]): void {
    if (collection !== 'markers') return;
    this.clearMarkers();
    for (const item of items) this.markers.push(this.createMarker(item));
    this.repositionMarkers();
    this.select(this.selected);
  }

  select(id: string | null): void {
    this.selected = id;
    const wanted = id?.startsWith('marker:') ? id.slice('marker:'.length) : null;
    for (const marker of this.markers) {
      const active = marker.id === wanted;
      const mat = marker.pin.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = active ? 0.9 : 0;
      marker.pin.scale.setScalar(active ? 1.45 : 1);
    }
  }

  hitTest(x: number, y: number): string | null {
    const hit = this.pickMarker(x, y);
    return hit ? `marker:${hit.id}` : null;
  }

  async snapshot(): Promise<Blob | null> {
    if (!this.renderer) return null;
    this.renderer.render(this.scene, this.camera);
    return new Promise(resolve => {
      this.renderer!.domElement.toBlob(blob => resolve(blob), 'image/png');
    });
  }

  getCamera(): CameraState | null {
    const t = this.controls?.target ?? new THREE.Vector3();
    // Kamera trafia do pliku dopiero na żądanie — zapisujemy ją skwantyzowaną.
    const q = (v: number): number => Math.round(v * 10) / 10;
    return {
      position: [q(this.camera.position.x), q(this.camera.position.y), q(this.camera.position.z)],
      target: [q(t.x), q(t.y), q(t.z)],
      fov: q(this.camera.fov),
    };
  }

  setCamera(state: CameraState): void {
    this.camera.position.set(...state.position);
    this.camera.fov = state.fov;
    this.camera.updateProjectionMatrix();
    if (this.controls) {
      this.controls.target.set(...state.target);
      this.controls.update();
    }
  }

  // ─────────────────────────────────────────── geometria

  private get resolution(): number {
    return Math.max(16, Math.round(num(this.props.resolution, 96)));
  }

  private rebuildTerrain(): void {
    const res = this.resolution;
    this.heights = buildHeights(res, Math.round(num(this.props.seed, 1337))) as Float32Array<ArrayBuffer>;

    this.geometry?.dispose();
    this.geometry = new THREE.PlaneGeometry(SIZE, SIZE, res - 1, res - 1);
    this.geometry.rotateX(-Math.PI / 2);

    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.heights.length; i++) pos.setY(i, this.heights[i] * HEIGHT_UNITS);
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.heights.length * 3), 3));

    if (!this.material) {
      this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    }
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry = this.geometry;
    } else {
      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.mesh.name = 'terrain';
    }
    this.scene.add(this.mesh);

    this.applyVertexColors();
    this.applyExaggeration();
    this.applyContours();
    this.repositionMarkers();
  }

  private applyExaggeration(): void {
    if (!this.mesh) return;
    this.mesh.scale.y = num(this.props.exaggeration, 1.5);
    this.repositionMarkers();
  }

  private applyVertexColors(): void {
    if (!this.geometry) return;
    const palette = str(this.props.palette, 'hypsometric') as Palette;
    const color = this.geometry.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let i = 0; i < this.heights.length; i++) {
      paletteColor(palette, this.heights[i], tmp);
      color.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    color.needsUpdate = true;
  }

  private applyAppearance(): void {
    if (this.material) this.material.wireframe = bool(this.props.wireframe, false);
    this.scene.background = new THREE.Color(str(this.props.background, '#0f1216'));
  }

  private applyLighting(): void {
    const az = num(this.props.sunAzimuth, 180) * (Math.PI / 180);
    const el = num(this.props.sunElevation, 35) * (Math.PI / 180);
    const r = SIZE * 1.2;
    const y = Math.sin(el) * r;
    const h = Math.cos(el) * r;
    // Azymut liczony od północy (−Z) zgodnie z ruchem wskazówek zegara.
    const x = Math.sin(az) * h;
    const z = -Math.cos(az) * h;

    this.sunLight.position.set(x, Math.max(1, y), z);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.intensity = 0.4 + 1.6 * Math.max(0.05, Math.sin(el));
    this.ambientLight.intensity = num(this.props.ambient, 0.35);
    this.sunGizmo.position.copy(this.sunLight.position);

    if (this.sunRay) {
      const points = [new THREE.Vector3(0, 0, 0), this.sunLight.position.clone()];
      this.sunRay.geometry.setFromPoints(points);
    }
  }

  private disposeContours(): void {
    if (!this.contours) return;
    this.contours.parent?.remove(this.contours);
    this.contours.geometry.dispose();
    (this.contours.material as THREE.Material).dispose();
    this.contours = null;
  }

  /**
   * Warstwice liczone marching squares na siatce wysokości. Budowane leniwie —
   * wyłączone kosztują zero, a przy włączonych zmiana palety ich nie rusza.
   */
  private applyContours(): void {
    this.disposeContours();
    if (!bool(this.props.showContours, false) || !this.mesh) return;

    const res = this.resolution;
    const maxElev = num(this.props.maxElevation, 1200);
    const step = Math.max(5, num(this.props.contourStep, 50));
    const points: number[] = [];
    const cell = SIZE / (res - 1);
    const at = (i: number, j: number): number => this.heights[j * res + i] * maxElev;

    for (let level = step; level < maxElev; level += step) {
      const t = level / maxElev;
      for (let j = 0; j < res - 1; j++) {
        for (let i = 0; i < res - 1; i++) {
          const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
          const x0 = -SIZE / 2 + i * cell;
          const z0 = -SIZE / 2 + j * cell;
          const corners: [number, number][] = [
            [x0, z0], [x0 + cell, z0], [x0 + cell, z0 + cell], [x0, z0 + cell],
          ];
          const crossings: [number, number][] = [];
          for (let e = 0; e < 4; e++) {
            const a = v[e];
            const b = v[(e + 1) % 4];
            if ((a < level && b >= level) || (b < level && a >= level)) {
              const k = (level - a) / (b - a);
              const [ax, az] = corners[e];
              const [bx, bz] = corners[(e + 1) % 4];
              crossings.push([ax + (bx - ax) * k, az + (bz - az) * k]);
            }
          }
          if (crossings.length >= 2) {
            const y = t * HEIGHT_UNITS + 0.06;
            points.push(crossings[0][0], y, crossings[0][1], crossings[1][0], y, crossings[1][1]);
          }
        }
      }
    }

    if (points.length === 0) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.contours = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color: 0x1b1b1b, transparent: true, opacity: 0.55 }),
    );
    // Dziecko mesha — dziedziczy przewyższenie bez osobnego przeliczania.
    this.mesh.add(this.contours);
  }

  // ─────────────────────────────────────────── markery

  private clearMarkers(): void {
    for (const m of this.markers) {
      this.markerGroup.remove(m.group);
      m.pin.geometry.dispose();
      (m.pin.material as THREE.Material).dispose();
      if (m.sprite) {
        m.sprite.material.map?.dispose();
        m.sprite.material.dispose();
      }
    }
    this.markers = [];
  }

  private createMarker(item: ResolvedChild): MarkerEntry {
    const color = str(item.props.color, '#ff5252');
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 5, 12),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0 }),
    );
    pin.rotation.x = Math.PI;   // wierzchołek w dół, ku terenowi
    pin.position.y = 2.5;
    pin.name = `marker:${item.id}`;

    const group = new THREE.Group();
    group.add(pin);

    let sprite: THREE.Sprite | null = null;
    const label = str(item.props.label, '');
    if (bool(item.props.showLabel, true) && label !== '') {
      sprite = makeLabelSprite(label);
      sprite.position.y = 8;
      group.add(sprite);
    }

    this.markerGroup.add(group);
    return {
      id: item.id,
      group,
      pin,
      sprite,
      lon: num(item.props.lon, 0),
      lat: num(item.props.lat, 0),
    };
  }

  private repositionMarkers(): void {
    for (const m of this.markers) {
      const { x, z } = this.lonLatToWorld(m.lon, m.lat);
      m.group.position.set(x, this.worldHeightAt(x, z), z);
    }
  }

  private lonLatToWorld(lon: number, lat: number): { x: number; z: number } {
    const west = num(this.props.west, 18.9);
    const east = num(this.props.east, 19.1);
    const south = num(this.props.south, 49.55);
    const north = num(this.props.north, 49.75);
    const u = (lon - west) / (east - west || 1);
    const v = (lat - south) / (north - south || 1);
    return { x: (u - 0.5) * SIZE, z: (0.5 - v) * SIZE };
  }

  private worldToLonLat(x: number, z: number): { lon: number; lat: number } {
    const west = num(this.props.west, 18.9);
    const east = num(this.props.east, 19.1);
    const south = num(this.props.south, 49.55);
    const north = num(this.props.north, 49.75);
    const u = x / SIZE + 0.5;
    const v = 0.5 - z / SIZE;
    return { lon: west + u * (east - west), lat: south + v * (north - south) };
  }

  /** Wysokość terenu (jednostki świata, z przewyższeniem) w danym punkcie. */
  private worldHeightAt(x: number, z: number): number {
    const res = this.resolution;
    const u = Math.min(0.999, Math.max(0, x / SIZE + 0.5));
    const v = Math.min(0.999, Math.max(0, z / SIZE + 0.5));
    const i = Math.floor(u * (res - 1));
    const j = Math.floor(v * (res - 1));
    const h = this.heights[j * res + i] ?? 0;
    return h * HEIGHT_UNITS * num(this.props.exaggeration, 1.5);
  }

  private elevationAt(x: number, z: number): number {
    const res = this.resolution;
    const u = Math.min(0.999, Math.max(0, x / SIZE + 0.5));
    const v = Math.min(0.999, Math.max(0, z / SIZE + 0.5));
    const i = Math.floor(u * (res - 1));
    const j = Math.floor(v * (res - 1));
    return Math.round((this.heights[j * res + i] ?? 0) * num(this.props.maxElevation, 1200));
  }

  // ─────────────────────────────────────────── interakcja

  private ndc(x: number, y: number): THREE.Vector2 {
    const rect = this.renderer!.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
  }

  private raycast(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    if (!this.renderer) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const hits = raycaster.intersectObjects(objects, true);
    return hits[0] ?? null;
  }

  private pickMarker(x: number, y: number): MarkerEntry | null {
    const hit = this.raycast(x, y, this.markers.map(m => m.pin));
    if (!hit) return null;
    return this.markers.find(m => m.pin === hit.object) ?? null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.renderer) return;

    const sunHit = this.raycast(e.clientX, e.clientY, [this.sunGizmo]);
    if (sunHit) {
      // Gizmo w scenie idzie tą samą drogą co pole w panelu: begin → change → end.
      this.drag = { kind: 'sun' };
      this.controls!.enabled = false;
      this.emitter.emit('propChanged', { path: 'sunAzimuth', value: num(this.props.sunAzimuth, 180), phase: 'begin', label: 'Słońce' });
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    const marker = this.pickMarker(e.clientX, e.clientY);
    if (marker) {
      this.emitter.emit('selectionRequest', { id: `marker:${marker.id}` });
      this.drag = { kind: 'marker', id: marker.id };
      this.controls!.enabled = false;
      this.emitter.emit('propChanged', { path: `markers/${marker.id}/lon`, value: marker.lon, phase: 'begin', label: 'Marker' });
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    const terrainHit = this.mesh ? this.raycast(e.clientX, e.clientY, [this.mesh]) : null;
    if (terrainHit) {
      const p = terrainHit.point;
      const { lon, lat } = this.worldToLonLat(p.x, p.z);
      this.emitter.emit('pick', {
        lon: Math.round(lon * 1e4) / 1e4,
        lat: Math.round(lat * 1e4) / 1e4,
        elevation: this.elevationAt(p.x, p.z),
      });
    }
    this.emitter.emit('selectionRequest', { id: null });
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag || !this.mesh) return;

    if (this.drag.kind === 'sun') {
      const rect = this.renderer!.domElement.getBoundingClientRect();
      const azimuth = ((e.clientX - rect.left) / rect.width) * 360;
      const elevation = (1 - (e.clientY - rect.top) / rect.height) * 90;
      this.emitter.emit('propChanged', { path: 'sunAzimuth', value: Math.round(azimuth * 10) / 10, phase: 'change' });
      this.emitter.emit('propChanged', { path: 'sunElevation', value: Math.round(Math.min(90, Math.max(0, elevation)) * 10) / 10, phase: 'change' });
      return;
    }

    const hit = this.raycast(e.clientX, e.clientY, [this.mesh]);
    if (!hit) return;
    const { lon, lat } = this.worldToLonLat(hit.point.x, hit.point.z);
    this.emitter.emit('propChanged', { path: `markers/${this.drag.id}/lon`, value: Math.round(lon * 1e4) / 1e4, phase: 'change' });
    this.emitter.emit('propChanged', { path: `markers/${this.drag.id}/lat`, value: Math.round(lat * 1e4) / 1e4, phase: 'change' });
  };

  private onPointerUp = (): void => {
    if (!this.drag) return;
    const path = this.drag.kind === 'sun' ? 'sunAzimuth' : `markers/${this.drag.id}/lon`;
    this.drag = null;
    if (this.controls) this.controls.enabled = true;
    this.emitter.emit('propChanged', { path, value: 0, phase: 'end' });
  };

  private emitCamera(): void {
    const now = performance.now();
    if (now - this.lastCameraEmit < 100) return;   // throttle z manifestu
    this.lastCameraEmit = now;
    const state = this.getCamera();
    if (state) this.emitter.emit('cameraChanged', state);
  }

  private resize(): void {
    if (!this.host || !this.renderer) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (): void => {
    if (this.disposed || !this.renderer) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  };
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 32px sans-serif';
  const width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.width = width;
  canvas.height = 48;
  const c = canvas.getContext('2d')!;
  c.font = 'bold 32px sans-serif';
  c.fillStyle = 'rgba(15,18,22,0.75)';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#f5f5f5';
  c.textBaseline = 'middle';
  c.fillText(text, 12, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(canvas.width / 12, canvas.height / 12, 1);
  return sprite;
}

export const createTerrainBlock = (): SceneBlock => new TerrainBlock();
export type { Unsub };
