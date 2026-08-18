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
import { PdfViewContent } from './PdfView';
import { DjvuViewContent } from './DjvuView';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../modules/auth';
import { QtUiSceneEditor, type QtUiFs } from '../../modules/qtui/QtUiSceneEditor';
import { useMqtt } from '../../modules/mqttclient';
import { ScenePanel, setSceneHost, SCENE_SCRIPT_DTS, utworzHostaSceny } from '../../modules/scene-script';
import { potrzebujeQt } from './potrzebneQt';
import type { IScene } from '@mhersztowski/core-cad-viewer';
import { readUserJson, writeUserJson } from '../../services/userJson';
import {
  Alert, Backdrop, Box, Breadcrumbs, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, IconButton, InputLabel, LinearProgress,
  Link, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Select, Snackbar, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
  Switch, FormControlLabel, Popover,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import TuneIcon from '@mui/icons-material/Tune';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArticleIcon from '@mui/icons-material/Article';
import { useLayoutChrome } from '../../components/Layout';
import { AccountMenu } from '../../components/AccountMenu';
import { MdEditor } from '@/components/mdeditor';
import { MdTocPanel, MdFavoritesPanel } from './MdFloatingPanels';
import JSZip from 'jszip';
import { stripMdExtensions, extractMdLinks, resolveRelPath, dirOf, isWithin } from './mdPortability';
// Side-effect: ensures Monaco workers + compiler options + completionItems
// configuration is in place BEFORE MdEditor (or the embedded workspace) mounts.
import '../../modules/editor/monacoWorkers';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentPasteGoIcon from '@mui/icons-material/ContentPasteGo';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DynamicFormIcon from '@mui/icons-material/DynamicForm';
import SchemaIcon from '@mui/icons-material/Schema';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import EditIcon from '@mui/icons-material/Edit';
import EditNoteIcon from '@mui/icons-material/EditNote';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
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
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import TerminalIcon from '@mui/icons-material/Terminal';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SubjectIcon from '@mui/icons-material/Subject';
import CodeIcon from '@mui/icons-material/Code';
import TodayIcon from '@mui/icons-material/Today';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DescriptionIcon from '@mui/icons-material/Description';
import DashboardIcon from '@mui/icons-material/Dashboard';

import DriveSearchDialog from './DriveSearchDialog';
import GitRepoPanel from './GitRepoPanel';
import DashEditorPanel from './DashEditorPanel';
import { JsonSchemaFormPanel, SchemaPickerDialog, schemaRefOf } from './JsonSchemaEditor';
import type { SearchMatch, SearchFileResult, SearchProgress } from './driveSearchTypes';

// MJD editor — lazy-loaded so the (sizeable) editor bundle isn't pulled in
// until the user actually opens a .mjd / .data.json file. RemoteFS is the
// VFS adapter MjdVfsLoader expects.
import { MjdVfsLoader, GlobalJsonLoader, AgentPanel, SubpathFS, TextEditorWorkspace, DEFAULT_AGENT_CONFIG, createCommentToolsPlugin } from '@mhersztowski/texteditor';
import { createHydraStudioPlugin } from '@mhersztowski/hydra-studio';
import { runHydraBuild } from './hydraBuild';
import { collectHydraFirmware } from './hydraFlash';
import { FlashDialog, type FlashFileEntry } from '@modules/serial';
import { loadWasmSources, useWasmUpload } from './wasmUpload';
import type { AgentConfig, AgentPanelHandle } from '@mhersztowski/texteditor';
import { RemoteFS, CompositeFS, isPublicDrivePath, publicDriveUrl, PUBLIC_DRIVE_DIRS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
// Value import (not just types): used to reach the live Monaco model of the
// file currently open in the embedded workspace (`file://<wsPath>`), so the
// in-browser runner executes unsaved edits, and to transpile .ts via the TS
// worker. Same module instance the workspace bundles, so getModel() resolves.
import * as monaco from 'monaco-editor';
import { minisApi } from '../../services/MinisApiService';

// ─── VFS helpers ─────────────────────────────────────────────────────────────

interface VfsEntry { name: string; type: 1 | 2; size?: number; mtime?: number }
const FILE_TYPE = 1;
const DIR_TYPE = 2;

// navigator.clipboard is undefined outside a secure context (HTTP on a LAN IP,
// which is how the app is reached on mobile) — so we fall back to the legacy
// execCommand('copy') path, then to a manual prompt as a last resort.
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

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

// ─── Ustawienia widoku markdown (per-plik, zapisywane na backend) ────────────
// Jeden plik na usera: klucz = ścieżka pliku (taka sama jak `filePath` przekazany
// do MdEditor), wartość = { minimalView }.
const MDVIEW_PATH = '.mdview.json';
interface MdViewEntry { minimalView?: boolean; showToc?: boolean; showFavorites?: boolean; smallText?: boolean; fullWidth?: boolean }
interface MdViewMap { [fileKey: string]: MdViewEntry }

async function loadMdViewSettingsMap(userName: string): Promise<MdViewMap> {
  try {
    const r = await fetch(apiUrl(userName, 'readFile', MDVIEW_PATH), { headers: authHeaders() });
    if (!r.ok) return {};
    const j: { data?: string } = await r.json();
    if (!j.data) return {};
    const parsed = JSON.parse(decodeURIComponent(escape(atob(j.data)))) as MdViewMap;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
}

async function saveMdViewSettingsMap(userName: string, map: MdViewMap): Promise<void> {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(map, null, 2))));
  await vfsWriteFile(userName, MDVIEW_PATH, b64);
}

// ─── Cron schedules for backend JS scripts (Drive → Właściwości) ─────────────
// Stored in `drive/.schedules.json`, keyed by drive-relative path:
//   { "server/foo.mjs": { "cron": "0 * * * *", "enabled": true } }
// The backend DriveScriptScheduler reads this file and runs `node {file}` on cron.
const SCHEDULES_PATH = '.schedules.json';
type DriveSchedules = Record<string, { cron: string; enabled: boolean; runAtStartup?: boolean }>;

async function loadSchedules(userName: string): Promise<DriveSchedules> {
  try {
    const r = await fetch(apiUrl(userName, 'readFile', SCHEDULES_PATH), { headers: authHeaders() });
    if (!r.ok) return {};
    const j: { data?: string } = await r.json();
    if (!j.data) return {};
    const parsed = JSON.parse(decodeURIComponent(escape(atob(j.data)))) as DriveSchedules;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
}

async function saveSchedules(userName: string, schedules: DriveSchedules): Promise<void> {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(schedules, null, 2))));
  await vfsWriteFile(userName, SCHEDULES_PATH, b64);
  // Ask the backend to re-register this user's cron jobs from the new file.
  await fetch(`/api/users/${encodeURIComponent(userName)}/drive/schedules/reload`, {
    method: 'POST', headers: authHeaders(),
  }).catch(() => {});
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
  'c', 'cpp', 'cc', 'h', 'hpp', 'ino', 'pde', 'cs', 'sh', 'bash', 'zsh', 'fish',
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
  pdf: 'application/pdf', djvu: 'image/vnd.djvu', djv: 'image/vnd.djvu',
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

// Files runnable on the backend (Drive → Run). Typically placed under
// `drive/server/` or `drive/backend/`. TS files are transpiled+bundled on the
// backend (so they can import other local .ts/.js files); JS runs as-is.
const isRunnable = (name: string) => /\.(mjs|cjs|js|ts|tsx|mts|cts)$/i.test(name);

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

// `.myschema.json` → graphical schema/.d.ts editor (GlobalJsonLoader), opened in
// the same right-side preview panel. Standalone JSON, no linked .mjd schema.
const isMySchemaJson = (name: string) => /\.myschema\.json$/i.test(name);

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
  { key: 'myschema',  label: 'My Schema (.myschema.json)',      defaultName: 'schema.myschema.json', extension: '.myschema.json' },
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
// DjVu ma mime `image/vnd.djvu` (zaczyna się od image/), ale NIE jest obrazkiem <img> —
// wyklucz, by trafił do dedykowanego DocPreview (djvu), a nie do zepsutego <img>.
const isImageMime = (m: string) => m.startsWith('image/') && m !== 'image/svg+xml' && m !== 'image/vnd.djvu' && m !== 'image/x-djvu';
const isPdfMime = (m: string) => m === 'application/pdf';
const isDjvuMime = (m: string) => m === 'image/vnd.djvu' || m === 'image/x-djvu';

// Podgląd dokumentu PDF/DjVu w panelu Drive — renderuje pojedynczą stronę z paskiem
// nawigacji (pierwsza/poprzednia/goto/następna/ostatnia). Reużywa komponentów sceny.
const DocPreview: React.FC<{ userName: string; filePath: string; kind: 'pdf' | 'djvu' }> = ({ userName, filePath, kind }) => {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filePath]);
  const props = { userName, filePath, page, showNavigation: true, onPageChange: setPage };
  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {kind === 'pdf' ? <PdfViewContent {...props} /> : <DjvuViewContent {...props} />}
    </Box>
  );
};
const isAudioMime = (m: string) => m.startsWith('audio/');
const isVideoMime = (m: string) => m.startsWith('video/');

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
  // hydra/hsch/hcomp: pliki projektu frameworka Hydra. Są YAML-em, ale mają
  // własne rozszerzenia, żeby wtyczka Hydra Studio mogła je rozpoznać —
  // otwarcie w tym edytorze uruchamia jej interfejs obok zakładki tekstowej.
  return /^(json|jsonc|json5|map|js|mjs|cjs|jsx|ts|tsx|mts|cts|py|pyi|xml|svg|xsd|xsl|html|htm|css|scss|less|yaml|yml|hydra|hsch|hcomp|sh|bash|zsh|sql|c|h|cpp|cc|cxx|hpp|hh|hxx|ino|pde|java|kt|rs|go|rb|php|cs|fs|swift|dart|lua|r|pl|ini|cfg|toml|env|conf|dockerfile|gitignore|gitattributes)$/.test(ext);
}

// Lekkie czyszczenie markdown wyeksportowanego z Notion: dekoduje %20 w lokalnych
// linkach i usuwa 32-znakowy hash Notion z nazw plików ("Nazwa 1a2b…def.md" → "Nazwa.md").
function cleanNotionMarkdown(md: string): string {
  let s = md.replace(/\r\n/g, '\n');
  s = s.replace(/\]\(([^)]+)\)/g, (m, url: string) => {
    if (/^https?:/i.test(url)) return m;
    try { return `](${decodeURIComponent(url).replace(/ [0-9a-f]{32}(?=[./]|$)/gi, '')})`; } catch { return m; }
  });
  s = s.replace(/ [0-9a-f]{32}(?=[.\s)/])/gi, '');
  return s.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function stripNotionHash(s: string): string { return s.replace(/ [0-9a-f]{32}(?=\.|\/|$)/gi, ''); }
function sanitizeFileName(s: string): string { return (s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'plik'); }

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
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

/**
 * Czy ścieżka leży w obszarze publicznym Drive.
 *
 * Reguła przychodzi z `@mhersztowski/core` — tego samego modułu, którego używa
 * backend przy serwowaniu plików. Dopóki katalog publiczny był jeden, obie
 * strony miały własną kopię warunku i nikt tego nie zauważał; przy trzech
 * rozjazd oznaczałby link prowadzący do 403 albo plik publiczny bez oznaczenia.
 */
const isPublic = isPublicDrivePath;

/** Ludzki opis katalogów publicznych — do komunikatów, żeby brzmiały jednakowo. */
const OPIS_PUBLICZNYCH = PUBLIC_DRIVE_DIRS.map((d) => `${d}/`).join(', ');

function publicUrl(userName: string, relPath: string): string {
  // Adres buduje ta sama funkcja, która decyduje o publiczności — dzięki temu
  // nie da się zbudować linku do ścieżki, której backend nie wyda.
  return publicDriveUrl(window.location.origin, userName, relPath) ?? '';
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

// ─── In-browser script runner ────────────────────────────────────────────────
// JS/TS files opened in the Drive editor can be executed in the page itself
// (the user's own code, same trust model as Plugin Scripts). `console.*` is
// redirected into a panel below the editor.
type BrowserConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
interface BrowserConsoleLine { level: BrowserConsoleLevel; text: string }
const MAX_BROWSER_CONSOLE = 500;
const isBrowserRunnable = (name: string) => /\.(js|mjs|cjs|ts)$/i.test(name);
function fmtConsoleArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack ?? a.message;
  try { return JSON.stringify(a, null, 2); } catch { return String(a); }
}
function browserConsoleColor(l: BrowserConsoleLevel): string {
  return l === 'error' ? 'error.main'
    : l === 'warn' ? 'warning.main'
    : l === 'info' ? 'info.main'
    : l === 'debug' ? 'text.secondary'
    : 'text.primary';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DrivePage(): React.JSX.Element {
  // Prefer the URL param (legacy route `/user/:userName/pim/drive`) but fall
  // back to the logged-in user so this component also works as a Global window
  // mounted outside any route — there `useParams` returns no userName.
  const params = useParams<{ userName: string }>();
  const { currentUser, token, isAdmin } = useAuth();
  const { rawPublish, rawSubscribe } = useMqtt();
  const userName = params.userName || currentUser?.name || '';
  const { openNav } = useLayoutChrome();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Inicjalizacja z `?cwd=` (wejście z Pulpitu do ulubionego katalogu) — dzięki temu PIERWSZY
  // refresh ładuje właściwy katalog (a nie root, który potem trzeba by nadpisać → wyścig).
  const [cwd, setCwd] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('cwd') ?? ''; } catch { return ''; }
  });                                                       // relative under /drive/
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
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
  // Wsad zebrany po budowie — trzymamy do czasu zamknięcia okna programowania.
  const [hydraFlashOpen, setHydraFlashOpen] = useState(false);
  const [hydraFlashFiles, setHydraFlashFiles] = useState<FlashFileEntry[] | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<{ anchor: HTMLElement | null; entry: VfsEntry; pos?: { top: number; left: number } } | null>(null);
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
  // Git repo panel state — set when a `.repo.json` file is opened. `path` is the
  // .repo.json path relative to the user's drive root (e.g. `myrepo/.repo.json`).
  const [repoViewing, setRepoViewing] = useState<{ entry: VfsEntry; path: string } | null>(null);
  const [dashEditing, setDashEditing] = useState<{ entry: VfsEntry; path: string } | null>(null);
  // Graphical (schema form) editor for a `.json` file. `rel` is drive-relative.
  const [jsonFormEditing, setJsonFormEditing] = useState<{ entry: VfsEntry; rel: string } | null>(null);
  // "Zmień schema" dialog — bound to the json file at `rel`; `current` is its
  // existing $schema binding (or null).
  const [schemaDialog, setSchemaDialog] = useState<{ rel: string; entry: VfsEntry; current: string | null } | null>(null);
  // When a file is opened by clicking an embedded File component, remember the
  // source markdown so the opened editor can offer a "← back to markdown" button.
  const [returnToMd, setReturnToMd] = useState<{ rel: string; pimRel?: string; label: string } | null>(null);
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
    // When set, the file lives OUTSIDE the drive subtree (e.g. a Notes file at
    // `md/rome.md`). It is user-root-relative (`/data/Minis/Users/{u}/{pimRel}`)
    // and read/write bypass the drive-scoped helpers. `rel` mirrors it for UI.
    pimRel?: string;
  } | null>(null);
  // Ustawienia widoku markdown per-plik (klucz = ścieżka MdEditor.filePath).
  const [mdViewMap, setMdViewMap] = useState<MdViewMap>({});
  const [mdSettingsAnchor, setMdSettingsAnchor] = useState<HTMLElement | null>(null);
  // MJD editor — opens in the same right-side preview slot as MdEditor.
  //   mode='def'  → MjdVfsLoader edits the .mjd schema (data path omitted)
  //   mode='data' → MjdVfsLoader edits sibling .data.json against the .mjd
  // mjdPath / dataPath are FULL backend paths (`/data/Minis/Users/{u}/drive/...`)
  // — that's what RemoteFS expects. `rel` keeps the drive-relative form for UI.
  const [mjdEditing, setMjdEditing] = useState<{
    entry: VfsEntry; rel: string; mjdPath: string; dataPath?: string; mode: MjdMode;
  } | null>(null);
  // `.myschema.json` graphical editor (GlobalJsonLoader). path = full backend path.
  const [globalEditing, setGlobalEditing] = useState<{ entry: VfsEntry; rel: string; path: string } | null>(null);
  // `*.qtui.json` → MinisQt UI scene designer (same editor as Arduino "UI Scene",
  // rendered inline in the right panel; no WASM build — Drive has no project context).
  const [qtuiEditing, setQtuiEditing] = useState<{ entry: VfsEntry; rel: string } | null>(null);
  // Singleton RemoteFS — MjdVfsLoader expects a FileSystemProvider. Token
  // updates propagate via setToken below so logout/login doesn't strand
  // the editor on a stale credential.
  const mjdFs = useMemo(
    () => new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => { mjdFs.setToken(token ?? undefined); }, [token, mjdFs]);

  // Minimal FS the QtUiSceneEditor needs, wired to the SAME user-scoped VFS
  // endpoints Drive uses for its own files — so a *.qtui.json path resolves
  // exactly as the user sees it. Stable per user (editor reloads only on file
  // change via `key`). Base64 <-> bytes is byte-exact (UTF-8 safe).
  const qtuiFs = useMemo<QtUiFs>(() => ({
    async readFile(p: string): Promise<Uint8Array> {
      const rel = p.replace(/^\/+/, '');
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const bin = atob(json.data ?? '');
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    },
    async writeFile(p: string, content: Uint8Array): Promise<void> {
      const rel = p.replace(/^\/+/, '');
      let binary = '';
      for (let i = 0; i < content.length; i++) binary += String.fromCharCode(content[i]);
      await vfsWriteFile(userName, rel, btoa(binary));
    },
    async refresh(): Promise<void> { /* overwriting an existing file doesn't change the listing */ },
  }), [userName]);

  // ── Right-panel code editor: full workspace ──────────────────────────────
  // Config / source files open in the same full editor as Electronics → Editor
  // (the reusable TextEditorWorkspace: file tree, tabs, IntelliSense, search,
  // save via Ctrl+S).
  // Provider for the embedded workspace: SubpathFS rooted at the user's drive,
  // so for regular users the workspace's `/` IS the Drive root (no extra
  // nesting). For admins we compose it under `/drive` and additionally mount
  // the full server data dir under `/server` (the same `/api/vfs` the
  // Electronics → Editor workspace exposes). RemoteFS instances are held in
  // refs so token refreshes propagate without recreating the provider (which
  // would remount the workspace and lose open tabs).
  const driveWorkspaceRemoteRef = useRef<RemoteFS | null>(null);
  const driveServerRemoteRef = useRef<RemoteFS | null>(null);
  const driveWorkspaceFs = useMemo<FileSystemProvider | null>(() => {
    if (!userName) return null;
    const remote = new RemoteFS({ baseUrl: `/api/users/${encodeURIComponent(userName)}/vfs`, token: token ?? undefined });
    driveWorkspaceRemoteRef.current = remote;
    // Whole user directory (drive/, Projects/, Electronics/, app/, …) — not just
    // the drive subfolder — so the editor can reach the user's entire space.
    const userFs = new SubpathFS(remote, `/data/Minis/Users/${userName}`) as unknown as FileSystemProvider;
    if (!isAdmin) return userFs;
    // Admin: user dir under `/user`, server data dir under `/server`.
    const serverRemote = new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined });
    driveServerRemoteRef.current = serverRemote;
    const cfs = new CompositeFS();
    cfs.mount('/user', userFs);
    cfs.mount('/server', serverRemote as unknown as FileSystemProvider);
    return cfs as unknown as FileSystemProvider;
    // token intentionally omitted — synced via the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, isAdmin]);
  useEffect(() => {
    driveWorkspaceRemoteRef.current?.setToken(token ?? undefined);
    driveServerRemoteRef.current?.setToken(token ?? undefined);
  }, [token]);
  // Project actions (Compile / Deploy / Build) inside the embedded workspace —
  // same shape Electronics → Editor passes through.
  const driveWorkspaceProjectDeps = useMemo(
    () => (userName ? { baseUrl: '', authToken: token ?? undefined, userName } : undefined),
    [userName, token],
  );
  // CommentTools plugin — embed VFS files into the active file + scan comments
  // for TODO/FIXME-style markers. Scoped to the same workspace provider.
  const commentToolsPlugin = useMemo(
    () => (driveWorkspaceFs ? createCommentToolsPlugin(driveWorkspaceFs) : null),
    [driveWorkspaceFs],
  );
  // Wgrywanie modułu WASM: wybór urządzenia i sam transfer. Hook oddaje też
  // okno wyboru, które strona wstawia niżej razem z resztą okien.
  const wasmUpload = useWasmUpload(userName);

  /**
   * Hydra Studio — pliki `.hydra` otwierają się w interfejsie zamiast
   * w zwykłym edytorze tekstu.
   *
   * Modele bierzemy wprost z Monaco, bo wtyczka nanosi zmiany przedziałami
   * tekstu: formularz i zakładka tekstowa patrzą wtedy na ten sam model,
   * a cofanie działa krok po kroku.
   *
   * Budowanie idzie przez sesję terminala (`hydraBuild.ts`) — backend nie ma
   * punktu uruchamiającego polecenia, a kanał terminala już istnieje i już jest
   * uwierzytelniany biletem. Wynik leci przy okazji strumieniem, więc panel
   * Kompilacja pokazuje postęp, a nie tylko wynik końcowy.
   *
   * Paczki i schemat zostają niepodłączone — wymagają czytania plików obok
   * projektu. Panel projektu, walidacja i biblioteka komponentów działają bez nich.
   */
  const hydraStudioPlugin = useMemo(() => createHydraStudioPlugin({
    models: {
      getModel: (uri: string) => {
        const model = monaco.editor.getModels().find((m) => m.uri.toString() === uri
          || m.uri.path === uri);
        return model ?? undefined;
      },
    },
    async runBuild(request, onLine) {
      // Treść bierzemy z modelu edytora, a nie z dysku: budujemy to, co widać
      // na ekranie, łącznie z niezapisanymi jeszcze zmianami.
      const model = monaco.editor.getModels()
        .find((m) => m.uri.path === request.file);
      const source = model?.getValue() ?? '';

      // Wiersze trafiają do panelu na bieżąco; pełny wynik i tak wraca na końcu,
      // żeby wtyczka mogła go rozebrać na podsumowanie.
      return runHydraBuild(request, userName, source, onLine);
    },

    // Moduł WebAssembly: źródła z katalogu `assembly/` obok projektu, wgrywanie
    // przez kanał `ext/script`. Bez `loadWasmSources` zakładka „Moduł WASM"
    // w ogóle się nie pojawia — i tak ma być dla projektów bez modułu.
    loadWasmSources: (projectFile: string) => loadWasmSources(userName, projectFile),
    uploadWasm: (wasm: Uint8Array) => wasmUpload.uploadWasm(wasm),
    ...(wasmUpload.deviceLabel ? { wasmDeviceLabel: wasmUpload.deviceLabel } : {}),

    /*
     * Wgranie wsadu z przeglądarki — przez Web Serial, nie przez serwer.
     *
     * `project.upload` woła `pio run -t upload` w kontenerze i trafia w port
     * **serwera**. Płytka wisi zwykle w porcie osoby przed przeglądarką,
     * więc bez tej drogi przycisk był użyteczny tylko dla tego, kto siedzi
     * przy maszynie z backendem.
     */
    async flashFromBrowser({ file, target, mcu }) {
      try {
        const files = await collectHydraFirmware({ file, target, mcu, userName, token: token ?? undefined });
        setHydraFlashFiles(files);
        setHydraFlashOpen(true);
      } catch (e) {
        setSnack({
          open: true,
          msg: e instanceof Error ? e.message : String(e),
          severity: 'error',
        });
      }
    },
  }), [userName, token, wasmUpload]);

  const driveExtraPlugins = useMemo(
    () => [
      ...(commentToolsPlugin ? [commentToolsPlugin] : []),
      hydraStudioPlugin,
    ],
    [commentToolsPlugin, hydraStudioPlugin],
  );

  /**
   * Deklaracje modułów środowiska dla IntelliSense.
   *
   * `mycastle/scene` nie ma pliku na dysku — inaczej niż `api` i `Aura`, które
   * mieszkają w `packages/core/browser/…` i TypeScript rozwiązuje je po ścieżce.
   * Skoro moduł jest wirtualny, deklarację trzeba **podać wprost**; bez tego
   * edytor nie zna nazwy `Scene` i nie podpowiada niczego.
   *
   * Idzie przez `tsPreloadDts`, a nie przez własne `setExtraLibs`: plugin
   * TypeScriptu trzyma jeden magazyn deklaracji i zewnętrzny zapis skasowałby
   * jego własne.
   */
  const driveTsPreloadDts = useCallback(
    async () => ({ '/ts-ambient/mycastle-scene.d.ts': SCENE_SCRIPT_DTS }),
    [],
  );

  // ── In-browser runner for the open .js/.ts file ──────────────────────────
  // Runs the LIVE editor buffer (the Monaco model, so unsaved edits count) in
  // the page with a redirected console. A session tracks the script's timers
  // so Stop can tear them down.
  const [browserConsole, setBrowserConsole] = useState<BrowserConsoleLine[]>([]);
  const [browserConsoleOpen, setBrowserConsoleOpen] = useState(false);
  const [browserRunning, setBrowserRunning] = useState(false);
  /** Scena wczytana przez `Scene.load` w uruchomionym skrypcie. */
  const [scenaSkryptu, setScenaSkryptu] = useState<{ scene: IScene; path: string } | null>(null);
  const browserSessionRef = useRef<{ stopped: boolean; timers: number[]; subs: Array<() => void> } | null>(null);
  // DOM mount surface for visual output — scripts push elements via `display.dom(el)`.
  const browserDomRef = useRef<HTMLDivElement | null>(null);

  // Defined early (before the AI agent / prompt-library blocks reference it).
  const toast = useCallback((msg: string, severity: 'success'|'error'|'info' = 'success') => {
    setSnack({ open: true, msg, severity });
  }, []);

  // Tear down a running browser script: stop further console output and clear
  // any timers/intervals it registered through the wrapped globals.
  const stopBrowserSession = useCallback(() => {
    const s = browserSessionRef.current;
    if (s) {
      s.stopped = true;
      for (const u of s.subs) { try { u(); } catch { /* already gone */ } }
      for (const id of s.timers) { window.clearTimeout(id); window.clearInterval(id); }
      s.subs = [];
      s.timers = [];
    }
    browserSessionRef.current = null;
    setBrowserRunning(false);
    // Host zdejmujemy razem z sesją: `Scene.load` wywołane po zatrzymaniu
    // (np. z zaległego timera) nie ma już gdzie pokazać sceny.
    setSceneHost(null);
  }, []);

  // Run the .js/.ts file currently open in the embedded workspace. Reads the
  // live Monaco model (so unsaved edits run), transpiles .ts via the TS worker,
  // then executes in an async IIFE with console/timers redirected.
  const runInBrowser = useCallback(async () => {
    if (!viewing) return;
    stopBrowserSession();
    const name = viewing.entry.name;
    const rel = cwd ? `${cwd}/${name}` : name;
    const wsPath = isAdmin ? `/user/drive/${rel}` : `/drive/${rel}`;

    // Prefer the live editor buffer; fall back to the on-open snapshot.
    let code = viewing.textContent ?? '';
    try {
      const model = monaco.editor.getModel(monaco.Uri.parse(`file://${wsPath}`));
      if (model) code = model.getValue();
    } catch { /* fall back to snapshot */ }

    setBrowserConsole([]);
    setBrowserConsoleOpen(true);
    setBrowserRunning(true);
    setScenaSkryptu(null);

    // Scena wczytana przez `Scene.load` pokazuje się w panelu nad konsolą.
    // Host żyje tak długo jak przebieg: skrypt zatrzymany nie ma prawa dosypywać
    // scen do widoku po tym, jak użytkownik go przerwał.
    setSceneHost(utworzHostaSceny({
      userName,
      authHeaders,
      present: (scene, opis) => {
        if (session.stopped) return;
        setScenaSkryptu({ scene, path: opis.path });
      },
    }));
    const session = { stopped: false, timers: [] as number[], subs: [] as Array<() => void> };
    browserSessionRef.current = session;

    const push = (level: BrowserConsoleLevel, args: unknown[]) => {
      if (session.stopped) return;
      setBrowserConsole(prev => {
        const next = [...prev, { level, text: args.map(fmtConsoleArg).join(' ') }];
        return next.length > MAX_BROWSER_CONSOLE ? next.slice(-MAX_BROWSER_CONSOLE) : next;
      });
    };
    const sandboxConsole = {
      log: (...a: unknown[]) => push('log', a),
      info: (...a: unknown[]) => push('info', a),
      warn: (...a: unknown[]) => push('warn', a),
      error: (...a: unknown[]) => push('error', a),
      debug: (...a: unknown[]) => push('debug', a),
    };
    // Wrapped timers so Stop can cancel pending callbacks — forwards ALL args
    // (incl. the variadic callback arguments) so it behaves like the real one.
    // Typed as a plain call signature (not `typeof setTimeout`) to avoid the
    // @types/node `__promisify__` requirement that `.bind()` strips.
    const wrapTimer = (orig: (handler: TimerHandler, timeout?: number, ...args: unknown[]) => number) =>
      (handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
        const id = orig(handler, timeout, ...args);
        session.timers.push(id);
        return id;
      };

    // MQTT client injected as `client` — publish (object → JSON) / subscribe
    // (msg parsed from JSON, falls back to the raw string) over MyCastle's
    // built-in connection. Subscriptions are tracked so Stop tears them down,
    // and keep the session "running" after the script body resolves.
    const client = {
      userName: currentUser?.name ?? userName,
      publish: (topic: string, payload: unknown) => {
        if (session.stopped) return;
        rawPublish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload));
      },
      subscribe: (topic: string, cb: (msg: unknown, topic: string) => void): (() => void) => {
        const unsub = rawSubscribe(topic, (raw: string) => {
          if (session.stopped) return;
          let msg: unknown = raw;
          try { msg = JSON.parse(raw); } catch { /* keep raw string */ }
          try { cb(msg, topic); } catch (err) {
            push('error', [err instanceof Error ? (err.stack ?? err.message) : String(err)]);
          }
        });
        session.subs.push(unsub);
        return () => {
          unsub();
          session.subs = session.subs.filter(u => u !== unsub);
        };
      },
    };

    try {
      if (/\.ts$/i.test(name)) {
        // TS→JS via Monaco's built-in TypeScript compiler. Its worker runs with
        // `noEmit: true` (intellisense-only) so `getEmitOutput` normally yields
        // nothing — we flip `noEmit` off just for the emit (and restore it),
        // which reuses Monaco's real compiler WITHOUT bundling `typescript`
        // (that 7 MB dependency OOMs the build). All type syntax
        // (import/declare/`as`/annotations/generics) is stripped; imports stay
        // ESNext and are handled by the import-stripping pass below.
        const tsLang = monaco.languages.typescript.typescriptDefaults;
        const prevOpts = tsLang.getCompilerOptions();
        const tmpUri = monaco.Uri.parse(`inmemory://drive-run/${rel.replace(/[^\w.]/g, '_')}.ts`);
        const tmp = monaco.editor.getModel(tmpUri) ?? monaco.editor.createModel('', 'typescript', tmpUri);
        tmp.setValue(code);
        try {
          tsLang.setCompilerOptions({ ...prevOpts, noEmit: false });
          const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
          const worker = await getWorker(tmpUri);
          // Retry — the worker recreates on the options change and re-syncs the
          // model asynchronously, so the first emit(s) may still be empty.
          let js: string | undefined;
          for (let i = 0; i < 40 && js == null && !session.stopped; i++) {
            const out = await worker.getEmitOutput(tmpUri.toString());
            js = out.outputFiles?.find(f => /\.jsx?$/.test(f.name))?.text;
            if (js == null) await new Promise(r => setTimeout(r, 50));
          }
          if (js == null) throw new Error('Transpilacja TS nie powiodła się (worker nie wyemitował JS).');
          code = js;
        } finally {
          tsLang.setCompilerOptions(prevOpts);
          tmp.dispose();
        }
      }
      if (session.stopped) return;

      // Visual output surface. `display.dom(el)` mounts a DOM node into the run
      // panel; `display.text(...)` prints to the console. Host is cleared per run.
      const domHost = browserDomRef.current;
      if (domHost) domHost.replaceChildren();
      const display = {
        dom: (el: unknown) => { if (!session.stopped && domHost && el instanceof Node) domHost.appendChild(el); },
        text: (...a: unknown[]) => push('log', a),
        clear: () => { if (domHost) domHost.replaceChildren(); setBrowserConsole([]); },
      };
      // Also expose on globalThis so scripts can grab it without a `declare`
      // (which some TS→JS transpile paths leave in place → runtime SyntaxError).
      (globalThis as Record<string, unknown>).display = display;

      // Preload the browser-Qt library so minislib Qt wrappers (`new
      // QtLineEditNode()` …) auto-create native widgets from globalThis, and
      // QtCanvas/QLineEdit/… exist. Lit (bundled) is exposed as globalThis.Lit
      // so qt.module.js reuses it instead of fetching from a CDN.
      //
      // Loaded HARD and IN ORDER (qobject → qt): `await import()` only resolves
      // after the module's top-level code (which Object.assign's the classes
      // onto globalThis) has run, so once these awaits return the globals are
      // guaranteed present. We verify afterwards and throw a clear error rather
      // than letting the script run into "QLabel is not a constructor". A cache
      // buster is used only when a global is still missing, so a previously
      // failed module fetch (cached as a rejected module record) can retry.
      const g = globalThis as Record<string, unknown>;
      const lit = await import('lit');
      g.Lit = lit;
      const qtBase = `/public/drive/users/${encodeURIComponent(currentUser?.name ?? userName)}/lit/qt`;
      /*
        Qt ładujemy tylko wtedy, gdy skrypt po nie sięga.

        Te pliki leżą w katalogu użytkownika, więc twarde ładowanie ich przed
        każdym uruchomieniem blokowało **wszystkie** skrypty każdemu, kto ich
        u siebie nie ma — łącznie z takimi, które tylko czytają scenę.
      */
      const zQt = potrzebujeQt(code);
      const loadQtModule = async (file: string, sentinel: string): Promise<void> => {
        if (g[sentinel]) return;                       // already loaded this session
        try {
          await import(/* @vite-ignore */ `${qtBase}/${file}?t=${Date.now()}`);
        } catch (err) {
          throw new Error(`Nie udało się załadować ${file} z ${qtBase} — ${err instanceof Error ? err.message : String(err)}`);
        }
        if (!g[sentinel]) throw new Error(`${file} załadowany, ale ${sentinel} nie pojawił się na globalThis`);
      };
      if (zQt) {
        await loadQtModule('qobject.module.js', 'QObject');  // must be first — qt.module.js reads globalThis.QObject/Signal
        await loadQtModule('qt.module.js', 'QtCanvas');
        // Final assertion so the script never starts with half-loaded Qt.
        for (const need of ['QObject', 'Signal', 'QWidget', 'QLabel', 'QtCanvas', 'QVBoxLayout']) {
          if (typeof g[need] !== 'function') {
            throw new Error(`Klasa Qt "${need}" niedostępna po załadowaniu — sprawdź ${qtBase}/qt.module.js`);
          }
        }
      }
      if (session.stopped) return;

      // ES `import` statements can't run inside `new Function`. Strip them and
      // bind their names from bundled modules: `@mhersztowski/minislib` (and any
      // `.../minislib/...qt/...` specifier) → the bundled minislib package (which
      // re-exports the Qt Node wrappers); `lit` → the bundled Lit. Unknown
      // modules are dropped (their symbols stay undefined).
      const minislib = await import('@mhersztowski/minislib');
      // Fasada API backendu dla skryptów przeglądarkowych Drive (conn_*/file_*/git_*).
      // Import z monorepo (Vite bundluje źródło + mqtt). Specyfikator w skrypcie:
      //   import { conn_http_connect, ... } from 'mycastle/packages/core/browser/server/api';
      const serverApi = await import('../../../../../packages/core/browser/server/api');
      // Sceny CAD/3D: `import { Scene } from 'mycastle/scene'`. Ta sama nazwa
      // modułu, co w skryptach w notatkach — skrypt przeniesiony stamtąd tutaj
      // ma działać bez przepisywania.
      const sceneNs = await import('../../modules/scene-script');
      const resolveNs = (spec: string): unknown | null =>
        spec === 'lit' ? lit
          : (spec === '@mhersztowski/minislib' || /minislib/.test(spec)) ? minislib
            : /core\/browser\/server\/api$/.test(spec) ? serverApi
              : spec === 'mycastle/scene' ? sceneNs
                : null;
      const nsMap: Record<string, unknown> = {};
      const bindings: string[] = [];
      let nsIdx = 0;
      code = code
        .replace(
          /^\s*import\s+(?:type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
          (_m: string, clauseRaw: string, spec: string) => {
            const ns = resolveNs(spec);
            if (!ns) return '';
            const key = `__m${nsIdx++}`;
            nsMap[key] = ns;
            const clause = clauseRaw.trim();
            if (clause.startsWith('{')) {
              const names = clause.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
                .filter(s => !s.startsWith('type '))
                .map(s => { const [o, a] = s.split(/\s+as\s+/).map(x => x.trim()); return a ? `${o}: ${a}` : o; });
              if (names.length) bindings.push(`const { ${names.join(', ')} } = __ns.${key};`);
            } else if (clause.startsWith('*')) {
              bindings.push(`const ${clause.replace(/\*\s*as\s*/, '').trim()} = __ns.${key};`);
            } else if (clause) {
              bindings.push(`const ${clause} = (__ns.${key}.default ?? __ns.${key});`);
            }
            return '';
          },
        )
        .replace(/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm, ''); // side-effect imports

      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'client', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', '__ns',
        `"use strict";\nreturn (async () => {\n${bindings.join('\n')}\n${code}\n})();`,
      );
      await fn(
        client,
        sandboxConsole,
        wrapTimer(window.setTimeout.bind(window)),
        wrapTimer(window.setInterval.bind(window)),
        window.clearTimeout.bind(window),
        window.clearInterval.bind(window),
        nsMap,
      );
      if (session.stopped) return;
      // Keep the session live while subscriptions / timers are pending so
      // incoming messages keep printing until the user hits Stop.
      if (session.subs.length > 0 || session.timers.length > 0) {
        push('info', ['Listening… press ⏹ Stop to end.']);
      } else {
        push('info', ['✓ done']);
        browserSessionRef.current = null;
        setBrowserRunning(false);
      }
    } catch (e) {
      push('error', [e instanceof Error ? (e.stack ?? e.message) : String(e)]);
      for (const u of session.subs) { try { u(); } catch { /* already gone */ } }
      for (const id of session.timers) { window.clearTimeout(id); window.clearInterval(id); }
      if (browserSessionRef.current === session) {
        browserSessionRef.current = null;
        setBrowserRunning(false);
      }
    }
  }, [viewing, cwd, isAdmin, currentUser, userName, rawPublish, rawSubscribe, stopBrowserSession]);

  // Stop any run when the previewed file changes or the page unmounts.
  useEffect(() => () => stopBrowserSession(), [stopBrowserSession]);
  useEffect(() => { stopBrowserSession(); setBrowserConsoleOpen(false); }, [viewing?.entry.name, stopBrowserSession]);

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
  // Cron schedules (rel → {cron, enabled}); draft fields edited in Properties.
  const [schedules, setSchedules] = useState<DriveSchedules>({});
  const [propsDraftCron, setPropsDraftCron] = useState('');
  const [propsDraftCronEnabled, setPropsDraftCronEnabled] = useState(false);
  const [propsDraftStartup, setPropsDraftStartup] = useState(false);

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
  // Run-on-backend console state (Drive → Run). Declared here so panelOpen below
  // can include it; the run/stop handlers live near closeRightPanel.
  const [running, setRunning] = useState<{ rel: string; output: string; status: 'running' | 'done' | 'error'; kind: 'run' | 'install'; target: string } | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  // Read-only log viewer (Drive → Logs). Shows drive/.logs/{rel}.log content.
  const [logsView, setLogsView] = useState<{ rel: string; content: string } | null>(null);
  const panelOpen = !!(viewing || repoViewing || dashEditing || jsonFormEditing || mdEditing || mjdEditing || globalEditing || qtuiEditing || running || logsView);

  // Exactly ONE right-side panel may be open at a time. Every opener calls this
  // first, so a new panel never renders stacked next to a stale one (the bug
  // where two panels showed side by side). Aborts any in-flight run stream too.
  // Does NOT touch panelFullscreen — closeRightPanel handles that on close.
  const resetPanels = useCallback(() => {
    setViewing(null);
    setRepoViewing(null);
    setDashEditing(null);
    setJsonFormEditing(null);
    setReturnToMd(null);
    setMdEditing(null);
    setMjdEditing(null);
    setGlobalEditing(null);
    setQtuiEditing(null);
    runAbortRef.current?.abort();
    setRunning(null);
    setLogsView(null);
  }, []);

  // The editor/preview panel now opens inline on every screen size. On a phone
  // it takes over the whole viewport (the file list hides while it is open).
  const showRightPanel = panelOpen;
  const showSidebar = !((isWide && panelFullscreen) || (!isWide && panelOpen));
  const showAgent = isWide && agentOpen;

  // ── Initial mkdir + refresh ─────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    const requested = cwd; // snapshot — odrzuć wynik, jeśli cwd zmienił się w międzyczasie
    try {
      // Make sure /drive/ exists at all — first-time users won't have it.
      if (cwd === '') {
        await vfsMkdir(userName, '').catch(() => {/* already exists */});
      }
      const list = await vfsListDir(userName, cwd);
      // Guard przeciw wyścigowi: nie nadpisuj listy, jeśli użytkownik jest już w innym katalogu.
      if (cwdRef.current === requested) setEntries(list);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      if (cwdRef.current === requested) setLoading(false);
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
    loadSchedules(userName)
      .then((s) => { if (!cancelled) setSchedules(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userName, fpLoaded]);

  // Persist collapsed state per-device.
  useEffect(() => {
    try { localStorage.setItem('drive_favs_open', favoritesOpen ? '1' : '0'); } catch { /* private mode */ }
  }, [favoritesOpen]);

  const isFavorite = useCallback((rel: string) => favorites.has(rel), [favorites]);

  // Toggle ulubionego po pełnej ścieżce (nie zależy od cwd) — używane w okienku Ulubione.
  const toggleFavoritePath = useCallback((rel: string, name: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) { next.delete(rel); toast(`Usunięto z ulubionych: ${name}`, 'info'); }
      else { next.add(rel); toast(`Dodano do ulubionych: ${name}`); }
      return next;
    });
  }, [toast]);

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
    const sched = schedules[rel];
    setPropsDraftCron(sched?.cron ?? '');
    setPropsDraftCronEnabled(sched?.enabled ?? false);
    setPropsDraftStartup(sched?.runAtStartup ?? false);
  }, [cwd, fileProperties.tags, schedules]);

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
      // Schedule (only for runnable JS files). Empty cron = remove the entry.
      if (isRunnable(propsDialog.entry.name)) {
        const nextSched: DriveSchedules = { ...schedules };
        const cronStr = propsDraftCron.trim();
        if (cronStr || propsDraftStartup) {
          nextSched[propsDialog.rel] = { cron: cronStr, enabled: propsDraftCronEnabled, runAtStartup: propsDraftStartup };
        } else {
          delete nextSched[propsDialog.rel];
        }
        setSchedules(nextSched);
        await saveSchedules(userName, nextSched);
      }
      toast(`Zapisano właściwości: ${propsDialog.entry.name}`);
      setPropsDialog(null);
    } catch (err) {
      toast(`Nie udało się zapisać właściwości: ${(err as Error).message}`, 'error');
    }
  }, [propsDialog, propsDraftTags, fileProperties, userName, toast, schedules, propsDraftCron, propsDraftCronEnabled, propsDraftStartup]);

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
      toast(`Ulubiony element już nie istnieje: ${rel} — usuń z listy`, 'error');
      return;
    }
    // Katalog w ulubionych → po prostu wejdź do niego (nie otwieraj jako plik).
    if (exists.type === DIR_TYPE) {
      resetPanels();
      setCwd(rel);
      return;
    }
    setCwd(folder);
    const entry: VfsEntry = { name: fileName, type: FILE_TYPE };
    if (isMySchemaJson(fileName)) {
      openGlobalEditor(entry, rel);
    } else if (isMjdEditable(fileName)) {
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
        resetPanels();
        setViewing({ entry, mime, dataB64: data, textContent });
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    }
  }, [userName, toast, resetPanels]);

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
  // Open a `.json` file in the graphical schema form editor (right panel).
  // Declared before onOpen so onOpen can reference it without a TDZ cycle.
  const openJsonForm = useCallback((entry: VfsEntry, relOverride?: string) => {
    const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
    resetPanels();
    setJsonFormEditing({ entry, rel });
  }, [cwd, resetPanels]);

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
    if (isMySchemaJson(entry.name)) {
      openGlobalEditor(entry);
      return;
    }
    if (isMjdEditable(entry.name)) {
      openInMjdEditor(entry);
      return;
    }
    if (isMdEditable(entry.name)) {
      void openInMdEditorRef.current(entry);
      return;
    }
    // `*.dash.json` → Dash scene editor (3-pane: Types | Scene | ReactFlow UML)
    if (entry.name.endsWith('.dash.json')) {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      resetPanels();
      setDashEditing({ entry, path: rel });
      return;
    }
    // `*.repo.json` (np. `.repo.json` lub `pubsub.repo.json`) → panel git
    // (gałąź/tag, pull/push, clone). Dla `{nazwa}.repo.json` repo klonowane jest
    // do podkatalogu `{nazwa}` (logika po stronie backendu).
    if (entry.name.endsWith('.repo.json')) {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      resetPanels();
      setRepoViewing({ entry, path: rel });
      return;
    }
    // `*.qtui.json` → MinisQt UI scene designer in the right panel (no WASM).
    if (entry.name.endsWith('.qtui.json')) {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      resetPanels();
      setQtuiEditing({ entry, rel });
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
        // `.json` with a drive-relative `$schema` binding → graphical form editor.
        if (textContent !== undefined && /\.json$/i.test(entry.name)) {
          try {
            if (schemaRefOf(JSON.parse(textContent)) !== null) { openJsonForm(entry, rel); return; }
          } catch { /* not valid JSON — fall through to text editor */ }
        }
        resetPanels();
        setViewing({ entry, mime, dataB64: data, textContent });
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    })();
  }, [userName, cwd, toast, resetPanels, openJsonForm]);

  const onDownload = useCallback(async (entry: VfsEntry) => {
    try {
      await downloadFile(userName, cwd ? `${cwd}/${entry.name}` : entry.name, entry.name);
    } catch (err) { toast((err as Error).message, 'error'); }
  }, [userName, cwd, toast]);

  // Nazwa pakowanego katalogu (≠ null ⇒ pokazujemy overlay ze spinnerem).
  const [zipping, setZipping] = useState<string | null>(null);

  // „Pobierz ZIP" dla katalogu: rekurencyjnie obchodzi drzewo przez VFS, czyta pliki
  // (base64) i pakuje JSZipem po stronie przeglądarki, a potem pobiera archiwum.
  const downloadFolderZip = useCallback(async (entry: VfsEntry) => {
    const baseRel = cwd ? `${cwd}/${entry.name}` : entry.name;
    setZipping(entry.name);
    try {
      const zip = new JSZip();
      let files = 0;
      const queue: string[] = [baseRel];
      while (queue.length) {
        const dir = queue.shift()!;
        let entries: VfsEntry[] = [];
        try { entries = await vfsListDir(userName, dir); } catch { continue; }
        for (const e of entries) {
          const rel = `${dir}/${e.name}`;
          if (e.type === DIR_TYPE) { queue.push(rel); continue; }
          const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
          if (!r.ok) continue;
          const j = await r.json() as { data?: string };
          if (j.data == null) continue;
          // Ścieżka w archiwum: katalog jest korzeniem zipa (`<nazwa>/…`).
          const inZip = `${entry.name}/${rel.slice(baseRel.length + 1)}`;
          zip.file(inZip, j.data, { base64: true });
          files++;
        }
      }
      if (files === 0) { toast('Katalog jest pusty — nic do spakowania', 'info'); return; }
      const blob = await zip.generateAsync({
        type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 },
      });
      triggerDownload(blob, `${entry.name}.zip`);
      toast(`Pobrano ZIP: ${entry.name} (${files} plików)`, 'success');
    } catch (err) {
      toast(`Pakowanie ZIP nieudane: ${(err as Error).message}`, 'error');
    } finally {
      setZipping(null);
    }
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
      toast('Plik jest już w katalogu publicznym', 'info');
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
      toast(`Plik nie jest publiczny — publiczne są: ${OPIS_PUBLICZNYCH}`, 'error');
      return;
    }
    const url = publicUrl(userName, rel);
    const ok = await copyTextToClipboard(url);
    if (ok) toast('Link skopiowany do schowka');
    else prompt('Skopiuj link ręcznie:', url); // last resort if even execCommand is blocked
  }, [userName, cwd, toast]);

  // ── View / Open / Create ────────────────────────────────────────────────

  const viewFile = useCallback(async (entry: VfsEntry, relOverride?: string) => {
    if (entry.type !== FILE_TYPE) return;
    try {
      const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const mime = guessMime(entry.name);
      const data = json.data ?? '';
      // Decode UTF-8 for both proper text MIMEs and recognised code-file
      // extensions (Monaco gets to highlight either way). Binary content
      // stays as base64 — we render via data: URLs (img/iframe/audio/video).
      const textContent = isEditableTextFile(entry.name, mime) ? base64ToText(data) : undefined;
      resetPanels();
      setViewing({ entry, mime, dataB64: data, textContent });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, toast, resetPanels]);

  // Write (or clear) the `$schema` binding on a json file, then re-open it in
  // the form editor (bind) or as text (unbind). Used by the "Zmień schema" dialog.
  const applySchemaBinding = useCallback(async (rel: string, entry: VfsEntry, schemaRel: string | null) => {
    try {
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const j = await r.json() as { data?: string };
      const parsed = JSON.parse(base64ToText(j.data ?? 'null')) ?? {};
      const body: Record<string, unknown> = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        ? parsed as Record<string, unknown> : { value: parsed };
      const { $schema: _drop, ...rest } = body;
      const next = schemaRel ? { $schema: schemaRel, ...rest } : rest;
      await vfsWriteFile(userName, rel, textToBase64(JSON.stringify(next, null, 2) + '\n'));
      setSchemaDialog(null);
      if (schemaRel) openJsonForm(entry, rel);
      else void viewFile(entry, rel);   // unbound → back to text editor
      toast(schemaRel ? 'Zapisano schemat w pliku' : 'Usunięto powiązanie ze schematem');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [userName, openJsonForm, viewFile, toast]);

  // Open the "Zmień schema" dialog, pre-selecting the file's current binding.
  const openSchemaDialog = useCallback(async (entry: VfsEntry, rel: string) => {
    let current: string | null = null;
    try {
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (r.ok) { const j = await r.json() as { data?: string }; current = schemaRefOf(JSON.parse(base64ToText(j.data ?? 'null'))); }
    } catch { /* new/invalid file — no current binding */ }
    setSchemaDialog({ rel, entry, current });
  }, [userName]);

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
    // Open inline in the right panel on all screen sizes (mobile shows it full-screen).
    try {
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const content = base64ToText(json.data ?? '');
      resetPanels();             // swap to editor — exactly one panel open
      setMdEditing({ entry, rel, initialContent: content, saving: false });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, isWide, toast, resetPanels, navigate]);

  // Open a markdown file that lives OUTSIDE the drive subtree (user-root-relative,
  // e.g. a Notes file `md/rome.md` → `/data/Minis/Users/{u}/md/rome.md`) in the
  // same right-hand editor panel. Mirrors `openInMdEditor` but reads/writes the
  // absolute user-root path instead of the drive-scoped one.
  const openPimMdInPanel = useCallback(async (pimRel: string) => {
    const name = pimRel.split('/').pop() as string;
    const fullPath = `/data/Minis/Users/${userName}/${pimRel}`;
    // Open inline in the right panel on all screen sizes (mobile shows it full-screen).
    try {
      const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readFile`, window.location.origin);
      u.searchParams.set('path', fullPath);
      const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const content = base64ToText(json.data ?? '');
      resetPanels();
      setMdEditing({ entry: { name, type: FILE_TYPE }, rel: pimRel, pimRel, initialContent: content, saving: false });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, isWide, toast, resetPanels, navigate]);

  // Clicking a link inside the Drive markdown editor ("Open in editor"): open the
  // TARGET in this same right-hand editor panel (stay in Drive) instead of
  // navigating away. Internal hrefs resolve under `/user/{u}/pim/…`:
  //   • `drive/notatka.md` → drive-relative  → openInMdEditor
  //   • `md/rome.md`        → user-root file  → openPimMdInPanel
  const handleMdLinkClick = useCallback((href: string, opts?: { fromFileRef?: boolean }) => {
    // Capture the markdown we're leaving BEFORE the opener resets panels, so a
    // File-component click can offer a "← back to markdown" button afterwards.
    const backSrc = opts?.fromFileRef && mdEditing
      ? { rel: mdEditing.rel, pimRel: mdEditing.pimRel, label: mdEditing.entry.name }
      : null;
    const applyBack = () => { if (backSrc) setReturnToMd(backSrc); };
    let pathname = href;
    try {
      const u = new URL(href, window.location.href);
      if (u.origin !== window.location.origin) {
        window.open(href, '_blank', 'noopener,noreferrer');   // external → new tab
        return;
      }
      pathname = u.pathname;
    } catch { /* unparseable — treat href as a bare path */ }
    const anyFile = pathname.replace(/^\/+/, '').match(/^user\/[^/]+\/pim\/(.+)$/i);
    if (!anyFile) {
      window.open(pathname, '_self');   // not a pim path → default navigation
      return;
    }
    const pimRel = decodeURIComponent(anyFile[1]);
    const isMd = /\.md$/i.test(pimRel);
    const isDrive = /^drive\//i.test(pimRel);
    // Openers reset panels asynchronously (after their fetch), which clears
    // returnToMd — so set it AFTER they finish, via `.then(applyBack)`.
    if (isMd && isDrive) {
      const rel = pimRel.replace(/^drive\//i, '');
      void openInMdEditor({ name: rel.split('/').pop() as string, type: FILE_TYPE }, rel).then(applyBack);
    } else if (isMd) {
      void openPimMdInPanel(pimRel).then(applyBack);
    } else if (isDrive) {
      // Non-markdown drive file → open it in the panel like activating it in Drive.
      const rel = pimRel.replace(/^drive\//i, '');
      void viewFile({ name: rel.split('/').pop() as string, type: FILE_TYPE }, rel).then(applyBack);
    } else {
      window.open(pathname, '_self');
    }
  }, [openInMdEditor, openPimMdInPanel, viewFile, mdEditing]);

  // "← back to markdown" — reopen the markdown doc the File component was in.
  const goBackToMd = useCallback(() => {
    if (!returnToMd) return;
    const { rel, pimRel } = returnToMd;
    setReturnToMd(null);
    if (pimRel) void openPimMdInPanel(pimRel);
    else void openInMdEditor({ name: rel.split('/').pop() as string, type: FILE_TYPE }, rel);
  }, [returnToMd, openInMdEditor, openPimMdInPanel]);

  // Deep-link: `/user/{u}/pim/drive?open=<drive-rel>.md` opens that file straight
  // in the right-hand markdown editor. Used by "Open in editor" clicked from the
  // full-page /editor/md/… view so it lands in Drive with the file open. The
  // param is cleared afterwards so it doesn't re-open on later navigation.
  useEffect(() => {
    // `?cwd=<katalog>` (np. z widgetu „Ulubione" na Pulpicie dla katalogu) → wejdź do niego.
    const cwdParam = searchParams.get('cwd');
    if (cwdParam != null) {
      setCwd(cwdParam);
      const next = new URLSearchParams(searchParams);
      next.delete('cwd');
      setSearchParams(next, { replace: true });
      return;
    }
    const openRel = searchParams.get('open');
    if (!openRel) return;
    // `?fullscreen=1` (np. z widgetu „Ulubione" na Pulpicie) otwiera plik
    // z panelem po prawej rozwiniętym na cały ekran (lista plików ukryta).
    if (searchParams.get('fullscreen') === '1') setPanelFullscreen(true);
    void openInMdEditor({ name: openRel.split('/').pop() as string, type: FILE_TYPE }, openRel);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    next.delete('fullscreen');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    resetPanels();
    setMjdEditing({ entry, rel, mjdPath, dataPath, mode });
  }, [cwd, driveToFullPath, userName, resetPanels]);

  // Open a *.myschema.json in the graphical schema/.d.ts editor (right panel).
  const openGlobalEditor = useCallback((entry: VfsEntry, relOverride?: string) => {
    const rel = relOverride ?? (cwd ? `${cwd}/${entry.name}` : entry.name);
    const path = driveToFullPath(rel);
    resetPanels();
    setGlobalEditing({ entry, rel, path });
  }, [cwd, driveToFullPath, resetPanels]);

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
      resetPanels();
      setViewing({ entry, mime, dataB64: data, textContent });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, toast, resetPanels]);

  const openDashAsRawSource = useCallback(async (entry: VfsEntry) => {
    try {
      const rel = cwd ? `${cwd}/${entry.name}` : entry.name;
      const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`readFile failed: ${r.status}`);
      const json = await r.json() as { data?: string };
      const data = json.data ?? '';
      resetPanels();
      setViewing({ entry, mime: 'application/json', dataB64: data, textContent: base64ToText(data) });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, [userName, cwd, toast, resetPanels]);

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
      if (snapshot.pimRel) {
        // File outside drive — write to its absolute user-root path.
        const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/writeFile`, window.location.origin);
        u.searchParams.set('path', `/data/Minis/Users/${userName}/${snapshot.pimRel}`);
        const r = await fetch(u.pathname + u.search, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ data: textToBase64(markdown), options: { create: true, overwrite: true } }),
        });
        if (!r.ok) throw new Error(`writeFile failed: ${r.status}`);
      } else {
        await vfsWriteFile(userName, snapshot.rel, textToBase64(markdown));
      }
      toast(`Zapisano "${snapshot.entry.name}"`, 'success');
    } catch (err) {
      toast(`Nie zapisano: ${(err as Error).message}`, 'error');
    } finally {
      setMdEditing((prev) => prev ? { ...prev, saving: false } : null);
    }
  }, [mdEditing, userName, toast]);

  // Wczytaj ustawienia widoku markdown (raz na usera).
  useEffect(() => { void loadMdViewSettingsMap(userName).then(setMdViewMap); }, [userName]);
  // Klucz aktywnego pliku md = dokładnie ta ścieżka, którą dostaje MdEditor (filePath).
  const mdFileKey = mdEditing ? (mdEditing.pimRel ?? `drive/${mdEditing.rel}`) : '';
  const mdView = (mdFileKey ? mdViewMap[mdFileKey] : undefined) ?? {};
  const setMdSetting = useCallback((patch: Partial<MdViewEntry>) => {
    if (!mdFileKey) return;
    setMdViewMap((prev) => {
      const next: MdViewMap = { ...prev, [mdFileKey]: { ...prev[mdFileKey], ...patch } };
      void saveMdViewSettingsMap(userName, next).catch(() => {});
      return next;
    });
  }, [mdFileKey, userName]);

  // ── Import markdown (czysty / Notion) z pliku lokalnego → nowy plik w bieżącym katalogu ──
  const mdImportInputRef = useRef<HTMLInputElement | null>(null);
  const mdImportKindRef = useRef<'plain' | 'notion'>('plain');
  const triggerMdImport = useCallback((kind: 'plain' | 'notion') => {
    mdImportKindRef.current = kind;
    setMdSettingsAnchor(null);
    mdImportInputRef.current?.click();
  }, []);
  const onMdImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const notion = mdImportKindRef.current === 'notion';
    try {
      if (/\.zip$/i.test(file.name)) {
        // Notion .zip: główna strona (.md) + folder z zasobami. Wgrywamy zasoby do
        // `{stem}-assets/`, główną + podstrony jako pliki .md, przepisujemy linki obrazów.
        const zip = await JSZip.loadAsync(file);
        const files = Object.values(zip.files).filter((f) => !f.dir);
        const mdFiles = files.filter((f) => /\.md$/i.test(f.name));
        const assetFiles = files.filter((f) => !/\.md$/i.test(f.name));
        if (mdFiles.length === 0) { toast('Brak plików .md w archiwum', 'error'); return; }
        const main = mdFiles.slice().sort((a, b) =>
          a.name.split('/').length - b.name.split('/').length || a.name.length - b.name.length)[0];
        const stem = sanitizeFileName(stripNotionHash(decodeURIComponent(main.name.split('/').pop()!.replace(/\.md$/i, ''))));
        const assetsRel = cwd ? `${cwd}/${stem}-assets` : `${stem}-assets`;
        const assetBases = new Set<string>();
        for (const a of assetFiles) {
          const b64 = await a.async('base64');
          const newBase = sanitizeFileName(stripNotionHash(decodeURIComponent(a.name.split('/').pop()!)));
          assetBases.add(newBase);
          await vfsWriteFile(userName, `${assetsRel}/${newBase}`, b64);
        }
        const rewriteAssets = (md: string) => md.replace(/\]\(([^)]+\.(?:png|jpe?g|gif|svg|webp|bmp|avif|ico|pdf))(?:#[^)]*)?\)/gi, (m, p: string) => {
          const base = sanitizeFileName(stripNotionHash(decodeURIComponent(p.split('/').pop()!)));
          return assetBases.has(base) ? `](${stem}-assets/${base})` : m;
        });
        let mainRel = '';
        for (const md of mdFiles) {
          const clean = rewriteAssets(cleanNotionMarkdown(await md.async('string')));
          const nm = sanitizeFileName(stripNotionHash(decodeURIComponent(md.name.split('/').pop()!.replace(/\.md$/i, ''))));
          const rel = cwd ? `${cwd}/${nm}.md` : `${nm}.md`;
          await vfsWriteFile(userName, rel, textToBase64(clean));
          if (md === main) mainRel = rel;
        }
        await refresh();
        toast(`Zaimportowano z Notion: ${mdFiles.length} stron, ${assetFiles.length} plików`, 'success');
        if (mainRel) void openInMdEditor({ name: `${stem}.md`, type: FILE_TYPE }, mainRel);
        return;
      }
      // Zwykły plik .md/.txt
      let text = await file.text();
      let nameStem = file.name.replace(/\.(md|markdown|txt)$/i, '');
      if (notion) { text = cleanNotionMarkdown(text); nameStem = nameStem.replace(/ [0-9a-f]{32}$/i, ''); }
      const stem = sanitizeFileName(nameStem);
      const rel = cwd ? `${cwd}/${stem}.md` : `${stem}.md`;
      await vfsWriteFile(userName, rel, textToBase64(text));
      await refresh();
      toast(`Zaimportowano: ${stem}.md`, 'success');
      void openInMdEditor({ name: `${stem}.md`, type: FILE_TYPE }, rel);
    } catch (err) {
      toast(`Import nieudany: ${(err as Error).message}`, 'error');
    }
  }, [cwd, userName, toast, refresh, openInMdEditor]);

  // ── Eksport bieżącego dokumentu do czystego .md (bez rozszerzeń MyCastle) ──
  const exportCleanMd = useCallback(async () => {
    if (!mdEditing) return;
    setMdSettingsAnchor(null);
    try {
      const rel = mdEditing.rel;
      const r = await fetch(mdEditing.pimRel
        ? `/api/users/${encodeURIComponent(userName)}/vfs/readFile?path=${encodeURIComponent(`/data/Minis/Users/${userName}/${mdEditing.pimRel}`)}`
        : apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { data?: string };
      const src = j.data ? base64ToText(j.data) : '';
      const clean = stripMdExtensions(src);
      const stem = mdEditing.entry.name.replace(/\.md$/i, '');
      triggerDownload(new Blob([clean], { type: 'text/markdown' }), `${stem}-clean.md`);
      toast('Wyeksportowano czysty markdown', 'success');
    } catch (err) { toast(`Eksport nieudany: ${(err as Error).message}`, 'error'); }
  }, [mdEditing, userName, toast]);

  // ── Eksport do zip: bieżąca strona + strony/zasoby linkowane w VFS (bieżący kat./podkat.) ──
  const exportZip = useCallback(async (clean: boolean) => {
    if (!mdEditing || mdEditing.pimRel) { toast('Eksport zip dostępny dla plików w drive/', 'info'); setMdSettingsAnchor(null); return; }
    setMdSettingsAnchor(null);
    try {
      const startRel = mdEditing.rel;
      const baseDir = dirOf(startRel);
      const readText = async (rel: string): Promise<string | null> => {
        const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
        if (!r.ok) return null;
        const j = await r.json() as { data?: string };
        return j.data ? base64ToText(j.data) : '';
      };
      const readB64 = async (rel: string): Promise<string | null> => {
        const r = await fetch(apiUrl(userName, 'readFile', rel), { headers: authHeaders() });
        if (!r.ok) return null;
        const j = await r.json() as { data?: string };
        return j.data ?? null;
      };
      const visited = new Set<string>();
      const assets = new Set<string>();
      const queue = [startRel];
      const pageContent = new Map<string, string>();
      while (queue.length) {
        const rel = queue.shift()!;
        if (visited.has(rel) || !isWithin(baseDir, rel)) continue;
        visited.add(rel);
        const md = await readText(rel);
        if (md == null) continue;
        pageContent.set(rel, md);
        const { pages, assets: as } = extractMdLinks(md);
        const fromDir = dirOf(rel);
        for (const p of pages) { const t = resolveRelPath(fromDir, p); if (t && isWithin(baseDir, t) && !visited.has(t)) queue.push(t); }
        for (const a of as) { const t = resolveRelPath(fromDir, a); if (t && isWithin(baseDir, t)) assets.add(t); }
      }
      const zip = new JSZip();
      const zipPath = (rel: string) => (baseDir ? rel.slice(baseDir.length + 1) : rel);
      for (const [rel, md] of pageContent) zip.file(zipPath(rel), clean ? stripMdExtensions(md) : md);
      for (const a of assets) { const b64 = await readB64(a); if (b64) zip.file(zipPath(a), b64, { base64: true }); }
      const blob = await zip.generateAsync({ type: 'blob' });
      const stem = mdEditing.entry.name.replace(/\.md$/i, '');
      triggerDownload(blob, `${stem}-export${clean ? '-clean' : ''}.zip`);
      toast(`Wyeksportowano zip: ${pageContent.size} stron, ${assets.size} zasobów`, 'success');
    } catch (err) { toast(`Eksport zip nieudany: ${(err as Error).message}`, 'error'); }
  }, [mdEditing, userName, toast]);

  const closeRightPanel = useCallback(() => {
    resetPanels();
    setPanelFullscreen(false);
  }, [resetPanels]);

  const openLogs = useCallback(async (rel: string) => {
    resetPanels();
    setLogsView({ rel, content: '…' });
    try {
      const r = await fetch(apiUrl(userName, 'readFile', `.logs/${rel}.log`), { headers: authHeaders() });
      if (r.status === 404) { setLogsView({ rel, content: '(brak logów — uruchom skrypt albo poczekaj na cron)' }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as { data?: string };
      const content = j.data ? decodeURIComponent(escape(atob(j.data))) : '(pusty log)';
      setLogsView({ rel, content });
    } catch (err) {
      setLogsView({ rel, content: `[błąd odczytu logów] ${(err as Error).message}` });
    }
  }, [userName, resetPanels]);

  const clearLogs = useCallback(async (rel: string) => {
    try {
      await vfsWriteFile(userName, `.logs/${rel}.log`, ''); // empty file = cleared
      setLogsView(prev => (prev && prev.rel === rel ? { ...prev, content: '(wyczyszczono)' } : prev));
      toast('Wyczyszczono logi');
    } catch (err) {
      toast(`Nie udało się wyczyścić logów: ${(err as Error).message}`, 'error');
    }
  }, [userName, toast]);

  const stopScript = useCallback(() => {
    runAbortRef.current?.abort();
    setRunning(prev => (prev && prev.status === 'running' ? { ...prev, status: 'error' } : prev));
  }, []);

  // Generic SSE → console streamer. Shared by Run (node {file}) and npm install
  // (both stream the same `output`/`done` SSE events into the right-panel console).
  const streamConsole = useCallback(async (url: string, meta: { rel: string; kind: 'run' | 'install'; target: string }) => {
    resetPanels();                       // close any other panel + abort prior run
    const ctrl = new AbortController();
    runAbortRef.current = ctrl;
    setRunning({ ...meta, output: '', status: 'running' });
    try {
      const resp = await fetch(url, { headers: { Accept: 'text/event-stream', ...authHeaders() }, signal: ctrl.signal });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        setRunning({ ...meta, output: text || `HTTP ${resp.status}`, status: 'error' });
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const m = part.match(/^event: (\w+)\ndata: (.+)$/s);
          if (!m) continue;
          const [, ev, raw] = m;
          try {
            const data = JSON.parse(raw) as { chunk?: string; success?: boolean };
            if (ev === 'output') {
              setRunning(prev => (prev ? { ...prev, output: prev.output + (data.chunk ?? '') } : prev));
            } else if (ev === 'done') {
              setRunning(prev => (prev ? { ...prev, status: data.success ? 'done' : 'error' } : prev));
            }
          } catch { /* ignore malformed SSE */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setRunning(prev => (prev ? { ...prev, output: prev.output + `\n[błąd] ${(err as Error).message}\n`, status: 'error' } : prev));
    }
  }, [resetPanels]);

  const runScript = useCallback((rel: string) => streamConsole(
    `/api/users/${encodeURIComponent(userName)}/drive/run-script?path=${encodeURIComponent(rel)}`,
    { rel, kind: 'run', target: rel },
  ), [streamConsole, userName]);

  // Restart a background script: kills the running instance and starts the
  // freshly-edited (re-transpiled) version, then shows its log.
  const restartScript = useCallback(async (rel: string) => {
    try {
      const r = await fetch(
        `/api/users/${encodeURIComponent(userName)}/drive/restart-script?path=${encodeURIComponent(rel)}`,
        { method: 'POST', headers: authHeaders() },
      );
      const j = await r.json().catch(() => ({} as { ok?: boolean; error?: string }));
      if (r.ok && j.ok) {
        void openLogs(rel); // panel has a Refresh button for the fresh output
      } else {
        resetPanels();
        setLogsView({ rel, content: `Restart nie powiódł się: ${j.error ?? `HTTP ${r.status}`}` });
      }
    } catch (e) {
      resetPanels();
      setLogsView({ rel, content: `Restart nie powiódł się: ${(e as Error).message}` });
    }
  }, [userName, openLogs, resetPanels]);

  // Run `npm install` for a drive directory (the one holding package.json).
  // dirRel is relative to the drive root ('' = drive root). Reuses the existing
  // nodejs/run endpoint (subpath relative to the user home → `drive/{dirRel}`).
  const runNpmInstall = useCallback((dirRel: string) => streamConsole(
    `/api/users/${encodeURIComponent(userName)}/nodejs/run?subpath=${encodeURIComponent(dirRel ? `drive/${dirRel}` : 'drive')}&script=install`,
    { rel: `npm install · ${dirRel || '(drive)'}`, kind: 'install', target: dirRel },
  ), [streamConsole, userName]);

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
    const ok = await copyTextToClipboard(viewing.textContent);
    if (ok) toast('Skopiowano cały tekst do schowka');
    else toast('Nie udało się skopiować — zaznacz tekst i użyj ⌘C', 'error');
  }, [viewing, toast]);

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
  // Drive-relative path of the file currently previewed (used as the workspace
  // open target — the workspace's `/` is the Drive root via SubpathFS).
  const viewingRel = viewing ? (cwd ? `${cwd}/${viewing.entry.name}` : viewing.entry.name) : '';

  const viewerBody = viewing && (
    viewing.textContent !== undefined && driveWorkspaceFs ? (
      // Full editor — same component as Electronics → Editor. The workspace
      // owns loading/saving (Ctrl+S → VFS), IntelliSense, tabs and search;
      // `initialPath` opens the clicked file. Keyed by user so switching
      // files reuses the same workspace (new tabs) instead of remounting.
      <TextEditorWorkspace
        key={`drive-ws-${userName}-${isAdmin ? 'admin' : 'user'}`}
        provider={driveWorkspaceFs}
        initialPath={isAdmin ? `/user/drive/${viewingRel}` : `/drive/${viewingRel}`}
        projectDeps={driveWorkspaceProjectDeps}
        extraPlugins={driveExtraPlugins}
        tsPreloadDts={driveTsPreloadDts}
      />
    ) : isImageMime(viewing.mime) ? (
      <Box sx={{ textAlign: 'center', p: 2, height: '100%', overflow: 'auto' }}>
        <img
          src={`data:${viewing.mime};base64,${viewing.dataB64}`}
          alt={viewing.entry.name}
          style={{ maxWidth: '100%', maxHeight: 'calc(100% - 16px)' }}
        />
      </Box>
    ) : isPdfMime(viewing.mime) ? (
      <DocPreview userName={userName} filePath={viewingRel} kind="pdf" />
    ) : isDjvuMime(viewing.mime) ? (
      <DocPreview userName={userName} filePath={viewingRel} kind="djvu" />
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
        {/* Main nav + account — only as a full route (Global window has no params.userName) */}
        {params.userName && (
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1.5, px: 0.25, mr: 0.5 }}>
            <Tooltip title="Menu główne"><IconButton size="small" onClick={openNav}><MenuIcon /></IconButton></Tooltip>
            <AccountMenu isAdminView={false} userName={userName} />
          </Box>
        )}
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
                    icon={fileName.includes('.') ? <InsertDriveFileIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
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
                    onContextMenu={(ev) => {
                      // Prawy przycisk myszy (desktop) otwiera to samo menu co kebab (⋮),
                      // zakotwiczone w pozycji kursora (anchorPosition).
                      ev.preventDefault();
                      setMenuFor({ anchor: null, entry: e, pos: { top: ev.clientY, left: ev.clientX } });
                    }}
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
                        {isFavorite(rel) && (
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
            {returnToMd && (
              <Tooltip title={`Wróć do dokumentu markdown: ${returnToMd.label}`}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArrowBackIcon fontSize="small" />}
                  onClick={goBackToMd}
                  sx={{ mr: 0.5, flexShrink: 0, maxWidth: 220, textTransform: 'none', '& .MuiButton-startIcon': { mr: 0.5 } }}
                >
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {returnToMd.label}
                  </Box>
                </Button>
              </Tooltip>
            )}
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
            {running ? <CodeIcon fontSize="small" /> : logsView ? <SubjectIcon fontSize="small" /> : viewing ? <VisibilityIcon fontSize="small" /> : <EditNoteIcon fontSize="small" />}
            <Typography variant="subtitle1" sx={{
              flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {running?.rel ?? (logsView ? `${logsView.rel} · logi` : undefined) ?? viewing?.entry.name ?? repoViewing?.entry.name ?? jsonFormEditing?.entry.name ?? mdEditing?.entry.name ?? mjdEditing?.entry.name ?? globalEditing?.entry.name}
              {jsonFormEditing && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  · formularz
                </Typography>
              )}
              {mjdEditing && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  · {mjdEditing.mode === 'def' ? 'schemat MJD' : 'dane MJD'}
                </Typography>
              )}
              {globalEditing && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  · schema
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
            {/* Run the open .js/.ts file in the browser (live editor buffer) +
                console panel toggle. */}
            {viewing && viewing.textContent !== undefined && isBrowserRunnable(viewing.entry.name) && (
              <>
                <Tooltip title={browserRunning ? 'Zatrzymaj' : 'Uruchom w przeglądarce'}>
                  <span>
                    <IconButton
                      size="small"
                      color={browserRunning ? 'error' : 'success'}
                      onClick={() => browserRunning ? stopBrowserSession() : void runInBrowser()}
                    >
                      {browserRunning ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={browserConsoleOpen ? 'Ukryj konsolę' : 'Pokaż konsolę'}>
                  <IconButton
                    size="small"
                    color={browserConsoleOpen ? 'primary' : 'default'}
                    onClick={() => setBrowserConsoleOpen(o => !o)}
                  >
                    <TerminalIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
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
              <Tooltip title="Otwórz w Viewer (podgląd read-only w nowym oknie)">
                <IconButton size="small" onClick={() => {
                  const p = mdEditing.pimRel ?? `drive/${mdEditing.rel}`;
                  const url = `/viewer/md/${p.split('/').map(encodeURIComponent).join('/')}`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}>
                  <OpenInNewIcon fontSize="small" />
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
            {dashEditing && (
              <Tooltip title="Open as JSON text editor">
                <IconButton size="small" onClick={() => void openDashAsRawSource(dashEditing.entry)}>
                  <CodeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {viewing && viewing.entry.name.endsWith('.dash.json') && (
              <Tooltip title="Open in visual dashboard editor">
                <IconButton size="small" onClick={() => {
                  const dashEntry = viewing.entry;
                  const dashPath = cwd ? `${cwd}/${dashEntry.name}` : dashEntry.name;
                  resetPanels();
                  setDashEditing({ entry: dashEntry, path: dashPath });
                }}>
                  <DashboardIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {/* JSON files: change bound schema + switch to graphical form editor. */}
            {viewing && viewing.textContent !== undefined && /\.json$/i.test(viewing.entry.name) && (
              <>
                <Tooltip title="Zmień schema (wybierz i zapisz $schema w pliku)">
                  <IconButton size="small" onClick={() => void openSchemaDialog(viewing.entry, viewingRel)}>
                    <SchemaIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edytuj graficznie (formularz wg schematu)">
                  <IconButton size="small" onClick={() => openJsonForm(viewing.entry, viewingRel)}>
                    <DynamicFormIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {/* Graphical JSON form editor: change schema + switch back to text. */}
            {jsonFormEditing && (
              <>
                <Tooltip title="Zmień schema">
                  <IconButton size="small" onClick={() => void openSchemaDialog(jsonFormEditing.entry, jsonFormEditing.rel)}>
                    <SchemaIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edytuj jako tekst (Monaco)">
                  <IconButton size="small" onClick={() => void viewFile(jsonFormEditing.entry, jsonFormEditing.rel)}>
                    <CodeIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
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
            {mdEditing && (
              <Tooltip title="Ustawienia widoku (zapisywane per plik)">
                <IconButton size="small" color={(mdView.minimalView || mdView.showToc || mdView.showFavorites || mdView.smallText || mdView.fullWidth) ? 'primary' : 'default'} onClick={(e) => setMdSettingsAnchor(e.currentTarget)}>
                  <TuneIcon fontSize="small" />
                </IconButton>
              </Tooltip>
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
            {viewing && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ flex: 1, minHeight: 0 }}>{viewerBody}</Box>
                {/*
                  Panel sceny nad konsolą i **wyżej** niż ona: scena wymaga
                  miejsca, żeby dało się cokolwiek na niej zobaczyć, a konsola
                  jest przy niej dopiskiem.
                */}
                {scenaSkryptu && (
                  <Box sx={{ height: '52%', minHeight: 260, flexShrink: 0, borderTop: 2, borderColor: 'divider', p: 0.5 }}>
                    <ScenePanel scene={scenaSkryptu.scene} path={scenaSkryptu.path} height="100%" />
                  </Box>
                )}

                {browserConsoleOpen && viewing.textContent !== undefined && isBrowserRunnable(viewing.entry.name) && (
                  <Box sx={{
                    height: '38%', minHeight: 120, flexShrink: 0,
                    borderTop: 2, borderColor: 'divider',
                    display: 'flex', flexDirection: 'column',
                    bgcolor: 'background.paper',
                  }}>
                    {/* Console header — status + actions */}
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5,
                      borderBottom: 1, borderColor: 'divider',
                    }}>
                      <TerminalIcon fontSize="small" sx={{ color: browserRunning ? 'success.main' : 'text.secondary' }} />
                      <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>
                        Console {browserRunning && '· running…'}
                      </Typography>
                      {browserRunning && <CircularProgress size={12} sx={{ mr: 0.5 }} />}
                      <Tooltip title={browserRunning ? 'Zatrzymaj' : 'Uruchom ponownie'}>
                        <span>
                          <IconButton size="small" color={browserRunning ? 'error' : 'success'}
                            onClick={() => browserRunning ? stopBrowserSession() : void runInBrowser()}>
                            {browserRunning ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Button size="small" onClick={() => setBrowserConsole([])} sx={{ minWidth: 0 }}>Clear</Button>
                      <Tooltip title="Ukryj konsolę">
                        <IconButton size="small" onClick={() => setBrowserConsoleOpen(false)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    {/* Visual output — DOM/components mounted via display.dom() */}
                    <Box
                      ref={browserDomRef}
                      sx={{
                        flex: 1, minHeight: 0, overflow: 'auto', p: 1,
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1,
                        bgcolor: 'background.default',
                        '&:empty': { display: 'none' },  // collapse when nothing rendered
                      }}
                    />
                    {/* Console output */}
                    <Box sx={{
                      maxHeight: 140, flexShrink: 0, minHeight: 0, overflow: 'auto', px: 1, py: 0.5,
                      borderTop: 1, borderColor: 'divider',
                      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12, lineHeight: 1.5,
                      bgcolor: 'action.hover',
                    }}>
                      {browserConsole.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          {browserRunning ? 'Running…' : 'No output. Click Run to execute.'}
                        </Typography>
                      ) : browserConsole.map((line, i) => (
                        <Box key={i} component="pre" sx={{
                          m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          color: browserConsoleColor(line.level),
                        }}>{line.text}</Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
            {repoViewing && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <GitRepoPanel key={repoViewing.path} userName={userName} repoPath={repoViewing.path} />
              </Box>
            )}
            {dashEditing && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <DashEditorPanel key={dashEditing.path} userName={userName} filePath={dashEditing.path}
                  workspaceFs={driveWorkspaceFs}
                  workspaceProjectDeps={driveWorkspaceProjectDeps}
                  workspaceExtraPlugins={driveExtraPlugins}
                  workspaceInitialPath={isAdmin ? `/user/drive/${dashEditing.path}` : `/drive/${dashEditing.path}`}
                  mapVfsToWorkspace={(vfsPath) => {
                    // Absolutną ścieżkę VFS mapuj na mount workspace: userDir → /user (admin) lub / (user);
                    // pozostałe (admin) → /server (mount pełnego katalogu danych).
                    const userPrefix = `/data/Minis/Users/${userName}/`;
                    if (vfsPath.startsWith(userPrefix)) {
                      const rel = vfsPath.slice(userPrefix.length);
                      return isAdmin ? `/user/${rel}` : `/${rel}`;
                    }
                    return isAdmin ? `/server${vfsPath.startsWith('/') ? vfsPath : `/${vfsPath}`}` : vfsPath;
                  }}
                />
              </Box>
            )}
            {jsonFormEditing && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <JsonSchemaFormPanel key={jsonFormEditing.rel} userName={userName} rel={jsonFormEditing.rel} />
              </Box>
            )}
            {mdEditing && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <MdEditor
                  key={mdEditing.rel}              /* remount on different file */
                  initialContent={mdEditing.initialContent}
                  onSave={saveMdContent}
                  onLinkClick={handleMdLinkClick}  /* internal .md links open in THIS panel */
                  autoSaveDelay={2000}              /* faster than the default 30s */
                  filePath={mdEditing.pimRel ?? `drive/${mdEditing.rel}`}  /* userBase-relative; pim files (e.g. md/rome.md) sit outside drive/ */
                  minimalView={!!mdView.minimalView}  /* per-file: no margins + no embed headers/frames */
                  smallText={!!mdView.smallText}      /* per-file: smaller content font */
                  fullWidth={!!mdView.fullWidth}      /* per-file: no 900px centre cap */
                />
              </Box>
            )}
            {mjdEditing && (
              // Visual editor needs flex column + full height (canvas must fill
              // available space). Form / def editors scroll internally so we
              // let MjdVfsLoader control overflow per mode.
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <MjdVfsLoader
                  key={mjdEditing.rel}
                  provider={mjdFs}
                  mjdPath={mjdEditing.mjdPath}
                  dataPath={mjdEditing.mode === 'data' ? mjdEditing.dataPath : undefined}
                />
              </Box>
            )}
            {globalEditing && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <GlobalJsonLoader
                  key={globalEditing.rel}
                  provider={mjdFs}
                  path={globalEditing.path}
                />
              </Box>
            )}
            {qtuiEditing && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <QtUiSceneEditor
                  key={qtuiEditing.rel}     /* remount on different file */
                  open
                  embedded
                  onClose={resetPanels}
                  fs={qtuiFs}
                  path={qtuiEditing.rel}
                  userName={userName}
                  onSaved={() => { void refresh(); }}
                />
              </Box>
            )}
            {running && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Console toolbar — status + Stop / Re-run */}
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  borderBottom: '1px solid', borderColor: 'divider',
                }}>
                  <Chip
                    size="small"
                    color={running.status === 'running' ? 'info' : running.status === 'done' ? 'success' : 'error'}
                    label={running.status === 'running' ? 'Uruchomione…' : running.status === 'done' ? 'Zakończono' : 'Błąd'}
                  />
                  <Box sx={{ flex: 1 }} />
                  {running.status === 'running' ? (
                    <Button size="small" color="error" startIcon={<CloseIcon />} onClick={stopScript}>
                      Stop
                    </Button>
                  ) : (
                    <Button size="small" startIcon={<RefreshIcon />} onClick={() => void (running.kind === 'install' ? runNpmInstall(running.target) : runScript(running.target))}>
                      Uruchom ponownie
                    </Button>
                  )}
                </Box>
                <Box component="pre" sx={{
                  flex: 1, m: 0, p: 1.5, overflow: 'auto',
                  fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  bgcolor: '#1e1e1e', color: '#d4d4d4',
                }}>
                  {running.output || (running.status === 'running' ? '…' : '(brak wyjścia)')}
                </Box>
              </Box>
            )}
            {logsView && (
              <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  borderBottom: '1px solid', borderColor: 'divider',
                }}>
                  <Chip size="small" variant="outlined" icon={<SubjectIcon />} label="logi skryptu" />
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" startIcon={<RefreshIcon />} onClick={() => void openLogs(logsView.rel)}>
                    Odśwież
                  </Button>
                  <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => void clearLogs(logsView.rel)}>
                    Wyczyść
                  </Button>
                </Box>
                <Box component="pre" sx={{
                  flex: 1, m: 0, p: 1.5, overflow: 'auto',
                  fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  bgcolor: '#1e1e1e', color: '#d4d4d4',
                }}>
                  {logsView.content || '(pusty)'}
                </Box>
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
      <Menu
        anchorEl={menuFor?.anchor}
        anchorReference={menuFor?.pos ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={menuFor?.pos}
        open={menuFor !== null}
        onClose={() => setMenuFor(null)}
      >
        {menuFor && menuFor.entry.type === DIR_TYPE && (
          <MenuItem onClick={() => { const entry = menuFor.entry; setMenuFor(null); onOpen(entry); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText>Otwórz</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && (
          <MenuItem onClick={() => { void viewFile(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Podgląd</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && /\.(md|markdown)$/i.test(menuFor.entry.name) && (
          <MenuItem onClick={() => {
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            const relEnc = rel.split('/').map(encodeURIComponent).join('/');
            navigate(`/viewer/md-rich/u/${encodeURIComponent(userName)}/${relEnc}`);
            setMenuFor(null);
          }}>
            <ListItemIcon><ArticleIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Otwórz w Viewer</ListItemText>
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && isRunnable(menuFor.entry.name) && (
          <MenuItem onClick={() => {
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            void restartScript(rel);
            setMenuFor(null);
          }}>
            <ListItemIcon><RestartAltIcon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
            <ListItemText primary="Restart" secondary="Ubij i uruchom w tle nową wersję" />
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && isRunnable(menuFor.entry.name) && (
          <MenuItem onClick={() => {
            const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
            void openLogs(rel);
            setMenuFor(null);
          }}>
            <ListItemIcon><SubjectIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Logs" secondary="Wyjście skryptu (Run + cron)" />
          </MenuItem>
        )}
        {menuFor && menuFor.entry.type === FILE_TYPE && menuFor.entry.name === 'package.json' && (
          <MenuItem onClick={() => { void runNpmInstall(cwd); setMenuFor(null); }}>
            <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="npm install" secondary="Zależności dla tego katalogu (node_modules)" />
          </MenuItem>
        )}
        {menuFor && (() => {
          const rel = cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name;
          const isFav = isFavorite(rel);
          const isDir = menuFor.entry.type === DIR_TYPE;
          return (
            <MenuItem onClick={() => { toggleFavorite(menuFor.entry); setMenuFor(null); }}>
              <ListItemIcon>
                {isFav
                  ? <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
                  : <StarBorderIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{isFav ? 'Usuń z ulubionych' : `Dodaj do ulubionych${isDir ? ' (katalog)' : ''}`}</ListItemText>
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
        {menuFor && menuFor.entry.type === DIR_TYPE && (
          <MenuItem
            disabled={zipping !== null}
            onClick={() => { const e = menuFor.entry; setMenuFor(null); void downloadFolderZip(e); }}
          >
            <ListItemIcon><FolderZipIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Pobierz ZIP" secondary="Spakuj katalog i pobierz" />
          </MenuItem>
        )}
        {menuFor && !isPublic(cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && (
          <MenuItem onClick={() => { void moveToPublic(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><DriveFileMoveIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Make public (przenieś do public/)</ListItemText>
          </MenuItem>
        )}
        {menuFor && isPublic(cwd ? `${cwd}/${menuFor.entry.name}` : menuFor.entry.name) && (
          /*
            Dla plików i katalogów jednakowo: adres katalogu też bywa potrzebny
            (baza wiedzy to katalog, nie plik), a rozróżnianie tych przypadków
            w menu było pozostałością po czasach, gdy publiczny był tylko
            `public/` z pojedynczymi obrazkami.
          */
          <MenuItem onClick={() => { void copyPublicUrl(menuFor.entry); setMenuFor(null); }}>
            <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Kopiuj link publiczny</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={async () => {
          // Ścieżka w formacie używanym przez api.file w skryptach automatyzacji
          // (userBase-relative: `drive/{rel}`), nie backendowa /data/Minis/Users/...
          const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
          const apiPath = `drive/${rel}`;
          setMenuFor(null);
          const ok = await copyTextToClipboard(apiPath);
          if (ok) toast(`Skopiowano ścieżkę: ${apiPath}`);
          else prompt('Skopiuj ścieżkę ręcznie:', apiPath);
        }}>
          <ListItemIcon><CodeIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Path" secondary="Ścieżka dla api.file (skrypty)" />
        </MenuItem>
        <MenuItem onClick={async () => {
          // Pełna ścieżka VFS w katalogu użytkownika (backendowa: /data/Minis/Users/{u}/...).
          const rel = cwd ? `${cwd}/${menuFor!.entry.name}` : menuFor!.entry.name;
          const vfsPath = `/data/Minis/Users/${userName}/drive/${rel}`;
          setMenuFor(null);
          const ok = await copyTextToClipboard(vfsPath);
          if (ok) toast(`Skopiowano VFS path: ${vfsPath}`);
          else prompt('Skopiuj VFS path ręcznie:', vfsPath);
        }}>
          <ListItemIcon><FolderIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="VFS path" secondary="Pełna ścieżka w katalogu użytkownika" />
        </MenuItem>
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

      {/* Overlay podczas pakowania katalogu do ZIP — kółko + informacja. */}
      <Backdrop
        open={zipping !== null}
        sx={{ zIndex: (t) => t.zIndex.modal + 10, color: '#fff', flexDirection: 'column', gap: 2 }}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body1">Pakowanie „{zipping}" do ZIP…</Typography>
        <Typography variant="caption" sx={{ opacity: 0.8 }}>To może chwilę potrwać przy dużych katalogach.</Typography>
      </Backdrop>

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
          if (isMySchemaJson(name)) {
            openGlobalEditor(synthetic, rel);
          } else if (isMjdEditable(name)) {
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

      {/* ── Schema picker ("Zmień schema") ────────────────────────────── */}
      <SchemaPickerDialog
        open={!!schemaDialog}
        userName={userName}
        current={schemaDialog?.current ?? null}
        onClose={() => setSchemaDialog(null)}
        onSelect={(schemaRel) => { if (schemaDialog) void applySchemaBinding(schemaDialog.rel, schemaDialog.entry, schemaRel); }}
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

          {/* Cron schedule — only for runnable JS scripts (drive/server/*.mjs etc.) */}
          {propsDialog && isRunnable(propsDialog.entry.name) && (
            <Box sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ScheduleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Typography variant="body2" fontWeight={600}>Harmonogram (cron)</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  value={propsDraftCron}
                  onChange={(e) => setPropsDraftCron(e.target.value)}
                  placeholder="np. 0 * * * *  (co godzinę)"
                  size="small"
                  fullWidth
                />
                <FormControlLabel
                  sx={{ whiteSpace: 'nowrap', mr: 0 }}
                  control={<Switch size="small" checked={propsDraftCronEnabled} onChange={(e) => setPropsDraftCronEnabled(e.target.checked)} />}
                  label={<Typography variant="caption">Aktywny</Typography>}
                />
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {[
                  { l: 'co min', c: '* * * * *' },
                  { l: 'co 5 min', c: '*/5 * * * *' },
                  { l: 'co godz.', c: '0 * * * *' },
                  { l: 'codz. 8:00', c: '0 8 * * *' },
                  { l: 'pon-pt 9:00', c: '0 9 * * 1-5' },
                ].map(p => (
                  <Chip key={p.c} label={p.l} size="small" variant="outlined" onClick={() => setPropsDraftCron(p.c)} />
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                Skrypt uruchamiany na backendzie (<code>node {propsDialog.rel}</code>) wg wyrażenia cron
                (minuta godzina dzień miesiąc dzień-tygodnia). Puste pole = brak harmonogramu.
                Zapis do <code>drive/.schedules.json</code>.
              </Typography>

              <FormControlLabel
                sx={{ mt: 1 }}
                control={<Switch size="small" checked={propsDraftStartup} onChange={(e) => setPropsDraftStartup(e.target.checked)} />}
                label={
                  <Typography variant="body2">
                    Uruchom przy starcie serwera
                  </Typography>
                }
              />
            </Box>
          )}
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

      {/* Ustawienia widoku markdown (per-plik, zapisywane na backend). */}
      <Popover
        open={Boolean(mdSettingsAnchor)}
        anchorEl={mdSettingsAnchor}
        onClose={() => setMdSettingsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1.5, minWidth: 280 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>
            Ustawienia widoku
          </Typography>
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.minimalView} onChange={(e) => setMdSetting({ minimalView: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Widok minimalny</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Bez marginesów i bez nagłówków/ramek osadzonych bloczków</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.fullWidth} onChange={(e) => setMdSetting({ fullWidth: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Pełna szerokość</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Treść na całą szerokość — bez pustych obszarów po bokach</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.smallText} onChange={(e) => setMdSetting({ smallText: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Mały tekst</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Mniejsza czcionka treści dokumentu</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.showToc} onChange={(e) => setMdSetting({ showToc: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Pokaż spis treści</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Ruchome okienko z nagłówkami (linki)</Typography></Box>}
          />
          <FormControlLabel
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
            labelPlacement="start"
            control={<Switch size="small" checked={!!mdView.showFavorites} onChange={(e) => setMdSetting({ showFavorites: e.target.checked })} />}
            label={<Box><Typography sx={{ fontSize: 13 }}>Pokaż ulubione</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>Ruchome okienko z ulubionymi plikami</Typography></Box>}
          />
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>
            Import / Eksport
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon fontSize="small" />} onClick={() => triggerMdImport('plain')} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Importuj czysty .md (z dysku)
            </Button>
            <Button size="small" variant="outlined" startIcon={<UploadFileIcon fontSize="small" />} onClick={() => triggerMdImport('notion')} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Importuj z Notion (.md / .zip)
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => void exportCleanMd()} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Eksportuj czysty .md (bez rozszerzeń)
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => void exportZip(true)} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Eksportuj strony → zip (czysty)
            </Button>
            <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => void exportZip(false)} sx={{ justifyContent: 'flex-start', textTransform: 'none', fontSize: 12 }}>
              Eksportuj strony → zip (z rozszerzeniami)
            </Button>
          </Box>
        </Box>
      </Popover>
      {/* Ukryty input pliku do importu markdown. */}
      <input ref={mdImportInputRef} type="file" accept=".md,.markdown,.txt,.zip" style={{ display: 'none' }} onChange={onMdImportFile} />

      {/* Ruchome okienka: Spis treści / Ulubione (per-plik, ustawiane w Ustawieniach). */}
      {mdEditing && mdView.showToc && (
        <MdTocPanel onClose={() => setMdSetting({ showToc: false })} />
      )}
      {mdEditing && mdView.showFavorites && (
        <MdFavoritesPanel
          favorites={Array.from(favorites).sort()}
          currentRel={mdEditing.pimRel ? undefined : mdEditing.rel}
          currentName={mdEditing.entry.name}
          isCurrentFav={!mdEditing.pimRel && favorites.has(mdEditing.rel)}
          onToggleCurrent={() => toggleFavoritePath(mdEditing.rel, mdEditing.entry.name)}
          onOpen={(rel) => { void goToFavorite(rel); }}
          onRemove={(rel) => toggleFavoritePath(rel, rel.split('/').pop() ?? rel)}
          onClose={() => setMdSetting({ showFavorites: false })}
        />
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

      {/* Wybór urządzenia dla modułu WASM — otwiera się dopiero, gdy panel
          Studia prosi o wgranie, a urządzeń z rozszerzeniem „script" jest
          więcej niż jedno. */}
      {wasmUpload.dialog}

      {/* Programowanie płytki z przeglądarki — to samo okno, co w projektach
          Arduino. esptool-js sam rozpoznaje układ, więc cała rodzina ESP32
          działa bez osobnej obsługi każdego wariantu. */}
      <FlashDialog
        open={hydraFlashOpen}
        onClose={() => { setHydraFlashOpen(false); setHydraFlashFiles(undefined); }}
        initialFiles={hydraFlashFiles}
        userName={userName}
      />

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack({ ...snack, open: false })}>
        <Alert severity={snack.severity}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
