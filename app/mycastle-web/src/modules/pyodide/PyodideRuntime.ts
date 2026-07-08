/**
 * PyodideRuntime — runs CPython in the browser (Pyodide WASM) inside a dedicated
 * Web Worker so heavy computation never blocks the UI thread.
 *
 * Design notes:
 *  • The worker is created from a Blob so it can `importScripts()` the Pyodide
 *    loader straight off the CDN — no `pyodide` npm dependency, nothing bundled.
 *  • Everything loads LAZILY: the ~10 MB runtime only downloads on `init()`, and
 *    each package (built-in via `loadPackage`, PyPI via `micropip`) only on first
 *    use. Already-loaded packages are skipped.
 *  • Progress messages drive a loading screen (see PyodideLoadingOverlay).
 */

export const PYODIDE_VERSION = '0.27.2';
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type PyodidePhase = 'idle' | 'runtime' | 'packages' | 'ready' | 'running' | 'error';

export interface PyodideProgress {
  phase: PyodidePhase;
  /** Human-readable detail for the loading screen. */
  message: string;
}

export interface PyodideConfig {
  enabled: boolean;
  /** Built-in Pyodide packages (numpy, pandas, …) loaded via `loadPackage`. */
  packages: string[];
  /** Pure-Python / pure-wheel packages installed from PyPI via `micropip`. */
  pypi: string[];
}

export function emptyPyodideConfig(): PyodideConfig {
  return { enabled: false, packages: [], pypi: [] };
}

// ── worker source (runs in the Blob worker; kept as a string) ────────────────

function workerSource(): string {
  return `
let pyodide = null;
const loaded = new Set();       // built-in package names already loaded
const pipInstalled = new Set(); // PyPI names already installed

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  const reply = (msg) => self.postMessage({ id, ...msg });
  const progress = (phase, message) => self.postMessage({ type: 'progress', phase, message });
  try {
    if (type === 'init') {
      progress('runtime', 'Pobieranie środowiska Python (Pyodide)…');
      importScripts(payload.indexURL + 'pyodide.js');
      pyodide = await loadPyodide({ indexURL: payload.indexURL });
      reply({ type: 'ok' });
      return;
    }
    if (!pyodide) throw new Error('Pyodide not initialised');

    if (type === 'loadPackages') {
      const builtin = (payload.packages || []).filter((p) => p && !loaded.has(p));
      if (builtin.length) {
        progress('packages', 'Ładowanie pakietów: ' + builtin.join(', '));
        await pyodide.loadPackage(builtin);
        builtin.forEach((p) => loaded.add(p));
      }
      const pypi = (payload.pypi || []).filter((p) => p && !pipInstalled.has(p));
      if (pypi.length) {
        progress('packages', 'Instalacja z PyPI: ' + pypi.join(', '));
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install(pypi);
        pypi.forEach((p) => pipInstalled.add(p));
      }
      reply({ type: 'ok' });
      return;
    }

    if (type === 'run') {
      progress('running', 'Wykonywanie kodu Python…');
      // Auto-pull any built-in package a bare import needs (lazy, on demand).
      try { await pyodide.loadPackagesFromImports(payload.code); } catch (_) { /* ignore */ }
      // Expose input globals as Python variables.
      const globals = payload.globals || {};
      for (const k of Object.keys(globals)) pyodide.globals.set(k, globals[k]);
      const raw = await pyodide.runPythonAsync(payload.code);
      let result;
      try { result = raw && raw.toJs ? raw.toJs({ dict_converter: Object.fromEntries }) : raw; }
      catch (_) { result = raw == null ? null : String(raw); }
      if (raw && raw.destroy) { try { raw.destroy(); } catch (_) {} }
      reply({ type: 'ok', result });
      return;
    }
    throw new Error('Unknown message type: ' + type);
  } catch (err) {
    self.postMessage({ id, type: 'error', error: (err && err.message) || String(err) });
  }
};
`;
}

// ── main-thread manager ──────────────────────────────────────────────────────

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class PyodideRuntime {
  private worker: Worker | null = null;
  private blobUrl: string | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private initPromise: Promise<void> | null = null;
  private onProgress?: (p: PyodideProgress) => void;

  constructor(onProgress?: (p: PyodideProgress) => void) {
    this.onProgress = onProgress;
  }

  private emit(phase: PyodidePhase, message: string) {
    this.onProgress?.({ phase, message });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const blob = new Blob([workerSource()], { type: 'application/javascript' });
    this.blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(this.blobUrl); // classic worker → importScripts() works
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data || {};
      if (d.type === 'progress') { this.emit(d.phase as PyodidePhase, d.message); return; }
      const p = this.pending.get(d.id);
      if (!p) return;
      this.pending.delete(d.id);
      if (d.type === 'error') p.reject(new Error(d.error));
      else p.resolve(d.result);
    };
    worker.onerror = (e) => {
      const err = new Error(e.message || 'Pyodide worker crashed');
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
      this.emit('error', err.message);
    };
    this.worker = worker;
    return worker;
  }

  private call(type: string, payload: unknown): Promise<unknown> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    });
  }

  /** Download + boot the Python runtime (once). Safe to call repeatedly. */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.emit('runtime', 'Uruchamianie środowiska Python…');
      this.initPromise = this.call('init', { indexURL: PYODIDE_INDEX_URL })
        .then(() => { this.emit('ready', 'Środowisko gotowe.'); })
        .catch((e) => { this.initPromise = null; this.emit('error', e.message); throw e; });
    }
    return this.initPromise;
  }

  /** Lazily load built-in packages + install PyPI packages (skips already-loaded). */
  async loadPackages(cfg: { packages?: string[]; pypi?: string[] }): Promise<void> {
    await this.init();
    const packages = cfg.packages ?? [];
    const pypi = cfg.pypi ?? [];
    if (!packages.length && !pypi.length) { this.emit('ready', 'Środowisko gotowe.'); return; }
    await this.call('loadPackages', { packages, pypi });
    this.emit('ready', 'Środowisko gotowe.');
  }

  /** Run Python. `globals` are injected as Python variables; the last expression's
   *  value is returned (converted to JS). */
  async runPython(code: string, globals?: Record<string, unknown>): Promise<unknown> {
    await this.init();
    const r = await this.call('run', { code, globals: globals ?? {} });
    this.emit('ready', 'Środowisko gotowe.');
    return r;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null; }
    this.pending.forEach((p) => p.reject(new Error('Pyodide disposed')));
    this.pending.clear();
    this.initPromise = null;
  }
}
