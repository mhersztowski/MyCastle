import { HttpUploadServer, FileSystem, JwtService, PasswordService, ApiKeyService, checkAuth } from '@mhersztowski/core-backend';
import sharp from 'sharp';
import type { IncomingMessage, ServerResponse } from 'http';
import type { AuthTokenPayload, WriteFileOptions, DeleteOptions, RenameOptions, CopyOptions } from '@mhersztowski/core';
import { CompositeFS, NodeFS, VfsError } from '@mhersztowski/core';
import { buildSwaggerSpec } from './swagger.js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';
import type { IotService } from './modules/iot/IotService.js';
import type { TerminalService } from './modules/terminal/TerminalService.js';
import { RpcRouter, registerHandlers } from './modules/rpc/index.js';
import type { ArduinoService } from './modules/arduino/index.js';
import type { MinisConfig } from './modules/arduino/ArduinoCli.js';
import type { MicroPythonService } from './modules/upython/index.js';
import type { PygameService } from './modules/pygame/index.js';
import type { PicoSdkService } from './modules/picosdk/index.js';
import { ScriptsService } from '@mhersztowski/core-backend';
import type { PluginService } from './modules/plugins/PluginService.js';
import type { BackendPluginService } from './modules/plugins/BackendPluginService.js';
import type { PluginRequestContext } from './modules/plugins/backendPluginTypes.js';
import type { SecretsService } from './modules/secrets/SecretsService.js';

interface CrudConfig {
  filePath: string;
  itemsKey: string;
  typeValue: string;
  lookupKey: 'id' | 'name';
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    windspeed_10m: number;
    weathercode: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
  };
}

const MINIS_ROOT = 'Minis';

const CRUD_CONFIGS: Record<string, CrudConfig> = {
  users: { filePath: `${MINIS_ROOT}/Admin/Users.json`, itemsKey: 'items', typeValue: 'users', lookupKey: 'id' },
};

/**
 * MIME map used by the public Drive endpoint. HttpUploadServer's own
 * MIME_TYPES is module-private, so we duplicate the entries we actually
 * care about. Anything not listed falls back to application/octet-stream
 * which makes browsers download rather than render — a safe default.
 */
const DRIVE_MIME: Record<string, string> = {
  '.html': 'text/html', '.htm': 'text/html',
  '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.csv': 'text/csv',
  '.txt': 'text/plain', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export class MycastleHttpServer extends HttpUploadServer {
  private static readonly NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private swaggerUiDir: string | null = null;
  private iotService: IotService | null;
  private terminalService: TerminalService | null = null;
  private jwtService: JwtService;
  private apiKeyService: ApiKeyService;
  private rpcRouter: RpcRouter;
  private vfs: CompositeFS;
  private arduinoService: ArduinoService | null;
  private upythonService: MicroPythonService | null;
  private pygameService: PygameService | null;
  private picoSdkService: PicoSdkService | null = null;
  private pluginService: PluginService | null = null;
  private backendPluginService: BackendPluginService | null = null;
  private secretsService: SecretsService | null = null;
  private rootDir: string | null;
  private ownStaticDir: string | null = null;
  private scriptsService: ScriptsService | null = null;
  // shareUrl → { assets (id+description), baseUrl, key, cachedAt }
  private immichAlbumCache = new Map<string, { assets: { id: string; description: string }[]; baseUrl: string; key: string; cachedAt: number }>();
  private static readonly IMMICH_CACHE_TTL = 3_600_000; // 1 hour

  // "lat,lon" → { data, cachedAt }
  private weatherCache = new Map<string, { data: OpenMeteoResponse; cachedAt: number }>();
  private static readonly WEATHER_CACHE_TTL = 900_000; // 15 min

  private static validateName(name: string): string | null {
    if (!name || name.length === 0) return 'Name is required';
    if (!MycastleHttpServer.NAME_PATTERN.test(name)) return 'Name must contain only letters, digits, hyphens, underscores';
    return null;
  }

  constructor(port: number, fileSystem: FileSystem, jwtService: JwtService, apiKeyService: ApiKeyService, iotService?: IotService, staticDir?: string, rootDir?: string, arduinoService?: ArduinoService, upythonService?: MicroPythonService, pygameService?: PygameService, picoSdkService?: PicoSdkService | null, pluginService?: PluginService, backendPluginService?: BackendPluginService, secretsService?: SecretsService) {
    super(port, fileSystem, undefined, undefined, undefined, staticDir);
    this.jwtService = jwtService;
    this.apiKeyService = apiKeyService;
    this.iotService = iotService ?? null;
    this.arduinoService = arduinoService ?? null;
    this.upythonService = upythonService ?? null;
    this.pygameService = pygameService ?? null;
    this.picoSdkService = picoSdkService ?? null;
    this.pluginService = pluginService ?? null;
    this.backendPluginService = backendPluginService ?? null;
    this.secretsService = secretsService ?? null;
    this.rootDir = rootDir ? path.resolve(rootDir) : null;
    this.ownStaticDir = staticDir ?? null;
    this.resolveSwaggerUiDir();
    this.rpcRouter = new RpcRouter();
    registerHandlers(this.rpcRouter, { iotService: this.iotService ?? undefined, fileSystem });

    this.vfs = new CompositeFS();
    if (rootDir) {
      this.vfs.mount('/data', new NodeFS({ rootDir: path.resolve(rootDir) }));
      this.scriptsService = new ScriptsService(path.resolve(rootDir));
    }

    // Auto-mount device VFS extensions into the CompositeFS at /devices/{deviceId}
    if (this.iotService) {
      this.iotService.extensions.onVfsMounted = (deviceId, mqttFs) => {
        const mountPoint = `/devices/${deviceId}`;
        try {
          this.vfs.mount(mountPoint, mqttFs);
          console.log(`[VFS] Mounted device VFS at ${mountPoint}`);
        } catch {
          // Already mounted — skip
        }
      };
      this.iotService.extensions.onVfsUnmounted = (deviceId) => {
        try {
          this.vfs.unmount(`/devices/${deviceId}`);
        } catch {
          // Not mounted — skip
        }
      };
    }
  }

  getRpcRouter(): RpcRouter { return this.rpcRouter; }

  setTerminalService(service: TerminalService): void {
    this.terminalService = service;
  }

  private resolveSwaggerUiDir(): void {
    try {
      const swaggerUiPath = import.meta.resolve('swagger-ui-dist');
      // import.meta.resolve returns a file:// URL
      const resolved = new URL(swaggerUiPath).pathname;
      this.swaggerUiDir = path.dirname(resolved);
    } catch {
      console.warn('swagger-ui-dist not found, /api/docs will not be available');
    }
  }

  protected async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url?.startsWith('/api/')) {
      await this.handleApiRequest(req, res);
      return;
    }

    // Public Drive file serving — no auth required.
    // GET /public/drive/users/{userName}/{path…}
    //   → reads from data/Minis/Users/{userName}/drive/public/{path}
    // Path traversal blocked: the request path MUST resolve INSIDE
    // `drive/public/`; anything else gets a 403.
    if (req.method === 'GET' && req.url?.startsWith('/public/drive/users/')) {
      await this.handleDrivePublic(req, res);
      return;
    }

    await super.handleRequest(req, res);
  }

  private async handleDrivePublic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const urlObj = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
      const m = urlObj.pathname.match(/^\/public\/drive\/users\/([^/]+)\/(.+)$/);
      if (!m) { this.sendJsonResponse(res, 400, { error: 'Invalid public Drive URL' }); return; }

      const userName = decodeURIComponent(m[1]);
      const rest = decodeURIComponent(m[2]);
      // Normalise + reject path-traversal attempts (../ outside drive/public).
      const userBase = `Minis/Users/${userName}/drive/public`;
      const requested = path.posix.normalize(`${userBase}/${rest}`);
      if (!requested.startsWith(`${userBase}/`)) {
        this.sendJsonResponse(res, 403, { error: 'Path traversal not allowed' });
        return;
      }

      // FileSystem rootDir = data/; readBinaryFile reads relative to it.
      let fileData;
      try {
        fileData = await this.fileSystem.readBinaryFile(requested);
      } catch {
        this.sendJsonResponse(res, 404, { error: 'File not found' });
        return;
      }

      const ext = path.extname(rest).toLowerCase();
      const mimeType = DRIVE_MIME[ext] ?? fileData.mimeType ?? 'application/octet-stream';
      const buffer = Buffer.from(fileData.data, 'base64');

      // Inline display in browser; client uses ?download=1 to force save dialog.
      const force = urlObj.searchParams.get('download') === '1';
      const filename = path.basename(rest);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition',
        `${force ? 'attachment' : 'inline'}; filename="${filename.replace(/"/g, '_')}"`);
      res.writeHead(200);
      res.end(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendJsonResponse(res, 500, { error: msg });
    }
  }

  /**
   * Dispatches `/api/users/{owner}/{basePath}/*` to a loaded backend plugin route.
   * `basePath` is the plugin's friendly URL segment (from its manifest, default = plugin id),
   * or the collision-proof `plugin/{pluginId}` fallback. Returns true if the request was
   * handled (response sent).
   *
   * Called twice per request: pre-auth with `user = null` (only `public` routes match),
   * and post-auth with the authenticated user (non-public routes, with an ownership check).
   * A non-public route reached pre-auth returns false so the normal auth gate runs;
   * a path owned by no plugin returns false so core routing takes over.
   */
  private async tryBackendPlugin(
    req: IncomingMessage,
    res: ServerResponse,
    apiPath: string,
    method: string,
    user: AuthTokenPayload | null,
  ): Promise<boolean> {
    if (!this.backendPluginService) return false;
    const m = apiPath.match(/^\/users\/([^/]+)\/(.+)$/);
    if (!m) return false;

    const owner = decodeURIComponent(m[1]);
    const rest = m[2]; // path after /api/users/{owner}/ — e.g. "google-photos/auth-url"

    const route = this.backendPluginService.matchRoute(owner, method, rest);
    if (!route) return false;

    if (!route.public) {
      if (!user) return false; // defer to the auth gate
      if (user.userName !== owner && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return true;
      }
    }

    let body: unknown;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      try {
        body = await this.parseRequestBody(req);
      } catch {
        body = undefined;
      }
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const ctx: PluginRequestContext = {
      req,
      res,
      method,
      query: url.searchParams,
      body,
      user: user ?? null,
      ownerUserName: owner,
      json: (status, data) => this.sendJsonResponse(res, status, data),
      text: (status, b, contentType = 'text/plain; charset=utf-8') => {
        res.writeHead(status, { 'Content-Type': contentType });
        res.end(b);
      },
      redirect: (location) => {
        res.writeHead(302, { Location: location });
        res.end();
      },
    };

    await this.backendPluginService.invokeRoute(route, ctx);
    return true;
  }

  /**
   * Fetch JSON from the Immich server with retry on transient failures.
   * Immich behind a reverse proxy intermittently returns 5xx or HTML error
   * pages; we retry a few times before surfacing a 502 so the gallery does not
   * fail on a single flaky upstream response.
   */
  private async immichFetchJson(
    url: string,
    init: Parameters<typeof fetch>[1],
    maxTries = 3,
  ): Promise<{ status: number; data: unknown }> {
    let lastError = 'unknown error';
    for (let attempt = 0; attempt < maxTries; attempt++) {
      try {
        const resp = await fetch(url, init);
        const text = await resp.text();
        const looksHtml = text.trimStart().startsWith('<');
        // Transient upstream failure (proxy 5xx or HTML error page) — retry.
        if ((resp.status >= 500 || looksHtml) && attempt < maxTries - 1) {
          lastError = looksHtml ? `non-JSON response (status ${resp.status})` : `upstream ${resp.status}`;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        if (looksHtml) {
          return { status: 502, data: { error: `Immich returned a non-JSON response (status ${resp.status})` } };
        }
        try {
          return { status: resp.status, data: JSON.parse(text) };
        } catch {
          return { status: 502, data: { error: 'Immich returned invalid JSON' } };
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'fetch error';
        if (attempt < maxTries - 1) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }
    return { status: 502, data: { error: `Immich proxy failed: ${lastError}` } };
  }

  private async handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const fullApiPath = req.url!.replace(/^\/api/, '');
    const apiPath = fullApiPath.split('?')[0];
    const method = req.method || 'GET';

    // --- Public endpoints (no auth required) ---

    // Client-side remote logging (mobile debug)
    if (method === 'POST' && apiPath === '/log') {
      const body = await this.parseRequestBody(req);
      const { tag = 'CLIENT', msg } = body as { tag?: string; msg: unknown };
      console.log(`[${tag}]`, typeof msg === 'string' ? msg : JSON.stringify(msg));
      this.sendJsonResponse(res, 200, { ok: true });
      return;
    }

    // Auth
    if (method === 'POST' && apiPath === '/auth/login') {
      await this.handleLogin(req, res);
      return;
    }
    if (method === 'GET' && apiPath === '/auth/users') {
      await this.handlePublicUserList(res);
      return;
    }

    // Swagger docs
    if (apiPath === '/docs') {
      res.writeHead(301, { Location: '/api/docs/' });
      res.end();
      return;
    }
    if (apiPath === '/docs/') {
      this.serveSwaggerUi(res);
      return;
    }
    if (apiPath === '/docs/swagger.json') {
      this.sendJsonResponse(res, 200, buildSwaggerSpec(this.rpcRouter));
      return;
    }
    if (apiPath.startsWith('/docs/')) {
      this.serveSwaggerAsset(apiPath.replace('/docs/', ''), res);
      return;
    }

    // Pygame web build static files: GET /users/{userName}/project-pygame/{projectId}/sketches/{sketchName}/web-build/**
    // Public — opened in a new tab without JWT token
    const pygameWebBuildMatchPublic = apiPath.match(/^\/users\/([^/]+)\/project-pygame\/([^/]+)\/sketches\/([^/]+)\/web-build(?:\/(.*))?$/);
    if (pygameWebBuildMatchPublic && method === 'GET') {
      const wUserName = decodeURIComponent(pygameWebBuildMatchPublic[1]);
      const wProjectName = decodeURIComponent(pygameWebBuildMatchPublic[2]);
      const wSketchName = decodeURIComponent(pygameWebBuildMatchPublic[3]);
      const wFilePath = pygameWebBuildMatchPublic[4] ? decodeURIComponent(pygameWebBuildMatchPublic[4]) : 'index.html';
      const wProjectDirName = await this.resolveProjectName(wUserName, wProjectName);
      if (!wProjectDirName) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }
      await this.handlePygameWebBuildFile(res, wUserName, wProjectDirName, wSketchName, wFilePath);
      return;
    }

    // Data file listing — public, used by SmartDisplay image picker
    // GET /api/data-files  returns { files: string[] } — images from public/public/, paths prefixed with data/
    if (apiPath === '/data-files' && method === 'GET') {
      const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']);
      try {
        const tree = await this.fileSystem.listDirectory('public/public');
        const files: string[] = [];
        const flatten = (node: { name: string; path: string; type: string; children?: typeof tree['children'] }) => {
          if (node.type === 'file' && IMAGE_EXTS.has(path.extname(node.name).toLowerCase())) {
            // Prefix with data/ so the path passes /files/ security check (which expects data/public/...)
            files.push('data/' + node.path.replace(/\\/g, '/'));
          } else {
            node.children?.forEach(flatten);
          }
        };
        flatten(tree);
        this.sendJsonResponse(res, 200, { files: files.sort() });
      } catch {
        this.sendJsonResponse(res, 200, { files: [] });
      }
      return;
    }

    // User public files — public, no auth required
    // GET /api/users/{userName}/public/{filePath} → serves data/Minis/Users/{userName}/public/{filePath}
    const userPublicMatch = apiPath.match(/^\/users\/([^/]+)\/public\/(.+)$/);
    if (userPublicMatch && method === 'GET') {
      const pubUserName = decodeURIComponent(userPublicMatch[1]);
      const pubFilePath = decodeURIComponent(userPublicMatch[2]);
      await this.handleUserPublicFile(res, pubUserName, pubFilePath);
      return;
    }

    // Smart display config GET — public so devices can fetch without a token
    const smartDisplayPublicMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/smart-display$/);
    if (smartDisplayPublicMatch && method === 'GET') {
      const userName   = decodeURIComponent(smartDisplayPublicMatch[1]);
      const deviceName = decodeURIComponent(smartDisplayPublicMatch[2]);
      await this.handleSmartDisplayConfig(req, res, 'GET', userName, deviceName);
      return;
    }

    // Immich proxy — all /api/immich/* routes proxy to the Immich server (avoids CORS in browser)

    // POST /api/immich/login  { immichUrl, email, password } → { accessToken }
    if (apiPath === '/immich/login' && method === 'POST') {
      try {
        const body = await this.parseRequestBody(req) as { immichUrl: string; email: string; password: string };
        const { status, data } = await this.immichFetchJson(`${body.immichUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: body.email, password: body.password }),
        });
        this.sendJsonResponse(res, status, data);
      } catch (e) {
        this.sendJsonResponse(res, 502, { error: e instanceof Error ? e.message : 'Proxy error' });
      }
      return;
    }

    // GET /api/immich/albums?immichUrl=...&accessToken=...
    if (apiPath === '/immich/albums' && method === 'GET') {
      const p = new URL(req.url!, 'http://localhost').searchParams;
      const { status, data } = await this.immichFetchJson(`${p.get('immichUrl')}/api/albums`, {
        headers: { Authorization: `Bearer ${p.get('accessToken')}` },
      });
      this.sendJsonResponse(res, status, data);
      return;
    }

    // GET /api/immich/albums/:albumId?immichUrl=...&accessToken=...
    const albumMatch = apiPath.match(/^\/immich\/albums\/([^/]+)$/);
    if (albumMatch && method === 'GET') {
      const p = new URL(req.url!, 'http://localhost').searchParams;
      const { status, data } = await this.immichFetchJson(`${p.get('immichUrl')}/api/albums/${albumMatch[1]}`, {
        headers: { Authorization: `Bearer ${p.get('accessToken')}` },
      });
      this.sendJsonResponse(res, status, data);
      return;
    }

    // GET /api/immich/assets/:assetId/thumbnail?immichUrl=...&accessToken=...&size=thumbnail
    const thumbMatch = apiPath.match(/^\/immich\/assets\/([^/]+)\/thumbnail$/);
    if (thumbMatch && method === 'GET') {
      try {
        const p = new URL(req.url!, 'http://localhost').searchParams;
        const size = p.get('size') ?? 'thumbnail';
        const imgResp = await fetch(`${p.get('immichUrl')}/api/assets/${thumbMatch[1]}/thumbnail?size=${size}`, {
          headers: { Authorization: `Bearer ${p.get('accessToken')}` },
        });
        const buffer = Buffer.from(await imgResp.arrayBuffer());
        res.writeHead(imgResp.status, {
          'Content-Type': imgResp.headers.get('content-type') ?? 'image/jpeg',
          'Cache-Control': 'public, max-age=3600',
        });
        res.end(buffer);
      } catch (e) {
        this.sendJsonResponse(res, 502, { error: e instanceof Error ? e.message : 'Proxy error' });
      }
      return;
    }

    // GET /api/immich/album-image?shareUrl=...  — returns a random thumbnail from a shared album
    // Asset ID list is cached server-side for 1h; only one thumbnail is fetched per request.
    if (apiPath === '/immich/album-image' && method === 'GET') {
      try {
        const params = new URL(req.url!, 'http://localhost').searchParams;
        const shareUrl = params.get('shareUrl') ?? '';
        if (!shareUrl) { this.sendJsonResponse(res, 400, { error: 'Missing shareUrl' }); return; }
        const clientW = parseInt(params.get('w') ?? '800', 10);
        const clientH = parseInt(params.get('h') ?? '480', 10);
        // Pick Immich thumbnail size based on largest client dimension
        const immichSize = Math.max(clientW, clientH) <= 300 ? 'thumbnail' : 'preview';

        let cached = this.immichAlbumCache.get(shareUrl);
        if (!cached || Date.now() - cached.cachedAt > MycastleHttpServer.IMMICH_CACHE_TTL) {
          const parsed = new URL(shareUrl);
          const baseUrl = `${parsed.protocol}//${parsed.host}`;
          const key = parsed.pathname.split('/').pop()!;
          const slResp = await fetch(`${baseUrl}/api/shared-links/me?key=${encodeURIComponent(key)}`);
          if (!slResp.ok) {
            console.error(`[immich] shared-links fetch failed: ${slResp.status} ${slResp.statusText} for ${baseUrl}`);
            this.sendJsonResponse(res, 502, { error: `Immich shared-links ${slResp.status}` }); return;
          }
          const slData = await slResp.json() as { album?: { id?: string } };
          const albumId = slData.album?.id;
          if (!albumId) { this.sendJsonResponse(res, 502, { error: 'No albumId in shared link' }); return; }
          const albumResp = await fetch(`${baseUrl}/api/albums/${albumId}?key=${encodeURIComponent(key)}`);
          if (!albumResp.ok) {
            console.error(`[immich] album fetch failed: ${albumResp.status} ${albumResp.statusText} albumId=${albumId}`);
            this.sendJsonResponse(res, 502, { error: `Album fetch ${albumResp.status}` }); return;
          }
          const albumData = await albumResp.json() as { assets?: { id: string; type: string; description?: string }[] };
          const assets = (albumData.assets ?? [])
            .filter(a => a.type === 'IMAGE')
            .map(a => ({ id: a.id, description: a.description ?? '' }));
          cached = { assets, baseUrl, key, cachedAt: Date.now() };
          this.immichAlbumCache.set(shareUrl, cached);
        }

        if (cached.assets.length === 0) { this.sendJsonResponse(res, 404, { error: 'No images in album' }); return; }

        // Retry up to 3 times with different random assets (handles occasional Immich 502/503)
        const maxTries = Math.min(3, cached.assets.length);
        const triedIndices = new Set<number>();
        let lastError = '';
        let sent = false;
        for (let attempt = 0; attempt < maxTries; attempt++) {
          let idx: number;
          do { idx = Math.floor(Math.random() * cached.assets.length); } while (triedIndices.has(idx));
          triedIndices.add(idx);
          const { id: assetId, description } = cached.assets[idx];
          const thumbUrl = `${cached.baseUrl}/api/assets/${assetId}/thumbnail?size=${immichSize}&key=${encodeURIComponent(cached.key)}`;
          try {
            const thumbResp = await fetch(thumbUrl);
            if (!thumbResp.ok) {
              lastError = `Thumbnail ${thumbResp.status} for asset ${assetId}`;
              console.warn(`[immich] attempt ${attempt + 1}/${maxTries}: ${lastError}`);
              continue;
            }
            const buffer = Buffer.from(await thumbResp.arrayBuffer());
            const headers: Record<string, string> = {
              'Content-Type': thumbResp.headers.get('content-type') ?? 'image/jpeg',
              'Cache-Control': 'no-store',
            };
            if (description) headers['X-Immich-Description'] = encodeURIComponent(description);
            res.writeHead(200, headers);
            res.end(buffer);
            sent = true;
            break;
          } catch (fetchErr) {
            lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            console.warn(`[immich] attempt ${attempt + 1}/${maxTries} fetch error: ${lastError}`);
          }
        }
        if (!sent) {
          this.sendJsonResponse(res, 502, { error: `All thumbnail attempts failed. Last: ${lastError}` });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[immich] album-image error: ${msg}`);
        this.sendJsonResponse(res, 500, { error: msg });
      }
      return;
    }

    // POST /api/immich/download  — downloads an asset from Immich and saves it to local public storage
    if (apiPath === '/immich/download' && method === 'POST') {
      try {
        const body = await this.parseRequestBody(req) as { immichUrl: string; assetId: string; accessToken: string };
        const { immichUrl, assetId, accessToken } = body;
        if (!immichUrl || !assetId || !accessToken) {
          this.sendJsonResponse(res, 400, { error: 'Missing immichUrl, assetId or accessToken' });
          return;
        }
        const imgResp = await fetch(`${immichUrl}/api/assets/${assetId}/original`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!imgResp.ok) {
          this.sendJsonResponse(res, 502, { error: `Immich returned ${imgResp.status}` });
          return;
        }
        const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
        const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
        const localPath = `public/public/immich/${assetId}${ext}`;
        const buffer = Buffer.from(await imgResp.arrayBuffer());
        await this.fileSystem.writeBinaryFile(localPath, buffer.toString('base64'), contentType);
        this.sendJsonResponse(res, 200, { path: `data/public/public/immich/${assetId}${ext}` });
      } catch (e) {
        this.sendJsonResponse(res, 500, { error: e instanceof Error ? e.message : 'Download failed' });
      }
      return;
    }

    // GET /api/weather-image?lat=52.23&lon=21.01&w=800&h=480&locationName=Warsaw
    // Fetches from Open-Meteo (no key needed), renders SVG card → PNG via sharp. Cached 15 min.
    if (apiPath === '/weather-image' && method === 'GET') {
      try {
        const params = new URL(req.url!, 'http://localhost').searchParams;
        const lat = parseFloat(params.get('lat') ?? '');
        const lon = parseFloat(params.get('lon') ?? '');
        const w = Math.min(Math.max(parseInt(params.get('w') ?? '800', 10), 100), 3000);
        const h = Math.min(Math.max(parseInt(params.get('h') ?? '480', 10), 100), 2000);
        const locationName = params.get('locationName') || 'Weather';

        if (isNaN(lat) || isNaN(lon)) {
          this.sendJsonResponse(res, 400, { error: 'lat and lon query params are required' });
          return;
        }

        const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        let cached = this.weatherCache.get(cacheKey);
        if (!cached || Date.now() - cached.cachedAt > MycastleHttpServer.WEATHER_CACHE_TTL) {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,apparent_temperature,relative_humidity_2m,windspeed_10m,weathercode` +
            `&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=4`;
          const resp = await fetch(url);
          if (!resp.ok) {
            this.sendJsonResponse(res, 502, { error: `Open-Meteo ${resp.status}` });
            return;
          }
          const data = await resp.json() as OpenMeteoResponse;
          cached = { data, cachedAt: Date.now() };
          this.weatherCache.set(cacheKey, cached);
        }

        const { current, daily } = cached.data;
        const svgBuf = this.buildWeatherSvg(w, h, {
          locationName,
          temp: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          windspeed: current.windspeed_10m,
          code: current.weathercode,
          daily: daily.time.map((date, i) => ({
            date, max: daily.temperature_2m_max[i], min: daily.temperature_2m_min[i], code: daily.weathercode[i],
          })),
        });

        const pngBuf = await sharp(svgBuf).png().toBuffer();
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
        res.end(pngBuf);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[weather] error: ${msg}`);
        this.sendJsonResponse(res, 500, { error: msg });
      }
      return;
    }

    // Plugin secrets — GET a single value. Public route: a `shared` secret is
    // readable by anyone (incl. anonymously, e.g. a viewer of the owner's page);
    // a private secret requires owner/admin auth. List/write/delete are auth-only.
    const secretGetMatch = apiPath.match(/^\/users\/([^/]+)\/plugin-secrets\/([^/]+)\/([^/]+)$/);
    if (secretGetMatch && method === 'GET') {
      const owner = decodeURIComponent(secretGetMatch[1]);
      const pluginId = decodeURIComponent(secretGetMatch[2]);
      const key = decodeURIComponent(secretGetMatch[3]);
      if (!this.secretsService) {
        this.sendJsonResponse(res, 503, { error: 'Secrets service not available' });
        return;
      }
      const secret = await this.secretsService.get(owner, pluginId, key);
      if (!secret) {
        this.sendJsonResponse(res, 404, { error: 'Secret not found' });
        return;
      }
      if (!secret.shared) {
        const u = checkAuth(req, this.jwtService, this.apiKeyService);
        if (!u) {
          this.sendJsonResponse(res, 401, { error: 'Unauthorized' });
          return;
        }
        if (u.userName !== owner && !u.isAdmin) {
          this.sendJsonResponse(res, 403, { error: 'Forbidden' });
          return;
        }
      }
      this.sendJsonResponse(res, 200, { key, value: secret.value, shared: secret.shared });
      return;
    }

    // Backend plugin routes marked `public` (e.g. OAuth callbacks) — handled before auth.
    if (await this.tryBackendPlugin(req, res, apiPath, method, null)) return;

    // --- Protected endpoints (auth required) ---

    // Allow `?token=<jwt>` in the URL as a fallback when no Authorization header
    // is present — needed for download URLs that the user opens in a new tab,
    // and for Android WebView which can't attach custom headers when delegating
    // a navigation to the system browser. Header still wins if present.
    if (!req.headers.authorization) {
      const queryToken = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`).searchParams.get('token');
      if (queryToken) {
        req.headers.authorization = `Bearer ${queryToken}`;
      }
    }

    const user = checkAuth(req, this.jwtService, this.apiKeyService);
    if (!user) {
      this.sendJsonResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    // Backend plugin routes requiring auth — dispatched to the owning user's plugin.
    if (await this.tryBackendPlugin(req, res, apiPath, method, user)) return;

    // Backend plugins: GET /users/{userName}/backend-plugins — loaded + available plugins
    const backendPluginsListMatch = apiPath.match(/^\/users\/([^/]+)\/backend-plugins$/);
    if (backendPluginsListMatch && method === 'GET') {
      const targetUser = decodeURIComponent(backendPluginsListMatch[1]);
      if (user.userName !== targetUser && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!this.backendPluginService) {
        this.sendJsonResponse(res, 200, { loaded: [], available: [] });
        return;
      }
      const loaded = this.backendPluginService.getLoadedForUser(targetUser);
      const available = await this.backendPluginService.listPlugins(targetUser);
      this.sendJsonResponse(res, 200, { loaded, available });
      return;
    }

    // Backend plugins: POST /users/{userName}/backend-plugins/{pluginId}/reload — rebuild + reactivate
    const backendPluginReloadMatch = apiPath.match(/^\/users\/([^/]+)\/backend-plugins\/([^/]+)\/reload$/);
    if (backendPluginReloadMatch && method === 'POST') {
      const targetUser = decodeURIComponent(backendPluginReloadMatch[1]);
      const pluginId = decodeURIComponent(backendPluginReloadMatch[2]);
      if (user.userName !== targetUser && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!this.backendPluginService) {
        this.sendJsonResponse(res, 503, { error: 'Backend plugin service not available' });
        return;
      }
      const ok = await this.backendPluginService.reloadPlugin(targetUser, pluginId);
      this.sendJsonResponse(res, ok ? 200 : 404,
        ok ? { ok: true } : { error: `Plugin ${pluginId} not found or failed to load` });
      return;
    }

    // Plugin secrets — list keys + metadata (owner or admin only; values not returned)
    const secretListMatch = apiPath.match(/^\/users\/([^/]+)\/plugin-secrets\/([^/]+)$/);
    if (secretListMatch && method === 'GET') {
      const owner = decodeURIComponent(secretListMatch[1]);
      const pluginId = decodeURIComponent(secretListMatch[2]);
      if (user.userName !== owner && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!this.secretsService) {
        this.sendJsonResponse(res, 503, { error: 'Secrets service not available' });
        return;
      }
      const items = await this.secretsService.list(owner, pluginId);
      this.sendJsonResponse(res, 200, { items });
      return;
    }

    // Plugin secrets — write / delete a single key (owner or admin only)
    const secretWriteMatch = apiPath.match(/^\/users\/([^/]+)\/plugin-secrets\/([^/]+)\/([^/]+)$/);
    if (secretWriteMatch && (method === 'PUT' || method === 'DELETE')) {
      const owner = decodeURIComponent(secretWriteMatch[1]);
      const pluginId = decodeURIComponent(secretWriteMatch[2]);
      const key = decodeURIComponent(secretWriteMatch[3]);
      if (user.userName !== owner && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!this.secretsService) {
        this.sendJsonResponse(res, 503, { error: 'Secrets service not available' });
        return;
      }
      if (method === 'DELETE') {
        await this.secretsService.delete(owner, pluginId, key);
        this.sendJsonResponse(res, 200, { ok: true });
        return;
      }
      const body = await this.parseRequestBody(req) as { value?: unknown; shared?: boolean };
      if (typeof body.value !== 'string') {
        this.sendJsonResponse(res, 400, { error: 'value (string) is required' });
        return;
      }
      await this.secretsService.set(owner, pluginId, key, body.value, body.shared === true);
      this.sendJsonResponse(res, 200, { ok: true });
      return;
    }

    // Cross-user Markdown read: GET /users/{userName}/md/{path} — lets any
    // authenticated user view another user's Markdown page (read-only). Powers
    // the /viewer/md/u/:userName/* route so embedded Plugin Script blocks can
    // run against the page owner's shared secrets.
    const mdReadMatch = apiPath.match(/^\/users\/([^/]+)\/md\/(.+)$/);
    if (mdReadMatch && method === 'GET') {
      const targetUser = decodeURIComponent(mdReadMatch[1]);
      const relPath = decodeURIComponent(mdReadMatch[2]);
      // Reject path traversal; only .md files under the user's md/ directory.
      if (relPath.includes('..') || !relPath.endsWith('.md')) {
        this.sendJsonResponse(res, 400, { error: 'Invalid path' });
        return;
      }
      try {
        const file = await this.fileSystem.readFile(`Minis/Users/${targetUser}/md/${relPath}`);
        this.sendJsonResponse(res, 200, { content: file.content });
      } catch {
        this.sendJsonResponse(res, 404, { error: 'File not found' });
      }
      return;
    }

    // Terminal ticket: POST /api/terminal/ticket (admin only)
    if (method === 'POST' && apiPath === '/terminal/ticket') {
      if (!user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: admin access required' });
        return;
      }
      if (!this.terminalService) {
        this.sendJsonResponse(res, 503, { error: 'Terminal service not available' });
        return;
      }
      const ticket = this.terminalService.createTicket(user);
      this.sendJsonResponse(res, 200, { ticket });
      return;
    }

    // AI search proxy: POST /ai/search
    if (apiPath === '/ai/search' && method === 'POST') {
      await this.handleAiSearch(req, res);
      return;
    }

    // Web fetch proxy: POST /api/web-fetch  { url } → { url, text, title?, statusCode }
    if (apiPath === '/web-fetch' && method === 'POST') {
      await this.handleWebFetch(req, res);
      return;
    }

    // Config: GET /api/config/anthropic-key — returns Anthropic API key from env
    if (method === 'GET' && apiPath === '/config/anthropic-key') {
      this.sendJsonResponse(res, 200, { apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
      return;
    }

    // Next available serial number: GET /api/next-sn
    if (method === 'GET' && apiPath === '/next-sn') {
      await this.handleNextSn(res);
      return;
    }

    // GitHub Project Defs: accessible to all authenticated users
    if (apiPath.startsWith('/github-projectdefs')) {
      await this.handleGithubProjectdefs(req, res, method, apiPath.replace('/github-projectdefs', '/admin/github-projectdefs'));
      return;
    }

    // Admin routes require isAdmin
    if (apiPath.startsWith('/admin/') && !user.isAdmin) {
      this.sendJsonResponse(res, 403, { error: 'Forbidden: admin access required' });
      return;
    }

    // App sessions (admin only) — GET /api/admin/app-sessions[?userId=][&weekly=true]
    if (apiPath === '/admin/app-sessions' && method === 'GET') {
      const urlObj = new URL(req.url ?? '', 'http://localhost');
      const filterUserId = urlObj.searchParams.get('userId') ?? undefined;
      const weekly = urlObj.searchParams.get('weekly') === 'true';
      if (!this.iotService) {
        this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
        return;
      }
      if (weekly) {
        const stats = this.iotService.appSessions.getWeeklyStats(filterUserId);
        this.sendJsonResponse(res, 200, { stats });
      } else {
        const sessions = filterUserId
          ? this.iotService.appSessions.getByUser(filterUserId)
          : this.iotService.appSessions.getAll();
        this.sendJsonResponse(res, 200, { sessions });
      }
      return;
    }

    // Project time (admin only) — GET /api/admin/app-sessions/project-time[?userId=]
    if (apiPath === '/admin/app-sessions/project-time' && method === 'GET') {
      const urlObj = new URL(req.url ?? '', 'http://localhost');
      const filterUserId = urlObj.searchParams.get('userId') ?? undefined;
      if (!this.iotService) {
        this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
        return;
      }
      const stats = this.iotService.appSessions.getProjectStats(filterUserId);
      this.sendJsonResponse(res, 200, { stats });
      return;
    }

    // Plugins: GET /users/{userName}/plugins — list manifests.
    // Readable by any authenticated user so the cross-user MD viewer can load
    // the page owner's plugins (their Plugin Script namespaces).
    const pluginsListMatch = apiPath.match(/^\/users\/([^/]+)\/plugins$/);
    if (pluginsListMatch && method === 'GET') {
      const targetUser = decodeURIComponent(pluginsListMatch[1]);
      if (!this.pluginService) {
        this.sendJsonResponse(res, 200, []);
        return;
      }
      const manifests = await this.pluginService.listPlugins(targetUser);
      this.sendJsonResponse(res, 200, manifests);
      return;
    }

    // Plugins: GET /users/{userName}/plugins/{pluginId}/bundle.js — built CJS bundle.
    // Readable by any authenticated user (see plugins-list note above).
    const pluginBundleMatch = apiPath.match(/^\/users\/([^/]+)\/plugins\/([^/]+)\/bundle\.js$/);
    if (pluginBundleMatch && method === 'GET') {
      const targetUser = decodeURIComponent(pluginBundleMatch[1]);
      const pluginId = decodeURIComponent(pluginBundleMatch[2]);
      if (!this.pluginService) {
        this.sendJsonResponse(res, 404, { error: 'Plugin service not available' });
        return;
      }
      const js = await this.pluginService.buildPlugin(targetUser, pluginId);
      if (!js) {
        this.sendJsonResponse(res, 404, { error: `Plugin ${pluginId} not found or failed to build` });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(js);
      return;
    }

    // API Keys: /users/{userName}/api-keys[/{keyId}]
    const apiKeysMatch = apiPath.match(/^\/users\/([^/]+)\/api-keys(?:\/(.+))?$/);
    if (apiKeysMatch) {
      const userName = decodeURIComponent(apiKeysMatch[1]);
      const keyId = apiKeysMatch[2] ? decodeURIComponent(apiKeysMatch[2]) : undefined;
      if (user.userName !== userName && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: can only manage your own API keys' });
        return;
      }
      await this.handleApiKeys(req, res, method, user, keyId);
      return;
    }

    // RPC dispatch: POST /api/rpc/{methodName}
    const rpcMatch = apiPath.match(/^\/rpc\/([a-zA-Z0-9_.]+)$/);
    if (rpcMatch && method === 'POST') {
      const methodName = rpcMatch[1];
      const body = await this.parseRequestBody(req);
      const result = await this.rpcRouter.dispatch(methodName, body, { user });
      this.sendJsonResponse(res, result.statusCode, result.body);
      return;
    }

    // GitHub Import: /admin/github-projectdefs[/import]
    if (apiPath.startsWith('/admin/github-projectdefs')) {
      await this.handleGithubProjectdefs(req, res, method, apiPath);
      return;
    }

    // Def sources upload: POST /admin/{resource}/{id}/sources
    const sourcesMatch = apiPath.match(/^\/admin\/(\w+)\/([^/]+)\/sources$/);
    if (sourcesMatch && method === 'POST') {
      const resource = sourcesMatch[1];
      const defId = decodeURIComponent(sourcesMatch[2]);
      await this.handleUploadDefSources(req, res, resource, defId);
      return;
    }

    // Admin CRUD routes: /admin/{resource} and /admin/{resource}/{id}
    const adminMatch = apiPath.match(/^\/admin\/(\w+)(?:\/(.+))?$/);
    if (adminMatch) {
      const resource = adminMatch[1];
      const id = adminMatch[2] ? decodeURIComponent(adminMatch[2]) : undefined;
      const config = CRUD_CONFIGS[resource];
      if (config) {
        await this.handleCrud(req, res, method, config, id);
        return;
      }
    }

    // IoT endpoints (must be matched BEFORE generic user devices/projects routes)

    // Virtual input extensions: POST /users/{userName}/devices/{deviceName}/ext/{vkbd|vmouse}
    const extReqMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/ext\/(vkbd|vmouse)$/);
    if (extReqMatch && method === 'POST') {
      const userName = decodeURIComponent(extReqMatch[1]);
      const deviceName = decodeURIComponent(extReqMatch[2]);
      const extType = extReqMatch[3] as 'vkbd' | 'vmouse';
      await this.handleVirtualInputExt(req, res, userName, deviceName, extType);
      return;
    }

    // Device VFS: /users/{userName}/devices/{deviceName}/vfs/{operation} — user-scoped (no admin required)
    const deviceVfsMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/vfs\/([a-zA-Z]+)$/);
    if (deviceVfsMatch) {
      const deviceName = decodeURIComponent(deviceVfsMatch[2]);
      const operation = deviceVfsMatch[3];
      await this.handleDeviceVfs(req, res, method, deviceName, operation);
      return;
    }

    // IoT extensions (active, from hello): /users/{userName}/devices/{deviceName}/iot-extensions
    const iotExtensionsMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/iot-extensions$/);
    if (iotExtensionsMatch) {
      const deviceName = decodeURIComponent(iotExtensionsMatch[2]);
      const types = this.iotService?.extensions.getActiveExtensions(deviceName) ?? [];
      this.sendJsonResponse(res, 200, { extensions: types.map(type => ({ type })) });
      return;
    }

    // IoT config: /users/{userName}/devices/{deviceName}/iot-config
    const iotConfigMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/iot-config$/);
    if (iotConfigMatch) {
      const userName = decodeURIComponent(iotConfigMatch[1]);
      const deviceName = decodeURIComponent(iotConfigMatch[2]);
      await this.handleIotConfig(req, res, method, userName, deviceName);
      return;
    }

    // IoT telemetry: /users/{userName}/devices/{deviceName}/telemetry[/latest]
    const telemetryMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/telemetry(\/latest)?$/);
    if (telemetryMatch) {
      const userName = decodeURIComponent(telemetryMatch[1]);
      const deviceName = decodeURIComponent(telemetryMatch[2]);
      const isLatest = !!telemetryMatch[3];
      await this.handleIotTelemetry(req, res, method, userName, deviceName, isLatest);
      return;
    }

    // IoT commands: /users/{userName}/devices/{deviceName}/commands
    const commandsMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/commands$/);
    if (commandsMatch) {
      const userName = decodeURIComponent(commandsMatch[1]);
      const deviceName = decodeURIComponent(commandsMatch[2]);
      await this.handleIotCommands(req, res, method, userName, deviceName);
      return;
    }

    // Device shares: /users/{userName}/devices/{deviceName}/shares[/{shareId}]
    const sharesMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/shares(?:\/(.+))?$/);
    if (sharesMatch) {
      const userName = decodeURIComponent(sharesMatch[1]);
      const deviceName = decodeURIComponent(sharesMatch[2]);
      const shareId = sharesMatch[3] ? decodeURIComponent(sharesMatch[3]) : undefined;
      await this.handleDeviceShares(req, res, method, userName, deviceName, shareId);
      return;
    }

    // Shared devices for target user: /users/{userName}/shared-devices
    const sharedDevicesMatch = apiPath.match(/^\/users\/([^/]+)\/shared-devices$/);
    if (sharedDevicesMatch) {
      const userName = decodeURIComponent(sharedDevicesMatch[1]);
      await this.handleSharedDevices(req, res, method, userName);
      return;
    }

    // Shares owned by user: /users/{userName}/my-shares
    const mySharesMatch = apiPath.match(/^\/users\/([^/]+)\/my-shares$/);
    if (mySharesMatch) {
      const userName = decodeURIComponent(mySharesMatch[1]);
      await this.handleMyShares(req, res, method, userName);
      return;
    }

    // Electronics Configuration: /users/{userName}/electronics/configuration
    const electronicsConfigMatch = apiPath.match(/^\/users\/([^/]+)\/electronics\/configuration$/);
    if (electronicsConfigMatch) {
      const userName = decodeURIComponent(electronicsConfigMatch[1]);
      await this.handleIotArchitecture(req, res, method, userName);
      return;
    }

    // IoT device status: /users/{userName}/iot/devices
    const iotDevicesMatch = apiPath.match(/^\/users\/([^/]+)\/iot\/devices$/);
    if (iotDevicesMatch) {
      const userName = decodeURIComponent(iotDevicesMatch[1]);
      await this.handleIotDevicesList(req, res, method, userName);
      return;
    }

    // IoT alerts: /users/{userName}/alerts[/{id}]
    const alertsMatch = apiPath.match(/^\/users\/([^/]+)\/alerts(?:\/(.+))?$/);
    if (alertsMatch) {
      const userName = decodeURIComponent(alertsMatch[1]);
      const alertId = alertsMatch[2] ? decodeURIComponent(alertsMatch[2]) : undefined;
      await this.handleIotAlerts(req, res, method, userName, alertId);
      return;
    }

    // IoT alert rules: /users/{userName}/alert-rules[/{id}]
    const alertRulesMatch = apiPath.match(/^\/users\/([^/]+)\/alert-rules(?:\/(.+))?$/);
    if (alertRulesMatch) {
      const userName = decodeURIComponent(alertRulesMatch[1]);
      const ruleId = alertRulesMatch[2] ? decodeURIComponent(alertRulesMatch[2]) : undefined;
      await this.handleIotAlertRules(req, res, method, userName, ruleId);
      return;
    }

    // Retention policy: /users/{userName}/iot-retention and /users/{userName}/devices/{deviceName}/iot-retention
    const retentionDeviceMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/iot-retention$/);
    if (retentionDeviceMatch) {
      const userName   = decodeURIComponent(retentionDeviceMatch[1]);
      const deviceName = decodeURIComponent(retentionDeviceMatch[2]);
      await this.handleIotRetention(req, res, method, userName, deviceName);
      return;
    }
    const retentionMatch = apiPath.match(/^\/users\/([^/]+)\/iot-retention$/);
    if (retentionMatch) {
      const userName = decodeURIComponent(retentionMatch[1]);
      await this.handleIotRetention(req, res, method, userName);
      return;
    }

    // Device twin: /users/{userName}/devices/{deviceName}/twin
    const twinMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/twin$/);
    if (twinMatch) {
      const userName   = decodeURIComponent(twinMatch[1]);
      const deviceName = decodeURIComponent(twinMatch[2]);
      await this.handleDeviceTwin(req, res, method, userName, deviceName);
      return;
    }

    // Notification channels: /users/{userName}/notification-channels[/{id}]
    const notifChannelMatch = apiPath.match(/^\/users\/([^/]+)\/notification-channels(?:\/([^/]+))?$/);
    if (notifChannelMatch) {
      const userName   = decodeURIComponent(notifChannelMatch[1]);
      const channelId  = notifChannelMatch[2] ? decodeURIComponent(notifChannelMatch[2]) : undefined;
      await this.handleNotificationChannels(req, res, method, userName, channelId);
      return;
    }

    // IoT automations: /users/{userName}/iot-automations[/{id}]
    const automationMatch = apiPath.match(/^\/users\/([^/]+)\/iot-automations(?:\/([^/]+))?$/);
    if (automationMatch) {
      const userName      = decodeURIComponent(automationMatch[1]);
      const automationId  = automationMatch[2] ? decodeURIComponent(automationMatch[2]) : undefined;
      await this.handleIotAutomations(req, res, method, userName, automationId);
      return;
    }

    // User localizations: /users/{userName}/localizations[/{id}]
    const userLocalizationsMatch = apiPath.match(/^\/users\/([^/]+)\/localizations(?:\/([^/]+))?$/);
    if (userLocalizationsMatch) {
      const userName = decodeURIComponent(userLocalizationsMatch[1]);
      const locId = userLocalizationsMatch[2] ? decodeURIComponent(userLocalizationsMatch[2]) : undefined;
      await this.handleUserLocalizations(req, res, method, userName, locId);
      return;
    }

    // Smart display config PUT — protected
    const smartDisplayMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/smart-display$/);
    if (smartDisplayMatch && method === 'PUT') {
      const userName   = decodeURIComponent(smartDisplayMatch[1]);
      const deviceName = decodeURIComponent(smartDisplayMatch[2]);
      await this.handleSmartDisplayConfig(req, res, 'PUT', userName, deviceName);
      return;
    }

    // Device minis-config: /users/{userName}/devices/{deviceName}/minis-config
    const minisConfigMatch = apiPath.match(/^\/users\/([^/]+)\/devices\/([^/]+)\/minis-config$/);
    if (minisConfigMatch && method === 'GET') {
      const userName = decodeURIComponent(minisConfigMatch[1]);
      const deviceName = decodeURIComponent(minisConfigMatch[2]);
      await this.handleDeviceMinisConfig(res, userName, deviceName);
      return;
    }

    // User devices: /users/{userName}/devices and /users/{userName}/devices/{deviceName}
    const userDevicesMatch = apiPath.match(/^\/users\/([^/]+)\/devices(?:\/([^/]+))?$/);
    if (userDevicesMatch) {
      const userName = decodeURIComponent(userDevicesMatch[1]);
      const deviceName = userDevicesMatch[2] ? decodeURIComponent(userDevicesMatch[2]) : undefined;
      if (method !== 'GET' && user.userName !== userName && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: can only manage your own devices' });
        return;
      }
      await this.handleUserDevices(req, res, method, userName, deviceName);
      return;
    }


    // User device defs: /users/{userName}/devicedefs[/{id}]
    const userDeviceDefsMatch = apiPath.match(/^\/users\/([^/]+)\/devicedefs(?:\/([^/]+))?$/);
    if (userDeviceDefsMatch) {
      const userName = decodeURIComponent(userDeviceDefsMatch[1]);
      const defId = userDeviceDefsMatch[2] ? decodeURIComponent(userDeviceDefsMatch[2]) : undefined;
      if (method !== 'GET' && user.userName !== userName && !user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: can only manage your own device definitions' });
        return;
      }
      await this.handleUserDeviceDefs(req, res, method, userName, defId);
      return;
    }

    // Project script: GET|PUT /users/{userName}/project-arduino/{projectName}/project-script
    const projectScriptMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/project-script$/);
    if (projectScriptMatch && method === 'GET') {
      const sUserName = decodeURIComponent(projectScriptMatch[1]);
      const sProjectName = decodeURIComponent(projectScriptMatch[2]);
      await this.handleProjectScript(res, sUserName, sProjectName);
      return;
    }
    if (projectScriptMatch && method === 'PUT') {
      const sUserName = decodeURIComponent(projectScriptMatch[1]);
      const sProjectName = decodeURIComponent(projectScriptMatch[2]);
      await this.handleSaveProjectScript(res, req, sUserName, sProjectName);
      return;
    }

    // Clone arduino project from GitHub: POST /users/{userName}/project-arduino/{projectName}/clone-from-github
    const cloneMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/clone-from-github$/);
    if (cloneMatch && method === 'POST') {
      const userName = decodeURIComponent(cloneMatch[1]);
      const projectName = decodeURIComponent(cloneMatch[2]);
      await this.handleProjectCloneFromGithub(req, res, userName, projectName);
      return;
    }

    // Sync arduino project from GitHub: POST /users/{userName}/project-arduino/{projectName}/sync-from-github
    const syncMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/sync-from-github$/);
    if (syncMatch && method === 'POST') {
      const userName = decodeURIComponent(syncMatch[1]);
      const projectName = decodeURIComponent(syncMatch[2]);
      await this.handleProjectSyncFromGithub(res, userName, projectName);
      return;
    }

    // Push arduino project to GitHub: POST /users/{userName}/project-arduino/{projectName}/push-to-github
    const pushMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/push-to-github$/);
    if (pushMatch && method === 'POST') {
      if (!user.isAdmin) { this.sendJsonResponse(res, 403, { error: 'Admin only' }); return; }
      const userName = decodeURIComponent(pushMatch[1]);
      const projectName = decodeURIComponent(pushMatch[2]);
      await this.handleProjectPushToGithub(req, res, userName, projectName);
      return;
    }

    // User arduino projects: /users/{userName}/project-arduino and /users/{userName}/project-arduino/{projectName}
    const userProjectsMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino(?:\/([^/]+))?$/);
    if (userProjectsMatch) {
      const userName = decodeURIComponent(userProjectsMatch[1]);
      const projectName = userProjectsMatch[2] ? decodeURIComponent(userProjectsMatch[2]) : undefined;
      await this.handleUserProjects(req, res, method, userName, projectName);
      return;
    }

    // Arduino: boards list (GET /api/arduino/boards)
    if (method === 'GET' && apiPath === '/arduino/boards') {
      await this.handleArduinoBoards(res);
      return;
    }

    // Arduino: ports list (GET /api/arduino/ports)
    if (method === 'GET' && apiPath === '/arduino/ports') {
      await this.handleArduinoPorts(res);
      return;
    }

    // Arduino: compile (POST or GET/SSE /api/users/{userName}/project-arduino/{projectName}/compile)
    const compileMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/compile$/);
    if (compileMatch && (method === 'POST' || method === 'GET')) {
      const userName = decodeURIComponent(compileMatch[1]);
      const projectName = decodeURIComponent(compileMatch[2]);
      await this.handleArduinoCompile(req, res, userName, projectName);
      return;
    }

    // Arduino: upload (POST or GET/SSE /api/users/{userName}/project-arduino/{projectName}/upload)
    const uploadMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/upload$/);
    if (uploadMatch && (method === 'POST' || method === 'GET')) {
      const userName = decodeURIComponent(uploadMatch[1]);
      const projectName = decodeURIComponent(uploadMatch[2]);
      await this.handleArduinoUpload(req, res, userName, projectName);
      return;
    }

    // Arduino: list output files (GET /api/users/{userName}/project-arduino/{projectName}/output)
    const outputMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/output(?:\/([^/]+))?$/);
    if (outputMatch) {
      const userName = decodeURIComponent(outputMatch[1]);
      const projectName = decodeURIComponent(outputMatch[2]);
      const fileName = outputMatch[3] ? decodeURIComponent(outputMatch[3]) : undefined;
      await this.handleArduinoOutput(req, res, method, userName, projectName, fileName);
      return;
    }

    // README: /users/{userName}/project-arduino/{projectName}/readme
    const readmeMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/readme$/);
    if (readmeMatch) {
      const rUserName = decodeURIComponent(readmeMatch[1]);
      const rProjectName = decodeURIComponent(readmeMatch[2]);
      await this.handleProjectReadme(req, res, method, rUserName, rProjectName);
      return;
    }

    // List files in a sketch: GET /users/{userName}/project-arduino/{projectName}/sketches/{sketchName}
    const sketchFilesMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/sketches\/([^/]+)$/);
    if (sketchFilesMatch && method === 'GET') {
      const userName = decodeURIComponent(sketchFilesMatch[1]);
      const projectName = decodeURIComponent(sketchFilesMatch[2]);
      const sketchName = decodeURIComponent(sketchFilesMatch[3]);
      if (sketchName.includes('..')) { this.sendJsonResponse(res, 400, { error: 'Invalid path' }); return; }
      if (!this.rootDir) { this.sendJsonResponse(res, 503, { error: 'rootDir not configured' }); return; }
      const projectDirName = await this.resolveProjectName(userName, projectName);
      if (!projectDirName) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }
      const dir = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectDirName, 'sketches', sketchName);
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const items = entries.filter(e => e.isFile()).map(e => e.name).sort();
        this.sendJsonResponse(res, 200, { items });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
      return;
    }

    // Sketch files: /users/{userName}/project-arduino/{projectName}/sketches[/{sketchName}/{fileName}]
    const sketchMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/sketches(?:\/([^/]+)\/([^/]+))?$/);
    if (sketchMatch) {
      const sUserName = decodeURIComponent(sketchMatch[1]);
      const sProjectName = decodeURIComponent(sketchMatch[2]);
      const sSketchName = sketchMatch[3] ? decodeURIComponent(sketchMatch[3]) : undefined;
      const sFileName = sketchMatch[4] ? decodeURIComponent(sketchMatch[4]) : undefined;
      await this.handleSketches(req, res, method, sUserName, sProjectName, sSketchName, sFileName);
      return;
    }

    // Pygame web build: POST /users/{userName}/project-pygame/{projectId}/sketches/{sketchName}/build
    // Must be before pygameSketchMatch — otherwise /sketches/{name}/build is mismatched as sketch file
    const pygameBuildMatch = apiPath.match(/^\/users\/([^/]+)\/project-pygame\/([^/]+)\/sketches\/([^/]+)\/build$/);
    if (pygameBuildMatch && method === 'POST') {
      const bUserName = decodeURIComponent(pygameBuildMatch[1]);
      const bProjectId = decodeURIComponent(pygameBuildMatch[2]);
      const bSketchName = decodeURIComponent(pygameBuildMatch[3]);
      await this.handlePygameBuild(req, res, bUserName, bProjectId, bSketchName);
      return;
    }

    // List files in a pygame sketch: GET /users/{userName}/project-pygame/{projectName}/sketches/{sketchName}
    const pygameSketchFilesMatch = apiPath.match(/^\/users\/([^/]+)\/project-pygame\/([^/]+)\/sketches\/([^/]+)$/);
    if (pygameSketchFilesMatch && method === 'GET') {
      const [, sUserName, sProjectName, sSketchName] = pygameSketchFilesMatch.map(decodeURIComponent);
      const projectId = await this.resolveProjectId(sUserName, sProjectName);
      if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }
      const dir = path.resolve(this.rootDir!, 'Minis', 'Users', sUserName, 'Projects', projectId, 'sketches', sSketchName);
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        this.sendJsonResponse(res, 200, { items: entries.filter(e => e.isFile()).map(e => e.name).sort() });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
      return;
    }

    // Sketch files (pygame): /users/{userName}/project-pygame/{projectName}/sketches[/{sketchName}/{fileName}]
    const pygameSketchMatch = apiPath.match(/^\/users\/([^/]+)\/project-pygame\/([^/]+)\/sketches(?:\/([^/]+)\/([^/]+))?$/);
    if (pygameSketchMatch) {
      const sUserName = decodeURIComponent(pygameSketchMatch[1]);
      const sProjectName = decodeURIComponent(pygameSketchMatch[2]);
      const sSketchName = pygameSketchMatch[3] ? decodeURIComponent(pygameSketchMatch[3]) : undefined;
      const sFileName = pygameSketchMatch[4] ? decodeURIComponent(pygameSketchMatch[4]) : undefined;
      await this.handleSketches(req, res, method, sUserName, sProjectName, sSketchName, sFileName);
      return;
    }

    // uPython: sketch files /users/{userName}/project-upython/{projectName}/sketches[/{sketchName}/{fileName}]
    const upythonSketchMatch = apiPath.match(/^\/users\/([^/]+)\/project-upython\/([^/]+)\/sketches(?:\/([^/]+)\/([^/]+))?$/);
    if (upythonSketchMatch) {
      const sUserName = decodeURIComponent(upythonSketchMatch[1]);
      const sProjectName = decodeURIComponent(upythonSketchMatch[2]);
      const sSketchName = upythonSketchMatch[3] ? decodeURIComponent(upythonSketchMatch[3]) : undefined;
      const sFileName = upythonSketchMatch[4] ? decodeURIComponent(upythonSketchMatch[4]) : undefined;
      await this.handleSketches(req, res, method, sUserName, sProjectName, sSketchName, sFileName);
      return;
    }

    // uPython: list files in a sketch GET /users/{userName}/project-upython/{projectName}/sketches/{sketchName}
    const upythonSketchFilesMatch = apiPath.match(/^\/users\/([^/]+)\/project-upython\/([^/]+)\/sketches\/([^/]+)$/);
    if (upythonSketchFilesMatch && method === 'GET') {
      const [, sUserName, sProjectName, sSketchName] = upythonSketchFilesMatch.map(decodeURIComponent);
      const projectId = await this.resolveProjectId(sUserName, sProjectName);
      if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }
      const dir = path.resolve(this.rootDir!, 'Minis', 'Users', sUserName, 'Projects', projectId, 'sketches', sSketchName);
      try {
        const items = await this.listFilesRecursive(dir, '');
        this.sendJsonResponse(res, 200, { items: items.sort() });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
      return;
    }

    // uPython: projects CRUD /users/{userName}/project-upython[/{projectName}]
    const upythonProjectsMatch = apiPath.match(/^\/users\/([^/]+)\/project-upython(?:\/([^/]+))?$/);
    if (upythonProjectsMatch) {
      const userName = decodeURIComponent(upythonProjectsMatch[1]);
      const projectName = upythonProjectsMatch[2] ? decodeURIComponent(upythonProjectsMatch[2]) : undefined;
      await this.handleUserProjects(req, res, method, userName, projectName);
      return;
    }

    // uPython: deploy (POST or GET/SSE /api/users/{userName}/project-upython/{projectName}/deploy)
    const upythonDeployMatch = apiPath.match(/^\/users\/([^/]+)\/project-upython\/([^/]+)\/deploy$/);
    if (upythonDeployMatch && (method === 'POST' || method === 'GET')) {
      const userName = decodeURIComponent(upythonDeployMatch[1]);
      const projectName = decodeURIComponent(upythonDeployMatch[2]);
      await this.handleUpythonDeploy(req, res, userName, projectName);
      return;
    }

    // Node.js: run npm script (GET/SSE /api/users/{userName}/nodejs/run?subpath=...&script=...)
    const nodejsRunMatch = apiPath.match(/^\/users\/([^/]+)\/nodejs\/run$/);
    if (nodejsRunMatch && method === 'GET') {
      const userName = decodeURIComponent(nodejsRunMatch[1]);
      await this.handleNodejsRun(req, res, userName);
      return;
    }

    // Memory PIM page — AI proxy endpoints (POST /api/users/{userName}/memory/ai/{op})
    //   /memory/ai/check          → sonnet judges a free-text answer
    //   /memory/ai/generate-one   → opus generates one question + answer
    //   /memory/ai/generate-batch → opus analyses existing and proposes N new ones
    //   /memory/ai/explain        → opus deep-explains the question
    //   /memory/ai/find-image     → Wikipedia search → first thumbnail
    const memoryAiMatch = apiPath.match(/^\/users\/([^/]+)\/memory\/ai\/([\w-]+)$/);
    if (memoryAiMatch && method === 'POST') {
      const userName = decodeURIComponent(memoryAiMatch[1]);
      const op = memoryAiMatch[2];
      await this.handleMemoryAi(req, res, userName, op);
      return;
    }

    // Python: run python script (GET/SSE /api/users/{userName}/python/run?subpath=...&script=...)
    const pythonRunMatch = apiPath.match(/^\/users\/([^/]+)\/python\/run$/);
    if (pythonRunMatch && method === 'GET') {
      const userName = decodeURIComponent(pythonRunMatch[1]);
      await this.handlePythonRun(req, res, userName);
      return;
    }

    // PicoSDK: build (POST or GET/SSE /api/users/{userName}/project-upython/{projectName}/build-pico)
    const picoSdkBuildMatch = apiPath.match(/^\/users\/([^/]+)\/project-upython\/([^/]+)\/build-pico$/);
    if (picoSdkBuildMatch && (method === 'POST' || method === 'GET')) {
      const userName = decodeURIComponent(picoSdkBuildMatch[1]);
      const projectName = decodeURIComponent(picoSdkBuildMatch[2]);
      await this.handlePicoSdkBuild(req, res, userName, projectName);
      return;
    }

    // PicoSDK: download UF2 (GET /api/users/{userName}/project-upython/{projectName}/uf2/{sketchName})
    const picoSdkUf2Match = apiPath.match(/^\/users\/([^/]+)\/project-upython\/([^/]+)\/uf2\/([^/]+)$/);
    if (picoSdkUf2Match && method === 'GET') {
      const userName = decodeURIComponent(picoSdkUf2Match[1]);
      const projectName = decodeURIComponent(picoSdkUf2Match[2]);
      const sketchName = decodeURIComponent(picoSdkUf2Match[3]);
      await this.handlePicoSdkDownload(req, res, userName, projectName, sketchName);
      return;
    }

    // Firmware: /admin/firmware[/{fileName}]
    const firmwareMatch = apiPath.match(/^\/admin\/firmware(?:\/([^/]+))?$/);
    if (firmwareMatch) {
      const fileName = firmwareMatch[1] ? decodeURIComponent(firmwareMatch[1]) : undefined;
      await this.handleAdminFirmware(req, res, method, fileName);
      return;
    }

    // Scripts endpoints: /admin/scripts/* (admin-only, covered by /admin/ prefix check above)
    // Docs generation: POST /api/admin/docs/generate
    if (apiPath === '/admin/docs/generate' && method === 'POST') {
      if (!user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: admin access required' });
        return;
      }
      try {
        const result = await this.runDocsGenerate();
        this.sendJsonResponse(res, result.exitCode === 0 ? 200 : 500, result);
      } catch (err) {
        this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
      }
      return;
    }

    // Screenshots generation: POST /api/admin/screenshots/generate
    if (apiPath === '/admin/screenshots/generate' && method === 'POST') {
      if (!user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: admin access required' });
        return;
      }
      try {
        const body = await this.parseRequestBody(req) as { user?: string; pass?: string; base?: string };
        const result = await this.runScreenshotsGenerate(body.user, body.pass, body.base);
        this.sendJsonResponse(res, result.exitCode === 0 ? 200 : 500, result);
      } catch (err) {
        this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
      }
      return;
    }

    const scriptRunMatch = apiPath.match(/^\/admin\/scripts\/([^/]+)\/run$/);
    if (scriptRunMatch && method === 'POST') {
      if (!this.scriptsService) {
        this.sendJsonResponse(res, 503, { error: 'Scripts service not available (rootDir not configured)' });
        return;
      }
      const name = decodeURIComponent(scriptRunMatch[1]);
      try {
        const body = await this.parseRequestBody(req) as { args?: string[]; env?: Record<string, string> };
        const result = await this.scriptsService.runScript(name, body.args ?? [], body.env ?? {});
        this.sendJsonResponse(res, 200, result);
      } catch (err) {
        this.sendJsonResponse(res, 400, { error: this.errorMessage(err) });
      }
      return;
    }

    const scriptsMatch = apiPath.match(/^\/admin\/scripts(?:\/([^/]+))?$/);
    if (scriptsMatch) {
      if (!this.scriptsService) {
        this.sendJsonResponse(res, 503, { error: 'Scripts service not available (rootDir not configured)' });
        return;
      }
      const name = scriptsMatch[1] ? decodeURIComponent(scriptsMatch[1]) : undefined;
      try {
        if (method === 'GET' && !name) {
          this.sendJsonResponse(res, 200, { scripts: this.scriptsService.listScripts() });
        } else if (method === 'GET' && name) {
          const content = this.scriptsService.readScript(name);
          this.sendJsonResponse(res, 200, { name, content });
        } else if (method === 'PUT' && name) {
          const body = await this.parseRequestBody(req) as { content: string };
          if (typeof body.content !== 'string') {
            this.sendJsonResponse(res, 400, { error: 'content (string) is required' });
            return;
          }
          this.scriptsService.writeScript(name, body.content);
          this.sendJsonResponse(res, 200, { ok: true });
        } else if (method === 'DELETE' && name) {
          this.scriptsService.deleteScript(name);
          this.sendJsonResponse(res, 200, { ok: true });
        } else {
          this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
        }
      } catch (err) {
        this.sendJsonResponse(res, 400, { error: this.errorMessage(err) });
      }
      return;
    }

    // VFS endpoints: /vfs/{operation} (admin-only)
    const vfsMatch = apiPath.match(/^\/vfs\/([a-zA-Z]+)$/);
    if (vfsMatch) {
      if (!user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: admin access required' });
        return;
      }
      await this.handleVfs(req, res, method, vfsMatch[1]);
      return;
    }

    // User-scoped VFS: /users/{userName}/vfs/{operation} — user can only access their own home dir
    const userVfsMatch = apiPath.match(/^\/users\/([^/]+)\/vfs\/([a-zA-Z]+)$/);
    if (userVfsMatch) {
      const targetUser = decodeURIComponent(userVfsMatch[1]);
      if (!user.isAdmin && user.userName !== targetUser) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden' });
        return;
      }
      await this.handleUserHomeVfs(req, res, method, targetUser, userVfsMatch[2]);
      return;
    }

    // Cleanup orphaned project dirs: POST /api/users/{userName}/cleanup-projects
    const cleanupMatch = apiPath.match(/^\/users\/([^/]+)\/cleanup-projects$/);
    if (cleanupMatch && method === 'POST') {
      if (!user.isAdmin) {
        this.sendJsonResponse(res, 403, { error: 'Forbidden: admin access required' });
        return;
      }
      const userName = decodeURIComponent(cleanupMatch[1]);
      await this.handleCleanupOrphanProjects(res, userName);
      return;
    }

    this.sendJsonResponse(res, 404, { error: 'API endpoint not found' });
  }

  // --- Arduino ---

  /** Returns the project directory path segment (= "{softwarePlatform}/{name}") for the given identifier.
   *  Matches by name first, then by legacy UUID id. */
  private async resolveProjectName(userName: string, projectIdentifier: string): Promise<string | null> {
    try {
      const data = await this.fileSystem.readFile(`Minis/Users/${userName}/Project.json`);
      const parsed = JSON.parse(data.content) as { projects?: Array<{ id: string; name: string; softwarePlatform?: string }> };
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const project = projects.find(p => p.name === projectIdentifier) ?? projects.find(p => p.id === projectIdentifier);
      if (!project) return null;
      const platform = project.softwarePlatform ?? 'Arduino';
      return `${platform}/${project.name}`;
    } catch {
      return null;
    }
  }

  /** @deprecated Use resolveProjectName — kept for internal call sites that haven't been migrated. */
  private resolveProjectId(userName: string, projectIdentifier: string): Promise<string | null> {
    return this.resolveProjectName(userName, projectIdentifier);
  }

  /** One-time migration: create project.json inside every project directory that is missing one.
   *  Safe to run on every startup — skips projects that already have the file. */
  async migrateProjectJsonFiles(): Promise<void> {
    if (!this.rootDir) return;
    const usersDir = path.resolve(this.rootDir, 'Minis', 'Users');
    let userDirs: string[];
    try {
      userDirs = (await fs.promises.readdir(usersDir, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return; // data dir not ready yet
    }

    let created = 0;
    for (const userName of userDirs) {
      // Read the project registry for this user
      let registry: Array<Record<string, unknown>>;
      try {
        const raw = await this.readJsonFile(`Minis/Users/${userName}/Project.json`) as Record<string, unknown>;
        registry = Array.isArray(raw.projects) ? raw.projects as Array<Record<string, unknown>> : [];
      } catch {
        continue;
      }

      for (const project of registry) {
        const name = typeof project.name === 'string' ? project.name : null;
        const platform = (typeof project.softwarePlatform === 'string' ? project.softwarePlatform : null) ?? 'Arduino';
        if (!name) continue;

        const projectDir = path.resolve(usersDir, userName, 'Projects', platform, name);
        const projectJsonPath = path.join(projectDir, 'project.json');

        // Skip if already present
        const exists = await fs.promises.access(projectJsonPath).then(() => true).catch(() => false);
        if (exists) continue;

        // Skip if the project directory itself doesn't exist (no files cloned yet)
        const dirExists = await fs.promises.access(projectDir).then(() => true).catch(() => false);
        if (!dirExists) continue;

        const projectJson = {
          id: name,
          name,
          platform,
          ...(project.boardProfileKey ? { boardProfileKey: project.boardProfileKey } : {}),
        };
        try {
          await fs.promises.writeFile(projectJsonPath, JSON.stringify(projectJson, null, 2), 'utf-8');
          created++;
        } catch (err) {
          console.warn(`migrateProjectJson: failed to write ${projectJsonPath}:`, err);
        }
      }
    }

    if (created > 0) {
      console.log(`migrateProjectJson: created ${created} missing project.json file(s)`);
    }
  }

  /** Core cleanup logic — usable both from HTTP handler and scheduled job. */
  async cleanupOrphanProjectsForUser(userName: string): Promise<{ removed: string[]; kept: string[] }> {
    if (!this.rootDir) return { removed: [], kept: [] };
    const projectsDir = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects');

    // Read the registry — directories are now {platform}/{name}
    let registeredPaths: Set<string>;
    try {
      const data = await this.fileSystem.readFile(`Minis/Users/${userName}/Project.json`);
      const parsed = JSON.parse(data.content) as { projects?: Array<{ id: string; name: string; softwarePlatform?: string }> };
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      registeredPaths = new Set(projects.flatMap(p => {
        const platform = p.softwarePlatform ?? 'Arduino';
        // Accept both new path (platform/name) and legacy (name or id alone)
        return [`${platform}/${p.name}`, p.name, p.id].filter(Boolean);
      }));
    } catch {
      return { removed: [], kept: [] };
    }

    // Scan Projects/ — top-level entries are platform dirs (Arduino, uPython, …) or legacy project dirs
    let topEntries: fs.Dirent[];
    try {
      topEntries = await fs.promises.readdir(projectsDir, { withFileTypes: true });
    } catch {
      return { removed: [], kept: [] };
    }

    const removed: string[] = [];
    const kept: string[] = [];

    for (const topEntry of topEntries) {
      if (!topEntry.isDirectory()) continue;
      // Check if this is a known platform dir (has sub-directories = projects inside it)
      const topPath = path.join(projectsDir, topEntry.name);
      let subEntries: fs.Dirent[] = [];
      try { subEntries = await fs.promises.readdir(topPath, { withFileTypes: true }); } catch { /* ignore */ }

      const hasSubDirs = subEntries.some(e => e.isDirectory());
      if (hasSubDirs) {
        // Platform directory — scan its children
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          const relPath = `${topEntry.name}/${sub.name}`;
          if (registeredPaths.has(relPath)) {
            kept.push(relPath);
          } else {
            try {
              await this.fileSystem.deleteDirectory(path.join(topPath, sub.name));
              removed.push(relPath);
            } catch (err) {
              console.warn(`cleanup-projects: failed to delete "${relPath}" for ${userName}:`, err);
            }
          }
        }
      } else {
        // Legacy flat entry (name or UUID directly under Projects/)
        const name = topEntry.name;
        if (registeredPaths.has(name)) {
          kept.push(name);
        } else {
          try {
            await this.fileSystem.deleteDirectory(path.join(projectsDir, name));
            removed.push(name);
          } catch (err) {
            console.warn(`cleanup-projects: failed to delete "${name}" for ${userName}:`, err);
          }
        }
      }
    }

    return { removed, kept };
  }

  private async handleCleanupOrphanProjects(res: ServerResponse, userName: string): Promise<void> {
    if (!this.rootDir) {
      this.sendJsonResponse(res, 503, { error: 'rootDir not configured' });
      return;
    }
    try {
      const result = await this.cleanupOrphanProjectsForUser(userName);
      this.sendJsonResponse(res, 200, result);
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleArduinoBoards(res: ServerResponse): Promise<void> {
    if (!this.arduinoService?.isAvailable) {
      this.sendJsonResponse(res, 503, { error: 'Arduino CLI not configured' });
      return;
    }
    try {
      const boards = await this.arduinoService.listBoards();
      this.sendJsonResponse(res, 200, { items: boards });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: err instanceof Error ? err.message : 'Failed to list boards' });
    }
  }

  private async handleArduinoPorts(res: ServerResponse): Promise<void> {
    if (!this.arduinoService?.isAvailable) {
      this.sendJsonResponse(res, 503, { error: 'Arduino CLI not configured' });
      return;
    }
    try {
      const ports = await this.arduinoService.listPorts();
      this.sendJsonResponse(res, 200, { items: ports });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: err instanceof Error ? err.message : 'Failed to list ports' });
    }
  }

  private async handleArduinoCompile(req: IncomingMessage, res: ServerResponse, userName: string, projectName: string): Promise<void> {
    if (!this.arduinoService?.isAvailable) {
      this.sendJsonResponse(res, 503, { error: 'Arduino CLI not configured' });
      return;
    }

    const isSSE = req.headers.accept?.includes('text/event-stream');
    const url = new URL(req.url ?? '/', 'http://localhost');

    let sketchName: string | undefined;
    let fqbn: string | undefined;
    let deviceName: string | undefined;

    if (req.method === 'GET') {
      sketchName = url.searchParams.get('sketchName') ?? undefined;
      fqbn       = url.searchParams.get('fqbn') ?? undefined;
      deviceName = url.searchParams.get('deviceName') ?? undefined;
    } else {
      const body = await this.parseRequestBody(req) as { sketchName?: string; fqbn?: string; deviceName?: string };
      sketchName = body.sketchName;
      fqbn       = body.fqbn;
      deviceName = body.deviceName;
    }

    if (!sketchName || !fqbn) {
      this.sendJsonResponse(res, 400, { error: 'sketchName and fqbn are required' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }

    let minisConfig: MinisConfig | undefined;
    if (deviceName) {
      minisConfig = await this.resolveMinisConfig(userName, deviceName);
    }

    let libraries: Array<{ name: string; version?: string; url?: string }> | undefined;
    try {
      const projectData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as { projects?: Array<{ id: string; name: string; libraries?: Array<{ name: string; version?: string; url?: string }> }> };
      const projectEntry = (Array.isArray(projectData?.projects) ? projectData.projects : []).find(p => p.name === projectId || p.id === projectId);
      if (projectEntry?.libraries?.length) libraries = projectEntry.libraries;
    } catch { /* ignore */ }

    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      this.setCorsHeaders(res);
      res.writeHead(200);

      const sendEvent = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      const onChunk = (chunk: string) => sendEvent('output', { chunk });

      try {
        const result = await this.arduinoService.compile(userName, projectId, sketchName, fqbn, minisConfig, libraries, onChunk);
        if (deviceName && minisConfig?.serialNumber) {
          await this.saveDeviceLastBuild(userName, minisConfig.serialNumber, { platform: 'arduino', fqbn, success: result.success, projectId, sketchName });
        }
        sendEvent('done', { success: result.success, exitCode: result.exitCode });
      } catch (err) {
        sendEvent('done', { success: false, exitCode: 1, error: err instanceof Error ? err.message : 'Compilation failed' });
      }
      res.end();
    } else {
      try {
        const result = await this.arduinoService.compile(userName, projectId, sketchName, fqbn, minisConfig, libraries);
        if (deviceName && minisConfig?.serialNumber) {
          await this.saveDeviceLastBuild(userName, minisConfig.serialNumber, { platform: 'arduino', fqbn, success: result.success, projectId, sketchName });
        }
        this.sendJsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Compilation failed';
        if (deviceName && minisConfig?.serialNumber) {
          await this.saveDeviceLastBuild(userName, minisConfig.serialNumber, { platform: 'arduino', fqbn, success: false, projectId, sketchName });
        }
        this.sendJsonResponse(res, 200, { success: false, output: msg, exitCode: 1 });
      }
    }
  }

  private async resolveMinisConfig(userName: string, deviceName: string): Promise<MinisConfig> {
    interface ArchNode { id: string; data: { nodeType: string; deviceName: string; wifiSsid: string; wifiPassword: string } }
    interface ArchEdge { source: string; target: string }
    interface Arch { nodes: ArchNode[]; edges: ArchEdge[] }

    const arch = await this.readJsonFile(`Minis/Users/${userName}/Electronics/configuration.json`) as Arch;
    const nodes: ArchNode[] = Array.isArray(arch?.nodes) ? arch.nodes : [];
    const edges: ArchEdge[] = Array.isArray(arch?.edges) ? arch.edges : [];

    const node = nodes.find(n => n.data?.deviceName === deviceName);
    if (!node) {
      console.warn(`[resolveMinisConfig] No architecture node found for device="${deviceName}". WiFi credentials will be empty.`);
    }
    let wifiSsid = node?.data?.wifiSsid ?? '';
    let wifiPassword = node?.data?.wifiPassword ?? '';

    // If the node is not a wifi-switch itself, look for a connected wifi-switch parent.
    if (node && node.data?.nodeType !== 'wifi-switch' && (!wifiSsid)) {
      const parentEdge = edges.find(e => e.source === node.id);
      if (parentEdge) {
        const parentNode = nodes.find(n => n.id === parentEdge.target && n.data?.nodeType === 'wifi-switch');
        if (parentNode) {
          wifiSsid = parentNode.data.wifiSsid;
          wifiPassword = parentNode.data.wifiPassword;
        }
      }
    }

    // Resolve SN from device list
    let serialNumber = '';
    try {
      const deviceData = await this.readJsonFile(`Minis/Users/${userName}/Device.json`) as { devices?: Array<{ name: string; sn?: string }> };
      const device = (deviceData?.devices ?? []).find(d => d.name === deviceName);
      serialNumber = device?.sn ?? '';
    } catch { /* ignore */ }

    return {
      deviceName,
      serialNumber,
      wifiSsid,
      wifiPassword,
      architectureJson: JSON.stringify(arch),
    };
  }

  private async handleArduinoUpload(req: IncomingMessage, res: ServerResponse, userName: string, projectName: string): Promise<void> {
    if (!this.arduinoService?.isAvailable) {
      this.sendJsonResponse(res, 503, { error: 'Arduino CLI not configured' });
      return;
    }

    const isSSE = req.headers.accept?.includes('text/event-stream');
    const url = new URL(req.url ?? '/', 'http://localhost');

    let sketchName: string | undefined;
    let fqbn: string | undefined;
    let port: string | undefined;
    let serialNumber: string | undefined;

    if (req.method === 'GET') {
      sketchName    = url.searchParams.get('sketchName') ?? undefined;
      fqbn          = url.searchParams.get('fqbn') ?? undefined;
      port          = url.searchParams.get('port') ?? undefined;
      serialNumber  = url.searchParams.get('serialNumber') ?? undefined;
    } else {
      const body = await this.parseRequestBody(req) as { sketchName?: string; fqbn?: string; port?: string; serialNumber?: string };
      sketchName   = body.sketchName;
      fqbn         = body.fqbn;
      port         = body.port;
      serialNumber = body.serialNumber;
    }

    if (!sketchName || !fqbn || !port) {
      this.sendJsonResponse(res, 400, { error: 'sketchName, fqbn and port are required' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }

    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      this.setCorsHeaders(res);
      res.writeHead(200);

      const sendEvent = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      const onChunk = (chunk: string) => sendEvent('output', { chunk });

      try {
        const result = await this.arduinoService.upload(userName, projectId, sketchName, fqbn, port, onChunk);
        if (serialNumber) {
          await this.saveDeviceLastBuild(userName, serialNumber, { platform: 'arduino', fqbn, success: result.success, sketchName });
        }
        sendEvent('done', { success: result.success, exitCode: result.exitCode });
      } catch (err) {
        sendEvent('done', { success: false, exitCode: 1, error: err instanceof Error ? err.message : 'Upload failed' });
      }
      res.end();
    } else {
      try {
        const result = await this.arduinoService.upload(userName, projectId, sketchName, fqbn, port);
        if (serialNumber) {
          await this.saveDeviceLastBuild(userName, serialNumber, { platform: 'arduino', fqbn, success: result.success, sketchName });
        }
        this.sendJsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        if (serialNumber) {
          await this.saveDeviceLastBuild(userName, serialNumber, { platform: 'arduino', fqbn, success: false, sketchName });
        }
        this.sendJsonResponse(res, 200, { success: false, output: msg, exitCode: 1 });
      }
    }
  }

  private async handleArduinoOutput(_req: IncomingMessage, res: ServerResponse, method: string, userName: string, projectName: string, fileName?: string): Promise<void> {
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }
    const outputDir = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId, 'output');

    if (!fileName) {
      // List output files
      try {
        const entries = await fs.promises.readdir(outputDir, { withFileTypes: true });
        const items = entries
          .filter(e => e.isFile())
          .map(e => {
            const stat = fs.statSync(path.join(outputDir, e.name));
            return { name: e.name, size: stat.size };
          });
        this.sendJsonResponse(res, 200, { items });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
      return;
    }

    // Serve specific file (binary)
    const filePath = path.join(outputDir, fileName);
    if (fileName.includes('..') || fileName.includes('/')) {
      this.sendJsonResponse(res, 400, { error: 'Invalid file name' });
      return;
    }
    try {
      const data = await fs.promises.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': data.length,
      });
      res.end(data);
    } catch {
      this.sendJsonResponse(res, 404, { error: 'File not found' });
    }
  }

  // --- README ---

  private async handleProjectReadme(
    req: IncomingMessage, res: ServerResponse, method: string,
    userName: string, projectName: string,
  ): Promise<void> {
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }
    const readmePath = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId, 'README.md');

    if (method === 'GET') {
      try {
        const content = await fs.promises.readFile(readmePath, 'utf-8');
        this.sendJsonResponse(res, 200, { content });
      } catch {
        this.sendJsonResponse(res, 404, { error: 'README not found' });
      }
      return;
    }

    if (method === 'PUT') {
      const body = await this.parseRequestBody(req) as { content?: string };
      if (body?.content === undefined) {
        this.sendJsonResponse(res, 400, { error: 'Missing content' });
        return;
      }
      await fs.promises.mkdir(path.dirname(readmePath), { recursive: true });
      await fs.promises.writeFile(readmePath, body.content, 'utf-8');
      this.sendJsonResponse(res, 200, { success: true });
      return;
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // --- Sketch files ---

  private async handlePygameBuild(req: IncomingMessage, res: ServerResponse, userName: string, projectId: string, sketchName: string): Promise<void> {
    if (!this.pygameService) {
      this.sendJsonResponse(res, 503, { error: 'Pygame service not configured' });
      return;
    }
    if (sketchName.includes('..')) {
      this.sendJsonResponse(res, 400, { error: 'Invalid sketch name' });
      return;
    }
    try {
      const body = await this.parseRequestBody(req) as { code?: string };
      if (body?.code !== undefined) {
        // Pygbag requires the entry file to be named main.py
        const sketchDir = this.pygameService.sketchDir(userName, projectId, sketchName);
        await fs.promises.mkdir(sketchDir, { recursive: true });
        await fs.promises.writeFile(path.join(sketchDir, 'main.py'), body.code, 'utf-8');
        // Remove stale build so pygbag starts fresh
        await fs.promises.rm(path.join(sketchDir, 'build'), { recursive: true, force: true });
      }
      const result = await this.pygameService.build(userName, projectId, sketchName);
      this.sendJsonResponse(res, 200, result);
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private static readonly PYGAME_MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.py': 'text/plain',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.zip': 'application/zip',
    '.whl': 'application/zip',
    '.data': 'application/octet-stream',
    '.json': 'application/json',
    '.txt': 'text/plain',
  };

  private async handlePygameWebBuildFile(res: ServerResponse, userName: string, projectId: string, sketchName: string, filePath: string): Promise<void> {
    if (!this.pygameService) {
      this.sendJsonResponse(res, 503, { error: 'Pygame service not configured' });
      return;
    }
    if (sketchName.includes('..') || filePath.includes('..')) {
      this.sendJsonResponse(res, 400, { error: 'Invalid path' });
      return;
    }
    const webBuildDir = this.pygameService.webBuildDir(userName, projectId, sketchName);
    const fullPath = path.resolve(path.join(webBuildDir, filePath || 'index.html'));

    // Directory traversal guard
    if (!fullPath.startsWith(path.resolve(webBuildDir))) {
      this.sendJsonResponse(res, 400, { error: 'Invalid path' });
      return;
    }

    try {
      const content = await fs.promises.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeType = MycastleHttpServer.PYGAME_MIME_TYPES[ext] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mimeType,
        // Required for SharedArrayBuffer / WebAssembly threads (pygbag)
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
        // Prevent Cloudflare and browsers from caching build artifacts
        'Cache-Control': 'no-store',
      });
      res.end(content);
    } catch {
      this.sendJsonResponse(res, 404, { error: 'File not found' });
    }
  }

  private async handleSketches(
    req: IncomingMessage, res: ServerResponse, method: string,
    userName: string, projectName: string,
    sketchName?: string, fileName?: string,
  ): Promise<void> {
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }
    const sketchesDir = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId, 'sketches');

    // GET /sketches — list sketch directories
    if (!sketchName || !fileName) {
      if (method !== 'GET') {
        this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
        return;
      }
      try {
        const entries = await fs.promises.readdir(sketchesDir, { withFileTypes: true });
        const items = entries.filter(e => e.isDirectory()).map(e => e.name);
        this.sendJsonResponse(res, 200, { items });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
      return;
    }

    // Path traversal protection
    if (sketchName.includes('..') || fileName.includes('..')) {
      this.sendJsonResponse(res, 400, { error: 'Invalid path' });
      return;
    }
    const filePath = path.join(sketchesDir, sketchName, fileName);

    if (method === 'GET') {
      // Read sketch file
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        this.sendJsonResponse(res, 200, { content });
      } catch {
        this.sendJsonResponse(res, 404, { error: 'File not found' });
      }
      return;
    }

    if (method === 'PUT') {
      // Write sketch file
      const body = await this.parseRequestBody(req) as { content?: string };
      if (!body?.content && body?.content !== '') {
        this.sendJsonResponse(res, 400, { error: 'Missing content' });
        return;
      }
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, body.content, 'utf-8');
      this.sendJsonResponse(res, 200, { success: true });
      return;
    }

    if (method === 'DELETE') {
      try {
        await fs.promises.unlink(filePath);
        this.sendJsonResponse(res, 200, { success: true });
      } catch {
        this.sendJsonResponse(res, 404, { error: 'File not found' });
      }
      return;
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // --- VFS ---

  /** Device VFS — user-scoped, no admin required. Paths are prefixed with /devices/{deviceName}. */
  private async handleDeviceVfs(req: IncomingMessage, res: ServerResponse, _method: string, deviceName: string, operation: string): Promise<void> {
    const urlObj = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
    const prefix = `/devices/${deviceName}`;
    const prefix2 = (p: string) => (p === '/' ? prefix : `${prefix}${p}`);

    try {
      switch (operation) {
        case 'capabilities':
          this.sendJsonResponse(res, 200, this.vfs.capabilities); return;
        case 'stat': {
          const stat = await this.vfs.stat(prefix2(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, stat); return;
        }
        case 'readdir': {
          const entries = await this.vfs.readDirectory(prefix2(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, { entries }); return;
        }
        case 'readFile': {
          const data = await this.vfs.readFile(prefix2(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, { data: Buffer.from(data).toString('base64') }); return;
        }
        case 'writeFile': {
          const wb = await this.parseRequestBody(req) as { data: string; options?: WriteFileOptions };
          await this.vfs.writeFile!(prefix2(urlObj.searchParams.get('path') ?? '/'), new Uint8Array(Buffer.from(wb.data, 'base64')), wb.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'delete': {
          const db = await this.parseRequestBody(req) as { options?: DeleteOptions };
          await this.vfs.delete!(prefix2(urlObj.searchParams.get('path') ?? '/'), db.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'rename': {
          const rb = await this.parseRequestBody(req) as { oldPath: string; newPath: string; options?: RenameOptions };
          await this.vfs.rename!(prefix2(rb.oldPath), prefix2(rb.newPath), rb.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'mkdir': {
          await this.vfs.mkdir!(prefix2(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        default:
          this.sendJsonResponse(res, 400, { error: `Unknown operation: ${operation}` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleVirtualInputExt(
    req: IncomingMessage,
    res: ServerResponse,
    _userName: string,
    deviceName: string,
    extType: 'vkbd' | 'vmouse',
  ): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }

    const ext = extType === 'vkbd'
      ? this.iotService.extensions.getVkbd(deviceName)
      : this.iotService.extensions.getVmouse(deviceName);

    if (!ext) {
      this.sendJsonResponse(res, 404, { error: `Extension '${extType}' not active for device '${deviceName}'` });
      return;
    }

    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const { op, ...params } = body;

    if (!op || typeof op !== 'string') {
      this.sendJsonResponse(res, 400, { error: "Missing 'op' field" });
      return;
    }

    try {
      const data = await ext.sendRequest(op, params);
      this.sendJsonResponse(res, 200, { ok: true, data });
    } catch (err) {
      this.sendJsonResponse(res, 500, { ok: false, error: this.errorMessage(err) });
    }
  }

  /** User-scoped VFS: validates that the requested path is under the user's home directory. */
  private async handleUserHomeVfs(req: IncomingMessage, res: ServerResponse, _method: string, userName: string, operation: string): Promise<void> {
    const urlObj = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
    const userHomePrefix = `/data/Minis/Users/${userName}`;

    const assertPath = (p: string) => {
      const normalized = p === '/' ? userHomePrefix : p;
      if (normalized !== userHomePrefix && !normalized.startsWith(userHomePrefix + '/')) {
        throw new VfsError('NoPermissions' as any, `Access denied: path outside user home`, p);
      }
      return normalized;
    };

    try {
      switch (operation) {
        case 'capabilities':
          this.sendJsonResponse(res, 200, this.vfs.capabilities); return;
        case 'stat': {
          const stat = await this.vfs.stat(assertPath(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, stat); return;
        }
        case 'readdir': {
          const entries = await this.vfs.readDirectory(assertPath(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, { entries }); return;
        }
        case 'readFile': {
          const pathStr = assertPath(urlObj.searchParams.get('path') ?? '/');
          const data = await this.vfs.readFile(pathStr);
          // `download=1` → respond with raw bytes + Content-Disposition: attachment.
          // Used by Drive UI and by Android WebView (which can't honor JS-side blob
          // downloads — needs a real URL the OS can hand to the system browser).
          if (urlObj.searchParams.get('download') === '1') {
            const filename = pathStr.split('/').filter(Boolean).pop() || 'file';
            // RFC 5987 filename* for non-ASCII names + plain ASCII fallback.
            const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
              'Content-Length': String(data.length),
              'Cache-Control': 'no-store',
            });
            res.end(Buffer.from(data));
            return;
          }
          this.sendJsonResponse(res, 200, { data: Buffer.from(data).toString('base64') }); return;
        }
        case 'writeFile': {
          const wb = await this.parseRequestBody(req) as { data: string; options?: WriteFileOptions };
          await this.vfs.writeFile!(assertPath(urlObj.searchParams.get('path') ?? '/'), new Uint8Array(Buffer.from(wb.data, 'base64')), wb.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'delete': {
          const db = await this.parseRequestBody(req) as { options?: DeleteOptions };
          await this.vfs.delete!(assertPath(urlObj.searchParams.get('path') ?? '/'), db.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'rename': {
          const rb = await this.parseRequestBody(req) as { oldPath: string; newPath: string; options?: RenameOptions };
          await this.vfs.rename!(assertPath(rb.oldPath), assertPath(rb.newPath), rb.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'mkdir': {
          await this.vfs.mkdir!(assertPath(urlObj.searchParams.get('path') ?? '/'));
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        case 'copy': {
          const cpBody = await this.parseRequestBody(req) as { source: string; destination: string; options?: CopyOptions };
          await this.vfs.copy!(assertPath(cpBody.source), assertPath(cpBody.destination), cpBody.options);
          this.sendJsonResponse(res, 200, { ok: true }); return;
        }
        default:
          this.sendJsonResponse(res, 404, { error: `Unknown VFS operation: ${operation}` });
      }
    } catch (err) {
      if (err instanceof VfsError) {
        const statusMap: Record<string, number> = { FileNotFound: 404, FileExists: 409, FileNotADirectory: 400, FileIsADirectory: 400, NoPermissions: 403, Unavailable: 503 };
        this.sendJsonResponse(res, statusMap[err.code] ?? 500, { error: err.message, code: err.code, path: err.path });
      } else {
        this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
      }
    }
  }

  private async handleVfs(req: IncomingMessage, res: ServerResponse, method: string, operation: string): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host ?? 'localhost'}`);
    const vfsPath = url.searchParams.get('path') || '/';

    try {
      switch (operation) {
        case 'capabilities': {
          if (method !== 'GET') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          this.sendJsonResponse(res, 200, this.vfs.capabilities);
          return;
        }
        case 'stat': {
          if (method !== 'GET') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const stat = await this.vfs.stat(vfsPath);
          this.sendJsonResponse(res, 200, stat);
          return;
        }
        case 'readdir': {
          if (method !== 'GET') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const entries = await this.vfs.readDirectory(vfsPath);
          this.sendJsonResponse(res, 200, { entries });
          return;
        }
        case 'readFile': {
          if (method !== 'GET') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const data = await this.vfs.readFile(vfsPath);
          const base64 = Buffer.from(data).toString('base64');
          this.sendJsonResponse(res, 200, { data: base64 });
          return;
        }
        case 'writeFile': {
          if (method !== 'POST') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const writeBody = await this.parseRequestBody(req) as { data: string; options?: WriteFileOptions };
          const content = new Uint8Array(Buffer.from(writeBody.data, 'base64'));
          await this.vfs.writeFile!(vfsPath, content, writeBody.options);
          this.sendJsonResponse(res, 200, { ok: true });
          return;
        }
        case 'delete': {
          if (method !== 'POST') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const delBody = await this.parseRequestBody(req) as { options?: DeleteOptions };
          await this.vfs.delete!(vfsPath, delBody.options);
          this.sendJsonResponse(res, 200, { ok: true });
          return;
        }
        case 'rename': {
          if (method !== 'POST') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const renBody = await this.parseRequestBody(req) as { oldPath: string; newPath: string; options?: RenameOptions };
          await this.vfs.rename!(renBody.oldPath, renBody.newPath, renBody.options);
          this.sendJsonResponse(res, 200, { ok: true });
          return;
        }
        case 'mkdir': {
          if (method !== 'POST') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          await this.vfs.mkdir!(vfsPath);
          this.sendJsonResponse(res, 200, { ok: true });
          return;
        }
        case 'copy': {
          if (method !== 'POST') { this.sendJsonResponse(res, 405, { error: 'Method not allowed' }); return; }
          const cpBody = await this.parseRequestBody(req) as { source: string; destination: string; options?: CopyOptions };
          await this.vfs.copy!(cpBody.source, cpBody.destination, cpBody.options);
          this.sendJsonResponse(res, 200, { ok: true });
          return;
        }
        default:
          this.sendJsonResponse(res, 404, { error: `Unknown VFS operation: ${operation}` });
      }
    } catch (err) {
      if (err instanceof VfsError) {
        const statusMap: Record<string, number> = {
          FileNotFound: 404,
          FileExists: 409,
          FileNotADirectory: 400,
          FileIsADirectory: 400,
          NoPermissions: 403,
          Unavailable: 503,
        };
        this.sendJsonResponse(res, statusMap[err.code] ?? 500, { error: err.message, code: err.code, path: err.path });
      } else {
        this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
      }
    }
  }

  // --- Auth ---

  private async handlePublicUserList(res: ServerResponse): Promise<void> {
    try {
      const data = await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`) as Record<string, any>;
      const users = (data.items || []) as any[];
      const publicList = users.map((u: any) => ({ id: u.id, name: u.name, isAdmin: u.isAdmin ?? false }));
      this.sendJsonResponse(res, 200, { items: publicList });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.parseRequestBody(req);
      const { name, password } = body as { name: string; password: string };

      if (!name || !password) {
        this.sendJsonResponse(res, 400, { error: 'name and password required' });
        return;
      }

      const data = await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`) as Record<string, any>;
      const users = (data.items || []) as any[];
      const user = users.find((u: any) => u.name === name);

      if (!user || !await PasswordService.verify(password, user.password)) {
        this.sendJsonResponse(res, 401, { error: 'Invalid credentials' });
        return;
      }

      // Auto-migrate plaintext password to bcrypt
      if (!PasswordService.isBcrypt(user.password)) {
        user.password = await PasswordService.hash(password);
        data.items = users;
        await this.writeJsonFile(`${MINIS_ROOT}/Admin/Users.json`, data);
      }

      const tokenPayload: AuthTokenPayload = {
        userId: user.id,
        userName: user.name,
        isAdmin: user.isAdmin ?? false,
        roles: user.roles ?? [],
      };
      const token = this.jwtService.sign(tokenPayload);

      const { password: _, ...publicUser } = user;
      this.sendJsonResponse(res, 200, { token, user: publicUser });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- API Keys ---

  private async handleApiKeys(req: IncomingMessage, res: ServerResponse, method: string, user: AuthTokenPayload, keyId?: string): Promise<void> {
    try {
      switch (method) {
        case 'GET': {
          if (keyId) { this.sendJsonResponse(res, 405, { error: 'GET with id not supported, use list' }); return; }
          const keys = this.apiKeyService.listForUser(user.userName);
          this.sendJsonResponse(res, 200, { items: keys });
          return;
        }
        case 'POST': {
          if (keyId) { this.sendJsonResponse(res, 405, { error: 'POST with id not supported' }); return; }
          const body = await this.parseRequestBody(req) as { name?: string };
          if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
            this.sendJsonResponse(res, 400, { error: 'name is required' });
            return;
          }
          const result = await this.apiKeyService.create(user.userName, user.userId, user.isAdmin, user.roles, body.name.trim());
          this.sendJsonResponse(res, 201, result);
          return;
        }
        case 'DELETE': {
          if (!keyId) { this.sendJsonResponse(res, 400, { error: 'DELETE requires a key id' }); return; }
          const deleted = await this.apiKeyService.deleteKey(keyId, user.userName);
          if (!deleted) { this.sendJsonResponse(res, 404, { error: 'API key not found' }); return; }
          this.sendJsonResponse(res, 200, { success: true });
          return;
        }
        default:
          this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Generic CRUD ---

  private async handleCrud(req: IncomingMessage, res: ServerResponse, method: string, config: CrudConfig, id?: string): Promise<void> {
    try {
      switch (method) {
        case 'GET':
          if (!id) await this.crudList(res, config);
          else this.sendJsonResponse(res, 405, { error: 'GET with id not supported, use list' });
          break;
        case 'POST':
          if (!id) await this.crudCreate(req, res, config);
          else this.sendJsonResponse(res, 405, { error: 'POST with id not supported' });
          break;
        case 'PUT':
          if (id) await this.crudUpdate(req, res, config, id);
          else this.sendJsonResponse(res, 400, { error: 'PUT requires an id' });
          break;
        case 'DELETE':
          if (id) await this.crudDelete(res, config, id);
          else this.sendJsonResponse(res, 400, { error: 'DELETE requires an id' });
          break;
        default:
          this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async crudList(res: ServerResponse, config: CrudConfig): Promise<void> {
    const data = await this.readJsonFile(config.filePath);
    const items = (data as Record<string, unknown[]>)[config.itemsKey] || [];
    // Strip passwords from users
    const safeItems = config.itemsKey === 'items'
      ? items.map((u: any) => { const { password, ...rest } = u; return rest; })
      : items;
    this.sendJsonResponse(res, 200, { items: safeItems });
  }

  private async crudCreate(req: IncomingMessage, res: ServerResponse, config: CrudConfig): Promise<void> {
    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
    const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

    // Validate name format and uniqueness
    if (body.name && typeof body.name === 'string') {
      const nameErr = MycastleHttpServer.validateName(body.name as string);
      if (nameErr) { this.sendJsonResponse(res, 400, { error: nameErr }); return; }
      const duplicate = items.find((item) => item.name === body.name);
      if (duplicate) { this.sendJsonResponse(res, 409, { error: `Name '${body.name}' already exists` }); return; }
    }

    // SN uniqueness check (global across all users)
    if (config.itemsKey === 'devices' && body.sn && typeof body.sn === 'string' && body.sn !== '') {
      const snExists = await this.isSnUsed(body.sn as string);
      if (snExists) { this.sendJsonResponse(res, 409, { error: `Serial number '${body.sn}' is already in use` }); return; }
    }

    body.id = body.id || randomUUID();

    // Hash password for user creation
    if (config.itemsKey === 'items' && body.password && typeof body.password === 'string') {
      body.password = await PasswordService.hash(body.password as string);
    }

    // Set type field based on resource
    const TYPE_MAP: Record<string, string> = {
      items: 'user', deviceDefs: 'device_def', moduleDefs: 'module_def',
      devices: 'device', projects: 'minis_project',
    };
    if (TYPE_MAP[config.itemsKey]) body.type = TYPE_MAP[config.itemsKey];

    items.push(body);
    data[config.itemsKey] = items;
    data.type = config.typeValue;
    await this.writeJsonFile(config.filePath, data);

    // Create user directory if creating a user
    if (config.itemsKey === 'items' && body.name) {
      const userDir = `${MINIS_ROOT}/Users/${body.name}/Projects`;
      await this.writeJsonFile(`${userDir}/.gitkeep`, '');
    }

const { password, ...safeBody } = body;
    this.sendJsonResponse(res, 201, config.itemsKey === 'items' ? safeBody : body);
  }

  private async crudUpdate(req: IncomingMessage, res: ServerResponse, config: CrudConfig, id: string): Promise<void> {
    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
    const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

    const index = items.findIndex((item) => item[config.lookupKey] === id);
    if (index === -1) {
      this.sendJsonResponse(res, 404, { error: `Item ${id} not found` });
      return;
    }

    // Validate name format if name is being changed
    if (body.name && typeof body.name === 'string') {
      const nameErr = MycastleHttpServer.validateName(body.name as string);
      if (nameErr) { this.sendJsonResponse(res, 400, { error: nameErr }); return; }
      // Check uniqueness (exclude current item)
      const duplicate = items.find((item, i) => i !== index && item.name === body.name);
      if (duplicate) { this.sendJsonResponse(res, 409, { error: `Name '${body.name}' already exists` }); return; }
    }

    // SN uniqueness check (global across all users, skip if unchanged)
    if (config.itemsKey === 'devices' && body.sn && typeof body.sn === 'string' && body.sn !== '') {
      const currentSn = (items[index]['sn'] as string) ?? '';
      if (body.sn !== currentSn) {
        const snExists = await this.isSnUsed(body.sn as string);
        if (snExists) { this.sendJsonResponse(res, 409, { error: `Serial number '${body.sn}' is already in use` }); return; }
      }
    }

    // Hash password on user update
    if (config.itemsKey === 'items' && body.password && typeof body.password === 'string') {
      body.password = await PasswordService.hash(body.password as string);
    }

    items[index] = { ...items[index], ...body };
    // Preserve the lookup key value for id-based resources
    if (config.lookupKey === 'id') items[index].id = items[index].id ?? id;
    data[config.itemsKey] = items;
    await this.writeJsonFile(config.filePath, data);

    const result = items[index];
    const { password, ...safeResult } = result;
    this.sendJsonResponse(res, 200, config.itemsKey === 'items' ? safeResult : result);
  }

  private async crudDelete(res: ServerResponse, config: CrudConfig, id: string): Promise<void> {
    const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
    const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

    const index = items.findIndex((item) => item[config.lookupKey] === id);
    if (index === -1) {
      this.sendJsonResponse(res, 404, { error: `Item ${id} not found` });
      return;
    }

    const deletedItem = items[index];
    items.splice(index, 1);
    data[config.itemsKey] = items;
    await this.writeJsonFile(config.filePath, data);

    // Delete user project source files directory
    if (config.itemsKey === 'projects') {
      const userDir = path.dirname(config.filePath);
      const projectName = (deletedItem as Record<string, unknown>).name as string | undefined;
      const platform = (deletedItem as Record<string, unknown>).softwarePlatform as string | undefined ?? 'Arduino';
      const dirName = projectName ? `${platform}/${projectName}` : id;
      const projectDir = `${userDir}/Projects/${dirName}`;
      try {
        await this.fileSystem.deleteDirectory(projectDir);
      } catch {
        // Directory may not exist
      }
    }

    this.sendJsonResponse(res, 200, { success: true });
  }

  // --- AI Search Proxy ---

  private async handleAiSearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const { model, apiKey, systemPrompt, userPrompt } = body as {
      model: 'openai' | 'anthropic';
      apiKey: string;
      systemPrompt: string;
      userPrompt: string;
    };

    if (!model || !apiKey || !userPrompt) {
      this.sendJsonResponse(res, 400, { error: 'model, apiKey and userPrompt are required' });
      return;
    }

    try {
      let result: string;
      if (model === 'openai') {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        const data = await r.json() as any;
        if (!r.ok) throw new Error(data.error?.message ?? `OpenAI error ${r.status}`);
        result = data.choices[0].message.content;
      } else {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        const data = await r.json() as any;
        if (!r.ok) throw new Error(data.error?.message ?? `Anthropic error ${r.status}`);
        result = data.content[0].text;
      }
      this.sendJsonResponse(res, 200, { result });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: err instanceof Error ? err.message : 'AI request failed' });
    }
  }

  // ─── Memory PIM page — AI proxy ───────────────────────────────────────────

  /**
   * Low-level Anthropic call shared by every Memory AI handler.
   *
   * - reads `ANTHROPIC_API_KEY` from env (set on the host / Coolify);
   *   refuses gracefully when missing so the frontend can show a useful
   *   error instead of a 500.
   * - bounded timeout via AbortController (default 60 s) so a hung
   *   Anthropic deploy doesn't lock the request indefinitely.
   * - normalises every failure to a real Error message.
   *
   * `model` accepts the short alias `'opus' | 'sonnet' | 'haiku'` which
   * maps to the current Claude 4.x ids, or a full model id.
   */
  private async callMemoryAnthropic(opts: {
    model: 'opus' | 'sonnet' | 'haiku' | string;
    system: string;
    user: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set on the server');

    const MODEL_MAP: Record<string, string> = {
      opus: 'claude-opus-4-7',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
    };
    const model = MODEL_MAP[opts.model] ?? opts.model;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 2048,
          system: opts.system,
          messages: [{ role: 'user', content: opts.user }],
        }),
      });
      const data = await r.json() as { content?: Array<{ text?: string }>; error?: { message?: string } };
      if (!r.ok) throw new Error(data.error?.message ?? `Anthropic error ${r.status}`);
      const text = data.content?.[0]?.text;
      if (!text) throw new Error('Anthropic returned empty content');
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Strip leading/trailing markdown fences from a model's JSON reply
   * (```json … ```), trim whitespace, then JSON.parse with a useful error
   * when the model returned malformed JSON.
   */
  private parseAnthropicJson<T>(raw: string, label: string): T {
    let text = raw.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenced) text = fenced[1].trim();
    try { return JSON.parse(text) as T; }
    catch (err) {
      throw new Error(`${label}: model returned malformed JSON — ${(err as Error).message}. First 200 chars: ${text.slice(0, 200)}`);
    }
  }

  private async handleMemoryAi(req: IncomingMessage, res: ServerResponse, userName: string, op: string): Promise<void> {
    void userName;   // currently scoped per-token; reserved for future per-user history / rate-limit
    try {
      const body = await this.parseRequestBody(req) as Record<string, unknown>;
      switch (op) {
        case 'check':           return await this.memoryCheck(res, body);
        case 'generate-one':    return await this.memoryGenerateOne(res, body);
        case 'generate-batch':  return await this.memoryGenerateBatch(res, body);
        case 'explain':         return await this.memoryExplain(res, body);
        case 'find-image':      return await this.memoryFindImage(res, body);
        default:
          this.sendJsonResponse(res, 404, { error: `Unknown memory AI op: ${op}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendJsonResponse(res, 500, { error: msg });
    }
  }

  private async memoryCheck(res: ServerResponse, body: Record<string, unknown>): Promise<void> {
    const questionMarkdown = String(body.questionMarkdown ?? '');
    const canonicalAnswer = String(body.canonicalAnswer ?? '');
    const userAnswer = String(body.userAnswer ?? '');
    if (!questionMarkdown || !userAnswer) {
      this.sendJsonResponse(res, 400, { error: 'questionMarkdown and userAnswer are required' });
      return;
    }
    const system = [
      'You are a strict but fair quiz judge.',
      'Compare the user\'s answer to the canonical answer for the given question.',
      'Treat the user as correct when their answer captures the key facts of the canonical answer,',
      'even if phrased differently. Be lenient on wording, strict on factual content.',
      'Respond ONLY with a single JSON object, no markdown fences, with keys:',
      '  "correct" (boolean) and "verdict" (string, 1-3 sentences explaining your decision).',
      'DEFAULT LANGUAGE: Polish. Write the "verdict" field in Polish unless the question itself is in another language —',
      'in that case match the question\'s language.',
    ].join(' ');
    const user = [
      'Question (Markdown):',
      questionMarkdown,
      '',
      'Canonical answer:',
      canonicalAnswer || '(none — judge on plausibility / general correctness)',
      '',
      'User\'s answer:',
      userAnswer,
    ].join('\n');
    const raw = await this.callMemoryAnthropic({ model: 'sonnet', system, user, maxTokens: 600 });
    const parsed = this.parseAnthropicJson<{ correct: boolean; verdict: string }>(raw, 'check');
    this.sendJsonResponse(res, 200, { correct: Boolean(parsed.correct), verdict: String(parsed.verdict ?? '') });
  }

  private async memoryGenerateOne(res: ServerResponse, body: Record<string, unknown>): Promise<void> {
    const categoryName = String(body.categoryName ?? '');
    const categoryDescription = String(body.categoryDescription ?? '');
    const topic = body.topic ? String(body.topic) : '';
    const preferredType = (body.preferredType === 'choice' ? 'choice' : body.preferredType === 'text' ? 'text' : 'text') as 'text' | 'choice';
    const existing = Array.isArray(body.existingTitles) ? (body.existingTitles as unknown[]).map(String).slice(0, 30) : [];
    const system = this.memoryGeneratorSystem(preferredType);
    const user = [
      `Category: ${categoryName}`,
      categoryDescription ? `Category description: ${categoryDescription}` : '',
      topic ? `Focus on this specific topic: ${topic}` : '',
      existing.length > 0 ? `Do NOT duplicate these existing questions (use different angles/wording):\n${existing.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : '',
      'Return ONE question in the JSON schema described in the system prompt.',
    ].filter(Boolean).join('\n\n');
    const raw = await this.callMemoryAnthropic({ model: 'opus', system, user, maxTokens: 1500 });
    const parsed = this.parseAnthropicJson<unknown>(raw, 'generate-one');
    this.sendJsonResponse(res, 200, this.normaliseGeneratedQuestion(parsed));
  }

  private async memoryGenerateBatch(res: ServerResponse, body: Record<string, unknown>): Promise<void> {
    const categoryName = String(body.categoryName ?? '');
    const categoryDescription = String(body.categoryDescription ?? '');
    const count = Math.max(1, Math.min(10, Number(body.count) || 3));
    const existing = Array.isArray(body.existing) ? body.existing : [];
    const existingDescs = existing.slice(0, 50).map((it) => {
      const q = it as { questionMarkdown?: string; type?: string };
      return `[${q.type ?? '?'}] ${(q.questionMarkdown ?? '').slice(0, 160).replace(/\s+/g, ' ')}`;
    }).join('\n');

    const system = this.memoryGeneratorSystem('any');
    const user = [
      `Category: ${categoryName}`,
      categoryDescription ? `Category description: ${categoryDescription}` : '',
      `Generate exactly ${count} NEW questions that COVER GAPS in the existing set below.`,
      'Pick angles, sub-topics, difficulty levels, or formats that the existing items don\'t cover.',
      'Mix `text` and `choice` types — at least one of each when count >= 2.',
      '',
      'Existing questions:',
      existingDescs || '(none yet — feel free to span the whole topic)',
      '',
      `Return a JSON OBJECT with key "items" whose value is an array of exactly ${count} question objects matching the schema in the system prompt.`,
    ].join('\n');
    const raw = await this.callMemoryAnthropic({ model: 'opus', system, user, maxTokens: 4096 });
    const parsed = this.parseAnthropicJson<{ items?: unknown[] }>(raw, 'generate-batch');
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((it) => this.normaliseGeneratedQuestion(it))
      : [];
    this.sendJsonResponse(res, 200, { items });
  }

  private async memoryExplain(res: ServerResponse, body: Record<string, unknown>): Promise<void> {
    const questionMarkdown = String(body.questionMarkdown ?? '');
    const answerMarkdown = String(body.answerMarkdown ?? '');
    if (!questionMarkdown) {
      this.sendJsonResponse(res, 400, { error: 'questionMarkdown is required' });
      return;
    }
    const system = [
      'You are a knowledgeable tutor.',
      'Explain the given question and (optionally) its canonical answer in depth, as Markdown.',
      'Structure your response: a short intro, then numbered or bulleted sections covering background,',
      'why the answer is what it is, common misconceptions, related concepts, and one practical example.',
      'DEFAULT LANGUAGE: Polish. Write the entire explanation in Polish unless the question itself is in another language —',
      'in that case match the question\'s language.',
      'No JSON, no code fences around the whole reply — just raw Markdown.',
    ].join(' ');
    const user = [
      'Question:',
      questionMarkdown,
      '',
      answerMarkdown ? `Canonical answer:\n${answerMarkdown}` : '(no canonical answer — explain the question on its merits)',
    ].join('\n');
    const raw = await this.callMemoryAnthropic({ model: 'opus', system, user, maxTokens: 2500 });
    this.sendJsonResponse(res, 200, { explanation: raw });
  }

  private async memoryFindImage(res: ServerResponse, body: Record<string, unknown>): Promise<void> {
    const query = String(body.query ?? '').trim();
    if (!query) {
      this.sendJsonResponse(res, 400, { error: 'query is required' });
      return;
    }
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&pithumbsize=600&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) { this.sendJsonResponse(res, 200, { image: null }); return; }
      const data = await r.json() as {
        query?: { pages?: Record<string, { title?: string; thumbnail?: { source?: string }; pageid?: number }> };
      };
      const pages = Object.values(data.query?.pages ?? {});
      const withThumb = pages.find((p) => p.thumbnail?.source);
      if (!withThumb || !withThumb.thumbnail?.source) {
        this.sendJsonResponse(res, 200, { image: null });
        return;
      }
      this.sendJsonResponse(res, 200, {
        image: {
          url: withThumb.thumbnail.source,
          title: withThumb.title ?? query,
          sourceUrl: `https://en.wikipedia.org/?curid=${withThumb.pageid ?? ''}`,
        },
      });
    } catch (err) {
      // Network blip / timeout — treat as "no image", don't fail the request.
      void err;
      this.sendJsonResponse(res, 200, { image: null });
    }
  }

  private memoryGeneratorSystem(typeHint: 'text' | 'choice' | 'any'): string {
    const typeRule = typeHint === 'any'
      ? '"type" must be either "text" or "choice". When "choice", include a "choices" array of 3-5 objects {"label":"...","correct":bool} with exactly one correct.'
      : typeHint === 'choice'
        ? '"type" must be "choice". Include a "choices" array of 3-5 objects {"label":"...","correct":bool} with exactly one correct.'
        : '"type" must be "text" — the answer is a short free-form text the user will type.';
    return [
      'You generate quiz questions for a knowledge-testing app.',
      'Respond ONLY with a single JSON object, no markdown fences, no commentary.',
      'Schema:',
      '{',
      '  "questionMarkdown": string,   // Markdown body of the question, can include lists or code',
      '  "answerMarkdown":   string,   // Markdown body of the canonical answer (short for choice, can be longer for text)',
      '  "type":             "text" | "choice",',
      '  "choices":          [ { "label": string, "correct": boolean } ],   // ONLY when type === "choice"',
      '  "imageQuery":       string    // optional 2-4 word phrase to search Wikipedia for an illustrative image; write the query in English for better Wikipedia coverage even when the question is in another language',
      '}',
      typeRule,
      'DEFAULT LANGUAGE: Polish. Write both "questionMarkdown" and "answerMarkdown" (and "choices[].label") IN POLISH',
      'unless the category name/description is clearly in another language — in that case match that language.',
      'Use proper Polish diacritics (ą ć ę ł ń ó ś ź ż). Never use ASCII transliteration.',
      'Keep questions self-contained and unambiguous.',
    ].join('\n');
  }

  private normaliseGeneratedQuestion(raw: unknown): {
    questionMarkdown: string;
    answerMarkdown: string;
    type: 'text' | 'choice';
    choices?: Array<{ label: string; correct: boolean }>;
    imageQuery?: string;
  } {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const type: 'text' | 'choice' = o.type === 'choice' ? 'choice' : 'text';
    const out: ReturnType<MycastleHttpServer['normaliseGeneratedQuestion']> = {
      questionMarkdown: String(o.questionMarkdown ?? '').trim() || '(empty question)',
      answerMarkdown: String(o.answerMarkdown ?? '').trim(),
      type,
    };
    if (type === 'choice' && Array.isArray(o.choices)) {
      out.choices = (o.choices as unknown[])
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          label: String((c as { label?: unknown }).label ?? '').trim(),
          correct: Boolean((c as { correct?: unknown }).correct),
        }))
        .filter((c) => c.label.length > 0)
        .slice(0, 6);
    }
    if (typeof o.imageQuery === 'string' && o.imageQuery.trim()) {
      out.imageQuery = o.imageQuery.trim();
    }
    return out;
  }

  // --- Admin Firmware ---

  private async handleAdminFirmware(_req: IncomingMessage, res: ServerResponse, method: string, fileName?: string): Promise<void> {
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
      return;
    }
    if (!this.rootDir) {
      this.sendJsonResponse(res, 503, { error: 'rootDir not configured' });
      return;
    }
    const firmwareDir = path.resolve(this.rootDir, 'Minis', 'Admin', 'Firmware');

    if (!fileName) {
      try {
        const entries = await fs.promises.readdir(firmwareDir, { withFileTypes: true });
        const items = entries
          .filter(e => e.isFile() && e.name.endsWith('.bin'))
          .map(e => {
            const stat = fs.statSync(path.join(firmwareDir, e.name));
            return { name: e.name, size: stat.size };
          });
        this.sendJsonResponse(res, 200, { items });
      } catch {
        this.sendJsonResponse(res, 200, { items: [] });
      }
      return;
    }

    if (fileName.includes('..') || fileName.includes('/')) {
      this.sendJsonResponse(res, 400, { error: 'Invalid file name' });
      return;
    }
    const filePath = path.join(firmwareDir, fileName);
    try {
      const data = await fs.promises.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': data.length,
      });
      res.end(data);
    } catch {
      this.sendJsonResponse(res, 404, { error: 'Firmware file not found' });
    }
  }

  // --- uPython ---

  private async handleUpythonDeploy(req: IncomingMessage, res: ServerResponse, userName: string, projectName: string): Promise<void> {
    if (!this.upythonService?.isAvailable) {
      this.sendJsonResponse(res, 503, { error: 'MicroPython CLI not configured' });
      return;
    }

    const isSSE = req.headers.accept?.includes('text/event-stream');
    const url = new URL(req.url ?? '/', 'http://localhost');

    let port: string | undefined;
    let deviceName: string | undefined;
    let serialNumber: string | undefined;

    if (req.method === 'GET') {
      port         = url.searchParams.get('port') ?? undefined;
      deviceName   = url.searchParams.get('deviceName') ?? undefined;
      serialNumber = url.searchParams.get('serialNumber') ?? undefined;
    } else {
      const body = await this.parseRequestBody(req) as { port?: string; deviceName?: string; serialNumber?: string };
      port         = body.port;
      deviceName   = body.deviceName;
      serialNumber = body.serialNumber;
    }

    if (!port) {
      this.sendJsonResponse(res, 400, { error: 'port is required' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }

    // Resolve deviceName — accept either deviceName or serialNumber (legacy)
    let resolvedDeviceName = deviceName;
    if (!resolvedDeviceName && serialNumber) {
      try {
        const deviceData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Device.json`) as { devices?: Array<{ name?: string; sn?: string }> };
        const device = (deviceData?.devices ?? []).find(d => d.sn === serialNumber);
        resolvedDeviceName = device?.name;
      } catch { /* ignore */ }
    }

    // Read uPython libraries from project record
    let upythonLibraries: Array<{ url: string; remoteName: string }> | undefined;
    try {
      const projectData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as { projects?: Array<{ id: string; name: string; libraries?: Array<{ url: string; remoteName?: string; name?: string }> }> };
      const projectEntry = (Array.isArray(projectData?.projects) ? projectData.projects : []).find(p => p.name === projectId || p.id === projectId);
      if (projectEntry?.libraries?.length) {
        upythonLibraries = projectEntry.libraries
          .filter(l => l.url)
          .map(l => ({ url: l.url, remoteName: l.remoteName ?? (l.url.split('/').pop() ?? l.name ?? 'lib.py') }));
      }
    } catch { /* ignore */ }

    let minisConfigFile: Array<{ content: string; remoteName: string }> | undefined;
    if (resolvedDeviceName) {
      try {
        const config = await this.resolveMinisConfig(userName, resolvedDeviceName);
        const content = [
          `MINIS_DEVICE_NAME = ${JSON.stringify(resolvedDeviceName)}`,
          `MINIS_WIFI_SSID = ${JSON.stringify(config.wifiSsid)}`,
          `MINIS_WIFI_PASSWORD = ${JSON.stringify(config.wifiPassword)}`,
        ].join('\n') + '\n';
        minisConfigFile = [{ content, remoteName: 'MinisConfig.py' }];
      } catch { /* ignore */ }
    }

    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      this.setCorsHeaders(res);
      res.writeHead(200);

      const sendEvent = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      const onChunk = (chunk: string) => sendEvent('output', { chunk });

      try {
        const result = await this.upythonService.deploy(userName, projectId, port, upythonLibraries, minisConfigFile, onChunk);
        if (resolvedDeviceName) {
          await this.saveDeviceLastBuildByName(userName, resolvedDeviceName, { platform: 'micropython', success: result.success });
        }
        sendEvent('done', { success: result.success, exitCode: result.exitCode });
      } catch (err) {
        sendEvent('done', { success: false, exitCode: 1, error: err instanceof Error ? err.message : 'Deploy failed' });
      }
      res.end();
    } else {
      try {
        const result = await this.upythonService.deploy(userName, projectId, port, upythonLibraries, minisConfigFile);
        if (resolvedDeviceName) {
          await this.saveDeviceLastBuildByName(userName, resolvedDeviceName, { platform: 'micropython', success: result.success });
        }
        this.sendJsonResponse(res, 200, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Deploy failed';
        if (resolvedDeviceName) {
          await this.saveDeviceLastBuildByName(userName, resolvedDeviceName, { platform: 'micropython', success: false });
        }
        this.sendJsonResponse(res, 200, { success: false, output: msg, exitCode: 1 });
      }
    }
  }

  // --- PicoSDK ---

  private async handlePicoSdkBuild(req: IncomingMessage, res: ServerResponse, userName: string, projectName: string): Promise<void> {
    if (!this.picoSdkService) {
      this.sendJsonResponse(res, 503, { error: 'PicoSDK service not configured (set PICOSDK_DOCKER_IMAGE)' });
      return;
    }

    // Support both GET (SSE streaming) and POST (JSON, legacy)
    const isSSE = req.headers.accept?.includes('text/event-stream');
    const url = new URL(req.url ?? '/', 'http://localhost');

    let sketchName: string | undefined;
    let boardKey = 'pico2';

    if (req.method === 'GET') {
      sketchName = url.searchParams.get('sketchName') ?? undefined;
      boardKey = url.searchParams.get('boardKey') ?? 'pico2';
    } else {
      const body = await this.readJsonBody(req) as { sketchName?: string; boardKey?: string };
      sketchName = body.sketchName;
      boardKey = body.boardKey ?? 'pico2';
    }

    if (!sketchName) {
      this.sendJsonResponse(res, 400, { error: 'sketchName is required' });
      return;
    }

    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }

    if (isSSE) {
      // SSE streaming mode
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      this.setCorsHeaders(res);
      res.writeHead(200);

      const sendEvent = (type: string, data: unknown) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const result = await this.picoSdkService.buildProject(
          userName, projectId, sketchName, boardKey,
          (chunk) => sendEvent('output', { chunk }),
        );
        const uf2Url = result.success
          ? `/api/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/uf2/${encodeURIComponent(sketchName)}?board=${encodeURIComponent(boardKey)}`
          : undefined;
        sendEvent('done', { success: result.success, exitCode: result.exitCode, uf2Url });
      } catch (err) {
        sendEvent('done', { success: false, exitCode: 1, error: err instanceof Error ? err.message : 'Build failed' });
      }
      res.end();
    } else {
      // Legacy JSON mode
      try {
        const result = await this.picoSdkService.buildProject(userName, projectId, sketchName, boardKey);
        const uf2Url = result.success
          ? `/api/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectName)}/uf2/${encodeURIComponent(sketchName)}?board=${encodeURIComponent(boardKey)}`
          : undefined;
        this.sendJsonResponse(res, 200, { ...result, uf2Url });
      } catch (err) {
        this.sendJsonResponse(res, 200, { success: false, output: err instanceof Error ? err.message : 'Build failed', exitCode: 1 });
      }
    }
  }

  private async handlePicoSdkDownload(req: IncomingMessage, res: ServerResponse, userName: string, projectName: string, sketchName: string): Promise<void> {
    if (!this.picoSdkService) {
      this.sendJsonResponse(res, 503, { error: 'PicoSDK service not configured' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const boardKey = url.searchParams.get('board') ?? 'pico2';
    const uf2Path = this.picoSdkService.uf2Path(userName, projectId, sketchName, boardKey);
    try {
      const data = await fs.promises.readFile(uf2Path);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${projectName}.uf2"`);
      res.setHeader('Content-Length', data.length);
      res.writeHead(200);
      res.end(data);
    } catch {
      this.sendJsonResponse(res, 404, { error: 'UF2 file not found — build first' });
    }
  }

  // --- Node.js ---

  private async handleNodejsRun(req: IncomingMessage, res: ServerResponse, userName: string): Promise<void> {
    if (!this.rootDir) {
      this.sendJsonResponse(res, 503, { error: 'rootDir not configured' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const subpath = url.searchParams.get('subpath') ?? '';
    const script = url.searchParams.get('script') ?? '';
    if (!script) {
      this.sendJsonResponse(res, 400, { error: 'Missing script parameter' });
      return;
    }
    // Resolve to real filesystem path: rootDir/Minis/Users/{user}/{subpath}
    // (rootDir already points to the data directory, e.g. …/data)
    const projectDir = path.resolve(this.rootDir, 'Minis', 'Users', userName, subpath);
    // Ensure the resolved path is within rootDir (prevent directory traversal)
    if (!projectDir.startsWith(path.resolve(this.rootDir))) {
      this.sendJsonResponse(res, 403, { error: 'Forbidden' });
      return;
    }
    // Verify the directory exists — a missing cwd causes a misleading spawn ENOENT error
    try {
      const stat = await import('fs/promises').then(m => m.stat(projectDir));
      if (!stat.isDirectory()) throw new Error('not a directory');
    } catch {
      this.sendJsonResponse(res, 404, { error: `Project directory not found: ${projectDir}` });
      return;
    }
    // Ensure package.json exists here — without it npm walks up the filesystem and may
    // accidentally run scripts from the monorepo root.
    try {
      await import('fs/promises').then(m => m.stat(path.join(projectDir, 'package.json')));
    } catch {
      this.sendJsonResponse(res, 404, { error: `No package.json in ${projectDir}` });
      return;
    }

    const args = script === 'install' ? ['install', '--include=dev'] : ['run', script];

    // Write a temporary .npmrc so npm resolves @mhersztowski/* from GitHub Packages.
    // Environment variable names cannot contain '@' or ':', so npm_config_* injection
    // does not work for scoped registry keys — a config file is the only reliable way.
    const { readFile, writeFile, unlink } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const githubToken = process.env.GITHUB_TOKEN;
    let tmpNpmrc: string | null = null;
    if (githubToken) {
      tmpNpmrc = path.join(tmpdir(), `mycastle-npm-${Date.now()}.npmrc`);
      await writeFile(tmpNpmrc, [
        '@mhersztowski:registry=https://npm.pkg.github.com',
        `//npm.pkg.github.com/:_authToken=${githubToken}`,
      ].join('\n') + '\n');
    }

    const npmArgs = tmpNpmrc ? [...args, `--userconfig=${tmpNpmrc}`] : args;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    this.setCorsHeaders(res);
    res.writeHead(200);

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const proc = spawn('npm', npmArgs, { cwd: projectDir, shell: true });

    proc.stdout.on('data', (chunk: Buffer) => sendEvent('output', { chunk: chunk.toString() }));
    proc.stderr.on('data', (chunk: Buffer) => sendEvent('output', { chunk: chunk.toString() }));

    const cleanup = () => { if (tmpNpmrc) unlink(tmpNpmrc).catch(() => {}); };

    proc.on('close', (code) => {
      cleanup();
      sendEvent('done', { success: code === 0, exitCode: code });
      res.end();
    });

    proc.on('error', (err) => {
      cleanup();
      sendEvent('output', { chunk: `Error: ${err.message}\n` });
      sendEvent('done', { success: false, error: err.message });
      res.end();
    });

    req.on('close', () => { proc.kill(); cleanup(); });
  }

  // --- Python ---

  private async handlePythonRun(req: IncomingMessage, res: ServerResponse, userName: string): Promise<void> {
    if (!this.rootDir) {
      this.sendJsonResponse(res, 503, { error: 'rootDir not configured' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const subpath = url.searchParams.get('subpath') ?? '';
    const script  = url.searchParams.get('script')  ?? '';
    const file    = url.searchParams.get('file')     ?? '';

    if (!script) {
      this.sendJsonResponse(res, 400, { error: 'Missing script parameter' });
      return;
    }

    const projectDir = path.resolve(this.rootDir, 'Minis', 'Users', userName, subpath);
    if (!projectDir.startsWith(path.resolve(this.rootDir))) {
      this.sendJsonResponse(res, 403, { error: 'Forbidden' });
      return;
    }
    try {
      const stat = await import('fs/promises').then(m => m.stat(projectDir));
      if (!stat.isDirectory()) throw new Error('not a directory');
    } catch {
      this.sendJsonResponse(res, 404, { error: `Project directory not found: ${projectDir}` });
      return;
    }

    // Map action id → python3 arguments
    let args: string[];
    if (script === 'run') {
      // Run a specific file (if provided) or fall back to main.py
      const target = file || 'main.py';
      args = [target];
    } else if (script === 'install') {
      args = ['-m', 'pip', 'install', '-r', 'requirements.txt'];
    } else if (script === 'test') {
      args = ['-m', 'pytest'];
    } else {
      this.sendJsonResponse(res, 400, { error: `Unknown script: ${script}` });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    this.setCorsHeaders(res);
    res.writeHead(200);

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const proc = spawn('python3', args, { cwd: projectDir, shell: false });

    proc.stdout.on('data', (chunk: Buffer) => sendEvent('output', { chunk: chunk.toString() }));
    proc.stderr.on('data', (chunk: Buffer) => sendEvent('output', { chunk: chunk.toString() }));

    proc.on('close', (code) => {
      sendEvent('done', { success: code === 0, exitCode: code });
      res.end();
    });

    proc.on('error', (err) => {
      sendEvent('output', { chunk: `Error: ${err.message}\n` });
      sendEvent('done', { success: false, error: err.message });
      res.end();
    });

    req.on('close', () => { proc.kill(); });
  }

  // --- User Devices ---

  private async saveDeviceLastBuild(userName: string, serialNumber: string, build: { platform: string; fqbn?: string; version?: string; success: boolean; projectId?: string; sketchName?: string }): Promise<void> {
    try {
      const filePath = `${MINIS_ROOT}/Users/${userName}/Device.json`;
      const data = await this.readJsonFile(filePath) as Record<string, unknown>;
      const devices = (data['devices'] || []) as Record<string, unknown>[];
      const idx = devices.findIndex((d) => d['sn'] === serialNumber);
      if (idx === -1) return;
      devices[idx] = { ...devices[idx], lastBuild: { ...build, at: Date.now() } };
      data['devices'] = devices;
      await this.writeJsonFile(filePath, data);
    } catch { /* non-critical */ }
  }

  private async saveDeviceLastBuildByName(userName: string, deviceName: string, build: { platform: string; fqbn?: string; version?: string; success: boolean; projectId?: string; sketchName?: string }): Promise<void> {
    try {
      const filePath = `${MINIS_ROOT}/Users/${userName}/Device.json`;
      const data = await this.readJsonFile(filePath) as Record<string, unknown>;
      const devices = (data['devices'] || []) as Record<string, unknown>[];
      const idx = devices.findIndex((d) => d['name'] === deviceName);
      if (idx === -1) return;
      devices[idx] = { ...devices[idx], lastBuild: { ...build, at: Date.now() } };
      data['devices'] = devices;
      await this.writeJsonFile(filePath, data);
    } catch { /* non-critical */ }
  }

  private async isSnUsed(sn: string): Promise<boolean> {
    let users: Array<{ name: string }> = [];
    try {
      const usersData = await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`) as Record<string, unknown>;
      users = (usersData['items'] || []) as Array<{ name: string }>;
    } catch { return false; }
    for (const user of users) {
      try {
        const deviceData = await this.readJsonFile(`${MINIS_ROOT}/Users/${user.name}/Device.json`) as Record<string, unknown>;
        const devices = (deviceData['devices'] || []) as Array<{ sn?: string }>;
        if (devices.some((d) => d.sn === sn)) return true;
      } catch { /* skip missing */ }
    }
    return false;
  }

  private async handleNextSn(res: ServerResponse): Promise<void> {
    const filePath = `${MINIS_ROOT}/Admin/snCounter.json`;
    let counter: { lastSn: number };
    try {
      const raw = await this.readJsonFile(filePath) as { lastSn: number };
      counter = typeof raw?.lastSn === 'number' ? raw : { lastSn: 1000 };
    } catch {
      counter = { lastSn: 1000 };
    }
    counter.lastSn += 1;
    await this.writeJsonFile(filePath, counter);
    this.sendJsonResponse(res, 200, { sn: String(counter.lastSn) });
  }

  private async userExistsByName(name: string): Promise<boolean> {
    const data = await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`);
    return ((data as any).items || []).some((u: any) => u.name === name);
  }

  private async handleSmartDisplayConfig(req: IncomingMessage, res: ServerResponse, method: string, userName: string, deviceName: string): Promise<void> {
    const filePath = `${MINIS_ROOT}/Users/${userName}/SmartDisplay/${deviceName}.json`;
    if (method === 'GET') {
      const data = await this.readJsonFile(filePath);
      this.sendJsonResponse(res, 200, Object.keys(data as object).length ? data : { type: 'smart-display-config', cycleDurationMs: 900000, views: [] });
    } else if (method === 'PUT') {
      const body = await this.parseRequestBody(req);
      await this.writeJsonFile(filePath, body);
      this.sendJsonResponse(res, 200, body);
    } else {
      this.sendJsonResponse(res, 405, { error: 'Method Not Allowed' });
    }
  }

  private async handleUserLocalizations(req: IncomingMessage, res: ServerResponse, method: string, userName: string, locId?: string): Promise<void> {
    if (!await this.userExistsByName(userName)) {
      this.sendJsonResponse(res, 404, { error: 'User not found' });
      return;
    }

    const config: CrudConfig = {
      filePath: `${MINIS_ROOT}/Users/${userName}/Localization.json`,
      itemsKey: 'localizations',
      typeValue: 'localizations',
      lookupKey: 'id',
    };
    await this.handleCrud(req, res, method, config, locId);
  }


  private async handleDeviceMinisConfig(res: ServerResponse, userName: string, deviceName: string): Promise<void> {
    try {
      const data = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Device.json`) as Record<string, unknown>;
      const devices = (data['devices'] || []) as Record<string, unknown>[];
      const device = devices.find((d) => d['name'] === deviceName);
      if (!device) {
        this.sendJsonResponse(res, 404, { error: 'Device not found' });
        return;
      }
      const config = await this.resolveMinisConfig(userName, deviceName);
      this.sendJsonResponse(res, 200, { deviceName: config.deviceName, serialNumber: config.serialNumber, wifiSsid: config.wifiSsid, wifiPassword: config.wifiPassword });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleUserDevices(req: IncomingMessage, res: ServerResponse, method: string, userName: string, deviceName?: string): Promise<void> {
    if (!await this.userExistsByName(userName)) {
      this.sendJsonResponse(res, 404, { error: 'User not found' });
      return;
    }

    const config: CrudConfig = {
      filePath: `${MINIS_ROOT}/Users/${userName}/Device.json`,
      itemsKey: 'devices',
      typeValue: 'devices',
      lookupKey: 'name',
    };
    await this.handleCrud(req, res, method, config, deviceName);
  }

  // --- User Projects ---

  private async handleUserProjects(req: IncomingMessage, res: ServerResponse, method: string, userName: string, projectName?: string): Promise<void> {
    if (!await this.userExistsByName(userName)) {
      this.sendJsonResponse(res, 404, { error: 'User not found' });
      return;
    }

    const config: CrudConfig = {
      filePath: `${MINIS_ROOT}/Users/${userName}/Project.json`,
      itemsKey: 'projects',
      typeValue: 'projects',
      lookupKey: 'name',
    };

    // For project creation: run the standard CRUD then also scaffold project directory + project.json
    if (method === 'POST' && !projectName) {
      const body = await this.parseRequestBody(req) as Record<string, unknown>;
      const data = await this.readJsonFile(config.filePath) as Record<string, unknown>;
      const items = (data[config.itemsKey] || []) as Record<string, unknown>[];

      const name = typeof body.name === 'string' ? body.name : null;
      if (!name) { this.sendJsonResponse(res, 400, { error: 'name is required' }); return; }
      const nameErr = MycastleHttpServer.validateName(name);
      if (nameErr) { this.sendJsonResponse(res, 400, { error: nameErr }); return; }
      if (items.find(p => p.name === name)) { this.sendJsonResponse(res, 409, { error: `Name '${name}' already exists` }); return; }

      body.id = body.id || randomUUID();
      body.type = 'minis_project';
      items.push(body);
      data[config.itemsKey] = items;
      data.type = config.typeValue;
      await this.writeJsonFile(config.filePath, data);

      // Create project directory with project.json so VFS workspace can detect it
      const platform = (typeof body.softwarePlatform === 'string' ? body.softwarePlatform : null) ?? 'Arduino';
      const projectDir = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', platform, name);
      await fs.promises.mkdir(path.join(projectDir, 'sketches'), { recursive: true });
      const projectJson = {
        id: name,
        name,
        platform,
        ...(body.boardProfileKey ? { boardProfileKey: body.boardProfileKey } : {}),
      };
      await fs.promises.writeFile(path.join(projectDir, 'project.json'), JSON.stringify(projectJson, null, 2), 'utf-8');

      this.sendJsonResponse(res, 201, body);
      return;
    }

    await this.handleCrud(req, res, method, config, projectName);
  }

  private async handleUserDeviceDefs(req: IncomingMessage, res: ServerResponse, method: string, userName: string, defId?: string): Promise<void> {
    if (!await this.userExistsByName(userName)) {
      this.sendJsonResponse(res, 404, { error: 'User not found' });
      return;
    }

    const config: CrudConfig = {
      filePath: `${MINIS_ROOT}/Users/${userName}/DeviceDefList.json`,
      itemsKey: 'deviceDefs',
      typeValue: 'device_defs',
      lookupKey: 'id',
    };

    // For GET list: merge admin's global defs with user's own defs (admin defs first, user defs override by id)
    if (req.method === 'GET' && !defId) {
      try {
        const usersData = (await this.readJsonFile(`${MINIS_ROOT}/Admin/Users.json`)) as Record<string, unknown[]>;
        const users = (usersData['items'] ?? []) as Array<Record<string, unknown>>;
        const adminUser = users.find((u) => u['isAdmin'] === true);
        const adminName = adminUser ? String(adminUser['name']) : null;
        const userDefs = ((await this.readJsonFile(config.filePath)) as Record<string, unknown[]>)['deviceDefs'] ?? [];
        const adminDefs = adminName && adminName !== userName
          ? (((await this.readJsonFile(`${MINIS_ROOT}/Users/${adminName}/DeviceDefList.json`)) as Record<string, unknown[]>)['deviceDefs'] ?? [])
          : [];
        const merged = [...adminDefs as object[], ...userDefs as object[]].filter(
          (item, idx, arr) => arr.findIndex((o) => (o as Record<string, unknown>).id === (item as Record<string, unknown>).id) === idx,
        );
        this.sendJsonResponse(res, 200, { items: merged });
        return;
      } catch {
        // fall through to standard CRUD on error
      }
    }

    await this.handleCrud(req, res, method, config, defId);
  }

  // --- Def Sources Upload ---

  private static readonly SOURCES_CONFIG: Record<string, { listFile: string; itemsKey: string; destDir: string }> = {};

  private async handleUploadDefSources(req: IncomingMessage, res: ServerResponse, resource: string, defId: string): Promise<void> {
    try {
      const config = MycastleHttpServer.SOURCES_CONFIG[resource];
      if (!config) {
        this.sendJsonResponse(res, 400, { error: `Upload not supported for ${resource}` });
        return;
      }

      const data = await this.readJsonFile(config.listFile) as Record<string, any>;
      const items = (data[config.itemsKey] || []) as any[];
      const item = items.find((d) => d.id === defId);
      if (!item) {
        this.sendJsonResponse(res, 404, { error: 'Definition not found' });
        return;
      }

      // Read the zip binary from request body
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_ZIP_SIZE) {
            reject(new Error('Zip file too large (max 50MB)'));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', resolve);
        req.on('error', reject);
      });

      const zipBuffer = Buffer.concat(chunks);
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();

      const destPath = `${config.destDir}/${item.id}`;

      // Detect single root directory — if all entries share the same top-level dir, strip it
      const fileEntries = entries.filter((e) => !e.isDirectory && !e.entryName.includes('..'));
      const topLevelDirs = new Set<string>();
      for (const entry of fileEntries) {
        const firstSlash = entry.entryName.indexOf('/');
        if (firstSlash > 0) {
          topLevelDirs.add(entry.entryName.substring(0, firstSlash + 1));
        } else {
          topLevelDirs.clear();
          break;
        }
      }
      const stripPrefix = topLevelDirs.size === 1 ? [...topLevelDirs][0] : '';

      // Extract each file
      let fileCount = 0;
      const textExts = ['.ino', '.blockly', '.json', '.xml', '.txt', '.md', '.h', '.c', '.cpp', '.py', '.html', '.css', '.js'];
      for (const entry of fileEntries) {
        const entryPath = stripPrefix ? entry.entryName.substring(stripPrefix.length) : entry.entryName;
        if (!entryPath) continue;

        const content = entry.getData();
        const filePath = `${destPath}/${entryPath}`;
        const ext = path.extname(entryPath).toLowerCase();

        if (textExts.includes(ext)) {
          await this.fileSystem.writeFile(filePath, content.toString('utf-8'));
        } else {
          const base64 = content.toString('base64');
          await this.fileSystem.writeBinaryFile(filePath, base64, 'application/octet-stream');
        }
        fileCount++;
      }

      this.sendJsonResponse(res, 200, { success: true, filesExtracted: fileCount, path: destPath });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Swagger UI ---

  private serveSwaggerUi(res: ServerResponse): void {
    if (!this.swaggerUiDir) {
      this.sendJsonResponse(res, 503, { error: 'swagger-ui-dist not available' });
      return;
    }
    const indexPath = path.join(this.swaggerUiDir, 'index.html');
    try {
      let html = fs.readFileSync(indexPath, 'utf-8');
      // Replace default petstore URL with our spec
      html = html.replace(
        /https:\/\/petstore\.swagger\.io\/v2\/swagger\.json|https:\/\/petstore3\.swagger\.io\/api\/v3\/openapi\.json/g,
        '/api/docs/swagger.json',
      );
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      this.sendJsonResponse(res, 500, { error: 'Failed to load swagger UI' });
    }
  }

  private serveSwaggerAsset(assetPath: string, res: ServerResponse): void {
    if (!this.swaggerUiDir) {
      this.sendJsonResponse(res, 503, { error: 'swagger-ui-dist not available' });
      return;
    }

    const filePath = path.join(this.swaggerUiDir, assetPath);
    const resolved = path.resolve(filePath);
    const resolvedDir = path.resolve(this.swaggerUiDir);
    if (!resolved.startsWith(resolvedDir)) {
      this.sendJsonResponse(res, 403, { error: 'Forbidden' });
      return;
    }

    try {
      let content: Buffer | string = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      // Replace petstore URL in swagger-initializer.js with our spec
      if (assetPath === 'swagger-initializer.js') {
        content = content.toString('utf-8').replace(
          /https:\/\/petstore\.swagger\.io\/v2\/swagger\.json/g,
          '/api/docs/swagger.json',
        );
      }
      const mimeTypes: Record<string, string> = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.png': 'image/png',
        '.map': 'application/json',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      this.sendJsonResponse(res, 404, { error: 'Asset not found' });
    }
  }

  // --- Electronics Configuration ---

  private async handleIotArchitecture(req: IncomingMessage, res: ServerResponse, method: string, userName: string): Promise<void> {
    const filePath = `${MINIS_ROOT}/Users/${userName}/Electronics/configuration.json`;
    try {
      if (method === 'GET') {
        try {
          const data = await this.readJsonFile(filePath);
          this.sendJsonResponse(res, 200, data);
        } catch {
          this.sendJsonResponse(res, 200, { nodes: [], edges: [], updatedAt: 0 });
        }
      } else if (method === 'PUT') {
        const body = await this.parseRequestBody(req);
        await this.writeJsonFile(filePath, body);
        this.sendJsonResponse(res, 200, body);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Config ---

  private async handleIotConfig(req: IncomingMessage, res: ServerResponse, method: string, userName: string, deviceName: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET') {
        const config = this.iotService.telemetry.getConfig(deviceName);
        if (!config) {
          this.sendJsonResponse(res, 404, { error: 'IoT config not found' });
          return;
        }
        this.sendJsonResponse(res, 200, config);
      } else if (method === 'PUT') {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const now = Date.now();
        const existing = this.iotService.telemetry.getConfig(deviceName);
        this.iotService.telemetry.upsertConfig({
          deviceId: deviceName,
          userId: userName,
          topicPrefix: (body.topicPrefix as string) ?? `minis/${userName}/${deviceName}`,
          heartbeatIntervalSec: (body.heartbeatIntervalSec as number) ?? 60,
          capabilities: (body.capabilities as any[]) ?? [],
          entities: (body.entities as any[]) ?? [],
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        const config = this.iotService.telemetry.getConfig(deviceName);
        this.sendJsonResponse(res, 200, config);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Telemetry ---

  private async handleIotTelemetry(req: IncomingMessage, res: ServerResponse, method: string, _userName: string, deviceName: string, isLatest: boolean): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      return;
    }
    try {
      if (isLatest) {
        const record = this.iotService.telemetry.getLatest(deviceName);
        this.sendJsonResponse(res, 200, record ?? { message: 'No telemetry data' });
      } else {
        const url = new URL(req.url!, `http://localhost`);
        const from = parseInt(url.searchParams.get('from') ?? '0', 10);
        const to = parseInt(url.searchParams.get('to') ?? String(Date.now()), 10);
        const limit = parseInt(url.searchParams.get('limit') ?? '1000', 10);
        const records = this.iotService.telemetry.getHistory(deviceName, from, to, limit);
        this.sendJsonResponse(res, 200, { items: records });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Commands ---

  private async handleIotCommands(req: IncomingMessage, res: ServerResponse, method: string, _userName: string, deviceName: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET') {
        const url = new URL(req.url!, `http://localhost`);
        const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
        const commands = this.iotService.commands.listCommands(deviceName, limit);
        this.sendJsonResponse(res, 200, { items: commands });
      } else if (method === 'POST') {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        if (!body.name) {
          this.sendJsonResponse(res, 400, { error: 'Command name required' });
          return;
        }
        const command = this.iotService.sendCommand(deviceName, body.name as string, (body.payload as Record<string, unknown>) ?? {});
        this.sendJsonResponse(res, 201, command);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Alerts ---

  private async handleIotAlerts(req: IncomingMessage, res: ServerResponse, method: string, userName: string, alertId?: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET' && !alertId) {
        const url = new URL(req.url!, `http://localhost`);
        const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
        const alerts = this.iotService.alerts.listAlerts(userName, limit);
        this.sendJsonResponse(res, 200, { items: alerts });
      } else if (method === 'PATCH' && alertId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const status = body.status as string;
        let alert;
        if (status === 'ACKNOWLEDGED') {
          alert = this.iotService.alerts.acknowledgeAlert(alertId);
        } else if (status === 'RESOLVED') {
          alert = this.iotService.alerts.resolveAlert(alertId);
        } else {
          this.sendJsonResponse(res, 400, { error: 'Invalid status. Use ACKNOWLEDGED or RESOLVED' });
          return;
        }
        if (!alert) {
          this.sendJsonResponse(res, 404, { error: 'Alert not found' });
          return;
        }
        this.sendJsonResponse(res, 200, alert);
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Alert Rules ---

  private async handleIotAlertRules(req: IncomingMessage, res: ServerResponse, method: string, userName: string, ruleId?: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET' && !ruleId) {
        const rules = this.iotService.alerts.listRules(userName);
        this.sendJsonResponse(res, 200, { items: rules });
      } else if (method === 'POST' && !ruleId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        if (!body.name || !body.metricKey || !body.conditionOp || body.conditionValue === undefined) {
          this.sendJsonResponse(res, 400, { error: 'name, metricKey, conditionOp, conditionValue required' });
          return;
        }
        const rule = this.iotService.alerts.createRule({
          userId: userName,
          deviceId: body.deviceId as string | undefined,
          metricKey: body.metricKey as string,
          conditionOp: body.conditionOp as any,
          conditionValue: body.conditionValue as number,
          severity: (body.severity as any) ?? 'INFO',
          cooldownMinutes: (body.cooldownMinutes as number) ?? 15,
          isActive: body.isActive !== false,
          name: body.name as string,
          notificationChannelIds: (body.notificationChannelIds as string[]) ?? [],
        });
        this.sendJsonResponse(res, 201, rule);
      } else if (method === 'PUT' && ruleId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const rule = this.iotService.alerts.updateRule(ruleId, body as any);
        if (!rule) {
          this.sendJsonResponse(res, 404, { error: 'Alert rule not found' });
          return;
        }
        this.sendJsonResponse(res, 200, rule);
      } else if (method === 'DELETE' && ruleId) {
        const deleted = this.iotService.alerts.deleteRule(ruleId);
        if (!deleted) {
          this.sendJsonResponse(res, 404, { error: 'Alert rule not found' });
          return;
        }
        this.sendJsonResponse(res, 200, { success: true });
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- IoT Devices List (with status) ---

  private async handleIotDevicesList(_req: IncomingMessage, res: ServerResponse, method: string, _userName: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      return;
    }
    try {
      const statuses = this.iotService.presence.getAllStatuses();
      const result: Array<{ deviceId: string; status: string; lastSeenAt: number }> = [];
      for (const [deviceId, info] of statuses) {
        result.push({ deviceId, status: info.status, lastSeenAt: info.lastSeenAt });
      }
      this.sendJsonResponse(res, 200, { items: result });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Device Shares ---

  private async handleDeviceShares(req: IncomingMessage, res: ServerResponse, method: string, userName: string, deviceName: string, shareId?: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    try {
      if (method === 'GET' && !shareId) {
        const shares = this.iotService.shares.getSharesForDevice(deviceName);
        this.sendJsonResponse(res, 200, { items: shares });
      } else if (method === 'POST' && !shareId) {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        if (!body.targetUserId) {
          this.sendJsonResponse(res, 400, { error: 'targetUserId required' });
          return;
        }
        const share = this.iotService.shares.create(userName, deviceName, body.targetUserId as string);
        this.sendJsonResponse(res, 201, share);
      } else if (method === 'DELETE' && shareId) {
        const deleted = this.iotService.shares.delete(shareId);
        if (!deleted) {
          this.sendJsonResponse(res, 404, { error: 'Share not found' });
          return;
        }
        this.sendJsonResponse(res, 200, { success: true });
      } else {
        this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      }
    } catch (err) {
      const msg = this.errorMessage(err);
      if (msg.includes('UNIQUE constraint')) {
        this.sendJsonResponse(res, 409, { error: 'Share already exists' });
      } else {
        this.sendJsonResponse(res, 500, { error: msg });
      }
    }
  }

  private async handleSharedDevices(_req: IncomingMessage, res: ServerResponse, method: string, userName: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      return;
    }
    try {
      const shares = this.iotService.shares.getSharesForTarget(userName);
      this.sendJsonResponse(res, 200, { items: shares });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  private async handleMyShares(_req: IncomingMessage, res: ServerResponse, method: string, userName: string): Promise<void> {
    if (!this.iotService) {
      this.sendJsonResponse(res, 503, { error: 'IoT service not available' });
      return;
    }
    if (method !== 'GET') {
      this.sendJsonResponse(res, 405, { error: `Method ${method} not allowed` });
      return;
    }
    try {
      const shares = this.iotService.shares.getSharesByOwner(userName);
      this.sendJsonResponse(res, 200, { items: shares });
    } catch (err) {
      this.sendJsonResponse(res, 500, { error: this.errorMessage(err) });
    }
  }

  // --- Helpers ---

  private async readJsonFile(filePath: string): Promise<unknown> {
    try {
      const fileData = await this.fileSystem.readFile(filePath);
      return JSON.parse(fileData.content);
    } catch {
      return {};
    }
  }

  private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await this.fileSystem.writeFile(filePath, content);
  }

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;
      // 200 MB — covers phone videos (typically 30–150 MB after recording) once
      // the Drive UI base64-wraps them (33% overhead → ~150 MB max real file).
      // The previous 5 MB cap silently rejected every video upload from the
      // Android WebView.
      const MAX_BODY_SIZE = 200 * 1024 * 1024;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          reject(new Error(`Request body too large (max ${MAX_BODY_SIZE / 1024 / 1024}MB)`));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });

      req.on('error', reject);
    });
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Internal server error';
  }

  private runDocsGenerate(): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
    // Monorepo root: two levels up from cwd (app/mycastle-backend → monorepo root).
    // Falls back to REPO_ROOT env var for non-standard setups.
    const repoRoot = process.env.REPO_ROOT ?? path.resolve(process.cwd(), '..', '..');
    const docsJson = path.join(repoRoot, 'docs-site', 'docs.json');
    // In dev: Vite serves from public/; in prod: from the built static dir.
    const publicDocsJson = path.join(repoRoot, 'app', 'mycastle-web', 'public', 'docs.json');

    return new Promise((resolve) => {
      const start = Date.now();
      const stdout: string[] = [];
      const stderr: string[] = [];

      const proc = spawn('pnpm', ['gendocs'], { cwd: repoRoot, shell: true });

      proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk.toString()));
      proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));

      proc.on('close', (code) => {
        const exitCode = code ?? 1;
        if (exitCode === 0 && fs.existsSync(docsJson)) {
          try {
            fs.copyFileSync(docsJson, publicDocsJson);
          } catch {
            stderr.push('\nWarning: could not copy docs.json to public/\n');
          }
          // Also copy to STATIC_DIR if running in production
          if (this.ownStaticDir) {
            try {
              fs.copyFileSync(docsJson, path.join(this.ownStaticDir, 'docs.json'));
            } catch { /* non-fatal */ }
          }
        }
        resolve({ stdout: stdout.join(''), stderr: stderr.join(''), exitCode, duration: Date.now() - start });
      });

      proc.on('error', (err) => {
        resolve({ stdout: '', stderr: err.message, exitCode: 1, duration: Date.now() - start });
      });
    });
  }

  private async runScreenshotsGenerate(
    screenshotUser?: string,
    screenshotPass?: string,
    screenshotBase?: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number; duration: number }> {
    const repoRoot = process.env.REPO_ROOT ?? path.resolve(process.cwd(), '..', '..');
    const screenshotsDir = path.join(repoRoot, 'app', 'mycastle-web', 'public', 'screenshots');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...(screenshotUser ? { SCREENSHOT_USER: screenshotUser } : {}),
      ...(screenshotPass ? { SCREENSHOT_PASS: screenshotPass } : {}),
      ...(screenshotBase ? { SCREENSHOT_BASE: screenshotBase } : {}),
    };

    const start = Date.now();
    const allStdout: string[] = [];
    const allStderr: string[] = [];

    // Step 1: run Playwright
    const playwrightExitCode = await new Promise<number>((resolve) => {
      const proc = spawn(
        'npx',
        ['playwright', 'test', 'tests/screenshots/take-screenshots.ts', '--config', 'tests/screenshots/playwright.config.ts'],
        { cwd: repoRoot, shell: true, env },
      );
      proc.stdout.on('data', (chunk: Buffer) => allStdout.push(chunk.toString()));
      proc.stderr.on('data', (chunk: Buffer) => allStderr.push(chunk.toString()));
      proc.on('close', (code) => resolve(code ?? 1));
      proc.on('error', (err) => { allStderr.push(err.message); resolve(1); });
    });

    if (playwrightExitCode !== 0) {
      return { stdout: allStdout.join(''), stderr: allStderr.join(''), exitCode: playwrightExitCode, duration: Date.now() - start };
    }

    // Step 2: AI analysis — for each PNG generate callout annotations
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      allStderr.push('\nANTHROPIC_API_KEY not set — skipping AI callout generation.\n');
      return { stdout: allStdout.join(''), stderr: allStderr.join(''), exitCode: 0, duration: Date.now() - start };
    }

    allStdout.push('\nAnalyzing screenshots with Claude Vision…\n');

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });

    const pngFiles = fs.readdirSync(screenshotsDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    const docs: Array<{
      file: string;
      title: string;
      section: string;
      description: string;
      callouts: Array<{ n: number; x: number; y: number; label: string; description: string }>;
    }> = [];

    for (const png of pngFiles) {
      const file = png.replace(/\.png$/, '');
      allStdout.push(`  analyzing ${file}…\n`);

      try {
        const imgBuffer = fs.readFileSync(path.join(screenshotsDir, png));
        const base64 = imgBuffer.toString('base64');

        // Read the companion .md for context if it exists
        let mdContext = '';
        const mdPath = path.join(screenshotsDir, `${file}.md`);
        if (fs.existsSync(mdPath)) mdContext = fs.readFileSync(mdPath, 'utf8');

        const response = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64 },
              },
              {
                type: 'text',
                text: `You are documenting a web application UI. Analyze this screenshot and identify the most important UI elements (buttons, panels, tables, inputs, navigation, etc.).

${mdContext ? `Context from existing description:\n${mdContext}\n` : ''}

Return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "title": "short page title",
  "section": "one of: Auth | Admin | Electronics | IoT | PIM | Server | Tools | User",
  "description": "one sentence describing this page",
  "callouts": [
    { "n": 1, "x": 50, "y": 10, "label": "Element name", "description": "What this element does" }
  ]
}

Rules:
- x and y are percentages (0-100) from top-left corner of the screenshot
- identify 3-6 key elements
- be specific about positions (look at actual pixel positions in the image)
- labels are short (2-4 words), descriptions are 1-2 sentences`,
              },
            ],
          }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { title: string; section: string; description: string; callouts: Array<{ n: number; x: number; y: number; label: string; description: string }> };
          docs.push({ file, ...parsed });
          allStdout.push(`    ✓ ${parsed.callouts.length} callouts\n`);
        } else {
          allStderr.push(`    ✗ ${file}: no JSON in response\n`);
        }
      } catch (err) {
        allStderr.push(`    ✗ ${file}: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }

    // Step 3: save docs.json
    if (docs.length > 0) {
      const docsJson = { generatedAt: new Date().toISOString(), entries: docs };
      const docsPath = path.join(screenshotsDir, 'docs.json');
      fs.writeFileSync(docsPath, JSON.stringify(docsJson, null, 2), 'utf8');
      allStdout.push(`\nSaved docs.json with ${docs.length} entries.\n`);
    }

    return { stdout: allStdout.join(''), stderr: allStderr.join(''), exitCode: 0, duration: Date.now() - start };
  }

  // --- GitHub Import ---

  /**
   * Resolves the relative path within a sketch directory for a file from a repo.
   * Finds the longest common directory prefix across all sketch files, strips it,
   * then prepends sketchName — works for both uPython (src/{id}/src/{name}/{file})
   * and PicoSdk (src/{id}/CMakeLists.txt, src/{id}/src/main.c) layouts.
   */
  private resolveSketchRel(sketchName: string, files: string[], filePath: string): string {
    if (files.length === 0) return `${sketchName}/${filePath}`;
    const split = (p: string) => p.split('/');
    const allParts = files.map(split);
    const minDepth = Math.min(...allParts.map(p => p.length - 1)); // directory depth (exclude filename)
    let common = 0;
    for (let i = 0; i < minDepth; i++) {
      const seg = allParts[0][i];
      if (allParts.every(p => p[i] === seg)) common++;
      else break;
    }
    const rel = split(filePath).slice(common).join('/');
    return `${sketchName}/${rel}`;
  }

  /** Recursively lists all files in a directory, returning paths relative to rootDir. */
  private async listFilesRecursive(dir: string, prefix: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...await this.listFilesRecursive(path.join(dir, entry.name), rel));
      } else {
        results.push(rel);
      }
    }
    return results;
  }

  private githubRawBase(repoUrl: string): string | null {
    const m = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/|$)/);
    if (!m) return null;
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main`;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r.json();
  }

  private async fetchText(url: string): Promise<string> {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r.text();
  }

  private async handleProjectCloneFromGithub(
    req: IncomingMessage, res: ServerResponse, userName: string, projectName: string,
  ): Promise<void> {
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }

    const body = await this.parseRequestBody(req) as {
      githubRepoUrl?: string;
      sketches?: Array<{ name: string; files: string[] }>;
      readmePath?: string | null;
      libraries?: Array<{ url?: string; remoteName?: string; name?: string }>;
      projectScriptPath?: string | null;
    };
    const { githubRepoUrl, sketches, readmePath, libraries, projectScriptPath } = body;
    if (!githubRepoUrl) {
      this.sendJsonResponse(res, 400, { error: 'githubRepoUrl is required' });
      return;
    }

    const rawBase = this.githubRawBase(githubRepoUrl);
    if (!rawBase) { this.sendJsonResponse(res, 400, { error: 'Invalid GitHub URL' }); return; }

    const projectDir = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId);

    try {
      // Download sketch files → sketches/{sketchName}/{relativeFile}
      for (const sketch of sketches ?? []) {
        for (const filePath of sketch.files) {
          const rel = this.resolveSketchRel(sketch.name, sketch.files, filePath);
          if (!rel || rel.includes('..')) continue;
          const content = await this.fetchText(`${rawBase}/${filePath}`);
          const dest = path.join(projectDir, 'sketches', rel);
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await fs.promises.writeFile(dest, content, 'utf-8');
        }
      }

      // Download README
      if (readmePath) {
        const content = await this.fetchText(`${rawBase}/${readmePath}`);
        const dest = path.join(projectDir, 'README.md');
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, content, 'utf-8');
      }

      // Download project.js (optional — ignore if not found)
      if (projectScriptPath) {
        try {
          const content = await this.fetchText(`${rawBase}/${projectScriptPath}`);
          const dest = path.join(projectDir, 'project.js');
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await fs.promises.writeFile(dest, content, 'utf-8');
        } catch { /* not required */ }
      }

      // Save libraries to Project.json
      if (libraries && libraries.length > 0) {
        const data = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as Record<string, unknown>;
        const projects = (Array.isArray(data.projects) ? data.projects : []) as Array<Record<string, unknown>>;
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (project) {
          project.libraries = libraries;
          await this.writeJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`, data);
        }
      }

      // Ensure project.json exists in the project directory so VFS workspace can detect it
      const registryData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as Record<string, unknown>;
      const registryProjects = (Array.isArray(registryData.projects) ? registryData.projects : []) as Array<Record<string, unknown>>;
      const registryProject = registryProjects.find(p => p.name === projectName || p.id === projectName);
      if (registryProject) {
        const platform = (typeof registryProject.softwarePlatform === 'string' ? registryProject.softwarePlatform : null) ?? 'Arduino';
        const pjPath = path.join(projectDir, 'project.json');
        // Only write if not already present
        const alreadyExists = await fs.promises.access(pjPath).then(() => true).catch(() => false);
        if (!alreadyExists) {
          const projectJson = {
            id: registryProject.name ?? projectName,
            name: registryProject.name ?? projectName,
            platform,
            ...(registryProject.boardProfileKey ? { boardProfileKey: registryProject.boardProfileKey } : {}),
          };
          await fs.promises.mkdir(projectDir, { recursive: true });
          await fs.promises.writeFile(pjPath, JSON.stringify(projectJson, null, 2), 'utf-8');
        }
      }

      this.sendJsonResponse(res, 200, { ok: true });
    } catch (err) {
      this.sendJsonResponse(res, 502, { error: `Clone failed: ${this.errorMessage(err)}` });
    }
  }

  private async handleProjectScript(res: ServerResponse, userName: string, projectName: string): Promise<void> {
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }

    const scriptPath = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId, 'project.js');
    try {
      const content = await fs.promises.readFile(scriptPath, 'utf-8');
      this.sendJsonResponse(res, 200, { content });
    } catch {
      this.sendJsonResponse(res, 404, { error: 'project.js not found' });
    }
  }

  private async handleSaveProjectScript(res: ServerResponse, req: IncomingMessage, userName: string, projectName: string): Promise<void> {
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }

    const body = await this.parseRequestBody(req) as { content?: string };
    if (typeof body.content !== 'string') { this.sendJsonResponse(res, 400, { error: 'content is required' }); return; }

    const scriptPath = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId, 'project.js');
    await fs.promises.writeFile(scriptPath, body.content, 'utf-8');
    this.sendJsonResponse(res, 200, { ok: true });
  }

  private async handleProjectSyncFromGithub(res: ServerResponse, userName: string, projectName: string): Promise<void> {
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }

    try {
      const data = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as Record<string, unknown>;
      const projects = (Array.isArray(data.projects) ? data.projects : []) as Array<Record<string, unknown>>;
      const project = projects.find(p => p.name === projectId || p.id === projectId);
      if (!project) { this.sendJsonResponse(res, 404, { error: 'Project not found in Project.json' }); return; }

      const githubRepoUrl = project.githubRepoUrl as string | undefined;
      const githubProjectId = project.githubProjectId as string | undefined;
      if (!githubRepoUrl || !githubProjectId) {
        this.sendJsonResponse(res, 400, { error: 'Project has no githubRepoUrl or githubProjectId' });
        return;
      }

      const rawBase = this.githubRawBase(githubRepoUrl);
      if (!rawBase) { this.sendJsonResponse(res, 400, { error: 'Invalid GitHub URL' }); return; }

      // Fetch current index.json from GitHub to get latest sketches + readmePath
      const index = await this.fetchJson(`${rawBase}/index.json`) as { projects?: Array<Record<string, unknown>> };
      const entry = (index.projects ?? []).find(p => p.id === githubProjectId);
      if (!entry) { this.sendJsonResponse(res, 404, { error: `Project '${githubProjectId}' not found in GitHub index` }); return; }

      const sketches = (entry.sketches ?? []) as Array<{ name: string; files: string[] }>;
      const readmePath = (entry.readmePath ?? null) as string | null;
      const libraries = (entry.libraries ?? []) as Array<{ name?: string; version?: string; url?: string; remoteName?: string }>;
      const projectScriptPath = (entry.projectScriptPath ?? null) as string | null;

      const projectDir = path.resolve(this.rootDir!, 'Minis', 'Users', userName, 'Projects', projectId);

      for (const sketch of sketches) {
        for (const filePath of sketch.files) {
          const rel = this.resolveSketchRel(sketch.name, sketch.files, filePath);
          if (!rel || rel.includes('..')) continue;
          const content = await this.fetchText(`${rawBase}/${filePath}`);
          const dest = path.join(projectDir, 'sketches', rel);
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await fs.promises.writeFile(dest, content, 'utf-8');
        }
      }

      if (readmePath) {
        const content = await this.fetchText(`${rawBase}/${readmePath}`);
        const dest = path.join(projectDir, 'README.md');
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, content, 'utf-8');
      }

      // Sync project.js (optional — ignore if not found)
      if (projectScriptPath) {
        try {
          const content = await this.fetchText(`${rawBase}/${projectScriptPath}`);
          const dest = path.join(projectDir, 'project.js');
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await fs.promises.writeFile(dest, content, 'utf-8');
        } catch { /* not required */ }
      }

      // Update libraries in Project.json from index
      if (libraries.length > 0) {
        project.libraries = libraries;
        await this.writeJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`, data);
      }

      this.sendJsonResponse(res, 200, { ok: true, sketchCount: sketches.length, hasReadme: !!readmePath });
    } catch (err) {
      this.sendJsonResponse(res, 502, { error: `Sync failed: ${this.errorMessage(err)}` });
    }
  }

  private async handleProjectPushToGithub(req: IncomingMessage, res: ServerResponse, userName: string, projectId: string): Promise<void> {
    if (!this.rootDir) { this.sendJsonResponse(res, 503, { error: 'rootDir not configured' }); return; }

    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const token: string = (body.token as string | undefined) ?? process.env.GITHUB_TOKEN ?? '';
    if (!token) {
      this.sendJsonResponse(res, 400, { error: 'GitHub token required — set GITHUB_TOKEN env var or pass token in body' });
      return;
    }

    try {
      const data = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as Record<string, unknown>;
      const projects = (Array.isArray(data.projects) ? data.projects : []) as Array<Record<string, unknown>>;
      const project = projects.find(p => p.name === projectId || p.id === projectId);
      if (!project) { this.sendJsonResponse(res, 404, { error: 'Project not found' }); return; }

      const githubRepoUrl = project.githubRepoUrl as string | undefined;
      const githubProjectId = (project.githubProjectId as string | undefined) ?? projectId;
      if (!githubRepoUrl) {
        this.sendJsonResponse(res, 400, { error: 'Project has no githubRepoUrl' });
        return;
      }

      const m = githubRepoUrl.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/|$)/);
      if (!m) { this.sendJsonResponse(res, 400, { error: 'Invalid GitHub URL' }); return; }
      const [, owner, repo] = m;
      const branch = (body.branch as string | undefined) ?? 'main';
      const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'MyCastle/1.0',
      };

      // Collect all local sketch files
      const sketchesDir = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'sketches');
      const treeItems: Array<{ path: string; mode: string; type: string; content: string }> = [];

      let sketchDirs: string[] = [];
      try { sketchDirs = await fs.promises.readdir(sketchesDir); } catch { /* no sketches */ }

      for (const sketchName of sketchDirs) {
        const sketchDir = path.join(sketchesDir, sketchName);
        const stat = await fs.promises.stat(sketchDir).catch(() => null);
        if (!stat?.isDirectory()) continue;
        const files = await fs.promises.readdir(sketchDir).catch(() => [] as string[]);
        for (const fileName of files) {
          const content = await fs.promises.readFile(path.join(sketchDir, fileName), 'utf-8').catch(() => null);
          if (content === null) continue;
          treeItems.push({
            path: `src/${githubProjectId}/sketches/${sketchName}/${fileName}`,
            mode: '100644',
            type: 'blob',
            content,
          });
        }
      }

      // Also push README if present
      const readmePath = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'README.md');
      const readmeContent = await fs.promises.readFile(readmePath, 'utf-8').catch(() => null);
      const githubReadmePath = (project.githubReadmePath as string | undefined) ?? `src/${githubProjectId}/README.md`;
      if (readmeContent !== null) {
        treeItems.push({ path: githubReadmePath, mode: '100644', type: 'blob', content: readmeContent });
      }

      if (treeItems.length === 0) {
        this.sendJsonResponse(res, 400, { error: 'No files to push' });
        return;
      }

      // Get current HEAD
      const refRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers });
      if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status} ${await refRes.text()}`);
      const refData = await refRes.json() as { object: { sha: string } };
      const headSha = refData.object.sha;

      // Get commit's tree SHA
      const commitRes = await fetch(`${apiBase}/git/commits/${headSha}`, { headers });
      if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
      const commitData = await commitRes.json() as { tree: { sha: string } };
      const baseSha = commitData.tree.sha;

      // Create new tree
      const newTreeRes = await fetch(`${apiBase}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseSha, tree: treeItems }),
      });
      if (!newTreeRes.ok) throw new Error(`Failed to create tree: ${newTreeRes.status} ${await newTreeRes.text()}`);
      const newTree = await newTreeRes.json() as { sha: string };

      // Create commit
      const newCommitRes = await fetch(`${apiBase}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: `chore: push ${project.name ?? projectId} from MyCastle`,
          tree: newTree.sha,
          parents: [headSha],
        }),
      });
      if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status} ${await newCommitRes.text()}`);
      const newCommit = await newCommitRes.json() as { sha: string; html_url?: string };

      // Update branch ref
      const updateRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommit.sha }),
      });
      if (!updateRes.ok) throw new Error(`Failed to update ref: ${updateRes.status} ${await updateRes.text()}`);

      this.sendJsonResponse(res, 200, { ok: true, commitSha: newCommit.sha, fileCount: treeItems.length });
    } catch (err) {
      this.sendJsonResponse(res, 502, { error: `Push failed: ${this.errorMessage(err)}` });
    }
  }

  private async handleGithubProjectdefs(req: IncomingMessage, res: ServerResponse, method: string, apiPath: string): Promise<void> {
    // GET /admin/github-projectdefs?url=...  → fetch index.json and return projects + modules
    if (method === 'GET' && apiPath === '/admin/github-projectdefs') {
      const reqUrl = new URL(`http://dummy${req.url}`);
      const repoUrl = reqUrl.searchParams.get('url');
      if (!repoUrl) { this.sendJsonResponse(res, 400, { error: 'url parameter required' }); return; }
      const rawBase = this.githubRawBase(repoUrl);
      if (!rawBase) { this.sendJsonResponse(res, 400, { error: 'Invalid GitHub URL' }); return; }
      try {
        const [index, modulesData] = await Promise.all([
          this.fetchJson(`${rawBase}/index.json`) as Promise<Record<string, unknown>>,
          this.fetchJson(`${rawBase}/modules.json`).catch(() => ({ modules: [] })) as Promise<Record<string, unknown>>,
        ]);
        const modules = (modulesData as Record<string, unknown>).modules ?? [];
        this.sendJsonResponse(res, 200, { ...index, modules, rawBase });
      } catch (err) {
        this.sendJsonResponse(res, 502, { error: `Failed to fetch index: ${this.errorMessage(err)}` });
      }
      return;
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }

  private buildWeatherSvg(w: number, h: number, p: {
    locationName: string;
    temp: number;
    feelsLike: number;
    humidity: number;
    windspeed: number;
    code: number;
    daily: Array<{ date: string; max: number; min: number; code: number }>;
  }): Buffer {
    const e = (v: string | number) => String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const sc = Math.min(w / 800, h / 480);
    const cx = w / 2;

    const wmoDesc = (c: number): string => {
      if (c === 0) return 'Clear sky';
      if (c === 1) return 'Mainly clear';
      if (c === 2) return 'Partly cloudy';
      if (c === 3) return 'Overcast';
      if (c <= 48) return 'Foggy';
      if (c <= 55) return 'Drizzle';
      if (c <= 65) return 'Rain';
      if (c <= 77) return 'Snow';
      if (c <= 82) return 'Showers';
      if (c <= 99) return 'Thunderstorm';
      return '';
    };

    // BMP-plane Unicode symbols supported by most monospace/sans-serif fonts
    const wmoIcon = (c: number): string => {
      if (c === 0) return '\u2600';   // ☀
      if (c <= 2)  return '\u26C5';   // ⛅
      if (c <= 3)  return '\u2601';   // ☁
      if (c <= 48) return '\u2248';   // ≈ (fog approximation)
      if (c <= 65) return '\u2614';   // ☔
      if (c <= 77) return '\u2744';   // ❄
      if (c <= 82) return '\u2614';   // ☔
      if (c <= 99) return '\u26A1';   // ⚡
      return '?';
    };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const divY = Math.round(h * 0.72);
    const fH = h - divY;

    const forecastSvg = p.daily.slice(0, 4).map((d, i) => {
      const fx = Math.round(w * (i + 0.5) / 4);
      const dayName = dayNames[new Date(d.date + 'T00:00:00Z').getUTCDay()];
      return `
      <text x="${fx}" y="${divY + Math.round(fH * 0.32)}" text-anchor="middle"
            fill="#64a0dc" font-size="${Math.round(19 * sc)}" font-weight="bold"
            font-family="'DejaVu Sans Mono',monospace">${e(dayName)}</text>
      <text x="${fx}" y="${divY + Math.round(fH * 0.60)}" text-anchor="middle"
            fill="#c8c8e0" font-size="${Math.round(20 * sc)}"
            font-family="'DejaVu Sans',sans-serif">${e(wmoIcon(d.code))}</text>
      <text x="${fx}" y="${divY + Math.round(fH * 0.90)}" text-anchor="middle"
            fill="#e6e6f5" font-size="${Math.round(17 * sc)}"
            font-family="'DejaVu Sans Mono',monospace">${e(Math.round(d.max))}/${e(Math.round(d.min))}°C</text>`;
    }).join('\n');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#12121c"/>
  <text x="${cx}" y="${Math.round(h * 0.115)}" text-anchor="middle"
        fill="#64a0dc" font-size="${Math.round(26 * sc)}" font-weight="bold"
        font-family="'DejaVu Sans Mono',monospace">${e(p.locationName.toUpperCase())}</text>
  <text x="${cx}" y="${Math.round(h * 0.50)}" text-anchor="middle"
        fill="#ffdc64" font-size="${Math.round(115 * sc)}" font-weight="bold"
        font-family="'DejaVu Sans Mono',monospace">${e(Math.round(p.temp))}°C</text>
  <text x="${cx}" y="${Math.round(h * 0.615)}" text-anchor="middle"
        fill="#8c8ca5" font-size="${Math.round(25 * sc)}"
        font-family="'DejaVu Sans',sans-serif">${e(wmoIcon(p.code))} ${e(wmoDesc(p.code))}</text>
  <text x="${Math.round(w * 0.18)}" y="${Math.round(h * 0.695)}" text-anchor="middle"
        fill="#8c8ca5" font-size="${Math.round(19 * sc)}"
        font-family="'DejaVu Sans Mono',monospace">Feels ${e(Math.round(p.feelsLike))}°C</text>
  <text x="${cx}" y="${Math.round(h * 0.695)}" text-anchor="middle"
        fill="#8c8ca5" font-size="${Math.round(19 * sc)}"
        font-family="'DejaVu Sans Mono',monospace">Wind ${e(Math.round(p.windspeed))} km/h</text>
  <text x="${Math.round(w * 0.82)}" y="${Math.round(h * 0.695)}" text-anchor="middle"
        fill="#8c8ca5" font-size="${Math.round(19 * sc)}"
        font-family="'DejaVu Sans Mono',monospace">Hum ${e(p.humidity)}%</text>
  <line x1="0" y1="${divY}" x2="${w}" y2="${divY}" stroke="#3a3a5a" stroke-width="1"/>
  ${forecastSvg}
</svg>`;

    return Buffer.from(svg, 'utf-8');
  }

  private async handleWebFetch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseRequestBody(req) as Record<string, unknown>;
    const url = body.url as string | undefined;

    if (!url || typeof url !== 'string') {
      this.sendJsonResponse(res, 400, { error: 'url is required' });
      return;
    }

    // Only allow http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this.sendJsonResponse(res, 400, { error: 'Only http and https URLs are allowed' });
      return;
    }

    try {
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; MyCastle-Agent/1.0)',
      };
      // For GitHub API/raw content, add token if available (avoids rate-limiting / 401 on public repos)
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken && (url.includes('api.github.com') || url.includes('raw.githubusercontent.com') || url.includes('github.com'))) {
        fetchHeaders['Authorization'] = `Bearer ${githubToken}`;
      }

      const response = await fetch(url, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(15_000),
      });

      const contentType = response.headers.get('content-type') ?? '';
      const rawText = await response.text();

      let text: string;
      let title: string | undefined;

      if (contentType.includes('text/html')) {
        // Extract title
        const titleMatch = rawText.match(/<title[^>]*>([^<]*)<\/title>/i);
        title = titleMatch?.[1]?.trim();

        // Strip HTML: remove scripts, styles, tags, collapse whitespace
        text = rawText
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s{2,}/g, ' ')
          .trim();
      } else {
        text = rawText;
      }

      // Truncate to 50KB
      const MAX = 50_000;
      const truncated = text.length > MAX;
      if (truncated) text = text.slice(0, MAX);

      this.sendJsonResponse(res, 200, { url, text, title, statusCode: response.status, truncated });
    } catch (err) {
      this.sendJsonResponse(res, 502, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async handleUserPublicFile(res: ServerResponse, userName: string, filePath: string): Promise<void> {
    const MIME_TYPES: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
      '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm', '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.zip': 'application/zip',
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown',
    };

    // Validate userName
    if (!MycastleHttpServer.NAME_PATTERN.test(userName)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid user name' }));
      return;
    }

    // Security: normalize and block path traversal
    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    if (normalized.startsWith('..') || normalized.includes('/../')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }

    const fsPath = `${MINIS_ROOT}/Users/${userName}/public/${normalized}`;

    try {
      const fileData = await this.fileSystem.readBinaryFile(fsPath);
      const ext = path.extname(normalized).toLowerCase();
      const mimeType = MIME_TYPES[ext] || fileData.mimeType || 'application/octet-stream';
      const buffer = Buffer.from(fileData.data, 'base64');

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      res.writeHead(200);
      res.end(buffer);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
    }
  }

  // ---------------------------------------------------------------------------
  // Retention policy
  // ---------------------------------------------------------------------------

  private async handleIotRetention(req: IncomingMessage, res: ServerResponse, method: string, userName: string, deviceName?: string): Promise<void> {
    if (!this.iotService) { this.sendJsonResponse(res, 503, { error: 'IoT service unavailable' }); return; }

    if (method === 'GET') {
      const policies = this.iotService.retention.listForUser(userName);
      const effective = deviceName ? this.iotService.retention.getEffective(userName, deviceName) : null;
      this.sendJsonResponse(res, 200, { policies, effective });
      return;
    }

    if (method === 'PUT') {
      const body = await this.parseRequestBody(req) as { retentionDays: number };
      if (!body.retentionDays || body.retentionDays < 1) {
        this.sendJsonResponse(res, 400, { error: 'retentionDays must be >= 1' });
        return;
      }
      this.iotService.retention.set({ userId: userName, deviceId: deviceName, retentionDays: body.retentionDays, updatedAt: Date.now() });
      this.sendJsonResponse(res, 200, { ok: true });
      return;
    }

    if (method === 'DELETE') {
      this.iotService.retention.delete(userName, deviceName);
      this.sendJsonResponse(res, 200, { ok: true });
      return;
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // ---------------------------------------------------------------------------
  // Device twin
  // ---------------------------------------------------------------------------

  private async handleDeviceTwin(req: IncomingMessage, res: ServerResponse, method: string, _userName: string, deviceName: string): Promise<void> {
    if (!this.iotService) { this.sendJsonResponse(res, 503, { error: 'IoT service unavailable' }); return; }

    if (method === 'GET') {
      const twin = this.iotService.twin.get(deviceName);
      if (!twin) { this.sendJsonResponse(res, 200, { deviceId: deviceName, desired: {}, reported: {}, delta: {}, desiredUpdatedAt: 0, reportedUpdatedAt: 0 }); return; }
      const delta = this.iotService.twin.getDelta(twin);
      this.sendJsonResponse(res, 200, { ...twin, delta });
      return;
    }

    if (method === 'PUT') {
      const body = await this.parseRequestBody(req) as { desired?: Record<string, unknown> };
      if (!body.desired || typeof body.desired !== 'object') {
        this.sendJsonResponse(res, 400, { error: 'desired object required' });
        return;
      }
      const config = this.iotService.telemetry.getConfig(deviceName);
      const twin = this.iotService.twin.patchDesired(deviceName, config?.userId ?? _userName, body.desired);

      // Push desired state to device via MQTT
      if (config) {
        this.iotService.publish(
          `${config.topicPrefix}/twin/desired`,
          JSON.stringify(twin.desired),
        );
      }

      const delta = this.iotService.twin.getDelta(twin);
      this.sendJsonResponse(res, 200, { ...twin, delta });
      return;
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // ---------------------------------------------------------------------------
  // Notification channels
  // ---------------------------------------------------------------------------

  private async handleNotificationChannels(req: IncomingMessage, res: ServerResponse, method: string, userName: string, channelId?: string): Promise<void> {
    if (!this.iotService) { this.sendJsonResponse(res, 503, { error: 'IoT service unavailable' }); return; }

    if (!channelId) {
      if (method === 'GET') {
        this.sendJsonResponse(res, 200, this.iotService.notificationChannels.listForUser(userName));
        return;
      }
      if (method === 'POST') {
        const body = await this.parseRequestBody(req) as { name?: string; webhookUrl?: string; secret?: string };
        if (!body.name || !body.webhookUrl) {
          this.sendJsonResponse(res, 400, { error: 'name and webhookUrl required' });
          return;
        }
        const channel = this.iotService.notificationChannels.create(userName, body);
        this.sendJsonResponse(res, 201, channel);
        return;
      }
    } else {
      if (method === 'GET') {
        const channel = this.iotService.notificationChannels.get(channelId);
        if (!channel) { this.sendJsonResponse(res, 404, { error: 'Not found' }); return; }
        this.sendJsonResponse(res, 200, channel);
        return;
      }
      if (method === 'PUT') {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const updated = this.iotService.notificationChannels.update(channelId, body as any);
        if (!updated) { this.sendJsonResponse(res, 404, { error: 'Not found' }); return; }
        this.sendJsonResponse(res, 200, updated);
        return;
      }
      if (method === 'DELETE') {
        const ok = this.iotService.notificationChannels.delete(channelId);
        this.sendJsonResponse(res, ok ? 200 : 404, { ok });
        return;
      }
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // ---------------------------------------------------------------------------
  // IoT automations
  // ---------------------------------------------------------------------------

  private async handleIotAutomations(req: IncomingMessage, res: ServerResponse, method: string, userName: string, automationId?: string): Promise<void> {
    if (!this.iotService) { this.sendJsonResponse(res, 503, { error: 'IoT service unavailable' }); return; }

    if (!automationId) {
      if (method === 'GET') {
        this.sendJsonResponse(res, 200, this.iotService.automations.listForUser(userName));
        return;
      }
      if (method === 'POST') {
        const body = await this.parseRequestBody(req) as { name?: string; trigger?: unknown; actions?: unknown[]; enabled?: boolean };
        if (!body.name || !body.trigger) {
          this.sendJsonResponse(res, 400, { error: 'name and trigger required' });
          return;
        }
        const auto = this.iotService.automations.create(userName, {
          name: body.name,
          trigger: body.trigger as any,
          actions: (body.actions ?? []) as any,
          enabled: body.enabled,
        });
        // Schedule cron if needed
        this.iotService.automationRunner.syncCronForUser(userName);
        this.sendJsonResponse(res, 201, auto);
        return;
      }
    } else {
      if (method === 'GET') {
        const auto = this.iotService.automations.get(automationId);
        if (!auto) { this.sendJsonResponse(res, 404, { error: 'Not found' }); return; }
        this.sendJsonResponse(res, 200, auto);
        return;
      }
      if (method === 'PUT') {
        const body = await this.parseRequestBody(req) as Record<string, unknown>;
        const updated = this.iotService.automations.update(automationId, body as any);
        if (!updated) { this.sendJsonResponse(res, 404, { error: 'Not found' }); return; }
        this.iotService.automationRunner.syncCronForUser(userName);
        this.sendJsonResponse(res, 200, updated);
        return;
      }
      if (method === 'DELETE') {
        const ok = this.iotService.automations.delete(automationId);
        this.iotService.automationRunner.syncCronForUser(userName);
        this.sendJsonResponse(res, ok ? 200 : 404, { ok });
        return;
      }
    }

    this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
  }
}
