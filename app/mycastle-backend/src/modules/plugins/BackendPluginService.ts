import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import * as esbuild from 'esbuild';
import { PluginStorage } from './PluginStorage.js';
import type {
  BackendPluginManifest,
  BackendPluginModule,
  IBackendPluginAPI,
  PluginRequestContext,
  PluginRoute,
} from './backendPluginTypes.js';

interface LoadedBackendPlugin {
  pluginId: string;          // directory name — stable id, also used in the fallback prefix
  basePath: string;          // resolved URL segment for this plugin's routes
  manifest: BackendPluginManifest;
  ownerUserName: string;
  dir: string;
  routes: PluginRoute[];
  deactivate: (() => void | Promise<void>) | null;
  mtime: number;
}

/**
 * First-segment route names already used by the core API under `/api/users/{user}/`.
 * A plugin cannot claim one of these as its friendly `basePath` — the loader falls
 * back to the collision-proof `plugin/{pluginId}` prefix instead.
 */
const RESERVED_BASE_PATHS = new Set<string>([
  'alert-rules', 'alerts', 'api-keys', 'backend-plugins', 'cleanup-projects',
  'devicedefs', 'devices', 'electronics', 'iot', 'iot-automations', 'iot-retention',
  'localizations', 'my-shares', 'nodejs', 'notification-channels', 'plugin', 'plugins',
  'project-arduino', 'project-pygame', 'project-upython', 'projects', 'public',
  'python', 'shared-devices', 'vfs',
]);

/** A valid friendly basePath is a single URL segment. */
const BASE_PATH_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Loads, builds and runs user-supplied backend plugins.
 *
 * Plugins live in `data/Minis/Users/{userName}/app/backend/{pluginId}/` with a
 * `plugin.json` manifest and a TypeScript entry file. Each entry is bundled with
 * esbuild (ESM, platform node) and imported in-process via a `data:` URL, then its
 * `activate(api)` export is called. Plugins contribute HTTP routes reachable at
 *   `/api/users/{ownerUserName}/plugin/{pluginId}{route.path}`
 * dispatched by MycastleHttpServer.
 */
export class BackendPluginService {
  private readonly plugins = new Map<string, LoadedBackendPlugin>();

  constructor(private readonly rootDir: string) {}

  private key(owner: string, pluginId: string): string {
    return `${owner}/${pluginId}`;
  }

  private userBackendDir(userName: string): string {
    return join(this.rootDir, 'Minis', 'Users', userName, 'app', 'backend');
  }

  /** Load every backend plugin for every user listed in Users.json. */
  async loadAllUsers(): Promise<void> {
    let users: Array<{ name: string }> = [];
    try {
      const raw = await readFile(join(this.rootDir, 'Minis', 'Admin', 'Users.json'), 'utf-8');
      users = (JSON.parse(raw) as { items?: Array<{ name: string }> }).items ?? [];
    } catch {
      return;
    }
    for (const u of users) {
      await this.loadUserPlugins(u.name);
    }
    console.log(
      `[BackendPluginService] loaded ${this.plugins.size} plugin(s) across ${users.length} user(s)`,
    );
  }

  async loadUserPlugins(userName: string): Promise<void> {
    const baseDir = this.userBackendDir(userName);
    let entries: string[];
    try {
      entries = await readdir(baseDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      try {
        await this.loadPlugin(userName, entry);
      } catch (err) {
        console.error(
          `[BackendPluginService] failed to load ${userName}/${entry}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  /** List manifests for one user (without activating). */
  async listPlugins(userName: string): Promise<BackendPluginManifest[]> {
    const baseDir = this.userBackendDir(userName);
    const out: BackendPluginManifest[] = [];
    let entries: string[];
    try {
      entries = await readdir(baseDir);
    } catch {
      return [];
    }
    for (const entry of entries) {
      try {
        const raw = await readFile(join(baseDir, entry, 'plugin.json'), 'utf-8');
        out.push(JSON.parse(raw) as BackendPluginManifest);
      } catch {
        // not a plugin directory — skip
      }
    }
    return out;
  }

  /** Build, import and activate a single plugin. Deactivates any previous instance first. */
  async loadPlugin(userName: string, pluginId: string): Promise<void> {
    const dir = join(this.userBackendDir(userName), pluginId);

    let manifest: BackendPluginManifest;
    try {
      manifest = JSON.parse(await readFile(join(dir, 'plugin.json'), 'utf-8')) as BackendPluginManifest;
    } catch {
      return; // not a plugin directory
    }

    const entryFile = join(dir, manifest.main);
    let mtime = 0;
    try {
      mtime = (await stat(entryFile)).mtimeMs;
    } catch {
      console.warn(`[BackendPluginService] ${userName}/${pluginId}: entry "${manifest.main}" not found`);
      return;
    }

    // Deactivate any previous instance (reload).
    await this.unloadPlugin(userName, pluginId);

    // Bundle the entry to a single ESM module. Node builtins stay external automatically
    // (platform: 'node'); the plugin should otherwise be self-contained.
    let bundle: string;
    try {
      const result = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        write: false,
        logLevel: 'silent',
        tsconfigRaw: '{"compilerOptions":{"esModuleInterop":true,"verbatimModuleSyntax":false}}',
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      bundle = result.outputFiles[0]?.text ?? '';
    } catch (err) {
      console.error(
        `[BackendPluginService] build failed for ${userName}/${pluginId}:`,
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (!bundle) return;

    // Import the bundle in-process. A data: URL naturally cache-busts on every build.
    const dataUrl = `data:text/javascript;base64,${Buffer.from(bundle, 'utf-8').toString('base64')}`;
    let mod: BackendPluginModule;
    try {
      mod = (await import(dataUrl)) as BackendPluginModule;
    } catch (err) {
      console.error(
        `[BackendPluginService] import failed for ${userName}/${pluginId}:`,
        err instanceof Error ? err.message : err,
      );
      return;
    }
    if (typeof mod.activate !== 'function') {
      console.warn(`[BackendPluginService] ${userName}/${pluginId} has no activate() export — skipping`);
      return;
    }

    // Build the plugin API.
    const routes: PluginRoute[] = [];
    const storage = new PluginStorage(join(dir, '.storage.json'));
    const configJson = await this.loadConfigJson(dir);

    const api: IBackendPluginAPI = {
      pluginId,
      ownerUserName: userName,
      registerRoute: (route) => {
        routes.push(route);
      },
      storage,
      config: {
        get: (k) => {
          if (configJson && k in configJson) return String(configJson[k]);
          return process.env[k];
        },
      },
      logger: {
        info: (m) => console.log(`[plugin:${userName}/${pluginId}]`, m),
        warn: (m) => console.warn(`[plugin:${userName}/${pluginId}]`, m),
        error: (m) => console.error(`[plugin:${userName}/${pluginId}]`, m),
      },
    };

    let deactivate: (() => void | Promise<void>) | null = null;
    try {
      const result = await mod.activate(api);
      if (typeof result === 'function') deactivate = result;
    } catch (err) {
      console.error(
        `[BackendPluginService] activate() threw for ${userName}/${pluginId}:`,
        err instanceof Error ? err.message : err,
      );
      return;
    }

    const basePath = this.resolveBasePath(userName, pluginId, manifest);

    this.plugins.set(this.key(userName, pluginId), {
      pluginId,
      basePath,
      manifest,
      ownerUserName: userName,
      dir,
      routes,
      deactivate,
      mtime,
    });
    console.log(
      `[BackendPluginService] activated ${userName}/${pluginId} ` +
        `at /api/users/${userName}/${basePath}/* ` +
        `(${routes.length} route(s): ${routes.map((r) => `${r.method} ${r.path}`).join(', ') || 'none'})`,
    );
  }

  /**
   * Resolves the URL segment a plugin's routes are served under.
   * Friendly name from the manifest (or the plugin id) when valid and free,
   * otherwise the collision-proof `plugin/{pluginId}` fallback.
   */
  private resolveBasePath(
    userName: string,
    pluginId: string,
    manifest: BackendPluginManifest,
  ): string {
    const fallback = `plugin/${pluginId}`;
    const declared = (manifest.basePath ?? '').replace(/^\/+|\/+$/g, '').trim() || pluginId;

    if (!BASE_PATH_PATTERN.test(declared)) {
      console.warn(
        `[BackendPluginService] ${userName}/${pluginId}: basePath "${declared}" is not a valid ` +
          `single segment — falling back to "${fallback}"`,
      );
      return fallback;
    }
    if (RESERVED_BASE_PATHS.has(declared)) {
      console.warn(
        `[BackendPluginService] ${userName}/${pluginId}: basePath "${declared}" collides with a ` +
          `core route — falling back to "${fallback}"`,
      );
      return fallback;
    }
    for (const other of this.plugins.values()) {
      if (other.ownerUserName === userName && other.basePath === declared) {
        console.warn(
          `[BackendPluginService] ${userName}/${pluginId}: basePath "${declared}" already used by ` +
            `"${other.pluginId}" — falling back to "${fallback}"`,
        );
        return fallback;
      }
    }
    return declared;
  }

  /** Deactivate and forget a plugin instance. */
  async unloadPlugin(userName: string, pluginId: string): Promise<void> {
    const k = this.key(userName, pluginId);
    const loaded = this.plugins.get(k);
    if (!loaded) return;
    try {
      await loaded.deactivate?.();
    } catch (err) {
      console.warn(
        `[BackendPluginService] deactivate() threw for ${k}:`,
        err instanceof Error ? err.message : err,
      );
    }
    this.plugins.delete(k);
  }

  /** Rebuild + reactivate a plugin. Returns true if it is loaded afterwards. */
  async reloadPlugin(userName: string, pluginId: string): Promise<boolean> {
    await this.loadPlugin(userName, pluginId);
    return this.plugins.has(this.key(userName, pluginId));
  }

  async shutdownAll(): Promise<void> {
    for (const [k, loaded] of this.plugins) {
      try {
        await loaded.deactivate?.();
      } catch (err) {
        console.warn(`[BackendPluginService] deactivate() threw for ${k}:`, err);
      }
    }
    this.plugins.clear();
  }

  /**
   * Match a request path against a loaded plugin's basePath and find an exact route.
   *
   * `rest` is everything after `/api/users/{owner}/` — e.g. "google-photos/auth-url"
   * or the fallback form "plugin/{pluginId}/auth-url". Returns the matching route, or
   * null if no plugin owns this path (so core routing can take over).
   */
  matchRoute(owner: string, method: string, rest: string): PluginRoute | null {
    const cleanRest = rest.replace(/\/+$/, '');
    for (const plugin of this.plugins.values()) {
      if (plugin.ownerUserName !== owner) continue;
      const bp = plugin.basePath;
      let subPath: string | null = null;
      if (cleanRest === bp) subPath = '/';
      else if (cleanRest.startsWith(bp + '/')) subPath = cleanRest.slice(bp.length);
      if (subPath === null) continue;

      const norm = subPath.replace(/\/+$/, '') || '/';
      const route = plugin.routes.find(
        (r) => r.method === method && (r.path.replace(/\/+$/, '') || '/') === norm,
      );
      if (route) return route;
    }
    return null;
  }

  /** Invoke a route handler with consistent error handling. */
  async invokeRoute(route: PluginRoute, ctx: PluginRequestContext): Promise<void> {
    try {
      await route.handler(ctx);
    } catch (err) {
      console.error(
        `[BackendPluginService] route ${route.method} ${route.path} threw:`,
        err instanceof Error ? err.message : err,
      );
      if (!ctx.res.headersSent) {
        ctx.json(500, { error: err instanceof Error ? err.message : 'Plugin route error' });
      }
    }
  }

  /** Loaded-plugin summary for one user (management endpoint). */
  getLoadedForUser(
    userName: string,
  ): Array<{ id: string; name: string; version: string; basePath: string; routes: string[] }> {
    const out: Array<{
      id: string;
      name: string;
      version: string;
      basePath: string;
      routes: string[];
    }> = [];
    for (const loaded of this.plugins.values()) {
      if (loaded.ownerUserName !== userName) continue;
      out.push({
        id: loaded.pluginId,
        name: loaded.manifest.name,
        version: loaded.manifest.version,
        basePath: loaded.basePath,
        routes: loaded.routes.map(
          (r) => `${r.method} /api/users/${userName}/${loaded.basePath}${r.path}${r.public ? ' (public)' : ''}`,
        ),
      });
    }
    return out;
  }

  private async loadConfigJson(dir: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await readFile(join(dir, 'config.json'), 'utf-8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
