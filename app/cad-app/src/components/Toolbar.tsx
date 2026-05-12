import React from 'react';
import { Box, Tooltip, IconButton, Divider, Typography } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import PanoramaFishEyeIcon from '@mui/icons-material/PanoramaFishEye';
import GestureIcon from '@mui/icons-material/Gesture';
import TitleIcon from '@mui/icons-material/Title';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import type { ViewMode } from '@mhersztowski/core-cad';
import type { ToolName } from '../tools/types';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  viewMode: ViewMode;
}

const DRAW_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'select',   label: 'Select (S)',                    icon: <NearMeIcon fontSize="small" /> },
  { name: 'line',     label: 'Line (L)',                      icon: <HorizontalRuleIcon fontSize="small" /> },
  { name: 'circle',   label: 'Circle (C)',                    icon: <CircleOutlinedIcon fontSize="small" /> },
  { name: 'arc',      label: 'Arc (A) — center, start, end', icon: <PanoramaFishEyeIcon fontSize="small" /> },
  { name: 'rect',     label: 'Rectangle (R)',                 icon: <RectangleOutlinedIcon fontSize="small" /> },
  { name: 'polyline', label: 'Polyline (P)',                  icon: <TimelineIcon fontSize="small" /> },
  { name: 'freehand', label: 'Freehand (FH)',                 icon: <GestureIcon fontSize="small" /> },
  { name: 'text',     label: 'Text (TX) — click to place',   icon: <TitleIcon fontSize="small" /> },
  { name: 'image',    label: 'Image (IM) — click to insert', icon: <ImageOutlinedIcon fontSize="small" /> },
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

export function Toolbar({ activeTool, onToolChange, viewMode }: Props) {
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
