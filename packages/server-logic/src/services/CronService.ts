import { Service } from './Service';

export type CronTaskFn = () => void | Promise<void>;

/** Handle to a scheduled cron-expression task. */
export interface ScheduledHandle {
  stop(): void;
}

/**
 * Adapter for cron-expression scheduling. The package stays dependency-free —
 * the host injects a real implementation (e.g. wrapping `node-cron`).
 */
export interface ICronScheduler {
  schedule(expr: string, fn: CronTaskFn): ScheduledHandle;
}

interface Job {
  name: string;
  stop(): void;
}

/**
 * Cron service (see ServerLogic.md → Service.Cron). Supports fixed-interval jobs
 * out of the box (`every`) and full cron expressions when an `ICronScheduler`
 * is provided (`schedule`). Jobs are addressed by a unique name.
 */
export class CronService extends Service {
  readonly name = 'cron';
  private readonly jobs = new Map<string, Job>();

  constructor(private readonly scheduler?: ICronScheduler) {
    super();
  }

  /** Run `fn` every `intervalMs`. Replaces any existing job with the same name. */
  every(name: string, intervalMs: number, fn: CronTaskFn): void {
    this.cancel(name);
    const timer = setInterval(() => void fn(), intervalMs);
    // Don't keep the Node process alive for an interval job (no-op in the browser).
    (timer as unknown as { unref?: () => void }).unref?.();
    this.jobs.set(name, { name, stop: () => clearInterval(timer) });
  }

  /** Schedule `fn` on a cron expression. Requires an injected scheduler. */
  schedule(name: string, expr: string, fn: CronTaskFn): void {
    if (!this.scheduler) {
      throw new Error(
        `CronService: cron expressions require an ICronScheduler — pass one to the IotServer (or use every()).`,
      );
    }
    this.cancel(name);
    const handle = this.scheduler.schedule(expr, fn);
    this.jobs.set(name, { name, stop: () => handle.stop() });
  }

  cancel(name: string): boolean {
    const job = this.jobs.get(name);
    if (!job) return false;
    job.stop();
    this.jobs.delete(name);
    return true;
  }

  list(): string[] {
    return [...this.jobs.keys()];
  }

  override stop(): void {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }
}
