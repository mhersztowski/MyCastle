import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// Use patched JSON worker: guards against undefined languageSettings race in Monaco 0.52.2
// (WorkerManager._getClient passes jsonDefaults.diagnosticsOptions which can be undefined
// during jsonMode.js lazy-load, causing JSONWorker.configure() to crash and hang completions)
import jsonWorker from '@/modules/editor/json-worker-patched?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as monaco from 'monaco-editor';

// ---------------------------------------------------------------------------
// Patch: debounce WorkerManager._stopWorker() to prevent JSON completion hang
//
// Monaco 0.52.2 bug:
// 1. A JSON file is opened → setupMode() → WorkerManager created
// 2. WorkerManager registers: jsonDefaults.onDidChange(() => _stopWorker())
// 3. Something fires jsonDefaults.onDidChange while worker is initialising
// 4. _stopWorker() disposes the worker → INITIALIZE reply never arrives
// 5. _onModuleLoaded (a pending Promise in _pendingReplies) is NEVER rejected
//    because SimpleWorkerProtocol._pendingReplies has no cleanup on dispose
// 6. proxy.$ping() → sendMessageBarrier() → await _onModuleLoaded → hangs ∞
// 7. _foreignProxy hangs → completion provider hangs → "Loading..." forever
//
// Fix: intercept jsonDefaults.onDidChange so every listener registered through
// it is wrapped with a 500ms debounce. This gives the JSON worker enough time to
// finish INITIALIZE before any configuration change kills it.
// Additionally log each firing with a stack trace to identify the unknown caller.
// ---------------------------------------------------------------------------
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonLang = (monaco.languages as any).json;
  const jsonDefaults = jsonLang?.jsonDefaults;

  if (jsonDefaults) {
    // jsonDefaults.onDidChange is defined as a getter on the prototype that returns
    // an Event<T> function: (listener, thisArgs?, disposables?) => IDisposable.
    // We shadow it on the instance so our version is called instead.
    // origEventFn is the Monaco Event<T> function — it already closes over the internal
    // Emitter instance, so we must NOT rebind it with .call(). Just invoke directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origEventFn = jsonDefaults.onDidChange as (...a: any[]) => any;

    let lastFireAt = 0;

    Object.defineProperty(jsonDefaults, 'onDidChange', {
      // Return a wrapped Event<T> function every time the property is read.
      get() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (listener: (...args: any[]) => void, _thisArgs?: unknown, disposables?: unknown) => {
          // Debounce: gives the JSON worker 500 ms to finish its INITIALIZE handshake
          // before any configuration change kills it via _stopWorker().
          let timer: ReturnType<typeof setTimeout> | null = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const debounced = (...args: any[]) => {
            const now = Date.now();
            const delta = now - lastFireAt;
            lastFireAt = now;
            console.warn(
              `[Monaco] jsonDefaults.onDidChange fired (Δ${delta}ms) — debouncing 500ms`,
              new Error('caller').stack,
            );
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => {
              timer = null;
              listener(...args);
            }, 500);
          };
          // Pass undefined for thisArgs — the original listener is already an arrow fn
          return origEventFn(debounced, undefined, disposables);
        };
      },
      configurable: true,
    });
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

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

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


