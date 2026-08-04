/**
 * revisionSource.ts — z czego powstaje plan powtórek.
 *
 * `planRevision` w `sci-core` wie, **jak** wybrać pozycje; ta warstwa wie,
 * **co** w tej bazie jest czym. Podział wynika z układu katalogów książki,
 * a nie z osobnego rejestru: `Pytania.md` to pytania, `Zadania.md` to zadania,
 * `Prawa.md` i `Slownik.md` to materiał na test, reszta to podrozdziały do
 * czytania. Rejestr byłby drugim źródłem tej samej prawdy i rozjechałby się
 * przy pierwszym nowym rozdziale.
 *
 * `PLAN.md` wypada świadomie — to nasze notatki o przenoszeniu książki,
 * nie materiał do nauki.
 */
import type { KnowledgeIndex, RevisionSource, RevisionCandidate } from '@mhersztowski/sci-core';

const NAZWA = (path: string) => path.split('/').pop() ?? path;

/** Dokumenty pomocnicze — nie są materiałem do czytania. */
const POMOCNICZE = new Set(['PLAN.md', 'Slownik.md', 'Prawa.md', 'Pytania.md', 'Zadania.md']);

/** Tytuł do listy: z nagłówka dokumentu, a w jego braku z nazwy pliku. */
function tytul(index: KnowledgeIndex, path: string): string {
  const d = index.documents.find((x) => x.path === path);
  return d?.meta.title ?? NAZWA(path).replace(/\.md$/, '');
}

export function buildRevisionSource(index: KnowledgeIndex): RevisionSource {
  const subsections: RevisionCandidate[] = [];
  const questions: RevisionCandidate[] = [];
  const exercises: RevisionCandidate[] = [];
  const test: RevisionCandidate[] = [];

  for (const dokument of index.documents) {
    const nazwa = NAZWA(dokument.path);

    if (nazwa === 'PLAN.md') continue;

    if (nazwa === 'Pytania.md') {
      questions.push({ path: dokument.path, title: tytul(index, dokument.path) });
      continue;
    }

    if (nazwa === 'Zadania.md') {
      for (const zadanie of dokument.exercises) {
        exercises.push({
          path: dokument.path,
          id: zadanie.id,
          // Numer zadania niesie identyfikator (`rh1-zad-15-7`), więc etykieta
          // powstaje z niego, a nie z treści — treść bywa akapitem.
          title: `Zadanie ${zadanie.id.split('-').pop()}`,
        });
      }
      continue;
    }

    if (nazwa === 'Prawa.md') {
      // Pozycja bez treści czeka na przeniesienie rozdziału — nie ma z czego
      // ułożyć pytania, więc do testu nie wchodzi.
      for (const prawo of dokument.laws) {
        if (prawo.awaiting) continue;
        test.push({ path: dokument.path, id: prawo.id, title: prawo.title });
      }
      continue;
    }

    if (nazwa === 'Slownik.md') {
      for (const haslo of dokument.terms) {
        if (!haslo.definition) continue;
        test.push({ path: dokument.path, id: haslo.id, title: haslo.term });
      }
      continue;
    }

    if (!POMOCNICZE.has(nazwa)) {
      subsections.push({ path: dokument.path, title: tytul(index, dokument.path) });
    }
  }

  return { subsections, questions, exercises, test };
}
