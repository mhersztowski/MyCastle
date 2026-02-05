import { NodeBase } from './NodeBase';
import { TaskModel, TaskComponentModel, TaskIntervalComponentModel } from '../models/TaskModel';

type ProjectNodeRef = { id: string; name: string } | null;

export class TaskNode extends NodeBase<TaskModel> {
  readonly type = 'task' as const;
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  duration?: number;
  cost?: number;
  components?: TaskComponentModel[];

  private _isCompleted: boolean = false;
  private _progress: number = 0;
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
  }

  static fromModel(model: TaskModel): TaskNode {
    return new TaskNode(model);
  }

  static fromModels(models: TaskModel[]): TaskNode[] {
    return models.map(m => TaskNode.fromModel(m));
  }

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

  get progress(): number {
    return this._progress;
  }

  setProgress(value: number): this {
    this._progress = Math.max(0, Math.min(100, value));
    this._isCompleted = this._progress === 100;
    return this;
  }

  get projectRef(): ProjectNodeRef {
    return this._projectRef;
  }

  setProjectRef(ref: ProjectNodeRef): this {
    this._projectRef = ref;
    return this;
  }

  getDisplayName(): string {
    return this.name;
  }

  hasProject(): boolean {
    return !!this.projectId;
  }

  getProjectName(): string | null {
    return this._projectRef?.name ?? null;
  }

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

  getDurationHours(): number | null {
    if (this.duration === undefined) return null;
    return this.duration;
  }

  getCostFormatted(currency: string = 'PLN'): string | null {
    if (this.cost === undefined) return null;
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
    }).format(this.cost);
  }

  hasCost(): boolean {
    return this.cost !== undefined && this.cost > 0;
  }

  hasDuration(): boolean {
    return this.duration !== undefined && this.duration > 0;
  }

  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  getComponentByType<T extends TaskComponentModel>(type: string): T | undefined {
    return this.components?.find(c => c.type === type) as T | undefined;
  }

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

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.projectId?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  updateFrom(model: TaskModel): this {
    this.projectId = model.projectId;
    this.name = model.name;
    this.description = model.description;
    this.duration = model.duration;
    this.cost = model.cost;
    this.components = model.components;
    this.markDirty();
    return this;
  }

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
    };
  }

  clone(): TaskNode {
    const cloned = new TaskNode(this.toModel());
    cloned._isDirty = this._isDirty;
    cloned._isCompleted = this._isCompleted;
    cloned._progress = this._progress;
    cloned._projectRef = this._projectRef;
    return cloned;
  }

  equals(other: TaskNode | TaskModel): boolean {
    return this.id === other.id;
  }
}
