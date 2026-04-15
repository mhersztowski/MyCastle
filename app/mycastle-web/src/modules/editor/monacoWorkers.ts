import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import * as monaco from 'monaco-editor';

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// Configure TypeScript defaults once at module load time — before any models are created.
// This ensures the worker starts with the correct options from the very first request.
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
