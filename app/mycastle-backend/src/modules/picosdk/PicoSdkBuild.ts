import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface PicoSdkBuildResult {
  success: boolean;
  output: string;
  exitCode: number;
  uf2Path?: string; // absolute path on backend filesystem
}

/**
 * Runs a CMake/Pico SDK build via `docker run --rm`.
 * The data directory is mounted so both source (sketches) and build output
 * live under the same container path — no extra path translation needed.
 *
 * Build directory is kept between runs so CMake incremental builds work and
 * the FetchContent deps (picotool, pioasm) are not re-downloaded each time.
 */
export class PicoSdkBuild {
  constructor(
    private readonly imageName: string,
    /** Host-side root of the data dir (passed to -v flag). */
    private readonly hostDataDir: string,
    /** Backend-side root of the data dir (used for path.relative). Defaults to hostDataDir. */
    private readonly backendDataDir: string = hostDataDir,
    private readonly containerDataDir: string = '/workspace/data',
  ) {}

  private toContainer(backendPath: string): string {
    const rel = path.relative(this.backendDataDir, backendPath).split(path.sep).join('/');
    return `${this.containerDataDir}/${rel}`;
  }

  private buildScript(cSrc: string, cBuild: string, picoBoard: string, picoPlatform: string): string {
    return [
      `set -e`,
      `cd "${cBuild}"`,
      // Remove stale CMake cache to prevent "changed variables require cache delete" re-run
      // which would lose the -D flags and cause cmake to search for arm-none-eabi-gcc
      // relative to the build dir instead of the toolchain path.
      `rm -f "${cBuild}/CMakeCache.txt"`,
      `cmake "${cSrc}" -DPICO_BOARD=${picoBoard} -DPICO_PLATFORM=${picoPlatform} -DCMAKE_ASM_COMPILER=/opt/arm-toolchain/bin/arm-none-eabi-gcc`,
      `make -j$(nproc)`,
      // pico_add_extra_outputs() already generates a .uf2 during make — just find and copy it.
      // This works for both rp2040 and rp2350 without needing picotool.
      `UF2=$(find "${cBuild}" -name '*.uf2' -not -path '*/_deps/*' | head -1)`,
      `[ -n "$UF2" ] || { echo "ERROR: no .uf2 found after build — check that pico_add_extra_outputs() is called in CMakeLists.txt"; exit 1; }`,
      `cp "$UF2" "${cBuild}/output.uf2"`,
      `echo "=== UF2 ready: $UF2 ==="`,
    ].join('\n');
  }

  /** Streaming build — calls onData for each line, resolves when done. */
  async build(
    sketchDir: string,
    buildDir: string,
    picoBoard: string,
    picoPlatform: string,
    onData?: (line: string) => void,
  ): Promise<PicoSdkBuildResult> {
    await fs.mkdir(buildDir, { recursive: true });

    const cSrc = this.toContainer(sketchDir);
    const cBuild = this.toContainer(buildDir);
    const script = this.buildScript(cSrc, cBuild, picoBoard, picoPlatform);

    const header = `$ docker run --rm -v ${this.hostDataDir}:${this.containerDataDir} ${this.imageName} [cmake build]\n`;
    onData?.(header);

    return new Promise((resolve) => {
      const proc = spawn('docker', [
        'run', '--rm',
        '-v', `${this.hostDataDir}:${this.containerDataDir}`,
        this.imageName,
        'bash', '-c', script,
      ]);

      const chunks: string[] = [header];

      const handleChunk = (data: Buffer) => {
        const text = data.toString();
        chunks.push(text);
        onData?.(text);
      };

      proc.stdout.on('data', handleChunk);
      proc.stderr.on('data', handleChunk);

      proc.on('close', (code) => {
        const output = chunks.join('');
        const success = code === 0;
        resolve({
          success,
          output,
          exitCode: code ?? 1,
          uf2Path: success ? path.join(buildDir, 'output.uf2') : undefined,
        });
      });

      proc.on('error', (err) => {
        const msg = `\nFailed to start docker: ${err.message}\n`;
        chunks.push(msg);
        onData?.(msg);
        resolve({ success: false, output: chunks.join(''), exitCode: 1 });
      });
    });
  }
}
