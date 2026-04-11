import { HttpUploadServer, FileSystem, JwtService, PasswordService, ApiKeyService, checkAuth } from '@mhersztowski/core-backend';
import sharp from 'sharp';
import type { IncomingMessage, ServerResponse } from 'http';
import type { AuthTokenPayload, WriteFileOptions, DeleteOptions, RenameOptions, CopyOptions } from '@mhersztowski/core';
import { CompositeFS, NodeFS, VfsError } from '@mhersztowski/core';
import { buildSwaggerSpec } from './swagger.js';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import type { IotService } from './modules/iot/IotService.js';
import type { TerminalService } from './modules/terminal/TerminalService.js';
import { RpcRouter, registerHandlers } from './modules/rpc/index.js';
import type { ArduinoService } from './modules/arduino/index.js';
import type { MinisConfig } from './modules/arduino/ArduinoCli.js';
import type { MicroPythonService } from './modules/upython/index.js';
import type { PygameService } from './modules/pygame/index.js';
import { ScriptsService } from '@mhersztowski/core-backend';

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
  private rootDir: string | null;
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

  constructor(port: number, fileSystem: FileSystem, jwtService: JwtService, apiKeyService: ApiKeyService, iotService?: IotService, staticDir?: string, rootDir?: string, arduinoService?: ArduinoService, upythonService?: MicroPythonService, pygameService?: PygameService) {
    super(port, fileSystem, undefined, undefined, undefined, staticDir);
    this.jwtService = jwtService;
    this.apiKeyService = apiKeyService;
    this.iotService = iotService ?? null;
    this.arduinoService = arduinoService ?? null;
    this.upythonService = upythonService ?? null;
    this.pygameService = pygameService ?? null;
    this.rootDir = rootDir ? path.resolve(rootDir) : null;
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

    await super.handleRequest(req, res);
  }

  private async handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const fullApiPath = req.url!.replace(/^\/api/, '');
    const apiPath = fullApiPath.split('?')[0];
    const method = req.method || 'GET';

    // --- Public endpoints (no auth required) ---

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
      const wProjectId = decodeURIComponent(pygameWebBuildMatchPublic[2]);
      const wSketchName = decodeURIComponent(pygameWebBuildMatchPublic[3]);
      const wFilePath = pygameWebBuildMatchPublic[4] ? decodeURIComponent(pygameWebBuildMatchPublic[4]) : 'index.html';
      await this.handlePygameWebBuildFile(res, wUserName, wProjectId, wSketchName, wFilePath);
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
        const resp = await fetch(`${body.immichUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: body.email, password: body.password }),
        });
        const data = await resp.json();
        this.sendJsonResponse(res, resp.status, data);
      } catch (e) {
        this.sendJsonResponse(res, 502, { error: e instanceof Error ? e.message : 'Proxy error' });
      }
      return;
    }

    // GET /api/immich/albums?immichUrl=...&accessToken=...
    if (apiPath === '/immich/albums' && method === 'GET') {
      try {
        const p = new URL(req.url!, 'http://localhost').searchParams;
        const resp = await fetch(`${p.get('immichUrl')}/api/albums`, {
          headers: { Authorization: `Bearer ${p.get('accessToken')}` },
        });
        const data = await resp.json();
        this.sendJsonResponse(res, resp.status, data);
      } catch (e) {
        this.sendJsonResponse(res, 502, { error: e instanceof Error ? e.message : 'Proxy error' });
      }
      return;
    }

    // GET /api/immich/albums/:albumId?immichUrl=...&accessToken=...
    const albumMatch = apiPath.match(/^\/immich\/albums\/([^/]+)$/);
    if (albumMatch && method === 'GET') {
      try {
        const p = new URL(req.url!, 'http://localhost').searchParams;
        const resp = await fetch(`${p.get('immichUrl')}/api/albums/${albumMatch[1]}`, {
          headers: { Authorization: `Bearer ${p.get('accessToken')}` },
        });
        const data = await resp.json();
        this.sendJsonResponse(res, resp.status, data);
      } catch (e) {
        this.sendJsonResponse(res, 502, { error: e instanceof Error ? e.message : 'Proxy error' });
      }
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

    // --- Protected endpoints (auth required) ---

    const user = checkAuth(req, this.jwtService, this.apiKeyService);
    if (!user) {
      this.sendJsonResponse(res, 401, { error: 'Unauthorized' });
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

    // Arduino: compile (POST /api/users/{userName}/project-arduino/{projectName}/compile)
    const compileMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/compile$/);
    if (compileMatch && method === 'POST') {
      const userName = decodeURIComponent(compileMatch[1]);
      const projectName = decodeURIComponent(compileMatch[2]);
      await this.handleArduinoCompile(req, res, userName, projectName);
      return;
    }

    // Arduino: upload (POST /api/users/{userName}/project-arduino/{projectName}/upload)
    const uploadMatch = apiPath.match(/^\/users\/([^/]+)\/project-arduino\/([^/]+)\/upload$/);
    if (uploadMatch && method === 'POST') {
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
      const projectId = decodeURIComponent(sketchFilesMatch[2]);
      const sketchName = decodeURIComponent(sketchFilesMatch[3]);
      if (sketchName.includes('..')) { this.sendJsonResponse(res, 400, { error: 'Invalid path' }); return; }
      if (!this.rootDir) { this.sendJsonResponse(res, 503, { error: 'rootDir not configured' }); return; }
      const dir = path.resolve(this.rootDir, 'Minis', 'Users', userName, 'Projects', projectId, 'sketches', sketchName);
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
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        this.sendJsonResponse(res, 200, { items: entries.filter(e => e.isFile()).map(e => e.name).sort() });
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

    // uPython: deploy (POST /api/users/{userName}/project-upython/{projectName}/deploy)
    const upythonDeployMatch = apiPath.match(/^\/users\/([^/]+)\/project-upython\/([^/]+)\/deploy$/);
    if (upythonDeployMatch && method === 'POST') {
      const userName = decodeURIComponent(upythonDeployMatch[1]);
      const projectName = decodeURIComponent(upythonDeployMatch[2]);
      await this.handleUpythonDeploy(req, res, userName, projectName);
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

    this.sendJsonResponse(res, 404, { error: 'API endpoint not found' });
  }

  // --- Arduino ---

  private async resolveProjectId(userName: string, projectIdentifier: string): Promise<string | null> {
    try {
      const data = await this.fileSystem.readFile(`Minis/Users/${userName}/Project.json`);
      const parsed = JSON.parse(data.content) as { projects?: Array<{ id: string; name: string }> };
      const projects = parsed.projects ?? [];
      // Try by name first, then by id
      const project = projects.find(p => p.name === projectIdentifier) ?? projects.find(p => p.id === projectIdentifier);
      return project?.id ?? null;
    } catch {
      return null;
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
    const body = await this.parseRequestBody(req) as { sketchName?: string; fqbn?: string; deviceName?: string };
    if (!body.sketchName || !body.fqbn) {
      this.sendJsonResponse(res, 400, { error: 'sketchName and fqbn are required' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }

    let minisConfig: MinisConfig | undefined;
    if (body.deviceName) {
      minisConfig = await this.resolveMinisConfig(userName, body.deviceName);
    }

    // Read libraries from project record
    let libraries: Array<{ name: string; version?: string; url?: string }> | undefined;
    try {
      const projectData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as { projects?: Array<{ id: string; libraries?: Array<{ name: string; version?: string; url?: string }> }> };
      const projectEntry = (projectData?.projects ?? []).find(p => p.id === projectId);
      if (projectEntry?.libraries?.length) libraries = projectEntry.libraries;
    } catch { /* ignore */ }

    try {
      const result = await this.arduinoService.compile(userName, projectId, body.sketchName, body.fqbn, minisConfig, libraries);
      if (body.deviceName && minisConfig?.serialNumber) {
        await this.saveDeviceLastBuild(userName, minisConfig.serialNumber, { platform: 'arduino', fqbn: body.fqbn, success: result.success, projectId, sketchName: body.sketchName });
      }
      this.sendJsonResponse(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Compilation failed';
      if (body.deviceName && minisConfig?.serialNumber) {
        await this.saveDeviceLastBuild(userName, minisConfig.serialNumber, { platform: 'arduino', fqbn: body.fqbn, success: false, projectId, sketchName: body.sketchName });
      }
      this.sendJsonResponse(res, 200, { success: false, output: msg, exitCode: 1 });
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
    const body = await this.parseRequestBody(req) as { sketchName?: string; fqbn?: string; port?: string; serialNumber?: string };
    if (!body.sketchName || !body.fqbn || !body.port) {
      this.sendJsonResponse(res, 400, { error: 'sketchName, fqbn and port are required' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }
    try {
      const result = await this.arduinoService.upload(userName, projectId, body.sketchName, body.fqbn, body.port);
      if (body.serialNumber) {
        await this.saveDeviceLastBuild(userName, body.serialNumber, { platform: 'arduino', fqbn: body.fqbn, success: result.success, sketchName: body.sketchName });
      }
      this.sendJsonResponse(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      if (body.serialNumber) {
        await this.saveDeviceLastBuild(userName, body.serialNumber, { platform: 'arduino', fqbn: body.fqbn, success: false, sketchName: body.sketchName });
      }
      this.sendJsonResponse(res, 200, { success: false, output: msg, exitCode: 1 });
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
      this.sendJsonResponse(res, result.success ? 200 : 422, result);
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
      // COOP/COEP headers required for SharedArrayBuffer (WebAssembly threads)
      res.writeHead(200, { 'Content-Type': mimeType });
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
      await fs.promises.mkdir(path.join(sketchesDir, sketchName), { recursive: true });
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
      const projectId = (deletedItem as Record<string, unknown>).id as string | undefined;
      const dirName = projectId ?? id;
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
    const body = await this.parseRequestBody(req) as { port?: string; deviceName?: string; serialNumber?: string };
    if (!body.port) {
      this.sendJsonResponse(res, 400, { error: 'port is required' });
      return;
    }
    const projectId = await this.resolveProjectId(userName, projectName);
    if (!projectId) {
      this.sendJsonResponse(res, 404, { error: 'Project not found' });
      return;
    }

    // Resolve deviceName — accept either deviceName or serialNumber (legacy)
    let resolvedDeviceName = body.deviceName;
    if (!resolvedDeviceName && body.serialNumber) {
      try {
        const deviceData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Device.json`) as { devices?: Array<{ name?: string; sn?: string }> };
        const device = (deviceData?.devices ?? []).find(d => d.sn === body.serialNumber);
        resolvedDeviceName = device?.name;
      } catch { /* ignore */ }
    }

    // Read uPython libraries from project record
    let upythonLibraries: Array<{ url: string; remoteName: string }> | undefined;
    try {
      const projectData = await this.readJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`) as { projects?: Array<{ id: string; libraries?: Array<{ url: string; remoteName?: string; name?: string }> }> };
      const projectEntry = (projectData?.projects ?? []).find(p => p.id === projectId);
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

    try {
      const result = await this.upythonService.deploy(userName, projectId, body.port, upythonLibraries, minisConfigFile);
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
      const sn = device['sn'] as string | undefined;
      if (!sn) {
        this.sendJsonResponse(res, 200, { serialNumber: '', wifiSsid: '', wifiPassword: '' });
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
      const MAX_BODY_SIZE = 5 * 1024 * 1024;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          reject(new Error('Request body too large'));
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

  // --- GitHub Import ---

  private githubRawBase(repoUrl: string): string | null {
    const m = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?(?:\/|$)/);
    if (!m) return null;
    return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main`;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
    return r.json();
  }

  private async fetchText(url: string): Promise<string> {
    const r = await fetch(url);
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
      // Download sketch files: src/{id}/src/{sketchName}/{file} → sketches/{sketchName}/{file}
      for (const sketch of sketches ?? []) {
        for (const filePath of sketch.files) {
          const rel = filePath.replace(/^src\/[^/]+\/(?:src|sketches)\//, ''); // strip "src/{id}/src/" or "src/{id}/sketches/"
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
        const projects = (data.projects ?? []) as Array<Record<string, unknown>>;
        const project = projects.find(p => p.id === projectId);
        if (project) {
          project.libraries = libraries;
          await this.writeJsonFile(`${MINIS_ROOT}/Users/${userName}/Project.json`, data);
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
      const projects = (data.projects ?? []) as Array<Record<string, unknown>>;
      const project = projects.find(p => p.id === projectId);
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
          const rel = filePath.replace(/^src\/[^/]+\/(?:src|sketches)\//, '');
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
      const projects = (data.projects ?? []) as Array<Record<string, unknown>>;
      const project = projects.find(p => p.id === projectId);
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
}
