import type { IotDeviceStatus } from '@mhersztowski/core';
import { EventEmitter } from 'events';

interface DeviceState {
  status: IotDeviceStatus;
  lastSeenAt: number;
  heartbeatIntervalSec: number;
}

export interface DeviceStatusChange {
  deviceId: string;
  userId: string;
  status: IotDeviceStatus;
  lastSeenAt: number;
}

export class DevicePresence extends EventEmitter {
  private devices = new Map<string, DeviceState>();
  private userMap = new Map<string, string>(); // deviceId → userId
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private offlineMultiplier: number;

  constructor(offlineMultiplier: number = 2.5) {
    super();
    this.offlineMultiplier = offlineMultiplier;
  }

  start(checkIntervalMs: number = 15_000): void {
    this.checkInterval = setInterval(() => this.checkAll(), checkIntervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  recordHeartbeat(deviceId: string, userId: string, heartbeatIntervalSec: number = 60): void {
    const now = Date.now();
    const prev = this.devices.get(deviceId);
    this.userMap.set(deviceId, userId);

    this.devices.set(deviceId, {
      status: 'ONLINE',
      lastSeenAt: now,
      heartbeatIntervalSec,
    });

    if (!prev || prev.status !== 'ONLINE') {
      this.emit('statusChange', {
        deviceId,
        userId,
        status: 'ONLINE',
        lastSeenAt: now,
      } satisfies DeviceStatusChange);
    }
  }

  getStatus(deviceId: string): IotDeviceStatus {
    return this.devices.get(deviceId)?.status ?? 'UNKNOWN';
  }

  getLastSeen(deviceId: string): number | null {
    return this.devices.get(deviceId)?.lastSeenAt ?? null;
  }

  getAllStatuses(): Map<string, { status: IotDeviceStatus; lastSeenAt: number }> {
    const result = new Map<string, { status: IotDeviceStatus; lastSeenAt: number }>();
    for (const [id, state] of this.devices) {
      result.set(id, { status: state.status, lastSeenAt: state.lastSeenAt });
    }
    return result;
  }

  private checkAll(): void {
    const now = Date.now();
    for (const [deviceId, state] of this.devices) {
      if (state.status !== 'ONLINE') continue;
      const timeoutMs = state.heartbeatIntervalSec * 1000 * this.offlineMultiplier;
      if (now - state.lastSeenAt > timeoutMs) {
        state.status = 'OFFLINE';
        const userId = this.userMap.get(deviceId) ?? '';
        this.emit('statusChange', {
          deviceId,
          userId,
          status: 'OFFLINE',
          lastSeenAt: state.lastSeenAt,
        } satisfies DeviceStatusChange);
      }
    }
  }
}
