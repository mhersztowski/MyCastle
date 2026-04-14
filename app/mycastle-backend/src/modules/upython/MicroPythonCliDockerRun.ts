import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { MicroPythonCli, DeployOptions, DeployResult } from './MicroPythonCli.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Runs mpremote via `docker run --rm` with USB device passthrough.
 * The serial port (e.g. /dev/ttyUSB0) is passed as --device automatically.
 */
export class MicroPythonCliDockerRun implements MicroPythonCli {
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

  async deploy(options: DeployOptions): Promise<DeployResult> {
    const mpArgs = ['connect', options.port];
    for (const f of options.files) {
      mpArgs.push('cp', this.toContainer(f.localPath), `:${f.remoteName}`);
      mpArgs.push('+');
    }
    if (mpArgs[mpArgs.length - 1] === '+') mpArgs.pop();

    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const dockerArgs = [
      'run', '--rm',
      '--user', `${uid}:${gid}`,
      '--device', `${options.port}:${options.port}`,
      '-v', `${this.hostDataDir}:${this.containerDataDir}`,
      this.imageName,
      'mpremote', ...mpArgs,
    ];
    const cmdLine = `$ docker run --rm ${this.imageName} mpremote ${mpArgs.join(' ')}\n`;

    if (options.onChunk) {
      const { onChunk } = options;
      onChunk(cmdLine);
      return new Promise<DeployResult>((resolve) => {
        const child = spawn('docker', dockerArgs);
        let out = cmdLine;
        const handle = (data: Buffer) => { const s = data.toString(); out += s; onChunk(s); };
        child.stdout.on('data', handle);
        child.stderr.on('data', handle);
        child.on('close', (code) => resolve({ success: code === 0, output: out, exitCode: code ?? 1 }));
        child.on('error', (err) => { const msg = err.message; out += msg; onChunk(msg); resolve({ success: false, output: out, exitCode: 1 }); });
      });
    }

    const cmdLineLegacy = cmdLine + '\n';
    try {
      const { stdout, stderr } = await execFileAsync('docker', dockerArgs, { maxBuffer: MAX_BUFFER });
      const output = [stdout, stderr].filter(Boolean).join('');
      return { success: true, output: cmdLineLegacy + output, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      const output = [e.stdout, e.stderr].filter(Boolean).join('');
      return { success: false, output: cmdLineLegacy + output, exitCode: e.code ?? 1 };
    }
  }
}
