/**
 * documentModel.ts — z dokumentu do modelu zjawiska.
 *
 * Tu domyka się teza raportu: blok `sim` nie opisuje symulacji, tylko **wskazuje
 * wzory, które już stoją w tekście**. Model powstaje ze skanu dokumentu, więc
 * poprawienie wzoru w wykładzie zmienia symulację niżej — nie ma dwóch źródeł
 * prawdy, bo nie ma drugiego miejsca, w którym fizyka jest zapisana.
 *
 * Skan jest tekstowy (bloki ``` w markdownie), bo dokument jest plikiem, a nie
 * strukturą edytora. To samo wejście obsłuży skan całego VFS, gdy przyjdzie
 * czas na indeks wzorów z sekcji 3.6.
 */
import {
  applyOverrides, buildGraph, compileGraph, parseFormulaBlock,
  type FormulaBlock, type PhenomenonModel,
} from '@mhersztowski/sci-core';

/** Ustawienia bloku `sim` — treść bloku jest zwykłym JSON-em. */
export interface SimSpec {
  /** Widoki do pokazania; brak = wybór domyślny z rodzaju wielkości. */
  view?: string[];
  /** Parametry wystawione czytelnikowi jako suwaki; brak = wszystkie. */
  expose?: string[];
  /** Koniec przedziału czasu symulacji w sekundach. */
  duration?: number;
  /** Nadpisania wartości parametrów, z jednostkami: `{"L": "1 m"}`. */
  [param: string]: unknown;
}

/** Znajduje bloki ```formula:id w treści dokumentu. */
export function scanFormulas(markdown: string): FormulaBlock[] {
  const blocks: FormulaBlock[] = [];
  const fence = /```formula:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;

  let match = fence.exec(markdown);
  while (match) {
    blocks.push(parseFormulaBlock(match[1], match[2]));
    match = fence.exec(markdown);
  }
  return blocks;
}

export interface SimSetup {
  model: PhenomenonModel;
  /** Wartości startowe parametrów w SI. */
  values: Record<string, number>;
  /** Parametry, które ma zobaczyć czytelnik. */
  exposed: string[];
  spec: SimSpec;
  issues: string[];
}

/**
 * Buduje model dla bloku `sim` na podstawie wzorów z tego samego dokumentu.
 *
 * Błędy nie przerywają budowy: dokument z jedną literówką ma się wyświetlić i
 * pokazać, co jest nie tak. Pusty ekran nie mówi nic.
 */
export function buildSimSetup(source: string | FormulaBlock[], simBody: string): SimSetup {
  const issues: string[] = [];

  let spec: SimSpec = {};
  const trimmed = simBody.trim();
  if (trimmed) {
    try {
      spec = JSON.parse(trimmed) as SimSpec;
    } catch (error) {
      issues.push(`Ustawienia bloku nie są poprawnym JSON-em: ${(error as Error).message}`);
    }
  }

  // Wejściem jest albo tekst dokumentu (skan VFS), albo gotowe bloki wyjęte
  // przez hosta z jego własnej struktury — edytor ma je pod ręką i nie musi
  // konwertować całego dokumentu do markdownu przy każdym renderze.
  const formulas = typeof source === 'string' ? scanFormulas(source) : source;
  if (!formulas.length) issues.push('W dokumencie nie ma żadnego bloku ```formula — nie ma z czego zbudować symulacji.');

  const model = compileGraph(buildGraph(formulas));
  issues.push(...model.issues);

  // Wszystko, co nie jest znanym ustawieniem, jest nadpisaniem parametru.
  const reserved = new Set(['view', 'expose', 'duration']);
  const overrides = Object.fromEntries(
    Object.entries(spec).filter(([key]) => !reserved.has(key)),
  ) as Record<string, string | number>;

  const applied = applyOverrides(model, overrides);
  issues.push(...applied.issues);

  const exposed = spec.expose?.length
    ? spec.expose.filter((name) => model.parameters.some((p) => p.name === name))
    : model.parameters.map((p) => p.name);

  return { model, values: applied.values, exposed, spec, issues };
}
