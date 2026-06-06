/**
 * Monaco setup for the Drive page's right-panel code editor.
 *
 * Shares `applyScriptDefaults` with the Automate / Plugin Script editors —
 * that gets us the full mode configuration (completionItems, hovers,
 * signature help, …) and the diagnostic-codes-to-ignore list tuned for
 * loose JS/TS bodies, exactly the same IntelliSense surface Automate Script
 * has.
 *
 * Adds JSON-specific config on top:
 *   - `enableSchemaRequest: true` — Monaco's JSON worker auto-fetches the
 *     schema URL from a file's `$schema` field. This is what lights up
 *     completions and validation on `package.json`, `tsconfig.json`, etc.
 *     without us having to ship a schema bundle. (The global setting in
 *     monacoWorkers.ts has it off; we flip it on here because Drive is the
 *     one surface where users are likely to edit hand-crafted JSON files
 *     and want the help.)
 *   - A small built-in list of `fileMatch` schemas for common project files
 *     so users don't need to type `$schema` themselves to get help on
 *     `package.json` / `tsconfig.json`.
 *
 * Idempotent — safe to call on every Editor `beforeMount`.
 */

import type { Monaco } from '@monaco-editor/react';
import { applyScriptDefaults } from '../../modules/automate/designer/automateMonacoSetup';
import {
  PERSON_SCHEMA,
  TASK_SCHEMA,
  APP_CONFIG_SCHEMA,
  PRODUCT_SCHEMA,
} from './driveJsonSchemas';

/**
 * Common JSON schemas that should be applied by filename. The schemas live on
 * the SchemaStore CDN — Monaco fetches them on first use and the JSON worker
 * caches them, so the user pays once per file type.
 */
// `schema` inline = Monaco uses the literal object instead of fetching the
// URI. We use it both for ecosystem files (package.json etc. — URI tells
// Monaco where to fetch) AND for our in-house example pairs in
// drive/mdscript/json/ — there the inline schema lets completions work
// without going through HTTP / VFS at all.
//
// The "in-house" entries below mirror the JSON Schema files committed to
// VFS at `drive/mdscript/json/schema/`. They're duplicated intentionally:
// the on-disk schema is the canonical version a user can study/copy, the
// inline version is what Monaco actually consults at edit time.
const JSON_FILE_SCHEMAS: ReadonlyArray<{
  uri: string;
  fileMatch: string[];
  schema?: object;
}> = [
  // Common ecosystem files — fetched from SchemaStore on first use.
  { uri: 'https://json.schemastore.org/package.json',           fileMatch: ['package.json'] },
  { uri: 'https://json.schemastore.org/tsconfig.json',          fileMatch: ['tsconfig.json', 'tsconfig.*.json'] },
  { uri: 'https://json.schemastore.org/eslintrc.json',          fileMatch: ['.eslintrc.json', '.eslintrc'] },
  { uri: 'https://json.schemastore.org/prettierrc.json',        fileMatch: ['.prettierrc', '.prettierrc.json'] },
  { uri: 'https://json.schemastore.org/jsconfig.json',          fileMatch: ['jsconfig.json'] },
  { uri: 'https://json.schemastore.org/swagger-2.0.json',       fileMatch: ['swagger.json'] },
  { uri: 'https://json.schemastore.org/openapi.json',           fileMatch: ['openapi.json'] },
  { uri: 'https://json.schemastore.org/composer.json',          fileMatch: ['composer.json'] },
  { uri: 'https://json.schemastore.org/vercel.json',            fileMatch: ['vercel.json'] },
  // In-house examples — inline schemas, no network.
  { uri: 'inmemory://drive/mdscript/json/schema/person.json',      fileMatch: ['person.example.json'],     schema: PERSON_SCHEMA },
  { uri: 'inmemory://drive/mdscript/json/schema/task.json',        fileMatch: ['task.example.json'],       schema: TASK_SCHEMA },
  { uri: 'inmemory://drive/mdscript/json/schema/app-config.json',  fileMatch: ['app-config.example.json'], schema: APP_CONFIG_SCHEMA },
  { uri: 'inmemory://drive/mdscript/json/schema/product.json',     fileMatch: ['product.example.json'],    schema: PRODUCT_SCHEMA },
];

export function setupDriveEditorMonaco(monaco: Monaco): void {
  // 1. TS/JS — same full IntelliSense surface as the Automate Script editor.
  //    `applyScriptDefaults` is what makes hover docs, signature help and
  //    completions on local variables, imports, etc. actually work.
  applyScriptDefaults(monaco);

  // 2. JSON — auto-fetch schemas from `$schema` + apply our built-in list
  //    by filename so package.json / tsconfig.json get completions without
  //    the user typing anything special.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonDefaults = (monaco.languages as any).json?.jsonDefaults;
    if (jsonDefaults && typeof jsonDefaults.setDiagnosticsOptions === 'function') {
      jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: true,
        // Fetch schemas declared via `$schema` in the file. The JSON worker
        // also handles caching so repeat opens of the same file don't re-fetch.
        enableSchemaRequest: true,
        schemas: [...JSON_FILE_SCHEMAS],
      });
    } else {
      console.warn('[DriveMonaco] jsonDefaults missing — JSON setup skipped');
    }
  } catch (err) {
    // Older Monaco builds without the JSON service — silently skip.
    console.warn('[DriveMonaco] JSON setup failed:', err);
  }
}
