/**
 * Monaco early bootstrap — MUST be the first import in `main.tsx`.
 *
 * Problem this solves
 * -------------------
 * `@monaco-editor/react` lazy-loads Monaco through `@monaco-editor/loader`,
 * which by default fetches Monaco 0.55.x from a CDN (`cdn.jsdelivr.net/npm/
 * monaco-editor/...`). When that races against our bundled Monaco 0.52.x,
 * we end up with TWO Monaco runtimes in the same page:
 *
 *   - Bundled (Vite `?worker` imports + `monaco-editor/esm/...`)
 *   - CDN (AMD loader, `editor.main.js`, separate workers)
 *
 * The newer CDN client then sends TS worker requests
 * (`getCompletionsAtPosition`, `getSyntacticDiagnostics`, `provideInlayHints`,
 * `getCodeFixesAtPosition`, `getNavigationTree`) which our older bundled
 * `ts.worker` doesn't implement — so the worker logs
 * `Missing requestHandler or method: …` and **completions silently never fire**.
 * That was the actual cause of "no IntelliSense in the script dialog".
 *
 * Why it raced before
 * -------------------
 * Vite hoists ES module imports depth-first. `main.tsx` did
 *   `import { loader } from '@monaco-editor/react'`
 *   `import * as monacoEditor from 'monaco-editor'`
 *   loader.config({ monaco: monacoEditor }); loader.init();
 * But the *body* of main.tsx (the `loader.config` call) doesn't run until
 * AFTER every transitively-imported module has finished its own top-level
 * code. Some of those modules import `@monaco-editor/react` themselves and
 * trigger `loader.init()` at module-eval time — at that point
 * `state.monaco` is still null and `@monaco-editor/loader` falls through to
 * the CDN script-injection branch.
 *
 * Fix
 * ---
 * Put the loader config in its OWN module and import that module FIRST in
 * main.tsx. Vite then evaluates this file before any other tree node — so
 * `state.monaco` is populated before any sibling import has a chance to call
 * `loader.init()`.
 *
 * As a belt-and-braces measure, we also:
 *   - Stash `window.monaco = monacoEditor` so `@monaco-editor/loader`'s
 *     secondary `window.monaco && window.monaco.editor` short-circuit hits.
 *   - Override `document.head.appendChild` to refuse any `<script>` tag
 *     pointing at a CDN Monaco URL — guarantees no second runtime can sneak
 *     in even if the config above is somehow bypassed.
 */

import * as monacoEditor from 'monaco-editor';
// Re-exported from @monaco-editor/react (which is the package that has TS types
// bundled). Goes to the same `@monaco-editor/loader` singleton internally, so
// configuring it here propagates to every `<Editor>` mount in the app.
import { loader } from '@monaco-editor/react';

// 1. Make our bundled Monaco visible via the global short-circuit path that
//    @monaco-editor/loader checks before falling through to CDN.
//    eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).monaco = monacoEditor;

// 2. Primary path — tell @monaco-editor/loader to USE our bundled Monaco.
//    `paths.vs` is set to a no-op data URL so even if init() somehow tries
//    to fetch loader.js from CDN, the request resolves to harmless empty JS
//    instead of a real script load.
loader.config({
  monaco: monacoEditor,
  // base64-encoded `// no-op` — if loader ever tries to fetch `${vs}/loader.js`
  // this resolves to a harmless inline script instead of a CDN GET.
  paths: { vs: 'data:text/javascript;base64,Ly8gbm8tb3A=' },
});

// 3. Eagerly resolve the loader's wrapper promise with our monaco. Any later
//    `loader.init()` call from `<Editor>` mounts just resolves the already-
//    resolved promise — no CDN trip.
void loader.init();

// 4. Final guard — refuse to attach any <script src=…cdn.jsdelivr…monaco…> to
//    the document. Belt-and-braces in case 1–3 miss an edge case. Logs the
//    blocked URL so we can see it during development if it ever fires.
function isMonacoCdnScript(node: Node): boolean {
  if (!(node instanceof HTMLScriptElement)) return false;
  const src = node.src || '';
  // The CDN loader fetches multiple URLs: `…/loader.js`, `…/editor.main.js`,
  // `…/editor.main.nls.js`. They all share the `monaco-editor` substring.
  return /cdn\.jsdelivr\.net.*monaco-editor/.test(src)
      || /unpkg\.com.*monaco-editor/.test(src);
}

for (const target of [document.head, document.body].filter(Boolean) as HTMLElement[]) {
  const origAppendChild = target.appendChild.bind(target);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (target as any).appendChild = function (node: Node) {
    if (isMonacoCdnScript(node)) {
      // eslint-disable-next-line no-console
      console.warn('[Monaco] Blocked CDN script load:', (node as HTMLScriptElement).src);
      return node;
    }
    return origAppendChild(node);
  };
}

// eslint-disable-next-line no-console
console.log('[Monaco] Early config done — bundled Monaco singleton handed to loader');
