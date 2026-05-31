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

// ── file extensions ───────────────────────────────────────────────────────────

/** CAD project file extension. */
export const CAD_EXT = '.cad.json';
/** Scene3D companion file extension (saved next to a CAD project). */
export const SCENE_EXT = '.scene.json';
/** Electronics schematic file extension. */
export const ELEC_EXT = '.elec.json';

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
  const res = await fetch(url.toString());
  const data = await res.json() as { error?: string; code?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function vfsPost(op: string, path?: string | null, body?: unknown): Promise<void> {
  const url = new URL(BASE + op, window.location.origin);
  if (path != null) url.searchParams.set('path', path);
  const res = await fetch(url.toString(), {
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
  } catch {
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
