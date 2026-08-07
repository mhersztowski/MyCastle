/**
 * Czy skrypt w ogóle potrzebuje biblioteki Qt.
 *
 * Drive wczytywał `qobject.module.js` i `qt.module.js` **przed każdym** skryptem,
 * twardo. Kto nie miał tych plików w swoim katalogu, dostawał
 * „Failed to fetch dynamically imported module" i skrypt nie ruszał — nawet gdy
 * nie miał z Qt nic wspólnego. Widgety Qt są dodatkiem, a nie warunkiem
 * uruchomienia czegokolwiek.
 */
import { describe, it, expect } from 'vitest';
import { potrzebujeQt } from './potrzebneQt';

describe('rozpoznanie potrzeby Qt', () => {
  it('skrypt o scenie nie potrzebuje Qt', () => {
    const kod = `
      import { Scene } from 'mycastle/scene';
      const scena = await Scene.load('drive/a.scene.json');
      for (const node of scena.find((n) => n.getData().type === 'mesh')) {
        node.setName(node.getName().toUpperCase());
      }
    `;
    expect(potrzebujeQt(kod)).toBe(false);
  });

  it('zwykły skrypt bez zależności też nie', () => {
    expect(potrzebujeQt('console.log(1 + 1);')).toBe(false);
  });

  it('rozpoznaje klasy widgetów', () => {
    expect(potrzebujeQt('const l = new QLabel("cześć");')).toBe(true);
    expect(potrzebujeQt('const w = new QWidget();')).toBe(true);
    expect(potrzebujeQt('const box = new QVBoxLayout();')).toBe(true);
  });

  it('rozpoznaje klasy z przedrostkiem Qt', () => {
    // `QtCanvas` nie pasuje do wzorca „Q + wielka litera", a jest podstawowy.
    expect(potrzebujeQt('const c = new QtCanvas(document.body);')).toBe(true);
    expect(potrzebujeQt('new QtLineEditNode()')).toBe(true);
  });

  it('rozpoznaje import z katalogu qt', () => {
    const kod = "import { QtLineEditNode } from '@mhersztowski/minislib/qt/nodes';";
    expect(potrzebujeQt(kod)).toBe(true);
  });

  it('nie myli się o słowa zawierające Q w środku', () => {
    // „Query", „Queue", „SQL" nie mają nic wspólnego z Qt.
    expect(potrzebujeQt('const Query = 1; const queue = [];')).toBe(false);
    expect(potrzebujeQt('runSQLQuery("select 1")')).toBe(false);
  });

  it('nie reaguje na Q w treści napisu z nazwą pliku', () => {
    expect(potrzebujeQt('const p = "drive/QUARTAL.json";')).toBe(false);
  });

  it('pusty kod nie potrzebuje niczego', () => {
    expect(potrzebujeQt('')).toBe(false);
  });
});
