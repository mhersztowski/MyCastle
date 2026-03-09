import type { RpcRouter } from '@mhersztowski/core-backend';
import type { IotService } from '../iot/IotService.js';
import type { FileSystem } from '@mhersztowski/core-backend';

export interface RpcDeps {
  iotService?: IotService;
  fileSystem?: FileSystem;
}

export function registerHandlers(router: RpcRouter, deps?: RpcDeps): void {
  const iot = deps?.iotService;

  router.register('ping', async (input) => {
    return {
      pong: true as const,
      echo: input.echo,
      timestamp: Date.now(),
      version: '1.0.0',
    };
  });

  router.register('getDeviceStatuses', async (_input) => {
    if (!iot) throw new Error('IoT service not available');
    const statuses = iot.presence.getAllStatuses();
    const items: Array<{ deviceId: string; status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'; lastSeenAt: number }> = [];
    for (const [deviceId, info] of statuses) {
      items.push({ deviceId, status: info.status as 'ONLINE' | 'OFFLINE' | 'UNKNOWN', lastSeenAt: info.lastSeenAt });
    }
    return { items };
  });

  router.register('sendCommand', async (input) => {
    if (!iot) throw new Error('IoT service not available');
    const command = iot.sendCommand(input.deviceName, input.commandName, input.payload ?? {});
    return command;
  });

  router.register('getLatestTelemetry', async (input) => {
    if (!iot) throw new Error('IoT service not available');
    const record = iot.telemetry.getLatest(input.deviceName);
    return record ?? null;
  });
}
