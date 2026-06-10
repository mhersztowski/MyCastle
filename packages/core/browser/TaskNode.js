import { NodeBase } from './NodeBase.js';

/**
 * TaskNode — odpowiednik `TaskNode.ts`.
 *
 * Model (TaskModel):
 *   { type: 'task', id, projectId?, name, description?, duration?, cost?, components? }
 *
 * Dodatkowy stan runtime: _isCompleted, _progress (0–100), _projectRef.
 * Komponenty (components[]) to lista obiektów `{ type, ... }`, np.
 *   task_interval  → { type: 'task_interval', daysInterval }
 *   task_sequence  → { type: 'task_sequence', tasks? }
 *   task_test      → { type: 'task_test', name, description }
 */
export class TaskNode extends NodeBase {
  constructor(model) {
    super();
    this.type = 'task';
    this.id = model.id;
    this.projectId = model.projectId;
    this.name = model.name;
    this.description = model.description;
    this.duration = model.duration; // w godzinach
    this.cost = model.cost;
    this.components = model.components;

    this._isCompleted = false;
    this._progress = 0; // 0–100
    this._projectRef = null; // { id, name }
  }

  static fromModel(model) { return new TaskNode(model); }
  static fromModels(models) { return (models ?? []).map((m) => new TaskNode(m)); }

  get isCompleted() { return this._isCompleted; }
  setCompleted(value) {
    this._isCompleted = value;
    if (value) this._progress = 100;
    return this;
  }
  toggleCompleted() { return this.setCompleted(!this._isCompleted); }

  get progress() { return this._progress; }
  setProgress(value) {
    this._progress = Math.max(0, Math.min(100, value));
    if (this._progress === 100) this._isCompleted = true;
    return this;
  }

  get projectRef() { return this._projectRef; }
  setProjectRef(ref) {
    this._projectRef = ref;
    if (ref?.id) this.projectId = ref.id;
    return this;
  }

  getDisplayName() { return this.name; }

  hasProject() { return Boolean(this.projectId); }
  getProjectName() { return this._projectRef?.name ?? null; }

  getDurationHours() { return this.duration ?? null; }
  getDurationFormatted() {
    if (this.duration == null) return null;
    if (this.duration < 24) return `${this.duration}h`;
    const days = Math.floor(this.duration / 24);
    const hours = this.duration % 24;
    return hours ? `${days}d${hours}h` : `${days}d`;
  }

  getCostFormatted(currency = 'PLN') {
    if (this.cost == null) return null;
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(this.cost);
  }
  hasCost() { return (this.cost ?? 0) > 0; }
  hasDuration() { return (this.duration ?? 0) > 0; }

  hasComponents() { return Boolean(this.components && this.components.length); }
  getComponentByType(type) { return this.components?.find((c) => c.type === type); }
  getIntervalComponent() { return this.getComponentByType('task_interval'); }
  hasInterval() { return Boolean(this.getIntervalComponent()); }
  getDaysInterval() { return this.getIntervalComponent()?.daysInterval ?? null; }
  getDaysIntervalFormatted() {
    const d = this.getDaysInterval();
    if (d == null) return null;
    if (d === 1) return '1 day';
    if (d % 7 === 0) { const w = d / 7; return w === 1 ? '1 week' : `${w} weeks`; }
    return `${d} days`;
  }

  matches(query) {
    const q = (query ?? '').toLowerCase();
    return [this.id, this.name, this.description, this.projectId]
      .filter(Boolean)
      .some((s) => s.toLowerCase().includes(q));
  }

  updateFrom(model) {
    if (model.projectId !== undefined) this.projectId = model.projectId;
    if (model.name !== undefined) this.name = model.name;
    if (model.description !== undefined) this.description = model.description;
    if (model.duration !== undefined) this.duration = model.duration;
    if (model.cost !== undefined) this.cost = model.cost;
    if (model.components !== undefined) this.components = model.components;
    return this.markDirty();
  }

  toModel() {
    return {
      type: 'task',
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      description: this.description,
      duration: this.duration,
      cost: this.cost,
      components: this.components,
    };
  }

  clone() {
    const c = new TaskNode(this.toModel());
    c._isCompleted = this._isCompleted;
    c._progress = this._progress;
    c._projectRef = this._projectRef ? { ...this._projectRef } : null;
    return this.copyBaseStateTo(c);
  }

  resetState() {
    super.resetState();
    this._isCompleted = false;
    this._progress = 0;
    return this;
  }

  equals(other) { return Boolean(other) && other.id === this.id; }
}
