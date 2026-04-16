import { MObject } from './core/MObject';
import { Signal } from './core/Signal';

export type TimerMode = 'interval' | 'singleShot';

/**
 * Qt-style timer that integrates with the MObject lifecycle.
 *
 * Usage:
 *   const timer = new MTimer(parent);
 *   timer.timeout.connect(() => doWork());
 *   timer.start(1000);       // every 1 s
 *   timer.startSingleShot(500);  // once after 500 ms
 *   timer.stop();
 *
 * The timer is automatically stopped and cleaned up when destroyed.
 */
export class MTimer extends MObject {
  readonly timeout = new Signal();

  #handle: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null =
    null;
  #mode: TimerMode = 'interval';
  #intervalMs = 0;
  #active = false;

  constructor(parent?: MObject) {
    super(parent, 'MTimer');
  }

  /** Start repeating timer with `intervalMs` period. */
  start(intervalMs: number): void {
    this.stop();
    this.#intervalMs = intervalMs;
    this.#mode = 'interval';
    this.#active = true;
    this.#handle = setInterval(() => this.timeout.emit(), intervalMs);
  }

  /** Fire once after `ms` milliseconds. */
  startSingleShot(ms: number): void {
    this.stop();
    this.#intervalMs = ms;
    this.#mode = 'singleShot';
    this.#active = true;
    this.#handle = setTimeout(() => {
      this.#active = false;
      this.#handle = null;
      this.timeout.emit();
    }, ms);
  }

  stop(): void {
    if (this.#handle !== null) {
      if (this.#mode === 'interval') {
        clearInterval(this.#handle as ReturnType<typeof setInterval>);
      } else {
        clearTimeout(this.#handle as ReturnType<typeof setTimeout>);
      }
      this.#handle = null;
    }
    this.#active = false;
  }

  /** Restart with the last configured interval. */
  restart(): void {
    if (this.#mode === 'interval') {
      this.start(this.#intervalMs);
    } else {
      this.startSingleShot(this.#intervalMs);
    }
  }

  get active(): boolean {
    return this.#active;
  }

  get intervalMs(): number {
    return this.#intervalMs;
  }

  get mode(): TimerMode {
    return this.#mode;
  }

  /** Convenience: create a running repeating timer. */
  static create(intervalMs: number, parent?: MObject): MTimer {
    const t = new MTimer(parent);
    t.start(intervalMs);
    return t;
  }

  /** Convenience: create a running single-shot timer. */
  static singleShot(ms: number, parent?: MObject): MTimer {
    const t = new MTimer(parent);
    t.startSingleShot(ms);
    return t;
  }

  protected override onDestroy(): void {
    this.stop();
  }
}
