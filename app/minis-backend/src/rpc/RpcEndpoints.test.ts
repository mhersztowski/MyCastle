import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MinisHttpServer } from '../MinisHttpServer.js';
import { FileSystem } from '@mhersztowski/core-backend';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

let tmpDir: string;
let fileSystem: FileSystem;
let server: MinisHttpServer;
let baseUrl: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rpc-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();

  server = new MinisHttpServer(0, fileSystem);
  await server.start();
  const address = server.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.stop();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function rpc(method: string, input: unknown = {}) {
  const res = await fetch(`${baseUrl}/api/rpc/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe('RPC endpoints', () => {
  it('POST /api/rpc/ping returns pong', async () => {
    const { status, data } = await rpc('ping', { echo: 'test' });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.result.pong).toBe(true);
    expect(data.result.echo).toBe('test');
    expect(data.result.timestamp).toBeTypeOf('number');
  });

  it('POST /api/rpc/ping without body works', async () => {
    const { status, data } = await rpc('ping');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.result.pong).toBe(true);
  });

  it('POST /api/rpc/unknown returns 404', async () => {
    const { status, data } = await rpc('unknown');
    expect(status).toBe(404);
    expect(data.ok).toBe(false);
    expect(data.code).toBe('METHOD_NOT_FOUND');
  });

  it('POST /api/rpc/ping with invalid input returns 400', async () => {
    const { status, data } = await rpc('ping', { echo: 123 });
    expect(status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('RPC methods appear in swagger spec', async () => {
    const res = await fetch(`${baseUrl}/api/docs/swagger.json`);
    const spec = await res.json();
    expect(spec.paths['/rpc/ping']).toBeDefined();
    expect(spec.paths['/rpc/ping'].post.tags).toContain('System');
  });
});
