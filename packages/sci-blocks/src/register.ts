/**
 * register.ts — wpięcie bloków do edytora hosta.
 *
 * Pakiet nie zna MdEditora: dostaje funkcję rejestrującą i sam mówi, które
 * infostringi obsługuje. Dzięki temu ta sama para bloków zadziała w innym
 * edytorze, który zaoferuje ten sam kontrakt.
 */
import { createElement, type ComponentType, type ReactNode } from 'react';
import { parseFormulaBlock } from '@mhersztowski/sci-core';
import { BlockShell } from './BlockShell';
import { ExerciseBlock } from './ExerciseBlock';
import { FieldBlock } from './FieldBlock';
import { LinAlgBlock } from './LinAlgBlock';
import { ProcedureBlock } from './ProcedureBlock';
import { ScriptBlock } from './ScriptBlock';
import { FormulaBlockView } from './FormulaBlockView';
import { SimBlock } from './SimBlock';
import { FigureBlock } from './FigureBlock';
import { TableBlock } from './TableBlock';
import { CalloutBlock } from './CalloutBlock';
import { LawBlock } from './LawBlock';
import type { InkRecognizer } from './InkCanvas';

/**
 * Rozpoznawanie pisma rysikiem, wstrzykiwane przez hosta.
 *
 * Moduł, nie prop: renderery bloków dostają od edytora tylko `code` i
 * `language`, a przeciąganie portu przez cały ten kontrakt zmusiłoby każdego
 * hosta do wiedzy o piórze. Ustawia go aplikacja przy starcie; brak = bloki
 * działają jak dotąd, bez zakładki pióra.
 */
let rozpoznawaniePisma: InkRecognizer | undefined;

export function setInkRecognizer(recognizer: InkRecognizer | undefined): void {
  rozpoznawaniePisma = recognizer;
}

/** Kontrakt widoku bloku po stronie hosta — celowo opisany tu, nie importowany. */
export interface HostBlockRendererProps {
  code: string;
  language: string;
  /** Fabryka workera obliczeń; brak = liczenie w wątku interfejsu. */
  workerFactory?: () => Worker;
  onChange?: (next: string) => void;
  /**
   * Zapis treści **innego** bloku dokumentu, wskazanego infostringiem.
   *
   * Potrzebne blokom, które sterują czymś zapisanym gdzie indziej: rysunek
   * warunku początkowego powstaje w bloku `field`, ale należy do `formula`.
   */
  onBlockChange?: (language: string, next: string) => void;
  documentBlocks?: () => Array<{ language: string; code: string }>;
  children: () => ReactNode;
}

export interface HostBlockRenderer {
  name: string;
  matches: (language: string) => boolean;
  Component: ComponentType<HostBlockRendererProps>;
}

/** Infostring `formula:id` → identyfikator wzoru. */
export const FORMULA_LANG = /^formula:([A-Za-z0-9_-]+)$/;
/** Infostring `sim` albo `sim:cokolwiek` — nazwa po dwukropku jest tylko etykietą. */
export const SIM_LANG = /^sim(?::([A-Za-z0-9_-]+))?$/;
/** Infostring `exercise:id`. */
export const EXERCISE_LANG = /^exercise:([A-Za-z0-9_-]+)$/;
const FIELD_LANG = /^field(:|$)/;
const LINALG_LANG = /^linalg(:|$)/;
const PROCEDURE_LANG = /^procedure(:|$)/;
export const FIGURE_LANG = /^figure(:|$)/;
export const TABLE_LANG = /^table(:|$)/;
export const CALLOUT_LANG = /^callout(:|$)/;
export const LAW_LANG = /^law(:|$)/;
/** Infostring `simscript` albo `simscript:etykieta` — model pisany w dokumencie. */
export const SIMSCRIPT_LANG = /^simscript(?::([A-Za-z0-9_-]+))?$/;

/**
 * Każdy blok dostaje ramkę z przełącznikiem Widok / Kod.
 *
 * Bez niej autor mógłby poprawić wzór tylko w pliku — a pętla „edytuję i widzę"
 * jest powodem, dla którego całość mieszka w MdEditorze.
 */
function FormulaRenderer({ code, language, children, onChange }: HostBlockRendererProps) {
  const id = FORMULA_LANG.exec(language)?.[1] ?? 'bez-nazwy';
  return createElement(BlockShell, {
    kind: 'wzór',
    accent: '#2563eb',
    id,
    children,
    // Zapis włącza wizualną edycję matematyki. W trybie czytania (`ReaderView`,
    // eksport statyczny) nie ma go wcale i wzory pozostają nieklikalne.
    view: createElement(FormulaBlockView, {
      id, code, bare: true, onChange, recognizeInk: rozpoznawaniePisma,
    }),
  });
}

/** Wzory dokumentu — wspólne dla bloków `sim` i `exercise`. */
function formulasOf(documentBlocks?: () => Array<{ language: string; code: string }>) {
  return (documentBlocks?.() ?? [])
    .map((block) => {
      const id = FORMULA_LANG.exec(block.language)?.[1];
      return id ? parseFormulaBlock(id, block.code) : undefined;
    })
    .filter((block): block is NonNullable<typeof block> => !!block);
}

function ExerciseRenderer({ code, language, documentBlocks, children }: HostBlockRendererProps) {
  const id = EXERCISE_LANG.exec(language)?.[1] ?? 'bez-nazwy';
  return createElement(BlockShell, {
    kind: 'zadanie',
    accent: '#7c3aed',
    id,
    children,
    view: createElement(ExerciseBlock, {
      id, code, formulas: formulasOf(documentBlocks), bare: true,
      recognizeInk: rozpoznawaniePisma,
    }),
  });
}

/**
 * Blok `field` — uruchamia równanie pola opisane w bloku `formula` z `@pde`.
 *
 * Wzoru szukamy wśród bloków dokumentu po identyfikatorze z infostringu, tak
 * jak `sim` szuka grafu wzorów. Bez tego autor musiałby powtórzyć całe równanie
 * w miejscu uruchomienia.
 */
function FieldRenderer({
  code, language, documentBlocks, children, onBlockChange,
}: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'pole';
  const wzor = (documentBlocks?.() ?? [])
    .find((b) => b.language === `formula:${id}` && /^\s*@pde\b/m.test(b.code));

  return createElement(BlockShell, {
    kind: 'pole',
    accent: '#0ea5e9',
    id,
    children,
    view: wzor
      ? createElement(FieldBlock, {
        id,
        code: wzor.code,
        setup: parseFieldSetup(code),
        bare: true,
        // Rysunek jest warunkiem początkowym, więc wraca do bloku ze wzorem —
        // host musi umieć zapisać **inny** blok niż ten, który renderuje.
        onFormulaChange: onBlockChange && ((next: string) => onBlockChange(`formula:${id}`, next)),
      })
      : createElement('div', { style: { fontSize: 12, color: '#b91c1c' } },
        `Nie ma wzoru pola „${id}" w tym dokumencie. Wzór to blok formula:${id} z dyrektywą @pde.`),
  });
}

/** Nastawy bloku pola — parametry płasko obok `duration` i `frames`. */
function parseFieldSetup(code: string) {
  try {
    const { duration, frames, ...values } = JSON.parse(code || '{}') as Record<string, number>;
    return { duration, frames, values };
  } catch {
    return undefined;
  }
}

/** Blok `linalg` — scena przekształcenia opisanego w bloku `formula` z `@linalg`. */
function LinAlgRenderer({ code, language, documentBlocks, children }: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'scena';
  const wzor = (documentBlocks?.() ?? [])
    .find((b) => b.language === `formula:${id}` && /^\s*@linalg\b/m.test(b.code));

  return createElement(BlockShell, {
    kind: 'algebra',
    accent: '#a855f7',
    id,
    children,
    view: wzor
      ? createElement(LinAlgBlock, { id, code: wzor.code, setup: parseStageSetup(code), bare: true })
      : createElement('div', { style: { fontSize: 12, color: '#b91c1c' } },
        `Nie ma sceny algebry „${id}" w tym dokumencie. Scena to blok formula:${id} z dyrektywą @linalg.`),
  });
}

/** Nastawy sceny algebry — co pokazać obok przekształcenia. */
function parseStageSetup(code: string) {
  try {
    return JSON.parse(code || '{}') as { eigen?: boolean; extent?: number; unitSquare?: boolean };
  } catch {
    return undefined;
  }
}

/**
 * Blok `figure` — rysunek z podręcznika.
 *
 * Bez tego edytor traktował `figure` jak nieznany język i wyrzucał na ekran
 * kilkadziesiąt kilobajtów base64 zamiast obrazu.
 */
function FigureRenderer({ code, language, children, onChange }: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'rysunek';
  return createElement(BlockShell, {
    kind: 'rysunek',
    accent: '#7c3aed',
    id,
    children,
    // Zapis włącza kontrolkę szerokości. W trybie czytania i w eksporcie
    // statycznym hosta nie ma, więc rysunek zostaje sam.
    view: createElement(FigureBlock, { id, code, onChange }),
  });
}

/** Blok `table` — tablica z podręcznika. */
function TableRenderer({ code, language, children }: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'tablica';
  return createElement(BlockShell, {
    kind: 'tablica',
    accent: '#c2410c',
    id,
    children,
    view: createElement(TableBlock, { id, code }),
  });
}

/**
 * Blok `callout` — notka kontekstowa, jedyna nasza treść w dokumencie.
 *
 * Bez rejestracji edytor pokazałby ją jako nieznany język, czyli dokładnie tak
 * samo jak treść książki w bloku kodu — a wtedy zniknęłaby jedyna rzecz, która
 * odróżnia nasz dopisek od Resnicka.
 */
function CalloutRenderer({ code, language, children }: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'notka';
  return createElement(BlockShell, {
    kind: 'notka',
    accent: '#0369a1',
    id,
    children,
    view: createElement(CalloutBlock, { id, code }),
  });
}

/** Blok `law` — pozycja katalogu praw i zasad książki. */
function LawRenderer({ code, language, children }: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'prawo';
  return createElement(BlockShell, {
    kind: 'prawo',
    accent: '#0f766e',
    id,
    children,
    view: createElement(LawBlock, { id, code }),
  });
}

/** Blok `procedure` — eliminacja Gaussa albo Gram-Schmidt krok po kroku. */
function ProcedureRenderer({ code, language, children }: HostBlockRendererProps) {
  const id = language.split(':')[1] ?? 'procedura';
  return createElement(BlockShell, {
    kind: 'procedura',
    accent: '#0d9488',
    id,
    children,
    view: createElement(ProcedureBlock, { id, code, bare: true }),
  });
}

function ScriptRenderer({ code, onChange, children, workerFactory }: HostBlockRendererProps) {
  return createElement(BlockShell, {
    kind: 'model w skrypcie',
    accent: '#0ea5e9',
    children,
    view: createElement(ScriptBlock, { code, onChange, bare: true, workerFactory }),
  });
}

function SimRenderer({ code, onChange, documentBlocks, children, workerFactory }: HostBlockRendererProps) {
  // Wzory bierzemy z bloków dokumentu dostarczonych przez hosta; parsujemy je
  // tutaj, bo to `sci-core` wie, co znaczy blok `formula`.
  return createElement(BlockShell, {
    kind: 'symulacja',
    accent: '#059669',
    children,
    view: createElement(SimBlock, { code, formulas: formulasOf(documentBlocks), onChange, bare: true, workerFactory }),
  });
}

/**
 * Rejestruje bloki `formula` i `sim` w edytorze hosta.
 *
 * Zwraca funkcję wyrejestrowującą — przydatną w testach i przy przeładowaniu
 * modułu w trybie dev.
 */
export function registerSciBlocks(
  register: (renderer: HostBlockRenderer) => () => void,
): () => void {
  const off = [
    register({ name: 'sci-formula', matches: (l) => FORMULA_LANG.test(l), Component: FormulaRenderer }),
    register({ name: 'sci-sim', matches: (l) => SIM_LANG.test(l), Component: SimRenderer }),
    register({ name: 'sci-exercise', matches: (l) => EXERCISE_LANG.test(l), Component: ExerciseRenderer }),
    register({ name: 'sci-simscript', matches: (l) => SIMSCRIPT_LANG.test(l), Component: ScriptRenderer }),
    register({ name: 'sci-field', matches: (l) => FIELD_LANG.test(l), Component: FieldRenderer }),
    register({ name: 'sci-linalg', matches: (l) => LINALG_LANG.test(l), Component: LinAlgRenderer }),
    register({ name: 'sci-procedure', matches: (l) => PROCEDURE_LANG.test(l), Component: ProcedureRenderer }),
    register({ name: 'sci-figure', matches: (l) => FIGURE_LANG.test(l), Component: FigureRenderer }),
    register({ name: 'sci-table', matches: (l) => TABLE_LANG.test(l), Component: TableRenderer }),
    register({ name: 'sci-callout', matches: (l) => CALLOUT_LANG.test(l), Component: CalloutRenderer }),
    register({ name: 'sci-law', matches: (l) => LAW_LANG.test(l), Component: LawRenderer }),
  ];
  return () => off.forEach((fn) => fn());
}
