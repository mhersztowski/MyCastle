import * as esbuild from 'esbuild';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { isBuiltin } from 'module';
import * as os from 'os';
import * as path from 'path';

/** Extensions runnable as Drive backend scripts (JS as-is, TS via esbuild). */
export const RUNNABLE_RE = /\.(mjs|cjs|js|ts|tsx|mts|cts)$/i;
const TS_RE = /\.(ts|tsx|mts|cts)$/i;

export interface PreparedScript {
  /** Absolute path to run with `node` (a transpiled temp for TS, else the original). */
  runFile: string;
  /** Remove any temp artifacts. Always call once the process has exited. */
  cleanup: () => Promise<void>;
}

const noop = async () => { /* nothing to clean up */ };

/**
 * Locate the MyCastle monorepo root so scripts can `import 'mycastle/...'` the
 * application source. Uses $MYCASTLE_ROOT if set, else walks up from this
 * module's location looking for the workspace root. Returns null in a deployed
 * build where the source tree isn't present (the alias then simply won't resolve).
 */
let cachedRoot: string | null | undefined;
export function findMonorepoRoot(): string | null {
  if (cachedRoot !== undefined) return cachedRoot;
  const env = process.env.MYCASTLE_ROOT;
  if (env && existsSync(path.join(env, 'packages', 'core', 'package.json'))) return (cachedRoot = env);
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, 'packages', 'core', 'package.json')) &&
        existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return (cachedRoot = dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return (cachedRoot = null);
}

// esbuild plugin for backend scripts:
//   • `mycastle/<rel>`  → `<root>/<rel>` (import application source directly)
//   • bare `pkg` imports → resolved from the importing file's dir, then from a
//     few monorepo locations (so scripts can use packages like `mqtt`,
//     `@mhersztowski/*`, etc. even though the script lives outside the repo);
//     genuinely unresolvable ones fall back to `external` (Node tries at runtime).
function mycastlePlugin(root: string): esbuild.Plugin {
  const fallbackDirs = [
    root,
    path.join(root, 'packages', 'web-client'),
    path.join(root, 'app', 'mycastle-web'),
    path.join(root, 'app', 'mycastle-backend'),
  ];
  return {
    name: 'mycastle',
    setup(build) {
      build.onResolve({ filter: /^mycastle(\/|$)/ }, (args) => ({
        path: path.join(root, args.path === 'mycastle' ? '' : args.path.slice('mycastle/'.length)),
      }));
      build.onResolve({ filter: /^[^./]/ }, async (args) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((args.pluginData as any)?.mc) return undefined;        // our own resolve() re-entry
        if (args.path.startsWith('mycastle')) return undefined;    // handled above
        if (isBuiltin(args.path) || args.path.startsWith('node:')) return { external: true };
        for (const rd of [args.resolveDir, ...fallbackDirs]) {
          if (!rd) continue;
          const r = await build.resolve(args.path, { kind: args.kind, resolveDir: rd, pluginData: { mc: 1 } });
          if (!r.errors.length) return { path: r.path, external: r.external };
        }
        return { external: true, path: args.path };
      });
    },
  };
}

/**
 * Prepare a Drive backend script for `node` execution.
 *
 * `.js/.mjs/.cjs` run as-is (unchanged behaviour). `.ts/.tsx/.mts/.cts` are
 * transpiled AND bundled with esbuild into a temp `.mjs`:
 *   • `import`s of other local `.ts`/`.js` files (relative paths) are bundled,
 *   • `import 'mycastle/packages/…'` resolves to the MyCastle monorepo source
 *     and is bundled together with its dependencies (from the repo's node_modules),
 * so the resulting temp file is self-contained (only Node built-ins stay external).
 */
export async function prepareRunnableScript(file: string): Promise<PreparedScript> {
  if (!TS_RE.test(file)) return { runFile: file, cleanup: noop };

  const root = findMonorepoRoot();
  const opts: esbuild.BuildOptions = {
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    platform: 'node',   // Node built-ins (fs, path, …) stay external automatically
    target: 'node20',
    write: false,
    logLevel: 'silent',
    sourcemap: 'inline',
    loader: { '.ts': 'ts', '.tsx': 'tsx', '.mts': 'ts', '.cts': 'ts' },
    tsconfigRaw: '{"compilerOptions":{"esModuleInterop":true,"verbatimModuleSyntax":false}}',
    // CJS deps (e.g. mqtt → readable-stream) do `require('stream')`; give the ESM
    // bundle a real `require` so those Node built-in requires work.
    banner: { js: 'import { createRequire as __mcRequire } from "module"; const require = __mcRequire(import.meta.url);' },
  };
  if (root) {
    // Bundle everything (incl. app + monorepo deps) into a self-contained temp file.
    opts.plugins = [mycastlePlugin(root)];
  } else {
    // No source tree available — keep bare imports external (Node resolves them).
    opts.packages = 'external';
  }

  const result = await esbuild.build(opts);
  const code = result.outputFiles?.[0]?.text ?? '';

  const dir = await mkdtemp(path.join(os.tmpdir(), 'mycastle-script-'));
  const runFile = path.join(dir, `${path.basename(file).replace(TS_RE, '')}.mjs`);
  await writeFile(runFile, code, 'utf-8');

  return { runFile, cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => { /* best effort */ }) };
}
