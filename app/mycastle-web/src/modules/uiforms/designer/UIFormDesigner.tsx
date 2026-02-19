/**
 * UI Form Designer - główny komponent visual designera
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Toolbar,
  IconButton,
  Tooltip,
  Typography,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import PreviewIcon from '@mui/icons-material/Preview';
import GridOnIcon from '@mui/icons-material/GridOn';
import GridOffIcon from '@mui/icons-material/GridOff';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BuildIcon from '@mui/icons-material/Build';
import TuneIcon from '@mui/icons-material/Tune';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MoreVertIcon from '@mui/icons-material/MoreVert';

import { UIDesignerProvider, useUIDesigner } from './UIDesignerContext';
import UIDesignerToolbox from './UIDesignerToolbox';
import UIDesignerCanvas from './UIDesignerCanvas';
import UIDesignerProperties from './UIDesignerProperties';
import UIDesignerTree from './UIDesignerTree';
import { UIFormModel } from '../models';
import { UIFormRenderer } from '../renderer/UIFormRenderer';

// Toolbar wewnątrz providera
const DesignerToolbar: React.FC<{
  onSave?: () => void;
  onPreview?: () => void;
  onOpenFormSettings?: () => void;
}> = ({ onSave, onPreview, onOpenFormSettings }) => {
  const {
    form,
    zoom,
    setZoom,
    showGrid,
    toggleGrid,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUIDesigner();

  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

  const handleZoomChange = (_: Event, value: number | number[]) => {
    setZoom((value as number) / 100);
  };

  return (
    <Toolbar
      variant="dense"
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        gap: 1,
        minHeight: 48,
        px: 1,
      }}
    >
      {/* Form name */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mr: 2 }}>
        {form?.name || 'Nowy formularz'}
      </Typography>

      <Divider orientation="vertical" flexItem />

      {/* Undo/Redo */}
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

      <Divider orientation="vertical" flexItem />

      {/* Grid toggle */}
      <Tooltip title={showGrid ? 'Ukryj siatkę' : 'Pokaż siatkę'}>
        <IconButton size="small" onClick={toggleGrid}>
          {showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      {/* Zoom */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 150 }}>
        <Tooltip title="Pomniejsz">
          <IconButton size="small" onClick={() => setZoom(zoom - 0.1)}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Slider
          value={zoom * 100}
          onChange={handleZoomChange}
          min={25}
          max={200}
          size="small"
          sx={{ width: 80 }}
        />
        <Tooltip title="Powiększ">
          <IconButton size="small" onClick={() => setZoom(zoom + 0.1)}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" sx={{ minWidth: 40 }}>
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="Dopasuj">
          <IconButton size="small" onClick={() => setZoom(1)}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1 }} />

      {/* Form settings */}
      <Tooltip title="Ustawienia formularza">
        <IconButton size="small" onClick={onOpenFormSettings}>
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      {/* Preview */}
      <Tooltip title="Podgląd">
        <IconButton size="small" onClick={onPreview} color="info">
          <PreviewIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Save */}
      <Tooltip title="Zapisz (Ctrl+S)">
        <IconButton size="small" onClick={onSave} color="primary">
          <SaveIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* More menu */}
      <IconButton size="small" onClick={(e) => setMoreAnchor(e.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={() => setMoreAnchor(null)}
      >
        <MenuItem onClick={() => setMoreAnchor(null)}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Nowy formularz</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => setMoreAnchor(null)}>
          <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Otwórz...</ListItemText>
        </MenuItem>
      </Menu>
    </Toolbar>
  );
};

// Dialog ustawień formularza
const FormSettingsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { form, updateFormSettings } = useUIDesigner();

  const [width, setWidth] = useState(form?.settings?.width || 400);
  const [height, setHeight] = useState(form?.settings?.height || 300);
  const [padding, setPadding] = useState(form?.settings?.padding || 16);

  useEffect(() => {
    if (form?.settings) {
      setWidth(form.settings.width || 400);
      setHeight(form.settings.height || 300);
      setPadding(form.settings.padding || 16);
    }
  }, [form?.settings]);

  const handleSave = () => {
    updateFormSettings({ width, height, padding });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Ustawienia formularza</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <TextField
          label="Szerokość (px)"
          type="number"
          fullWidth
          value={width}
          onChange={(e) => setWidth(parseInt(e.target.value) || 400)}
          inputProps={{ min: 100, max: 2000 }}
        />
        <TextField
          label="Wysokość (px)"
          type="number"
          fullWidth
          value={height}
          onChange={(e) => setHeight(parseInt(e.target.value) || 300)}
          inputProps={{ min: 100, max: 2000 }}
        />
        <TextField
          label="Padding (px)"
          type="number"
          fullWidth
          value={padding}
          onChange={(e) => setPadding(parseInt(e.target.value) || 0)}
          inputProps={{ min: 0, max: 100 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button onClick={handleSave} variant="contained">
          Zapisz
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Dialog podglądu
const PreviewDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  form: UIFormModel | null;
}> = ({ open, onClose, form }) => {
  if (!form) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PreviewIcon color="primary" />
        Podgląd: {form.name}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ minHeight: 300 }}>
          <UIFormRenderer form={form} mode="view" />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>
    </Dialog>
  );
};

// Panel toggles
type PanelType = 'toolbox' | 'tree' | 'properties';

// Główny layout designera (wewnątrz providera)
const DesignerLayout: React.FC<{
  onSave?: (form: UIFormModel) => void;
}> = ({ onSave }) => {
  const { form } = useUIDesigner();
  const [visiblePanels, setVisiblePanels] = useState<Set<PanelType>>(
    new Set(['toolbox', 'tree', 'properties'])
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handlePanelToggle = (_: React.MouseEvent<HTMLElement>, panels: PanelType[]) => {
    setVisiblePanels(new Set(panels));
  };

  const handleSave = useCallback(() => {
    if (form && onSave) {
      onSave(form);
    }
  }, [form, onSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <DesignerToolbar
        onSave={handleSave}
        onPreview={() => setPreviewOpen(true)}
        onOpenFormSettings={() => setSettingsOpen(true)}
      />

      {/* Panel toggles */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Panele:
        </Typography>
        <ToggleButtonGroup
          size="small"
          value={Array.from(visiblePanels)}
          onChange={handlePanelToggle}
        >
          <ToggleButton value="toolbox" sx={{ py: 0.5, px: 1 }}>
            <Tooltip title="Kontrolki">
              <BuildIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="tree" sx={{ py: 0.5, px: 1 }}>
            <Tooltip title="Hierarchia">
              <AccountTreeIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="properties" sx={{ py: 0.5, px: 1 }}>
            <Tooltip title="Właściwości">
              <TuneIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panels */}
        {(visiblePanels.has('toolbox') || visiblePanels.has('tree')) && (
          <Box sx={{ display: 'flex', borderRight: 1, borderColor: 'divider' }}>
            <UIDesignerToolbox collapsed={!visiblePanels.has('toolbox')} />
            <UIDesignerTree collapsed={!visiblePanels.has('tree')} />
          </Box>
        )}

        {/* Canvas */}
        <UIDesignerCanvas />

        {/* Properties panel */}
        <UIDesignerProperties collapsed={!visiblePanels.has('properties')} />
      </Box>

      {/* Dialogs */}
      <FormSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} form={form} />
    </Box>
  );
};

// Eksportowany komponent z providerem
interface UIFormDesignerProps {
  initialForm?: UIFormModel | null;
  onChange?: (form: UIFormModel) => void;
  onSave?: (form: UIFormModel) => void;
}

const UIFormDesigner: React.FC<UIFormDesignerProps> = ({
  initialForm = null,
  onChange,
  onSave,
}) => {
  return (
    <UIDesignerProvider initialForm={initialForm} onChange={onChange}>
      <DesignerLayout onSave={onSave} />
    </UIDesignerProvider>
  );
};

export default UIFormDesigner;
