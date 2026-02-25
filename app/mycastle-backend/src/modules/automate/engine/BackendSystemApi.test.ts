import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { BackendSystemApi } from './BackendSystemApi';
import { FileSystem } from '@mhersztowski/core-backend';
import type { DataSource } from '@mhersztowski/core-backend';
import { PersonNode, TaskNode, ProjectNode, ShoppingListNode } from '@mhersztowski/core';
import type { PersonModel, TaskModel, ProjectModel, ShoppingListModel } from '@mhersztowski/core';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backend-api-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function createMockDataSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    persons: [],
    getPersonById: vi.fn().mockReturnValue(undefined),
    tasks: [],
    getTaskById: vi.fn().mockReturnValue(undefined),
    projects: [],
    getProjectById: vi.fn().mockReturnValue(undefined),
    shoppingLists: [],
    getShoppingListById: vi.fn().mockReturnValue(undefined),
    events: [],
    getEventsByDate: vi.fn().mockReturnValue([]),
    findPersons: vi.fn().mockReturnValue([]),
    findTasks: vi.fn().mockReturnValue([]),
    findProjects: vi.fn().mockReturnValue([]),
    findEvents: vi.fn().mockReturnValue([]),
    findShoppingLists: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as DataSource;
}

const personModel: PersonModel = {
  type: 'person',
  id: 'p1',
  nick: 'alice',
  firstName: 'Alice',
  secondName: 'Smith',
};

const taskModel: TaskModel = {
  type: 'task',
  id: 't1',
  name: 'Test Task',
  description: 'A test task',
};

const projectModel: ProjectModel = {
  type: 'project',
  id: 'pr1',
  name: 'Test Project',
  description: 'A test project',
};

const shoppingListModel: ShoppingListModel = {
  type: 'shopping_list',
  id: 'sl1',
  name: 'Groceries',
  store: 'Biedronka',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  items: [],
};

describe('BackendSystemApi', () => {
  let api: BackendSystemApi;
  let mockDataSource: DataSource;

  beforeEach(() => {
    mockDataSource = createMockDataSource();
    api = new BackendSystemApi(fileSystem, mockDataSource, {});
  });

  // ---- file operations ----

  describe('file', () => {
    it('file.read reads content from FileSystem', async () => {
      await fileSystem.writeFile('api-read-test.txt', 'hello from fs');

      const content = await api.file.read('api-read-test.txt');
      expect(content).toBe('hello from fs');
    });

    it('file.write writes content to FileSystem', async () => {
      await api.file.write('api-write-test.txt', 'written by api');

      const fileData = await fileSystem.readFile('api-write-test.txt');
      expect(fileData.content).toBe('written by api');
    });

    it('file.list returns directory listing as string array', async () => {
      await fileSystem.writeFile('listdir/alpha.txt', 'a');
      await fileSystem.writeFile('listdir/beta.txt', 'b');
      await fileSystem.writeFile('listdir/sub/gamma.txt', 'c');

      const names = await api.file.list('listdir');
      expect(names).toContain('alpha.txt');
      expect(names).toContain('beta.txt');
      expect(names).toContain('sub');
      expect(names).toHaveLength(3);
    });
  });

  // ---- data operations ----

  describe('data', () => {
    it('data.getPersons returns models from DataSource', () => {
      const personNode = new PersonNode(personModel);
      mockDataSource = createMockDataSource({ persons: [personNode] as any });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getPersons();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(personModel);
    });

    it('data.getPersonById returns single model when found', () => {
      const personNode = new PersonNode(personModel);
      mockDataSource = createMockDataSource({
        getPersonById: vi.fn().mockReturnValue(personNode),
      });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getPersonById('p1');
      expect(result).toEqual(personModel);
      expect(mockDataSource.getPersonById).toHaveBeenCalledWith('p1');
    });

    it('data.getPersonById returns undefined when not found', () => {
      const result = api.data.getPersonById('nonexistent');
      expect(result).toBeUndefined();
    });

    it('data.getTasks returns task models from DataSource', () => {
      const taskNode = new TaskNode(taskModel);
      mockDataSource = createMockDataSource({ tasks: [taskNode] as any });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getTasks();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t1');
      expect(result[0].name).toBe('Test Task');
    });

    it('data.getTaskById returns single task model', () => {
      const taskNode = new TaskNode(taskModel);
      mockDataSource = createMockDataSource({
        getTaskById: vi.fn().mockReturnValue(taskNode),
      });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getTaskById('t1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('t1');
    });

    it('data.getProjects returns project models from DataSource', () => {
      const projectNode = new ProjectNode(projectModel);
      mockDataSource = createMockDataSource({ projects: [projectNode] as any });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getProjects();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pr1');
      expect(result[0].name).toBe('Test Project');
    });

    it('data.getProjectById returns single project model', () => {
      const projectNode = new ProjectNode(projectModel);
      mockDataSource = createMockDataSource({
        getProjectById: vi.fn().mockReturnValue(projectNode),
      });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getProjectById('pr1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('pr1');
    });

    it('data.getShoppingLists returns shopping list models', () => {
      const listNode = new ShoppingListNode(shoppingListModel);
      mockDataSource = createMockDataSource({ shoppingLists: [listNode] as any });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getShoppingLists();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sl1');
      expect(result[0].name).toBe('Groceries');
    });

    it('data.getShoppingListById returns single shopping list model', () => {
      const listNode = new ShoppingListNode(shoppingListModel);
      mockDataSource = createMockDataSource({
        getShoppingListById: vi.fn().mockReturnValue(listNode),
      });
      api = new BackendSystemApi(fileSystem, mockDataSource, {});

      const result = api.data.getShoppingListById('sl1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('sl1');
    });
  });

  // ---- variables ----

  describe('variables', () => {
    it('variables.get returns stored value', () => {
      api.variables.set('key1', 42);
      expect(api.variables.get('key1')).toBe(42);
    });

    it('variables.get returns undefined for missing key', () => {
      expect(api.variables.get('missing')).toBeUndefined();
    });

    it('variables.set stores value', () => {
      api.variables.set('name', 'test');
      expect(api.variables.get('name')).toBe('test');
    });

    it('variables.set overwrites existing value', () => {
      api.variables.set('counter', 1);
      api.variables.set('counter', 2);
      expect(api.variables.get('counter')).toBe(2);
    });

    it('variables.getAll returns a copy of all variables', () => {
      api.variables.set('a', 1);
      api.variables.set('b', 'two');

      const all = api.variables.getAll();
      expect(all).toEqual({ a: 1, b: 'two' });

      // Verify it is a copy (mutation does not affect internal state)
      all.a = 999;
      expect(api.variables.get('a')).toBe(1);
    });

    it('constructor receives initial variables', () => {
      const apiWithVars = new BackendSystemApi(fileSystem, mockDataSource, { x: 10, y: 'hello' });
      expect(apiWithVars.variables.get('x')).toBe(10);
      expect(apiWithVars.variables.get('y')).toBe('hello');
    });
  });

  // ---- log ----

  describe('log', () => {
    it('log.info appends to logs with level info', () => {
      api.log.info('info message');

      expect(api.logs).toHaveLength(1);
      expect(api.logs[0].level).toBe('info');
      expect(api.logs[0].message).toBe('info message');
      expect(api.logs[0].timestamp).toBeGreaterThan(0);
    });

    it('log.warn appends to logs with level warn', () => {
      api.log.warn('warn message');

      expect(api.logs).toHaveLength(1);
      expect(api.logs[0].level).toBe('warn');
      expect(api.logs[0].message).toBe('warn message');
    });

    it('log.error appends to logs with level error', () => {
      api.log.error('error message');

      expect(api.logs).toHaveLength(1);
      expect(api.logs[0].level).toBe('error');
      expect(api.logs[0].message).toBe('error message');
    });

    it('log.debug appends to logs with level debug', () => {
      api.log.debug('debug message');

      expect(api.logs).toHaveLength(1);
      expect(api.logs[0].level).toBe('debug');
      expect(api.logs[0].message).toBe('debug message');
    });

    it('log stringifies non-string values', () => {
      api.log.info({ key: 'value' } as any);

      expect(api.logs).toHaveLength(1);
      expect(api.logs[0].message).toBe('{"key":"value"}');
    });

    it('multiple log calls accumulate entries', () => {
      api.log.info('first');
      api.log.warn('second');
      api.log.error('third');

      expect(api.logs).toHaveLength(3);
      expect(api.logs.map(l => l.level)).toEqual(['info', 'warn', 'error']);
    });
  });

  // ---- notify ----

  describe('notify', () => {
    it('appends notification with default severity info', () => {
      api.notify('hello');

      expect(api.notifications).toHaveLength(1);
      expect(api.notifications[0].message).toBe('hello');
      expect(api.notifications[0].severity).toBe('info');
      expect(api.notifications[0].timestamp).toBeGreaterThan(0);
    });

    it('appends notification with specified severity', () => {
      api.notify('error occurred', 'error');

      expect(api.notifications).toHaveLength(1);
      expect(api.notifications[0].severity).toBe('error');
    });

    it('supports all severity levels', () => {
      api.notify('s', 'success');
      api.notify('i', 'info');
      api.notify('w', 'warning');
      api.notify('e', 'error');

      expect(api.notifications.map(n => n.severity)).toEqual([
        'success', 'info', 'warning', 'error',
      ]);
    });
  });

  // ---- utils ----

  describe('utils', () => {
    it('uuid generates a valid UUID string', () => {
      const id = api.utils.uuid();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('uuid generates unique values', () => {
      const a = api.utils.uuid();
      const b = api.utils.uuid();
      expect(a).not.toBe(b);
    });

    it('dayjs returns a dayjs instance for current time', () => {
      const now = api.utils.dayjs();
      expect(now.isValid()).toBe(true);
      expect(now.year()).toBe(new Date().getFullYear());
    });

    it('dayjs parses a date string', () => {
      const d = api.utils.dayjs('2026-03-15');
      expect(d.isValid()).toBe(true);
      expect(d.year()).toBe(2026);
      expect(d.month()).toBe(2); // 0-indexed
      expect(d.date()).toBe(15);
    });

    it('sleep resolves after specified ms', async () => {
      const start = Date.now();
      await api.utils.sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  // ---- AI stubs ----

  describe('ai', () => {
    it('ai.chat throws not available error', async () => {
      await expect(api.ai.chat('prompt')).rejects.toThrow('AI not available on backend');
    });

    it('ai.chatVision throws not available error', async () => {
      await expect(api.ai.chatVision('prompt', 'base64data')).rejects.toThrow('AI not available on backend');
    });

    it('ai.chatMessages throws not available error', async () => {
      await expect(api.ai.chatMessages([])).rejects.toThrow('AI not available on backend');
    });

    it('ai.isConfigured returns false', () => {
      expect(api.ai.isConfigured()).toBe(false);
    });
  });

  // ---- Speech stubs ----

  describe('speech', () => {
    it('speech.say throws not available error', async () => {
      await expect(api.speech.say('hello')).rejects.toThrow('Speech (TTS) not available on backend');
    });

    it('speech.stop is a no-op and does not throw', () => {
      expect(() => api.speech.stop()).not.toThrow();
    });

    it('speech.isTtsConfigured returns false', () => {
      expect(api.speech.isTtsConfigured()).toBe(false);
    });

    it('speech.isSttConfigured returns false', () => {
      expect(api.speech.isSttConfigured()).toBe(false);
    });
  });

  // ---- shopping ----

  describe('shopping', () => {
    let shoppingApi: BackendSystemApi;

    beforeEach(async () => {
      // Seed shopping lists in the DataSource mock and filesystem
      const listNode = new ShoppingListNode({
        ...shoppingListModel,
        items: [
          { type: 'shopping_item', id: 'item1', name: 'Milk', checked: false },
        ],
      });
      const ds = createMockDataSource({ shoppingLists: [listNode] as any });
      shoppingApi = new BackendSystemApi(fileSystem, ds, {});

      // Write initial shopping data to filesystem so _getShoppingLists works
      await fileSystem.writeFile('data/shopping_lists.json', JSON.stringify({
        type: 'shopping_lists',
        lists: [{
          ...shoppingListModel,
          items: [{ type: 'shopping_item', id: 'item1', name: 'Milk', checked: false }],
        }],
      }, null, 2));
    });

    it('shopping.createList creates a new list and persists it', async () => {
      const newList = await shoppingApi.shopping.createList('Party', { store: 'Lidl', budget: 100 });

      expect(newList.name).toBe('Party');
      expect(newList.store).toBe('Lidl');
      expect(newList.budget).toBe(100);
      expect(newList.status).toBe('active');
      expect(newList.id).toBeTruthy();
      expect(newList.items).toEqual([]);

      // Verify persisted to filesystem
      const raw = await fileSystem.readFile('data/shopping_lists.json');
      const persisted = JSON.parse(raw.content);
      expect(persisted.lists).toHaveLength(2);
    });

    it('shopping.addItem adds an item to an existing list', async () => {
      const item = await shoppingApi.shopping.addItem('sl1', 'Bread', { quantity: 2, unit: 'pcs', category: 'bakery', estimatedPrice: 5 });

      expect(item.name).toBe('Bread');
      expect(item.quantity).toBe(2);
      expect(item.unit).toBe('pcs');
      expect(item.category).toBe('bakery');
      expect(item.estimatedPrice).toBe(5);
      expect(item.checked).toBe(false);
    });

    it('shopping.addItem throws for non-existent list', async () => {
      await expect(shoppingApi.shopping.addItem('nonexistent', 'Bread')).rejects.toThrow('Shopping list not found');
    });

    it('shopping.checkItem marks an item as checked', async () => {
      await shoppingApi.shopping.checkItem('sl1', 'item1', 3.5);

      const raw = await fileSystem.readFile('data/shopping_lists.json');
      const data = JSON.parse(raw.content);
      const item = data.lists[0].items[0];
      expect(item.checked).toBe(true);
      expect(item.actualPrice).toBe(3.5);
    });

    it('shopping.uncheckItem marks an item as unchecked', async () => {
      // First check it
      await shoppingApi.shopping.checkItem('sl1', 'item1');
      // Then uncheck
      await shoppingApi.shopping.uncheckItem('sl1', 'item1');

      const raw = await fileSystem.readFile('data/shopping_lists.json');
      const data = JSON.parse(raw.content);
      expect(data.lists[0].items[0].checked).toBe(false);
    });

    it('shopping.removeItem removes an item from the list', async () => {
      await shoppingApi.shopping.removeItem('sl1', 'item1');

      const raw = await fileSystem.readFile('data/shopping_lists.json');
      const data = JSON.parse(raw.content);
      expect(data.lists[0].items).toHaveLength(0);
    });

    it('shopping.completeList sets status to completed', async () => {
      await shoppingApi.shopping.completeList('sl1');

      const raw = await fileSystem.readFile('data/shopping_lists.json');
      const data = JSON.parse(raw.content);
      expect(data.lists[0].status).toBe('completed');
      expect(data.lists[0].completedAt).toBeTruthy();
    });

    it('shopping.completeList throws for non-existent list', async () => {
      await expect(shoppingApi.shopping.completeList('nonexistent')).rejects.toThrow('Shopping list not found');
    });
  });
});
