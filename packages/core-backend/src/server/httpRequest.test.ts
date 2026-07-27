/**
 * Testy `http_request` — wychodzących żądań HTTP wykonywanych przez backend
 * w imieniu skryptu (skrypt w przeglądarce nie podlega wtedy CORS, a skrypt
 * backendowy dostaje jednolity kształt odpowiedzi).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { ServerLogic } from './logic';

let server: Server;
let base = '';
/** Ostatnie żądanie, jakie zobaczył serwer testowy — do sprawdzenia nagłówków/ciała. */
let lastSeen: { method: string; url: string; headers: Record<string, unknown>; body: string } | null = null;

function handler(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    lastSeen = {
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers as Record<string, unknown>,
      body: Buffer.concat(chunks).toString(),
    };
    const path = (req.url ?? '').split('?')[0];

    if (path === '/json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hello: 'świat', echo: lastSeen.body }));
      return;
    }
    if (path === '/text') {
      res.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Custom': 'tak' });
      res.end('zwykły tekst');
      return;
    }
    if (path === '/binary') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.from([0, 1, 2, 250]));
      return;
    }
    if (path === '/slow') {
      setTimeout(() => { res.writeHead(200); res.end('za późno'); }, 500);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'nie ma' }));
  });
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe('http_request', () => {
  const logic = () => new ServerLogic(process.cwd());

  it('pobiera JSON i zwraca sparsowane ciało', async () => {
    const res = await logic().httpRequest(`${base}/json`, {});
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.body).toMatchObject({ hello: 'świat' });
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('wysyła metodę, nagłówki, query i ciało JSON', async () => {
    const res = await logic().httpRequest(`${base}/json`, {
      method: 'POST',
      headers: { 'X-Test': 'wartosc' },
      query: { a: '1', b: 'dwa' },
      body: { x: 7 },
    });

    expect(res.status).toBe(200);
    expect(lastSeen?.method).toBe('POST');
    expect(lastSeen?.url).toContain('a=1');
    expect(lastSeen?.url).toContain('b=dwa');
    expect(lastSeen?.headers['x-test']).toBe('wartosc');
    // Obiekt w `body` jest serializowany do JSON razem z nagłówkiem Content-Type.
    expect(lastSeen?.headers['content-type']).toContain('application/json');
    expect(JSON.parse(lastSeen!.body)).toEqual({ x: 7 });
  });

  it('tekst zwraca jako string, z nagłówkami odpowiedzi', async () => {
    const res = await logic().httpRequest(`${base}/text`, {});
    expect(res.status).toBe(201);
    expect(res.body).toBe('zwykły tekst');
    expect(res.headers['x-custom']).toBe('tak');
  });

  it('binaria zwraca w base64', async () => {
    const res = await logic().httpRequest(`${base}/binary`, {});
    expect(res.encoding).toBe('base64');
    expect(Buffer.from(res.body as string, 'base64')).toEqual(Buffer.from([0, 1, 2, 250]));
  });

  it('wymuszony responseType ma pierwszeństwo nad typem z nagłówka', async () => {
    const res = await logic().httpRequest(`${base}/json`, { responseType: 'text' });
    expect(typeof res.body).toBe('string');
    expect(res.body as string).toContain('hello');
  });

  it('status błędu nie jest wyjątkiem — skrypt sam decyduje, co z nim zrobić', async () => {
    const res = await logic().httpRequest(`${base}/nieistnieje`, {});
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);
    expect(res.body).toMatchObject({ error: 'nie ma' });
  });

  it('przerywa po przekroczeniu timeoutu', async () => {
    await expect(logic().httpRequest(`${base}/slow`, { timeoutMs: 80 }))
      .rejects.toThrow(/timeout|przekroczon/i);
  });

  it('czytelnie zgłasza nagłówek z polskimi znakami (HTTP dopuszcza tylko Latin-1)', async () => {
    await expect(logic().httpRequest(`${base}/text`, { headers: { 'X-Test': 'wartość' } }))
      .rejects.toThrow(/nagłów/i);
  });

  it('odrzuca adresy spoza http/https', async () => {
    await expect(logic().httpRequest('file:///etc/passwd', {})).rejects.toThrow(/http/i);
    await expect(logic().httpRequest('nie-adres', {})).rejects.toThrow();
  });

  it('jest dostępne przez dispatch (kanał komend)', async () => {
    const res = await logic().dispatch('http_request', { url: `${base}/text` }) as { status: number };
    expect(res.status).toBe(201);
  });
});
