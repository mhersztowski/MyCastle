import { NodeBase } from './NodeBase.js';
import { TaskNode } from './TaskNode.js';

/**
 * ProjectNode — odpowiednik `ProjectNode.ts`.
 *
 * Model (ProjectModel):
 *   { type: 'project', id, name, description?, cost?, projects?, tasks?, components? }
 *
 * Buduje hierarchię: pod-projekty (`_children`) z ustawionym `_parent` oraz
 * zadania (`_tasks`) jako TaskNode z ustawionym projectRef. Ścieżka jest cache'owana.
 */
export class ProjectNode extends NodeBase {
  constructor(model) {
    super();
    this.type = 'project';
    this.id = model.id;
    this.name = model.name;
    this.description = model.description;
    this.cost = model.cost;
    this.components = model.components;

    this._children = [];
    this._tasks = [];
    this._parent = null;
    this._pathCache = null;

    if (model.projects) {
      this._children = model.projects.map((p) => {
        const child = new ProjectNode(p);
        child._parent = this;
        return child;
      });
    }
    if (model.tasks) {
      this._tasks = model.tasks.map((t) => {
        const taskNode = TaskNode.fromModel(t);
        taskNode.setProjectRef({ id: this.id, name: this.name });
        return taskNode;
      });
    }
  }

  static fromModel(model) { return new ProjectNode(model); }
  static fromModels(models) { return (models ?? []).map((m) => new ProjectNode(m)); }

  get children() { return this._children; }
  get tasks() { return this._tasks; }
  get parent() { return this._parent; }

  getDisplayName() { return this.name; }

  hasChildren() { return this._children.length > 0; }
  hasTasks() { return this._tasks.length > 0; }
  isRoot() { return this._parent === null; }

  getDepth() {
    let depth = 0;
    let p = this._parent;
    while (p) { depth++; p = p._parent; }
    return depth;
  }

  getPath() {
    if (this._pathCache) return this._pathCache;
    const path = [];
    let n = this;
    while (n) { path.unshift(n.name); n = n._parent; }
    this._pathCache = path;
    return path;
  }
  getPathString(separator = ' / ') { return this.getPath().join(separator); }

  findChildById(id) {
    for (const c of this._children) {
      if (c.id === id) return c;
      const found = c.findChildById(id);
      if (found) return found;
    }
    return null;
  }
  findTaskById(id) {
    for (const t of this._tasks) if (t.id === id) return t;
    for (const c of this._children) {
      const found = c.findTaskById(id);
      if (found) return found;
    }
    return null;
  }

  getTaskCount(recursive = true) {
    let count = this._tasks.length;
    if (recursive) for (const c of this._children) count += c.getTaskCount(true);
    return count;
  }

  getTotalCost(recursive = true) {
    let total = this.cost ?? 0;
    for (const t of this._tasks) total += t.cost ?? 0;
    if (recursive) for (const c of this._children) total += c.getTotalCost(true);
    return total;
  }
  getCostFormatted(currency = 'PLN', recursive = false) {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency })
      .format(this.getTotalCost(recursive));
  }

  getTotalDuration(recursive = true) {
    let total = 0;
    for (const t of this._tasks) total += t.duration ?? 0;
    if (recursive) for (const c of this._children) total += c.getTotalDuration(true);
    return total;
  }

  getAllTasks() {
    const result = [...this._tasks];
    for (const c of this._children) result.push(...c.getAllTasks());
    return result;
  }
  getAllProjects() {
    const result = [...this._children];
    for (const c of this._children) result.push(...c.getAllProjects());
    return result;
  }

  addChild(child) {
    child._parent = this;
    child._pathCache = null;
    this._children.push(child);
    return this.markDirty();
  }
  removeChild(id) {
    const idx = this._children.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const [removed] = this._children.splice(idx, 1);
    removed._parent = null;
    removed._pathCache = null;
    this.markDirty();
    return removed;
  }

  addTask(task) {
    task.setProjectRef({ id: this.id, name: this.name });
    this._tasks.push(task);
    return this.markDirty();
  }
  removeTask(id) {
    const idx = this._tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const [removed] = this._tasks.splice(idx, 1);
    removed.setProjectRef(null);
    this.markDirty();
    return removed;
  }

  hasComponents() { return Boolean(this.components && this.components.length); }

  matches(query) {
    const q = (query ?? '').toLowerCase();
    return [this.id, this.name, this.description]
      .filter(Boolean)
      .some((s) => s.toLowerCase().includes(q));
  }
  matchesDeep(query) {
    if (this.matches(query)) return true;
    if (this._tasks.some((t) => t.matches(query))) return true;
    return this._children.some((c) => c.matchesDeep(query));
  }

  expandAll() {
    this.setExpanded(true);
    for (const c of this._children) c.expandAll();
    return this;
  }
  collapseAll() {
    this.setExpanded(false);
    for (const c of this._children) c.collapseAll();
    return this;
  }

  toModel() {
    return {
      type: 'project',
      id: this.id,
      name: this.name,
      description: this.description,
      cost: this.cost,
      projects: this._children.length ? this._children.map((c) => c.toModel()) : undefined,
      tasks: this._tasks.length ? this._tasks.map((t) => t.toModel()) : undefined,
      components: this.components,
    };
  }

  clone() { return this.copyBaseStateTo(new ProjectNode(this.toModel())); }

  equals(other) { return Boolean(other) && other.id === this.id; }
}
