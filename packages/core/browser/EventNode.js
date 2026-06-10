import { NodeBase } from './NodeBase.js';

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

export class EventNode extends NodeBase {
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
}
