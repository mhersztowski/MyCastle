/**
 * Testy `server_get_config()` — konfiguracji, którą backend wstrzykuje
 * skryptom Drive (adresy + tożsamość właściciela skryptu).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { server_get_config, SCRIPT_ENV } from '../api';

const KEYS = Object.values(SCRIPT_ENV);
const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

describe('server_get_config', () => {
  it('czyta konfigurację wstrzykniętą przez runner Drive', () => {
    setEnv({
      [SCRIPT_ENV.url]: 'https://mycastle.hersztowski.org',
      [SCRIPT_ENV.mqttUrl]: 'wss://mycastle.hersztowski.org/mqtt',
      [SCRIPT_ENV.user]: 'marcin',
      [SCRIPT_ENV.token]: 'jwt.token.tutaj',
    });

    expect(server_get_config()).toEqual({
      username: 'marcin',
      token: 'jwt.token.tutaj',
      url: 'https://mycastle.hersztowski.org',
      mqtt_url: 'wss://mycastle.hersztowski.org/mqtt',
    });
  });

  it('wyprowadza adres MQTT z adresu HTTP, gdy nie podano go wprost', () => {
    setEnv({
      [SCRIPT_ENV.url]: 'https://serwer.example',
      [SCRIPT_ENV.mqttUrl]: undefined,
      [SCRIPT_ENV.user]: 'ala',
      [SCRIPT_ENV.token]: 'tok',
    });
    expect(server_get_config().mqtt_url).toBe('wss://serwer.example/mqtt');

    setEnv({ [SCRIPT_ENV.url]: 'http://localhost:1894' });
    expect(server_get_config().mqtt_url).toBe('ws://localhost:1894/mqtt');
  });

  it('poza runnerem wraca do localhost — skrypt da się odpalić ręcznie', () => {
    setEnv({
      [SCRIPT_ENV.url]: undefined,
      [SCRIPT_ENV.mqttUrl]: undefined,
      [SCRIPT_ENV.user]: undefined,
      [SCRIPT_ENV.token]: undefined,
      [SCRIPT_ENV.port]: undefined,
    });
    const cfg = server_get_config();
    expect(cfg.url).toBe('http://localhost:1894');
    expect(cfg.mqtt_url).toBe('ws://localhost:1894/mqtt');
    expect(cfg.username).toBe('');
    expect(cfg.token).toBe('');
  });

  it('respektuje port backendu, gdy adres nie jest podany', () => {
    setEnv({
      [SCRIPT_ENV.url]: undefined,
      [SCRIPT_ENV.mqttUrl]: undefined,
      [SCRIPT_ENV.port]: '2000',
    });
    expect(server_get_config().url).toBe('http://localhost:2000');
  });

  it('ucina końcowy ukośnik, żeby sklejanie ścieżek nie dawało `//`', () => {
    setEnv({ [SCRIPT_ENV.url]: 'https://serwer.example/', [SCRIPT_ENV.mqttUrl]: undefined });
    expect(server_get_config().url).toBe('https://serwer.example');
  });
});
