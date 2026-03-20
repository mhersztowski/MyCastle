import { execFile } from 'child_process';
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
    private readonly containerDataDir: string = '/workspace/data',
  ) {}

  private toContainer(hostPath: string): string {
    const rel = path.relative(this.hostDataDir, hostPath).split(path.sep).join('/');
    return `${this.containerDataDir}/${rel}`;
  }

  async deploy(options: DeployOptions): Promise<DeployResult> {
    const args = ['connect', options.port];
    for (const f of options.files) {
      args.push('cp', this.toContainer(f.localPath), `:${f.remoteName}`);
      args.push('+');
    }
    if (args[args.length - 1] === '+') args.pop();

    const cmdLine = `$ docker run --rm ${this.imageName} mpremote ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await execFileAsync('docker', [
        'run', '--rm',
        '--device', `${options.port}:${options.port}`,
        '-v', `${this.hostDataDir}:${this.containerDataDir}`,
        this.imageName,
        'mpremote', ...args,
      ], { maxBuffer: MAX_BUFFER });
      const output = [stdout, stderr].filter(Boolean).join('');
      return { success: true, output: cmdLine + output, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      const output = [e.stdout, e.stderr].filter(Boolean).join('');
      return { success: false, output: cmdLine + output, exitCode: e.code ?? 1 };
    }
  }
}
