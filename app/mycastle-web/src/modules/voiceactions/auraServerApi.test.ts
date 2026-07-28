/**
 * Testy fasady `Server` udostępnianej skryptom akcji głosowych.
 *
 * Wartość tej warstwy: bloczki i skrypty wołają operacje backendu bez pamiętania
 * o połączeniu, poświadczeniach ani o tym, że ścieżki są relatywne do katalogu
 * `data`. Tutaj sprawdzamy właśnie te tłumaczenia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock jest hoistowane ponad zwykłe deklaracje — pomocniki muszą powstać
// w vi.hoisted, inaczej fabryka mocka nie ma do czego sięgnąć.
const { calls, record } = vi.hoisted(() => {
  const calls: { op: string; args: unknown[] }[] = [];
  return {
    calls,
    record: (op: string) => (...args: unknown[]) => {
      calls.push({ op, args });
      return Promise.resolve(`${op}-ok`);
    },
  };
});

vi.mock('../../../../../packages/core/browser/server/api', () => ({
  ConnType: { Http: 'http', Mqtt: 'mqtt' },
  conn_mqtt_connect: vi.fn(async (url: string, user: string, pass: string) => ({
    Type: 'mqtt', MqttUrl: url, userName: user, token: pass,
  })),
  conn_mqtt_disconnect: vi.fn(),
  conn_path_user: (conn: { userName: string }) => `Minis/Users/${conn.userName}`,
  file_read_string: vi.fn(record('file_read_string')),
  file_write_string: vi.fn(record('file_write_string')),
  http_request: vi.fn(record('http_request')),
  iot_log_info: vi.fn(record('iot_log_info')),
  iot_log_warnning: vi.fn(record('iot_log_warnning')),
  iot_log_error: vi.fn(record('iot_log_error')),
  iot_get_devices: vi.fn(record('iot_get_devices')),
  iot_device_command: vi.fn(record('iot_device_command')),
  iot_device_telemetry: vi.fn(record('iot_device_telemetry')),
  mail_send: vi.fn(record('mail_send')),
  mail_inbox: vi.fn(record('mail_inbox')),
  git_commit: vi.fn(record('git_commit')),
  git_pull: vi.fn(record('git_pull')),
  git_push: vi.fn(record('git_push')),
}));

vi.mock('@mhersztowski/web-client', () => ({ getMqttUrl: () => 'ws://test/mqtt' }));

import { createAuraServer } from './auraServerApi';
import { conn_mqtt_connect } from '../../../../../packages/core/browser/server/api';

const identity = { userName: 'marcin', token: 'jwt.tok.en' };

describe('Server (fasada backendu dla akcji Aury)', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(conn_mqtt_connect).mockClear();
  });

  it('łączy się dopiero przy pierwszym użyciu i tylko raz', async () => {
    const server = createAuraServer(() => identity);
    expect(conn_mqtt_connect).not.toHaveBeenCalled();

    await server.fileRead('notes/a.txt');
    await server.fileRead('notes/b.txt');

    expect(conn_mqtt_connect).toHaveBeenCalledTimes(1);
    expect(conn_mqtt_connect).toHaveBeenCalledWith('ws://test/mqtt', 'marcin', 'jwt.tok.en');
  });

  it('ścieżki liczy względem katalogu użytkownika', async () => {
    const server = createAuraServer(() => identity);
    await server.fileRead('drive/notatka.md');
    await server.fileWrite('drive/notatka.md', 'treść');

    expect(calls[0].args[1]).toBe('Minis/Users/marcin/drive/notatka.md');
    expect(calls[1].args[1]).toBe('Minis/Users/marcin/drive/notatka.md');
    expect(calls[1].args[2]).toBe('treść');
  });

  it('ścieżkę bezwzględną (od katalogu data) zostawia bez zmian', async () => {
    const server = createAuraServer(() => identity);
    await server.fileRead('/Minis/Users/ktos/plik.txt');
    expect(calls[0].args[1]).toBe('Minis/Users/ktos/plik.txt');
  });

  it('przekazuje operacje IoT i log', async () => {
    const server = createAuraServer(() => identity);
    await server.iotDevices();
    await server.iotCommand('lampa', 'on', { level: 5 });
    await server.logInfo('start');
    await server.logError('padło');

    expect(calls.map((c) => c.op)).toEqual([
      'iot_get_devices', 'iot_device_command', 'iot_log_info', 'iot_log_error',
    ]);
    expect(calls[1].args.slice(1)).toEqual(['lampa', 'on', { level: 5 }]);
  });

  it('httpRequest oddaje samo ciało, gdy poproszono o dane', async () => {
    const { http_request } = await import('../../../../../packages/core/browser/server/api');
    vi.mocked(http_request).mockResolvedValueOnce({
      status: 200, ok: true, headers: {}, body: { a: 1 }, encoding: 'json',
    });
    const server = createAuraServer(() => identity);
    await expect(server.httpJson('https://example.test')).resolves.toEqual({ a: 1 });
  });

  it('bez zalogowanego użytkownika zgłasza czytelny błąd', async () => {
    const server = createAuraServer(() => ({ userName: '', token: '' }));
    await expect(server.fileRead('x')).rejects.toThrow(/zalogow/i);
  });
});
