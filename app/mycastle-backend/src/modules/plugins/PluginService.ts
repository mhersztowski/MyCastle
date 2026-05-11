import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import * as esbuild from 'esbuild';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  contributes?: {
    pages?: Array<{ path: string; component: string; label: string }>;
    menuItems?: Array<{ section: string; label: string; path: string; icon?: string }>;
    scripts?: string[];
  };
  externals?: string[];
}

interface BuildCacheEntry {
  js: string;
  mtime: number;
}

export class PluginService {
  private readonly buildCache = new Map<string, BuildCacheEntry>();

  constructor(private readonly rootDir: string) {}

  private pluginsBaseDir(userName: string): string {
    return join(this.rootDir, 'Minis', 'Users', userName, 'app', 'web');
  }

  async listPlugins(userName: string): Promise<PluginManifest[]> {
    const baseDir = this.pluginsBaseDir(userName);
    const manifests: PluginManifest[] = [];

    let entries: string[];
    try {
      entries = await readdir(baseDir);
    } catch {
      return [];
    }

    for (const entry of entries) {
      const manifestPath = join(baseDir, entry, 'plugin.json');
      try {
        const content = await readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(content) as PluginManifest;
        manifests.push(manifest);
      } catch {
        // not a plugin directory — skip
      }
    }

    return manifests;
  }

  async buildPlugin(userName: string, pluginId: string): Promise<string | null> {
    const pluginDir = join(this.pluginsBaseDir(userName), pluginId);

    let manifest: PluginManifest;
    try {
      const content = await readFile(join(pluginDir, 'plugin.json'), 'utf-8');
      manifest = JSON.parse(content) as PluginManifest;
    } catch {
      return null;
    }

    const entryFile = join(pluginDir, manifest.main);

    let mtime = 0;
    try {
      const s = await stat(entryFile);
      mtime = s.mtimeMs;
    } catch {
      return null;
    }

    const cached = this.buildCache.get(pluginId);
    if (cached && cached.mtime === mtime) {
      return cached.js;
    }

    // Packages provided by the frontend require-shim at runtime — treated as external so they
    // are NOT bundled into the plugin CJS output (keeps plugin bundles small).
    // MUI and emotion are provided by the shim because pnpm's virtual store does not hoist
    // them to the monorepo root node_modules, making them unresolvable by esbuild otherwise.
    const SHIM_EXTERNALS = [
      'react', 'react-dom', 'react/jsx-runtime',
      '@mhersztowski/web-client',
      '@mycastle/plugin-api',
      '@mui/material',
      '@mui/icons-material',
      '@mui/icons-material/*',
      '@emotion/react',
      '@emotion/styled',
    ];

    try {
      const result = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        format: 'cjs',
        platform: 'browser',
        external: SHIM_EXTERNALS,
        write: false,
        logLevel: 'silent',
        target: 'es2020',
        jsx: 'automatic',
        // Treat .ts files as TSX so JSX syntax inside .ts plugin files parses correctly.
        loader: { '.ts': 'tsx' },
        tsconfigRaw: '{"compilerOptions":{"jsx":"react-jsx","esModuleInterop":true}}',
        define: { 'process.env.NODE_ENV': '"production"' },
      });

      if (result.outputFiles.length === 0) return null;

      const js = result.outputFiles[0].text;
      this.buildCache.set(pluginId, { js, mtime });
      console.log(`[PluginService] Built ${pluginId} (${(js.length / 1024).toFixed(1)} kB)`);
      return js;
    } catch (err) {
      console.error(`[PluginService] Build failed for ${pluginId}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
}
