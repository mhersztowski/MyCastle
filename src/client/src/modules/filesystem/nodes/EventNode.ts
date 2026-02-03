import dayjs, { Dayjs } from 'dayjs';
import { NodeBase } from './NodeBase';
import { EventModel, EventComponentModel } from '../models/EventModel';

// Forward reference type for task
type TaskNodeRef = { id: string; name: string } | null;

/**
 * EventNode extends EventModel with UI state, relationships, and utility functions
 * Uses dayjs for all date/time operations
 */
export class EventNode extends NodeBase<EventModel> {
  readonly type = 'event' as const;
  taskId?: string;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  components?: EventComponentModel[];

  // Task reference
  private _taskRef: TaskNodeRef = null;

  // Parsed dates cache (using dayjs)
  private _startDate: Dayjs | null = null;
  private _endDate: Dayjs | null = null;

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

  // Parse date strings to Dayjs objects
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

  // Parse time string (supports HH:mm, HH:mm:ss, or ISO)
  private parseTimeString(timeStr: string): Dayjs {
    // If it's a full ISO string or date
    if (timeStr.includes('T') || timeStr.includes('-')) {
      return dayjs(timeStr);
    }

    // If it's just time (HH:mm or HH:mm:ss)
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return dayjs()
      .hour(hours || 0)
      .minute(minutes || 0)
      .second(seconds || 0)
      .millisecond(0);
  }

  // Task reference
  get taskRef(): TaskNodeRef {
    return this._taskRef;
  }

  setTaskRef(ref: TaskNodeRef): this {
    this._taskRef = ref;
    return this;
  }

  // Display name
  getDisplayName(): string {
    return this.name;
  }

  // Get parsed start date (as Dayjs)
  getStartDate(): Dayjs | null {
    return this._startDate;
  }

  // Get parsed end date (as Dayjs)
  getEndDate(): Dayjs | null {
    return this._endDate;
  }

  // Get start date as native Date (for compatibility)
  getStartDateNative(): Date | null {
    return this._startDate?.toDate() ?? null;
  }

  // Get end date as native Date (for compatibility)
  getEndDateNative(): Date | null {
    return this._endDate?.toDate() ?? null;
  }

  // Check if event has task
  hasTask(): boolean {
    return !!this.taskId;
  }

  // Get task name if available
  getTaskName(): string | null {
    return this._taskRef?.name ?? null;
  }

  // Check if event has end time
  hasEndTime(): boolean {
    return !!this.endTime;
  }

  // Check if this is an all-day event (no specific time)
  isAllDay(): boolean {
    // Consider all-day if times are at midnight or not set properly
    if (!this._startDate) return false;
    const isStartMidnight = this._startDate.hour() === 0 && this._startDate.minute() === 0;
    const isEndMidnight = !this._endDate || (this._endDate.hour() === 0 && this._endDate.minute() === 0);
    return isStartMidnight && isEndMidnight;
  }

  // Get time range as formatted string
  getTimeRange(): string {
    if (!this._startDate) return this.startTime;

    const start = this._startDate.format('HH:mm');
    if (this._endDate) {
      return `${start} - ${this._endDate.format('HH:mm')}`;
    }
    return start;
  }

  // Get duration in minutes
  getDuration(): number | null {
    if (!this._startDate || !this._endDate) return null;
    return this._endDate.diff(this._startDate, 'minute');
  }

  // Get duration formatted
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

  // Check if event is currently happening
  isNow(): boolean {
    if (!this._startDate) return false;
    const now = dayjs();

    if (this._endDate) {
      return now.isAfter(this._startDate) && now.isBefore(this._endDate) ||
             now.isSame(this._startDate) || now.isSame(this._endDate);
    }

    // If no end time, consider "now" if within an hour of start
    const hourAfterStart = this._startDate.add(1, 'hour');
    return (now.isAfter(this._startDate) || now.isSame(this._startDate)) &&
           now.isBefore(hourAfterStart);
  }

  // Check if event is in the past
  isPast(): boolean {
    const endDate = this._endDate || this._startDate;
    if (!endDate) return false;
    return dayjs().isAfter(endDate);
  }

  // Check if event is in the future
  isFuture(): boolean {
    if (!this._startDate) return false;
    return dayjs().isBefore(this._startDate);
  }

  // Check if event has components
  hasComponents(): boolean {
    return !!this.components && this.components.length > 0;
  }

  // Get component by type
  getComponentByType<T extends EventComponentModel>(type: string): T | undefined {
    return this.components?.find(c => c.type === type) as T | undefined;
  }

  // Search helper
  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.taskId?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Update from model
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

  // Set times and update parsed dates
  setTimes(startTime: string, endTime?: string): this {
    this.startTime = startTime;
    this.endTime = endTime;
    this.parseDates();
    this.markDirty();
    return this;
  }

  // Check if event is on the same day as given date
  isSameDay(date: Dayjs | Date): boolean {
    if (!this._startDate) return false;
    const compareDate = dayjs(date);
    return this._startDate.isSame(compareDate, 'day');
  }

  // Check if event is today
  isToday(): boolean {
    return this.isSameDay(dayjs());
  }

  // Get formatted date string
  getDateFormatted(format = 'YYYY-MM-DD'): string | null {
    return this._startDate?.format(format) ?? null;
  }

  // Get full formatted date and time
  getDateTimeFormatted(format = 'YYYY-MM-DD HH:mm'): string | null {
    return this._startDate?.format(format) ?? null;
  }

  // Get relative time from now (e.g., "in 2 hours", "3 days ago")
  getRelativeTime(): string | null {
    if (!this._startDate) return null;
    const now = dayjs();
    const diffMinutes = this._startDate.diff(now, 'minute');
    const diffHours = this._startDate.diff(now, 'hour');
    const diffDays = this._startDate.diff(now, 'day');

    if (Math.abs(diffMinutes) < 60) {
      return diffMinutes >= 0 ? `in ${diffMinutes}m` : `${Math.abs(diffMinutes)}m ago`;
    } else if (Math.abs(diffHours) < 24) {
      return diffHours >= 0 ? `in ${diffHours}h` : `${Math.abs(diffHours)}h ago`;
    } else {
      return diffDays >= 0 ? `in ${diffDays}d` : `${Math.abs(diffDays)}d ago`;
    }
  }

  // Convert back to model
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

  // Clone
  clone(): EventNode {
    const cloned = new EventNode(this.toModel());
    cloned._isSelected = this._isSelected;
    cloned._isExpanded = this._isExpanded;
    cloned._isEditing = this._isEditing;
    cloned._isDirty = this._isDirty;
    cloned._taskRef = this._taskRef;
    return cloned;
  }

  // Compare by time for sorting
  compareTo(other: EventNode): number {
    if (!this._startDate && !other._startDate) return 0;
    if (!this._startDate) return 1;
    if (!other._startDate) return -1;
    return this._startDate.diff(other._startDate);
  }

  // Static sort helper
  static sortByTime(events: EventNode[]): EventNode[] {
    return [...events].sort((a, b) => a.compareTo(b));
  }
}
