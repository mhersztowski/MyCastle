import { useState, useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { vfsListDir, vfsReadFileBin, vfsWriteFileBin, vfsDeletePath } from '../vfs/cadProjectApi';
import type { VfsDirEntry } from '../vfs/cadProjectApi';

// ── helpers ────────────────────────────────────────────────────────────────────

function joinPath(...parts: string[]): string {
  return ('/' + parts.map(p => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')).replace(/\/+/g, '/');
}

function parentPath(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  parts.pop();
  return parts.length === 0 ? '/' : '/' + parts.join('/');
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(ext)) return 'image';
  if (['obj', 'gltf', 'glb', 'stl', 'fbx', 'dae', 'ply', '3ds'].includes(ext)) return 'model';
  if (['json', 'cad', 'scene', 'elec'].includes(ext)) return 'data';
  return 'file';
}

const FILE_ICON_COLORS: Record<string, string> = {
  image: '#81d4fa',
  model: '#a5d6a7',
  data:  '#ffe082',
  file:  '#9e9e9e',
};

interface UploadItem {
  id: string;
  name: string;
  progress: number;  // 0–1
  error?: string;
}

// ── component ──────────────────────────────────────────────────────────────────

interface Props {
  /** VFS root path the panel is locked to — cannot navigate above this. */
  rootPath: string;
  /** Optional label in the header. Default "Files". */
  title?: string;
}

export function FileSystemPanel({ rootPath, title = 'Files' }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<VfsDirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const dragCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await vfsListDir(path);
      list.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(list);
      setCurrentPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDir(rootPath); }, [rootPath, loadDir]);

  const canGoUp = currentPath !== rootPath && parentPath(currentPath).startsWith(rootPath);

  const goUp = useCallback(() => {
    const p = parentPath(currentPath);
    loadDir(p.startsWith(rootPath) ? p : rootPath);
  }, [currentPath, rootPath, loadDir]);

  const navigate = useCallback((name: string) => {
    loadDir(joinPath(currentPath, name));
  }, [currentPath, loadDir]);

  // ── download ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (name: string) => {
    try {
      const path = joinPath(currentPath, name);
      const data = await vfsReadFileBin(path);
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
      console.error('[FileSystemPanel] download failed', e);
    }
  }, [currentPath]);

  // ── delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (name: string) => {
    if (confirmDelete !== name) { setConfirmDelete(name); return; }
    setConfirmDelete(null);
    try {
      await vfsDeletePath(joinPath(currentPath, name));
      await loadDir(currentPath);
    } catch (e) {
      console.error('[FileSystemPanel] delete failed', e);
    }
  }, [confirmDelete, currentPath, loadDir]);

  // ── upload ────────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const id = `${file.name}-${Date.now()}`;
      setUploads(prev => [...prev, { id, name: file.name, progress: 0 }]);
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        // Simulate progress since VFS has no progress callback
        setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 0.5 } : u));
        await vfsWriteFileBin(joinPath(currentPath, file.name), data);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 1 } : u));
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== id)), 1500);
        await loadDir(currentPath);
      } catch (e) {
        setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 0, error: String(e) } : u));
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== id)), 4000);
      }
    }
  }, [currentPath, loadDir]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.size > 0);
    if (files.length > 0) uploadFiles(files);
  }, [uploadFiles]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (--dragCountRef.current <= 0) { dragCountRef.current = 0; setIsDragOver(false); }
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadFiles(files);
    e.target.value = '';
  }, [uploadFiles]);

  // relative path for header display
  const relPath = currentPath === rootPath ? '/' : (currentPath.slice(rootPath.length) || '/');

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        bgcolor: isDragOver ? 'rgba(79,195,247,0.06)' : 'rgba(255,255,255,0.02)',
        outline: isDragOver ? '2px dashed rgba(79,195,247,0.5)' : '2px dashed transparent',
        outlineOffset: -2,
        transition: 'background-color 0.12s, outline-color 0.12s',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', px: 1, height: 24,
          cursor: 'pointer', userSelect: 'none',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <FolderOpenIcon sx={{ fontSize: 12, color: '#ffb74d', mr: 0.5, flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'text.secondary' }}>
          {title}
        </Typography>
        {!collapsed && (
          <Typography variant="caption" sx={{ ml: 0.75, fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {relPath}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {!collapsed && (
          <Tooltip title="Refresh">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={e => { e.stopPropagation(); loadDir(currentPath); }}>
              <RefreshIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
          <IconButton size="small" sx={{ p: 0 }}>
            {collapsed ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ExpandLessIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {!collapsed && (
        <Box sx={{ pb: 0.5 }}>
          {/* Navigation bar */}
          {canGoUp && (
            <Box sx={{ display: 'flex', alignItems: 'center', px: 0.5, height: 20 }}>
              <Tooltip title="Go up">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={goUp}>
                  <ArrowBackIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled', fontFamily: 'monospace', ml: 0.25 }}>
                {relPath}
              </Typography>
            </Box>
          )}

          {/* File list */}
          <Box sx={{
            maxHeight: 164, overflowY: 'auto',
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
          }}>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
                <CircularProgress size={14} />
              </Box>
            )}
            {error && (
              <Typography variant="caption" color="error.main" sx={{ px: 1, py: 0.75, display: 'block', fontSize: 10 }}>
                {error}
              </Typography>
            )}
            {!loading && !error && entries.length === 0 && (
              <Typography variant="caption" sx={{ px: 1, py: 1, display: 'block', fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>
                Empty — drop files here to upload
              </Typography>
            )}
            {entries.map(entry => {
              const isConfirm = confirmDelete === entry.name;
              const iconColor = entry.isDir ? '#ffb74d' : FILE_ICON_COLORS[getFileIcon(entry.name)];
              return (
                <Box
                  key={entry.name}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    px: 1, py: '3px',
                    cursor: entry.isDir ? 'pointer' : 'default',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                    '&:hover .row-actions': { opacity: 1 },
                  }}
                  onClick={entry.isDir ? () => navigate(entry.name) : undefined}
                >
                  {entry.isDir
                    ? <FolderIcon sx={{ fontSize: 13, color: iconColor, flexShrink: 0 }} />
                    : <InsertDriveFileIcon sx={{ fontSize: 13, color: iconColor, flexShrink: 0 }} />
                  }
                  <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: 10, color: entry.isDir ? 'text.primary' : 'text.secondary' }}>
                    {entry.name}{entry.isDir ? '/' : ''}
                  </Typography>

                  {/* Per-row actions (fade in on hover) */}
                  <Box className="row-actions" sx={{ display: 'flex', gap: 0.25, opacity: 0, transition: 'opacity 0.1s', flexShrink: 0 }}>
                    {!entry.isDir && (
                      <Tooltip title={`Download ${entry.name}`}>
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={e => { e.stopPropagation(); handleDownload(entry.name); }}>
                          <DownloadIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={isConfirm ? 'Click again to confirm delete' : `Delete ${entry.name}`}>
                      <IconButton
                        size="small"
                        sx={{ p: 0.25, color: isConfirm ? 'error.main' : undefined }}
                        onClick={e => { e.stopPropagation(); handleDelete(entry.name); }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 11 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Upload progress rows */}
          {uploads.map(u => (
            <Box key={u.id} sx={{ px: 1, py: 0.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: 9, color: u.error ? 'error.main' : 'text.secondary' }}>
                  {u.error ? `✗ ${u.name}: ${u.error}` : `↑ ${u.name}`}
                </Typography>
                {!u.error && u.progress === 1 && (
                  <Typography variant="caption" sx={{ fontSize: 9, color: 'success.main' }}>✓</Typography>
                )}
              </Box>
              {!u.error && u.progress < 1 && (
                <LinearProgress variant="determinate" value={u.progress * 100} sx={{ height: 2, borderRadius: 1 }} />
              )}
            </Box>
          ))}

          {/* Footer: drop hint + browse button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pt: 0.5 }}>
            <CloudUploadIcon sx={{ fontSize: 11, color: isDragOver ? 'primary.main' : 'text.disabled' }} />
            <Typography variant="caption" sx={{ fontSize: 9, color: isDragOver ? 'primary.main' : 'text.disabled' }}>
              {isDragOver ? 'Release to upload' : 'Drop files here or'}
            </Typography>
            {!isDragOver && (
              <label style={{ cursor: 'pointer' }}>
                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />
                <Typography component="span" variant="caption" sx={{ fontSize: 9, color: 'primary.main', textDecoration: 'underline', cursor: 'pointer' }}>
                  browse
                </Typography>
              </label>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
