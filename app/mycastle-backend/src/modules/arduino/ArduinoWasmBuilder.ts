import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

export interface WasmBuildResult {
  success: boolean;
  output: string;
  exitCode: number;
}

/**
 * Compiles an Arduino sketch to WebAssembly using Emscripten in Docker.
 * The resulting sketch.js + sketch.wasm are served by the backend for in-browser simulation.
 */
export class ArduinoWasmBuilder {
  private readonly containerDataDir = '/workspace/data';

  constructor(
    private readonly dockerImage: string,
    /** Path to data dir on the Docker host (may differ from backendDataDir when backend runs in Docker). */
    private readonly hostDataDir: string,
    /** Path to data dir as seen by the backend process. */
    private readonly backendDataDir: string = hostDataDir,
  ) {}

  private toContainer(backendPath: string): string {
    const rel = path.relative(this.backendDataDir, backendPath).split(path.sep).join('/');
    return `${this.containerDataDir}/${rel}`;
  }

  wasmOutputDir(userName: string, projectId: string, sketchName: string): string {
    return path.resolve(
      this.backendDataDir,
      'Minis', 'Users', userName, 'Projects', projectId, 'wasm-output', sketchName,
    );
  }

  async build(
    userName: string,
    projectId: string,
    sketchName: string,
    onOutput: (chunk: string) => void,
  ): Promise<WasmBuildResult> {
    const projectDir = path.resolve(
      this.backendDataDir, 'Minis', 'Users', userName, 'Projects', projectId,
    );
    const sketchDir = path.join(projectDir, 'sketches', sketchName);
    const outputDir = this.wasmOutputDir(userName, projectId, sketchName);
    const buildDir  = path.join(outputDir, '_build');

    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(buildDir,  { recursive: true });
    await this.cleanDir(buildDir);

    // Collect source files from the sketch directory
    let srcFiles: string[];
    try {
      srcFiles = await fs.readdir(sketchDir);
    } catch {
      const msg = `Sketch directory not found: sketches/${sketchName}`;
      onOutput(msg + '\n');
      return { success: false, output: msg, exitCode: 1 };
    }

    // Transform .ino → .cpp (add implicit Arduino.h include)
    const cppFiles: string[] = [];
    for (const f of srcFiles) {
      const ext = path.extname(f).toLowerCase();
      if (ext === '.ino') {
        const original = await fs.readFile(path.join(sketchDir, f), 'utf-8');
        const cppName = path.basename(f, '.ino') + '.cpp';
        // Arduino IDE inserts Arduino.h and forward declarations implicitly
        const transformed = `#include "Arduino.h"\n\n${original}`;
        await fs.writeFile(path.join(buildDir, cppName), transformed, 'utf-8');
        cppFiles.push(cppName);
      } else if (['.cpp', '.c'].includes(ext)) {
        await fs.copyFile(path.join(sketchDir, f), path.join(buildDir, f));
        cppFiles.push(f);
      } else if (['.h', '.hpp'].includes(ext)) {
        await fs.copyFile(path.join(sketchDir, f), path.join(buildDir, f));
      }
    }

    if (cppFiles.length === 0) {
      const msg = 'No source files found (.ino, .cpp, .c)';
      onOutput(msg + '\n');
      return { success: false, output: msg, exitCode: 1 };
    }

    const containerBuildDir  = this.toContainer(buildDir);
    const containerOutputDir = this.toContainer(outputDir);

    // Include project-local libraries (e.g. a header-only Qt-clone UI lib) so
    // sketches can `#include` them. The WASM path does not run arduino-cli's
    // library installer, so we surface whatever is already present under the
    // project's `libraries/` dir: each lib's `src/` (and root) is added to the
    // include path and any C/C++ sources found are compiled in.
    const { includeArgs: libIncludeArgs, sourceArgs: libSourceArgs } =
      await this.collectProjectLibraries(path.join(projectDir, 'libraries'));

    const sourceArgs = cppFiles.map(f => `${containerBuildDir}/${f}`);
    const emccArgs = [
      ...sourceArgs,
      ...libSourceArgs,
      '/arduino-mock/Arduino.cpp',
      '-I', '/arduino-mock',
      '-I', containerBuildDir,
      ...libIncludeArgs,
      '-std=c++17',
      '-s', 'ASYNCIFY=1',
      '-s', "EXPORTED_FUNCTIONS=['_setup','_loop','_arduino_serial_push','_arduino_serial_available','_minis_canvas_push_event','_malloc','_free']",
      '-s', "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8']",
      '-s', 'MODULARIZE=1',
      '-s', 'EXPORT_NAME=createArduinoModule',
      '-s', 'ALLOW_MEMORY_GROWTH=1',
      '-s', 'NO_EXIT_RUNTIME=1',
      '-O2',
      '-o', `${containerOutputDir}/sketch.js`,
    ];

    const dockerArgs = [
      'run', '--rm',
      '-v', `${this.hostDataDir}:${this.containerDataDir}`,
      this.dockerImage,
      'emcc',
      ...emccArgs,
    ];

    const cmdLine = `$ docker run --rm ${this.dockerImage} emcc ${emccArgs.join(' ')}\n`;
    onOutput(cmdLine);

    return new Promise<WasmBuildResult>((resolve) => {
      const child = spawn('docker', dockerArgs);
      let out = cmdLine;
      const handle = (data: Buffer) => {
        const s = data.toString();
        out += s;
        onOutput(s);
      };
      child.stdout.on('data', handle);
      child.stderr.on('data', handle);
      child.on('close', (code) => resolve({ success: code === 0, output: out, exitCode: code ?? 1 }));
      child.on('error', (err) => {
        const msg = `Failed to start Docker: ${err.message}\n`;
        out += msg;
        onOutput(msg);
        resolve({ success: false, output: out, exitCode: 1 });
      });
    });
  }

  /**
   * Scan a project's `libraries/` dir and return emcc include flags + source
   * files for every Arduino library found. Arduino libraries keep their public
   * headers either in `src/` (modern layout) or at the library root (legacy);
   * we add whichever exists to the include path and compile all C/C++ sources
   * beneath it. Missing dir → empty result (the common case).
   */
  private async collectProjectLibraries(
    librariesDir: string,
  ): Promise<{ includeArgs: string[]; sourceArgs: string[] }> {
    const includeArgs: string[] = [];
    const sourceArgs: string[] = [];

    let libDirs: string[];
    try {
      const entries = await fs.readdir(librariesDir, { withFileTypes: true });
      libDirs = entries.filter(e => e.isDirectory()).map(e => path.join(librariesDir, e.name));
    } catch {
      return { includeArgs, sourceArgs }; // no libraries/ dir
    }

    for (const libRoot of libDirs) {
      const srcDir = path.join(libRoot, 'src');
      const hasSrc = await this.dirExists(srcDir);
      const codeRoot = hasSrc ? srcDir : libRoot;

      includeArgs.push('-I', this.toContainer(codeRoot));

      for (const file of await this.walkSources(codeRoot)) {
        sourceArgs.push(this.toContainer(file));
      }
    }

    return { includeArgs, sourceArgs };
  }

  private async dirExists(dir: string): Promise<boolean> {
    try {
      const st = await fs.stat(dir);
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  /** Recursively collect .c/.cc/.cpp files under a directory (skips examples/). */
  private async walkSources(dir: string): Promise<string[]> {
    const out: string[] = [];
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'examples' || e.name === '.git') continue;
        out.push(...await this.walkSources(full));
      } else if (/\.(cpp|cc|c)$/i.test(e.name)) {
        out.push(full);
      }
    }
    return out;
  }

  private async cleanDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  }
}
