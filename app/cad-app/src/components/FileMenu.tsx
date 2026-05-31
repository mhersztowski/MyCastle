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
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { Project } from '@mhersztowski/core-cad';
import { exportDXF, exportGLTF, exportJSON, exportOBJ, exportSTEP, exportSTL, exportSVG, importDXF, importJSON, importSTL } from '../io/CadExporter';
import { ProjectBrowser } from './ProjectBrowser';
import { ServerFileBrowser } from './ServerFileBrowser';
import { SCENE_EXT, readFileAt, writeFileAt } from '../vfs/cadProjectApi';

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
  const [sceneSaveOpen, setSceneSaveOpen] = useState(false);
  const [sceneOpenOpen, setSceneOpenOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const stlImportRef = useRef<HTMLInputElement>(null);

  const hasSceneData = Boolean(getSceneData?.());

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

  function handleSaveSceneServer() {
    close();
    setSceneSaveOpen(true);
  }

  function handleOpenSceneServer() {
    close();
    setSceneOpenOpen(true);
  }

  async function handleWriteScene(dir: string, name: string) {
    const sceneJson = getSceneData?.();
    if (!sceneJson) throw new Error('No Scene 3D data to save — open the Scene 3D tab first.');
    await writeFileAt(dir, name, SCENE_EXT, sceneJson);
  }

  async function handleReadScene(dir: string, name: string) {
    const sceneJson = await readFileAt(dir, name, SCENE_EXT);
    onSceneData?.(sceneJson);
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

  function handleImportDXFClick() {
    close();
    dxfInputRef.current?.click();
  }

  async function handleDxfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importDXF(file, project);
      setToast({ msg: 'DXF imported', severity: 'success' });
    } catch (err) {
      setToast({ msg: (err as Error).message, severity: 'error' });
    }
  }

  function handleImportSTLClick() {
    close();
    stlImportRef.current?.click();
  }

  async function handleStlFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const sceneJson = await importSTL(file);
      onSceneData?.(sceneJson);
      setToast({ msg: `STL loaded into Scene 3D: ${file.name}`, severity: 'success' });
    } catch (err) {
      setToast({ msg: (err as Error).message, severity: 'error' });
    }
  }

  function handleSTL() {
    close();
    exportSTL(project);
  }

  async function handleSTEP() {
    close();
    setBusy(true);
    try {
      await exportSTEP(project);
    } catch (err) {
      setToast({ msg: `STEP export failed: ${(err as Error).message}`, severity: 'error' });
    } finally {
      setBusy(false);
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
          <ListItemText primary="Open CAD from Server…" secondary="Reads .cad.json only" />
        </MenuItem>
        <MenuItem onClick={handleSaveServer} dense>
          <ListItemIcon><CloudUploadOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
          <ListItemText primary="Save CAD to Server…" secondary="Writes .cad.json only" />
        </MenuItem>
        <MenuItem onClick={handleOpenSceneServer} dense>
          <ListItemIcon><ViewInArIcon fontSize="small" sx={{ color: 'primary.main' }} /></ListItemIcon>
          <ListItemText primary="Open Scene 3D from Server…" secondary="Reads .scene.json only" />
        </MenuItem>
        <MenuItem onClick={handleSaveSceneServer} dense disabled={!hasSceneData}>
          <ListItemIcon><ViewInArIcon fontSize="small" sx={{ color: hasSceneData ? 'primary.main' : undefined }} /></ListItemIcon>
          <ListItemText
            primary="Save Scene 3D to Server…"
            secondary={hasSceneData ? 'Writes .scene.json only' : 'No scene loaded — open Scene 3D first'}
          />
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleLoadClick} dense>
          <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Open JSON (local)…</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleImportDXFClick} dense>
          <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Import DXF (local)…" secondary="Adds entities to current project" />
        </MenuItem>
        <MenuItem onClick={handleImportSTLClick} dense>
          <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Import STL (local)…" secondary="Loads mesh into Scene 3D tab" />
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
        <MenuItem onClick={handleSTL} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export STL" secondary="3D mesh (stereolithography)" />
        </MenuItem>
        <MenuItem onClick={handleSTEP} dense>
          <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Export STEP" secondary="3D solid (ISO 10303)" />
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
      {/* Hidden file input for DXF import */}
      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf"
        style={{ display: 'none' }}
        onChange={handleDxfFileChange}
      />
      {/* Hidden file input for STL import */}
      <input
        ref={stlImportRef}
        type="file"
        accept=".stl"
        style={{ display: 'none' }}
        onChange={handleStlFileChange}
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
          onClose={() => setBrowserMode(null)}
          onDone={name => setToast({ msg: `${browserMode === 'open' ? 'Opened CAD' : 'Saved CAD'}: ${name}`, severity: 'success' })}
        />
      )}

      {sceneOpenOpen && (
        <ServerFileBrowser
          open
          mode="open"
          title="Open Scene 3D from Server"
          extension={SCENE_EXT}
          storageKey="cad.projectBrowser.dir"
          onClose={() => setSceneOpenOpen(false)}
          onOpen={handleReadScene}
          onDone={name => setToast({ msg: `Opened scene: ${name}`, severity: 'success' })}
        />
      )}

      {sceneSaveOpen && (
        <ServerFileBrowser
          open
          mode="save"
          title="Save Scene 3D to Server"
          extension={SCENE_EXT}
          storageKey="cad.projectBrowser.dir"
          onClose={() => setSceneSaveOpen(false)}
          onSave={handleWriteScene}
          onDone={name => setToast({ msg: `Saved scene: ${name}`, severity: 'success' })}
        />
      )}
    </>
  );
}
