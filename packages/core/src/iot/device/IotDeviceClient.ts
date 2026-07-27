import type { IotDeviceExtension } from './IotDeviceExtension';

export interface IotDeviceClientOptions {
  /**
   * MQTT topic prefix for this device, e.g. `minis/john/my_esp32`.
   * Used to build sub-topic paths for extensions.
   */
  topicPrefix: string;
  /**
   * Framework-agnostic publish function — pass whatever your MQTT client provides.
   * Called when the device needs to send a message (responses, heartbeats, telemetry).
   */
  publishFn: (topic: string, payload: string) => void;
}

/**
 * Framework-agnostic IoT device client.
 *
 * Provides the routing layer between raw MQTT messages and device-side extension
 * handlers.  The transport (MQTT library, WebSocket, TCP …) is fully external —
 * the caller connects to MQTT, subscribes to the device topic prefix, and
 * feeds incoming messages via `handleMessage()`.
 *
 * ### Minimal usage (Node.js + mqtt.js)
 * ```ts
 * import mqtt from 'mqtt';
 * import { NodeFS } from '@mhersztowski/core';
 * import { IotDeviceClient, IotDeviceVfsExtension } from '@mhersztowski/core';
 *
 * const prefix = 'minis/alice/node-device';
 * const mq = mqtt.connect('mqtt://localhost:1884');
 *
 * const client = new IotDeviceClient({
 *   topicPrefix: prefix,
 *   publishFn: (topic, payload) => mq.publish(topic, payload),
 * });
 *
 * client.addExtension(
 *   new IotDeviceVfsExtension({
 *     provider: new NodeFS({ rootDir: '/home/alice/device-data' }),
 *     publishFn: (topic, payload) => mq.publish(topic, payload),
 *     resTopic: `${prefix}/ext/vfs/res`,
 *   }),
 * );
 *
 * mq.subscribe(`${prefix}/ext/+/req`);
 * mq.on('message', (topic, buf) => {
 *   const subTopic = topic.slice(prefix.length + 1); // strip "prefix/"
 *   client.handleMessage(subTopic, buf.toString());
 * });
 * ```
 */
export class IotDeviceClient {
  private readonly extensions = new Map<string, IotDeviceExtension>();

  constructor(readonly options: IotDeviceClientOptions) {}

  /**
   * Prosi o dopisanie urządzenia do listy użytkownika (Electronics → Devices).
   *
   * Wysyłane przy każdym połączeniu — backend trzyma jedno zgłoszenie na
   * urządzenie, więc powtórki tylko odświeżają wpis. Samo zgłoszenie niczego
   * nie tworzy: wpis powstaje dopiero po akceptacji w panelu, więc podłączenie
   * się do brokera nie wystarcza, by trafić na listę.
   */
  requestRegistration(info: {
    label?: string;
    kind?: 'firmware' | 'desktop' | 'mobile' | 'web' | 'service';
    sn?: string;
    description?: string;
    version?: string;
    address?: string;
  } = {}): void {
    this.options.publishFn(
      `${this.options.topicPrefix}/register-request`,
      JSON.stringify(info),
    );
  }

  /** Register a device-side extension (e.g. IotDeviceVfsExtension). */
  addExtension(ext: IotDeviceExtension): this {
    this.extensions.set(ext.type, ext);
    return this;
  }

  /** Remove a previously registered extension by type. */
  removeExtension(type: string): this {
    this.extensions.delete(type);
    return this;
  }

  /**
   * Route an incoming MQTT message to the appropriate extension handler.
   *
   * @param subTopic  Everything after `{topicPrefix}/` — e.g. `ext/vfs/req`
   * @param rawPayload  Raw string payload from the MQTT broker
   */
  handleMessage(subTopic: string, rawPayload: string): void {
    // Extension messages arrive on:  ext/{extType}/req
    if (!subTopic.startsWith('ext/') || !subTopic.endsWith('/req')) return;

    const parts = subTopic.split('/'); // ['ext', extType, 'req']
    if (parts.length !== 3) return;

    const extType = parts[1];
    const ext = this.extensions.get(extType);
    if (!ext) {
      console.warn(`[IotDeviceClient] No extension registered for type='${extType}'`);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      console.warn(`[IotDeviceClient] Failed to parse JSON for ext/${extType}/req`);
      return;
    }

    void ext.handleRequest(payload);
  }

  /**
   * Build the full MQTT topic for a given extension's response channel.
   * Convenience helper for constructing `resTopic` when registering extensions.
   *
   * @example
   *   client.extResTopic('vfs')  // → "minis/alice/device/ext/vfs/res"
   */
  extResTopic(extType: string): string {
    return `${this.options.topicPrefix}/ext/${extType}/res`;
  }
}
