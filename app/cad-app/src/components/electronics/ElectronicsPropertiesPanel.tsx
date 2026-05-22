import { useEffect, useState } from 'react';
import { Box, FormControlLabel, InputAdornment, Switch, TextField, Typography } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import type { ComponentPlacement, PartDef } from '../../electronics/types';

interface Props {
  /** Currently selected component, or null when nothing is selected. */
  component: ComponentPlacement | null;
  /** Part definition of the selected component. */
  part: PartDef | null;
  /** Patch the selected component. */
  onChange: (updates: Partial<ComponentPlacement>) => void;
}

/**
 * Properties panel for the Electronics mode — edits the selected component:
 * a `ShowPinLabels` toggle and a free-angle `Rotation` field.
 */
export function ElectronicsPropertiesPanel({ component, part, onChange }: Props) {
  // Local text buffer so the user can type intermediate values ('-', '', '4').
  const [rotationText, setRotationText] = useState('0');
  useEffect(() => {
    setRotationText(component ? String(component.rotation) : '0');
  }, [component?.id, component?.rotation]);

  return (
    <Box sx={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
      bgcolor: 'background.paper', borderLeft: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, height: 32, px: 1, flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <TuneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>
          Properties
        </Typography>
      </Box>

      {!component || !part ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            Select a component to edit its properties.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Component identity */}
          <Box>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
              Component
            </Typography>
            <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 600 }}>
              {part.name}
            </Typography>
          </Box>

          {/* ShowPinLabels */}
          <FormControlLabel
            sx={{ ml: 0 }}
            control={
              <Switch
                size="small"
                checked={Boolean(component.showPinLabels)}
                onChange={e => onChange({ showPinLabels: e.target.checked })}
              />
            }
            label={<Typography variant="caption" sx={{ fontSize: 12 }}>Show pin labels</Typography>}
          />

          {/* Rotation — any angle in degrees */}
          <TextField
            label="Rotation"
            type="number"
            size="small"
            value={rotationText}
            onChange={e => {
              setRotationText(e.target.value);
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) onChange({ rotation: v });
            }}
            slotProps={{
              input: { endAdornment: <InputAdornment position="end">°</InputAdornment> },
            }}
          />
        </Box>
      )}
    </Box>
  );
}
