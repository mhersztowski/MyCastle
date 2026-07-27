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

export interface EmailSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}
export interface EmailAttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
}
export interface EmailMessage {
  uid: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html: string;
  attachments: EmailAttachmentMeta[];
}
export interface EmailSendResult {
  ok: boolean;
  messageId: string;
}
export interface EmailSendOptions {
  html?: string;
  cc?: string;
}
export interface Mail {
  from: string;
  to: string[];
  topic: string;
  content: string;
}
export interface ZipResult {
  ok: boolean;
  output: string;
}
export interface ProjectBuildResult {
  success: boolean;
  output: string;
  outputFiles?: string[];
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
  /** @internal Handlery endpointów HTTP (`http_add_endpoint`), po ścieżce. */
  _endpoints = new Map<string, HttpEndpointHandler>();

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

  // Tym samym kanałem serwer wypycha żądania do endpointów skryptu — te nie mają
  // odpowiednika w `_pending`, więc rozpoznajemy je po polu `event`.
  const push = res as unknown as { event?: string; request?: HttpEndpointRequest };
  if (push.event === 'http_endpoint_request' && push.request) {
    void dispatchEndpointRequest(conn, push.request);
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

// ── Email (konto z SecretsService użytkownika po stronie backendu) ────────────

export async function email_list(conn: Conn, mailbox = 'INBOX', limit = 20): Promise<EmailSummary[]> {
  return (await sendCommand(conn, 'email_list', { owner: conn.userName, mailbox, limit })) as EmailSummary[];
}

export async function email_read(conn: Conn, uid: string | number, mailbox = 'INBOX'): Promise<EmailMessage> {
  return (await sendCommand(conn, 'email_read', {
    owner: conn.userName,
    uid: String(uid),
    mailbox,
  })) as EmailMessage;
}

export async function email_send(
  conn: Conn,
  to: string,
  subject: string,
  body: string,
  opts: EmailSendOptions = {},
): Promise<EmailSendResult> {
  return (await sendCommand(conn, 'email_send', {
    owner: conn.userName,
    to,
    subject,
    body,
    html: opts.html,
    cc: opts.cc,
  })) as EmailSendResult;
}

// ── Mail ──────────────────────────────────────────────────────────────────────

export async function mail_send(conn: Conn, mail: Mail): Promise<EmailSendResult> {
  return (await sendCommand(conn, 'mail_send', { owner: conn.userName, mail })) as EmailSendResult;
}

export async function mail_inbox(conn: Conn, limit = 20): Promise<Mail[]> {
  return (await sendCommand(conn, 'mail_inbox', { owner: conn.userName, limit })) as Mail[];
}

export async function mail_outbox(conn: Conn, limit = 20): Promise<Mail[]> {
  return (await sendCommand(conn, 'mail_outbox', { owner: conn.userName, limit })) as Mail[];
}

// ── Zip ───────────────────────────────────────────────────────────────────────

export async function zip_pack(conn: Conn, input: string, output: string): Promise<ZipResult> {
  return (await sendCommand(conn, 'zip_pack', { input, output })) as ZipResult;
}

export async function zip_unpack(conn: Conn, input: string, output: string): Promise<ZipResult> {
  return (await sendCommand(conn, 'zip_unpack', { input, output })) as ZipResult;
}

export async function zip_update(conn: Conn, path: string, files: string[]): Promise<ZipResult> {
  return (await sendCommand(conn, 'zip_update', { path, files })) as ZipResult;
}

export async function zip_delete(conn: Conn, path: string, files: string[]): Promise<ZipResult> {
  return (await sendCommand(conn, 'zip_delete', { path, files })) as ZipResult;
}

// ── Projekty ──────────────────────────────────────────────────────────────────

export async function project_arduino_build(
  conn: Conn,
  projectId: string,
  sketch: string,
  fqbn: string,
): Promise<ProjectBuildResult> {
  return (await sendCommand(
    conn,
    'project_arduino_build',
    { owner: conn.userName, projectId, sketch, fqbn },
    600_000,
  )) as ProjectBuildResult;
}

export async function project_arduino_get_output(conn: Conn, projectId: string): Promise<string> {
  return (await sendCommand(conn, 'project_arduino_get_output', {
    owner: conn.userName,
    projectId,
  })) as string;
}

export async function project_picosdk_build(
  conn: Conn,
  projectId: string,
  sketch: string,
  boardKey = '',
): Promise<ProjectBuildResult> {
  return (await sendCommand(
    conn,
    'project_picosdk_build',
    { owner: conn.userName, projectId, sketch, boardKey },
    600_000,
  )) as ProjectBuildResult;
}

export async function project_picosdk_get_output(
  conn: Conn,
  projectId: string,
  sketch: string,
  boardKey = '',
): Promise<string> {
  return (await sendCommand(conn, 'project_picosdk_get_output', {
    owner: conn.userName,
    projectId,
    sketch,
    boardKey,
  })) as string;
}


// ── IoT ──────────────────────────────────────────────────────────────────────

/** Status komendy: `ACKNOWLEDGED`/`FAILED` z urządzenia, `TIMEOUT` gdy nie odpowiedziało. */
export type IotCommandStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMEOUT';

/** Wynik komendy — zwracany PO potwierdzeniu przez urządzenie (albo po timeoucie). */
export interface IotCommandResult {
  id: string;
  deviceId: string;
  name: string;
  payload: Record<string, unknown>;
  status: IotCommandStatus;
  createdAt: number;
  resolvedAt?: number;
  failureReason?: string;
}

/** Typ wpisu w systemie plików urządzenia: 1 = plik, 2 = katalog. */
export type IotVfsFileType = 1 | 2;

export interface IotVfsStat {
  type: IotVfsFileType;
  size: number;
  ctime: number;
  mtime: number;
}

export interface IotVfsEntry {
  name: string;
  type: IotVfsFileType;
}

/** Zawartość pliku zakodowana base64. */
export interface IotVfsFileData {
  data: string;
}

/** Potwierdzenie operacji zapisu/kasowania/zmiany nazwy. */
export interface IotVfsOk {
  ok: true;
}

/** Urządzenie IoT użytkownika. */
export interface IotDevice {
  deviceId: string;
  userId: string;
  status?: string;
  lastSeenAt?: number;
  /** Typy aktywnych rozszerzeń (`vfs`, `vkbd`, `vmouse`, …). */
  extensions?: string[];
}

/** Urządzenia IoT zalogowanego użytkownika. */
export async function iot_get_devices(conn: Conn): Promise<IotDevice[]> {
  return (await sendCommand(conn, 'iot_get_devices', { owner: conn.userName })) as IotDevice[];
}

/**
 * Wysyła komendę i **czeka na potwierdzenie urządzenia** (`command/ack`).
 * Po przekroczeniu czasu zwraca status `TIMEOUT` zamiast rzucać wyjątkiem.
 */
export async function iot_device_command(
  conn: Conn,
  device: string,
  command: string,
  params: Record<string, unknown> = {},
): Promise<IotCommandResult> {
  return (await sendCommand(conn, 'iot_device_command', {
    owner: conn.userName, device, command, params,
  })) as IotCommandResult;
}

/** Ostatnia wartość metryki telemetrycznej; `null`, gdy urządzenie jej nie przysłało. */
export async function iot_device_telemetry(
  conn: Conn,
  device: string,
  key: string,
): Promise<{ value: unknown; unit?: string } | null> {
  return (await sendCommand(conn, 'iot_device_telemetry', {
    owner: conn.userName, device, key,
  })) as { value: unknown; unit?: string } | null;
}

/**
 * Request-response do rozszerzenia urządzenia (`ext/{ext}/req` → `.../res`).
 * Czeka na odpowiedź urządzenia. Kształt wyniku zależy od rozszerzenia, więc
 * typ podaje wywołujący: `iot_device_ext_command<IotVfsStat>(…)`.
 */
export async function iot_device_ext_command<T = unknown>(
  conn: Conn,
  device: string,
  ext: string,
  command: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return (await sendCommand(conn, 'iot_device_ext_command', {
    owner: conn.userName, device, ext, command, params,
  })) as T;
}

// Skróty na rozszerzenie `vfs` — kształt odpowiedzi jak w protokole ext/vfs.

export async function iot_device_ext_vfs_stat(conn: Conn, device: string, path: string): Promise<IotVfsStat> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_stat', { owner: conn.userName, device, path })) as IotVfsStat;
}

export async function iot_device_ext_vfs_readdir(
  conn: Conn,
  device: string,
  path: string,
): Promise<{ entries: IotVfsEntry[] }> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_readdir', {
    owner: conn.userName, device, path,
  })) as { entries: IotVfsEntry[] };
}

/** Zwraca zawartość pliku zakodowaną base64 (`{ data }`). */
export async function iot_device_ext_vfs_readfile(
  conn: Conn,
  device: string,
  path: string,
): Promise<IotVfsFileData> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_readfile', {
    owner: conn.userName, device, path,
  })) as IotVfsFileData;
}

/** `data` to base64; `options` przyjmuje `{ create, overwrite }`. */
export async function iot_device_ext_vfs_writefile(
  conn: Conn,
  device: string,
  path: string,
  data: string,
  options: Record<string, unknown> = { create: true, overwrite: true },
): Promise<IotVfsOk> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_writefile', {
    owner: conn.userName, device, path, data, options,
  })) as IotVfsOk;
}

export async function iot_device_ext_vfs_delete(
  conn: Conn,
  device: string,
  path: string,
  options: Record<string, unknown> = {},
): Promise<IotVfsOk> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_delete', {
    owner: conn.userName, device, path, options,
  })) as IotVfsOk;
}

export async function iot_device_ext_vfs_rename(
  conn: Conn,
  device: string,
  path: string,
  newPath: string,
  options: Record<string, unknown> = {},
): Promise<IotVfsOk> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_rename', {
    owner: conn.userName, device, path, newPath, options,
  })) as IotVfsOk;
}

export async function iot_device_ext_vfs_mkdir(conn: Conn, device: string, path: string): Promise<IotVfsOk> {
  return (await sendCommand(conn, 'iot_device_ext_vfs_mkdir', { owner: conn.userName, device, path })) as IotVfsOk;
}

// ── Log (`iot_log_*`) ────────────────────────────────────────────────────────

/** Poziomy komunikatów (kontrakt z `core-backend/src/server/logic.ts`). */
export type IotLogLevel = 'info' | 'warning' | 'error';

/** Pakiet logu rozgłaszany na kanale komend. */
export interface IotLogPacket {
  type: 'log';
  level: IotLogLevel;
  message: string;
  userName: string;
  clientId?: string;
  source?: string;
  ts: string;
}

/**
 * Rozgłasza komunikat logu jako pakiet `{ type: 'log', … }` na kanale komend
 * (`/server/cmd`). Nad MQTT publikujemy wprost ze skryptu (log jest jednostronny),
 * przez HTTP robi to serwer komendą `iot_log`.
 */
async function iotLog(conn: Conn, level: IotLogLevel, message: string): Promise<void> {
  if (!message) throw new Error('iot_log: `message` nie może być puste');

  if (conn.Type === ConnType.Mqtt) {
    if (!conn._mqtt) throw new Error('Conn nie jest aktywnym połączeniem MQTT');
    const packet: IotLogPacket = {
      type: 'log',
      level,
      message,
      userName: conn.userName,
      clientId: conn.MqttClientId,
      ts: new Date().toISOString(),
    };
    conn._mqtt.publish(TOPIC_CMD, JSON.stringify(packet), { qos: 1 });
    return;
  }

  await sendCommand(conn, 'iot_log', { level, message, owner: conn.userName });
}

/** Log informacyjny. */
export async function iot_log_info(conn: Conn, msg: string): Promise<void> {
  await iotLog(conn, 'info', msg);
}

/** Ostrzeżenie. Nazwa zgodna z API opisanym w `docs/backend_api.md`. */
export async function iot_log_warnning(conn: Conn, msg: string): Promise<void> {
  await iotLog(conn, 'warning', msg);
}

/** Alias `iot_log_warnning` bez literówki. */
export const iot_log_warning = iot_log_warnning;

/** Błąd. */
export async function iot_log_error(conn: Conn, msg: string): Promise<void> {
  await iotLog(conn, 'error', msg);
}

// ── Wychodzące żądania HTTP ──────────────────────────────────────────────────

/** Jak zinterpretować ciało odpowiedzi (kontrakt z `core-backend/src/server/logic.ts`). */
export type HttpResponseType = 'text' | 'json' | 'base64';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Obiekt jest serializowany do JSON (z nagłówkiem), string idzie bez zmian. */
  body?: unknown;
  query?: Record<string, string>;
  /** Domyślnie 30 s. */
  timeoutMs?: number;
  responseType?: HttpResponseType;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
  encoding: HttpResponseType;
}

/**
 * Wykonuje żądanie HTTP PO STRONIE SERWERA i zwraca ujednoliconą odpowiedź.
 *
 *     const res = await http_request(conn, 'https://api.github.com/repos/x/y', {
 *       headers: { 'User-Agent': 'MyCastle' },
 *     });
 *     if (res.ok) console.log(res.body);
 *
 * Po co przez serwer, skoro w Node jest `fetch`: skrypt w przeglądarce nie
 * podlega wtedy CORS, a żądanie wychodzi z sieci backendu (usługi lokalne,
 * urządzenia w LAN). Status 4xx/5xx wraca w `status` — wyjątek jest zarezerwowany
 * dla braku odpowiedzi (timeout, błąd sieci).
 *
 * Ciało: obiekt → JSON (z nagłówkiem `Content-Type`), string → bez zmian.
 * Odpowiedź: JSON, tekst albo base64 dla binariów — patrz `encoding`; można
 * wymusić przez `responseType`.
 */
export async function http_request(
  conn: Conn,
  url: string,
  options: HttpRequestOptions = {},
): Promise<HttpResponse> {
  return (await sendCommand(conn, 'http_request', { url, options })) as HttpResponse;
}

// ── Endpointy HTTP wystawiane przez skrypt ───────────────────────────────────

/** Żądanie HTTP przekazane skryptowi (kontrakt z `core-backend/src/server/logic.ts`). */
export interface HttpEndpointRequest {
  requestId: string;
  path: string;
  method: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * Odpowiedź handlera: obiekt z którymkolwiek z pól `status`/`headers`/`body`
 * opisuje odpowiedź HTTP, każda inna wartość trafia wprost do ciała (status 200).
 */
export interface HttpEndpointReply {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type HttpEndpointHandler = (req: HttpEndpointRequest) => unknown | Promise<unknown>;

function normalizeReply(value: unknown): Required<HttpEndpointReply> {
  const isEnvelope =
    !!value && typeof value === 'object' && !Array.isArray(value)
    && ('status' in value || 'headers' in value || 'body' in value);
  const reply = (isEnvelope ? value : { body: value }) as HttpEndpointReply;
  return { status: reply.status ?? 200, headers: reply.headers ?? {}, body: reply.body };
}

/** Wywołuje handler i odsyła wynik; błąd handlera wraca do serwera jako 500. */
async function dispatchEndpointRequest(conn: Conn, request: HttpEndpointRequest): Promise<void> {
  const handler = conn._endpoints.get(request.path);
  const answer = async (args: Record<string, unknown>) => {
    try {
      await sendCommand(conn, 'http_endpoint_response', { requestId: request.requestId, ...args });
    } catch (err) {
      emitError(conn, err instanceof Error ? err : new Error(String(err)));
    }
  };

  if (!handler) {
    await answer({ error: `Skrypt nie obsługuje ścieżki ${request.path}` });
    return;
  }
  try {
    await answer(normalizeReply(await handler(request)) as unknown as Record<string, unknown>);
  } catch (err) {
    await answer({ error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Rejestruje endpoint HTTP obsługiwany przez ten skrypt. Żądanie na
 * `/api/server/ep/{path}` (z JWT właściciela) trafia do `callback`.
 *
 * `{ public: true }` znosi wymóg JWT — endpoint może wywołać każdy, kto zna
 * adres (webhooki usług zewnętrznych), dlatego ścieżka powinna być długa
 * i nieodgadywalna; serwer limituje tempo takich wywołań.
 *
 * Wymaga połączenia MQTT — po HTTP nie ma kanału zwrotnego. Rejestracja żyje
 * tak długo, jak połączenie skryptu.
 */
export async function http_add_endpoint(
  conn: Conn,
  path: string,
  callback: HttpEndpointHandler,
  opts: { public?: boolean } = {},
): Promise<{ path: string; public: boolean }> {
  if (conn.Type !== ConnType.Mqtt) {
    throw new Error('http_add_endpoint wymaga połączenia MQTT (kanał zwrotny do callbacku)');
  }
  const result = (await sendCommand(conn, 'http_add_endpoint', {
    path, owner: conn.userName, public: !!opts.public,
  })) as { path: string; public: boolean };
  conn._endpoints.set(result.path, callback);
  return result;
}

/** Usuwa endpoint zarejestrowany przez `http_add_endpoint`. */
export async function http_remove_endpoint(conn: Conn, path: string): Promise<{ path: string; removed: boolean }> {
  const result = (await sendCommand(conn, 'http_remove_endpoint', {
    path, owner: conn.userName,
  })) as { path: string; removed: boolean };
  conn._endpoints.delete(result.path);
  return result;
}

/** Ścieżki endpointów zarejestrowanych przez skrypty tego użytkownika. */
export async function http_list_endpoints(conn: Conn): Promise<string[]> {
  return (await sendCommand(conn, 'http_list_endpoints', { owner: conn.userName })) as string[];
}
