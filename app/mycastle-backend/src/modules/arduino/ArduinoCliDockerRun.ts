import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ArduinoCli, BoardInfo, CompileOptions, CompileResult, PortInfo, UploadOptions, UploadResult } from './ArduinoCli.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Runs arduino-cli via `docker run --rm` — no persistent container needed.
 * Cores are baked into the image; libraries install into the project dir (volume mount).
 */
export class ArduinoCliDockerRun implements ArduinoCli {
  constructor(
    private readonly imageName: string,
    private readonly hostDataDir: string,
    /** Path to data dir as seen by the backend process (may differ from hostDataDir when
     *  the backend itself runs inside Docker). Defaults to hostDataDir. */
    private readonly backendDataDir: string = hostDataDir,
    private readonly containerDataDir: string = '/workspace/data',
  ) {}

  private toContainer(backendPath: string): string {
    const rel = path.relative(this.backendDataDir, backendPath).split(path.sep).join('/');
    return `${this.containerDataDir}/${rel}`;
  }

  /** Base docker run args shared by exec() and compile() streaming mode. */
  private get baseRunArgs(): string[] {
    return [
      'run', '--rm',
      '-v', `${this.hostDataDir}:${this.containerDataDir}`,
      this.imageName,
      'arduino-cli',
    ];
  }

  /**
   * Rewrites the config file so that `directories.user` (and any other paths)
   * uses the container path instead of the backend host path.
   * Safe to call multiple times — the replacement is idempotent once the path
   * is already using the container prefix.
   */
  private async patchConfigFile(hostConfigPath: string): Promise<void> {
    try {
      let content = await fs.readFile(hostConfigPath, 'utf-8');
      // Replace every occurrence of the backend data dir prefix with the container prefix
      content = content.split(this.backendDataDir).join(this.containerDataDir);
      await fs.writeFile(hostConfigPath, content, 'utf-8');
    } catch { /* ignore — compile will surface the real error */ }
  }

  private async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('docker', [
      ...this.baseRunArgs,
      ...args,
    ], { maxBuffer: MAX_BUFFER });
  }

  async listBoards(): Promise<BoardInfo[]> {
    const { stdout } = await this.exec(['board', 'listall', '--format', 'json']);
    const parsed = JSON.parse(stdout);
    return (parsed.boards ?? []).map((b: { fqbn: string; name: string }) => ({
      fqbn: b.fqbn,
      name: b.name,
    }));
  }

  async compile(options: CompileOptions): Promise<CompileResult> {
    await this.patchConfigFile(options.configFilePath);

    const cliArgs = [
      'compile',
      '-b', options.fqbn,
      this.toContainer(options.sketchPath),
      ...(options.verbose ? ['-v'] : []),
      '--config-file', this.toContainer(options.configFilePath),
      '--output-dir', this.toContainer(options.outputDir),
      '--build-path', this.toContainer(options.buildDir),
      ...(options.extraLibraryPaths ?? []).flatMap(p => ['--library', this.toContainer(p)]),
    ];
    const dockerArgs = [
      ...this.baseRunArgs,
      ...cliArgs,
    ];
    const cmdLine = `$ docker run --rm ${this.imageName} arduino-cli ${cliArgs.join(' ')}\n`;

    if (options.onChunk) {
      const { onChunk } = options;
      onChunk(cmdLine);
      return new Promise<CompileResult>((resolve) => {
        const child = spawn('docker', dockerArgs);
        let out = cmdLine;
        const handle = (data: Buffer) => { const s = data.toString(); out += s; onChunk(s); };
        child.stdout.on('data', handle);
        child.stderr.on('data', handle);
        child.on('close', (code) => resolve({ success: code === 0, output: out, exitCode: code ?? 1 }));
        child.on('error', (err) => { out += err.message; onChunk(err.message); resolve({ success: false, output: out, exitCode: 1 }); });
      });
    }

    const cmdLineLegacy = cmdLine + '\n';
    try {
      const { stdout, stderr } = await this.exec(cliArgs);
      return { success: true, output: cmdLineLegacy + stdout + stderr, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLineLegacy + (e.stdout ?? '') + (e.stderr ?? ''), exitCode: e.code ?? 1 };
    }
  }

  async listPorts(): Promise<PortInfo[]> {
    // docker run --rm can't access host USB devices — return empty
    return [];
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    // Upload requires USB device access — not supported via docker run --rm
    const msg = 'Upload not supported in docker run mode (no USB device access)';
    options.onChunk?.(msg + '\n');
    return { success: false, output: msg, exitCode: 1 };
  }

  async libInstall(lib: { name: string; version?: string; url?: string }, configFilePath: string): Promise<void> {
    await this.patchConfigFile(configFilePath);
    if (lib.url) {
      await this.exec(['lib', 'install', '--git-url', lib.url, '--config-file', this.toContainer(configFilePath)]);
    } else {
      const spec = lib.version ? `${lib.name}@${lib.version}` : lib.name;
      await this.exec(['lib', 'install', spec, '--config-file', this.toContainer(configFilePath)]);
    }
  }
}
