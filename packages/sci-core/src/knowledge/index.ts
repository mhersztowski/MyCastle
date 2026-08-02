/**
 * knowledge/index.ts — indeks bazy wiedzy ze skanu dokumentów.
 *
 * Kierunek z raportu (3.6): **dokument jest źródłem prawdy, a rejestr wzorów to
 * indeks budowany ze skanowania**. Nie ma osobnej bazy, do której dokumenty się
 * odwołują — jest skan plików i to, co z niego wynika.
 *
 * Skan daje trzy rzeczy, których pojedynczy dokument nie zna:
 *
 *  • **Walidację globalną.** Duplikat identyfikatora wzoru między dokumentami
 *    jest błędem tak samo jak w jednym pliku — tylko widać go dopiero z góry.
 *  • **Powiązania.** `@derivedFrom` sięgające do innego dokumentu buduje graf
 *    wiedzy; `@uses` w zadaniu wpina je w ten sam graf.
 *  • **Katalog.** Lista tematów, prerekwizytów i zadań powstaje sama, więc nie
 *    ma czego aktualizować ręcznie.
 */
import { parseFormulaBlock, type FormulaBlock } from '../formula/parseFormula';
import { parseExerciseBlock, type ExerciseBlock } from '../exercise/parseExercise';

/** Nagłówek YAML dokumentu — tagi, prerekwizyty, tytuł. */
export interface DocumentMeta {
  title?: string;
  tags: string[];
  /** Tematy, które warto poznać wcześniej — z nich powstaje DAG nauki. */
  requires: string[];
}

export interface KnowledgeDocument {
  /** Ścieżka pliku — identyfikator dokumentu w bazie. */
  path: string;
  meta: DocumentMeta;
  formulas: FormulaBlock[];
  exercises: ExerciseBlock[];
  /** Bloki `sim` — po nich widać, które dokumenty mają symulację z grafu. */
  simCount: number;
  /** Bloki `simscript` — model pisany wprost w dokumencie. */
  scriptCount: number;
}

export interface KnowledgeIssue {
  message: string;
  path?: string;
  formulaId?: string;
}

export interface KnowledgeIndex {
  documents: KnowledgeDocument[];
  /** Wzór → dokument, w którym mieszka. */
  formulaHome: Map<string, string>;
  issues: KnowledgeIssue[];
}

const FORMULA_FENCE = /```formula:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;
const EXERCISE_FENCE = /```exercise:([A-Za-z0-9_-]+)\n([\s\S]*?)```/g;
const SIM_FENCE = /```sim(?::[A-Za-z0-9_-]+)?\n[\s\S]*?```/g;
const SCRIPT_FENCE = /```simscript(?::[A-Za-z0-9_-]+)?\n[\s\S]*?```/g;

/**
 * Czyta nagłówek YAML z początku pliku.
 *
 * Świadomie własny, minimalny odczyt zamiast biblioteki YAML: obsługujemy trzy
 * pola o znanym kształcie, a pełny parser wciągnąłby zależność po to, żeby
 * przeczytać listę słów. Nieznane pola pomijamy — dokument może mieć własne.
 */
export function parseFrontMatter(markdown: string): { meta: DocumentMeta; body: string } {
  const meta: DocumentMeta = { tags: [], requires: [] };
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!match) return { meta, body: markdown };

  for (const line of match[1].split('\n')) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim();
    const value = rest.join(':').trim();
    if (!value) continue;

    if (key === 'title') meta.title = value.replace(/^["']|["']$/g, '');
    else if (key === 'tags' || key === 'requires') {
      const list = value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
      meta[key] = list.filter(Boolean);
    }
  }

  return { meta, body: markdown.slice(match[0].length) };
}

/** Czyta jeden dokument: nagłówek, wzory, zadania. */
export function readDocument(path: string, markdown: string): KnowledgeDocument {
  const { meta, body } = parseFrontMatter(markdown);

  const formulas: FormulaBlock[] = [];
  for (const match of body.matchAll(FORMULA_FENCE)) {
    formulas.push(parseFormulaBlock(match[1], match[2]));
  }

  const exercises: ExerciseBlock[] = [];
  for (const match of body.matchAll(EXERCISE_FENCE)) {
    exercises.push(parseExerciseBlock(match[1], match[2]));
  }

  // Tytuł z nagłówka YAML, a w jego braku z pierwszego nagłówka markdown —
  // autor nie powinien pisać tytułu dwa razy.
  if (!meta.title) {
    const heading = /^#\s+(.+)$/m.exec(body);
    if (heading) meta.title = heading[1].trim();
  }

  return {
    path,
    meta,
    formulas,
    exercises,
    simCount: [...body.matchAll(SIM_FENCE)].length,
    scriptCount: [...body.matchAll(SCRIPT_FENCE)].length,
  };
}

/**
 * Buduje indeks z wielu dokumentów i sprawdza spójność całości.
 *
 * Błędy nie przerywają budowy — baza wiedzy z jednym zepsutym plikiem ma się
 * otworzyć i pokazać, który to plik.
 */
export function buildIndex(files: Array<{ path: string; markdown: string }>): KnowledgeIndex {
  const documents = files.map(({ path, markdown }) => readDocument(path, markdown));
  const issues: KnowledgeIssue[] = [];
  const formulaHome = new Map<string, string>();

  for (const document of documents) {
    for (const formula of document.formulas) {
      const previous = formulaHome.get(formula.id);
      if (previous) {
        issues.push({
          message: `Wzór „${formula.id}" jest zdefiniowany w dwóch dokumentach: ${previous} i ${document.path}.`,
          path: document.path,
          formulaId: formula.id,
        });
        continue;
      }
      formulaHome.set(formula.id, document.path);
    }
  }

  const documentPaths = new Set(documents.map((d) => d.path));
  const titles = new Map(documents.map((d) => [d.meta.title, d.path] as const));

  for (const document of documents) {
    for (const formula of document.formulas) {
      // Odniesienia sprawdzamy globalnie: wzór wolno wywieść z innego
      // dokumentu i to jest sedno grafu wiedzy.
      for (const reference of formula.derivedFrom) {
        if (!formulaHome.has(reference)) {
          issues.push({
            message: `Wzór „${formula.id}" wywodzi się z „${reference}", którego nie ma w całej bazie.`,
            path: document.path,
            formulaId: formula.id,
          });
        }
      }
    }

    for (const exercise of document.exercises) {
      for (const used of exercise.uses) {
        if (!formulaHome.has(used)) {
          issues.push({
            message: `Zadanie „${exercise.id}" odwołuje się do wzoru „${used}", którego nie ma w bazie.`,
            path: document.path,
          });
        }
      }
    }

    for (const required of document.meta.requires) {
      if (!documentPaths.has(required) && !titles.has(required)) {
        issues.push({
          message: `Dokument wymaga „${required}", którego nie ma w bazie.`,
          path: document.path,
        });
      }
    }
  }

  return { documents, formulaHome, issues };
}

/** Wszystkie zadania w bazie — katalog powstaje ze skanu, nie z ręcznej listy. */
export function allExercises(index: KnowledgeIndex): Array<{ path: string; exercise: ExerciseBlock }> {
  return index.documents.flatMap((document) => document.exercises.map((exercise) => ({ path: document.path, exercise })));
}

/** Zadania dotyczące danego wzoru — po `@uses`. */
export function exercisesFor(index: KnowledgeIndex, formulaId: string) {
  return allExercises(index).filter(({ exercise }) => exercise.uses.includes(formulaId));
}

/** Dokumenty oznaczone danym tagiem. */
export function documentsByTag(index: KnowledgeIndex, tag: string): KnowledgeDocument[] {
  return index.documents.filter((document) => document.meta.tags.includes(tag));
}

export interface LearningEdge {
  from: string;
  to: string;
  kind: 'requires' | 'derivedFrom';
}

/**
 * Krawędzie grafu wiedzy: prerekwizyty między dokumentami i wywody między
 * wzorami sprowadzone do dokumentów, w których mieszkają.
 *
 * Wywód w obrębie jednego dokumentu pomijamy — mówi o kolejności wewnątrz
 * wykładu, a nie o zależności między tematami, i zaśmieciłby graf pętlami.
 */
export function learningGraph(index: KnowledgeIndex): LearningEdge[] {
  const edges: LearningEdge[] = [];
  const byTitle = new Map(index.documents.map((d) => [d.meta.title, d.path] as const));

  for (const document of index.documents) {
    for (const required of document.meta.requires) {
      const from = byTitle.get(required) ?? required;
      edges.push({ from, to: document.path, kind: 'requires' });
    }

    for (const formula of document.formulas) {
      for (const reference of formula.derivedFrom) {
        const home = index.formulaHome.get(reference);
        if (!home || home === document.path) continue;
        if (edges.some((e) => e.from === home && e.to === document.path && e.kind === 'derivedFrom')) continue;
        edges.push({ from: home, to: document.path, kind: 'derivedFrom' });
      }
    }
  }

  return edges;
}
