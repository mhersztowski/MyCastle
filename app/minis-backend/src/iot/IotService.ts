import type { TelemetryMetric, DeviceCommand } from '@mhersztowski/core';
import { IotDatabase } from './IotDatabase.js';
import { TelemetryStore } from './TelemetryStore.js';
import { DevicePresence } from './DevicePresence.js';
import type { DeviceStatusChange } from './DevicePresence.js';
import { CommandDispatcher } from './CommandDispatcher.js';
import { AlertEngine } from './AlertEngine.js';

export interface MqttPublishFn {
  (topic: string, payload: string): void;
}

export class IotService {
  readonly db: IotDatabase;
  readonly telemetry: TelemetryStore;
  readonly presence: DevicePresence;
  readonly commands: CommandDispatcher;
  readonly alerts: AlertEngine;

  private publishFn: MqttPublishFn | null = null;

  constructor(dataDir: string) {
    this.db = new IotDatabase(dataDir);
    this.telemetry = new TelemetryStore(this.db);
    this.presence = new DevicePresence();
    this.commands = new CommandDispatcher(this.db);
    this.alerts = new AlertEngine(this.db);
  }

  start(publishFn: MqttPublishFn): void {
    this.publishFn = publishFn;
    this.presence.start();

    this.presence.on('statusChange', (change: DeviceStatusChange) => {
      this.publishFn?.(
        `minis/${change.userId}/${change.deviceId}/status`,
        JSON.stringify({ status: change.status, lastSeenAt: change.lastSeenAt }),
      );
    });
  }

  stop(): void {
    this.presence.stop();
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
    this.publishFn?.(
      `minis/${userId}/${deviceId}/telemetry/live`,
      JSON.stringify(record),
    );
  }

  // Called when MQTT message arrives on minis/+/+/heartbeat
  handleHeartbeat(userId: string, deviceId: string, payload: { uptime?: number; rssi?: number; battery?: number }): void {
    const config = this.telemetry.getConfig(deviceId);
    const heartbeatSec = config?.heartbeatIntervalSec ?? 60;
    this.presence.recordHeartbeat(deviceId, userId, heartbeatSec);
  }

  // Called when MQTT message arrives on minis/+/+/command/ack
  handleCommandAck(deviceId: string, payload: { id: string; status: string; reason?: string }): void {
    this.commands.updateStatus(payload.id, payload.status as any, payload.reason);
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

  // Process incoming MQTT message — route to appropriate handler
  handleMqttMessage(topic: string, payload: string): void {
    // Topic format: minis/{userId}/{deviceId}/{type}
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'minis') return;

    const userId = parts[1];
    const deviceId = parts[2];
    const msgType = parts.slice(3).join('/');

    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    switch (msgType) {
      case 'telemetry':
        this.handleTelemetry(userId, deviceId, parsed);
        break;
      case 'heartbeat':
        this.handleHeartbeat(userId, deviceId, parsed);
        break;
      case 'command/ack':
        this.handleCommandAck(deviceId, parsed);
        break;
    }
  }
}
