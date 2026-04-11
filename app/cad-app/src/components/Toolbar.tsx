import React from 'react';
import { Box, Tooltip, IconButton, Divider } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Project } from '@mhersztowski/core-cad';
import type { ToolName } from '../tools/types';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  project: Project;
}

const DRAW_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'select', label: 'Select (S)', icon: <NearMeIcon fontSize="small" /> },
  { name: 'line', label: 'Line (L)', icon: <HorizontalRuleIcon fontSize="small" /> },
  { name: 'circle', label: 'Circle (C)', icon: <CircleOutlinedIcon fontSize="small" /> },
  { name: 'rect', label: 'Rectangle (R)', icon: <RectangleOutlinedIcon fontSize="small" /> },
  { name: 'polyline', label: 'Polyline (P)', icon: <TimelineIcon fontSize="small" /> },
];

export function Toolbar({ activeTool, onToolChange, project }: Props) {
  return (
    <Box sx={{
      width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 0.5, py: 1, bgcolor: 'background.paper', borderRight: '1px solid rgba(255,255,255,0.08)',
    }}>
      {DRAW_TOOLS.map(t => (
        <Tooltip key={t.name} title={t.label} placement="right">
          <IconButton
            onClick={() => onToolChange(t.name)}
            sx={{
              width: 32, height: 32, borderRadius: 1,
              color: activeTool === t.name ? 'primary.main' : 'text.secondary',
              bgcolor: activeTool === t.name ? 'rgba(79,195,247,0.12)' : 'transparent',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            {t.icon}
          </IconButton>
        </Tooltip>
      ))}

      <Divider flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.08)' }} />

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
    </Box>
  );
}
