import { PersonNode } from '../nodes/PersonNode';
import { TaskNode } from '../nodes/TaskNode';
import { ProjectNode } from '../nodes/ProjectNode';
import { EventNode } from '../nodes/EventNode';
import { ShoppingListNode } from '../nodes/ShoppingListNode';
import { PersonsModel } from '../models/PersonModel';
import { TasksModel } from '../models/TaskModel';
import { ProjectsModel } from '../models/ProjectModel';
import { ShoppingListsModel, ShoppingItemModel } from '../models/ShoppingModel';
import { CalendarItem } from './Calendar';

/**
 * DataSource - centralized storage for all parsed Node objects
 * Provides efficient lookup and filtering across all data types
 */
export class DataSource {
  private _persons: Map<string, PersonNode> = new Map();
  private _tasks: Map<string, TaskNode> = new Map();
  private _projects: Map<string, ProjectNode> = new Map();
  private _events: EventNode[] = [];
  private _shoppingLists: Map<string, ShoppingListNode> = new Map();

  private _isLoaded: boolean = false;

  // Persons
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

  // Tasks
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

  // Projects
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

  // Deep search in project hierarchy
  findProjectByIdDeep(id: string): ProjectNode | undefined {
    for (const project of this._projects.values()) {
      if (project.id === id) return project;
      const found = project.findChildById(id);
      if (found) return found;
    }
    return undefined;
  }

  // Get all projects flattened (including nested)
  getAllProjectsFlat(): ProjectNode[] {
    const all: ProjectNode[] = [];
    for (const project of this._projects.values()) {
      all.push(project);
      all.push(...project.getAllProjects());
    }
    return all;
  }

  // Shopping Lists
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

  // Events
  get events(): EventNode[] {
    return this._events;
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
    // Events are already sorted by time, get the last one
    return taskEvents[taskEvents.length - 1];
  }

  // Loading state
  get isLoaded(): boolean {
    return this._isLoaded;
  }

  // Load data from parsed JSON files
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
        // Link to project if exists
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
    // Re-link tasks to projects after projects are loaded
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

  loadEventsFromCalendar(calendarItems: CalendarItem[]): void {
    this._events = [];
    for (const item of calendarItems) {
      const date = item.getDate();
      for (const eventModel of item.getEvents()) {
        const node = EventNode.fromModel(eventModel);
        // Set the date context for the event
        if (!eventModel.startTime.includes('T')) {
          // If startTime is just time, create full date
          const [hours, minutes] = eventModel.startTime.split(':').map(Number);
          const fullDate = new Date(date);
          fullDate.setHours(hours || 0, minutes || 0, 0, 0);
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
    }
    // Sort events by time
    this._events = EventNode.sortByTime(this._events);
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

  // Mark as loaded
  setLoaded(value: boolean): void {
    this._isLoaded = value;
  }

  // Clear all data
  clear(): void {
    this._persons.clear();
    this._tasks.clear();
    this._projects.clear();
    this._events = [];
    this._shoppingLists.clear();
    this._isLoaded = false;
  }

  // Statistics
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
