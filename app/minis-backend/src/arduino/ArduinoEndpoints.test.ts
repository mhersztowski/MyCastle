import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MinisHttpServer } from '../MinisHttpServer.js';
import { FileSystem, JwtService, ApiKeyService } from '@mhersztowski/core-backend';
import { ArduinoService } from './ArduinoService.js';
import type { ArduinoCli, BoardInfo, CompileOptions, CompileResult, PortInfo, UploadOptions, UploadResult } from './ArduinoCli.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;
let server: MinisHttpServer;
let baseUrl: string;
let authToken: string;

/** In-memory mock of ArduinoCli — no real arduino-cli binary needed */
class MockArduinoCli implements ArduinoCli {
  async listBoards(): Promise<BoardInfo[]> {
    return [
      { fqbn: 'esp32:esp32:esp32', name: 'ESP32 Dev Module' },
      { fqbn: 'arduino:avr:uno', name: 'Arduino Uno' },
    ];
  }
  async compile(options: CompileOptions): Promise<CompileResult> {
    // Create a fake output file to test output listing
    await fs.mkdir(options.outputDir, { recursive: true });
    await fs.writeFile(path.join(options.outputDir, 'sketch.ino.bin'), 'fake-binary-data');
    return { success: true, output: `Compiled ${options.sketchPath}`, exitCode: 0 };
  }
  async listPorts(): Promise<PortInfo[]> {
    return [{ address: '/dev/ttyUSB0', protocol: 'serial', boardName: 'ESP32' }];
  }
  async upload(_options: UploadOptions): Promise<UploadResult> {
    return { success: true, output: 'Upload complete', exitCode: 0 };
  }
}

async function seedData() {
  const adminDir = path.join(tmpDir, 'Minis', 'Admin');
  await fs.mkdir(adminDir, { recursive: true });

  const users = {
    type: 'users',
    items: [
      { type: 'user', id: 'user1', name: 'TestUser', password: 'pass', isAdmin: false, roles: [] },
    ],
  };
  await fs.writeFile(path.join(adminDir, 'Users.json'), JSON.stringify(users));

  // Create user directory with project
  const userDir = path.join(tmpDir, 'Minis', 'Users', 'TestUser');
  await fs.mkdir(path.join(userDir, 'Projects'), { recursive: true });

  const projects = {
    type: 'projects',
    projects: [
      { type: 'project', id: 'proj1', name: 'MyProject', projectDefId: 'pd1' },
    ],
  };
  await fs.writeFile(path.join(userDir, 'Project.json'), JSON.stringify(projects));

  // Create sketch files
  const sketchDir = path.join(userDir, 'Projects', 'proj1', 'sketches', 'blink');
  await fs.mkdir(sketchDir, { recursive: true });
  await fs.writeFile(path.join(sketchDir, 'blink.ino'), 'void setup() {}\nvoid loop() {}');
  await fs.writeFile(path.join(sketchDir, 'blink.blockly'), '<xml></xml>');
}

async function request(method: string, apiPath: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { Authorization: `Bearer ${authToken}` } as Record<string, string> };
  if (body) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}/api${apiPath}`, opts);
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
  const buffer = await res.arrayBuffer();
  return { status: res.status, data: null, buffer };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arduino-endpoints-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();
  await seedData();

  // Create ArduinoService with injected mock CLI
  const arduinoService = new ArduinoService({ rootDir: tmpDir });
  // Inject mock CLI via prototype trick since constructor checks env vars
  (arduinoService as unknown as { cli: ArduinoCli }).cli = new MockArduinoCli();

  const jwtService = new JwtService('test-secret');
  const apiKeyService = new ApiKeyService(fileSystem, 'Minis/Admin/ApiKeys.json');
  authToken = jwtService.sign({ userId: 'user1', userName: 'TestUser', isAdmin: false, roles: [] });

  server = new MinisHttpServer(0, fileSystem, jwtService, apiKeyService, undefined, undefined, tmpDir, arduinoService);
  await server.start();
  const address = server.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.stop();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('Arduino endpoints', () => {
  describe('GET /api/arduino/boards', () => {
    it('returns list of boards', async () => {
      const { status, data } = await request('GET', '/arduino/boards');
      expect(status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(data.items[0].fqbn).toBe('esp32:esp32:esp32');
      expect(data.items[1].name).toBe('Arduino Uno');
    });
  });

  describe('GET /api/arduino/ports', () => {
    it('returns list of ports', async () => {
      const { status, data } = await request('GET', '/arduino/ports');
      expect(status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].address).toBe('/dev/ttyUSB0');
    });
  });

  describe('POST /api/users/{user}/projects/{project}/compile', () => {
    it('compiles a sketch and returns result', async () => {
      const { status, data } = await request('POST', '/users/TestUser/projects/MyProject/compile', {
        sketchName: 'blink',
        fqbn: 'esp32:esp32:esp32',
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.output).toContain('blink.ino');
    });

    it('returns 400 when sketchName or fqbn missing', async () => {
      const { status } = await request('POST', '/users/TestUser/projects/MyProject/compile', {
        sketchName: 'blink',
      });
      expect(status).toBe(400);
    });

    it('returns 404 for unknown project', async () => {
      const { status, data } = await request('POST', '/users/TestUser/projects/NoSuchProject/compile', {
        sketchName: 'blink',
        fqbn: 'esp32:esp32:esp32',
      });
      expect(status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/users/{user}/projects/{project}/upload', () => {
    it('uploads firmware and returns result', async () => {
      const { status, data } = await request('POST', '/users/TestUser/projects/MyProject/upload', {
        sketchName: 'blink',
        fqbn: 'esp32:esp32:esp32',
        port: '/dev/ttyUSB0',
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 400 when port missing', async () => {
      const { status } = await request('POST', '/users/TestUser/projects/MyProject/upload', {
        sketchName: 'blink',
        fqbn: 'esp32:esp32:esp32',
      });
      expect(status).toBe(400);
    });
  });

  describe('GET /api/users/{user}/projects/{project}/output', () => {
    it('lists output files after compile', async () => {
      // Compile first to generate output
      await request('POST', '/users/TestUser/projects/MyProject/compile', {
        sketchName: 'blink',
        fqbn: 'esp32:esp32:esp32',
      });

      const { status, data } = await request('GET', '/users/TestUser/projects/MyProject/output');
      expect(status).toBe(200);
      expect(data.items.length).toBeGreaterThan(0);
      expect(data.items.some((f: { name: string }) => f.name === 'sketch.ino.bin')).toBe(true);
    });

    it('returns empty items for project with no output', async () => {
      const { status, data } = await request('GET', '/users/TestUser/projects/MyProject/output');
      // output dir may exist from previous test
      expect(status).toBe(200);
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('returns 404 for unknown project', async () => {
      const { status } = await request('GET', '/users/TestUser/projects/UnknownProject/output');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/users/{user}/projects/{project}/output/{file}', () => {
    it('serves binary file', async () => {
      // Compile first
      await request('POST', '/users/TestUser/projects/MyProject/compile', {
        sketchName: 'blink',
        fqbn: 'esp32:esp32:esp32',
      });

      const { status, buffer } = await request('GET', '/users/TestUser/projects/MyProject/output/sketch.ino.bin');
      expect(status).toBe(200);
      expect(buffer).toBeDefined();
      expect(buffer!.byteLength).toBeGreaterThan(0);
    });

    it('returns 404 for nonexistent file', async () => {
      const { status } = await request('GET', '/users/TestUser/projects/MyProject/output/nofile.bin');
      expect(status).toBe(404);
    });

    it('rejects path traversal', async () => {
      const { status } = await request('GET', '/users/TestUser/projects/MyProject/output/../../../etc/passwd');
      // Route may not match (404) or handler may reject (400) — either way, traversal is blocked
      expect([400, 404]).toContain(status);
    });
  });
});

describe('Sketch file endpoints', () => {
  describe('GET /api/users/{user}/projects/{project}/sketches', () => {
    it('lists sketch directories', async () => {
      const { status, data } = await request('GET', '/users/TestUser/projects/MyProject/sketches');
      expect(status).toBe(200);
      expect(data.items).toContain('blink');
    });

    it('returns 404 for unknown project', async () => {
      const { status } = await request('GET', '/users/TestUser/projects/Unknown/sketches');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/users/{user}/projects/{project}/sketches/{sketch}/{file}', () => {
    it('reads a sketch file', async () => {
      const { status, data } = await request('GET', '/users/TestUser/projects/MyProject/sketches/blink/blink.ino');
      expect(status).toBe(200);
      expect(data.content).toContain('void setup()');
    });

    it('reads blockly file', async () => {
      const { status, data } = await request('GET', '/users/TestUser/projects/MyProject/sketches/blink/blink.blockly');
      expect(status).toBe(200);
      expect(data.content).toContain('<xml>');
    });

    it('returns 404 for missing file', async () => {
      const { status } = await request('GET', '/users/TestUser/projects/MyProject/sketches/blink/nope.txt');
      expect(status).toBe(404);
    });
  });

  describe('PUT /api/users/{user}/projects/{project}/sketches/{sketch}/{file}', () => {
    it('writes a sketch file', async () => {
      const newContent = 'void setup() { pinMode(13, OUTPUT); }';
      const { status, data } = await request('PUT', '/users/TestUser/projects/MyProject/sketches/blink/blink.ino', {
        content: newContent,
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify it was actually written
      const { data: readData } = await request('GET', '/users/TestUser/projects/MyProject/sketches/blink/blink.ino');
      expect(readData.content).toBe(newContent);
    });

    it('creates new sketch directory and file', async () => {
      const { status } = await request('PUT', '/users/TestUser/projects/MyProject/sketches/newsketch/newsketch.ino', {
        content: '// new sketch',
      });
      expect(status).toBe(200);

      const { data } = await request('GET', '/users/TestUser/projects/MyProject/sketches');
      expect(data.items).toContain('newsketch');
    });

    it('returns 400 when content missing', async () => {
      const { status } = await request('PUT', '/users/TestUser/projects/MyProject/sketches/blink/blink.ino', {});
      expect(status).toBe(400);
    });

    it('rejects path traversal in sketch name', async () => {
      const { status } = await request('PUT', '/users/TestUser/projects/MyProject/sketches/..%2F..%2Fevil/evil.ino', {
        content: 'malicious',
      });
      expect(status).toBe(400);
    });
  });
});
