import { execFile } from 'child_process';
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
    const cmdLine = `$ ${this.resolvedPath} ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await execFileAsync(this.resolvedPath, args, { maxBuffer: MAX_BUFFER });
      return { success: true, output: cmdLine + this.formatOutput(stdout, stderr), exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLine + this.formatOutput(e.stdout, e.stderr), exitCode: e.code ?? 1 };
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
    const cmdLine = `$ ${this.resolvedPath} ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await execFileAsync(this.resolvedPath, args, { maxBuffer: MAX_BUFFER });
      return { success: true, output: cmdLine + this.formatOutput(stdout, stderr), exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLine + this.formatOutput(e.stdout, e.stderr), exitCode: e.code ?? 1 };
    }
  }

  private formatOutput(stdout?: string, stderr?: string): string {
    let out = '';
    if (stdout) out += stdout;
    if (stderr) out += stderr;
    return out;
  }
}
