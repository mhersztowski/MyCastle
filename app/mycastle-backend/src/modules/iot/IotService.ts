import type { TelemetryMetric, DeviceCommand } from '@mhersztowski/core';
import { mqttTopics } from '@mhersztowski/core';
import { IotDatabase } from './IotDatabase.js';
import { TelemetryStore } from './TelemetryStore.js';
import { DevicePresence } from './DevicePresence.js';
import type { DeviceStatusChange } from './DevicePresence.js';
import { CommandDispatcher } from './CommandDispatcher.js';
import { AlertEngine } from './AlertEngine.js';
import { DeviceShareStore } from './DeviceShareStore.js';
import { IotExtensionRegistry } from './IotExtensionRegistry.js';
import { AppSessionStore } from './AppSessionStore.js';

export interface MqttPublishFn {
  (topic: string, payload: string): void;
}

export class IotService {
  readonly db: IotDatabase;
  readonly telemetry: TelemetryStore;
  readonly presence: DevicePresence;
  readonly commands: CommandDispatcher;
  readonly alerts: AlertEngine;
  readonly shares: DeviceShareStore;
  readonly extensions: IotExtensionRegistry;
  readonly appSessions: AppSessionStore;

  private publishFn: MqttPublishFn | null = null;

  constructor(dataDir: string) {
    this.db = new IotDatabase(dataDir);
    this.telemetry = new TelemetryStore(this.db);
    this.presence = new DevicePresence();
    this.commands = new CommandDispatcher(this.db);
    this.alerts = new AlertEngine(this.db);
    this.shares = new DeviceShareStore(this.db);
    this.extensions = new IotExtensionRegistry((topic, payload) => this.publishFn?.(topic, payload));
    this.appSessions = new AppSessionStore(this.db);
  }

  start(publishFn: MqttPublishFn): void {
    this.publishFn = publishFn;
    this.presence.start();

    this.presence.on('statusChange', (change: DeviceStatusChange) => {
      const statusPayload = JSON.stringify({ status: change.status, lastSeenAt: change.lastSeenAt });
      this.publishFn?.(
        `minis/${change.userId}/${change.deviceId}/status`,
        statusPayload,
      );

      // Forward status to shared users
      const shareList = this.shares.getSharesForDevice(change.deviceId);
      for (const share of shareList) {
        this.publishFn?.(
          `minis/${share.targetUserId}/shared/${change.userId}/${change.deviceId}/status`,
          statusPayload,
        );
      }
    });
  }

  stop(): void {
    this.presence.stop();
    this.extensions.dispose();
    this.db.close();
  }

  // Called when MQTT message arrives on minis/+/+/telemetry
  handleTelemetry(userId: string, deviceId: string, payload: { metrics: TelemetryMetric[]; timestamp?: number; rssi?: number; battery?: number }): void {
    const record = {
      deviceId,
      userId,
      timestamp: payload.timestamp ?? Date.now(),
      metrics: payload.metrics,
      rssi: payload.rssi,
      battery: payload.battery,
    };

    this.telemetry.insertTelemetry(record);

    // Update presence
    const config = this.telemetry.getConfig(deviceId);
    const heartbeatSec = config?.heartbeatIntervalSec ?? 60;
    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);

    // Evaluate alert rules
    const triggered = this.alerts.evaluate(deviceId, userId, payload.metrics);
    for (const alert of triggered) {
      this.publishFn?.(
        `minis/${userId}/${deviceId}/alert`,
        JSON.stringify(alert),
      );
    }

    // Republish telemetry for frontend subscribers
    const recordJson = JSON.stringify(record);
    this.publishFn?.(
      `minis/${userId}/${deviceId}/telemetry/live`,
      recordJson,
    );

    // Forward telemetry to shared users
    const shareList = this.shares.getSharesForDevice(deviceId);
    for (const share of shareList) {
      this.publishFn?.(
        `minis/${share.targetUserId}/shared/${userId}/${deviceId}/telemetry/live`,
        recordJson,
      );
    }
  }

  // Called when MQTT message arrives on minis/+/+/hello
  // Device announces itself on connect — mark online, persist entities, sync extensions in-memory.
  // App instances (web/mobile/desktop) include platform + sessionId fields.
  handleHello(userId: string, deviceId: string, payload: {
    uptime?: number;
    extensions?: Array<{ type: string; enabled: boolean; options?: Record<string, unknown> }>;
    entities?: unknown[];
    // App-instance fields (present only when sent by PresenceService / desktop agent)
    platform?: 'web' | 'mobile' | 'desktop';
    sessionId?: string;
    label?: string;
    userAgent?: string;
  }): void {
    console.log(`[IoT] hello: userId=${userId} deviceId=${deviceId}`);

    // App-instance hello: register/update in app_sessions, skip IoT device handling
    if (payload.platform && payload.sessionId) {
      this.appSessions.upsert({
        id: payload.sessionId,
        userId,
        label: payload.label ?? payload.platform,
        platform: payload.platform,
        userAgent: payload.userAgent ?? '',
      });
      console.log(`[IoT] app session upserted: ${payload.sessionId} (${payload.platform}) for ${userId}`);
      return;
    }

    const existing = this.telemetry.getConfig(deviceId);
    const heartbeatSec = existing?.heartbeatIntervalSec ?? 60;
    const topicPrefix = existing?.topicPrefix ?? `minis/${userId}/${deviceId}`;
    const now = Date.now();

    // Persist entities if the device sent any — entities are re-declared on every reconnect
    if (payload.entities?.length || payload.extensions?.length) {
      const merged = {
        deviceId,
        userId,
        topicPrefix,
        heartbeatIntervalSec: heartbeatSec,
        capabilities: existing?.capabilities ?? [],
        entities: (payload.entities ?? existing?.entities ?? []) as import('@mhersztowski/core').IotEntity[],
        extensions: payload.extensions ?? existing?.extensions,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.telemetry.upsertConfig(merged);
      this.extensions.syncFromConfig(merged);
    } else if (existing) {
      this.extensions.syncFromConfig(existing);
    }

    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);
  }

  // Called when MQTT message arrives on minis/+/+/heartbeat
  handleHeartbeat(userId: string, deviceId: string, payload: {
    uptime?: number;
    rssi?: number;
    battery?: number;
    // App-instance fields
    sessionId?: string;
    intervalSec?: number;
    isInteractive?: boolean;
    context?: { type: string; id?: string };
  }): void {
    console.log(`[IoT] heartbeat: userId=${userId} deviceId=${deviceId}`);

    // App-instance heartbeat
    if (payload.sessionId) {
      const intervalSec = payload.intervalSec ?? 30;
      this.appSessions.recordHeartbeat(
        payload.sessionId,
        intervalSec,
        payload.isInteractive ?? false,
        payload.context,
      );
      return;
    }

    const config = this.telemetry.getConfig(deviceId);
    const heartbeatSec = config?.heartbeatIntervalSec ?? 60;
    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);
    if (config) this.extensions.syncFromConfig(config);
  }

  // Called when MQTT message arrives on minis/+/+/command/ack
  handleCommandAck(_deviceId: string, payload: { id: string; status: 'ACKNOWLEDGED' | 'FAILED'; reason?: string }): void {
    this.commands.updateStatus(payload.id, payload.status, payload.reason);
  }

  // Send command to device via MQTT
  sendCommand(deviceId: string, name: string, cmdPayload: Record<string, unknown>): DeviceCommand {
    const command = this.commands.createCommand(deviceId, name, cmdPayload);

    const config = this.telemetry.getConfig(deviceId);
    if (config && this.publishFn) {
      this.publishFn(
        `${config.topicPrefix}/command`,
        JSON.stringify({ id: command.id, name: command.name, payload: command.payload }),
      );
      this.commands.updateStatus(command.id, 'SENT');
      command.status = 'SENT';
    }

    return command;
  }

  // Process incoming MQTT message — route to appropriate handler (Zod-validated)
  handleMqttMessage(topic: string, payload: string): void {
    // Topic format: minis/{userName}/{deviceName}/{type}
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'minis') return;

    const userName = parts[1];
    const deviceName = parts[2];
    const msgType = parts.slice(3).join('/');

    console.log(`[IoT] MQTT msg: topic=${topic} type=${msgType}`);

    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      console.warn(`[IoT] Failed to parse JSON from topic=${topic}: ${payload}`);
      return;
    }

    switch (msgType) {
      case 'telemetry': {
        const result = mqttTopics.telemetry.payloadSchema.safeParse(raw);
        if (!result.success) {
          console.warn(`[IoT] telemetry schema mismatch:`, result.error.issues);
          return;
        }
        this.handleTelemetry(userName, deviceName, result.data);
        break;
      }
      case 'heartbeat': {
        const result = mqttTopics.heartbeat.payloadSchema.safeParse(raw);
        if (!result.success) {
          console.warn(`[IoT] heartbeat schema mismatch:`, result.error.issues);
          return;
        }
        this.handleHeartbeat(userName, deviceName, result.data);
        break;
      }
      case 'hello': {
        const result = mqttTopics.hello.payloadSchema.safeParse(raw);
        if (!result.success) {
          console.warn(`[IoT] hello schema mismatch:`, result.error.issues);
          return;
        }
        this.handleHello(userName, deviceName, result.data);
        break;
      }
      case 'command/ack': {
        const result = mqttTopics.commandAck.payloadSchema.safeParse(raw);
        if (!result.success) return;
        this.handleCommandAck(deviceName, result.data);
        break;
      }
      default: {
        // Extension messages: ext/{extType}/{subTopic}
        // e.g. msgType = 'ext/vfs/res'
        if (msgType.startsWith('ext/')) {
          const extParts = msgType.split('/'); // ['ext', extType, subTopic]
          if (extParts.length >= 3) {
            const extType = extParts[1];
            const subTopic = extParts.slice(2).join('/');
            this.extensions.handleMessage(deviceName, userName, extType, subTopic, raw);
          }
        }
        break;
      }
    }
  }
}
