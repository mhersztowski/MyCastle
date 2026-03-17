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
 * VirtualKeyboard extension — forwards keyboard input commands to the device.
 *
 * MQTT topic scheme (relative to device base `minis/{user}/{device}`):
 *   ext/vkbd/req  (server → device)  { id, op, ...params }
 *   ext/vkbd/res  (device → server)  { id, ok, data?, error? }
 *
 * Operations (op values):
 *   key_press  — press & release a key:  { key, modifiers?: string[] }
 *   key_down   — hold a key:             { key }
 *   key_up     — release a held key:     { key }
 *   type_text  — type a string:          { text }
 *   hotkey     — key combination:        { keys: string[] }
 */
export class VirtualKeyboardExtension implements IotExtension {
  readonly type = 'vkbd';

  private readonly pending = new Map<string, Pending>();
  private readonly reqTopic: string;

  constructor(
    readonly deviceId: string,
    topicPrefix: string,
    private readonly publishFn: MqttPublishFn,
    private readonly timeoutMs = 10_000,
  ) {
    this.reqTopic = `${topicPrefix}/ext/vkbd/req`;
  }

  sendRequest(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`vkbd timeout (op=${op}, device=${this.deviceId})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.publishFn(this.reqTopic, JSON.stringify({ id, op, ...params }));
    });
  }

  // --- IotExtension ---

  handleMessage(subTopic: string, payload: unknown): void {
    if (subTopic !== 'res') return;

    const result = mqttTopics.extRes.payloadSchema.safeParse(payload);
    if (!result.success) {
      console.warn(
        `[VirtualKeyboardExtension] Invalid ext/vkbd/res payload (device=${this.deviceId}):`,
        result.error.issues,
      );
      return;
    }

    const { id, ok, data, error } = result.data;
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (ok) {
      pending.resolve(data ?? {});
    } else {
      pending.reject(new Error(error?.message ?? 'vkbd request failed'));
    }
  }

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('VirtualKeyboardExtension disposed'));
    }
    this.pending.clear();
  }
}
