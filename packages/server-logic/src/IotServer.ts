import { MObject, Signal } from '@mhersztowski/minislib';
import type { IMqttTransport } from './transport';
import {
  SERVER_OUTBOX,
  classifyTopic,
  clientInbox,
  userInbox,
} from './topics';
import {
  type Envelope,
  parseEnvelope,
  stringifyEnvelope,
  isUiEvent,
  type UiEvent,
} from './messages';
import type { ClientId } from './types';
import { ClientRegistry } from './ClientRegistry';
import { LogService, type ILogMessage } from './services/LogService';
import { ConsoleService } from './services/ConsoleService';
import { CronService, type ICronScheduler } from './services/CronService';
import { ActivityService } from './services/ActivityService';

export interface IotServerOptions {
  transport: IMqttTransport;
  /** Optional cron-expression scheduler (e.g. node-cron wrapper). */
  cronScheduler?: ICronScheduler;
  /** Drop clients unseen for this long (ms). 0/undefined = never prune. */
  staleClientMs?: number;
  /** Re-publish every log entry on the server outbox (`log.entry`). */
  broadcastLog?: boolean;
  /** Re-publish every activity entry on the server outbox (`activity.entry`). */
  broadcastActivity?: boolean;
  /** Re-publish the client list whenever it changes (`clients.changed`). */
  broadcastClients?: boolean;
}

/**
 * IotServer — the server-side brain (see ServerLogic.md → "JavaScript Api").
 *
 * Owns the core services (log, activity, console, cron) and a client registry,
 * subscribes to the MQTT transport and routes server/user/client traffic.
 */
export class IotServer extends MObject {
  readonly log: LogService;
  readonly activity: ActivityService;
  readonly console: ConsoleService;
  readonly cron: CronService;
  readonly clients: ClientRegistry;

  /** Raw messages received on the server inbox. */
  readonly onServerMessage = new Signal<[Envelope]>();
  /** UI/form events relayed by clients. */
  readonly onUiEvent = new Signal<[ClientId, UiEvent]>();

  private readonly transport: IMqttTransport;
  private readonly staleClientMs: number;
  private readonly broadcastLog: boolean;
  private readonly broadcastActivity: boolean;
  private readonly broadcastClients: boolean;
  private started = false;

  constructor(opts: IotServerOptions) {
    super();
    this.transport = opts.transport;
    this.staleClientMs = opts.staleClientMs ?? 0;
    this.broadcastLog = opts.broadcastLog ?? false;
    this.broadcastActivity = opts.broadcastActivity ?? false;
    this.broadcastClients = opts.broadcastClients ?? false;

    this.log = new LogService();
    this.activity = new ActivityService();
    this.console = new ConsoleService(this.log);
    this.cron = new CronService(opts.cronScheduler);
    this.clients = new ClientRegistry();
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.log.start();
    this.activity.start();
    this.console.start();
    this.cron.start();

    this.transport.subscribe((topic, payload) => this.handleMessage(topic, payload));

    // Mirror in-process service events onto the server outbox so remote
    // observers (e.g. the Server Logic page) get a live stream.
    if (this.broadcastLog) {
      this.log.onMessage.connect((m) => this.publishToServerOutbox({ type: 'log.entry', payload: m }), this);
    }
    if (this.broadcastActivity) {
      this.activity.onActivity.connect((e) => this.publishToServerOutbox({ type: 'activity.entry', payload: e }), this);
    }
    if (this.broadcastClients) {
      this.clients.changed.connect(() => this.publishToServerOutbox({ type: 'clients.changed', payload: this.clients.list() }), this);
    }

    if (this.staleClientMs > 0) {
      this.cron.every('clients.prune', Math.max(1000, Math.floor(this.staleClientMs / 2)), () => {
        const removed = this.clients.prune(this.staleClientMs);
        if (removed) this.activity.record('clients.pruned', `pruned ${removed} stale client(s)`);
      });
    }

    this.activity.record('server.started', 'server logic started');
    this.publishToServerOutbox({ type: 'server.ready', ts: Date.now() });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.publishToServerOutbox({ type: 'server.stopping', ts: Date.now() });
    this.cron.stop();
    this.activity.record('server.stopped', 'server logic stopped');
  }

  // ── Outbound helpers ──────────────────────────────────────────────────────────
  /** Publish on the global server outbox (broadcast). */
  publishToServerOutbox(env: Envelope): void {
    this.transport.publish(SERVER_OUTBOX, stringifyEnvelope({ from: 'server', ...env }));
  }
  /** Send a message addressed to a user (their inbox). */
  publishToUser(userName: string, env: Envelope): void {
    this.transport.publish(userInbox(userName), stringifyEnvelope({ from: 'server', ...env }));
  }
  /** Send a message addressed to a specific client (its inbox). */
  publishToClient(client: ClientId, env: Envelope): void {
    this.transport.publish(clientInbox(client), stringifyEnvelope({ from: 'server', ...env }));
  }

  // ── Inbound routing ───────────────────────────────────────────────────────────
  private handleMessage(topic: string, payload: string): void {
    const cls = classifyTopic(topic);
    // Act only on traffic flowing TOWARD the server: server inbox + entity outboxes.
    if (cls.scope === 'server' && cls.direction === 'inbox') {
      this.handleServerInbox(payload);
    } else if (cls.scope === 'user' && cls.direction === 'outbox' && cls.userName) {
      this.handleUserOutbox(cls.userName, payload);
    } else if (cls.scope === 'client' && cls.direction === 'outbox' && cls.client) {
      this.handleClientOutbox(cls.client, payload);
    }
  }

  private handleServerInbox(payload: string): void {
    const env = parseEnvelope(payload);
    if (!env) return;
    this.onServerMessage.emit(env);
    this.activity.record('server.message', env.type);

    switch (env.type) {
      case 'ping':
        this.publishToServerOutbox({ type: 'pong', reqId: env.reqId, ts: Date.now() });
        break;
      case 'log':
        if (env.payload) this.log.log(env.payload as ILogMessage);
        break;
      case 'clients.list':
        this.publishToServerOutbox({
          type: 'clients.snapshot',
          reqId: env.reqId,
          payload: this.clients.list(),
        });
        break;
      case 'log.list':
        this.publishToServerOutbox({
          type: 'log.snapshot',
          reqId: env.reqId,
          payload: this.log.recent(),
        });
        break;
      case 'activity.list':
        this.publishToServerOutbox({
          type: 'activity.snapshot',
          reqId: env.reqId,
          payload: this.activity.recent(),
        });
        break;
    }
  }

  private handleUserOutbox(userName: string, payload: string): void {
    const env = parseEnvelope(payload);
    if (!env) return;
    const client = (env.payload as { client?: ClientId } | undefined)?.client;
    switch (env.type) {
      case 'client.hello':
        if (client) {
          this.clients.register(client);
          this.activity.record('client.connected', `${userName} client connected`, client);
        }
        break;
      case 'client.bye':
        if (client) {
          this.clients.unregister(client);
          this.activity.record('client.disconnected', `${userName} client left`, client);
        }
        break;
      default:
        this.activity.record('user.message', `${userName}: ${env.type}`);
    }
  }

  private handleClientOutbox(client: ClientId, payload: string): void {
    const env = parseEnvelope(payload);
    if (!env) return;

    if (env.type === 'hello') {
      this.clients.register(client);
      this.activity.record('client.connected', 'client hello', client);
      return;
    }
    if (env.type === 'bye') {
      this.clients.unregister(client);
      this.activity.record('client.disconnected', 'client bye', client);
      return;
    }

    this.clients.touch(client);
    if (isUiEvent(env.type)) {
      this.onUiEvent.emit(client, env as unknown as UiEvent);
      this.activity.record('ui.event', env.type, client);
    } else {
      this.activity.record('client.message', env.type, client);
    }
  }
}
