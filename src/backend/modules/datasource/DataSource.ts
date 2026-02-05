import { EventEmitter } from 'events';
import { FileSystem, DirectoryTree } from '../filesystem/FileSystem';
import { PersonNode } from './nodes/PersonNode';
import { TaskNode } from './nodes/TaskNode';
import { ProjectNode } from './nodes/ProjectNode';
import { EventNode } from './nodes/EventNode';
import { ShoppingListNode } from './nodes/ShoppingListNode';
import { PersonsModel } from './models/PersonModel';
import { TasksModel } from './models/TaskModel';
import { ProjectsModel } from './models/ProjectModel';
import { EventsModel } from './models/EventModel';
import { ShoppingListsModel, ShoppingItemModel } from './models/ShoppingModel';
import { Calendar, CalendarItem } from './data/Calendar';

// Map known file paths to their data types
const DATA_FILE_MAP: Record<string, string> = {
  'data/persons.json': 'persons',
  'data/tasks.json': 'tasks',
  'data/projects.json': 'projects',
  'data/shopping_lists.json': 'shoppingLists',
};

/**
 * DataSource - centralized storage for all parsed Node objects on the backend
 * Auto-updates when files change via FileSystem events
 */
export class DataSource extends EventEmitter {
  private fileSystem: FileSystem;
  private _calendar: Calendar = new Calendar();

  private _persons: Map<string, PersonNode> = new Map();
  private _tasks: Map<string, TaskNode> = new Map();
  private _projects: Map<string, ProjectNode> = new Map();
  private _events: EventNode[] = [];
  private _shoppingLists: Map<string, ShoppingListNode> = new Map();

  private _isLoaded: boolean = false;

  constructor(fileSystem: FileSystem) {
    super();
    this.fileSystem = fileSystem;
  }

  async initialize(): Promise<void> {
    await this.loadAll();
    this._isLoaded = true;
    this.emit('loaded');
  }

  private async loadAll(): Promise<void> {
    // Load in dependency order: projects first (for task linking), then tasks
    await this.loadDataFile('data/persons.json', 'persons');
    await this.loadDataFile('data/projects.json', 'projects');
    await this.loadDataFile('data/tasks.json', 'tasks');
    await this.loadDataFile('data/shopping_lists.json', 'shoppingLists');
    await this.loadCalendarEvents();
  }

  /**
   * Called when a file is written — determines if DataSource needs updating
   */
  async onFileChanged(filePath: string): Promise<void> {
    // Normalize path separators
    const normalized = filePath.replace(/\\/g, '/');

    const dataType = DATA_FILE_MAP[normalized];
    if (dataType) {
      await this.loadDataFile(normalized, dataType);
      console.log(`DataSource: reloaded ${dataType} from ${normalized}`);
      this.emit('dataChanged', { type: dataType, path: normalized });
      return;
    }

    // Check if it's a calendar file: data/calendar/YYYY/MM/DD.json
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
          this.loadPersons(data as PersonsModel);
          break;
        case 'projects':
          this.loadProjects(data as ProjectsModel);
          break;
        case 'tasks':
          this.loadTasks(data as TasksModel);
          break;
        case 'shoppingLists':
          this.loadShoppingLists(data as ShoppingListsModel);
          break;
      }
    } catch (err) {
      // File might not exist yet — that's OK
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`DataSource: Failed to load ${path}:`, err);
      }
    }
  }

  private async loadCalendarEvents(): Promise<void> {
    this._calendar.clear();
    this._events = [];

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

          for (const eventModel of data.tasks) {
            const node = EventNode.fromModel(eventModel);
            // Set date context for time-only events
            if (!eventModel.startTime.includes('T')) {
              node.setDateContext(date);
            }
            // Link to task if exists
            if (node.taskId) {
              const task = this.getTaskById(node.taskId);
              if (task) {
                node.setTaskRef({ id: task.id, name: task.name });
              }
            }
            this._events.push(node);
          }
        } catch (err) {
          console.warn(`DataSource: Failed to parse calendar file ${filePath}:`, err);
        }
      }

      this._events = EventNode.sortByTime(this._events);
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

  // --- Persons ---

  get persons(): PersonNode[] {
    return Array.from(this._persons.values());
  }

  getPersonById(id: string): PersonNode | undefined {
    return this._persons.get(id);
  }

  findPersons(query: string): PersonNode[] {
    if (!query.trim()) return this.persons;
    return this.persons.filter(p => p.matches(query));
  }

  // --- Tasks ---

  get tasks(): TaskNode[] {
    return Array.from(this._tasks.values());
  }

  getTaskById(id: string): TaskNode | undefined {
    return this._tasks.get(id);
  }

  findTasks(query: string): TaskNode[] {
    if (!query.trim()) return this.tasks;
    return this.tasks.filter(t => t.matches(query));
  }

  getTasksByProjectId(projectId: string): TaskNode[] {
    return this.tasks.filter(t => t.projectId === projectId);
  }

  getUnassignedTasks(): TaskNode[] {
    return this.tasks.filter(t => !t.projectId);
  }

  // --- Projects ---

  get projects(): ProjectNode[] {
    return Array.from(this._projects.values());
  }

  getProjectById(id: string): ProjectNode | undefined {
    return this._projects.get(id);
  }

  findProjects(query: string): ProjectNode[] {
    if (!query.trim()) return this.projects;
    return this.projects.filter(p => p.matches(query));
  }

  findProjectByIdDeep(id: string): ProjectNode | undefined {
    for (const project of this._projects.values()) {
      if (project.id === id) return project;
      const found = project.findChildById(id);
      if (found) return found;
    }
    return undefined;
  }

  getAllProjectsFlat(): ProjectNode[] {
    const all: ProjectNode[] = [];
    for (const project of this._projects.values()) {
      all.push(project);
      all.push(...project.getAllProjects());
    }
    return all;
  }

  // --- Shopping Lists ---

  get shoppingLists(): ShoppingListNode[] {
    return Array.from(this._shoppingLists.values());
  }

  getShoppingListById(id: string): ShoppingListNode | undefined {
    return this._shoppingLists.get(id);
  }

  findShoppingLists(query: string): ShoppingListNode[] {
    if (!query.trim()) return this.shoppingLists;
    return this.shoppingLists.filter(l => l.matches(query));
  }

  getActiveShoppingLists(): ShoppingListNode[] {
    return this.shoppingLists.filter(l => l.isActive());
  }

  getCompletedShoppingLists(): ShoppingListNode[] {
    return this.shoppingLists.filter(l => l.isCompleted());
  }

  getShoppingItemsByPersonId(personId: string): { list: ShoppingListNode; item: ShoppingItemModel }[] {
    const results: { list: ShoppingListNode; item: ShoppingItemModel }[] = [];
    for (const list of this._shoppingLists.values()) {
      for (const item of list.getItemsByPerson(personId)) {
        results.push({ list, item });
      }
    }
    return results;
  }

  // --- Events ---

  get events(): EventNode[] {
    return this._events;
  }

  get calendar(): Calendar {
    return this._calendar;
  }

  getEventsByDate(date: Date): EventNode[] {
    const dateStr = date.toISOString().split('T')[0];
    return this._events.filter(e => {
      const eventDate = e.getStartDate();
      return eventDate && eventDate.toISOString().split('T')[0] === dateStr;
    });
  }

  findEvents(query: string): EventNode[] {
    if (!query.trim()) return this._events;
    return this._events.filter(e => e.matches(query));
  }

  getEventsByTaskId(taskId: string): EventNode[] {
    return this._events.filter(e => e.taskId === taskId);
  }

  getLastEventByTaskId(taskId: string): EventNode | undefined {
    const taskEvents = this.getEventsByTaskId(taskId);
    if (taskEvents.length === 0) return undefined;
    return taskEvents[taskEvents.length - 1];
  }

  // --- Loading state ---

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  // --- Load methods ---

  loadPersons(data: PersonsModel): void {
    this._persons.clear();
    if (data.items) {
      for (const model of data.items) {
        const node = PersonNode.fromModel(model);
        this._persons.set(node.id, node);
      }
    }
  }

  loadTasks(data: TasksModel): void {
    this._tasks.clear();
    if (data.tasks) {
      for (const model of data.tasks) {
        const node = TaskNode.fromModel(model);
        if (node.projectId) {
          const project = this.findProjectByIdDeep(node.projectId);
          if (project) {
            node.setProjectRef({ id: project.id, name: project.name });
          }
        }
        this._tasks.set(node.id, node);
      }
    }
  }

  loadProjects(data: ProjectsModel): void {
    this._projects.clear();
    if (data.projects) {
      for (const model of data.projects) {
        const node = ProjectNode.fromModel(model);
        this._projects.set(node.id, node);
      }
    }
    this.relinkTasksToProjects();
  }

  loadShoppingLists(data: ShoppingListsModel): void {
    this._shoppingLists.clear();
    if (data.lists) {
      for (const model of data.lists) {
        const node = ShoppingListNode.fromModel(model);
        this._shoppingLists.set(node.id, node);
      }
    }
  }

  private relinkTasksToProjects(): void {
    for (const task of this._tasks.values()) {
      if (task.projectId) {
        const project = this.findProjectByIdDeep(task.projectId);
        if (project) {
          task.setProjectRef({ id: project.id, name: project.name });
        }
      }
    }
  }

  // --- Clear ---

  clear(): void {
    this._persons.clear();
    this._tasks.clear();
    this._projects.clear();
    this._events = [];
    this._shoppingLists.clear();
    this._calendar.clear();
    this._isLoaded = false;
  }

  // --- Statistics ---

  getStats(): {
    persons: number;
    tasks: number;
    projects: number;
    events: number;
    shoppingLists: number;
  } {
    return {
      persons: this._persons.size,
      tasks: this._tasks.size,
      projects: this._projects.size,
      events: this._events.length,
      shoppingLists: this._shoppingLists.size,
    };
  }
}
