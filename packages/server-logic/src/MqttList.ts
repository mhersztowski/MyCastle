/**
 * MqttList<T> — an observable collection with CRUD operations, optionally
 * mirrored over MQTT (see "Globalne: MqttList<type> crud do type" in ServerLogic.md).
 *
 * CRUD requests arrive on a request topic as Envelope payloads:
 *   { type: 'list' }
 *   { type: 'create', payload: T }
 *   { type: 'update', payload: { id, patch } }
 *   { type: 'remove', payload: { id } }
 * Every mutation re-publishes a full snapshot on the snapshot topic.
 */

import { Signal } from '@mhersztowski/minislib';
import type { IMqttTransport } from './transport';
import { parseEnvelope, stringifyEnvelope } from './messages';

export interface Identifiable {
  id: string;
}

export interface MqttListBinding {
  /** Topic the list listens on for CRUD requests. */
  requestTopic: string;
  /** Topic the list publishes full snapshots to after each change. */
  snapshotTopic: string;
}

export class MqttList<T extends Identifiable> {
  /** Fires after any mutation (create/update/remove/clear). */
  readonly changed = new Signal<[]>();
  readonly itemAdded = new Signal<[T]>();
  readonly itemUpdated = new Signal<[T]>();
  readonly itemRemoved = new Signal<[string]>();

  private readonly items = new Map<string, T>();
  private transport?: IMqttTransport;
  private binding?: MqttListBinding;

  constructor(initial?: T[]) {
    if (initial) for (const it of initial) this.items.set(it.id, it);
  }

  // ── Reads ───────────────────────────────────────────────────────────────────
  list(): T[] {
    return [...this.items.values()];
  }
  get(id: string): T | undefined {
    return this.items.get(id);
  }
  get size(): number {
    return this.items.size;
  }

  // ── Mutations ───────────────────────────────────────────────────────────────
  create(item: T): T {
    this.items.set(item.id, item);
    this.itemAdded.emit(item);
    this.afterChange();
    return item;
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const cur = this.items.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, id } as T;
    this.items.set(id, next);
    this.itemUpdated.emit(next);
    this.afterChange();
    return next;
  }

  remove(id: string): boolean {
    if (!this.items.delete(id)) return false;
    this.itemRemoved.emit(id);
    this.afterChange();
    return true;
  }

  clear(): void {
    this.items.clear();
    this.afterChange();
  }

  // ── MQTT mirroring ──────────────────────────────────────────────────────────
  bind(transport: IMqttTransport, binding: MqttListBinding): void {
    this.transport = transport;
    this.binding = binding;
    transport.subscribe((topic, payload) => {
      if (topic === binding.requestTopic) this.handleRequest(payload);
    });
    this.publishSnapshot();
  }

  /** Apply a CRUD request received as a JSON Envelope payload. */
  handleRequest(payload: string): void {
    const env = parseEnvelope(payload);
    if (!env) return;
    switch (env.type) {
      case 'create':
        if (env.payload) this.create(env.payload as T);
        break;
      case 'update': {
        const p = env.payload as { id?: string; patch?: Partial<T> } | undefined;
        if (p?.id) this.update(p.id, p.patch ?? {});
        break;
      }
      case 'remove': {
        const p = env.payload as { id?: string } | undefined;
        if (p?.id) this.remove(p.id);
        break;
      }
      case 'list':
        this.publishSnapshot();
        break;
    }
  }

  private afterChange(): void {
    this.changed.emit();
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    if (!this.transport || !this.binding) return;
    this.transport.publish(
      this.binding.snapshotTopic,
      stringifyEnvelope({ type: 'snapshot', payload: this.list() }),
    );
  }
}
