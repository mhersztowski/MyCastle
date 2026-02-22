import { EventEmitter } from 'events';
import { FileSystem, DirectoryTree } from '../filesystem/FileSystem';
import {
  MemoryDataSource,
  Calendar,
  CalendarItem,
  PersonNode,
  TaskNode,
  ProjectNode,
  EventNode,
  ShoppingListNode,
  PersonsModel,
  TasksModel,
  ProjectsModel,
  EventsModel,
  ShoppingListsModel,
  ShoppingItemModel,
} from '@mhersztowski/core';
import type { IDataSource, DataSourceStats } from '@mhersztowski/core';

const DATA_FILE_MAP: Record<string, string> = {
  'data/persons.json': 'persons',
  'data/tasks.json': 'tasks',
  'data/projects.json': 'projects',
  'data/shopping_lists.json': 'shoppingLists',
};

export class DataSource extends EventEmitter implements IDataSource {
  private fileSystem: FileSystem;
  private _store: MemoryDataSource = new MemoryDataSource();
  private _calendar: Calendar = new Calendar();

  constructor(fileSystem: FileSystem) {
    super();
    this.fileSystem = fileSystem;
  }

  async initialize(): Promise<void> {
    await this.loadAll();
    this._store.setLoaded(true);
    this.emit('loaded');
  }

  private async loadAll(): Promise<void> {
    await this.loadDataFile('data/persons.json', 'persons');
    await this.loadDataFile('data/projects.json', 'projects');
    await this.loadDataFile('data/tasks.json', 'tasks');
    await this.loadDataFile('data/shopping_lists.json', 'shoppingLists');
    await this.loadCalendarEvents();
  }

  async onFileChanged(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');

    const dataType = DATA_FILE_MAP[normalized];
    if (dataType) {
      await this.loadDataFile(normalized, dataType);
      console.log(`DataSource: reloaded ${dataType} from ${normalized}`);
      this.emit('dataChanged', { type: dataType, path: normalized });
      return;
    }

    if (/^data\/calendar\/\d{4}\/\d{2}\/\d{2}\.json$/.test(normalized)) {
      await this.loadCalendarEvents();
      console.log(`DataSource: reloaded events from calendar change: ${normalized}`);
      this.emit('dataChanged', { type: 'events', path: normalized });
    }
  }

  private async loadDataFile(path: string, type: string): Promise<void> {
    try {
      const fileData = await this.fileSystem.readFile(path);
      const data = JSON.parse(fileData.content);

      switch (type) {
        case 'persons':
          this._store.loadPersons(data as PersonsModel);
          break;
        case 'projects':
          this._store.loadProjects(data as ProjectsModel);
          break;
        case 'tasks':
          this._store.loadTasks(data as TasksModel);
          break;
        case 'shoppingLists':
          this._store.loadShoppingLists(data as ShoppingListsModel);
          break;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`DataSource: Failed to load ${path}:`, err);
      }
    }
  }

  private async loadCalendarEvents(): Promise<void> {
    this._calendar.clear();

    try {
      const calendarExists = await this.fileSystem.exists('data/calendar');
      if (!calendarExists) return;

      const calendarTree = await this.fileSystem.listDirectory('data/calendar');
      const calendarFiles = this.findCalendarFiles(calendarTree);

      for (const filePath of calendarFiles) {
        try {
          const fileData = await this.fileSystem.readFile(filePath);
          const data = JSON.parse(fileData.content) as EventsModel;

          const dateMatch = filePath.match(/calendar\/(\d{4})\/(\d{2})\/(\d{2})\.json$/);
          if (!dateMatch || data.type !== 'events' || !Array.isArray(data.tasks)) continue;

          const year = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const day = parseInt(dateMatch[3], 10);
          const date = new Date(year, month, day);

          const calendarItem = new CalendarItem(date, data.tasks);
          this._calendar.addItem(calendarItem);
        } catch (err) {
          console.warn(`DataSource: Failed to parse calendar file ${filePath}:`, err);
        }
      }

      this._store.loadEventsFromCalendar(this._calendar.getItems());
    } catch (err) {
      console.warn('DataSource: Failed to load calendar events:', err);
    }
  }

  private findCalendarFiles(tree: DirectoryTree): string[] {
    const files: string[] = [];
    if (tree.type === 'file' && tree.path.endsWith('.json')) {
      files.push(tree.path);
    }
    if (tree.children) {
      for (const child of tree.children) {
        files.push(...this.findCalendarFiles(child));
      }
    }
    return files;
  }

  // --- IDataSource delegation ---

  get persons(): PersonNode[] { return this._store.persons; }
  getPersonById(id: string): PersonNode | undefined { return this._store.getPersonById(id); }
  findPersons(query: string): PersonNode[] { return this._store.findPersons(query); }

  get tasks(): TaskNode[] { return this._store.tasks; }
  getTaskById(id: string): TaskNode | undefined { return this._store.getTaskById(id); }
  findTasks(query: string): TaskNode[] { return this._store.findTasks(query); }
  getTasksByProjectId(projectId: string): TaskNode[] { return this._store.getTasksByProjectId(projectId); }
  getUnassignedTasks(): TaskNode[] { return this._store.getUnassignedTasks(); }

  get projects(): ProjectNode[] { return this._store.projects; }
  getProjectById(id: string): ProjectNode | undefined { return this._store.getProjectById(id); }
  findProjects(query: string): ProjectNode[] { return this._store.findProjects(query); }
  findProjectByIdDeep(id: string): ProjectNode | undefined { return this._store.findProjectByIdDeep(id); }
  getAllProjectsFlat(): ProjectNode[] { return this._store.getAllProjectsFlat(); }

  get shoppingLists(): ShoppingListNode[] { return this._store.shoppingLists; }
  getShoppingListById(id: string): ShoppingListNode | undefined { return this._store.getShoppingListById(id); }
  findShoppingLists(query: string): ShoppingListNode[] { return this._store.findShoppingLists(query); }
  getActiveShoppingLists(): ShoppingListNode[] { return this._store.getActiveShoppingLists(); }
  getCompletedShoppingLists(): ShoppingListNode[] { return this._store.getCompletedShoppingLists(); }
  getShoppingItemsByPersonId(personId: string): { list: ShoppingListNode; item: ShoppingItemModel }[] {
    return this._store.getShoppingItemsByPersonId(personId);
  }

  get events(): EventNode[] { return this._store.events; }
  get calendar(): Calendar { return this._calendar; }
  getEventsByDate(date: Date): EventNode[] { return this._store.getEventsByDate(date); }
  findEvents(query: string): EventNode[] { return this._store.findEvents(query); }
  getEventsByTaskId(taskId: string): EventNode[] { return this._store.getEventsByTaskId(taskId); }
  getLastEventByTaskId(taskId: string): EventNode | undefined { return this._store.getLastEventByTaskId(taskId); }

  get isLoaded(): boolean { return this._store.isLoaded; }
  getStats(): DataSourceStats { return this._store.getStats(); }

  clear(): void {
    this._store.clear();
    this._calendar.clear();
  }
}
