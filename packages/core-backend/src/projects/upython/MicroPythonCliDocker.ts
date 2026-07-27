import { execFile } from 'child_process';
import { promisify } from 'util';
import type { MicroPythonCli, DeployOptions, DeployResult } from './MicroPythonCli.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

export class MicroPythonCliDocker implements MicroPythonCli {
  constructor(private readonly containerName: string) {}

  private async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('docker', ['exec', this.containerName, 'mpremote', ...args], { maxBuffer: MAX_BUFFER });
  }

  async deploy(options: DeployOptions): Promise<DeployResult> {
    const args = ['connect', options.port];
    for (const f of options.files) {
      args.push('cp', f.localPath, `:${f.remoteName}`);
      args.push('+');
    }
    if (args[args.length - 1] === '+') args.pop();

    const cmdLine = `$ docker exec ${this.containerName} mpremote ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await this.exec(args);
      const output = [stdout, stderr].filter(Boolean).join('');
      return { success: true, output: cmdLine + output, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      const output = [e.stdout, e.stderr].filter(Boolean).join('');
      return { success: false, output: cmdLine + output, exitCode: e.code ?? 1 };
    }
  }
}
