/**
 * runSceneScript.ts — transpilacja i wykonanie skryptu sceny w przeglądarce.
 *
 * TS→JS robi kompilator wbudowany w Monaco (jest już w bundlu cad-app), więc nie
 * dociągamy paczki `typescript` ani nie potrzebujemy backendu. Ten sam trik
 * (chwilowe wyłączenie `noEmit`) stosuje `runBrowserComponent` w mycastle-web.
 */
import * as THREE from 'three';
import * as sceneCore from '@mhersztowski/core-scene3d';
import type { SceneGraph } from '@mhersztowski/core-scene3d';
import { SceneScriptSession, stripImports, type SceneScriptLogEntry } from './sceneScript';

/**
 * TS→JS kompilatorem Monaco (jego worker ma `noEmit: true`, więc zdejmujemy je na czas emisji).
 *
 * Monaco i konfiguracja jego workerów są ładowane dynamicznie: „Run" ma nie
 * dociągać kilku megabajtów edytora do startu aplikacji, a bez importu
 * `editor/monacoWorkers` worker `typescript` nie miałby jak się uruchomić
 * (dotąd konfigurował go tylko panel edytora kodu).
 */
export async function transpileSceneScript(code: string, fileName = 'scene-script.ts'): Promise<string> {
  await import('../editor/monacoWorkers');
  const monaco = await import('monaco-editor');
  const tsLang = monaco.languages.typescript.typescriptDefaults;
  const prev = tsLang.getCompilerOptions();
  const uri = monaco.Uri.parse(`inmemory://scene-script/${fileName.replace(/[^\w.]/g, '_')}`);
  const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel('', 'typescript', uri);
  model.setValue(code);
  try {
    tsLang.setCompilerOptions({ ...prev, noEmit: false });
    const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
    const worker = await getWorker(uri);
    let js: string | undefined;
    for (let i = 0; i < 40 && js == null; i++) {
      const out = await worker.getEmitOutput(uri.toString());
      js = out.outputFiles?.find((f: { name: string }) => /\.jsx?$/.test(f.name))?.text;
      if (js == null) await new Promise((r) => setTimeout(r, 50));
    }
    if (js == null) throw new Error('Transpilacja TS nie powiodła się (worker Monaco nie wyemitował JS).');
    return js;
  } finally {
    tsLang.setCompilerOptions(prev);
    model.dispose();
  }
}

/** Moduły, które skrypt może zaimportować — reszta importów jest po prostu usuwana. */
function resolveModule(spec: string): unknown | null {
  if (spec === 'three' || spec.startsWith('three/')) return THREE;
  if (spec === '@mhersztowski/core-scene3d' || /core-scene3d/.test(spec)) return sceneCore;
  return null;
}

export interface RunSceneScriptOptions {
  /** Graf uruchomionej sceny (kopia dokumentu — skrypt nie modyfikuje edytora). */
  graph: SceneGraph;
  code: string;
  fileName?: string;
  onLog?: (entry: SceneScriptLogEntry) => void;
}

/**
 * Uruchamia skrypt: transpiluje, usuwa importy, wykonuje w `new Function` i
 * podłącza pętlę klatek. Zwraca sesję — `session.stop()` zatrzymuje pętlę,
 * timery i dalsze logowanie.
 *
 * Sesja jest zwracana także wtedy, gdy ciało skryptu rzuci wyjątkiem: część,
 * która zdążyła się wykonać (np. `scene.onFrame`), już działa, a błąd trafia do
 * konsoli okna. Dzięki temu „Run" nie kończy się białym ekranem bez wyjaśnienia.
 */
export async function runSceneScript(opts: RunSceneScriptOptions): Promise<SceneScriptSession> {
  const { graph, code, fileName = 'scene-script.ts', onLog } = opts;
  const session = new SceneScriptSession(graph, { onLog });

  let js = code;
  try {
    if (/\.tsx?$/i.test(fileName)) js = await transpileSceneScript(code, fileName);
    const { code: body, bindings, namespaces } = stripImports(js, resolveModule);

    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'scene', 'THREE', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', '__ns',
      `"use strict";\nreturn (async () => {\n${bindings.join('\n')}\n${body}\n})();`,
    );

    const frameLoop = (now: number) => {
      if (session.stopped) return;
      session.tick(now);
      requestAnimationFrame(frameLoop);
    };
    requestAnimationFrame(frameLoop);

    await fn(
      session.api, THREE, session.api.console,
      session.api.setTimeout, session.api.setInterval, session.api.clearTimeout, session.api.clearInterval,
      namespaces,
    );
  } catch (e) {
    onLog?.({ level: 'error', text: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
  return session;
}
