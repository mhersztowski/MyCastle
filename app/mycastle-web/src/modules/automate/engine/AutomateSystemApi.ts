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

  constructor(dataSource: DataSource, variables: Record<string, unknown>) {
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
}
