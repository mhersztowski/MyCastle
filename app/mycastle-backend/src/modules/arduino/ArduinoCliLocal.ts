import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import type { ArduinoCli, BoardInfo, CompileOptions, CompileResult, PortInfo, UploadOptions, UploadResult } from './ArduinoCli.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export class ArduinoCliLocal implements ArduinoCli {
  private readonly resolvedPath: string;

  constructor(cliPath: string) {
    this.resolvedPath = expandHome(cliPath);
  }

  async listBoards(): Promise<BoardInfo[]> {
    const { stdout } = await execFileAsync(this.resolvedPath, ['board', 'listall', '--format', 'json'], { maxBuffer: MAX_BUFFER });
    const parsed = JSON.parse(stdout);
    return (parsed.boards ?? []).map((b: { fqbn: string; name: string }) => ({
      fqbn: b.fqbn,
      name: b.name,
    }));
  }

  async compile(options: CompileOptions): Promise<CompileResult> {
    const args = [
      'compile',
      '-b', options.fqbn,
      options.sketchPath,
      ...(options.verbose ? ['-v'] : []),
      '--config-file', options.configFilePath,
      '--output-dir', options.outputDir,
      '--build-path', options.buildDir,
    ];
    const cmdLine = `$ ${this.resolvedPath} ${args.join(' ')}\n`;

    if (options.onChunk) {
      // Streaming mode via spawn
      const { onChunk } = options;
      onChunk(cmdLine);
      return new Promise<CompileResult>((resolve) => {
        const child = spawn(this.resolvedPath, args);
        let out = cmdLine;
        const handle = (data: Buffer) => {
          const s = data.toString();
          out += s;
          onChunk(s);
        };
        child.stdout.on('data', handle);
        child.stderr.on('data', handle);
        child.on('close', (code) => {
          resolve({ success: code === 0, output: out, exitCode: code ?? 1 });
        });
        child.on('error', (err) => {
          const msg = err.message;
          out += msg;
          onChunk(msg);
          resolve({ success: false, output: out, exitCode: 1 });
        });
      });
    }

    // Buffered mode (legacy)
    const cmdLineLegacy = cmdLine + '\n';
    try {
      const { stdout, stderr } = await execFileAsync(this.resolvedPath, args, { maxBuffer: MAX_BUFFER });
      return { success: true, output: cmdLineLegacy + this.formatOutput(stdout, stderr), exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLineLegacy + this.formatOutput(e.stdout, e.stderr), exitCode: e.code ?? 1 };
    }
  }

  async listPorts(): Promise<PortInfo[]> {
    const { stdout } = await execFileAsync(this.resolvedPath, ['board', 'list', '--format', 'json'], { maxBuffer: MAX_BUFFER });
    const parsed = JSON.parse(stdout);
    return (parsed.detected_ports ?? []).map((p: { port?: { address?: string; protocol?: string }; matching_boards?: Array<{ name?: string }> }) => ({
      address: p.port?.address ?? '',
      protocol: p.port?.protocol ?? '',
      boardName: p.matching_boards?.[0]?.name,
    }));
  }

  async upload(options: UploadOptions): Promise<UploadResult> {
    const args = [
      'upload',
      '-b', options.fqbn,
      '-p', options.port,
      options.sketchPath,
      ...(options.verbose ? ['-v'] : []),
      '--config-file', options.configFilePath,
    ];
    const cmdLine = `$ ${this.resolvedPath} ${args.join(' ')}\n`;

    if (options.onChunk) {
      const { onChunk } = options;
      onChunk(cmdLine);
      return new Promise<UploadResult>((resolve) => {
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
      return { success: true, output: cmdLineLegacy + this.formatOutput(stdout, stderr), exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLineLegacy + this.formatOutput(e.stdout, e.stderr), exitCode: e.code ?? 1 };
    }
  }

  async libInstall(lib: { name: string; version?: string; url?: string }, configFilePath: string): Promise<void> {
    if (lib.url) {
      await execFileAsync(this.resolvedPath, ['lib', 'install', '--git-url', lib.url, '--config-file', configFilePath], { maxBuffer: MAX_BUFFER });
    } else {
      const spec = lib.version ? `${lib.name}@${lib.version}` : lib.name;
      await execFileAsync(this.resolvedPath, ['lib', 'install', spec, '--config-file', configFilePath], { maxBuffer: MAX_BUFFER });
    }
  }

  private formatOutput(stdout?: string, stderr?: string): string {
    let out = '';
    if (stdout) out += stdout;
    if (stderr) out += stderr;
    return out;
  }
}
