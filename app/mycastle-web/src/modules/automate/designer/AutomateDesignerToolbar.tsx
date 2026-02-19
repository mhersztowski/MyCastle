/**
 * AutomateDesignerToolbar - górny pasek narzędzi
 */

import React from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { useAutomateDesigner } from './AutomateDesignerContext';

interface AutomateDesignerToolbarProps {
  onSave: () => void;
  onRun: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  saving?: boolean;
}

const AutomateDesignerToolbar: React.FC<AutomateDesignerToolbarProps> = ({
  onSave,
  onRun,
  onZoomIn,
  onZoomOut,
  onFitView,
  saving,
}) => {
  const { isExecuting, stopExecution, undo, redo, canUndo, canRedo } = useAutomateDesigner();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Tooltip title="Zapisz (Ctrl+S)">
        <span>
          <IconButton size="small" onClick={onSave} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : <SaveIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {isExecuting ? (
        <Tooltip title="Stop">
          <IconButton size="small" onClick={stopExecution} color="error">
            <StopIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title="Uruchom flow">
          <IconButton size="small" onClick={onRun} color="success">
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Cofnij (Ctrl+Z)">
        <span>
          <IconButton size="small" onClick={undo} disabled={!canUndo()}>
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Ponów (Ctrl+Y)">
        <span>
          <IconButton size="small" onClick={redo} disabled={!canRedo()}>
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      <Tooltip title="Zoom In">
        <IconButton size="small" onClick={onZoomIn}>
          <ZoomInIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Zoom Out">
        <IconButton size="small" onClick={onZoomOut}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Tooltip title="Dopasuj widok">
        <IconButton size="small" onClick={onFitView}>
          <FitScreenIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {isExecuting && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} />
        </Box>
      )}
    </Box>
  );
};

export default AutomateDesignerToolbar;
