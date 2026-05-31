import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { NodeFS, VfsError } from '@mhersztowski/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.CAD_DATA_DIR ?? resolve(__dirname, '../data');
const PORT = parseInt(process.env.CAD_BACKEND_PORT ?? '1897', 10);
const PUBLIC_DIR = resolve(__dirname, '../public');
// Allow any origin in dev; in production set CAD_CORS_ORIGIN explicitly
const CORS_ORIGIN = process.env.CAD_CORS_ORIGIN ?? '*';

// Root VFS — all paths are /users/{userId}/projects/{name}.cad.json
// NodeFS auto-creates parent dirs on writeFile, so no bootstrapping needed.
const vfs = new NodeFS({ rootDir: DATA_DIR });

// ── Debug log (in-memory, for mobile diagnostics) ────────────────────────────
const DEBUG_BUFFER: string[] = [];
const DEBUG_MAX = 300;

// ── helpers ──────────────────────────────────────────────────────────────────

function setCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = (CORS_ORIGIN === '*' ? req.headers.origin : CORS_ORIGIN) ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cad-User');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendVfsError(res: http.ServerResponse, err: unknown) {
  if (err instanceof VfsError) {
    const statusMap: Record<string, number> = {
      FileNotFound: 404,
      FileExists: 409,
      NoPermissions: 403,
      NotADirectory: 400,
      IsADirectory: 400,
      Unavailable: 503,
    };
    const status = statusMap[err.code] ?? 500;
    json(res, { error: err.message, code: err.code, path: err.path }, status);
  } else {
    console.error('[cad-backend]', err);
    json(res, { error: String(err), code: 'Unknown' }, 500);
  }
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// ── request handler ───────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!fs.existsSync(PUBLIC_DIR)) return false;
  const url = new URL(req.url!, `http://localhost`);
  let filePath = resolve(PUBLIC_DIR, '.' + url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = resolve(PUBLIC_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath)) return false;
  const mime = MIME[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost:${PORT}`);
  // Serve built frontend for non-API requests
  if (!url.pathname.startsWith('/api/')) {
    if (serveStatic(req, res)) return;
  }

  // ── Debug log ──────────────────────────────────────────────────────────────
  if (url.pathname === '/api/debug-log') {
    if (req.method === 'GET') {
      const clear = url.searchParams.get('clear') === '1';
      const lines = [...DEBUG_BUFFER];
      if (clear) DEBUG_BUFFER.length = 0;
      json(res, { lines, count: lines.length });
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const incoming = Array.isArray(body.lines) ? (body.lines as string[]) : [];
      for (const line of incoming) {
        process.stdout.write(`\x1b[36m[DBG]\x1b[0m ${line}\n`);
        DEBUG_BUFFER.push(line);
      }
      if (DEBUG_BUFFER.length > DEBUG_MAX) DEBUG_BUFFER.splice(0, DEBUG_BUFFER.length - DEBUG_MAX);
      json(res, { ok: true, total: DEBUG_BUFFER.length });
      return;
    }
  }

  // Strip /api/vfs prefix so the route is just /stat, /readdir, etc.
  const route = url.pathname.replace(/^\/api\/vfs/, '');
  const path = url.searchParams.get('path') ?? '/';

  try {
    if (req.method === 'GET') {
      switch (route) {
        case '/capabilities':
          json(res, { readonly: false, watch: false });
          break;

        case '/stat': {
          const stat = await vfs.stat(path);
          json(res, stat);
          break;
        }

        case '/readdir': {
          const entries = await vfs.readDirectory(path);
          json(res, { entries });
          break;
        }

        case '/readFile': {
          const bytes = await vfs.readFile(path);
          json(res, { data: Buffer.from(bytes).toString('base64') });
          break;
        }

        default:
          json(res, { error: `Unknown route: ${route}` }, 404);
      }
    } else if (req.method === 'POST') {
      const body = await readBody(req);

      switch (route) {
        case '/writeFile': {
          const b64 = body.data as string;
          const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
          await vfs.writeFile(path, bytes, body.options as never);
          json(res, { ok: true });
          break;
        }

        case '/delete': {
          await vfs.delete(path, body.options as never);
          json(res, { ok: true });
          break;
        }

        case '/rename': {
          const oldPath = body.oldPath as string;
          const newPath = body.newPath as string;
          await vfs.rename(oldPath, newPath, body.options as never);
          json(res, { ok: true });
          break;
        }

        case '/mkdir': {
          await vfs.mkdir(path);
          json(res, { ok: true });
          break;
        }

        case '/copy': {
          const source = body.source as string;
          const destination = body.destination as string;
          await vfs.copy(source, destination, body.options as never);
          json(res, { ok: true });
          break;
        }

        default:
          json(res, { error: `Unknown route: ${route}` }, 404);
      }
    } else {
      json(res, { error: 'Method not allowed' }, 405);
    }
  } catch (err) {
    sendVfsError(res, err);
  }
});

server.listen(PORT, () => {
  console.log(`CAD Backend (internal)  →  http://localhost:${PORT}`);
  console.log(`Data dir                →  ${DATA_DIR}`);
  console.log(`Public dir              →  ${PUBLIC_DIR}`);
});
