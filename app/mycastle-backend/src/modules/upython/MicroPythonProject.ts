import * as path from 'path';
import * as fs from 'fs/promises';
import type { MicroPythonCli, DeployResult } from './MicroPythonCli.js';

export interface UpythonLibrary {
  url: string;
  remoteName: string;
}

export class MicroPythonProject {
  private readonly projectDir: string;

  constructor(
    private readonly cli: MicroPythonCli,
    rootDir: string,
    userName: string,
    projectId: string,
  ) {
    this.projectDir = path.resolve(rootDir, 'Minis', 'Users', userName, 'Projects', projectId);
  }

  get srcDir(): string { return path.join(this.projectDir, 'src'); }
  get librariesDir(): string { return path.join(this.projectDir, 'libraries'); }

  async deploy(port: string, libraries?: UpythonLibrary[]): Promise<DeployResult> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.srcDir);
    } catch {
      return { success: false, output: `Source directory not found: ${this.srcDir}`, exitCode: 1 };
    }

    const pyFiles = entries.filter((f) => f.endsWith('.py'));
    if (pyFiles.length === 0) {
      return { success: false, output: 'No .py files found in src/', exitCode: 1 };
    }

    const files = pyFiles.map((f) => ({
      localPath: path.join(this.srcDir, f),
      remoteName: f,
    }));

    // Fetch libraries from GitHub and add to deploy list
    const libLogs: string[] = [];
    if (libraries?.length) {
      await fs.mkdir(this.librariesDir, { recursive: true });
      for (const lib of libraries) {
        try {
          const res = await fetch(lib.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const content = await res.text();
          const localPath = path.join(this.librariesDir, lib.remoteName);
          await fs.writeFile(localPath, content, 'utf-8');
          files.push({ localPath, remoteName: lib.remoteName });
          libLogs.push(`[lib] fetched ${lib.remoteName}`);
        } catch (err) {
          libLogs.push(`[lib] fetch ${lib.remoteName} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const result = await this.cli.deploy({ port, files });
    if (libLogs.length > 0) {
      result.output = libLogs.join('\n') + '\n\n' + result.output;
    }
    return result;
  }
}
