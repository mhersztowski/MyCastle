/**
 * Statystyka czytania w stronie bazy wiedzy.
 *
 * Trzy rzeczy muszą działać razem: przycisk pod podrozdziałem zapisuje ślad
 * do tego samego pliku postępów co zadania, panel pokazuje procent bazy,
 * a stan przeżywa zamknięcie karty.
 */
import { describe, it, expect } from 'vitest';
import { emptyProgress, markRead, readingStats } from '@mhersztowski/sci-core';
import { loadProgress, saveProgress } from './progressStore';

/** VFS w pamięci — tyle, ile potrzebuje zapis postępów. */
function pamiec(initial: Record<string, string> = {}) {
  const pliki = { ...initial };
  return {
    pliki,
    readFile: async (path: string) => (pliki[path] === undefined ? null : { content: pliki[path] }),
    writeFile: async (path: string, content: string) => { pliki[path] = content; },
  };
}

describe('ślad czytania w pliku postępów', () => {
  it('zapisuje się razem z wynikami zadań, w jednym pliku', async () => {
    const vfs = pamiec();
    const postepy = markRead(emptyProgress(), 'knowledge/15-1.md', 1700000000000);

    await saveProgress(vfs, postepy);
    const wczytane = await loadProgress(vfs);

    expect(readingStats(wczytane, ['knowledge/15-1.md']).read).toBe(1);
  });

  it('stary plik bez pola „read" wczytuje się bez błędu', async () => {
    // Postępy zapisane przed wprowadzeniem statystyki czytania.
    const vfs = pamiec({ 'baza-wiedzy/.postepy.json': JSON.stringify({ items: {}, version: 1 }) });

    const wczytane = await loadProgress(vfs);
    expect(readingStats(wczytane, ['a.md']).read).toBe(0);
  });

  it('oznaczenie nie kasuje wyników zadań zapisanych wcześniej', async () => {
    const vfs = pamiec();
    const zZadaniem = {
      ...emptyProgress(),
      items: { 'a.md:z1': { attempts: 2, streak: 2, lapses: 0, lastAt: 1, dueAt: 2 } },
    };

    await saveProgress(vfs, markRead(zZadaniem, 'a.md', 1700000000000));
    const wczytane = await loadProgress(vfs);

    expect(wczytane.items['a.md:z1'].attempts).toBe(2);
    expect(readingStats(wczytane, ['a.md']).read).toBe(1);
  });
});

describe('statystyka wobec całej bazy', () => {
  it('liczy procent z dokumentów, które naprawdę są w bazie', () => {
    let p = markRead(emptyProgress(), '15-1.md', 1);
    p = markRead(p, '15-2.md', 2);

    expect(readingStats(p, ['15-1.md', '15-2.md', '15-3.md', '15-4.md']).percent).toBe(50);
  });
});
