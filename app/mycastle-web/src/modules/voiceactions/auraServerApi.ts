/**
 * auraServerApi.ts — fasada API backendu dla skryptów akcji głosowych (Aura).
 *
 * Bloczki „Serwer" i skrypty Automate wołają `Server.*` zamiast surowych funkcji
 * z `packages/core/browser/server/api.ts`. Powód: tamte przyjmują `Conn` jako
 * pierwszy argument, a w bloczkach nie ma sensownego miejsca na trzymanie
 * połączenia. Tutaj połączenie zestawiane jest leniwie (przy pierwszym użyciu),
 * raz, z poświadczeniami zalogowanego użytkownika.
 *
 * Ścieżki plików podaje się względem katalogu użytkownika (`drive/notatki.md`),
 * bo tak myśli autor akcji; ścieżka zaczynająca się od `/` jest traktowana jako
 * bezwzględna względem katalogu `data` backendu.
 */

import { getMqttUrl } from '@mhersztowski/web-client';
import {
  conn_mqtt_connect,
  conn_mqtt_disconnect,
  conn_path_user,
  file_read_string,
  file_write_string,
  http_request,
  iot_log_info,
  iot_log_warnning,
  iot_log_error,
  iot_get_devices,
  iot_device_command,
  iot_device_telemetry,
  mail_send,
  mail_inbox,
  git_commit,
  git_pull,
  git_push,
  type Conn,
  type HttpRequestOptions,
  type HttpResponse,
} from '../../../../../packages/core/browser/server/api';

/** Kto wykonuje operacje — dostarcza strona (nazwa użytkownika + JWT z sesji). */
export interface AuraServerIdentity {
  userName: string;
  token: string;
}

export interface AuraServer {
  /** Odczyt pliku jako tekst (ścieżka względem katalogu użytkownika). */
  fileRead(path: unknown): Promise<string>;
  /** Zapis pliku (nadpisuje). */
  fileWrite(path: unknown, data: unknown): Promise<void>;
  /** Żądanie HTTP wykonane przez backend — bez ograniczeń CORS przeglądarki. */
  httpRequest(url: unknown, options?: HttpRequestOptions): Promise<HttpResponse>;
  /** Jak `httpRequest`, ale zwraca samo ciało odpowiedzi. */
  httpJson(url: unknown, options?: HttpRequestOptions): Promise<unknown>;
  logInfo(message: unknown): Promise<void>;
  logWarning(message: unknown): Promise<void>;
  logError(message: unknown): Promise<void>;
  /** Lista urządzeń IoT użytkownika. */
  iotDevices(): Promise<unknown>;
  /** Komenda do urządzenia; czeka na potwierdzenie. */
  iotCommand(device: unknown, command: unknown, params?: Record<string, unknown>): Promise<unknown>;
  /** Ostatnia wartość metryki telemetrycznej. */
  iotTelemetry(device: unknown, key: unknown): Promise<unknown>;
  mailSend(to: unknown, topic: unknown, content: unknown): Promise<unknown>;
  mailInbox(limit?: number): Promise<unknown>;
  gitCommit(path: unknown, message: unknown): Promise<unknown>;
  gitPull(path: unknown): Promise<unknown>;
  gitPush(path: unknown): Promise<unknown>;
  /** Zamyka połączenie (strona woła to przy odmontowaniu). */
  dispose(): void;
}

const asText = (v: unknown): string => String(v ?? '');

/**
 * Buduje fasadę. `getIdentity` jest funkcją, a nie wartością, bo token bywa
 * odświeżany — połączenie zestawiamy dopiero w chwili pierwszej operacji.
 */
export function createAuraServer(getIdentity: () => AuraServerIdentity): AuraServer {
  let connPromise: Promise<Conn> | null = null;

  const connect = (): Promise<Conn> => {
    if (connPromise) return connPromise;
    const { userName, token } = getIdentity();
    if (!userName || !token) {
      // Bez tokenu broker odrzuci połączenie — lepiej powiedzieć to wprost,
      // niż zostawić skrypt z „timeout połączenia MQTT".
      return Promise.reject(new Error('Server: brak zalogowanego użytkownika (potrzebny token sesji)'));
    }
    connPromise = conn_mqtt_connect(getMqttUrl(), userName, token).catch((err) => {
      connPromise = null;   // pozwól spróbować ponownie przy kolejnym wywołaniu
      throw err;
    });
    return connPromise;
  };

  /** `drive/x` → `Minis/Users/{user}/drive/x`; `/a/b` → `a/b` (od katalogu data). */
  const resolvePath = (conn: Conn, path: unknown): string => {
    const raw = asText(path).trim();
    if (raw.startsWith('/')) return raw.replace(/^\/+/, '');
    return `${conn_path_user(conn)}/${raw}`;
  };

  const server: AuraServer = {
    async fileRead(path) {
      const conn = await connect();
      return await file_read_string(conn, resolvePath(conn, path));
    },
    async fileWrite(path, data) {
      const conn = await connect();
      await file_write_string(conn, resolvePath(conn, path), asText(data));
    },
    async httpRequest(url, options) {
      const conn = await connect();
      return await http_request(conn, asText(url), options ?? {});
    },
    async httpJson(url, options) {
      const res = await server.httpRequest(url, options);
      return res.body;
    },
    async logInfo(message) {
      await iot_log_info(await connect(), asText(message));
    },
    async logWarning(message) {
      await iot_log_warnning(await connect(), asText(message));
    },
    async logError(message) {
      await iot_log_error(await connect(), asText(message));
    },
    async iotDevices() {
      return await iot_get_devices(await connect());
    },
    async iotCommand(device, command, params = {}) {
      return await iot_device_command(await connect(), asText(device), asText(command), params);
    },
    async iotTelemetry(device, key) {
      return await iot_device_telemetry(await connect(), asText(device), asText(key));
    },
    async mailSend(to, topic, content) {
      const conn = await connect();
      return await mail_send(conn, {
        from: '',
        to: asText(to).split(',').map((t) => t.trim()).filter(Boolean),
        topic: asText(topic),
        content: asText(content),
      });
    },
    async mailInbox(limit = 10) {
      return await mail_inbox(await connect(), Number(limit) || 10);
    },
    async gitCommit(path, message) {
      const conn = await connect();
      return await git_commit(conn, resolvePath(conn, path), asText(message));
    },
    async gitPull(path) {
      const conn = await connect();
      return await git_pull(conn, resolvePath(conn, path));
    },
    async gitPush(path) {
      const conn = await connect();
      return await git_push(conn, resolvePath(conn, path));
    },
    dispose() {
      const pending = connPromise;
      connPromise = null;
      // Rozłączamy dopiero po zestawieniu — inaczej zostawilibyśmy wiszące gniazdo.
      void pending?.then((conn) => conn_mqtt_disconnect(conn)).catch(() => {});
    },
  };

  return server;
}
