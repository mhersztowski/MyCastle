import { useCallback, useRef, useState } from 'react';
import { Box, Button, Chip, Divider, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import type { Project } from '@mhersztowski/core-cad';
import type { Point2D } from '@mhersztowski/core-cad';
import { ActionBar } from '../ActionBar';
import { CadCanvas } from '../CadCanvas';
import { CommandLine } from '../CommandLine';
import { LayerPanel } from '../LayerPanel';
import { PropertiesPanel } from '../PropertiesPanel';
import { StatusBar } from '../StatusBar';
import { Toolbar } from '../Toolbar';
import { useProject } from '../../hooks/useProject';
import type { SketchPlane } from '../../cad3d/types';
import type { ToolName } from '../../tools/types';

interface Props {
  project: Project;
  plane: SketchPlane;
  onExit: () => void;
}

const PLANE_LABEL: Record<SketchPlane, string> = {
  XY: 'XY — front plane',
  XZ: 'XZ — top plane',
  YZ: 'YZ — right plane',
  face: 'Face plane',
};

export function SketchEditor({ project, plane, onExit }: Props) {
  const { version } = useProject(project);
  const [activeTool, setActiveTool] = useState<ToolName>('line');
  const [rightTab, setRightTab] = useState<'layers' | 'properties'>('layers');
  const [injectedPoint, setInjectedPoint] = useState<Point2D | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<number | null>(null);
  const lastPointRef = useRef<Point2D | null>(null);

  const handleToolChange = useCallback((tool: ToolName) => {
    setActiveTool(tool);
    setInjectedPoint(null);
    setInjectedAngle(null);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sketch header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 0.5,
        bgcolor: 'primary.dark', borderBottom: '1px solid', borderColor: 'primary.main', flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.contrastText', letterSpacing: 0.5 }}>
          SKETCH EDITOR
        </Typography>
        <Chip label={PLANE_LABEL[plane]} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          onClick={onExit}
        >
          Exit Sketch
        </Button>
      </Box>

      <ActionBar activeTool={activeTool} onToolChange={handleToolChange} project={project} />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar activeTool={activeTool} onToolChange={handleToolChange} viewMode="2d" />

        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <CadCanvas
            project={project}
            activeTool={activeTool}
            version={version}
            viewMode="2d"
            injectedPoint={injectedPoint}
            injectedAngle={injectedAngle}
            onLastPoint={p => { lastPointRef.current = p; }}
          />
        </Box>

        <Box sx={{
          width: 200, display: 'flex', flexDirection: 'column',
          bgcolor: 'background.paper', borderLeft: '1px solid rgba(255,255,255,0.08)',
        }}>
          <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {(['layers', 'properties'] as const).map(tab => (
              <Box
                key={tab}
                onClick={() => setRightTab(tab)}
                sx={{
                  flex: 1, py: 0.5, textAlign: 'center', cursor: 'pointer', fontSize: 11,
                  color: rightTab === tab ? 'primary.main' : 'text.secondary',
                  borderBottom: rightTab === tab ? '2px solid' : '2px solid transparent',
                  borderColor: rightTab === tab ? 'primary.main' : 'transparent',
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </Box>
            ))}
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {rightTab === 'layers'
              ? <LayerPanel project={project} version={version} />
              : <PropertiesPanel project={project} version={version} />
            }
          </Box>
        </Box>
      </Box>

      <Divider />
      <StatusBar project={project} activeTool={activeTool} viewMode="2d" />
      <CommandLine
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onCoordinate={p => setInjectedPoint({ ...p })}
        onAngle={deg => setInjectedAngle(deg + Math.random() * 1e-10)}
        lastPoint={lastPointRef.current}
      />
    </Box>
  );
}
