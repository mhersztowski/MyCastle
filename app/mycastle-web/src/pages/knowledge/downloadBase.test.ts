/**
 * Pobranie bazy jako archiwum.
 *
 * Testy nie sprawdzają samego ZIP-a (to robota jszip), tylko to, co jest naszą
 * odpowiedzialnością: żeby archiwum było kompletne albo żeby go nie było.
 * Połowiczne archiwum jest gorsze od błędu — czytelnik zobaczy je dopiero po
 * rozpakowaniu, bez pojęcia, czego brakuje.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildArchive } from './downloadBase';

const DOKUMENTY = [
  { path: 'mechanika/wahadlo.md', markdown: '---\ntitle: Wahadło\n---\n# Wahadło\n\nTreść.' },
];

const MANIFEST = { assets: ['assets/sci.js', 'assets/KaTeX_Main-Regular.woff2'] };

/** Pobieracz, który udaje serwer z bundlem. */
const serwer = (braki: string[] = []) => vi.fn(async (url: string) => {
  if (url.endsWith('manifest.json')) {
    return { ok: true, json: async () => MANIFEST } as Response;
  }
  if (braki.some((brak) => url.includes(brak))) {
    return { ok: false, status: 404 } as Response;
  }
  return { ok: true, blob: async () => new Blob([url]) } as Response;
});

describe('buildArchive', () => {
  it('pakuje strony razem z bundlem', async () => {
    const fetcher = serwer();
    const { blob, filename } = await buildArchive(DOKUMENTY, { fetcher });

    expect(filename).toBe('baza-wiedzy.zip');
    expect(blob.size).toBeGreaterThan(0);
    // Manifest plus dwa pliki bundla — strony powstają lokalnie.
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('brakujący plik bundla przerywa pakowanie z nazwą pliku', async () => {
    // Cicho pominięty font znaczy wzory w czcionce zastępczej; cicho pominięty
    // `sci.js` znaczy martwą stronę. W obu razach czytelnik ma to wiedzieć od
    // razu, a nie po rozpakowaniu.
    await expect(buildArchive(DOKUMENTY, { fetcher: serwer(['sci.js']) }))
      .rejects.toThrow(/sci\.js/);
  });

  it('niedostępny manifest tłumaczy, czego brakuje', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 404 } as Response));
    await expect(buildArchive(DOKUMENTY, { fetcher }))
      .rejects.toThrow(/bundl|manifest/i);
  });

  it('pusta baza nie daje pustego archiwum', async () => {
    await expect(buildArchive([], { fetcher: serwer() })).rejects.toThrow(/dokument/i);
  });
});
