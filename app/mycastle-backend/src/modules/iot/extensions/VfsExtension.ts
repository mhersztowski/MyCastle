import { mqttTopics, MqttFS } from '@mhersztowski/core';
import type { IotExtension } from '../IotExtension.js';
import type { MqttPublishFn } from '../IotService.js';

/**
 * VFS extension — exposes the device filesystem over MQTT.
 *
 * MQTT topic scheme (relative to device base `minis/{user}/{device}`):
 *   ext/vfs/req  (server → device)  request payload (MqttFSOptions reqTopic)
 *   ext/vfs/res  (device → server)  response payload, routed here via handleMessage()
 *
 * The `fs` property is a standard FileSystemProvider that can be mounted in a
 * CompositeFS, returned via the VFS HTTP API, or accessed directly from backend code.
 */
export class VfsExtension implements IotExtension {
  readonly type = 'vfs';

  /** MqttFS instance — use this as a FileSystemProvider for this device */
  readonly fs: MqttFS;

  constructor(
    readonly deviceId: string,
    topicPrefix: string,
    publishFn: MqttPublishFn,
  ) {
    this.fs = new MqttFS({
      publishFn,
      reqTopic: `${topicPrefix}/ext/vfs/req`,
      timeoutMs: 15_000,
    });
  }

  // --- IotExtension ---

  handleMessage(subTopic: string, payload: unknown): void {
    if (subTopic !== 'res') return;

    const result = mqttTopics.extRes.payloadSchema.safeParse(payload);
    if (!result.success) {
      console.warn(
        `[VfsExtension] Invalid ext/vfs/res payload (device=${this.deviceId}):`,
        result.error.issues,
      );
      return;
    }

    this.fs.handleResponse(result.data);
  }

  dispose(): void {
    this.fs.dispose();
  }
}
