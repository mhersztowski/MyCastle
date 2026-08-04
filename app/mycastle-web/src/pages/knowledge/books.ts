/**
 * books.ts — książki obok ścieżki nauki.
 *
 * Podręcznik przepisany do bazy to setki podrozdziałów. Wrzucone do jednego
 * worka z materiałem autorskim zalewają wszystko: katalog przestaje pokazywać,
 * czego się uczyć, a graf prerekwizytów robi się nieczytelny — bo rozdziały
 * książki mają **własną kolejność, tę z druku**, a nie tę z nauki. Jedno i
 * drugie jest prawdziwe i jedno drugiego nie zastępuje.
 *
 * Stąd podział: materiał autorski buduje ścieżkę nauki, książki dostają osobną
 * sekcję z drzewem katalogów **takim, jak na dysku**. Drzewo jest domyślnie
 * zwinięte, bo rozwinięte byłoby tą samą ścianą tekstu, przed którą ten podział
 * ma bronić.
 */

/** Katalog, w którym leżą przepisane książki — względem katalogu bazy. */
export const BOOKS_DIR = 'book';

export interface LibraryFile {
  path: string;
  markdown: string;
}

/**
 * Czy dokument należy do książki.
 *
 * Ukośnik jest istotny: `booklet/` i `bookmarks.md` zaczynają się tak samo,
 * a z książkami nie mają nic wspólnego.
 */
export function isBookPath(path: string): boolean {
  return path === BOOKS_DIR || path.startsWith(`${BOOKS_DIR}/`);
}

/** Rozdziela bibliotekę na materiał do nauki i na książki. */
export function splitLibrary<T extends LibraryFile>(files: T[]): { learning: T[]; books: T[] } {
  return {
    learning: files.filter((f) => !isBookPath(f.path)),
    books: files.filter((f) => isBookPath(f.path)),
  };
}

/** Tytuł z nagłówka pliku; `undefined`, gdy dokument go nie ma. */
export function bookTitle(markdown: string): string | undefined {
  const naglowek = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!naglowek) return undefined;
  return /^title:\s*(.+)$/m.exec(naglowek[1])?.[1]?.trim() || undefined;
}

export interface BookNode {
  /** Nazwa katalogu albo pliku — to, co widać w drzewie. */
  name: string;
  /** Ścieżka dokumentu; tylko dla liści. */
  path?: string;
  /** Tytuł z nagłówka; dla liści, gdy jest. */
  title?: string;
  children: BookNode[];
  /**
   * Ile dokumentów leży w tej gałęzi.
   *
   * Potrzebne właśnie przy **zwiniętym** drzewie: „Resnick (247)" mówi
   * czytelnikowi, czego się spodziewać, zanim cokolwiek rozwinie.
   */
  count: number;
}

/**
 * Buduje drzewo katalogów z płaskiej listy ścieżek.
 *
 * Układ bierzemy z dysku, a nie z metadanych: książka jest już poukładana przez
 * tego, kto ją przepisywał, a każda inna kolejność byłaby zgadywaniem. Katalogi
 * i pliki sortujemy alfabetycznie — numeracja rozdziałów w nazwach plików robi
 * resztę.
 */
export function buildBookTree(files: LibraryFile[]): BookNode[] {
  const korzen: BookNode = { name: '', children: [], count: 0 };

  for (const plik of files) {
    // Pierwszy człon to sam katalog książek — drzewo zaczyna się od książek.
    const czesci = plik.path.split('/').slice(1);
    if (!czesci.length) continue;

    let wezel = korzen;
    czesci.forEach((czesc, i) => {
      const liść = i === czesci.length - 1;
      let dziecko = wezel.children.find((c) => c.name === czesc);
      if (!dziecko) {
        dziecko = { name: czesc, children: [], count: 0 };
        wezel.children.push(dziecko);
      }
      if (liść) {
        dziecko.path = plik.path;
        dziecko.title = bookTitle(plik.markdown);
      }
      wezel = dziecko;
    });
  }

  const policz = (wezel: BookNode): number => {
    if (wezel.path) { wezel.count = 1; return 1; }
    wezel.children.sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true }));
    wezel.count = wezel.children.reduce((suma, c) => suma + policz(c), 0);
    return wezel.count;
  };
  policz(korzen);

  return korzen.children;
}

/** Tagi z nagłówka dokumentu. */
function tagsOf(markdown: string): string[] {
  const naglowek = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!naglowek) return [];

  const linia = /^tags:\s*\[(.*)\]\s*$/m.exec(naglowek[1])?.[1];
  if (!linia) return [];
  return linia.split(',').map((t) => t.trim()).filter(Boolean);
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Tagi występujące w **jednej** książce, z liczbą dokumentów.
 *
 * Osobno dla każdej książki, a nie dla całej bazy: „drgania" u Resnicka i
 * „drgania" u Feynmana to ten sam wyraz o innym zakresie, a lista tagów ma
 * pomagać w przeglądaniu tej książki, którą czytelnik ma otwartą. Do funkcji
 * trafiają więc dokumenty jednej książki — wybór należy do wołającego.
 *
 * Kolejność: najpierw najczęstsze, przy remisie alfabetycznie. Tag obejmujący
 * całą książkę (`resnick-halliday`) wypada wtedy na początku i to jest uczciwe:
 * mówi, że nie zawęża niczego.
 */
export function bookTags(files: LibraryFile[]): TagCount[] {
  const liczniki = new Map<string, number>();
  for (const plik of files) {
    for (const tag of tagsOf(plik.markdown)) {
      liczniki.set(tag, (liczniki.get(tag) ?? 0) + 1);
    }
  }

  return [...liczniki.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pl'));
}

/** Do porównań: bez wielkości liter i bez ogonków — „wahadlo" ma znaleźć „wahadło". */
function znormalizuj(tekst: string): string {
  return tekst.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

export interface BookFilter {
  /** Tagi, które dokument musi mieć **wszystkie**. */
  tags?: string[];
  /** Szukany tekst — w tytule i w treści. */
  query?: string;
}

/**
 * Zawęża dokumenty książki do tych, które pasują do filtru.
 *
 * Kilka tagów działa jak **i**, nie jak **lub**: tagi w tej bazie są
 * uzupełniające („drgania" + „zadania"), więc dołożenie drugiego ma zawężać.
 * Suma dawałaby wtedy więcej wyników niż przed dołożeniem — czyli odwrotność
 * tego, czego oczekuje ktoś, kto klika drugi tag.
 */
export function filterBooks<T extends LibraryFile>(files: T[], filter: BookFilter): T[] {
  const tagi = filter.tags?.filter(Boolean) ?? [];
  const szukane = filter.query?.trim() ? znormalizuj(filter.query) : undefined;

  return files.filter((plik) => {
    if (tagi.length) {
      const wlasne = tagsOf(plik.markdown);
      if (!tagi.every((tag) => wlasne.includes(tag))) return false;
    }
    if (!szukane) return true;

    // Szukamy w całej treści, nie tylko w tytule: podrozdział bywa zatytułowany
    // ogólnie („Zastosowania"), a szukane pojęcie stoi w środku wykładu.
    return znormalizuj(`${bookTitle(plik.markdown) ?? ''}\n${plik.markdown}`).includes(szukane);
  });
}
