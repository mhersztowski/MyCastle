import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ArduinoProject } from './ArduinoProject.js';
import type { ArduinoCli, CompileOptions, CompileResult, UploadOptions, UploadResult } from './ArduinoCli.js';

function createMockCli(overrides?: Partial<ArduinoCli>): ArduinoCli {
  return {
    listBoards: vi.fn().mockResolvedValue([]),
    listPorts: vi.fn().mockResolvedValue([]),
    compile: vi.fn().mockResolvedValue({ success: true, output: 'OK', exitCode: 0 } as CompileResult),
    upload: vi.fn().mockResolvedValue({ success: true, output: 'OK', exitCode: 0 } as UploadResult),
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-project-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ArduinoProject', () => {
  describe('path getters', () => {
    it('computes project paths correctly', () => {
      const cli = createMockCli();
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'esp32:esp32:esp32');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');

      expect(project.sketchesDir).toBe(path.join(base, 'sketches'));
      expect(project.examplesDir).toBe(path.join(base, 'examples'));
      expect(project.librariesDir).toBe(path.join(base, 'libraries'));
      expect(project.outputDir).toBe(path.join(base, 'output'));
      expect(project.buildDir).toBe(path.join(base, 'build'));
      expect(project.configFile).toBe(path.join(base, 'custom-config.yaml'));
    });
  });

  describe('ensureConfig', () => {
    it('creates custom-config.yaml with correct directories.user', async () => {
      const cli = createMockCli();
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'esp32:esp32:esp32');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');
      await fs.mkdir(base, { recursive: true });

      await project.ensureConfig();

      const content = await fs.readFile(project.configFile, 'utf-8');
      expect(content).toContain('directories:');
      expect(content).toContain(`user: ${base}`);
    });
  });

  describe('ensureDirs', () => {
    it('creates output, build, libraries directories', async () => {
      const cli = createMockCli();
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'esp32:esp32:esp32');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');
      await fs.mkdir(base, { recursive: true });

      await project.ensureDirs();

      const outputStat = await fs.stat(project.outputDir);
      const buildStat = await fs.stat(project.buildDir);
      const libStat = await fs.stat(project.librariesDir);
      expect(outputStat.isDirectory()).toBe(true);
      expect(buildStat.isDirectory()).toBe(true);
      expect(libStat.isDirectory()).toBe(true);
    });
  });

  describe('compile', () => {
    it('calls cli.compile with correct options and cleans build dir', async () => {
      const compileMock = vi.fn().mockResolvedValue({ success: true, output: 'Build OK', exitCode: 0 });
      const cli = createMockCli({ compile: compileMock });
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'esp32:esp32:esp32');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');
      const sketchDir = path.join(base, 'sketches', 'blink');
      await fs.mkdir(sketchDir, { recursive: true });
      await fs.writeFile(path.join(sketchDir, 'blink.ino'), 'void setup() {}');

      const result = await project.compile('blink');

      expect(result.success).toBe(true);
      expect(compileMock).toHaveBeenCalledOnce();
      const opts: CompileOptions = compileMock.mock.calls[0][0];
      expect(opts.fqbn).toBe('esp32:esp32:esp32');
      expect(opts.sketchPath).toBe(path.join(base, 'sketches', 'blink', 'blink.ino'));
      expect(opts.configFilePath).toBe(path.join(base, 'custom-config.yaml'));
      expect(opts.outputDir).toBe(path.join(base, 'output'));
      expect(opts.buildDir).toBe(path.join(base, 'build'));
      expect(opts.verbose).toBe(true);

      // Build dir should be cleaned after compile
      const buildEntries = await fs.readdir(project.buildDir);
      expect(buildEntries).toHaveLength(0);
    });

    it('creates config file before compiling', async () => {
      const compileMock = vi.fn().mockResolvedValue({ success: true, output: '', exitCode: 0 });
      const cli = createMockCli({ compile: compileMock });
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'arduino:avr:uno');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');
      const sketchDir = path.join(base, 'sketches', 'test');
      await fs.mkdir(sketchDir, { recursive: true });

      await project.compile('test');

      const configContent = await fs.readFile(project.configFile, 'utf-8');
      expect(configContent).toContain(`user: ${base}`);
    });

    it('returns output files list from output dir', async () => {
      const compileMock = vi.fn().mockImplementation(async (opts: CompileOptions) => {
        // Simulate cli creating output files
        await fs.writeFile(path.join(opts.outputDir, 'sketch.ino.bin'), 'binary');
        await fs.writeFile(path.join(opts.outputDir, 'sketch.ino.elf'), 'elf');
        return { success: true, output: 'OK', exitCode: 0 };
      });
      const cli = createMockCli({ compile: compileMock });
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'esp32:esp32:esp32');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');
      await fs.mkdir(path.join(base, 'sketches', 's1'), { recursive: true });

      const result = await project.compile('s1');

      expect(result.outputFiles).toBeDefined();
      expect(result.outputFiles).toContain('sketch.ino.bin');
      expect(result.outputFiles).toContain('sketch.ino.elf');
    });
  });

  describe('upload', () => {
    it('calls cli.upload with correct options', async () => {
      const uploadMock = vi.fn().mockResolvedValue({ success: true, output: 'Upload OK', exitCode: 0 });
      const cli = createMockCli({ upload: uploadMock });
      const project = new ArduinoProject(cli, tmpDir, 'alice', 'proj1', 'esp32:esp32:esp32');
      const base = path.resolve(tmpDir, 'Minis', 'Users', 'alice', 'Projects', 'proj1');

      const result = await project.upload('blink', '/dev/ttyUSB0');

      expect(result.success).toBe(true);
      const opts: UploadOptions = uploadMock.mock.calls[0][0];
      expect(opts.fqbn).toBe('esp32:esp32:esp32');
      expect(opts.sketchPath).toBe(path.join(base, 'sketches', 'blink', 'blink.ino'));
      expect(opts.port).toBe('/dev/ttyUSB0');
      expect(opts.configFilePath).toBe(path.join(base, 'custom-config.yaml'));
      expect(opts.verbose).toBe(true);
    });
  });
});
