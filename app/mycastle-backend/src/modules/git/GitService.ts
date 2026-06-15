/**
 * GitService — backendowa obsługa katalogów-clone'ów git oznaczonych plikiem
 * `.repo.json` w drive użytkownika. Cienka warstwa nad `GitRepoService`
 * z `@mhersztowski/devtools`: resolwuje ścieżki w obrębie drive (z ochroną przed
 * path traversal), czyta/zapisuje `.repo.json` i deleguje operacje git.
 *
 * Ścieżki przychodzą z frontendu jako RELATYWNE do drive użytkownika
 * (`data/Minis/Users/{userName}/drive/`), np. `myrepo/.repo.json`.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  GitRepoService,
  parseRepoJson,
  stringifyRepoJson,
  type RepoJson,
  type GitInfo,
} from '@mhersztowski/devtools';
import type { SecretsService } from '../secrets/SecretsService.js';

/** Namespace współdzielony z Settings → Secrets (klucze: `token:{name}`). */
const GIT_SECRETS_NS = '__credentials__';

export interface GitRepoStatusResponse {
  /** RepoJson z zredagowanym tokenem (nie zwracamy sekretu na frontend). */
  repo: RepoJson;
  /** Stan git katalogu (gałęzie, tagi, status). */
  git: GitInfo;
}

export class GitService {
  private readonly git = new GitRepoService();
  private readonly rootDir: string;
  private readonly secrets: SecretsService | null;

  constructor(rootDir: string, secrets?: SecretsService) {
    this.rootDir = path.resolve(rootDir);
    this.secrets = secrets ?? null;
  }

  /** Zwraca rzeczywisty token do użycia: najpierw próbuje rozwiązać z SecretsService
   *  (gdy `tokenSecretKey` ustawiony), potem fallback na `token` w `.repo.json`. */
  private async resolveToken(userName: string, repo: RepoJson): Promise<string | undefined> {
    if (repo.tokenSecretKey && this.secrets) {
      const s = await this.secrets.get(userName, GIT_SECRETS_NS, repo.tokenSecretKey);
      if (s) return s.value;
    }
    return repo.token;
  }

  /** Resolwuje ścieżkę pliku `*.repo.json` do absolutnej + katalog repo.
   *  Wymusza, że ścieżka leży w drive użytkownika i kończy się na `.repo.json`.
   *  Katalog repo:
   *   • `.repo.json`           → katalog pliku (clone w tym katalogu),
   *   • `{nazwa}.repo.json`    → podkatalog `{nazwa}` obok pliku (clone tam),
   *     co pozwala trzymać kilka repo w jednym katalogu, a plik `.repo.json`
   *     nie zaśmieca statusu repo. */
  private resolve(userName: string, relPath: string): { repoJsonPath: string; dir: string } {
    if (!/^[A-Za-z0-9_-]+$/.test(userName)) throw new Error('Nieprawidłowa nazwa użytkownika');
    const driveRoot = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'drive');
    const clean = String(relPath || '').replace(/^[/\\]+/, '');
    const abs = path.resolve(driveRoot, clean);
    if (abs !== driveRoot && !abs.startsWith(driveRoot + path.sep)) {
      throw new Error('Odmowa dostępu: ścieżka poza drive');
    }
    const base = path.basename(abs);
    if (!base.endsWith('.repo.json')) {
      throw new Error('Ścieżka musi wskazywać plik *.repo.json');
    }
    const prefix = base.slice(0, -'.repo.json'.length); // 'pubsub.repo.json'→'pubsub', '.repo.json'→''
    const dir = prefix ? path.resolve(path.dirname(abs), prefix) : path.dirname(abs);
    if (dir !== driveRoot && !dir.startsWith(driveRoot + path.sep)) {
      throw new Error('Odmowa dostępu: katalog repo poza drive');
    }
    return { repoJsonPath: abs, dir };
  }

  /** Czyta `.repo.json` TOLERANCYJNIE: pusty/niepełny/niepoprawny plik daje
   *  domyślny rekord z pustym `url` (panel pokaże formularz konfiguracji),
   *  zamiast rzucać „Unexpected end of JSON input". */
  private read(repoJsonPath: string): RepoJson {
    let text = '';
    try { text = fs.readFileSync(repoJsonPath, 'utf8'); } catch { /* brak pliku */ }
    text = text.trim();
    const empty: RepoJson = { type: 'git-repo', version: 1, url: '', remote: 'origin' };
    if (!text) return empty;
    try {
      return parseRepoJson(text);
    } catch {
      // Niepełny JSON (np. świeżo utworzony pusty plik, którego edytor zapisał
      // częściowo) — spróbuj wyłuskać url, inaczej zwróć pusty rekord.
      try {
        const o = JSON.parse(text) as Partial<RepoJson>;
        return {
          type: 'git-repo',
          version: typeof o.version === 'number' ? o.version : 1,
          url: typeof o.url === 'string' ? o.url : '',
          branch: o.branch, tag: o.tag, remote: o.remote ?? 'origin',
          token: o.token, lastSync: o.lastSync,
        };
      } catch {
        return empty;
      }
    }
  }

  private write(repoJsonPath: string, repo: RepoJson): void {
    fs.writeFileSync(repoJsonPath, stringifyRepoJson(repo));
  }

  /** Redaguje token przed wysłaniem na frontend. */
  private redact(repo: RepoJson): RepoJson {
    return { ...repo, token: repo.token ? '***' : undefined };
  }

  /** Aktualizuje `.repo.json` o bieżący ref po operacji (branch/tag/lastSync). */
  private async syncRepoJson(repoJsonPath: string, dir: string): Promise<RepoJson> {
    const repo = this.read(repoJsonPath);
    try {
      const ref = await this.git.currentRef(dir);
      repo.branch = ref.branch ?? undefined;
      repo.tag = ref.tag ?? undefined;
    } catch {
      /* repo może jeszcze nie istnieć */
    }
    repo.lastSync = Date.now();
    this.write(repoJsonPath, repo);
    return repo;
  }

  /** Pełny status: RepoJson + gałęzie/tagi/status git katalogu. */
  async info(userName: string, relPath: string): Promise<GitRepoStatusResponse> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const repo = this.read(repoJsonPath);
    const git = await this.git.info(dir);
    return { repo: this.redact(repo), git };
  }

  /** Zapisuje konfigurację do `.repo.json` (URL/remote/branch/token). Gdy katalog
   *  jest już clone'em i zmienił się URL — aktualizuje też git remote. Zwraca
   *  RepoJson z zredagowanym tokenem. */
  async save(
    userName: string,
    relPath: string,
    patch: { url?: string; remote?: string; branch?: string; token?: string; tokenSecretKey?: string | null },
  ): Promise<RepoJson> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const cur = this.read(repoJsonPath);
    const next: RepoJson = {
      type: 'git-repo',
      version: cur.version || 1,
      url: patch.url !== undefined ? patch.url.trim() : cur.url,
      remote: (patch.remote !== undefined ? patch.remote : cur.remote) || 'origin',
      branch: cur.branch,
      tag: cur.tag,
      // '***' to wartość zredagowana z frontu — nie nadpisuj nią realnego tokena.
      token: patch.token !== undefined && patch.token !== '***' ? (patch.token || undefined) : cur.token,
      // null = wyczyść; string = ustaw; undefined = zostaw jak było.
      tokenSecretKey: patch.tokenSecretKey !== undefined ? (patch.tokenSecretKey ?? undefined) : cur.tokenSecretKey,
      lastSync: cur.lastSync,
    };
    // Gdy ustawiono tokenSecretKey — wyczyść surowy token (nie trzymaj obu).
    if (next.tokenSecretKey) next.token = undefined;
    this.write(repoJsonPath, next);
    // Jeśli repo już istnieje, a URL się zmienił — zaktualizuj remote.
    if (next.url && (await this.git.isRepo(dir))) {
      try { await this.git.setRemoteUrl(dir, next.url, next.remote); } catch { /* ignore */ }
    }
    return this.redact(next);
  }

  /** Clone repo z URL z `.repo.json` do katalogu pliku (init+fetch+checkout). */
  async clone(userName: string, relPath: string): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const repo = this.read(repoJsonPath);
    if (!repo.url) throw new Error('Brak URL repozytorium — najpierw ustaw i zapisz URL');
    if (await this.git.isRepo(dir)) throw new Error('Katalog jest już repozytorium git');
    const token = await this.resolveToken(userName, repo);
    const r = await this.git.cloneInto(dir, repo.url, { branch: repo.branch, token, remote: repo.remote });
    if (r.ok) await this.syncRepoJson(repoJsonPath, dir);
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Checkout brancha lub tagu. */
  async checkout(userName: string, relPath: string, ref: string, type: 'branch' | 'tag'): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const repo = this.read(repoJsonPath);
    if (!(await this.git.isRepo(dir))) throw new Error('Katalog nie jest repozytorium git (najpierw Clone)');
    try {
      await this.git.checkout(dir, ref, { type, remote: repo.remote });
      await this.syncRepoJson(repoJsonPath, dir);
      return { ok: true, output: `checkout ${ref}` };
    } catch (e) {
      return { ok: false, output: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Pull z remote. */
  async pull(userName: string, relPath: string): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const repo = this.read(repoJsonPath);
    if (!(await this.git.isRepo(dir))) throw new Error('Katalog nie jest repozytorium git (najpierw Clone)');
    const token = await this.resolveToken(userName, repo);
    const r = await this.git.pull(dir, { remote: repo.remote, branch: repo.branch, token });
    if (r.ok) await this.syncRepoJson(repoJsonPath, dir);
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Lista plików śledzonych przez git na podanym ref (lub working tree gdy ref puste). */
  async listFiles(userName: string, relPath: string, ref?: string): Promise<string[]> {
    const { dir } = this.resolve(userName, relPath);
    if (!(await this.git.isRepo(dir))) return [];
    return this.git.listFiles(dir, ref);
  }

  /** Unified diff między refami lub ref vs working tree.
   *  `to` = undefined → porównanie `from` z working tree (filesystem backendu).
   *  `to` = ref → `git diff from..to`. */
  async diff(
    userName: string,
    relPath: string,
    opts: { from?: string; to?: string; file?: string },
  ): Promise<{ ok: boolean; diff: string }> {
    const { dir } = this.resolve(userName, relPath);
    if (!(await this.git.isRepo(dir))) throw new Error('Katalog nie jest repozytorium git');
    try {
      const text = await this.git.diff(dir, { ...opts, maxLines: 5000 });
      return { ok: true, diff: text };
    } catch (e) {
      return { ok: false, diff: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Stage all + commit. */
  async commit(userName: string, relPath: string, message: string): Promise<{ ok: boolean; output: string }> {
    const { dir } = this.resolve(userName, relPath);
    if (!(await this.git.isRepo(dir))) throw new Error('Katalog nie jest repozytorium git (najpierw Clone)');
    const r = await this.git.commit(dir, message, { authorName: userName });
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }

  /** Push do remote (ustawia upstream gdy go brak). */
  async push(userName: string, relPath: string): Promise<{ ok: boolean; output: string }> {
    const { repoJsonPath, dir } = this.resolve(userName, relPath);
    const repo = this.read(repoJsonPath);
    if (!(await this.git.isRepo(dir))) throw new Error('Katalog nie jest repozytorium git (najpierw Clone)');
    const ref = await this.git.currentRef(dir);
    const r = await this.git.push(dir, {
      remote: repo.remote,
      branch: ref.branch ?? repo.branch,
      token: await this.resolveToken(userName, repo),
      setUpstream: true,
    });
    if (r.ok) await this.syncRepoJson(repoJsonPath, dir);
    return { ok: r.ok, output: (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim() };
  }
}
