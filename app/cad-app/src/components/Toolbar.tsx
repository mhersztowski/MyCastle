import React from 'react';
import { Box, Tooltip, IconButton, Divider, Typography } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import StraightenIcon from '@mui/icons-material/Straighten';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import PanoramaFishEyeIcon from '@mui/icons-material/PanoramaFishEye';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import RoundedCornerIcon from '@mui/icons-material/RoundedCorner';
import type { Project, ViewMode } from '@mhersztowski/core-cad';
import type { ToolName } from '../tools/types';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  project: Project;
  viewMode: ViewMode;
}

const DRAW_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'select', label: 'Select (S)', icon: <NearMeIcon fontSize="small" /> },
  { name: 'line', label: 'Line (L)', icon: <HorizontalRuleIcon fontSize="small" /> },
  { name: 'circle', label: 'Circle (C)', icon: <CircleOutlinedIcon fontSize="small" /> },
  { name: 'arc', label: 'Arc (A) — center, start, end', icon: <PanoramaFishEyeIcon fontSize="small" /> },
  { name: 'rect', label: 'Rectangle (R)', icon: <RectangleOutlinedIcon fontSize="small" /> },
  { name: 'polyline', label: 'Polyline (P)', icon: <TimelineIcon fontSize="small" /> },
];

const EDIT_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'move', label: 'Move (M) — select first', icon: <OpenWithIcon fontSize="small" /> },
  { name: 'copy', label: 'Copy (CO) — select first', icon: <ContentCopyIcon fontSize="small" /> },
  { name: 'rotate', label: 'Rotate (RO) — select first', icon: <RotateRightIcon fontSize="small" /> },
  { name: 'offset', label: 'Offset (O) — click entity, move to distance', icon: <LinearScaleIcon fontSize="small" /> },
  { name: 'trim', label: 'Trim (TR) — boundary, then part to remove', icon: <ContentCutIcon fontSize="small" /> },
  { name: 'fillet', label: 'Fillet (F) — two lines → corner', icon: <RoundedCornerIcon fontSize="small" /> },
  { name: 'dimension', label: 'Linear Dimension (DI)', icon: <StraightenIcon fontSize="small" /> },
];

const SOLID_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'box3d', label: 'Box (BX) — click two corners', icon: <CropSquareIcon fontSize="small" /> },
  { name: 'cylinder3d', label: 'Cylinder (CY) — center + edge', icon: <CircleOutlinedIcon fontSize="small" /> },
  { name: 'sphere3d', label: 'Sphere (SP) — center + edge', icon: <ViewInArIcon fontSize="small" /> },
];

function ToolButton({ tool, activeTool, onToolChange }: { tool: typeof DRAW_TOOLS[0]; activeTool: ToolName; onToolChange: (t: ToolName) => void }) {
  return (
    <Tooltip key={tool.name} title={tool.label} placement="right">
      <IconButton
        onClick={() => onToolChange(tool.name)}
        sx={{
          width: 32, height: 32, borderRadius: 1,
          color: activeTool === tool.name ? 'primary.main' : 'text.secondary',
          bgcolor: activeTool === tool.name ? 'rgba(79,195,247,0.12)' : 'transparent',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
        }}
      >
        {tool.icon}
      </IconButton>
    </Tooltip>
  );
}

export function Toolbar({ activeTool, onToolChange, project, viewMode }: Props) {
  return (
    <Box sx={{
      width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 0.5, py: 1, bgcolor: 'background.paper', borderRight: '1px solid rgba(255,255,255,0.08)',
      overflowY: 'auto',
    }}>
      {/* Draw tools */}
      {DRAW_TOOLS.map(t => (
        <ToolButton key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />
      ))}

      <Divider flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Edit tools */}
      {EDIT_TOOLS.map(t => (
        <ToolButton key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />
      ))}

      <Divider flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Undo / Redo / Delete */}
      <Tooltip title="Undo (Ctrl+Z)" placement="right">
        <span><IconButton
          size="small" sx={{ width: 32, height: 32 }}
          disabled={!project.historyManager.canUndo()}
          onClick={() => project.undo()}
        >
          <UndoIcon fontSize="small" />
        </IconButton></span>
      </Tooltip>
      <Tooltip title="Redo (Ctrl+Y)" placement="right">
        <span><IconButton
          size="small" sx={{ width: 32, height: 32 }}
          disabled={!project.historyManager.canRedo()}
          onClick={() => project.redo()}
        >
          <RedoIcon fontSize="small" />
        </IconButton></span>
      </Tooltip>
      <Tooltip title="Delete selected (Del)" placement="right">
        <span><IconButton
          size="small" sx={{ width: 32, height: 32 }}
          disabled={project.selectionManager.count() === 0}
          onClick={() => project.removeSelected()}
        >
          <DeleteIcon fontSize="small" />
        </IconButton></span>
      </Tooltip>

      {/* 3D solid primitives — visible only in 3D mode */}
      {viewMode === '3d' && (
        <>
          <Divider flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.08)' }} />
          <Tooltip title="3D Solids" placement="right">
            <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled', letterSpacing: 0.5 }}>
              3D
            </Typography>
          </Tooltip>
          {SOLID_TOOLS.map(t => (
            <ToolButton key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />
          ))}
        </>
      )}
    </Box>
  );
}
