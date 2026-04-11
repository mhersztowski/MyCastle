import { useRef, useState } from 'react';
import {
  Button,
  CircularProgress,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Alert,
} from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { Project } from '@mhersztowski/core-cad';
import { exportDXF, exportGLTF, exportJSON, exportOBJ, exportSVG, importJSON } from '../io/CadExporter';
import { ProjectBrowser } from './ProjectBrowser';

interface Props {
  project: Project;
  /** Returns the current Scene3D JSON, or null if no scene is loaded */
  getSceneData?: () => string | null;
  /** Called when a project with a companion .scene.json is opened */
  onSceneData?: (json: string) => void;
}

type BrowserMode = 'open' | 'save';

export function FileMenu({ project, getSceneData, onSceneData }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [browserMode, setBrowserMode] = useState<BrowserMode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const open = Boolean(anchor);
  const close = () => setAnchor(null);

  function handleNew() {
    close();
    if (!window.confirm('Discard current project and start new?')) return;
    project.reset();
  }

  function handleOpenServer() {
    close();
    setBrowserMode('open');
  }

  function handleSaveServer() {
    close();
    setBrowserMode('save');
  }

  function handleSaveJSON() {
    close();
    exportJSON(project);
  }

  function handleLoadClick() {
    close();
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importJSON(file, project);
      setToast({ msg: 'Project loaded', severity: 'success' });
    } catch (err) {
      setToast({ msg: (err as Error).message, severity: 'error' });
    }
  }

  function handleSVG() {
    close();
    exportSVG(project);
  }

  function handleDXF() {
    close();
    exportDXF(project);
  }

  function handleOBJ() {
    close();
    exportOBJ(project);
  }

  async function handleGLTF(binary: boolean) {
    close();
    setBusy(true);
    try {
      await exportGLTF(project, binary);
    } catch (err) {
      setToast({ msg: `glTF export failed: ${(err as Error).message}`, severity: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="small"
        endIcon={busy ? <CircularProgress size={12} /> : <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          fontSize: 12,
          textTransform: 'none',
          color: 'text.secondary',
          px: 1,
          minWidth: 0,
          '&:hover': { color: 'text.primary' },
        }}
      >
        File
      </Button>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={close}
        slotProps={{ paper: { sx: { minWidth: 200 } } }}
      >
        <MenuItem onClick={handleNew} dense>
          <ListItemIcon><ArticleOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>New</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleOpenServer} dense>
          <ListItemIcon><CloudDownloadOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
          <ListItemText primary="Open from Server…" secondary="Browse server projects" />
        </MenuItem>
        <MenuItem onClick={handleSaveServer} dense>
          <ListItemIcon><CloudUploadOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
          <ListItemText primary="Save to Server…" secondary="Persist in VFS" />
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleLoadClick} dense>
          <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open JSON (local)…</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSaveJSON} dense>
          <ListItemIcon><SaveOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Save JSON (local)</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleSVG} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export SVG" secondary="2D vector (web-ready)" />
        </MenuItem>
        <MenuItem onClick={handleDXF} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export DXF" secondary="2D CAD (AutoCAD)" />
        </MenuItem>
        <MenuItem onClick={handleOBJ} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export OBJ" secondary="3D mesh (Wavefront)" />
        </MenuItem>
        <MenuItem onClick={() => handleGLTF(false)} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export glTF" secondary="3D scene (JSON)" />
        </MenuItem>
        <MenuItem onClick={() => handleGLTF(true)} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export glTF Binary" secondary="3D scene (.glb)" />
        </MenuItem>
      </Menu>

      {/* Hidden file input for JSON load */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.cad.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>

      {browserMode && (
        <ProjectBrowser
          open={Boolean(browserMode)}
          mode={browserMode}
          project={project}
          getSceneData={getSceneData}
          onSceneData={onSceneData}
          onClose={() => setBrowserMode(null)}
          onDone={name => setToast({ msg: `${browserMode === 'open' ? 'Opened' : 'Saved'}: ${name}`, severity: 'success' })}
        />
      )}
    </>
  );
}
