/**
 * Narzędzia VFS dla agenta AI na stronie Aura — dają modelowi dostęp do plików
 * na Drive użytkownika (list/read/write), zakresowany do `…/{userName}/drive`.
 * Wzorzec dostępu (apiUrl/authHeaders/base64) jak w DrivePage.
 */

import type { AiToolDefinition } from '../../../modules/ai/models/AiModels';

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

/** Ścieżka backendu do pliku w Drive użytkownika (bez wyjścia poza drive/). */
function drivePath(userName: string, rel: string): string {
  const cleaned = (rel || '').replace(/^\/+|\/+$/g, '').replace(/\.\.(?:\/|$)/g, ''); // odetnij „../" — brak wyjścia poza drive
  return cleaned ? `/data/Minis/Users/${userName}/drive/${cleaned}` : `/data/Minis/Users/${userName}/drive`;
}

function vfsUrl(userName: string, op: string, rel: string): string {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/${op}`, window.location.origin);
  u.searchParams.set('path', drivePath(userName, rel));
  return u.pathname + u.search;
}

function b64ToText(b64: string): string { try { return decodeURIComponent(escape(atob(b64))); } catch { return atob(b64); } }
function textToB64(s: string): string { try { return btoa(unescape(encodeURIComponent(s))); } catch { return btoa(s); } }
function humanSize(n: number): string { return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; }

async function listDir(userName: string, rel: string): Promise<{ name: string; type: 'file' | 'directory' }[]> {
  const r = await fetch(vfsUrl(userName, 'readdir', rel), { headers: authHeaders() });
  if (!r.ok) throw new Error(`readdir ${r.status}`);
  const j = await r.json() as { entries?: { name: string; type?: number }[] };
  return (j.entries ?? []).map((e) => ({ name: e.name, type: e.type === 2 ? 'directory' as const : 'file' as const }));
}
async function readText(userName: string, rel: string): Promise<string> {
  const r = await fetch(vfsUrl(userName, 'readFile', rel), { headers: authHeaders() });
  if (!r.ok) throw new Error(`readFile ${r.status}`);
  const j = await r.json() as { data?: string };
  return j.data ? b64ToText(j.data) : '';
}
async function writeText(userName: string, rel: string, content: string): Promise<void> {
  const r = await fetch(vfsUrl(userName, 'writeFile', rel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data: textToB64(content), options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeFile ${r.status}`);
}

/** Definicje narzędzi przekazywane do modelu (tool-calling). */
export const VFS_TOOLS: AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Wylistuj pliki i katalogi w Drive użytkownika. path = ścieżka względna (np. "docs"); pusta = katalog główny.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Ścieżka względna w Drive; pusta = katalog główny' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Odczytaj zawartość pliku tekstowego z Drive użytkownika.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Ścieżka względna do pliku (np. "docs/notes.md")' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Zapisz (utwórz lub nadpisz) plik tekstowy w Drive użytkownika.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Ścieżka względna do pliku' }, content: { type: 'string', description: 'Zawartość do zapisania' } }, required: ['path', 'content'] },
    },
  },
];

export interface VfsToolOutcome {
  /** Wynik zwracany do modelu (jako treść wiadomości 'tool'). */
  result: unknown;
  /** Krótki komunikat do pokazania w czacie. */
  info: string;
}

/** Wykonaj narzędzie VFS. Nigdy nie rzuca — błędy zwraca w `result.error` + `info`. */
export async function executeVfsTool(userName: string, name: string, args: Record<string, unknown>): Promise<VfsToolOutcome> {
  const path = String(args.path ?? '');
  try {
    if (name === 'list_files') {
      const items = await listDir(userName, path);
      return { result: { path: path || '/', items }, info: `📁 Lista „${path || '/'}" — ${items.length} pozycji` };
    }
    if (name === 'read_file') {
      const content = await readText(userName, path);
      return { result: { path, content }, info: `📖 Odczytano „${path}" (${humanSize(new Blob([content]).size)})` };
    }
    if (name === 'write_file') {
      const content = String(args.content ?? '');
      await writeText(userName, path, content);
      return { result: { success: true, path }, info: `📝 Zapisano „${path}" (${humanSize(new Blob([content]).size)})` };
    }
    return { result: { error: `Nieznane narzędzie: ${name}` }, info: `⚠️ Nieznane narzędzie: ${name}` };
  } catch (e) {
    const em = e instanceof Error ? e.message : String(e);
    return { result: { error: em }, info: `⚠️ Błąd (${name} „${path}"): ${em}` };
  }
}
