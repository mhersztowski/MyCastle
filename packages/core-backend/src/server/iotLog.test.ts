/**
 * Testy `iot_log_*` — komunikatów logu publikowanych na kanale `/server/cmd`
 * jako pakiet `{ type: 'log', … }`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ServerLogic, SERVER_CMD_TOPIC, type MqttBus, type IotLogPacket } from './logic';
import { attachServerMqtt } from './mqtt';

class FakeBus implements MqttBus {
  published: { topic: string; payload: string }[] = [];
  private handlers: ((topic: string, payload: string) => void)[] = [];
  onMessage(handler: (topic: string, payload: string) => void): void { this.handlers.push(handler); }
  publishMessage(topic: string, payload: string): void { this.published.push({ topic, payload }); }
  inject(topic: string, payload: string): void { for (const h of this.handlers) h(topic, payload); }
  /** Ostatni pakiet logu wystawiony na kanale komend. */
  lastLog(): IotLogPacket | null {
    for (let i = this.published.length - 1; i >= 0; i--) {
      if (this.published[i].topic !== SERVER_CMD_TOPIC) continue;
      const parsed = JSON.parse(this.published[i].payload);
      if (parsed.type === 'log') return parsed as IotLogPacket;
    }
    return null;
  }
}

describe('iot_log', () => {
  let logic: ServerLogic;
  let bus: FakeBus;

  beforeEach(() => {
    logic = new ServerLogic(process.cwd());
    bus = new FakeBus();
    attachServerMqtt(logic, bus);
  });

  it('publikuje pakiet `log` na kanale komend', async () => {
    await logic.dispatch('iot_log', { level: 'info', message: 'start usługi' }, { owner: 'marcin', clientId: 'c1' });

    const packet = bus.lastLog();
    expect(packet).toMatchObject({
      type: 'log',
      level: 'info',
      message: 'start usługi',
      userName: 'marcin',
      clientId: 'c1',
    });
    expect(Date.parse(packet!.ts)).not.toBeNaN();
  });

  it('normalizuje poziom (warn → warning) i odrzuca nieznane', async () => {
    await logic.dispatch('iot_log', { level: 'warn', message: 'uwaga' }, { owner: 'marcin' });
    expect(bus.lastLog()?.level).toBe('warning');

    await expect(logic.dispatch('iot_log', { level: 'debug', message: 'x' }, { owner: 'marcin' }))
      .rejects.toThrow(/poziom/i);
  });

  it('wymaga treści komunikatu', async () => {
    await expect(logic.dispatch('iot_log', { level: 'error', message: '' }, { owner: 'marcin' }))
      .rejects.toThrow(/message/);
  });

  it('pakiet logu nie jest traktowany jak komenda (brak pętli zwrotnej)', () => {
    // Serwer nasłuchuje tego samego topiku — pakiet bez `id`/`op` musi być zignorowany.
    bus.inject(SERVER_CMD_TOPIC, JSON.stringify({ type: 'log', level: 'info', message: 'echo' }));
    expect(bus.published).toHaveLength(0);
  });

  it('zgłasza brak kanału MQTT', async () => {
    const solo = new ServerLogic(process.cwd());
    await expect(solo.dispatch('iot_log', { level: 'info', message: 'x' }, { owner: 'marcin' }))
      .rejects.toThrow(/MQTT/);
  });
});
