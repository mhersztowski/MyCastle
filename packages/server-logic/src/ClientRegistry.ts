import { MObject, Signal } from '@mhersztowski/minislib';
import { type ClientId, clientKey } from './types';

export interface ClientPresence {
  client: ClientId;
  connectedAt: number;
  lastSeen: number;
}

/**
 * Tracks currently-known clients keyed by (user/device-clientType/id).
 * Presence is driven by `client.hello` / `client.bye` messages and refreshed
 * on any client activity; stale entries can be pruned by `prune()`.
 */
export class ClientRegistry extends MObject {
  readonly changed = new Signal<[]>();
  readonly clientConnected = new Signal<[ClientId]>();
  readonly clientDisconnected = new Signal<[ClientId]>();

  private readonly clients = new Map<string, ClientPresence>();

  /** Register a client or refresh its presence. Emits `clientConnected` once. */
  register(client: ClientId): ClientPresence {
    const key = clientKey(client);
    const now = Date.now();
    const existing = this.clients.get(key);
    if (existing) {
      existing.lastSeen = now;
      return existing;
    }
    const presence: ClientPresence = { client, connectedAt: now, lastSeen: now };
    this.clients.set(key, presence);
    this.clientConnected.emit(client);
    this.changed.emit();
    return presence;
  }

  /** Refresh `lastSeen` without emitting connect (no-op if unknown). */
  touch(client: ClientId): void {
    const p = this.clients.get(clientKey(client));
    if (p) p.lastSeen = Date.now();
  }

  unregister(client: ClientId): boolean {
    const key = clientKey(client);
    if (!this.clients.delete(key)) return false;
    this.clientDisconnected.emit(client);
    this.changed.emit();
    return true;
  }

  list(): ClientPresence[] {
    return [...this.clients.values()];
  }

  byUser(userName: string): ClientPresence[] {
    return this.list().filter((p) => p.client.userName === userName);
  }

  /** Drop clients not seen within `maxAgeMs`. Returns the number removed. */
  prune(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [key, p] of this.clients) {
      if (p.lastSeen < cutoff) {
        this.clients.delete(key);
        this.clientDisconnected.emit(p.client);
        removed++;
      }
    }
    if (removed) this.changed.emit();
    return removed;
  }
}
