import { MObject, Signal } from '@mhersztowski/minislib';
import { type ClientId, clientKey } from './types';
import type { RegisteredEntity } from './messages';

export interface ClientPresence {
  client: ClientId;
  connectedAt: number;
  lastSeen: number;
  /** Services the client registered via `client-service-new`. */
  services: RegisteredEntity[];
  /** Devices the client registered via `client-device-new`. */
  devices: RegisteredEntity[];
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
  /** Emitted when a service/device is added or removed (client, list kind). */
  readonly entitiesChanged = new Signal<[ClientId, 'service' | 'device']>();

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
    const presence: ClientPresence = {
      client, connectedAt: now, lastSeen: now, services: [], devices: [],
    };
    this.clients.set(key, presence);
    this.clientConnected.emit(client);
    this.changed.emit();
    return presence;
  }

  // ── Services & devices ──────────────────────────────────────────────────────

  /** Add/replace a service on a client (registers the client first if unknown). */
  addService(client: ClientId, entity: RegisteredEntity): void {
    this.upsertEntity(client, 'services', entity);
    this.entitiesChanged.emit(client, 'service');
  }
  removeService(client: ClientId, serviceId: string): void {
    if (this.dropEntity(client, 'services', serviceId)) {
      this.entitiesChanged.emit(client, 'service');
    }
  }
  addDevice(client: ClientId, entity: RegisteredEntity): void {
    this.upsertEntity(client, 'devices', entity);
    this.entitiesChanged.emit(client, 'device');
  }
  removeDevice(client: ClientId, deviceId: string): void {
    if (this.dropEntity(client, 'devices', deviceId)) {
      this.entitiesChanged.emit(client, 'device');
    }
  }

  private upsertEntity(client: ClientId, list: 'services' | 'devices', entity: RegisteredEntity): void {
    const p = this.register(client); // ensure the client exists, refresh lastSeen
    const arr = p[list];
    const i = arr.findIndex((e) => e.id === entity.id);
    if (i >= 0) arr[i] = entity;
    else arr.push(entity);
    this.changed.emit();
  }

  private dropEntity(client: ClientId, list: 'services' | 'devices', id: string): boolean {
    const p = this.clients.get(clientKey(client));
    if (!p) return false;
    const before = p[list].length;
    p[list] = p[list].filter((e) => e.id !== id);
    if (p[list].length === before) return false;
    p.lastSeen = Date.now();
    this.changed.emit();
    return true;
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
