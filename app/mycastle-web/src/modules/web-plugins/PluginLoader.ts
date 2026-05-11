import React from 'react';
import * as ReactDOM from 'react-dom';
import * as WebClient from '@mhersztowski/web-client';
import * as MUI from '@mui/material';
import * as MUIIcons from '@mui/icons-material';
import * as EmotionReact from '@emotion/react';
import * as EmotionStyled from '@emotion/styled';
import type { PluginManifest, IWebPluginAPI, StatusBarItemOptions, StatusBarHandle } from './types';
import { pluginRegistry } from './PluginRegistry';

type DeactivateFn = () => void;

interface LoadedPlugin {
  manifest: PluginManifest;
  deactivate: DeactivateFn;
  scriptNames: string[];
}

const loadedPlugins = new Map<string, LoadedPlugin>();

// CJS require shim — maps external module names to runtime objects
function makeRequire() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const R = React as any;
  const modules: Record<string, unknown> = {
    'react': { ...React, default: React, __esModule: true },
    'react-dom': { ...ReactDOM, default: ReactDOM, __esModule: true },
    'react/jsx-runtime': {
      jsx: R.createElement, jsxs: R.createElement,
      Fragment: React.Fragment, __esModule: true,
    },
    '@mycastle/plugin-api': { __esModule: true },
    '@mhersztowski/web-client': { ...WebClient, __esModule: true },
    '@mui/material': { ...MUI, default: MUI, __esModule: true },
    '@mui/icons-material': { ...MUIIcons, default: MUIIcons, __esModule: true },
    '@emotion/react': { ...EmotionReact, default: EmotionReact, __esModule: true },
    '@emotion/styled': { ...EmotionStyled, default: EmotionStyled, __esModule: true },
  };

  return (id: string): unknown => {
    if (id in modules) return modules[id];
    // Sub-path icon imports: @mui/icons-material/Wifi → { default: WifiIcon }
    if (id.startsWith('@mui/icons-material/')) {
      const iconName = id.slice('@mui/icons-material/'.length);
      const icon = (MUIIcons as Record<string, unknown>)[iconName];
      if (icon !== undefined) return { default: icon, __esModule: true };
    }
    throw new Error(`[PluginLoader] Cannot require '${id}' — not listed as external`);
  };
}

const statusbarItems = new Map<string, StatusBarItemOptions>();

function makeStatusbarHandle(id: string, initial: StatusBarItemOptions): StatusBarHandle {
  statusbarItems.set(id, { ...initial });
  return {
    update(patch) {
      const item = statusbarItems.get(id);
      if (item) statusbarItems.set(id, { ...item, ...patch });
    },
    dispose() {
      statusbarItems.delete(id);
    },
  };
}

function makePluginAPI(
  manifest: PluginManifest,
  scriptNames: string[],
  authInfo: { currentUser: string | null; token: string | null; isAdmin: boolean },
): IWebPluginAPI {
  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(authInfo.token ? { Authorization: `Bearer ${authInfo.token}` } : {}),
  });

  return {
    auth: authInfo,
    http: {
      async get(path: string) {
        const r = await fetch(path, { headers: headers() });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`);
        return r.json();
      },
      async post(path: string, body?: unknown) {
        const r = await fetch(path, {
          method: 'POST',
          headers: headers(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`);
        return r.json();
      },
      async put(path: string, body?: unknown) {
        const r = await fetch(path, {
          method: 'PUT',
          headers: headers(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`);
        return r.json();
      },
    },
    logger: {
      info: (msg: string) => console.log(`[${manifest.id}]`, msg),
      warn: (msg: string) => console.warn(`[${manifest.id}]`, msg),
      error: (msg: string) => console.error(`[${manifest.id}]`, msg),
    },
    ui: {
      statusbar: {
        add: (opts: StatusBarItemOptions) => makeStatusbarHandle(opts.id, opts),
      },
    },
    scripts: {
      register(name: string, fn: (...args: unknown[]) => unknown) {
        scriptNames.push(name);
        pluginRegistry.register(name, fn);
      },
    },
  };
}

export async function loadPlugins(
  userName: string,
  token: string | null,
  isAdmin: boolean,
): Promise<void> {
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;

  let manifests: PluginManifest[];
  try {
    const resp = await fetch(`/api/users/${userName}/plugins`, { headers: authHeaders });
    if (!resp.ok) return;
    manifests = (await resp.json()) as PluginManifest[];
  } catch {
    return;
  }

  const fetchHeaders: Record<string, string> = {};
  if (token) fetchHeaders['Authorization'] = `Bearer ${token}`;

  for (const manifest of manifests) {
    if (loadedPlugins.has(manifest.id)) continue;

    let bundleJs: string;
    try {
      const resp = await fetch(`/api/users/${userName}/plugins/${manifest.id}/bundle.js`, { headers: fetchHeaders });
      if (!resp.ok) continue;
      bundleJs = await resp.text();
    } catch {
      continue;
    }

    const scriptNames: string[] = [];
    const authInfo = { currentUser: userName, token, isAdmin };
    const api = makePluginAPI(manifest, scriptNames, authInfo);
    const require = makeRequire();

    let activateFn: ((api: IWebPluginAPI) => DeactivateFn | void) | null = null;
    try {
      const moduleExports: Record<string, unknown> = {};
      const mod = { exports: moduleExports };
      // eslint-disable-next-line no-new-func
      const factory = new Function('require', 'module', 'exports', bundleJs);
      factory(require, mod, mod.exports);
      activateFn = (mod.exports as Record<string, unknown>).activate as typeof activateFn;
    } catch (err) {
      console.error(`[PluginLoader] Failed to evaluate ${manifest.id}:`, err);
      continue;
    }

    if (typeof activateFn !== 'function') {
      console.warn(`[PluginLoader] ${manifest.id} has no activate() export — skipping`);
      continue;
    }

    const activate = activateFn as (api: IWebPluginAPI) => DeactivateFn | void;
    let deactivate: DeactivateFn = () => {};
    try {
      const result = activate(api);
      if (typeof result === 'function') deactivate = result;
    } catch (err) {
      console.error(`[PluginLoader] activate() threw for ${manifest.id}:`, err);
    }

    loadedPlugins.set(manifest.id, { manifest, deactivate, scriptNames });
    console.log(`[PluginLoader] Loaded plugin: ${manifest.id} (registered: ${scriptNames.join(', ') || 'none'})`);
  }
}

export function unloadPlugins(): void {
  for (const [id, { deactivate, scriptNames }] of loadedPlugins) {
    try { deactivate(); } catch { /* ignore */ }
    pluginRegistry.unregisterAll(scriptNames);
    console.log(`[PluginLoader] Unloaded plugin: ${id}`);
  }
  loadedPlugins.clear();
}
