import * as monaco from 'monaco-editor';

/**
 * Runs a Lit/Qt component script (TS or JS) into a DOM host — the same pipeline
 * as Drive's „Uruchom w przeglądarce", extracted for reuse:
 *
 *  1. TS→JS via Monaco's built-in compiler (its worker runs `noEmit: true`, so
 *     we flip it off just for the emit — no bundling of `typescript`).
 *  2. Hard-load the browser-Qt library (`qobject.module.js` → `qt.module.js`)
 *     onto globalThis so the minislib Qt wrappers auto-create native widgets.
 *  3. Strip ES `import`s and bind their names from bundled modules
 *     (`lit`, `@mhersztowski/minislib` + any `…minislib…qt…` specifier).
 *  4. Expose a `display` API (`display.dom(el)` mounts into `host`).
 *  5. Execute in a `new Function` sandbox.
 */

export interface RunHandle {
  stop(): void;
}

export interface RunOptions {
  /** DOM element the component mounts into (via `display.dom`). */
  host: HTMLElement;
  /** Retained for callsite compatibility — no longer used to locate qt libs. */
  userName?: string;
  /** File name — `.ts`/`.tsx` triggers transpilation. */
  fileName?: string;
  /** Console sink for `display.text` / `console.*`. */
  log?: (level: string, text: string) => void;
}

const fmt = (a: unknown): string =>
  typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })();

/** TS→JS using Monaco's compiler with `noEmit` temporarily disabled. */
async function transpileTs(code: string, fileName: string): Promise<string> {
  const tsLang = monaco.languages.typescript.typescriptDefaults;
  const prev = tsLang.getCompilerOptions();
  const uri = monaco.Uri.parse(`inmemory://component-run/${fileName.replace(/[^\w.]/g, '_')}.ts`);
  const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel('', 'typescript', uri);
  model.setValue(code);
  try {
    tsLang.setCompilerOptions({ ...prev, noEmit: false });
    const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
    const worker = await getWorker(uri);
    let js: string | undefined;
    for (let i = 0; i < 40 && js == null; i++) {
      const out = await worker.getEmitOutput(uri.toString());
      js = out.outputFiles?.find((f) => /\.jsx?$/.test(f.name))?.text;
      if (js == null) await new Promise((r) => setTimeout(r, 50));
    }
    if (js == null) throw new Error('Transpilacja TS nie powiodła się (worker nie wyemitował JS).');
    return js;
  } finally {
    tsLang.setCompilerOptions(prev);
    model.dispose();
  }
}

/** Load browser-Qt globals + Lit; throws a clear error if anything is missing.
 *
 *  Qt libs (qobject.module.js / qt.module.js) są SYSTEM assetami wersjonowanymi
 *  razem z kodem — nie user-data. Pobieramy je przez `/api/browser-scripts/content`
 *  (whitelist w `packages/core/browser/scripts.json`), tak samo jak qtLib.ts dla
 *  QtUi Scene Editor. Wcześniej ładowaliśmy z `/public/drive/users/{userName}/lit/qt/*`
 *  co wymagało ręcznego skopiowania plików do Drive użytkownika — na produkcji
 *  `sync.sh push` wyklucza `drive/`, więc świeże instalacje failowały 404.
 */
async function ensureQt(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  if (!g.Lit) g.Lit = await import('lit');

  const BUNDLES: Array<{ path: string; sentinel: string }> = [
    { path: 'packages/core/browser/qt/qobject.module.js', sentinel: 'QObject' },
    { path: 'packages/core/browser/qt/qt.module.js',      sentinel: 'QtCanvas' },
  ];

  for (const { path, sentinel } of BUNDLES) {
    if (g[sentinel]) continue;
    const res = await fetch(`/api/browser-scripts/content?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Nie udało się pobrać ${path} (HTTP ${res.status})`);
    const src = await res.text();
    // Blob-URL module — pozwala załadować jako ES module bez wymogu MIME
    // (endpoint zwraca text/plain, ale Blob wymusza text/javascript).
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    try {
      await import(/* @vite-ignore */ url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (!g[sentinel]) throw new Error(`${path} załadowany, ale ${sentinel} nie pojawił się na globalThis`);
  }

  for (const need of ['QObject', 'Signal', 'QWidget', 'QLabel', 'QtCanvas', 'QVBoxLayout']) {
    if (typeof g[need] !== 'function') {
      throw new Error(`Klasa Qt "${need}" niedostępna po załadowaniu — sprawdź packages/core/browser/qt/qt.module.js`);
    }
  }
}

export async function runBrowserComponent(code: string, opts: RunOptions): Promise<RunHandle> {
  const { host, fileName = 'component.ts', log } = opts;
  const session = { stopped: false, timers: [] as number[] };
  const emit = (level: string, args: unknown[]) => { if (!session.stopped) log?.(level, args.map(fmt).join(' ')); };

  // 1. Transpile.
  let js = code;
  if (/\.tsx?$/i.test(fileName)) js = await transpileTs(code, fileName);

  // 2. Qt + Lit globals.
  await ensureQt();
  if (session.stopped) return { stop() { /* already stopped */ } };

  // 3. display API (mounts into the window host).
  host.replaceChildren();
  const display = {
    dom: (el: unknown) => { if (!session.stopped && el instanceof Node) host.appendChild(el); },
    text: (...a: unknown[]) => emit('log', a),
    clear: () => host.replaceChildren(),
  };
  (globalThis as Record<string, unknown>).display = display;

  const sandboxConsole = {
    log: (...a: unknown[]) => emit('log', a),
    info: (...a: unknown[]) => emit('info', a),
    warn: (...a: unknown[]) => emit('warn', a),
    error: (...a: unknown[]) => emit('error', a),
    debug: (...a: unknown[]) => emit('debug', a),
  };
  const wrapTimer = (orig: (h: TimerHandler, t?: number, ...a: unknown[]) => number) =>
    (h: TimerHandler, t?: number, ...a: unknown[]): number => { const id = orig(h, t, ...a); session.timers.push(id); return id; };

  // 4. Strip imports + bind names from bundled modules.
  const lit = await import('lit');
  const minislib = await import('@mhersztowski/minislib');
  const resolveNs = (spec: string): unknown | null =>
    spec === 'lit' ? lit
      : (spec === '@mhersztowski/minislib' || /minislib/.test(spec)) ? minislib
        : null;
  const nsMap: Record<string, unknown> = {};
  const bindings: string[] = [];
  let nsIdx = 0;
  js = js
    .replace(
      /^\s*import\s+(?:type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
      (_m: string, clauseRaw: string, spec: string) => {
        const ns = resolveNs(spec);
        if (!ns) return '';
        const key = `__m${nsIdx++}`;
        nsMap[key] = ns;
        const clause = clauseRaw.trim();
        if (clause.startsWith('{')) {
          const names = clause.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
            .filter((s) => !s.startsWith('type '))
            .map((s) => { const [o, a] = s.split(/\s+as\s+/).map((x) => x.trim()); return a ? `${o}: ${a}` : o; });
          if (names.length) bindings.push(`const { ${names.join(', ')} } = __ns.${key};`);
        } else if (clause.startsWith('*')) {
          bindings.push(`const ${clause.replace(/\*\s*as\s*/, '').trim()} = __ns.${key};`);
        } else if (clause) {
          bindings.push(`const ${clause} = (__ns.${key}.default ?? __ns.${key});`);
        }
        return '';
      },
    )
    .replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  // 5. Execute.
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', '__ns',
    `"use strict";\nreturn (async () => {\n${bindings.join('\n')}\n${js}\n})();`,
  );
  await fn(
    sandboxConsole,
    wrapTimer(window.setTimeout.bind(window)),
    wrapTimer(window.setInterval.bind(window)),
    window.clearTimeout.bind(window),
    window.clearInterval.bind(window),
    nsMap,
  );

  return {
    stop() {
      session.stopped = true;
      for (const id of session.timers) { window.clearTimeout(id); window.clearInterval(id); }
      session.timers = [];
      host.replaceChildren();
    },
  };
}
