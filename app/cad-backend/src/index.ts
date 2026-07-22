import 'dotenv/config';
import http from 'node:http';
import { URL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { NodeFS, VfsError } from '@mhersztowski/core';
import { JwtService, checkAuth } from '@mhersztowski/core-backend';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.CAD_DATA_DIR ?? resolve(__dirname, '../data');
const PORT = parseInt(process.env.CAD_BACKEND_PORT ?? '1897', 10);
const PUBLIC_DIR = resolve(__dirname, '../public');
// LDraw official parts library, served to the Lego page's LDrawLoader. Populated
// once via POST /api/ldraw/install (downloads + extracts complete.zip → <dir>/ldraw).
const LDRAW_DIR = process.env.LDRAW_DIR ?? resolve(DATA_DIR, 'ldraw');
const LDRAW_ZIP_URL = process.env.LDRAW_ZIP_URL ?? 'https://library.ldraw.org/library/updates/complete.zip';
// Allow any origin in dev; in production set CAD_CORS_ORIGIN explicitly
const CORS_ORIGIN = process.env.CAD_CORS_ORIGIN ?? '*';
// Shared JWT secret with mycastle-backend — set the same JWT_SECRET env var in both services
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

const jwtService = new JwtService(JWT_SECRET);
// When false (default), all VFS operations are allowed without a token.
// Set CAD_REQUIRE_AUTH=true in production to enforce JWT on write operations.
const REQUIRE_AUTH = process.env.CAD_REQUIRE_AUTH === 'true';

// VFS paths matching /users/{userId}/projects or /users/{userId}/projects/**
// are publicly readable without authentication.
const PUBLIC_PROJECT_PATH = /^\/users\/[^/]+\/projects(\/.*)?$/;

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

// ── Scene3D project helpers ───────────────────────────────────────────────────

function scene3dRoot(userId: string): string {
  return `/users/${userId}/scene3d`;
}

function scene3dProjectDir(userId: string, name: string): string {
  return `${scene3dRoot(userId)}/${name}`;
}

function scene3dSceneFile(userId: string, name: string): string {
  return `${scene3dProjectDir(userId, name)}/scene.json`;
}

function scene3dPrefabsDir(userId: string, project: string): string {
  return `${scene3dProjectDir(userId, project)}/prefabs`;
}

function sanitizeName(name: string): string {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'untitled';
}

async function handleScene3d(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!pathname.startsWith('/api/scene3d/')) return false;

  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const userId = (req.headers['x-cad-user'] as string | undefined)
    ?? url.searchParams.get('user')
    ?? 'default';

  // GET /api/scene3d/prefabs → all prefabs from all projects
  if (pathname === '/api/scene3d/prefabs' && req.method === 'GET') {
    let projectDirs: Array<{ name: string; type: number }> = [];
    try {
      const r = await vfs.readDirectory(scene3dRoot(userId));
      projectDirs = (r as Array<{ name: string; type: number }>).filter(e => e.type === 2);
    } catch { /* no projects dir yet */ }
    const projects: Array<{ project: string; prefabs: unknown[] }> = [];
    for (const pd of projectDirs) {
      const prefabsDir = scene3dPrefabsDir(userId, pd.name);
      let prefabDirs: Array<{ name: string; type: number }> = [];
      try {
        const r = await vfs.readDirectory(prefabsDir);
        prefabDirs = (r as Array<{ name: string; type: number }>).filter(e => e.type === 2);
      } catch { continue; }
      const prefabs: unknown[] = [];
      for (const pf of prefabDirs) {
        try {
          const bytes = await vfs.readFile(`${prefabsDir}/${pf.name}/data.json`);
          prefabs.push(JSON.parse(Buffer.from(bytes).toString('utf-8')));
        } catch { /* skip */ }
      }
      if (prefabs.length > 0) projects.push({ project: pd.name, prefabs });
    }
    json(res, { projects });
    return true;
  }

  // Routes:
  // /api/scene3d/projects                           → list projects
  // /api/scene3d/projects/{project}                 → list files  / DELETE project dir
  // /api/scene3d/projects/{project}/rename          → rename project dir
  // /api/scene3d/projects/{project}/{file}          → read / write / DELETE file
  const rest = pathname.slice('/api/scene3d/projects'.length); // '' | '/{p}' | '/{p}/{f}'
  const segments = rest.replace(/^\//, '').split('/').map(decodeURIComponent);
  const projectName = segments[0] || null;
  const fileOrAction = segments[1] || null; // file name, 'rename', or null

  try {
    // ── GET /api/scene3d/projects → list projects (directories)
    if (!projectName && req.method === 'GET') {
      let entries: Array<{ name: string; type: number }>;
      try {
        const r = await vfs.readDirectory(scene3dRoot(userId));
        entries = r as Array<{ name: string; type: number }>;
      } catch {
        entries = [];
      }
      const dirs = entries.filter(e => e.type === 2).map(e => e.name).sort();
      const projects = await Promise.all(
        dirs.map(async name => {
          // count .json files and find latest mtime
          let fileCount = 0;
          let latestMtime = 0;
          try {
            const inner = await vfs.readDirectory(scene3dProjectDir(userId, name)) as Array<{ name: string; type: number }>;
            const jsonFiles = inner.filter(e => e.type === 1 && e.name.endsWith('.json'));
            fileCount = jsonFiles.length;
            for (const f of jsonFiles) {
              try {
                const s = await vfs.stat(`${scene3dProjectDir(userId, name)}/${f.name}`);
                if ((s.mtime ?? 0) > latestMtime) latestMtime = s.mtime ?? 0;
              } catch { /* */ }
            }
          } catch { /* */ }
          return { name, fileCount, mtime: latestMtime };
        }),
      );
      projects.sort((a, b) => b.mtime - a.mtime);
      json(res, { projects });
      return true;
    }

    if (!projectName) {
      json(res, { error: 'Missing project name' }, 400);
      return true;
    }

    const safeProject = sanitizeName(projectName);

    // ── POST /api/scene3d/projects/{project}/rename → rename project dir
    if (fileOrAction === 'rename' && req.method === 'POST') {
      const body = await readBody(req);
      const newName = sanitizeName(body.newName as string);
      if (!newName) { json(res, { error: 'Missing newName' }, 400); return true; }
      await vfs.rename(
        scene3dProjectDir(userId, safeProject),
        scene3dProjectDir(userId, newName),
        { overwrite: false },
      );
      json(res, { ok: true });
      return true;
    }

    // ── GET /api/scene3d/projects/{project} → list .json files in project
    if (!fileOrAction && req.method === 'GET') {
      let entries: Array<{ name: string; type: number }>;
      try {
        const r = await vfs.readDirectory(scene3dProjectDir(userId, safeProject));
        entries = r as Array<{ name: string; type: number }>;
      } catch {
        entries = [];
      }
      const jsonFiles = entries.filter(e => e.type === 1 && e.name.endsWith('.json'));
      const files = await Promise.all(
        jsonFiles.map(async e => {
          const filePath = `${scene3dProjectDir(userId, safeProject)}/${e.name}`;
          try {
            const stat = await vfs.stat(filePath);
            return { name: e.name.slice(0, -5), mtime: stat.mtime ?? 0, size: stat.size ?? 0 };
          } catch {
            return { name: e.name.slice(0, -5), mtime: 0, size: 0 };
          }
        }),
      );
      files.sort((a, b) => b.mtime - a.mtime);
      json(res, { files });
      return true;
    }

    // ── DELETE /api/scene3d/projects/{project} → delete entire project dir
    if (!fileOrAction && req.method === 'DELETE') {
      await vfs.delete(scene3dProjectDir(userId, safeProject), { recursive: true });
      json(res, { ok: true });
      return true;
    }

    if (!fileOrAction) {
      json(res, { error: 'Method not allowed' }, 405);
      return true;
    }

    // ── /api/scene3d/projects/{project}/prefabs[/{id}] ────────────────────────
    if (fileOrAction === 'prefabs') {
      const prefabsDir = scene3dPrefabsDir(userId, safeProject);
      const prefabId = segments[2] ?? null;

      // GET /api/scene3d/projects/{project}/prefabs → list all prefab entries
      if (!prefabId && req.method === 'GET') {
        let entries: Array<{ name: string; type: number }> = [];
        try {
          const r = await vfs.readDirectory(prefabsDir);
          entries = r as Array<{ name: string; type: number }>;
        } catch { /* prefabs dir doesn't exist yet */ }
        const prefabs: unknown[] = [];
        for (const e of entries.filter(e => e.type === 2)) {  // subdirectories only
          try {
            const bytes = await vfs.readFile(`${prefabsDir}/${e.name}/data.json`);
            prefabs.push(JSON.parse(Buffer.from(bytes).toString('utf-8')));
          } catch { /* skip corrupt/missing */ }
        }
        json(res, { prefabs });
        return true;
      }

      if (!prefabId) {
        json(res, { error: 'Method not allowed' }, 405);
        return true;
      }

      const safePrefabId = sanitizeName(prefabId);
      const prefabDir = `${prefabsDir}/${safePrefabId}`;
      const prefabFile = `${prefabDir}/data.json`;

      // POST /api/scene3d/projects/{project}/prefabs/{id} → write prefab
      if (req.method === 'POST') {
        const body = await readBody(req);
        const b64 = body.data as string;
        const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
        try { await vfs.mkdir?.(scene3dProjectDir(userId, safeProject)); } catch { /* exists */ }
        try { await vfs.mkdir?.(prefabsDir); } catch { /* exists */ }
        try { await vfs.mkdir?.(prefabDir); } catch { /* exists */ }
        await vfs.writeFile(prefabFile, bytes, { create: true, overwrite: true });
        // write human-readable conf.json sidecar
        try {
          const entry = JSON.parse(Buffer.from(bytes).toString('utf-8')) as Record<string, unknown>;
          const conf = {
            name: entry.name ?? '',
            version: entry.version ?? '1.0.0',
            author: entry.author ?? '',
            createdAt: entry.createdAt,
            nodeCount: entry.nodeCount,
            rootType: entry.rootType,
          };
          const confBytes = new TextEncoder().encode(JSON.stringify(conf, null, 2));
          await vfs.writeFile(`${prefabDir}/conf.json`, confBytes, { create: true, overwrite: true });
        } catch { /* non-fatal */ }
        json(res, { ok: true });
        return true;
      }

      // DELETE /api/scene3d/projects/{project}/prefabs/{id} → delete prefab directory
      if (req.method === 'DELETE') {
        await vfs.delete(prefabDir, { recursive: true });
        json(res, { ok: true });
        return true;
      }

      json(res, { error: 'Method not allowed' }, 405);
      return true;
    }

    const safeFile = sanitizeName(fileOrAction);
    const filePath = `${scene3dProjectDir(userId, safeProject)}/${safeFile}.json`;

    // ── GET /api/scene3d/projects/{project}/{file} → read file
    if (req.method === 'GET') {
      const bytes = await vfs.readFile(filePath);
      json(res, { data: Buffer.from(bytes).toString('base64') });
      return true;
    }

    // ── POST /api/scene3d/projects/{project}/{file} → write file
    if (req.method === 'POST') {
      const body = await readBody(req);
      const b64 = body.data as string;
      const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
      // ensure project dir exists before writing
      try { await vfs.mkdir?.(scene3dProjectDir(userId, safeProject)); } catch { /* already exists */ }
      await vfs.writeFile(filePath, bytes, { create: true, overwrite: true });
      json(res, { ok: true });
      return true;
    }

    // ── DELETE /api/scene3d/projects/{project}/{file} → delete file
    if (req.method === 'DELETE') {
      await vfs.delete(filePath, {});
      json(res, { ok: true });
      return true;
    }

    json(res, { error: 'Not found' }, 404);
    return true;
  } catch (err) {
    sendVfsError(res, err);
    return true;
  }
}

// ── Node.js project runner ────────────────────────────────────────────────────
// GET /api/users/{userId}/nodejs/run?subpath=&script=
// SSE stream: event: output  data: {"chunk":"..."}
//             event: done    data: {"success":bool,"exitCode":n}
//
// subpath is relative to DATA_DIR/users/{userId}/ — the VfsExplorer strips the
// /home/* prefix and sends the remainder, which maps to the scoped VFS root.

const VALID_SCRIPTS = new Set(['install', 'build', 'dev', 'start', 'preview', 'test']);

async function handleNodejsRun(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  userId: string,
  subpath: string,
  script: string,
): Promise<void> {
  if (!VALID_SCRIPTS.has(script)) {
    json(res, { error: `Unknown script: ${script}` }, 400);
    return;
  }

  // Resolve to absolute path; guard against directory traversal.
  const userRoot  = resolve(DATA_DIR, 'users', userId);
  const projectDir = resolve(userRoot, subpath);
  if (!projectDir.startsWith(userRoot + '/') && projectDir !== userRoot) {
    json(res, { error: 'Invalid path' }, 400);
    return;
  }
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    json(res, { error: `Directory not found: ${subpath}` }, 404);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',   // disable nginx buffering in production
  });

  const writeSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const args = script === 'install' ? ['install'] : ['run', script];
  const proc = spawn('npm', args, { cwd: projectDir, shell: true });

  const handleChunk = (chunk: Buffer) => writeSSE('output', { chunk: chunk.toString() });
  proc.stdout.on('data', handleChunk);
  proc.stderr.on('data', handleChunk);

  proc.on('close', (code) => {
    writeSSE('done', { success: code === 0, exitCode: code ?? -1 });
    res.end();
  });

  proc.on('error', (err) => {
    writeSSE('done', { success: false, exitCode: -1, error: err.message });
    res.end();
  });

  req.on('close', () => proc.kill());
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

const STREAM_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm',
  pdf: 'application/pdf',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json',
};

// ── LDraw parts library ──────────────────────────────────────────────────────
// A small curated set surfaced by default in the Lego palette (part number →
// human label). Any other part is reachable through ?search on parts.lst.
const LDRAW_COMMON: { file: string; desc: string }[] = [
  { file: '3005.dat', desc: 'Brick 1 x 1' },
  { file: '3004.dat', desc: 'Brick 1 x 2' },
  { file: '3622.dat', desc: 'Brick 1 x 3' },
  { file: '3010.dat', desc: 'Brick 1 x 4' },
  { file: '3009.dat', desc: 'Brick 1 x 6' },
  { file: '3008.dat', desc: 'Brick 1 x 8' },
  { file: '3003.dat', desc: 'Brick 2 x 2' },
  { file: '3002.dat', desc: 'Brick 2 x 3' },
  { file: '3001.dat', desc: 'Brick 2 x 4' },
  { file: '2456.dat', desc: 'Brick 2 x 6' },
  { file: '3007.dat', desc: 'Brick 2 x 8' },
  { file: '3024.dat', desc: 'Plate 1 x 1' },
  { file: '3023.dat', desc: 'Plate 1 x 2' },
  { file: '3623.dat', desc: 'Plate 1 x 3' },
  { file: '3710.dat', desc: 'Plate 1 x 4' },
  { file: '3666.dat', desc: 'Plate 1 x 6' },
  { file: '3460.dat', desc: 'Plate 1 x 8' },
  { file: '3022.dat', desc: 'Plate 2 x 2' },
  { file: '3021.dat', desc: 'Plate 2 x 3' },
  { file: '3020.dat', desc: 'Plate 2 x 4' },
  { file: '3795.dat', desc: 'Plate 2 x 6' },
  { file: '3034.dat', desc: 'Plate 2 x 8' },
  { file: '3068b.dat', desc: 'Tile 2 x 2' },
  { file: '3069b.dat', desc: 'Tile 1 x 2' },
  { file: '3070b.dat', desc: 'Tile 1 x 1' },
  { file: '3062b.dat', desc: 'Round Brick 1 x 1' },
  { file: '4073.dat', desc: 'Round Plate 1 x 1' },
  { file: '3040.dat', desc: 'Slope 45 2 x 1' },
  { file: '3039.dat', desc: 'Slope 45 2 x 2' },
  { file: '3298.dat', desc: 'Slope 33 3 x 2' },
  { file: '3665.dat', desc: 'Slope Inverted 45 2 x 1' },
  { file: '3660.dat', desc: 'Slope Inverted 45 2 x 2' },
  { file: '3700.dat', desc: 'Technic Brick 1 x 2 (Hole)' },
  { file: '3701.dat', desc: 'Technic Brick 1 x 4 (Holes)' },
  { file: '3894.dat', desc: 'Technic Brick 1 x 6 (Holes)' },
  { file: '3937.dat', desc: 'Hinge 1 x 2 Base' },
  { file: '3941.dat', desc: 'Brick 2 x 2 Round' },
  { file: '4150.dat', desc: 'Tile 2 x 2 Round' },
  { file: '6091.dat', desc: 'Brick 1 x 2 x 1.333 Curved Top' },
];

function ldrawInstalled(): boolean {
  return fs.existsSync(resolve(LDRAW_DIR, 'parts')) && fs.existsSync(resolve(LDRAW_DIR, 'LDConfig.ldr'));
}

/** Serve a file from the LDraw library tree; 404 on miss so LDrawLoader falls
 *  through to its next candidate location (parts/ → p/ → models/ → …). */
function serveLdrawFile(res: http.ServerResponse, rel: string): void {
  const clean = decodeURIComponent(rel).replace(/\\/g, '/');
  const filePath = resolve(LDRAW_DIR, '.' + (clean.startsWith('/') ? clean : '/' + clean));
  if (!filePath.startsWith(LDRAW_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  fs.createReadStream(filePath).pipe(res);
}

// ── LDraw parts index (file + description + category), built from the part files ──
// The official complete.zip ships no parts.lst, so we derive the catalog by reading
// each part file's title line. Built once (a few seconds), then cached to disk.
interface LdrawEntry { file: string; desc: string; cat: string }
let ldrawIndex: LdrawEntry[] | null = null;
const LDRAW_INDEX_CACHE = () => resolve(DATA_DIR, 'ldraw-index.json');

/** LDraw category = first word of the title, minus obsolete/alias markers. */
function ldrawCategoryOf(desc: string): string {
  const s = desc.replace(/^[~=_|]+/, '').trim();
  const m = s.match(/^([A-Za-z][A-Za-z0-9-]*)/);
  return m ? m[1] : 'Other';
}

function buildLdrawIndex(): LdrawEntry[] {
  const dir = resolve(LDRAW_DIR, 'parts');
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.dat'));
  const buf = Buffer.alloc(256);
  const out: LdrawEntry[] = [];
  for (const file of files) {
    let desc = '';
    try {
      const fd = fs.openSync(resolve(dir, file), 'r');
      const n = fs.readSync(fd, buf, 0, 256, 0);
      fs.closeSync(fd);
      desc = buf.toString('utf8', 0, n).split(/\r?\n/)[0].replace(/^0\s+/, '').trim();
    } catch { /* unreadable — keep empty desc */ }
    if (!desc) desc = file;
    out.push({ file, desc, cat: ldrawCategoryOf(desc) });
  }
  out.sort((a, b) => a.desc.localeCompare(b.desc));
  return out;
}

function ldrawGetIndex(): LdrawEntry[] {
  if (ldrawIndex) return ldrawIndex;
  const cache = LDRAW_INDEX_CACHE();
  try {
    if (fs.existsSync(cache)) { ldrawIndex = JSON.parse(fs.readFileSync(cache, 'utf-8')); return ldrawIndex!; }
  } catch { /* rebuild below */ }
  console.log('[LDraw] budowanie indeksu części…');
  ldrawIndex = buildLdrawIndex();
  try { fs.writeFileSync(cache, JSON.stringify(ldrawIndex)); } catch { /* non-fatal */ }
  console.log(`[LDraw] indeks gotowy: ${ldrawIndex.length} części`);
  return ldrawIndex;
}

/** Categories with part counts, sorted (biggest first). */
function ldrawCategories(): { name: string; count: number }[] {
  const idx = ldrawGetIndex();
  const counts = new Map<string, number>();
  for (const e of idx) counts.set(e.cat, (counts.get(e.cat) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Catalog: filter the full index by search term and/or category. No filters →
 *  curated common set (a small default before a category is picked). */
function ldrawCatalog(search: string, category: string, limit: number): { file: string; desc: string }[] {
  // Normalise whitespace — LDraw titles use double spaces ("Brick  2 x  4").
  const term = search.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!term && !category) return LDRAW_COMMON;
  if (!ldrawInstalled()) return LDRAW_COMMON.filter((p) => !term || p.desc.toLowerCase().replace(/\s+/g, ' ').includes(term));
  const idx = ldrawGetIndex();
  const out: { file: string; desc: string }[] = [];
  for (const e of idx) {
    if (category && e.cat !== category) continue;
    if (term && !(e.desc.toLowerCase().replace(/\s+/g, ' ').includes(term) || e.file.toLowerCase().includes(term))) continue;
    out.push({ file: e.file, desc: e.desc });
    if (out.length >= limit) break;
  }
  return out;
}

// Favourite parts (persisted on the backend as {file, desc} pairs).
const LDRAW_FAV_FILE = () => resolve(DATA_DIR, 'ldraw-favorites.json');
function ldrawFavorites(): { file: string; desc: string }[] {
  try { const v = JSON.parse(fs.readFileSync(LDRAW_FAV_FILE(), 'utf-8')); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveLdrawFavorites(favs: { file: string; desc: string }[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LDRAW_FAV_FILE(), JSON.stringify(favs));
}

/** Extract a zip in pure JS (yauzl) — no system `unzip` needed (the production
 *  node:20-slim image has none). Streams entries one by one to keep memory low. */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  const root = resolve(destDir);
  return new Promise((ok, fail) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return fail(err ?? new Error('cannot open zip'));
      zip.on('error', fail);
      zip.on('end', () => ok());
      zip.on('entry', (entry) => {
        const outPath = resolve(root, entry.fileName);
        if (!outPath.startsWith(root)) { zip.readEntry(); return; } // zip-slip guard
        if (entry.fileName.endsWith('/')) { fs.mkdirSync(outPath, { recursive: true }); zip.readEntry(); return; }
        fs.mkdirSync(dirname(outPath), { recursive: true });
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return fail(e ?? new Error('cannot read zip entry'));
          const ws = fs.createWriteStream(outPath);
          rs.on('error', fail); ws.on('error', fail);
          ws.on('close', () => zip.readEntry());
          rs.pipe(ws);
        });
      });
      zip.readEntry();
    });
  });
}

let ldrawInstalling = false;
async function ldrawInstall(res: http.ServerResponse): Promise<void> {
  if (ldrawInstalled()) { json(res, { ok: true, installed: true, alreadyInstalled: true }); return; }
  if (ldrawInstalling) { json(res, { error: 'Instalacja już trwa' }, 409); return; }
  ldrawInstalling = true;
  const zipPath = resolve(DATA_DIR, 'ldraw-complete.zip');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[LDraw] pobieranie ${LDRAW_ZIP_URL} …`);
    const resp = await fetch(LDRAW_ZIP_URL);
    if (!resp.ok || !resp.body) throw new Error(`download HTTP ${resp.status}`);
    await pipeline(Readable.fromWeb(resp.body as never), fs.createWriteStream(zipPath));
    console.log(`[LDraw] rozpakowywanie → ${DATA_DIR}`);
    await extractZip(zipPath, DATA_DIR);
    fs.rmSync(zipPath, { force: true });
    if (!ldrawInstalled()) throw new Error('rozpakowano, ale brak parts/ lub LDConfig.ldr');
    console.log('[LDraw] gotowe');
    json(res, { ok: true, installed: true });
  } catch (err) {
    fs.rmSync(zipPath, { force: true });
    console.error('[LDraw] instalacja nieudana:', err);
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  } finally {
    ldrawInstalling = false;
  }
}

async function handleLdraw(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/api/ldraw')) return false;
  if (p === '/api/ldraw/status' && req.method === 'GET') {
    json(res, { installed: ldrawInstalled(), installing: ldrawInstalling, base: '/api/ldraw/lib/' });
    return true;
  }
  if (p === '/api/ldraw/install' && req.method === 'POST') {
    await ldrawInstall(res);
    return true;
  }
  if (p === '/api/ldraw/categories' && req.method === 'GET') {
    if (!ldrawInstalled()) { json(res, { categories: [], installed: false }); return true; }
    json(res, { categories: ldrawCategories(), installed: true });
    return true;
  }
  if (p === '/api/ldraw/favorites' && req.method === 'GET') {
    json(res, { favorites: ldrawFavorites() });
    return true;
  }
  if (p === '/api/ldraw/favorites' && req.method === 'POST') {
    const body = await readBody(req);
    const favs = Array.isArray(body.favorites) ? (body.favorites as { file: string; desc: string }[]) : [];
    saveLdrawFavorites(favs.filter((f) => f && typeof f.file === 'string'));
    json(res, { ok: true });
    return true;
  }
  if (p === '/api/ldraw/parts' && req.method === 'GET') {
    const search = url.searchParams.get('search') ?? '';
    const category = url.searchParams.get('category') ?? '';
    const limit = Math.min(3000, parseInt(url.searchParams.get('limit') ?? '2000', 10) || 2000);
    json(res, { parts: ldrawCatalog(search, category, limit), installed: ldrawInstalled() });
    return true;
  }
  const libMatch = p.match(/^\/api\/ldraw\/lib\/(.+)$/);
  if (libMatch && req.method === 'GET') {
    serveLdrawFile(res, libMatch[1]);
    return true;
  }
  return false;
}

// ── EasyEDA / LCSC proxy (omija CORS + wymagany „przeglądarkowy" User-Agent) ──
const EASYEDA_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const easyedaHeaders = { Accept: 'application/json', 'User-Agent': EASYEDA_UA };

async function handleEasyEda(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/api/easyeda')) return false;

  // GET /api/easyeda/search?q=... → lista części (LCSC number + MPN + package)
  if (p === '/api/easyeda/search' && req.method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    if (!q.trim()) { json(res, { products: [] }); return true; }
    try {
      const r = await fetch(`https://easyeda.com/api/eda/product/search?keyword=${encodeURIComponent(q)}&currentPage=1&pageSize=25`, { headers: easyedaHeaders });
      if (!r.ok) throw new Error(`EasyEDA HTTP ${r.status}`);
      const data = await r.json() as { result?: { productList?: Array<Record<string, unknown>> } };
      const list = data?.result?.productList ?? [];
      const products = list.map((it) => ({
        lcsc: String(it.number ?? ''),
        mpn: String(it.mpn ?? ''),
        package: String(it.package ?? ''),
        manufacturer: String(it.manufacturer ?? ''),
        stock: Number(it.stock ?? it.stockNumber ?? 0) || 0,
        smtStock: Number(it.SMTStock ?? it.smtStock ?? it.jlcStock ?? 0) || 0,
        price: String(it.price ?? it.splitPrice ?? ''),
      })).filter((it) => it.lcsc);
      json(res, { products });
    } catch (err) {
      json(res, { error: err instanceof Error ? err.message : String(err), products: [] }, 502);
    }
    return true;
  }

  // GET /api/easyeda/component/:lcscId → symbol (Sheet) + footprint (PCB)
  const m = p.match(/^\/api\/easyeda\/component\/([^/]+)$/);
  if (m && req.method === 'GET') {
    const lcsc = decodeURIComponent(m[1]);
    try {
      const r = await fetch(`https://easyeda.com/api/products/${encodeURIComponent(lcsc)}/components?version=6.4.19.5`, { headers: easyedaHeaders });
      if (!r.ok) throw new Error(`EasyEDA HTTP ${r.status}`);
      const data = await r.json() as { result?: Record<string, unknown> };
      const rr = data?.result as { title?: string; dataStr?: { head?: { c_para?: Record<string, string> }; shape?: string[]; BBox?: Record<string, number> }; packageDetail?: { dataStr?: { shape?: string[]; BBox?: Record<string, number> } } } | undefined;
      if (!rr?.dataStr) throw new Error('brak danych symbolu');
      json(res, {
        lcsc,
        title: rr.title ?? '',
        prefix: rr.dataStr.head?.c_para?.pre ?? 'U?',
        symbol: { shapes: rr.dataStr.shape ?? [], bbox: rr.dataStr.BBox ?? null },
        footprint: rr.packageDetail?.dataStr ? { shapes: rr.packageDetail.dataStr.shape ?? [], bbox: rr.packageDetail.dataStr.BBox ?? null } : null,
      });
    } catch (err) {
      json(res, { error: err instanceof Error ? err.message : String(err) }, 502);
    }
    return true;
  }
  return false;
}

// ── SnapEDA (proxy) — wymaga klucza partnerskiego SNAPEDA_API_KEY ──────────────
// SnapEDA nie ma darmowego publicznego JSON API (jak EasyEDA). Gdy klucz + URL są
// skonfigurowane, odpytujemy API partnerskie; bez klucza zwracamy tylko link do
// wyszukiwania na stronie SnapEDA (skąd można pobrać pliki ręcznie).
async function handleSnapeda(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== '/api/snapeda/search' || req.method !== 'GET') return false;
  const q = url.searchParams.get('q') ?? '';
  const webUrl = `https://www.snapeda.com/search/?q=${encodeURIComponent(q)}`;
  const key = process.env.SNAPEDA_API_KEY;
  const api = process.env.SNAPEDA_API_URL; // szablon z {q}, np. https://api.snapeda.com/.../search?q={q}
  if (!key || !api || !q.trim()) { json(res, { configured: !!(key && api), parts: [], webUrl }); return true; }
  try {
    const r = await fetch(api.replace('{q}', encodeURIComponent(q)), { headers: { Authorization: `Token ${key}`, Accept: 'application/json', 'User-Agent': EASYEDA_UA } });
    if (!r.ok) throw new Error(`SnapEDA HTTP ${r.status}`);
    const d = await r.json() as { results?: unknown[]; parts?: unknown[] };
    const list = (Array.isArray(d.results) ? d.results : Array.isArray(d.parts) ? d.parts : []) as Array<Record<string, unknown>>;
    const parts = list.slice(0, 25).map((it) => ({
      mpn: String(it.part_number ?? it.mpn ?? it.name ?? ''),
      manufacturer: String((it.manufacturer as { name?: string } | string) instanceof Object ? (it.manufacturer as { name?: string }).name : it.manufacturer ?? ''),
      pins: Number(it.pins ?? it.pin_count ?? 0) || 0,
      url: String(it.url ?? it.part_url ?? webUrl),
    })).filter((p) => p.mpn);
    json(res, { configured: true, parts, webUrl });
  } catch (err) { json(res, { configured: true, error: err instanceof Error ? err.message : String(err), parts: [], webUrl }, 502); }
  return true;
}

// ── Współdzielona biblioteka symboli (widoczna dla wszystkich projektów) ──────
const SYMBOLS_DIR = () => resolve(DATA_DIR, 'symbols');
const safeName = (s: string) => (s || 'Symbol').replace(/[^\w\-. ]+/g, '_').trim().slice(0, 80) || 'Symbol';

async function handleSymbols(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/api/symbols')) return false;
  const dir = SYMBOLS_DIR();

  // GET /api/symbols → lista zapisanych symboli (nazwa + metadane)
  if (p === '/api/symbols' && req.method === 'GET') {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      const symbols = files.map((f) => {
        try { const d = JSON.parse(fs.readFileSync(resolve(dir, f), 'utf8')); return { name: f.slice(0, -5), title: d.title ?? f.slice(0, -5), owner: d.owner ?? '', manufacturer: d.manufacturer ?? '', mfrPart: d.mfrPart ?? '', tags: d.tags ?? '', footprint: d.footprint ?? '' }; }
        catch { return { name: f.slice(0, -5), title: f.slice(0, -5) }; }
      });
      json(res, { symbols });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err), symbols: [] }, 500); }
    return true;
  }

  // POST /api/symbols → zapis symbolu do współdzielonego pliku
  if (p === '/api/symbols' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const title = String(body.title ?? 'NowySymbol');
      const name = safeName(title);
      fs.mkdirSync(dir, { recursive: true });
      const record = { ...body, title, savedAt: new Date().toISOString() };
      fs.writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(record, null, 2), 'utf8');
      json(res, { ok: true, name, title });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 500); }
    return true;
  }

  // GET /api/symbols/:name → wczytanie jednego symbolu
  const m = p.match(/^\/api\/symbols\/([^/]+)$/);
  if (m && req.method === 'GET') {
    try {
      const data = JSON.parse(fs.readFileSync(resolve(dir, `${safeName(decodeURIComponent(m[1]))}.json`), 'utf8'));
      json(res, data);
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 404); }
    return true;
  }
  // DELETE /api/symbols/:name → usuń zapisany symbol
  if (m && req.method === 'DELETE') {
    try {
      fs.rmSync(resolve(dir, `${safeName(decodeURIComponent(m[1]))}.json`), { force: true });
      json(res, { ok: true });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 500); }
    return true;
  }
  return false;
}

// ── Współdzielona biblioteka footprintów ──────────────────────────────────────
const FOOTPRINTS_DIR = () => resolve(DATA_DIR, 'footprints');
async function handleFootprints(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/api/footprints')) return false;
  const dir = FOOTPRINTS_DIR();
  if (p === '/api/footprints' && req.method === 'GET') {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      const footprints = files.map((f) => { try { const d = JSON.parse(fs.readFileSync(resolve(dir, f), 'utf8')); return { name: f.slice(0, -5), title: d.title ?? f.slice(0, -5), tags: d.tags ?? '', symbol: d.symbol ?? '' }; } catch { return { name: f.slice(0, -5), title: f.slice(0, -5) }; } });
      json(res, { footprints });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err), footprints: [] }, 500); }
    return true;
  }
  if (p === '/api/footprints' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const title = String(body.title ?? 'NEW_FOOTPRINT');
      const name = safeName(title);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolve(dir, `${name}.json`), JSON.stringify({ ...body, title, savedAt: new Date().toISOString() }, null, 2), 'utf8');
      json(res, { ok: true, name, title });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 500); }
    return true;
  }
  const m = p.match(/^\/api\/footprints\/([^/]+)$/);
  if (m && req.method === 'GET') {
    try { json(res, JSON.parse(fs.readFileSync(resolve(dir, `${safeName(decodeURIComponent(m[1]))}.json`), 'utf8'))); }
    catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 404); }
    return true;
  }
  // DELETE /api/footprints/:name → usuń zapisany footprint
  if (m && req.method === 'DELETE') {
    try {
      fs.rmSync(resolve(dir, `${safeName(decodeURIComponent(m[1]))}.json`), { force: true });
      json(res, { ok: true });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 500); }
    return true;
  }
  return false;
}

// ── Projekty PCB (pełny zapis: wszystkie dokumenty + historia) ─────────────────
const PROJECTS_DIR = () => resolve(DATA_DIR, 'projects');
async function handleProjects(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/api/projects')) return false;
  const dir = PROJECTS_DIR();
  // GET /api/projects → lista zapisanych projektów
  if (p === '/api/projects' && req.method === 'GET') {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      const projects = files.map((f) => { try { const d = JSON.parse(fs.readFileSync(resolve(dir, f), 'utf8')); return { name: f.slice(0, -5), title: d.project ?? d.title ?? f.slice(0, -5), savedAt: d.savedAt ?? null }; } catch { return { name: f.slice(0, -5), title: f.slice(0, -5) }; } });
      json(res, { projects });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err), projects: [] }, 500); }
    return true;
  }
  // POST /api/projects → zapis pełnego projektu (nadpisuje plik o tej nazwie)
  if (p === '/api/projects' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const title = String(body.name ?? body.project ?? 'project');
      const name = safeName(title);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolve(dir, `${name}.json`), JSON.stringify({ ...body, savedAt: new Date().toISOString() }, null, 2), 'utf8');
      json(res, { ok: true, name, title });
    } catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 500); }
    return true;
  }
  const m = p.match(/^\/api\/projects\/([^/]+)$/);
  if (m && req.method === 'GET') {
    try { json(res, JSON.parse(fs.readFileSync(resolve(dir, `${safeName(decodeURIComponent(m[1]))}.json`), 'utf8'))); }
    catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 404); }
    return true;
  }
  if (m && req.method === 'DELETE') {
    try { fs.unlinkSync(resolve(dir, `${safeName(decodeURIComponent(m[1]))}.json`)); json(res, { ok: true }); }
    catch (err) { json(res, { error: err instanceof Error ? err.message : String(err) }, 404); }
    return true;
  }
  return false;
}

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

  // ── Node.js project runner ────────────────────────────────────────────────
  const nodeRunMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/nodejs\/run$/);
  if (nodeRunMatch && req.method === 'GET') {
    await handleNodejsRun(
      req, res,
      decodeURIComponent(nodeRunMatch[1]),
      url.searchParams.get('subpath') ?? '',
      url.searchParams.get('script') ?? '',
    );
    return;
  }

  // ── LDraw parts library (Lego page) ───────────────────────────────────────
  if (await handleLdraw(req, res, url)) return;

  // ── EasyEDA / LCSC proxy (symbole + footprinty) ───────────────────────────
  if (await handleEasyEda(req, res, url)) return;

  // ── SnapEDA proxy ─────────────────────────────────────────────────────────
  if (await handleSnapeda(req, res, url)) return;

  // ── Współdzielona biblioteka symboli ──────────────────────────────────────
  if (await handleSymbols(req, res, url)) return;

  // ── Współdzielona biblioteka footprintów ──────────────────────────────────
  if (await handleFootprints(req, res, url)) return;

  // ── Projekty PCB (pełny zapis: dokumenty + historia) ──────────────────────
  if (await handleProjects(req, res, url)) return;

  // ── Scene3D project API ───────────────────────────────────────────────────
  if (await handleScene3d(req, res, url.pathname)) return;

  // Strip /api/vfs prefix so the route is just /stat, /readdir, etc.
  const route = url.pathname.replace(/^\/api\/vfs/, '');
  const path = url.searchParams.get('path') ?? '/';

  // Auth check: when REQUIRE_AUTH=true, GET on public project paths is open,
  // all writes require a valid Bearer JWT token.
  const isPublicRead =
    req.method === 'GET' &&
    (route === '/capabilities' || (
      ['/stat', '/readdir', '/readFile', '/stream'].includes(route) &&
      PUBLIC_PROJECT_PATH.test(path)
    ));

  if (REQUIRE_AUTH && !isPublicRead) {
    const user = checkAuth(req, jwtService);
    if (!user) {
      json(res, { error: 'Unauthorized', code: 'Unauthorized' }, 401);
      return;
    }
  }

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

        case '/stream': {
          const bytes = await vfs.readFile(path);
          const ext = path.split('.').pop()?.toLowerCase() ?? '';
          const mime = STREAM_MIME[ext] ?? 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': bytes.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
          });
          res.end(Buffer.from(bytes));
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
