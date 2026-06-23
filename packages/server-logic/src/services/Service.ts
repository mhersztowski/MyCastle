import { MObject } from '@mhersztowski/minislib';

/**
 * Base class for server-side services (Log, Console, Cron, VFS …).
 * Extends MObject so services participate in the Qt-like object tree and
 * signal/lifecycle conventions used across the codebase.
 */
export abstract class Service extends MObject {
  abstract readonly name: string;

  /** Called when the owning IotServer starts. Override as needed. */
  start(): void {}
  /** Called when the owning IotServer stops. Override as needed. */
  stop(): void {}
}
