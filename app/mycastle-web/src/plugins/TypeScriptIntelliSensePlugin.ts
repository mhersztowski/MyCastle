import * as monaco from 'monaco-editor';
import type { FileSystemProvider } from '@mhersztowski/core';
import type { IPlugin } from '@mhersztowski/web-client';

// ── URI ↔ VFS path helpers ───────────────────────────────────────────────────

/** 'file:///home/foo/bar.ts' → '/home/foo/bar.ts' */
function uriToVfsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/** '/home/foo/bar.ts' → 'file:///home/foo/bar.ts' */
function vfsPathToUri(vfsPath: string): string {
  return vfsPath.startsWith('/') ? 'file://' + vfsPath : vfsPath;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function dirOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '/';
}

function resolvePath(base: string, rel: string): string {
  const parts = base.split('/');
  parts.pop(); // remove filename, keep dir
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Parse all static import/require specifiers from TypeScript/JS source. */
function extractSpecifiers(code: string): string[] {
  const seen = new Set<string>();
  const staticRe = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g;
  const dynamicRe = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, dynamicRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) seen.add(m[1]);
  }
  return [...seen];
}

/** '@org/pkg' → 'org__name', 'pkg' → 'pkg' */
function toAtTypesSlug(pkg: string): string {
  return pkg.startsWith('@') ? pkg.slice(1).replace('/', '__') : pkg;
}

/** Return the package root name from an import specifier. */
function pkgNameFrom(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  return specifier.split('/')[0];
}

// ── CDN fallback (jsdelivr) ───────────────────────────────────────────────────

const CDN = 'https://cdn.jsdelivr.net/npm';

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const txt = await res.text();
    if (txt.trimStart().startsWith('<')) return null; // HTML error page
    return txt;
  } catch {
    return null;
  }
}

/**
 * Fetch package types from CDN.
 * Returns libPath as 'file:///node_modules/...' so TypeScript can resolve
 * bare module imports from models with 'file://' URIs (walks up to root).
 */
async function fetchPackageTypesFromCdn(pkg: string): Promise<{ libPath: string; content: string } | null> {
  const slug = toAtTypesSlug(pkg);

  // 1. @types/<slug>/index.d.ts
  const atTypesContent = await fetchText(`${CDN}/@types/${slug}/index.d.ts`);
  if (atTypesContent) {
    return {
      libPath: `file:///node_modules/@types/${slug}/index.d.ts`,
      content: atTypesContent,
    };
  }

  // 2. Package's own package.json → types/typings field
  const pkgJson = await fetchText(`${CDN}/${pkg}/package.json`);
  if (pkgJson) {
    try {
      const meta = JSON.parse(pkgJson) as { types?: string; typings?: string };
      const typesFile = meta.types ?? meta.typings;
      if (typesFile) {
        const file = typesFile.startsWith('./') ? typesFile.slice(2) : typesFile;
        const content = await fetchText(`${CDN}/${pkg}/${file}`);
        if (content) {
          return {
            libPath: `file:///node_modules/${pkg}/${file}`,
            content,
          };
        }
      }
    } catch { /* bad json */ }
  }

  // 3. package/index.d.ts
  const indexDts = await fetchText(`${CDN}/${pkg}/index.d.ts`);
  if (indexDts) {
    return {
      libPath: `file:///node_modules/${pkg}/index.d.ts`,
      content: indexDts,
    };
  }

  return null;
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export function createTypeScriptPlugin(provider: FileSystemProvider): IPlugin {
  return {
    manifest: {
      id: 'builtin.typescript-intellisense',
      name: 'TypeScript IntelliSense',
      version: '1.0.0',
      description: 'TS completions from VFS node_modules + CDN fallback',
      contributes: [],
    },

    activate(api) {
      // ── Compiler options ─────────────────────────────────────────────────────
      const tsDefaults = monaco.languages.typescript.typescriptDefaults;

      tsDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowJs: true,
        checkJs: false,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        strict: false,
        noEmit: true,
        jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
        allowNonTsExtensions: true,
      });

      tsDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });

      // ── State ────────────────────────────────────────────────────────────────
      const registeredLibs = new Map<string, monaco.IDisposable>();
      const resolvedPkgs = new Set<string>();   // packages already resolved (VFS or CDN)
      const processedFiles = new Set<string>(); // VFS files already processed (VFS paths)

      function registerLib(libPath: string, content: string) {
        registeredLibs.get(libPath)?.dispose();
        registeredLibs.set(libPath, tsDefaults.addExtraLib(content, libPath));
      }

      // ── VFS read (uses VFS paths, e.g. '/home/foo/bar.ts') ──────────────────
      async function readVfs(vfsPath: string): Promise<string | null> {
        try {
          return new TextDecoder().decode(await provider.readFile(vfsPath));
        } catch {
          return null;
        }
      }

      /** Walk up from VFS dir to find the nearest node_modules directory. */
      async function findNodeModulesDir(startDir: string): Promise<string | null> {
        const parts = startDir.split('/').filter(Boolean);
        for (let i = parts.length; i >= 1; i--) {
          const candidate = '/' + parts.slice(0, i).join('/') + '/node_modules';
          try {
            await provider.stat(candidate);
            return candidate;
          } catch { /* not found, go up */ }
        }
        return null;
      }

      /**
       * Load package types from VFS node_modules.
       * Registers at 'file:///node_modules/...' so TypeScript resolves bare imports.
       */
      async function loadPkgTypesFromVfs(pkg: string, nodeModulesDir: string): Promise<boolean> {
        const slug = toAtTypesSlug(pkg);

        for (const pkgDir of [`${nodeModulesDir}/@types/${slug}`, `${nodeModulesDir}/${pkg}`]) {
          const pkgJsonPath = `${pkgDir}/package.json`;
          const pkgJsonContent = await readVfs(pkgJsonPath);
          if (!pkgJsonContent) continue;

          let typesFile: string | null = null;
          try {
            const meta = JSON.parse(pkgJsonContent) as { types?: string; typings?: string };
            typesFile = meta.types ?? meta.typings ?? 'index.d.ts';
          } catch {
            typesFile = 'index.d.ts';
          }
          if (!typesFile) continue;

          const dtsVfsPath = `${pkgDir}/${typesFile.startsWith('./') ? typesFile.slice(2) : typesFile}`;
          const content = await readVfs(dtsVfsPath);
          if (content) {
            // Register at conventional node_modules path (file:/// root) for module resolution
            const libPath = dtsVfsPath.includes('/@types/')
              ? `file:///node_modules/@types/${slug}/${typesFile.replace('./', '')}`
              : `file:///node_modules/${pkg}/${typesFile.replace('./', '')}`;
            registerLib(libPath, content);
            return true;
          }

          const fallbackVfsPath = `${pkgDir}/index.d.ts`;
          const fallbackContent = await readVfs(fallbackVfsPath);
          if (fallbackContent) {
            const libPath = pkgDir.includes('/@types/')
              ? `file:///node_modules/@types/${slug}/index.d.ts`
              : `file:///node_modules/${pkg}/index.d.ts`;
            registerLib(libPath, fallbackContent);
            return true;
          }
        }
        return false;
      }

      /** Resolve types for an npm package: VFS node_modules first, CDN fallback. */
      async function resolvePackage(pkg: string, nodeModulesDir: string | null): Promise<void> {
        if (resolvedPkgs.has(pkg)) return;
        resolvedPkgs.add(pkg);

        if (nodeModulesDir) {
          const found = await loadPkgTypesFromVfs(pkg, nodeModulesDir);
          if (found) return;
        }

        // CDN fallback
        const result = await fetchPackageTypesFromCdn(pkg);
        if (result) registerLib(result.libPath, result.content);
      }

      /**
       * Add a local VFS file as an extra lib so TypeScript can resolve relative imports.
       * Uses 'file://' URI so paths match those TypeScript resolves from editing models.
       * Skips files already open as Monaco models (they're already in the TS service).
       */
      async function addVfsFile(vfsPath: string, nodeModulesDir: string | null, visited: Set<string>): Promise<void> {
        if (visited.has(vfsPath) || processedFiles.has(vfsPath)) return;
        visited.add(vfsPath);

        const content = await readVfs(vfsPath);
        if (!content) return;

        processedFiles.add(vfsPath);

        // Only register as extra lib if Monaco doesn't already have a model for this URI
        const modelUri = vfsPathToUri(vfsPath);
        const monacoUri = monaco.Uri.parse(modelUri);
        if (!monaco.editor.getModel(monacoUri)) {
          registerLib(modelUri, content);
        }

        await resolveImports(vfsPath, content, nodeModulesDir, visited);
      }

      /** Resolve all imports found in a file (receives VFS path). */
      async function resolveImports(
        currentVfsPath: string,
        code: string,
        nodeModulesDir: string | null,
        visited = new Set<string>(),
      ): Promise<void> {
        const specifiers = extractSpecifiers(code);

        await Promise.allSettled(specifiers.map(async (spec) => {
          if (spec.startsWith('.')) {
            // Relative import — load from VFS
            const resolved = resolvePath(currentVfsPath, spec);
            const candidates = [
              `${resolved}.ts`, `${resolved}.tsx`,
              `${resolved}/index.ts`, `${resolved}/index.tsx`,
              `${resolved}.d.ts`, resolved,
            ];
            for (const c of candidates) {
              if (!processedFiles.has(c) && (await readVfs(c)) !== null) {
                await addVfsFile(c, nodeModulesDir, visited);
                break;
              }
            }
          } else if (!spec.startsWith('node:') && !spec.startsWith('bun:')) {
            // npm package
            await resolvePackage(pkgNameFrom(spec), nodeModulesDir);
          }
        }));
      }

      /** Load types for all deps listed in the nearest package.json. */
      async function loadAllPackageJsonDeps(fileDir: string, nodeModulesDir: string | null): Promise<void> {
        const parts = fileDir.split('/').filter(Boolean);
        for (let i = parts.length; i >= 0; i--) {
          const pkgPath = (i === 0 ? '' : '/' + parts.slice(0, i).join('/')) + '/package.json';
          const content = await readVfs(pkgPath);
          if (!content) continue;
          try {
            const pkg = JSON.parse(content) as {
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
            await Promise.allSettled(deps.map(dep => resolvePackage(dep, nodeModulesDir)));
          } catch { /* bad json */ }
          break;
        }
      }

      // ── Handle file open ─────────────────────────────────────────────────────
      /**
       * Called with the model URI (e.g. 'file:///home/foo/index.ts').
       * Converts to VFS path for provider operations.
       * Does NOT register the file itself as extra lib — Monaco has it as a model.
       */
      async function handleFile(modelUri: string, code: string): Promise<void> {
        const vfsPath = uriToVfsPath(modelUri);
        const ext = vfsPath.split('.').pop()?.toLowerCase();
        if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mts', 'cts'].includes(ext)) return;

        const fileDir = dirOf(vfsPath);
        const nodeModulesDir = await findNodeModulesDir(fileDir);

        await resolveImports(vfsPath, code, nodeModulesDir);
        await loadAllPackageJsonDeps(fileDir, nodeModulesDir);
      }

      api.editor.onDidOpenDocument((uri, text) => {
        handleFile(uri, text).catch(() => {});
      });

      let currentUri = '';
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      api.editor.onDidChangeModel((uri) => { currentUri = uri; });

      api.editor.onDidChangeContent((text) => {
        if (!currentUri) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          debounceTimer = null;
          const vfsPath = uriToVfsPath(currentUri);
          const nodeModulesDir = await findNodeModulesDir(dirOf(vfsPath)).catch(() => null);
          resolveImports(vfsPath, text, nodeModulesDir).catch(() => {});
        }, 1500);
      });

      api.logger.info('TypeScript IntelliSense activated (VFS node_modules + CDN fallback)');
    },
  };
}
