/**
 * Czytanie bazy wiedzy bez logowania.
 *
 * Katalog `drive/knowledge` jest publiczny, więc czytelnik nie potrzebuje konta,
 * żeby przeczytać podrozdział. Dotąd strona i tak wymagała zalogowania, bo
 * jedyną drogą do plików był klient MQTT — a ten potrzebuje sesji.
 *
 * Publiczna droga idzie po HTTP i jest **tylko do odczytu**: nie ma czym
 * zapisać postępów ani oznaczyć przeczytanego, i to jest właściwe — nie ma
 * czyich.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findKnowledgeOwnerOf, publicKnowledgeOwner, PUBLIC_FETCH_CONCURRENCY,
  readPublicDocument, readPublicKnowledge,
} from './publicKnowledge';

const DRZEWO = {
  name: 'knowledge', path: 'Minis/Users/ala/drive/knowledge', type: 'directory',
  children: [
    { name: 'wahadlo.md', path: 'Minis/Users/ala/drive/knowledge/wahadlo.md', type: 'file' },
    {
      name: 'book', path: 'Minis/Users/ala/drive/knowledge/book', type: 'directory',
      children: [
        { name: '2-3.md', path: 'Minis/Users/ala/drive/knowledge/book/2-3.md', type: 'file' },
      ],
    },
  ],
};

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

/** Serwer, który odpowiada drzewem i treścią plików. */
function serwer(pliki: Record<string, string> = {}) {
  const wywolania: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    wywolania.push(url);
    if (url.includes('list=1')) {
      return { ok: true, json: async () => ({ tree: DRZEWO }) } as Response;
    }
    const nazwa = decodeURIComponent(url.split('/knowledge/')[1] ?? '');
    if (pliki[nazwa] === undefined) return { ok: false, status: 404 } as Response;
    return { ok: true, text: async () => pliki[nazwa] } as Response;
  }));
  return wywolania;
}

describe('odczyt publiczny', () => {
  it('wczytuje wszystkie dokumenty z drzewa', async () => {
    serwer({ 'wahadlo.md': '# Wahadło', 'book/2-3.md': '# Składowe' });

    const pliki = await readPublicKnowledge('ala');
    expect(pliki.map((f) => f.path)).toEqual(['wahadlo.md', 'book/2-3.md']);
    expect(pliki[0].markdown).toBe('# Wahadło');
  });

  it('ścieżki są względne wobec katalogu bazy, tak samo jak przy odczycie z sesji', async () => {
    // Inaczej ten sam dokument miałby dwa różne identyfikatory zależnie od
    // tego, czy czytelnik był zalogowany — a od tego zależą odsyłacze.
    serwer({ 'book/2-3.md': '# X', 'wahadlo.md': '# Y' });

    const pliki = await readPublicKnowledge('ala');
    expect(pliki.every((f) => !f.path.startsWith('Minis/'))).toBe(true);
  });

  it('idzie przez publiczny adres, bez nagłówka autoryzacji', async () => {
    const wywolania = serwer({ 'wahadlo.md': '#', 'book/2-3.md': '#' });
    await readPublicKnowledge('ala');

    expect(wywolania[0]).toContain('/public/drive/users/ala/knowledge?list=1');
    expect(wywolania.some((u) => u.includes('/api/'))).toBe(false);
  });

  it('pomija plik, którego nie udało się pobrać, zamiast przerywać całość', async () => {
    // Jeden zepsuty plik nie może zabrać czytelnikowi całej biblioteki.
    serwer({ 'wahadlo.md': '# Wahadło' });

    const pliki = await readPublicKnowledge('ala');
    expect(pliki.map((f) => f.path)).toEqual(['wahadlo.md']);
  });

  it('brak katalogu kończy się jasnym błędem, nie pustą stroną', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    await expect(readPublicKnowledge('ala')).rejects.toThrow(/nie ma|404/i);
  });
});

describe('czyja baza jest pokazywana', () => {
  it('nazwa z adresu ma pierwszeństwo', async () => {
    await expect(publicKnowledgeOwner('kasia')).resolves.toBe('kasia');
  });

  /**
   * Pierwsza wersja zgadywała `admin` — konto, które backend zakłada przy
   * pierwszym starcie. Biblioteka leżała na koncie autora, więc czytelnik
   * dostawał „nie ma dokumentu" bez żadnej wskazówki, czemu. Serwer zna
   * odpowiedź, więc się go pyta.
   */
  it('bez wskazania pyta serwer, kto ma publiczną bazę', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('/public/knowledge/owners');
      return { ok: true, json: async () => ({ owners: ['marcin'] }) } as Response;
    }));

    await expect(publicKnowledgeOwner()).resolves.toBe('marcin');
  });

  it('gdy nikt nie ma publicznej bazy, nie zmyśla nazwy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ owners: [] }) } as Response)));
    await expect(publicKnowledgeOwner()).resolves.toBeUndefined();
  });

  it('starszy backend bez tego endpointu nie wywraca strony', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 } as Response)));
    await expect(publicKnowledgeOwner()).resolves.toBeUndefined();
  });
});

describe('drzewo takie, jakie zwraca backend', () => {
  /**
   * Prawdziwa baza jest zagnieżdżona głębiej niż dwa poziomy:
   * `book/{książka}/{rozdział}/{podrozdział}.md`. Test z płytkim drzewem
   * przepuszczał błąd w składaniu ścieżek, a strona nie znajdowała dokumentu,
   * do którego prowadził jej własny odsyłacz.
   */
  const GLEBOKIE = {
    name: 'knowledge', path: 'Minis/Users/ala/drive/knowledge', type: 'directory',
    children: [
      {
        name: 'book', path: 'Minis/Users/ala/drive/knowledge/book', type: 'directory',
        children: [
          {
            name: 'Resnick-Halliday-Fizyka-tom-1',
            path: 'Minis/Users/ala/drive/knowledge/book/Resnick-Halliday-Fizyka-tom-1',
            type: 'directory',
            children: [
              {
                name: '01-pomiar',
                path: 'Minis/Users/ala/drive/knowledge/book/Resnick-Halliday-Fizyka-tom-1/01-pomiar',
                type: 'directory',
                children: [
                  {
                    name: '01-01-wielkosci.md',
                    path: 'Minis/Users/ala/drive/knowledge/book/Resnick-Halliday-Fizyka-tom-1/01-pomiar/01-01-wielkosci.md',
                    type: 'file',
                  },
                ],
              },
            ],
          },
        ],
      },
      { name: 'wahadlo.md', path: 'Minis/Users/ala/drive/knowledge/wahadlo.md', type: 'file' },
    ],
  };

  it('składa pełną ścieżkę przez wszystkie poziomy katalogów', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('list=1')) return { ok: true, json: async () => ({ tree: GLEBOKIE }) } as Response;
      return { ok: true, text: async () => '# Treść' } as Response;
    }));

    const pliki = await readPublicKnowledge('ala');
    expect(pliki.map((f) => f.path)).toEqual([
      'book/Resnick-Halliday-Fizyka-tom-1/01-pomiar/01-01-wielkosci.md',
      'wahadlo.md',
    ]);
  });

  it('pobiera plik spod adresu złożonego z tej samej ścieżki', async () => {
    const adresy: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      adresy.push(url);
      if (url.includes('list=1')) return { ok: true, json: async () => ({ tree: GLEBOKIE }) } as Response;
      return { ok: true, text: async () => '# Treść' } as Response;
    }));

    await readPublicKnowledge('ala');
    expect(adresy).toContain(
      '/public/drive/users/ala/knowledge/book/Resnick-Halliday-Fizyka-tom-1/01-pomiar/01-01-wielkosci.md',
    );
  });
});

describe('kto ma ten konkretny dokument', () => {
  /**
   * Adres bez właściciela (`/knowledge/book/…`) trafia się w praktyce: to jest
   * link sprzed wprowadzenia `u/{kto}` albo ręcznie skrócony. Wybranie
   * pierwszego z brzegu właściciela daje wtedy „nie ma dokumentu" — mimo że
   * dokument istnieje, tyle że u kogoś innego. Skoro adres wskazuje konkretny
   * plik, da się sprawdzić, kto go ma.
   */
  it('sprawdza właścicieli i zwraca tego, u którego dokument istnieje', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/owners')) {
        return { ok: true, json: async () => ({ owners: ['admin', 'marcin'] }) } as Response;
      }
      expect(init?.method).toBe('HEAD');
      return { ok: url.includes('/users/marcin/') } as Response;
    }));

    await expect(findKnowledgeOwnerOf('book/rh/2-3.md')).resolves.toBe('marcin');
  });

  /**
   * Regresja: publiczny Drive obsługiwał tylko GET, więc sonda HEAD dostawała
   * 404 dla każdego właściciela. Wyszukiwanie kończyło się niczym, strona brała
   * pierwszego z listy i pokazywała „nie ma dokumentu" — choć GET ten plik
   * zwracał.
   */
  it('serwer bez obsługi HEAD nie ukrywa istniejącego dokumentu', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/owners')) {
        return { ok: true, json: async () => ({ owners: ['admin', 'marcin'] }) } as Response;
      }
      // Stary serwer: HEAD zawsze 404, GET działa dla właściwego właściciela.
      if (init?.method === 'HEAD') return { ok: false, status: 404 } as Response;
      return { ok: url.includes('/users/marcin/') } as Response;
    }));

    await expect(findKnowledgeOwnerOf('book/rh/2-3.md')).resolves.toBe('marcin');
  });

  it('gdy nikt nie ma dokumentu, nie wskazuje nikogo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.includes('/owners')
        ? { ok: true, json: async () => ({ owners: ['admin'] }) } as Response
        : { ok: false, status: 404 } as Response
    )));

    await expect(findKnowledgeOwnerOf('book/nie-ma.md')).resolves.toBeUndefined();
  });

  it('pyta HEAD-em, nie ściąga treści przy samym szukaniu', async () => {
    const metody: (string | undefined)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/owners')) return { ok: true, json: async () => ({ owners: ['a'] }) } as Response;
      metody.push(init?.method);
      return { ok: true } as Response;
    }));

    await findKnowledgeOwnerOf('x.md');
    expect(metody).toEqual(['HEAD']);
  });
});

describe('koszt wczytywania', () => {
  const DUZE = {
    name: 'knowledge', path: 'k', type: 'directory',
    children: Array.from({ length: 40 }, (_, i) => ({
      name: `d${i}.md`, path: `k/d${i}.md`, type: 'file',
    })),
  };

  /**
   * Baza podręcznika to 248 plików i 3,5 MB. Pobierane jeden po drugim znaczą
   * 248 kolejek po sieci — czytelnik czeka na całą bibliotekę, żeby zobaczyć
   * jeden podrozdział.
   */
  it('pobiera pliki równolegle, nie jeden po drugim', async () => {
    let rownoczesnie = 0;
    let szczyt = 0;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('list=1')) return { ok: true, json: async () => ({ tree: DUZE }) } as Response;
      rownoczesnie += 1;
      szczyt = Math.max(szczyt, rownoczesnie);
      await new Promise((r) => { setTimeout(r, 1); });
      rownoczesnie -= 1;
      return { ok: true, text: async () => '#' } as Response;
    }));

    await readPublicKnowledge('ala');
    expect(szczyt).toBeGreaterThan(1);
  });

  it('nie zalewa serwera — trzyma limit równoczesnych żądań', () => {
    // Bez limitu 248 plików ruszyłoby naraz; przeglądarka i tak je skolejkuje,
    // ale serwer dostaje wtedy całą falę w jednej chwili.
    expect(PUBLIC_FETCH_CONCURRENCY).toBeLessThanOrEqual(12);
    expect(PUBLIC_FETCH_CONCURRENCY).toBeGreaterThan(1);
  });

  it('pojedynczy dokument da się wczytać bez całej biblioteki', async () => {
    const adresy: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      adresy.push(url);
      return { ok: true, text: async () => '# Jeden' } as Response;
    }));

    const plik = await readPublicDocument('ala', 'book/rh/2-3.md');
    expect(plik).toEqual({ path: 'book/rh/2-3.md', markdown: '# Jeden' });
    // Jedno żądanie: bez listowania i bez reszty bazy.
    expect(adresy).toHaveLength(1);
  });
});
