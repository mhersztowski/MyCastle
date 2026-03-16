import * as path from 'path';
import * as fs from 'fs/promises';
import type { ArduinoCli, CompileResult, MinisConfig, UploadResult } from './ArduinoCli.js';

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
    const content = `directories:\n  user: ${this.projectDir}\nlibrary:\n  enable_unsafe_install: true\n`;
    await fs.writeFile(this.configFile, content, 'utf-8');
  }

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.buildDir, { recursive: true });
    await fs.mkdir(this.librariesDir, { recursive: true });
  }

  async compile(sketchName: string, minisConfig?: MinisConfig, libraries?: Array<{ name: string; version?: string; url?: string }>): Promise<CompileResult> {
    await this.ensureConfig();
    await this.ensureDirs();
    await this.cleanDir(this.outputDir);

    // Install required libraries into project-local libraries dir
    const libLogs: string[] = [];
    for (const lib of libraries ?? []) {
      const spec = lib.url ?? (lib.version ? `${lib.name}@${lib.version}` : lib.name);
      try {
        await this.cli.libInstall(lib, this.configFile);
        libLogs.push(`[lib] installed ${spec}`);
      } catch (err) {
        libLogs.push(`[lib] install ${spec} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Install dependencies declared in library.properties of installed git-url libs
    if ((libraries ?? []).some(l => l.url)) {
      const deps = await this.readAllLibraryDeps();
      for (const dep of deps) {
        if (await this.isLibraryInstalled(dep)) continue;
        try {
          await this.cli.libInstall({ name: dep }, this.configFile);
          libLogs.push(`[lib] installed dep ${dep}`);
        } catch (err) {
          libLogs.push(`[lib] dep ${dep} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const sketchPath = path.join(this.sketchesDir, sketchName, `${sketchName}.ino`);
    const headerPath = path.join(this.sketchesDir, sketchName, 'MinisConfig.h');

    if (minisConfig) {
      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const header = [
        '#pragma once',
        `#define MINIS_DEVICE_SN "${esc(minisConfig.serialNumber)}"`,
        `#define MINIS_WIFI_SSID "${esc(minisConfig.wifiSsid)}"`,
        `#define MINIS_WIFI_PASSWORD "${esc(minisConfig.wifiPassword)}"`,
        `#define MINIS_CONFIG "${esc(minisConfig.architectureJson)}"`,
      ].join('\n') + '\n';
      await fs.writeFile(headerPath, header, 'utf-8');
    }

    const result = await this.cli.compile({
      fqbn: this.fqbn,
      sketchPath,
      configFilePath: this.configFile,
      outputDir: this.outputDir,
      buildDir: this.buildDir,
      verbose: true,
    });

    if (libLogs.length > 0) {
      result.output = libLogs.join('\n') + '\n\n' + result.output;
    }

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

  private async readAllLibraryDeps(): Promise<string[]> {
    const deps: string[] = [];
    try {
      const dirs = await fs.readdir(this.librariesDir);
      for (const dir of dirs) {
        try {
          const propsPath = path.join(this.librariesDir, dir, 'library.properties');
          const content = await fs.readFile(propsPath, 'utf-8');
          for (const line of content.split('\n')) {
            const m = line.match(/^depends\s*=\s*(.+)/);
            if (m) {
              deps.push(...m[1].split(',').map(d => d.trim()).filter(Boolean));
            }
          }
        } catch { /* skip */ }
      }
    } catch { /* librariesDir not readable */ }
    return [...new Set(deps)];
  }

  private async isLibraryInstalled(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.librariesDir, name));
      return true;
    } catch {
      return false;
    }
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
