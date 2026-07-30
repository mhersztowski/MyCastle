/**
 * threeTypesData.ts — dane i czyste funkcje wsparcia podpowiedzi w edytorze kodu.
 *
 * Oddzielone od `threeTypes.ts`, które dotyka Monaco: te fragmenty są testowane
 * w środowisku node, gdzie `monaco-editor` nie daje się nawet zaimportować.
 */

/** Adres paczki deklaracji (public/ cad-app → serwowane też z cad-backend). */
export const THREE_TYPES_URL = '/types/three.json';

export const TYPES_ROOT = 'file:///node_modules/@types/three';

/**
 * Zdejmuje `.js` z relatywnych importów w plikach `.d.ts`.
 *
 * @types/three od 0.130 pisze `export * from "./src/Three.js"`, a TypeScript przy
 * resolucji node szukałby wtedy `./src/Three.js.d.ts`. Bez rozszerzenia trafia na
 * `./src/Three.d.ts` swoją zwykłą ścieżką prób.
 */
export function normalizeDtsImports(content: string): string {
  return content.replace(/(['"])(\.\.?\/[^'"]+)\.[cm]?js\1/g, '$1$2$1');
}

/** Mapa plik→treść z paczki; klucze są względne wobec katalogu `@types/three`. */
export type ThreeTypesBundle = Record<string, string>;

/** Czy paczka wygląda na kompletną (jest wejście i drzewo `src/`). */
export function isUsableThreeBundle(bundle: ThreeTypesBundle): boolean {
  return typeof bundle['index.d.ts'] === 'string'
    && Object.keys(bundle).some((k) => k.startsWith('src/') && k.endsWith('.d.ts'));
}

/**
 * Globalne symbole, które „Run" w Scene 3D wstrzykuje do skryptu.
 *
 * Trzymane obok implementacji w `src/scene-script/sceneScript.ts` — test
 * `sceneScriptEnv.test.ts` pilnuje, żeby lista metod nie rozjechała się z API.
 */
export const SCENE_SCRIPT_ENV_DTS = `
// Środowisko skryptu sceny (cad-app → Scene 3D → Run).
// Te symbole są wstrzykiwane przez runtime — nie importuj ich.

/** Węzeł sceny (SceneNode z @mhersztowski/core-scene3d). */
interface SceneScriptNode {
  readonly id: string;
  name: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  /** Obiekt Three przypięty przez viewer (null, dopóki scena się nie wyrenderuje). */
  _threeObject: unknown | null;
  setPosition(p: [number, number, number]): void;
  setRotation(r: [number, number, number]): void;
  setScale(s: [number, number, number]): void;
  setVisible(v: boolean): void;
  /** Dostępne dla węzłów typu mesh. */
  setMaterialColor?(color: string): void;
  children: SceneScriptNode[];
}

interface SceneScriptGraph {
  root: SceneScriptNode;
  findNode(id: string): SceneScriptNode | null;
  traverse(cb: (node: SceneScriptNode) => void): void;
  addNode(node: SceneScriptNode, parentId?: string): void;
  removeNode(id: string): void;
}

interface SceneScriptApi {
  /** Graf uruchomionej sceny (kopia dokumentu — edytor pozostaje nietknięty). */
  graph: SceneScriptGraph;
  /** Węzeł po id, a jeśli nie ma — po nazwie. */
  find(target: string): SceneScriptNode | null;
  /** Wszystkie węzły (bez root), opcjonalnie filtrowane po nazwie. */
  findAll(name?: string): SceneScriptNode[];
  /** Obiekt Three przypięty do węzła. */
  object(target: string | SceneScriptNode): unknown | null;
  /** Pętla klatek: dt i elapsed w sekundach. Zwraca funkcję odsubskrybowania. */
  onFrame(cb: (dt: number, elapsed: number) => void): () => void;
  /** Wypisuje do konsoli okna „Run". */
  log(...args: unknown[]): void;
  console: Record<'log' | 'info' | 'warn' | 'error' | 'debug', (...args: unknown[]) => void>;
  setTimeout(handler: () => void, timeout?: number): number;
  setInterval(handler: () => void, timeout?: number): number;
  clearTimeout(id: number): void;
  clearInterval(id: number): void;
}

/** API sceny uruchomionej przyciskiem „Run". */
declare const scene: SceneScriptApi;
/** Cała biblioteka Three.js — dostępna też bez importu. */
declare const THREE: typeof import('three');
`;

