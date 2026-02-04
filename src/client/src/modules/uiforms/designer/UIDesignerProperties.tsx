/**
 * UI Designer Properties - panel edycji właściwości kontrolki
 */

import React, { useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsIcon from '@mui/icons-material/Settings';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import LinkIcon from '@mui/icons-material/Link';
import TuneIcon from '@mui/icons-material/Tune';

import { useUIDesigner } from './UIDesignerContext';
import { CONTROL_METADATA } from '../renderer/controls/registry';
import {
  UIControlModel,
  ANCHOR_PRESETS,
  UIAnchorPreset,
  UISizeFlag,
} from '../models';

// Sekcja właściwości podstawowych
const BasicPropertiesSection: React.FC<{
  control: UIControlModel;
  onChange: (updates: Partial<UIControlModel>) => void;
}> = ({ control, onChange }) => {
  const meta = CONTROL_METADATA[control.controlType];

  return (
    <Accordion defaultExpanded disableGutters elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">Podstawowe</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Nazwa"
          size="small"
          fullWidth
          value={control.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={meta?.label || control.controlType}
            size="small"
            color="primary"
            variant="outlined"
            icon={meta?.icon ? <meta.icon /> : undefined}
          />
          <Typography variant="caption" color="text.secondary">
            {control.id}
          </Typography>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

// Sekcja layout (anchors/offsets)
const LayoutSection: React.FC<{
  control: UIControlModel;
  onChange: (updates: Partial<UIControlModel>) => void;
}> = ({ control, onChange }) => {
  const presets = Object.keys(ANCHOR_PRESETS) as UIAnchorPreset[];

  return (
    <Accordion defaultExpanded disableGutters elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AspectRatioIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">Layout</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel>Anchor Preset</InputLabel>
          <Select
            value={control.anchorPreset || ''}
            label="Anchor Preset"
            onChange={(e) => {
              const preset = e.target.value as UIAnchorPreset;
              if (preset && ANCHOR_PRESETS[preset]) {
                onChange({
                  anchorPreset: preset,
                  anchors: ANCHOR_PRESETS[preset],
                });
              }
            }}
          >
            {presets.map((preset) => (
              <MenuItem key={preset} value={preset}>
                {preset}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary">
          Anchors (0-1)
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField
            label="Left"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 1, step: 0.1 }}
            value={control.anchors?.left ?? 0}
            onChange={(e) =>
              onChange({
                anchors: { ...control.anchors!, left: parseFloat(e.target.value) || 0 },
              })
            }
          />
          <TextField
            label="Right"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 1, step: 0.1 }}
            value={control.anchors?.right ?? 1}
            onChange={(e) =>
              onChange({
                anchors: { ...control.anchors!, right: parseFloat(e.target.value) || 1 },
              })
            }
          />
          <TextField
            label="Top"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 1, step: 0.1 }}
            value={control.anchors?.top ?? 0}
            onChange={(e) =>
              onChange({
                anchors: { ...control.anchors!, top: parseFloat(e.target.value) || 0 },
              })
            }
          />
          <TextField
            label="Bottom"
            type="number"
            size="small"
            inputProps={{ min: 0, max: 1, step: 0.1 }}
            value={control.anchors?.bottom ?? 1}
            onChange={(e) =>
              onChange({
                anchors: { ...control.anchors!, bottom: parseFloat(e.target.value) || 1 },
              })
            }
          />
        </Box>

        <Divider />

        <Typography variant="caption" color="text.secondary">
          Offsets (px)
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField
            label="Left"
            type="number"
            size="small"
            value={control.offsets?.left ?? 0}
            onChange={(e) =>
              onChange({
                offsets: { ...control.offsets!, left: parseInt(e.target.value) || 0 },
              })
            }
          />
          <TextField
            label="Right"
            type="number"
            size="small"
            value={control.offsets?.right ?? 0}
            onChange={(e) =>
              onChange({
                offsets: { ...control.offsets!, right: parseInt(e.target.value) || 0 },
              })
            }
          />
          <TextField
            label="Top"
            type="number"
            size="small"
            value={control.offsets?.top ?? 0}
            onChange={(e) =>
              onChange({
                offsets: { ...control.offsets!, top: parseInt(e.target.value) || 0 },
              })
            }
          />
          <TextField
            label="Bottom"
            type="number"
            size="small"
            value={control.offsets?.bottom ?? 0}
            onChange={(e) =>
              onChange({
                offsets: { ...control.offsets!, bottom: parseInt(e.target.value) || 0 },
              })
            }
          />
        </Box>

        <Divider />

        <Typography variant="caption" color="text.secondary">
          Min Size
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <TextField
            label="Width"
            type="number"
            size="small"
            inputProps={{ min: 0 }}
            value={control.minSize?.width ?? ''}
            onChange={(e) =>
              onChange({
                minSize: {
                  ...control.minSize,
                  width: e.target.value ? parseInt(e.target.value) : undefined,
                },
              })
            }
          />
          <TextField
            label="Height"
            type="number"
            size="small"
            inputProps={{ min: 0 }}
            value={control.minSize?.height ?? ''}
            onChange={(e) =>
              onChange({
                minSize: {
                  ...control.minSize,
                  height: e.target.value ? parseInt(e.target.value) : undefined,
                },
              })
            }
          />
        </Box>

        <Typography variant="caption" color="text.secondary">
          Size Flags
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <FormControl size="small">
            <InputLabel>Horizontal</InputLabel>
            <Select
              value={control.sizeFlags?.horizontal || 'fill'}
              label="Horizontal"
              onChange={(e) =>
                onChange({
                  sizeFlags: {
                    ...control.sizeFlags,
                    horizontal: e.target.value as UISizeFlag,
                  },
                })
              }
            >
              <MenuItem value="fill">Fill</MenuItem>
              <MenuItem value="expand">Expand</MenuItem>
              <MenuItem value="shrink">Shrink</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Vertical</InputLabel>
            <Select
              value={control.sizeFlags?.vertical || 'fill'}
              label="Vertical"
              onChange={(e) =>
                onChange({
                  sizeFlags: {
                    ...control.sizeFlags,
                    vertical: e.target.value as UISizeFlag,
                  },
                })
              }
            >
              <MenuItem value="fill">Fill</MenuItem>
              <MenuItem value="expand">Expand</MenuItem>
              <MenuItem value="shrink">Shrink</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

// Sekcja data binding
const BindingSection: React.FC<{
  control: UIControlModel;
  onChange: (updates: Partial<UIControlModel>) => void;
}> = ({ control, onChange }) => {
  return (
    <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">Binding</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Field"
          size="small"
          fullWidth
          value={control.binding?.field || ''}
          onChange={(e) =>
            onChange({
              binding: {
                ...control.binding,
                field: e.target.value,
                mode: control.binding?.mode || 'twoWay',
              },
            })
          }
          helperText="Ścieżka do pola w danych formularza"
        />

        <FormControl fullWidth size="small">
          <InputLabel>Mode</InputLabel>
          <Select
            value={control.binding?.mode || 'twoWay'}
            label="Mode"
            onChange={(e) =>
              onChange({
                binding: {
                  ...control.binding,
                  field: control.binding?.field || '',
                  mode: e.target.value as 'oneWay' | 'twoWay' | 'oneTime',
                },
              })
            }
          >
            <MenuItem value="oneWay">One Way</MenuItem>
            <MenuItem value="twoWay">Two Way</MenuItem>
            <MenuItem value="oneTime">One Time</MenuItem>
          </Select>
        </FormControl>

        <Divider />

        <Typography variant="caption" color="text.secondary">
          Events
        </Typography>
        <TextField
          label="onClick"
          size="small"
          fullWidth
          value={control.events?.onClick || ''}
          onChange={(e) =>
            onChange({
              events: { ...control.events, onClick: e.target.value },
            })
          }
          helperText="Nazwa callbacka"
        />
        <TextField
          label="onChange"
          size="small"
          fullWidth
          value={control.events?.onChange || ''}
          onChange={(e) =>
            onChange({
              events: { ...control.events, onChange: e.target.value },
            })
          }
        />
        <TextField
          label="onSubmit"
          size="small"
          fullWidth
          value={control.events?.onSubmit || ''}
          onChange={(e) =>
            onChange({
              events: { ...control.events, onSubmit: e.target.value },
            })
          }
        />
      </AccordionDetails>
    </Accordion>
  );
};

// Sekcja właściwości specyficznych dla typu kontrolki
const ControlPropertiesSection: React.FC<{
  control: UIControlModel;
  onChange: (updates: Partial<UIControlModel>) => void;
}> = ({ control, onChange }) => {
  const properties = control.properties || {};

  const handlePropertyChange = (key: string, value: unknown) => {
    onChange({
      properties: { ...properties, [key]: value },
    });
  };

  // Różne pola w zależności od typu kontrolki
  const renderPropertyFields = () => {
    switch (control.controlType) {
      case 'label':
        return (
          <>
            <TextField
              label="Text"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={properties.text || ''}
              onChange={(e) => handlePropertyChange('text', e.target.value)}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Variant</InputLabel>
              <Select
                value={properties.variant || 'body1'}
                label="Variant"
                onChange={(e) => handlePropertyChange('variant', e.target.value)}
              >
                <MenuItem value="h1">H1</MenuItem>
                <MenuItem value="h2">H2</MenuItem>
                <MenuItem value="h3">H3</MenuItem>
                <MenuItem value="h4">H4</MenuItem>
                <MenuItem value="h5">H5</MenuItem>
                <MenuItem value="h6">H6</MenuItem>
                <MenuItem value="body1">Body 1</MenuItem>
                <MenuItem value="body2">Body 2</MenuItem>
                <MenuItem value="caption">Caption</MenuItem>
              </Select>
            </FormControl>
          </>
        );

      case 'button':
        return (
          <>
            <TextField
              label="Text"
              size="small"
              fullWidth
              value={properties.text || ''}
              onChange={(e) => handlePropertyChange('text', e.target.value)}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Variant</InputLabel>
              <Select
                value={properties.variant || 'contained'}
                label="Variant"
                onChange={(e) => handlePropertyChange('variant', e.target.value)}
              >
                <MenuItem value="contained">Contained</MenuItem>
                <MenuItem value="outlined">Outlined</MenuItem>
                <MenuItem value="text">Text</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Color</InputLabel>
              <Select
                value={properties.color || 'primary'}
                label="Color"
                onChange={(e) => handlePropertyChange('color', e.target.value)}
              >
                <MenuItem value="primary">Primary</MenuItem>
                <MenuItem value="secondary">Secondary</MenuItem>
                <MenuItem value="success">Success</MenuItem>
                <MenuItem value="error">Error</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="info">Info</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={!!properties.disabled}
                  onChange={(e) => handlePropertyChange('disabled', e.target.checked)}
                />
              }
              label="Disabled"
            />
          </>
        );

      case 'input':
        return (
          <>
            <TextField
              label="Label"
              size="small"
              fullWidth
              value={properties.label || ''}
              onChange={(e) => handlePropertyChange('label', e.target.value)}
            />
            <TextField
              label="Placeholder"
              size="small"
              fullWidth
              value={properties.placeholder || ''}
              onChange={(e) => handlePropertyChange('placeholder', e.target.value)}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={properties.type || 'text'}
                label="Type"
                onChange={(e) => handlePropertyChange('type', e.target.value)}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="number">Number</MenuItem>
                <MenuItem value="email">Email</MenuItem>
                <MenuItem value="password">Password</MenuItem>
                <MenuItem value="tel">Phone</MenuItem>
                <MenuItem value="url">URL</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={!!properties.required}
                  onChange={(e) => handlePropertyChange('required', e.target.checked)}
                />
              }
              label="Required"
            />
          </>
        );

      case 'checkbox':
        return (
          <>
            <TextField
              label="Label"
              size="small"
              fullWidth
              value={properties.label || ''}
              onChange={(e) => handlePropertyChange('label', e.target.value)}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={!!properties.checked}
                  onChange={(e) => handlePropertyChange('checked', e.target.checked)}
                />
              }
              label="Checked"
            />
          </>
        );

      case 'vbox':
      case 'hbox':
        return (
          <>
            <TextField
              label="Gap"
              type="number"
              size="small"
              fullWidth
              value={properties.gap ?? 8}
              onChange={(e) => handlePropertyChange('gap', parseInt(e.target.value) || 0)}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Align</InputLabel>
              <Select
                value={properties.align || 'stretch'}
                label="Align"
                onChange={(e) => handlePropertyChange('align', e.target.value)}
              >
                <MenuItem value="start">Start</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="end">End</MenuItem>
                <MenuItem value="stretch">Stretch</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Justify</InputLabel>
              <Select
                value={properties.justify || 'start'}
                label="Justify"
                onChange={(e) => handlePropertyChange('justify', e.target.value)}
              >
                <MenuItem value="start">Start</MenuItem>
                <MenuItem value="center">Center</MenuItem>
                <MenuItem value="end">End</MenuItem>
                <MenuItem value="space-between">Space Between</MenuItem>
                <MenuItem value="space-around">Space Around</MenuItem>
              </Select>
            </FormControl>
          </>
        );

      case 'grid':
        return (
          <>
            <TextField
              label="Columns"
              type="number"
              size="small"
              fullWidth
              inputProps={{ min: 1, max: 12 }}
              value={properties.columns ?? 2}
              onChange={(e) => handlePropertyChange('columns', parseInt(e.target.value) || 2)}
            />
            <TextField
              label="Gap"
              type="number"
              size="small"
              fullWidth
              value={properties.gap ?? 8}
              onChange={(e) => handlePropertyChange('gap', parseInt(e.target.value) || 0)}
            />
          </>
        );

      default:
        return (
          <Typography variant="caption" color="text.secondary">
            Brak dodatkowych właściwości
          </Typography>
        );
    }
  };

  return (
    <Accordion defaultExpanded disableGutters elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">Właściwości</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {renderPropertyFields()}
      </AccordionDetails>
    </Accordion>
  );
};

// Główny panel właściwości
interface UIDesignerPropertiesProps {
  collapsed?: boolean;
}

const UIDesignerProperties: React.FC<UIDesignerPropertiesProps> = ({ collapsed = false }) => {
  const {
    form,
    selectedControlId,
    getControlById,
    updateControl,
    deleteControl,
    duplicateControl,
  } = useUIDesigner();

  const selectedControl = selectedControlId ? getControlById(selectedControlId) : null;

  const handleControlChange = useCallback(
    (updates: Partial<UIControlModel>) => {
      if (selectedControlId) {
        updateControl(selectedControlId, updates);
      }
    },
    [selectedControlId, updateControl]
  );

  if (collapsed) {
    return null;
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: 280,
        height: '100%',
        borderLeft: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          Właściwości
        </Typography>
        {selectedControl && selectedControl.id !== form?.root.id && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Duplikuj">
              <IconButton size="small" onClick={() => duplicateControl(selectedControlId!)}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Usuń">
              <IconButton
                size="small"
                color="error"
                onClick={() => deleteControl(selectedControlId!)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {selectedControl ? (
          <>
            <BasicPropertiesSection control={selectedControl} onChange={handleControlChange} />
            <Divider />
            <ControlPropertiesSection control={selectedControl} onChange={handleControlChange} />
            <Divider />
            <LayoutSection control={selectedControl} onChange={handleControlChange} />
            <Divider />
            <BindingSection control={selectedControl} onChange={handleControlChange} />
          </>
        ) : (
          <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              Wybierz kontrolkę aby edytować jej właściwości
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default UIDesignerProperties;
