import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as monaco from 'monaco-editor';

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

monaco.editor.onDidCreateEditor((editor) => {
  editor.updateOptions({
    quickSuggestions: { other: 'on', comments: 'off', strings: 'off' },
    suggestOnTriggerCharacters: true,
    // Hide word-based (abc) completions — TS worker provides type-aware completions.
    // showWords=false filters CompletionItemKind.Text from the suggest widget.
    // This is safe now that completionItems=true: TS variable/method/function kinds
    // are NOT Text and will still appear.
    suggest: { showWords: false },
  });
});
