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
 * VirtualMouse extension — forwards mouse input commands to the device.
 *
 * MQTT topic scheme (relative to device base `minis/{user}/{device}`):
 *   ext/vmouse/req  (server → device)  { id, op, ...params }
 *   ext/vmouse/res  (device → server)  { id, ok, data?, error? }
 *
 * Operations (op values):
 *   move         — absolute move:           { x, y }
 *   move_rel     — relative move:           { dx, dy }
 *   click        — click:                   { button?: 'left'|'right'|'middle', x?, y? }
 *   double_click — double-click:            { button?: 'left'|'right'|'middle', x?, y? }
 *   press        — press & hold button:     { button?: 'left'|'right'|'middle' }
 *   release      — release button:          { button?: 'left'|'right'|'middle' }
 *   scroll       — scroll wheel:            { dy, dx?, x?, y? }
 *   drag         — drag to target:          { x1, y1, x2, y2, button?: string }
 *   get_pos      — get cursor position:     {} → { x, y }
 *   get_size     — get screen size:         {} → { width, height }
 */
export class VirtualMouseExtension implements IotExtension {
  readonly type = 'vmouse';

  private readonly pending = new Map<string, Pending>();
  private readonly reqTopic: string;

  constructor(
    readonly deviceId: string,
    topicPrefix: string,
    private readonly publishFn: MqttPublishFn,
    private readonly timeoutMs = 10_000,
  ) {
    this.reqTopic = `${topicPrefix}/ext/vmouse/req`;
  }

  sendRequest(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`vmouse timeout (op=${op}, device=${this.deviceId})`));
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
        `[VirtualMouseExtension] Invalid ext/vmouse/res payload (device=${this.deviceId}):`,
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
      pending.reject(new Error(error?.message ?? 'vmouse request failed'));
    }
  }

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('VirtualMouseExtension disposed'));
    }
    this.pending.clear();
  }
}
