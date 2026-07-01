/**
 * DriveScriptScheduler — runs user Drive JS scripts on a cron schedule.
 *
 * Each user may declare schedules in `data/Minis/Users/{user}/drive/.schedules.json`:
 *   { "server/foo.mjs": { "cron": "0 * * * *", "enabled": true } }
 *
 * Keyed by drive-relative path (same convention as `.fileproperties.json`).
 * When a schedule fires, the file is run with `node {file}` (cwd = its folder).
 * Output goes to the server log. Reload per-user after the schedules file is
 * written (via the `/drive/schedules/reload` endpoint) or all users on startup.
 */
import * as cron from 'node-cron';
import { spawn, type ChildProcess } from 'child_process';
import { readFile, readdir, appendFile, mkdir, stat, writeFile } from 'fs/promises';
import path from 'path';
import { prepareRunnableScript, RUNNABLE_RE } from './prepareRunnableScript.js';

const LOG_CAP_BYTES = 512 * 1024; // trim the log file when it grows past ~512KB

interface ScheduleEntry { cron: string; enabled: boolean; runAtStartup?: boolean }
type SchedulesFile = Record<string, ScheduleEntry>;

export class DriveScriptScheduler {
  /** key = `${user}:${rel}` → cron task */
  private jobs = new Map<string, cron.ScheduledTask>();
  /** key = `${user}:${rel}` → currently running child process (for Restart/Stop). */
  private running = new Map<string, ChildProcess>();

  constructor(private readonly rootDir: string) {}

  private userDriveDir(user: string): string {
    return path.resolve(this.rootDir, 'Minis', 'Users', user, 'drive');
  }

  private schedulesFile(user: string): string {
    return path.join(this.userDriveDir(user), '.schedules.json');
  }

  /** Absolute path of the per-script log file: `…/drive/.logs/{rel}.log`. */
  logFile(user: string, rel: string): string {
    return path.join(this.userDriveDir(user), '.logs', `${rel}.log`);
  }

  /**
   * Append `text` to a script's log file (shared by manual Run + cron runs).
   * Creates parent dirs; trims the file to the last ~LOG_CAP_BYTES when it
   * grows too large so a chatty script can't fill the disk.
   */
  async appendLog(user: string, rel: string, text: string): Promise<void> {
    const file = this.logFile(user, rel);
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, text, 'utf-8');
      const st = await stat(file).catch(() => null);
      if (st && st.size > LOG_CAP_BYTES) {
        const buf = await readFile(file, 'utf-8');
        await writeFile(file, '…(starsze logi przycięte)…\n' + buf.slice(-LOG_CAP_BYTES), 'utf-8');
      }
    } catch (err) {
      console.warn(`DriveScriptScheduler: failed to write log for ${user}/${rel}:`, (err as Error).message);
    }
  }

  private async listUsers(): Promise<string[]> {
    try {
      return (await readdir(path.resolve(this.rootDir, 'Minis', 'Users'), { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  /** Resolve a drive-relative script path to an absolute file, or null if invalid. */
  private fileFor(user: string, rel: string): string | null {
    if (!RUNNABLE_RE.test(rel)) return null;
    const driveRoot = this.userDriveDir(user);
    const file = path.resolve(driveRoot, rel);
    return file.startsWith(driveRoot + path.sep) ? file : null; // traversal guard
  }

  private async readSchedules(user: string): Promise<SchedulesFile> {
    try {
      return JSON.parse(await readFile(this.schedulesFile(user), 'utf-8')) as SchedulesFile;
    } catch {
      return {};
    }
  }

  /** Register cron schedules for every user found under Minis/Users. */
  async loadAllUsers(): Promise<void> {
    for (const u of await this.listUsers()) await this.reloadUser(u);
  }

  /** Run every script flagged `runAtStartup` across all users. */
  async runStartupAll(): Promise<number> {
    let n = 0;
    for (const user of await this.listUsers()) {
      const data = await this.readSchedules(user);
      for (const [rel, entry] of Object.entries(data)) {
        if (!entry?.runAtStartup) continue;
        const file = this.fileFor(user, rel);
        if (!file) continue;
        void this.run(user, rel, file, 'startup');
        n++;
      }
    }
    return n;
  }

  /** Stop a user's jobs and re-register from their `.schedules.json`. */
  async reloadUser(user: string): Promise<number> {
    for (const [key, task] of this.jobs) {
      if (key.startsWith(`${user}:`)) { task.stop(); this.jobs.delete(key); }
    }

    const data = await this.readSchedules(user);
    let count = 0;
    for (const [rel, entry] of Object.entries(data)) {
      if (!entry || !entry.enabled || !entry.cron) continue;
      if (!cron.validate(entry.cron)) {
        console.warn(`DriveScriptScheduler: invalid cron "${entry.cron}" for ${user}/${rel}`);
        continue;
      }
      const file = this.fileFor(user, rel);
      if (!file) continue;

      const task = cron.schedule(entry.cron, () => this.run(user, rel, file));
      this.jobs.set(`${user}:${rel}`, task);
      count++;
      console.log(`DriveScriptScheduler: scheduled ${user}/${rel} @ "${entry.cron}"`);
    }
    return count;
  }

  private async run(user: string, rel: string, file: string, source: 'cron' | 'startup' | 'manual' = 'cron'): Promise<void> {
    console.log(`DriveScriptScheduler: running ${user}/${rel} (${source})`);
    const key = `${user}:${rel}`;
    const tag = `[${source} ${user}/${rel}]`;
    let buf = `\n===== ${new Date().toISOString()} (${source}) =====\n`;

    let prepared: Awaited<ReturnType<typeof prepareRunnableScript>>;
    try {
      prepared = await prepareRunnableScript(file); // transpiles .ts (bundles local imports)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      buf += `\n[transpile error] ${msg}\n`;
      void this.appendLog(user, rel, buf);
      console.warn(`DriveScriptScheduler: ${user}/${rel} transpile error: ${msg}`);
      return;
    }

    const proc = spawn('node', [prepared.runFile], { cwd: path.dirname(file), shell: false });
    this.running.set(key, proc);
    // Only clear the map entry if it's still THIS process (a Restart may have
    // already replaced it with a newer one).
    const untrack = () => { if (this.running.get(key) === proc) this.running.delete(key); };
    proc.stdout.on('data', (c: Buffer) => { buf += c.toString(); process.stdout.write(`${tag} ${c}`); });
    proc.stderr.on('data', (c: Buffer) => { buf += c.toString(); process.stderr.write(`${tag} ${c}`); });
    proc.on('close', (code) => {
      untrack();
      buf += `\n[exit ${code}]\n`;
      void this.appendLog(user, rel, buf);
      void prepared.cleanup();
      console.log(`DriveScriptScheduler: ${user}/${rel} exited code=${code}`);
    });
    proc.on('error', (err) => {
      untrack();
      buf += `\n[error] ${err.message}\n`;
      void this.appendLog(user, rel, buf);
      void prepared.cleanup();
      console.warn(`DriveScriptScheduler: ${user}/${rel} error: ${err.message}`);
    });
  }

  /** Is a background process for this script currently running? */
  isRunning(user: string, rel: string): boolean {
    return this.running.has(`${user}:${rel}`);
  }

  /**
   * Kill any running background instance of a script and start it fresh (with the
   * just-edited + re-transpiled code). Used by Drive → Restart.
   */
  async restart(user: string, rel: string): Promise<{ ok: boolean; error?: string }> {
    const file = this.fileFor(user, rel);
    if (!file) return { ok: false, error: 'Not a runnable script (.js/.ts/…)' };
    const key = `${user}:${rel}`;
    const existing = this.running.get(key);
    if (existing) {
      this.running.delete(key); // detach so its close handler won't clobber the new proc
      try { existing.kill('SIGTERM'); } catch { /* already gone */ }
      void this.appendLog(user, rel, `\n===== ${new Date().toISOString()} (restart — stopping previous) =====\n`);
    }
    void this.run(user, rel, file, 'manual');
    return { ok: true };
  }

  /** Stop a running background instance (no restart). */
  stop(user: string, rel: string): { ok: boolean } {
    const key = `${user}:${rel}`;
    const p = this.running.get(key);
    if (!p) return { ok: false };
    this.running.delete(key);
    try { p.kill('SIGTERM'); } catch { /* already gone */ }
    return { ok: true };
  }

  activeCount(): number { return this.jobs.size; }

  shutdownAll(): void {
    for (const task of this.jobs.values()) task.stop();
    this.jobs.clear();
    for (const p of this.running.values()) { try { p.kill('SIGTERM'); } catch { /* ignore */ } }
    this.running.clear();
  }
}
