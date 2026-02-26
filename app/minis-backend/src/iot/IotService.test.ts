import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IotService } from './IotService.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let service: IotService;
const published: Array<{ topic: string; payload: string }> = [];

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iot-test-'));
  service = new IotService(tmpDir);
  service.start((topic, payload) => {
    published.push({ topic, payload });
  });
});

beforeEach(() => {
  published.length = 0;
});

afterAll(() => {
  service.stop();
  fs.rm(tmpDir, { recursive: true, force: true });
});

describe('IotDatabase', () => {
  it('creates iot.db file', async () => {
    const dbPath = path.join(tmpDir, 'iot.db');
    const stat = await fs.stat(dbPath);
    expect(stat.isFile()).toBe(true);
  });
});

describe('TelemetryStore', () => {
  it('inserts and retrieves telemetry', () => {
    const record = {
      deviceId: 'dev1',
      userId: 'user1',
      timestamp: Date.now(),
      metrics: [{ key: 'temperature', value: 22.5, unit: '°C' }],
    };
    service.telemetry.insertTelemetry(record);

    const latest = service.telemetry.getLatest('dev1');
    expect(latest).not.toBeNull();
    expect(latest!.deviceId).toBe('dev1');
    expect(latest!.metrics[0].key).toBe('temperature');
    expect(latest!.metrics[0].value).toBe(22.5);
  });

  it('returns history within time range', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      service.telemetry.insertTelemetry({
        deviceId: 'dev-hist',
        userId: 'user1',
        timestamp: now - i * 1000,
        metrics: [{ key: 'humidity', value: 50 + i }],
      });
    }

    const history = service.telemetry.getHistory('dev-hist', now - 10000, now, 10);
    expect(history.length).toBe(5);
    // Ordered by timestamp DESC
    expect(history[0].timestamp).toBeGreaterThanOrEqual(history[1].timestamp);
  });

  it('returns null for nonexistent device', () => {
    const latest = service.telemetry.getLatest('nonexistent');
    expect(latest).toBeNull();
  });

  it('cleans up old records', () => {
    const oldTimestamp = Date.now() - 100_000;
    service.telemetry.insertTelemetry({
      deviceId: 'dev-old',
      userId: 'user1',
      timestamp: oldTimestamp,
      metrics: [{ key: 'temp', value: 10 }],
    });

    const deleted = service.telemetry.cleanup(Date.now() - 50_000);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const latest = service.telemetry.getLatest('dev-old');
    expect(latest).toBeNull();
  });
});

describe('IoT Device Config', () => {
  it('upserts and retrieves config', () => {
    const config = {
      deviceId: 'dev-cfg',
      userId: 'user1',
      topicPrefix: 'minis/user1/dev-cfg',
      heartbeatIntervalSec: 30,
      capabilities: [{ type: 'sensor' as const, metricKey: 'temp', unit: '°C', label: 'Temperature' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    service.telemetry.upsertConfig(config);
    const retrieved = service.telemetry.getConfig('dev-cfg');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.topicPrefix).toBe('minis/user1/dev-cfg');
    expect(retrieved!.heartbeatIntervalSec).toBe(30);
    expect(retrieved!.capabilities).toHaveLength(1);
  });

  it('updates config on second upsert', () => {
    service.telemetry.upsertConfig({
      deviceId: 'dev-cfg',
      userId: 'user1',
      topicPrefix: 'minis/user1/dev-cfg',
      heartbeatIntervalSec: 120,
      capabilities: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const retrieved = service.telemetry.getConfig('dev-cfg');
    expect(retrieved!.heartbeatIntervalSec).toBe(120);
  });

  it('returns null for nonexistent config', () => {
    expect(service.telemetry.getConfig('nonexistent')).toBeNull();
  });
});

describe('DevicePresence', () => {
  it('records heartbeat and returns ONLINE status', () => {
    service.presence.recordHeartbeat('dev-pres', 'user1', 60);
    expect(service.presence.getStatus('dev-pres')).toBe('ONLINE');
    expect(service.presence.getLastSeen('dev-pres')).toBeGreaterThan(0);
  });

  it('returns UNKNOWN for unregistered device', () => {
    expect(service.presence.getStatus('unknown-device')).toBe('UNKNOWN');
  });

  it('emits statusChange on first heartbeat', () => {
    published.length = 0;
    service.presence.recordHeartbeat('dev-pres2', 'user1', 60);
    expect(published.some((p) => p.topic.includes('dev-pres2/status'))).toBe(true);
  });
});

describe('CommandDispatcher', () => {
  it('creates and retrieves command', () => {
    const cmd = service.commands.createCommand('dev1', 'set_relay', { pin: 5, state: true });
    expect(cmd.id).toBeDefined();
    expect(cmd.status).toBe('PENDING');

    const retrieved = service.commands.getCommand(cmd.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('set_relay');
    expect(retrieved!.payload).toEqual({ pin: 5, state: true });
  });

  it('updates command status', () => {
    const cmd = service.commands.createCommand('dev1', 'reboot', {});
    service.commands.updateStatus(cmd.id, 'ACKNOWLEDGED');

    const retrieved = service.commands.getCommand(cmd.id);
    expect(retrieved!.status).toBe('ACKNOWLEDGED');
    expect(retrieved!.resolvedAt).toBeDefined();
  });

  it('lists commands for device', () => {
    const list = service.commands.listCommands('dev1');
    expect(list.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AlertEngine', () => {
  it('creates and retrieves alert rule', () => {
    const rule = service.alerts.createRule({
      userId: 'user1',
      deviceId: 'dev-alert',
      metricKey: 'temperature',
      conditionOp: '>',
      conditionValue: 30,
      severity: 'WARNING',
      cooldownMinutes: 1,
      isActive: true,
      name: 'High temp',
    });

    expect(rule.id).toBeDefined();
    const retrieved = service.alerts.getRule(rule.id);
    expect(retrieved!.name).toBe('High temp');
  });

  it('evaluates rules and triggers alert', () => {
    const alerts = service.alerts.evaluate('dev-alert', 'user1', [
      { key: 'temperature', value: 35, unit: '°C' },
    ]);

    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('WARNING');
    expect(alerts[0].status).toBe('OPEN');
  });

  it('respects cooldown — does not trigger again immediately', () => {
    const alerts = service.alerts.evaluate('dev-alert', 'user1', [
      { key: 'temperature', value: 40, unit: '°C' },
    ]);

    expect(alerts.length).toBe(0);
  });

  it('does not trigger for value below threshold', () => {
    // Create a new rule for a different device to avoid cooldown
    service.alerts.createRule({
      userId: 'user1',
      deviceId: 'dev-alert2',
      metricKey: 'temperature',
      conditionOp: '>',
      conditionValue: 30,
      severity: 'INFO',
      cooldownMinutes: 0,
      isActive: true,
      name: 'Low temp check',
    });

    const alerts = service.alerts.evaluate('dev-alert2', 'user1', [
      { key: 'temperature', value: 25 },
    ]);
    expect(alerts.length).toBe(0);
  });

  it('acknowledges and resolves alert', () => {
    const alerts = service.alerts.listAlerts('user1');
    const openAlert = alerts.find((a) => a.status === 'OPEN');
    expect(openAlert).toBeDefined();

    const acked = service.alerts.acknowledgeAlert(openAlert!.id);
    expect(acked!.status).toBe('ACKNOWLEDGED');

    const resolved = service.alerts.resolveAlert(openAlert!.id);
    expect(resolved!.status).toBe('RESOLVED');
  });

  it('updates alert rule', () => {
    const rules = service.alerts.listRules('user1');
    const updated = service.alerts.updateRule(rules[0].id, { conditionValue: 40 });
    expect(updated!.conditionValue).toBe(40);
  });

  it('deletes alert rule without alerts', () => {
    const rule = service.alerts.createRule({
      userId: 'user1',
      deviceId: 'dev-delete-test',
      metricKey: 'temp',
      conditionOp: '>',
      conditionValue: 99,
      severity: 'INFO',
      cooldownMinutes: 0,
      isActive: true,
      name: 'To be deleted',
    });
    const deleted = service.alerts.deleteRule(rule.id);
    expect(deleted).toBe(true);
    expect(service.alerts.getRule(rule.id)).toBeNull();
  });
});

describe('IotService — MQTT message handling', () => {
  it('handles telemetry MQTT message', () => {
    published.length = 0;
    service.handleMqttMessage(
      'minis/user1/dev-mqtt/telemetry',
      JSON.stringify({ metrics: [{ key: 'pressure', value: 1013 }] }),
    );

    const latest = service.telemetry.getLatest('dev-mqtt');
    expect(latest).not.toBeNull();
    expect(latest!.metrics[0].key).toBe('pressure');

    // Should republish live telemetry
    expect(published.some((p) => p.topic === 'minis/user1/dev-mqtt/telemetry/live')).toBe(true);
  });

  it('handles heartbeat MQTT message', () => {
    service.handleMqttMessage(
      'minis/user1/dev-hb/heartbeat',
      JSON.stringify({ uptime: 3600 }),
    );

    expect(service.presence.getStatus('dev-hb')).toBe('ONLINE');
  });

  it('handles command ack MQTT message', () => {
    const cmd = service.commands.createCommand('dev-ack', 'test', {});
    service.handleMqttMessage(
      'minis/user1/dev-ack/command/ack',
      JSON.stringify({ id: cmd.id, status: 'ACKNOWLEDGED' }),
    );

    const retrieved = service.commands.getCommand(cmd.id);
    expect(retrieved!.status).toBe('ACKNOWLEDGED');
  });

  it('sends command via MQTT', () => {
    service.telemetry.upsertConfig({
      deviceId: 'dev-cmd',
      userId: 'user1',
      topicPrefix: 'minis/user1/dev-cmd',
      heartbeatIntervalSec: 60,
      capabilities: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    published.length = 0;
    const cmd = service.sendCommand('dev-cmd', 'set_led', { color: 'red' });
    expect(cmd.status).toBe('SENT');
    expect(published.some((p) => p.topic === 'minis/user1/dev-cmd/command')).toBe(true);
  });

  it('ignores invalid MQTT messages', () => {
    service.handleMqttMessage('invalid/topic', '{}');
    service.handleMqttMessage('minis/user1/dev1/telemetry', 'not json{');
    // Should not throw
  });
});
