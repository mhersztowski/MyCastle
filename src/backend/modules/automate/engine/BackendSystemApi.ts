/**
 * Backend System API - interfejs udostępniany skryptom JS w nodach (backend)
 * Używa FileSystem i DataSource bezpośrednio (bez MQTT roundtrip)
 */

import { FileSystem } from '../../filesystem/FileSystem';
import { DataSource } from '../../datasource/DataSource';
import { PersonModel } from '../../datasource/models/PersonModel';
import { TaskModel } from '../../datasource/models/TaskModel';
import { ProjectModel } from '../../datasource/models/ProjectModel';
import { ShoppingListModel, ShoppingItemModel, ShoppingListsModel } from '../../datasource/models/ShoppingModel';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';

export interface AutomateSystemApiInterface {
  file: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    list(path: string): Promise<string[]>;
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
    chatMessages(messages: unknown[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<unknown>;
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
  };

  readonly logs: LogEntry[];
  readonly notifications: NotificationEntry[];
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

export class BackendSystemApi implements AutomateSystemApiInterface {
  private _variables: Record<string, unknown>;
  private _dataSource: DataSource;
  private _fileSystem: FileSystem;
  private _logs: LogEntry[] = [];
  private _notifications: NotificationEntry[] = [];

  constructor(fileSystem: FileSystem, dataSource: DataSource, variables: Record<string, unknown>) {
    this._fileSystem = fileSystem;
    this._dataSource = dataSource;
    this._variables = variables;
  }

  get logs(): LogEntry[] {
    return this._logs;
  }

  get notifications(): NotificationEntry[] {
    return this._notifications;
  }

  file = {
    read: async (path: string): Promise<string> => {
      const fileData = await this._fileSystem.readFile(path);
      return fileData.content;
    },

    write: async (path: string, content: string): Promise<void> => {
      await this._fileSystem.writeFile(path, content);
    },

    list: async (path: string): Promise<string[]> => {
      const tree = await this._fileSystem.listDirectory(path);
      return tree.children?.map(c => c.name) || [];
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
    chat: async (): Promise<string> => {
      throw new Error('AI not available on backend. Configure AI service to use LLM calls.');
    },

    chatVision: async (): Promise<string> => {
      throw new Error('AI not available on backend. Configure AI service to use LLM calls.');
    },

    chatMessages: async (): Promise<unknown> => {
      throw new Error('AI not available on backend. Configure AI service to use LLM calls.');
    },

    isConfigured: (): boolean => {
      return false;
    },
  };

  speech = {
    say: async (): Promise<void> => {
      throw new Error('Speech (TTS) not available on backend.');
    },

    stop: (): void => {
      // No-op on backend
    },

    isTtsConfigured: (): boolean => {
      return false;
    },

    isSttConfigured: (): boolean => {
      return false;
    },
  };

  private async _getShoppingLists(): Promise<ShoppingListModel[]> {
    return this._dataSource.shoppingLists.map(l => l.toModel());
  }

  private async _saveShoppingLists(lists: ShoppingListModel[]): Promise<void> {
    const data: ShoppingListsModel = { type: 'shopping_lists', lists };
    await this._fileSystem.writeFile('data/shopping_lists.json', JSON.stringify(data, null, 2));
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
      if (!list) throw new Error(`Shopping list not found: ${listId}`);
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
      if (!list) throw new Error(`Shopping list not found: ${listId}`);
      const item = list.items.find(i => i.id === itemId);
      if (!item) throw new Error(`Item not found: ${itemId}`);
      item.checked = true;
      if (actualPrice !== undefined) item.actualPrice = actualPrice;
      await this._saveShoppingLists(lists);
    },

    uncheckItem: async (listId: string, itemId: string): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Shopping list not found: ${listId}`);
      const item = list.items.find(i => i.id === itemId);
      if (!item) throw new Error(`Item not found: ${itemId}`);
      item.checked = false;
      await this._saveShoppingLists(lists);
    },

    removeItem: async (listId: string, itemId: string): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Shopping list not found: ${listId}`);
      const idx = list.items.findIndex(i => i.id === itemId);
      if (idx === -1) throw new Error(`Item not found: ${itemId}`);
      list.items.splice(idx, 1);
      await this._saveShoppingLists(lists);
    },

    completeList: async (listId: string): Promise<void> => {
      const lists = await this._getShoppingLists();
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error(`Shopping list not found: ${listId}`);
      list.status = 'completed';
      list.completedAt = new Date().toISOString();
      await this._saveShoppingLists(lists);
    },
  };
}
