import React from 'react';
import { Box, Tooltip, IconButton, Divider } from '@mui/material';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import RoundedCornerIcon from '@mui/icons-material/RoundedCorner';
import StraightenIcon from '@mui/icons-material/Straighten';
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

const TRANSFORM_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'move',   label: 'Move (M) — select first',    icon: <OpenWithIcon fontSize="small" /> },
  { name: 'copy',   label: 'Copy (CO) — select first',   icon: <ContentCopyIcon fontSize="small" /> },
  { name: 'rotate', label: 'Rotate (RO) — select first', icon: <RotateRightIcon fontSize="small" /> },
];

const EDIT_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'offset',    label: 'Offset (O)',     icon: <LinearScaleIcon fontSize="small" /> },
  { name: 'trim',      label: 'Trim (TR)',      icon: <ContentCutIcon fontSize="small" /> },
  { name: 'fillet',    label: 'Fillet (F)',     icon: <RoundedCornerIcon fontSize="small" /> },
  { name: 'dimension', label: 'Dimension (DI)', icon: <StraightenIcon fontSize="small" /> },
];

function ActionBtn({ tool, activeTool, onToolChange }: {
  tool: typeof TRANSFORM_TOOLS[0];
  activeTool: ToolName;
  onToolChange: (t: ToolName) => void;
}) {
  return (
    <Tooltip title={tool.label} placement="bottom">
      <IconButton
        size="small"
        onClick={() => onToolChange(tool.name)}
        sx={{
          width: 30, height: 30, borderRadius: 1,
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

export function ActionBar({ activeTool, onToolChange, project }: Props) {
  const desc = project.historyManager.getDescription();
  const undoTitle = desc.undoLabel ? `Undo: ${desc.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
  const redoTitle = desc.redoLabel ? `Redo: ${desc.redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)';

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'row', alignItems: 'center',
      gap: 0.25, px: 1, flexShrink: 0, height: 38,
      bgcolor: 'background.paper',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      {TRANSFORM_TOOLS.map(t => (
        <ActionBtn key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />
      ))}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />

      {EDIT_TOOLS.map(t => (
        <ActionBtn key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />
      ))}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />

      <Tooltip title={undoTitle} placement="bottom">
        <span>
          <IconButton
            size="small"
            sx={{ width: 30, height: 30 }}
            disabled={!project.historyManager.canUndo()}
            onClick={() => project.undo()}
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={redoTitle} placement="bottom">
        <span>
          <IconButton
            size="small"
            sx={{ width: 30, height: 30 }}
            disabled={!project.historyManager.canRedo()}
            onClick={() => project.redo()}
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Delete selected (Del)" placement="bottom">
        <span>
          <IconButton
            size="small"
            sx={{ width: 30, height: 30 }}
            disabled={project.selectionManager.count() === 0}
            onClick={() => project.removeSelected()}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
