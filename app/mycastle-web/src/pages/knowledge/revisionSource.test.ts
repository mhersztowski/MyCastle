import { describe, it, expect } from 'vitest';
import { buildIndex } from '@mhersztowski/sci-core';
import { buildRevisionSource } from './revisionSource';

const dok = (path: string, markdown: string) => ({ path, markdown });

const baza = buildIndex([
  dok('book/K/03/03-01-mechanika.md', '---\ntitle: Mechanika\n---\n# 3-1\ntreść'),
  dok('book/K/03/03-02-kinematyka.md', '---\ntitle: Kinematyka\n---\n# 3-2\ntreść'),
  dok('book/K/03/Pytania.md', '---\ntitle: Pytania 3\n---\n1. Dlaczego?'),
  dok('book/K/03/Zadania.md', [
    '---', 'title: Zadania 3', '---',
    '```exercise:rh1-zad-3-1', 'Treść zadania.', '@expected 1 m', '```',
    '```exercise:rh1-zad-3-2', 'Druga treść.', '@expected 2 m', '```',
  ].join('\n')),
  dok('book/K/Prawa.md', [
    '```law:rh1-prawo-hooke', "Prawo Hooke'a", '@statement Siła jest proporcjonalna.',
    '@chapter 15', '@source 15-2, s. 349', '```',
    '```law:rh1-prawo-pascal', 'Prawo Pascala', '@chapter 17', '@source 17-5, s. 432', '```',
  ].join('\n')),
  dok('book/K/Slownik.md', [
    '```term:rh1-poj-okres', 'Okres', '@definition Czas jednego drgnięcia.', '```',
    '```term:rh1-poj-bezdef', 'Bez definicji', '```',
  ].join('\n')),
  dok('book/PLAN.md', '---\ntitle: Plan\n---\nnasze notatki'),
  dok('mechanika/rzut.md', '---\ntitle: Rzut ukośny\n---\ntreść'),
]);

describe('źródło powtórek z indeksu bazy', () => {
  it('podrozdziały to dokumenty wykładowe, także spoza książki', () => {
    const s = buildRevisionSource(baza);
    expect(s.subsections.map((x) => x.title).sort())
      .toEqual(['Kinematyka', 'Mechanika', 'Rzut ukośny']);
  });

  // PLAN.md to nasze notatki o przenoszeniu książki, nie materiał do nauki.
  it('PLAN.md nie jest materiałem do czytania', () => {
    expect(JSON.stringify(buildRevisionSource(baza))).not.toContain('PLAN.md');
  });

  it('pytania idą dokumentem, bo nie mają identyfikatorów pozycji', () => {
    const s = buildRevisionSource(baza);
    expect(s.questions).toEqual([{ path: 'book/K/03/Pytania.md', title: 'Pytania 3' }]);
  });

  it('zadania wchodzą pojedynczo, po identyfikatorze bloku', () => {
    const s = buildRevisionSource(baza);
    expect(s.exercises.map((x) => x.id)).toEqual(['rh1-zad-3-1', 'rh1-zad-3-2']);
    expect(s.exercises[0].title).toBe('Zadanie 1');
    expect(s.exercises[0].path).toBe('book/K/03/Zadania.md');
  });

  /**
   * Prawo bez treści czeka na przeniesienie rozdziału, hasło bez definicji jest
   * niedokończone — z żadnego nie da się ułożyć pytania, więc do testu nie wchodzą.
   */
  it('do testu wchodzi tylko materiał, z którego da się zapytać', () => {
    const s = buildRevisionSource(baza);
    expect(s.test.map((x) => x.id)).toEqual(['rh1-prawo-hooke', 'rh1-poj-okres']);
  });

  it('test miesza prawa i hasła w jednej puli', () => {
    const s = buildRevisionSource(baza);
    expect(new Set(s.test.map((x) => x.path)))
      .toEqual(new Set(['book/K/Prawa.md', 'book/K/Slownik.md']));
  });

  it('pusta baza daje puste źródło, a nie awarię', () => {
    const puste = buildRevisionSource(buildIndex([]));
    expect(puste).toEqual({ subsections: [], questions: [], exercises: [], test: [] });
  });
});
