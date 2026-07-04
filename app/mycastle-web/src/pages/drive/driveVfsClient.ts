/**
 * Minimal drive VFS client shared by the Drive right-panel side components
 * (JSON graphical editor, schema picker). Mirrors the URL + auth scheme used
 * inline by DrivePage so these components can do their own read/write/list
 * without threading callbacks through props.
 */

const DIR_TYPE = 2;

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

function backendPath(userName: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+|\/+$/g, '');
  return cleaned
    ? `/data/Minis/Users/${userName}/drive/${cleaned}`
    : `/data/Minis/Users/${userName}/drive`;
}

function apiUrl(userName: string, op: string, relPath: string): string {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/${op}`, window.location.origin);
  u.searchParams.set('path', backendPath(userName, relPath));
  return u.pathname + u.search;
}

function base64ToText(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function textToBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

/** Directory (drive-relative) where reusable JSON Schemas live. */
export const SCHEMA_DIR = 'global/json-schema';

export interface VfsListEntry { name: string; type: number }

export async function readText(userName: string, rel: string): Promise<string> {
  const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
  if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
  const j = (await r.json()) as { data?: string };
  return base64ToText(j.data ?? '');
}

export async function writeText(userName: string, rel: string, content: string): Promise<void> {
  const r = await fetch(apiUrl(userName, 'writeFile', rel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data: textToBase64(content), options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeFile failed: ${r.status}`);
}

export async function listDir(userName: string, rel: string): Promise<VfsListEntry[]> {
  const r = await fetch(apiUrl(userName, 'readdir', rel), { headers: authHeaders() });
  if (!r.ok) {
    if (r.status === 404 || r.status === 500) return [];
    throw new Error(`readdir failed: ${r.status}`);
  }
  const j = (await r.json()) as { entries?: VfsListEntry[] };
  return j.entries ?? [];
}

export const isDirEntry = (e: VfsListEntry) => e.type === DIR_TYPE;
