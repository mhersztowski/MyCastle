import { MObject } from './core/MObject';
import { Signal } from './core/Signal';

export type TimerMode = 'interval' | 'singleShot';

/**
 * Qt-style timer with **drift compensation**.
 *
 * `setInterval` accumulates drift when callbacks are slow: a 1 000 ms timer
 * whose callback takes 20 ms will fire at 1 020 ms, 2 040 ms, … after a few
 * hours the error is measurable. This implementation self-schedules with
 * `setTimeout` and adjusts each delay by the measured overrun so the long-term
 * cadence stays accurate — the same technique used by Node.js's `timers/promises`
 * `setInterval` and most production scheduler libraries.
 *
 * Usage:
 *   const timer = new MTimer(parent);
 *   timer.timeout.connect(() => doWork());
 *   timer.start(1000);           // every 1 s (drift-compensated)
 *   timer.startSingleShot(500);  // once after 500 ms
 *   timer.stop();
 *
 * The timer is automatically stopped and cleaned up when the parent MObject
 * is destroyed.
 */
export class MTimer extends MObject {
  readonly timeout = new Signal();

  #handle: ReturnType<typeof setTimeout> | null = null;
  #mode: TimerMode = 'interval';
  #intervalMs = 0;
  #active = false;

  constructor(parent?: MObject) {
    super(parent, 'MTimer');
  }

  /** Start repeating timer with `intervalMs` period (drift-compensated). */
  start(intervalMs: number): void {
    this.stop();
    this.#intervalMs = intervalMs;
    this.#mode = 'interval';
    this.#active = true;
    this.#scheduleNext(intervalMs, Date.now());
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
      clearTimeout(this.#handle);
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

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Self-scheduling setTimeout loop with drift compensation.
   *
   * `expectedAt` is when this tick *should* have fired. After the callback
   * runs we compare `Date.now()` to `expectedAt + intervalMs` and subtract
   * any overrun from the next delay, keeping the long-term cadence accurate.
   */
  #scheduleNext(delay: number, expectedAt: number): void {
    this.#handle = setTimeout(() => {
      if (!this.#active) return;
      this.#handle = null;

      this.timeout.emit();

      if (!this.#active) return; // emit() may have called stop()

      const nextExpected = expectedAt + this.#intervalMs;
      // Compensate: subtract however long we overran (measured after callback)
      const nextDelay = Math.max(0, nextExpected - Date.now());
      this.#scheduleNext(nextDelay, nextExpected);
    }, delay);
  }
}
