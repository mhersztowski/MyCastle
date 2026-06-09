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
  /**
   * How to load the library at runtime:
   *   - `'local'` — bundle from `node_modules` via `localLoader()`. ZERO
   *     network traffic, ZERO CDN risk, single shared instance across all
   *     script blocks in the document. Preferred for any library we can
   *     afford to ship with the app. The first run pays a Vite chunk-fetch
   *     cost; subsequent runs are instant.
   *   - `'script-global'` (legacy) — inject a `<script>` tag and wait for
   *     the library to populate `window[globalName]`. Works for UMD bundles
   *     but pulls the network on every fresh page load.
   *   - `'esm-module'` (legacy) — `await import(cdnUrl)` and attach the
   *     namespace to `window[globalName]`. For ESM-only libraries whose
   *     CDNs (`+esm` builds) don't ship UMD.
   */
  loadStrategy?: 'local' | 'script-global' | 'esm-module';
  /** Required when `loadStrategy === 'local'`. Returns the module namespace
   *  (or the object that should land on `window[globalName]`). Kept as a
   *  function rather than a static `import` so Vite generates a real lazy
   *  chunk — Three.js + Lit don't sit in the main mycastle-web bundle. */
  localLoader?: () => Promise<Record<string, unknown>>;
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

// ─── Lit — minimal ambient for web-components authoring ──────────────────────
//
// Lit ships ESM-only on CDN (no UMD), so we load it via `await import(url)`
// and stash the whole module namespace on `window.Lit`. The ambient below
// mirrors that — `Lit.html`, `Lit.css`, `Lit.LitElement`, plus the decorator
// helpers from `lit/decorators.js`. Covers maybe 80% of what people write
// when prototyping a custom element; the runtime has the full surface area
// because we re-export everything from the import.
const LIT_DTS = `
declare namespace Lit {
  /** Marker for the result of an html\`…\` template literal. */
  interface TemplateResult { readonly _$litType$: 1; }
  /** Marker for the result of a css\`…\` template literal. */
  interface CSSResult { cssText: string; styleSheet?: CSSStyleSheet; }

  /**
   * Tagged template literal returning a TemplateResult. Render it from
   * a LitElement.render() method or pass to render(template, container).
   */
  function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult;

  /** Tagged template literal returning a CSSResult — assign to static styles. */
  function css(strings: TemplateStringsArray, ...values: unknown[]): CSSResult;

  /**
   * Wrap a raw CSS string as a CSSResult so it can be interpolated inside
   * \`css\\\`…\\\`\`. Lit normally rejects plain strings as an XSS guard —
   * \`unsafeCSS\` is your way of saying "I trust this string". Use sparingly:
   * the value should never come from user input.
   */
  function unsafeCSS(value: string | number): CSSResult;

  /**
   * Render a TemplateResult into a DOM container (re-render is incremental).
   * @param template result of html\`…\`
   * @param container target HTMLElement
   */
  function render(template: TemplateResult, container: HTMLElement | DocumentFragment): void;

  /** When unset, the element renders into its open shadow root. */
  type RenderOptions = { renderBefore?: Node; host?: HTMLElement };

  /**
   * Lit's reactive controller-aware base class. Extend it, set static styles +
   * static properties, implement render(), and \`customElements.define()\` it.
   */
  class LitElement extends HTMLElement {
    static styles?: CSSResult | CSSResult[];
    static properties?: Record<string, {
      type?: unknown;
      attribute?: string | boolean;
      reflect?: boolean;
      state?: boolean;
      converter?: unknown;
    }>;

    /** Override to produce the element's template. */
    render(): TemplateResult | unknown;

    /** Schedule a re-render. Property changes do this automatically. */
    requestUpdate(name?: string, oldValue?: unknown): void;
    /** Promise resolving once the next render completes. */
    readonly updateComplete: Promise<boolean>;

    connectedCallback(): void;
    disconnectedCallback(): void;
    updated(changedProperties: Map<string, unknown>): void;
    firstUpdated(changedProperties: Map<string, unknown>): void;
    willUpdate(changedProperties: Map<string, unknown>): void;
  }

  // Decorators (from lit/decorators.js) — Lit re-exports them on the main
  // module too, so this namespace is the right place even though they live
  // in a sub-module in the npm package.
  function customElement(tagName: string): (cls: typeof LitElement) => void;
  function property(options?: { type?: unknown; attribute?: string | boolean; reflect?: boolean }): (proto: object, name: string) => void;
  function state(): (proto: object, name: string) => void;
  function query(selector: string): (proto: object, name: string) => void;
  function queryAll(selector: string): (proto: object, name: string) => void;
  function eventOptions(options: AddEventListenerOptions): (proto: object, name: string) => void;

  // Directives (subset — full list at lit.dev/docs/templates/directives/).
  function repeat<T>(items: Iterable<T>, keyFn: (item: T, i: number) => unknown, template: (item: T, i: number) => unknown): unknown;
  function when<T>(condition: T, truthy: (v: NonNullable<T>) => unknown, falsy?: () => unknown): unknown;
  function classMap(classes: Record<string, boolean>): unknown;
  function styleMap(styles: Record<string, string | number>): unknown;
  function ifDefined<T>(value: T): T | undefined;
}

declare const Lit: typeof Lit;
`;

export const LIBRARIES: Record<string, LibraryEntry> = {
  three: {
    id: 'three',
    label: 'Three.js',
    description: 'Biblioteka 3D — Scene, kamery, geometrie, materiały, renderer WebGL. Bundlowana lokalnie.',
    globalName: 'THREE',
    // cdnUrl jest zachowane jako fallback i jako etykieta w UI library
    // picker'a, ale runtime loadera używa lokalnej paczki npm — eliminuje
    // ruch sieciowy per skrypt i CDN/CORS failures, które wcześniej
    // przejawiały się jako "THREE is not defined".
    cdnUrl: 'three (npm — lokalnie z node_modules)',
    typesDtsPath: 'file:///lib-three.d.ts',
    typesDtsContent: THREE_DTS,
    loadStrategy: 'local',
    // `await import('three')` jest naturalnie cache'owane przez Vite — ten
    // sam chunk obsłuży wszystkie bloki skryptów w dokumencie. Dependency
    // jest deklarowane w mycastle-web/package.json.
    localLoader: async () => {
      const mod = await import('three');
      // Three.js ESM eksportuje wszystkie klasy jako named exports.
      // `THREE` namespace na window potrzebuje obiektu, więc spread modułu.
      return { ...mod };
    },
  },
  lit: {
    id: 'lit',
    label: 'Lit',
    description: 'Web Components — LitElement, reaktywne properties, html`…` template. Bundlowana lokalnie.',
    globalName: 'Lit',
    cdnUrl: 'lit (npm — lokalnie z node_modules)',
    typesDtsPath: 'file:///lib-lit.d.ts',
    typesDtsContent: LIT_DTS,
    loadStrategy: 'local',
    // Lit ships LitElement / html / css / render z 'lit', a decoratory +
    // directywy z osobnych podmodułów. Zbiera wszystko w jeden namespace
    // tak żeby stub IntelliSense (Lit.repeat, Lit.classMap, …) zgadzał
    // się z runtime'em. Vite generuje jeden chunk per submodule, ale i
    // tak to lokalnie + cache na cały czas życia strony.
    localLoader: async () => {
      const [main, decorators, repeat, whenMod, classMap, styleMap, ifDefined] = await Promise.all([
        import('lit'),
        import('lit/decorators.js'),
        import('lit/directives/repeat.js'),
        import('lit/directives/when.js'),
        import('lit/directives/class-map.js'),
        import('lit/directives/style-map.js'),
        import('lit/directives/if-defined.js'),
      ]);
      return {
        ...main,
        ...decorators,
        ...repeat,
        ...whenMod,
        ...classMap,
        ...styleMap,
        ...ifDefined,
      };
    },
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
  if ((window as any)[entry.globalName]) {
    // eslint-disable-next-line no-console
    console.log(`[AutomateScript] loadLibrary(${libraryId}): already on window.${entry.globalName}, skip`);
    return;
  }

  const cached = loadingPromises.get(libraryId);
  if (cached) {
    // eslint-disable-next-line no-console
    console.log(`[AutomateScript] loadLibrary(${libraryId}): in-flight, awaiting cached promise`);
    return cached;
  }

  const strategy = entry.loadStrategy ?? 'script-global';
  // eslint-disable-next-line no-console
  console.log(`[AutomateScript] loadLibrary(${libraryId}): strategy='${strategy}' source=${entry.cdnUrl}`);
  let promise: Promise<void>;

  if (strategy === 'local') {
    // Lokalna paczka npm — Vite generuje dynamiczny chunk z tej `import()`.
    // Pierwszy run pobiera chunk z dev/prod server'a, reszta runów dostaje
    // namespace natychmiast z cache modułowego.
    if (!entry.localLoader) {
      throw new Error(`Library ${libraryId} declared loadStrategy='local' but no localLoader provided`);
    }
    promise = (async () => {
      try {
        const t0 = performance.now();
        const assembled = await entry.localLoader!();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)[entry.globalName] = assembled;
        const dt = (performance.now() - t0).toFixed(1);
        // eslint-disable-next-line no-console
        console.log(`[AutomateScript] loadLibrary(${libraryId}): LOCAL import done in ${dt}ms — window.${entry.globalName} keys:`,
          Object.keys(assembled));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[AutomateScript] loadLibrary(${libraryId}): LOCAL import FAILED`, err);
        throw new Error(`Failed to load local library ${libraryId}: ${(err as Error).message}`);
      }
    })();
  } else if (strategy === 'esm-module') {
    // ESM path — `await import(url)` and stash the namespace on
    // `window[globalName]`. The CDN bundles (e.g. jsDelivr's `+esm` build)
    // serve a proper module, so the resulting object exposes every named
    // export the package ships. We attach it as a whole rather than picking
    // named exports to leave the global API as close to the real package as
    // possible — `Lit.html` works without us having to enumerate every helper.
    //
    // The `/* @vite-ignore */` is necessary because Vite tries to resolve
    // static-string `import()` URLs at build time. We're handing it a runtime
    // URL it shouldn't touch.
    promise = (async () => {
      try {
        const t0 = performance.now();
        const main = await import(/* @vite-ignore */ entry.cdnUrl);

        // Lit ships decorators and directives in *separate* submodules — the
        // main `lit` bundle only has `LitElement` / `html` / `css` / `render`.
        // For the catalog to match the TS stub we publish (which advertises
        // `Lit.repeat`, `Lit.classMap`, `Lit.customElement`, …), we eagerly
        // fetch the most common submodules and merge them into the namespace.
        // The same `+esm` build serves them.
        let assembled: Record<string, unknown> = { ...main };
        if (libraryId === 'lit') {
          const base = 'https://cdn.jsdelivr.net/npm/lit@3';
          const submodules = await Promise.all([
            import(/* @vite-ignore */ `${base}/decorators.js/+esm`),
            import(/* @vite-ignore */ `${base}/directives/repeat.js/+esm`),
            import(/* @vite-ignore */ `${base}/directives/when.js/+esm`),
            import(/* @vite-ignore */ `${base}/directives/class-map.js/+esm`),
            import(/* @vite-ignore */ `${base}/directives/style-map.js/+esm`),
            import(/* @vite-ignore */ `${base}/directives/if-defined.js/+esm`),
          ]);
          for (const mod of submodules) {
            assembled = { ...assembled, ...mod };
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)[entry.globalName] = assembled;
        const dt = (performance.now() - t0).toFixed(1);
        // eslint-disable-next-line no-console
        console.log(`[AutomateScript] loadLibrary(${libraryId}): ESM import done in ${dt}ms — window.${entry.globalName} keys:`,
          Object.keys(assembled));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[AutomateScript] loadLibrary(${libraryId}): ESM import FAILED`, err);
        throw new Error(`Failed to load library ${libraryId} from ${entry.cdnUrl}: ${(err as Error).message}`);
      }
    })();
  } else {
    // Classic UMD path — inject <script> and wait for the global to appear.
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = entry.cdnUrl;
      script.crossOrigin = 'anonymous';
      const t0 = performance.now();
      script.onload = () => {
        const dt = (performance.now() - t0).toFixed(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any)[entry.globalName]) {
          // eslint-disable-next-line no-console
          console.log(`[AutomateScript] loadLibrary(${libraryId}): <script> loaded in ${dt}ms — window.${entry.globalName} ready`);
          resolve();
        } else {
          // eslint-disable-next-line no-console
          console.error(`[AutomateScript] loadLibrary(${libraryId}): <script> loaded but window.${entry.globalName} missing`);
          reject(new Error(
            `Library ${libraryId} loaded but global ${entry.globalName} not found — version mismatch?`,
          ));
        }
      };
      script.onerror = () => {
        // eslint-disable-next-line no-console
        console.error(`[AutomateScript] loadLibrary(${libraryId}): <script> failed to load from ${entry.cdnUrl}`);
        reject(new Error(`Failed to load library: ${libraryId} from ${entry.cdnUrl}`));
      };
      document.head.appendChild(script);
    });
  }

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
  // eslint-disable-next-line no-console
  console.log(`[AutomateScript] preloadLibrariesForCode: parsed markers →`, libs);
  for (const lib of libs) {
    await loadLibrary(lib);
  }
  if (libs.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[AutomateScript] preloadLibrariesForCode: all ${libs.length} libraries ready`);
  }
}
