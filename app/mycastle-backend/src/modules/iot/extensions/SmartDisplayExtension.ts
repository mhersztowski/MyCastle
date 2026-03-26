import { randomUUID } from 'node:crypto';
import { mqttTopics } from '@mhersztowski/core';
import type { IotExtension } from '../IotExtension.js';
import type { MqttPublishFn } from '../IotService.js';

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * SmartDisplay extension — sends display update commands to the device.
 *
 * MQTT topic scheme (relative to device base `minis/{user}/{device}`):
 *   ext/smart-display/req  (server → device)  { id, op, data? }
 *   ext/smart-display/res  (device → server)  { id, ok, error? }
 *
 * Operations:
 *   update  — merge data dict into the display state  { data: Record<string, unknown> }
 *   clear   — reset all server-pushed display fields
 */
export class SmartDisplayExtension implements IotExtension {
  readonly type = 'smart-display';

  private readonly pending = new Map<string, Pending>();
  private readonly reqTopic: string;

  constructor(
    readonly deviceId: string,
    topicPrefix: string,
    private readonly publishFn: MqttPublishFn,
    private readonly timeoutMs = 10_000,
  ) {
    this.reqTopic = `${topicPrefix}/ext/smart-display/req`;
  }

  // --- Public API ---

  update(data: Record<string, unknown>): Promise<unknown> {
    return this._sendRequest('update', { data });
  }

  clear(): Promise<unknown> {
    return this._sendRequest('clear');
  }

  // --- IotExtension ---

  handleMessage(subTopic: string, payload: unknown): void {
    if (subTopic !== 'res') return;

    const result = mqttTopics.extRes.payloadSchema.safeParse(payload);
    if (!result.success) {
      console.warn(
        `[SmartDisplayExtension] Invalid ext/smart-display/res payload (device=${this.deviceId}):`,
        result.error.issues,
      );
      return;
    }

    const { id, ok, error } = result.data;
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (ok) {
      pending.resolve({});
    } else {
      pending.reject(new Error(error?.message ?? 'smart-display request failed'));
    }
  }

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('SmartDisplayExtension disposed'));
    }
    this.pending.clear();
  }

  // --- Private ---

  private _sendRequest(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`smart-display timeout (op=${op}, device=${this.deviceId})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.publishFn(this.reqTopic, JSON.stringify({ id, op, ...params }));
    });
  }
}
