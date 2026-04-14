import { execFile, spawn } from 'child_process';
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

    const cmdLine = `$ ${this.resolvedPath} ${args.join(' ')}\n`;

    if (options.onChunk) {
      const { onChunk } = options;
      onChunk(cmdLine);
      return new Promise<DeployResult>((resolve) => {
        const child = spawn(this.resolvedPath, args);
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
      const { stdout, stderr } = await execFileAsync(this.resolvedPath, args, { maxBuffer: MAX_BUFFER });
      const output = [stdout, stderr].filter(Boolean).join('');
      return { success: true, output: cmdLineLegacy + output, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      const output = [e.stdout, e.stderr].filter(Boolean).join('');
      return { success: false, output: cmdLineLegacy + output, exitCode: e.code ?? 1 };
    }
  }
}
