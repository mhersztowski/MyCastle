/**
 * To, co obiecują podpowiedzi, musi istnieć w module.
 *
 * Podpowiedzi Monaco (`SCENE_SCRIPT_DTS`) i moduł wstrzykiwany do skryptu to
 * dwa osobne pliki. Rozjazd między nimi nie daje żadnego ostrzeżenia przy
 * budowaniu: autor pisze zgodnie z podpowiedzią, a skrypt wywala się dopiero
 * przy uruchomieniu na `X is not defined`.
 */
import { describe, it, expect } from 'vitest';
import * as modul from './index';
import { SCENE_SCRIPT_DTS } from './sceneGlobals';

/** Nazwy obiecane przez deklarację modułu `mycastle/scene`. */
function obiecaneNazwy(dts: string): string[] {
  const nazwy: string[] = [];
  for (const m of dts.matchAll(/^\s*export\s+(?:function|class)\s+([A-Za-z_]\w*)/gm)) {
    nazwy.push(m[1]);
  }
  return nazwy;
}

describe('deklaracja modułu wirtualnego', () => {
  /*
    `mycastle/scene` nie ma pliku na dysku — inaczej niż `api` i `Aura`, które
    leżą w `packages/core/browser/…` i TypeScript rozwiązuje je po ścieżce.
    Moduł wirtualny opisuje `declare module`, a taka deklaracja działa **tylko
    w pliku globalnym**: wystarczy jeden `export` albo `import` na najwyższym
    poziomie, żeby plik stał się modułem i deklaracja przestała być widoczna —
    bez błędu, po prostu bez podpowiedzi.
  */
  it('jest deklaracją modułu, nie zwykłym plikiem z typami', () => {
    expect(SCENE_SCRIPT_DTS.trim().startsWith("declare module 'mycastle/scene'")).toBe(true);
  });

  it('nie ma niczego na najwyższym poziomie poza deklaracją', () => {
    // Bez `trim()`: liczy się brak wcięcia, bo to ono odróżnia najwyższy
    // poziom pliku od wnętrza bloku `declare module`.
    const pozaBlokiem = SCENE_SCRIPT_DTS
      .split('\n')
      .filter((linia) => /^(export|import)\b/.test(linia));

    expect(pozaBlokiem).toEqual([]);
  });

  it('nawiasy klamrowe się domykają', () => {
    // Niedomknięty blok zabiera podpowiedzi w całym pliku, w którym go użyto.
    const otwarte = (SCENE_SCRIPT_DTS.match(/\{/g) ?? []).length;
    const zamkniete = (SCENE_SCRIPT_DTS.match(/\}/g) ?? []).length;
    expect(otwarte).toBe(zamkniete);
  });
});

describe('podpowiedzi a rzeczywistość', () => {
  it('każda obiecana nazwa istnieje w module', () => {
    const obiecane = obiecaneNazwy(SCENE_SCRIPT_DTS);
    expect(obiecane.length).toBeGreaterThan(0);

    for (const nazwa of obiecane) {
      expect(modul, nazwa).toHaveProperty(nazwa);
    }
  });

  it('Scene ma metody, które obiecuje deklaracja', () => {
    expect(typeof modul.Scene.load).toBe('function');
    expect(typeof modul.Scene.save).toBe('function');
    expect(typeof modul.Scene.create).toBe('function');
  });

  it('rozpoznawanie rodzaju węzła działa, nie tylko się deklaruje', () => {
    const scena = modul.Scene.create('scene3d', { silent: true });
    const siatka = scena.nodeCreate({ type: 'mesh', name: 'Kostka' })!;

    expect(modul.isNode3D(siatka)).toBe(true);
    expect(modul.isLayer(siatka)).toBe(false);
  });
});
