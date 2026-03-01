import * as path from 'path';
import * as fs from 'fs/promises';
import type { ArduinoCli, CompileResult, UploadResult } from './ArduinoCli.js';

export class ArduinoProject {
  private readonly projectDir: string;

  constructor(
    private readonly cli: ArduinoCli,
    rootDir: string,
    userName: string,
    projectId: string,
    private readonly fqbn: string,
  ) {
    this.projectDir = path.resolve(rootDir, 'Minis', 'Users', userName, 'Projects', projectId);
  }

  get sketchesDir(): string { return path.join(this.projectDir, 'sketches'); }
  get examplesDir(): string { return path.join(this.projectDir, 'examples'); }
  get librariesDir(): string { return path.join(this.projectDir, 'libraries'); }
  get outputDir(): string { return path.join(this.projectDir, 'output'); }
  get buildDir(): string { return path.join(this.projectDir, 'build'); }
  get configFile(): string { return path.join(this.projectDir, 'custom-config.yaml'); }

  async ensureConfig(): Promise<void> {
    const content = `directories:\n  user: ${this.projectDir}\n`;
    await fs.writeFile(this.configFile, content, 'utf-8');
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.buildDir, { recursive: true });
    await fs.mkdir(this.librariesDir, { recursive: true });
  }

  async compile(sketchName: string): Promise<CompileResult> {
    await this.ensureConfig();
    await this.ensureDirs();
    await this.cleanDir(this.outputDir);

    const sketchPath = path.join(this.sketchesDir, sketchName, `${sketchName}.ino`);

    const result = await this.cli.compile({
      fqbn: this.fqbn,
      sketchPath,
      configFilePath: this.configFile,
      outputDir: this.outputDir,
      buildDir: this.buildDir,
      verbose: true,
    });

    await this.cleanDir(this.buildDir);

    // List output files
    try {
      const entries = await fs.readdir(this.outputDir);
      result.outputFiles = entries;
    } catch { /* empty */ }

    return result;
  }

  async upload(sketchName: string, port: string): Promise<UploadResult> {
    const sketchPath = path.join(this.sketchesDir, sketchName, `${sketchName}.ino`);
    return this.cli.upload({
      fqbn: this.fqbn,
      sketchPath,
      port,
      configFilePath: this.configFile,
      verbose: true,
    });
  }

  private async cleanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
    } catch { /* ignore if already empty */ }
  }
}
