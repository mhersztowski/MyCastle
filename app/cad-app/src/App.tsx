import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import LayersIcon from '@mui/icons-material/Layers';
import TuneIcon from '@mui/icons-material/Tune';
import Looks3OutlinedIcon from '@mui/icons-material/Looks3Outlined';
import LooksOneOutlinedIcon from '@mui/icons-material/LooksOneOutlined';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CodeIcon from '@mui/icons-material/Code';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import MinimizeIcon from '@mui/icons-material/Minimize';
import { Project } from '@mhersztowski/core-cad';
import type { Point2D, ViewMode } from '@mhersztowski/core-cad';
import { CadCanvas } from './components/CadCanvas';
import { CommandLine } from './components/CommandLine';
import { FileMenu } from './components/FileMenu';
import { LayerPanel } from './components/LayerPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Scene3DView } from './components/Scene3DView';
import { StatusBar } from './components/StatusBar';
import { ActionBar } from './components/ActionBar';
import { Toolbar } from './components/Toolbar';
import { Cad3dView } from './components/Cad3dView';
import { BreadboardCanvas } from './components/electronics/BreadboardCanvas';
import { ComponentLibrary } from './components/electronics/ComponentLibrary';
import { ResizeDivider } from './components/ResizeDivider';
const AiPanel = lazy(() => import('./components/AiPanel').then(m => ({ default: m.AiPanel })));
const CodeEditorPanel = lazy(() => import('./components/CodeEditorPanel').then(m => ({ default: m.CodeEditorPanel })));
import { useProject } from './hooks/useProject';
import type { ToolName } from './tools/types';

const project = new Project();

type AppMode = 'cad' | 'cad3d' | 'scene3d' | 'electronics';
type RightTab = 'layers' | 'properties';

export default function App() {
  const { version } = useProject(project);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [mode, setMode] = useState<AppMode>('cad');
  const [cadViewMode, setCadViewMode] = useState<ViewMode>('2d');
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  // Code editor docked on the right of every mode — collapsed by default, opened via the </> button.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorWidth, setEditorWidth] = useState(560);
  const [editorFullscreen, setEditorFullscreen] = useState(false);

  const [aiSceneData, setAiSceneData] = useState<string | undefined>(undefined);

  const [savedSceneJson, setSavedSceneJson] = useState<string | null>(null);

  const [injectedPoint, setInjectedPoint] = useState<Point2D | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<number | null>(null);
  const lastPointRef = useRef<Point2D | null>(null);

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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* Top bar: mode tabs + 2D/3D toggle */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
        <FileMenu
          project={project}
          getSceneData={() => savedSceneJson}
          onSceneData={json => { setAiSceneData(json); setSavedSceneJson(json); }}
        />
        <Tabs
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
            value="electronics"
            label="Electronics"
            icon={<ElectricalServicesIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
        </Tabs>

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
              mr: mode === 'cad' ? 0 : 1,
              color: editorOpen ? 'primary.main' : 'text.secondary',
            }}
          >
            <CodeIcon sx={{ fontSize: 18 }} />
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
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Cad3dView project={project} version={version} />
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
      )}

      {/* Scene 3D panel */}
      <Box sx={{ flex: 1, display: mode === 'scene3d' ? 'flex' : 'none', flexDirection: 'row', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Scene3DView
            project={project}
            externalSceneData={aiSceneData}
            onSceneDataChange={json => setSavedSceneJson(json)}
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

      {/* Electronics panel */}
      <Box sx={{ flex: 1, display: mode === 'electronics' ? 'flex' : 'none', flexDirection: 'row', overflow: 'hidden' }}>
        <ComponentLibrary
          selectedPartId={selectedPartId}
          onSelectPart={id => setSelectedPartId(id)}
        />
        <BreadboardCanvas
          pendingPartId={selectedPartId}
          onPendingPartConsumed={() => {}}
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
    </Box>
  );
}
