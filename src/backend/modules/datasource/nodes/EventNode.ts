import { NodeBase } from './NodeBase';
import { EventModel, EventComponentModel } from '../models/EventModel';

type TaskNodeRef = { id: string; name: string } | null;

/**
 * EventNode - backend version using native Date (no dayjs dependency)
 */
export class EventNode extends NodeBase<EventModel> {
  readonly type = 'event' as const;
  taskId?: string;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  components?: EventComponentModel[];

  private _taskRef: TaskNodeRef = null;
  private _startDate: Date | null = null;
  private _endDate: Date | null = null;
  private _dateContext: Date | null = null;

  constructor(model: EventModel) {
    super();
    this.taskId = model.taskId;
    this.name = model.name;
    this.description = model.description;
    this.startTime = model.startTime;
    this.endTime = model.endTime;
    this.components = model.components;
    this.parseDates();
  }

  static fromModel(model: EventModel): EventNode {
    return new EventNode(model);
  }

  static fromModels(models: EventModel[]): EventNode[] {
    return models.map(m => EventNode.fromModel(m));
  }

  // Set date context from calendar file path (YYYY/MM/DD)
  setDateContext(date: Date): this {
    this._dateContext = date;
    this.parseDates();
    return this;
  }

  private parseDates(): void {
    try {
      this._startDate = this.parseTimeString(this.startTime);
    } catch {
      this._startDate = null;
    }

    if (this.endTime) {
      try {
        this._endDate = this.parseTimeString(this.endTime);
      } catch {
        this._endDate = null;
      }
    }
  }

  private parseTimeString(timeStr: string): Date | null {
    try {
      // Full ISO string or date with dashes
      if (timeStr.includes('T') || timeStr.includes('-')) {
        return new Date(timeStr);
      }

      // Time-only (HH:mm or HH:mm:ss) — use dateContext or today
      const parts = timeStr.split(':').map(Number);
      const hours = parts[0] || 0;
      const minutes = parts[1] || 0;
      const seconds = parts[2] || 0;

      const base = this._dateContext ? new Date(this._dateContext) : new Date();
      base.setHours(hours, minutes, seconds, 0);
      return base;
    } catch {
      return null;
    }
  }

  get taskRef(): TaskNodeRef {
    return this._taskRef;
  }

  setTaskRef(ref: TaskNodeRef): this {
    this._taskRef = ref;
    return this;
  }

  getDisplayName(): string {
    return this.name;
  }

  getStartDate(): Date | null {
    return this._startDate;
  }

  getEndDate(): Date | null {
    return this._endDate;
  }

  hasTask(): boolean {
    return !!this.taskId;
  }

  getTaskName(): string | null {
    return this._taskRef?.name ?? null;
  }

  hasEndTime(): boolean {
    return !!this.endTime;
  }

  isAllDay(): boolean {
    if (!this._startDate) return false;
    const isStartMidnight = this._startDate.getHours() === 0 && this._startDate.getMinutes() === 0;
    const isEndMidnight = !this._endDate || (this._endDate.getHours() === 0 && this._endDate.getMinutes() === 0);
    return isStartMidnight && isEndMidnight;
  }

  getTimeRange(): string {
    if (!this._startDate) return this.startTime;

    const start = this.formatTime(this._startDate);
    if (this._endDate) {
      return `${start} - ${this.formatTime(this._endDate)}`;
    }
    return start;
  }

  private formatTime(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  getDuration(): number | null {
    if (!this._startDate || !this._endDate) return null;
    return Math.round((this._endDate.getTime() - this._startDate.getTime()) / 60000);
  }

  getDurationFormatted(): string | null {
    const duration = this.getDuration();
    if (duration === null) return null;

    if (duration < 60) {
      return `${duration}m`;
    } else {
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  }

  isNow(): boolean {
    if (!this._startDate) return false;
    const now = Date.now();
    const start = this._startDate.getTime();

    if (this._endDate) {
      return now >= start && now <= this._endDate.getTime();
    }

    // If no end time, consider "now" if within an hour of start
    return now >= start && now < start + 3600000;
  }

  isPast(): boolean {
    const endDate = this._endDate || this._startDate;
    if (!endDate) return false;
    return Date.now() > endDate.getTime();
  }

  isFuture(): boolean {
    if (!this._startDate) return false;
    return Date.now() < this._startDate.getTime();
  }

  isSameDay(date: Date): boolean {
    if (!this._startDate) return false;
    return (
      this._startDate.getFullYear() === date.getFullYear() &&
      this._startDate.getMonth() === date.getMonth() &&
      this._startDate.getDate() === date.getDate()
    );
  }

  isToday(): boolean {
    return this.isSameDay(new Date());
  }

  getDateFormatted(): string | null {
    if (!this._startDate) return null;
    const y = this._startDate.getFullYear();
    const m = String(this._startDate.getMonth() + 1).padStart(2, '0');
    const d = String(this._startDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getDateTimeFormatted(): string | null {
    if (!this._startDate) return null;
    return `${this.getDateFormatted()} ${this.formatTime(this._startDate)}`;
  }

  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  getComponentByType<T extends EventComponentModel>(type: string): T | undefined {
    return this.components?.find(c => c.type === type) as T | undefined;
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.taskId?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  updateFrom(model: EventModel): this {
    this.taskId = model.taskId;
    this.name = model.name;
    this.description = model.description;
    this.startTime = model.startTime;
    this.endTime = model.endTime;
    this.components = model.components;
    this.parseDates();
    this.markDirty();
    return this;
  }

  setTimes(startTime: string, endTime?: string): this {
    this.startTime = startTime;
    this.endTime = endTime;
    this.parseDates();
    this.markDirty();
    return this;
  }

  toModel(): EventModel {
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

  clone(): EventNode {
    const cloned = new EventNode(this.toModel());
    cloned._isDirty = this._isDirty;
    cloned._taskRef = this._taskRef;
    if (this._dateContext) {
      cloned.setDateContext(this._dateContext);
    }
    return cloned;
  }

  compareTo(other: EventNode): number {
    if (!this._startDate && !other._startDate) return 0;
    if (!this._startDate) return 1;
    if (!other._startDate) return -1;
    return this._startDate.getTime() - other._startDate.getTime();
  }

  static sortByTime(events: EventNode[]): EventNode[] {
    return [...events].sort((a, b) => a.compareTo(b));
  }
}
