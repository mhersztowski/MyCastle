/**
 * Odczyt bazy wiedzy z VFS.
 *
 * Testy dotyczą dwóch rzeczy, na których to się już raz wywróciło: gdzie
 * naprawdę leży katalog i jaką ścieżkę dostaje indeks.
 */
import { describe, it, expect } from 'vitest';
import type { DirectoryTree } from '@mhersztowski/core';
import { ROOT, collectMarkdown, relativeToRoot } from './knowledgeFiles';

const drzewo: DirectoryTree = {
  name: 'knowledge',
  path: 'drive/knowledge',
  type: 'directory',
  children: [
    {
      name: 'mechanika',
      path: 'drive/knowledge/mechanika',
      type: 'directory',
      children: [
        { name: 'wahadlo.md', path: 'drive/knowledge/mechanika/wahadlo.md', type: 'file' },
        { name: 'notatka.txt', path: 'drive/knowledge/mechanika/notatka.txt', type: 'file' },
      ],
    },
    { name: 'spis.md', path: 'drive/knowledge/spis.md', type: 'file' },
  ],
};

describe('katalog bazy', () => {
  it('leży w Drive, nie w katalogu użytkownika', () => {
    // Bez przedrostka `drive/` VFS pokazywał „Directory not accessible" —
    // szukaliśmy o poziom wyżej niż wszystko, co widać w Drive.
    expect(ROOT).toBe('drive/knowledge');
  });
});

describe('zbieranie dokumentów', () => {
  it('schodzi do podkatalogów', () => {
    expect(collectMarkdown(drzewo)).toEqual([
      'drive/knowledge/mechanika/wahadlo.md',
      'drive/knowledge/spis.md',
    ]);
  });

  it('pomija pliki, które nie są markdownem', () => {
    expect(collectMarkdown(drzewo).some((p) => p.endsWith('.txt'))).toBe(false);
  });

  it('pusty katalog nie jest błędem', () => {
    expect(collectMarkdown({ name: 'x', path: 'x', type: 'directory' })).toEqual([]);
  });
});

describe('ścieżka względna wobec bazy', () => {
  it('odcina miejsce zamontowania', () => {
    // Identyfikator dokumentu ma być ten sam niezależnie od tego, czy przyszedł
    // z Drive, czy z eksportu — inaczej prerekwizyty przestają się zgadzać.
    expect(relativeToRoot('drive/knowledge/mechanika/wahadlo.md')).toBe('mechanika/wahadlo.md');
    expect(relativeToRoot('Minis/Users/marcin/drive/knowledge/astronomia/orbita.md'))
      .toBe('astronomia/orbita.md');
  });

  it('ścieżka spoza bazy zostaje bez zmian', () => {
    expect(relativeToRoot('inne/plik.md')).toBe('inne/plik.md');
  });
});
