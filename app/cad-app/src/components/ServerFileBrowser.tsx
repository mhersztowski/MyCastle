import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import StorageIcon from '@mui/icons-material/Storage';
import FolderOffOutlinedIcon from '@mui/icons-material/FolderOffOutlined';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import HomeIcon from '@mui/icons-material/Home';
import {
  createDirectory,
  deleteFileAt,
  getCurrentUserId,
  listDirectory,
  type DirListing,
  renameFileAt,
  userProjectsDir,
  userRootDir,
} from '../vfs/cadProjectApi';

export interface ServerFileBrowserProps {
  open: boolean;
  /** 'open' = choose a file to load; 'save' = choose a directory + name to save */
  mode: 'open' | 'save';
  /** Dialog title. */
  title: string;
  /** Primary file extension, with leading dot — e.g. `.cad.json`. */
  extension: string;
  /** Extra extensions renamed/deleted alongside the primary file (companions). */
  companionExtensions?: string[];
  /** Suggested filename for save mode. */
  defaultName?: string;
  /** localStorage key for remembering the last-browsed directory. */
  storageKey?: string;
  onClose: () => void;
  /** Open mode: load the selected file. Throw to surface an error. */
  onOpen?: (dir: string, name: string) => Promise<void>;
  /** Save mode: persist the file under the chosen directory. Throw on error. */
  onSave?: (dir: string, name: string) => Promise<void>;
  /** Called after a successful open or save with the file name. */
  onDone?: (name: string) => void;
  /** Optional extra row actions rendered per file (e.g. viewer links). */
  renderFileActions?: (dir: string, name: string) => React.ReactNode;
}

const DEFAULT_DIR_KEY = 'cad.serverFileBrowser.dir';

const EMPTY_LISTING: DirListing = { dirs: [], files: [] };

function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Generic server (VFS) file browser dialog with directory navigation and
 * folder creation. Hosts supply the file extension plus open/save callbacks;
 * companion files (e.g. `.scene.json`) are renamed/deleted automatically.
 */
export function ServerFileBrowser({
  open, mode, title, extension, companionExtensions = [], defaultName = '',
  storageKey = DEFAULT_DIR_KEY, onClose, onOpen, onSave, onDone, renderFileActions,
}: ServerFileBrowserProps) {
  const userId = getCurrentUserId();
  const rootDir = userRootDir(userId);
  const defaultDir = userProjectsDir(userId);

  // Current VFS directory — restored from localStorage, never above the user root.
  const [dir, setDir] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && (saved === rootDir || saved.startsWith(rootDir + '/'))) return saved;
    } catch {
      // localStorage unavailable — ignore
    }
    return defaultDir;
  });

  const [listing, setListing] = useState<DirListing>(EMPTY_LISTING);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setListing(await listDirectory(dir, extension));
    } catch (e) {
      setError((e as Error).message);
      setListing(EMPTY_LISTING);
    } finally {
      setLoading(false);
    }
  }, [dir, extension]);

  // Reload whenever the dialog opens or the directory changes.
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  // Reset transient UI state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(null);
      setSaveName(defaultName);
      setRenamingId(null);
      setNewFolderOpen(false);
      setNewFolderName('');
      setError(null);
    }
  }, [open, defaultName]);

  // Persist the browsed directory so the next open lands in the same place.
  useEffect(() => {
    try { localStorage.setItem(storageKey, dir); } catch { /* ignore */ }
  }, [dir, storageKey]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) setTimeout(() => renameRef.current?.select(), 50);
  }, [renamingId]);

  // Focus the new-folder input when it appears
  useEffect(() => {
    if (newFolderOpen) setTimeout(() => newFolderRef.current?.focus(), 50);
  }, [newFolderOpen]);

  // ── navigation ───────────────────────────────────────────────────────────────

  function navigateTo(target: string) {
    setDir(target);
    setSelected(null);
    setRenamingId(null);
    setNewFolderOpen(false);
  }

  function enterDir(name: string) {
    navigateTo(`${dir}/${name}`);
  }

  /** Breadcrumb segments below the user root. */
  const segments = dir === rootDir ? [] : dir.slice(rootDir.length + 1).split('/');

  // ── actions ────────────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (/[/\\]/.test(name)) {
      setError('Folder name cannot contain slashes.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createDirectory(`${dir}/${name}`);
      setNewFolderOpen(false);
      setNewFolderName('');
      await reload();
    } catch (e) {
      setError(`Failed to create folder: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(name: string) {
    if (!onOpen) return;
    setBusy(true);
    setError(null);
    try {
      await onOpen(dir, name);
      onDone?.(name);
      onClose();
    } catch (e) {
      setError(`Failed to open "${name}": ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const name = saveName.trim();
    if (!name || !onSave) return;

    // Confirm overwrite if a file with the same name exists in this folder
    if (listing.files.some(f => f.name === name)) {
      if (!window.confirm(`Overwrite existing "${name}"?`)) return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave(dir, name);
      onDone?.(name);
      onClose();
    } catch (e) {
      setError(`Failed to save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${name}"?`)) return;
    setBusy(true);
    try {
      await deleteFileAt(dir, name, extension);
      // Best-effort: drop companion files so they do not orphan.
      for (const ext of companionExtensions) {
        try { await deleteFileAt(dir, name, ext); } catch { /* no companion */ }
      }
      if (selected === name) setSelected(null);
      await reload();
    } catch (err) {
      setError(`Delete failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function startRename(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(name);
    setRenameValue(name);
  }

  async function commitRename(oldName: string) {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === oldName) return;
    setBusy(true);
    try {
      await renameFileAt(dir, oldName, newName, extension);
      // Best-effort: keep companion files next to their primary file.
      for (const ext of companionExtensions) {
        try { await renameFileAt(dir, oldName, newName, ext); } catch { /* no companion */ }
      }
      if (selected === oldName) setSelected(newName);
      if (mode === 'save' && saveName === oldName) setSaveName(newName);
      await reload();
    } catch (err) {
      setError(`Rename failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // ── derived state ──────────────────────────────────────────────────────────

  const canConfirm = mode === 'open'
    ? Boolean(selected) && !busy
    : saveName.trim().length > 0 && !busy;

  const confirmLabel = mode === 'open' ? 'Open' : 'Save';
  const isEmpty = listing.dirs.length === 0 && listing.files.length === 0;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <StorageIcon fontSize="small" sx={{ color: 'primary.main' }} />
        {title}
        <Typography variant="caption" sx={{ ml: 'auto', color: 'text.disabled' }}>
          user: {userId}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mt: 1 }}>
            {error}
          </Alert>
        )}

        {/* Directory toolbar: breadcrumb + new folder */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <Breadcrumbs
            maxItems={4}
            separator="›"
            sx={{ flex: 1, overflow: 'hidden', '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' } }}
          >
            <Link
              component="button"
              type="button"
              underline="hover"
              color={dir === rootDir ? 'text.primary' : 'inherit'}
              onClick={() => navigateTo(rootDir)}
              sx={{ display: 'flex', alignItems: 'center', fontSize: 13 }}
            >
              <HomeIcon sx={{ fontSize: 15, mr: 0.5 }} />
              {userId}
            </Link>
            {segments.map((seg, i) => {
              const target = `${rootDir}/${segments.slice(0, i + 1).join('/')}`;
              const isLast = i === segments.length - 1;
              return (
                <Link
                  key={target}
                  component="button"
                  type="button"
                  underline="hover"
                  color={isLast ? 'text.primary' : 'inherit'}
                  onClick={() => navigateTo(target)}
                  sx={{ fontSize: 13, fontFamily: 'monospace' }}
                >
                  {seg}
                </Link>
              );
            })}
          </Breadcrumbs>
          <Button
            size="small"
            startIcon={<CreateNewFolderOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setNewFolderOpen(v => !v)}
            sx={{ flexShrink: 0, textTransform: 'none' }}
          >
            New Folder
          </Button>
        </Box>

        {/* Inline new-folder input */}
        {newFolderOpen && (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
            borderBottom: '1px solid rgba(255,255,255,0.08)', bgcolor: 'rgba(79,195,247,0.06)',
          }}>
            <FolderIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
            <TextField
              inputRef={newFolderRef}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName(''); }
              }}
              placeholder="New folder name"
              size="small"
              variant="standard"
              fullWidth
              slotProps={{ input: { sx: { fontSize: 13 } } }}
            />
            <Button size="small" onClick={handleCreateFolder} disabled={!newFolderName.trim() || busy}>
              Create
            </Button>
            <Button size="small" color="inherit" onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}>
              Cancel
            </Button>
          </Box>
        )}

        {/* Directory + file list */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}>
              <CircularProgress size={28} />
            </Box>
          ) : isEmpty ? (
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 180, color: 'text.disabled', gap: 1,
            }}>
              <FolderOffOutlinedIcon sx={{ fontSize: 40, opacity: 0.4 }} />
              <Typography variant="body2">This folder is empty</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {/* Sub-directories */}
              {listing.dirs.map(name => (
                <ListItemButton
                  key={`dir:${name}`}
                  onClick={() => enterDir(name)}
                  sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <FolderIcon sx={{ fontSize: 18, color: '#ffca28' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {name}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}

              {/* Files */}
              {listing.files.map(f => (
                <ListItemButton
                  key={`file:${f.name}`}
                  selected={selected === f.name}
                  onDoubleClick={() => mode === 'open' && handleOpen(f.name)}
                  onClick={() => {
                    setSelected(f.name);
                    if (mode === 'save') setSaveName(f.name);
                  }}
                  sx={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    '&.Mui-selected': { bgcolor: 'rgba(79,195,247,0.12)' },
                  }}
                >
                  {/* Name / rename inline editor */}
                  <ListItemText
                    primary={
                      renamingId === f.name ? (
                        <TextField
                          inputRef={renameRef}
                          value={renameValue}
                          size="small"
                          variant="standard"
                          autoFocus
                          onClick={e => e.stopPropagation()}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(f.name)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(f.name);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          sx={{ width: '100%' }}
                          slotProps={{ input: { sx: { fontSize: 13 } } }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {f.name}
                        </Typography>
                      )
                    }
                    secondary={
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {formatDate(f.mtime)}{f.size ? `  ·  ${formatSize(f.size)}` : ''}
                      </Typography>
                    }
                  />

                  {/* Row actions */}
                  <Box sx={{ display: 'flex', gap: 0.25, ml: 1, flexShrink: 0 }}>
                    {renderFileActions?.(dir, f.name)}
                    <Tooltip title="Rename">
                      <IconButton size="small" onClick={e => startRename(f.name, e)} disabled={busy}>
                        <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={e => handleDelete(f.name, e)}
                        disabled={busy}
                        color="error"
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>

        {/* Save-mode name input */}
        {mode === 'save' && (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <TextField
              label="File name"
              helperText={`Saves into ${dir}`}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canConfirm && handleSave()}
              size="small"
              fullWidth
              autoFocus
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography sx={{ color: 'text.disabled', fontSize: 12, fontFamily: 'monospace' }}>
                        {extension}
                      </Typography>
                    </InputAdornment>
                  ),
                  sx: { fontFamily: 'monospace', fontSize: 13 },
                },
                formHelperText: { sx: { fontFamily: 'monospace', fontSize: 11 } },
              }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} size="small" color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!canConfirm}
          onClick={mode === 'open' ? () => handleOpen(selected!) : handleSave}
          startIcon={busy ? <CircularProgress size={14} /> : undefined}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
