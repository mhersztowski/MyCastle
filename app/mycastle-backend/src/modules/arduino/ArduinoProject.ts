import * as path from 'path';
import * as fs from 'fs/promises';
import type { ArduinoCli, CompileResult, MinisConfig, UploadResult } from './ArduinoCli.js';

export class ArduinoProject {
  private readonly projectDir: string;

  constructor(
    private readonly cli: ArduinoCli,
    private readonly rootDir: string,
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
  get configFile(): string { return path.join(this.projectDir, 'custom-config.yaml'); }
  sketchBuildDir(sketchName: string): string {
    // Include a short FQBN hash in the build dir name so changing the FQBN (e.g. switching
    // USBMode) always gets a fresh directory. Docker writes root-owned files that Node.js
    // cannot delete, so a single shared .build/ would retain stale core.a across FQBN changes.
    let h = 5381;
    for (let i = 0; i < this.fqbn.length; i++) {
      h = (((h << 5) + h) + this.fqbn.charCodeAt(i)) & 0xffffffff;
    }
    const hash = Math.abs(h).toString(36).slice(0, 6);
    return path.join(this.sketchesDir, sketchName, `.build_${hash}`);
  }

  async ensureConfig(): Promise<void> {
    const content = `directories:\n  user: ${this.projectDir}\nlibrary:\n  enable_unsafe_install: true\n`;
    await fs.writeFile(this.configFile, content, 'utf-8');
  }

  async ensureDirs(sketchName: string): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.sketchBuildDir(sketchName), { recursive: true });
    await fs.mkdir(this.librariesDir, { recursive: true });
  }

  async compile(sketchName: string, minisConfig?: MinisConfig, libraries?: Array<{ name: string; version?: string; url?: string }>, onChunk?: (chunk: string) => void, options?: { useMinisC?: boolean; miniscRuntimeDir?: string }): Promise<CompileResult> {
    await this.ensureConfig();
    await this.ensureDirs(sketchName);
    await this.cleanDir(this.outputDir);

    // Install required libraries into project-local libraries dir
    const libLogs: string[] = [];
    const extraLibraryPaths: string[] = [];
    for (const lib of libraries ?? []) {
      // Local drive library — reference directly via --library, no copying needed.
      if (lib.url?.startsWith('drive://')) {
        const relPath = lib.url.slice('drive://'.length);
        const srcPath = path.resolve(this.rootDir, relPath);
        // Path traversal guard.
        if (!srcPath.startsWith(path.resolve(this.rootDir))) {
          libLogs.push(`[lib] blocked path traversal: ${relPath}`);
          continue;
        }
        extraLibraryPaths.push(srcPath);
        libLogs.push(`[lib] using local lib "${path.basename(srcPath)}" from drive`);
        continue;
      }
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

    // Inject MinisC C++ runtime when useMinisC is requested
    if (options?.useMinisC && options.miniscRuntimeDir) {
      const dest = path.join(this.librariesDir, 'MinisC');
      await fs.mkdir(dest, { recursive: true });
      const runtimeFiles = await fs.readdir(options.miniscRuntimeDir);
      for (const file of runtimeFiles) {
        await fs.copyFile(
          path.join(options.miniscRuntimeDir, file),
          path.join(dest, file),
        );
      }
      extraLibraryPaths.push(dest);
      libLogs.push(`[lib] injected MinisC runtime (${runtimeFiles.length} files)`);
    }

    const sketchPath = path.join(this.sketchesDir, sketchName, `${sketchName}.ino`);
    const headerPath = path.join(this.sketchesDir, sketchName, 'MinisConfig.h');
    const hooksPath  = path.join(this.sketchesDir, sketchName, 'MinisHooks.cpp');

    // Platform hook: initVariant() is a weak symbol in ESP32 Arduino 3.0.7
    // (esp32-hal-misc.c:222), called from initArduino() in app_main() BEFORE
    // loopTask / setup() is created.  With HWCDC (waveshare_esp32_s3_zero default,
    // usb_mode=1) Serial.operator bool() calls HWCDC::isCDC_Connected(), which
    // enables the INTR_SERIAL_IN_EMPTY ISR.  Without that ISR, data written via
    // Serial.print() in setup() sits in the ring buffer forever and never reaches
    // the host — even when the terminal is open.  The loop here enables the ISR
    // by polling isCDC_Connected() and exits as soon as USB is physically present
    // (~50 ms).  The 200 ms tail delay lets the Web Serial reader start before
    // setup() fires its first println.  10-second overall timeout lets the board
    // run normally when no USB cable is attached.
    // initVariant() is a weak symbol (esp32-hal-misc.c) called before setup().
    // With HWCDC (usb_mode=1) the TX ISR (INTR_SERIAL_IN_EMPTY) is only armed
    // once isCDC_Connected() is called — that happens inside the while(!Serial)
    // loop below.  Without it, Serial.print() data sits in the ring buffer
    // forever and never reaches the host.
    const hooks = [
      '#include "Arduino.h"',
      'void initVariant() {',
      '  unsigned long start = millis();',
      '  while (!Serial && (millis() - start < 500UL)) { delay(10); }',
      '}',
    ].join('\n') + '\n';
    await fs.writeFile(hooksPath, hooks, 'utf-8');

    if (minisConfig) {
      const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const header = [
        '#pragma once',
        `#define MINIS_DEVICE_NAME "${esc(minisConfig.deviceName)}"`,
        `#define MINIS_WIFI_SSID "${esc(minisConfig.wifiSsid)}"`,
        `#define MINIS_WIFI_PASSWORD "${esc(minisConfig.wifiPassword)}"`,
        `#define MINIS_CONFIG "${esc(minisConfig.architectureJson)}"`,
      ].join('\n') + '\n';
      await fs.writeFile(headerPath, header, 'utf-8');
    }

    const buildDir = this.sketchBuildDir(sketchName);
    if (libLogs.length && onChunk) onChunk(libLogs.join('\n') + '\n');

    const result = await this.cli.compile({
      fqbn: this.fqbn,
      sketchPath,
      configFilePath: this.configFile,
      outputDir: this.outputDir,
      buildDir,
      verbose: true,
      extraLibraryPaths: extraLibraryPaths.length ? extraLibraryPaths : undefined,
      onChunk,
    });

    if (libLogs.length > 0) {
      result.output = libLogs.join('\n') + '\n\n' + result.output;
    }

    await this.cleanDir(buildDir);

    // List output files
    try {
      const entries = await fs.readdir(this.outputDir);
      result.outputFiles = entries;
    } catch { /* empty */ }

    return result;
  }

  async upload(sketchName: string, port: string, onChunk?: (chunk: string) => void): Promise<UploadResult> {
    const sketchPath = path.join(this.sketchesDir, sketchName, `${sketchName}.ino`);
    return this.cli.upload({
      fqbn: this.fqbn,
      sketchPath,
      port,
      configFilePath: this.configFile,
      verbose: true,
      onChunk,
    });
  }

  private async readAllLibraryDeps(): Promise<string[]> {
    const deps: string[] = [];
    try {
      const dirs = await fs.readdir(this.librariesDir);
      for (const dir of dirs) {
        // Standard Arduino format: library.properties with "depends=" line
        try {
          const content = await fs.readFile(path.join(this.librariesDir, dir, 'library.properties'), 'utf-8');
          for (const line of content.split('\n')) {
            const m = line.match(/^depends\s*=\s*(.+)/);
            if (m) deps.push(...m[1].split(',').map(d => d.trim()).filter(Boolean));
          }
        } catch { /* no library.properties */ }

        // PlatformIO/npm format: library.json with dependencies[].name array
        // (used by e.g. ESP-DASH which omits "depends=" from library.properties)
        try {
          const content = await fs.readFile(path.join(this.librariesDir, dir, 'library.json'), 'utf-8');
          const json = JSON.parse(content) as { dependencies?: Array<{ name?: string }> };
          if (Array.isArray(json.dependencies)) {
            for (const dep of json.dependencies) {
              if (dep.name) deps.push(dep.name);
            }
          }
        } catch { /* no library.json */ }
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
