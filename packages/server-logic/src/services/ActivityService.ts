import { Signal } from '@mhersztowski/minislib';
import { Service } from './Service';

export interface ActivityEntry {
  ts: number;
  /** Category, e.g. `client.connected`, `server.message`, `ui.event`. */
  kind: string;
  message: string;
  data?: unknown;
}

/**
 * Server activity feed (`IotServer.activity`). Records a bounded, time-ordered
 * stream of notable events and emits `onActivity` for live subscribers.
 */
export class ActivityService extends Service {
  readonly name = 'activity';
  readonly onActivity = new Signal<[ActivityEntry]>();

  private readonly buffer: ActivityEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    super();
    this.maxEntries = maxEntries;
  }

  record(kind: string, message: string, data?: unknown): ActivityEntry {
    const entry: ActivityEntry = { ts: Date.now(), kind, message, data };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) this.buffer.shift();
    this.onActivity.emit(entry);
    return entry;
  }

  recent(n = 100): ActivityEntry[] {
    return n >= this.buffer.length ? [...this.buffer] : this.buffer.slice(-n);
  }
}
