import React, { useState } from 'react';
import { Box, Tooltip, IconButton, Divider, Menu, MenuItem, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { freecadIconUrl } from '../assets/freecadIcons';
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
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import type { Project } from '@mhersztowski/core-cad';
import type { ToolName } from '../tools/types';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  project: Project;
  /** Dodatkowe elementy w tym samym rzędzie (np. toolbar constraintów w szkicu). */
  children?: React.ReactNode;
  /** Opcje w dropdownie przycisku Dimension (FreeCAD-style). Gdy podane, Dimension staje się split-buttonem. */
  dimensionOptions?: Array<{ key: string; label: string; sc: string; icon: string }>;
  onDimensionOption?: (key: string) => void;
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

export function ActionBar({ activeTool, onToolChange, project, children, dimensionOptions, onDimensionOption }: Props) {
  const [dimAnchor, setDimAnchor] = useState<null | HTMLElement>(null);
  const desc = project.historyManager.getDescription();
  const undoTitle = desc.undoLabel ? `Undo: ${desc.undoLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
  const redoTitle = desc.redoLabel ? `Redo: ${desc.redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)';

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'row', alignItems: 'center',
      gap: 0.25, px: 1, flexShrink: 0, minHeight: 38,
      bgcolor: 'background.paper',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      overflowX: 'auto',
    }}>
      {TRANSFORM_TOOLS.map(t => (
        <ActionBtn key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />
      ))}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />

      {EDIT_TOOLS.map(t => {
        // Dimension — split-button: klik = uniwersalny Dimension tool, ▾ = opcje FreeCAD.
        if (t.name === 'dimension' && dimensionOptions?.length) {
          const active = activeTool === 'dimension';
          const dimUrl = freecadIconUrl('c_dimension');
          return (
            <Box key={t.name} sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 1, bgcolor: active ? 'rgba(79,195,247,0.12)' : 'transparent' }}>
              <Tooltip title="Dimension (D) — universal" placement="bottom">
                <IconButton
                  size="small"
                  onClick={() => onToolChange('dimension')}
                  sx={{ width: 30, height: 30, borderRadius: 1, color: active ? 'primary.main' : 'text.secondary', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
                >
                  {dimUrl ? <img src={dimUrl} width={18} height={18} alt="Dimension" style={{ display: 'block' }} /> : <StraightenIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="More dimensions" placement="bottom">
                <IconButton
                  size="small"
                  onClick={e => setDimAnchor(e.currentTarget)}
                  sx={{ width: 16, height: 30, p: 0, ml: '-8px', color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                >
                  <ArrowDropDownIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={dimAnchor} open={!!dimAnchor} onClose={() => setDimAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
                {dimensionOptions.map(o => {
                  const iurl = freecadIconUrl(o.icon);
                  return (
                    <MenuItem key={o.key} dense onClick={() => { onDimensionOption?.(o.key); setDimAnchor(null); }} sx={{ minWidth: 260 }}>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        {iurl && <img src={iurl} width={18} height={18} alt="" style={{ display: 'block' }} />}
                      </ListItemIcon>
                      <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{o.label}</ListItemText>
                      <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>{o.sc}</Typography>
                    </MenuItem>
                  );
                })}
              </Menu>
            </Box>
          );
        }
        return <ActionBtn key={t.name} tool={t} activeTool={activeTool} onToolChange={onToolChange} />;
      })}

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

      {children && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.1)' }} />
          {children}
        </>
      )}
    </Box>
  );
}
