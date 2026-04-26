import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// Standard Monaco JSON worker — no custom patch needed since the onDidChange race
// (which required the patched worker) never fires in this app.
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as monaco from 'monaco-editor';

// ---------------------------------------------------------------------------
// Patch A: Debounce WorkerManager._stopWorker() via jsonDefaults.onDidChange
//
// Monaco 0.52.2: WorkerManager registers onDidChange(() => _stopWorker()).
// If something fires onDidChange while the INITIALIZE handshake is in flight,
// _stopWorker() kills the worker before _onModuleLoaded resolves → hang.
//
// Fix: shadow onDidChange on the instance so every listener is wrapped with a
// 500 ms debounce. In practice onDidChange never fires in this app, but the
// debounce is kept as a safety net.
// ---------------------------------------------------------------------------
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonDefaults = (monaco.languages as any).json?.jsonDefaults;

  if (jsonDefaults) {
    console.log('[Monaco] patching jsonDefaults.onDidChange (debounce 500ms)');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origEvent = jsonDefaults.onDidChange as (...a: any[]) => any;
    let lastFireAt = 0;

    Object.defineProperty(jsonDefaults, 'onDidChange', {
      get() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (listener: (...args: any[]) => void, _thisArgs?: unknown, disposables?: unknown) => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const debounced = (...args: any[]) => {
            const now = Date.now();
            console.warn(
              `[Monaco] jsonDefaults.onDidChange fired (Δ${now - lastFireAt}ms) — debouncing 500ms`,
              new Error('caller').stack,
            );
            lastFireAt = now;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => { timer = null; listener(...args); }, 500);
          };
          // origEvent closes over the Emitter instance — do not rebind.
          return origEvent(debounced, undefined, disposables);
        };
      },
      configurable: true,
    });
  } else {
    console.warn('[Monaco] jsonDefaults NOT found — debounce patch skipped');
  }
}

// ---------------------------------------------------------------------------
// Patch B: JSON worker languageSettings guard + getProxy() timeout + restart
//
// Root cause A ("No Suggestions" / immediate crash):
//   WorkerManager._getClient() builds createData = { languageSettings: this._defaults.diagnosticsOptions }.
//   In a race, diagnosticsOptions may be null/undefined at call time.
//   JSONWorker.configure() then accesses languageSettings.schemas → throws →
//   $loadForeignModule rejects → _foreignProxy rejects → "No Suggestions".
//
// Fix A: intercept createWebWorker and ensure createData.languageSettings is
//   never null/undefined before the worker is created.
//
// Root cause B ("Loading..." forever):
//   If _onModuleLoaded never resolves (worker killed mid-handshake), getProxy()
//   hangs forever → provideCompletionItems hangs → "Loading..." forever.
//
// Fix B: wrap getProxy() with a 5 s timeout. On timeout:
//   1. Reject _client so Monaco closes the stuck "Loading..." widget.
//   2. Call setDiagnosticsOptions() → fires onDidChange → debounced 500 ms →
//      WorkerManager._stopWorker() clears _client → next completion creates a
//      fresh worker.
//
// Note: jsonMode.js accesses monaco.editor.createWebWorker via a live getter
// (__copyProps/__reExport pattern), so our runtime patch IS picked up in prod.
// ---------------------------------------------------------------------------

const _safeJsonLanguageSettings = {
  validate: true,
  allowComments: true,
  schemas: [],
  enableSchemaRequest: false,
  schemaRequest: 'warning' as const,
  schemaValidation: 'warning' as const,
};

{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origCreateWebWorker = (monaco.editor as any).createWebWorker as ((opts: any) => any) | undefined;

  if (typeof origCreateWebWorker === 'function') {
    const TIMEOUT_MS = 5000;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (monaco.editor as any).createWebWorker = function (opts: any) {
      // Fix A: guard against null/undefined languageSettings in createData.
      if (opts?.label === 'json' && opts?.createData?.languageSettings == null) {
        console.log('[Monaco] JSON worker createData.languageSettings was null — injecting safe defaults');
        opts = { ...opts, createData: { ...opts.createData, languageSettings: _safeJsonLanguageSettings } };
      }

      // Call through with the original `this` so internal service injection works.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ww = origCreateWebWorker.call(this as any, opts);

      if (opts?.label === 'json') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const origGetProxy = (ww.getProxy as () => Promise<any>).bind(ww);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ww.getProxy = function (): Promise<any> {
          const t0 = Date.now();
          const original = origGetProxy();
          let timer: ReturnType<typeof setTimeout>;

          return new Promise((resolve, reject) => {
            timer = setTimeout(() => {
              console.warn(`[Monaco] JSON worker getProxy timed out after ${TIMEOUT_MS}ms — restarting`);
              // Trigger WorkerManager._stopWorker() via the debounced onDidChange listener.
              // Spreading the current options creates a new object reference so
              // setDiagnosticsOptions always fires _onDidChange regardless of content.
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const jd = (monaco.languages as any).json?.jsonDefaults;
                if (jd) jd.setDiagnosticsOptions({ ...jd.diagnosticsOptions });
              } catch { /* ignore */ }
              reject(new Error('[Monaco] JSON worker init timeout'));
            }, TIMEOUT_MS);

            original.then(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r: any) => { clearTimeout(timer); console.log(`[Monaco] JSON worker getProxy resolved in ${Date.now() - t0}ms`); resolve(r); },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (e: any) => { clearTimeout(timer); console.warn('[Monaco] JSON worker getProxy rejected:', e); reject(e); },
            );
          });
        };

        console.log(`[Monaco] JSON web worker getProxy wrapped with ${TIMEOUT_MS}ms timeout`);
      }

      return ww;
    };

    console.log('[Monaco] monaco.editor.createWebWorker intercepted for JSON worker timeout');
  } else {
    console.warn('[Monaco] monaco.editor.createWebWorker not found — timeout patch skipped');
  }
}

// CSS override: Monaco's suggest widget z-index is low and gets buried under MUI stacking contexts.
{
  const style = document.createElement('style');
  style.textContent = `
    .monaco-editor .suggest-widget { z-index: 99999 !important; position: fixed !important; }
    .monaco-editor .overflowingContentWidgets { z-index: 99999 !important; }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Patch C: Set _VSCODE_FILE_ROOT to prevent WorkerDescriptor constructor crash
//
// WorkerDescriptor constructor calls:
//   this.esmModuleLocation = FileAccess.asBrowserUri('vs/language/json/jsonWorker.esm.js')
//
// FileAccess.asBrowserUri → toUri(path) (ESM path — no moduleIdToUrl arg):
//   if (!_VSCODE_FILE_ROOT) return URI.parse(moduleIdToUrl.toUrl(...))
//   → TypeError: Cannot read properties of undefined (reading 'toUrl')
//
// Without _VSCODE_FILE_ROOT this constructor throws and createWebWorker fails immediately.
// The resulting esmModuleLocation URI is never actually used when MonacoEnvironment.getWorker
// is a function (getWorker() returns early from the first if-branch). We just need the
// constructor to not throw.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(globalThis as any)._VSCODE_FILE_ROOT) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any)._VSCODE_FILE_ROOT = `${window.location.origin}/`;
  console.log(`[Monaco] _VSCODE_FILE_ROOT set to: ${window.location.origin}/`);
}

// Define the getWorker implementation using our Vite-bundled workers.
function _getWorker(_: unknown, label: string) {
  console.log(`[Monaco] getWorker called for label: ${label}`);
  if (label === 'json') return new jsonWorker();
  if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
  if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
  if (label === 'typescript' || label === 'javascript') return new tsWorker();
  return new editorWorker();
}

// Lock MonacoEnvironment so CDN Monaco (if it somehow loads despite loader.config) cannot
// overwrite our getWorker with CDN-based worker URLs.
// A plain assignment `self.MonacoEnvironment = {...}` would be silently overwritten by
// CDN Monaco 0.55.x which does `window.MonacoEnvironment = { getWorkerUrl: ... }`.
// Object.defineProperty with a setter that ignores writes prevents that.
const _monacoEnv = { getWorker: _getWorker };
try {
  Object.defineProperty(globalThis, 'MonacoEnvironment', {
    get() { return _monacoEnv; },
    // Silently block any overwrite (CDN Monaco, AMD loader, etc.)
    set(v: unknown) {
      console.warn('[Monaco] Blocked attempt to overwrite MonacoEnvironment:', v);
    },
    configurable: true, // Allow redefinition if monacoWorkers.ts is re-evaluated
  });
  console.log('[Monaco] MonacoEnvironment locked with bundled workers');
} catch {
  // defineProperty failed (already non-configurable from a previous definition) — fall back
  console.warn('[Monaco] Could not lock MonacoEnvironment, falling back to direct assignment');
  try {
    (self as unknown as Record<string, unknown>).MonacoEnvironment = _monacoEnv;
  } catch {
    console.warn('[Monaco] Could not set MonacoEnvironment at all');
  }
}

// Full mode configuration — completionItems enabled from the start.
// Type definitions are loaded via createModel() which does NOT restart the TS worker,
// so the worker is available for completions immediately.
const fullModeCfg = {
  completionItems: true,
  hovers: true, documentSymbols: true, definitions: true, references: true,
  documentHighlights: true, rename: true, diagnostics: true,
  onTypeFormattingEdits: true, signatureHelp: true, codeActions: true, inlayHints: true,
};

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
tsDefaults.setEagerModelSync(true);
tsDefaults.setModeConfiguration(fullModeCfg);

const jsDefaults = monaco.languages.typescript.javascriptDefaults;
jsDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  allowJs: true,
  checkJs: false,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  strict: false,
  noEmit: true,
  allowNonTsExtensions: true,
});
jsDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
jsDefaults.setEagerModelSync(true);
jsDefaults.setModeConfiguration(fullModeCfg);

// ---------------------------------------------------------------------------
// JSON defaults — enable validation and comments. Schemas are loaded
// dynamically from the VFS by MonacoMultiEditor when a JSON file is opened
// (reads the "$schema" field, loads the schema file, registers it inline).
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonDefaults = (monaco.languages as any).json?.jsonDefaults;
if (jsonDefaults) {
  jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    enableSchemaRequest: false,
    schemas: [],
  });
} else {
  console.warn('[Monaco] jsonDefaults not found');
}
