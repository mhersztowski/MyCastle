/**
 * MQTT transport abstraction (dependency inversion).
 *
 * The package never imports a concrete MQTT broker — the host (e.g.
 * mycastle-backend's MqttServer) adapts its publish/subscribe to this
 * interface. An in-memory transport is provided for tests/standalone use.
 */

export type MqttMessageHandler = (topic: string, payload: string) => void;

export interface IMqttTransport {
  /** Publish a string payload to a topic. */
  publish(topic: string, payload: string): void;
  /** Register a handler that receives every inbound message (all topics). */
  subscribe(handler: MqttMessageHandler): void;
}

/**
 * In-process transport: `publish` is delivered synchronously to all subscribers.
 * Useful for unit tests and running server-logic without a broker.
 */
export class InMemoryTransport implements IMqttTransport {
  private handlers: MqttMessageHandler[] = [];
  readonly published: Array<{ topic: string; payload: string }> = [];

  publish(topic: string, payload: string): void {
    this.published.push({ topic, payload });
    for (const h of this.handlers) h(topic, payload);
  }

  subscribe(handler: MqttMessageHandler): void {
    this.handlers.push(handler);
  }

  /** Inject an inbound message as if a remote client published it. */
  inject(topic: string, payload: string): void {
    for (const h of this.handlers) h(topic, payload);
  }
}
