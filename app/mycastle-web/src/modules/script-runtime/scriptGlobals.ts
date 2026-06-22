/**
 * TypeScript declarations for the Plugin Script Monaco editor.
 *
 * These describe the *destructured runtime context* that wraps every Plugin
 * Script body — see `ScriptRuntime.ts` (`executeScript`), which does:
 *
 *     const fn = new AsyncFunction(
 *       'ctx', 'display',
 *       'const { auth, http, md, table, reactive, ...} = ctx;\n' + userCode
 *     );
 *
 * So from the script's point of view `auth`, `http`, `md`, `table`,
 * `reactive` and `display` are top-level identifiers — and TypeScript needs
 * to know that to give useful IntelliSense.
 *
 * Stored as a string (not a standalone `.d.ts` file) on purpose: a real
 * `.d.ts` in the project tree would be picked up by `tsconfig.include` and
 * pollute the *global* TypeScript scope of the whole frontend with these
 * ambient names. Keeping it as a template literal means the declarations
 * exist only inside Monaco's worker, where we want them.
 *
 * Registered with the editor through `addExtraLib` (see
 * `PluginScriptExtension.tsx`).
 */
export const PLUGIN_SCRIPT_GLOBALS_DTS = `
// ────────────────────────────────────────────────────────────────────────────
//  Plugin Script — runtime context available inside every block
// ────────────────────────────────────────────────────────────────────────────
//
//  The body of a Plugin Script block runs inside an async function with the
//  following identifiers pre-destructured from the runtime context:
//
//      auth, http, display, md, table, reactive, ...pluginNamespaces
//
//  Top-level \`await\` is allowed. Return any \`ScriptOutput\` and it will be
//  rendered automatically (Markdown / table / live block / raw / JSON).
//
// ────────────────────────────────────────────────────────────────────────────

/**
 * The currently-logged-in user, their JWT, and the admin flag. Snapshotted at
 * the moment the script runs — re-run the block to pick up a fresh token.
 */
interface ScriptAuth {
  /** Name of the logged-in user (e.g. "admin"), or null when no session. */
  readonly currentUser: string | null;
  /** Live JWT used as Bearer for every \`http.*\` call. Null when logged out. */
  readonly token: string | null;
  readonly isAdmin: boolean;
}

/** Options accepted by every \`http.*\` method. */
interface HttpOptions {
  /**
   * Additional headers merged on top of Content-Type and Authorization.
   * @example { 'X-Api-Version': '2', 'Accept': 'text/csv' }
   */
  headers?: Record<string, string>;
  /**
   * Set to \`false\` to omit the automatic \`Authorization: Bearer\` header.
   * Useful when calling external APIs that must not receive your JWT.
   * @default true
   */
  auth?: boolean;
}

/**
 * Authenticated fetch wrapper. Every method automatically adds
 * \`Authorization: Bearer <jwt>\` and \`Content-Type: application/json\`
 * (unless overridden via \`options\`). Throws \`Error\` on non-2xx responses
 * with a message containing the status code and URL.
 *
 * @example
 *   // Internal API (with auth)
 *   const me = await http.get('/api/me');
 *   const devices = await http.get<Device[]>('/api/users/' + auth.currentUser + '/devices');
 *
 *   // External API (skip JWT)
 *   const rates = await http.get('https://api.exchangerate.host/latest', { auth: false });
 *
 *   // Custom headers
 *   const data = await http.get('https://api.github.com/user', {
 *     auth: false,
 *     headers: { Authorization: 'Bearer ' + await secrets.get('GITHUB_TOKEN') },
 *   });
 *
 *   // Raw fetch for full control
 *   const resp = await http.raw('https://example.com/upload', {
 *     method: 'POST',
 *     body: formData,
 *   });
 */
interface ScriptHttp {
  /** GET → parse response as JSON. Throws on non-2xx. */
  get<T = unknown>(url: string, options?: HttpOptions): Promise<T>;
  /** POST with JSON body → parse response as JSON. Throws on non-2xx. */
  post<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T>;
  /** PUT with JSON body → parse response as JSON. Throws on non-2xx. */
  put<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T>;
  /** PATCH with JSON body → parse response as JSON. Throws on non-2xx. */
  patch<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T>;
  /** DELETE → parse response as JSON (or null for 204 No Content). Throws on non-2xx. */
  delete<T = unknown>(url: string, options?: HttpOptions): Promise<T>;
  /**
   * GET → return raw response body as plain text.
   * Use when the server returns Markdown, CSV, XML, HTML or any non-JSON format.
   * @example
   *   const csv = await http.getText('/api/export/tasks.csv');
   *   const lines = csv.split('\\n').slice(1); // skip header
   */
  getText(url: string, options?: HttpOptions): Promise<string>;
  /**
   * Low-level escape hatch — returns the native \`Response\` object.
   * No automatic headers are added. Use when you need binary data,
   * streaming, or complete control over the request.
   * @example
   *   const resp = await http.raw('https://example.com/image.png');
   *   const blob = await resp.blob();
   */
  raw(url: string, init?: RequestInit): Promise<Response>;
}

/**
 * Imperative output stream. Each call appends a renderable item; they all
 * display below the block, one under the other, in call order. Use this when
 * you don't know up front how many items you'll produce (loops, conditionals)
 * — for a single rich value, \`return\` is cleaner.
 */
interface DisplayApi {
  /** Append a line of plain text (rendered as monospaced \`<pre>\`). */
  text(str: string): void;
  /** Render a table. Object rows → keys become columns; arrays → indexed. */
  table(data: Array<Record<string, unknown>> | unknown[][]): void;
  /** Render an HTML \`<ul>\` of stringified items. */
  list(items: unknown[]): void;
  /** Pretty-printed JSON dump in a code box. */
  json(obj: unknown): void;
}

/**
 * Configuration for a live block — used with \`reactive(...)\`. The block
 * stays mounted and re-renders each time \`subscribe\`'s callback fires.
 */
interface ReactiveConfig {
  /**
   * Optional eager fetch. Returned value is shown while waiting for the
   * first \`subscribe\` event, so the block doesn't blink "Waiting…" forever
   * when the underlying stream is slow.
   */
  initial?(): Promise<unknown> | unknown;
  /**
   * Subscribe to live updates. Call \`callback(value)\` each time new data
   * arrives. Return a cleanup function — it's called when the block unmounts
   * or re-runs.
   */
  subscribe(callback: (value: unknown) => void): () => void;
  /**
   * Convert each value into a renderable. Strings auto-detect Markdown
   * (headers, **bold**, lists, fenced code), otherwise show as monospace.
   * Can also return a React node directly.
   */
  render(value: unknown): unknown;
}

/**
 * Marker class wrapping a Markdown string — returned by the \`md\` template tag.
 * The output renderer recognises this and runs the content through
 * ReactMarkdown + GFM (tables, task lists, autolinks, fenced code).
 */
declare class MarkdownOutput {
  readonly content: string;
  private constructor();
}

/**
 * Marker class wrapping tabular data — returned by \`table(...)\`. The renderer
 * builds an MUI Table from it.
 */
declare class TableOutput {
  readonly data: Array<Record<string, unknown>> | unknown[][];
  readonly columns?: string[];
  private constructor();
}

/**
 * Marker class for live values — returned by \`reactive(...)\`. The renderer
 * mounts a subscription, shows the LIVE badge, and re-renders on each event.
 */
declare class ReactiveValue {
  readonly config: ReactiveConfig;
  private constructor();
}

/** Anything a Plugin Script can \`return\` and have rendered. */
type ScriptOutput =
  | string
  | MarkdownOutput
  | TableOutput
  | ReactiveValue
  | null
  | undefined;

// ────────────────────────────────────────────────────────────────────────────
//  Globals injected into the script
// ────────────────────────────────────────────────────────────────────────────

/** Bearer JWT, current user, admin flag. See {@link ScriptAuth}. */
declare const auth: ScriptAuth;

/** Authenticated fetch with auto JSON parsing. See {@link ScriptHttp}. */
declare const http: ScriptHttp;

/** Pojedynczy credential (metadane, bez wartości). global=publiczny. */
interface CredentialEntry { key: string; type: string; name: string; global: boolean; updatedAt: number; }

/** Zaszyfrowane credentiale użytkownika (Settings → Sekrety). */
interface CredentialsApi {
  /** Lista WŁASNYCH credentiali (bez wartości). */
  list(): Promise<CredentialEntry[]>;
  /**
   * Odczyt wartości po nazwie. null gdy brak / brak dostępu.
   * @param type  opcjonalny typ 'password'|'token'|'other'
   * @param owner opcjonalny właściciel — odczyt CUDZEGO sekretu (tylko gdy globalny;
   *   dla cudzego owner-a podaj też \`type\`). Domyślnie = zalogowany użytkownik.
   */
  get(name: string, type?: string, owner?: string): Promise<string | null>;
  /** Zapis/aktualizacja. \`global=true\` → publiczny (dostępny dla wszystkich). Domyślny typ 'other'. */
  set(name: string, value: string, type?: string, global?: boolean): Promise<void>;
  /** Usunięcie WŁASNEGO. Zwraca true gdy coś usunięto. */
  delete(name: string, type?: string): Promise<boolean>;
}

/**
 * Dostęp do zaszyfrowanych credentiali użytkownika (Settings → Sekrety).
 * @example
 *   // własny sekret:
 *   const apiKey = await secrets.get('GitHub', 'token');
 *   // globalny sekret innego użytkownika (działa też bez logowania):
 *   const shared = await secrets.get('WeatherKey', 'token', 'marcin');
 */
declare const secrets: CredentialsApi;

/** Imperative output stream. See {@link DisplayApi}. */
declare const display: DisplayApi;

/**
 * Markdown tag-template literal. The result is rendered with full GFM
 * support — tables, task lists, fenced code, autolinks.
 *
 * @example
 *   return md\`# Hello \\\${auth.currentUser}
 *
 *   - Status: **OK**
 *   - Time: \\\`\\\${new Date().toISOString()}\\\`\`;
 */
declare function md(strings: TemplateStringsArray, ...values: unknown[]): MarkdownOutput;

/**
 * Build a table output from rows. Accepts:
 *  - an array of objects (keys become columns), or
 *  - an array of arrays (cells are positional; pass \`columns\` for headers).
 *
 * @example
 *   return table([
 *     { user: 'ada', tasks: 12 },
 *     { user: 'gus', tasks:  5 },
 *   ]);
 *
 *   return table(
 *     [['Ada', 12], ['Gus', 5]],
 *     ['Imię', 'Zadania'],
 *   );
 */
declare function table(
  data: Array<Record<string, unknown>> | unknown[][],
  columns?: string[],
): TableOutput;

/**
 * Build a live reactive value. The block re-renders each time the
 * subscription fires; remember to return a cleanup function from
 * \`subscribe\`.
 *
 * @example
 *   return reactive({
 *     initial: () => http.get('/api/sensor/latest'),
 *     subscribe: (cb) => {
 *       const es = new EventSource('/api/sensor/stream');
 *       es.onmessage = (e) => cb(JSON.parse(e.data));
 *       return () => es.close();
 *     },
 *     render: (v) => md\`🌡 **\\\${v.temperature}°C**\`,
 *   });
 */
declare function reactive(config: ReactiveConfig): ReactiveValue;

// ────────────────────────────────────────────────────────────────────────────
//  Plugin namespaces (loaded dynamically)
// ────────────────────────────────────────────────────────────────────────────
//
//  Web plugins can register additional names via \`api.scripts.register(...)\`.
//  They become available alongside \`auth\` / \`http\` / … and can be accessed
//  the same way (e.g. \`await iot.deviceStatus('lamp-1')\`). Because the set
//  of plugins loaded for the current user is dynamic, these aren't declared
//  here statically — use \`// @ts-ignore\` if Monaco flags an unknown name,
//  or write \`const ns = (globalThis as any).pluginName;\`.
//
// ────────────────────────────────────────────────────────────────────────────
`;
