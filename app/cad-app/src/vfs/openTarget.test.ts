/**
 * Testy adresów „otwórz plik z backendu". Cała wartość tego modułu to
 * jednoznaczne odwzorowanie adres ↔ (plik, tryb) — i to tutaj sprawdzamy.
 */
import { describe, it, expect } from 'vitest';
import { modeForFile, parseOpenTarget, buildOpenUrl, openableExtensions, openUrlFor } from './openTarget';

describe('modeForFile', () => {
  it('rozpoznaje tryb po rozszerzeniu', () => {
    expect(modeForFile('a/b/projekt.cad.json')).toBe('cad');
    expect(modeForFile('a/b/projekt.cad3d.json')).toBe('cad3d');
    expect(modeForFile('scena.scene.json')).toBe('scene3d');
    expect(modeForFile('plytka.elec.json')).toBe('electronics');
    expect(modeForFile('plytka.pcb.json')).toBe('pcb');
    expect(modeForFile('teren.map.json')).toBe('map');
    expect(modeForFile('notatki.notes.json')).toBe('notes');
    expect(modeForFile('dokument.qmd')).toBe('rysik');
  });

  it('dłuższe rozszerzenie wygrywa z krótszym', () => {
    // `.cad3d.json` kończy się też na `.json`, ale nie na `.cad.json` —
    // ten test pilnuje kolejności sprawdzania.
    expect(modeForFile('x.cad3d.json')).toBe('cad3d');
  });

  it('ignoruje wielkość liter', () => {
    expect(modeForFile('X.CAD3D.JSON')).toBe('cad3d');
  });

  it('nieznane rozszerzenie to brak trybu', () => {
    expect(modeForFile('plik.txt')).toBeNull();
    expect(modeForFile('plik.json')).toBeNull();
    expect(modeForFile('')).toBeNull();
  });
});

describe('parseOpenTarget', () => {
  it('czyta ścieżkę z /open/…', () => {
    expect(parseOpenTarget('/open/users/marcin/projects/silnik.cad3d.json')).toEqual({
      vfsPath: 'users/marcin/projects/silnik.cad3d.json',
      mode: 'cad3d',
    });
  });

  it('dekoduje segmenty adresu', () => {
    const url = buildOpenUrl('/users/marcin/projects/mój projekt.cad.json');
    expect(parseOpenTarget(url)).toEqual({
      vfsPath: 'users/marcin/projects/mój projekt.cad.json',
      mode: 'cad',
    });
  });

  it('czyta wariant z parametrem ?open=', () => {
    expect(parseOpenTarget('/', '?open=/users/x/scena.scene.json')).toEqual({
      vfsPath: 'users/x/scena.scene.json',
      mode: 'scene3d',
    });
  });

  it('odrzuca adresy bez pliku i nieznane rozszerzenia', () => {
    expect(parseOpenTarget('/')).toBeNull();
    expect(parseOpenTarget('/open/')).toBeNull();
    expect(parseOpenTarget('/open/users/x/readme.txt')).toBeNull();
  });

  it('odrzuca próbę wyjścia poza VFS', () => {
    expect(parseOpenTarget('/open/../../etc/passwd.cad.json')).toBeNull();
  });

  it('obcina query i fragment doklejone do ścieżki', () => {
    expect(parseOpenTarget('/', '?open=/users/x/a.cad.json?v=2')).toEqual({
      vfsPath: 'users/x/a.cad.json',
      mode: 'cad',
    });
  });
});

describe('buildOpenUrl', () => {
  it('koduje segmenty, ale zostawia ukośniki', () => {
    expect(buildOpenUrl('/users/marcin/moje projekty/a.cad.json'))
      .toBe('/open/users/marcin/moje%20projekty/a.cad.json');
  });

  it('adres zbudowany z każdego obsługiwanego rozszerzenia daje się odczytać', () => {
    for (const ext of openableExtensions()) {
      const url = buildOpenUrl(`users/x/plik${ext}`);
      expect(parseOpenTarget(url)?.vfsPath).toBe(`users/x/plik${ext}`);
    }
  });
});

describe('openUrlFor', () => {
  it('daje adres /open/… dla znanego pliku', () => {
    expect(openUrlFor('users/marcin/projects/silnik.cad3d.json'))
      .toBe('/open/users/marcin/projects/silnik.cad3d.json');
  });

  it('obcina wiodący ukośnik', () => {
    expect(openUrlFor('/users/x/a.cad.json')).toBe('/open/users/x/a.cad.json');
  });

  it('null dla nieznanego rozszerzenia i pustej ścieżki', () => {
    expect(openUrlFor('users/marcin/notatka.txt')).toBeNull();
    expect(openUrlFor('')).toBeNull();
  });
});
