/**
 * Cross-walidacja: nasz solver kontra SciPy.
 *
 * Poziom 2 walidacji z raportu (§7). Testy analityczne (poziom 1) łapią błędy
 * solvera tam, gdzie znamy rozwiązanie zamknięte — ale większość układów go nie
 * ma. Tutaj drugim zdaniem jest **niezależny silnik**: SciPy z adaptacyjnym
 * DOP853 i ciasnymi tolerancjami, całkujący ten sam układ wyeksportowany z tego
 * samego dokumentu.
 *
 * Żeby błąd przeszedł niezauważony, musiałby być identyczny w dwóch niezależnie
 * napisanych całkowaniach — a to jest znacznie mniej prawdopodobne niż błąd w
 * jednym.
 *
 * Fixtures powstają **osobnym poleceniem**, nie w trakcie testu:
 *
 *     node validation/generate-fixtures.mjs <python-ze-scipy>
 *
 * Gdyby powstawały tutaj, porównywalibyśmy wynik z samym sobą.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';

interface Fixture {
  id: string;
  state: string[];
  parameters: Record<string, number>;
  tSpan: [number, number];
  solver: string;
  t: number[];
  y: Record<string, number[]>;
}

const KATALOG_FIXTURES = join(__dirname, '..', '..', 'validation', 'fixtures');
const KATALOG_DOKUMENTOW = join(__dirname, '..', '..', '..', 'sci-blocks', 'dokumenty');

/** Blok `formula:id` wyjęty z dokumentu — to samo źródło co dla fixture. */
function blokZDokumentu(dokument: string, id: string) {
  const markdown = readFileSync(join(KATALOG_DOKUMENTOW, dokument), 'utf8');
  const dopasowanie = new RegExp('```formula:' + id + '\\n([\\s\\S]*?)```').exec(markdown);
  if (!dopasowanie) throw new Error(`Nie ma bloku formula:${id} w ${dokument}`);
  return parseFormulaBlock(id, dopasowanie[1]);
}

function wczytajFixture(id: string): Fixture | undefined {
  const sciezka = join(KATALOG_FIXTURES, `${id}.json`);
  return existsSync(sciezka) ? JSON.parse(readFileSync(sciezka, 'utf8')) : undefined;
}

/**
 * Największa różnica względna między trajektoriami.
 *
 * Odnosimy do **amplitudy przebiegu**, nie do wartości chwilowej: przy
 * przejściu przez zero różnica względna rośnie do nieskończoności, choć
 * trajektorie leżą na sobie.
 */
function najwiekszaRoznica(nasze: number[], referencyjne: number[]): number {
  const amplituda = Math.max(...referencyjne.map(Math.abs), 1e-12);
  let najwieksza = 0;
  for (let i = 0; i < referencyjne.length; i += 1) {
    najwieksza = Math.max(najwieksza, Math.abs(nasze[i] - referencyjne[i]) / amplituda);
  }
  return najwieksza;
}

/**
 * Tolerancje dobrane do **zmierzonych** rozjazdów, nie „na oko".
 *
 * Przy `dt = 1e-4` faktyczne różnice wynoszą ~2e-7 (wahadło, oscylator) i
 * ~4e-6 (Lorenz). Progi są od nich około dwudziestokrotnie luźniejsze — tyle,
 * żeby przetrwać inną wersję SciPy albo inną maszynę, i nie więcej. Margines
 * rzędu tysiąca przepuściłby realny błąd i test nie sprawdzałby niczego.
 */
const UKLADY = [
  { dokument: 'wahadlo.md', id: 'pendulum-ode', tolerancja: 5e-6 },
  { dokument: 'rezonans.md', id: 'oscylator-ode', tolerancja: 5e-6 },
  // Chaos rozjeżdża się z definicji — na krótkim odcinku trajektorie muszą się
  // jeszcze pokrywać, ale luźniej, bo błąd rośnie tam wykładniczo.
  { dokument: 'lorenz.md', id: 'lorenz-ode', tolerancja: 1e-4 },
];

describe('cross-walidacja ze SciPy', () => {
  for (const { dokument, id, tolerancja } of UKLADY) {
    const fixture = wczytajFixture(id);

    it.skipIf(!fixture)(`${id}: trajektoria zgadza się z niezależnym solverem`, () => {
      const model = compileGraph(buildGraph([blokZDokumentu(dokument, id)]));
      const wynik = model.run(fixture!.parameters, fixture!.tSpan, 1e-4);

      expect(wynik.trajectory).toBeDefined();

      for (const nazwa of fixture!.state) {
        const nasze = fixture!.t.map((t) => wynik.trajectory!.value(nazwa, t));
        const roznica = najwiekszaRoznica(nasze, fixture!.y[nazwa]);

        expect(
          roznica,
          `${id}/${nazwa}: rozjazd ${roznica.toExponential(2)} względem ${fixture!.solver}`,
        ).toBeLessThan(tolerancja);
      }
    });
  }

  it('fixtures są obecne — inaczej cross-walidacja tylko udaje, że działa', () => {
    // Brakujący fixture ucisza testy powyżej przez `skipIf`. Bez tego
    // sprawdzenia zielony przebieg nie znaczyłby nic.
    const brakujace = UKLADY.filter(({ id }) => !wczytajFixture(id)).map(({ id }) => id);

    expect(
      brakujace,
      `Brak odniesień: ${brakujace.join(', ')}. Wygeneruj je poleceniem `
      + '`node validation/generate-fixtures.mjs <python-ze-scipy>`.',
    ).toEqual([]);
  });
});
