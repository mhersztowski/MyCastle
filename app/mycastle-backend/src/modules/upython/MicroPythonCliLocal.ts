import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import type { MicroPythonCli, DeployOptions, DeployResult } from './MicroPythonCli.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export class MicroPythonCliLocal implements MicroPythonCli {
  private readonly resolvedPath: string;

  constructor(cliPath: string) {
    this.resolvedPath = expandHome(cliPath);
  }

  async deploy(options: DeployOptions): Promise<DeployResult> {
    // mpremote connect <port> cp file1 :dest1 + cp file2 :dest2 + ...
    const args = ['connect', options.port];
    for (const f of options.files) {
      args.push('cp', f.localPath, `:${f.remoteName}`);
      args.push('+');
    }
    // remove trailing '+'
    if (args[args.length - 1] === '+') args.pop();

    const cmdLine = `$ ${this.resolvedPath} ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await execFileAsync(this.resolvedPath, args, { maxBuffer: MAX_BUFFER });
      const output = [stdout, stderr].filter(Boolean).join('');
      return { success: true, output: cmdLine + output, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      const output = [e.stdout, e.stderr].filter(Boolean).join('');
      return { success: false, output: cmdLine + output, exitCode: e.code ?? 1 };
    }
  }
}
