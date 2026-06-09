/**
 * System API - interfejs udostępniany skryptom JS w nodach
 */

import { mqttClient } from '../../mqttclient';
import { DataSource } from '../../filesystem/data/DataSource';
import { PersonModel, TaskModel, ProjectModel, ShoppingListModel, ShoppingItemModel } from '@mhersztowski/core';
import { ReceiptData } from '../../shopping/models/ReceiptModels';
import { receiptScannerService } from '../../shopping/services/ReceiptScannerService';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { aiService } from '../../ai';
import type { AiChatMessage, AiChatResponse } from '../../ai';
import { speechService } from '../../speech';

// Names match what the IntelliSense stub exposes to script authors as
// `FileStat` / `FileEntry`. Kept un-exported to avoid colliding with the
// VFS `FileStat` type re-exported by the automate barrel (different shape,
// different purpose).
/** Metadata o pojedynczej pozycji w filesystemie — plik lub katalog. */
interface FileStat {
  /** Pełna ścieżka tak jak została podana / rozwiązana. */
  path: string;
  /** Sama nazwa (ostatni segment ścieżki). */
  name: string;
  /** Rozmiar w bajtach. Dla katalogu zawsze 0. */
  size: number;
  /** Data ostatniej modyfikacji (Date). */
  modified: Date;
  /** Czy to plik (true) czy katalog (false). */
  isFile: boolean;
  /** Czy to katalog (true) czy plik (false). */
  isDirectory: boolean;
}

/** Pojedynczy wpis zwrócony przez `list*` / `walk`. */
interface FileEntry {
  /** Sama nazwa (ostatni segment). */
  name: string;
  /** Pełna ścieżka. */
  path: string;
  /** Czy to plik. */
  isFile: boolean;
  /** Czy to katalog. */
  isDirectory: boolean;
}

export interface AutomateSystemApiInterface {
  file: {
    // ── Read / write ──
    /** Wczytaj plik tekstowy. Rzuca błąd gdy nie istnieje. */
    read(path: string): Promise<string>;
    /** Zapisz plik tekstowy. Nadpisuje jeśli istnieje. */
    write(path: string, content: string): Promise<void>;

    // ── Listing ──
    /** Lista nazw plików w katalogu (bez typu). Skrót do `listDetailed().map(e => e.name)`. */
    list(path: string): Promise<string[]>;
    /** Lista wpisów z informacją o typie (plik vs katalog). */
    listDetailed(path: string): Promise<FileEntry[]>;
    /** Rekurencyjny walk po drzewie. Callback dostaje każdy wpis (plik
     *  i katalog) raz; może zwrócić Promise żeby walker poczekał. */
    walk(path: string, callback: (entry: FileEntry) => void | Promise<void>): Promise<void>;
    /** Filtruj rekurencyjnie po wzorcu glob (np. `*.json` albo `**\/*.md`).
     *  Zwraca pełne ścieżki dopasowanych PLIKÓW (katalogi pominięte). */
    glob(rootPath: string, pattern: string): Promise<string[]>;

    // ── Info ──
    /** Metadane (size, modified, type). Rzuca błąd jeśli ścieżka nie istnieje. */
    stat(path: string): Promise<FileStat>;
    /** True jeśli ścieżka istnieje (plik lub katalog). Nie rzuca. */
    exists(path: string): Promise<boolean>;
    /** True jeśli to istniejący PLIK. False dla katalogu lub braku. */
    isFile(path: string): Promise<boolean>;
    /** True jeśli to istniejący KATALOG. */
    isDirectory(path: string): Promise<boolean>;
    /** Rozmiar pliku w bajtach (skrót do `stat().size`). 0 dla katalogu. */
    size(path: string): Promise<number>;
    /** Data modyfikacji (skrót do `stat().modified`). */
    modified(path: string): Promise<Date>;

    // ── Manipulation ──
    /** Usuń plik. Dla katalogu użyj `rmdir`. */
    delete(path: string): Promise<void>;
    /** Skopiuj plik. Nadpisuje cel jeśli istnieje. */
    copy(from: string, to: string): Promise<void>;
    /** Przenieś / zmień nazwę. Atomic dla większości backendów. */
    rename(from: string, to: string): Promise<void>;
    /** Alias do `rename` — wygodniejsza nazwa w niektórych kontekstach. */
    move(from: string, to: string): Promise<void>;

    // ── Directories ──
    /** Utwórz katalog (i rodzicielskie jeśli trzeba). Idempotent. */
    mkdir(path: string): Promise<void>;
    /** Usuń katalog. Domyślnie pusty; recursive=true usuwa też zawartość. */
    rmdir(path: string, recursive?: boolean): Promise<void>;
  };

  data: {
    getPersons(): PersonModel[];
    getPersonById(id: string): PersonModel | undefined;
    getTasks(): TaskModel[];
    getTaskById(id: string): TaskModel | undefined;
    getProjects(): ProjectModel[];
    getProjectById(id: string): ProjectModel | undefined;
    getShoppingLists(): ShoppingListModel[];
    getShoppingListById(id: string): ShoppingListModel | undefined;
  };

  variables: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
    getAll(): Record<string, unknown>;
  };

  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
  };

  notify(message: string, severity?: 'success' | 'info' | 'warning' | 'error'): void;

  utils: {
    uuid(): string;
    dayjs(date?: string): dayjs.Dayjs;
    sleep(ms: number): Promise<void>;
  };

  ai: {
    chat(prompt: string, options?: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number }): Promise<string>;
    chatVision(prompt: string, imageBase64: string, options?: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number }): Promise<string>;
    chatMessages(messages: AiChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<AiChatResponse>;
    isConfigured(): boolean;
  };

  speech: {
    say(text: string, options?: { voice?: string; speed?: number }): Promise<void>;
    stop(): void;
    isTtsConfigured(): boolean;
    isSttConfigured(): boolean;
  };

  shopping: {
    createList(name: string, options?: { store?: string; budget?: number }): Promise<ShoppingListModel>;
    addItem(listId: string, name: string, options?: { quantity?: number; unit?: string; category?: string; estimatedPrice?: number }): Promise<ShoppingItemModel>;
    checkItem(listId: string, itemId: string, actualPrice?: number): Promise<void>;
    uncheckItem(listId: string, itemId: string): Promise<void>;
    removeItem(listId: string, itemId: string): Promise<void>;
    completeList(listId: string): Promise<void>;
    scanReceipt(imageBase64: string | string[]): Promise<ReceiptData>;
  };

  /** Discover and run other automate scripts embedded in the user's drive.
   *  Scripts are addressed by the tag system (see "Ustawienia skryptu" →
   *  "Tagi"). Three scoping variants share the same find/run pair:
   *
   *  - **By tag (full drive)** — scan from `options.root` (default `'data'`)
   *    downwards. Use when the workflow is global ("daily runner").
   *
   *  - **In parents** — relative to the calling script's host `.md` file:
   *    walk the path UPWARDS, listing `.md` files in every ancestor
   *    directory (non-recursive per directory). Use when you want a
   *    script to react to configuration / context files placed higher
   *    in the tree.
   *
   *  - **In childs** — relative to the calling script's host `.md` file:
   *    walk the host's directory DOWNWARDS recursively. Use when the
   *    workflow is "everything beneath this folder".
   *
   *  All three exclude the calling script's own host `.md` file from
   *  the result set so a self-tag can't trigger infinite recursion.
   */
  scripts: {
    /** Find all automate scripts that carry the given tag — full drive scan. */
    findByTag(tag: string, options?: { root?: string }): Promise<DiscoveredScript[]>;
    /** Find scripts with the tag in ancestor directories of the calling
     *  script's host `.md` file. Stops at `options.root` (default `'data'`).
     *  Per-directory scan is non-recursive — only files directly in that
     *  ancestor count. */
    findInParentsByTag(tag: string, options?: { root?: string }): Promise<DiscoveredScript[]>;
    /** Find scripts with the tag under the calling script's host directory,
     *  recursively. The host file itself is excluded. */
    findInChildsByTag(tag: string): Promise<DiscoveredScript[]>;

    /** Find + execute (full drive). See class-level doc for run semantics. */
    runByTag(tag: string, options?: {
      root?: string;
      stopOnError?: boolean;
    }): Promise<ScriptRunResult[]>;
    /** Find + execute in ancestor directories of the host `.md`. */
    runInParentsByTag(tag: string, options?: {
      root?: string;
      stopOnError?: boolean;
    }): Promise<ScriptRunResult[]>;
    /** Find + execute under the host `.md`'s directory recursively. */
    runInChildsByTag(tag: string, options?: {
      stopOnError?: boolean;
    }): Promise<ScriptRunResult[]>;
  };
}

/** Metadata + body of an automate script block found in a markdown file. */
export interface DiscoveredScript {
  /** VFS path to the containing `.md` file. */
  path: string;
  /** TipTap block id (may be empty for legacy blocks). */
  blockId: string;
  /** Script body — exactly as the user wrote it. */
  code: string;
  /** Tags from the fence params. */
  tags: string[];
  /** Whether the block is marked autorun. Read-only metadata — runByTag
   *  ignores this flag and executes whatever it found. */
  autorun: boolean;
  /** Saved view mode (code vs html). */
  viewMode: 'code' | 'html';
  /** Saved windowHeight (px) or null for auto. */
  windowHeight: number | null;
}

/** Per-script outcome of a runByTag batch. */
export interface ScriptRunResult {
  path: string;
  blockId: string;
  tags: string[];
  /** True iff the script completed without throwing. */
  ok: boolean;
  /** Whatever the script returned (or undefined). Only present when ok. */
  result?: unknown;
  /** String form of the thrown error. Only present when !ok. */
  error?: string;
  /** Wall-clock duration of the script body. */
  durationMs: number;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
}

export interface NotificationEntry {
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  timestamp: number;
}

export class AutomateSystemApi implements AutomateSystemApiInterface {
  private _variables: Record<string, unknown>;
  private _dataSource: DataSource;
  private _logs: LogEntry[] = [];
  private _notifications: NotificationEntry[] = [];
  /** Getter for the currently-open markdown file's path. Stored as a
   *  function (not a static string) so the api singleton stays in sync
   *  with whatever document the host editor opens next, without having
   *  to recreate the api. Returns undefined when the host doesn't know
   *  (api lives outside MdEditor — flow/designer surfaces). */
  private _getDocumentPath: () => string | undefined;

  constructor(
    dataSource: DataSource,
    variables: Record<string, unknown>,
    getDocumentPath: () => string | undefined = () => undefined,
  ) {
    this._dataSource = dataSource;
    this._variables = variables;
    this._getDocumentPath = getDocumentPath;
  }

  get logs(): LogEntry[] {
    return this._logs;
  }

  get notifications(): NotificationEntry[] {
    return this._notifications;
  }

  // ─── Internal helpers for file API ──────────────────────────────────
  /** Try `readFile` then `listDirectory` to determine if `path` exists and
   *  what type it is. Returns null on miss. The `readFile` path also gives us
   *  size + lastModified; for directories we use Date.now() as a placeholder. */
  private async _statInternal(path: string): Promise<FileStat | null> {
    // Try as file first — the common case for `stat()`.
    try {
      const f = await mqttClient.readFile(path);
      return {
        path,
        name: path.split('/').pop() || path,
        size: f?.content?.length ?? 0,
        modified: f?.lastModified ? new Date(f.lastModified) : new Date(),
        isFile: true,
        isDirectory: false,
      };
    } catch { /* fall through to directory probe */ }
    // Try as directory — listDirectory succeeds on dirs, fails on files / missing.
    try {
      await mqttClient.listDirectory(path);
      return {
        path,
        name: path.split('/').pop() || path,
        size: 0,
        modified: new Date(),
        isFile: false,
        isDirectory: true,
      };
    } catch { return null; }
  }

  /** Convert a glob-like pattern (`*.json`, `**\/*.md`, `data-*.csv`) to a
   *  RegExp anchored to the entry's full path. Supports `*` (segment-local
   *  wildcard, excludes `/`) and `**` (cross-segment wildcard). Other glob
   *  features (`{a,b}`, `[abc]`, `?`) are NOT supported — keep it simple. */
  private _globToRegex(pattern: string): RegExp {
    // Escape regex specials EXCEPT `*` and `/`. We treat the rest as literals.
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // `**` first (greedy any-character including `/`) using a placeholder so
    // it doesn't collide with single-`*` rewriting below.
    const withDoubleStar = escaped.replace(/\*\*/g, '__GLOBSTAR__');
    const withSingleStar = withDoubleStar.replace(/\*/g, '[^/]*');
    const final = withSingleStar.replace(/__GLOBSTAR__/g, '.*');
    return new RegExp(`^${final}$`);
  }

  file = {
    read: async (path: string): Promise<string> => {
      const file = await mqttClient.readFile(path);
      return file?.content || '';
    },

    write: async (path: string, content: string): Promise<void> => {
      await mqttClient.writeFile(path, content);
    },

    list: async (path: string): Promise<string[]> => {
      const tree = await mqttClient.listDirectory(path);
      return tree.children?.map(c => c.name) || [];
    },

    listDetailed: async (path: string): Promise<FileEntry[]> => {
      const tree = await mqttClient.listDirectory(path);
      return (tree.children || []).map(c => ({
        name: c.name,
        path: c.path,
        isFile: c.type === 'file',
        isDirectory: c.type === 'directory',
      }));
    },

    walk: async (path: string, callback: (entry: FileEntry) => void | Promise<void>): Promise<void> => {
      const entries = await this.file.listDetailed(path);
      for (const entry of entries) {
        await callback(entry);
        if (entry.isDirectory) {
          await this.file.walk(entry.path, callback);
        }
      }
    },

    glob: async (rootPath: string, pattern: string): Promise<string[]> => {
      const re = this._globToRegex(pattern);
      const results: string[] = [];
      await this.file.walk(rootPath, (entry) => {
        if (!entry.isFile) return;
        // Match against both the full path (so `**/foo.json` works) and the
        // bare name (so `*.json` works without a wildcard prefix).
        if (re.test(entry.path) || re.test(entry.name)) {
          results.push(entry.path);
        }
      });
      return results;
    },

    stat: async (path: string): Promise<FileStat> => {
      const s = await this._statInternal(path);
      if (!s) throw new Error(`stat: ścieżka nie istnieje: ${path}`);
      return s;
    },

    exists: async (path: string): Promise<boolean> => {
      return (await this._statInternal(path)) !== null;
    },

    isFile: async (path: string): Promise<boolean> => {
      const s = await this._statInternal(path);
      return s?.isFile === true;
    },

    isDirectory: async (path: string): Promise<boolean> => {
      const s = await this._statInternal(path);
      return s?.isDirectory === true;
    },

    size: async (path: string): Promise<number> => {
      const s = await this._statInternal(path);
      return s?.size ?? 0;
    },

    modified: async (path: string): Promise<Date> => {
      const s = await this._statInternal(path);
      if (!s) throw new Error(`modified: ścieżka nie istnieje: ${path}`);
      return s.modified;
    },

    delete: async (path: string): Promise<void> => {
      await mqttClient.deleteFile(path);
    },

    copy: async (from: string, to: string): Promise<void> => {
      const content = await this.file.read(from);
      await this.file.write(to, content);
    },

    rename: async (from: string, to: string): Promise<void> => {
      // No native rename in MQTT API → copy + delete. NOT atomic, but the
      // worst-case failure mode (copy succeeded, delete failed) leaves both
      // copies of the file rather than losing data.
      const content = await this.file.read(from);
      await this.file.write(to, content);
      await mqttClient.deleteFile(from);
    },

    move: async (from: string, to: string): Promise<void> => {
      await this.file.rename(from, to);
    },

    mkdir: async (path: string): Promise<void> => {
      // Backends auto-create parent dirs on write, so a `.keep` sentinel
      // inside the dir guarantees it exists for listDirectory afterwards.
      // Idempotent: writing the same .keep again is fine.
      await mqttClient.writeFile(`${path.replace(/\/$/, '')}/.keep`, '');
    },

    rmdir: async (path: string, recursive?: boolean): Promise<void> => {
      if (recursive) {
        // Depth-first deletion — recurse into subdirs before deleting their
        // entries so we never try to delete a non-empty dir from a backend
        // that rejects it.
        const entries = await this.file.listDetailed(path).catch(() => []);
        for (const entry of entries) {
          if (entry.isDirectory) {
            await this.file.rmdir(entry.path, true);
          } else {
            await mqttClient.deleteFile(entry.path).catch(() => { /* best effort */ });
          }
        }
      }
      // The directory itself — some backends treat dir delete as a no-op
      // (mkdir is implicit, rmdir is too). We swallow the error in that case.
      await mqttClient.deleteFile(path).catch(() => { /* dir may have already vanished */ });
    },
  };

  data = {
    getPersons: (): PersonModel[] => {
      return this._dataSource.persons.map(p => p.toModel());
    },

    getPersonById: (id: string): PersonModel | undefined => {
      return this._dataSource.getPersonById(id)?.toModel();
    },

    getTasks: (): TaskModel[] => {
      return this._dataSource.tasks.map(t => t.toModel());
    },

    getTaskById: (id: string): TaskModel | undefined => {
      return this._dataSource.getTaskById(id)?.toModel();
    },

    getProjects: (): ProjectModel[] => {
      return this._dataSource.projects.map(p => p.toModel());
    },

    getProjectById: (id: string): ProjectModel | undefined => {
      return this._dataSource.getProjectById(id)?.toModel();
    },

    getShoppingLists: (): ShoppingListModel[] => {
      return this._dataSource.shoppingLists.map(l => l.toModel());
    },

    getShoppingListById: (id: string): ShoppingListModel | undefined => {
      return this._dataSource.getShoppingListById(id)?.toModel();
    },
  };

  variables = {
    get: (name: string): unknown => {
      return this._variables[name];
    },

    set: (name: string, value: unknown): void => {
      this._variables[name] = value;
    },

    getAll: (): Record<string, unknown> => {
      return { ...this._variables };
    },
  };

  private _stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  log = {
    info: (message: unknown): void => {
      const msg = this._stringify(message);
      this._logs.push({ level: 'info', message: msg, timestamp: Date.now() });
      console.log('[Automate]', msg);
    },

    warn: (message: unknown): void => {
      const msg = this._stringify(message);
      this._logs.push({ level: 'warn', message: msg, timestamp: Date.now() });
      console.warn('[Automate]', msg);
    },

    error: (message: unknown): void => {
      const msg = this._stringify(message);
      this._logs.push({ level: 'error', message: msg, timestamp: Date.now() });
      console.error('[Automate]', msg);
    },

    debug: (message: unknown): void => {
      const msg = this._stringify(message);
      this._logs.push({ level: 'debug', message: msg, timestamp: Date.now() });
      console.debug('[Automate]', msg);
    },
  };

  notify = (message: string, severity: 'success' | 'info' | 'warning' | 'error' = 'info'): void => {
    this._notifications.push({ message, severity, timestamp: Date.now() });
  };

  utils = {
    uuid: (): string => uuidv4(),
    dayjs: (date?: string): dayjs.Dayjs => dayjs(date),
    sleep: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),
  };

  ai = {
    chat: async (prompt: string, options?: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number }): Promise<string> => {
      const messages: AiChatMessage[] = [];
      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });
      const response = await aiService.chat({
        messages,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
      return response.content;
    },

    chatVision: async (prompt: string, imageBase64: string, options?: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number }): Promise<string> => {
      const messages: AiChatMessage[] = [];
      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      });
      const response = await aiService.chat({
        messages,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
      return response.content;
    },

    chatMessages: async (messages: AiChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<AiChatResponse> => {
      return aiService.chat({
        messages,
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
    },

    isConfigured: (): boolean => {
      return aiService.isConfigured();
    },
  };

  speech = {
    say: async (text: string, options?: { voice?: string; speed?: number }): Promise<void> => {
      return speechService.speak({
        text,
        voice: options?.voice,
        speed: options?.speed,
      });
    },

    stop: (): void => {
      speechService.stopSpeaking();
    },

    isTtsConfigured: (): boolean => {
      return speechService.isTtsConfigured();
    },

    isSttConfigured: (): boolean => {
      return speechService.isSttConfigured();
    },
  };

  private async _getShoppingLists(): Promise<ShoppingListModel[]> {
    return this._dataSource.shoppingLists.map(l => l.toModel());
  }

  private async _saveShoppingLists(lists: ShoppingListModel[]): Promise<void> {
    const data = { type: 'shopping_lists', lists };
    await mqttClient.writeFile('data/shopping_lists.json', JSON.stringify(data, null, 2));
  }

  shopping = {
    createList: async (name: string, options?: { store?: string; budget?: number }): Promise<ShoppingListModel> => {
      const newList: ShoppingListModel = {
        type: 'shopping_list',
        id: uuidv4(),
        name,
        store: options?.store,
        status: 'active',
        createdAt: new Date().toISOString(),
        budget: options?.budget,
        items: [],
      };
      const lists = await this._getShoppingLists();
      lists.push(newList);
      await this._saveShoppingLists(lists);
      return newList;
    },

    addItem: async (listId: string, name: string, options?: { quantity?: number; unit?: string; category?: string; estimatedPrice?: number }): Promise<ShoppingItemModel> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Lista zakupów nie znaleziona: ${listId}`);
      const newItem: ShoppingItemModel = {
        type: 'shopping_item',
        id: uuidv4(),
        name,
        quantity: options?.quantity,
        unit: options?.unit,
        category: options?.category,
        estimatedPrice: options?.estimatedPrice,
        checked: false,
      };
      list.items.push(newItem);
      await this._saveShoppingLists(lists);
      return newItem;
    },

    checkItem: async (listId: string, itemId: string, actualPrice?: number): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Lista zakupów nie znaleziona: ${listId}`);
      const item = list.items.find(i => i.id === itemId);
      if (!item) throw new Error(`Produkt nie znaleziony: ${itemId}`);
      item.checked = true;
      if (actualPrice !== undefined) item.actualPrice = actualPrice;
      await this._saveShoppingLists(lists);
    },

    uncheckItem: async (listId: string, itemId: string): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Lista zakupów nie znaleziona: ${listId}`);
      const item = list.items.find(i => i.id === itemId);
      if (!item) throw new Error(`Produkt nie znaleziony: ${itemId}`);
      item.checked = false;
      await this._saveShoppingLists(lists);
    },

    removeItem: async (listId: string, itemId: string): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Lista zakupów nie znaleziona: ${listId}`);
      const idx = list.items.findIndex(i => i.id === itemId);
      if (idx === -1) throw new Error(`Produkt nie znaleziony: ${itemId}`);
      list.items.splice(idx, 1);
      await this._saveShoppingLists(lists);
    },

    completeList: async (listId: string): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Lista zakupów nie znaleziona: ${listId}`);
      list.status = 'completed';
      list.completedAt = new Date().toISOString();
      await this._saveShoppingLists(lists);
    },

    scanReceipt: async (imageBase64: string | string[]): Promise<ReceiptData> => {
      const inputs = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
      const blobs = inputs.map(b64 => {
        const parts = b64.split(',');
        const byteString = atob(parts.length > 1 ? parts[1] : parts[0]);
        const mimeType = b64.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mimeType });
      });
      return receiptScannerService.scanReceipt(blobs);
    },
  };

  // ─── Internal helpers for the scripts namespace ───────────────────
  /** Parse all ```automate fences in a single markdown body into structured
   *  blocks. Stays in lockstep with markdownConverter's fence format:
   *  `automate[:blockId][:autorun][:html][:t=a,b][:h=NNN]`. Unknown tokens
   *  are ignored — the script API can still pick out tags / autorun by
   *  prefix. */
  private _parseAutomateFences(md: string, path: string): DiscoveredScript[] {
    const out: DiscoveredScript[] = [];
    // Lazy regex (non-greedy code body) — matches both bare ```automate
    // and ```automate:params variants. We anchor by ``` so wrapping spaces
    // are forgiving.
    const re = /```automate(?::([^\n]*))?\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      const params = (m[1] || '').trim();
      const code = m[2].replace(/\s+$/, ''); // trim trailing whitespace only
      const parts = params.split(':');
      const blockId = parts[0] || '';
      const autorun = parts.includes('autorun');
      const viewMode: 'code' | 'html' = parts.includes('html') ? 'html' : 'code';
      const tagsToken = parts.find(p => p.startsWith('t='));
      const tags = tagsToken
        ? tagsToken.slice(2).split(',').map(t => {
            try { return decodeURIComponent(t.trim()); } catch { return t.trim(); }
          }).filter(Boolean)
        : [];
      const hToken = parts.find(p => p.startsWith('h='));
      const hNum = hToken ? Number(hToken.slice(2)) : NaN;
      const windowHeight: number | null = Number.isFinite(hNum) && hNum > 0 ? hNum : null;
      out.push({ path, blockId, code, tags, autorun, viewMode, windowHeight });
    }
    return out;
  }

  /** Reference to the AsyncFunction constructor — `async function(){}` has
   *  it as `Object.getPrototypeOf(...).constructor`. Built once at class
   *  load so runByTag doesn't pay the lookup per script. */
  private static readonly _AsyncFunction =
    Object.getPrototypeOf(async function () { /* probe */ }).constructor as (
      new (...args: string[]) => (...args: unknown[]) => Promise<unknown>
    );

  /** Directory part of a posix-style VFS path. `data/a/b/c.md` → `data/a/b`.
   *  Root paths (no slash, like `'data'`) return themselves. */
  private _dirname(path: string): string {
    const i = path.lastIndexOf('/');
    return i < 0 ? path : path.slice(0, i);
  }

  /** Resolve which `.md` file the calling script lives in. Throws when
   *  unknown (api created outside MdEditor — e.g. flow designer) so the
   *  caller doesn't accidentally treat an empty result as "no scripts
   *  with that tag" and miss a misconfiguration. */
  private _requireDocumentPath(method: string): string {
    const p = this._getDocumentPath();
    if (!p) {
      throw new Error(
        `api.scripts.${method}() requires knowing the calling script's location, ` +
        `but the host editor didn't provide one. Use api.scripts.runByTag() (full drive scan) instead, ` +
        `or open the document via MdEditor.`,
      );
    }
    return p;
  }

  /** Common matcher: read .md file, parse fences, collect blocks whose
   *  tag list contains `tag`. Swallows per-file errors so a single
   *  unreadable file doesn't abort the scan. `excludePath` skips the
   *  calling script's host file (prevents self-recursion). Pushes
   *  debug-level logs so a missed match can be diagnosed (read error,
   *  no fences, tag mismatch). */
  private async _collectMatchingFences(
    filePath: string,
    tag: string,
    excludePath: string | undefined,
    sink: DiscoveredScript[],
  ): Promise<void> {
    if (excludePath && filePath === excludePath) {
      this._logs.push({ level: 'debug', message: `[scripts] skip self: ${filePath}`, timestamp: Date.now() });
      return;
    }
    if (!filePath.toLowerCase().endsWith('.md')) return;
    let content = '';
    try { content = await this.file.read(filePath); }
    catch (e) {
      this._logs.push({
        level: 'debug',
        message: `[scripts] read failed: ${filePath} — ${e instanceof Error ? e.message : String(e)}`,
        timestamp: Date.now(),
      });
      return;
    }
    const blocks = this._parseAutomateFences(content, filePath);
    if (blocks.length === 0) {
      this._logs.push({ level: 'debug', message: `[scripts] ${filePath}: no automate fences`, timestamp: Date.now() });
      return;
    }
    let matched = 0;
    for (const b of blocks) {
      if (b.tags.includes(tag)) {
        sink.push(b);
        matched++;
      }
    }
    // Surface fence inventory of every .md scanned, with their tag lists —
    // this is the single most useful diagnostic when "expected match got
    // zero" happens. Per-block, not just per-file, so a partial match in a
    // file with several fences is obvious.
    const fenceSummary = blocks.map((b, i) =>
      `#${i}=[${b.tags.length ? b.tags.join(',') : '<no tags>'}]`,
    ).join(' ');
    this._logs.push({
      level: 'debug',
      message: `[scripts] ${filePath}: ${blocks.length} fence(s) ${fenceSummary} → matched ${matched} for tag='${tag}'`,
      timestamp: Date.now(),
    });
  }

  /** Execute a previously-discovered list of scripts sequentially. Sequential
   *  because parallelising would let one script's writes race against
   *  another's reads through the shared filesystem. Shared error-handling /
   *  result-shape so the three public run* methods can compose this. */
  private async _executeDiscovered(
    scripts: DiscoveredScript[],
    tag: string,
    stopOnError: boolean,
    methodLabel: string,
  ): Promise<ScriptRunResult[]> {
    const results: ScriptRunResult[] = [];
    for (const s of scripts) {
      const startedAt = performance.now();
      try {
        const fn = new AutomateSystemApi._AsyncFunction('api', 'tag', 'display', s.code);
        const displayShim = {
          text: () => {/* noop in batch */},
          markdown: () => {/* noop */},
          table: () => {/* noop */},
          list: () => {/* noop */},
          json: () => {/* noop */},
          html: () => {/* noop */},
          dom: () => {/* noop */},
        };
        const result = await fn(this, tag, displayShim);
        results.push({
          path: s.path,
          blockId: s.blockId,
          tags: s.tags,
          ok: true,
          result,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          path: s.path,
          blockId: s.blockId,
          tags: s.tags,
          ok: false,
          error: msg,
          durationMs: Math.round(performance.now() - startedAt),
        });
        this._logs.push({
          level: 'error',
          message: `[scripts.${methodLabel}] ${s.path} (block ${s.blockId || '—'}) failed: ${msg}`,
          timestamp: Date.now(),
        });
        if (stopOnError) break;
      }
    }
    return results;
  }

  scripts = {
    // ── Full-drive scan ─────────────────────────────────────────────
    findByTag: async (tag: string, options?: { root?: string }): Promise<DiscoveredScript[]> => {
      // Default to '' = userBase root (what mqttClient.listDirectory('')
      // returns). Previously this was 'data' which was wrong for mycastle-web
      // — that prefix is server-side, not visible from the api.file layer.
      const root = options?.root ?? '';
      const excludePath = this._getDocumentPath();
      const results: DiscoveredScript[] = [];
      await this.file.walk(root, async (entry) => {
        if (!entry.isFile) return;
        await this._collectMatchingFences(entry.path, tag, excludePath, results);
      });
      return results;
    },

    // ── Ancestor scan ───────────────────────────────────────────────
    findInParentsByTag: async (tag: string, options?: { root?: string }): Promise<DiscoveredScript[]> => {
      const docPath = this._requireDocumentPath('findInParentsByTag');
      // Log the resolved scan parameters — first thing user looks at when
      // "I expected matches but got zero" happens. Cheap, info-level only.
      this._logs.push({
        level: 'info',
        message: `[scripts.findInParentsByTag] tag='${tag}' docPath='${docPath}' root='${options?.root ?? ''}'`,
        timestamp: Date.now(),
      });
      // Default '' means "climb until path has no separator left" — the
      // natural upper bound is the userBase root. Callers can pin a
      // narrower stop (e.g. 'drive') if they want.
      const root = options?.root ?? '';
      const results: DiscoveredScript[] = [];
      // Climb the path one segment at a time. Per-ancestor scan is
      // non-recursive — `findInChildsByTag` is the recursive-down variant,
      // so keeping these orthogonal lets callers compose precisely.
      let dir = this._dirname(docPath);
      const seen = new Set<string>();
      // Loop predicate explained:
      //   - `dir` truthy: we still have a path to scan.
      //   - `!seen.has(dir)`: cycle guard for pathological `_dirname` shapes.
      //   - root gate: `root === ''` allows any directory (full climb);
      //     otherwise we require `dir` to be inside (or equal to) `root`.
      while (
        dir &&
        !seen.has(dir) &&
        (root === '' || dir === root || dir.startsWith(root + '/'))
      ) {
        seen.add(dir);
        let entries: FileEntry[] = [];
        try { entries = await this.file.listDetailed(dir); }
        catch (e) {
          this._logs.push({
            level: 'warn',
            message: `[scripts.findInParentsByTag] listDetailed('${dir}') failed: ${e instanceof Error ? e.message : String(e)}`,
            timestamp: Date.now(),
          });
          entries = [];
        }
        // Surface per-directory listing so user sees exactly what walker
        // sees at each level — most "zero matches" reports are because
        // listDirectory returns nothing or returns a sibling tree.
        this._logs.push({
          level: 'debug',
          message: `[scripts.findInParentsByTag] dir='${dir}' → ${entries.length} entries: [${entries.map(e => `${e.name}${e.isDirectory ? '/' : ''}`).join(', ')}]`,
          timestamp: Date.now(),
        });
        for (const entry of entries) {
          if (!entry.isFile) continue;
          await this._collectMatchingFences(entry.path, tag, docPath, results);
        }
        if (dir === root) break;   // hit explicit root; stop
        const parent = this._dirname(dir);
        if (parent === dir) break; // root with no separator left (e.g. 'drive')
        dir = parent;
      }
      // Tail log so user sees how many matched. Lists ancestor dirs that
      // were actually scanned — invaluable when zero matches comes back.
      this._logs.push({
        level: 'info',
        message: `[scripts.findInParentsByTag] tag='${tag}' scanned ${seen.size} ancestor dir(s): [${Array.from(seen).join(', ')}], matched ${results.length}`,
        timestamp: Date.now(),
      });
      return results;
    },

    // ── Descendant scan ─────────────────────────────────────────────
    findInChildsByTag: async (tag: string): Promise<DiscoveredScript[]> => {
      const docPath = this._requireDocumentPath('findInChildsByTag');
      const startDir = this._dirname(docPath);
      this._logs.push({
        level: 'info',
        message: `[scripts.findInChildsByTag] tag='${tag}' docPath='${docPath}' startDir='${startDir}'`,
        timestamp: Date.now(),
      });
      const results: DiscoveredScript[] = [];
      await this.file.walk(startDir, async (entry) => {
        if (!entry.isFile) return;
        await this._collectMatchingFences(entry.path, tag, docPath, results);
      });
      this._logs.push({
        level: 'info',
        message: `[scripts.findInChildsByTag] tag='${tag}' matched ${results.length}`,
        timestamp: Date.now(),
      });
      return results;
    },

    // ── Runners ─────────────────────────────────────────────────────
    runByTag: async (tag: string, options?: { root?: string; stopOnError?: boolean }): Promise<ScriptRunResult[]> => {
      const scripts = await this.scripts.findByTag(tag, options);
      return this._executeDiscovered(scripts, tag, !!options?.stopOnError, 'runByTag');
    },
    runInParentsByTag: async (tag: string, options?: { root?: string; stopOnError?: boolean }): Promise<ScriptRunResult[]> => {
      const scripts = await this.scripts.findInParentsByTag(tag, options);
      return this._executeDiscovered(scripts, tag, !!options?.stopOnError, 'runInParentsByTag');
    },
    runInChildsByTag: async (tag: string, options?: { stopOnError?: boolean }): Promise<ScriptRunResult[]> => {
      const scripts = await this.scripts.findInChildsByTag(tag);
      return this._executeDiscovered(scripts, tag, !!options?.stopOnError, 'runInChildsByTag');
    },
  };
}
