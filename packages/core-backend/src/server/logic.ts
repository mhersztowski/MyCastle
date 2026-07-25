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

export class ServerLogic {
  private readonly dataDir: string;
  private readonly git = new GitTool();

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
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

  // ── Dispatcher ──

  /** Wykonuje operację po nazwie (wspólne dla HTTP i MQTT). */
  async dispatch(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const s = (key: string) => String(args[key] ?? '');
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
      default:
        throw new Error(`Nieznana operacja API: ${op}`);
    }
  }
}
