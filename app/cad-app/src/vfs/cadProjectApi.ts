/**
 * Thin client for the cad-backend VFS REST API.
 *
 * Path convention (multi-user ready):
 *   /users/{userId}/projects/{name}.cad.json
 *
 * For now userId defaults to 'default' (anonymous, single-user).
 * When auth is added, call setCurrentUserId() from the auth context.
 *
 * All public API functions throw on network or VFS errors — callers
 * should catch and display the error message.
 */

const BASE = '/api/vfs';

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

/** VFS directory path for a user's projects. */
export function userProjectsDir(userId = _currentUserId): string {
  return `/users/${userId}/projects`;
}

/** VFS file path for a specific project. */
export function userProjectFile(name: string, userId = _currentUserId): string {
  return `/users/${userId}/projects/${sanitizeName(name)}.cad.json`;
}

/** Strip characters unsafe for filenames. */
function sanitizeName(name: string): string {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'untitled';
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

// ── public API ────────────────────────────────────────────────────────────────

export interface ProjectMeta {
  name: string;    // display name (without .cad.json)
  mtime: number;   // modification timestamp (ms)
  size: number;    // bytes
}

/** List all projects for the given user, sorted newest-first. */
export async function listProjects(userId = _currentUserId): Promise<ProjectMeta[]> {
  const dir = userProjectsDir(userId);
  let entries: Array<{ name: string; type: number }>;

  try {
    const res = await vfsGet<{ entries: Array<{ name: string; type: number }> }>('/readdir', dir);
    entries = res.entries;
  } catch {
    // Directory doesn't exist yet (no projects saved) — return empty list.
    return [];
  }

  const cadFiles = entries.filter(e => e.type === 1 && e.name.endsWith('.cad.json'));

  const metas = await Promise.all(
    cadFiles.map(async e => {
      const filePath = `${dir}/${e.name}`;
      try {
        const stat = await vfsGet<{ mtime: number; size: number }>('/stat', filePath);
        return {
          name: e.name.slice(0, -'.cad.json'.length),
          mtime: stat.mtime,
          size: stat.size,
        };
      } catch {
        return { name: e.name.slice(0, -'.cad.json'.length), mtime: 0, size: 0 };
      }
    }),
  );

  return metas.sort((a, b) => b.mtime - a.mtime);
}

/** Read a project's JSON string from the server. */
export async function readProject(name: string, userId = _currentUserId): Promise<string> {
  const res = await vfsGet<{ data: string }>('/readFile', userProjectFile(name, userId));
  return base64ToText(res.data);
}

/** Write (create or overwrite) a project on the server. */
export async function writeProject(name: string, jsonText: string, userId = _currentUserId): Promise<void> {
  await vfsPost('/writeFile', userProjectFile(name, userId), {
    data: textToBase64(jsonText),
    options: { create: true, overwrite: true },
  });
}

/** Delete a project from the server. */
export async function deleteProject(name: string, userId = _currentUserId): Promise<void> {
  await vfsPost('/delete', userProjectFile(name, userId), { options: {} });
}

/** Rename a project on the server. */
export async function renameProject(
  oldName: string,
  newName: string,
  userId = _currentUserId,
): Promise<void> {
  await vfsPost('/rename', null, {
    oldPath: userProjectFile(oldName, userId),
    newPath: userProjectFile(newName, userId),
    options: { overwrite: false },
  });
}

// ── Scene3D companion files (.scene.json) ─────────────────────────────────────

function userSceneFile(name: string, userId = _currentUserId): string {
  return `/users/${userId}/projects/${sanitizeName(name)}.scene.json`;
}

/** Read the Scene3D JSON for a project (throws if not found). */
export async function readSceneProject(name: string, userId = _currentUserId): Promise<string> {
  const res = await vfsGet<{ data: string }>('/readFile', userSceneFile(name, userId));
  return base64ToText(res.data);
}

/** Write (create or overwrite) the Scene3D JSON for a project. */
export async function writeSceneProject(name: string, jsonText: string, userId = _currentUserId): Promise<void> {
  await vfsPost('/writeFile', userSceneFile(name, userId), {
    data: textToBase64(jsonText),
    options: { create: true, overwrite: true },
  });
}
