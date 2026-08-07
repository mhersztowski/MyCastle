/**
 * Sceny w skryptach — klasa `Scene`, panel i typy.
 *
 * Wejście dla hosta (miejsca uruchamiające skrypty) i dla Monaco.
 */
export { Scene, setSceneHost } from './Scene';
/*
  Rozpoznawanie rodzaju węzła idzie prosto z `core-cad-viewer`.
  Podpowiedzi (`SCENE_SCRIPT_DTS`) obiecują te dwie funkcje w module
  `mycastle/scene`, więc muszą stąd wyjść — inaczej skrypt napisany zgodnie
  z podpowiedzią wywala się na `isNode3D is not defined`.
*/
export { isNode3D, isLayer } from '@mhersztowski/core-cad-viewer';
export type { IScene, INode, INode3D, ILayer, NodeData, Transform } from '@mhersztowski/core-cad-viewer';
export type { SceneHost, LoadOptions } from './Scene';
export { ScenePanel } from './ScenePanel';
export type { ScenePanelProps, TrybNarzedzia } from './ScenePanel';
export { SceneTree } from './SceneTree';
export { SceneProperties } from './SceneProperties';
export { CadPreview } from './CadPreview';
export { rodzajZeSciezki, scenaZTresci, trescZeSceny, pustaScena } from './sceneFiles';
export { jestUrl, adresyVfs, trescZOdpowiedzi } from './sceneUrl';
export type { ObslugiwanyRodzaj } from './sceneFiles';
export { SCENE_SCRIPT_DTS } from './sceneGlobals';
export { utworzHostaSceny, sciezkaBackendu } from './vfsHost';
export type { OpcjeHostaSceny } from './vfsHost';
