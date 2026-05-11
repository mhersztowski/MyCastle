import {
  ScriptAuth,
  ScriptContext,
  ScriptOutput,
  DisplayApi,
  md,
  table,
  reactive,
} from './types';
import { pluginRegistry } from '../web-plugins';

export function buildScriptContext(auth: ScriptAuth): ScriptContext {
  const headers = () => ({
    'Content-Type': 'application/json',
    ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  });

  const http = {
    get: async (path: string): Promise<unknown> => {
      const resp = await fetch(path, { headers: headers() });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${path}`);
      return resp.json();
    },
    post: async (path: string, body?: unknown): Promise<unknown> => {
      const resp = await fetch(path, {
        method: 'POST',
        headers: headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${path}`);
      return resp.json();
    },
    put: async (path: string, body?: unknown): Promise<unknown> => {
      const resp = await fetch(path, {
        method: 'PUT',
        headers: headers(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${path}`);
      return resp.json();
    },
  };

  // Spread registered plugin namespaces (iot, map, timeline, flow …) into context
  return { auth, http, md, table, reactive, ...pluginRegistry.buildContext() };
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
    `const { ${ctxKeys} } = ctx;\n${code}`,
  );
  return fn(ctx, display) as Promise<ScriptOutput>;
}
