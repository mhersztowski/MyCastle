/**
 * Drive PIM page — Google-Drive-like file manager backed by the user's VFS.
 *
 * Roots at `data/Minis/Users/{userName}/drive/` and grows from there. Anything
 * placed under the special `public/` subtree is reachable over plain HTTP
 * via `/files/Minis/Users/{userName}/drive/public/{path}` — no auth — so the
 * user can hand out URLs to images, attachments, etc.
 *
 * Operations are pure thin wrappers around the existing per-user VFS API
 * (`/api/users/{u}/vfs/*`). No new backend endpoints needed.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../modules/auth';
import {
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, LinearProgress, Link, ListItemIcon,
  ListItemText, Menu, MenuItem, Paper, Snackbar, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { MdEditor } from '@/components/mdeditor';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import EditIcon from '@mui/icons-material/Edit';
import EditNoteIcon from '@mui/icons-material/EditNote';
import FolderIcon from '@mui/icons-material/Folder';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import HomeIcon from '@mui/icons-material/Home';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LinkIcon from '@mui/icons-material/Link';
import LaunchIcon from '@mui/icons-material/Launch';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import PublicIcon from '@mui/icons-material/Public';
import RefreshIcon from '@mui/icons-material/Refresh';
import TodayIcon from '@mui/icons-material/Today';
import VisibilityIcon from '@mui/icons-material/Visibility';

// ─── VFS helpers ─────────────────────────────────────────────────────────────

interface VfsEntry { name: string; type: 1 | 2; size?: number; mtime?: number }
const FILE_TYPE = 1;
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

function apiUrl(userName: string, op: string, relPath: string, extra: Record<string, string> = {}): string {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/${op}`, window.location.origin);
  u.searchParams.set('path', backendPath(userName, relPath));
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.pathname + u.search;
}

async function vfsListDir(userName: string, relPath: string): Promise<VfsEntry[]> {
  const r = await fetch(apiUrl(userName, 'readdir', relPath), { headers: authHeaders() });
  if (!r.ok) {
    if (r.status === 404 || r.status === 500) return [];   // dir doesn't exist yet — empty
    throw new Error(`readdir failed: ${r.status}`);
  }
  const json = await r.json() as { entries?: VfsEntry[] };
  return (json.entries ?? []).sort((a, b) => {
    if (a.type !== b.type) return a.type === DIR_TYPE ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function vfsMkdir(userName: string, relPath: string): Promise<void> {
  const r = await fetch(apiUrl(userName, 'mkdir', relPath), { method: 'POST', headers: authHeaders() });
  if (!r.ok) throw new Error(`mkdir failed: ${r.status}`);
}

async function vfsDelete(userName: string, relPath: string, recursive: boolean): Promise<void> {
  const r = await fetch(apiUrl(userName, 'delete', relPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ options: { recursive } }),
  });
  if (!r.ok) throw new Error(`delete failed: ${r.status}`);
}

async function vfsRename(userName: string, oldRel: string, newRel: string): Promise<void> {
  const r = await fetch(`/api/users/${encodeURIComponent(userName)}/vfs/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      oldPath: backendPath(userName, oldRel),
      newPath: backendPath(userName, newRel),
    }),
  });
  if (!r.ok) throw new Error(`rename failed: ${r.status}`);
}

async function vfsWriteFile(
  userName: string,
  relPath: string,
  dataB64: string,
  /** Optional callback fired as bytes are streamed up — used by the upload
   *  dialog to draw a per-file progress bar. fetch() doesn't expose upload
   *  progress, so we fall back to XHR for the request body. */
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (onProgress) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl(userName, 'writeFile', relPath));
      xhr.setRequestHeader('Content-Type', 'application/json');
      const auth = authHeaders().Authorization;
      if (auth) xhr.setRequestHeader('Authorization', auth);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`writeFile failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('writeFile failed: network error'));
      xhr.send(JSON.stringify({ data: dataB64, options: { create: true, overwrite: true } }));
    });
    return;
  }
  const r = await fetch(apiUrl(userName, 'writeFile', relPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data: dataB64, options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeFile failed: ${r.status}`);
}

async function vfsCopy(userName: string, sourceRel: string, destRel: string): Promise<void> {
  const r = await fetch(`/api/users/${encodeURIComponent(userName)}/vfs/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      source: backendPath(userName, sourceRel),
      destination: backendPath(userName, destRel),
    }),
  });
  if (!r.ok) throw new Error(`copy failed: ${r.status}`);
}

async function vfsStat(userName: string, relPath: string): Promise<{ type: number } | null> {
  const r = await fetch(apiUrl(userName, 'stat', relPath), { headers: authHeaders() });
  if (!r.ok) return null;
  return r.json();
}

// ─── MIME + encoding helpers ─────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
  csv: 'text/csv', tsv: 'text/tab-separated-values', log: 'text/plain',
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', ts: 'text/typescript',
  tsx: 'text/typescript', jsx: 'text/javascript',
  py: 'text/x-python', sh: 'text/x-shellscript', rb: 'text/x-ruby',
  go: 'text/x-go', rs: 'text/x-rust', java: 'text/x-java',
  c: 'text/x-c', h: 'text/x-c', cpp: 'text/x-c++', hpp: 'text/x-c++',
  toml: 'text/x-toml', ini: 'text/plain', env: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
};
function guessMime(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
const isTextMime = (m: string) => m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || m === 'image/svg+xml';
// Files we offer to open in MdEditor. Plain text is valid markdown (round-trips
// safely as long as the user doesn't add markdown syntax), so .txt is included.
const isMdEditable = (name: string) => {
  const n = name.toLowerCase();
  return n.endsWith('.md') || n.endsWith('.txt') || n.endsWith('.markdown');
};
const isImageMime = (m: string) => m.startsWith('image/') && m !== 'image/svg+xml';
const isPdfMime = (m: string) => m === 'application/pdf';
const isAudioMime = (m: string) => m.startsWith('audio/');
const isVideoMime = (m: string) => m.startsWith('video/');

function base64ToText(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function textToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = fr.result;
      if (typeof r !== 'string') { reject(new Error('FileReader gave non-string')); return; }
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Resolve filename collisions by appending " (copy)", " (copy 2)", ... before
 * the extension. Probes via stat — returns the first free path.
 */
async function uniqueName(userName: string, dirRel: string, baseName: string): Promise<string> {
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const ext = dot > 0 ? baseName.slice(dot) : '';
  for (let i = 0; i < 50; i++) {
    const candidateName = i === 0 ? baseName : `${stem} (copy${i > 1 ? ' ' + i : ''})${ext}`;
    const rel = dirRel ? `${dirRel}/${candidateName}` : candidateName;
    const stat = await vfsStat(userName, rel);
    if (!stat) return candidateName;
  }
  return `${stem} (copy ${Date.now()})${ext}`;
}

/** Convert a File to base64 (no `data:...,` prefix). Streams via FileReader. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const r = fr.result;
      if (typeof r !== 'string') { reject(new Error('FileReader gave non-string')); return; }
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    fr.onerror = () => reject(fr.error ?? new Error('FileReader failed'));
    fr.readAsDataURL(file);
  });
}

/** Read the JWT from localStorage — same source as authHeaders(). */
function authToken(): string | undefined {
  try {
    const raw = localStorage.getItem('minis_current_user');
    return raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
  } catch { return undefined; }
}

/**
 * Trigger a file download. Uses the backend's `?download=1` mode which streams
 * raw bytes with `Content-Disposition: attachment` — works in:
 *   - Desktop browsers (handled by the browser's native download UI)
 *   - Android WebView (intercepted by `onShouldStartLoadWithRequest` in
 *     `mycastle-mobile/App.tsx`, which hands the URL to the system browser /
 *     Chrome so Android's download manager takes over)
 *
 * The old blob + `<a download>` trick worked on desktop only — Android WebView
 * silently ignores the `download` attribute on JS-created blob URLs.
 *
 * Token goes in the query string because WebView nav + `window.open` cannot
 * carry an Authorization header. The token URL is short-lived (per-session JWT).
 */
function downloadFile(userName: string, relPath: string, _name: string): void {
  const token = authToken();
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readFile`, window.location.origin);
  u.searchParams.set('path', backendPath(userName, relPath));
  u.searchParams.set('download', '1');
  if (token) u.searchParams.set('token', token);
  // Anchor click — desktop browsers honor Content-Disposition: attachment and
  // never actually navigate; Android WebView fires onShouldStartLoadWithRequest
  // for this URL and the mobile shell delegates to the system browser.
  const link = document.createElement('a');
  link.href = u.pathname + u.search;
  link.rel = 'noopener';
  // No `target="_blank"` — would leave a blank tab dangling on desktop.
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Path under /drive/ that lives in the public subtree
function isPublic(relPath: string): boolean {
  return relPath === 'public' || relPath.startsWith('public/');
}

function publicUrl(userName: string, relPath: string): string {
  // Backend exposes a dedicated public endpoint that ONLY serves
  // data/Minis/Users/{u}/drive/public/* (with path-traversal guard).
  // `relPath` already starts with "public/..." for files in the public
  // subtree — strip that prefix and let the URL itself say `/public/...`.
  const rest = relPath.startsWith('public/') ? relPath.slice('public/'.length) : relPath;
  return `${window.location.origin}/public/drive/users/${encodeURIComponent(userName)}/${rest.split('/').map(encodeURIComponent).join('/')}`;
}

function formatBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DrivePage(): React.JSX.Element {
  // Prefer the URL param (legacy route `/user/:userName/pim/drive`) but fall
  // back to the logged-in user so this component also works as a Global window
  // mounted outside any route — there `useParams` returns no userName.
  const params = useParams<{ userName: string }>();
  const { currentUser } = useAuth();
  const userName = params.userName || currentUser?.name || '';
  const [cwd, setCwd] = useState('');                       // relative under /drive/
  const [entries, setEntries] = useState<VfsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Upload progress dialog state. `done` counts files already finished,
  // `currentName` is the file mid-flight, `currentPct` its byte progress.
  // Total file count is `done + (currentName ? 1 : 0) + remaining` — but
  // we keep the `total` field so the overall bar doesn't jump backwards
  // when the dialog closes.
  const [uploading, setUploading] = useState<{
    done: number;
    total: number;
    currentName: string | null;
    currentPct: number;
    failed: number;
  } | null>(null);
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success'|'error'|'info' }>({ open: false, msg: '', severity: 'success' });
  const [menuFor, setMenuFor] = useState<{ anchor: HTMLElement; entry: VfsEntry } | null>(null);
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameDialog, setRenameDialog] = useState<{ entry: VfsEntry; value: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Clipboard for cut/copy/paste. `mode` decides whether paste moves (cut) or duplicates (copy).
  const [clipboard, setClipboard] = useState<{ entry: VfsEntry; sourceDir: string; mode: 'copy' | 'cut' } | null>(null);
  // View dialog state. textContent is set only when the MIME maps to a text-like format
  // (so the dialog can render <pre> with selectable, copyable contents).
  const [viewing, setViewing] = useState<{ entry: VfsEntry; mime: string; dataB64: string; textContent?: string } | null>(null);
  // "New empty file" dialog. Just a name field — content is empty bytes.
  const [newFileDialog, setNewFileDialog] = useState<{ name: string } | null>(null);
  // "Create from clipboard" dialog. `kind` distinguishes between system clipboard text
  // (editable in a textarea) and an image blob (rendered as a preview, name editable).
  const [clipboardCreateDialog, setClipboardCreateDialog] = useState<{
    name: string;
    kind: 'text' | 'image';
    textContent: string;
    imageB64: string;
    imageMime: string;
  } | null>(null);
  // Inline MdEditor session (desktop/tablet split view only). On mobile we still
  // open MdEditor in a new tab via `/editor/md/{path}` for simplicity.
  const [mdEditing, setMdEditing] = useState<{
    entry: VfsEntry; rel: string; initialContent: string; saving: boolean;
  } | null>(null);
  // True → right panel takes the full canvas, sidebar (file list) is hidden.
  // Auto-resets to false whenever the right panel closes.
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  // Anchor element for the toolbar "Actions" dropdown.
  const [actionsMenu, setActionsMenu] = useState<HTMLElement | null>(null);
  // Upload dialog — staging area: user picks files / drops them in, sees a
  // summary with sizes, then commits with the upload button. Previous flow
  // fired the native file picker and started uploading immediately, leaving
  // no chance to review or remove items.
  const [uploadDialog, setUploadDialog] = useState<{ files: File[] } | null>(null);
  // Hidden input refs — two separate ones so the staging dialog and the
  // legacy direct upload don't fight over the same `onChange` handler.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogFileInputRef = useRef<HTMLInputElement>(null);

  // Preview-navigation derived state — only file entries (directories are
  // navigated by double-click into them, not previewed).
  const fileEntries = useMemo(() => entries.filter((e) => e.type === FILE_TYPE), [entries]);
  const currentPreviewIdx = viewing ? fileEntries.findIndex((e) => e.name === viewing.entry.name) : -1;
  const hasPrev = currentPreviewIdx > 0;
  const hasNext = currentPreviewIdx >= 0 && currentPreviewIdx < fileEntries.length - 1;

  // Layout flags. The right panel embed kicks in at tablet portrait (≥sm,
  // ~600px) — small phones in portrait still fall back to the full-screen
  // Dialog because the sidebar+panel can't both fit comfortably below 600px.
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('sm'));
  // Below `md` (mobile and tablet portrait) the preview toolbar is too narrow
  // to hold every action button — collapse copy/edit/download into a kebab menu.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [viewActionsMenu, setViewActionsMenu] = useState<HTMLElement | null>(null);
  const panelOpen = !!(viewing || mdEditing);
  const showSidebar = !(isWide && panelFullscreen);
  const showRightPanel = isWide && panelOpen;

  const toast = useCallback((msg: string, severity: 'success'|'error'|'info' = 'success') => {
    setSnack({ open: true, msg, severity });
  }, []);

  // ── Initial mkdir + refresh ─────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Make sure /drive/ exists at all — first-time users won't have it.
      if (cwd === '') {
        await vfsMkdir(userName, '').catch(() => {/* already exists */});
      }
      const list = await vfsListDir(userName, cwd);
      setEntries(list);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [userName, cwd, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  // When the right panel closes (file deselected, MdEditor closed) drop the
  // fullscreen toggle — otherwise next time it opens it stays expanded with
  // no obvious way back without a re-click.
  useEffect(() => { if (!panelOpen) setPanelFullscreen(false); }, [panelOpen]);

  // Going narrower than `md` while the inline panel is open: collapse the embed
  // because the sidebar would otherwise vanish completely without a way out
  // (no Dialog open, no Drive list visible).
  useEffect(() => { if (!isWide) setPanelFullscreen(false); }, [isWide]);

  // Forward-declared ref for the paste handler; the actual callback is set
  // below once `clipboard` + other state is in scope. Lets the keyboard
  // shortcut effect attach to `window` without a TDZ cycle.
  const pasteRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (newFolderDialog || renameDialog || menuFor || viewing || newFileDialog || clipboardCreateDialog) return;
      const ctrl = e.metaKey || e.ctrlKey;
      if (!ctrl) return;
      if (e.key === 'v') {
        e.preventDefault();
        pasteRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [newFolderDialog, renameDialog, menuFor, viewing, newFileDialog, clipboardCreateDialog]);

  // ── Operations ──────────────────────────────────────────────────────────
  const onOpen = useCallback((entry: VfsEntry) => {
    if (entry.type === DIR_TYPE) {
      setCwd((p) => (p ? `${p}/${entry.name}` : entry.name));
    } else {
      // Double-click on a file → preview (matches OS file managers more closely
      // than auto-download; user can still hit "Pobierz" from menu or dialog).
      void (async () => {
        try {
          const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
          const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
          if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
          const json = await r.json() as { data?: string };
          const mime = guessMime(entry.name);
          const data = json.data ?? '';
          const textContent = isTextMime(mime) ? base64ToText(data) : undefined;
          setViewing({ entry, mime, dataB64: data, textContent });
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      })();
    }
  }, [userName, cwd, toast]);

  const onDownload = useCallback(async (entry: VfsEntry) => {
    try {
      await downloadFile(userName, cwd ? `${cwd}/${entry.name}` : entry.name, entry.name);
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [userName, cwd, toast]);

  const onDelete = useCallback(async (entry: VfsEntry) => {
    const kind = entry.type === DIR_TYPE ? 'katalog' : 'plik';
    if (!confirm(`Usunąć ${kind} "${entry.name}"${entry.type === DIR_TYPE ? ' i całą jego zawartość' : ''}?`)) return;
    try {
      await vfsDelete(userName, cwd ? `${cwd}/${entry.name}` : entry.name, entry.type === DIR_TYPE);
      toast(`Usunięto "${entry.name}"`);
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [userName, cwd, refresh, toast]);

  const doRename = useCallback(async () => {
    if (!renameDialog) return;
    const newName = renameDialog.value.trim();
    if (!newName || newName === renameDialog.entry.name) { setRenameDialog(null); return; }
    if (newName.includes('/')) { toast('Nazwa nie może zawierać "/"', 'error'); return; }
    try {
      const oldRel = cwd ? `${cwd}/${renameDialog.entry.name}` : renameDialog.entry.name;
      const newRel = cwd ? `${cwd}/${newName}` : newName;
      await vfsRename(userName, oldRel, newRel);
      toast(`Zmieniono nazwę na "${newName}"`);
      setRenameDialog(null);
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [renameDialog, userName, cwd, refresh, toast]);

  const doMkdir = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || name.includes('/')) { toast('Nazwa katalogu nie może być pusta ani zawierać "/"', 'error'); return; }
    try {
      await vfsMkdir(userName, cwd ? `${cwd}/${name}` : name);
      toast(`Utworzono katalog "${name}"`);
      setNewFolderDialog(false);
      setNewFolderName('');
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [newFolderName, userName, cwd, refresh, toast]);

  const moveToPublic = useCallback(async (entry: VfsEntry) => {
    if (isPublic(cwd ? `${cwd}/${entry.name}` : entry.name)) {
      toast('Plik jest już w katalogu public/', 'info');
      return;
    }
    try {
      await vfsMkdir(userName, 'public').catch(() => {/* exists */});
      const oldRel = cwd ? `${cwd}/${entry.name}` : entry.name;
      await vfsRename(userName, oldRel, `public/${entry.name}`);
      toast(`Przeniesiono "${entry.name}" do public/`);
      await refresh();
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [userName, cwd, refresh, toast]);

  // ── Cut / Copy / Paste ────────────────────────────────────────────────

  const copyToClipboard = useCallback((entry: VfsEntry, mode: 'copy' | 'cut') => {
    setClipboard({ entry, sourceDir: cwd, mode });
    const verb = mode === 'cut' ? 'Wycięto' : 'Skopiowano';
    toast(`${verb} "${entry.name}" — wklej w wybranym katalogu (Wklej / ⌘V)`, 'info');
  }, [cwd, toast]);

  const paste = useCallback(async () => {
    if (!clipboard) return;
    try {
      const sourceRel = clipboard.sourceDir ? `${clipboard.sourceDir}/${clipboard.entry.name}` : clipboard.entry.name;
      // Same-dir paste needs a new name to avoid clobbering the source.
      const destName = (clipboard.sourceDir === cwd)
        ? await uniqueName(userName, cwd, clipboard.entry.name)
        : await uniqueName(userName, cwd, clipboard.entry.name);
      const destRel = cwd ? `${cwd}/${destName}` : destName;

      if (clipboard.mode === 'cut') {
        // Move via rename (works across dirs in the same VFS root)
        await vfsRename(userName, sourceRel, destRel);
        toast(`Przeniesiono "${clipboard.entry.name}" → "${destName}"`);
      } else {
        await vfsCopy(userName, sourceRel, destRel);
        toast(`Skopiowano "${clipboard.entry.name}" → "${destName}"`);
      }
      // Cut: clipboard consumed. Copy: preserved so user can paste multiple times.
      if (clipboard.mode === 'cut') setClipboard(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [clipboard, userName, cwd, refresh, toast]);

  // Wire the forward-declared ref so Ctrl/Cmd+V calls the latest paste closure.
  useEffect(() => { pasteRef.current = () => { void paste(); }; }, [paste]);

  const copyPublicUrl = useCallback(async (entry: VfsEntry) => {
    const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
    if (!isPublic(rel)) {
      toast('Plik nie jest w public/ — użyj "Make public" najpierw', 'error');
      return;
    }
    const url = publicUrl(userName, rel);
    try {
      await navigator.clipboard.writeText(url);
      toast('Link skopiowany do schowka');
    } catch {
      // Some browsers / contexts block clipboard — fall back to prompt
      prompt('Skopiuj link ręcznie:', url);
    }
  }, [userName, cwd, toast]);

  // ── View / Open / Create ────────────────────────────────────────────────

  const viewFile = useCallback(async (entry: VfsEntry) => {
    if (entry.type !== FILE_TYPE) return;
    try {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const mime = guessMime(entry.name);
      const data = json.data ?? '';
      // Decode UTF-8 only for text-like MIMEs; for binary we keep the base64
      // string and render via data: URLs (img / iframe / audio / video).
      const textContent = isTextMime(mime) ? base64ToText(data) : undefined;
      setViewing({ entry, mime, dataB64: data, textContent });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, toast]);

  // Open .md in MdEditor.
  //   - Tablet portrait + desktop (≥sm): inline split-view inside DrivePage —
  //     Drive listing on the left, MdEditor on the right. Fullscreen toggle
  //     hides the left side.
  //   - Phone portrait (<sm): new tab to `/editor/md/{path}` (MdEditorPage uses
  //     `mqttClient.readFile` which resolves against ROOT_DIR, hence the full path).
  // `relOverride` lets callers (Today journal, etc.) point at a file that
  // isn't in the current cwd without first navigating there. When omitted
  // we fall back to the per-entry cwd-based path, preserving existing
  // call sites that pass just an entry from the file list.
  const openInMdEditor = useCallback(async (entry: VfsEntry, relOverride?: string) => {
    const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
    if (!isWide) {
      const fullPath = `data/Minis/Users/${userName}/drive/${rel}`;
      const encoded = fullPath.split('/').map(encodeURIComponent).join('/');
      window.open(`/editor/md/${encoded}`, '_blank');
      return;
    }
    try {
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const content = base64ToText(json.data ?? '');
      setViewing(null);          // swap from preview → editor
      setMdEditing({ entry, rel, initialContent: content, saving: false });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, isWide, toast]);

  // Auto-save callback from MdEditor. Fires on debounce (2s) and on the
  // toolbar's manual save button. Idempotent — writes the whole document each time.
  const saveMdContent = useCallback(async (markdown: string) => {
    setMdEditing((prev) => prev ? { ...prev, saving: true } : null);
    // Read latest mdEditing via functional setter pattern — closure could be stale
    // if the user switches files mid-save. We resolve rel from a snapshot below.
    const snapshot = mdEditing;
    if (!snapshot) return;
    try {
      await vfsWriteFile(userName, snapshot.rel, textToBase64(markdown));
      toast(`Zapisano "${snapshot.entry.name}"`, 'success');
    } catch (err) {
      toast(`Nie zapisano: ${(err as Error).message}`, 'error');
    } finally {
      setMdEditing((prev) => prev ? { ...prev, saving: false } : null);
    }
  }, [mdEditing, userName, toast]);

  const closeRightPanel = useCallback(() => {
    setViewing(null);
    setMdEditing(null);
    setPanelFullscreen(false);
  }, []);

  /**
   * Open today's journal entry. Path convention: `Calendar/YYYY/MM/DD.md`
   * (zero-padded). Creates the file with a small header template the first
   * time it's opened on a given day, then jumps the file list to its folder
   * and pops the MdEditor with that entry.
   */
  const openTodayJournal = useCallback(async () => {
    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const folderRel = `Calendar/${yyyy}/${mm}`;
    const fileName = `${dd}.md`;
    const rel = `${folderRel}/${fileName}`;

    try {
      // Ensure the year/month folders exist. vfsMkdir errors when a dir
      // already exists, which is what we want for "create if missing" —
      // swallow the failure with .catch(() => {}).
      await vfsMkdir(userName, 'Calendar').catch(() => {});
      await vfsMkdir(userName, `Calendar/${yyyy}`).catch(() => {});
      await vfsMkdir(userName, folderRel).catch(() => {});

      // Create the file with a small ISO-date + weekday template only on
      // first open of the day, never clobbering an existing entry.
      const stat = await vfsStat(userName, rel);
      if (!stat) {
        const weekday = today.toLocaleDateString('pl-PL', { weekday: 'long' });
        const template = `# ${yyyy}-${mm}-${dd} (${weekday})\n\n`;
        await vfsWriteFile(userName, rel, textToBase64(template));
        toast(`Utworzono dziennik na dziś — ${yyyy}-${mm}-${dd}`);
      }

      // Jump the file list to the month folder so the user has context
      // (other days that week, …) when they close the editor.
      setCwd(folderRel);
      // refresh() is triggered by useEffect on `cwd` change, so we don't
      // need to await it here — just open the editor with an explicit path.
      const fakeEntry: VfsEntry = { name: fileName, type: FILE_TYPE };
      await openInMdEditor(fakeEntry, rel);
    } catch (err) {
      toast(`Błąd otwarcia dziennika: ${(err as Error).message}`, 'error');
    }
  }, [userName, openInMdEditor, toast]);

  // Step ±1 through `fileEntries` while previewing. Reuses `viewFile()` so
  // the same code path handles fetching, MIME detection and state swap.
  const navigatePreview = useCallback(async (delta: number) => {
    if (!viewing || currentPreviewIdx < 0) return;
    const target = fileEntries[currentPreviewIdx + delta];
    if (!target) return;
    await viewFile(target);
  }, [viewing, currentPreviewIdx, fileEntries, viewFile]);

  // Arrow-key navigation in preview mode. Disabled while:
  //   - any dialog/menu is open (avoid hijacking dialog focus)
  //   - MdEditor is active (arrow keys = cursor movement)
  //   - the focus is inside a text input (search box, etc.)
  useEffect(() => {
    if (!viewing || mdEditing) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (newFolderDialog || renameDialog || menuFor || newFileDialog || clipboardCreateDialog || actionsMenu) return;
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        void navigatePreview(-1);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        void navigatePreview(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeRightPanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewing, mdEditing, hasPrev, hasNext, navigatePreview, closeRightPanel,
      newFolderDialog, renameDialog, menuFor, newFileDialog, clipboardCreateDialog, actionsMenu]);

  const doCreateEmpty = useCallback(async () => {
    if (!newFileDialog) return;
    const name = newFileDialog.name.trim();
    if (!name || name.includes('/')) {
      toast('Nazwa nie może być pusta ani zawierać "/"', 'error');
      return;
    }
    try {
      const rel = cwd ? `${cwd}/${name}` : name;
      const exists = await vfsStat(userName, rel);
      if (exists) { toast(`Plik "${name}" już istnieje — wybierz inną nazwę`, 'error'); return; }
      await vfsWriteFile(userName, rel, '');     // empty payload — zero-byte file
      toast(`Utworzono "${name}"`);
      setNewFileDialog(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [newFileDialog, userName, cwd, refresh, toast]);

  // Suggest a filename based on what the text content looks like — markdown
  // header, JSON, XML, or plain text. Used both at dialog-open time and again
  // after manual paste (mobile fallback path).
  const suggestNameForText = (text: string): string => {
    const trim = text.trim();
    if (!trim) return 'clipboard.txt';
    if (trim.startsWith('#')) return 'clipboard.md';
    if ((trim.startsWith('{') && trim.endsWith('}')) || (trim.startsWith('[') && trim.endsWith(']'))) return 'clipboard.json';
    if (trim.startsWith('<') && trim.endsWith('>')) return 'clipboard.xml';
    return 'clipboard.txt';
  };

  const openCreateFromClipboard = useCallback(async () => {
    // Step 1 — try image clipboard via `read()`. Only modern desktop browsers
    // in a secure context support it; on mobile / HTTP it silently fails.
    try {
      const clipReadable = navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItem[]> };
      if (typeof clipReadable?.read === 'function') {
        const items = await clipReadable.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const b64 = await blobToBase64(blob);
            const ext = imgType.split('/')[1] || 'png';
            const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            setClipboardCreateDialog({
              name: `clipboard-${ts}.${ext}`,
              kind: 'image', textContent: '', imageB64: b64, imageMime: imgType,
            });
            return;
          }
        }
      }
    } catch { /* image clipboard not available — fall through to text */ }

    // Step 2 — try text clipboard. Same constraints (secure context + permission).
    // If this fails (mobile, HTTP, denied permission, or just empty clipboard),
    // we still open the dialog with empty content and let the user paste manually
    // via the OS keyboard. The text field auto-focuses so paste works immediately.
    let prefilledText = '';
    try {
      prefilledText = await navigator.clipboard.readText();
    } catch { /* clipboard API blocked — manual paste fallback */ }
    setClipboardCreateDialog({
      name: suggestNameForText(prefilledText),
      kind: 'text',
      textContent: prefilledText,
      imageB64: '', imageMime: '',
    });
  }, []);

  const doCreateFromClipboard = useCallback(async () => {
    if (!clipboardCreateDialog) return;
    const name = clipboardCreateDialog.name.trim();
    if (!name || name.includes('/')) {
      toast('Nazwa nie może być pusta ani zawierać "/"', 'error');
      return;
    }
    try {
      // Auto-suffix on collision instead of failing — clipboard pastes are usually rapid.
      const finalName = await uniqueName(userName, cwd, name);
      const rel = cwd ? `${cwd}/${finalName}` : finalName;
      const b64 = clipboardCreateDialog.kind === 'image'
        ? clipboardCreateDialog.imageB64
        : textToBase64(clipboardCreateDialog.textContent);
      await vfsWriteFile(userName, rel, b64);
      toast(`Utworzono "${finalName}"`);
      setClipboardCreateDialog(null);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [clipboardCreateDialog, userName, cwd, refresh, toast]);

  // Copy view-dialog text content to the system clipboard.
  const copyViewTextToSystem = useCallback(async () => {
    if (!viewing?.textContent) return;
    try {
      await navigator.clipboard.writeText(viewing.textContent);
      toast('Skopiowano cały tekst do schowka');
    } catch {
      toast('Nie udało się skopiować — zaznacz tekst i użyj ⌘C', 'error');
    }
  }, [viewing, toast]);

  // ── Upload (file input + drag-and-drop) ─────────────────────────────────
  const upload = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    // Base64 encoding inflates ~33%. The backend's JSON body cap is 200 MB,
    // so anything past ~140 MB raw will be rejected before we even POST.
    // Pre-flight check gives a useful error instead of a vague 500.
    const HARD_LIMIT_BYTES = 140 * 1024 * 1024;
    setUploading({ done: 0, total: arr.length, currentName: null, currentPct: 0, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const file of arr) {
      // Show file name + reset per-file progress before each file starts.
      setUploading({ done, total: arr.length, currentName: file.name, currentPct: 0, failed });
      try {
        if (file.size > HARD_LIMIT_BYTES) {
          throw new Error(`Plik za duży (${(file.size / 1024 / 1024).toFixed(1)} MB; limit ${(HARD_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB)`);
        }
        const b64 = await fileToBase64(file);
        const rel = cwd ? `${cwd}/${file.name}` : file.name;
        // Live byte progress via the XHR variant of vfsWriteFile.
        await vfsWriteFile(userName, rel, b64, (pct) => {
          setUploading((prev) => prev ? { ...prev, currentPct: pct } : prev);
        });
      } catch (err) {
        failed++;
        const msg = (err as Error).message;
        // Detect typical "body too large" failure modes from the backend
        // and surface them with a friendlier hint than the raw HTTP code.
        const friendly = /413|too large/i.test(msg)
          ? `Plik za duży dla serwera (${(file.size / 1024 / 1024).toFixed(1)} MB) — zwiększ limit lub podziel`
          : msg;
        toast(`Błąd uploadu "${file.name}": ${friendly}`, 'error');
      }
      done++;
      setUploading((prev) => prev ? { ...prev, done, currentPct: 100, failed } : prev);
    }
    setUploading(null);
    const ok = done - failed;
    if (ok > 0) toast(`Wgrano ${ok} z ${arr.length} plików`);
    await refresh();
  }, [userName, cwd, refresh, toast]);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void upload(e.target.files);
    e.target.value = '';
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void upload(e.dataTransfer.files);
    }
  }, [upload]);

  // ── Upload dialog: staging area for files before commit ────────────────

  const openUploadDialog = useCallback(() => {
    setUploadDialog({ files: [] });
  }, []);

  /** Append picked / dropped files to the staging list, skipping duplicates
   *  (same name + same size = treat as already added). */
  const addFilesToUploadDialog = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploadDialog((prev) => {
      if (!prev) return prev;
      const seen = new Set(prev.files.map(f => `${f.name}:${f.size}`));
      const merged = [...prev.files];
      for (const f of arr) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) { merged.push(f); seen.add(key); }
      }
      return { files: merged };
    });
  }, []);

  const removeFileFromUploadDialog = useCallback((idx: number) => {
    setUploadDialog((prev) => prev ? { files: prev.files.filter((_, i) => i !== idx) } : prev);
  }, []);

  const onDialogFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFilesToUploadDialog(e.target.files);
    e.target.value = '';   // reset so re-picking the same file fires onChange
  }, [addFilesToUploadDialog]);

  // Commit dialog: kicks the existing `upload()` pipeline with all staged
  // files in one batch, then closes the dialog on success.
  const commitUploadDialog = useCallback(async () => {
    if (!uploadDialog || uploadDialog.files.length === 0) return;
    const files = uploadDialog.files;
    setUploadDialog(null);
    await upload(files);
  }, [uploadDialog, upload]);

  // ── Breadcrumbs ─────────────────────────────────────────────────────────
  const segments = useMemo(() => cwd ? cwd.split('/').filter(Boolean) : [], [cwd]);

  const currentIsPublic = isPublic(cwd) || cwd === '';   // root counts as not-public

  // ── Right panel content (View or MdEditor) ──────────────────────────────
  // Rendered both as embedded panel (desktop) and as Dialog content (mobile).
  const viewerBody = viewing && (
    viewing.textContent !== undefined ? (
      <Box component="pre" sx={{
        m: 0, p: 1.5, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 13, lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        userSelect: 'text', cursor: 'text',
        overflow: 'auto', height: '100%',
        bgcolor: 'action.hover', borderRadius: 0,
      }}>
        {viewing.textContent}
      </Box>
    ) : isImageMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', p: 2, height: '100%', overflow: 'auto' }}>
        <img
          src={`data:${viewing.mime};base64,${viewing.dataB64}`}
          alt={viewing.entry.name}
          style={{ maxWidth: '100%', maxHeight: 'calc(100% - 16px)' }}
        />
      </Box>
    ) : isPdfMime(viewing.mime) ? (
      <Box component="iframe"
        src={`data:application/pdf;base64,${viewing.dataB64}`}
        sx={{ width: '100%', height: '100%', border: 0 }}
      />
    ) : isAudioMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
        <Box component="audio" controls
          src={`data:${viewing.mime};base64,${viewing.dataB64}`}
          sx={{ width: '100%', maxWidth: 500 }}
        />
      </Box>
    ) : isVideoMime(viewing.mime) ? (
      <Box component="video" controls
        src={`data:${viewing.mime};base64,${viewing.dataB64}`}
        sx={{ width: '100%', maxHeight: '100%', display: 'block' }}
      />
    ) : (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Plik binarny <code>{viewing.mime}</code> (~{formatBytes(Math.floor(viewing.dataB64.length * 3 / 4))}) —
          podgląd niedostępny w przeglądarce. Pobierz, aby otworzyć w odpowiedniej aplikacji.
        </Alert>
      </Box>
    )
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {showSidebar && (
      <Box sx={{
        p: 2,
        display: 'flex', flexDirection: 'column',
        // 280-620px sidebar: low end fits tablet portrait (~600px viewport)
        // with ~320px left for the right panel; high end caps on ultrawides
        // so the editor gets the dominant share.
        flex: showRightPanel ? `0 0 clamp(280px, 36%, 620px)` : 1,
        minWidth: 0, overflow: 'hidden',
        borderRight: showRightPanel ? '1px solid' : 'none',
        borderColor: 'divider',
      }}>
      {/* Header — single "Actions" dropdown gathers every directory-level
          operation. Per-file ops live in the row's context menu (MoreVertIcon). */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography variant="h5" sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <DriveFolderUploadIcon /> Drive
          {clipboard && (
            <Chip
              size="small"
              variant="outlined"
              color="primary"
              icon={<ContentPasteIcon />}
              label={`${clipboard.mode === 'cut' ? 'Wycięto' : 'Skopiowano'}: ${clipboard.entry.name}`}
              sx={{ ml: 1, fontWeight: 400 }}
            />
          )}
        </Typography>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFileInputChange} />
        <Tooltip title="Otwórz/utwórz dziennik na dziś — Calendar/{rok}/{miesiąc}/{dzień}.md">
          <Button
            variant="outlined"
            startIcon={<TodayIcon />}
            onClick={openTodayJournal}
          >
            Today
          </Button>
        </Tooltip>
        <Button
          variant="contained"
          endIcon={<KeyboardArrowDownIcon />}
          onClick={(e) => setActionsMenu(e.currentTarget)}
        >
          Actions
        </Button>
      </Box>
      <Menu
        anchorEl={actionsMenu}
        open={actionsMenu !== null}
        onClose={() => setActionsMenu(null)}
        slotProps={{ paper: { sx: { minWidth: 260 } } }}
      >
        <MenuItem onClick={() => { openUploadDialog(); setActionsMenu(null); }}>
          <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Upload plików…" secondary="Wybierz / przeciągnij, przejrzyj, wgraj" />
        </MenuItem>
        <MenuItem onClick={() => { setNewFolderDialog(true); setActionsMenu(null); }}>
          <ListItemIcon><CreateNewFolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Nowy katalog" />
        </MenuItem>
        <MenuItem onClick={() => { setNewFileDialog({ name: 'untitled.md' }); setActionsMenu(null); }}>
          <ListItemIcon><NoteAddIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Nowy pusty plik" secondary="Z rozszerzeniem (np. .md, .json)" />
        </MenuItem>
        <MenuItem onClick={() => { void openCreateFromClipboard(); setActionsMenu(null); }}>
          <ListItemIcon><ContentPasteGoIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Utwórz ze schowka" secondary="Tekst lub obraz z systemowego schowka" />
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={!clipboard}
          onClick={() => { void paste(); setActionsMenu(null); }}
        >
          <ListItemIcon><ContentPasteIcon fontSize="small" color={clipboard ? 'primary' : 'inherit'} /></ListItemIcon>
          <ListItemText
            primary={clipboard ? `Wklej "${clipboard.entry.name}"` : 'Wklej'}
            secondary={clipboard
              ? `${clipboard.mode === 'cut' ? 'przenieś' : 'duplikat'} · ⌘V`
              : 'Schowek pusty — skorzystaj z "Kopiuj" / "Wytnij" w menu pliku'}
          />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          const url = `/workspace/md?path=${encodeURIComponent(`/home/drive${cwd ? '/' + cwd : ''}`)}`;
          window.open(url, '_blank');
          setActionsMenu(null);
        }}>
          <ListItemIcon><LaunchIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Otwórz w workspace"
            secondary="Monaco editor — kod, JSON, terminal, agent"
          />
        </MenuItem>
        <MenuItem onClick={() => { void refresh(); setActionsMenu(null); }}>
          <ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Odśwież" />
        </MenuItem>
      </Menu>

      {/* Breadcrumbs */}
      <Paper sx={{ p: 1, mb: 1 }}>
        <Breadcrumbs>
          <Link component="button" underline="hover" onClick={() => setCwd('')}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <HomeIcon fontSize="small" /> drive
          </Link>
          {segments.map((seg, i) => (
            i === segments.length - 1 ? (
              <Typography key={i} color="text.primary">{seg}</Typography>
            ) : (
              <Link key={i} component="button" underline="hover"
                onClick={() => setCwd(segments.slice(0, i + 1).join('/'))}>
                {seg}
              </Link>
            )
          ))}
          {isPublic(cwd) && (
            <Chip size="small" icon={<PublicIcon />} label="public" color="success" />
          )}
        </Breadcrumbs>
      </Paper>

      {/* Upload progress dialog — full overview while files are being shipped:
          per-file progress bar + name + overall position. Stops disabling
          the inline area of the file list and is impossible to miss on
          mobile, where the previous tiny LinearProgress was easy to scroll
          past. */}
      {uploading && (
        <Dialog open hideBackdrop={false} maxWidth="xs" fullWidth disableEscapeKeyDown
          slotProps={{ paper: { sx: { p: 0 } } }}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
            <CloudUploadIcon />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>Wgrywanie plików</Typography>
              <Typography variant="caption" color="text.secondary">
                {uploading.done} z {uploading.total} ukończonych
                {uploading.failed > 0 && ` · ${uploading.failed} błąd`}
              </Typography>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 0 }}>
            {/* Overall — counts a fully-finished file as 100%, in-flight file as its byte %. */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Łączny postęp</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(((uploading.done + (uploading.currentName ? uploading.currentPct / 100 : 0)) / uploading.total) * 100)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={((uploading.done + (uploading.currentName ? uploading.currentPct / 100 : 0)) / uploading.total) * 100}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            {/* Current file — name + per-file progress. Hidden between files. */}
            {uploading.currentName && (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <InsertDriveFileIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={uploading.currentName}>
                    {uploading.currentName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {uploading.currentPct}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={uploading.currentPct}
                  sx={{ height: 6, borderRadius: 0.5 }}
                  // While the file-reader is encoding to base64 the XHR hasn't
                  // started yet, so we get a long 0% phase. An indeterminate
                  // bar reads as "still working" instead of "stuck".
                  {...(uploading.currentPct === 0 && { variant: 'indeterminate' as const })}
                />
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                  {uploading.currentPct === 0
                    ? 'Przygotowywanie pliku…'
                    : uploading.currentPct < 100
                      ? 'Wysyłanie do serwera…'
                      : 'Zapisywanie…'}
                </Typography>
              </Box>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* File list with drag-and-drop overlay */}
      <Paper
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        sx={{
          flex: 1, overflow: 'auto', position: 'relative',
          border: dragOver ? '2px dashed' : '2px dashed transparent',
          borderColor: dragOver ? 'primary.main' : 'transparent',
          transition: 'border-color 0.15s',
        }}
      >
        {dragOver && (
          <Box sx={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.05)', zIndex: 10, pointerEvents: 'none',
          }}>
            <Typography variant="h6" color="primary">Upuść pliki tutaj</Typography>
          </Box>
        )}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
        ) : entries.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1">Pusty katalog</Typography>
            <Typography variant="caption">Przeciągnij pliki tutaj lub użyj <strong>Upload</strong> / <strong>New folder</strong></Typography>
          </Box>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Nazwa</TableCell>
                <TableCell sx={{ width: 100, display: { xs: 'none', md: 'table-cell' } }}>Rozmiar</TableCell>
                <TableCell sx={{ width: 200, display: { xs: 'none', md: 'table-cell' } }}>Modyfikowane</TableCell>
                <TableCell sx={{ width: 50 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => {
                const rel = cwd ? `${cwd}/${e.name}` : e.name;
                const pub = isPublic(rel);
                return (
                  <TableRow
                    key={e.name}
                    hover
                    onDoubleClick={() => onOpen(e)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ width: 40 }}>
                      {e.type === DIR_TYPE
                        ? <FolderIcon sx={{ color: pub ? 'success.main' : 'primary.main' }} />
                        : <InsertDriveFileIcon sx={{ color: pub ? 'success.main' : 'text.secondary' }} />}
                    </TableCell>
                    <TableCell onClick={() => e.type === DIR_TYPE && onOpen(e)}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <span>{e.name}</span>
                        {pub && <Tooltip title="Publiczny — dostępny przez HTTP bez logowania"><PublicIcon fontSize="small" color="success" /></Tooltip>}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {e.type === DIR_TYPE ? '—' : formatBytes(e.size)}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      <Typography variant="caption">{formatDate(e.mtime)}</Typography>
                    </TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); setMenuFor({ anchor: ev.currentTarget, entry: e }); }}>
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Tip for public folder usage */}
      {!currentIsPublic && entries.some((e) => e.type === FILE_TYPE) && (
        <Alert severity="info" icon={<PublicIcon />} sx={{ mt: 1 }}>
          Aby udostępnić plik publicznie (link bez logowania) — w menu kontekstowym wybierz <strong>"Make public"</strong>.
        </Alert>
      )}

      {/* Filesystem location hint */}
      <Alert severity="info" sx={{ mt: 1 }}>
        Te same pliki widoczne pod <code>/home/drive/{cwd}</code> w workspace editorach
        (MdEditor, Monaco). Drive UI i workspace VFS czytają/piszą do tego samego katalogu na dysku
        (<code>data/Minis/Users/{userName}/drive/</code>) — bez synchronizacji, bez duplikatów.
      </Alert>
      </Box>
      )}
      {showRightPanel && (
        <Box sx={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minWidth: 0, bgcolor: 'background.default',
        }}>
          {/* Panel toolbar */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
            borderBottom: '1px solid', borderColor: 'divider',
            bgcolor: 'background.paper',
          }}>
            {viewing && (
              <>
                <Tooltip title={hasPrev ? 'Poprzedni plik (←)' : 'To jest pierwszy plik'}>
                  <span>
                    <IconButton size="small" disabled={!hasPrev} onClick={() => void navigatePreview(-1)}>
                      <NavigateBeforeIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Typography variant="caption" sx={{
                  minWidth: 48, textAlign: 'center', userSelect: 'none',
                  color: 'text.secondary', fontVariantNumeric: 'tabular-nums',
                }}>
                  {currentPreviewIdx >= 0 ? `${currentPreviewIdx + 1} / ${fileEntries.length}` : '—'}
                </Typography>
                <Tooltip title={hasNext ? 'Następny plik (→)' : 'To jest ostatni plik'}>
                  <span>
                    <IconButton size="small" disabled={!hasNext} onClick={() => void navigatePreview(1)}>
                      <NavigateNextIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              </>
            )}
            {viewing ? <VisibilityIcon fontSize="small" /> : <EditNoteIcon fontSize="small" />}
            <Typography variant="subtitle1" sx={{
              flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {viewing?.entry.name ?? mdEditing?.entry.name}
            </Typography>
            {viewing && !isCompact && (
              <Chip size="small" variant="outlined" label={viewing.mime} />
            )}
            {viewing && !isCompact && viewing.textContent !== undefined && (
              <Tooltip title="Kopiuj cały tekst do systemowego schowka">
                <IconButton size="small" onClick={copyViewTextToSystem}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {viewing && !isCompact && isMdEditable(viewing.entry.name) && (
              <Tooltip title="Edytuj w MdEditor">
                <IconButton size="small" onClick={() => void openInMdEditor(viewing.entry)}>
                  <EditNoteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {viewing && !isCompact && (
              <Tooltip title="Pobierz">
                <IconButton size="small" onClick={() => void onDownload(viewing.entry)}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {viewing && isCompact && (
              <Tooltip title="Akcje pliku">
                <IconButton size="small" onClick={(ev) => setViewActionsMenu(ev.currentTarget)}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {mdEditing && (
              <Chip size="small" variant="outlined"
                color={mdEditing.saving ? 'warning' : 'success'}
                label={mdEditing.saving ? 'Zapisywanie…' : 'Auto-save'}
              />
            )}
            <Tooltip title={panelFullscreen ? 'Pokaż listę plików' : 'Ukryj listę plików (panel na cały ekran)'}>
              <IconButton size="small" onClick={() => setPanelFullscreen((f) => !f)}>
                {panelFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Zamknij panel">
              <IconButton size="small" onClick={closeRightPanel}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          {/* Panel content */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {viewing && viewerBody}
            {mdEditing && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <MdEditor
                  key={mdEditing.rel}              /* remount on different file */
                  initialContent={mdEditing.initialContent}
                  onSave={saveMdContent}
                  autoSaveDelay={2000}              /* faster than the default 30s */
                />
              </Box>
            )}
          </Box>
        </Box>
      )}
      </Box>

      {/* Per-entry menu */}
      <Menu anchorEl={menuFor?.anchor} open={menuFor !== null} onClose={() => setMenuFor(null)}>
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem onClick={() => { void viewFile(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Podgląd</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && isMdEditable(menuFor.entry.name) && (
          <MenuItem onClick={() => { openInMdEditor(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><EditNoteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Otwórz w MdEditor</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem onClick={() => { void onDownload(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Pobierz</ListItemText>
          </MenuItem>
        )}
        {menuFor && !isPublic(cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && (
          <MenuItem onClick={() => { void moveToPublic(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Make public (przenieś do public/)</ListItemText>
          </MenuItem>
        )}
        {menuFor && isPublic(cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && menuFor.entry.type === FILE_TYPE && (
          <MenuItem onClick={() => { void copyPublicUrl(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Kopiuj link publiczny</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { copyToClipboard(menuFor!.entry, 'copy'); setMenuFor(null); }}>
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Kopiuj</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { copyToClipboard(menuFor!.entry, 'cut'); setMenuFor(null); }}>
          <ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Wytnij</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setRenameDialog({ entry: menuFor!.entry, value: menuFor!.entry.name }); setMenuFor(null); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Zmień nazwę</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { void onDelete(menuFor!.entry); setMenuFor(null); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Usuń</ListItemText>
        </MenuItem>
      </Menu>

      {/* New folder dialog */}
      <Dialog open={newFolderDialog} onClose={() => setNewFolderDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nowy katalog</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nazwa" value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doMkdir(); }}
            margin="normal" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderDialog(false)}>Anuluj</Button>
          <Button variant="contained" disabled={!newFolderName.trim()} onClick={doMkdir}>Utwórz</Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      {renameDialog && (
        <Dialog open onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Zmień nazwę</DialogTitle>
          <DialogContent>
            <TextField autoFocus fullWidth label="Nowa nazwa" value={renameDialog.value}
              onChange={(e) => setRenameDialog({ ...renameDialog, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void doRename(); }}
              margin="normal" />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!renameDialog.value.trim() || renameDialog.value === renameDialog.entry.name} onClick={doRename}>
              Zmień
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Preview actions menu — shared between mobile Dialog and the compact
          panel toolbar (tablet portrait). Mirrors what desktop shows inline. */}
      {viewing && (
        <Menu
          anchorEl={viewActionsMenu}
          open={viewActionsMenu !== null}
          onClose={() => setViewActionsMenu(null)}
          slotProps={{ paper: { sx: { minWidth: 240 } } }}
        >
          <MenuItem disabled sx={{ opacity: '1 !important' }}>
            <ListItemText
              primary={viewing.entry.name}
              secondary={viewing.mime}
              primaryTypographyProps={{ noWrap: true, fontWeight: 500 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
          <Divider />
          {viewing.textContent !== undefined && (
            <MenuItem onClick={() => { void copyViewTextToSystem(); setViewActionsMenu(null); }}>
              <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Kopiuj cały tekst" secondary="Do systemowego schowka" />
            </MenuItem>
          )}
          {isMdEditable(viewing.entry.name) && (
            <MenuItem onClick={() => {
              void openInMdEditor(viewing.entry);
              if (!isWide) setViewing(null);   // mobile Dialog: close on hand-off to new tab
              setViewActionsMenu(null);
            }}>
              <ListItemIcon><EditNoteIcon fontSize="small" /></ListItemIcon>
              <ListItemText
                primary="Edytuj w MdEditor"
                secondary={isWide ? 'Inline w prawym panelu' : 'W nowej karcie'}
              />
            </MenuItem>
          )}
          <MenuItem onClick={() => { void onDownload(viewing.entry); setViewActionsMenu(null); }}>
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Pobierz" />
          </MenuItem>
        </Menu>
      )}

      {/* View dialog — mobile fallback (desktop uses inline right panel) */}
      {viewing && !isWide && (
        <Dialog open onClose={() => setViewing(null)} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pr: 6, flexWrap: 'wrap' }}>
            <Tooltip title={hasPrev ? 'Poprzedni' : 'Pierwszy plik'}>
              <span>
                <IconButton size="small" disabled={!hasPrev} onClick={() => void navigatePreview(-1)}>
                  <NavigateBeforeIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {currentPreviewIdx >= 0 ? `${currentPreviewIdx + 1} / ${fileEntries.length}` : '—'}
            </Typography>
            <Tooltip title={hasNext ? 'Następny' : 'Ostatni plik'}>
              <span>
                <IconButton size="small" disabled={!hasNext} onClick={() => void navigatePreview(1)}>
                  <NavigateNextIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <VisibilityIcon /> {viewing.entry.name}
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Akcje pliku">
              <IconButton size="small" onClick={(ev) => setViewActionsMenu(ev.currentTarget)}>
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
          </DialogTitle>
          <DialogContent dividers sx={{ minHeight: 400 }}>
            {viewing.textContent !== undefined ? (
              // Selectable <pre> — browser's native selection lets the user
              // mark a block and ⌘C / Ctrl+C copies it to system clipboard.
              <Box component="pre" sx={{
                m: 0, p: 1.5, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                fontSize: 13, lineHeight: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                userSelect: 'text', cursor: 'text',
                maxHeight: '70vh', overflow: 'auto',
                bgcolor: 'action.hover', borderRadius: 1,
              }}>
                {viewing.textContent}
              </Box>
            ) : isImageMime(viewing.mime) ? (
              <Box sx={{ textAlign: 'center' }}>
                <img
                  src={`data:${viewing.mime};base64,${viewing.dataB64}`}
                  alt={viewing.entry.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh' }}
                />
              </Box>
            ) : isPdfMime(viewing.mime) ? (
              <Box component="iframe"
                src={`data:application/pdf;base64,${viewing.dataB64}`}
                sx={{ width: '100%', height: '70vh', border: 0 }}
              />
            ) : isAudioMime(viewing.mime) ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Box component="audio" controls
                  src={`data:${viewing.mime};base64,${viewing.dataB64}`}
                  sx={{ width: '100%', maxWidth: 500 }}
                />
              </Box>
            ) : isVideoMime(viewing.mime) ? (
              <Box component="video" controls
                src={`data:${viewing.mime};base64,${viewing.dataB64}`}
                sx={{ width: '100%', maxHeight: '70vh' }}
              />
            ) : (
              <Alert severity="info">
                Plik binarny <code>{viewing.mime}</code> (~{formatBytes(Math.floor(viewing.dataB64.length * 3 / 4))}) —
                podgląd niedostępny w przeglądarce. Pobierz, aby otworzyć w odpowiedniej aplikacji.
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button startIcon={<DownloadIcon />} onClick={() => void onDownload(viewing.entry)}>Pobierz</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={() => setViewing(null)}>Zamknij</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* New empty file dialog */}
      {newFileDialog && (
        <Dialog open onClose={() => setNewFileDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Nowy pusty plik</DialogTitle>
          <DialogContent>
            <TextField autoFocus fullWidth label="Nazwa pliku" value={newFileDialog.name}
              onChange={(e) => setNewFileDialog({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void doCreateEmpty(); }}
              margin="normal"
              helperText="Z rozszerzeniem, np. notes.md, todo.txt, data.json"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewFileDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!newFileDialog.name.trim()} onClick={doCreateEmpty}>Utwórz</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Create-from-clipboard dialog */}
      {clipboardCreateDialog && (
        <Dialog open onClose={() => setClipboardCreateDialog(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ContentPasteGoIcon /> Utwórz ze schowka
            <Chip size="small" label={clipboardCreateDialog.kind === 'image' ? 'obraz' : 'tekst'}
              color={clipboardCreateDialog.kind === 'image' ? 'primary' : 'default'}
              sx={{ ml: 1 }}
            />
          </DialogTitle>
          <DialogContent>
            <TextField fullWidth label="Nazwa pliku" value={clipboardCreateDialog.name}
              onChange={(e) => setClipboardCreateDialog({ ...clipboardCreateDialog, name: e.target.value })}
              margin="normal"
              helperText="Jeśli plik o takiej nazwie istnieje, dostanie sufix (copy)"
            />
            {clipboardCreateDialog.kind === 'image' ? (
              <Box sx={{ textAlign: 'center', mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <img
                  src={`data:${clipboardCreateDialog.imageMime};base64,${clipboardCreateDialog.imageB64}`}
                  alt="podgląd"
                  style={{ maxWidth: '100%', maxHeight: '50vh' }}
                />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  {clipboardCreateDialog.imageMime} • ~{formatBytes(Math.floor(clipboardCreateDialog.imageB64.length * 3 / 4))}
                </Typography>
              </Box>
            ) : (
              <>
                {!clipboardCreateDialog.textContent && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Twoja przeglądarka nie pozwala odczytać systemowego schowka automatycznie
                    (typowo: telefon, tablet, lub strona pod HTTP).
                    <br />
                    <strong>Wklej zawartość ręcznie w polu poniżej</strong> —
                    użyj <code>⌘V</code>/<code>Ctrl+V</code> na desktopie,
                    lub przytrzymaj pole i wybierz <strong>Wklej</strong> na mobile.
                  </Alert>
                )}
                <TextField fullWidth multiline rows={12} label="Treść (wklej lub edytuj)"
                  autoFocus={!clipboardCreateDialog.textContent}
                  value={clipboardCreateDialog.textContent}
                  onChange={(e) => {
                    const newText = e.target.value;
                    setClipboardCreateDialog((prev) => {
                      if (!prev) return null;
                      // Re-detect filename only if it's still the default and we're
                      // transitioning from empty → content (right after manual paste).
                      // This catches the mobile fallback flow without surprising the
                      // user who already renamed the file.
                      const wasEmpty = !prev.textContent && newText;
                      const stillDefault = prev.name === 'clipboard.txt';
                      const nextName = (wasEmpty && stillDefault) ? suggestNameForText(newText) : prev.name;
                      return { ...prev, textContent: newText, name: nextName };
                    });
                  }}
                  margin="normal"
                  slotProps={{ htmlInput: { style: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 13 } } }}
                  helperText={`${clipboardCreateDialog.textContent.length} znaków`}
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClipboardCreateDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!clipboardCreateDialog.name.trim()} onClick={doCreateFromClipboard}>
              Zapisz
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Upload staging dialog — pick / drop multiple files, review, commit. */}
      {uploadDialog && (() => {
        const UPLOAD_LIMIT = 140 * 1024 * 1024;   // pre-flight limit aligned with upload()
        const totalBytes = uploadDialog.files.reduce((sum, f) => sum + f.size, 0);
        const oversized = uploadDialog.files.filter(f => f.size > UPLOAD_LIMIT).length;
        return (
          <Dialog open onClose={() => setUploadDialog(null)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CloudUploadIcon /> Upload plików do <code>/{cwd || ''}</code>
            </DialogTitle>
            <DialogContent>
              <input
                ref={dialogFileInputRef} type="file" multiple
                style={{ display: 'none' }} onChange={onDialogFileInputChange}
              />

              {/* Drop zone + pick button */}
              <Box
                onClick={() => dialogFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    addFilesToUploadDialog(e.dataTransfer.files);
                  }
                }}
                sx={{
                  border: '2px dashed', borderColor: 'divider',
                  borderRadius: 1, p: 3, mt: 1, textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: 'action.hover',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.selected' },
                }}
              >
                <DriveFolderUploadIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 0.5 }} />
                <Typography variant="body2"><strong>Kliknij</strong>, aby wybrać pliki — lub przeciągnij tu z systemu</Typography>
                <Typography variant="caption" color="text.secondary">
                  Możesz dodawać kolejne — pliki nie znikają po kolejnym kliknięciu
                </Typography>
              </Box>

              {/* Staged file list */}
              {uploadDialog.files.length > 0 && (
                <Box sx={{ mt: 2, maxHeight: 320, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {uploadDialog.files.map((f, i) => {
                    const tooBig = f.size > UPLOAD_LIMIT;
                    return (
                      <Box key={`${f.name}-${i}`} sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75,
                        borderBottom: i < uploadDialog.files.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                      }}>
                        <InsertDriveFileIcon fontSize="small" sx={{ color: tooBig ? 'error.main' : 'text.secondary' }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap title={f.name}>{f.name}</Typography>
                          <Typography variant="caption" color={tooBig ? 'error.main' : 'text.secondary'}>
                            {formatBytes(f.size)}{tooBig && ` — za duży (max ${formatBytes(UPLOAD_LIMIT)})`}
                          </Typography>
                        </Box>
                        <IconButton size="small" onClick={() => removeFileFromUploadDialog(i)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {/* Summary */}
              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  size="small" variant="outlined"
                  label={`${uploadDialog.files.length} plik${uploadDialog.files.length === 1 ? '' : 'ów'}`}
                />
                <Chip
                  size="small" variant="outlined"
                  label={`Razem ${formatBytes(totalBytes)}`}
                />
                {oversized > 0 && (
                  <Chip size="small" color="error" variant="outlined"
                    label={`${oversized} za duży — usuń przed uploadem`} />
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setUploadDialog(null)}>Anuluj</Button>
              <Button
                variant="contained"
                startIcon={<CloudUploadIcon />}
                disabled={uploadDialog.files.length === 0 || oversized > 0}
                onClick={commitUploadDialog}
              >
                Wgraj {uploadDialog.files.length > 0 ? `(${uploadDialog.files.length})` : ''}
              </Button>
            </DialogActions>
          </Dialog>
        );
      })()}

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
