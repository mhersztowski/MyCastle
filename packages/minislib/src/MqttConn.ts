// Value-only import — 'connect' function is needed at runtime.
// We intentionally do NOT import the MqttClient *type* so it never
// appears in the generated .d.ts, preventing @types/node conflicts
// in consumer projects.
import { connect as mqttConnect } from 'mqtt';
import { Signal } from './core/Signal';
import { Node } from './Node';

export interface MqttConnOptions {
  /** Auto-generated when omitted. */
  clientId?: string;
  username?: string;
  password?: string;
  /** Keep-alive interval in seconds. Default: 60. */
  keepalive?: number;
}

// Internal duck-type — mirrors the MqttClient methods we use without
// importing from 'mqtt'. Defined here so the .d.ts has no external refs.
interface _Client {
  connected: boolean;
  subscribe(topic: string, opts: { qos: number }): void;
  unsubscribe(topic: string): void;
  publish(topic: string, payload: string, opts: { qos: number; retain: boolean }): void;
  end(force?: boolean): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * MQTT connection node.
 *
 * Wraps an `mqtt` client, exposing open/close and signals for connection
 * lifecycle events. `MqttSub` and `MqttPub` nodes that are descendants
 * of this node auto-discover it via `ancestors()` and use it as their
 * transport.
 *
 * Usage:
 *   const conn = new MqttConn('ws://localhost:1894/mqtt', {}, parent);
 *   conn.connected.connect(() => console.log('online'));
 *   conn.open();
 *
 *   const sub = new MqttSub('sensors/temp', conn);
 *   sub.messageReceived.connect((topic, payload) => console.log(topic, payload));
 *
 *   const pub = new MqttPub('sensors/cmd', conn);
 *   pub.publish({ on: true });
 */
export class MqttConn extends Node {
  /** Emitted once the MQTT session is established. */
  readonly connected = new Signal();
  /** Emitted when the connection is closed or dropped. */
  readonly disconnected = new Signal<[reason: string]>();
  /** Emitted on socket/protocol errors. */
  readonly error = new Signal<[err: Error]>();
  /**
   * Emitted for every incoming message on any subscribed topic.
   * `MqttSub` children filter by their own topic pattern.
   */
  readonly messageArrived = new Signal<[topic: string, payload: string]>();

  #url: string;
  #options: MqttConnOptions;
  #client: _Client | null = null;

  constructor(url: string, options: MqttConnOptions = {}, parent?: Node) {
    super(parent, 'MqttConn');
    this.#url = url;
    this.#options = options;
  }

  get url(): string {
    return this.#url;
  }
  set url(v: string) {
    this.#url = v;
  }

  get isConnected(): boolean {
    return this.#client?.connected ?? false;
  }

  /** Open the MQTT connection. Reconnects if already open. */
  open(): void {
    if (this.#client) this.close();
    this.#client = mqttConnect(this.#url, {
      clientId: this.#options.clientId ?? `minislib-${crypto.randomUUID().slice(0, 8)}`,
      username: this.#options.username,
      password: this.#options.password,
      keepalive: this.#options.keepalive ?? 60,
    }) as _Client;
    this.#client.on('connect', () => this.connected.emit());
    this.#client.on('close', () => this.disconnected.emit('close'));
    this.#client.on('error', (err: unknown) => this.error.emit(err instanceof Error ? err : new Error(String(err))));
    this.#client.on('message', (topic: unknown, payload: unknown) => {
      this.messageArrived.emit(String(topic), String(payload));
    });
  }

  /** Close the MQTT connection immediately. */
  close(): void {
    this.#client?.end(true);
    this.#client = null;
  }

  /** Subscribe to `topic` with optional QoS (0/1/2). */
  subscribe(topic: string, qos: 0 | 1 | 2 = 0): void {
    this.#client?.subscribe(topic, { qos });
  }

  /** Unsubscribe from `topic`. */
  unsubscribe(topic: string): void {
    this.#client?.unsubscribe(topic);
  }

  /**
   * Publish a raw message. Prefer `MqttPub.publish()` in most cases —
   * this method is also used internally by `MqttPub` nodes.
   */
  publish(
    topic: string,
    payload: string,
    opts?: { qos?: 0 | 1 | 2; retain?: boolean },
  ): void {
    this.#client?.publish(topic, payload, {
      qos: opts?.qos ?? 0,
      retain: opts?.retain ?? false,
    });
  }

  protected override onDestroy(): void {
    this.close();
  }
}
