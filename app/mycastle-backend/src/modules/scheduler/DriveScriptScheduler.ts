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
import { spawn } from 'child_process';
import { readFile, readdir, appendFile, mkdir, stat, writeFile } from 'fs/promises';
import path from 'path';

const LOG_CAP_BYTES = 512 * 1024; // trim the log file when it grows past ~512KB

interface ScheduleEntry { cron: string; enabled: boolean; runAtStartup?: boolean }
type SchedulesFile = Record<string, ScheduleEntry>;

export class DriveScriptScheduler {
  /** key = `${user}:${rel}` → cron task */
  private jobs = new Map<string, cron.ScheduledTask>();

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
    if (!/\.(mjs|cjs|js)$/i.test(rel)) return null;
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
        this.run(user, rel, file, 'startup');
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

  private run(user: string, rel: string, file: string, source: 'cron' | 'startup' = 'cron'): void {
    console.log(`DriveScriptScheduler: running ${user}/${rel} (${source})`);
    const proc = spawn('node', [file], { cwd: path.dirname(file), shell: false });
    const tag = `[${source} ${user}/${rel}]`;
    let buf = `\n===== ${new Date().toISOString()} (${source}) =====\n`;
    proc.stdout.on('data', (c: Buffer) => { buf += c.toString(); process.stdout.write(`${tag} ${c}`); });
    proc.stderr.on('data', (c: Buffer) => { buf += c.toString(); process.stderr.write(`${tag} ${c}`); });
    proc.on('close', (code) => {
      buf += `\n[exit ${code}]\n`;
      void this.appendLog(user, rel, buf);
      console.log(`DriveScriptScheduler: ${user}/${rel} exited code=${code}`);
    });
    proc.on('error', (err) => {
      buf += `\n[error] ${err.message}\n`;
      void this.appendLog(user, rel, buf);
      console.warn(`DriveScriptScheduler: ${user}/${rel} error: ${err.message}`);
    });
  }

  activeCount(): number { return this.jobs.size; }

  shutdownAll(): void {
    for (const task of this.jobs.values()) task.stop();
    this.jobs.clear();
  }
}
