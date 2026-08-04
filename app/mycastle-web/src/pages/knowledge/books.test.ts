/**
 * Książki obok ścieżki nauki.
 *
 * Podręcznik przepisany do bazy to setki podrozdziałów. Wrzucone do jednego
 * worka z materiałem autorskim zalewają wszystko: katalog przestaje pokazywać,
 * czego się uczyć, a graf prerekwizytów robi się nieczytelny — bo rozdziały
 * książki mają swoją własną kolejność, tę z druku, a nie tę z nauki.
 *
 * Dlatego książki mają osobną sekcję: **drzewo katalogów takie, jak na dysku**,
 * domyślnie zwinięte. Nie są elementami ścieżki nauki, ale dają się czytać.
 */
import { describe, it, expect } from 'vitest';
import { BOOKS_DIR, bookTags, bookTitle, buildBookTree, filterBooks, isBookPath, splitLibrary } from './books';

const PLIKI = [
  { path: 'wahadlo.md', markdown: '---\ntitle: Wahadło\n---\n' },
  { path: 'book/resnick-t1/2-3-skladowe.md', markdown: '---\ntitle: Składowe wektora\n---\n' },
  { path: 'book/resnick-t1/2-4-mnozenie.md', markdown: '---\ntitle: Mnożenie wektorów\n---\n' },
  { path: 'book/resnick-t1/15-1-ruch.md', markdown: '---\ntitle: Ruch harmoniczny\n---\n' },
  { path: 'book/feynman/1-atomy.md', markdown: '---\ntitle: Atomy w ruchu\n---\n' },
  { path: 'orbita.md', markdown: '---\ntitle: Orbita\n---\n' },
];

describe('rozpoznanie ścieżki książkowej', () => {
  it('wszystko w katalogu książek', () => {
    expect(isBookPath(`${BOOKS_DIR}/resnick-t1/2-3.md`)).toBe(true);
    expect(isBookPath(`${BOOKS_DIR}/x.md`)).toBe(true);
  });

  it('materiał autorski nie', () => {
    expect(isBookPath('wahadlo.md')).toBe(false);
    expect(isBookPath('mechanika/orbita.md')).toBe(false);
  });

  it('katalog o podobnej nazwie nie łapie się przez pomyłkę', () => {
    expect(isBookPath('booklet/x.md')).toBe(false);
    expect(isBookPath('bookmarks.md')).toBe(false);
  });
});

describe('podział biblioteki', () => {
  it('oddziela materiał do nauki od książek', () => {
    const { learning, books } = splitLibrary(PLIKI);

    expect(learning.map((f) => f.path)).toEqual(['wahadlo.md', 'orbita.md']);
    expect(books).toHaveLength(4);
  });

  /**
   * To jest sedno zmiany: indeks ścieżki nauki powstaje **tylko** z materiału
   * autorskiego. Gdyby brał też książki, graf prerekwizytów zalałoby kilkaset
   * podrozdziałów ułożonych w kolejności druku, a nie nauki.
   */
  it('książki nie trafiają do materiału, z którego liczy się ścieżkę', () => {
    const { learning } = splitLibrary(PLIKI);
    expect(learning.some((f) => f.path.startsWith(`${BOOKS_DIR}/`))).toBe(false);
  });
});

describe('drzewo książek', () => {
  const drzewo = () => buildBookTree(splitLibrary(PLIKI).books);

  it('pierwszy poziom to książki, czyli podkatalogi', () => {
    expect(drzewo().map((w) => w.name)).toEqual(['feynman', 'resnick-t1']);
  });

  /**
   * Kolejność jest **numeryczna, nie alfabetyczna**.
   *
   * Rozdział 2 stoi przed 15, choć „15" jest alfabetycznie wcześniej niż „2".
   * To jest kolejność druku — jedyna, jaką książka naprawdę ma.
   */
  it('podrozdziały idą w kolejności rozdziałów, nie alfabetu', () => {
    const resnick = drzewo().find((w) => w.name === 'resnick-t1')!;
    expect(resnick.children.map((c) => c.name)).toEqual([
      '2-3-skladowe.md', '2-4-mnozenie.md', '15-1-ruch.md',
    ]);
  });

  it('liść niesie ścieżkę do otwarcia i tytuł z nagłówka pliku', () => {
    const resnick = drzewo().find((w) => w.name === 'resnick-t1')!;
    const liść = resnick.children.find((c) => c.name === '2-3-skladowe.md')!;

    expect(liść.path).toBe('book/resnick-t1/2-3-skladowe.md');
    expect(liść.title).toBe('Składowe wektora');
  });

  it('radzi sobie z zagnieżdżeniem głębszym niż jeden poziom', () => {
    const drzewo = buildBookTree([
      { path: 'book/t1/rozdzial-2/2-1.md', markdown: '' },
      { path: 'book/t1/rozdzial-2/2-2.md', markdown: '' },
      { path: 'book/t1/rozdzial-3/3-1.md', markdown: '' },
    ]);

    const rozdzialy = drzewo[0].children;
    expect(rozdzialy.map((r) => r.name)).toEqual(['rozdzial-2', 'rozdzial-3']);
    expect(rozdzialy[0].children).toHaveLength(2);
  });

  it('liczy podrozdziały w gałęzi, żeby dało się to pokazać przy zwiniętym drzewie', () => {
    const resnick = drzewo().find((w) => w.name === 'resnick-t1')!;
    expect(resnick.count).toBe(3);
    expect(drzewo().find((w) => w.name === 'feynman')!.count).toBe(1);
  });
});

describe('tytuł dokumentu', () => {
  it('bierze się z nagłówka pliku', () => {
    expect(bookTitle('---\ntitle: Składowe wektora\n---\ntreść')).toBe('Składowe wektora');
  });

  it('bez nagłówka zostaje nazwa pliku — pusty tytuł byłby gorszy', () => {
    expect(bookTitle('zwykła treść')).toBeUndefined();
  });
});

describe('tagi w obrębie książki', () => {
  const KSIAZKA = [
    { path: 'book/rh-t1/2-3.md', markdown: '---\ntitle: Składowe\ntags: [resnick-halliday, wektory]\n---\n' },
    { path: 'book/rh-t1/2-4.md', markdown: '---\ntitle: Mnożenie\ntags: [resnick-halliday, wektory]\n---\n' },
    { path: 'book/rh-t1/15-1.md', markdown: '---\ntitle: Ruch harmoniczny\ntags: [resnick-halliday, drgania]\n---\n' },
    { path: 'book/rh-t1/15-zadania.md', markdown: '---\ntitle: Zadania\ntags: [resnick-halliday, drgania, zadania]\n---\n' },
  ];

  it('zbiera tagi z liczbą dokumentów', () => {
    expect(bookTags(KSIAZKA)).toEqual([
      { tag: 'resnick-halliday', count: 4 },
      { tag: 'drgania', count: 2 },
      { tag: 'wektory', count: 2 },
      { tag: 'zadania', count: 1 },
    ]);
  });

  it('tagi liczy się osobno dla każdej książki, nie dla całej bazy', () => {
    const dwie = [
      ...KSIAZKA,
      { path: 'book/feynman/1.md', markdown: '---\ntitle: Atomy\ntags: [feynman, atomy]\n---\n' },
    ];

    // Do funkcji trafiają dokumenty **jednej** książki — wybór należy do UI.
    expect(bookTags(dwie.filter((f) => f.path.startsWith('book/feynman/'))).map((t) => t.tag))
      .toEqual(['atomy', 'feynman']);
  });
});

describe('filtrowanie książki', () => {
  const KSIAZKA = [
    { path: 'book/rh-t1/2-3.md', markdown: '---\ntitle: Składowe wektora\ntags: [wektory]\n---\nRzut na osie.' },
    { path: 'book/rh-t1/15-1.md', markdown: '---\ntitle: Ruch harmoniczny\ntags: [drgania]\n---\nWahadło i sprężyna.' },
    { path: 'book/rh-t1/15-9.md', markdown: '---\ntitle: Drgania tłumione\ntags: [drgania, zadania]\n---\nOpór ośrodka.' },
  ];

  it('bez kryteriów zwraca wszystko', () => {
    expect(filterBooks(KSIAZKA, {})).toHaveLength(3);
  });

  it('po tagu zawęża do dokumentów z tym tagiem', () => {
    expect(filterBooks(KSIAZKA, { tags: ['drgania'] }).map((f) => f.path))
      .toEqual(['book/rh-t1/15-1.md', 'book/rh-t1/15-9.md']);
  });

  /**
   * Kilka tagów działa jak **i**, nie jak **lub**.
   *
   * Tagi w tej bazie są uzupełniające („drgania" + „zadania"), a nie
   * alternatywne — suma dawałaby po dołożeniu drugiego tagu **więcej** wyników,
   * co jest odwrotnością tego, czego oczekuje ktoś, kto zawęża.
   */
  it('dwa tagi zawężają, a nie poszerzają', () => {
    expect(filterBooks(KSIAZKA, { tags: ['drgania', 'zadania'] }).map((f) => f.path))
      .toEqual(['book/rh-t1/15-9.md']);
  });

  it('szuka w tytule', () => {
    expect(filterBooks(KSIAZKA, { query: 'harmoniczny' }).map((f) => f.path))
      .toEqual(['book/rh-t1/15-1.md']);
  });

  it('szuka też w treści, nie tylko w tytule', () => {
    expect(filterBooks(KSIAZKA, { query: 'sprężyna' }).map((f) => f.path))
      .toEqual(['book/rh-t1/15-1.md']);
  });

  it('nie rozróżnia wielkości liter ani polskich znaków w zapytaniu', () => {
    expect(filterBooks(KSIAZKA, { query: 'WAHADŁO' })).toHaveLength(1);
    expect(filterBooks(KSIAZKA, { query: 'wahadlo' })).toHaveLength(1);
  });

  it('tag i tekst działają razem', () => {
    expect(filterBooks(KSIAZKA, { tags: ['drgania'], query: 'opór' }).map((f) => f.path))
      .toEqual(['book/rh-t1/15-9.md']);
  });
});

describe('baza złożona wyłącznie z książek', () => {
  it('nie jest pusta — ma książki, choć nie ma materiału do nauki', () => {
    const same = [{ path: 'book/rh-t1/2-3.md', markdown: '---\ntitle: X\n---\n' }];
    const { learning, books } = splitLibrary(same);

    expect(learning).toHaveLength(0);
    expect(books).toHaveLength(1);
  });
});
