import { NodeBase } from './NodeBase';
import { ProjectModel, ProjectComponentModel } from '../models/ProjectModel';
import { TaskNode } from './TaskNode';

export class ProjectNode extends NodeBase<ProjectModel> {
  readonly type = 'project' as const;
  id: string;
  name: string;
  description?: string;
  cost?: number;
  components?: ProjectComponentModel[];

  private _children: ProjectNode[] = [];
  private _tasks: TaskNode[] = [];
  private _parent: ProjectNode | null = null;
  private _pathCache: string[] | null = null;

  constructor(model: ProjectModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.description = model.description;
    this.cost = model.cost;
    this.components = model.components;

    if (model.projects) {
      this._children = model.projects.map(p => {
        const child = new ProjectNode(p);
        child._parent = this;
        return child;
      });
    }

    if (model.tasks) {
      this._tasks = model.tasks.map(t => {
        const taskNode = TaskNode.fromModel(t);
        taskNode.setProjectRef({ id: this.id, name: this.name });
        return taskNode;
      });
    }
  }

  static fromModel(model: ProjectModel): ProjectNode {
    return new ProjectNode(model);
  }

  static fromModels(models: ProjectModel[]): ProjectNode[] {
    return models.map(m => ProjectNode.fromModel(m));
  }

  get children(): ProjectNode[] {
    return this._children;
  }

  get tasks(): TaskNode[] {
    return this._tasks;
  }

  get parent(): ProjectNode | null {
    return this._parent;
  }

  getDisplayName(): string {
    return this.name;
  }

  hasChildren(): boolean {
    return this._children.length > 0;
  }

  hasTasks(): boolean {
    return this._tasks.length > 0;
  }

  isRoot(): boolean {
    return this._parent === null;
  }

  getDepth(): number {
    let depth = 0;
    let current: ProjectNode | null = this._parent;
    while (current) {
      depth++;
      current = current._parent;
    }
    return depth;
  }

  getPath(): string[] {
    if (this._pathCache) return this._pathCache;

    const path: string[] = [];
    let current: ProjectNode | null = this;
    while (current) {
      path.unshift(current.name);
      current = current._parent;
    }
    this._pathCache = path;
    return path;
  }

  getPathString(separator: string = ' / '): string {
    return this.getPath().join(separator);
  }

  findChildById(id: string): ProjectNode | null {
    for (const child of this._children) {
      if (child.id === id) return child;
      const found = child.findChildById(id);
      if (found) return found;
    }
    return null;
  }

  findTaskById(id: string): TaskNode | null {
    for (const task of this._tasks) {
      if (task.id === id) return task;
    }
    for (const child of this._children) {
      const found = child.findTaskById(id);
      if (found) return found;
    }
    return null;
  }

  getTaskCount(recursive: boolean = true): number {
    let count = this._tasks.length;
    if (recursive) {
      for (const child of this._children) {
        count += child.getTaskCount(true);
      }
    }
    return count;
  }

  getTotalCost(recursive: boolean = true): number {
    let total = this.cost ?? 0;

    for (const task of this._tasks) {
      total += task.cost ?? 0;
    }

    if (recursive) {
      for (const child of this._children) {
        total += child.getTotalCost(true);
      }
    }

    return total;
  }

  getCostFormatted(currency: string = 'PLN', recursive: boolean = false): string {
    const cost = recursive ? this.getTotalCost(true) : (this.cost ?? 0);
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(cost);
  }

  getTotalDuration(recursive: boolean = true): number {
    let total = 0;

    for (const task of this._tasks) {
      total += task.duration ?? 0;
    }

    if (recursive) {
      for (const child of this._children) {
        total += child.getTotalDuration(true);
      }
    }

    return total;
  }

  getAllTasks(): TaskNode[] {
    const tasks: TaskNode[] = [...this._tasks];
    for (const child of this._children) {
      tasks.push(...child.getAllTasks());
    }
    return tasks;
  }

  getAllProjects(): ProjectNode[] {
    const projects: ProjectNode[] = [];
    for (const child of this._children) {
      projects.push(child);
      projects.push(...child.getAllProjects());
    }
    return projects;
  }

  addChild(child: ProjectNode): this {
    child._parent = this;
    child._pathCache = null;
    this._children.push(child);
    this.markDirty();
    return this;
  }

  removeChild(id: string): ProjectNode | null {
    const index = this._children.findIndex(c => c.id === id);
    if (index === -1) return null;
    const removed = this._children.splice(index, 1)[0];
    removed._parent = null;
    this.markDirty();
    return removed;
  }

  addTask(task: TaskNode): this {
    task.setProjectRef({ id: this.id, name: this.name });
    this._tasks.push(task);
    this.markDirty();
    return this;
  }

  removeTask(id: string): TaskNode | null {
    const index = this._tasks.findIndex(t => t.id === id);
    if (index === -1) return null;
    const removed = this._tasks.splice(index, 1)[0];
    removed.setProjectRef(null);
    this.markDirty();
    return removed;
  }

  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  matchesDeep(query: string): boolean {
    if (this.matches(query)) return true;

    for (const task of this._tasks) {
      if (task.matches(query)) return true;
    }

    for (const child of this._children) {
      if (child.matchesDeep(query)) return true;
    }

    return false;
  }

  toModel(): ProjectModel {
    return {
      type: 'project',
      id: this.id,
      name: this.name,
      description: this.description,
      cost: this.cost,
      projects: this._children.length > 0 ? this._children.map(c => c.toModel()) : undefined,
      tasks: this._tasks.length > 0 ? this._tasks.map(t => t.toModel()) : undefined,
      components: this.components,
    };
  }

  clone(): ProjectNode {
    const cloned = new ProjectNode(this.toModel());
    cloned._isDirty = this._isDirty;
    return cloned;
  }

  equals(other: ProjectNode | ProjectModel): boolean {
    return this.id === other.id;
  }
}
