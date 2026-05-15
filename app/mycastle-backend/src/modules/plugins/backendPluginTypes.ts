import type { IncomingMessage, ServerResponse } from 'http';
import type { AuthTokenPayload } from '@mhersztowski/core';

/** Manifest read from a backend plugin's `plugin.json`. */
export interface BackendPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Entry file relative to the plugin directory (e.g. "index.ts"). */
  main: string;
  /**
   * User-friendly URL segment for the plugin's routes — a single path segment
   * matching `[A-Za-z0-9_-]+`. Routes are served at
   * `/api/users/{owner}/{basePath}{route.path}`.
   *
   * Defaults to the plugin id (its directory name). If it is empty, malformed,
   * collides with a reserved core route segment, or is already taken by another
   * of the same user's plugins, the loader falls back to the collision-proof
   * `plugin/{pluginId}` prefix.
   */
  basePath?: string;
  /** Informational — declares what the plugin contributes. */
  contributes?: {
    routes?: string[];
  };
}

export type PluginHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Context passed to a plugin route handler for one HTTP request. */
export interface PluginRequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  /** Parsed query string. */
  query: URLSearchParams;
  /** Parsed JSON body (POST/PUT/PATCH); undefined otherwise. */
  body: unknown;
  /** Authenticated user, or null for routes marked `public`. */
  user: AuthTokenPayload | null;
  /** The user who owns this plugin (its directory under Minis/Users/). */
  ownerUserName: string;
  /** Send a JSON response. */
  json(status: number, data: unknown): void;
  /** Send a text/HTML response. */
  text(status: number, body: string, contentType?: string): void;
  /** Send a 302 redirect. */
  redirect(location: string): void;
}

/** A route contributed by a backend plugin via `api.registerRoute()`. */
export interface PluginRoute {
  method: PluginHttpMethod;
  /** Path relative to the plugin base, e.g. "/auth-url", "/callback". Exact match. */
  path: string;
  /** If true, the route is reachable without a JWT (e.g. an OAuth callback hit by a third party). */
  public?: boolean;
  handler: (ctx: PluginRequestContext) => void | Promise<void>;
}

/** Persistent, per-plugin key/value storage (JSON-file backed). */
export interface IPluginStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** API object injected into a backend plugin's `activate()` function. */
export interface IBackendPluginAPI {
  /** Plugin id — the plugin's directory name. */
  readonly pluginId: string;
  /** The user who owns the plugin. */
  readonly ownerUserName: string;
  /**
   * Register an HTTP route. Becomes reachable at
   * `/api/users/{ownerUserName}/plugin/{pluginId}{route.path}`.
   */
  registerRoute(route: PluginRoute): void;
  /** Persistent per-plugin storage (e.g. OAuth refresh tokens). Backed by `.storage.json`. */
  readonly storage: IPluginStorage;
  /** Read a config value: first from the plugin's `config.json`, then `process.env`. */
  config: {
    get(key: string): string | undefined;
  };
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

/** Shape a plugin entry module must export. */
export interface BackendPluginModule {
  activate(
    api: IBackendPluginAPI,
  ): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
}
