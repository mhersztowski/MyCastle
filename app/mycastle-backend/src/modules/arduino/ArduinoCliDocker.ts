import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ArduinoCli, BoardInfo, CompileOptions, CompileResult, PortInfo, UploadOptions, UploadResult } from './ArduinoCli.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;

export class ArduinoCliDocker implements ArduinoCli {
  constructor(private readonly containerName: string) {}

  private async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync('docker', ['exec', this.containerName, 'arduino-cli', ...args], { maxBuffer: MAX_BUFFER });
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
    const args = [
      'compile',
      '-b', options.fqbn,
      options.sketchPath,
      ...(options.verbose ? ['-v'] : []),
      '--config-file', options.configFilePath,
      '--output-dir', options.outputDir,
      '--build-path', options.buildDir,
    ];
    const cmdLine = `$ docker exec ${this.containerName} arduino-cli ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await this.exec(args);
      return { success: true, output: cmdLine + stdout + stderr, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLine + (e.stdout ?? '') + (e.stderr ?? ''), exitCode: e.code ?? 1 };
    }
  }

  async listPorts(): Promise<PortInfo[]> {
    const { stdout } = await this.exec(['board', 'list', '--format', 'json']);
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
    const cmdLine = `$ docker exec ${this.containerName} arduino-cli ${args.join(' ')}\n\n`;
    try {
      const { stdout, stderr } = await this.exec(args);
      return { success: true, output: cmdLine + stdout + stderr, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return { success: false, output: cmdLine + (e.stdout ?? '') + (e.stderr ?? ''), exitCode: e.code ?? 1 };
    }
  }

  async libInstall(lib: { name: string; version?: string; url?: string }, configFilePath: string): Promise<void> {
    if (lib.url) {
      await this.exec(['lib', 'install', '--git-url', lib.url, '--config-file', configFilePath]);
    } else {
      const spec = lib.version ? `${lib.name}@${lib.version}` : lib.name;
      await this.exec(['lib', 'install', spec, '--config-file', configFilePath]);
    }
  }
}
