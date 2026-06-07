/**
 * "Include file" picker for the fullscreen Automate Script editor.
 *
 * Lists files from the current user's `drive/mdscript/` directory and lets
 * the author insert any of them inline at the editor's cursor — the script
 * runtime evaluates the body as a single `AsyncFunction`, so there's no
 * module system to import against; the only meaningful "include" is text
 * substitution. The author can still preview the file before committing.
 *
 * Backed by the existing VFS REST API (same one DrivePage uses): a `readdir`
 * to list, a `readFile` to fetch contents. JWT comes from localStorage like
 * everywhere else in the app.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, List, ListItemButton, ListItemText,
  Stack, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/**
 * Source directories the picker scans — each one becomes a top-level expandable
 * folder in the tree. Adding a new root = one line here; nothing else changes.
 * Paths are relative to the user's home; absolute VFS paths the backend wants
 * (`/data/Minis/Users/{u}/drive/…`) are built per-request by `backendPath()`.
 */
const ROOTS: ReadonlyArray<{ label: string; dir: string }> = [
  { label: 'mdscript', dir: 'drive/mdscript' },
  { label: 'treejs',   dir: 'drive/treejs'   },
  // Public — pliki tu są też dostępne przez HTTP (/public/drive/users/{u}/...),
  // więc obok "Wstaw treść" pojawia się drugi przycisk "Wstaw jako import".
  { label: 'public',   dir: 'drive/public'   },
];

/** Helper — sprawdza czy ścieżka znajduje się pod `drive/public/`. Określa to
 *  czy backend wystawia plik przez HTTP i czy `await import(...)` z brwsera
 *  zadziała. Tylko wtedy aktywujemy przycisk "Wstaw jako import". */
function isImportable(rel: string): boolean {
  return rel.startsWith('drive/public/');
}

/** Buduje URL pod którym backend serwuje plik z `drive/public/`. */
function publicHttpUrl(userName: string, rel: string): string {
  // selected = 'drive/public/lit/components/clock.module.js'
  //         → strip leading 'drive/public/'
  //         → /public/drive/users/{user}/lit/components/clock.module.js
  const sub = rel.replace(/^drive\/public\//, '');
  return `/public/drive/users/${encodeURIComponent(userName)}/${sub}`;
}

/**
 * Best-effort extraction of named ES module exports from a source string.
 * The picker uses this to generate the `const { … } = mod;` line that pairs
 * with the `await import(url)` snippet — without it, the author has to copy
 * names by hand and it's easy to typo.
 *
 * Covered forms:
 *   - `export const X = …`
 *   - `export let X = …` / `export var X = …`
 *   - `export class X { … }`
 *   - `export function X(…)` / `export async function X(…)`
 *   - `export { A, B as C, D }`
 *
 * NOT covered:
 *   - `export default …` (anonymous; would need a different snippet)
 *   - re-exports through `export * from …`
 *   - exports inside conditional blocks
 *
 * Good enough for our convention (one `export class` + one `export const TAG`
 * per file). Anything missed by the parser just doesn't end up in the
 * destructure — the author can add by hand.
 */
function parseNamedExports(code: string): string[] {
  const names = new Set<string>();
  // Direct declarations.
  const directRe = /(^|\n)\s*export\s+(?:async\s+)?(?:const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = directRe.exec(code)) !== null) {
    names.add(m[2]);
  }
  // export { A, B as C, D }
  const listRe = /(^|\n)\s*export\s+\{([^}]+)\}/g;
  while ((m = listRe.exec(code)) !== null) {
    for (const part of m[2].split(',')) {
      const aliased = part.trim().split(/\s+as\s+/i);
      const exported = (aliased[aliased.length - 1] ?? '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(exported)) names.add(exported);
    }
  }
  return Array.from(names);
}
const DIR_TYPE = 2;

interface VfsEntry { name: string; type: 1 | 2; size?: number; mtime?: number }

function authHeaders(): Record<string, string> {
  try {
    const stored = localStorage.getItem('minis_current_user');
    if (!stored) return {};
    const parsed = JSON.parse(stored) as { token?: string };
    return parsed.token ? { Authorization: `Bearer ${parsed.token}` } : {};
  } catch {
    return {};
  }
}

/** Build the backend's expected absolute path. `MycastleHttpServer.handleUserHomeVfs`
 *  asserts `path.startsWith('/data/Minis/Users/{userName}/')` and rejects anything
 *  else with `NoPermissions` → HTTP 403. Same prefix logic as `DrivePage`. */
function backendPath(userName: string, relPath: string): string {
  const cleaned = relPath.replace(/^\/+|\/+$/g, '');
  return cleaned
    ? `/data/Minis/Users/${userName}/${cleaned}`
    : `/data/Minis/Users/${userName}`;
}

function vfsUrl(userName: string, op: string, relPath: string): string {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/${op}`, window.location.origin);
  u.searchParams.set('path', backendPath(userName, relPath));
  return u.pathname + u.search;
}

/** UTF-8-safe base64 decode (server returns file body base64-encoded). */
function base64ToText(b64: string): string {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

export interface AutomateIncludeFileDialogProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  /** Called with the file's *contents* — caller inserts at cursor. */
  onInsert: (content: string, filename: string) => void;
  /** Called with an HTTP URL pointing at the file under `/public/drive/...`.
   *  Only fires when the user clicks "Wstaw jako import" for a file in
   *  `drive/public/`. Caller inserts an `await import('url')` snippet at
   *  the cursor. Optional — hosts without this callback just hide the
   *  second button.
   *
   *  `exports` is the list of named exports the picker detected by parsing
   *  the preview — host should use them to generate the destructure line
   *  alongside the import. Empty when the file has no parseable exports
   *  (anonymous default export, dynamic `Object.defineProperty`, …); host
   *  falls back to a comment hint in that case. */
  onInsertImport?: (url: string, filename: string, exports: string[]) => void;
}

const AutomateIncludeFileDialog: React.FC<AutomateIncludeFileDialogProps> = ({
  open, onClose, userName, onInsert, onInsertImport,
}) => {
  // Lazy tree state. Key = directory path RELATIVE to the user's home (e.g.
  // 'drive/mdscript', 'drive/treejs/sub'). Value = entries that dir contained
  // the last time we fetched it. We only fetch when the user expands a node.
  //
  // Using user-home-relative paths everywhere (instead of paths relative to
  // a single MDSCRIPT_DIR) makes multi-root straightforward: every root is
  // just another key, the rendering and selection logic doesn't have to know
  // which root a sub-folder belongs to.
  const [tree, setTree] = useState<Map<string, VfsEntry[]>>(new Map());
  // Expanded directory keys. Top-level roots start collapsed per the spec.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Dirs currently being fetched — drives the per-folder spinner so the user
  // sees feedback while a nested folder loads.
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Per-root "missing" flag. Used only for the info banner — a missing root
  // shows the friendly "create this directory" hint; missing sub-folders just
  // render as empty under their parent.
  const [missingRoots, setMissingRoots] = useState<Set<string>>(new Set());

  // `selected` is now the FULL path from the user's home (e.g.
  // 'drive/treejs/01-spinning-cube.js'). That makes the include marker
  // unambiguous when files of the same name live under different roots.
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  /** Sort: dirs first, then files; alphabetical within each group. Mirrors
   *  what most file managers do — matches user expectation. */
  const sortEntries = (entries: VfsEntry[]): VfsEntry[] =>
    [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === DIR_TYPE ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  /** Fetch a single directory's contents. `absRel` is the path from the user's
   *  home (e.g. 'drive/mdscript' or 'drive/treejs/sub'). No-op if already
   *  loaded — explicit refresh purges the cache. The `isRoot` flag controls
   *  the missing-folder banner: only top-level roots get the friendly "create
   *  this dir" hint; a missing sub-folder just renders as empty children. */
  const loadDir = useCallback(async (absRel: string, isRoot = false) => {
    if (!userName) return;
    if (tree.has(absRel)) return;
    setLoadingDirs(prev => new Set(prev).add(absRel));
    setError(null);
    try {
      const r = await fetch(vfsUrl(userName, 'readdir', absRel), { headers: authHeaders() });
      if (r.status === 404) {
        if (isRoot) {
          setMissingRoots(prev => new Set(prev).add(absRel));
        }
        setTree(prev => new Map(prev).set(absRel, []));
        return;
      }
      if (!r.ok) throw new Error(`readdir ${r.status}`);
      const json = await r.json() as { entries?: VfsEntry[] };
      setTree(prev => new Map(prev).set(absRel, sortEntries(json.entries ?? [])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingDirs(prev => {
        const next = new Set(prev);
        next.delete(absRel);
        return next;
      });
    }
  }, [userName, tree]);

  /** Explicit refresh — purges the cache and re-fetches all roots (lazily, on
   *  next expansion) plus the currently expanded dirs. Closes selection since
   *  the underlying file might no longer be there. */
  const refresh = useCallback(async () => {
    setTree(new Map());
    setMissingRoots(new Set());
    setError(null);
    setSelected(null);
    // Re-fetch every currently-expanded directory so the visible part of the
    // tree reflects on-disk state immediately. Collapsed subtrees stay lazy
    // and will be loaded on next expand.
    await Promise.all(Array.from(expanded).map(d => {
      const isRoot = ROOTS.some(r => r.dir === d);
      return loadDir(d, isRoot);
    }));
  // loadDir's cache-skip would no-op on dirs already loaded; we cleared the
  // cache above so each one actually goes through.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Initial load on open: pre-fetch each root's contents so the chevron next
  // to the root reflects "I know what's inside, empty or not" immediately,
  // even though we keep the root visually collapsed. Cheap (one readdir per
  // root), and avoids a flash when the user expands the first time.
  useEffect(() => {
    if (open && userName) {
      setMissingRoots(new Set());
      setError(null);
      setSelected(null);
      for (const root of ROOTS) {
        void loadDir(root.dir, true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userName]);

  /** Toggle expand/collapse on a directory. Lazy-loads contents on first
   *  expand. `absRel` is the user-home-relative path; we detect whether it's
   *  one of the configured roots so the missing-folder banner only fires for
   *  top-level roots. */
  const toggleDir = useCallback((absRel: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(absRel)) {
        next.delete(absRel);
      } else {
        next.add(absRel);
        if (!tree.has(absRel)) {
          const isRoot = ROOTS.some(r => r.dir === absRel);
          void loadDir(absRel, isRoot);
        }
      }
      return next;
    });
  }, [tree, loadDir]);

  // Fetch preview when selection changes. Aborted by superseding select so
  // a fast-clicking user doesn't get the last preview racing in late.
  // `selected` is the FULL user-home-relative path (e.g. 'drive/treejs/foo.js'),
  // so it goes straight into the URL without further composition.
  useEffect(() => {
    if (!selected) { setPreview(''); return; }
    let cancelled = false;
    setPreviewLoading(true);
    fetch(vfsUrl(userName, 'readFile', selected), { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`readFile ${r.status}`)))
      .then((json: { data?: string }) => {
        if (!cancelled) setPreview(base64ToText(json.data ?? ''));
      })
      .catch(err => { if (!cancelled) { setPreview(''); setError((err as Error).message); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selected, userName]);

  const handleInsert = () => {
    if (!selected || !preview) return;
    // Wrap inserted body with marker comments showing the full source path.
    // `selected` already includes the root (e.g. 'drive/treejs/foo.js'), so
    // the comments unambiguously identify the source even when files of the
    // same basename exist under different roots.
    const wrapped = `\n// ─── included: ${selected} ───\n${preview.trim()}\n// ----- ${selected}\n`;
    onInsert(wrapped, selected);
    onClose();
  };

  /** Insert as a one-liner `await import(url)` — only for files in
   *  drive/public/ where the backend serves them with the right MIME.
   *  Parses the preview to detect named exports so the host can generate
   *  the destructure line automatically. */
  const handleInsertImport = () => {
    if (!selected || !isImportable(selected) || !onInsertImport) return;
    const url = publicHttpUrl(userName, selected);
    const exports = preview ? parseNamedExports(preview) : [];
    onInsertImport(url, selected, exports);
    onClose();
  };

  /** File-type icon — JS/TS = code, .md = description, fallback = generic. */
  const iconFor = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.mjs')) {
      return <CodeIcon fontSize="small" sx={{ color: '#4caf50' }} />;
    }
    if (lower.endsWith('.md')) return <DescriptionIcon fontSize="small" sx={{ color: 'text.secondary' }} />;
    return <DescriptionIcon fontSize="small" sx={{ color: 'text.disabled' }} />;
  };

  /** Render a single directory row + (if expanded) its children, recursively.
   *  Pulled out as a helper so `renderTop` can use it for ROOTS without
   *  duplicating the JSX. */
  const renderDirRow = (
    dirPath: string,
    label: string,
    depth: number,
    keySuffix?: string,
  ): React.ReactNode => {
    const isExpanded = expanded.has(dirPath);
    const isLoading = loadingDirs.has(dirPath);
    return (
      <Box key={(keySuffix ?? '') + dirPath}>
        <ListItemButton
          onClick={() => toggleDir(dirPath)}
          sx={{ pl: depth * 2 + 1, gap: 0.5 }}
        >
          {isExpanded
            ? <ExpandMoreIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            : <ChevronRightIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
          {isExpanded
            ? <FolderOpenIcon fontSize="small" sx={{ color: '#ffa726' }} />
            : <FolderIcon fontSize="small" sx={{ color: '#ffa726' }} />}
          <ListItemText
            primary={label}
            slotProps={{ primary: { noWrap: true, fontSize: '0.85em', fontWeight: 500 } }}
          />
          {isLoading && <CircularProgress size={12} sx={{ mr: 1 }} />}
        </ListItemButton>
        {isExpanded && renderEntries(dirPath, depth + 1)}
      </Box>
    );
  };

  /** Recursive renderer for a directory's children. `parentAbs` is the
   *  user-home-relative path of the parent (e.g. 'drive/treejs/sub'); top-
   *  level rendering doesn't go through here — it's `renderTop()` below. */
  const renderEntries = (parentAbs: string, depth: number): React.ReactNode => {
    const entries = tree.get(parentAbs);
    if (!entries) return null;
    if (entries.length === 0) {
      return (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ pl: depth * 2 + 4, py: 0.5, display: 'block', fontStyle: 'italic' }}
        >
          (pusty katalog)
        </Typography>
      );
    }
    return entries.map(e => {
      const childAbs = `${parentAbs}/${e.name}`;
      if (e.type === DIR_TYPE) {
        return renderDirRow(childAbs, e.name, depth);
      }
      // File — leaf node. Extra +3.5 pl so files visually align with their
      // sibling directories' contents (chevron + folder icon ≈ 3rem).
      return (
        <ListItemButton
          key={childAbs}
          selected={selected === childAbs}
          onClick={() => setSelected(childAbs)}
          sx={{ pl: depth * 2 + 3.5, gap: 1 }}
        >
          {iconFor(e.name)}
          <ListItemText
            primary={e.name}
            secondary={typeof e.size === 'number' ? `${e.size} B` : undefined}
            slotProps={{
              primary: { noWrap: true, fontSize: '0.85em' },
              secondary: { fontSize: '0.7em' },
            }}
          />
        </ListItemButton>
      );
    });
  };

  /** Top-level renderer — one expandable folder per configured ROOT. */
  const renderTop = (): React.ReactNode => ROOTS.map(root =>
    renderDirRow(root.dir, root.label, 0, 'root:'),
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '75vh' } }}>
      <DialogTitle sx={{ py: 1.25, pr: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <OpenInNewIcon sx={{ color: '#4caf50' }} />
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
            Dołącz plik z {ROOTS.map(r => r.dir).join(' / ')}
          </Typography>
          <Tooltip title="Odśwież listę">
            <span>
              <IconButton size="small" onClick={() => void refresh()} disabled={loadingDirs.size > 0}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Left — file list */}
        <Box sx={{
          width: { xs: '100%', md: 300 },
          borderRight: { md: 1 },
          borderColor: { md: 'divider' },
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}>
          {/* Loading hint while ANY root is being fetched for the first time
              (initial open). Once at least one root resolved, the tree itself
              is shown and per-folder spinners take over. */}
          {ROOTS.some(r => loadingDirs.has(r.dir)) && ROOTS.every(r => !tree.has(r.dir)) && (
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption">Ładowanie…</Typography>
            </Box>
          )}
          {/* Per-root missing hint — one Alert per missing root, listing only
              the ones that are actually absent (other roots stay rendered
              and useful). */}
          {ROOTS.filter(r => missingRoots.has(r.dir)).map(r => (
            <Alert key={r.dir} severity="info" sx={{ m: 1, fontSize: '0.85em' }}>
              Katalog <strong>{r.dir}/</strong> nie istnieje. Utwórz go w Drive
              i wgraj pliki (.js, .ts, .md), żeby je tu zobaczyć.
            </Alert>
          ))}
          {error && (
            <Alert severity="error" sx={{ m: 1, fontSize: '0.85em' }}>{error}</Alert>
          )}
          <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
            {/* Tree — top level is one folder per ROOT; children are inserted
                inline when expanded via `renderDirRow` / `renderEntries`. */}
            {renderTop()}
          </List>
        </Box>

        {/* Right — preview */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {selected ? (
            <>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Chip label={selected} size="small" sx={{ fontFamily: 'monospace' }} />
                {isImportable(selected) && (
                  <Chip
                    label="publiczny"
                    size="small"
                    color="success"
                    title="Dostępny przez HTTP — można zaimportować jako moduł"
                    sx={{ height: 20 }}
                  />
                )}
                {previewLoading && <CircularProgress size={14} />}
              </Stack>
              <Box
                component="pre"
                sx={{
                  flex: 1,
                  m: 0,
                  p: 2,
                  overflow: 'auto',
                  fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
                  fontSize: '0.78em',
                  lineHeight: 1.5,
                  bgcolor: '#1e1e1e',
                  color: '#d4d4d4',
                  whiteSpace: 'pre',
                }}
              >
                {preview || (previewLoading ? '' : '(pusty plik)')}
              </Box>
            </>
          ) : (
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center' }}>
                Wybierz plik z listy po lewej, aby zobaczyć podgląd
                <br />i wstawić do skryptu w miejscu kursora.
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Box sx={{ flex: 1, pl: 1, minWidth: 200 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Wstaw treść</strong> = inline kopia kodu w miejscu kursora.<br />
            <strong>Wstaw jako import</strong> = jednolinijkowe <code>await import(...)</code>
            (tylko pliki z <code>drive/public/</code>).
          </Typography>
        </Box>
        <Button onClick={onClose}>Anuluj</Button>
        {/* Second action — `await import(...)` snippet. Disabled when the
            picker host doesn't support it (`!onInsertImport`) or when the
            selected file isn't under drive/public/ (backend won't serve it
            with the right MIME for module loading). */}
        <Tooltip
          title={
            !onInsertImport
              ? 'Host edytora nie obsługuje import — użyj "Wstaw treść"'
              : !selected
                ? 'Wybierz plik z listy'
                : !isImportable(selected)
                  ? 'Plik musi być w drive/public/ — przenieś go tam aby zaimportować'
                  : 'Wstaw jednolinijkowe await import(...) wskazujące na publiczny URL'
          }
        >
          <span>
            <Button
              variant="outlined"
              onClick={handleInsertImport}
              disabled={!selected || !preview || !onInsertImport || !isImportable(selected)}
            >
              Wstaw jako import
            </Button>
          </span>
        </Tooltip>
        <Button
          variant="contained"
          onClick={handleInsert}
          disabled={!selected || previewLoading || !preview}
          sx={{ bgcolor: '#4caf50', '&:hover': { bgcolor: '#3a8a3d' } }}
        >
          Wstaw treść
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutomateIncludeFileDialog;
