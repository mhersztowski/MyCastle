import { Connection } from './Connection';

export type Slot<T extends unknown[]> = (...args: T) => void;

/** Internal interface — implemented by MObject to auto-track connections. */
export interface IConnectionOwner {
  /** @internal */ _trackConnection(conn: Connection): void;
}

/**
 * Type-safe Qt-style signal.
 *
 * Usage:
 *   readonly clicked = new Signal<[x: number, y: number]>();
 *   this.clicked.connect((x, y) => { ... });
 *   this.clicked.emit(10, 20);
 *
 * Pass an MObject as `context` to have the connection auto-disconnected
 * when the context is destroyed.
 */
export class Signal<T extends unknown[] = []> {
  readonly #slots = new Map<symbol, Slot<T>>();
  #blocked = false;

  connect(slot: Slot<T>, context?: IConnectionOwner): Connection {
    const key = Symbol();
    this.#slots.set(key, slot);
    const conn = new Connection(() => this.#slots.delete(key));
    if (context) {
      context._trackConnection(conn);
    }
    return conn;
  }

  emit(...args: T): void {
    if (this.#blocked) return;
    // Snapshot to avoid mutation issues during emit
    for (const slot of [...this.#slots.values()]) {
      try {
        slot(...args);
      } catch (err) {
        // Isolate slot errors — one bad slot doesn't stop the rest
        console.error('[Signal] Slot threw an error:', err);
      }
    }
  }

  /** Temporarily suspend emission without removing connections. */
  blockSignals(blocked: boolean): void {
    this.#blocked = blocked;
  }

  get blocked(): boolean {
    return this.#blocked;
  }

  get connectionCount(): number {
    return this.#slots.size;
  }

  /** Remove every connected slot. */
  disconnectAll(): void {
    this.#slots.clear();
  }
}
