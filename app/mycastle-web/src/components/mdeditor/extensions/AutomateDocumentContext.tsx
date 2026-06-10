/**
 * AutomateDocumentContext - wspoldzielony kontekst wykonawczy
 * dla blokow skryptowych w dokumencie Markdown
 */

import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { AutomateSystemApi, LogEntry } from '../../../modules/automate/engine/AutomateSystemApi';
import { AutomateSandbox } from '../../../modules/automate/engine/AutomateSandbox';
import { preloadLibrariesForCode } from './automateLibraries';
import { useFilesystem } from '../../../modules/filesystem/FilesystemContext';
import { useNotification } from '../../../modules/notification';

// Typy danych wyjsciowych display
//
// 'html' carries a raw HTML string (rendered via dangerouslySetInnerHTML in
//   the 'html' view mode of the script block).
// 'dom' carries a *live* HTMLElement that the renderer mounts via appendChild.
//   This is what makes Three.js work — the renderer's canvas needs to stay
//   in the DOM so its animation loop keeps painting; a string-serialised
//   snapshot would freeze on the first frame.
export interface DisplayItem {
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

  runBlock: (id: string, codeOverride?: string) => Promise<void>;
  runAllBlocks: () => Promise<void>;
  isRunningAll: boolean;

  getBlockState: (id: string) => ScriptBlockState | undefined;
  clearBlockOutput: (id: string) => void;
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
  const variablesRef = useRef<Record<string, unknown>>({});
  const [blocks, setBlocks] = useState<Map<string, ScriptBlockState>>(new Map());
  const blockOrderRef = useRef<string[]>([]);
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

  const createDisplayApi = useCallback((blockId: string): DisplayApi => {
    const pushOutput = (item: DisplayItem) => {
      setBlocks(prev => {
        const next = new Map(prev);
        const block = next.get(blockId);
        if (block) {
          next.set(blockId, { ...block, output: [...block.output, item] });
        }
        return next;
      });
    };

    return {
      text: (str: string) => pushOutput({ type: 'text', data: String(str), timestamp: Date.now() }),
      table: (data: Record<string, unknown>[] | unknown[][]) => pushOutput({ type: 'table', data, timestamp: Date.now() }),
      list: (items: unknown[]) => pushOutput({ type: 'list', data: items, timestamp: Date.now() }),
      json: (obj: unknown) => pushOutput({ type: 'json', data: obj, timestamp: Date.now() }),
      html: (markup: string) => pushOutput({ type: 'html', data: String(markup), timestamp: Date.now() }),
      dom: (element: HTMLElement) => pushOutput({ type: 'dom', data: element, timestamp: Date.now() }),
    };
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
    // Clear previous output before running so only the latest result is shown
    setBlocks(prev => {
      const next = new Map(prev);
      const current = next.get(id);
      if (current) {
        next.set(id, { ...current, status: 'running', output: [], logs: [], error: undefined, result: undefined });
      }
      return next;
    });
    await Promise.resolve(); // yield so React renders cleared state before new output

    const api = getOrCreateApi();

    // Track previous lengths for logs and notifications
    const prevLogsLength = api.logs.length;
    const prevNotificationsLength = api.notifications.length;

    const displayApi = createDisplayApi(id);
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

      const wrappedScript = `const display = input.__display;\n${code}`;
      const result = await AutomateSandbox.execute(
        wrappedScript,
        api,
        { __display: displayApi },
        variablesRef.current,
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

      setBlocks(prev => {
        const next = new Map(prev);
        const current = next.get(id);
        if (current) {
          next.set(id, { ...current, status: 'completed', logs: newLogs, result });
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
          next.set(id, { ...current, status: 'error', error: errorMsg, logs: newLogs });
        }
        return next;
      });
    }
    // `blocks` removed from deps because we now read state via the functional
    // blocks read via blocksRef.current (latest), writes via functional
    // setBlocks updaters — so a stable identity for runBlock is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOrCreateApi, createDisplayApi, notify]);

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

  const value: AutomateDocumentContextValue = {
    variables: variablesRef.current,
    blocks,
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    runBlock,
    runAllBlocks,
    isRunningAll,
    getBlockState,
    clearBlockOutput,
  };

  return (
    <AutomateDocumentContext.Provider value={value}>
      {children}
    </AutomateDocumentContext.Provider>
  );
};

export default AutomateDocumentContext;
