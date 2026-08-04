/**
 * sceneFiles.ts — rozpoznanie rodzaju sceny po pliku i jej wczytanie.
 *
 * Osobno od klasy `Scene`, bo to czysta logika: żadnego VFS-a, żadnego Reacta.
 * Dzięki temu da się ją sprawdzić testem, a `Scene` zostaje cienką fasadą nad
 * wejściem–wyjściem.
 */
import { Project } from '@mhersztowski/core-cad';
import { SceneDeserializer, SceneGraph, SceneSerializer } from '@mhersztowski/core-scene3d';
import { CadScene, Scene3dScene, type IScene, type SceneKind } from '@mhersztowski/core-cad-viewer';

/** Rodzaje, które ten moduł umie wczytać i zapisać. */
export type ObslugiwanyRodzaj = Extract<SceneKind, 'cad' | 'scene3d'>;

/**
 * Rodzaj sceny z nazwy pliku.
 *
 * Rozszerzenie jest tu **umową, nie zgadywaniem**: `.scene.json` zapisuje
 * edytor sceny 3D, `.cad.json` — edytor rysunku. Podanie rodzaju wprost ma
 * pierwszeństwo, bo autor skryptu wie lepiej niż nazwa pliku.
 */
export function rodzajZeSciezki(path: string): ObslugiwanyRodzaj | null {
  const nazwa = path.toLowerCase();
  if (nazwa.endsWith('.scene.json') || nazwa.endsWith('.scene3d.json')) return 'scene3d';
  if (nazwa.endsWith('.cad.json')) return 'cad';
  return null;
}

/** Buduje scenę z treści pliku. Rzuca, gdy treść nie pasuje do rodzaju. */
export function scenaZTresci(tresc: string, rodzaj: ObslugiwanyRodzaj): IScene {
  if (rodzaj === 'scene3d') {
    return new Scene3dScene(SceneDeserializer.deserialize(tresc));
  }

  return new CadScene(Project.fromJSON(JSON.parse(tresc)));
}

/** Pusta scena danego rodzaju — punkt wyjścia, gdy plik jeszcze nie istnieje. */
export function pustaScena(rodzaj: ObslugiwanyRodzaj): IScene {
  return rodzaj === 'scene3d' ? new Scene3dScene(new SceneGraph()) : new CadScene(new Project());
}

/**
 * Treść pliku ze sceny.
 *
 * Zapis idzie przez **ten sam serializator**, którego używa edytor — inaczej
 * plik zapisany ze skryptu otwierałby się inaczej niż zapisany ręcznie, a to
 * jest różnica, której nikt nie zauważy aż do utraty danych.
 */
export function trescZeSceny(scene: IScene): string {
  if (scene.kind === 'scene3d') {
    return SceneSerializer.serialize((scene as Scene3dScene).graph);
  }
  if (scene.kind === 'cad') {
    return JSON.stringify((scene as CadScene).project.toJSON(), null, 2);
  }
  throw new Error(`Nie umiem zapisać sceny rodzaju „${scene.kind}".`);
}
