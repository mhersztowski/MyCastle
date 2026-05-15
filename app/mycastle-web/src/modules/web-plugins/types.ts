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

/** Metadata of a stored plugin secret (no value). */
export interface SecretMetadata {
  key: string;
  shared: boolean;
  updatedAt: number;
}

/**
 * An example "Plugin Script" snippet a plugin contributes. Registered via
 * `api.scripts.registerTemplate()` and offered in the Markdown editor's slash menu
 * when inserting a Plugin Script block.
 */
export interface PluginScriptTemplate {
  /** Unique id within the plugin. */
  id: string;
  /** Shown in the editor's slash-command picker (e.g. "Galeria Immich"). */
  label: string;
  /** Short description shown under the label. */
  description?: string;
  /** The script body inserted into the Plugin Script block. Must be valid JS. */
  code: string;
  /** Block run mode for the inserted block. Default 'manual'. */
  mode?: 'auto' | 'manual';
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
    /** Contribute an example snippet selectable when inserting a Plugin Script block. */
    registerTemplate(template: PluginScriptTemplate): void;
  };
  /**
   * Server-side credential/key store, scoped to this plugin and to the current
   * "page owner" (the logged-in user on their own pages; the page's owner when
   * viewing another user's shared page). Use it instead of localStorage so that
   * secrets persist across devices and — when marked `shared` — can be read by
   * viewers of the owner's page.
   *
   * `get`/`set` JSON-serialize the value, so any JSON-serializable value works.
   * `set`/`delete` only succeed when the current user is the page owner (or admin).
   */
  secrets: {
    /** Resolved value, or null when missing / not accessible to the caller. */
    get(key: string): Promise<unknown>;
    /** Store a value. `shared: true` makes it readable by viewers of the owner's page. */
    set(key: string, value: unknown, opts?: { shared?: boolean }): Promise<void>;
    delete(key: string): Promise<void>;
    /** Key metadata for this plugin (owner/admin only). */
    list(): Promise<SecretMetadata[]>;
  };
}
