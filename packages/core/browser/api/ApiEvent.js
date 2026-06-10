import { EventNode } from '../EventNode.js';

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
function pad(n) { return String(n).padStart(2, '0'); }

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

export class ApiEvent {
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
}
