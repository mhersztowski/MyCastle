import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mqttTopics } from '@mhersztowski/core';
import type { IotExtension } from '../IotExtension.js';
import type { MqttPublishFn } from '../IotService.js';

export interface DisplayFrame {
  op: 'frame';
  n: number;
  w: number;
  h: number;
  fmt: string;
  data: string; // base64
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * DisplayExtension — receives virtual display frames from the device and
 * makes them available to the web frontend via MQTT subscription.
 *
 * Device pushes frames to:   minis/{user}/{device}/ext/display/res
 * Server sends requests to:  minis/{user}/{device}/ext/display/req
 *
 * Frame payload: { op:'frame', n, w, h, fmt, data:<base64> }
 * Supported server ops: get_config
 */
export class DisplayExtension extends EventEmitter implements IotExtension {
  readonly type = 'display';

  private readonly pending = new Map<string, Pending>();
  private readonly reqTopic: string;

  /** Last received frame, null if no frame yet */
  lastFrame: DisplayFrame | null = null;

  constructor(
    readonly deviceId: string,
    topicPrefix: string,
    private readonly publishFn: MqttPublishFn,
    private readonly timeoutMs = 10_000,
  ) {
    super();
    this.reqTopic = `${topicPrefix}/ext/display/req`;
  }

  // --- Public API ---

  /** Request display config from the device */
  getConfig(): Promise<unknown> {
    return this._sendRequest('get_config');
  }

  // --- IotExtension ---

  handleMessage(subTopic: string, payload: unknown): void {
    if (subTopic !== 'res') return;

    // Frame push (unsolicited) — device publishes op:'frame'
    if (payload && typeof payload === 'object' && (payload as any).op === 'frame') {
      this.lastFrame = payload as DisplayFrame;
      this.emit('frame', this.lastFrame);
      return;
    }

    // Standard ext request-response ack
    const result = mqttTopics.extRes.payloadSchema.safeParse(payload);
    if (!result.success) {
      console.warn(
        `[DisplayExtension] Invalid ext/display/res payload (device=${this.deviceId}):`,
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
      pending.resolve(result.data.data ?? {});
    } else {
      pending.reject(new Error(error?.message ?? 'display request failed'));
    }
  }

  dispose(): void {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('DisplayExtension disposed'));
    }
    this.pending.clear();
    this.removeAllListeners();
  }

  // --- Private ---

  private _sendRequest(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`display timeout (op=${op}, device=${this.deviceId})`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.publishFn(this.reqTopic, JSON.stringify({ id, op, ...params }));
    });
  }
}
