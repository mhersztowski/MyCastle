/** Sliding-window rate limiter (in-memory per device). */
export interface RateLimitConfig {
  maxMessages: number;
  windowMs: number;
}

interface DeviceWindow {
  count: number;
  windowStart: number;
  dropped: number;
}

export class RateLimiter {
  private windows = new Map<string, DeviceWindow>();
  private cleanupTimer: NodeJS.Timeout;

  constructor(private config: RateLimitConfig = { maxMessages: 100, windowMs: 60_000 }) {
    // Prune stale windows every 5 minutes
    this.cleanupTimer = setInterval(() => this.prune(), 5 * 60_000);
    this.cleanupTimer.unref();
  }

  /** Returns true if the message is allowed, false if rate-limited. */
  allow(deviceId: string): boolean {
    const now = Date.now();
    let win = this.windows.get(deviceId);

    if (!win || now - win.windowStart >= this.config.windowMs) {
      win = { count: 0, windowStart: now, dropped: 0 };
      this.windows.set(deviceId, win);
    }

    if (win.count >= this.config.maxMessages) {
      win.dropped++;
      if (win.dropped === 1 || win.dropped % 10 === 0) {
        console.warn(`[RateLimit] Device ${deviceId} exceeded ${this.config.maxMessages} msg/${this.config.windowMs}ms — dropped #${win.dropped}`);
      }
      return false;
    }

    win.count++;
    return true;
  }

  getStats(deviceId: string): { count: number; dropped: number } | null {
    const win = this.windows.get(deviceId);
    return win ? { count: win.count, dropped: win.dropped } : null;
  }

  private prune(): void {
    const cutoff = Date.now() - this.config.windowMs;
    for (const [id, win] of this.windows) {
      if (win.windowStart < cutoff) this.windows.delete(id);
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    this.windows.clear();
  }
}
