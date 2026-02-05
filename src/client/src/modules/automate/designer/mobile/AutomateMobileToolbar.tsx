/**
 * AutomateMobileToolbar - kompaktowy floating toolbar dla mobile
 */

import React, { useState } from 'react';
import {
  Paper,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { useAutomateDesigner } from '../AutomateDesignerContext';

interface AutomateMobileToolbarProps {
  onSave: () => void;
  onRun: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onToggleLog: () => void;
  saving?: boolean;
}

const AutomateMobileToolbar: React.FC<AutomateMobileToolbarProps> = ({
  onSave,
  onRun,
  onZoomIn,
  onZoomOut,
  onFitView,
  onToggleLog,
  saving,
}) => {
  const { isExecuting, stopExecution, undo, redo, canUndo, canRedo } = useAutomateDesigner();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  return (
    <>
      <Paper
        elevation={3}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.25,
          px: 0.5,
          py: 0.25,
          borderRadius: 2,
        }}
      >
        <IconButton size="small" onClick={onSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : <SaveIcon fontSize="small" />}
        </IconButton>

        {isExecuting ? (
          <IconButton size="small" onClick={stopExecution} color="error">
            <StopIcon fontSize="small" />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={onRun} color="success">
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        )}

        {isExecuting && <CircularProgress size={16} sx={{ mx: 0.5 }} />}

        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Paper>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => { undo(); setMenuAnchor(null); }} disabled={!canUndo()}>
          <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Cofnij</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { redo(); setMenuAnchor(null); }} disabled={!canRedo()}>
          <ListItemIcon><RedoIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Ponów</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { onZoomIn(); setMenuAnchor(null); }}>
          <ListItemIcon><ZoomInIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Przybliż</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onZoomOut(); setMenuAnchor(null); }}>
          <ListItemIcon><ZoomOutIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Oddal</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onFitView(); setMenuAnchor(null); }}>
          <ListItemIcon><FitScreenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Dopasuj widok</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { onToggleLog(); setMenuAnchor(null); }}>
          <ListItemIcon><ListAltIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Log wykonania</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};

export default AutomateMobileToolbar;
