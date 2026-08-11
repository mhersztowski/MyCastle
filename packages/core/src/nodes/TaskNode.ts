import { NodeBase } from './NodeBase';
import {
  TaskModel,
  TaskComponentModel,
  TaskIntervalComponentModel,
  TaskPriority,
  TaskTimeEntry,
} from '../models/TaskModel';

/**
 * Pusta tablica jest w pliku nieodróżnialna od świadomej decyzji „bez tagów",
 * a dokłada klucz do każdego zadania, które o tagach nic nie wie. Zapisujemy
 * więc tylko listy niepuste.
 */
function keepList<T>(list: T[] | undefined): T[] | undefined {
  return list && list.length > 0 ? list : undefined;
}

// Forward reference types to avoid circular imports
type ProjectNodeRef = { id: string; name: string } | null;

/**
 * TaskNode extends TaskModel with UI state, relationships, and utility functions
 */
export class TaskNode extends NodeBase<TaskModel> {
  readonly type = 'task' as const;
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  duration?: number;
  cost?: number;
  components?: TaskComponentModel[];

  // Pola planistyczne (widok PIM/Projects2)
  status?: string;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  assignees?: string[];
  tags?: string[];
  timeEntries?: TaskTimeEntry[];
  parentTaskId?: string;
  order?: number;
  dependsOn?: string[];
  /** Notatka na dysku — ścieżka względem `drive/` użytkownika. */
  docPath?: string;

  // Additional UI states
  private _isCompleted: boolean = false;
  private _progress: number = 0;

  // Relationships (lazy-loaded references)
  private _projectRef: ProjectNodeRef = null;

  constructor(model: TaskModel) {
    super();
    this.id = model.id;
    this.projectId = model.projectId;
    this.name = model.name;
    this.description = model.description;
    this.duration = model.duration;
    this.cost = model.cost;
    this.components = model.components;
    this.assignPlanningFields(model);
  }

  /** Wspólne dla konstruktora i `updateFrom` — inaczej łatwo o pole w jednym miejscu. */
  private assignPlanningFields(model: TaskModel): void {
    this.status = model.status;
    this.priority = model.priority;
    this.startDate = model.startDate;
    this.dueDate = model.dueDate;
    this.assignees = model.assignees;
    this.tags = model.tags;
    this.timeEntries = model.timeEntries;
    this.parentTaskId = model.parentTaskId;
    this.order = model.order;
    this.dependsOn = model.dependsOn;
    this.docPath = model.docPath;
  }

  static fromModel(model: TaskModel): TaskNode { return new TaskNode(model); }
  static fromModels(models: TaskModel[]): TaskNode[] { return models.map(m => new TaskNode(m)); }

  // Completion state
  get isCompleted(): boolean {
    return this._isCompleted;
  }

  setCompleted(value: boolean): this {
    this._isCompleted = value;
    if (value) {
      this._progress = 100;
    }
    return this;
  }

  toggleCompleted(): this {
    return this.setCompleted(!this._isCompleted);
  }

  // Progress (0-100)
  get progress(): number {
    return this._progress;
  }

  setProgress(value: number): this {
    this._progress = Math.max(0, Math.min(100, value));
    this._isCompleted = this._progress === 100;
    return this;
  }

  // Project reference
  get projectRef(): ProjectNodeRef {
    return this._projectRef;
  }

  setProjectRef(ref: ProjectNodeRef): this {
    this._projectRef = ref;
    return this;
  }

  // Display name
  getDisplayName(): string {
    return this.name;
  }

  // Check if task belongs to a project
  hasProject(): boolean {
    return !!this.projectId;
  }

  // Get project name if available
  getProjectName(): string | null {
    return this._projectRef?.name ?? null;
  }

  // Format duration as human readable string (duration is in hours)
  getDurationFormatted(): string | null {
    if (this.duration === undefined) return null;

    if (this.duration < 24) {
      return `${this.duration}h`;
    } else {
      const days = Math.floor(this.duration / 24);
      const hours = this.duration % 24;
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
  }

  // Get duration in hours
  getDurationHours(): number | null {
    if (this.duration === undefined) return null;
    return this.duration;
  }

  // Format cost as currency string
  getCostFormatted(currency: string = 'PLN'): string | null {
    if (this.cost === undefined) return null;
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(this.cost);
  }

  // Check if task has cost set
  hasCost(): boolean {
    return this.cost !== undefined && this.cost > 0;
  }

  // Check if task has duration set
  hasDuration(): boolean {
    return this.duration !== undefined && this.duration > 0;
  }

  // Check if task has any components
  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  // Get component by type
  getComponentByType<T extends TaskComponentModel>(type: string): T | undefined {
    return this.components?.find(c => c.type === type) as T | undefined;
  }

  // Interval component helpers
  getIntervalComponent(): TaskIntervalComponentModel | undefined {
    return this.getComponentByType<TaskIntervalComponentModel>('task_interval');
  }

  hasInterval(): boolean {
    return !!this.getIntervalComponent();
  }

  getDaysInterval(): number | null {
    return this.getIntervalComponent()?.daysInterval ?? null;
  }

  getDaysIntervalFormatted(): string | null {
    const days = this.getDaysInterval();
    if (days === null) return null;

    if (days === 1) {
      return '1 day';
    } else if (days < 7) {
      return `${days} days`;
    } else if (days % 7 === 0) {
      const weeks = days / 7;
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    } else {
      return `${days} days`;
    }
  }

  // Search helper
  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.projectId?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Update from model
  updateFrom(model: TaskModel): this {
    this.projectId = model.projectId;
    this.name = model.name;
    this.description = model.description;
    this.duration = model.duration;
    this.cost = model.cost;
    this.components = model.components;
    this.assignPlanningFields(model);
    this.markDirty();
    return this;
  }

  // Convert back to model
  toModel(): TaskModel {
    return {
      type: 'task',
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      description: this.description,
      duration: this.duration,
      cost: this.cost,
      components: this.components,
      status: this.status,
      priority: this.priority,
      startDate: this.startDate,
      dueDate: this.dueDate,
      assignees: keepList(this.assignees),
      tags: keepList(this.tags),
      timeEntries: keepList(this.timeEntries),
      parentTaskId: this.parentTaskId,
      order: this.order,
      dependsOn: keepList(this.dependsOn),
      docPath: this.docPath,
    };
  }

  // --- śledzenie czasu ----------------------------------------------------

  /** Wpis bez `end` — czyli licznik, który biegnie teraz. */
  private openEntry(): TaskTimeEntry | undefined {
    return this.timeEntries?.find(e => !e.end);
  }

  isTracking(): boolean {
    return this.openEntry() !== undefined;
  }

  /**
   * Suma zapisanego czasu w minutach. `now` wchodzi parametrem, bo wpis otwarty
   * trzeba do czegoś domknąć — a sięgnięcie po zegar w środku uzależniłoby
   * wynik od chwili wywołania i uniemożliwiło testowanie.
   */
  trackedMinutes(now: Date = new Date()): number {
    if (!this.timeEntries) return 0;
    const total = this.timeEntries.reduce((sum, entry) => {
      const start = Date.parse(entry.start);
      if (Number.isNaN(start)) return sum;
      const end = entry.end ? Date.parse(entry.end) : now.getTime();
      if (Number.isNaN(end) || end <= start) return sum;
      return sum + (end - start);
    }, 0);
    return Math.round(total / 60000);
  }

  /**
   * Otwiera nowy pomiar. Gdy jeden już biegnie, nie robi nic: dwa otwarte wpisy
   * naraz liczyłyby ten sam czas podwójnie, a użytkownik nie ma jak tego
   * zobaczyć na liście.
   */
  startTracking(options: { id: string; at?: Date; who?: string; note?: string }): this {
    if (this.isTracking()) return this;
    const entry: TaskTimeEntry = {
      id: options.id,
      start: (options.at ?? new Date()).toISOString(),
      ...(options.who ? { who: options.who } : {}),
      ...(options.note ? { note: options.note } : {}),
    };
    this.timeEntries = [...(this.timeEntries ?? []), entry];
    this.markDirty();
    return this;
  }

  /**
   * Zamyka biegnący pomiar. Bez pomiaru — nic się nie dzieje.
   *
   * Podmiana elementu zamiast przypisania do `end`, bo `clone()` przechodzi
   * przez `toModel()` i klon współdzieli obiekty wpisów z oryginałem —
   * mutacja zatrzymywałaby licznik w obu naraz.
   */
  stopTracking(at: Date = new Date()): this {
    const open = this.openEntry();
    if (!open) return this;
    this.timeEntries = this.timeEntries!.map(
      entry => (entry === open ? { ...entry, end: at.toISOString() } : entry)
    );
    this.markDirty();
    return this;
  }

  // --- zależności ---------------------------------------------------------

  /**
   * Dopisuje poprzednik. Zadanie zależne od samego siebie jest cyklem
   * długości jeden — jedynym, który da się wykryć bez oglądania reszty grafu,
   * więc odrzucamy go tutaj; dłuższe cykle są sprawą warstwy widoku, która zna
   * wszystkie zadania.
   */
  addDependency(taskId: string): this {
    if (taskId === this.id) return this;
    const current = this.dependsOn ?? [];
    if (current.includes(taskId)) return this;
    this.dependsOn = [...current, taskId];
    this.markDirty();
    return this;
  }

  removeDependency(taskId: string): this {
    if (!this.dependsOn) return this;
    this.dependsOn = keepList(this.dependsOn.filter(id => id !== taskId));
    this.markDirty();
    return this;
  }

  clone(): TaskNode {
    const cloned = this.copyBaseStateTo(new TaskNode(this.toModel()));
    cloned._isCompleted = this._isCompleted;
    cloned._progress = this._progress;
    cloned._projectRef = this._projectRef;
    return cloned;
  }

  // Reset all states including task-specific
  resetState(): this {
    super.resetState();
    this._isCompleted = false;
    this._progress = 0;
    return this;
  }

  // Compare
  equals(other: TaskNode | TaskModel): boolean {
    return this.id === other.id;
  }
}
