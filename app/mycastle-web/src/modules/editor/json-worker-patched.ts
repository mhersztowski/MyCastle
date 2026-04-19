/**
 * Custom JSON worker entry point.
 *
 * Monaco 0.52.2 bug: when WorkerManager._getClient() creates the JSON worker,
 * it passes createData.languageSettings = jsonDefaults.diagnosticsOptions.
 * In a race where diagnosticsOptions is evaluated to undefined (e.g. during jsonMode.js
 * lazy-load while a configure-change cycle is in flight), the worker receives
 * languageSettings = undefined and crashes inside JSONWorker.configure():
 *   "Cannot read properties of undefined (reading 'schemas')"
 *
 * Fix: patch EditorSimpleWorker.prototype.$loadForeignModule to guard against
 * undefined createData.languageSettings before forwarding to JSONWorker.
 * This patch is applied at module-evaluation time and therefore takes effect
 * for every EditorSimpleWorker instance, including the one created by editor.worker.js
 * when the first message arrives.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — internal Monaco module, not in public typings
import { EditorSimpleWorker } from 'monaco-editor/esm/vs/editor/common/services/editorSimpleWorker';

const _safeJsonLanguageSettings = {
  validate: true,
  allowComments: true,
  schemas: [],
  enableSchemaRequest: false,
  schemaRequest: 'warning' as const,
  schemaValidation: 'warning' as const,
};

// Wrap $loadForeignModule to ensure languageSettings is never undefined when
// the JSON worker module is loaded.
const _origLoadForeignModule = (EditorSimpleWorker.prototype as any).$loadForeignModule;
(EditorSimpleWorker.prototype as any).$loadForeignModule = function (
  moduleId: string,
  createData: any,
  foreignHostMethods: string[],
) {
  if (
    typeof moduleId === 'string' &&
    moduleId.toLowerCase().includes('json') &&
    createData != null &&
    createData.languageSettings == null
  ) {
    createData = { ...createData, languageSettings: _safeJsonLanguageSettings };
  }
  return _origLoadForeignModule.call(this, moduleId, createData, foreignHostMethods);
};

// Import the real JSON worker entry point.
// This sets self.onmessage = () => worker.initialize(jsonFactory) as a side-effect.
// The prototype patch above is already in place before the first message fires.
import 'monaco-editor/esm/vs/language/json/json.worker';
