/**
 * Testy trwałości listy odtwarzania i notatek.
 *
 * Każdy przypadek dostaje własny katalog tymczasowy — inaczej testy widziałyby
 * nawzajem swoje pliki i przechodziłyby w zależności od kolejności.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { MediaStore, type QueueItem } from './store';

let dir: string;

const sample = (id: string): Omit<QueueItem, 'addedAt' | 'positionSec'> => ({
  id,
  title: `Odcinek ${id}`,
  podcastTitle: 'Radio Nauka',
  image: '',
  mediaUrl: `https://example.org/${id}.mp3`,
  mediaType: 'audio/mpeg',
  durationSec: 600,
  feedUrl: 'https://example.org/rss',
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-store-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('lista odtwarzania', () => {
  it('brak pliku to pusta lista, a nie błąd', async () => {
    const store = new MediaStore(dir);
    await store.load();
    expect(store.getQueue()).toEqual([]);
  });

  it('dodaje i utrwala między uruchomieniami', async () => {
    const first = new MediaStore(dir);
    await first.load();
    await first.enqueue(sample('a'));

    const second = new MediaStore(dir);
    await second.load();
    expect(second.getQueue().map((q) => q.id)).toEqual(['a']);
  });

  it('powtórne dodanie nie tworzy duplikatu ani nie kasuje miejsca', async () => {
    // Ktoś, kto dodaje odcinek drugi raz, chce go mieć na liście — a nie
    // zaczynać od nowa po godzinie słuchania.
    const store = new MediaStore(dir);
    await store.load();
    await store.enqueue(sample('a'));
    await store.savePosition('a', 1200);
    await store.enqueue(sample('a'));

    expect(store.getQueue()).toHaveLength(1);
    expect(store.getQueue()[0].positionSec).toBe(1200);
  });

  it('zapamiętane miejsce przeżywa restart', async () => {
    const first = new MediaStore(dir);
    await first.load();
    await first.enqueue(sample('a'));
    await first.savePosition('a', 42.7);

    const second = new MediaStore(dir);
    await second.load();
    expect(second.getQueue()[0].positionSec).toBe(42);
  });

  it('usunięcie pozycji zostawia jej notatki', async () => {
    // Notatka opisuje odcinek, nie miejsce na liście — a listę czyści się
    // rutynowo po odsłuchaniu.
    const store = new MediaStore(dir);
    await store.load();
    await store.enqueue(sample('a'));
    await store.addNote('a', 30, 'ważne miejsce');
    await store.dequeue('a');

    expect(store.getQueue()).toEqual([]);
    expect(store.getNotes('a')).toHaveLength(1);
  });

  it('zmiana kolejności zostawia pozycje spoza żądania na końcu', async () => {
    // Żądanie ułożone z nieaktualnego widoku nie może skasować pozycji,
    // o której nadawca nie wiedział.
    const store = new MediaStore(dir);
    await store.load();
    await store.enqueue(sample('a'));
    await store.enqueue(sample('b'));
    await store.enqueue(sample('c'));

    await store.reorder(['c', 'a']);
    expect(store.getQueue().map((q) => q.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('notatki', () => {
  it('zapisuje czas w sekundach i utrwala', async () => {
    const first = new MediaStore(dir);
    await first.load();
    await first.addNote('ep-1', 95.6, '  o tym warto pamiętać  ');

    const second = new MediaStore(dir);
    await second.load();
    const notes = second.getNotes('ep-1');
    expect(notes).toHaveLength(1);
    expect(notes[0].timeSec).toBe(95);
    expect(notes[0].text).toBe('o tym warto pamiętać');
  });

  it('zwraca notatki uporządkowane po miejscu w nagraniu', async () => {
    const store = new MediaStore(dir);
    await store.load();
    await store.addNote('ep-1', 300, 'trzecia');
    await store.addNote('ep-1', 10, 'pierwsza');
    await store.addNote('ep-1', 120, 'druga');

    expect(store.getNotes('ep-1').map((n) => n.text)).toEqual(['pierwsza', 'druga', 'trzecia']);
  });

  it('oddziela notatki różnych odcinków', async () => {
    const store = new MediaStore(dir);
    await store.load();
    await store.addNote('ep-1', 1, 'a');
    await store.addNote('ep-2', 1, 'b');

    expect(store.getNotes('ep-1').map((n) => n.text)).toEqual(['a']);
  });

  it('uszkodzony plik odkłada obok zamiast go skasować', async () => {
    // Notatki to jedyna rzecz w tej aplikacji, której nie da się odtworzyć
    // z sieci.
    await fsp.writeFile(path.join(dir, 'notes.json'), '{to nie jest JSON', 'utf8');

    const store = new MediaStore(dir);
    await store.load();

    expect(store.getAllNotes()).toEqual([]);
    const kopie = fs.readdirSync(dir).filter((f) => f.includes('uszkodzony'));
    expect(kopie).toHaveLength(1);
  });
});
