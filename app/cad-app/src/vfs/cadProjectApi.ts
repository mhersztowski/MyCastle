/**
 * Thin client for the cad-backend VFS REST API.
 *
 * Path convention (multi-user ready):
 *   /users/{userId}/projects/{name}{extension}
 *
 * Files may live in arbitrary sub-directories chosen by the user — every
 * function is directory- and extension-aware so the same API serves CAD
 * projects (`.cad.json`), Scene3D companions (`.scene.json`) and electronics
 * schematics (`.elec.json`).
 *
 * For now userId defaults to 'default' (anonymous, single-user).
 * When auth is added, call setCurrentUserId() from the auth context.
 *
 * All public API functions throw on network or VFS errors — callers
 * should catch and display the error message.
 */

const BASE = '/api/vfs';

/** Abort a VFS request after this many ms so an unreachable backend can't hang the UI forever. */
const REQUEST_TIMEOUT_MS = 12000;

/** Error thrown when the backend is unreachable or does not respond in time. */
class VfsNetworkError extends Error {
  readonly code = 'NETWORK';
  constructor(message: string) {
    super(message);
    this.name = 'VfsNetworkError';
  }
}

/** fetch() with a hard timeout; maps connection/timeout failures to a clear, identifiable error. */
async function vfsFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new VfsNetworkError('CAD backend did not respond — is it running? (port 1897, e.g. `pnpm dev:cad`)');
    }
    // fetch() rejects with a TypeError on connection refused / network error.
    if (e instanceof TypeError) {
      throw new VfsNetworkError('Cannot reach CAD backend — is it running? (port 1897, e.g. `pnpm dev:cad`)');
    }
    throw e;
  }
}

// ── file extensions ───────────────────────────────────────────────────────────

/** CAD project file extension. */
export const CAD_EXT = '.cad.json';
/** Scene3D companion file extension (saved next to a CAD project). */
export const SCENE_EXT = '.scene.json';
/** CAD 3D feature tree file extension (extrude/pocket/mirror/sketch on face + faceRef). */
export const CAD3D_EXT = '.cad3d.json';
/** Electronics schematic file extension. */
export const ELEC_EXT = '.elec.json';
/** PCB project file extension (pełny projekt: sheety + pcb + symbole + footprinty + historia). */
export const PCB_EXT = '.pcb.json';
/** Map project file extension. */
export const MAP_EXT = '.map.json';
/** Notes project file extension. */
export const NOTES_EXT = '.notes.json';

/**
 * Build a read-only viewer URL for a saved scene.
 * `dir` is an absolute VFS directory (e.g. `/users/default/projects`),
 * `name` the file name without extension. Segments are URL-encoded, slashes kept.
 */
export function buildViewerUrl(mode: string, dir: string, name: string): string {
  const full = `${dir}/${name}`.replace(/^\/+/, '');
  return '/viewer/' + mode + '/' + full.split('/').map(encodeURIComponent).join('/');
}

// ── userId management ─────────────────────────────────────────────────────────

let _currentUserId = 'default';

export function getCurrentUserId(): string {
  return _currentUserId;
}

/** Call this when a user logs in / logs out. */
export function setCurrentUserId(id: string): void {
  _currentUserId = id;
}

// ── path helpers ──────────────────────────────────────────────────────────────

/** VFS root directory for a user — the top of the directory browser. */
export function userRootDir(userId = _currentUserId): string {
  return `/users/${userId}`;
}

/** Default VFS directory for a user's projects (browser starts here). */
export function userProjectsDir(userId = _currentUserId): string {
  return `/users/${userId}/projects`;
}

/** Strip characters unsafe for filenames. */
function sanitizeName(name: string): string {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'untitled';
}

/** VFS file path for `{name}{extension}` inside an arbitrary directory. */
function filePath(dir: string, name: string, extension: string): string {
  return `${dir}/${sanitizeName(name)}${extension}`;
}

// ── low-level fetch helpers ───────────────────────────────────────────────────

async function vfsGet<T>(op: string, path?: string): Promise<T> {
  const url = new URL(BASE + op, window.location.origin);
  if (path) url.searchParams.set('path', path);
  const res = await vfsFetch(url.toString());
  const data = await res.json() as { error?: string; code?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function vfsPost(op: string, path?: string | null, body?: unknown): Promise<void> {
  const url = new URL(BASE + op, window.location.origin);
  if (path != null) url.searchParams.set('path', path);
  const res = await vfsFetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

// ── encode / decode UTF-8 ↔ base64 ───────────────────────────────────────────

function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64ToText(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── directory browsing ────────────────────────────────────────────────────────

export interface FileMeta {
  name: string;    // display name (without the extension)
  mtime: number;   // modification timestamp (ms)
  size: number;    // bytes
}

export interface DirListing {
  /** Sub-directory names, sorted alphabetically. */
  dirs: string[];
  /** Files matching the requested extension, sorted newest-first. */
  files: FileMeta[];
}

// VFS FileType enum: 1 = File, 2 = Directory.
const FILE = 1;
const DIRECTORY = 2;

/**
 * List a VFS directory: sub-directories plus the files whose name ends with
 * `extension`. A missing directory yields an empty listing (not an error) so
 * the browser can still let the user create one.
 */
export async function listDirectory(dir: string, extension: string): Promise<DirListing> {
  let entries: Array<{ name: string; type: number }>;
  try {
    const res = await vfsGet<{ entries: Array<{ name: string; type: number }> }>('/readdir', dir);
    entries = res.entries;
  } catch (e) {
    // A missing directory is normal (browser can still create one) → empty listing.
    // A network/timeout failure must surface so the caller stops spinning and shows the error.
    if (e instanceof VfsNetworkError) throw e;
    return { dirs: [], files: [] };
  }

  const dirs = entries
    .filter(e => e.type === DIRECTORY)
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  const matched = entries.filter(e => e.type === FILE && e.name.endsWith(extension));
  const files = await Promise.all(
    matched.map(async e => {
      const filePathAbs = `${dir}/${e.name}`;
      const name = e.name.slice(0, -extension.length);
      try {
        const stat = await vfsGet<{ mtime: number; size: number }>('/stat', filePathAbs);
        return { name, mtime: stat.mtime, size: stat.size };
      } catch {
        return { name, mtime: 0, size: 0 };
      }
    }),
  );
  files.sort((a, b) => b.mtime - a.mtime);

  return { dirs, files };
}

/** Create a directory on the server (parent directories are auto-created). */
export async function createDirectory(path: string): Promise<void> {
  await vfsPost('/mkdir', path, {});
}

// ── directory- and extension-aware file I/O ──────────────────────────────────

/** Read a file's text content from a specific directory. */
export async function readFileAt(dir: string, name: string, extension: string): Promise<string> {
  const res = await vfsGet<{ data: string }>('/readFile', filePath(dir, name, extension));
  return base64ToText(res.data);
}

/** Write (create or overwrite) a file in a specific directory. */
export async function writeFileAt(
  dir: string, name: string, extension: string, text: string,
): Promise<void> {
  await vfsPost('/writeFile', filePath(dir, name, extension), {
    data: textToBase64(text),
    options: { create: true, overwrite: true },
  });
}

/** Delete a file from a specific directory. */
export async function deleteFileAt(dir: string, name: string, extension: string): Promise<void> {
  await vfsPost('/delete', filePath(dir, name, extension), { options: {} });
}

/** Rename a file within a specific directory. */
export async function renameFileAt(
  dir: string, oldName: string, newName: string, extension: string,
): Promise<void> {
  await vfsPost('/rename', null, {
    oldPath: filePath(dir, oldName, extension),
    newPath: filePath(dir, newName, extension),
    options: { overwrite: false },
  });
}

/**
 * Walk `rootDir` recursively and return every file whose name ends with
 * `extension`. `name` is the basename without the extension, `relPath` is the
 * path relative to `rootDir` (with extension). Used by the embed-in-notes
 * picker so files saved in arbitrary sub-directories show up — not only those
 * in the legacy flat `projects/` folder.
 */
export async function listFilesRecursive(
  rootDir: string, extension: string,
): Promise<{ name: string; relPath: string }[]> {
  const out: { name: string; relPath: string }[] = [];
  async function walk(dir: string, relBase: string): Promise<void> {
    let entries: Array<{ name: string; type: number }>;
    try {
      const res = await vfsGet<{ entries: Array<{ name: string; type: number }> }>('/readdir', dir);
      entries = res.entries;
    } catch {
      return; // missing dir is fine — caller may pass a hypothetical root
    }
    for (const e of entries) {
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      if (e.type === DIRECTORY) {
        await walk(`${dir}/${e.name}`, rel);
      } else if (e.type === FILE && e.name.endsWith(extension)) {
        out.push({
          name: rel.slice(0, -extension.length), // includes folder prefix
          relPath: rel,
        });
      }
    }
  }
  await walk(rootDir, '');
  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

// ── generic VFS browsing & binary I/O (for FileSystemPanel) ──────────────────

export interface VfsDirEntry {
  name: string;
  isDir: boolean;
}

/** List ALL entries in a VFS directory (no extension filter). */
export async function vfsListDir(path: string): Promise<VfsDirEntry[]> {
  let entries: Array<{ name: string; type: number }>;
  try {
    const res = await vfsGet<{ entries: Array<{ name: string; type: number }> }>('/readdir', path);
    entries = res.entries;
  } catch {
    return [];
  }
  return entries.map(e => ({ name: e.name, isDir: e.type === DIRECTORY }));
}

function bytesToBase64(data: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    parts.push(String.fromCharCode.apply(null, Array.from(data.subarray(i, i + chunkSize))));
  }
  return btoa(parts.join(''));
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Read any VFS file as raw bytes. */
export async function vfsReadFileBin(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await vfsGet<{ data: string }>('/readFile', path);
  return base64ToBytes(res.data);
}

/** Write any VFS file from raw bytes (creates parent dirs automatically). */
export async function vfsWriteFileBin(path: string, data: Uint8Array): Promise<void> {
  await vfsPost('/writeFile', path, {
    data: bytesToBase64(data),
    options: { create: true, overwrite: true },
  });
}

/** Delete a file or empty directory at an absolute VFS path. */
export async function vfsDeletePath(path: string): Promise<void> {
  await vfsPost('/delete', path, { options: { recursive: true } });
}

// ── Scene3D project API ───────────────────────────────────────────────────────

const SCENE3D_BASE = '/api/scene3d/projects';

export interface Scene3DProjectMeta {
  name: string;
  fileCount: number;
  mtime: number;
}

export interface Scene3DFileMeta {
  name: string;  // without .json extension
  mtime: number;
  size: number;
}

function scene3dHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Cad-User': _currentUserId };
}

function scene3dUrl(path: string): string {
  const url = new URL(`${SCENE3D_BASE}${path}`, window.location.origin);
  url.searchParams.set('user', _currentUserId);
  return url.toString();
}

async function scene3dFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { headers: scene3dHeaders(), ...init });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res;
}

/** List all Scene3D projects (top-level directories). */
export async function listScene3dProjects(): Promise<Scene3DProjectMeta[]> {
  const res = await scene3dFetch(scene3dUrl(''));
  const data = await res.json() as { projects?: Scene3DProjectMeta[] };
  return data.projects ?? [];
}

/** List all .json scene files inside a project. */
export async function listScene3dFiles(project: string): Promise<Scene3DFileMeta[]> {
  const res = await scene3dFetch(scene3dUrl(`/${encodeURIComponent(project)}`));
  const data = await res.json() as { files?: Scene3DFileMeta[] };
  return data.files ?? [];
}

/** Read a scene file from a project. */
export async function readScene3dFile(project: string, file: string): Promise<string> {
  const res = await scene3dFetch(scene3dUrl(`/${encodeURIComponent(project)}/${encodeURIComponent(file)}`));
  const data = await res.json() as { data?: string };
  return base64ToText(data.data!);
}

/** Write (create or overwrite) a scene file in a project. */
export async function writeScene3dFile(project: string, file: string, json: string): Promise<void> {
  await scene3dFetch(
    scene3dUrl(`/${encodeURIComponent(project)}/${encodeURIComponent(file)}`),
    { method: 'POST', body: JSON.stringify({ data: textToBase64(json) }) },
  );
}

/** Delete a single scene file from a project. */
export async function deleteScene3dFile(project: string, file: string): Promise<void> {
  await scene3dFetch(
    scene3dUrl(`/${encodeURIComponent(project)}/${encodeURIComponent(file)}`),
    { method: 'DELETE' },
  );
}

/** Delete an entire project directory and all files inside. */
export async function deleteScene3dProject(project: string): Promise<void> {
  await scene3dFetch(scene3dUrl(`/${encodeURIComponent(project)}`), { method: 'DELETE' });
}

/** Rename a project directory. */
export async function renameScene3dProject(oldName: string, newName: string): Promise<void> {
  await scene3dFetch(
    scene3dUrl(`/${encodeURIComponent(oldName)}/rename`),
    { method: 'POST', body: JSON.stringify({ newName }) },
  );
}

/** List all prefabs from all projects, grouped by project name. */
export async function listAllScene3dPrefabs(): Promise<{ project: string; prefabs: unknown[] }[]> {
  const url = new URL('/api/scene3d/prefabs', window.location.origin);
  url.searchParams.set('user', _currentUserId);
  const res = await fetch(url.toString(), { headers: scene3dHeaders() });
  if (!res.ok) return [];
  const data = await res.json() as { projects?: { project: string; prefabs: unknown[] }[] };
  return data.projects ?? [];
}

/** List all prefab entries stored in a project's prefabs/ directory. */
export async function listScene3dPrefabs(project: string): Promise<unknown[]> {
  const res = await scene3dFetch(scene3dUrl(`/${encodeURIComponent(project)}/prefabs`));
  const data = await res.json() as { prefabs?: unknown[] };
  return data.prefabs ?? [];
}

/** Write (create or overwrite) a prefab JSON file inside a project. */
export async function writeScene3dPrefab(project: string, id: string, data: string): Promise<void> {
  await scene3dFetch(
    scene3dUrl(`/${encodeURIComponent(project)}/prefabs/${encodeURIComponent(id)}`),
    { method: 'POST', body: JSON.stringify({ data: textToBase64(data) }) },
  );
}

/** Delete a prefab JSON file from a project. */
export async function deleteScene3dPrefab(project: string, id: string): Promise<void> {
  await scene3dFetch(
    scene3dUrl(`/${encodeURIComponent(project)}/prefabs/${encodeURIComponent(id)}`),
    { method: 'DELETE' },
  );
}
