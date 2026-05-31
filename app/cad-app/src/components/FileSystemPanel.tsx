import { useState, useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import DataObjectIcon from '@mui/icons-material/DataObject';
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

type FileKind = 'image' | 'audio' | 'model' | 'data' | 'file';

function getFileKind(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['obj', 'gltf', 'glb', 'stl', 'fbx', 'dae', 'ply', '3ds'].includes(ext)) return 'model';
  if (['json', 'cad', 'scene', 'elec'].includes(ext)) return 'data';
  return 'file';
}

const KIND_COLOR: Record<FileKind, string> = {
  image: '#81d4fa',
  audio: '#ce93d8',
  model: '#a5d6a7',
  data:  '#ffe082',
  file:  '#9e9e9e',
};

function FileKindIcon({ kind, sx }: { kind: FileKind; sx?: object }) {
  switch (kind) {
    case 'image': return <ImageIcon sx={sx} />;
    case 'audio': return <AudioFileIcon sx={sx} />;
    case 'model': return <ViewInArIcon sx={sx} />;
    case 'data':  return <DataObjectIcon sx={sx} />;
    default:      return <InsertDriveFileIcon sx={sx} />;
  }
}

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
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const [collapsed, setCollapsed] = useState(true);
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<VfsDirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const dragCountRef = useRef(0);
  const folderDragCountRef = useRef<Record<string, number>>({});
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

  const uploadFiles = useCallback(async (files: File[], targetPath: string) => {
    for (const file of files) {
      const id = `${file.name}-${Date.now()}`;
      setUploads(prev => [...prev, { id, name: file.name, progress: 0 }]);
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 0.5 } : u));
        await vfsWriteFileBin(joinPath(targetPath, file.name), data);
        setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 1 } : u));
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== id)), 1500);
        if (targetPath === currentPath) await loadDir(currentPath);
      } catch (e) {
        setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 0, error: String(e) } : u));
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== id)), 4000);
      }
    }
  }, [currentPath, loadDir]);

  // ── panel-level drag (drops on empty area → currentPath) ──────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.size > 0);
    if (files.length > 0) uploadFiles(files, currentPath);
  }, [uploadFiles, currentPath]);

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
    if (files.length > 0) uploadFiles(files, currentPath);
    e.target.value = '';
  }, [uploadFiles, currentPath]);

  // ── per-folder drag handlers (drops on a folder → upload into it) ─────────

  const makeFolderDragHandlers = useCallback((folderName: string) => {
    const folderPath = joinPath(currentPath, folderName);
    return {
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        folderDragCountRef.current[folderName] = (folderDragCountRef.current[folderName] ?? 0) + 1;
        setDragOverFolder(folderName);
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const count = (folderDragCountRef.current[folderName] ?? 1) - 1;
        folderDragCountRef.current[folderName] = count;
        if (count <= 0) {
          folderDragCountRef.current[folderName] = 0;
          setDragOverFolder(prev => prev === folderName ? null : prev);
        }
      },
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        folderDragCountRef.current[folderName] = 0;
        setDragOverFolder(null);
        // also reset panel-level drag state
        dragCountRef.current = 0;
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.size > 0);
        if (files.length > 0) uploadFiles(files, folderPath);
      },
    };
  }, [currentPath, uploadFiles]);

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

          {/* File entries — list on compact (mobile/tablet), icon grid on desktop */}
          <Box sx={{
            maxHeight: isCompact ? 164 : 200, overflowY: 'auto',
            px: isCompact ? 0 : 0.75, pt: isCompact ? 0 : 0.5,
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
          }}>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: isCompact ? 1.5 : 2 }}>
                <CircularProgress size={isCompact ? 14 : 16} />
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

            {isCompact ? (
              /* ── List view (mobile / tablet) ── */
              entries.map(entry => {
                const isConfirm = confirmDelete === entry.name;
                const isDrop = entry.isDir && dragOverFolder === entry.name;
                const kind = entry.isDir ? null : getFileKind(entry.name);
                const iconColor = entry.isDir ? (isDrop ? '#4fc3f7' : '#ffb74d') : KIND_COLOR[kind!];
                return (
                  <Box
                    key={entry.name}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.5,
                      px: 1, py: '3px',
                      cursor: entry.isDir ? 'pointer' : 'default',
                      bgcolor: isDrop ? 'rgba(79,195,247,0.12)' : undefined,
                      outline: isDrop ? '1px dashed rgba(79,195,247,0.6)' : undefined,
                      outlineOffset: -1, borderRadius: '3px',
                      '&:hover': { bgcolor: isDrop ? 'rgba(79,195,247,0.12)' : 'rgba(255,255,255,0.05)' },
                      '&:hover .row-actions': { opacity: 1 },
                    }}
                    onClick={entry.isDir ? () => navigate(entry.name) : undefined}
                    {...(entry.isDir ? makeFolderDragHandlers(entry.name) : {})}
                  >
                    {entry.isDir
                      ? <FolderIcon sx={{ fontSize: 13, color: iconColor, flexShrink: 0 }} />
                      : <FileKindIcon kind={kind!} sx={{ fontSize: 13, color: iconColor, flexShrink: 0 }} />
                    }
                    <Typography variant="caption" noWrap sx={{ flex: 1, fontSize: 10, color: entry.isDir ? 'text.primary' : 'text.secondary' }}>
                      {entry.name}{entry.isDir ? '/' : ''}
                    </Typography>
                    <Box className="row-actions" sx={{ display: 'flex', gap: 0.25, opacity: 0, transition: 'opacity 0.1s', flexShrink: 0 }}>
                      {!entry.isDir && (
                        <Tooltip title={`Download ${entry.name}`}>
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={e => { e.stopPropagation(); handleDownload(entry.name); }}>
                            <DownloadIcon sx={{ fontSize: 11 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={isConfirm ? 'Click again to confirm delete' : `Delete ${entry.name}`}>
                        <IconButton size="small" sx={{ p: 0.25, color: isConfirm ? 'error.main' : undefined }}
                          onClick={e => { e.stopPropagation(); handleDelete(entry.name); }}>
                          <DeleteOutlineIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                );
              })
            ) : (
              /* ── Icon grid (desktop) ── */
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {entries.map(entry => {
                  const isConfirm = confirmDelete === entry.name;
                  const isDrop = entry.isDir && dragOverFolder === entry.name;
                  const kind = entry.isDir ? null : getFileKind(entry.name);
                  const iconColor = entry.isDir ? (isDrop ? '#4fc3f7' : '#ffb74d') : KIND_COLOR[kind!];
                  return (
                    <Tooltip key={entry.name} title={entry.name} placement="top" enterDelay={600}>
                      <Box
                        sx={{
                          position: 'relative', width: 68, flexShrink: 0,
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          px: 0.5, pt: 0.75, pb: 0.5, borderRadius: '6px',
                          cursor: entry.isDir ? 'pointer' : 'default',
                          bgcolor: isDrop ? 'rgba(79,195,247,0.15)' : 'transparent',
                          outline: isDrop ? '1px dashed rgba(79,195,247,0.7)' : '1px solid transparent',
                          transition: 'background-color 0.1s',
                          '&:hover': { bgcolor: isDrop ? 'rgba(79,195,247,0.15)' : 'rgba(255,255,255,0.07)' },
                          '&:hover .icon-actions': { opacity: 1 },
                        }}
                        onClick={entry.isDir ? () => navigate(entry.name) : undefined}
                        {...(entry.isDir ? makeFolderDragHandlers(entry.name) : {})}
                      >
                        {entry.isDir
                          ? <FolderIcon sx={{ fontSize: 36, color: iconColor }} />
                          : <FileKindIcon kind={kind!} sx={{ fontSize: 36, color: iconColor }} />
                        }
                        <Typography variant="caption" sx={{
                          mt: 0.25, fontSize: 11, lineHeight: 1.3, textAlign: 'center',
                          color: 'text.secondary', wordBreak: 'break-all',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', width: '100%',
                        }}>
                          {entry.name}
                        </Typography>
                        <Box className="icon-actions" sx={{
                          position: 'absolute', top: 2, right: 2,
                          display: 'flex', flexDirection: 'column', gap: 0.25,
                          opacity: 0, transition: 'opacity 0.1s',
                        }} onClick={e => e.stopPropagation()}>
                          {!entry.isDir && (
                            <Tooltip title="Download" placement="right">
                              <IconButton size="small"
                                sx={{ p: '2px', bgcolor: 'rgba(0,0,0,0.55)', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                                onClick={() => handleDownload(entry.name)}>
                                <DownloadIcon sx={{ fontSize: 10 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title={isConfirm ? 'Confirm delete' : 'Delete'} placement="right">
                            <IconButton size="small"
                              sx={{ p: '2px', bgcolor: isConfirm ? 'rgba(211,47,47,0.7)' : 'rgba(0,0,0,0.55)', '&:hover': { bgcolor: 'rgba(211,47,47,0.8)' }, color: isConfirm ? '#fff' : undefined }}
                              onClick={() => handleDelete(entry.name)}>
                              <DeleteOutlineIcon sx={{ fontSize: 10 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            )}
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
