import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export type WindowName = 'apiDocs' | 'rpcExplorer' | 'mqttExplorer';
type WindowState = 'open' | 'minimized';

export interface WindowConfig {
  pos: { x: number; y: number };
  size: { w: number; h: number };
  maximized: boolean;
}

interface GlobalWindowsContextValue {
  windows: Map<WindowName, WindowState>;
  layoutVersion: number;
  savedConfigs: Map<WindowName, WindowConfig>;
  toggle: (name: WindowName) => void;
  close: (name: WindowName) => void;
  minimize: (name: WindowName) => void;
  restore: (name: WindowName) => void;
  registerWindow: (name: WindowName, getConfig: () => WindowConfig) => () => void;
  saveLayout: () => void;
  loadLayout: () => void;
  clearLayout: () => void;
}

const STORAGE_KEY = 'minis-globalwindows';

const GlobalWindowsContext = createContext<GlobalWindowsContextValue>({
  windows: new Map(),
  layoutVersion: 0,
  savedConfigs: new Map(),
  toggle: () => {},
  close: () => {},
  minimize: () => {},
  restore: () => {},
  registerWindow: () => () => {},
  saveLayout: () => {},
  loadLayout: () => {},
  clearLayout: () => {},
});

export function GlobalWindowsProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<Map<WindowName, WindowState>>(new Map());
  const [savedConfigs, setSavedConfigs] = useState<Map<WindowName, WindowConfig>>(new Map());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const windowRefsMap = useRef<Map<WindowName, () => WindowConfig>>(new Map());
  const { pathname } = useLocation();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      setWindows((prev) => (prev.size > 0 ? new Map() : prev));
    }
  }, [pathname]);

  const toggle = useCallback((name: WindowName) => {
    setWindows((prev) => {
      const next = new Map(prev);
      const state = next.get(name);
      if (state === 'minimized') {
        next.set(name, 'open');
      } else if (state === 'open') {
        next.delete(name);
      } else {
        next.set(name, 'open');
      }
      return next;
    });
  }, []);

  const close = useCallback((name: WindowName) => {
    setWindows((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const minimize = useCallback((name: WindowName) => {
    setWindows((prev) => {
      if (prev.get(name) === 'minimized') return prev;
      const next = new Map(prev);
      next.set(name, 'minimized');
      return next;
    });
  }, []);

  const restore = useCallback((name: WindowName) => {
    setWindows((prev) => {
      if (prev.get(name) === 'open') return prev;
      const next = new Map(prev);
      next.set(name, 'open');
      return next;
    });
  }, []);

  const registerWindow = useCallback((name: WindowName, getConfig: () => WindowConfig) => {
    windowRefsMap.current.set(name, getConfig);
    return () => { windowRefsMap.current.delete(name); };
  }, []);

  const saveLayout = useCallback(() => {
    const configs: Record<string, WindowConfig> = {};
    for (const [name, getConfig] of windowRefsMap.current) {
      configs[name] = getConfig();
    }
    const data = {
      windows: Object.fromEntries(windows),
      configs,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [windows]);

  const loadLayout = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.windows) {
        setWindows(new Map(Object.entries(data.windows) as [WindowName, WindowState][]));
      }
      if (data.configs) {
        setSavedConfigs(new Map(Object.entries(data.configs) as [WindowName, WindowConfig][]));
      }
      setLayoutVersion((v) => v + 1);
    } catch { /* ignore invalid data */ }
  }, []);

  const clearLayout = useCallback(() => {
    setWindows(new Map());
    setSavedConfigs(new Map());
    localStorage.removeItem(STORAGE_KEY);
    setLayoutVersion((v) => v + 1);
  }, []);

  return (
    <GlobalWindowsContext.Provider value={{
      windows, layoutVersion, savedConfigs,
      toggle, close, minimize, restore,
      registerWindow, saveLayout, loadLayout, clearLayout,
    }}>
      {children}
    </GlobalWindowsContext.Provider>
  );
}

export function useGlobalWindows() {
  return useContext(GlobalWindowsContext);
}
