/**
 * System API - interfejs udostępniany skryptom JS w nodach
 */

import { mqttClient } from '../../mqttclient';
import { DataSource } from '../../filesystem/data/DataSource';
import { PersonModel } from '../../filesystem/models/PersonModel';
import { TaskModel } from '../../filesystem/models/TaskModel';
import { ProjectModel } from '../../filesystem/models/ProjectModel';
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
    chatMessages(messages: AiChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<AiChatResponse>;
    isConfigured(): boolean;
  };

  speech: {
    say(text: string, options?: { voice?: string; speed?: number }): Promise<void>;
    stop(): void;
    isTtsConfigured(): boolean;
    isSttConfigured(): boolean;
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

  log = {
    info: (message: string): void => {
      this._logs.push({ level: 'info', message, timestamp: Date.now() });
      console.log('[Automate]', message);
    },

    warn: (message: string): void => {
      this._logs.push({ level: 'warn', message, timestamp: Date.now() });
      console.warn('[Automate]', message);
    },

    error: (message: string): void => {
      this._logs.push({ level: 'error', message, timestamp: Date.now() });
      console.error('[Automate]', message);
    },

    debug: (message: string): void => {
      this._logs.push({ level: 'debug', message, timestamp: Date.now() });
      console.debug('[Automate]', message);
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
}
