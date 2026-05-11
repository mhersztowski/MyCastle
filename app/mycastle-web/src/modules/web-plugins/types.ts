export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  main: string;
  contributes?: {
    scripts?: string[];
  };
  externals?: string[];
}

export interface StatusBarItemOptions {
  id: string;
  text: string;
  tooltip?: string;
  icon?: string;
  position?: 'left' | 'right';
  priority?: number;
}

export interface StatusBarHandle {
  update(patch: Partial<StatusBarItemOptions>): void;
  dispose(): void;
}

export interface IWebPluginAPI {
  auth: {
    currentUser: string | null;
    token: string | null;
    isAdmin: boolean;
  };
  http: {
    get(path: string): Promise<unknown>;
    post(path: string, body?: unknown): Promise<unknown>;
    put(path: string, body?: unknown): Promise<unknown>;
  };
  logger: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
  ui: {
    statusbar: {
      add(opts: StatusBarItemOptions): StatusBarHandle;
    };
  };
  scripts: {
    register(name: string, fn: (...args: unknown[]) => unknown): void;
  };
}
