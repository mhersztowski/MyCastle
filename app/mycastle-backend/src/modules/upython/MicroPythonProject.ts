import * as path from 'path';
import * as fs from 'fs/promises';
import type { MicroPythonCli, DeployResult } from './MicroPythonCli.js';

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

  async deploy(port: string): Promise<DeployResult> {
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

    return this.cli.deploy({ port, files });
  }
}
