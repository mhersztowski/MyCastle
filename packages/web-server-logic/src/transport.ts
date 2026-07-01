/**
 * Browser MQTT transport (per-topic subscribe).
 *
 * Unlike server-logic's `IMqttTransport` (one global handler for a broker-side
 * hook), a browser client subscribes to specific topics — exactly the shape of
 * web-client's `mqttClient.rawPublish` / `rawSubscribe`. Wire it like:
 *
 *   import { mqttClient } from '@mhersztowski/web-client';
 *   const transport: ClientTransport = {
 *     publish:   (t, p) => mqttClient.rawPublish(t, p),
 *     subscribe: (t, cb) => mqttClient.rawSubscribe(t, cb),
 *   };
 */
export interface ClientTransport {
  publish(topic: string, payload: string): void;
  /** Subscribe to a topic; returns an unsubscribe function. */
  subscribe(topic: string, handler: (payload: string) => void): () => void;
}

/**
 * In-memory transport for tests: exact-topic pub/sub. `publish` also delivers
 * to subscribers of that exact topic; `inject` simulates a broker-delivered
 * message (e.g. the server writing to a client inbox).
 */
export class InMemoryClientTransport implements ClientTransport {
  readonly published: Array<{ topic: string; payload: string }> = [];
  private readonly subs = new Map<string, Set<(payload: string) => void>>();

  publish(topic: string, payload: string): void {
    this.published.push({ topic, payload });
    this.deliver(topic, payload);
  }

  subscribe(topic: string, handler: (payload: string) => void): () => void {
    let set = this.subs.get(topic);
    if (!set) { set = new Set(); this.subs.set(topic, set); }
    set.add(handler);
    return () => { this.subs.get(topic)?.delete(handler); };
  }

  /** Simulate an inbound message from the broker on `topic`. */
  inject(topic: string, payload: string): void {
    this.deliver(topic, payload);
  }

  private deliver(topic: string, payload: string): void {
    this.subs.get(topic)?.forEach((h) => h(payload));
  }
}
