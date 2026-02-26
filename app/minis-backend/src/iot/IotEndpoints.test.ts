import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MinisHttpServer } from '../MinisHttpServer.js';
import { FileSystem } from '@mhersztowski/core-backend';
import { IotService } from './IotService.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;
let iotService: IotService;
let server: MinisHttpServer;
let baseUrl: string;

async function seedData() {
  const adminDir = path.join(tmpDir, 'Minis', 'Admin');
  await fs.mkdir(adminDir, { recursive: true });

  const users = {
    type: 'users',
    items: [
      { type: 'user', id: 'user1', name: 'TestUser', password: 'pass', isAdmin: false, roles: [] },
    ],
  };
  await fs.writeFile(path.join(adminDir, 'Users.json'), JSON.stringify(users, null, 2));

  // Create user device file with IoT device
  const userDir = path.join(tmpDir, 'Minis', 'Users', 'TestUser', 'Projects');
  await fs.mkdir(userDir, { recursive: true });
  const devices = {
    type: 'devices',
    devices: [
      { type: 'device', id: 'dev-iot1', name: 'dev-iot1', deviceDefId: 'dd1', isAssembled: true, isIot: true, sn: 'SN001' },
    ],
  };
  await fs.writeFile(path.join(tmpDir, 'Minis', 'Users', 'TestUser', 'Device.json'), JSON.stringify(devices));
}

async function request(method: string, apiPath: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${apiPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iot-endpoints-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
  await seedData();

  iotService = new IotService(tmpDir);
  iotService.start(() => {});

  server = new MinisHttpServer(0, fileSystem, iotService);
  await server.start();
  const address = server.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.stop();
  iotService.stop();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('IoT Config endpoints', () => {
  it('PUT creates/updates IoT config', async () => {
    const { status, data } = await request('PUT', '/users/TestUser/devices/dev-iot1/iot-config', {
      topicPrefix: 'minis/TestUser/dev-iot1',
      heartbeatIntervalSec: 30,
      capabilities: [{ type: 'sensor', metricKey: 'temp', unit: '°C', label: 'Temperature' }],
    });
    expect(status).toBe(200);
    expect(data.deviceId).toBe('dev-iot1');
    expect(data.heartbeatIntervalSec).toBe(30);
    expect(data.capabilities).toHaveLength(1);
  });

  it('GET retrieves IoT config', async () => {
    const { status, data } = await request('GET', '/users/TestUser/devices/dev-iot1/iot-config');
    expect(status).toBe(200);
    expect(data.topicPrefix).toBe('minis/TestUser/dev-iot1');
  });

  it('GET returns 404 for nonexistent config', async () => {
    const { status } = await request('GET', '/users/TestUser/devices/nonexistent/iot-config');
    expect(status).toBe(404);
  });
});

describe('IoT Telemetry endpoints', () => {
  it('GET /telemetry/latest returns latest record', async () => {
    // Insert telemetry directly
    iotService.telemetry.insertTelemetry({
      deviceId: 'dev-iot1', userId: 'TestUser', timestamp: Date.now(),
      metrics: [{ key: 'temp', value: 22.5, unit: '°C' }],
    });

    const { status, data } = await request('GET', '/users/TestUser/devices/dev-iot1/telemetry/latest');
    expect(status).toBe(200);
    expect(data.metrics[0].value).toBe(22.5);
  });

  it('GET /telemetry returns history', async () => {
    const { status, data } = await request('GET', '/users/TestUser/devices/dev-iot1/telemetry?from=0&to=' + (Date.now() + 1000) + '&limit=10');
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /telemetry/latest returns message for no data', async () => {
    const { status, data } = await request('GET', '/users/TestUser/devices/no-data-dev/telemetry/latest');
    expect(status).toBe(200);
    expect(data.message).toBeDefined();
  });
});

describe('IoT Commands endpoints', () => {
  it('POST creates command', async () => {
    const { status, data } = await request('POST', '/users/TestUser/devices/dev-iot1/commands', {
      name: 'set_led', payload: { color: 'red' },
    });
    expect(status).toBe(201);
    expect(data.name).toBe('set_led');
    expect(data.id).toBeDefined();
  });

  it('POST returns 400 without name', async () => {
    const { status } = await request('POST', '/users/TestUser/devices/dev-iot1/commands', { payload: {} });
    expect(status).toBe(400);
  });

  it('GET lists commands', async () => {
    const { status, data } = await request('GET', '/users/TestUser/devices/dev-iot1/commands');
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('IoT Alert Rules endpoints', () => {
  let ruleId: string;

  it('POST creates alert rule', async () => {
    const { status, data } = await request('POST', '/users/TestUser/alert-rules', {
      name: 'High temp', metricKey: 'temp', conditionOp: '>', conditionValue: 30,
      severity: 'WARNING', cooldownMinutes: 5, deviceId: 'dev-iot1',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    ruleId = data.id;
  });

  it('POST returns 400 without required fields', async () => {
    const { status } = await request('POST', '/users/TestUser/alert-rules', { name: 'Incomplete' });
    expect(status).toBe(400);
  });

  it('GET lists alert rules', async () => {
    const { status, data } = await request('GET', '/users/TestUser/alert-rules');
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('PUT updates alert rule', async () => {
    const { status, data } = await request('PUT', `/users/TestUser/alert-rules/${ruleId}`, {
      conditionValue: 35,
    });
    expect(status).toBe(200);
    expect(data.conditionValue).toBe(35);
  });

  it('DELETE removes alert rule', async () => {
    const { status } = await request('DELETE', `/users/TestUser/alert-rules/${ruleId}`);
    expect(status).toBe(200);
  });

  it('DELETE returns 404 for nonexistent rule', async () => {
    const { status } = await request('DELETE', '/users/TestUser/alert-rules/nonexistent');
    expect(status).toBe(404);
  });
});

describe('IoT Alerts endpoints', () => {
  it('GET lists alerts', async () => {
    const { status, data } = await request('GET', '/users/TestUser/alerts');
    expect(status).toBe(200);
    expect(data.items).toBeDefined();
  });

  it('PATCH acknowledges alert', async () => {
    // Create rule and trigger alert
    iotService.alerts.createRule({
      userId: 'TestUser', deviceId: 'dev-iot1', metricKey: 'temp',
      conditionOp: '>', conditionValue: 30, severity: 'CRITICAL',
      cooldownMinutes: 0, isActive: true, name: 'Test alert',
    });
    const [alert] = iotService.alerts.evaluate('dev-iot1', 'TestUser', [{ key: 'temp', value: 50 }]);
    expect(alert).toBeDefined();

    const { status, data } = await request('PATCH', `/users/TestUser/alerts/${alert.id}`, { status: 'ACKNOWLEDGED' });
    expect(status).toBe(200);
    expect(data.status).toBe('ACKNOWLEDGED');
  });

  it('PATCH returns 400 for invalid status', async () => {
    const { status } = await request('PATCH', '/users/TestUser/alerts/some-id', { status: 'INVALID' });
    expect(status).toBe(400);
  });
});

describe('IoT Devices List endpoint', () => {
  it('GET /users/{userId}/iot/devices returns status list', async () => {
    // Record a heartbeat so there's data
    iotService.presence.recordHeartbeat('dev-iot1', 'TestUser', 60);

    const { status, data } = await request('GET', '/users/TestUser/iot/devices');
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(data.items[0].status).toBe('ONLINE');
  });
});

describe('Device Sharing endpoints', () => {
  let shareId: string;

  it('POST creates a share', async () => {
    const { status, data } = await request('POST', '/users/TestUser/devices/dev-iot1/shares', {
      targetUserId: 'user2',
    });
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.ownerUserId).toBe('TestUser');
    expect(data.deviceId).toBe('dev-iot1');
    expect(data.targetUserId).toBe('user2');
    shareId = data.id;
  });

  it('POST returns 400 without targetUserId', async () => {
    const { status } = await request('POST', '/users/TestUser/devices/dev-iot1/shares', {});
    expect(status).toBe(400);
  });

  it('POST returns 409 for duplicate share', async () => {
    const { status } = await request('POST', '/users/TestUser/devices/dev-iot1/shares', {
      targetUserId: 'user2',
    });
    expect(status).toBe(409);
  });

  it('GET lists shares for device', async () => {
    const { status, data } = await request('GET', '/users/TestUser/devices/dev-iot1/shares');
    expect(status).toBe(200);
    expect(data.items.length).toBe(1);
    expect(data.items[0].targetUserId).toBe('user2');
  });

  it('GET /shared-devices returns shares for target user', async () => {
    const { status, data } = await request('GET', '/users/user2/shared-devices');
    expect(status).toBe(200);
    expect(data.items.length).toBe(1);
    expect(data.items[0].ownerUserId).toBe('TestUser');
    expect(data.items[0].deviceId).toBe('dev-iot1');
  });

  it('GET /shared-devices returns empty for user without shares', async () => {
    const { status, data } = await request('GET', '/users/TestUser/shared-devices');
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });

  it('DELETE removes share', async () => {
    const { status } = await request('DELETE', `/users/TestUser/devices/dev-iot1/shares/${shareId}`);
    expect(status).toBe(200);
  });

  it('DELETE returns 404 for nonexistent share', async () => {
    const { status } = await request('DELETE', '/users/TestUser/devices/dev-iot1/shares/nonexistent');
    expect(status).toBe(404);
  });

  it('GET returns empty list after delete', async () => {
    const { status, data } = await request('GET', '/users/TestUser/devices/dev-iot1/shares');
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});

describe('My Shares endpoint', () => {
  it('GET /my-shares returns shares owned by user', async () => {
    // Create a share first
    await request('POST', '/users/TestUser/devices/dev-iot1/shares', { targetUserId: 'user3' });

    const { status, data } = await request('GET', '/users/TestUser/my-shares');
    expect(status).toBe(200);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    expect(data.items.some((s: any) => s.targetUserId === 'user3')).toBe(true);
  });

  it('GET /my-shares returns empty for user without outgoing shares', async () => {
    const { status, data } = await request('GET', '/users/user-no-shares/my-shares');
    expect(status).toBe(200);
    expect(data.items.length).toBe(0);
  });
});
