/**
 * mycastle.js — przeglądarkowy bundel @mhersztowski/core (PIM): węzły
 * NodeBase / PersonNode / TaskNode / EventNode / ProjectNode + klienty API
 * (ApiClient / ApiTask / ApiPerson / ApiProject / ApiEvent).
 *
 * Wygenerowany ze sklejenia plików katalogu mycastle/. BEZ import/export —
 * klasy są eksportowane przez globalny namespace (window/globalThis), więc
 * działają też w skryptach automatyzacji (AsyncFunction/eval). Każda klasa ma
 * metody instancji ORAZ ich statyczne odpowiedniki (`Class.foo(self, …)`) —
 * dla wygodnych podpowiedzi w edytorach.
 *
 * NIE edytuj ręcznie — generowane przez _build.mjs ze źródeł w mycastle/.
 */

// ════════════════════ NodeBase.js ════════════════════
/**
 * NodeBase — bazowa klasa węzła (czysty przeglądarkowy ES module).
 *
 * Odpowiednik `packages/core/src/nodes/NodeBase.ts`, ale bez TypeScriptu i bez
 * żadnego builda — plik można importować wprost w przeglądarce:
 *
 *   import { PersonNode } from './browser/index.js';
 *
 * Trzyma stan UI (zaznaczenie / rozwinięcie / edycja / dirty) oraz wspólne
 * helpery. Klasy pochodne nadpisują getDisplayName(), toModel(), clone(), matches().
 */
class NodeBase {
  constructor() {
    this._isSelected = false;
    this._isExpanded = false;
    this._isEditing = false;
    this._isDirty = false;
  }

  get isSelected() { return this._isSelected; }
  setSelected(value) { this._isSelected = value; return this; }
  toggleSelected() { this._isSelected = !this._isSelected; return this; }

  get isExpanded() { return this._isExpanded; }
  setExpanded(value) { this._isExpanded = value; return this; }
  toggleExpanded() { this._isExpanded = !this._isExpanded; return this; }

  get isEditing() { return this._isEditing; }
  setEditing(value) { this._isEditing = value; return this; }

  get isDirty() { return this._isDirty; }
  setDirty(value) { this._isDirty = value; return this; }
  markDirty() { this._isDirty = true; return this; }
  markClean() { this._isDirty = false; return this; }

  /** Reset całego stanu UI do wartości domyślnych. */
  resetState() {
    this._isSelected = false;
    this._isExpanded = false;
    this._isEditing = false;
    this._isDirty = false;
    return this;
  }

  /** Kopiuje stan UI tego węzła do innego (używane w clone()). */
  copyBaseStateTo(target) {
    target._isSelected = this._isSelected;
    target._isExpanded = this._isExpanded;
    target._isEditing = this._isEditing;
    target._isDirty = this._isDirty;
    return target;
  }

  // ── Do nadpisania w klasach pochodnych ──
  getDisplayName() { throw new Error('getDisplayName() not implemented'); }
  toModel() { throw new Error('toModel() not implemented'); }
  clone() { throw new Error('clone() not implemented'); }
  matches(_query) { return false; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: NodeBase.foo(self, …)) ──
  static isSelected(self) { return self.isSelected; }
  static setSelected(self, value) { return self.setSelected(value); }
  static toggleSelected(self) { return self.toggleSelected(); }
  static isExpanded(self) { return self.isExpanded; }
  static setExpanded(self, value) { return self.setExpanded(value); }
  static toggleExpanded(self) { return self.toggleExpanded(); }
  static isEditing(self) { return self.isEditing; }
  static setEditing(self, value) { return self.setEditing(value); }
  static isDirty(self) { return self.isDirty; }
  static setDirty(self, value) { return self.setDirty(value); }
  static markDirty(self) { return self.markDirty(); }
  static markClean(self) { return self.markClean(); }
  static resetState(self) { return self.resetState(); }
  static copyBaseStateTo(self, target) { return self.copyBaseStateTo(target); }
  static getDisplayName(self) { return self.getDisplayName(); }
  static toModel(self) { return self.toModel(); }
  static clone(self) { return self.clone(); }
  static matches(self, _query) { return self.matches(_query); }
}

// ════════════════════ PersonNode.js ════════════════════
/**
 * PersonNode — odpowiednik `PersonNode.ts`.
 *
 * Model (PersonModel):
 *   { type: 'person', id, nick, firstName?, secondName?, description? }
 */
class PersonNode extends NodeBase {
  constructor(model) {
    super();
    this.type = 'person';
    this.id = model.id;
    this.nick = model.nick;
    this.firstName = model.firstName;
    this.secondName = model.secondName;
    this.description = model.description;
  }

  static fromModel(model) { return new PersonNode(model); }
  static fromModels(models) { return (models ?? []).map((m) => new PersonNode(m)); }

  getDisplayName() { return this.getFullName() ?? this.nick; }

  /** Pełne imię i nazwisko, albo null gdy żadne z pól nie jest ustawione. */
  getFullName() {
    const parts = [this.firstName, this.secondName].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  /** Inicjały (2 znaki, wielkie litery) — do awatara. */
  getInitials() {
    if (this.firstName || this.secondName) {
      const a = this.firstName?.[0] ?? '';
      const b = this.secondName?.[0] ?? '';
      const initials = (a + b).toUpperCase();
      if (initials) return initials;
    }
    return (this.nick ?? '').slice(0, 2).toUpperCase();
  }

  hasFullName() { return Boolean(this.firstName || this.secondName); }

  matches(query) {
    const q = (query ?? '').toLowerCase();
    return [this.nick, this.firstName, this.secondName, this.description, this.id]
      .filter(Boolean)
      .some((s) => s.toLowerCase().includes(q));
  }

  updateFrom(model) {
    if (model.nick !== undefined) this.nick = model.nick;
    if (model.firstName !== undefined) this.firstName = model.firstName;
    if (model.secondName !== undefined) this.secondName = model.secondName;
    if (model.description !== undefined) this.description = model.description;
    return this.markDirty();
  }

  toModel() {
    return {
      type: 'person',
      id: this.id,
      nick: this.nick,
      firstName: this.firstName,
      secondName: this.secondName,
      description: this.description,
    };
  }

  clone() { return this.copyBaseStateTo(new PersonNode(this.toModel())); }

  equals(other) { return Boolean(other) && other.id === this.id; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: PersonNode.foo(self, …)) ──
  static getDisplayName(self) { return self.getDisplayName(); }
  static getFullName(self) { return self.getFullName(); }
  static getInitials(self) { return self.getInitials(); }
  static hasFullName(self) { return self.hasFullName(); }
  static matches(self, query) { return self.matches(query); }
  static updateFrom(self, model) { return self.updateFrom(model); }
  static toModel(self) { return self.toModel(); }
  static clone(self) { return self.clone(); }
  static equals(self, other) { return self.equals(other); }
}

// ════════════════════ TaskNode.js ════════════════════
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
class TaskNode extends NodeBase {
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

  // ── Statyczne odpowiedniki metod instancji (autocomplete: TaskNode.foo(self, …)) ──
  static isCompleted(self) { return self.isCompleted; }
  static setCompleted(self, value) { return self.setCompleted(value); }
  static toggleCompleted(self) { return self.toggleCompleted(); }
  static progress(self) { return self.progress; }
  static setProgress(self, value) { return self.setProgress(value); }
  static projectRef(self) { return self.projectRef; }
  static setProjectRef(self, ref) { return self.setProjectRef(ref); }
  static getDisplayName(self) { return self.getDisplayName(); }
  static hasProject(self) { return self.hasProject(); }
  static getProjectName(self) { return self.getProjectName(); }
  static getDurationHours(self) { return self.getDurationHours(); }
  static getDurationFormatted(self) { return self.getDurationFormatted(); }
  static getCostFormatted(self, currency = 'PLN') { return self.getCostFormatted(currency); }
  static hasCost(self) { return self.hasCost(); }
  static hasDuration(self) { return self.hasDuration(); }
  static hasComponents(self) { return self.hasComponents(); }
  static getComponentByType(self, type) { return self.getComponentByType(type); }
  static getIntervalComponent(self) { return self.getIntervalComponent(); }
  static hasInterval(self) { return self.hasInterval(); }
  static getDaysInterval(self) { return self.getDaysInterval(); }
  static getDaysIntervalFormatted(self) { return self.getDaysIntervalFormatted(); }
  static matches(self, query) { return self.matches(query); }
  static updateFrom(self, model) { return self.updateFrom(model); }
  static toModel(self) { return self.toModel(); }
  static clone(self) { return self.clone(); }
  static resetState(self) { return self.resetState(); }
  static equals(self, other) { return self.equals(other); }
}

// ════════════════════ EventNode.js ════════════════════
/**
 * EventNode — odpowiednik `EventNode.ts`.
 *
 * Model (EventModel):
 *   { type: 'event', taskId?, name, description?, startTime, endTime?, components? }
 *
 * UWAGA: oryginał używa biblioteki `dayjs`. Tutaj — żeby było czysto
 * przeglądarkowe i bez zależności — daty obsługujemy natywnym `Date`.
 * Obsługiwane formaty czasu: ISO ("2024-06-10T14:30:00") oraz "HH:mm" / "HH:mm:ss".
 */
function pad(n) { return String(n).padStart(2, '0'); }

class EventNode extends NodeBase {
  constructor(model) {
    super();
    this.type = 'event';
    this.taskId = model.taskId;
    this.name = model.name;
    this.description = model.description;
    this.startTime = model.startTime;
    this.endTime = model.endTime;
    this.components = model.components;

    this._taskRef = null; // { id, name }
    this._startDate = null; // Date | null
    this._endDate = null; // Date | null
    this._parseDates();
  }

  static fromModel(model) { return new EventNode(model); }
  static fromModels(models) { return (models ?? []).map((m) => new EventNode(m)); }
  static sortByTime(events) { return [...events].sort((a, b) => a.compareTo(b)); }

  _parseDates() {
    this._startDate = this.startTime ? this._parseTimeString(this.startTime) : null;
    this._endDate = this.endTime ? this._parseTimeString(this.endTime) : null;
  }
  _parseTimeString(str) {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(str).trim());
    if (m) {
      const d = new Date();
      d.setHours(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), 0);
      return d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  get taskRef() { return this._taskRef; }
  setTaskRef(ref) {
    this._taskRef = ref;
    if (ref?.id) this.taskId = ref.id;
    return this;
  }

  getDisplayName() { return this.name; }

  getStartDate() { return this._startDate; }
  getEndDate() { return this._endDate; }

  hasTask() { return Boolean(this.taskId); }
  getTaskName() { return this._taskRef?.name ?? null; }
  hasEndTime() { return Boolean(this.endTime); }

  isAllDay() {
    const s = this._startDate;
    if (!s) return false;
    const startMidnight = s.getHours() === 0 && s.getMinutes() === 0;
    if (!this._endDate) return startMidnight;
    const e = this._endDate;
    return startMidnight && e.getHours() === 0 && e.getMinutes() === 0;
  }

  _fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  getTimeRange() {
    if (!this._startDate) return '';
    if (!this._endDate) return this._fmtTime(this._startDate);
    return `${this._fmtTime(this._startDate)} - ${this._fmtTime(this._endDate)}`;
  }

  /** Czas trwania w minutach (wymaga start i end). */
  getDuration() {
    if (!this._startDate || !this._endDate) return null;
    return Math.round((this._endDate.getTime() - this._startDate.getTime()) / 60000);
  }
  getDurationFormatted() {
    const min = this.getDuration();
    if (min == null) return null;
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h${m}m` : `${h}h`;
  }

  isNow() {
    if (!this._startDate) return false;
    const now = Date.now();
    const start = this._startDate.getTime();
    const end = this._endDate ? this._endDate.getTime() : start;
    return now >= start && now <= end;
  }
  isPast() {
    const ref = this._endDate ?? this._startDate;
    return ref ? ref.getTime() < Date.now() : false;
  }
  isFuture() { return this._startDate ? this._startDate.getTime() > Date.now() : false; }

  hasComponents() { return Boolean(this.components && this.components.length); }
  getComponentByType(type) { return this.components?.find((c) => c.type === type); }

  matches(query) {
    const q = (query ?? '').toLowerCase();
    return [this.name, this.description, this.taskId]
      .filter(Boolean)
      .some((s) => s.toLowerCase().includes(q));
  }

  updateFrom(model) {
    if (model.taskId !== undefined) this.taskId = model.taskId;
    if (model.name !== undefined) this.name = model.name;
    if (model.description !== undefined) this.description = model.description;
    if (model.startTime !== undefined) this.startTime = model.startTime;
    if (model.endTime !== undefined) this.endTime = model.endTime;
    if (model.components !== undefined) this.components = model.components;
    this._parseDates();
    return this.markDirty();
  }

  setTimes(startTime, endTime) {
    this.startTime = startTime;
    this.endTime = endTime;
    this._parseDates();
    return this.markDirty();
  }

  isSameDay(date) {
    const d = date instanceof Date ? date : new Date(date);
    const s = this._startDate;
    return Boolean(s)
      && s.getFullYear() === d.getFullYear()
      && s.getMonth() === d.getMonth()
      && s.getDate() === d.getDate();
  }
  isToday() { return this.isSameDay(new Date()); }

  getDateFormatted() {
    const d = this._startDate;
    if (!d) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  getDateTimeFormatted() {
    const d = this._startDate;
    if (!d) return null;
    return `${this.getDateFormatted()} ${this._fmtTime(d)}`;
  }

  getRelativeTime() {
    const d = this._startDate;
    if (!d) return null;
    const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
    const abs = Math.abs(diffMin);
    const fmt = (val, unit) => (diffMin >= 0 ? `in ${val}${unit}` : `${val}${unit} ago`);
    if (abs < 60) return fmt(abs, 'm');
    const h = Math.round(abs / 60);
    if (h < 24) return fmt(h, 'h');
    const days = Math.round(h / 24);
    return fmt(days, 'd');
  }

  toModel() {
    return {
      type: 'event',
      taskId: this.taskId,
      name: this.name,
      description: this.description,
      startTime: this.startTime,
      endTime: this.endTime,
      components: this.components,
    };
  }

  clone() {
    const c = new EventNode(this.toModel());
    c._taskRef = this._taskRef ? { ...this._taskRef } : null;
    return this.copyBaseStateTo(c);
  }

  /** Porównanie do sortowania po czasie rozpoczęcia. */
  compareTo(other) {
    const a = this._startDate ? this._startDate.getTime() : 0;
    const b = other._startDate ? other._startDate.getTime() : 0;
    return a - b;
  }

  equals(other) {
    return Boolean(other) && other.name === this.name && other.startTime === this.startTime;
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: EventNode.foo(self, …)) ──
  static taskRef(self) { return self.taskRef; }
  static setTaskRef(self, ref) { return self.setTaskRef(ref); }
  static getDisplayName(self) { return self.getDisplayName(); }
  static getStartDate(self) { return self.getStartDate(); }
  static getEndDate(self) { return self.getEndDate(); }
  static hasTask(self) { return self.hasTask(); }
  static getTaskName(self) { return self.getTaskName(); }
  static hasEndTime(self) { return self.hasEndTime(); }
  static isAllDay(self) { return self.isAllDay(); }
  static getTimeRange(self) { return self.getTimeRange(); }
  static getDuration(self) { return self.getDuration(); }
  static getDurationFormatted(self) { return self.getDurationFormatted(); }
  static isNow(self) { return self.isNow(); }
  static isPast(self) { return self.isPast(); }
  static isFuture(self) { return self.isFuture(); }
  static hasComponents(self) { return self.hasComponents(); }
  static getComponentByType(self, type) { return self.getComponentByType(type); }
  static matches(self, query) { return self.matches(query); }
  static updateFrom(self, model) { return self.updateFrom(model); }
  static setTimes(self, startTime, endTime) { return self.setTimes(startTime, endTime); }
  static isSameDay(self, date) { return self.isSameDay(date); }
  static isToday(self) { return self.isToday(); }
  static getDateFormatted(self) { return self.getDateFormatted(); }
  static getDateTimeFormatted(self) { return self.getDateTimeFormatted(); }
  static getRelativeTime(self) { return self.getRelativeTime(); }
  static toModel(self) { return self.toModel(); }
  static clone(self) { return self.clone(); }
  static compareTo(self, other) { return self.compareTo(other); }
  static equals(self, other) { return self.equals(other); }
}

// ════════════════════ ProjectNode.js ════════════════════
/**
 * ProjectNode — odpowiednik `ProjectNode.ts`.
 *
 * Model (ProjectModel):
 *   { type: 'project', id, name, description?, cost?, projects?, tasks?, components? }
 *
 * Buduje hierarchię: pod-projekty (`_children`) z ustawionym `_parent` oraz
 * zadania (`_tasks`) jako TaskNode z ustawionym projectRef. Ścieżka jest cache'owana.
 */
class ProjectNode extends NodeBase {
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

  // ── Statyczne odpowiedniki metod instancji (autocomplete: ProjectNode.foo(self, …)) ──
  static children(self) { return self.children; }
  static tasks(self) { return self.tasks; }
  static parent(self) { return self.parent; }
  static getDisplayName(self) { return self.getDisplayName(); }
  static hasChildren(self) { return self.hasChildren(); }
  static hasTasks(self) { return self.hasTasks(); }
  static isRoot(self) { return self.isRoot(); }
  static getDepth(self) { return self.getDepth(); }
  static getPath(self) { return self.getPath(); }
  static getPathString(self, separator = ' / ') { return self.getPathString(separator); }
  static findChildById(self, id) { return self.findChildById(id); }
  static findTaskById(self, id) { return self.findTaskById(id); }
  static getTaskCount(self, recursive = true) { return self.getTaskCount(recursive); }
  static getTotalCost(self, recursive = true) { return self.getTotalCost(recursive); }
  static getCostFormatted(self, currency = 'PLN', recursive = false) { return self.getCostFormatted(currency, recursive); }
  static getTotalDuration(self, recursive = true) { return self.getTotalDuration(recursive); }
  static getAllTasks(self) { return self.getAllTasks(); }
  static getAllProjects(self) { return self.getAllProjects(); }
  static addChild(self, child) { return self.addChild(child); }
  static removeChild(self, id) { return self.removeChild(id); }
  static addTask(self, task) { return self.addTask(task); }
  static removeTask(self, id) { return self.removeTask(id); }
  static hasComponents(self) { return self.hasComponents(); }
  static matches(self, query) { return self.matches(query); }
  static matchesDeep(self, query) { return self.matchesDeep(query); }
  static expandAll(self) { return self.expandAll(); }
  static collapseAll(self) { return self.collapseAll(); }
  static toModel(self) { return self.toModel(); }
  static clone(self) { return self.clone(); }
  static equals(self, other) { return self.equals(other); }
}

// ════════════════════ api/ApiClient.js ════════════════════
/**
 * ApiClient — cienki klient VFS REST dla danych użytkownika (czysty przeglądarkowy JS).
 *
 * MyCastle NIE ma dedykowanych endpointów REST dla PIM — persons/tasks/projects/events
 * to pliki JSON w katalogu użytkownika, czytane/zapisywane przez generyczne VFS API:
 *
 *   GET  /api/users/{userName}/vfs/readFile?path=/data/Minis/Users/{userName}/{rel}
 *        → { data: "<base64>" }
 *   POST /api/users/{userName}/vfs/writeFile?path=...   body { data: "<base64>", options }
 *   POST /api/users/{userName}/vfs/mkdir?path=...
 *
 * Autoryzacja: nagłówek `Authorization: Bearer <JWT>`.
 *
 * Użycie:
 *   // W zalogowanej aplikacji (np. skrypt w edytorze Markdown) — bez argumentów:
 *   const client = new ApiClient();           // userName + token z sesji
 *   // Jawnie:
 *   const client = new ApiClient({ userName: 'marcin', token });
 *   // baseUrl pusty = ten sam origin (np. produkcja). Dla cross-origin:
 *   // new ApiClient({ baseUrl: 'https://mycastle.hersztowski.org', userName, token })
 */

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Best-effort odczyt sesji zalogowanego użytkownika MyCastle z localStorage.
 * Pozwala używać `new ApiClient()` bez ręcznego userName/token w aplikacji
 * (np. w blokach skryptów edytora Markdown). Format: { user: { name }, token }.
 */
function resolveSession() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem('minis_current_user') : null;
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { userName: s?.user?.name ?? null, token: s?.token ?? null };
  } catch {
    return null;
  }
}

class ApiClient {
  /**
   * @param {{ baseUrl?: string, userName: string, token?: string }} opts
   */
  constructor({ baseUrl = '', userName, token } = {}) {
    const session = resolveSession();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    // Brak jawnych wartości → bierz z sesji zalogowanego użytkownika.
    this.userName = userName ?? session?.userName ?? null;
    this.token = token ?? session?.token ?? undefined;
    if (!this.userName) {
      throw new Error('ApiClient: brak userName — zaloguj się lub podaj { userName, token }');
    }
  }

  setToken(token) { this.token = token; return this; }

  /** Ścieżka backendu dla pliku względnego do home użytkownika. */
  backendPath(relPath) {
    const clean = String(relPath).replace(/^\/+/, '');
    return `/data/Minis/Users/${this.userName}/${clean}`;
  }

  _vfsUrl(op, fullPath) {
    const base = `${this.baseUrl}/api/users/${encodeURIComponent(this.userName)}/vfs/${op}`;
    return fullPath != null ? `${base}?path=${encodeURIComponent(fullPath)}` : base;
  }

  _headers(extra) {
    const h = { ...(extra || {}) };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /** Odczyt pliku jako tekst. Zwraca null gdy plik nie istnieje (404). */
  async readFile(relPath) {
    const r = await fetch(this._vfsUrl('readFile', this.backendPath(relPath)), {
      headers: this._headers(),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`readFile ${relPath} -> ${r.status}`);
    const body = await r.json();
    return fromBase64(body.data);
  }

  /** Zapis tekstu do pliku (tworzy/nadpisuje). */
  async writeFile(relPath, content, options = { create: true, overwrite: true }) {
    const r = await fetch(this._vfsUrl('writeFile', this.backendPath(relPath)), {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ data: toBase64(content), options }),
    });
    if (!r.ok) throw new Error(`writeFile ${relPath} -> ${r.status}`);
    return true;
  }

  /** Utworzenie katalogu. Zwraca true/false (nie rzuca, bo „już istnieje" jest OK). */
  async mkdir(relPath) {
    try {
      const r = await fetch(this._vfsUrl('mkdir', this.backendPath(relPath)), {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: '{}',
      });
      return r.ok;
    } catch { return false; }
  }

  /** Usunięcie pliku/katalogu. */
  async delete(relPath, options) {
    const r = await fetch(this._vfsUrl('delete', this.backendPath(relPath)), {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(options ? { options } : {}),
    });
    if (!r.ok && r.status !== 404) throw new Error(`delete ${relPath} -> ${r.status}`);
    return r.ok;
  }

  /** Odczyt + JSON.parse. Zwraca `fallback` gdy plik nie istnieje lub jest pusty/niepoprawny. */
  async readJson(relPath, fallback = null) {
    const txt = await this.readFile(relPath);
    if (txt == null || txt.trim() === '') return fallback;
    try { return JSON.parse(txt); } catch { return fallback; }
  }

  /** Zapis wartości jako sformatowany JSON. */
  async writeJson(relPath, value) {
    return this.writeFile(relPath, JSON.stringify(value, null, 2));
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: ApiClient.foo(self, …)) ──
  static setToken(self, token) { return self.setToken(token); }
  static backendPath(self, relPath) { return self.backendPath(relPath); }
  static readFile(self, relPath) { return self.readFile(relPath); }
  static writeFile(self, relPath, content, options = { create: true, overwrite: true }) { return self.writeFile(relPath, content, options); }
  static mkdir(self, relPath) { return self.mkdir(relPath); }
  static delete(self, relPath, options) { return self.delete(relPath, options); }
  static readJson(self, relPath, fallback = null) { return self.readJson(relPath, fallback); }
  static writeJson(self, relPath, value) { return self.writeJson(relPath, value); }
}

// ════════════════════ api/ApiTask.js ════════════════════
/**
 * ApiTask — CRUD zadań na serwerze.
 *
 * Backend: plik `data/tasks.json` w formacie { type: 'tasks', tasks: TaskModel[] }.
 * Zadania linkują się do projektu przez pole `projectId`. Metody zwracają TaskNode.
 */
const TASKS_PATH = 'data/tasks.json';

class ApiTask {
  constructor(client) { this.client = client; }

  async _load() {
    const data = await this.client.readJson(TASKS_PATH, { type: 'tasks', tasks: [] });
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.tasks) ? data.tasks : [];
  }
  async _save(tasks) {
    return this.client.writeJson(TASKS_PATH, { type: 'tasks', tasks });
  }

  /** @returns {Promise<TaskNode[]>} */
  async list() { return TaskNode.fromModels(await this._load()); }

  /** Zadania danego projektu. @returns {Promise<TaskNode[]>} */
  async listByProject(projectId) {
    const items = await this._load();
    return TaskNode.fromModels(items.filter((t) => t.projectId === projectId));
  }

  /** @returns {Promise<TaskNode|null>} */
  async get(id) {
    const items = await this._load();
    const m = items.find((t) => t.id === id);
    return m ? TaskNode.fromModel(m) : null;
  }

  /** @returns {Promise<TaskNode>} */
  async create(model) {
    const items = await this._load();
    const task = {
      type: 'task',
      id: model.id ?? crypto.randomUUID(),
      projectId: model.projectId,
      name: model.name ?? '',
      description: model.description,
      duration: model.duration,
      cost: model.cost,
      components: model.components,
    };
    items.push(task);
    await this._save(items);
    return TaskNode.fromModel(task);
  }

  /** @returns {Promise<TaskNode|null>} */
  async update(id, patch) {
    const items = await this._load();
    const idx = items.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, type: 'task', id };
    await this._save(items);
    return TaskNode.fromModel(items[idx]);
  }

  /** @returns {Promise<boolean>} */
  async remove(id) {
    const items = await this._load();
    const next = items.filter((t) => t.id !== id);
    if (next.length === items.length) return false;
    await this._save(next);
    return true;
  }

  /** Nadpisanie całej listy (TaskNode[] lub TaskModel[]). */
  async save(tasksOrNodes) {
    const items = tasksOrNodes.map((t) => (typeof t.toModel === 'function' ? t.toModel() : t));
    await this._save(items);
    return true;
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: ApiTask.foo(self, …)) ──
  static list(self) { return self.list(); }
  static listByProject(self, projectId) { return self.listByProject(projectId); }
  static get(self, id) { return self.get(id); }
  static create(self, model) { return self.create(model); }
  static update(self, id, patch) { return self.update(id, patch); }
  static remove(self, id) { return self.remove(id); }
  static save(self, tasksOrNodes) { return self.save(tasksOrNodes); }
}

// ════════════════════ api/ApiPerson.js ════════════════════
/**
 * ApiPerson — CRUD osób na serwerze.
 *
 * Backend: plik `data/persons.json` w formacie { type: 'persons', items: PersonModel[] }
 * (tolerujemy też legacy gołą tablicę). Metody zwracają PersonNode.
 *
 *   const api = new ApiPerson(client);
 *   const list = await api.list();
 *   const p = await api.create({ nick: 'mh', firstName: 'Marcin' });
 *   await api.update(p.id, { description: '...' });
 *   await api.remove(p.id);
 */
const PERSONS_PATH = 'data/persons.json';

class ApiPerson {
  constructor(client) { this.client = client; }

  async _load() {
    const data = await this.client.readJson(PERSONS_PATH, { type: 'persons', items: [] });
    if (Array.isArray(data)) return data; // legacy bare array
    return Array.isArray(data?.items) ? data.items : [];
  }
  async _save(items) {
    return this.client.writeJson(PERSONS_PATH, { type: 'persons', items });
  }

  /** @returns {Promise<PersonNode[]>} */
  async list() { return PersonNode.fromModels(await this._load()); }

  /** @returns {Promise<PersonNode|null>} */
  async get(id) {
    const items = await this._load();
    const m = items.find((p) => p.id === id);
    return m ? PersonNode.fromModel(m) : null;
  }

  /** @returns {Promise<PersonNode>} */
  async create(model) {
    const items = await this._load();
    const person = {
      type: 'person',
      id: model.id ?? crypto.randomUUID(),
      nick: model.nick,
      firstName: model.firstName,
      secondName: model.secondName,
      description: model.description,
    };
    items.push(person);
    await this._save(items);
    return PersonNode.fromModel(person);
  }

  /** Aktualizacja częściowa (patch). @returns {Promise<PersonNode|null>} */
  async update(id, patch) {
    const items = await this._load();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, type: 'person', id };
    await this._save(items);
    return PersonNode.fromModel(items[idx]);
  }

  /** @returns {Promise<boolean>} czy coś usunięto */
  async remove(id) {
    const items = await this._load();
    const next = items.filter((p) => p.id !== id);
    if (next.length === items.length) return false;
    await this._save(next);
    return true;
  }

  /** Nadpisanie całej listy (przyjmuje PersonNode[] lub PersonModel[]). */
  async save(personsOrNodes) {
    const items = personsOrNodes.map((p) => (typeof p.toModel === 'function' ? p.toModel() : p));
    await this._save(items);
    return true;
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: ApiPerson.foo(self, …)) ──
  static list(self) { return self.list(); }
  static get(self, id) { return self.get(id); }
  static create(self, model) { return self.create(model); }
  static update(self, id, patch) { return self.update(id, patch); }
  static remove(self, id) { return self.remove(id); }
  static save(self, personsOrNodes) { return self.save(personsOrNodes); }
}

// ════════════════════ api/ApiProject.js ════════════════════
/**
 * ApiProject — CRUD projektów na serwerze.
 *
 * Backend: plik `data/projects.json` w formacie { type: 'projects', projects: ProjectModel[] }.
 * Projekty są przechowywane „płasko" (zadania osobno w tasks.json, linkowane przez projectId).
 * Metody zwracają ProjectNode.
 */
const PROJECTS_PATH = 'data/projects.json';

class ApiProject {
  constructor(client) { this.client = client; }

  async _load() {
    const data = await this.client.readJson(PROJECTS_PATH, { type: 'projects', projects: [] });
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.projects) ? data.projects : [];
  }
  async _save(projects) {
    return this.client.writeJson(PROJECTS_PATH, { type: 'projects', projects });
  }

  /** @returns {Promise<ProjectNode[]>} */
  async list() { return ProjectNode.fromModels(await this._load()); }

  /** @returns {Promise<ProjectNode|null>} */
  async get(id) {
    const items = await this._load();
    const m = items.find((p) => p.id === id);
    return m ? ProjectNode.fromModel(m) : null;
  }

  /** @returns {Promise<ProjectNode>} */
  async create(model) {
    const items = await this._load();
    const project = {
      type: 'project',
      id: model.id ?? crypto.randomUUID(),
      name: model.name ?? '',
      description: model.description ?? '',
      cost: model.cost,
      components: model.components,
    };
    items.push(project);
    await this._save(items);
    return ProjectNode.fromModel(project);
  }

  /** @returns {Promise<ProjectNode|null>} */
  async update(id, patch) {
    const items = await this._load();
    const idx = items.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, type: 'project', id };
    await this._save(items);
    return ProjectNode.fromModel(items[idx]);
  }

  /** @returns {Promise<boolean>} */
  async remove(id) {
    const items = await this._load();
    const next = items.filter((p) => p.id !== id);
    if (next.length === items.length) return false;
    await this._save(next);
    return true;
  }

  /** Nadpisanie całej listy (ProjectNode[] lub ProjectModel[]). */
  async save(projectsOrNodes) {
    const items = projectsOrNodes.map((p) => (typeof p.toModel === 'function' ? p.toModel() : p));
    await this._save(items);
    return true;
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: ApiProject.foo(self, …)) ──
  static list(self) { return self.list(); }
  static get(self, id) { return self.get(id); }
  static create(self, model) { return self.create(model); }
  static update(self, id, patch) { return self.update(id, patch); }
  static remove(self, id) { return self.remove(id); }
  static save(self, projectsOrNodes) { return self.save(projectsOrNodes); }
}

// ════════════════════ api/ApiEvent.js ════════════════════
/**
 * ApiEvent — operacje na wydarzeniach kalendarza na serwerze.
 *
 * Backend: wydarzenia są przechowywane PER DZIEŃ w plikach
 *   data/calendar/{YYYY}/{MM}/{DD}.json
 * w formacie { type: 'events', tasks: EventModel[] }  (uwaga: klucz nazywa się `tasks`).
 *
 * EventModel nie ma `id`, więc identyfikacja wydarzenia odbywa się przez treść
 * (np. name + startTime) — stąd remove() przyjmuje predykat. Metody zwracają EventNode.
 *
 *   const api = new ApiEvent(client);
 *   const todays = await api.listByDate(new Date());
 *   await api.add('2026-06-12', { name: 'Spotkanie', startTime: '2026-06-12T10:00:00' });
 */

/** Zwraca { y, m, d } z Date | 'YYYY-MM-DD...' | ISO. */
function ymd(date) {
  if (date instanceof Date) {
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }
  const s = String(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) throw new Error(`ApiEvent: invalid date "${date}"`);
  return { y: parsed.getFullYear(), m: parsed.getMonth() + 1, d: parsed.getDate() };
}

class ApiEvent {
  constructor(client) { this.client = client; }

  _dayPath(date) {
    const { y, m, d } = ymd(date);
    return `data/calendar/${y}/${pad(m)}/${pad(d)}.json`;
  }

  async _load(date) {
    const data = await this.client.readJson(this._dayPath(date), { type: 'events', tasks: [] });
    if (Array.isArray(data)) return data;
    if (data?.type === 'events' && Array.isArray(data.tasks)) return data.tasks;
    return [];
  }

  async _save(date, events) {
    const { y, m } = ymd(date);
    // Upewnij się, że katalogi nadrzędne istnieją (mkdir jest idempotentne / no-op gdy są).
    await this.client.mkdir('data/calendar');
    await this.client.mkdir(`data/calendar/${y}`);
    await this.client.mkdir(`data/calendar/${y}/${pad(m)}`);
    return this.client.writeJson(this._dayPath(date), { type: 'events', tasks: events });
  }

  /** Wydarzenia z danego dnia. @returns {Promise<EventNode[]>} */
  async listByDate(date) {
    return EventNode.fromModels(await this._load(date));
  }

  /** Dodaje wydarzenie do danego dnia. @returns {Promise<EventNode>} */
  async add(date, model) {
    const events = await this._load(date);
    const ev = {
      type: 'event',
      taskId: model.taskId,
      name: model.name ?? '',
      description: model.description,
      startTime: model.startTime,
      endTime: model.endTime,
      components: model.components,
    };
    events.push(ev);
    await this._save(date, events);
    return EventNode.fromModel(ev);
  }

  /**
   * Usuwa wydarzenia danego dnia pasujące do predykatu.
   * @param {Function} predicate (eventModel, index) => boolean
   * @returns {Promise<number>} liczba usuniętych
   */
  async remove(date, predicate) {
    const events = await this._load(date);
    const kept = events.filter((e, i) => !predicate(e, i));
    const removed = events.length - kept.length;
    if (removed > 0) await this._save(date, kept);
    return removed;
  }

  /** Nadpisuje wydarzenia dnia (EventNode[] lub EventModel[]). */
  async save(date, eventsOrNodes) {
    const events = eventsOrNodes.map((e) => (typeof e.toModel === 'function' ? e.toModel() : e));
    await this._save(date, events);
    return true;
  }

  /** Usuwa cały plik dnia. */
  async clearDay(date) {
    return this.client.delete(this._dayPath(date));
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: ApiEvent.foo(self, …)) ──
  static listByDate(self, date) { return self.listByDate(date); }
  static add(self, date, model) { return self.add(date, model); }
  static remove(self, date, predicate) { return self.remove(date, predicate); }
  static save(self, date, eventsOrNodes) { return self.save(date, eventsOrNodes); }
  static clearDay(self, date) { return self.clearDay(date); }
}

// ════════════════════ Eksport przez globalny namespace (bez `export`) ════════════════════
{
  const _g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : this;
  Object.assign(_g, {
    NodeBase, PersonNode, ProjectNode, TaskNode, EventNode,
    ApiClient, ApiPerson, ApiProject, ApiTask, ApiEvent,
  });
}
