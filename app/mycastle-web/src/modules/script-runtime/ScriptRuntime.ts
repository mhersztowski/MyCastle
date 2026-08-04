import {
  ScriptAuth,
  ScriptContext,
  ScriptOutput,
  DisplayApi,
  HttpOptions,
  md,
  table,
  reactive,
} from './types';
import { pluginRegistry } from '../web-plugins';
import { makeCredentialsApi } from '../../services/credentialsApi';
import { Scene } from '../scene-script/Scene';
import { isLayer, isNode3D } from '@mhersztowski/core-cad-viewer';
import { stripEnvImports } from './envImports';

/** Read-only access to the document env vars (loaded by File components). */
export interface ScriptEnv {
  get: (name: string) => unknown;
  all: () => Record<string, unknown>;
}

export function buildScriptContext(auth: ScriptAuth, env?: ScriptEnv): ScriptContext {
  const defaultHeaders = (opts?: HttpOptions): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(opts?.auth !== false && auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...opts?.headers,
  });

  const checkOk = (resp: Response, url: string) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${url}`);
  };

  const http = {
    get: async <T = unknown>(url: string, opts?: HttpOptions): Promise<T> => {
      const resp = await fetch(url, { headers: defaultHeaders(opts) });
      checkOk(resp, url);
      return resp.json() as Promise<T>;
    },
    post: async <T = unknown>(url: string, body?: unknown, opts?: HttpOptions): Promise<T> => {
      const resp = await fetch(url, {
        method: 'POST',
        headers: defaultHeaders(opts),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      checkOk(resp, url);
      return resp.json() as Promise<T>;
    },
    put: async <T = unknown>(url: string, body?: unknown, opts?: HttpOptions): Promise<T> => {
      const resp = await fetch(url, {
        method: 'PUT',
        headers: defaultHeaders(opts),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      checkOk(resp, url);
      return resp.json() as Promise<T>;
    },
    patch: async <T = unknown>(url: string, body?: unknown, opts?: HttpOptions): Promise<T> => {
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: defaultHeaders(opts),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      checkOk(resp, url);
      return resp.json() as Promise<T>;
    },
    delete: async <T = unknown>(url: string, opts?: HttpOptions): Promise<T> => {
      const resp = await fetch(url, { method: 'DELETE', headers: defaultHeaders(opts) });
      checkOk(resp, url);
      // DELETE may return 204 No Content
      const text = await resp.text();
      return (text ? JSON.parse(text) : null) as T;
    },
    getText: async (url: string, opts?: HttpOptions): Promise<string> => {
      const resp = await fetch(url, { headers: defaultHeaders(opts) });
      checkOk(resp, url);
      return resp.text();
    },
    raw: (url: string, init?: RequestInit): Promise<Response> => fetch(url, init),
  };

  const secrets = makeCredentialsApi(() => auth.currentUser);

  // Document env vars (populated by File components). `get(name)` / `all()`.
  const envApi = {
    get: (name: string) => env?.get(name),
    all: () => env?.all() ?? {},
  };

  // Spread registered plugin namespaces (iot, map, timeline, flow …) into context
  // `Scene` wchodzi przez kontekst, ale skrypt sięga po nią importem — patrz
  // `stripEnvImports`. Dzięki temu nazwa nie zajmuje globalnej przestrzeni
  // skryptów, które scen nie używają, a Monaco podpowiada z modułu.
  return { auth, http, secrets, md, table, reactive, env: envApi, Scene, isNode3D, isLayer, ...pluginRegistry.buildContext() };
}

// AsyncFunction constructor — lets scripts use await at top level
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

export async function executeScript(
  code: string,
  ctx: ScriptContext,
  display: DisplayApi,
): Promise<ScriptOutput> {
  // Destructure all context keys — includes auth/http/md/table/reactive plus plugin namespaces
  const ctxKeys = Object.keys(ctx).join(', ');
  const fn = new AsyncFunction(
    'ctx',
    'display',
    `const { ${ctxKeys} } = ctx;\n${stripEnvImports(code)}`,
  );
  return fn(ctx, display) as Promise<ScriptOutput>;
}
