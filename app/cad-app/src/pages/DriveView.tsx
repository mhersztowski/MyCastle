/**
 * Drive — a tree browser over the backend VFS (`/users/{userId}/…`) with
 * upload / download / new-folder / delete actions. Folders lazy-load their
 * children on expand; a single hidden file input handles uploads into whatever
 * folder triggered them.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, IconButton, Tooltip, Typography, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DownloadIcon from '@mui/icons-material/Download';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  type VfsDirEntry,
  vfsListDir, vfsReadFileBin, vfsWriteFileBin, vfsDeletePath, createDirectory,
  getCurrentUserId, userRootDir,
} from '../vfs/cadProjectApi';

const joinPath = (base: string, name: string) => `${base.replace(/\/+$/, '')}/${name}`;

/** Sort: directories first, then files, each alphabetically (case-insensitive). */
function sortEntries(entries: VfsDirEntry[]): VfsDirEntry[] {
  return [...entries].sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export function DriveView() {
  const rootPath = useMemo(() => userRootDir(getCurrentUserId()), []);

  const [childrenByPath, setChildrenByPath] = useState<Record<string, VfsDirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-folder dialog.
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  // One hidden input drives every upload; the target dir is stashed in a ref.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string>(rootPath);

  const setLoading = useCallback((path: string, on: boolean) => {
    setLoadingPaths(prev => {
      const next = new Set(prev);
      if (on) next.add(path); else next.delete(path);
      return next;
    });
  }, []);

  const loadDir = useCallback(async (path: string) => {
    setLoading(path, true);
    setError(null);
    try {
      const entries = await vfsListDir(path);
      setChildrenByPath(prev => ({ ...prev, [path]: sortEntries(entries) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(path, false);
    }
  }, [setLoading]);

  // Load the root listing on mount.
  useEffect(() => { loadDir(rootPath); }, [rootPath, loadDir]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); return next; }
      next.add(path);
      if (!childrenByPath[path]) loadDir(path);
      return next;
    });
  }, [childrenByPath, loadDir]);

  // ── actions ───────────────────────────────────────────────────────────────────

  const triggerUpload = useCallback((targetDir: string) => {
    uploadTargetRef.current = targetDir;
    fileInputRef.current?.click();
  }, []);

  const onFilesPicked = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const targetDir = uploadTargetRef.current;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const data = new Uint8Array(await file.arrayBuffer());
        await vfsWriteFileBin(joinPath(targetDir, file.name), data);
      }
      // Make sure the target folder is expanded and refreshed so uploads show.
      setExpanded(prev => new Set(prev).add(targetDir));
      await loadDir(targetDir);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [loadDir]);

  const handleDownload = useCallback(async (filePath: string, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await vfsReadFileBin(filePath);
      const blob = new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDelete = useCallback(async (path: string, name: string, isDir: boolean, parent: string) => {
    const msg = isDir
      ? `Delete folder "${name}" and all its contents?`
      : `Delete file "${name}"?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await vfsDeletePath(path);
      // Drop cached listing of the deleted folder, then refresh the parent.
      setChildrenByPath(prev => { const n = { ...prev }; delete n[path]; return n; });
      await loadDir(parent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [loadDir]);

  const submitNewFolder = useCallback(async () => {
    const parent = newFolderParent;
    const name = newFolderName.trim();
    if (!parent || !name) return;
    setBusy(true);
    setError(null);
    try {
      await createDirectory(joinPath(parent, name));
      setExpanded(prev => new Set(prev).add(parent));
      await loadDir(parent);
      setNewFolderParent(null);
      setNewFolderName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [newFolderParent, newFolderName, loadDir]);

  // ── tree rendering ────────────────────────────────────────────────────────────

  const renderNode = (entry: VfsDirEntry, parentPath: string, depth: number): ReactNode => {
    const path = joinPath(parentPath, entry.name);
    const isOpen = expanded.has(path);
    const isLoading = loadingPaths.has(path);
    const kids = childrenByPath[path];

    return (
      <Box key={path}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            pl: depth * 2 + 1, pr: 1, py: 0.4, borderRadius: 1,
            cursor: entry.isDir ? 'pointer' : 'default',
            '&:hover': { bgcolor: 'action.hover' },
            '&:hover .drive-actions': { opacity: 1 },
          }}
          onClick={() => entry.isDir && toggleExpand(path)}
        >
          {entry.isDir
            ? (isOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />)
            : <Box sx={{ width: 20 }} />}
          {entry.isDir
            ? (isOpen ? <FolderOpenIcon fontSize="small" sx={{ color: '#e0a83a' }} /> : <FolderIcon fontSize="small" sx={{ color: '#e0a83a' }} />)
            : <InsertDriveFileOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />}
          <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name}
          </Typography>

          <Box className="drive-actions" sx={{ display: 'flex', gap: 0.25, opacity: { xs: 1, md: 0 }, transition: 'opacity .15s' }} onClick={e => e.stopPropagation()}>
            {entry.isDir ? (
              <>
                <Tooltip title="Upload here">
                  <IconButton size="small" onClick={() => triggerUpload(path)}><FileUploadOutlinedIcon fontSize="inherit" /></IconButton>
                </Tooltip>
                <Tooltip title="New folder">
                  <IconButton size="small" onClick={() => { setNewFolderParent(path); setNewFolderName(''); }}><CreateNewFolderOutlinedIcon fontSize="inherit" /></IconButton>
                </Tooltip>
              </>
            ) : (
              <Tooltip title="Download">
                <IconButton size="small" onClick={() => handleDownload(path, entry.name)}><DownloadIcon fontSize="inherit" /></IconButton>
              </Tooltip>
            )}
            <Tooltip title="Delete">
              <IconButton size="small" color="error" onClick={() => handleDelete(path, entry.name, entry.isDir, parentPath)}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
            </Tooltip>
          </Box>
        </Box>

        {entry.isDir && isOpen && (
          <Box>
            {isLoading && !kids
              ? <Box sx={{ pl: depth * 2 + 5, py: 0.5 }}><CircularProgress size={16} /></Box>
              : kids && kids.length === 0
                ? <Typography variant="caption" color="text.disabled" sx={{ pl: depth * 2 + 5, display: 'block', py: 0.3 }}>empty</Typography>
                : kids?.map(child => renderNode(child, path, depth + 1))}
          </Box>
        )}
      </Box>
    );
  };

  const rootKids = childrenByPath[rootPath];
  const rootLoading = loadingPaths.has(rootPath);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Hidden input shared by all uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => onFilesPicked(e.target.files)}
      />

      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ mr: 1 }}>Drive</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rootPath}
        </Typography>
        <Button size="small" startIcon={<FileUploadOutlinedIcon />} onClick={() => triggerUpload(rootPath)}>Upload</Button>
        <Button size="small" startIcon={<CreateNewFolderOutlinedIcon />} onClick={() => { setNewFolderParent(rootPath); setNewFolderName(''); }}>New folder</Button>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={() => loadDir(rootPath)} disabled={busy}><RefreshIcon fontSize="small" /></IconButton>
          </span>
        </Tooltip>
        {busy && <CircularProgress size={18} />}
      </Box>

      {error && <Alert severity="error" sx={{ m: 1 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Tree */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {rootLoading && !rootKids
          ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          : rootKids && rootKids.length === 0
            ? <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>This drive is empty — use Upload or New folder.</Typography>
            : rootKids?.map(entry => renderNode(entry, rootPath, 0))}
      </Box>

      {/* New folder dialog */}
      <Dialog open={newFolderParent != null} onClose={() => setNewFolderParent(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '1rem' }}>New folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" label="Folder name" sx={{ mt: 1 }}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitNewFolder(); }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            in {newFolderParent}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderParent(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitNewFolder} disabled={!newFolderName.trim() || busy}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
