import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeFS, VfsError } from '@mhersztowski/core';
import { HttpUploadServer, FileSystem } from '@mhersztowski/core-backend';

/** Kod błędu VFS → status HTTP. Ten sam zestaw, którym posługuje się `RemoteFS`. */
const VFS_STATUS: Record<string, number> = {
  FileNotFound: 404,
  FileExists: 409,
  NoPermissions: 403,
  NotADirectory: 400,
  IsADirectory: 400,
  Unavailable: 503,
};

/** Typy podawane przy `GET /api/vfs/stream` — podgląd obrazu, dźwięku i PDF-a w edytorze. */
const STREAM_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm',
  pdf: 'application/pdf',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json',
};

/**
 * Serwer HTTP aplikacji Monaco.
 *
 * Rozszerza {@link HttpUploadServer} z `core-backend` o jedyną rzecz, której
 * potrzebuje edytor: kontrakt VFS pod `/api/vfs/*`, dokładnie taki, jakiego
 * oczekuje `RemoteFS` z `@mhersztowski/core`. Reszta — upload, serwowanie
 * plików spod `/files/`, statyczny frontend z `public/` wraz z fallbackiem SPA
 * — jest już w klasie bazowej.
 *
 * Nie ma tu uwierzytelniania: aplikacja jest lokalnym narzędziem na jeden
 * katalog danych. Gdyby kiedyś było potrzebne, wchodzi jednym `checkAuth()`
 * z `core-backend` przed rozgałęzieniem tras (tak robi cad-backend).
 */
export class MonacoHttpServer extends HttpUploadServer {
  private readonly vfs: NodeFS;

  constructor(port: number, dataDir: string, staticDir?: string) {
    // FileSystem z core-backend obsługuje upload i `/files/` klasy bazowej;
    // NodeFS jest źródłem prawdy dla VFS edytora. Oba wskazują ten sam katalog.
    super(port, new FileSystem(dataDir), undefined, undefined, undefined, staticDir);
    this.vfs = new NodeFS({ rootDir: dataDir });
  }

  protected override async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/vfs')) {
      this.setCorsHeaders(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      await this.handleVfs(req, res);
      return;
    }
    await super.handleRequest(req, res);
  }

  /** `RemoteFS` woła trasy bez prefiksu — `/stat`, `/readdir`, `/writeFile`, … */
  private async handleVfs(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname.replace(/^\/api\/vfs/, '');
    const path = url.searchParams.get('path') ?? '/';

    try {
      if (req.method === 'GET') {
        switch (route) {
          case '/capabilities':
            this.sendJsonResponse(res, 200, { readonly: false, watch: false });
            return;

          case '/stat':
            this.sendJsonResponse(res, 200, await this.vfs.stat(path));
            return;

          case '/readdir':
            this.sendJsonResponse(res, 200, { entries: await this.vfs.readDirectory(path) });
            return;

          case '/readFile': {
            const bytes = await this.vfs.readFile(path);
            this.sendJsonResponse(res, 200, { data: Buffer.from(bytes).toString('base64') });
            return;
          }

          case '/stream': {
            const bytes = await this.vfs.readFile(path);
            const ext = path.split('.').pop()?.toLowerCase() ?? '';
            res.writeHead(200, {
              'Content-Type': STREAM_MIME[ext] ?? 'application/octet-stream',
              'Content-Length': bytes.length,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache',
            });
            res.end(Buffer.from(bytes));
            return;
          }

          default:
            this.sendJsonResponse(res, 404, { error: `Unknown route: ${route}` });
            return;
        }
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        switch (route) {
          case '/writeFile': {
            const bytes = new Uint8Array(Buffer.from(body.data as string, 'base64'));
            await this.vfs.writeFile(path, bytes, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;
          }

          case '/delete':
            await this.vfs.delete(path, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          case '/rename':
            await this.vfs.rename(body.oldPath as string, body.newPath as string, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          case '/mkdir':
            await this.vfs.mkdir(path);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          case '/copy':
            await this.vfs.copy(body.source as string, body.destination as string, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          default:
            this.sendJsonResponse(res, 404, { error: `Unknown route: ${route}` });
            return;
        }
      }

      this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (err instanceof VfsError) {
        this.sendJsonResponse(res, VFS_STATUS[err.code] ?? 500, {
          error: err.message, code: err.code, path: err.path,
        });
      } else {
        console.error('[monaco-backend]', err);
        this.sendJsonResponse(res, 500, { error: String(err), code: 'Unknown' });
      }
    }
  }
}

/** Puste ciało i niepoprawny JSON dają `{}` — trasa i tak sprawdzi, czego jej brakuje. */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}
