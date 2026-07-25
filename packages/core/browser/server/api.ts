/**
 * browser/server/api.ts — fasada API backendu dla sandboxa skryptów TS w Drive
 * (przeglądarka). Importowana wprost przez skrypt użytkownika.
 *
 * Odpowiednik `packages/core-backend/src/api.ts`, ale dla przeglądarki: używa
 * `fetch` (HTTP) oraz `mqtt` (WebSocket). Mówi tym samym protokołem komend, który
 * realizuje backend (`packages/core-backend/src/server/*`):
 *   • MQTT — komenda `{ id, clientId, op, args }` na `/server/cmd`,
 *            odpowiedź `{ id, ok, result?, error? }` na `/client/{MqttClientId}`,
 *   • HTTP — `POST /api/server/cmd` z ciałem `{ op, args }`.
 *
 * `server_filename` to ścieżka RELATYWNA do katalogu `data` backendu.
 */

import mqtt, { type MqttClient } from 'mqtt';

const TOPIC_CMD = '/server/cmd';
function topicCmdRes(clientId: string): string {
  return `/client/${clientId}`;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 12_000;

// ── Modele danych ────────────────────────────────────────────────────────────

export enum ConnType {
  Http = 'http',
  Mqtt = 'mqtt',
}

export class Auth {
  Username: string;
  Password: string;
  constructor(username = '', password = '') {
    this.Username = username;
    this.Password = password;
  }
}

export class Person {
  Id: string;
  constructor(id = '') {
    this.Id = id;
  }
}

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

export class AiChat {
  Id: string;
  Model: string;
  constructor(id = '', model = '') {
    this.Id = id;
    this.Model = model;
  }
}

export interface GitResult {
  ok: boolean;
  output: string;
}
export interface GitDiffResult {
  ok: boolean;
  diff: string;
}
export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

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

// ── Conn ─────────────────────────────────────────────────────────────────────

export class Conn {
  Type: ConnType;

  HttpUrl = '';
  HttpUsername = '';
  HttpPassword = '';

  MqttUrl = '';
  MqttUsername = '';
  MqttPassword = '';
  MqttClientId = '';

  userName = '';
  token = '';

  /** @internal */ _mqtt: MqttClient | null = null;
  /** @internal */ _pending = new Map<string, PendingRequest>();
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
      /* ignore */
    }
  }
}

function randomId(): string {
  // Sandbox przeglądarki ma crypto.randomUUID; fallback dla starszych środowisk.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `id_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

// ── Kanał komend ─────────────────────────────────────────────────────────────

export function conn_mqtt_topic_cmd(): string {
  return TOPIC_CMD;
}

export function conn_mqtt_topic_cmd_res(conn: Conn): string {
  return topicCmdRes(conn.MqttClientId);
}

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

async function sendCommand(
  conn: Conn,
  op: string,
  args: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  if (conn.Type === ConnType.Mqtt) {
    if (!conn._mqtt) throw new Error('Conn nie jest aktywnym połączeniem MQTT');
    const id = randomId();
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        conn._pending.delete(id);
        reject(new Error(`Timeout komendy MQTT (${op})`));
      }, timeoutMs);
      conn._pending.set(id, { resolve, reject, timer });

      const command = { id, clientId: conn.MqttClientId, op, args };
      conn._mqtt!.publish(TOPIC_CMD, JSON.stringify(command), { qos: 1 });
    });
  }

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
  if (!res.ok || !body.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    emitError(conn, err);
    throw err;
  }
  return body.result;
}

// ── Połączenia ───────────────────────────────────────────────────────────────

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
  conn.MqttClientId = clientId || `mycastle_web_${randomId()}`;
  conn.userName = username;

  const client = mqtt.connect(url, {
    clientId: conn.MqttClientId,
    username: username || undefined,
    password: password || undefined,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
  });
  conn._mqtt = client;

  client.on('message', (topic: string, payload: Uint8Array) => {
    if (topic === topicCmdRes(conn.MqttClientId)) {
      handleMqttResponse(conn, new TextDecoder().decode(payload));
    }
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

export function conn_http_disconnect(conn: Conn): void {
  conn.token = '';
}

// ── Callbacki i ścieżki ──────────────────────────────────────────────────────

export function conn_on_error(conn: Conn, callback: ErrCallback): void {
  conn._errCallbacks.push(callback);
}

export function conn_on_res(conn: Conn, callback: ResCallback): void {
  conn._resCallbacks.push(callback);
}

export function conn_path_user(conn: Conn): string {
  if (!conn.userName) throw new Error('Conn nie ma ustawionej nazwy użytkownika (userName)');
  return `Minis/Users/${conn.userName}`;
}

// ── Pliki ────────────────────────────────────────────────────────────────────

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

// ── Git ──────────────────────────────────────────────────────────────────────

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
