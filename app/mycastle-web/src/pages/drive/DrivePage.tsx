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

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../modules/auth';
import { readUserJson, writeUserJson } from '../../services/userJson';
import {
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel, LinearProgress,
  Link, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Select, Snackbar, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { MdEditor } from '@/components/mdeditor';
import Editor from '@monaco-editor/react';
import type { editor as MonacoEditorTypes } from 'monaco-editor';
// Side-effect: ensures Monaco workers + compiler options + completionItems
// configuration is in place BEFORE any <Editor> in this page mounts.
// MdEditor pulls it in transitively too, but the in-page text editor is
// reachable on Drive even without MdEditor on screen (preview a .json file),
// so we make the dependency explicit here.
import '../../modules/editor/monacoWorkers';
import { setupDriveEditorMonaco } from './driveMonacoSetup';
import { MonacoSelectionHandles } from './MonacoSelectionHandles';

// Lazy: the include-file picker is borrowed wholesale from the Automate
// Script editor — same `drive/mdscript` + `drive/treejs` roots, same tree
// UI, same content-into-cursor flow. We only fetch its chunk when the user
// actually clicks the attach icon.
const AutomateIncludeFileDialog = React.lazy(() => import('../../components/mdeditor/extensions/AutomateIncludeFileDialog'));
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import LabelIcon from '@mui/icons-material/Label';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import LaunchIcon from '@mui/icons-material/Launch';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PublicIcon from '@mui/icons-material/Public';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CodeIcon from '@mui/icons-material/Code';
import TodayIcon from '@mui/icons-material/Today';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DescriptionIcon from '@mui/icons-material/Description';

import DriveSearchDialog from './DriveSearchDialog';
import type { SearchMatch, SearchFileResult, SearchProgress } from './driveSearchTypes';

// MJD editor — lazy-loaded so the (sizeable) editor bundle isn't pulled in
// until the user actually opens a .mjd / .data.json file. RemoteFS is the
// VFS adapter MjdVfsLoader expects.
import { MjdVfsLoader, AgentPanel, SubpathFS, DEFAULT_AGENT_CONFIG } from '@mhersztowski/texteditor';
import type { AgentConfig, AgentPanelHandle } from '@mhersztowski/texteditor';
import { RemoteFS, CompositeFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { minisApi } from '../../services/MinisApiService';

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

// ─── File properties (sidecar JSON in drive root) ───────────────────────────
// All per-file metadata that isn't part of the file body itself lives in a
// single sidecar JSON at `drive/.fileproperties.json` — keeps the directory
// clean (no `.tags` siblings everywhere) and lets us cache the whole index
// once on mount instead of doing N reads per listing render.
//
// Keyed by relPath (same `cwd/name` convention used elsewhere in this file)
// so a rename or move would orphan a tag entry — acceptable cost for the
// simplicity. Future revision can migrate to a content-hash key.

const FILE_PROPS_PATH = '.fileproperties.json';

interface FileProperties {
  /** relPath → list of tags. Missing key === no tags. */
  tags: Record<string, string[]>;
}

const EMPTY_FILE_PROPS: FileProperties = { tags: {} };

async function loadFileProperties(userName: string): Promise<FileProperties> {
  try {
    const r = await fetch(apiUrl(userName, 'readFile', FILE_PROPS_PATH), { headers: authHeaders() });
    if (!r.ok) return EMPTY_FILE_PROPS;
    const j: { data?: string } = await r.json();
    if (!j.data) return EMPTY_FILE_PROPS;
    const text = atob(j.data);
    const parsed = JSON.parse(text) as Partial<FileProperties>;
    return {
      tags: (parsed.tags && typeof parsed.tags === 'object') ? parsed.tags : {},
    };
  } catch { return EMPTY_FILE_PROPS; }
}

async function saveFileProperties(userName: string, props: FileProperties): Promise<void> {
  const text = JSON.stringify(props, null, 2);
  // UTF-8-safe base64: encodeURIComponent + escape handles non-ASCII (Polish
  // accents in tag names, file paths).
  const b64 = btoa(unescape(encodeURIComponent(text)));
  await vfsWriteFile(userName, FILE_PROPS_PATH, b64);
}

// ─── Full-text search (drive scan) ──────────────────────────────────────────
//
// Whitelist of file extensions we will read + grep. Anything not in this set
// is skipped silently. Better-safe-than-sorry: better miss a match in a
// non-listed extension than try to grep a 10MB binary and run the browser
// out of memory.
const TEXT_FILE_EXTS = new Set([
  // docs / config / data
  'md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'conf', 'cfg',
  'properties', 'env', 'log', 'csv', 'tsv',
  // web / scripts
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'css', 'scss', 'sass', 'less',
  'html', 'htm', 'svg', 'vue', 'svelte',
  // backend / system
  'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'scala', 'swift', 'dart',
  'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'sh', 'bash', 'zsh', 'fish',
  'sql', 'lua', 'r', 'pl',
]);

/** Files with no extension that are conventionally text. Compared
 *  case-insensitive against the basename. */
const TEXT_FILE_NAMES_NO_EXT = new Set([
  'dockerfile', 'makefile', 'readme', 'license', 'changelog',
  'authors', 'contributors', 'notice',
]);

function isTextFile(name: string): boolean {
  if (name.startsWith('.')) return false;   // skip hidden / sidecar files
  const i = name.lastIndexOf('.');
  if (i < 0) return TEXT_FILE_NAMES_NO_EXT.has(name.toLowerCase());
  const ext = name.slice(i + 1).toLowerCase();
  return TEXT_FILE_EXTS.has(ext);
}


/** Walk a directory tree (DFS) collecting text-file paths. Skips hidden
 *  files / dirs. Bounded by `maxFiles` so a runaway recursion can't melt
 *  the browser. */
async function collectTextFiles(
  userName: string,
  baseRel: string,
  signal: AbortSignal | undefined,
  maxFiles: number,
): Promise<string[]> {
  const results: string[] = [];
  // BFS — shorter queue than DFS for wide trees + we get partial results
  // sooner if we ever want to surface them mid-walk.
  const queue: string[] = [baseRel];
  while (queue.length > 0 && results.length < maxFiles) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const dir = queue.shift()!;
    let entries: VfsEntry[] = [];
    try { entries = await vfsListDir(userName, dir); }
    catch { continue; } // unreadable dir — skip silently
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === DIR_TYPE) {
        queue.push(rel);
      } else if (isTextFile(e.name)) {
        results.push(rel);
        if (results.length >= maxFiles) break;
      }
    }
  }
  return results;
}

/** Build a per-line matcher from the user query. Returns null if the
 *  regex source is invalid (caller surfaces the error in UI). */
function buildSearchRegex(
  query: string,
  caseSensitive: boolean,
  isRegex: boolean,
): RegExp | null {
  try {
    const source = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(source, caseSensitive ? 'g' : 'gi');
  } catch { return null; }
}

/** Fetch a file's content as UTF-8 text via the REST VFS API. */
async function readFileAsText(userName: string, rel: string): Promise<string> {
  const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
  if (!r.ok) throw new Error(`readFile ${rel}: ${r.status}`);
  const j: { data?: string } = await r.json();
  if (!j.data) return '';
  try { return decodeURIComponent(escape(atob(j.data))); }
  catch { return atob(j.data); } // fallback when input wasn't UTF-8
}

const SEARCH_MAX_FILES = 5000;          // hard cap on scan size
const SEARCH_MAX_MATCHES_PER_FILE = 50; // stop collecting after this many
const SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — skip larger files

/** Drive-wide text search. Resolves with per-file results. Throws on
 *  abort (DOMException 'AbortError'); other per-file errors are swallowed
 *  so one unreadable file doesn't sink the whole search. */
async function searchInFiles(
  userName: string,
  baseRel: string,
  query: string,
  options: { caseSensitive: boolean; isRegex: boolean },
  signal: AbortSignal | undefined,
  onProgress: (p: SearchProgress) => void,
): Promise<SearchFileResult[]> {
  if (!query) return [];
  const re = buildSearchRegex(query, options.caseSensitive, options.isRegex);
  if (!re) throw new Error('Niepoprawne wyrażenie regularne');

  onProgress({ scanned: 0, total: 0 });
  const files = await collectTextFiles(userName, baseRel, signal, SEARCH_MAX_FILES);
  onProgress({ scanned: 0, total: files.length });

  const results: SearchFileResult[] = [];
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const path = files[i];
    onProgress({ scanned: i, total: files.length, current: path });

    let text: string;
    try { text = await readFileAsText(userName, path); }
    catch { continue; }
    if (text.length > SEARCH_MAX_FILE_BYTES) continue;

    // Line-by-line scan — the regex is global, so `exec`-loop on each line
    // gives us all per-line occurrences with byte offsets we can show in UI.
    const lines = text.split('\n');
    const matches: SearchMatch[] = [];
    let truncated = false;
    outer: for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineText = lines[lineIdx];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lineText)) !== null) {
        matches.push({
          lineNumber: lineIdx + 1,
          lineText,
          matchStart: m.index,
          matchEnd: m.index + m[0].length,
        });
        // Zero-width match guard — without this `re.lastIndex` doesn't
        // advance and we'd loop forever on patterns like `(?=)`.
        if (m.index === re.lastIndex) re.lastIndex++;
        if (matches.length >= SEARCH_MAX_MATCHES_PER_FILE) {
          truncated = true;
          break outer;
        }
      }
    }
    if (matches.length > 0) results.push({ path, matches, truncated });
  }
  onProgress({ scanned: files.length, total: files.length });
  return results;
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

// ── MJD editor association ──────────────────────────────────────────────────
// `.mjd`           → opens MjdDefEditor (schema editor)
// `.data.json`     → opens MjdDataEditor (form for the sibling .mjd)
// Both render in the right-side preview panel via MjdVfsLoader, same UX as
// Markdown editing.
type MjdMode = 'def' | 'data';

const getMjdMode = (name: string): MjdMode | null => {
  const n = name.toLowerCase();
  if (n.endsWith('.mjd')) return 'def';
  if (n.endsWith('.data.json')) return 'data';
  return null;
};
const isMjdEditable = (name: string) => getMjdMode(name) !== null;

// ── New-file dialog presets ─────────────────────────────────────────────────
// Each preset advertises a default filename + an extension. When the user
// switches preset in the dialog, the name auto-suggests the preset default
// (only when the user hasn't typed something custom yet). At create-time
// `applyExtension` ensures the saved name actually ends with the preset's
// extension — typing "config" with the YAML preset selected becomes
// "config.yaml".
interface FilePreset {
  key: string;
  label: string;
  defaultName: string;
  extension: string;
}

const FILE_PRESETS: FilePreset[] = [
  { key: 'md',        label: 'Markdown (.md)',                  defaultName: 'notatka.md',         extension: '.md' },
  { key: 'json',      label: 'JSON (.json)',                    defaultName: 'data.json',          extension: '.json' },
  { key: 'mjd-def',   label: 'MJD definition (.mjd)',           defaultName: 'schema.mjd',         extension: '.mjd' },
  { key: 'mjd-data',  label: 'MJD data (.data.json)',           defaultName: 'dane.data.json',     extension: '.data.json' },
  { key: 'yaml',      label: 'YAML — konfiguracja (.yaml)',     defaultName: 'config.yaml',        extension: '.yaml' },
  { key: 'toml',      label: 'TOML — konfiguracja (.toml)',     defaultName: 'config.toml',        extension: '.toml' },
  { key: 'ini',       label: 'INI — konfiguracja (.ini)',       defaultName: 'config.ini',         extension: '.ini' },
  { key: 'env',       label: '.env — zmienne środowiskowe',     defaultName: '.env',               extension: '.env' },
  { key: 'ts',        label: 'TypeScript (.ts)',                defaultName: 'index.ts',           extension: '.ts' },
  { key: 'tsx',       label: 'TypeScript React (.tsx)',         defaultName: 'Component.tsx',      extension: '.tsx' },
  { key: 'js',        label: 'JavaScript (.js)',                defaultName: 'index.js',           extension: '.js' },
  { key: 'py',        label: 'Python (.py)',                    defaultName: 'main.py',            extension: '.py' },
  { key: 'cpp',       label: 'C++ (.cpp)',                      defaultName: 'main.cpp',           extension: '.cpp' },
  { key: 'css',       label: 'CSS (.css)',                      defaultName: 'styles.css',         extension: '.css' },
  { key: 'html',      label: 'HTML (.html)',                    defaultName: 'index.html',         extension: '.html' },
  { key: 'sh',        label: 'Shell script (.sh)',              defaultName: 'script.sh',          extension: '.sh' },
  { key: 'custom',    label: 'Inny (bez wymuszania rozszerzenia)', defaultName: 'untitled.txt',    extension: '' },
];

/** Append `ext` to `name` if not already present. Special-case the empty
 *  ext (custom preset): leave the name untouched. Case-insensitive check so
 *  "DATA.JSON" with the JSON preset doesn't become "DATA.JSON.json". */
function applyExtension(name: string, ext: string): string {
  if (!ext) return name;
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext;
}
const isImageMime = (m: string) => m.startsWith('image/') && m !== 'image/svg+xml';
const isPdfMime = (m: string) => m === 'application/pdf';
const isAudioMime = (m: string) => m.startsWith('audio/');
const isVideoMime = (m: string) => m.startsWith('video/');

/**
 * Map a filename to a Monaco language id. Covers the common config / source
 * formats we want syntax-highlighted in the right panel; falls back to
 * 'plaintext' for unknown extensions (so the editor still works — just no
 * highlighting). MdEditor handles `.md` so we never route those here.
 */
function fileToMonacoLanguage(name: string): string {
  const ext = (name.toLowerCase().split('.').pop() ?? '');
  const map: Record<string, string> = {
    json: 'json', jsonc: 'json', json5: 'json', map: 'json',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    py: 'python', pyi: 'python',
    md: 'markdown', markdown: 'markdown',
    xml: 'xml', svg: 'xml', xsd: 'xml', xsl: 'xml',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    yaml: 'yaml', yml: 'yaml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
    java: 'java', kt: 'kotlin',
    rs: 'rust', go: 'go', rb: 'ruby', php: 'php',
    cs: 'csharp', fs: 'fsharp',
    swift: 'swift', dart: 'dart',
    lua: 'lua', r: 'r',
    pl: 'perl',
    ini: 'ini', cfg: 'ini', toml: 'ini', env: 'ini', conf: 'ini',
    dockerfile: 'dockerfile',
    gitignore: 'plaintext', gitattributes: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

/**
 * Anything that benefits from a real code editor (syntax highlight, brackets,
 * indent) versus the static `<pre>` viewer. Includes the obvious text/JSON/XML
 * MIME types (so the existing detection still wins) plus a long list of
 * source-code extensions whose MIME the backend often reports as
 * application/octet-stream.
 */
function isEditableTextFile(name: string, mime: string): boolean {
  if (isTextMime(mime)) return true;
  // MdEditor handles markdown — we don't want to route .md to Monaco.
  if (isMdEditable(name)) return false;
  const ext = (name.toLowerCase().split('.').pop() ?? '');
  // Same set of recognised extensions we'd highlight, minus the markdown
  // variants. Kept inline rather than via a Set so the literal stays a
  // single grep target.
  return /^(json|jsonc|json5|map|js|mjs|cjs|jsx|ts|tsx|mts|cts|py|pyi|xml|svg|xsd|xsl|html|htm|css|scss|less|yaml|yml|sh|bash|zsh|sql|c|h|cpp|cc|cxx|hpp|hh|hxx|java|kt|rs|go|rb|php|cs|fs|swift|dart|lua|r|pl|ini|cfg|toml|env|conf|dockerfile|gitignore|gitattributes)$/.test(ext);
}

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
  const { currentUser, token } = useAuth();
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
  // OR the filename matches a recognised code-file extension — the Monaco editor
  // in the right panel uses textContent as its initial value.
  const [viewing, setViewing] = useState<{ entry: VfsEntry; mime: string; dataB64: string; textContent?: string } | null>(null);
  // Monaco-edited text state. Tracks the buffer (so dirty/save logic works
  // without polling the editor), the dirty flag, and the in-flight save.
  const [editedText, setEditedText] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const monacoEditorRef = useRef<MonacoEditorTypes.IStandaloneCodeEditor | null>(null);
  // Separate state so MonacoSelectionHandles re-renders when the editor mounts.
  const [monacoEditorInstance, setMonacoEditorInstance] = useState<MonacoEditorTypes.IStandaloneCodeEditor | null>(null);
  // "Dołącz plik" picker — shared with Automate Script. Multi-root tree over
  // drive/mdscript + drive/treejs; insertion goes through executeEdits so
  // it lands in Monaco's undo stack like a manual type.
  const [includeOpen, setIncludeOpen] = useState(false);
  // "New empty file" dialog. Just a name field — content is empty bytes.
  const [newFileDialog, setNewFileDialog] = useState<{ name: string; presetKey: string } | null>(null);
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
  // MJD editor — opens in the same right-side preview slot as MdEditor.
  //   mode='def'  → MjdVfsLoader edits the .mjd schema (data path omitted)
  //   mode='data' → MjdVfsLoader edits sibling .data.json against the .mjd
  // mjdPath / dataPath are FULL backend paths (`/data/Minis/Users/{u}/drive/...`)
  // — that's what RemoteFS expects. `rel` keeps the drive-relative form for UI.
  const [mjdEditing, setMjdEditing] = useState<{
    entry: VfsEntry; rel: string; mjdPath: string; dataPath?: string; mode: MjdMode;
  } | null>(null);
  // Singleton RemoteFS — MjdVfsLoader expects a FileSystemProvider. Token
  // updates propagate via setToken below so logout/login doesn't strand
  // the editor on a stale credential.
  const mjdFs = useMemo(
    () => new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => { mjdFs.setToken(token ?? undefined); }, [token, mjdFs]);

  // Defined early (before the AI agent / prompt-library blocks reference it).
  const toast = useCallback((msg: string, severity: 'success'|'error'|'info' = 'success') => {
    setSnack({ open: true, msg, severity });
  }, []);

  // ── AI Agent panel ──────────────────────────────────────────────────────
  // Opens on the right with an AgentEngine scoped to the user's Drive. The
  // agent sees the Drive root mounted at `/home/` (same convention as the
  // workspace editor) so its session save (`/home/chats`) and file tools work.
  const [agentOpen, setAgentOpen] = useState(false);
  // Once the agent has been opened, keep the panel MOUNTED (just hidden via CSS
  // when closed) so its conversation, engine and config survive a close/reopen.
  const [agentMounted, setAgentMounted] = useState(false);
  useEffect(() => { if (agentOpen) setAgentMounted(true); }, [agentOpen]);
  const [agentDefaultConfig, setAgentDefaultConfig] = useState<Partial<AgentConfig> | undefined>(undefined);
  // Fetch the server-provisioned Anthropic key once — pre-fills the agent
  // config so the user does not have to paste a key (defaults win over any
  // stale localStorage key, see loadAgentConfig).
  useEffect(() => {
    minisApi.getAnthropicKey().then(apiKey => {
      setAgentDefaultConfig({
        providerType: 'anthropic',
        providers: {
          ...DEFAULT_AGENT_CONFIG.providers,
          anthropic: { ...DEFAULT_AGENT_CONFIG.providers.anthropic, apiKey },
        },
      });
    }).catch(() => {});
  }, []);
  // RemoteFS held in a ref so token refreshes propagate without recreating the
  // provider (which would reset the agent's mounted view).
  const agentRemoteRef = useRef<RemoteFS | null>(null);
  const agentFs = useMemo<FileSystemProvider | null>(() => {
    if (!userName) return null;
    const remote = new RemoteFS({ baseUrl: `/api/users/${encodeURIComponent(userName)}/vfs`, token: token ?? undefined });
    agentRemoteRef.current = remote;
    const cfs = new CompositeFS();
    cfs.mount('/home', new SubpathFS(remote, `/data/Minis/Users/${userName}/drive`));
    return cfs as FileSystemProvider;
    // token intentionally omitted — synced via the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]);
  useEffect(() => { agentRemoteRef.current?.setToken(token ?? undefined); }, [token]);
  // Workspace guide injected into the agent system prompt: explains that
  // `/home/` is the Drive root so the model uses the right absolute paths.
  const agentClaudeMd = useMemo(() => [
    '# Drive AI Agent',
    '',
    `You are an assistant embedded in the **Drive** of user **${userName}**.`,
    '',
    '## File system',
    '- `/home/` is the root of the user\'s Drive directory' +
      ` (\`data/Minis/Users/${userName}/drive/\` on the server).`,
    '- Everything the user sees in the Drive UI lives under `/home/`.',
    '- Files under `/home/public/` are also served publicly over plain HTTP.',
    '',
    '## Rules',
    '- Always use absolute paths starting with `/home/`.',
    '- Never create files outside `/home/`.',
  ].join('\n'), [userName]);

  // ── Prompt library ──────────────────────────────────────────────────────
  // A "Prompts" button in the agent header lists reusable prompt files declared
  // in the index JSON (an array of public URLs). The index AND each prompt file
  // are ALWAYS fetched from the production server — never the local backend —
  // so prompts are shared/centralised regardless of where the app runs.
  // (The public Drive endpoint serves these with permissive CORS.)
  const agentRef = useRef<AgentPanelHandle>(null);
  const [promptsMenu, setPromptsMenu] = useState<HTMLElement | null>(null);
  const [promptItems, setPromptItems] = useState<{ label: string; url: string }[] | null>(null);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const PROMPTS_SERVER = 'https://mycastle.hersztowski.org';
  const promptsIndexUrl = useMemo(
    () => `${PROMPTS_SERVER}/public/drive/users/${encodeURIComponent(userName)}/ai_prompt/ai_prompts.json`,
    [userName],
  );
  const openPromptsMenu = useCallback(async (anchor: HTMLElement) => {
    setPromptsMenu(anchor);
    setPromptsLoading(true);
    try {
      const r = await fetch(promptsIndexUrl, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const parsed = (await r.json()) as unknown;
      const urls = Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        : [];
      const seen = new Set<string>();
      const items = urls
        .map(url => ({ url, label: decodeURIComponent(url.split('/').pop() || url) }))
        .filter(it => { if (seen.has(it.url)) return false; seen.add(it.url); return true; });
      setPromptItems(items);
    } catch {
      setPromptItems([]);
      toast('Nie udało się wczytać listy promptów', 'error');
    }
    setPromptsLoading(false);
  }, [promptsIndexUrl, toast]);
  const loadPrompt = useCallback(async (item: { label: string; url: string }) => {
    setPromptsMenu(null);
    try {
      const r = await fetch(item.url, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const content = await r.text();
      if (!agentOpen) setAgentOpen(true);
      // Wrap the prompt so the agent only INTERNALISES it as context/instructions
      // and does not start writing or saving files just because it was loaded.
      // It should wait for a concrete follow-up request before taking action.
      const wrapped = [
        `The following reusable prompt "${item.label}" has been loaded into your context.`,
        'Read and internalise it as guidance for the rest of this conversation.',
        'Do NOT create, write, edit, or save any files, and do NOT run any tools, just because this prompt was loaded.',
        'Simply acknowledge in one short sentence that you have read it, then wait for my next instruction before doing anything.',
        '',
        '----- PROMPT BEGIN -----',
        content,
        '----- PROMPT END -----',
      ].join('\n');
      agentRef.current?.sendPrompt(wrapped);
    } catch {
      toast(`Nie udało się wczytać promptu: ${item.label}`, 'error');
    }
  }, [agentOpen, toast]);

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

  // Favorites — per-user list of file paths (relative to /drive/). Stored
  // in VFS as `drive/.favorites.json` so it syncs across devices. The
  // collapse state is per-device though, so it lives in localStorage —
  // someone might want favorites hidden on phone but visible on desktop.
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favLoaded, setFavLoaded] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('drive_favs_open') !== '0'; }
    catch { return true; }
  });
  const FAV_PATH = 'drive/.favorites.json';

  // ── File properties (tags + future per-file metadata) ───────────────
  // Single source of truth for the whole drive; persisted as
  // `.fileproperties.json` in drive root. State is the IN-MEMORY mirror —
  // saved on every Properties-dialog "Zapisz".
  const [fileProperties, setFileProperties] = useState<FileProperties>(EMPTY_FILE_PROPS);
  const [fpLoaded, setFpLoaded] = useState(false);
  // Active Properties dialog (null = closed). `rel` is captured at open so a
  // background refresh / cwd change doesn't affect the dialog target.
  // `tags` is the draft list — committed only on Save.
  const [propsDialog, setPropsDialog] = useState<{ entry: VfsEntry; rel: string } | null>(null);
  const [propsDraftTags, setPropsDraftTags] = useState<string[]>([]);
  const [propsDraftTagInput, setPropsDraftTagInput] = useState('');

  // Full-text search dialog — closed by default; opened from the
  // "Search" button in the header. Reset on close happens inside the
  // dialog component itself.
  const [searchOpen, setSearchOpen] = useState(false);

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
  const panelOpen = !!(viewing || mdEditing || mjdEditing);
  const showSidebar = !(isWide && panelFullscreen);
  const showRightPanel = isWide && panelOpen;
  const showAgent = isWide && agentOpen;

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

  // Load favorites on mount — fire-and-forget. 404 just means no favorites
  // yet (fresh user), so we silently fall back to an empty set.
  useEffect(() => {
    if (!userName || favLoaded) return;
    let cancelled = false;
    readUserJson<{ favorites?: string[] }>(userName, FAV_PATH)
      .then((data) => {
        if (cancelled) return;
        if (data?.favorites && Array.isArray(data.favorites)) {
          setFavorites(new Set(data.favorites.filter(p => typeof p === 'string')));
        }
      })
      .catch((err) => console.warn('[Drive] favorites load failed:', err))
      .finally(() => { if (!cancelled) setFavLoaded(true); });
    return () => { cancelled = true; };
  }, [userName, favLoaded]);

  // Persist favorites — debounced 300ms so rapid toggle (e.g. star-spam)
  // doesn't trigger one VFS POST per click. Only runs after initial load
  // (favLoaded) to avoid overwriting on-disk data with empty set on mount.
  useEffect(() => {
    if (!favLoaded || !userName) return;
    const t = setTimeout(() => {
      writeUserJson(userName, FAV_PATH, { favorites: Array.from(favorites).sort() })
        .catch((err) => console.warn('[Drive] favorites save failed:', err));
    }, 300);
    return () => clearTimeout(t);
  }, [favorites, favLoaded, userName]);

  // File properties (tags + future metadata) — same pattern as favorites:
  // load once on mount, then save explicitly in the dialog Save handler.
  // We don't auto-save on every change since editing happens in a modal
  // dialog with explicit Save.
  useEffect(() => {
    if (!userName || fpLoaded) return;
    let cancelled = false;
    loadFileProperties(userName)
      .then((props) => { if (!cancelled) setFileProperties(props); })
      .catch((err) => console.warn('[Drive] fileProperties load failed:', err))
      .finally(() => { if (!cancelled) setFpLoaded(true); });
    return () => { cancelled = true; };
  }, [userName, fpLoaded]);

  // Persist collapsed state per-device.
  useEffect(() => {
    try { localStorage.setItem('drive_favs_open', favoritesOpen ? '1' : '0'); } catch { /* private mode */ }
  }, [favoritesOpen]);

  const isFavorite = useCallback((rel: string) => favorites.has(rel), [favorites]);

  const toggleFavorite = useCallback((entry: VfsEntry) => {
    const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) {
        next.delete(rel);
        toast(`Usunięto z ulubionych: ${entry.name}`, 'info');
      } else {
        next.add(rel);
        toast(`Dodano do ulubionych: ${entry.name}`);
      }
      return next;
    });
  }, [cwd, toast]);

  // ── Properties dialog ────────────────────────────────────────────────
  // Open: snapshot the current tag list for this file into the dialog draft.
  // Tag input is cleared so the user sees a clean field.
  const openPropertiesDialog = useCallback((entry: VfsEntry) => {
    const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
    setPropsDialog({ entry, rel });
    setPropsDraftTags(fileProperties.tags[rel] ?? []);
    setPropsDraftTagInput('');
  }, [cwd, fileProperties.tags]);

  // Add the in-progress text input as a chip (Enter or "+" button). Rejects
  // empties and duplicates silently. Commas would split a tag on the next
  // serialization round-trip, so they're normalised to '-'.
  const commitDraftTag = useCallback(() => {
    const trimmed = propsDraftTagInput.trim();
    if (!trimmed) return;
    const safe = trimmed.replace(/,/g, '-');
    setPropsDraftTags(prev => prev.includes(safe) ? prev : [...prev, safe]);
    setPropsDraftTagInput('');
  }, [propsDraftTagInput]);

  // Save handler — atomic update of the on-disk index. Empty tag list is
  // stored as "key removed" so the JSON stays clean instead of accumulating
  // empty arrays for every file the user ever opened the dialog on.
  const saveProperties = useCallback(async () => {
    if (!propsDialog) return;
    const next: FileProperties = { ...fileProperties, tags: { ...fileProperties.tags } };
    if (propsDraftTags.length === 0) {
      delete next.tags[propsDialog.rel];
    } else {
      next.tags[propsDialog.rel] = [...propsDraftTags];
    }
    setFileProperties(next);
    try {
      await saveFileProperties(userName, next);
      toast(`Zapisano właściwości: ${propsDialog.entry.name}`);
      setPropsDialog(null);
    } catch (err) {
      toast(`Nie udało się zapisać właściwości: ${(err as Error).message}`, 'error');
    }
  }, [propsDialog, propsDraftTags, fileProperties, userName, toast]);

  // Forward-declared ref for opening files in MdEditor — set below once
  // `openInMdEditor` is in scope. Avoids the TDZ cycle that would otherwise
  // happen because `goToFavorite` is wired into render before openInMdEditor
  // is declared.
  const openInMdEditorRef = useRef<(entry: VfsEntry, relOverride?: string) => Promise<void>>(
    async () => {},
  );

  // Navigate to a favorite — splits the saved path into folder + filename,
  // sets cwd to the folder, then opens the file (MdEditor for .md/.txt,
  // preview for everything else). Skips already-deleted favorites with
  // a friendly toast instead of a hard error.
  const goToFavorite = useCallback(async (rel: string) => {
    const lastSlash = rel.lastIndexOf('/');
    const folder = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
    const fileName = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
    const exists = await vfsStat(userName, rel);
    if (!exists) {
      toast(`Ulubiony plik już nie istnieje: ${rel} — usuń z listy`, 'error');
      return;
    }
    setCwd(folder);
    const entry: VfsEntry = { name: fileName, type: FILE_TYPE };
    if (isMjdEditable(fileName)) {
      openInMjdEditor(entry, rel);
    } else if (isMdEditable(fileName)) {
      await openInMdEditorRef.current(entry, rel);
    } else {
      // Inline read → setViewing (same as double-click on a file row).
      try {
        const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
        if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
        const json = await r.json() as { data?: string };
        const mime = guessMime(fileName);
        const data = json.data ?? '';
        // Source code / config files (.json, .ts, .py, …) are routed to the
        // Monaco editor, so we decode them as text too — not just text/* MIMEs.
        const textContent = isEditableTextFile(fileName, mime) ? base64ToText(data) : undefined;
        setViewing({ entry, mime, dataB64: data, textContent });
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    }
  }, [userName, toast]);

  // When the right panel closes (file deselected, MdEditor closed) drop the
  // fullscreen toggle — otherwise next time it opens it stays expanded with
  // no obvious way back without a re-click.
  useEffect(() => { if (!panelOpen) setPanelFullscreen(false); }, [panelOpen]);

  // Whenever the previewed file changes (or the panel closes), reset the
  // Monaco buffer to the freshly-fetched text. Without this the editor would
  // keep showing the previous file's content until it's clicked.
  useEffect(() => {
    setEditedText(viewing?.textContent ?? null);
    setEditorDirty(false);
    setEditorSaving(false);
  }, [viewing?.entry.name, viewing?.textContent]);

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
      return;
    }

    // Markdown files open straight in MdEditor — matches what users want from
    // a "notes & docs" surface. The viewer + Monaco fallback is still reachable
    // from MdEditor's toolbar ("Edytuj kod źródłowy"). `openInMdEditorRef` is
    // populated later in the file; calling through the ref avoids the TDZ
    // cycle that would happen if we tried to depend on `openInMdEditor`
    // directly here.
    if (isMjdEditable(entry.name)) {
      openInMjdEditor(entry);
      return;
    }
    if (isMdEditable(entry.name)) {
      void openInMdEditorRef.current(entry);
      return;
    }

    // Other files → preview / Monaco editor (matches OS file managers more
    // closely than auto-download; user can still hit "Pobierz" from the menu).
    void (async () => {
      try {
        const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
        const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
        if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
        const json = await r.json() as { data?: string };
        const mime = guessMime(entry.name);
        const data = json.data ?? '';
        // See goToFavorite — same routing rule (code-like extensions get
        // decoded so the Monaco editor can highlight them).
        const textContent = isEditableTextFile(entry.name, mime) ? base64ToText(data) : undefined;
        setViewing({ entry, mime, dataB64: data, textContent });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    })();
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
      // Decode UTF-8 for both proper text MIMEs and recognised code-file
      // extensions (Monaco gets to highlight either way). Binary content
      // stays as base64 — we render via data: URLs (img/iframe/audio/video).
      const textContent = isEditableTextFile(entry.name, mime) ? base64ToText(data) : undefined;
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
      setMjdEditing(null);       // mutually exclusive with MJD editor
      setMdEditing({ entry, rel, initialContent: content, saving: false });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, isWide, toast]);

  /** Drive-relative → backend full path (`/data/Minis/Users/{u}/drive/...`).
   *  RemoteFS wants the absolute form; the URL bar shows the relative one. */
  const driveToFullPath = useCallback((rel: string) => {
    const cleaned = rel.replace(/^\/+|\/+$/g, '');
    return cleaned
      ? `/data/Minis/Users/${userName}/drive/${cleaned}`
      : `/data/Minis/Users/${userName}/drive`;
  }, [userName]);

  /** Open a .mjd / .data.json file in the right-side MJD editor panel.
   *  - `.mjd`        → mode='def', dataPath is the sibling (`.data.json`).
   *  - `.data.json`  → mode='data'. If the file starts with `{"$mjd": "..."}`
   *                    we use THAT path as the schema (lets a data file
   *                    point at a `.mjd` with a completely different name
   *                    in any directory). Otherwise fall back to the
   *                    same-name sibling for backward compat. */
  const openInMjdEditor = useCallback(async (entry: VfsEntry, relOverride?: string) => {
    const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
    const mode = getMjdMode(entry.name);
    if (!mode) return;
    const fullPath = driveToFullPath(rel);
    let mjdPath: string;
    let dataPath: string | undefined;
    if (mode === 'def') {
      mjdPath  = fullPath;
      // Convention: data file is sibling with .data.json suffix replacing .mjd
      dataPath = fullPath.replace(/\.mjd$/i, '.data.json');
    } else {
      // .data.json — probe `$mjd` envelope. We do this before mounting the
      // editor so MjdVfsLoader receives the right schema path on first
      // render (no flicker / no fallback-and-swap).
      dataPath = fullPath;
      let linkedMjd: string | null = null;
      try {
        const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
        if (!r.ok) {
          // eslint-disable-next-line no-console
          console.warn(`[Drive.openInMjdEditor] readFile ${rel} → HTTP ${r.status}; falling back to sibling .mjd`);
        } else {
          const j: { data?: string } = await r.json();
          // UTF-8-safe decode — plain atob() on bytes that happen to be
          // multi-byte UTF-8 produces latin1 garbage. The values we care
          // about ($mjd path) are ASCII, but $data content can carry
          // accents and we don't want to crash JSON.parse on garbage.
          const text = j.data ? base64ToText(j.data) : '';
          if (text) {
            const parsed = JSON.parse(text) as { $mjd?: unknown };
            if (typeof parsed.$mjd === 'string' && parsed.$mjd) {
              linkedMjd = parsed.$mjd;
            } else {
              // eslint-disable-next-line no-console
              console.warn(`[Drive.openInMjdEditor] ${rel}: no $mjd field in file — using sibling .mjd. Wrap the data in { "$mjd": "...", "$data": {...} } to point at any schema.`);
            }
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Drive.openInMjdEditor] failed to probe $mjd in ${rel}:`, err);
      }
      mjdPath = linkedMjd ?? fullPath.replace(/\.data\.json$/i, '.mjd');
    }
    setViewing(null);
    setMdEditing(null);
    setMjdEditing({ entry, rel, mjdPath, dataPath, mode });
  }, [cwd, driveToFullPath]);

  /** Switch the right panel from MdEditor (WYSIWYG) to Monaco showing the
   *  raw markdown source. Lets users tweak code-fence params, edit tables
   *  byte-exact, or paste markdown that the WYSIWYG layer would otherwise
   *  re-format on round-trip.
   *
   *  We re-fetch the file rather than reusing `mdEditing.initialContent`
   *  because MdEditor may have auto-saved unsynced edits — the on-disk view
   *  is the source of truth the user wants to see when they ask for "kod
   *  źródłowy". */
  const openMdAsRawSource = useCallback(async (entry: VfsEntry) => {
    try {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const data = json.data ?? '';
      const mime = guessMime(entry.name) || 'text/markdown';
      // Force-decode as text — the standard `isEditableTextFile` check would
      // refuse markdown to keep MdEditor as the default; we're explicitly
      // overriding that here.
      const textContent = base64ToText(data);
      setMdEditing(null);
      setViewing({ entry, mime, dataB64: data, textContent });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, toast]);

  // Wire the forward-declared ref now that openInMdEditor exists — goToFavorite
  // (declared earlier) calls through the ref to bypass TDZ ordering.
  useEffect(() => {
    openInMdEditorRef.current = openInMdEditor;
  }, [openInMdEditor]);

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
    setMjdEditing(null);
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
    const rawName = newFileDialog.name.trim();
    if (!rawName || rawName.includes('/')) {
      toast('Nazwa nie może być pusta ani zawierać "/"', 'error');
      return;
    }
    // Apply the preset's extension if the user didn't already include it —
    // typing "config" with the YAML preset selected creates "config.yaml".
    const preset = FILE_PRESETS.find(p => p.key === newFileDialog.presetKey) ?? FILE_PRESETS[0];
    const name = applyExtension(rawName, preset.extension);
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

  /** Insert text at the Monaco cursor (or replace current selection). Same
   *  flow as the Automate Script fullscreen editor — `executeEdits` keeps
   *  the change inside the editor's undo stack so Ctrl+Z reverts it cleanly.
   *  Falls back to appending to the buffer if the editor ref is somehow
   *  missing (e.g. picker triggered between mount and ref assignment). */
  const handleIncludeInsert = useCallback((content: string) => {
    const editor = monacoEditorRef.current;
    if (!editor) {
      setEditedText(prev => (prev ?? viewing?.textContent ?? '') + content);
      setEditorDirty(true);
      return;
    }
    const sel = editor.getSelection();
    const model = editor.getModel();
    if (!sel || !model) return;
    editor.executeEdits('drive-include', [{
      range: sel,
      text: content,
      forceMoveMarkers: true,
    }]);
    editor.focus();
    // Sync our React mirror so the dirty flag + save button reflect the new
    // buffer without waiting for the next onChange callback.
    const next = model.getValue();
    setEditedText(next);
    setEditorDirty(next !== (viewing?.textContent ?? ''));
  }, [viewing]);

  /** Persist Monaco's current buffer to the backing VFS file. Idempotent —
   *  no-op when nothing's dirty or there's no file open. After a successful
   *  write we mirror the new value into `viewing.textContent` so the editor's
   *  initial value matches reality on reload, and clear the dirty flag. */
  const saveEditedText = useCallback(async () => {
    if (!viewing || editedText === null) return;
    const rel = cwd ? `${cwd}/${viewing.entry.name}` : viewing.entry.name;
    setEditorSaving(true);
    try {
      await vfsWriteFile(userName, rel, textToBase64(editedText));
      // Sync our snapshot of the on-disk content; without this the very next
      // refresh would re-fire the reset useEffect with the OLD textContent.
      setViewing(prev => prev ? { ...prev, textContent: editedText } : prev);
      setEditorDirty(false);
      toast(`Zapisano "${viewing.entry.name}"`, 'success');
    } catch (err) {
      toast(`Nie zapisano: ${(err as Error).message}`, 'error');
    } finally {
      setEditorSaving(false);
    }
  }, [viewing, editedText, cwd, userName, toast]);

  // ── Upload (file input + drag-and-drop) ─────────────────────────────────
  const upload = useCallback(async (files: ReadonlyArray<File | { file: File; relPath: string }>) => {
    // Accept either a plain File[] (from <input type=file>) or a list with
    // pre-computed relative paths (from a folder drag-and-drop). Normalise
    // both into the same `{file, relPath}` shape so the upload loop below
    // doesn't need to branch.
    const arr = Array.from(files).map(item =>
      item instanceof File ? { file: item, relPath: item.name } : item,
    );
    if (arr.length === 0) return;
    // Snapshot the current directory NOW — before any await — so that if the
    // user navigates to a different folder mid-upload, all files in this batch
    // still land in the directory that was active when the upload started.
    const uploadCwd = cwd;
    // Base64 encoding inflates ~33%. The backend's JSON body cap is 200 MB,
    // so anything past ~140 MB raw will be rejected before we even POST.
    // Pre-flight check gives a useful error instead of a vague 500.
    const HARD_LIMIT_BYTES = 140 * 1024 * 1024;
    setUploading({ done: 0, total: arr.length, currentName: null, currentPct: 0, failed: 0 });
    // mkdir is idempotent at this layer (we ignore errors), but doing it once
    // per directory saves a round-trip per file in deep tree uploads.
    const createdDirs = new Set<string>();
    let done = 0;
    let failed = 0;
    for (const { file, relPath } of arr) {
      // Show file name + reset per-file progress before each file starts.
      // Use relPath in the display so folder uploads show 'sub/foo.js' not just 'foo.js'.
      setUploading({ done, total: arr.length, currentName: relPath, currentPct: 0, failed });
      try {
        if (file.size > HARD_LIMIT_BYTES) {
          throw new Error(`Plik za duży (${(file.size / 1024 / 1024).toFixed(1)} MB; limit ${(HARD_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB)`);
        }
        const b64 = await fileToBase64(file);
        const rel = uploadCwd ? `${uploadCwd}/${relPath}` : relPath;
        // For files inside subdirectories, ensure every parent dir exists
        // (Node's writeFile would error on a missing parent). We walk the
        // path and mkdir each segment in order — quietly ignoring "already
        // exists" responses since the backend doesn't surface them
        // specifically.
        const lastSlash = rel.lastIndexOf('/');
        if (lastSlash > 0) {
          const segments = rel.slice(0, lastSlash).split('/');
          let acc = '';
          for (const seg of segments) {
            acc = acc ? `${acc}/${seg}` : seg;
            if (!createdDirs.has(acc)) {
              await vfsMkdir(userName, acc).catch(() => { /* already exists or race */ });
              createdDirs.add(acc);
            }
          }
        }
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
        toast(`Błąd uploadu "${relPath}": ${friendly}`, 'error');
      }
      done++;
      setUploading((prev) => prev ? { ...prev, done, currentPct: 100, failed } : prev);
    }
    setUploading(null);
    const ok = done - failed;
    if (ok > 0) toast(`Wgrano ${ok} z ${arr.length} plików`);
    await refresh();
  }, [userName, cwd, refresh, toast]);

  /**
   * Walk a DataTransferItemList from a drop event, recursively expanding any
   * directories. Returns a flat list of files with their relative paths
   * preserved (`sub/foo.js`).
   *
   * Uses `webkitGetAsEntry()` — the only Web API that actually exposes
   * dropped directory structure. Note that the entries become stale ~100ms
   * after the drop event, so we collect everything synchronously into
   * promises first and only await afterwards. Otherwise Chrome throws
   * `NotFoundError: A requested file or directory could not be found at
   * the time an operation was processed.` — that's the exact error from
   * the report.
   */
  const collectDroppedFiles = useCallback(async (
    items: DataTransferItemList,
  ): Promise<{ file: File; relPath: string }[]> => {
    const results: { file: File; relPath: string }[] = [];

    const readDirEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
      // readEntries returns at most ~100 entries per call; iterate until empty.
      return new Promise((resolve, reject) => {
        const all: FileSystemEntry[] = [];
        const step = () => reader.readEntries((batch) => {
          if (batch.length === 0) resolve(all);
          else { all.push(...batch); step(); }
        }, reject);
        step();
      });
    };

    const entryToFile = (entry: FileSystemFileEntry): Promise<File> =>
      new Promise((resolve, reject) => entry.file(resolve, reject));

    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
      if (entry.isFile) {
        const file = await entryToFile(entry as FileSystemFileEntry);
        results.push({ file, relPath: prefix ? `${prefix}/${file.name}` : file.name });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const children = await readDirEntries(reader);
        for (const child of children) {
          await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      }
    };

    // Materialise entries synchronously — they become invalid if we wait.
    const entries: FileSystemEntry[] = [];
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    // Now walk asynchronously — at this point we hold real entry references,
    // not items from the original event.
    for (const entry of entries) await walk(entry, '');
    return results;
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void upload(Array.from(e.target.files));
    e.target.value = '';
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // Use the items list (with webkitGetAsEntry) when the browser exposes
    // it — that's the only way to detect dropped folders and recursively
    // upload their contents. Falls back to plain files when items aren't
    // available (very old browsers, or items.kind!=='file' for everything).
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      void (async () => {
        try {
          const entries = await collectDroppedFiles(e.dataTransfer.items);
          if (entries.length > 0) {
            await upload(entries);
          } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            // Some browsers (Safari < 13) populate `files` but not entry-aware
            // `items`. Fall back to flat upload in that case.
            await upload(Array.from(e.dataTransfer.files));
          }
        } catch (err) {
          toast(`Nie udało się odczytać upuszczonych plików: ${(err as Error).message}`, 'error');
        }
      })();
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void upload(Array.from(e.dataTransfer.files));
    }
  }, [upload, collectDroppedFiles, toast]);

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


  // ── Right panel content (View or MdEditor) ──────────────────────────────
  // Rendered both as embedded panel (desktop) and as Dialog content (mobile).
  const viewerBody = viewing && (
    viewing.textContent !== undefined ? (
      // Monaco editor with syntax highlighting for the file's detected language.
      // Ctrl+S saves through `saveEditedText`; the dirty flag and save spinner
      // are surfaced in the right-panel toolbar (next to the close button).
      <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
        <Editor
          height="100%"
          path={`drive://${viewing.entry.name}`}
          language={fileToMonacoLanguage(viewing.entry.name)}
          value={editedText ?? viewing.textContent}
          beforeMount={setupDriveEditorMonaco}
          onChange={(v) => {
            const next = v ?? '';
            setEditedText(next);
            // Only flip dirty when content actually diverged from the
            // on-disk snapshot, to avoid spurious "unsaved" chips after a
            // fresh load.
            setEditorDirty(next !== (viewing.textContent ?? ''));
          }}
          onMount={(editor, monaco) => {
            monacoEditorRef.current = editor;
            setMonacoEditorInstance(editor);
            // Ctrl+S / Cmd+S → save. Goes through `saveEditedText` which
            // already short-circuits when nothing is dirty.
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
              () => { void saveEditedText(); },
            );
          }}
          theme="vs-dark"
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            // Without this, Monaco's suggest / hover / parameter-hints widgets
            // anchor inside the editor's overflow container. In the Drive
            // right-panel layout the editor lives inside several scrollable
            // ancestors (Allotment pane → flex column → Paper). The widget
            // then renders at the editor's TOP-LEFT in viewport space because
            // our `position: fixed` CSS rule (`.suggest-widget` in
            // monacoWorkers.ts) takes over without knowing the parent scroll
            // offsets — that's the "weird place" you saw.
            //
            // `fixedOverflowWidgets: true` tells Monaco to render those
            // widgets as fixed-positioned children of an overflow node it
            // manages itself, aligned to the caret position regardless of
            // ancestor scrolling. With the CSS rule already in place,
            // z-index stays high enough to clear MUI stacking contexts.
            fixedOverflowWidgets: true,
            // Match the read-only feel of the old <pre> for files the user
            // probably doesn't want to nuke by accident (none currently —
            // every textContent path is editable), but keep the door open
            // for a future read-only mode.
            readOnly: false,
          }}
        />
        <MonacoSelectionHandles editor={monacoEditorInstance} />
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
    // 100% of the fullBleed Layout main — Layout sets a flex column with
    // a static AppBar above us, so the remaining flex slot already has the
    // exact "viewport minus topbar" height. Hard-coding `calc(100vh - 64px)`
    // previously overshot when the topbar wasn't 64px (macOS dense toolbar,
    // banner injection, etc.) — page wound up taller than the viewport.
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {showSidebar && (
      <Box sx={{
        p: 2,
        display: 'flex', flexDirection: 'column',
        // 280-620px sidebar: low end fits tablet portrait (~600px viewport)
        // with ~320px left for the right panel; high end caps on ultrawides
        // so the editor gets the dominant share.
        // When a file preview is open the sidebar is a clamped column. When only
        // the agent is open they split the canvas 50/50 (both flex:1).
        flex: showRightPanel ? `0 0 clamp(280px, 36%, 620px)` : 1,
        minWidth: 0, overflow: 'hidden',
        borderRight: (showRightPanel || showAgent) ? '1px solid' : 'none',
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
        <Tooltip title="Szukaj tekstu w plikach (bieżący katalog lub cały drive)">
          <Button
            variant="outlined"
            startIcon={<SearchIcon />}
            onClick={() => setSearchOpen(true)}
          >
            Search
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
        <MenuItem onClick={() => { setNewFileDialog({ name: 'notatka.md', presetKey: 'md' }); setActionsMenu(null); }}>
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
        <MenuItem onClick={() => { setAgentOpen(true); setActionsMenu(null); }}>
          <ListItemIcon><SmartToyIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="AI Agent"
            secondary="Asystent AI z dostępem do plików Drive"
          />
        </MenuItem>
        <MenuItem onClick={() => { setSearchOpen(true); setActionsMenu(null); }}>
          <ListItemIcon><SearchIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Szukaj w plikach…"
            secondary="Bieżący katalog lub cały drive"
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

      {/* Favorites — compact card above the file list. Rendered only when
          there's at least one favorite; collapsing-when-empty would make the
          UI flicker as the user un-stars the last item. */}
      {favorites.size > 0 && (
        <Paper variant="outlined" sx={{ mb: 1, p: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setFavoritesOpen((v) => !v)}
          >
            <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Ulubione ({favorites.size})
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" sx={{ p: 0.25 }}>
              {favoritesOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Stack>
          <Collapse in={favoritesOpen} unmountOnExit>
            <Stack
              direction="row"
              flexWrap="wrap"
              useFlexGap
              spacing={0.75}
              sx={{ mt: 1 }}
            >
              {Array.from(favorites).sort().map((rel) => {
                const lastSlash = rel.lastIndexOf('/');
                const fileName = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
                const folder = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
                return (
                  <Chip
                    key={rel}
                    size="small"
                    icon={<InsertDriveFileIcon fontSize="small" />}
                    label={fileName}
                    title={folder ? `${folder}/${fileName}` : fileName}
                    onClick={() => { void goToFavorite(rel); }}
                    onDelete={() => {
                      setFavorites((prev) => {
                        const next = new Set(prev);
                        next.delete(rel);
                        return next;
                      });
                    }}
                    sx={{ maxWidth: 260 }}
                  />
                );
              })}
            </Stack>
          </Collapse>
        </Paper>
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
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                        <span>{e.name}</span>
                        {/* Passive favorite indicator — small filled star next to
                            the name when the file is in favorites. The toggle
                            itself lives in the row's context menu (`⋯`); having
                            both a clickable toggle here and the same item in
                            the menu was redundant. */}
                        {e.type === FILE_TYPE && isFavorite(rel) && (
                          <Tooltip title="Ulubiony — zarządzaj przez menu (⋯)">
                            <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                          </Tooltip>
                        )}
                        {pub && <Tooltip title="Publiczny — dostępny przez HTTP bez logowania"><PublicIcon fontSize="small" color="success" /></Tooltip>}
                        {/* File-property tags — chips inline next to the
                            name. Read from the in-memory fileProperties
                            mirror (loaded once on mount), so rendering
                            stays fast even with hundreds of entries. */}
                        {(fileProperties.tags[rel] ?? []).map((tag) => (
                          <Chip
                            key={`tag-${tag}`}
                            label={tag}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                          />
                        ))}
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
              {viewing?.entry.name ?? mdEditing?.entry.name ?? mjdEditing?.entry.name}
              {mjdEditing && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  · {mjdEditing.mode === 'def' ? 'schemat MJD' : 'dane MJD'}
                </Typography>
              )}
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
            {/* "Dołącz plik" — multi-root picker (drive/mdscript + drive/treejs)
                inserts the file's body at the cursor. Available for any text
                file open in the editor, not just script-y ones — useful for
                building up config files from templated chunks too. */}
            {viewing && viewing.textContent !== undefined && (
              <Tooltip title="Dołącz plik z drive/mdscript lub drive/treejs">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => setIncludeOpen(true)}
                    disabled={!userName}
                  >
                    <AttachFileIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {/* Code-editor save button — only when there's a text buffer.
                Disabled when nothing's dirty so accidental clicks don't
                rewrite the file with identical content. */}
            {viewing && viewing.textContent !== undefined && (
              <Tooltip title="Zapisz (Ctrl+S)">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => void saveEditedText()}
                    disabled={!editorDirty || editorSaving}
                    color={editorDirty ? 'primary' : 'default'}
                  >
                    {editorSaving
                      ? <CircularProgress size={14} />
                      : <SaveIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            {viewing && viewing.textContent !== undefined && editorDirty && (
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label="Niezapisane"
                sx={{ height: 22 }}
              />
            )}
            {/* Markdown view toggle — pair of symmetric buttons that swap
                the panel between WYSIWYG (MdEditor / TipTap) and raw source
                (Monaco with markdown syntax highlighting). Previously hidden
                on compact viewports (`!isCompact`), but switching between
                editors is the most-requested action when authoring on a
                phone — there's nowhere else to surface it on mobile (no
                kebab menu entry yet either), so we now keep them visible
                in both layouts. Same icon size as the rest of the toolbar
                keeps the row from wrapping on a narrow screen. */}
            {viewing && isMdEditable(viewing.entry.name) && (
              <Tooltip title="Otwórz w edytorze Markdown (WYSIWYG)">
                <IconButton size="small" onClick={() => void openInMdEditor(viewing.entry)}>
                  <EditNoteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {mdEditing && (
              <Tooltip title="Otwórz kod źródłowy (Markdown w edytorze tekstu)">
                <IconButton size="small" onClick={() => void openMdAsRawSource(mdEditing.entry)}>
                  <CodeIcon fontSize="small" />
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
                  filePath={`drive/${mdEditing.rel}`}  /* prefixed so api.file (userBase-relative) and api.scripts.runInParentsByTag find the same file */
                />
              </Box>
            )}
            {mjdEditing && (
              // ONE scroll, here on the wrapper. Previously we also passed
              // `height="100%"` down which made MjdVfsLoader install its own
              // overflow:auto on top — two nested scroll contexts meant the
              // editor's long content would push past the panel and the page
              // would scroll instead of the panel. Letting the inner content
              // size naturally + scrolling the wrapper keeps the editor
              // contained inside the right-side panel as expected.
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <MjdVfsLoader
                  key={mjdEditing.rel}
                  provider={mjdFs}
                  mjdPath={mjdEditing.mjdPath}
                  dataPath={mjdEditing.mode === 'data' ? mjdEditing.dataPath : undefined}
                />
              </Box>
            )}
          </Box>
        </Box>
      )}
      {agentMounted && agentFs && (
        <Box sx={{
          flex: '1 1 0', minWidth: 320,
          display: showAgent ? 'flex' : 'none', flexDirection: 'column',
          overflow: 'hidden',
          borderLeft: '1px solid', borderColor: 'divider',
        }}>
          {/* Thin header — AgentPanel renders its own "AI Agent" title row but
              has no close control (the workspace editor wraps it), so we add one. */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5,
            bgcolor: '#252526', borderBottom: '1px solid #3c3c3c',
          }}>
            <SmartToyIcon fontSize="small" sx={{ color: '#bbb' }} />
            <Typography sx={{ flex: 1, fontSize: 12, color: '#bbb', fontWeight: 600 }}>
              Asystent
            </Typography>
            <Button
              size="small"
              startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              onClick={(e) => void openPromptsMenu(e.currentTarget)}
              sx={{ color: '#bbb', textTransform: 'none', fontSize: 12, minWidth: 0, '&:hover': { color: '#fff', bgcolor: '#3c3c3c' } }}
            >
              Prompts
            </Button>
            <Tooltip title="Zamknij agenta">
              <IconButton size="small" onClick={() => setAgentOpen(false)} sx={{ color: '#888' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Menu
            anchorEl={promptsMenu}
            open={promptsMenu !== null}
            onClose={() => setPromptsMenu(null)}
            slotProps={{ paper: { sx: { minWidth: 240, maxHeight: 360 } } }}
          >
            {promptsLoading && (!promptItems || promptItems.length === 0) && (
              <MenuItem disabled>
                <ListItemIcon><CircularProgress size={16} /></ListItemIcon>
                <ListItemText primary="Ładowanie…" />
              </MenuItem>
            )}
            {!promptsLoading && promptItems && promptItems.length === 0 && (
              <MenuItem disabled>
                <ListItemText primary="Brak promptów" secondary="Sprawdź drive/public/ai_prompt/ai_prompts.json" />
              </MenuItem>
            )}
            {promptItems?.map(item => (
              <MenuItem key={item.url} onClick={() => void loadPrompt(item)}>
                <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={item.label} />
              </MenuItem>
            ))}
          </Menu>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <AgentPanel
              ref={agentRef}
              provider={agentFs}
              defaultConfig={agentDefaultConfig}
              authToken={token ?? undefined}
              injectedClaudeMd={agentClaudeMd}
              onFileWritten={() => { void refresh(); }}
            />
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
        {menuFor && menuFor.entry.type === FILE_TYPE && (() => {
          const rel = cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name;
          const isFav = isFavorite(rel);
          return (
            <MenuItem onClick={() => { toggleFavorite(menuFor.entry); setMenuFor(null); }}>
              <ListItemIcon>
                {isFav
                  ? <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                  : <StarBorderIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}</ListItemText>
            </MenuItem>
          );
        })()}
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
        <MenuItem onClick={() => { openPropertiesDialog(menuFor!.entry); setMenuFor(null); }}>
          <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Właściwości…</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { void onDelete(menuFor!.entry); setMenuFor(null); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Usuń</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Full-text search dialog ───────────────────────────────────── */}
      {/* `runSearch` is the actual top-level helper bound to the current
          user. The dialog owns query state, results, abort control —
          DrivePage just supplies "where to search" and "what to do when
          a result is clicked". */}
      <DriveSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        cwd={cwd}
        runSearch={({ baseRel, query, caseSensitive, isRegex, signal, onProgress }) =>
          searchInFiles(userName, baseRel, query, { caseSensitive, isRegex }, signal, onProgress)
        }
        onOpenFile={(rel) => {
          // Reuse Drive's existing "open" semantics — viewFile / openInMdEditor
          // route based on extension. Build a synthetic VfsEntry from the
          // path so existing helpers don't need a new code path.
          //
          // We jump cwd to the file's directory so breadcrumbs / sidebar
          // reflect where the file lives — clicking a search result from a
          // deep folder shouldn't leave the listing pointing at the old cwd.
          const name = rel.split('/').pop() || rel;
          const synthetic: VfsEntry = { name, type: FILE_TYPE };
          const targetDir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
          if (targetDir !== cwd) setCwd(targetDir);
          if (isMjdEditable(name)) {
            openInMjdEditor(synthetic, rel);
          } else if (isMdEditable(name)) {
            // Pass `rel` as override so openInMdEditor doesn't re-derive it
            // from `cwd + name` — cwd may not have committed yet from the
            // setCwd call above (React schedules state updates).
            void openInMdEditor(synthetic, rel);
          } else {
            void viewFile(synthetic);
          }
          setSearchOpen(false);
        }}
      />

      {/* ── Properties dialog (tags + future per-file metadata) ───────── */}
      <Dialog open={!!propsDialog} onClose={() => setPropsDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon fontSize="small" />
          Właściwości: {propsDialog?.entry.name}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Ścieżka: {propsDialog?.rel}
          </Typography>

          {/* Tags section — mirror of the AutomateScript settings dialog
              tags UX so the user gets the same chip-input across the app. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <LabelIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" fontWeight={600}>Tagi pliku</Typography>
          </Box>
          <Box sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            mb: 1,
            minHeight: 32,
            p: 0.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
          }}>
            {propsDraftTags.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ p: 0.5 }}>
                Brak tagów — dodaj poniżej.
              </Typography>
            ) : propsDraftTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => setPropsDraftTags(prev => prev.filter(t => t !== tag))}
              />
            ))}
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField
              value={propsDraftTagInput}
              onChange={e => setPropsDraftTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraftTag();
                } else if (e.key === 'Backspace' && !propsDraftTagInput && propsDraftTags.length > 0) {
                  // Empty-input backspace deletes the last chip — same UX as
                  // Gmail/Slack recipient fields.
                  e.preventDefault();
                  setPropsDraftTags(prev => prev.slice(0, -1));
                }
              }}
              placeholder="np. daily, projekt-A, notatki"
              size="small"
              fullWidth
            />
            <IconButton
              size="small"
              onClick={commitDraftTag}
              disabled={!propsDraftTagInput.trim()}
              sx={{ border: 1, borderColor: 'divider' }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Tagi są zapisywane w <code>drive/.fileproperties.json</code>. Przydaje się do filtrowania /
            grupowania plików w przyszłych narzędziach.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPropsDialog(null)}>Anuluj</Button>
          <Button onClick={saveProperties} variant="contained">Zapisz</Button>
        </DialogActions>
      </Dialog>

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
      {newFileDialog && (() => {
        const currentPreset = FILE_PRESETS.find(p => p.key === newFileDialog.presetKey) ?? FILE_PRESETS[0];
        // Live preview of the name that will actually land on disk —
        // matches what `doCreateEmpty` will produce.
        const previewName = newFileDialog.name.trim()
          ? applyExtension(newFileDialog.name.trim(), currentPreset.extension)
          : '';
        return (
        <Dialog open onClose={() => setNewFileDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Nowy pusty plik</DialogTitle>
          <DialogContent>
            <FormControl fullWidth size="small" margin="normal">
              <InputLabel id="new-file-preset-label">Typ pliku</InputLabel>
              <Select
                labelId="new-file-preset-label"
                label="Typ pliku"
                value={newFileDialog.presetKey}
                onChange={(e) => {
                  const nextKey = e.target.value;
                  const nextPreset = FILE_PRESETS.find(p => p.key === nextKey) ?? FILE_PRESETS[0];
                  // Auto-update name to the new preset's default IF the user
                  // hasn't typed something custom (still on a known default).
                  // Otherwise keep their text — they'll get auto-extension on save.
                  const wasDefault = FILE_PRESETS.some(p => p.defaultName === newFileDialog.name);
                  setNewFileDialog({
                    presetKey: nextKey,
                    name: wasDefault ? nextPreset.defaultName : newFileDialog.name,
                  });
                }}
              >
                {FILE_PRESETS.map(p => (
                  <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField autoFocus fullWidth label="Nazwa pliku" value={newFileDialog.name}
              onChange={(e) => setNewFileDialog({ ...newFileDialog, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') void doCreateEmpty(); }}
              margin="normal"
              helperText={
                currentPreset.extension
                  ? `Rozszerzenie ${currentPreset.extension} zostanie dodane automatycznie jeśli go nie wpiszesz.`
                  : 'Wpisz pełną nazwę z rozszerzeniem.'
              }
            />
            {previewName && previewName !== newFileDialog.name && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Końcowa nazwa: <code>{previewName}</code>
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewFileDialog(null)}>Anuluj</Button>
            <Button variant="contained" disabled={!newFileDialog.name.trim()} onClick={doCreateEmpty}>Utwórz</Button>
          </DialogActions>
        </Dialog>
        );
      })()}

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

      {/* "Dołącz plik" — same picker the Automate Script editor uses; chunk
          is lazy so users who never open it don't pay for the import. The
          `{includeOpen && …}` guard makes sure the dialog doesn't mount
          until the user actually clicks the attach icon. */}
      <Suspense fallback={null}>
        {includeOpen && (
          <AutomateIncludeFileDialog
            open={includeOpen}
            onClose={() => setIncludeOpen(false)}
            userName={userName}
            onInsert={handleIncludeInsert}
          />
        )}
      </Suspense>
    </Box>
  );
}
