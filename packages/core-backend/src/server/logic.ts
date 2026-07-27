/**
 * server/logic.ts — klasy narzędziowe realizujące funkcjonalność API backendu.
 *
 * Tu żyje właściwa logika (operacje na plikach w katalogu `data`, operacje git,
 * integracje typu GitHub). Wykorzystywana przez transporty:
 *   • `server/http.ts`  — endpointy HTTP (`POST /api/server/cmd`),
 *   • `server/mqtt.ts`  — komendy MQTT (`/server/cmd` → `/client/{MqttClientId}`).
 *
 * `server_filename` to ścieżka RELATYWNA do katalogu `data`; wszystkie ścieżki są
 * ograniczane do tego katalogu (ochrona przed path traversal).
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import AdmZip from 'adm-zip';
import type { ArduinoService } from '../projects/arduino/ArduinoService';
import type { PicoSdkService } from '../projects/picosdk/PicoSdkService';

const execFileAsync = promisify(execFile);

// ── Protokół komend (wspólny dla HTTP i MQTT) ────────────────────────────────

/** Topik, na który klienci wysyłają komendy. */
export const SERVER_CMD_TOPIC = '/server/cmd';

/** Topik odpowiedzi dla danego klienta (`Conn.MqttClientId`). */
export function clientResTopic(clientId: string): string {
  return `/client/${clientId}`;
}

/** Koperta komendy (kanał MQTT). */
export interface ServerCommand {
  /** Id korelujące odpowiedź z żądaniem. */
  id: string;
  /** MqttClientId nadawcy — decyduje o topiku odpowiedzi. */
  clientId: string;
  /** Nazwa operacji (np. `file_read_string`, `git_clone`). */
  op: string;
  /** Argumenty operacji. */
  args?: Record<string, unknown>;
}

/** Koperta odpowiedzi. */
export interface ServerResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
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

/** Minimalny interfejs MqttServer potrzebny do podłączenia (unika cyklu importów). */
export interface MqttBus {
  onMessage(handler: (topic: string, payload: string) => void): void;
  publishMessage(topic: string, payload: string): void;
}

/** Kontekst wykonania komendy — `owner` to zweryfikowany użytkownik (JWT po HTTP). */
export interface DispatchContext {
  owner?: string;
}

/** Dostawca sekretów per-user (implementowany przez SecretsService aplikacji). */
export interface SecretsProvider {
  get(owner: string, pluginId: string, key: string): Promise<{ value: string } | null>;
}

// ── Email ────────────────────────────────────────────────────────────────────

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

/** Wiadomość email w prostym modelu (Class Mail z docs/backend_api.md). */
export interface Mail {
  from: string;
  to: string[];
  topic: string;
  content: string;
}

/** Wynik operacji zip; `output` = server_filename wyniku. */
export interface ZipResult {
  ok: boolean;
  output: string;
}

/** Wynik builda projektu (arduino/picosdk). */
export interface ProjectBuildResult {
  success: boolean;
  output: string;
  outputFiles?: string[];
}

/** Rozwiązane poświadczenia + hosty konta email. */
interface EmailCreds {
  user: string;
  pass: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/** Namespace sekretów dla konfiguracji email (Settings→Secrets, pluginId='email'). */
// Sekrety konfiguruje się w UI Drive → Settings → SEKRETY. Ten UI zapisuje je
// zawsze pod namespace `__credentials__` z kluczem `{typ}:{nazwa}` (typ ∈
// password/token/other). Czytamy więc po NAZWIE `email_*`, niezależnie od typu.
const CREDENTIALS_NS = '__credentials__';
const CREDENTIAL_TYPES = ['password', 'token', 'other'] as const;

const MAX_GIT_BUFFER = 32 * 1024 * 1024;

// ── Git — cienki wrapper na CLI (klasa narzędziowa) ──────────────────────────

/**
 * Operacje git przez zainstalowany `git`. Wyłącza interaktywne prompty o
 * poświadczenia, żeby operacje nie wisiały na CI/serwerze.
 */
export class GitTool {
  async run(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-c', 'credential.helper=', ...args], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: MAX_GIT_BUFFER,
    });
    return stdout;
  }
}

// ── Realizacja operacji API ──────────────────────────────────────────────────

/** Urządzenie IoT widziane przez API skryptów. */
export interface IotDeviceInfo {
  deviceId: string;
  userId: string;
  status?: string;
  lastSeenAt?: number;
  /** Typy aktywnych rozszerzeń (`vfs`, `vkbd`, `vmouse`, …). */
  extensions?: string[];
}

/**
 * Dostęp do warstwy IoT. Interfejs, nie implementacja — `IotService` żyje w
 * `app/mycastle-backend`, więc core-backend zna tylko kontrakt, a backend
 * wstrzykuje adapter (tak samo jak przy `secrets`/`arduino`/`picosdk`).
 */
/** Wynik komendy — dostępny dopiero po potwierdzeniu przez urządzenie. */
export interface IotCommandResult {
  id: string;
  deviceId: string;
  name: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMEOUT';
  createdAt: number;
  resolvedAt?: number;
  failureReason?: string;
}

export interface IotProvider {
  /** Urządzenia użytkownika wraz ze statusem obecności. */
  listDevices(userId: string): IotDeviceInfo[] | Promise<IotDeviceInfo[]>;
  /**
   * Wysyła komendę i czeka na potwierdzenie urządzenia (`command/ack`).
   * Brak odpowiedzi w limicie czasu → status `TIMEOUT`.
   */
  sendCommand(userId: string, deviceId: string, command: string, params: Record<string, unknown>): Promise<IotCommandResult>;
  /** Ostatnia wartość metryki telemetrycznej. */
  getTelemetry(userId: string, deviceId: string, key: string): Promise<{ value: unknown; unit?: string } | null>;
  /**
   * Request-response do rozszerzenia urządzenia (`ext/{ext}/req` → `.../res`).
   * Operacje VFS (`stat`, `readdir`, `readfile`, …) idą tą samą drogą.
   */
  extRequest(userId: string, deviceId: string, ext: string, op: string, params: Record<string, unknown>): Promise<unknown>;
}

export interface ServerLogicOptions {
  /** Dostawca sekretów per-user (wymagany dla operacji email). */
  secrets?: SecretsProvider;
  /** Serwis Arduino (wymagany dla project_arduino_*). */
  arduino?: ArduinoService | null;
  /** Serwis Pico SDK (wymagany dla project_picosdk_*). */
  picosdk?: PicoSdkService | null;
  /** Dostęp do urządzeń IoT (wymagany dla iot_*). */
  iot?: IotProvider | null;
}

export class ServerLogic {
  private readonly dataDir: string;
  private readonly git = new GitTool();
  private readonly secrets: SecretsProvider | null;
  private readonly arduino: ArduinoService | null;
  private readonly picosdk: PicoSdkService | null;
  private readonly iot: IotProvider | null;

  constructor(dataDir: string, opts: ServerLogicOptions = {}) {
    this.dataDir = path.resolve(dataDir);
    this.secrets = opts.secrets ?? null;
    this.arduino = opts.arduino ?? null;
    this.picosdk = opts.picosdk ?? null;
    this.iot = opts.iot ?? null;
  }

  /** Rozwiązuje `server_filename` do ścieżki bezwzględnej wewnątrz `data`. */
  private resolvePath(filename: string): string {
    const clean = String(filename ?? '').replace(/^[/\\]+/, '');
    const abs = path.resolve(this.dataDir, clean);
    if (abs !== this.dataDir && !abs.startsWith(this.dataDir + path.sep)) {
      throw new Error(`Odmowa dostępu: ścieżka poza katalogiem data (${filename})`);
    }
    return abs;
  }

  // ── Pliki ──

  async fileReadString(filename: string): Promise<string> {
    return await fs.readFile(this.resolvePath(filename), 'utf-8');
  }

  async fileWriteString(filename: string, data: string): Promise<void> {
    const abs = this.resolvePath(filename);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data, 'utf-8');
  }

  // ── Git ──

  /** Klonuje `url` do katalogu `filename` (relatywnego do `data`). */
  async gitClone(url: string, filename: string): Promise<GitResult> {
    const dir = this.resolvePath(filename);
    await fs.mkdir(path.dirname(dir), { recursive: true });
    const out = await this.git.run(path.dirname(dir), ['clone', url, path.basename(dir)]);
    return { ok: true, output: out.trim() };
  }

  /** `git add -A`. */
  async gitAddAll(filename: string): Promise<GitResult> {
    const out = await this.git.run(this.resolvePath(filename), ['add', '-A']);
    return { ok: true, output: out.trim() || 'staged' };
  }

  /** Commit z komentarzem (ustawia tożsamość, gdy brak globalnej konfiguracji). */
  async gitCommit(filename: string, comment: string): Promise<GitResult> {
    const out = await this.git.run(this.resolvePath(filename), [
      '-c', 'user.name=mycastle',
      '-c', 'user.email=server@mycastle.local',
      'commit', '-m', comment,
    ]);
    return { ok: true, output: out.trim() };
  }

  async gitPush(filename: string): Promise<GitResult> {
    const out = await this.git.run(this.resolvePath(filename), ['push']);
    return { ok: true, output: out.trim() };
  }

  async gitPull(filename: string): Promise<GitResult> {
    const out = await this.git.run(this.resolvePath(filename), ['pull']);
    return { ok: true, output: out.trim() };
  }

  /** Commit bieżącego repo, w którym pracuje proces backendu (cwd). */
  async gitCommitCurrent(): Promise<GitResult> {
    const cwd = process.cwd();
    await this.git.run(cwd, ['add', '-A']);
    const out = await this.git.run(cwd, [
      '-c', 'user.name=mycastle',
      '-c', 'user.email=server@mycastle.local',
      'commit', '-m', `checkpoint ${new Date().toISOString()}`,
    ]);
    return { ok: true, output: out.trim() };
  }

  /** Historia commitów (najnowsze pierwsze). */
  async gitHistory(filename: string): Promise<GitCommit[]> {
    // Separatory: \x1f między polami, \x1e między rekordami (bezpieczne w treści commita).
    const fmt = '%H%x1f%an%x1f%aI%x1f%s%x1e';
    const out = await this.git.run(this.resolvePath(filename), ['log', `--pretty=format:${fmt}`]);
    return out
      .split('\x1e')
      .map((rec) => rec.trim())
      .filter(Boolean)
      .map((rec) => {
        const [hash, author, date, message] = rec.split('\x1f');
        return { hash, author, date, message };
      });
  }

  /**
   * Unified diff. `commit_to` puste → `commit_from` vs working tree;
   * oba puste → working tree vs HEAD.
   */
  async gitDiff(filename: string, commit_from = '', commit_to = ''): Promise<GitDiffResult> {
    const args = ['diff', '--no-color'];
    if (commit_from && commit_to) args.push(`${commit_from}..${commit_to}`);
    else if (commit_from) args.push(commit_from);
    const out = await this.git.run(this.resolvePath(filename), args);
    return { ok: true, diff: out };
  }

  // ── Email (IMAP odczyt / SMTP wysyłka; poświadczenia z SecretsService) ──

  /**
   * Czyta sekret po NAZWIE z namespace `__credentials__`, próbując wszystkich
   * typów (password/token/other) — bo UI zapisuje klucz jako `{typ}:{nazwa}`.
   */
  private async cred(owner: string, name: string, def = ''): Promise<string> {
    if (!this.secrets) return def;
    for (const t of CREDENTIAL_TYPES) {
      const s = await this.secrets.get(owner, CREDENTIALS_NS, `${t}:${name}`);
      if (s?.value) return s.value;
    }
    return def;
  }

  /** Rozwiązuje poświadczenia konta email użytkownika z sekretów (`email_*`). */
  private async resolveEmailCreds(owner: string): Promise<EmailCreds> {
    if (!this.secrets) {
      throw new Error('SecretsService niedostępny — obsługa email nie jest skonfigurowana');
    }
    if (!owner) {
      throw new Error('Brak właściciela (owner) — nie wiadomo, czyjego konta email użyć');
    }

    const user = await this.cred(owner, 'email_user');
    const pass = await this.cred(owner, 'email_appPassword');
    if (!user || !pass) {
      throw new Error(
        `Konto email nieskonfigurowane dla '${owner}'. W Drive → Settings → SEKRETY dodaj: ` +
          `nazwa "email_user" = adres, nazwa "email_appPassword" = hasło aplikacji Google ` +
          `(App Password, wymaga 2FA). Typ dowolny.`,
      );
    }
    // Domyślne hosty Gmaila; dla innych providerów dodaj sekrety email_imapHost itd.
    return {
      user,
      pass,
      imapHost: await this.cred(owner, 'email_imapHost', 'imap.gmail.com'),
      imapPort: Number(await this.cred(owner, 'email_imapPort', '993')),
      smtpHost: await this.cred(owner, 'email_smtpHost', 'smtp.gmail.com'),
      smtpPort: Number(await this.cred(owner, 'email_smtpPort', '465')),
    };
  }

  /** Lista ostatnich wiadomości w skrzynce (najnowsze pierwsze). */
  async emailList(owner: string, mailbox = 'INBOX', limit = 20): Promise<EmailSummary[]> {
    const c = await this.resolveEmailCreds(owner);
    const client = new ImapFlow({
      host: c.imapHost,
      port: c.imapPort,
      secure: true,
      auth: { user: c.user, pass: c.pass },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const box = client.mailbox;
        const total = box && typeof box !== 'boolean' ? box.exists : 0;
        if (!total) return [];
        const start = Math.max(1, total - limit + 1);
        const out: EmailSummary[] = [];
        for await (const msg of client.fetch(`${start}:${total}`, {
          uid: true,
          envelope: true,
          flags: true,
        })) {
          out.push({
            uid: msg.uid,
            from: (msg.envelope?.from ?? []).map((a) => a.address ?? '').filter(Boolean).join(', '),
            subject: msg.envelope?.subject ?? '',
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : '',
            seen: msg.flags?.has('\\Seen') ?? false,
          });
        }
        return out.reverse();
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  /** Pełna treść wiadomości o danym UID (parsowana MIME). */
  async emailRead(owner: string, uid: string, mailbox = 'INBOX'): Promise<EmailMessage> {
    const c = await this.resolveEmailCreds(owner);
    const client = new ImapFlow({
      host: c.imapHost,
      port: c.imapPort,
      secure: true,
      auth: { user: c.user, pass: c.pass },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const msg = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
        if (!msg || !msg.source) throw new Error(`Nie znaleziono wiadomości uid=${uid}`);
        const parsed = await simpleParser(msg.source);
        return {
          uid,
          from: parsed.from?.text ?? '',
          to: Array.isArray(parsed.to) ? parsed.to.map((a) => a.text).join(', ') : parsed.to?.text ?? '',
          subject: parsed.subject ?? '',
          date: parsed.date ? parsed.date.toISOString() : '',
          text: parsed.text ?? '',
          html: typeof parsed.html === 'string' ? parsed.html : '',
          attachments: (parsed.attachments ?? []).map((a) => ({
            filename: a.filename ?? '',
            contentType: a.contentType ?? 'application/octet-stream',
            size: a.size ?? 0,
          })),
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  /** Wysyła wiadomość przez SMTP. */
  async emailSend(
    owner: string,
    to: string,
    subject: string,
    body: string,
    opts: EmailSendOptions = {},
  ): Promise<EmailSendResult> {
    const c = await this.resolveEmailCreds(owner);
    const transporter = nodemailer.createTransport({
      host: c.smtpHost,
      port: c.smtpPort,
      secure: c.smtpPort === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: c.user, pass: c.pass },
    });
    const info = await transporter.sendMail({
      from: c.user,
      to,
      cc: opts.cc || undefined,
      subject,
      text: body,
      html: opts.html || undefined,
    });
    return { ok: true, messageId: info.messageId };
  }

  // ── Mail (model Mail; SMTP wysyłka + IMAP inbox/outbox) ──

  /** Wyciąga adresy z pola `to`/`from` sparsowanej wiadomości. */
  private addrList(
    a:
      | { value?: Array<{ address?: string }> }
      | Array<{ value?: Array<{ address?: string }> }>
      | undefined,
  ): string[] {
    if (!a) return [];
    const arr = Array.isArray(a) ? a : [a];
    return arr.flatMap((x) => (x.value ?? []).map((v) => v.address ?? '').filter(Boolean));
  }

  /** Pobiera ostatnie wiadomości ze skrzynki jako Mail[] (najnowsze pierwsze). */
  private async fetchMails(owner: string, mailbox: string, limit = 20): Promise<Mail[]> {
    const c = await this.resolveEmailCreds(owner);
    const client = new ImapFlow({
      host: c.imapHost,
      port: c.imapPort,
      secure: true,
      auth: { user: c.user, pass: c.pass },
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const box = client.mailbox;
        const total = box && typeof box !== 'boolean' ? box.exists : 0;
        if (!total) return [];
        const start = Math.max(1, total - limit + 1);
        const mails: Mail[] = [];
        for await (const msg of client.fetch(`${start}:${total}`, { uid: true, source: true })) {
          if (!msg.source) continue;
          const p = await simpleParser(msg.source);
          mails.push({
            from: p.from?.text ?? '',
            to: this.addrList(p.to),
            topic: p.subject ?? '',
            content: p.text ?? '',
          });
        }
        return mails.reverse();
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  /** Nazwa skrzynki wysłanych (sekret `email_sentMailbox`; domyślnie Gmail). */
  private async sentMailbox(owner: string): Promise<string> {
    return await this.cred(owner, 'email_sentMailbox', '[Gmail]/Sent Mail');
  }

  async mailSend(owner: string, mail: Mail): Promise<EmailSendResult> {
    const c = await this.resolveEmailCreds(owner);
    const transporter = nodemailer.createTransport({
      host: c.smtpHost,
      port: c.smtpPort,
      secure: c.smtpPort === 465,
      auth: { user: c.user, pass: c.pass },
    });
    const info = await transporter.sendMail({
      from: mail.from || c.user,
      to: mail.to.join(', '),
      subject: mail.topic,
      text: mail.content,
    });
    return { ok: true, messageId: info.messageId };
  }

  async mailInbox(owner: string, limit = 20): Promise<Mail[]> {
    return await this.fetchMails(owner, 'INBOX', limit);
  }

  async mailOutbox(owner: string, limit = 20): Promise<Mail[]> {
    return await this.fetchMails(owner, await this.sentMailbox(owner), limit);
  }

  // ── Zip (adm-zip; ścieżki relatywne do data) ──

  async zipPack(input: string, output: string): Promise<ZipResult> {
    const inAbs = this.resolvePath(input);
    const outAbs = this.resolvePath(output);
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
    const zip = new AdmZip();
    const stat = await fs.stat(inAbs);
    if (stat.isDirectory()) zip.addLocalFolder(inAbs);
    else zip.addLocalFile(inAbs);
    zip.writeZip(outAbs);
    return { ok: true, output };
  }

  async zipUnpack(input: string, output: string): Promise<ZipResult> {
    const inAbs = this.resolvePath(input);
    const outAbs = this.resolvePath(output);
    await fs.mkdir(outAbs, { recursive: true });
    new AdmZip(inAbs).extractAllTo(outAbs, true);
    return { ok: true, output };
  }

  /** Dodaje/aktualizuje pliki (server_filenames) w istniejącym archiwum. */
  async zipUpdate(zipPath: string, files: string[]): Promise<ZipResult> {
    const zipAbs = this.resolvePath(zipPath);
    const zip = new AdmZip(zipAbs);
    for (const f of files) {
      const fAbs = this.resolvePath(f);
      const st = await fs.stat(fAbs);
      if (st.isDirectory()) zip.addLocalFolder(fAbs, path.basename(fAbs));
      else zip.addLocalFile(fAbs);
    }
    zip.writeZip(zipAbs);
    return { ok: true, output: zipPath };
  }

  /** Usuwa wpisy (nazwy w archiwum) z istniejącego archiwum. */
  async zipDelete(zipPath: string, files: string[]): Promise<ZipResult> {
    const zipAbs = this.resolvePath(zipPath);
    const zip = new AdmZip(zipAbs);
    for (const entry of files) zip.deleteFile(entry);
    zip.writeZip(zipAbs);
    return { ok: true, output: zipPath };
  }

  // ── Projekty (build + ścieżka wyniku jako server_filename) ──

  async projectArduinoBuild(
    owner: string,
    projectId: string,
    sketchName: string,
    fqbn: string,
  ): Promise<ProjectBuildResult> {
    if (!this.arduino) throw new Error('ArduinoService niedostępny na tym backendzie');
    const r = await this.arduino.compile(owner, projectId, sketchName, fqbn);
    return { success: r.success, output: r.output, outputFiles: r.outputFiles ?? [] };
  }

  /** Katalog wyjściowy builda Arduino jako server_filename. */
  projectArduinoGetOutput(owner: string, projectId: string): string {
    return `Minis/Users/${owner}/Projects/${projectId}/output`;
  }

  async projectPicosdkBuild(
    owner: string,
    projectId: string,
    sketchName: string,
    boardKey?: string,
  ): Promise<ProjectBuildResult> {
    if (!this.picosdk) throw new Error('PicoSdkService niedostępny na tym backendzie');
    const r = await this.picosdk.buildProject(owner, projectId, sketchName, boardKey || undefined);
    return { success: r.success, output: r.output };
  }

  /** Ścieżka pliku .uf2 jako server_filename. */
  projectPicosdkGetOutput(owner: string, projectId: string, sketchName: string, boardKey?: string): string {
    if (!this.picosdk) throw new Error('PicoSdkService niedostępny na tym backendzie');
    const abs = this.picosdk.uf2Path(owner, projectId, sketchName, boardKey || undefined);
    return path.relative(this.dataDir, abs);
  }

  // ── Dispatcher ──

  /** Buduje Mail z argumentów komendy. */
  private argMail(args: Record<string, unknown>): Mail {
    const m = (args.mail ?? {}) as Partial<Mail>;
    const to = Array.isArray(m.to) ? m.to.map(String) : m.to ? [String(m.to)] : [];
    return {
      from: String(m.from ?? ''),
      to,
      topic: String(m.topic ?? ''),
      content: String(m.content ?? ''),
    };
  }

  /** Parametry operacji: jawne `params` albo reszta argumentów (bez pól sterujących). */
  private argParams(args: Record<string, unknown>): Record<string, unknown> {
    if (args.params && typeof args.params === 'object') return args.params as Record<string, unknown>;
    const { owner, device, ext, command, key, ...rest } = args;
    void owner; void device; void ext; void command; void key;
    return rest;
  }

  private argFiles(args: Record<string, unknown>): string[] {
    return Array.isArray(args.files) ? args.files.map(String) : [];
  }

  // ── IoT ──────────────────────────────────────────────────────────────────

  private requireIot(): IotProvider {
    if (!this.iot) throw new Error('Operacje iot_* wymagają skonfigurowanej warstwy IoT');
    return this.iot;
  }

  /** Urządzenia użytkownika (id, status, aktywne rozszerzenia). */
  async iotGetDevices(owner: string): Promise<IotDeviceInfo[]> {
    if (!owner) throw new Error('iot_get_devices: brak właściciela');
    return await this.requireIot().listDevices(owner);
  }

  /** Wysyła komendę i czeka na potwierdzenie urządzenia; `TIMEOUT` gdy nie odpowie. */
  async iotDeviceCommand(
    owner: string,
    device: string,
    command: string,
    params: Record<string, unknown> = {},
  ): Promise<IotCommandResult> {
    if (!device || !command) throw new Error('iot_device_command: wymagane `device` i `command`');
    return await this.requireIot().sendCommand(owner, device, command, params);
  }

  /** Ostatnia wartość metryki telemetrycznej urządzenia. */
  async iotDeviceTelemetry(
    owner: string,
    device: string,
    key: string,
  ): Promise<{ value: unknown; unit?: string } | null> {
    if (!device || !key) throw new Error('iot_device_telemetry: wymagane `device` i `key`');
    return await this.requireIot().getTelemetry(owner, device, key);
  }

  /** Request-response do dowolnego rozszerzenia urządzenia. */
  async iotDeviceExtCommand(
    owner: string,
    device: string,
    ext: string,
    command: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!device || !ext || !command) {
      throw new Error('iot_device_ext_command: wymagane `device`, `ext` i `command`');
    }
    return await this.requireIot().extRequest(owner, device, ext, command, params);
  }

  /**
   * Operacje na systemie plików urządzenia. To cukier na `ext_command` z
   * `ext='vfs'` — nazwy operacji i kształt odpowiedzi są takie same jak
   * w protokole `ext/vfs/req` (patrz IotDeviceVfsExtension).
   */
  async iotDeviceExtVfs(
    owner: string,
    device: string,
    op: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    return await this.iotDeviceExtCommand(owner, device, 'vfs', op, params);
  }

  /** Wykonuje operację po nazwie (wspólne dla HTTP i MQTT). */
  async dispatch(
    op: string,
    args: Record<string, unknown> = {},
    ctx: DispatchContext = {},
  ): Promise<unknown> {
    const s = (key: string) => String(args[key] ?? '');
    // Właściciel: preferuj zweryfikowany kontekst (JWT po HTTP), inaczej z argumentów.
    const owner = ctx.owner || String(args.owner ?? '');
    switch (op) {
      case 'file_read_string':
        return await this.fileReadString(s('filename'));
      case 'file_write_string':
        return await this.fileWriteString(s('filename'), s('data'));
      case 'git_clone':
        return await this.gitClone(s('url'), s('filename'));
      case 'git_add_all':
        return await this.gitAddAll(s('filename'));
      case 'git_commit':
        return await this.gitCommit(s('filename'), s('comment'));
      case 'git_push':
        return await this.gitPush(s('filename'));
      case 'git_pull':
        return await this.gitPull(s('filename'));
      case 'git_commit_current':
        return await this.gitCommitCurrent();
      case 'git_history':
        return await this.gitHistory(s('filename'));
      case 'git_diff':
        return await this.gitDiff(s('filename'), s('commit_from'), s('commit_to'));
      case 'email_list':
        return await this.emailList(owner, s('mailbox') || 'INBOX', Number(args.limit ?? 20));
      case 'email_read':
        return await this.emailRead(owner, s('uid'), s('mailbox') || 'INBOX');
      case 'email_send':
        return await this.emailSend(owner, s('to'), s('subject'), s('body'), {
          html: args.html ? String(args.html) : undefined,
          cc: args.cc ? String(args.cc) : undefined,
        });
      case 'mail_send':
        return await this.mailSend(owner, this.argMail(args));
      case 'mail_inbox':
        return await this.mailInbox(owner, Number(args.limit ?? 20));
      case 'mail_outbox':
        return await this.mailOutbox(owner, Number(args.limit ?? 20));
      case 'zip_pack':
        return await this.zipPack(s('input'), s('output'));
      case 'zip_unpack':
        return await this.zipUnpack(s('input'), s('output'));
      case 'zip_update':
        return await this.zipUpdate(s('path'), this.argFiles(args));
      case 'zip_delete':
        return await this.zipDelete(s('path'), this.argFiles(args));
      case 'project_arduino_build':
        return await this.projectArduinoBuild(owner, s('projectId'), s('sketch'), s('fqbn'));
      case 'project_arduino_get_output':
        return this.projectArduinoGetOutput(owner, s('projectId'));
      case 'project_picosdk_build':
        return await this.projectPicosdkBuild(owner, s('projectId'), s('sketch'), s('boardKey') || undefined);
      case 'project_picosdk_get_output':
        return this.projectPicosdkGetOutput(owner, s('projectId'), s('sketch'), s('boardKey') || undefined);
      case 'iot_get_devices':
        return await this.iotGetDevices(owner);
      case 'iot_device_command':
        return await this.iotDeviceCommand(owner, s('device'), s('command'), this.argParams(args));
      case 'iot_device_telemetry':
        return await this.iotDeviceTelemetry(owner, s('device'), s('key'));
      case 'iot_device_ext_command':
        return await this.iotDeviceExtCommand(owner, s('device'), s('ext'), s('command'), this.argParams(args));
      // Skróty VFS — nazwa operacji wynika wprost z nazwy komendy API.
      case 'iot_device_ext_vfs_stat':
      case 'iot_device_ext_vfs_readdir':
      case 'iot_device_ext_vfs_readfile':
      case 'iot_device_ext_vfs_writefile':
      case 'iot_device_ext_vfs_delete':
      case 'iot_device_ext_vfs_rename':
      case 'iot_device_ext_vfs_mkdir':
        return await this.iotDeviceExtVfs(
          owner,
          s('device'),
          op.slice('iot_device_ext_vfs_'.length),
          this.argParams(args),
        );
      default:
        throw new Error(`Nieznana operacja API: ${op}`);
    }
  }
}
