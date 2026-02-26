import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmulatorService } from './EmulatorService';
import type { EmulatedDeviceConfig } from './types';

// Mock mqtt module
const mockPublish = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockEnd = vi.fn();

let connectCallback: (() => void) | null = null;
let messageCallback: ((topic: string, payload: Buffer) => void) | null = null;

const mockClient = {
  connected: true,
  publish: mockPublish,
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  end: mockEnd,
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'connect') {
      connectCallback = cb as () => void;
      // Fire connect immediately (simulates already connected)
      queueMicrotask(() => connectCallback?.());
    }
    if (event === 'message') messageCallback = cb as (topic: string, payload: Buffer) => void;
  }),
};

vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => mockClient),
  },
}));

vi.mock('@mhersztowski/web-client', () => ({
  getMqttUrl: () => 'ws://localhost:1902/mqtt',
}));

function createTestConfig(overrides: Partial<EmulatedDeviceConfig> = {}): EmulatedDeviceConfig {
  return {
    id: 'test-config-1',
    deviceId: 'dev-emu-1',
    userId: 'user1',
    name: 'Test Device',
    metrics: [
      { key: 'temperature', unit: '°C', generator: { type: 'constant', value: 25 } },
    ],
    telemetryIntervalSec: 10,
    heartbeatIntervalSec: 60,
    commandAckMode: 'auto-ack',
    commandAckDelaySec: 1,
    rssi: -50,
    battery: 85,
    ...overrides,
  };
}

describe('EmulatorService', () => {
  let service: EmulatorService;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockPublish.mockClear();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    mockEnd.mockClear();
    mockClient.on.mockClear();
    mockClient.connected = true;
    connectCallback = null;
    messageCallback = null;
    service = new EmulatorService();
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  describe('config CRUD', () => {
    it('adds a config', () => {
      const config = createTestConfig();
      service.addConfig(config);
      expect(service.getConfigs()).toHaveLength(1);
      expect(service.getConfig('test-config-1')).toEqual(config);
    });

    it('updates a config', () => {
      service.addConfig(createTestConfig());
      service.updateConfig('test-config-1', { name: 'Updated' });
      expect(service.getConfig('test-config-1')?.name).toBe('Updated');
    });

    it('removes a config', () => {
      service.addConfig(createTestConfig());
      service.removeConfig('test-config-1');
      expect(service.getConfigs()).toHaveLength(0);
    });

    it('duplicates a config', () => {
      service.addConfig(createTestConfig());
      const dup = service.duplicateConfig('test-config-1');
      expect(dup).not.toBeNull();
      expect(dup!.id).not.toBe('test-config-1');
      expect(dup!.name).toBe('Test Device (copy)');
      expect(service.getConfigs()).toHaveLength(2);
    });

    it('returns null when duplicating non-existent', () => {
      expect(service.duplicateConfig('nonexistent')).toBeNull();
    });
  });

  describe('localStorage persistence', () => {
    it('saves configs to localStorage', () => {
      service.addConfig(createTestConfig());
      const stored = localStorage.getItem('minis-iot-emulator-configs');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe('Test Device');
    });

    it('loads configs from localStorage on construction', () => {
      const config = createTestConfig();
      localStorage.setItem('minis-iot-emulator-configs', JSON.stringify([config]));
      const newService = new EmulatorService();
      expect(newService.getConfigs()).toHaveLength(1);
      expect(newService.getConfig('test-config-1')?.name).toBe('Test Device');
      newService.dispose();
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('minis-iot-emulator-configs', 'invalid json');
      const newService = new EmulatorService();
      expect(newService.getConfigs()).toHaveLength(0);
      newService.dispose();
    });
  });

  describe('state management', () => {
    it('returns empty state for unknown config', () => {
      const state = service.getState('nonexistent');
      expect(state.isRunning).toBe(false);
      expect(state.messagesSent).toBe(0);
    });

    it('initializes state when adding config', () => {
      service.addConfig(createTestConfig());
      const state = service.getState('test-config-1');
      expect(state.isRunning).toBe(false);
      expect(state.isConnected).toBe(false);
    });
  });

  describe('device lifecycle', () => {
    it('starts a device — subscribes to commands and publishes telemetry', async () => {
      service.addConfig(createTestConfig());
      await service.startDevice('test-config-1');

      expect(mockSubscribe).toHaveBeenCalledWith('minis/user1/dev-emu-1/command');

      // First telemetry should be sent immediately
      expect(mockPublish).toHaveBeenCalled();
      const telemetryCall = mockPublish.mock.calls.find((c: string[]) =>
        c[0].includes('/telemetry'),
      );
      expect(telemetryCall).toBeDefined();
      const telemetryPayload = JSON.parse(telemetryCall![1]);
      expect(telemetryPayload.metrics[0].key).toBe('temperature');
      expect(telemetryPayload.metrics[0].value).toBe(25);

      const state = service.getState('test-config-1');
      expect(state.isRunning).toBe(true);
    });

    it('stops a device — clears intervals and unsubscribes', async () => {
      service.addConfig(createTestConfig());
      await service.startDevice('test-config-1');

      service.stopDevice('test-config-1');
      const state = service.getState('test-config-1');
      expect(state.isRunning).toBe(false);
      expect(mockUnsubscribe).toHaveBeenCalledWith('minis/user1/dev-emu-1/command');
    });

    it('sends telemetry at configured interval', async () => {
      service.addConfig(createTestConfig({ telemetryIntervalSec: 5 }));
      await service.startDevice('test-config-1');

      const initialCount = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/telemetry'),
      ).length;

      await vi.advanceTimersByTimeAsync(5000);
      const afterOneInterval = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/telemetry'),
      ).length;

      expect(afterOneInterval).toBe(initialCount + 1);
    });

    it('sends heartbeat at configured interval', async () => {
      service.addConfig(createTestConfig({ heartbeatIntervalSec: 10 }));
      await service.startDevice('test-config-1');

      const initialCount = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/heartbeat'),
      ).length;

      await vi.advanceTimersByTimeAsync(10000);
      const afterOneInterval = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/heartbeat'),
      ).length;

      expect(afterOneInterval).toBe(initialCount + 1);
    });
  });

  describe('command handling', () => {
    it('auto-acks commands in auto-ack mode', async () => {
      service.addConfig(createTestConfig({ commandAckMode: 'auto-ack', commandAckDelaySec: 2 }));
      await service.startDevice('test-config-1');

      // Simulate incoming command
      messageCallback?.(
        'minis/user1/dev-emu-1/command',
        Buffer.from(JSON.stringify({ id: 'cmd-1', name: 'test', payload: {} })),
      );

      // ACK not sent yet (delay is 2 seconds)
      const acksBefore = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/command/ack'),
      ).length;
      expect(acksBefore).toBe(0);

      // After delay
      await vi.advanceTimersByTimeAsync(2000);
      const acksAfter = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/command/ack'),
      );
      expect(acksAfter.length).toBe(1);
      const ackPayload = JSON.parse(acksAfter[0][1]);
      expect(ackPayload.id).toBe('cmd-1');
      expect(ackPayload.status).toBe('ACKNOWLEDGED');
    });

    it('auto-fails commands in auto-fail mode', async () => {
      service.addConfig(createTestConfig({ commandAckMode: 'auto-fail', commandAckDelaySec: 1 }));
      await service.startDevice('test-config-1');

      messageCallback?.(
        'minis/user1/dev-emu-1/command',
        Buffer.from(JSON.stringify({ id: 'cmd-1', name: 'test', payload: {} })),
      );

      await vi.advanceTimersByTimeAsync(1000);
      const acks = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/command/ack'),
      );
      expect(acks.length).toBe(1);
      const ackPayload = JSON.parse(acks[0][1]);
      expect(ackPayload.status).toBe('FAILED');
      expect(ackPayload.reason).toBe('Emulator auto-fail');
    });

    it('queues commands for manual ACK', async () => {
      service.addConfig(createTestConfig({ commandAckMode: 'manual' }));
      await service.startDevice('test-config-1');

      messageCallback?.(
        'minis/user1/dev-emu-1/command',
        Buffer.from(JSON.stringify({ id: 'cmd-1', name: 'test', payload: { pin: 5 } })),
      );

      const state = service.getState('test-config-1');
      expect(state.pendingCommands).toHaveLength(1);
      expect(state.pendingCommands[0].name).toBe('test');
      expect(state.pendingCommands[0].acked).toBe(false);

      // Manual ACK
      service.ackCommand('test-config-1', 'cmd-1', 'ACKNOWLEDGED');
      const acks = mockPublish.mock.calls.filter((c: string[]) =>
        c[0].includes('/command/ack'),
      );
      expect(acks.length).toBe(1);
    });
  });

  describe('activity log', () => {
    it('records sent messages', async () => {
      service.addConfig(createTestConfig());
      await service.startDevice('test-config-1');

      const log = service.getActivityLog();
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].direction).toBe('sent');
    });

    it('records received messages', async () => {
      service.addConfig(createTestConfig());
      await service.startDevice('test-config-1');

      messageCallback?.(
        'minis/user1/dev-emu-1/command',
        Buffer.from(JSON.stringify({ id: 'cmd-1', name: 'test', payload: {} })),
      );

      const receivedEntries = service.getActivityLog().filter((e) => e.direction === 'received');
      expect(receivedEntries.length).toBe(1);
      expect(receivedEntries[0].type).toBe('command');
    });

    it('clears the log', async () => {
      service.addConfig(createTestConfig());
      await service.startDevice('test-config-1');

      expect(service.getActivityLog().length).toBeGreaterThan(0);
      service.clearLog();
      expect(service.getActivityLog().length).toBe(0);
    });
  });

  describe('event system', () => {
    it('emits configsChanged when configs are modified', () => {
      const handler = vi.fn();
      service.on(handler);

      service.addConfig(createTestConfig());
      expect(handler).toHaveBeenCalledWith('configsChanged');
    });

    it('emits stateChange when device starts/stops', async () => {
      const handler = vi.fn();
      service.addConfig(createTestConfig());
      service.on(handler);
      handler.mockClear();

      await service.startDevice('test-config-1');
      expect(handler).toHaveBeenCalledWith('stateChange');

      handler.mockClear();
      service.stopDevice('test-config-1');
      expect(handler).toHaveBeenCalledWith('stateChange');
    });

    it('removes listener with off()', () => {
      const handler = vi.fn();
      service.on(handler);
      service.off(handler);
      service.addConfig(createTestConfig());
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
