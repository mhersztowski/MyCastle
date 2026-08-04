/**
 * sceneGlobals.ts — podpowiedzi składni dla `Scene` w edytorze Monaco.
 *
 * Deklaracja modułu, a nie nazw globalnych: skrypt sięga po sceny importem,
 * więc Monaco ma podpowiadać dopiero po `import { Scene } from 'mycastle/scene'`.
 *
 * Trzymane jako tekst, nie jako plik `.d.ts` w drzewie projektu — z tego samego
 * powodu co `PLUGIN_SCRIPT_GLOBALS_DTS`: prawdziwy plik trafiłby do `tsconfig`
 * i zaśmiecił globalną przestrzeń typów całego frontendu.
 */
export const SCENE_SCRIPT_DTS = `
declare module 'mycastle/scene' {
  /** Rodzaje scen, które skrypt umie wczytać i zapisać. */
  export type SceneKind = 'cad' | 'scene3d';

  export interface Transform {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  }

  /** Dane obiektu; \`type\` rozstrzyga o reszcie pól ('line', 'mesh', …). */
  export interface NodeData {
    type: string;
    [pole: string]: unknown;
  }

  /** Obiekt sceny — wspólny kształt dla rysunku CAD i sceny 3D. */
  export interface INode {
    readonly id: string;
    getName(): string;
    setName(name: string): void;
    /** Ścieżka od korzenia, np. \`Warstwa 0/linia-3\`. Wynika z nazwy i rodzica. */
    getPath(): string;
    getParent(): INode | null;
    setParent(parent: INode | null): void;
    getChildren(): INode[];
    getData(): NodeData;
    update(data: Partial<NodeData>): void;
    /** Czy węzeł nadal jest w scenie — po usunięciu uchwyt zostaje w skrypcie. */
    isAlive(): boolean;
  }

  /** Obiekt osadzony w przestrzeni — scena 3D. */
  export interface INode3D extends INode {
    getTransform(): Transform;
    setTransform(transform: Partial<Transform>): void;
    getVisible(): boolean;
    setVisible(visible: boolean): void;
    getTag(): string | null;
    setTag(tag: string | null): void;
  }

  /** Warstwa rysunku — w drzewie jest rodzicem swoich encji. */
  export interface ILayer extends INode {
    getVisible(): boolean;
    setVisible(visible: boolean): void;
    isLocked(): boolean;
    setLocked(locked: boolean): void;
    getColor(): string | null;
  }

  export interface IScene {
    readonly kind: SceneKind;
    getRoot(): INode;
    getNodeById(id: string): INode | null;
    /** Węzeł spod ścieżki, np. \`Warstwa 0/linia-3\`. */
    getNode(path: string): INode | null;
    getNodeIdByPath(path: string): string | null;
    /** Nowy obiekt; \`null\`, gdy scena nie zna takiego rodzaju. */
    nodeCreate(data: NodeData, parent?: INode | null): INode | null;
    nodeDelete(id: string): boolean;
    getAllNodes(): INode[];
    find(predicate: (node: INode) => boolean): INode[];
    getLayers(): ILayer[];
    getSelection(): INode[];
    setSelection(nodes: INode[]): void;
  }

  export function isNode3D(node: INode): node is INode3D;
  export function isLayer(node: INode): node is ILayer;

  export interface LoadOptions {
    /** Rodzaj sceny, gdy nazwa pliku go nie zdradza. */
    kind?: SceneKind;
    /**
     * Adres jest ścieżką w VFS cudzego serwera (np. cad-backend), a nie zwykłym
     * plikiem — zamienia się wtedy na \`…/api/vfs/readFile?path=…\`.
     */
    vfs?: boolean;
    /** Wczytać bez pokazywania panelu. */
    silent?: boolean;
    /** Utworzyć pustą scenę, gdy pliku nie ma. */
    createIfMissing?: boolean;
  }

  /**
   * Sceny na dysku użytkownika.
   *
   * @example
   * import { Scene } from 'mycastle/scene';
   *
   * // z Drive
   * const scena = await Scene.load('drive/projekty/dom.scene.json');
   *
   * // z cad-backendu (projekty zrobione w cad-app)
   * const plan = await Scene.load(
   *   'http://localhost:1897/users/marcin/projects/plan.cad.json',
   *   { vfs: true },
   * );
   * for (const node of scena.find((n) => n.getData().type === 'mesh')) {
   *   node.setName(node.getName().toUpperCase());
   * }
   * await Scene.save('drive/projekty/dom.scene.json', scena);
   */
  export class Scene {
    /**
     * Wczytuje scenę i pokazuje ją w panelu pod wynikiem skryptu.
     *
     * @param path Ścieżka w Drive albo pełny adres na innym serwerze.
     */
    static load(path: string, options?: LoadOptions): Promise<IScene>;
    /** Zapisuje scenę pod wskazaną ścieżką (Drive albo VFS po HTTP). */
    static save(path: string, scene: IScene, options?: { vfs?: boolean }): Promise<void>;
    /** Pusta scena bez pliku — do zbudowania od zera i zapisania. */
    static create(kind: SceneKind, options?: { silent?: boolean }): IScene;
  }
}
`;
