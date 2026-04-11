import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import StorageIcon from '@mui/icons-material/Storage';
import FolderOffOutlinedIcon from '@mui/icons-material/FolderOffOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import VrpanoIcon from '@mui/icons-material/Vrpano';
import type { Project } from '@mhersztowski/core-cad';
import { loadProjectFromText } from '../io/CadExporter';
import {
  deleteProject,
  getCurrentUserId,
  listProjects,
  type ProjectMeta,
  readProject,
  readSceneProject,
  renameProject,
  writeProject,
  writeSceneProject,
} from '../vfs/cadProjectApi';

interface Props {
  open: boolean;
  /** 'open' = choose a project to load; 'save' = choose/enter name to save */
  mode: 'open' | 'save';
  project: Project;
  onClose: () => void;
  /** Called after a successful open or save with the project name */
  onDone?: (name: string) => void;
  /** Returns current Scene3D JSON to save alongside the CAD project */
  getSceneData?: () => string | null;
  /** Called when the opened project has a companion .scene.json */
  onSceneData?: (json: string) => void;
}

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

export function ProjectBrowser({ open, mode, project, onClose, onDone, getSceneData, onSceneData }: Props) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const userId = getCurrentUserId();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listProjects(userId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) {
      reload();
      setSelected(null);
      setSaveName('');
      setRenamingId(null);
      setError(null);
    }
  }, [open, reload]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId) {
      setTimeout(() => renameRef.current?.select(), 50);
    }
  }, [renamingId]);

  // ── actions ────────────────────────────────────────────────────────────────

  async function handleOpen(name: string) {
    setBusy(true);
    setError(null);
    try {
      const jsonText = await readProject(name, userId);
      loadProjectFromText(jsonText, project);

      // Try to load the companion Scene3D file (non-fatal if absent)
      if (onSceneData) {
        try {
          const sceneJson = await readSceneProject(name, userId);
          onSceneData(sceneJson);
        } catch {
          // No .scene.json saved yet — that's fine
        }
      }

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
    if (!name) return;

    // Confirm overwrite if project with same name exists
    if (projects.some(p => p.name === name)) {
      if (!window.confirm(`Overwrite existing project "${name}"?`)) return;
    }

    setBusy(true);
    setError(null);
    try {
      await writeProject(name, JSON.stringify(project.toJSON()), userId);

      // Also save the Scene3D data if available
      const sceneJson = getSceneData?.();
      if (sceneJson) {
        try {
          await writeSceneProject(name, sceneJson, userId);
        } catch {
          // Non-fatal — CAD data was saved successfully
        }
      }

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
    if (!window.confirm(`Delete project "${name}"?`)) return;
    setBusy(true);
    try {
      await deleteProject(name, userId);
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
      await renameProject(oldName, newName, userId);
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

  const title = mode === 'open' ? 'Open Project from Server' : 'Save Project to Server';
  const confirmLabel = mode === 'open' ? 'Open' : 'Save';

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

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 280 }}>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mt: 1 }}>
            {error}
          </Alert>
        )}

        {/* Project list */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}>
              <CircularProgress size={28} />
            </Box>
          ) : projects.length === 0 ? (
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 180, color: 'text.disabled', gap: 1,
            }}>
              <FolderOffOutlinedIcon sx={{ fontSize: 40, opacity: 0.4 }} />
              <Typography variant="body2">No saved projects yet</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {projects.map(p => (
                <ListItemButton
                  key={p.name}
                  selected={selected === p.name}
                  onDoubleClick={() => mode === 'open' && handleOpen(p.name)}
                  onClick={() => {
                    setSelected(p.name);
                    if (mode === 'save') setSaveName(p.name);
                  }}
                  sx={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    '&.Mui-selected': { bgcolor: 'rgba(79,195,247,0.12)' },
                  }}
                >
                  {/* Name / rename inline editor */}
                  <ListItemText
                    primary={
                      renamingId === p.name ? (
                        <TextField
                          inputRef={renameRef}
                          value={renameValue}
                          size="small"
                          variant="standard"
                          autoFocus
                          onClick={e => e.stopPropagation()}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(p.name)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(p.name);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          sx={{ width: '100%' }}
                          slotProps={{ input: { sx: { fontSize: 13 } } }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {p.name}
                        </Typography>
                      )
                    }
                    secondary={
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {formatDate(p.mtime)}{p.size ? `  ·  ${formatSize(p.size)}` : ''}
                      </Typography>
                    }
                  />

                  {/* Row actions */}
                  <Box sx={{ display: 'flex', gap: 0.25, ml: 1, flexShrink: 0 }}>
                    <Tooltip title="Open in Scene Viewer">
                      <IconButton
                        size="small"
                        onClick={e => {
                          e.stopPropagation();
                          window.open(`/viewer/scene/${encodeURIComponent(p.name)}`, '_blank');
                        }}
                        sx={{ color: 'primary.main' }}
                      >
                        <ViewInArIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Open in VR Viewer">
                      <IconButton
                        size="small"
                        onClick={e => {
                          e.stopPropagation();
                          window.open(`/viewer/vr/${encodeURIComponent(p.name)}`, '_blank');
                        }}
                        sx={{ color: '#ce93d8' }}
                      >
                        <VrpanoIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Rename">
                      <IconButton
                        size="small"
                        onClick={e => startRename(p.name, e)}
                        disabled={busy}
                      >
                        <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={e => handleDelete(p.name, e)}
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
              label="Project name"
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
                        .cad.json
                      </Typography>
                    </InputAdornment>
                  ),
                  sx: { fontFamily: 'monospace', fontSize: 13 },
                },
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
