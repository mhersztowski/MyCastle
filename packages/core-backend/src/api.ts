/**
 * api.ts — fasada API dla skryptów backendowych (uruchamianych w katalogu
 * `server` na stronie Drive w app/mycastle-web; wykonywanych przez Node).
 *
 * Skrypt importuje te funkcje, łączy się z serwerem MyCastle (HTTP lub MQTT)
 * i wywołuje operacje na plikach/git. Obie ścieżki mówią tym samym protokołem
 * komend, realizowanym po stronie serwera w `packages/core-backend/src/server/*`:
 *   • MQTT — komenda `{ id, clientId, op, args }` na topiku `/server/cmd`,
 *            odpowiedź `{ id, ok, result?, error? }` na `/client/{MqttClientId}`,
 *   • HTTP — `POST /api/server/cmd` z ciałem `{ op, args }` → `{ ok, result?, error? }`.
 *
 * `server_filename` to ścieżka RELATYWNA do katalogu `data` backendu.
 *
 * Nazwy funkcji celowo w `snake_case` — to publiczna powierzchnia API skryptów.
 */

import { randomUUID } from 'node:crypto';
import mqtt, { type MqttClient as MqttJsClient } from 'mqtt';
import type { GitResult, GitDiffResult, GitCommit } from './server/logic';

export type { GitResult, GitDiffResult, GitCommit } from './server/logic';

// Topiki kanału komend (muszą zgadzać się z realizacją w server/logic.ts).
const TOPIC_CMD = '/server/cmd';
function topicCmdRes(clientId: string): string {
  return `/client/${clientId}`;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 12_000;

// ────────────────────────────────────────────────────────────────────────────
// Modele danych
// ────────────────────────────────────────────────────────────────────────────

export enum ConnType {
  Http = 'http',
  Mqtt = 'mqtt',
}

/** Poświadczenia logowania. */
export class Auth {
  Username: string;
  Password: string;
  constructor(username = '', password = '') {
    this.Username = username;
    this.Password = password;
  }
}

/** Osoba (PIM). Identyfikowana przez `Id` (string — jak `PersonModel.id`). */
export class Person {
  Id: string;
  constructor(id = '') {
    this.Id = id;
  }
}

/** Definicja modelu AI używanego przez agenta. */
export class AgentAiModel {
  Id: string;
  Company: string;
  ModelName: string;
  constructor(id = '', company = '', modelName = '') {
    this.Id = id;
    this.Company = company;
    this.ModelName = modelName;
  }
}

/** Sesja czatu AI powiązana z modelem. */
export class AiChat {
  Id: string;
  Model: string;
  constructor(id = '', model = '') {
    this.Id = id;
    this.Model = model;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Callbacki / stan wewnętrzny
// ────────────────────────────────────────────────────────────────────────────

/** Surowa odpowiedź serwera przekazywana do `conn_on_res`. */
export interface ConnResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type ResCallback = (res: ConnResponse) => void;
export type ErrCallback = (error: Error) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ────────────────────────────────────────────────────────────────────────────
// Conn
// ────────────────────────────────────────────────────────────────────────────

export class Conn {
  Type: ConnType;

  // Konfiguracja HTTP.
  HttpUrl = '';
  HttpUsername = '';
  HttpPassword = '';

  // Konfiguracja MQTT.
  MqttUrl = '';
  MqttUsername = '';
  MqttPassword = '';
  MqttClientId = '';

  /** Nazwa użytkownika (do budowy ścieżek — patrz `conn_path_user`). */
  userName = '';
  /** JWT uzyskany przy logowaniu HTTP. */
  token = '';

  /** @internal Klient mqtt.js — tylko dla `Type === Mqtt`. */
  _mqtt: MqttJsClient | null = null;
  /** @internal Korelacja żądań po `id`. */
  _pending = new Map<string, PendingRequest>();
  _resCallbacks: ResCallback[] = [];
  _errCallbacks: ErrCallback[] = [];

  constructor(type: ConnType) {
    this.Type = type;
  }
}

function emitError(conn: Conn, error: Error): void {
  for (const cb of conn._errCallbacks) {
    try {
      cb(error);
    } catch {
      /* callback nie może wywrócić przetwarzania */
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Kanał komend (transport-agnostyczny)
// ────────────────────────────────────────────────────────────────────────────

export function conn_mqtt_topic_cmd(): string {
  return TOPIC_CMD;
}

/**
 * Topik odpowiedzi. Rozszerzenie względem szkicu: przyjmuje `conn`, bo topik jest
 * per-klient (`/client/{MqttClientId}`).
 */
export function conn_mqtt_topic_cmd_res(conn: Conn): string {
  return topicCmdRes(conn.MqttClientId);
}

/** Rozdziela odpowiedź MQTT do właściwego oczekującego żądania. */
function handleMqttResponse(conn: Conn, raw: string): void {
  let res: ConnResponse;
  try {
    res = JSON.parse(raw) as ConnResponse;
  } catch {
    return;
  }

  for (const cb of conn._resCallbacks) {
    try {
      cb(res);
    } catch {
      /* ignore */
    }
  }

  const pending = res.id ? conn._pending.get(res.id) : undefined;
  if (!pending) return;
  clearTimeout(pending.timer);
  conn._pending.delete(res.id);
  if (res.ok) pending.resolve(res.result);
  else pending.reject(new Error(res.error || 'Błąd serwera'));
}

/** Wysyła komendę wybranym transportem i czeka na wynik. */
async function sendCommand(
  conn: Conn,
  op: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  if (conn.Type === ConnType.Mqtt) {
    if (!conn._mqtt) throw new Error('Conn nie jest aktywnym połączeniem MQTT');
    const id = randomUUID();
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        conn._pending.delete(id);
        reject(new Error(`Timeout komendy MQTT (${op})`));
      }, timeoutMs);
      conn._pending.set(id, { resolve, reject, timer });

      const command = { id, clientId: conn.MqttClientId, op, args };
      conn._mqtt!.publish(TOPIC_CMD, JSON.stringify(command), { qos: 1 }, (err) => {
        if (err) {
          clearTimeout(timer);
          conn._pending.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  // HTTP
  const res = await fetch(`${conn.HttpUrl}/api/server/cmd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(conn.token ? { Authorization: `Bearer ${conn.token}` } : {}),
    },
    body: JSON.stringify({ op, args }),
  });
  const text = await res.text();
  let body: ConnResponse;
  try {
    body = text ? (JSON.parse(text) as ConnResponse) : { id: '', ok: false, error: 'Pusta odpowiedź' };
  } catch {
    body = { id: '', ok: false, error: text };
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${body.error || text || res.statusText}`);
    emitError(conn, err);
    throw err;
  }
  if (!body.ok) {
    const err = new Error(body.error || 'Błąd serwera');
    emitError(conn, err);
    throw err;
  }
  return body.result;
}

// ────────────────────────────────────────────────────────────────────────────
// Połączenia
// ────────────────────────────────────────────────────────────────────────────

/** Łączy się przez MQTT (`ws://host:port/mqtt` lub `wss://…`). */
export async function conn_mqtt_connect(
  url: string,
  username = '',
  password = '',
  clientId = '',
): Promise<Conn> {
  const conn = new Conn(ConnType.Mqtt);
  conn.MqttUrl = url;
  conn.MqttUsername = username;
  conn.MqttPassword = password;
  conn.MqttClientId = clientId || `mycastle_script_${randomUUID()}`;
  conn.userName = username;

  const client = mqtt.connect(url, {
    clientId: conn.MqttClientId,
    username: username || undefined,
    password: password || undefined,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
  });
  conn._mqtt = client;

  client.on('message', (topic: string, payload: Buffer) => {
    if (topic === topicCmdRes(conn.MqttClientId)) handleMqttResponse(conn, payload.toString());
  });
  client.on('error', (err: unknown) => {
    emitError(conn, err instanceof Error ? err : new Error(String(err)));
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout połączenia MQTT: ${url}`)), CONNECT_TIMEOUT_MS);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    client.once('error', (err: unknown) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  await new Promise<void>((resolve, reject) => {
    client.subscribe(topicCmdRes(conn.MqttClientId), { qos: 1 }, (err) => (err ? reject(err) : resolve()));
  });

  return conn;
}

/** Zamyka połączenie MQTT i odrzuca oczekujące żądania. */
export function conn_mqtt_disconnect(conn: Conn): void {
  for (const pending of conn._pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Połączenie MQTT zostało zamknięte'));
  }
  conn._pending.clear();
  if (conn._mqtt) {
    conn._mqtt.end(true);
    conn._mqtt = null;
  }
}

/** Łączy się przez HTTP: loguje się (`POST /api/auth/login`) i zapamiętuje JWT. */
export async function conn_http_connect(url: string, username: string, password: string): Promise<Conn> {
  const conn = new Conn(ConnType.Http);
  conn.HttpUrl = url.replace(/\/+$/, '');
  conn.HttpUsername = username;
  conn.HttpPassword = password;
  conn.userName = username;

  const res = await fetch(`${conn.HttpUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: username, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Logowanie nie powiodło się (${res.status}): ${text || res.statusText}`);
  }
  const body = (await res.json()) as { token: string; user?: { name?: string } };
  conn.token = body.token;
  if (body.user?.name) conn.userName = body.user.name;
  return conn;
}

/** Kasuje token (kolejne żądania będą nieautoryzowane). */
export function conn_http_disconnect(conn: Conn): void {
  conn.token = '';
}

// ────────────────────────────────────────────────────────────────────────────
// Callbacki i ścieżki
// ────────────────────────────────────────────────────────────────────────────

/** Rejestruje callback błędu. Przyjmuje `conn`, by wspierać wiele połączeń. */
export function conn_on_error(conn: Conn, callback: ErrCallback): void {
  conn._errCallbacks.push(callback);
}

/** Rejestruje callback wywoływany dla każdej odpowiedzi (MQTT). */
export function conn_on_res(conn: Conn, callback: ResCallback): void {
  conn._resCallbacks.push(callback);
}

/** Katalog użytkownika w `data` (`Minis/Users/{userName}`) — baza do budowy ścieżek. */
export function conn_path_user(conn: Conn): string {
  if (!conn.userName) throw new Error('Conn nie ma ustawionej nazwy użytkownika (userName)');
  return `Minis/Users/${conn.userName}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Operacje na plikach (server_filename relatywny do `data`)
// ────────────────────────────────────────────────────────────────────────────

export async function file_read_string(conn: Conn, server_filename: string): Promise<string> {
  return (await sendCommand(conn, 'file_read_string', { filename: server_filename })) as string;
}

export async function file_write_string(
  conn: Conn,
  server_filename: string,
  data: string,
): Promise<void> {
  await sendCommand(conn, 'file_write_string', { filename: server_filename, data });
}

// ────────────────────────────────────────────────────────────────────────────
// Operacje git
// ────────────────────────────────────────────────────────────────────────────

export async function git_clone(conn: Conn, url: string, server_filename: string): Promise<GitResult> {
  return (await sendCommand(conn, 'git_clone', { url, filename: server_filename })) as GitResult;
}

export async function git_add_all(conn: Conn, server_filename: string): Promise<GitResult> {
  return (await sendCommand(conn, 'git_add_all', { filename: server_filename })) as GitResult;
}

export async function git_commit(
  conn: Conn,
  server_filename: string,
  comment: string,
): Promise<GitResult> {
  return (await sendCommand(conn, 'git_commit', { filename: server_filename, comment })) as GitResult;
}

export async function git_push(conn: Conn, server_filename: string): Promise<GitResult> {
  return (await sendCommand(conn, 'git_push', { filename: server_filename })) as GitResult;
}

export async function git_pull(conn: Conn, server_filename: string): Promise<GitResult> {
  return (await sendCommand(conn, 'git_pull', { filename: server_filename })) as GitResult;
}

/**
 * Commituje bieżące repo procesu backendu. Rozszerzenie względem szkicu:
 * przyjmuje `conn`, bo operacja jest realizowana po stronie serwera.
 */
export async function git_commit_current(conn: Conn): Promise<GitResult> {
  return (await sendCommand(conn, 'git_commit_current', {})) as GitResult;
}

export async function git_history(conn: Conn, server_filename: string): Promise<GitCommit[]> {
  return (await sendCommand(conn, 'git_history', { filename: server_filename })) as GitCommit[];
}

export async function git_diff(
  conn: Conn,
  server_filename: string,
  commit_from = '',
  commit_to = '',
): Promise<GitDiffResult> {
  return (await sendCommand(conn, 'git_diff', {
    filename: server_filename,
    commit_from,
    commit_to,
  })) as GitDiffResult;
}
