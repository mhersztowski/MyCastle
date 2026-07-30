import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Box, Snackbar, Alert, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemButton, ListItemText, Typography, Popover } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import FolderIcon from '@mui/icons-material/Folder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { RichEditor } from '@mhersztowski/ui-components-scene3d';
import { SceneDeserializer, SceneSerializer } from '@mhersztowski/core-scene3d';
import type { GeoNodeGraph } from '@mhersztowski/core-scene3d';
import type { Project } from '@mhersztowski/core-cad';
import { cadProjectToSceneJson } from '../bridge/CadToScene';
import { mapNodesToSceneJson, deserializeMapNodes } from '../bridge/MapToScene';
import { Scene3DProjectBrowser } from './Scene3DProjectBrowser';
import { ServerFileBrowser } from './ServerFileBrowser';
import { SceneRunDialog } from './SceneRunDialog';
import { writeScene3dFile, vfsListDir, vfsReadFileBin, vfsReadFileText, userProjectsDir, listScene3dPrefabs, writeScene3dPrefab, deleteScene3dPrefab, listAllScene3dPrefabs, readFileAt, MAP_EXT, buildViewerUrl, getCurrentUserId } from '../vfs/cadProjectApi';
import { useRegisterFileOps } from '../fileops/FileOpsContext';
import type { PrefabEntry } from '@mhersztowski/core-scene3d';
import type { ProjectPrefabGroup } from '@mhersztowski/ui-components-scene3d';
import type { ActiveTemplate } from './RepositoryPanel';
import { GeometryNodesEditor } from './GeometryNodesEditor';
import { MeshEditModeDialog } from './MeshEditModeDialog';
import { evaluateDescriptor, geometryToEditable } from '../edit-mode/meshConverter';
import type { EditableMesh } from '../edit-mode/types';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];

/** Rozszerzenie skryptów sceny — plik wskazywany w Settings → Scene script. */
const SCRIPT_EXT = '.ts';

interface MapImportRecord {
  importId: string
  groupNodeId: string
  dir: string
  name: string
}
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
};

interface Props {
  project: Project;
  /** When set by AI agent writing /scene.json — auto-loads into RichEditor */
  externalSceneData?: string;
  /** Increment to force reload even when externalSceneData content is unchanged */
  externalSceneKey?: number;
  /** Pass a ref to get access to mergeScene(json) — adds nodes without replacing the scene */
  mergeSceneRef?: React.MutableRefObject<((json: string) => void) | null>;
  /** Called whenever the active scene JSON changes (AI load or CAD import) */
  onSceneDataChange?: (json: string) => void;
  /** Armed template for serial placement — clicking Y=0 floor merges the scene template at that position. */
  placementTemplate?: ActiveTemplate | null;
}

export function Scene3DView({ project, externalSceneData, externalSceneKey, mergeSceneRef: externalMergeRef, onSceneDataChange, placementTemplate }: Props) {
  const [editorKey, setEditorKey] = useState('initial');
  const [sceneData, setSceneData] = useState<string | undefined>(undefined);
  const mergeSceneRef = useRef<((json: string) => void) | null>(null);
  const sceneJsonRef = useRef<string | undefined>(undefined);

  // Forward internal mergeSceneRef to the external ref passed by parent
  useEffect(() => {
    if (!externalMergeRef) return;
    const sync = () => { externalMergeRef.current = mergeSceneRef.current; };
    sync();
    const id = setInterval(sync, 200);
    return () => { clearInterval(id); externalMergeRef.current = null; };
  }, [externalMergeRef]);
  const [serverMode, setServerMode] = useState<'open' | 'save' | null>(null);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const sceneViewerUrl = (currentProject && currentFile)
    ? buildViewerUrl('scene3d', `/users/${getCurrentUserId()}/scene3d/${currentProject}`, currentFile)
    : null;

  // Register file operations with the unified top-bar File menu.
  useRegisterFileOps('scene3d', {
    currentName: currentFile,
    server: [
      { label: 'Open Scene 3D from Server…', run: () => setServerMode('open') },
      { label: 'Save Scene 3D to Server…', run: () => setServerMode('save') },
    ],
    viewerUrl: sceneViewerUrl,
  }, [currentFile, sceneViewerUrl]);
  const [initialPrefabs, setInitialPrefabs] = useState<string | undefined>(undefined);
  const [allProjectsPrefabs, setAllProjectsPrefabs] = useState<ProjectPrefabGroup[]>([]);
  const currentProjectRef = useRef<string | null>(null);

  const refreshAllPrefabs = useCallback(async () => {
    try {
      const raw = await listAllScene3dPrefabs();
      setAllProjectsPrefabs(raw as ProjectPrefabGroup[]);
    } catch { /* ok */ }
  }, []);

  useEffect(() => { refreshAllPrefabs(); }, [refreshAllPrefabs]);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [debugLog, setDebugLog] = useState(false);
  const [mapImports, setMapImports] = useState<MapImportRecord[]>([]);
  const [mapPanelAnchor, setMapPanelAnchor] = useState<HTMLElement | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [audioPickerPath, setAudioPickerPath] = useState(userProjectsDir());
  const [audioPickerEntries, setAudioPickerEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const audioPickerResolveRef = useRef<((path: string | null) => void) | null>(null);

  // ─── Skrypt sceny (Settings → Scene script + „Run") ───────────
  // Picker działa jak audio picker: obietnica rozwiązywana wyborem w dialogu,
  // bo RichEditor oczekuje `Promise<string | null>` (null = anulowano).
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false);
  const scriptPickResolveRef = useRef<((path: string | null) => void) | null>(null);
  const [runState, setRunState] = useState<{ path: string | null; code: string | null } | null>(null);

  const handlePickScript = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      scriptPickResolveRef.current = resolve;
      setScriptPickerOpen(true);
    });
  }, []);

  const handleScriptPicked = useCallback(async (dir: string, name: string) => {
    scriptPickResolveRef.current?.(`${dir}/${name}${SCRIPT_EXT}`);
    scriptPickResolveRef.current = null;
    setScriptPickerOpen(false);
  }, []);

  const handleScriptPickerClose = useCallback(() => {
    scriptPickResolveRef.current?.(null);
    scriptPickResolveRef.current = null;
    setScriptPickerOpen(false);
  }, []);

  const handleRunScene = useCallback(async (scriptPath: string | null) => {
    if (!scriptPath) {
      setRunState({ path: null, code: null });
      return;
    }
    try {
      const code = await vfsReadFileText(scriptPath);
      setRunState({ path: scriptPath, code });
    } catch (e) {
      // Skrypt mógł zostać usunięty albo przeniesiony — scena i tak ma się otworzyć.
      setToast({ msg: `Nie udało się wczytać skryptu ${scriptPath}: ${(e as Error).message}`, severity: 'error' });
      setRunState({ path: scriptPath, code: null });
    }
  }, []);

  // Geometry nodes editor dialog
  const [geoNodesState, setGeoNodesState] = useState<{ nodeId: string; graph: GeoNodeGraph } | null>(null);
  const propertyChangeRef = useRef<((nodeId: string, property: string, value: unknown) => void) | null>(null);
  const getNodeGeometryRef = useRef<((nodeId: string) => unknown) | null>(null);
  const [editMeshState, setEditMeshState] = useState<{ nodeId: string; mesh: EditableMesh } | null>(null);

  const handleEditGeometryNodes = useCallback((nodeId: string, currentGraph: unknown) => {
    setGeoNodesState({ nodeId, graph: currentGraph as GeoNodeGraph });
  }, []);

  const handleGeoNodesChange = useCallback((newGraph: GeoNodeGraph) => {
    if (!geoNodesState) return;
    setGeoNodesState((prev) => prev ? { ...prev, graph: newGraph } : null);
    propertyChangeRef.current?.(geoNodesState.nodeId, 'geometry.nodesGraph', newGraph);
  }, [geoNodesState]);

  const handleEditMesh = useCallback((nodeId: string) => {
    const desc = getNodeGeometryRef.current?.(nodeId) as Parameters<typeof evaluateDescriptor>[0] | null;
    if (!desc) return;
    try {
      const geo = evaluateDescriptor(desc);
      const mesh = geometryToEditable(geo);
      setEditMeshState({ nodeId, mesh });
    } catch (e) {
      console.error('[Scene3DView] handleEditMesh failed', e);
    }
  }, []);

  const handleEditMeshApply = useCallback((bufferData: { positions: number[]; normals: number[] }) => {
    if (!editMeshState) return;
    // Change type first, then set bufferData — SceneGraph.onChange is debounced so both coalesce into one bump.
    propertyChangeRef.current?.(editMeshState.nodeId, 'geometry.type', 'custom');
    propertyChangeRef.current?.(editMeshState.nodeId, 'geometry.bufferData', bufferData);
    setEditMeshState(null);
  }, [editMeshState]);

  // Auto-load scene written by AI agent (or inserted from Templates panel)
  useEffect(() => {
    if (!externalSceneData) return;
    setSceneData(externalSceneData);
    setEditorKey(`ai-${Date.now()}`);
  }, [externalSceneData, externalSceneKey]);

  const handleImport = useCallback(() => {
    if (project.entityRegistry.getAll().length === 0) return;
    const json = cadProjectToSceneJson(project);
    setSceneData(json);
    setEditorKey(`import-${Date.now()}`);
  }, [project]);

  const handleSceneChange = useCallback((json: string) => {
    sceneJsonRef.current = json;
    onSceneDataChange?.(json);
  }, [onSceneDataChange]);

  const handlePlaneClick = useCallback(async (wx: number, wz: number) => {
    if (!placementTemplate || placementTemplate.mode !== 'scene3d') return;
    const fileUrl = placementTemplate.sceneFile;
    if (!fileUrl || !mergeSceneRef.current) return;
    const url = fileUrl.startsWith('http') ? fileUrl : `${placementTemplate.rawBase.replace(/\/$/, '')}/${fileUrl}`;
    try {
      const json = await fetch(url).then(r => r.text());
      const graph = SceneDeserializer.deserialize(json);
      const children = graph.root.children;
      if (children.length > 0) {
        let sx = 0, sz = 0;
        for (const child of children) { sx += child.position[0]; sz += child.position[2]; }
        const cx = sx / children.length;
        const cz = sz / children.length;
        for (const child of children) {
          child.setPosition([child.position[0] + (wx - cx), child.position[1], child.position[2] + (wz - cz)]);
        }
      }
      mergeSceneRef.current(SceneSerializer.serialize(graph));
    } catch (e) {
      console.error('[Scene3DView] placement failed', e);
    }
  }, [placementTemplate, mergeSceneRef]);

  const handleOpenProject = useCallback(async (json: string, project: string, file: string) => {
    sceneJsonRef.current = json;
    let prefabsJson: string | undefined;
    try {
      const prefabs = await listScene3dPrefabs(project) as PrefabEntry[];
      prefabsJson = JSON.stringify(prefabs);
    } catch { /* no prefabs dir yet — that's fine */ }
    currentProjectRef.current = project;
    setSceneData(json);
    setInitialPrefabs(prefabsJson);
    setEditorKey(`server-open-${Date.now()}`);
    setCurrentProject(project);
    setCurrentFile(file);
    setToast({ msg: `Opened: ${project} / ${file}`, severity: 'success' });
    refreshAllPrefabs();
  }, [refreshAllPrefabs]);

  const handleSaveProject = useCallback(async (project: string, file: string) => {
    const json = sceneJsonRef.current;
    if (!json) throw new Error('No scene data to save.');
    await writeScene3dFile(project, file, json);
    currentProjectRef.current = project;
    setCurrentProject(project);
    setCurrentFile(file);
    setToast({ msg: `Saved: ${project} / ${file}`, severity: 'success' });
  }, []);

  const handleSavePrefab = useCallback(async (id: string, _name: string, data: string) => {
    const project = currentProjectRef.current;
    if (!project) return;
    await writeScene3dPrefab(project, id, data);
    refreshAllPrefabs();
  }, [refreshAllPrefabs]);

  const handleDeletePrefab = useCallback(async (id: string) => {
    const project = currentProjectRef.current;
    if (!project) return;
    await deleteScene3dPrefab(project, id);
    refreshAllPrefabs();
  }, [refreshAllPrefabs]);

  const loadAudioPickerDir = useCallback((path: string) => {
    vfsListDir(path).then(entries => {
      const filtered = entries.filter(e =>
        e.isDir || AUDIO_EXTENSIONS.some(ext => e.name.toLowerCase().endsWith(ext))
      );
      filtered.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setAudioPickerEntries(filtered);
      setAudioPickerPath(path);
    }).catch(() => {
      setAudioPickerEntries([]);
    });
  }, []);

  const handleBrowseAudioFile = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      audioPickerResolveRef.current = resolve;
      const root = userProjectsDir();
      setAudioPickerPath(root);
      loadAudioPickerDir(root);
      setAudioPickerOpen(true);
    });
  }, [loadAudioPickerDir]);

  const handleAudioPickerNavigate = useCallback((dirName: string) => {
    loadAudioPickerDir(`${audioPickerPath}/${dirName}`);
  }, [audioPickerPath, loadAudioPickerDir]);

  const handleAudioPickerUp = useCallback(() => {
    const root = userProjectsDir();
    const parent = audioPickerPath.replace(/\/[^/]+$/, '') || root;
    loadAudioPickerDir(parent.startsWith(root) ? parent : root);
  }, [audioPickerPath, loadAudioPickerDir]);

  const handleAudioPickerSelect = useCallback((name: string) => {
    const vfsPath = `${audioPickerPath}/${name}`;
    const url = `${window.location.origin}/api/vfs/stream?path=${encodeURIComponent(vfsPath)}`;
    audioPickerResolveRef.current?.(url);
    audioPickerResolveRef.current = null;
    setAudioPickerOpen(false);
  }, [audioPickerPath]);

  const handleAudioPickerClose = useCallback(() => {
    audioPickerResolveRef.current?.(null);
    audioPickerResolveRef.current = null;
    setAudioPickerOpen(false);
  }, []);

  const resolveAudioSrc = useCallback(async (src: string): Promise<string> => {
    if (src && !src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
      const bytes = await vfsReadFileBin(src);
      const ext = src.split('.').pop()?.toLowerCase() ?? '';
      const blob = new Blob([bytes], { type: AUDIO_MIME[ext] ?? 'audio/mpeg' });
      return URL.createObjectURL(blob);
    }
    return src;
  }, []);

  const handleImportMap = useCallback(async (dir: string, name: string) => {
    try {
      const text = await readFileAt(dir, name, MAP_EXT);
      const nodes = deserializeMapNodes(text);
      const { sceneJson, groupId } = await mapNodesToSceneJson(nodes, name);
      mergeSceneRef.current?.(sceneJson);
      setMapImports(prev => [...prev, { importId: crypto.randomUUID(), groupNodeId: groupId, dir, name }]);
      setMapPickerOpen(false);
      setToast({ msg: `Imported map "${name}"`, severity: 'success' });
    } catch (e) {
      setToast({ msg: `Import failed: ${(e as Error).message}`, severity: 'error' });
    }
  }, []);

  const handleReimportMap = useCallback(async (record: MapImportRecord) => {
    try {
      const text = await readFileAt(record.dir, record.name, MAP_EXT);
      const nodes = deserializeMapNodes(text);
      const currentJson = sceneJsonRef.current;
      if (currentJson) {
        const graph = SceneDeserializer.deserialize(currentJson);
        const oldGroup = graph.findNode(record.groupNodeId);
        const savedTransform = oldGroup ? {
          position: [...oldGroup.position] as [number, number, number],
          rotation: [...oldGroup.rotation] as [number, number, number],
          scale:    [...oldGroup.scale]    as [number, number, number],
        } : undefined;
        graph.removeNode(record.groupNodeId);
        const { sceneJson: newSubJson, groupId: newGroupId } = await mapNodesToSceneJson(nodes, record.name, savedTransform);
        const newSubgraph = SceneDeserializer.deserialize(newSubJson);
        for (const child of [...newSubgraph.root.children]) {
          graph.addNode(child);
        }
        setSceneData(SceneSerializer.serialize(graph));
        setEditorKey(`map-reimport-${Date.now()}`);
        setMapImports(prev => prev.map(r => r.importId === record.importId ? { ...r, groupNodeId: newGroupId } : r));
      } else {
        const { sceneJson, groupId } = await mapNodesToSceneJson(nodes, record.name);
        mergeSceneRef.current?.(sceneJson);
        setMapImports(prev => prev.map(r => r.importId === record.importId ? { ...r, groupNodeId: groupId } : r));
      }
      setToast({ msg: `Reimported "${record.name}"`, severity: 'success' });
    } catch (e) {
      setToast({ msg: `Reimport failed: ${(e as Error).message}`, severity: 'error' });
    }
  }, []);

  const cadCount = project.entityRegistry.getAll().length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RichEditor fills the rest — includes SceneTree, viewport, Properties panels */}
      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <RichEditor
          key={editorKey}
          initialSceneData={sceneData}
          initialPrefabs={initialPrefabs}
          onSavePrefab={handleSavePrefab}
          onDeletePrefab={handleDeletePrefab}
          currentProject={currentProject ?? undefined}
          currentFile={currentFile ?? undefined}
          otherProjectsPrefabs={allProjectsPrefabs.filter(g => g.project !== currentProject)}
          mergeSceneRef={mergeSceneRef}
          onSceneChange={handleSceneChange}
          onOpenFromServer={() => setServerMode('open')}
          onSaveToServer={() => setServerMode('save')}
          onPickScript={handlePickScript}
          onRunScript={handleRunScene}
          onImportFromCad={handleImport}
          cadEntityCount={cadCount}
          onPlaneClick={placementTemplate?.mode === 'scene3d' ? handlePlaneClick : undefined}
          style={{ height: '100%' }}
          debugLog={debugLog}
          onBrowseAudioFile={handleBrowseAudioFile}
          resolveAudioSrc={resolveAudioSrc}
          onEditGeometryNodes={handleEditGeometryNodes}
          onEditMesh={handleEditMesh}
          propertyChangeRef={propertyChangeRef}
          getNodeGeometryRef={getNodeGeometryRef}
        />
        {/* Map imports button */}
        <Tooltip title="Map imports">
          <IconButton
            size="small"
            onClick={e => setMapPanelAnchor(e.currentTarget)}
            sx={{
              position: 'absolute', bottom: 44, right: 8, zIndex: 30,
              bgcolor: mapImports.length > 0 ? 'rgba(79,195,247,0.15)' : 'rgba(0,0,0,0.4)',
              border: '1px solid',
              borderColor: mapImports.length > 0 ? 'rgba(79,195,247,0.5)' : 'rgba(255,255,255,0.15)',
              color: mapImports.length > 0 ? '#4fc3f7' : 'text.disabled',
              '&:hover': { bgcolor: 'rgba(79,195,247,0.2)' },
            }}
          >
            <MapOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Debug toggle — visible on mobile for diagnosing gizmo/touch issues */}
        <Tooltip title={debugLog ? 'Hide debug log' : 'Show debug log'}>
          <IconButton
            size="small"
            onClick={() => setDebugLog(v => !v)}
            sx={{
              position: 'absolute', bottom: 8, right: 8, zIndex: 30,
              bgcolor: debugLog ? 'rgba(255,80,80,0.25)' : 'rgba(0,0,0,0.4)',
              border: '1px solid', borderColor: debugLog ? 'error.main' : 'rgba(255,255,255,0.15)',
              color: debugLog ? 'error.main' : 'text.disabled',
              '&:hover': { bgcolor: debugLog ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.1)' },
            }}
          >
            <BugReportIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Map imports panel */}
        <Popover
          open={Boolean(mapPanelAnchor)}
          anchorEl={mapPanelAnchor}
          onClose={() => setMapPanelAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          PaperProps={{
            sx: {
              width: 280,
              bgcolor: '#1a1a1a',
              border: '1px solid rgba(255,255,255,0.12)',
              p: 0,
              mb: 1,
            },
          }}
        >
          <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', flex: 1 }}>
              Map Imports
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 13 }} />}
              onClick={() => { setMapPickerOpen(true); setMapPanelAnchor(null); }}
              sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.25, minWidth: 0 }}
            >
              Import
            </Button>
          </Box>
          {mapImports.length === 0 ? (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', px: 1.5, py: 1.5 }}>
              No map imports yet. Use Import to add a .map.json file.
            </Typography>
          ) : (
            <List dense disablePadding>
              {mapImports.map(record => (
                <ListItem
                  key={record.importId}
                  disablePadding
                  sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)', '&:last-child': { borderBottom: 'none' } }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.25 }}>
                      <Tooltip title="Reimport from server (preserves transform)">
                        <IconButton
                          size="small"
                          onClick={() => handleReimportMap(record)}
                          sx={{ p: 0.5, color: 'text.secondary', '&:hover': { color: '#4fc3f7' } }}
                        >
                          <ReplayIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove from list">
                        <IconButton
                          size="small"
                          onClick={() => setMapImports(prev => prev.filter(r => r.importId !== record.importId))}
                          sx={{ p: 0.5, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemButton sx={{ py: 0.5, pr: 8 }} disableRipple>
                    <ListItemText
                      primary={record.name}
                      secondary={record.dir}
                      slotProps={{
                        primary: { sx: { fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                        secondary: { sx: { fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Popover>
      </Box>

      <Scene3DProjectBrowser
        open={serverMode === 'open' || serverMode === 'save'}
        mode={serverMode ?? 'open'}
        onClose={() => setServerMode(null)}
        onOpen={handleOpenProject}
        onSave={handleSaveProject}
      />

      <Dialog open={audioPickerOpen} onClose={handleAudioPickerClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {audioPickerPath !== userProjectsDir() && (
            <IconButton size="small" onClick={handleAudioPickerUp} sx={{ p: 0.25, mr: 0.5 }}>
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 500 }}>Select File</Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {audioPickerPath}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, minHeight: 120 }}>
          {audioPickerEntries.length === 0 ? (
            <Box sx={{ px: 2, py: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                No audio files (.mp3, .wav, .ogg, .flac, .aac, .m4a) found here.
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {audioPickerEntries.map(entry => (
                <ListItem key={entry.name} disablePadding>
                  <ListItemButton onClick={() => entry.isDir ? handleAudioPickerNavigate(entry.name) : handleAudioPickerSelect(entry.name)}>
                    {entry.isDir
                      ? <FolderIcon sx={{ fontSize: 16, color: '#ffb74d', mr: 1, flexShrink: 0 }} />
                      : <InsertDriveFileIcon sx={{ fontSize: 16, color: 'text.disabled', mr: 1, flexShrink: 0 }} />
                    }
                    <ListItemText
                      primary={entry.name}
                      slotProps={{ primary: { sx: { fontSize: '0.8rem', color: entry.isDir ? 'text.primary' : 'text.secondary' } } }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Geometry Nodes Editor dialog ─────────────────────── */}
      <Dialog
        open={Boolean(geoNodesState)}
        onClose={() => setGeoNodesState(null)}
        maxWidth={false}
        fullWidth
        PaperProps={{ sx: { width: '90vw', height: '80vh', maxWidth: '1200px', background: '#141414', display: 'flex', flexDirection: 'column' } }}
      >
        <DialogTitle sx={{ py: 0.75, px: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1a1a1a' }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, flexGrow: 1 }}>Geometry Nodes</Typography>
          <IconButton size="small" onClick={() => setGeoNodesState(null)} sx={{ color: 'text.disabled' }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {geoNodesState && (
            <GeometryNodesEditor
              graph={geoNodesState.graph}
              onChange={handleGeoNodesChange}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 1.5, py: 0.75, borderTop: '1px solid rgba(255,255,255,0.08)', background: '#1a1a1a' }}>
          <Button size="small" onClick={() => setGeoNodesState(null)} sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Mesh Edit Mode dialog ─────────────────────────── */}
      <MeshEditModeDialog
        open={Boolean(editMeshState)}
        initialMesh={editMeshState?.mesh ?? null}
        onApply={handleEditMeshApply}
        onClose={() => setEditMeshState(null)}
      />

      {/* Wybór skryptu sceny (.ts) — z podkatalogami i tworzeniem katalogu */}
      <ServerFileBrowser
        open={scriptPickerOpen}
        mode="open"
        title="Skrypt sceny (.ts)"
        extension={SCRIPT_EXT}
        storageKey="scene3d.script.dir"
        onClose={handleScriptPickerClose}
        onOpen={handleScriptPicked}
      />

      {/* Uruchomienie sceny ze skryptem */}
      <SceneRunDialog
        open={Boolean(runState)}
        sceneJson={sceneJsonRef.current}
        scriptPath={runState?.path ?? null}
        scriptCode={runState?.code ?? null}
        onClose={() => setRunState(null)}
      />

      {/* Map file picker */}
      <ServerFileBrowser
        open={mapPickerOpen}
        mode="open"
        title="Import Map File"
        extension={MAP_EXT}
        storageKey="scene3d.mapImport.dir"
        onClose={() => setMapPickerOpen(false)}
        onOpen={handleImportMap}
        onDone={() => setMapPickerOpen(false)}
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
    </Box>
  );
}
