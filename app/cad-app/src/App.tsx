import { useState } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { Project } from '@mhersztowski/core-cad';
import { CadCanvas } from './components/CadCanvas';
import { Toolbar } from './components/Toolbar';
import { LayerPanel } from './components/LayerPanel';
import { StatusBar } from './components/StatusBar';
import { Scene3DView } from './components/Scene3DView';
import { useProject } from './hooks/useProject';
import type { ToolName } from './tools/types';

const project = new Project();

type AppMode = 'cad' | 'scene3d';

export default function App() {
  const { version } = useProject(project);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [mode, setMode] = useState<AppMode>('cad');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* Mode tabs */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
        <Tabs
          value={mode}
          onChange={(_, v: AppMode) => setMode(v)}
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0, fontSize: 12 } }}
        >
          <Tab
            value="cad"
            label="CAD 2D"
            icon={<PentagonOutlinedIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="scene3d"
            label="Scene 3D"
            icon={<ViewInArIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
        </Tabs>
      </Box>

      {/* CAD panel — kept mounted to preserve canvas/renderer state */}
      <Box sx={{ flex: 1, display: mode === 'cad' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Toolbar activeTool={activeTool} onToolChange={setActiveTool} project={project} />
          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <CadCanvas project={project} activeTool={activeTool} version={version} />
          </Box>
          <LayerPanel project={project} version={version} />
        </Box>
        <StatusBar project={project} activeTool={activeTool} />
      </Box>

      {/* Scene 3D panel */}
      <Box sx={{ flex: 1, display: mode === 'scene3d' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <Scene3DView project={project} />
      </Box>
    </Box>
  );
}
