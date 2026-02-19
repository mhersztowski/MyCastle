import { useState, useCallback } from 'react';
import type { PropertiesPanelProps } from '@mhersztowski/ui-core';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const AXIS_COLORS = { x: '#ef5350', y: '#66bb6a', z: '#42a5f5' };

const accordionSx = {
  '&:before': { display: 'none' },
  boxShadow: 'none',
  bgcolor: 'transparent',
  '&.Mui-expanded': { m: 0 },
};

const summarySx = {
  minHeight: 28,
  '&.Mui-expanded': { minHeight: 28 },
  '& .MuiAccordionSummary-content': { m: 0 },
  '& .MuiAccordionSummary-content.Mui-expanded': { m: 0 },
  px: 1.5,
  bgcolor: 'action.hover',
};

const sectionTitleSx = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

function Vector3Row({
  label,
  values,
  step = 0.1,
  onChange,
}: {
  label: string;
  values: [number, number, number];
  step?: number;
  onChange: (axis: number, value: number) => void;
}) {
  return (
    <Box sx={{ mb: 0.75 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mb: 0.25, display: 'block' }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <Box key={axis} sx={{ display: 'flex', alignItems: 'center', flex: 1, gap: 0.25 }}>
            <Typography
              sx={{ fontSize: '0.6rem', fontWeight: 700, color: AXIS_COLORS[axis], minWidth: 10, textAlign: 'center' }}
            >
              {axis.toUpperCase()}
            </Typography>
            <TextField
              size="small"
              type="number"
              value={values[i]}
              onChange={(e) => onChange(i, parseFloat(e.target.value) || 0)}
              slotProps={{ htmlInput: { step } }}
              sx={{
                '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
                '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', minWidth: 50, flexShrink: 0 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

export function PropertiesPanel({
  node,
  onPropertyChange,
  onNodeRename,
  className,
}: PropertiesPanelProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const handleChange = useCallback(
    (property: string, value: unknown) => {
      if (node && onPropertyChange) {
        onPropertyChange(node.id, property, value);
      }
    },
    [node, onPropertyChange],
  );

  const startNameEdit = useCallback(() => {
    if (node) {
      setNameValue(node.name);
      setEditingName(true);
    }
  }, [node]);

  const commitNameEdit = useCallback(() => {
    if (node && nameValue.trim()) {
      onNodeRename?.(node.id, nameValue.trim());
    }
    setEditingName(false);
  }, [node, nameValue, onNodeRename]);

  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
      }}
    >
      <Typography
        variant="overline"
        sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: '0.65rem', color: 'text.secondary', letterSpacing: '0.08em', flexShrink: 0 }}
      >
        Inspector
      </Typography>

      {!node ? (
        <Typography variant="body2" sx={{ textAlign: 'center', py: 3, color: 'text.disabled', fontSize: '0.75rem' }}>
          Select an object to inspect
        </Typography>
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
            <Chip label={node.type} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
            {editingName ? (
              <TextField
                size="small"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={commitNameEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNameEdit();
                  if (e.key === 'Escape') setEditingName(false);
                }}
                autoFocus
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': { height: 24, fontSize: '0.75rem' },
                  '& .MuiInputBase-input': { py: 0, px: 0.5, fontWeight: 600 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                }}
              />
            ) : (
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                onDoubleClick={startNameEdit}
              >
                {node.name}
              </Typography>
            )}
          </Box>

          <Accordion defaultExpanded disableGutters sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
              <Typography sx={sectionTitleSx}>Transform</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
              <Vector3Row
                label="Position"
                values={node.transform.position}
                step={0.1}
                onChange={(axis, value) => {
                  const pos: [number, number, number] = [...node.transform.position];
                  pos[axis] = value;
                  handleChange('position', pos);
                }}
              />
              <Vector3Row
                label="Rotation"
                values={node.transform.rotation}
                step={1}
                onChange={(axis, value) => {
                  const rot: [number, number, number] = [...node.transform.rotation];
                  rot[axis] = value;
                  handleChange('rotation', rot);
                }}
              />
              <Vector3Row
                label="Scale"
                values={node.transform.scale}
                step={0.1}
                onChange={(axis, value) => {
                  const scl: [number, number, number] = [...node.transform.scale];
                  scl[axis] = value;
                  handleChange('scale', scl);
                }}
              />
            </AccordionDetails>
          </Accordion>

          {node.material && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Material</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                <PropertyRow label="Color">
                  <input
                    type="color"
                    value={node.material.color}
                    onChange={(e) => handleChange('material.color', e.target.value)}
                    style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {node.material.color}
                  </Typography>
                </PropertyRow>
                <PropertyRow label="Opacity">
                  <Slider
                    size="small"
                    value={node.material.opacity}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(_, v) => handleChange('material.opacity', v as number)}
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                    {node.material.opacity.toFixed(2)}
                  </Typography>
                </PropertyRow>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={node.material.wireframe}
                      onChange={(e) => handleChange('material.wireframe', e.target.checked)}
                      sx={{ p: 0.25 }}
                    />
                  }
                  label={<Typography sx={{ fontSize: '0.7rem' }}>Wireframe</Typography>}
                  sx={{ ml: 0 }}
                />
              </AccordionDetails>
            </Accordion>
          )}

          {node.light && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Light</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                <PropertyRow label="Type">
                  <Typography variant="caption" sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                    {node.light.lightType}
                  </Typography>
                </PropertyRow>
                <PropertyRow label="Color">
                  <input
                    type="color"
                    value={node.light.color}
                    onChange={(e) => handleChange('light.color', e.target.value)}
                    style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {node.light.color}
                  </Typography>
                </PropertyRow>
                <PropertyRow label="Intensity">
                  <Slider
                    size="small"
                    value={node.light.intensity}
                    min={0}
                    max={5}
                    step={0.1}
                    onChange={(_, v) => handleChange('light.intensity', v as number)}
                    sx={{ flex: 1 }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                    {node.light.intensity.toFixed(1)}
                  </Typography>
                </PropertyRow>
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      )}
    </Box>
  );
}
