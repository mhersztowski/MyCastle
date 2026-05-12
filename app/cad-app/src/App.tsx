import { useCallback, useRef, useState } from 'react';
import { Box, IconButton, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import LayersIcon from '@mui/icons-material/Layers';
import TuneIcon from '@mui/icons-material/Tune';
import Looks3OutlinedIcon from '@mui/icons-material/Looks3Outlined';
import LooksOneOutlinedIcon from '@mui/icons-material/LooksOneOutlined';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { Project } from '@mhersztowski/core-cad';
import type { Point2D, ViewMode } from '@mhersztowski/core-cad';
import { CadCanvas } from './components/CadCanvas';
import { CommandLine } from './components/CommandLine';
import { FileMenu } from './components/FileMenu';
import { LayerPanel } from './components/LayerPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Scene3DView } from './components/Scene3DView';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { BreadboardCanvas } from './components/electronics/BreadboardCanvas';
import { ComponentLibrary } from './components/electronics/ComponentLibrary';
import { AiPanel } from './components/AiPanel';
import { useProject } from './hooks/useProject';
import type { ToolName } from './tools/types';

const project = new Project();

type AppMode = 'cad' | 'scene3d' | 'electronics';
type RightTab = 'layers' | 'properties';

export default function App() {
  const { version } = useProject(project);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [mode, setMode] = useState<AppMode>('cad');
  const [cadViewMode, setCadViewMode] = useState<ViewMode>('2d');
  const [rightTab, setRightTab] = useState<RightTab>('layers');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

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

        {/* AI toggle (all modes) */}
        <Tooltip title={aiOpen ? 'Close AI assistant' : 'Open AI assistant'}>
          <IconButton
            size="small"
            onClick={() => setAiOpen(v => !v)}
            sx={{
              ml: mode === 'cad' ? 0 : 'auto',
              mr: mode === 'cad' ? 0 : 1,
              color: aiOpen ? 'primary.main' : 'text.secondary',
            }}
          >
            <SmartToyOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>

        {/* 2D / 3D view mode toggle — only in CAD tab */}
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

      {/* CAD panel */}
      <Box sx={{ flex: 1, display: mode === 'cad' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Toolbar activeTool={activeTool} onToolChange={handleToolChange} project={project} viewMode={cadViewMode} />

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

          {/* AI panel — slides in from the right */}
          {aiOpen && (
            <Box sx={{
              width: 380, display: 'flex', flexDirection: 'column',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              bgcolor: 'background.paper', overflow: 'hidden',
            }}>
              <AiPanel project={project} version={version} />
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
            <AiPanel project={project} version={version} onSceneData={setAiSceneData} />
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
            <AiPanel project={project} version={version} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
