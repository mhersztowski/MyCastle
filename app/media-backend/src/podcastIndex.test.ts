/**
 * Testy wyszukiwania w katalogach podkastów.
 *
 * Sieci tu nie ma — atrapa `fetch` pozwala sprawdzić to, co naprawdę może się
 * zepsuć: podpis, scalanie wyników i zachowanie przy padniętym źródle.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  podcastIndexHeaders,
  mergeResults,
  searchPodcasts,
  type FetchLike,
  type PodcastResult,
} from './podcastIndex';

/** Atrapa `fetch` odpowiadająca według adresu. */
function fakeFetch(routes: Record<string, unknown>, failing: string[] = []): FetchLike {
  return async (url: string) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (failing.some((f) => url.includes(f))) {
      return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    }
    return {
      ok: true,
      status: 200,
      json: async () => (key ? routes[key] : {}),
      text: async () => JSON.stringify(key ? routes[key] : {}),
    };
  };
}

describe('podcastIndexHeaders', () => {
  it('podpisuje sklejeniem klucza, sekretu i czasu', () => {
    const headers = podcastIndexHeaders({ key: 'KEY', secret: 'SECRET' }, 1700000000, 'Test/1.0');
    const expected = createHash('sha1').update('KEYSECRET1700000000').digest('hex');

    expect(headers.Authorization).toBe(expected);
    expect(headers['X-Auth-Key']).toBe('KEY');
    expect(headers['X-Auth-Date']).toBe('1700000000');
  });

  it('nie wysyła sekretu', () => {
    // Sekret jest wyłącznie materiałem do skrótu; gdyby wyciekł nagłówkiem,
    // każdy pośrednik mógłby podpisywać własne zapytania.
    const headers = podcastIndexHeaders({ key: 'KEY', secret: 'TOP-SECRET' }, 1, 'Test/1.0');
    expect(JSON.stringify(headers)).not.toContain('TOP-SECRET');
  });

  it('zmiana czasu zmienia podpis', () => {
    const a = podcastIndexHeaders({ key: 'K', secret: 'S' }, 1000, 'T');
    const b = podcastIndexHeaders({ key: 'K', secret: 'S' }, 1001, 'T');
    expect(a.Authorization).not.toBe(b.Authorization);
  });
});

describe('mergeResults', () => {
  const make = (feedUrl: string, source: PodcastResult['source'], title = 't'): PodcastResult => ({
    id: '1', title, author: '', description: '', image: '', feedUrl, source,
  });

  it('usuwa powtórzenia po adresie kanału, zostawiając pierwszy', () => {
    const merged = mergeResults(
      [make('https://a.example/rss', 'podcastindex', 'z indeksu')],
      [make('https://a.example/rss', 'itunes', 'z itunes')],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('z indeksu');
  });

  it('porównuje adresy bez względu na wielkość liter i spacje', () => {
    const merged = mergeResults(
      [make('https://A.example/RSS', 'podcastindex')],
      [make('  https://a.example/rss  ', 'itunes')],
    );
    expect(merged).toHaveLength(1);
  });

  it('odrzuca wyniki bez adresu kanału', () => {
    // Taki wynik nie da się odtworzyć — lepiej go nie pokazywać, niż pokazać
    // pozycję, która po kliknięciu nic nie robi.
    const merged = mergeResults([make('', 'podcastindex')], [make('https://b.example/rss', 'itunes')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('itunes');
  });
});

describe('searchPodcasts', () => {
  const itunesBody = {
    results: [
      { collectionId: 7, collectionName: 'Radio Nauka', artistName: 'PR', feedUrl: 'https://n.example/rss', artworkUrl600: 'https://n.example/img.jpg', trackCount: 12 },
    ],
  };
  const indexBody = {
    feeds: [
      { id: 1, title: 'Historia', author: 'Autor', url: 'https://h.example/rss', artwork: 'https://h.example/a.png', description: 'opis', episodeCount: 30 },
    ],
  };

  it('bez kluczy pyta tylko iTunes i nie zgłasza błędu', async () => {
    // Brak kluczy to normalny stan świeżej instalacji, a nie awaria.
    const { results, failed } = await searchPodcasts('nauka', {
      fetchImpl: fakeFetch({ 'itunes.apple.com': itunesBody }),
    });

    expect(failed).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('itunes');
    expect(results[0].feedUrl).toBe('https://n.example/rss');
  });

  it('z kluczami łączy oba katalogi', async () => {
    const { results } = await searchPodcasts('x', {
      credentials: { key: 'K', secret: 'S' },
      fetchImpl: fakeFetch({ 'api.podcastindex.org': indexBody, 'itunes.apple.com': itunesBody }),
      now: () => 1_700_000_000_000,
    });

    expect(results.map((r) => r.source)).toEqual(['podcastindex', 'itunes']);
    expect(results[0].title).toBe('Historia');
    expect(results[0].episodeCount).toBe(30);
  });

  it('awaria jednego katalogu nie gubi wyników drugiego', async () => {
    const { results, failed } = await searchPodcasts('x', {
      credentials: { key: 'K', secret: 'S' },
      fetchImpl: fakeFetch({ 'itunes.apple.com': itunesBody }, ['api.podcastindex.org']),
      now: () => 0,
    });

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('itunes');
    expect(failed[0]).toContain('podcastindex');
  });

  it('przekazuje podpisane nagłówki do Podcast Index', async () => {
    let seen: Record<string, string> | undefined;
    const spy: FetchLike = async (url, init) => {
      if (url.includes('api.podcastindex.org')) seen = init?.headers;
      return { ok: true, status: 200, json: async () => ({ feeds: [] }), text: async () => '' };
    };

    await searchPodcasts('x', {
      credentials: { key: 'K', secret: 'S' },
      fetchImpl: spy,
      now: () => 1_700_000_000_000,
    });

    expect(seen?.['X-Auth-Key']).toBe('K');
    expect(seen?.Authorization).toBe(createHash('sha1').update('KS1700000000').digest('hex'));
  });
});
