import { PersonNode } from '../nodes/PersonNode';
import { TaskNode } from '../nodes/TaskNode';
import { ProjectNode } from '../nodes/ProjectNode';
import { EventNode } from '../nodes/EventNode';
import { ShoppingListNode } from '../nodes/ShoppingListNode';
import { ShoppingItemModel } from '../models/ShoppingModel';

export interface DataSourceStats {
  persons: number;
  tasks: number;
  projects: number;
  events: number;
  shoppingLists: number;
}

export interface IDataSource {
  // Persons
  readonly persons: PersonNode[];
  getPersonById(id: string): PersonNode | undefined;
  findPersons(query: string): PersonNode[];

  // Tasks
  readonly tasks: TaskNode[];
  getTaskById(id: string): TaskNode | undefined;
  findTasks(query: string): TaskNode[];
  getTasksByProjectId(projectId: string): TaskNode[];
  getUnassignedTasks(): TaskNode[];

  // Projects
  readonly projects: ProjectNode[];
  getProjectById(id: string): ProjectNode | undefined;
  findProjects(query: string): ProjectNode[];
  findProjectByIdDeep(id: string): ProjectNode | undefined;
  getAllProjectsFlat(): ProjectNode[];

  // Shopping Lists
  readonly shoppingLists: ShoppingListNode[];
  getShoppingListById(id: string): ShoppingListNode | undefined;
  findShoppingLists(query: string): ShoppingListNode[];
  getActiveShoppingLists(): ShoppingListNode[];
  getCompletedShoppingLists(): ShoppingListNode[];
  getShoppingItemsByPersonId(personId: string): { list: ShoppingListNode; item: ShoppingItemModel }[];

  // Events
  readonly events: EventNode[];
  getEventsByDate(date: Date): EventNode[];
  findEvents(query: string): EventNode[];
  getEventsByTaskId(taskId: string): EventNode[];
  getLastEventByTaskId(taskId: string): EventNode | undefined;

  // State
  readonly isLoaded: boolean;
  getStats(): DataSourceStats;
}
