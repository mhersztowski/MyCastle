/**
 * Trwałość listy odtwarzania i notatek.
 *
 * Dwa pliki JSON w katalogu danych — nie baza. Lista odtwarzania to kilkadziesiąt
 * pozycji, a notatki rosną wolno; SQLite dołożyłby zależność i migracje po to,
 * żeby obsłużyć zbiór, który mieści się w pamięci z zapasem.
 *
 * Zapis idzie przez plik tymczasowy i `rename`, bo `rename` w obrębie jednego
 * systemu plików jest niepodzielny: przerwanie procesu w trakcie zapisu zostawia
 * poprzednią wersję, a nie plik ucięty w połowie.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

/** Pozycja na liście odtwarzania. */
export interface QueueItem {
  /** Identyfikator odcinka z kanału; klucz pozycji. */
  id: string;
  title: string;
  podcastTitle: string;
  image: string;
  mediaUrl: string;
  mediaType: string;
  durationSec: number;
  feedUrl: string;
  /** Kiedy dodano — ISO 8601. */
  addedAt: string;
  /**
   * Ostatnie miejsce odtwarzania w sekundach.
   *
   * Trzymane przy pozycji, a nie w przeglądarce, bo podkastu słucha się
   * w kilku podejściach i często na innym urządzeniu niż się go dodało.
   */
  positionSec: number;
}

/** Notatka przypięta do miejsca w odcinku. */
export interface Note {
  id: string;
  episodeId: string;
  /** Sekunda odcinka, w której notatka powstała. */
  timeSec: number;
  text: string;
  createdAt: string;
}

interface StoreData {
  queue: QueueItem[];
  notes: Note[];
}

export class MediaStore {
  private readonly queuePath: string;
  private readonly notesPath: string;
  private data: StoreData = { queue: [], notes: [] };

  constructor(private readonly dataDir: string) {
    this.queuePath = path.join(dataDir, 'queue.json');
    this.notesPath = path.join(dataDir, 'notes.json');
  }

  /** Wczytuje oba pliki; brak pliku to pusty zbiór, nie błąd. */
  async load(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.data = {
      queue: await this.readJson<QueueItem[]>(this.queuePath, []),
      notes: await this.readJson<Note[]>(this.notesPath, []),
    };
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fsp.readFile(file, 'utf8')) as T;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return fallback;
      /*
       * Uszkodzony plik odkładamy obok zamiast go nadpisać.
       *
       * Notatki są jedyną rzeczą w tej aplikacji, której nie da się odtworzyć
       * z sieci — wszystko inne to kopia katalogu podkastów. Milczące
       * zastąpienie pustą listą kasowałoby je bez śladu.
       */
      const backup = `${file}.uszkodzony-${Date.now()}`;
      await fsp.rename(file, backup).catch(() => {});
      console.warn(`Nie dało się odczytać ${path.basename(file)}; kopia w ${path.basename(backup)}`);
      return fallback;
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fsp.rename(tmp, file);
  }

  // --- lista odtwarzania -------------------------------------------------

  getQueue(): QueueItem[] {
    return this.data.queue;
  }

  /**
   * Dodaje odcinek na koniec listy.
   *
   * Powtórne dodanie tego samego odcinka nie tworzy drugiej pozycji ani nie
   * kasuje zapamiętanego miejsca — użytkownik, który dodaje coś drugi raz,
   * chce to mieć na liście, a nie zaczynać od początku.
   */
  async enqueue(item: Omit<QueueItem, 'addedAt' | 'positionSec'>): Promise<QueueItem[]> {
    const existing = this.data.queue.find((q) => q.id === item.id);
    if (!existing) {
      this.data.queue.push({ ...item, addedAt: new Date().toISOString(), positionSec: 0 });
      await this.writeJson(this.queuePath, this.data.queue);
    }
    return this.data.queue;
  }

  /** Usuwa pozycję; notatki zostają, bo dotyczą odcinka, nie listy. */
  async dequeue(id: string): Promise<QueueItem[]> {
    this.data.queue = this.data.queue.filter((q) => q.id !== id);
    await this.writeJson(this.queuePath, this.data.queue);
    return this.data.queue;
  }

  /** Zapamiętuje miejsce odtwarzania. */
  async savePosition(id: string, positionSec: number): Promise<void> {
    const item = this.data.queue.find((q) => q.id === id);
    if (!item) return;
    item.positionSec = Math.max(0, Math.floor(positionSec));
    await this.writeJson(this.queuePath, this.data.queue);
  }

  /** Zmienia kolejność listy według podanych identyfikatorów. */
  async reorder(ids: string[]): Promise<QueueItem[]> {
    const byId = new Map(this.data.queue.map((q) => [q.id, q]));
    const ordered = ids.map((id) => byId.get(id)).filter((q): q is QueueItem => Boolean(q));
    // Pozycje spoza listy `ids` zostają na końcu — żądanie z nieaktualnym
    // stanem nie może kasować tego, o czym nadawca nie wiedział.
    const rest = this.data.queue.filter((q) => !ids.includes(q.id));
    this.data.queue = [...ordered, ...rest];
    await this.writeJson(this.queuePath, this.data.queue);
    return this.data.queue;
  }

  // --- notatki ----------------------------------------------------------

  /** Notatki odcinka, w kolejności miejsc w nagraniu. */
  getNotes(episodeId: string): Note[] {
    return this.data.notes
      .filter((n) => n.episodeId === episodeId)
      .sort((a, b) => a.timeSec - b.timeSec);
  }

  getAllNotes(): Note[] {
    return this.data.notes;
  }

  async addNote(episodeId: string, timeSec: number, text: string): Promise<Note> {
    const note: Note = {
      id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      episodeId,
      timeSec: Math.max(0, Math.floor(timeSec)),
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    this.data.notes.push(note);
    await this.writeJson(this.notesPath, this.data.notes);
    return note;
  }

  async removeNote(id: string): Promise<void> {
    this.data.notes = this.data.notes.filter((n) => n.id !== id);
    await this.writeJson(this.notesPath, this.data.notes);
  }

  async updateNote(id: string, text: string): Promise<Note | undefined> {
    const note = this.data.notes.find((n) => n.id === id);
    if (!note) return undefined;
    note.text = text.trim();
    await this.writeJson(this.notesPath, this.data.notes);
    return note;
  }
}
