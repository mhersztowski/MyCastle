/**
 * Read/write JSON files in the per-user VFS through the REST API
 * (`/api/users/{u}/vfs/*`), bypassing the MQTT-backed `useFilesystem` hook.
 *
 * Why: pages like Health and Memory used to gate their initial read on
 * `useFilesystem.isDataLoaded`, which only flips to true after a successful
 * MQTT connect + recursive directory crawl. When MQTT is slow to come up,
 * fails to authenticate, or `loadAllData()` errors out (broken symlink in
 * VFS, bad backend state…), the gate never opens and the page spins forever.
 *
 * REST VFS works as soon as the backend HTTP layer is alive, with JWT auth
 * straight from localStorage — no MQTT, no preloaded directory tree, no
 * project-wide blast radius for unrelated PIM pages.
 */

/** Read JWT from localStorage — same source MinisApiService uses. */
function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

/** Build the backend's data-relative absolute path for a user-scoped file. */
function fullPath(userName: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+|\/+$/g, '');
  return `/data/Minis/Users/${userName}/${cleaned}`;
}

/**
 * Read a JSON file under `data/Minis/Users/{userName}/{relPath}`.
 * Returns `null` if the file doesn't exist (HTTP 404 — fresh install, never
 * saved). Throws on unexpected HTTP errors so callers can decide how to react.
 */
export async function readUserJson<T = unknown>(userName: string, relPath: string): Promise<T | null> {
  if (!userName) throw new Error('readUserJson: empty userName');
  const u = new URL(
    `/api/users/${encodeURIComponent(userName)}/vfs/readFile`,
    window.location.origin,
  );
  u.searchParams.set('path', fullPath(userName, relPath));
  const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
  if (r.status === 404 || r.status === 500) return null;   // missing file → fresh state
  if (!r.ok) throw new Error(`readUserJson ${relPath}: HTTP ${r.status}`);
  const json = await r.json() as { data?: string };
  if (!json.data) return null;
  // base64 → UTF-8 → JSON
  const binary = atob(json.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`readUserJson ${relPath}: invalid JSON`, err);
    return null;
  }
}

/**
 * Write a JSON file. Creates the file (and parent dirs implicitly via VFS)
 * and overwrites existing content. Throws on HTTP errors.
 */
export async function writeUserJson(userName: string, relPath: string, value: unknown): Promise<void> {
  if (!userName) throw new Error('writeUserJson: empty userName');
  const u = new URL(
    `/api/users/${encodeURIComponent(userName)}/vfs/writeFile`,
    window.location.origin,
  );
  u.searchParams.set('path', fullPath(userName, relPath));
  // UTF-8 → base64 without spread (avoids stack overflow on large files).
  const text = JSON.stringify(value, null, 2);
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const r = await fetch(u.pathname + u.search, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data: btoa(binary), options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeUserJson ${relPath}: HTTP ${r.status}`);
}
