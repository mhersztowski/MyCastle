import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, List, ListItem, ListItemButton, ListItemText,
  TextField, Typography, Box, IconButton, Tooltip, CircularProgress,
  Chip,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import {
  listScene3dProjects, listScene3dFiles,
  readScene3dFile,
  deleteScene3dFile, deleteScene3dProject, renameScene3dProject,
} from '../vfs/cadProjectApi';
import type { Scene3DProjectMeta, Scene3DFileMeta } from '../vfs/cadProjectApi';
import { syncOpenUrl } from '../vfs/openTarget';
import { getCurrentUserId } from '../vfs/cadProjectApi';

interface Props {
  open: boolean;
  mode: 'open' | 'save';
  onClose: () => void;
  onOpen?: (json: string, project: string, file: string) => void;
  onSave?: (project: string, file: string) => Promise<void>;
}

type View = { level: 'projects' } | { level: 'files'; project: string };

function formatDate(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Scene3DProjectBrowser({ open, mode, onClose, onOpen, onSave }: Props) {
  const [view, setView] = useState<View>({ level: 'projects' });
  const [projects, setProjects] = useState<Scene3DProjectMeta[]>([]);
  const [files, setFiles] = useState<Scene3DFileMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // inline name input (new project / new file / save-as)
  const [newProjectName, setNewProjectName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);

  // rename
  const [renameTarget, setRenameTarget] = useState<{ type: 'project'; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'project' | 'file'; name: string } | null>(null);

  const isMounted = useRef(true);
  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

  // ── loaders ──────────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await listScene3dProjects();
      if (isMounted.current) setProjects(list);
    } catch (e) {
      if (isMounted.current) setError(String(e));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async (project: string) => {
    setLoading(true); setError(null);
    try {
      const list = await listScene3dFiles(project);
      if (isMounted.current) setFiles(list);
    } catch (e) {
      if (isMounted.current) setError(String(e));
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView({ level: 'projects' });
    setNewProjectName(''); setNewFileName('');
    setShowNewProject(false); setShowNewFile(false);
    setError(null);
    loadProjects();
  }, [open, loadProjects]);

  const openProject = useCallback((name: string) => {
    setView({ level: 'files', project: name });
    setShowNewFile(false); setNewFileName('');
    loadFiles(name);
  }, [loadFiles]);

  // ── open file ─────────────────────────────────────────────────────────────
  const handleOpenFile = useCallback(async (file: string) => {
    if (view.level !== 'files') return;
    setBusy(true); setError(null);
    try {
      const json = await readScene3dFile(view.project, file);
      // Ścieżka w kształcie, jakiego używa viewer/`/open/` dla Scene 3D.
      syncOpenUrl(`users/${getCurrentUserId()}/scene3d/${view.project}/${file}`);
      onOpen?.(json, view.project, file);
      onClose();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [view, onOpen, onClose]);

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (project: string, file: string) => {
    const p = project.trim(); const f = file.trim();
    if (!p || !f) return;
    setBusy(true); setError(null);
    try {
      await onSave?.(p, f);
      onClose();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [onSave, onClose]);

  // ── new project ───────────────────────────────────────────────────────────
  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    if (mode === 'save') {
      // jump straight to files view in new project (will be created on first write)
      setView({ level: 'files', project: name });
      setFiles([]);
      setNewProjectName(''); setShowNewProject(false);
      setShowNewFile(true); setNewFileName('main');
    } else {
      // just navigate into it (empty dir — user can't open anything yet)
      openProject(name);
      setNewProjectName(''); setShowNewProject(false);
    }
  }, [newProjectName, mode, openProject]);

  // ── rename project ────────────────────────────────────────────────────────
  const handleRenameConfirm = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setBusy(true); setError(null);
    try {
      await renameScene3dProject(renameTarget.name, renameValue.trim());
      setRenameTarget(null);
      await loadProjects();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [renameTarget, renameValue, loadProjects]);

  // ── delete ────────────────────────────────────────────────────────────────
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true); setError(null);
    try {
      if (deleteTarget.type === 'project') {
        await deleteScene3dProject(deleteTarget.name);
        await loadProjects();
      } else if (view.level === 'files') {
        await deleteScene3dFile(view.project, deleteTarget.name);
        await loadFiles(view.project);
      }
      setDeleteTarget(null);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }, [deleteTarget, view, loadProjects, loadFiles]);

  const currentProject = view.level === 'files' ? view.project : null;

  return (
    <>
      <Dialog
        open={open} onClose={onClose} maxWidth="sm" fullWidth
        PaperProps={{ sx: { height: '80vh', display: 'flex', flexDirection: 'column' } }}
      >
        {/* ── Title / breadcrumb ── */}
        <DialogTitle sx={{ py: 1, px: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          {view.level === 'files' && (
            <IconButton size="small" onClick={() => { setView({ level: 'projects' }); loadProjects(); }} sx={{ mr: 0.5, p: 0.5 }}>
              <ArrowBackIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.2 }}>
              {mode === 'open' ? 'Open Scene' : 'Save Scene'}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              {view.level === 'projects' ? 'Projects' : `Projects / ${view.project}`}
            </Typography>
          </Box>
          {/* New project button (projects view) */}
          {view.level === 'projects' && (
            <Tooltip title="New project">
              <IconButton size="small" onClick={() => setShowNewProject(v => !v)} sx={{ p: 0.5 }}>
                <CreateNewFolderOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          {/* New file button (files view, save mode) */}
          {view.level === 'files' && mode === 'save' && (
            <Tooltip title="Save as new file">
              <IconButton size="small" onClick={() => setShowNewFile(v => !v)} sx={{ p: 0.5 }}>
                <NoteAddOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </DialogTitle>

        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

          {/* ── New project input ── */}
          {showNewProject && (
            <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
              <TextField
                autoFocus size="small" fullWidth label="New project name" placeholder="MyProject"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false); }}
              />
              <Button size="small" variant="contained" onClick={handleCreateProject} disabled={!newProjectName.trim()} sx={{ textTransform: 'none', flexShrink: 0 }}>
                {mode === 'save' ? 'Create & Save' : 'Create'}
              </Button>
            </Box>
          )}

          {/* ── New/save file input (files view, save mode) ── */}
          {view.level === 'files' && (showNewFile || files.length === 0) && mode === 'save' && (
            <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                autoFocus size="small" fullWidth label="Scene file name" placeholder="main"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(currentProject!, newFileName); if (e.key === 'Escape') setShowNewFile(false); }}
                slotProps={{ input: { endAdornment: <Typography sx={{ color: 'text.disabled', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>.json</Typography> } }}
              />
              <Button
                size="small" variant="contained" startIcon={<SaveOutlinedIcon />}
                disabled={!newFileName.trim() || busy}
                onClick={() => handleSave(currentProject!, newFileName)}
                sx={{ textTransform: 'none', flexShrink: 0 }}
              >
                Save
              </Button>
            </Box>
          )}

          {/* ── List ── */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                <CircularProgress size={28} />
              </Box>
            )}

            {/* Projects list */}
            {!loading && view.level === 'projects' && (
              projects.length === 0 ? (
                <Box sx={{ textAlign: 'center', pt: 5, px: 2 }}>
                  <FolderIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>
                    No projects yet. Click <b>+</b> to create one.
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {projects.map(p => (
                    <ListItem
                      key={p.name} disablePadding
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                          <Tooltip title="Rename project">
                            <IconButton size="small" sx={{ p: 0.5 }}
                              onClick={e => { e.stopPropagation(); setRenameTarget({ type: 'project', name: p.name }); setRenameValue(p.name); }}>
                              <DriveFileRenameOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete project">
                            <IconButton size="small" sx={{ p: 0.5, color: 'error.main' }}
                              onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'project', name: p.name }); }}>
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemButton onClick={() => openProject(p.name)} sx={{ pr: 9 }}>
                        <FolderIcon sx={{ fontSize: 20, color: '#4fc3f7', mr: 1.5, flexShrink: 0 }} />
                        <ListItemText
                          primary={p.name}
                          secondary={`${p.fileCount} file${p.fileCount !== 1 ? 's' : ''}  ·  ${formatDate(p.mtime)}`}
                          slotProps={{
                            primary: { sx: { fontSize: '0.82rem', fontWeight: 500 } },
                            secondary: { sx: { fontSize: '0.65rem' } },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )
            )}

            {/* Files list */}
            {!loading && view.level === 'files' && (
              files.length === 0 ? (
                <Box sx={{ textAlign: 'center', pt: 5, px: 2 }}>
                  <InsertDriveFileOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>
                    {mode === 'save' ? 'Enter a name above to save a new scene.' : 'No scenes in this project yet.'}
                  </Typography>
                </Box>
              ) : (
                <List dense disablePadding>
                  {files.map(f => (
                    <ListItem
                      key={f.name} disablePadding
                      secondaryAction={
                        <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center' }}>
                          <Chip label={formatSize(f.size)} size="small" sx={{ height: 18, fontSize: '0.6rem', '.MuiChip-label': { px: 0.75 } }} />
                          {mode === 'save' && (
                            <Tooltip title="Overwrite this file">
                              <IconButton size="small" sx={{ p: 0.5, color: 'warning.main' }}
                                onClick={e => { e.stopPropagation(); handleSave(view.project, f.name); }}>
                                <SaveOutlinedIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Delete file">
                            <IconButton size="small" sx={{ p: 0.5, color: 'error.main' }}
                              onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'file', name: f.name }); }}>
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemButton
                        onDoubleClick={() => mode === 'open' ? handleOpenFile(f.name) : handleSave(view.project, f.name)}
                        sx={{ pr: mode === 'save' ? 14 : 10 }}
                      >
                        <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', mr: 1.5, flexShrink: 0 }} />
                        <ListItemText
                          primary={`${f.name}.json`}
                          secondary={formatDate(f.mtime)}
                          slotProps={{
                            primary: { sx: { fontSize: '0.8rem', fontWeight: 500 } },
                            secondary: { sx: { fontSize: '0.65rem' } },
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )
            )}
          </Box>

          {error && (
            <Box sx={{ px: 2, py: 0.75, flexShrink: 0, borderTop: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontSize: '0.72rem', color: 'error.main' }}>{error}</Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          {mode === 'open' && view.level === 'files' && (
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', mr: 'auto' }}>
              Double-click a file to open it.
            </Typography>
          )}
          {mode === 'save' && view.level === 'files' && (
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', mr: 'auto' }}>
              Double-click to overwrite, or enter a new name above.
            </Typography>
          )}
          <Button size="small" onClick={onClose} disabled={busy} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', pb: 1 }}>Rename Project</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField autoFocus fullWidth size="small" label="New name"
            value={renameValue} onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(); }} />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button size="small" variant="contained" onClick={handleRenameConfirm} disabled={busy}>Rename</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', pb: 1 }}>
          {deleteTarget?.type === 'project' ? 'Delete Project' : 'Delete File'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.8rem' }}>
            {deleteTarget?.type === 'project'
              ? <>Delete project <b>{deleteTarget.name}</b> and all its scene files?</>
              : <>Delete <b>{deleteTarget?.name}.json</b>?</>
            }{' '}This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button size="small" variant="contained" color="error" onClick={handleDeleteConfirm} disabled={busy}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
