/**
 * External-library catalog for Automate Script blocks.
 *
 * Each library entry knows:
 *   - How to load it at runtime (`load`) — typically by injecting a CDN
 *     `<script>` tag and waiting for the global to appear on `window`.
 *   - How to make the TS service in Monaco aware of it (`typesDtsPath` +
 *     `typesDtsContent`). We register a hand-written ambient declaration
 *     (NOT the full `@types/three` — 900+ files would tank the worker),
 *     covering just the classes a typical Three.js scene uses. Good enough
 *     for completions on `THREE.`-prefixed names without the cost.
 *
 * Adding a new library = add an entry to LIBRARIES. The picker dialog reads
 * straight from this map, the runtime preloader reads it, and the IntelliSense
 * registration reads it — single source of truth.
 */

export interface LibraryEntry {
  /** ID used in `// @library: foo` markers in the script body. */
  id: string;
  /** Human-friendly label shown in the picker. */
  label: string;
  /** One-line description for the picker. */
  description: string;
  /** Where it lives once loaded — `window[globalName]`. Hover-test target. */
  globalName: string;
  /** CDN URL of the runtime bundle. */
  cdnUrl: string;
  /** Virtual file path used to register types in Monaco. */
  typesDtsPath: string;
  /** Hand-crafted ambient declarations — registered via `createModel()` so the
   *  TypeScript worker doesn't restart between blocks (same trick as the
   *  Automate API stubs). */
  typesDtsContent: string;
}

// ─── Three.js — minimal but useful ambient ──────────────────────────────────
//
// Covers the classes a typical scene touches: Scene, cameras, renderer,
// the common geometries/materials, lights, vectors, helpers. Methods are
// typed loosely (most accept `any` for object args) — enough to drive
// completions and signature help without becoming an `@types/three` mirror.
//
// Why `THREE: any` would be wrong: it would short-circuit completions
// completely. Spelling out the namespace gives `THREE.|` the right menu.
const THREE_DTS = `
declare namespace THREE {
  class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
    set(x: number, y: number): this;
    clone(): Vector2;
  }
  class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    normalize(): this;
    length(): number;
    clone(): Vector3;
    copy(v: Vector3): this;
  }
  class Color {
    constructor(color?: number | string);
    r: number;
    g: number;
    b: number;
    set(value: number | string): this;
    getHex(): number;
  }
  class Euler {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
  }

  class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    visible: boolean;
    name: string;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    lookAt(target: Vector3 | number, y?: number, z?: number): void;
    traverse(callback: (obj: Object3D) => void): void;
  }
  class Scene extends Object3D {
    background: Color | null;
    fog: any;
  }
  class Group extends Object3D {}

  class Camera extends Object3D {}
  class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    aspect: number;
    near: number;
    far: number;
    zoom: number;
    updateProjectionMatrix(): void;
  }
  class OrthographicCamera extends Camera {
    constructor(left: number, right: number, top: number, bottom: number, near?: number, far?: number);
    left: number;
    right: number;
    top: number;
    bottom: number;
  }

  class BufferGeometry {
    dispose(): void;
  }
  class BoxGeometry extends BufferGeometry {
    constructor(w?: number, h?: number, d?: number);
  }
  class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }
  class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number);
  }
  class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number);
  }
  class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number);
  }
  class TorusGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number);
  }

  class Material {
    color: Color;
    transparent: boolean;
    opacity: number;
    wireframe: boolean;
    dispose(): void;
  }
  class MeshBasicMaterial extends Material {
    constructor(params?: { color?: number | string; wireframe?: boolean; transparent?: boolean; opacity?: number });
  }
  class MeshStandardMaterial extends Material {
    constructor(params?: { color?: number | string; roughness?: number; metalness?: number });
    roughness: number;
    metalness: number;
  }
  class MeshPhongMaterial extends Material {
    constructor(params?: { color?: number | string; shininess?: number });
    shininess: number;
  }
  class LineBasicMaterial extends Material {
    constructor(params?: { color?: number | string; linewidth?: number });
  }

  class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }
  class Line extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
  }
  class Points extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
  }

  class Light extends Object3D {
    constructor(color?: number | string, intensity?: number);
    color: Color;
    intensity: number;
  }
  class AmbientLight extends Light {}
  class DirectionalLight extends Light {
    target: Object3D;
  }
  class PointLight extends Light {
    distance: number;
    decay: number;
  }
  class SpotLight extends Light {
    distance: number;
    angle: number;
    penumbra: number;
  }
  class HemisphereLight extends Light {
    constructor(skyColor?: number | string, groundColor?: number | string, intensity?: number);
  }

  class WebGLRenderer {
    constructor(params?: { canvas?: HTMLCanvasElement; antialias?: boolean; alpha?: boolean });
    domElement: HTMLCanvasElement;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setPixelRatio(value: number): void;
    setClearColor(color: number | string, alpha?: number): void;
    render(scene: Scene, camera: Camera): void;
    setAnimationLoop(callback: ((time: number) => void) | null): void;
    dispose(): void;
  }

  class Clock {
    constructor(autoStart?: boolean);
    getDelta(): number;
    getElapsedTime(): number;
  }

  class AxesHelper extends Object3D {
    constructor(size?: number);
  }
  class GridHelper extends Object3D {
    constructor(size?: number, divisions?: number);
  }

  // Math utilities
  namespace MathUtils {
    function degToRad(degrees: number): number;
    function radToDeg(radians: number): number;
    function clamp(value: number, min: number, max: number): number;
    function lerp(x: number, y: number, t: number): number;
    function randFloat(low: number, high: number): number;
    function randInt(low: number, high: number): number;
  }
}

declare const THREE: typeof THREE;
`;

export const LIBRARIES: Record<string, LibraryEntry> = {
  three: {
    id: 'three',
    label: 'Three.js',
    description: 'Biblioteka 3D — Scene, kamery, geometrie, materiały, renderer WebGL.',
    globalName: 'THREE',
    // Pinned version so we don't get breakage on a major bump; the global API
    // we declare is stable across 0.16x → 0.17x at the level of completions
    // we expose.
    cdnUrl: 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.min.js',
    typesDtsPath: 'file:///lib-three.d.ts',
    typesDtsContent: THREE_DTS,
  },
};

// ─── Library marker parsing ──────────────────────────────────────────────────
//
// Libraries are remembered IN the script body as `// @library: foo` comments.
// Storing them inline (vs. on a TipTap attribute) means a script copied out
// of the editor still tells you everything it depends on, and there's no
// schema-versioning concern when we add new libraries — every block parses
// the same way.

const LIBRARY_MARKER_RE = /^\s*\/\/\s*@library:\s*([a-zA-Z0-9_-]+)\s*$/gm;

/** Scan a script body for `// @library: foo` markers — returns unique IDs. */
export function parseLibrariesFromCode(code: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  // Reset lastIndex defensively since the regex has the `g` flag.
  LIBRARY_MARKER_RE.lastIndex = 0;
  while ((m = LIBRARY_MARKER_RE.exec(code)) !== null) {
    if (LIBRARIES[m[1]]) found.add(m[1]);
  }
  return Array.from(found);
}

/**
 * Insert a `// @library: foo` marker at the top of the script if it isn't
 * already there. Returns the new code so the caller can hand it to TipTap's
 * `updateAttributes({ code })`.
 *
 * The marker goes ABOVE any existing leading comment block (so the dependency
 * list is the first thing a reader sees), and we skip insertion when the
 * marker is already present anywhere in the body — duplicates would still
 * parse correctly but look messy.
 */
export function addLibraryToCode(code: string, libraryId: string): string {
  if (parseLibrariesFromCode(code).includes(libraryId)) return code;
  const marker = `// @library: ${libraryId}`;
  return code ? `${marker}\n${code}` : `${marker}\n`;
}

// ─── Runtime loader ──────────────────────────────────────────────────────────

/** Promises keyed by library id, so concurrent `runBlock` calls don't race. */
const loadingPromises = new Map<string, Promise<void>>();

/**
 * Inject the CDN bundle for `libraryId` once. Subsequent calls return the
 * cached promise — the global is set in-place on `window`, so all callers
 * see the same instance.
 *
 * Throws if the library doesn't exist in the catalog or if the global isn't
 * found after the script finishes loading (network / version issue).
 */
export async function loadLibrary(libraryId: string): Promise<void> {
  const entry = LIBRARIES[libraryId];
  if (!entry) throw new Error(`Unknown library: ${libraryId}`);

  // Already loaded — common path for re-runs after the first script execution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any)[entry.globalName]) return;

  const cached = loadingPromises.get(libraryId);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = entry.cdnUrl;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any)[entry.globalName]) {
        resolve();
      } else {
        reject(new Error(
          `Library ${libraryId} loaded but global ${entry.globalName} not found — version mismatch?`,
        ));
      }
    };
    script.onerror = () => reject(new Error(`Failed to load library: ${libraryId} from ${entry.cdnUrl}`));
    document.head.appendChild(script);
  });

  loadingPromises.set(libraryId, promise);
  // On failure, drop from the cache so a manual reload can retry.
  promise.catch(() => loadingPromises.delete(libraryId));
  return promise;
}

/** Pre-load every library declared by markers in `code`. Sequential is fine
 *  — typically a script uses 0 or 1 libraries; the order matters only when
 *  a library depends on another, which we don't currently support. */
export async function preloadLibrariesForCode(code: string): Promise<void> {
  const libs = parseLibrariesFromCode(code);
  for (const lib of libs) {
    await loadLibrary(lib);
  }
}
