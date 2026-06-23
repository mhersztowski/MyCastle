import { Signal } from '@mhersztowski/minislib';
import { Service } from './Service';

/** Severity of a log message (see ServerLogic.md → Service Log). */
export enum EnumLogKind {
  Log = 'log',
  Debug = 'debug',
  Warning = 'warning',
  Error = 'error',
}

export interface ILogMessage {
  message: string;
  kind: EnumLogKind;
  /** Epoch millis; stamped by `log()` when absent. */
  ts?: number;
  /** Optional originating subsystem/client. */
  source?: string;
}

/**
 * Server log service. `log(msg)` runs and emits `onMessage(msg)` — the exact
 * contract from ServerLogic.md. Keeps a bounded ring buffer of recent entries.
 */
export class LogService extends Service {
  readonly name = 'log';
  readonly onMessage = new Signal<[ILogMessage]>();

  private readonly buffer: ILogMessage[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    super();
    this.maxEntries = maxEntries;
  }

  log(msg: ILogMessage): void {
    const full: ILogMessage = { ts: Date.now(), ...msg };
    this.buffer.push(full);
    if (this.buffer.length > this.maxEntries) this.buffer.shift();
    this.onMessage.emit(full);
  }

  debug(message: string, source?: string): void {
    this.log({ message, kind: EnumLogKind.Debug, source });
  }
  info(message: string, source?: string): void {
    this.log({ message, kind: EnumLogKind.Log, source });
  }
  warning(message: string, source?: string): void {
    this.log({ message, kind: EnumLogKind.Warning, source });
  }
  error(message: string, source?: string): void {
    this.log({ message, kind: EnumLogKind.Error, source });
  }

  /** Most recent entries (newest last). */
  recent(n = 100): ILogMessage[] {
    return n >= this.buffer.length ? [...this.buffer] : this.buffer.slice(-n);
  }
}
