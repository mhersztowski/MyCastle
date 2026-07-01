/**
 * WebServerLogicClient — a browser client-node on the server-logic control plane.
 *
 * The browser counterpart of app/client's `client_desktop`: it logs in as
 * `{user}/{device}-web/{id}`, registers devices/services (defined by the
 * ClientEntity classes from `@mhersztowski/server-logic`), answers commands on
 * their inbox topics, and heartbeats so the server keeps it registered.
 *
 * Transport is injected (see ClientTransport) so this stays free of any concrete
 * MQTT dependency — pass web-client's `mqttClient` raw pub/sub in an app.
 */

import {
  clientInbox, clientOutbox,
  deviceInbox, deviceOutbox, serviceInbox, serviceOutbox,
  clientKey, parseEnvelope, stringifyEnvelope,
  type ClientId, type ClientType, type Envelope, type RegisteredEntity,
  type ClientEntity,
} from '@mhersztowski/server-logic/web';

import { Emitter } from './emitter';
import type { ClientTransport } from './transport';

export interface WebServerLogicClientOptions {
  transport: ClientTransport;
  userName: string;
  /** Unique client id within the user (used in the topic path). */
  id: string;
  /** Client kind — defaults to `desktop`. clientType is always `web` here. */
  device?: ClientType;
  /** Optional human label sent in client-login. */
  name?: string;
  /** Heartbeat period (ms). Server prunes after ~60s; default 25000. 0 disables. */
  heartbeatMs?: number;
}

export interface CommandEvent {
  entityId: string;
  category: 'device' | 'service';
  action: string;
  params: Record<string, unknown>;
  reqId?: string;
  result?: unknown;
  error?: string;
}

export interface WebClientEvents extends Record<string, unknown> {
  connected: undefined;
  disconnected: undefined;
  registered: RegisteredEntity;
  unregistered: string;
  command: CommandEvent;
  /** A message the server addressed to this client (client inbox). */
  message: Envelope;
  error: { message: string };
}

interface Registered {
  entity: ClientEntity;
  unsub?: () => void;
}

export class WebServerLogicClient {
  readonly clientId: ClientId;
  readonly events = new Emitter<WebClientEvents>();

  private readonly transport: ClientTransport;
  private readonly name?: string;
  private readonly heartbeatMs: number;

  private readonly entities = new Map<string, Registered>();
  private _connected = false;
  private inboxUnsub?: () => void;
  private hbTimer?: ReturnType<typeof setInterval>;

  constructor(opts: WebServerLogicClientOptions) {
    this.transport = opts.transport;
    this.name = opts.name;
    this.heartbeatMs = opts.heartbeatMs ?? 25_000;
    this.clientId = {
      userName: opts.userName,
      device: opts.device ?? 'desktop',
      clientType: 'web',
      id: opts.id,
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  /** Currently registered entities (devices + services). */
  list(): ClientEntity[] {
    return [...this.entities.values()].map((r) => r.entity);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Log in, (re)announce all registered entities, start the heartbeat. */
  connect(): void {
    if (this._connected) return;
    this._connected = true;

    // Server → this client (e.g. pushed messages).
    this.inboxUnsub = this.transport.subscribe(clientInbox(this.clientId), (payload) => {
      const env = parseEnvelope(payload);
      if (env) this.events.emit('message', env);
    });

    this.publishToOutbox({ type: 'client-login', payload: { client: this.clientId, name: this.name } });

    for (const reg of this.entities.values()) this.announce(reg);

    if (this.heartbeatMs > 0) {
      this.hbTimer = setInterval(() => this.publishToOutbox({ type: 'heartbeat' }), this.heartbeatMs);
    }
    this.events.emit('connected', undefined);
  }

  /** Send client-*-remove for every entity, log out, and tear down. */
  disconnect(): void {
    if (!this._connected) return;
    for (const reg of this.entities.values()) {
      this.publishEntityRemove(reg.entity);
      reg.unsub?.();
      reg.unsub = undefined;
    }
    this.publishToOutbox({ type: 'client-logout', payload: { client: this.clientId } });
    if (this.hbTimer !== undefined) { clearInterval(this.hbTimer); this.hbTimer = undefined; }
    this.inboxUnsub?.();
    this.inboxUnsub = undefined;
    this._connected = false;
    this.events.emit('disconnected', undefined);
  }

  // ── Devices & services ─────────────────────────────────────────────────────

  /** Register a device or service (category comes from the entity). */
  register(entity: ClientEntity): void {
    const reg: Registered = { entity };
    this.entities.set(entity.id, reg);
    if (this._connected) this.announce(reg);
  }

  /** Unregister by entity or id. */
  unregister(entityOrId: ClientEntity | string): void {
    const id = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
    const reg = this.entities.get(id);
    if (!reg) return;
    if (this._connected) {
      this.publishEntityRemove(reg.entity);
      reg.unsub?.();
    }
    this.entities.delete(id);
    this.events.emit('unregistered', id);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private announce(reg: Registered): void {
    const { entity } = reg;
    const isDevice = entity.category === 'device';
    this.publishToOutbox({
      type: isDevice ? 'client-device-new' : 'client-service-new',
      payload: { entity: entity.toRegisteredEntity() },
    });
    const inbox = isDevice ? deviceInbox(this.clientId, entity.id) : serviceInbox(this.clientId, entity.id);
    reg.unsub = this.transport.subscribe(inbox, (payload) => this.onEntityMessage(entity, payload));
    this.events.emit('registered', entity.toRegisteredEntity());
  }

  private onEntityMessage(entity: ClientEntity, payload: string): void {
    const env = parseEnvelope(payload);
    if (!env || !env.type) return;
    const action = env.type;
    const params = (env.payload as Record<string, unknown>) ?? {};
    const outbox = entity.category === 'device'
      ? deviceOutbox(this.clientId, entity.id)
      : serviceOutbox(this.clientId, entity.id);

    Promise.resolve()
      .then(() => entity.handle(action, params))
      .then((result) => {
        this.publish(outbox, { type: `${action}.ok`, reqId: env.reqId, payload: (result as unknown) ?? {} });
        this.events.emit('command', { entityId: entity.id, category: entity.category, action, params, reqId: env.reqId, result });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.publish(outbox, { type: 'error', reqId: env.reqId, payload: { command: action, message } });
        this.events.emit('command', { entityId: entity.id, category: entity.category, action, params, reqId: env.reqId, error: message });
        this.events.emit('error', { message });
      });
  }

  private publishEntityRemove(entity: ClientEntity): void {
    this.publishToOutbox({
      type: entity.category === 'device' ? 'client-device-remove' : 'client-service-remove',
      payload: { entity: { id: entity.id } },
    });
  }

  private publishToOutbox(env: Envelope): void {
    this.publish(clientOutbox(this.clientId), env);
  }

  private publish(topic: string, env: Envelope): void {
    this.transport.publish(topic, stringifyEnvelope({
      from: clientKey(this.clientId),
      ts: Date.now(),
      ...env,
    }));
  }
}
