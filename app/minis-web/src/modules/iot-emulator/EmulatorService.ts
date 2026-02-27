import mqtt from 'mqtt';
import type { MqttClient as MqttClientType } from 'mqtt';
import { getMqttUrl } from '@mhersztowski/web-client';
import type { TelemetryMetric } from '@mhersztowski/core';
import { generateValue } from './generators';
import type {
  EmulatedDeviceConfig,
  EmulatedDeviceState,
  ReceivedCommand,
  ActivityLogEntry,
  EmulatorEventType,
  EmulatorEventCallback,
} from './types';

const STORAGE_KEY = 'minis-iot-emulator-configs';
const MAX_LOG_ENTRIES = 500;

function createEmptyState(configId: string): EmulatedDeviceState {
  return {
    configId,
    isRunning: false,
    isConnected: false,
    startedAt: null,
    messagesSent: 0,
    messagesReceived: 0,
    lastTelemetrySentAt: null,
    lastHeartbeatSentAt: null,
    pendingCommands: [],
  };
}

export class EmulatorService {
  private mqttClient: MqttClientType | null = null;
  private configs: Map<string, EmulatedDeviceConfig> = new Map();
  private states: Map<string, EmulatedDeviceState> = new Map();
  private telemetryIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private heartbeatIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private ackTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private startTimes: Map<string, number> = new Map();
  private activityLog: ActivityLogEntry[] = [];
  private listeners: Set<EmulatorEventCallback> = new Set();
  private connecting = false;

  constructor() {
    this.loadConfigs();
  }

  // --- Event subscription ---

  on(callback: EmulatorEventCallback): void {
    this.listeners.add(callback);
  }

  off(callback: EmulatorEventCallback): void {
    this.listeners.delete(callback);
  }

  private emit(event: EmulatorEventType): void {
    this.listeners.forEach((cb) => cb(event));
  }

  // --- Configuration CRUD ---

  getConfigs(): EmulatedDeviceConfig[] {
    return Array.from(this.configs.values());
  }

  getConfig(id: string): EmulatedDeviceConfig | undefined {
    return this.configs.get(id);
  }

  addConfig(config: EmulatedDeviceConfig): void {
    this.configs.set(config.id, config);
    this.states.set(config.id, createEmptyState(config.id));
    this.saveConfigs();
  }

  updateConfig(id: string, updates: Partial<EmulatedDeviceConfig>): void {
    const existing = this.configs.get(id);
    if (!existing) return;
    this.configs.set(id, { ...existing, ...updates, id });
    this.saveConfigs();
  }

  removeConfig(id: string): void {
    if (this.states.get(id)?.isRunning) {
      this.stopDevice(id);
    }
    this.configs.delete(id);
    this.states.delete(id);
    this.saveConfigs();
  }

  duplicateConfig(id: string): EmulatedDeviceConfig | null {
    const original = this.configs.get(id);
    if (!original) return null;
    const newConfig: EmulatedDeviceConfig = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      deviceId: `${original.deviceId}-copy`,
    };
    this.addConfig(newConfig);
    return newConfig;
  }

  // --- State access ---

  getState(configId: string): EmulatedDeviceState {
    return this.states.get(configId) ?? createEmptyState(configId);
  }

  getAllStates(): Map<string, EmulatedDeviceState> {
    return new Map(this.states);
  }

  getActivityLog(): ActivityLogEntry[] {
    return this.activityLog;
  }

  isConnected(): boolean {
    return this.mqttClient?.connected ?? false;
  }

  // --- Runtime ---

  async startDevice(configId: string): Promise<void> {
    const config = this.configs.get(configId);
    if (!config) return;

    const state = this.states.get(configId);
    if (state?.isRunning) return;

    await this.ensureMqttConnection(config.brokerUrl);

    const commandTopic = `minis/${config.userId}/${config.deviceId}/command`;
    this.mqttClient?.subscribe(commandTopic);

    const now = Date.now();
    this.startTimes.set(configId, now);

    this.states.set(configId, {
      ...createEmptyState(configId),
      isRunning: true,
      isConnected: this.mqttClient?.connected ?? false,
      startedAt: now,
    });

    // Start telemetry interval
    this.sendTelemetry(config);
    const telemetryInterval = setInterval(
      () => this.sendTelemetry(config),
      config.telemetryIntervalSec * 1000,
    );
    this.telemetryIntervals.set(configId, telemetryInterval);

    // Start heartbeat interval
    this.sendHeartbeat(config);
    const heartbeatInterval = setInterval(
      () => this.sendHeartbeat(config),
      config.heartbeatIntervalSec * 1000,
    );
    this.heartbeatIntervals.set(configId, heartbeatInterval);

    this.emit('stateChange');
  }

  stopDevice(configId: string): void {
    const config = this.configs.get(configId);

    // Clear telemetry interval
    const telemetryInterval = this.telemetryIntervals.get(configId);
    if (telemetryInterval) {
      clearInterval(telemetryInterval);
      this.telemetryIntervals.delete(configId);
    }

    // Clear heartbeat interval
    const heartbeatInterval = this.heartbeatIntervals.get(configId);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      this.heartbeatIntervals.delete(configId);
    }

    // Clear pending ACK timeouts
    for (const [key, timeout] of this.ackTimeouts) {
      if (key.startsWith(configId)) {
        clearTimeout(timeout);
        this.ackTimeouts.delete(key);
      }
    }

    // Unsubscribe from command topic
    if (config && this.mqttClient?.connected) {
      const commandTopic = `minis/${config.userId}/${config.deviceId}/command`;
      this.mqttClient.unsubscribe(commandTopic);
    }

    this.startTimes.delete(configId);

    const state = this.states.get(configId);
    if (state) {
      this.states.set(configId, {
        ...state,
        isRunning: false,
        pendingCommands: [],
      });
    }

    // Disconnect MQTT if no devices running
    const anyRunning = Array.from(this.states.values()).some((s) => s.isRunning);
    if (!anyRunning && this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }

    this.emit('stateChange');
  }

  async startAll(): Promise<void> {
    for (const config of this.configs.values()) {
      const state = this.states.get(config.id);
      if (!state?.isRunning) {
        await this.startDevice(config.id);
      }
    }
  }

  stopAll(): void {
    for (const config of this.configs.values()) {
      const state = this.states.get(config.id);
      if (state?.isRunning) {
        this.stopDevice(config.id);
      }
    }
  }

  clearLog(): void {
    this.activityLog = [];
    this.emit('logEntry');
  }

  // Manual command ACK (for manual mode)
  ackCommand(configId: string, commandId: string, status: 'ACKNOWLEDGED' | 'FAILED', reason?: string): void {
    const config = this.configs.get(configId);
    if (!config) return;

    this.sendCommandAck(config, commandId, status, reason);

    const state = this.states.get(configId);
    if (state) {
      this.states.set(configId, {
        ...state,
        pendingCommands: state.pendingCommands.map((c) =>
          c.id === commandId ? { ...c, acked: true } : c,
        ),
      });
      this.emit('stateChange');
    }
  }

  dispose(): void {
    this.stopAll();
    if (this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }
    this.listeners.clear();
  }

  // --- Private: MQTT ---

  private async ensureMqttConnection(brokerUrl?: string): Promise<void> {
    if (this.mqttClient?.connected) return;
    if (this.connecting) return;

    this.connecting = true;
    try {
      const url = brokerUrl || getMqttUrl();
      this.mqttClient = mqtt.connect(url, {
        clientId: `minis_emulator_${Date.now()}`,
        protocolVersion: 4,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MQTT connection timeout')), 10000);
        this.mqttClient!.on('connect', () => {
          clearTimeout(timeout);
          this.updateConnectionStates(true);
          resolve();
        });
        this.mqttClient!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      this.mqttClient.on('message', (topic: string, payload: Buffer) => {
        this.handleIncomingMessage(topic, payload.toString());
      });

      this.mqttClient.on('close', () => {
        this.updateConnectionStates(false);
      });

      this.mqttClient.on('reconnect', () => {
        // Re-subscribe to all active device command topics
        for (const [configId, state] of this.states) {
          if (state.isRunning) {
            const config = this.configs.get(configId);
            if (config) {
              this.mqttClient?.subscribe(`minis/${config.userId}/${config.deviceId}/command`);
            }
          }
        }
      });
    } finally {
      this.connecting = false;
    }
  }

  private updateConnectionStates(connected: boolean): void {
    for (const [configId, state] of this.states) {
      if (state.isRunning) {
        this.states.set(configId, { ...state, isConnected: connected });
      }
    }
    this.emit('stateChange');
  }

  // --- Private: Telemetry & Heartbeat ---

  private sendTelemetry(config: EmulatedDeviceConfig): void {
    if (!this.mqttClient?.connected) return;

    const startTime = this.startTimes.get(config.id) ?? Date.now();
    const elapsedSec = (Date.now() - startTime) / 1000;

    const metrics: TelemetryMetric[] = config.metrics.map((m) => ({
      key: m.key,
      value: generateValue(m.generator, elapsedSec),
      unit: m.unit || undefined,
    }));

    const topic = `minis/${config.userId}/${config.deviceId}/telemetry`;
    const payload = JSON.stringify({
      metrics,
      timestamp: Date.now(),
      rssi: config.rssi,
      battery: config.battery,
    });

    this.mqttClient.publish(topic, payload);
    this.addLogEntry(config, 'sent', topic, 'telemetry', payload);

    const state = this.states.get(config.id);
    if (state) {
      this.states.set(config.id, { ...state, lastTelemetrySentAt: Date.now(), messagesSent: state.messagesSent + 1 });
    }
  }

  private sendHeartbeat(config: EmulatedDeviceConfig): void {
    if (!this.mqttClient?.connected) return;

    const startTime = this.startTimes.get(config.id) ?? Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    const topic = `minis/${config.userId}/${config.deviceId}/heartbeat`;
    const payload = JSON.stringify({
      uptime,
      rssi: config.rssi,
      battery: config.battery,
    });

    this.mqttClient.publish(topic, payload);
    this.addLogEntry(config, 'sent', topic, 'heartbeat', payload);

    const state = this.states.get(config.id);
    if (state) {
      this.states.set(config.id, { ...state, lastHeartbeatSentAt: Date.now(), messagesSent: state.messagesSent + 1 });
    }
  }

  // --- Private: Command handling ---

  private handleIncomingMessage(topic: string, payloadStr: string): void {
    // Parse topic: minis/{userId}/{deviceId}/command
    const parts = topic.split('/');
    if (parts.length < 4 || parts[0] !== 'minis' || parts[3] !== 'command') return;

    const userId = parts[1];
    const deviceId = parts[2];

    // Find matching config
    const config = Array.from(this.configs.values()).find(
      (c) => c.userId === userId && c.deviceId === deviceId,
    );
    if (!config) return;

    let command: { id: string; name: string; payload: Record<string, unknown> };
    try {
      command = JSON.parse(payloadStr);
    } catch {
      return;
    }

    const received: ReceivedCommand = {
      id: command.id,
      name: command.name,
      payload: command.payload,
      receivedAt: Date.now(),
      acked: false,
    };

    this.addLogEntry(config, 'received', topic, 'command', payloadStr);

    const state = this.states.get(config.id);
    if (state) {
      this.states.set(config.id, {
        ...state,
        messagesReceived: state.messagesReceived + 1,
      });
    }

    if (config.commandAckMode === 'auto-ack') {
      const timeoutKey = `${config.id}:${command.id}`;
      const timeout = setTimeout(() => {
        this.applyEntityCommand(config, command.name, command.payload);
        this.sendTelemetry(config);
        this.sendCommandAck(config, command.id, 'ACKNOWLEDGED');
        this.ackTimeouts.delete(timeoutKey);
      }, config.commandAckDelaySec * 1000);
      this.ackTimeouts.set(timeoutKey, timeout);
    } else if (config.commandAckMode === 'auto-fail') {
      const timeoutKey = `${config.id}:${command.id}`;
      const timeout = setTimeout(() => {
        this.sendCommandAck(config, command.id, 'FAILED', 'Emulator auto-fail');
        this.ackTimeouts.delete(timeoutKey);
      }, config.commandAckDelaySec * 1000);
      this.ackTimeouts.set(timeoutKey, timeout);
    } else {
      // Manual mode — add to pending
      const currentState = this.states.get(config.id);
      if (currentState) {
        this.states.set(config.id, {
          ...currentState,
          pendingCommands: [...currentState.pendingCommands, received],
        });
      }
    }

    this.emit('stateChange');
  }

  private sendCommandAck(config: EmulatedDeviceConfig, commandId: string, status: string, reason?: string): void {
    if (!this.mqttClient?.connected) return;

    const topic = `minis/${config.userId}/${config.deviceId}/command/ack`;
    const payload: Record<string, unknown> = { id: commandId, status };
    if (reason) payload.reason = reason;
    const payloadStr = JSON.stringify(payload);

    this.mqttClient.publish(topic, payloadStr);
    this.addLogEntry(config, 'sent', topic, 'command-ack', payloadStr);

    const state = this.states.get(config.id);
    if (state) {
      this.states.set(config.id, { ...state, messagesSent: state.messagesSent + 1 });
    }
    this.emit('stateChange');
  }

  // --- Private: Entity command handling ---

  private applyEntityCommand(config: EmulatedDeviceConfig, commandName: string, payload: Record<string, unknown>): void {
    const entityId = payload.entity_id as string | undefined;
    if (!entityId) return;

    const metric = config.metrics.find((m) => m.key === entityId);
    if (!metric) return;

    switch (commandName) {
      case 'set_state': {
        const state = payload.state;
        metric.generator = { type: 'constant', value: state ? 1 : 0 };
        break;
      }
      case 'set_value': {
        const value = payload.value;
        if (typeof value === 'number') {
          metric.generator = { type: 'constant', value };
        }
        break;
      }
      case 'set_option': {
        const option = payload.option;
        if (typeof option === 'string') {
          const entity = config.entities?.find((e) => e.id === entityId);
          if (entity?.type === 'select') {
            const index = entity.options.indexOf(option);
            metric.generator = { type: 'constant', value: index >= 0 ? index : 0 };
          }
        }
        break;
      }
      case 'press':
        // Button press — no state to update
        break;
    }

    this.saveConfigs();
  }

  // --- Private: Helpers ---

  private addLogEntry(
    config: EmulatedDeviceConfig,
    direction: 'sent' | 'received',
    topic: string,
    type: ActivityLogEntry['type'],
    payload: string,
  ): void {
    const entry: ActivityLogEntry = {
      timestamp: Date.now(),
      deviceConfigId: config.id,
      deviceName: config.name,
      direction,
      topic,
      type,
      payload,
    };

    this.activityLog.unshift(entry);
    if (this.activityLog.length > MAX_LOG_ENTRIES) {
      this.activityLog = this.activityLog.slice(0, MAX_LOG_ENTRIES);
    }

    this.emit('logEntry');
  }

  // --- Persistence ---

  private loadConfigs(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const configs: EmulatedDeviceConfig[] = JSON.parse(stored);
        configs.forEach((c) => {
          this.configs.set(c.id, c);
          this.states.set(c.id, createEmptyState(c.id));
        });
      }
    } catch {
      // Ignore corrupted localStorage
    }
  }

  private saveConfigs(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.configs.values())));
    this.emit('configsChanged');
  }
}
