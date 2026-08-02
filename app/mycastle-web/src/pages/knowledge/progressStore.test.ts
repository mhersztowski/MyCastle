/**
 * Trwałość postępów nauki.
 *
 * Postępy żyją w VFS, żeby przetrwały wyczyszczenie przeglądarki i przeniosły
 * się między urządzeniami. Testy pilnują sytuacji, w których taki zapis zwykle
 * gubi dane: pierwszego uruchomienia, uszkodzonego pliku i zapisów lecących
 * gęściej, niż serwer nadąża odpowiadać.
 */
import { describe, it, expect, vi } from 'vitest';
import { emptyProgress, recordAttempt } from '@mhersztowski/sci-core';
import { loadProgress, saveProgress, PROGRESS_PATH } from './progressStore';

const START = Date.UTC(2026, 0, 1);

/** Atrapa VFS trzymająca pliki w mapie. */
function vfs(pliki: Record<string, string> = {}) {
  return {
    pliki,
    readFile: vi.fn(async (path: string) =>
      (path in pliki ? { content: pliki[path] } : null)),
    writeFile: vi.fn(async (path: string, content: string) => { pliki[path] = content; }),
  };
}

describe('loadProgress', () => {
  it('brak pliku znaczy czyste konto, nie błąd', async () => {
    // Pierwsze wejście do bazy jest normalną sytuacją — wyjątek zamieniłby je
    // w komunikat o awarii.
    const klient = vfs();
    await expect(loadProgress(klient)).resolves.toEqual(emptyProgress());
  });

  it('uszkodzony plik nie kasuje możliwości nauki', async () => {
    const klient = vfs({ [PROGRESS_PATH]: '{ to nie jest json' });
    await expect(loadProgress(klient)).resolves.toEqual(emptyProgress());
  });

  it('czyta zapisane postępy', async () => {
    const zapisane = recordAttempt(emptyProgress(), 'wahadlo.md:okres', { quality: 'perfect', at: START });
    const klient = vfs({ [PROGRESS_PATH]: JSON.stringify(zapisane) });

    await expect(loadProgress(klient)).resolves.toEqual(zapisane);
  });

  it('plik z przyszłej wersji formatu nie jest wczytywany na ślepo', async () => {
    // Odczytanie nieznanego formatu jako bieżącego dałoby ciche zgubienie pól
    // przy pierwszym zapisie. Lepiej zacząć od zera niż nadpisać cudzy stan.
    const klient = vfs({ [PROGRESS_PATH]: JSON.stringify({ version: 99, items: { a: {} } }) });
    await expect(loadProgress(klient)).resolves.toEqual(emptyProgress());
  });
});

describe('saveProgress', () => {
  it('zapisuje pod ustaloną ścieżką', async () => {
    const klient = vfs();
    const progress = recordAttempt(emptyProgress(), 'a', { quality: 'perfect', at: START });

    await saveProgress(klient, progress);
    expect(JSON.parse(klient.pliki[PROGRESS_PATH])).toEqual(progress);
  });

  it('błąd zapisu nie przerywa nauki', async () => {
    // Zadania mają działać także wtedy, gdy serwer jest niedostępny — postęp
    // zostanie wtedy w pamięci karty, ale czytelnik nie zostaje z pustą stroną.
    const klient = { readFile: vi.fn(), writeFile: vi.fn(async () => { throw new Error('offline'); }) };
    await expect(saveProgress(klient, emptyProgress())).resolves.toBeUndefined();
  });
});
