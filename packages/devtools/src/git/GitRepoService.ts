/**
 * GitRepoService — cienki wrapper na CLI `git` (przez child_process) do obsługi
 * katalogów-clone'ów repozytoriów. Bez zewnętrznych zależności: korzysta z
 * zainstalowanego `git` na maszynie (serwer). Operuje na katalogu roboczym
 * (working tree) zawierającym `.git`.
 *
 * Model `.repo.json` (RepoJson) opisuje clone repo leżący w TYM SAMYM katalogu
 * co plik `.repo.json` — przechowuje URL zdalny, bieżący branch/tag i (opcj.)
 * token do HTTPS. Operacje (tagi/branche/checkout/pull/push/clone) uruchamiane
 * są w katalogu pliku `.repo.json`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const pExecFile = promisify(execFile);

/** Zawartość pliku `.repo.json`. */
export interface RepoJson {
  /** Dyskryminator typu — pozwala odróżnić od innych *.json. */
  type: 'git-repo';
  version: number;
  /** URL zdalnego repozytorium (origin). */
  url: string;
  /** Aktualnie wybrany branch (jeśli na branchu). */
  branch?: string;
  /** Aktualnie wybrany tag (jeśli HEAD wskazuje na tag / detached). */
  tag?: string;
  /** Nazwa zdalnego (domyślnie `origin`). */
  remote?: string;
  /** Opcjonalny token (PAT) do HTTPS push/pull — wstrzykiwany do URL operacji.
   *  Uwaga: trzymany jawnie w pliku; używaj tylko w prywatnym drive. Dla SSH
   *  zostaw puste i polegaj na kluczach SSH serwera.
   *  Preferuj `tokenSecretKey` — wtedy wartość trzymana jest szyfrowana w SecretsService. */
  token?: string;
  /** Klucz sekretu z SecretsService (namespace `git`) zamiast wpisywania tokena
   *  jawnie. Gdy ustawiony, backend rozwiązuje token w runtime. */
  tokenSecretKey?: string;
  /** Timestamp ostatniej synchronizacji (pull/push/clone), ms. */
  lastSync?: number;
}

export interface GitRef {
  /** Bieżący branch lub null gdy detached HEAD. */
  branch: string | null;
  /** Bieżący tag wskazujący na HEAD (jeśli istnieje). */
  tag: string | null;
  /** Skrócony hash HEAD. */
  commit: string;
}

export interface GitStatus extends GitRef {
  /** Liczba commitów przed zdalnym (do wypchnięcia). */
  ahead: number;
  /** Liczba commitów za zdalnym (do pobrania). */
  behind: number;
  /** Czy są niezacommitowane zmiany w working tree. */
  dirty: boolean;
}

export interface GitInfo {
  isRepo: boolean;
  url: string | null;
  branches: string[];
  /** Branche zdalne (bez prefiksu `remotes/origin/`). */
  remoteBranches: string[];
  tags: string[];
  status: GitStatus | null;
}

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class GitRepoService {
  /** Domyślny limit czasu pojedynczej komendy git. */
  private readonly timeoutMs: number;

  constructor(opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Uruchamia `git` w danym katalogu. Rzuca z połączonym stderr przy błędzie.
   *  Zawsze wyłącza credential helpery i interaktywne prompty — na serwerze
   *  polegamy wyłącznie na tokenach wstrzykniętych w URL. */
  private async git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    // -c credential.helper= nadpisuje dowolny globalny/systemowy helper → git
    // nie pyta o hasło gdy brak poświadczeń w URL (fail fast zamiast hang/fallback).
    const gitArgs = ['-c', 'credential.helper=', ...args];
    const fullEnv: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...env,
    };
    try {
      const { stdout } = await pExecFile('git', gitArgs, {
        cwd,
        timeout: this.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: fullEnv,
      });
      return stdout;
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const msg = (err.stderr || err.stdout || err.message || 'git error').toString().trim();
      throw new Error(msg);
    }
  }

  /** Czy katalog jest WŁASNYM repozytorium git (toplevel == dir). Wymaga, by
   *  katalog miał własny `.git` — sam fakt leżenia w drzewie repo nadrzędnego
   *  (np. drive wewnątrz monorepo) NIE czyni go clone'em; inaczej operacje
   *  pull/push trafiłyby na repozytorium nadrzędne. */
  async isRepo(dir: string): Promise<boolean> {
    if (!fs.existsSync(dir)) return false;
    // `.git` (katalog lub plik dla worktree/submodułów) musi być bezpośrednio tu.
    if (!fs.existsSync(path.join(dir, '.git'))) return false;
    try {
      const top = (await this.git(dir, ['rev-parse', '--show-toplevel'])).trim();
      return path.resolve(top) === path.resolve(dir);
    } catch {
      return false;
    }
  }

  /** Ustawia URL zdalnego (tworzy remote gdy go nie ma). Działa tylko gdy dir
   *  jest repozytorium. */
  async setRemoteUrl(dir: string, url: string, remote = 'origin'): Promise<void> {
    const existing = await this.remoteUrl(dir, remote);
    if (existing) await this.git(dir, ['remote', 'set-url', remote, url]);
    else await this.git(dir, ['remote', 'add', remote, url]);
  }

  /** URL zdalnego (origin lub podany remote), null gdy brak. */
  async remoteUrl(dir: string, remote = 'origin'): Promise<string | null> {
    try {
      const out = await this.git(dir, ['remote', 'get-url', remote]);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  /** Lista lokalnych branchy. */
  async listBranches(dir: string): Promise<string[]> {
    const out = await this.git(dir, ['branch', '--format=%(refname:short)']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /** Lista branchy zdalnych (bez `origin/HEAD`), nazwy bez prefiksu remote. */
  async listRemoteBranches(dir: string, remote = 'origin'): Promise<string[]> {
    try {
      const out = await this.git(dir, ['branch', '--remotes', '--format=%(refname:short)']);
      const prefix = `${remote}/`;
      return out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((b) => b.startsWith(prefix) && !b.endsWith('/HEAD'))
        .map((b) => b.slice(prefix.length));
    } catch {
      return [];
    }
  }

  /** Lista tagów (posortowana malejąco wg wersji). */
  async listTags(dir: string): Promise<string[]> {
    const out = await this.git(dir, ['tag', '--sort=-v:refname']);
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  /** Bieżący ref: branch (lub null gdy detached), tag wskazujący HEAD, commit.
   *  Odporny na UNBORN HEAD (repo bez commitów, np. świeże `git init` lub
   *  przerwany clone) — wtedy `rev-parse HEAD` zawodzi; bierzemy nazwę gałęzi
   *  z `symbolic-ref`, a commit zostaje pusty. */
  async currentRef(dir: string): Promise<GitRef> {
    let branch: string | null = null;
    try {
      const branchRaw = (await this.git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
      branch = branchRaw === 'HEAD' ? null : branchRaw;
    } catch {
      // unborn HEAD — nazwa gałęzi mimo braku commitów
      try { branch = (await this.git(dir, ['symbolic-ref', '--short', 'HEAD'])).trim() || null; } catch { branch = null; }
    }
    let commit = '';
    try { commit = (await this.git(dir, ['rev-parse', '--short', 'HEAD'])).trim(); } catch { commit = ''; }
    let tag: string | null = null;
    if (commit) {
      try { tag = (await this.git(dir, ['describe', '--tags', '--exact-match', 'HEAD'])).trim() || null; } catch { tag = null; }
    }
    return { branch, tag, commit };
  }

  /** Status: bieżący ref + ahead/behind względem upstream + czy dirty. */
  async status(dir: string): Promise<GitStatus> {
    const ref = await this.currentRef(dir);
    let ahead = 0;
    let behind = 0;
    try {
      const counts = (await this.git(dir, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])).trim();
      const [b, a] = counts.split(/\s+/).map((n) => parseInt(n, 10) || 0);
      behind = b;
      ahead = a;
    } catch {
      // brak upstream — zostaw 0/0
    }
    const dirtyOut = (await this.git(dir, ['status', '--porcelain'])).trim();
    return { ...ref, ahead, behind, dirty: dirtyOut.length > 0 };
  }

  /** Pełny obraz repo w katalogu (do wyświetlenia w panelu). */
  async info(dir: string): Promise<GitInfo> {
    if (!(await this.isRepo(dir))) {
      return { isRepo: false, url: null, branches: [], remoteBranches: [], tags: [], status: null };
    }
    const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
    const [url, branches, remoteBranches, tags, status] = await Promise.all([
      safe(this.remoteUrl(dir), null),
      safe(this.listBranches(dir), [] as string[]),
      safe(this.listRemoteBranches(dir), [] as string[]),
      safe(this.listTags(dir), [] as string[]),
      safe(this.status(dir), null),
    ]);
    return { isRepo: true, url, branches, remoteBranches, tags, status };
  }

  /** Checkout brancha lub tagu. Dla brancha zdalnego tworzy lokalny tracking. */
  async checkout(dir: string, ref: string, opts: { type?: 'branch' | 'tag'; remote?: string } = {}): Promise<void> {
    const remote = opts.remote ?? 'origin';
    if (opts.type === 'branch') {
      const localBranches = await this.listBranches(dir);
      if (!localBranches.includes(ref)) {
        const remoteBranches = await this.listRemoteBranches(dir, remote);
        if (remoteBranches.includes(ref)) {
          // utwórz lokalny branch śledzący zdalny
          await this.git(dir, ['checkout', '-B', ref, '--track', `${remote}/${ref}`]);
          return;
        }
      }
    }
    await this.git(dir, ['checkout', ref]);
  }

  /** Buduje URL z wstrzykniętym tokenem (dla HTTPS) — używane do pull/push. */
  private urlWithToken(url: string, token?: string): string {
    if (!token) return url;
    if (!/^https?:\/\//i.test(url)) return url; // SSH/inne — token nie ma zastosowania
    try {
      const u = new URL(url);
      // PAT musi być w polu password: https://x-access-token:<TOKEN>@host/...
      // Tak działa GitHub, Gitea i większość innych hostów git HTTPS.
      u.username = 'x-access-token';
      u.password = token;
      return u.toString();
    } catch {
      return url;
    }
  }

  /** Stage all changes + commit. */
  async commit(dir: string, message: string): Promise<GitCommandResult> {
    try {
      await this.git(dir, ['add', '-A']);
      const out = await this.git(dir, ['commit', '-m', message]);
      return { ok: true, stdout: out, stderr: '' };
    } catch (e) {
      return { ok: false, stdout: '', stderr: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Pull (fast-forward jeśli możliwe). Token wstrzykiwany ad-hoc do URL. */
  async pull(dir: string, opts: { remote?: string; branch?: string; token?: string } = {}): Promise<GitCommandResult> {
    const remote = opts.remote ?? 'origin';
    return this.withToken(dir, remote, opts.token, async () => {
      const args = ['pull', '--ff', remote];
      if (opts.branch) args.push(opts.branch);
      const out = await this.git(dir, args);
      return out;
    });
  }

  /** Push bieżącego brancha (lub podanego) do remote. */
  async push(dir: string, opts: { remote?: string; branch?: string; token?: string; setUpstream?: boolean } = {}): Promise<GitCommandResult> {
    const remote = opts.remote ?? 'origin';
    return this.withToken(dir, remote, opts.token, async () => {
      const args = ['push'];
      if (opts.setUpstream) args.push('-u');
      args.push(remote);
      if (opts.branch) args.push(opts.branch);
      const out = await this.git(dir, args);
      return out;
    });
  }

  /** Zwraca URL remote z wstrzykniętym tokenem (jeśli token podany), albo nazwę
   *  remote gdy nie ma tokena lub URL nie jest HTTPS. */
  private async resolvedRemote(dir: string, remote: string, token?: string): Promise<string> {
    if (!token) return remote;
    const url = await this.remoteUrl(dir, remote);
    if (!url) return remote;
    const withTok = this.urlWithToken(url, token);
    return withTok !== url ? withTok : remote;
  }

  /** Domyślny branch zdalnego (po fetchu): preferuje main/master, inaczej pierwszy. */
  async defaultRemoteBranch(dir: string, remote = 'origin'): Promise<string | null> {
    const remotes = await this.listRemoteBranches(dir, remote);
    if (!remotes.length) return null;
    if (remotes.includes('main')) return 'main';
    if (remotes.includes('master')) return 'master';
    return remotes[0];
  }

  /** Inicjalizuje repo W ISTNIEJĄCYM (niepustym) katalogu: `git init` + remote +
   *  fetch + checkout. Używane, gdy katalog zawiera już `.repo.json` (więc `git
   *  clone`, wymagający pustego katalogu, by się nie powiódł). */
  async cloneInto(dir: string, url: string, opts: { branch?: string; token?: string; remote?: string } = {}): Promise<GitCommandResult> {
    const remote = opts.remote ?? 'origin';
    fs.mkdirSync(dir, { recursive: true });
    try {
      if (!(await this.isRepo(dir))) await this.git(dir, ['init']);
      // ustaw/utwórz remote
      const existing = await this.remoteUrl(dir, remote);
      if (existing) await this.git(dir, ['remote', 'set-url', remote, url]);
      else await this.git(dir, ['remote', 'add', remote, url]);
      const fetchTarget = await this.resolvedRemote(dir, remote, opts.token);
      let out = await this.git(dir, ['fetch', fetchTarget]);
      const branch = opts.branch || (await this.defaultRemoteBranch(dir, remote)) || 'main';
      out += '\n' + await this.git(dir, ['checkout', '-B', branch, '--track', `${remote}/${branch}`]);
      return { ok: true, stdout: out, stderr: '' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, stdout: '', stderr: msg };
    }
  }

  /** Lista plików śledzonych przez git na danym ref (lub w working tree gdy ref puste). */
  async listFiles(dir: string, ref?: string): Promise<string[]> {
    try {
      const args = ref ? ['ls-tree', '-r', '--name-only', ref] : ['ls-files'];
      const out = await this.git(dir, args);
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Unified diff:
   *  - `from` + `to` podane → `git diff --no-color <from>..<to> [-- file]`
   *  - tylko `from` (to puste) → `git diff --no-color <from> [-- file]` (from vs working tree)
   *  Domyślnie `from='HEAD'`. Zwraca tekst diffa lub rzuca gdy ref nie istnieje. */
  async diff(dir: string, opts: { from?: string; to?: string; file?: string; maxLines?: number } = {}): Promise<string> {
    const { from = 'HEAD', to, file } = opts;
    const args = ['diff', '--no-color'];
    if (to) {
      args.push(`${from}..${to}`);
    } else {
      args.push(from);
    }
    if (file) args.push('--', file);
    let out = await this.git(dir, args);

    // Working tree mode: git diff shows only tracked files. Untracked (new) files
    // need separate treatment via git diff --no-index /dev/null <file>.
    if (!to) {
      try {
        const untrackedArgs = ['ls-files', '--others', '--exclude-standard'];
        if (file) untrackedArgs.push('--', file);
        const untracked = await this.git(dir, untrackedArgs);
        const untrackedFiles = untracked.split('\n').map((s) => s.trim()).filter(Boolean);
        if (untrackedFiles.length > 0) {
          const parts: string[] = out ? [out] : [];
          for (const uf of untrackedFiles) {
            try {
              const fd = await this.gitNoIndexDiff(dir, uf);
              if (fd) parts.push(fd);
            } catch { /* binary or inaccessible — skip */ }
          }
          out = parts.join('\n');
        }
      } catch { /* ignore ls-files errors */ }
    }

    if (opts.maxLines) {
      const lines = out.split('\n');
      if (lines.length > opts.maxLines) {
        return lines.slice(0, opts.maxLines).join('\n') + `\n… (diff ucięty, pokazano ${opts.maxLines} z ${lines.length} linii)`;
      }
    }
    return out;
  }

  /** `git diff --no-index /dev/null <file>` — bezpieczne wywołanie, które NIE
   *  rzuca na exit code 1 (standardowy wynik gdy pliki się różnią). */
  private async gitNoIndexDiff(dir: string, file: string): Promise<string> {
    try {
      const { stdout } = await pExecFile(
        'git', ['diff', '--no-color', '--no-index', '/dev/null', file],
        { cwd: dir, timeout: this.timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      );
      return stdout; // exit 0 = brak różnic (praktycznie niemożliwe dla /dev/null vs plik)
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      if (err.code === 1 && err.stdout) return err.stdout; // exit 1 = są różnice — stdout to diff
      const msg = (err.stderr || err.stdout || 'git diff --no-index error').toString().trim();
      throw new Error(msg);
    }
  }

  /** Clone url do katalogu docelowego (musi być pusty/nieistniejący). */
  async clone(url: string, dir: string, opts: { branch?: string; token?: string } = {}): Promise<GitCommandResult> {
    const parent = path.dirname(dir);
    fs.mkdirSync(parent, { recursive: true });
    const src = this.urlWithToken(url, opts.token);
    const args = ['-c', 'credential.helper=', 'clone'];
    if (opts.branch) args.push('--branch', opts.branch);
    args.push(src, path.basename(dir));
    try {
      const { stdout, stderr } = await pExecFile('git', args, {
        cwd: parent,
        timeout: this.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      // Oczyść remote z tokena — nie trzymamy tokena w git config.
      if (opts.token) {
        await this.git(dir, ['remote', 'set-url', 'origin', url]).catch(() => undefined);
      }
      return { ok: true, stdout, stderr };
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      return { ok: false, stdout: err.stdout ?? '', stderr: (err.stderr || err.message || 'clone failed').toString() };
    }
  }

  /** Tymczasowo ustawia remote URL z tokenem na czas operacji, potem przywraca. */
  private async withToken(
    dir: string,
    remote: string,
    token: string | undefined,
    op: () => Promise<string>,
  ): Promise<GitCommandResult> {
    let original: string | null = null;
    if (token) {
      original = await this.remoteUrl(dir, remote);
      if (original) {
        const tokened = this.urlWithToken(original, token);
        if (tokened !== original) await this.git(dir, ['remote', 'set-url', remote, tokened]);
        else original = null;
      }
    }
    try {
      const out = await op();
      return { ok: true, stdout: out, stderr: '' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, stdout: '', stderr: msg };
    } finally {
      if (token && original) {
        await this.git(dir, ['remote', 'set-url', remote, original]).catch(() => undefined);
      }
    }
  }
}

/** Parsuje treść pliku `.repo.json`; rzuca gdy niepoprawny. */
export function parseRepoJson(text: string): RepoJson {
  const data = JSON.parse(text) as Partial<RepoJson>;
  if (!data || typeof data.url !== 'string' || !data.url) {
    throw new Error('.repo.json: brak wymaganego pola "url"');
  }
  return {
    type: 'git-repo',
    version: typeof data.version === 'number' ? data.version : 1,
    url: data.url,
    branch: data.branch,
    tag: data.tag,
    remote: data.remote ?? 'origin',
    token: data.token,
    tokenSecretKey: data.tokenSecretKey,
    lastSync: data.lastSync,
  };
}

/** Serializuje RepoJson do zapisu (z wcięciami). */
export function stringifyRepoJson(repo: RepoJson): string {
  return JSON.stringify(repo, null, 2) + '\n';
}
