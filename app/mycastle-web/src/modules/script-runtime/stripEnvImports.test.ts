/**
 * Skrypt deklaruje zależności importem, a wykonanie ich nie zna.
 *
 * `new AsyncFunction` nie przyjmuje `import`, więc import modułu środowiska
 * musi zniknąć przed uruchomieniem — a symbol wchodzi przez kontekst.
 */
import { describe, it, expect } from 'vitest';
import { stripEnvImports } from './envImports';

describe('usuwanie importów środowiska', () => {
  it('usuwa import sceny', () => {
    const kod = stripEnvImports("import { Scene } from 'mycastle/scene';\nconst x = 1;");
    expect(kod).not.toContain('import');
    expect(kod).toContain('const x = 1;');
  });

  it('radzi sobie z apostrofami i cudzysłowami', () => {
    expect(stripEnvImports('import { Scene } from "mycastle/scene"')).not.toContain('import');
  });

  it('usuwa też import typu', () => {
    expect(stripEnvImports("import type { IScene } from 'mycastle/scene';")).not.toContain('import');
  });

  it('nie rusza importów spoza środowiska', () => {
    // Lepiej, żeby autor zobaczył błąd składni, niż żeby symbol po cichu był
    // `undefined` i skrypt wywalił się dopiero przy użyciu.
    const kod = "import { cos } from 'jakas-biblioteka';";
    expect(stripEnvImports(kod)).toBe(kod);
  });

  it('zostawia kod, w którym słowo „import" jest w tekście', () => {
    const kod = 'const opis = "import z pliku";';
    expect(stripEnvImports(kod)).toBe(kod);
  });

  it('nie gubi numerów wierszy — puste miejsce po imporcie zostaje', () => {
    // Komunikat o błędzie wskazuje wiersz; przesunięcie numeracji zmusza autora
    // do liczenia w pamięci, o ile linii się pomylił.
    const kod = stripEnvImports("import { Scene } from 'mycastle/scene';\nbłąd tutaj");
    expect(kod.split('\n')).toHaveLength(2);
  });
});
