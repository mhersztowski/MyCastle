/**
 * Unified file-operations registry.
 *
 * Each editor mode (cad, cad3d, scene3d, electronics, map, notes) registers its
 * save/open/import/export actions here; the single top-bar File menu reads the
 * active mode's entry and renders them. Mode components keep their own dialogs —
 * they register stable *triggers* (e.g. "open the save dialog"), so closures
 * never go stale.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface FileMenuItem {
  label: string;
  secondary?: string;
  run: () => void;
  disabled?: boolean;
}

export interface FileOps {
  /** Friendly name of the currently-open file, shown in the menu header. */
  currentName?: string | null;
  /** Start a new/empty document. */
  newDoc?: () => void;
  /** Server (VFS) open/save and any companion actions. */
  server?: FileMenuItem[];
  /** Import actions (local files, external sources). */
  importItems?: FileMenuItem[];
  /** Export actions (download in various formats). */
  exportItems?: FileMenuItem[];
  /** Read-only viewer URL for the saved scene; null = saved-but-unavailable, undefined = mode has no viewer. */
  viewerUrl?: string | null;
}

interface FileOpsCtx {
  register: (mode: string, ops: FileOps) => void;
  unregister: (mode: string) => void;
  get: (mode: string) => FileOps | undefined;
  /** Bumps whenever the registry changes, so the menu re-renders. */
  version: number;
}

const Ctx = createContext<FileOpsCtx | null>(null);

export function FileOpsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Record<string, FileOps>>({});
  const [version, setVersion] = useState(0);

  const register = useCallback((mode: string, ops: FileOps) => {
    ref.current[mode] = ops;
    setVersion(v => v + 1);
  }, []);
  const unregister = useCallback((mode: string) => {
    delete ref.current[mode];
    setVersion(v => v + 1);
  }, []);
  const get = useCallback((mode: string) => ref.current[mode], []);

  // Stable identity except when `version` changes — without this, every register()
  // (which bumps version) hands consumers a brand-new ctx object, and any effect
  // that depends on the ctx would re-run → re-register → infinite loop.
  const value = useMemo(() => ({ register, unregister, get, version }), [register, unregister, get, version]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFileOps(): FileOpsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFileOps must be used inside <FileOpsProvider>');
  return c;
}

/**
 * Register a mode's file operations. `ops` is rebuilt on every render with fresh
 * closures; the effect re-registers whenever `deps` change (include anything the
 * menu must reflect, e.g. the viewer URL or current file name).
 *
 * Safe to call without a provider (e.g. when the same editor component is reused
 * inside a read-only viewer page) — it becomes a no-op.
 */
export function useRegisterFileOps(mode: string, ops: FileOps, deps: unknown[]): void {
  const ctx = useContext(Ctx);
  // register/unregister are stable (useCallback([])) even though the ctx object's
  // identity changes on every version bump — depend on the functions, never on ctx.
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  // Keep the latest ops without making it an effect dependency (it's a fresh object
  // every render); the effect re-registers only when `deps` actually change.
  const opsRef = useRef(ops);
  opsRef.current = ops;
  useEffect(() => {
    if (!register || !unregister) return;
    register(mode, opsRef.current);
    return () => unregister(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, register, unregister, ...deps]);
}
