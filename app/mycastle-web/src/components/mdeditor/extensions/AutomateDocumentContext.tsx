/**
 * AutomateDocumentContext - wspoldzielony kontekst wykonawczy
 * dla blokow skryptowych w dokumencie Markdown
 */

import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { AutomateSystemApi, LogEntry } from '../../../modules/automate/engine/AutomateSystemApi';
import { AutomateSandbox } from '../../../modules/automate/engine/AutomateSandbox';
import { Aura, aura } from '../../../../../../packages/core/browser/aura/aura';
import { createAutomateApi, createDisplay, type AutomateApi } from '../../../../../../packages/core/browser/api/api';
import { createAuraPreviewHost } from '../../../modules/voiceactions/auraPreviewHost';
import { prepareAutomateScript } from '../../../modules/voiceactions/auraScriptRuntime';
import { Scene, isNode3D, isLayer, setSceneHost, utworzHostaSceny } from '../../../modules/scene-script';
import { Kasia, kasia as kasiaAlias } from '../../../../../../packages/core/browser/kasia/kasia';
import { preloadLibrariesForCode } from './automateLibraries';
import { useFilesystem } from '../../../modules/filesystem/FilesystemContext';
import { useNotification } from '../../../modules/notification';
import { useAuth } from '../../../modules/auth';
import { useMqtt } from '../../../modules/mqttclient';
import { useMdEnv } from './MdEnvContext';
import { setAutomateEnvProvider } from '../../../modules/automate/designer/automateMonacoSetup';

// Typy danych wyjsciowych display
//
// 'html' carries a raw HTML string (rendered via dangerouslySetInnerHTML in
//   the 'html' view mode of the script block).
// 'dom' carries a *live* HTMLElement that the renderer mounts via appendChild.
//   This is what makes Three.js work — the renderer's canvas needs to stay
//   in the DOM so its animation loop keeps painting; a string-serialised
//   snapshot would freeze on the first frame.
export interface DisplayItem {
  /** Stabilny, globalnie unikatowy identyfikator pozycji — używany jako React
   *  `key`. Dzięki niemu każde uruchomienie (clear output → push) tworzy
   *  GENUINELY nowy element o nowym kluczu, więc React zawsze go re-montuje i
   *  ref-callback dla `dom` na pewno wykona appendChild świeżego canvasu.
   *  (Klucz po indeksie tablicy potrafił przy batchowaniu pominąć remount.) */
  id: number;
  type: 'text' | 'table' | 'list' | 'json' | 'html' | 'dom';
  data: unknown;
  timestamp: number;
}

export interface DisplayApi {
  text: (str: string) => void;
  table: (data: Record<string, unknown>[] | unknown[][]) => void;
  list: (items: unknown[]) => void;
  json: (obj: unknown) => void;
  /** Emit a raw HTML string — rendered as-is in the 'html' view mode. */
  html: (markup: string) => void;
  /** Emit a live DOM element (e.g. Three.js `renderer.domElement`). The
   *  renderer mounts it via `appendChild`, so animations and event listeners
   *  attached to it keep working. */
  dom: (element: HTMLElement) => void;
}

export interface ScriptBlockState {
  id: string;
  code: string;
  output: DisplayItem[];
  logs: LogEntry[];
  status: 'idle' | 'running' | 'completed' | 'error';
  error?: string;
  result?: unknown;
}

export interface AutomateDocumentContextValue {
  variables: Record<string, unknown>;
  blocks: Map<string, ScriptBlockState>;

  registerBlock: (id: string) => void;
  unregisterBlock: (id: string) => void;
  updateBlockCode: (id: string, code: string) => void;
  /** Rejestruje korzenie sceny QObject (z pliku JSON) dla danego bloku — przed
   *  uruchomieniem skryptu są ustawiane na api, by `api.scripts.getRoot()`
   *  zwracał root tej sceny. */
  setBlockScene: (id: string, roots: unknown[]) => void;
  /** Przywraca scenę QObject (żywe obiekty z getRoot) do stanu zapisanego przy
   *  ostatnim uruchomieniu. Zwraca true jeśli było co przywracać. */
  restoreScene: () => boolean;
  /** Przerywa działający skrypt bloku (abort + czyszczenie timerów/rAF/onStop). */
  stopBlock: (id: string) => void;

  runBlock: (id: string, codeOverride?: string) => Promise<void>;
  runAllBlocks: () => Promise<void>;
  isRunningAll: boolean;

  getBlockState: (id: string) => ScriptBlockState | undefined;
  clearBlockOutput: (id: string) => void;
  /** Zwraca żywe korzenie sceny QObject z ostatniego uruchomionego bloku
   *  (te same obiekty co api.scripts.getRoots() wewnątrz skryptu). */
  getScriptRoots: () => unknown[];
}

/** Uchwyt pojedynczego przebiegu skryptu — pozwala go przerwać (Stop). */
interface ScriptRunHandle {
  ac: AbortController;
  timers: Set<number>;
  intervals: Set<number>;
  rafs: Set<number>;
  stopCallbacks: Array<() => void>;
  stopped: boolean;
}

/** Tworzy uchwyt + obiekt `host` z przesłoniętymi timerami (śledzonymi) oraz
 *  `signal`/`onStop`/`isStopped` do współpracy ze skryptem. */
function makeRunHandle(): { handle: ScriptRunHandle; host: Record<string, unknown> } {
  const handle: ScriptRunHandle = {
    ac: new AbortController(), timers: new Set(), intervals: new Set(), rafs: new Set(),
    stopCallbacks: [], stopped: false,
  };
  const host: Record<string, unknown> = {
    signal: handle.ac.signal,
    isStopped: () => handle.stopped,
    onStop: (fn: () => void) => { if (typeof fn === 'function') handle.stopCallbacks.push(fn); },
    setTimeout: (fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
      let id = 0; id = window.setTimeout(() => { handle.timers.delete(id); fn(...a); }, ms); handle.timers.add(id); return id;
    },
    clearTimeout: (id: number) => { handle.timers.delete(id); window.clearTimeout(id); },
    setInterval: (fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
      const id = window.setInterval(() => fn(...a), ms); handle.intervals.add(id); return id;
    },
    clearInterval: (id: number) => { handle.intervals.delete(id); window.clearInterval(id); },
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      let id = 0; id = window.requestAnimationFrame((t) => { handle.rafs.delete(id); fn(t); }); handle.rafs.add(id); return id;
    },
    cancelAnimationFrame: (id: number) => { handle.rafs.delete(id); window.cancelAnimationFrame(id); },
  };
  return { handle, host };
}

/** Przerywa przebieg: abort + czyści wszystkie śledzone timery/rAF + onStop. */
function stopRunHandle(handle: ScriptRunHandle | undefined): void {
  if (!handle || handle.stopped) return;
  handle.stopped = true;
  try { handle.ac.abort(); } catch { /* ignore */ }
  for (const id of handle.timers) window.clearTimeout(id);
  for (const id of handle.intervals) window.clearInterval(id);
  for (const id of handle.rafs) window.cancelAnimationFrame(id);
  handle.timers.clear(); handle.intervals.clear(); handle.rafs.clear();
  for (const cb of handle.stopCallbacks) { try { cb(); } catch { /* ignore */ } }
  handle.stopCallbacks = [];
}

const AutomateDocumentContext = createContext<AutomateDocumentContextValue | null>(null);

export const useAutomateDocument = (): AutomateDocumentContextValue => {
  const context = useContext(AutomateDocumentContext);
  if (!context) {
    throw new Error('useAutomateDocument must be used within AutomateDocumentProvider');
  }
  return context;
};

interface AutomateDocumentProviderProps {
  children: React.ReactNode;
  /** Filesystem path of the markdown file currently shown in MdEditor.
   *  Threaded to `AutomateSystemApi.scripts.runIn{Parents,Childs}ByTag` so
   *  those calls know what "here" means without having to ask the caller. */
  documentPath?: string;
}

export const AutomateDocumentProvider: React.FC<AutomateDocumentProviderProps> = ({ children, documentPath }) => {
  const { dataSource } = useFilesystem();
  const { notify } = useNotification();
  const { currentUser, token } = useAuth();
  const { rawPublish, rawSubscribe } = useMqtt();
  // userName i token w refach — api jest tworzone raz, a closure czyta zawsze aktualną wartość.
  const userNameRef = useRef<string | null>(currentUser?.name ?? null);
  const tokenRef = useRef<string | null>(token ?? null);
  useEffect(() => { userNameRef.current = currentUser?.name ?? null; }, [currentUser]);
  useEffect(() => { tokenRef.current = token ?? null; }, [token]);
  // Md env store (File component / `{{env:…}}`) exposed to scripts as `api.env`.
  // Held in a ref so the api singleton reads the latest values lazily.
  const mdEnv = useMdEnv();
  const mdEnvRef = useRef(mdEnv);
  useEffect(() => { mdEnvRef.current = mdEnv; }, [mdEnv]);
  // Publish this document's env to the Monaco completion provider so typing
  // inside `api.env.get('…')` suggests the actually-loaded paths.
  useEffect(() => { setAutomateEnvProvider(() => mdEnvRef.current.all()); }, []);
  const variablesRef = useRef<Record<string, unknown>>({});
  const [blocks, setBlocks] = useState<Map<string, ScriptBlockState>>(new Map());
  const blockOrderRef = useRef<string[]>([]);
  // Korzenie sceny QObject per blok (ustawiane przez bloki, czytane w runBlock).
  const blockScenesRef = useRef<Map<string, unknown[]>>(new Map());
  // Uchwyty żywych przebiegów per blok — pozwalają Stopem przerwać skrypt
  // (abort + wyczyszczenie śledzonych setTimeout/setInterval/rAF + callbacki onStop).
  const runHandlesRef = useRef<Map<string, ScriptRunHandle>>(new Map());
  const [isRunningAll, setIsRunningAll] = useState(false);
  const apiRef = useRef<AutomateSystemApi | null>(null);
  // Document path is held in a ref so the api singleton sees the latest
  // value without us having to recreate it whenever the user opens a
  // different file. The api reads via a getter closure, so changes here
  // propagate transparently.
  const documentPathRef = useRef<string | undefined>(documentPath);
  useEffect(() => { documentPathRef.current = documentPath; }, [documentPath]);

  const getOrCreateApi = useCallback(() => {
    if (!apiRef.current) {
      apiRef.current = new AutomateSystemApi(
        dataSource,
        variablesRef.current,
        () => documentPathRef.current,
        () => userNameRef.current,
        () => tokenRef.current,
        () => mdEnvRef.current,
      );
    }
    return apiRef.current;
  }, [dataSource]);

  const registerBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      if (!next.has(id)) {
        next.set(id, {
          id,
          code: '',
          output: [],
          logs: [],
          status: 'idle',
        });
      }
      return next;
    });
    if (!blockOrderRef.current.includes(id)) {
      blockOrderRef.current.push(id);
    }
  }, []);

  const unregisterBlock = useCallback((id: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    blockOrderRef.current = blockOrderRef.current.filter(bid => bid !== id);
    blockScenesRef.current.delete(id);
  }, []);

  const setBlockScene = useCallback((id: string, roots: unknown[]) => {
    blockScenesRef.current.set(id, Array.isArray(roots) ? roots : []);
  }, []);

  const restoreScene = useCallback(() => {
    const api = apiRef.current;
    return api && typeof api.restoreScene === 'function' ? api.restoreScene() : false;
  }, []);

  /** Przerywa działający skrypt bloku: czyści śledzone timery/rAF, sygnalizuje
   *  abort i woła callbacki onStop. Status bloku ustawiany na 'idle'. */
  const stopBlock = useCallback((id: string) => {
    stopRunHandle(runHandlesRef.current.get(id));
    runHandlesRef.current.delete(id);
    setBlocks(prev => {
      const next = new Map(prev); const cur = next.get(id);
      if (cur && cur.status === 'running') next.set(id, { ...cur, status: 'idle' });
      return next;
    });
  }, []);

  const updateBlockCode = useCallback((id: string, code: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      const block = next.get(id);
      if (block) {
        next.set(id, { ...block, code });
      }
      return next;
    });
  }, []);

  const clearBlockOutput = useCallback((id: string) => {
    setBlocks(prev => {
      const next = new Map(prev);
      const block = next.get(id);
      if (block) {
        next.set(id, { ...block, output: [], logs: [], error: undefined, result: undefined, status: 'idle' });
      }
      return next;
    });
  }, []);


  // blocksRef tracks the latest `blocks` so runBlock can read it without
  // having `blocks` as a useCallback dep — that dep would re-create runBlock
  // on every state change and re-trigger every useEffect that lists runBlock
  // (e.g. autorun on mount), causing infinite re-runs.
  // blocksRef is synced via useLayoutEffect (NOT useEffect) so writes from
  // setBlocks commits land in the ref BEFORE any downstream effect (autorun
  // etc.) reads from it. Plain useEffect would run after the layout-effect
  // chain and race against the autorun useEffect in NodeView — autorun would
  // see block in state but `runBlock` would read undefined from blocksRef.
  const blocksRef = useRef(blocks);
  useLayoutEffect(() => { blocksRef.current = blocks; }, [blocks]);

  const runBlock = useCallback(async (id: string, codeOverride?: string) => {
    const block = blocksRef.current.get(id);

    // Already-running guard: only valid signal we get from blocksRef. Block
    // missing in ref is NOT a "skip" — caller may have just registered the
    // block in the same tick (autorun race), and as long as we have code
    // (either from override or — if available — from the block) we can run.
    // All status writes below are guarded with `if (current)` so missing
    // entries are safe; the final block landing in state will reflect
    // whatever registerBlock pushes.
    if (block && block.status === 'running') {
      // eslint-disable-next-line no-console
      console.log(`[AutomateScript] runBlock(${id}): skip — already running`);
      return;
    }

    // codeOverride sidesteps two races at once:
    //   1. updateBlockCode (sync caller) not committed before runBlock —
    //      `block.code` here would be the stale, pre-edit body.
    //   2. registerBlock setBlocks not yet in blocksRef — block is undefined.
    // No override + no block = nothing to run.
    const code = codeOverride ?? block?.code ?? '';
    if (!code) {
      // eslint-disable-next-line no-console
      console.log(`[AutomateScript] runBlock(${id}): skip — empty code (block ${block ? 'idle but empty' : 'not registered'})`);
      return;
    }
    // Mark block as running but keep the previous output visible — the old
    // canvas (or other DOM item) stays rendered while the library preloads
    // and the script executes. The output is replaced atomically at the end
    // of the run so there's no intermediate blank frame between runs.
    setBlocks(prev => {
      const next = new Map(prev);
      const current = next.get(id);
      if (current) {
        next.set(id, { ...current, status: 'running', logs: [], error: undefined, result: undefined });
      }
      return next;
    });

    const api = getOrCreateApi();
    // Udostępnij skryptowi scenę QObject tego bloku przez api.scripts.getRoot().
    api.setSceneRoots(blockScenesRef.current.get(id) ?? []);

    // Track previous lengths for logs and notifications
    const prevLogsLength = api.logs.length;
    const prevNotificationsLength = api.notifications.length;

    // Buffer all display.* calls during execution. They're committed atomically
    // at the end via a single setBlocks replacing the old output — this avoids
    // the "flash of empty canvas" that the previous clear-before-run approach
    // caused (the gap between output:[] and the new canvas appeared as a brief
    // blank during library preload / script startup).
    const bufferedOutput: DisplayItem[] = [];
    // `display` należy do TEGO przebiegu — bufor jest domknięty w instancji,
    // więc blok animujący coś w tle nie zacznie pisać do panelu innego bloku.
    const displayApi: DisplayApi = createDisplay({ push: (item) => bufferedOutput.push(item) });
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[AutomateScript] runBlock(${id}) — ${code.length} chars`);
    // eslint-disable-next-line no-console
    console.log('Code:\n' + code);
    const tStart = performance.now();

    try {
      // Preload any `// @library: foo` markers BEFORE executing the body —
      // moved here from the call sites so CDN/CORS errors land in the same
      // try/catch as runtime errors. Previously this lived in a `.finally`
      // chain at the caller, which silently swallowed preload failures
      // and the user just saw a cryptic "THREE is not defined" runtime
      // error instead of the actual root cause.
      try {
        await preloadLibrariesForCode(code);
      } catch (preloadErr) {
        const msg = preloadErr instanceof Error ? preloadErr.message : String(preloadErr);
        // Re-throw with a clearer prefix so the user sees "Library preload
        // failed: …" rather than the generic loader message wrapped in
        // whatever AsyncFunction errors with later.
        throw new Error(`Library preload failed: ${msg}`);
      }

      // Ubij ewentualny poprzedni przebieg tego bloku (Run = start od nowa),
      // potem utwórz świeży uchwyt z przesłoniętymi timerami i AbortSignal.
      stopRunHandle(runHandlesRef.current.get(id));
      const { handle, host } = makeRunHandle();
      runHandlesRef.current.set(id, handle);

      // Skrypty akcji głosowych wołają `Aura.*`; uruchomione z edytora nie mają
      // rozmowy, więc dostają host podglądowy piszący do panelu wyników.
      Aura.setHost(createAuraPreviewHost(displayApi, api.log));
      Aura.beginRun();

      // Granica środowiska: to, czego host nie ma, melduje brak zamiast
      // wywracać skrypt na `undefined`.
      const scriptApi = createAutomateApi(api as unknown as Partial<AutomateApi>, {
        unavailableReason: 'blok skryptu w dokumencie',
        onUnavailable: (message) => api.log.warn(message),
      });

      /*
        Sceny CAD/3D: `import { Scene } from 'mycastle/scene'`.

        Dostęp do plików idzie po REST, tym samym kanałem co reszta aplikacji —
        blok bywa otwierany ze stron, które brokera MQTT nie zestawiają, a wtedy
        `Scene.load` przewracało się na braku połączenia zamiast wczytać plik.
      */
      setSceneHost(utworzHostaSceny({
        userName: userNameRef.current ?? '',
        authHeaders: (): Record<string, string> => (tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}),
        present: (_scena, opis) => api.log.info(`Wczytano scenę „${opis.path}" (${opis.kind}).`),
      }));

      /*
       * Transport dla Kasi — ten sam broker, co reszta MyCastle.
       *
       * Kasia mieszka w `media-backend`, więc rozmowa z nią idzie po MQTT.
       * Podłączamy transport tuż przed uruchomieniem skryptu, bo dopiero tutaj
       * znamy nazwę użytkownika i mamy pewność, że połączenie żyje.
       */
      Kasia.setTransport({
        userName: currentUser?.name ?? '',
        publish: (topic, payload) => rawPublish(topic, JSON.stringify(payload)),
        subscribe: (topic, cb) => rawSubscribe(topic, (raw) => {
          try { cb(JSON.parse(raw), topic); } catch { /* nie nasza wiadomość */ }
        }),
      }, 'automatyzacja');

      // Importy modułów środowiska usuwamy — symbole wchodzą przez hostScope.
      const wrappedScript = `const display = input.__display;\n${prepareAutomateScript(code).code}`;
      const result = await AutomateSandbox.execute(
        wrappedScript,
        // Proxy dostarcza w runtime komplet namespace'ów (host + zaślepki dla
        // brakujących), ale statycznie widać tylko `log` — stąd rzutowanie.
        scriptApi as unknown as AutomateSystemApi,
        { __display: displayApi },
        variablesRef.current,
        undefined,
        { ...host, Aura, aura, Scene, isNode3D, isLayer, Kasia, kasia: kasiaAlias },
      );
      // eslint-disable-next-line no-console
      console.log(`Result (${(performance.now() - tStart).toFixed(1)}ms):`, result);
      // eslint-disable-next-line no-console
      console.groupEnd();

      // Collect new logs
      const newLogs = api.logs.slice(prevLogsLength);

      // Process new notifications
      const newNotifications = api.notifications.slice(prevNotificationsLength);
      for (const n of newNotifications) {
        notify(n.message, n.severity || 'info');
      }

      // Atomic replace: swap old output with the freshly-collected items.
      setBlocks(prev => {
        const next = new Map(prev);
        const current = next.get(id);
        if (current) {
          next.set(id, { ...current, status: 'completed', output: bufferedOutput, logs: newLogs, result });
        }
        return next;
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      // Pinpoint where the failure happened in the USER'S code (not the
      // sandbox wrapper). The wrapper from AutomateSandbox.execute prefixes:
      //   line 1: "use strict";
      //   line 2:    return (async () => {
      //   line 3:      const inp = input;
      //   line 4:      const vars = variables;
      //   line 5:      const display = input.__display;   ← from runBlock
      //   line 6+:     <user code>
      // → wrapper offset = 5 lines. We pull the location from either the
      //   Firefox-style `err.lineNumber/columnNumber` properties or by
      //   regex'ing the Chromium stack trace's `<anonymous>:L:C` token.
      //   Whichever fires first wins.
      const WRAPPER_LINE_OFFSET = 5;
      const locFromError = (err && typeof err === 'object'
        && typeof (err as { lineNumber?: number }).lineNumber === 'number')
        ? {
            line:   ((err as { lineNumber: number }).lineNumber) - WRAPPER_LINE_OFFSET,
            column: ((err as { columnNumber?: number }).columnNumber) ?? 0,
          }
        : null;
      const locFromStack = (() => {
        const stack = err instanceof Error ? err.stack : '';
        if (!stack) return null;
        // Find the FIRST `<anonymous>:L:C` (or `eval:L:C`) — that's the
        // generated Function frame, which contains the line in the
        // wrapped source. Later frames are infrastructure (AutomateSandbox
        // / Promise.race) and don't help the user.
        const m = stack.match(/<anonymous>:(\d+):(\d+)/);
        if (!m) return null;
        const line = parseInt(m[1], 10) - WRAPPER_LINE_OFFSET;
        const column = parseInt(m[2], 10);
        return Number.isFinite(line) && line >= 1
          ? { line, column }
          : null;
      })();
      const loc = locFromError && locFromError.line >= 1 ? locFromError : locFromStack;
      const errorMsg = loc
        ? `${rawMsg}  (linia ${loc.line}${loc.column > 0 ? `, kolumna ${loc.column}` : ''})`
        : rawMsg;
      // Surface the full error object including stack — wrapped Function calls
      // squash the stack into the body of the generated function, but Chrome
      // DevTools still resolves source mapping for the wrapper if we log the
      // raw Error. Useful for diagnosing scripts that fail deep in a library.
      // eslint-disable-next-line no-console
      console.error(`Error (${(performance.now() - tStart).toFixed(1)}ms):`, err);
      // eslint-disable-next-line no-console
      console.groupEnd();
      const newLogs = api.logs.slice(prevLogsLength);

      // Process notifications even on error
      const newNotifications = api.notifications.slice(prevNotificationsLength);
      for (const n of newNotifications) {
        notify(n.message, n.severity || 'info');
      }

      setBlocks(prev => {
        const next = new Map(prev);
        const current = next.get(id);
        if (current) {
          // On error clear the output (show error banner without stale canvas)
          // and include any items buffered before the throw.
          next.set(id, { ...current, status: 'error', output: bufferedOutput, error: errorMsg, logs: newLogs });
        }
        return next;
      });
    } finally {
      // Host żyje tyle, co przebieg: blok zatrzymany nie ma prawa czytać plików
      // po tym, jak użytkownik go przerwał.
      setSceneHost(null);
    }
    // `blocks` removed from deps because we now read state via the functional
    // blocks read via blocksRef.current (latest), writes via functional
    // setBlocks updaters — so a stable identity for runBlock is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOrCreateApi, notify]);

  const runAllBlocks = useCallback(async () => {
    setIsRunningAll(true);
    for (const id of blockOrderRef.current) {
      if (blocks.has(id)) {
        await runBlock(id);
      }
    }
    setIsRunningAll(false);
  }, [blocks, runBlock]);

  const getBlockState = useCallback((id: string) => {
    return blocks.get(id);
  }, [blocks]);

  const getScriptRoots = useCallback((): unknown[] => {
    // First try scene-JSON-based roots (Mode 2 / scene-driven scripts).
    const apiRoots = apiRef.current?.scripts.getRoots() ?? [];
    if (apiRoots.length > 0) return apiRoots;
    // Fallback: roots registered by Mode 1 Init code via globalThis.__qscene_roots.
    const g = globalThis as unknown as Record<string, unknown>;
    const gr = g['__qscene_roots'];
    if (Array.isArray(gr) && gr.length > 0) return gr as unknown[];
    return [];
  }, []);

  const value: AutomateDocumentContextValue = {
    variables: variablesRef.current,
    blocks,
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    setBlockScene,
    restoreScene,
    stopBlock,
    runBlock,
    runAllBlocks,
    isRunningAll,
    getBlockState,
    clearBlockOutput,
    getScriptRoots,
  };

  return (
    <AutomateDocumentContext.Provider value={value}>
      {children}
    </AutomateDocumentContext.Provider>
  );
};

export default AutomateDocumentContext;
