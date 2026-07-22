import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, List, ListItemButton, ListItemText, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import TuneIcon from '@mui/icons-material/Tune';
import Looks3OutlinedIcon from '@mui/icons-material/Looks3Outlined';
import LooksOneOutlinedIcon from '@mui/icons-material/LooksOneOutlined';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CodeIcon from '@mui/icons-material/Code';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import MinimizeIcon from '@mui/icons-material/Minimize';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { Project } from '@mhersztowski/core-cad';
import type { Point2D, ViewMode } from '@mhersztowski/core-cad';
import { CadCanvas } from './components/CadCanvas';
import { CommandLine } from './components/CommandLine';
import { FileMenu } from './components/UnifiedFileMenu';
import { CadFileOps } from './components/CadFileOps';
import { FileOpsProvider } from './fileops/FileOpsContext';
import { LayerPanel } from './components/LayerPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Scene3DView } from './components/Scene3DView';
import { LegoView } from './components/LegoView';
import { PcbView } from './components/PcbView';
import { StatusBar } from './components/StatusBar';
import { ActionBar } from './components/ActionBar';
import { Toolbar } from './components/Toolbar';
import { Cad3dView } from './components/Cad3dView';
import { BreadboardCanvas } from './components/electronics/BreadboardCanvas';
import { ComponentLibrary } from './components/electronics/ComponentLibrary';
import { MapView } from './components/MapView';
import { SpenNotesView } from './components/SpenNotesView';
import { ResizeDivider } from './components/ResizeDivider';
import { RepositoryPanel } from './components/RepositoryPanel';
import { AudioPanel } from './components/AudioPanel';
import { TemplatesPanel } from './components/TemplatesPanel';
import { FileSystemPanel } from './components/FileSystemPanel';
import { DriveView } from './pages/DriveView';
import { getCurrentUserId, listFilesRecursive, listScene3dFiles, listScene3dProjects, userRootDir, CAD_EXT, ELEC_EXT } from './vfs/cadProjectApi';
import type { ElectronicsSchema } from './electronics/types';
import { loadProjectFromText, mergeProjectFromText } from './io/CadExporter';
import type { ActiveTemplate, CadProjectEntry, TemplateMode } from './components/RepositoryPanel';
const AiPanel = lazy(() => import('./components/AiPanel').then(m => ({ default: m.AiPanel })));
const CodeEditorPanel = lazy(() => import('./components/CodeEditorPanel').then(m => ({ default: m.CodeEditorPanel })));
import { useProject } from './hooks/useProject';
import type { ToolName } from './tools/types';

const project = new Project();

type AppMode = 'cad' | 'cad3d' | 'scene3d' | 'lego' | 'electronics' | 'pcb' | 'map' | 'audio' | 'repository' | 'notes' | 'drive';
type RightTab = 'layers' | 'properties';

export default function App() {
  const { version } = useProject(project);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [mode, setMode] = useState<AppMode>('cad');
  const [cadViewMode, setCadViewMode] = useState<ViewMode>('2d');
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  // Toggles Electronics ComponentLibrary (left) + Properties panel (right) as one.
  const [electronicsSidePanels, setElectronicsSidePanels] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  // Code editor docked on the right of every mode — collapsed by default, opened via the </> button.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorWidth, setEditorWidth] = useState(560);
  const [editorFullscreen, setEditorFullscreen] = useState(false);

  const [aiSceneData, setAiSceneData] = useState<string | undefined>(undefined);
  type EmbedMode = 'cad' | 'cad3d' | 'scene3d' | 'electronics';
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedMode, setEmbedMode] = useState<EmbedMode>('scene3d');
  const [embedProject, setEmbedProject] = useState('');  // VFS path
  const [embedProjects, setEmbedProjects] = useState<{ name: string; path: string }[]>([]);
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const [savedSceneJson, setSavedSceneJson] = useState<string | null>(null);

  const [injectedPoint, setInjectedPoint] = useState<Point2D | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<number | null>(null);
  const lastPointRef = useRef<Point2D | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll tab bar with pen/mouse (touch uses native scroll)
  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const getScroller = () => bar.querySelector<HTMLElement>('.MuiTabs-scroller');
    let startX = 0, startScroll = 0, pointerId = -1, didDrag = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const s = getScroller(); if (!s) return;
      startX = e.clientX; startScroll = s.scrollLeft; pointerId = e.pointerId; didDrag = false;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || e.pointerType === 'touch') return;
      const s = getScroller(); if (!s) return;
      const dx = e.clientX - startX;
      if (!didDrag && Math.abs(dx) > 5) { didDrag = true; bar.setPointerCapture(e.pointerId); }
      if (didDrag) { s.scrollLeft = startScroll - dx; e.stopPropagation(); }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
      pointerId = -1;
    };
    const onClick = (e: MouseEvent) => { if (didDrag) { e.stopPropagation(); e.preventDefault(); didDrag = false; } };
    bar.addEventListener('pointerdown', onDown);
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp);
    bar.addEventListener('pointercancel', onUp);
    bar.addEventListener('click', onClick, true);
    return () => {
      bar.removeEventListener('pointerdown', onDown);
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', onUp);
      bar.removeEventListener('pointercancel', onUp);
      bar.removeEventListener('click', onClick, true);
    };
  }, []);

  const handleCoordinate = useCallback((point: Point2D) => {
    setInjectedPoint({ ...point });
    lastPointRef.current = point;
  }, []);

  const handleAngle = useCallback((degrees: number) => {
    setInjectedAngle(degrees + Math.random() * 1e-10);
  }, []);

  const handleLastPoint = useCallback((p: Point2D) => {
    lastPointRef.current = p;
  }, []);

  const handleToolChange = useCallback((tool: ToolName) => {
    setActiveTool(tool);
    setInjectedPoint(null);
    setInjectedAngle(null);
  }, []);

  // Load project list when embed dialog opens or mode changes
  useEffect(() => {
    if (!embedOpen) return;
    setEmbedLoading(true);
    setEmbedProjects([]);
    const userId = getCurrentUserId();

    (async () => {
      try {
        if (embedMode === 'scene3d') {
          const projects = await listScene3dProjects();
          const entries: { name: string; path: string }[] = [];
          await Promise.all(projects.map(async p => {
            try {
              const files = await listScene3dFiles(p.name);
              for (const f of files) {
                entries.push({
                  name: `${p.name} / ${f.name}`,
                  path: `users/${userId}/scene3d/${p.name}/${f.name}`,
                });
              }
            } catch { /* skip */ }
          }));
          setEmbedProjects(entries);
        } else {
          // Recursive scan from the user's root so files saved into any sub-
          // directory show up — not just the legacy flat `projects/` folder.
          const ext = embedMode === 'electronics' ? ELEC_EXT : CAD_EXT;
          const root = userRootDir(userId);
          const files = await listFilesRecursive(root, ext);
          setEmbedProjects(files.map(f => ({
            name: f.name,                                 // 'subdir/foo' (no ext)
            path: `users/${userId}/${f.name}`,            // matches viewer's vfsPath shape
          })));
        }
      } catch {
        setEmbedProjects([]);
      } finally {
        setEmbedLoading(false);
      }
    })();
  }, [embedOpen, embedMode]);

  // Auto-select newly placed entity and switch to Properties tab
  useEffect(() => {
    return project.eventBus.on('entity:added', entity => {
      project.selectionManager.clear();
      project.selectionManager.select(entity.id);
      project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
      setRightTab('properties');
    });
  }, [project]);

  const handleViewModeChange = useCallback((_: React.MouseEvent, v: ViewMode | null) => {
    if (v) setCadViewMode(v);
  }, []);

  const handleOpenCadFromRepo = useCallback((jsonText: string) => {
    loadProjectFromText(jsonText, project);
    setMode('cad');
  }, []);

  const [sceneExternalKey, setSceneExternalKey] = useState(0);
  const mergeSceneRef = useRef<((json: string) => void) | null>(null);
  const mergeTreeRef = useRef<((json: string) => void) | null>(null);
  const mergeElecSchemaRef = useRef<((schema: ElectronicsSchema) => void) | null>(null);
  // CAD 3D feature tree — save/load do backendu VFS
  const getCad3dTreeJsonRef = useRef<(() => string) | null>(null);
  const replaceCad3dTreeRef = useRef<((json: string) => void) | null>(null);

  const handleOpenSceneFromRepo = useCallback((jsonText: string) => {
    setAiSceneData(jsonText);
    setSavedSceneJson(jsonText);
    setSceneExternalKey(k => k + 1);
    setMode('scene3d');
  }, []);

  const [activeTemplates, setActiveTemplates] = useState<ActiveTemplate[]>(() => {
    try { return JSON.parse(localStorage.getItem('cad-active-templates') ?? '[]'); }
    catch { return []; }
  });

  const addedProjectIds = useMemo(() => new Set(activeTemplates.map(t => t.projectId)), [activeTemplates]);

  const handleAddProjectTemplates = useCallback((proj: CadProjectEntry, rawBase: string) => {
    setActiveTemplates(prev => {
      const filtered = prev.filter(t => t.projectId !== proj.id);
      const next = [
        ...filtered,
        ...Object.entries(proj.templates ?? {}).flatMap(([m, entries]) =>
          (entries ?? []).map(t => ({ ...t, projectId: proj.id, rawBase, mode: m as TemplateMode }))
        ),
      ];
      localStorage.setItem('cad-active-templates', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleRemoveProjectTemplates = useCallback((projectId: string) => {
    setActiveTemplates(prev => {
      const next = prev.filter(t => t.projectId !== projectId);
      localStorage.setItem('cad-active-templates', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleInsertActiveTemplate = useCallback(async (template: ActiveTemplate) => {
    const fileUrl = template.mode === 'scene3d' ? template.sceneFile : template.cadFile;
    if (!fileUrl) return;
    const url = fileUrl.startsWith('http') ? fileUrl : `${template.rawBase.replace(/\/$/, '')}/${fileUrl}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    switch (template.mode) {
      case 'scene3d':
        if (mergeSceneRef.current && mode === 'scene3d') {
          mergeSceneRef.current(text);
        } else {
          handleOpenSceneFromRepo(text);
        }
        break;
      case 'cad3d':
        mergeTreeRef.current?.(text);
        break;
      case 'cad':
        mergeProjectFromText(text, project);
        break;
      case 'electronics':
        if (mergeElecSchemaRef.current) {
          try {
            mergeElecSchemaRef.current(JSON.parse(text) as ElectronicsSchema);
          } catch (e) {
            console.error('[App] electronics template parse failed', e);
          }
        }
        break;
    }
  }, [handleOpenSceneFromRepo, mode]);

  const [placementTemplate, setPlacementTemplate] = useState<ActiveTemplate | null>(null);

  const handleArmTemplate = useCallback((t: ActiveTemplate | null) => {
    setPlacementTemplate(t);
    if (t) {
      // Auto-switch to the matching mode
      const modeMap: Record<TemplateMode, AppMode> = { cad: 'cad', cad3d: 'cad3d', scene3d: 'scene3d', electronics: 'electronics' };
      setMode(modeMap[t.mode]);
    }
  }, []);

  const handleCancelPlacement = useCallback(() => setPlacementTemplate(null), []);

  // Global Esc cancels placement regardless of which element has focus
  useEffect(() => {
    if (!placementTemplate) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacementTemplate(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [placementTemplate]);

  return (
    <FileOpsProvider>
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* Top bar: unified File menu (always visible) + mode tabs + 2D/3D toggle */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
        <FileMenu mode={mode} />
        {(mode === 'cad' || mode === 'cad3d') && (
          <CadFileOps
            project={project}
            mode={mode}
            // Dla mode='cad3d' używamy CAD 3D feature tree JSON. Dla mode='cad' — Scene 3D data (legacy).
            getSceneData={() => {
              if (mode === 'cad3d') return getCad3dTreeJsonRef.current?.() ?? null;
              return savedSceneJson;
            }}
            onSceneData={json => {
              if (mode === 'cad3d') {
                replaceCad3dTreeRef.current?.(json);
              } else {
                setAiSceneData(json);
                setSavedSceneJson(json);
              }
            }}
          />
        )}
        <Box ref={tabBarRef} sx={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
        <Tabs
          variant="scrollable"
          scrollButtons={false}
          value={mode}
          onChange={(_, v: AppMode) => setMode(v)}
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, fontSize: 12 } }}
        >
          <Tab
            value="cad"
            label="CAD"
            icon={<PentagonOutlinedIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="cad3d"
            label="CAD 3D"
            icon={<ViewInArOutlinedIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="scene3d"
            label="Scene 3D"
            icon={<ViewInArIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="lego"
            label="Lego"
            icon={<ViewInArIcon sx={{ fontSize: 16, color: '#f2cd37' }} />}
            iconPosition="start"
          />
          <Tab
            value="electronics"
            label="Electronics"
            icon={<ElectricalServicesIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="pcb"
            label="PCB"
            icon={<DeveloperBoardIcon sx={{ fontSize: 16, color: '#66bb6a' }} />}
            iconPosition="start"
          />
          <Tab
            value="map"
            label="Map"
            icon={<MapOutlinedIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="notes"
            label="Notes"
            icon={<EditNoteIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="audio"
            label="Audio"
            icon={<HeadphonesIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="repository"
            label="Repository"
            icon={<StorageIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="drive"
            label="Drive"
            icon={<StorageIcon sx={{ fontSize: 16, color: '#4a90d9' }} />}
            iconPosition="start"
          />
        </Tabs>
        </Box>

        {/* AI + code-editor toggles (all modes) */}
        <Tooltip title={aiOpen ? 'Close AI assistant' : 'Open AI assistant'}>
          <IconButton
            size="small"
            onClick={() => setAiOpen(v => !v)}
            sx={{
              ml: mode === 'cad' ? 0 : 'auto',
              color: aiOpen ? 'primary.main' : 'text.secondary',
            }}
          >
            <SmartToyOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={editorOpen ? 'Close code editor' : 'Open code editor'}>
          <IconButton
            size="small"
            onClick={() => setEditorOpen(v => !v)}
            sx={{
              mr: 0,
              color: editorOpen ? 'primary.main' : 'text.secondary',
            }}
          >
            <CodeIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Embed in Notes">
          <IconButton
            size="small"
            onClick={() => {
              const m = (['cad','cad3d','scene3d','electronics'] as const).includes(mode as 'cad')
                ? mode as EmbedMode : 'scene3d';
              setEmbedMode(m); setEmbedProject(''); setEmbedCopied(false); setEmbedOpen(true);
            }}
            sx={{ mr: mode === 'cad' ? 0 : 1, color: 'text.secondary' }}
          >
            <BookmarkAddOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* 2D / 3D view mode toggle — only in CAD 2D tab */}
        {mode === 'cad' && (
          <Box sx={{ ml: 'auto', mr: 1 }}>
            <ToggleButtonGroup
              value={cadViewMode}
              exclusive
              onChange={handleViewModeChange}
              size="small"
              sx={{
                height: 26,
                '& .MuiToggleButton-root': { px: 1, py: 0, fontSize: 11, lineHeight: 1 },
              }}
            >
              <Tooltip title="2D orthographic view">
                <ToggleButton value="2d">
                  <LooksOneOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />
                  2D
                </ToggleButton>
              </Tooltip>
              <Tooltip title="3D perspective view with orbit controls">
                <ToggleButton value="3d">
                  <Looks3OutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />
                  3D
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Box>
        )}
      </Box>

      {/* Workspace: mode panels (left) + toggleable code-editor side panel (right) */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

      {/* CAD panel */}
      <Box sx={{ flex: 1, display: mode === 'cad' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <ActionBar activeTool={activeTool} onToolChange={handleToolChange} project={project} />
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Toolbar activeTool={activeTool} onToolChange={handleToolChange} viewMode={cadViewMode} />

          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <CadCanvas
              project={project}
              activeTool={activeTool}
              version={version}
              viewMode={cadViewMode}
              injectedPoint={injectedPoint}
              injectedAngle={injectedAngle}
              onLastPoint={handleLastPoint}
              placementTemplate={placementTemplate?.mode === 'cad' || placementTemplate?.mode === 'electronics' ? placementTemplate : null}
              onCancelPlacement={handleCancelPlacement}
            />
          </Box>

          {/* Right panel: layers / properties */}
          <Box sx={{
            width: 200, display: 'flex', flexDirection: 'column',
            bgcolor: 'background.paper', borderLeft: '1px solid rgba(255,255,255,0.08)',
          }}>
            <Tabs
              value={rightTab}
              onChange={(_, v: RightTab) => setRightTab(v)}
              sx={{
                minHeight: 32, borderBottom: '1px solid rgba(255,255,255,0.08)',
                '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 11, minWidth: 0, flex: 1 },
              }}
            >
              <Tab value="layers" label="Layers" icon={<LayersIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
              <Tab value="properties" label="Props" icon={<TuneIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
            </Tabs>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {rightTab === 'layers'
                ? <LayerPanel project={project} version={version} />
                : <PropertiesPanel project={project} version={version} />
              }
            </Box>
          </Box>

          {/* AI panel — slides in from the right, lazy-loaded */}
          {aiOpen && (
            <Box sx={{
              width: 380, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'background.paper', overflow: 'hidden',
            }}>
              <Suspense fallback={null}>
                <AiPanel project={project} version={version} />
              </Suspense>
            </Box>
          )}
        </Box>

        <TemplatesPanel mode="cad" templates={activeTemplates.filter(t => t.mode === 'cad')} onInsert={handleInsertActiveTemplate} armedTemplateId={placementTemplate?.id ?? null} onArm={handleArmTemplate} />
        <StatusBar project={project} activeTool={activeTool} viewMode={cadViewMode} />
        {cadViewMode === '2d' && (
          <CommandLine
            activeTool={activeTool}
            onToolChange={handleToolChange}
            onCoordinate={handleCoordinate}
            onAngle={handleAngle}
            lastPoint={lastPointRef.current}
          />
        )}
      </Box>

      {/* CAD 3D panel */}
      {mode === 'cad3d' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Cad3dView project={project} version={version}
              mergeTreeRef={mergeTreeRef}
              getTreeJsonRef={getCad3dTreeJsonRef}
              replaceTreeRef={replaceCad3dTreeRef}
              placementTemplate={placementTemplate?.mode === 'cad3d' ? placementTemplate : null} />
          </Box>
          {aiOpen && (
            <Box sx={{
              width: 380, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'background.paper', overflow: 'hidden',
            }}>
              <Suspense fallback={null}>
                <AiPanel project={project} version={version} />
              </Suspense>
            </Box>
          )}
          </Box>
          <TemplatesPanel mode="cad3d" templates={activeTemplates.filter(t => t.mode === 'cad3d')} onInsert={handleInsertActiveTemplate} armedTemplateId={placementTemplate?.id ?? null} onArm={handleArmTemplate} />
        </Box>
      )}

      {/* Scene 3D panel */}
      <Box sx={{ flex: 1, display: mode === 'scene3d' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Scene3DView
              project={project}
              externalSceneData={aiSceneData}
              externalSceneKey={sceneExternalKey}
              mergeSceneRef={mergeSceneRef}
              onSceneDataChange={json => setSavedSceneJson(json)}
              placementTemplate={placementTemplate?.mode === 'scene3d' ? placementTemplate : null}
            />
          </Box>
          {aiOpen && (
            <Box sx={{
              width: 380, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'background.paper', overflow: 'hidden',
            }}>
              <Suspense fallback={null}>
                <AiPanel project={project} version={version} onSceneData={setAiSceneData} />
              </Suspense>
            </Box>
          )}
        </Box>
        <TemplatesPanel mode="scene3d" templates={activeTemplates.filter(t => t.mode === 'scene3d')} onInsert={handleInsertActiveTemplate} armedTemplateId={placementTemplate?.id ?? null} onArm={handleArmTemplate} />
        <FileSystemPanel rootPath={`/users/${getCurrentUserId()}`} title="Project Files" />
      </Box>


      <Box sx={{ flex: 1, display: mode === 'lego' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        {mode === 'lego' && <LegoView />}
      </Box>

      {/* Electronics panel */}
      <Box sx={{ flex: 1, display: mode === 'electronics' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          {electronicsSidePanels && (
            <ComponentLibrary
              selectedPartId={selectedPartId}
              onSelectPart={id => setSelectedPartId(id)}
            />
          )}
          <BreadboardCanvas
            pendingPartId={selectedPartId}
            onPendingPartConsumed={() => {}}
            mergeSchemaRef={mergeElecSchemaRef}
            placementTemplate={placementTemplate?.mode === 'electronics' ? placementTemplate : null}
            sidePanelsVisible={electronicsSidePanels}
            onToggleSidePanels={() => setElectronicsSidePanels(v => !v)}
          />
          {aiOpen && (
            <Box sx={{
              width: 380, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'background.paper', overflow: 'hidden',
            }}>
              <Suspense fallback={null}>
                <AiPanel project={project} version={version} />
              </Suspense>
            </Box>
          )}
        </Box>
        <TemplatesPanel mode="electronics" templates={activeTemplates.filter(t => t.mode === 'electronics')} onInsert={handleInsertActiveTemplate} armedTemplateId={placementTemplate?.id ?? null} onArm={handleArmTemplate} />
      </Box>

      {/* PCB panel — schematic sheets + PCB boards workspace */}
      <Box sx={{ flex: 1, display: mode === 'pcb' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        {mode === 'pcb' && <PcbView />}
      </Box>

      {/* Map panel */}
      {mode === 'map' && (
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <MapView />
        </Box>
      )}

      {/* Notes panel */}
      {mode === 'notes' && (
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <SpenNotesView />
        </Box>
      )}

      {/* Audio panel */}
      {mode === 'audio' && (
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <AudioPanel />
        </Box>
      )}

      {/* Drive — VFS tree browser with upload/download */}
      {mode === 'drive' && (
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <DriveView />
        </Box>
      )}

      {/* Repository panel */}
      {mode === 'repository' && (
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <RepositoryPanel
            onOpenCadProject={handleOpenCadFromRepo}
            onOpenSceneProject={handleOpenSceneFromRepo}
            addedProjectIds={addedProjectIds}
            onAddProjectTemplates={handleAddProjectTemplates}
            onRemoveProjectTemplates={handleRemoveProjectTemplates}
            armedTemplateId={placementTemplate?.id ?? null}
            onArm={handleArmTemplate}
          />
        </Box>
      )}
        </Box>

        {/* Code editor — one shared instance; resizable, collapsible, full-screen */}
        {editorOpen && (
          <>
            {!editorFullscreen && <ResizeDivider width={editorWidth} onResize={setEditorWidth} />}
            <Box sx={
              editorFullscreen
                ? {
                    position: 'fixed', inset: 0, zIndex: 1200,
                    display: 'flex', flexDirection: 'column', bgcolor: 'background.paper',
                  }
                : {
                    width: editorWidth, flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    borderLeft: '1px solid rgba(255,255,255,0.08)',
                    bgcolor: 'background.paper', overflow: 'hidden',
                  }
            }>
              {/* Panel header */}
              <Box sx={{
                display: 'flex', alignItems: 'center', height: 28, px: 1, flexShrink: 0,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}>
                <Box sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary' }}>Editor</Box>
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Minimize (reopen with the </> button)">
                  <IconButton size="small" onClick={() => { setEditorFullscreen(false); setEditorOpen(false); }}>
                    <MinimizeIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={editorFullscreen ? 'Exit full screen' : 'Full screen'}>
                  <IconButton size="small" onClick={() => setEditorFullscreen(v => !v)}>
                    {editorFullscreen
                      ? <FullscreenExitIcon sx={{ fontSize: 16 }} />
                      : <FullscreenIcon sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Tooltip>
              </Box>
              {/* Editor */}
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Suspense fallback={null}>
                  <CodeEditorPanel />
                </Suspense>
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* ── Embed in Notes dialog ─────────────────────────────────────────── */}
      {(() => {
        const snippet = embedProject
          ? `@[cad:${embedMode}:${window.location.origin}/viewer/${embedMode}/${embedProject}]`
          : '';
        return (
          <Dialog open={embedOpen} onClose={() => setEmbedOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
              <Typography fontWeight={600}>Embed in Notes</Typography>
              <IconButton size="small" onClick={() => setEmbedOpen(false)}><CloseIcon fontSize="small" /></IconButton>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
              {/* Mode tabs */}
              <Tabs
                value={embedMode}
                onChange={(_, v: EmbedMode) => { setEmbedMode(v); setEmbedProject(''); setEmbedCopied(false); }}
                variant="fullWidth"
                sx={{ mb: 0.5, '& .MuiTab-root': { minHeight: 32, fontSize: 11, px: 0.5 } }}
              >
                <Tab value="cad" label="CAD 2D" />
                <Tab value="cad3d" label="CAD 3D" />
                <Tab value="scene3d" label="Scene 3D" />
                <Tab value="electronics" label="Electronics" />
              </Tabs>

              {/* Project list */}
              {embedLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <List dense disablePadding sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {embedProjects.length === 0 ? (
                    <ListItemButton disabled>
                      <ListItemText primary="No projects found" secondary="Save a project to the server first" />
                    </ListItemButton>
                  ) : embedProjects.map(p => (
                    <ListItemButton
                      key={p.path}
                      selected={embedProject === p.path}
                      onClick={() => { setEmbedProject(p.path); setEmbedCopied(false); }}
                    >
                      <ListItemText primary={p.name} secondary={p.path} secondaryTypographyProps={{ sx: { fontSize: 9, opacity: 0.55 } }} />
                    </ListItemButton>
                  ))}
                </List>
              )}

              {/* Snippet */}
              <TextField
                label="Embed snippet"
                value={snippet}
                size="small"
                fullWidth
                placeholder="Select a project above"
                InputProps={{
                  readOnly: true,
                  endAdornment: snippet ? (
                    <InputAdornment position="end">
                      <Tooltip title={embedCopied ? 'Copied!' : 'Copy'}>
                        <IconButton size="small" onClick={() => {
                          navigator.clipboard.writeText(snippet);
                          setEmbedCopied(true);
                          setTimeout(() => setEmbedCopied(false), 2000);
                        }}>
                          {embedCopied ? <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ) : undefined,
                }}
              />
            </DialogContent>
          </Dialog>
        );
      })()}
    </Box>
    </FileOpsProvider>
  );
}
