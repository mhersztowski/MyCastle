/**
 * Log value types — kept free of any runtime dependency (no minislib) so they
 * can be imported from the browser-safe entry (`@mhersztowski/server-logic/web`).
 */

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
