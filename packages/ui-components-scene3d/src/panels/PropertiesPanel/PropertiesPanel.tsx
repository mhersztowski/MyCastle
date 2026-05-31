import { useState, useCallback } from 'react';
import type { PropertiesPanelProps, SceneSettings } from '@mhersztowski/ui-core';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';

const AXIS_COLORS = { x: '#ef5350', y: '#66bb6a', z: '#42a5f5' };

const GEO_TYPE_LABELS: Record<string, string> = {
  box: 'Box Geometry', sphere: 'Sphere Geometry', cylinder: 'Cylinder Geometry',
  plane: 'Plane Geometry', cone: 'Cone Geometry', torus: 'Torus Geometry', custom: 'Buffer Geometry',
};

const GEO_PARAM_DEFS: Record<string, Array<{ key: string; label: string; step: number; min?: number; integer?: boolean }>> = {
  box: [
    { key: 'width', label: 'Width', step: 0.1, min: 0.001 },
    { key: 'height', label: 'Height', step: 0.1, min: 0.001 },
    { key: 'depth', label: 'Depth', step: 0.1, min: 0.001 },
    { key: 'widthSegments', label: 'Width Seg', step: 1, min: 1, integer: true },
    { key: 'heightSegments', label: 'Height Seg', step: 1, min: 1, integer: true },
    { key: 'depthSegments', label: 'Depth Seg', step: 1, min: 1, integer: true },
  ],
  sphere: [
    { key: 'radius', label: 'Radius', step: 0.1, min: 0.001 },
    { key: 'widthSegments', label: 'Width Seg', step: 1, min: 3, integer: true },
    { key: 'heightSegments', label: 'Height Seg', step: 1, min: 2, integer: true },
  ],
  cylinder: [
    { key: 'radiusTop', label: 'Radius Top', step: 0.1, min: 0 },
    { key: 'radiusBottom', label: 'Radius Bottom', step: 0.1, min: 0 },
    { key: 'height', label: 'Height', step: 0.1, min: 0.001 },
    { key: 'radialSegments', label: 'Radial Seg', step: 1, min: 3, integer: true },
  ],
  plane: [
    { key: 'width', label: 'Width', step: 0.1, min: 0.001 },
    { key: 'height', label: 'Height', step: 0.1, min: 0.001 },
    { key: 'widthSegments', label: 'Width Seg', step: 1, min: 1, integer: true },
    { key: 'heightSegments', label: 'Height Seg', step: 1, min: 1, integer: true },
  ],
  cone: [
    { key: 'radius', label: 'Radius', step: 0.1, min: 0.001 },
    { key: 'height', label: 'Height', step: 0.1, min: 0.001 },
    { key: 'radialSegments', label: 'Radial Seg', step: 1, min: 3, integer: true },
  ],
  torus: [
    { key: 'radius', label: 'Radius', step: 0.1, min: 0.001 },
    { key: 'tube', label: 'Tube', step: 0.01, min: 0.001 },
    { key: 'radialSegments', label: 'Radial Seg', step: 1, min: 3, integer: true },
    { key: 'tubularSegments', label: 'Tubular Seg', step: 1, min: 3, integer: true },
  ],
};

const GEO_PARAM_DEFAULTS: Record<string, Record<string, number>> = {
  box: { width: 1, height: 1, depth: 1, widthSegments: 1, heightSegments: 1, depthSegments: 1 },
  sphere: { radius: 1, widthSegments: 32, heightSegments: 32 },
  cylinder: { radiusTop: 1, radiusBottom: 1, height: 2, radialSegments: 32 },
  plane: { width: 10, height: 10, widthSegments: 1, heightSegments: 1 },
  cone: { radius: 1, height: 2, radialSegments: 32 },
  torus: { radius: 1, tube: 0.4, radialSegments: 16, tubularSegments: 100 },
};

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

const selectSx = {
  flex: 1,
  fontSize: '0.7rem',
  height: 22,
  '& .MuiSelect-select': { py: 0, px: 0.5, fontSize: '0.7rem' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
};

const menuItemSx = { fontSize: '0.7rem', minHeight: 28, py: 0.25 };

export function PropertiesPanel({
  node,
  onPropertyChange,
  onNodeRename,
  activeCameraNodeId,
  onSetActiveCamera,
  sceneSettings,
  onSceneSettingsChange,
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

  const patchScene = useCallback((patch: Partial<SceneSettings>) => {
    if (sceneSettings && onSceneSettingsChange) {
      onSceneSettingsChange({ ...sceneSettings, ...patch });
    }
  }, [sceneSettings, onSceneSettingsChange]);

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
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Accordion defaultExpanded disableGutters sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
              <Typography sx={sectionTitleSx}>Scene</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
              {/* Background */}
              <PropertyRow label="Background">
                <Select
                  size="small"
                  value={sceneSettings?.backgroundType ?? 'default'}
                  onChange={(e) => patchScene({ backgroundType: e.target.value as SceneSettings['backgroundType'] })}
                  sx={selectSx}
                >
                  <MenuItem value="default" sx={menuItemSx}>DEFAULT</MenuItem>
                  <MenuItem value="solid" sx={menuItemSx}>SOLID</MenuItem>
                </Select>
              </PropertyRow>
              {sceneSettings?.backgroundType === 'solid' && (
                <PropertyRow label="Color">
                  <input
                    type="color"
                    value={sceneSettings.backgroundColor}
                    onChange={(e) => patchScene({ backgroundColor: e.target.value })}
                    style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {sceneSettings.backgroundColor}
                  </Typography>
                </PropertyRow>
              )}

              {/* Environment */}
              <PropertyRow label="Environment">
                <Select
                  size="small"
                  value={sceneSettings?.environmentPreset ?? 'none'}
                  onChange={(e) => patchScene({ environmentPreset: e.target.value as SceneSettings['environmentPreset'] })}
                  sx={selectSx}
                >
                  {(['none', 'studio', 'sunset', 'dawn', 'city', 'forest', 'night', 'park', 'warehouse', 'lobby', 'apartment'] as const).map((v) => (
                    <MenuItem key={v} value={v} sx={menuItemSx}>{v.toUpperCase()}</MenuItem>
                  ))}
                </Select>
              </PropertyRow>

              {/* Fog */}
              <PropertyRow label="Fog">
                <Select
                  size="small"
                  value={sceneSettings?.fogType ?? 'none'}
                  onChange={(e) => patchScene({ fogType: e.target.value as SceneSettings['fogType'] })}
                  sx={selectSx}
                >
                  <MenuItem value="none" sx={menuItemSx}>NONE</MenuItem>
                  <MenuItem value="linear" sx={menuItemSx}>LINEAR</MenuItem>
                  <MenuItem value="exp2" sx={menuItemSx}>EXP2</MenuItem>
                </Select>
              </PropertyRow>
              {sceneSettings?.fogType !== 'none' && sceneSettings?.fogType !== undefined && (
                <PropertyRow label="Fog Color">
                  <input
                    type="color"
                    value={sceneSettings.fogColor}
                    onChange={(e) => patchScene({ fogColor: e.target.value })}
                    style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                    {sceneSettings.fogColor}
                  </Typography>
                </PropertyRow>
              )}
              {sceneSettings?.fogType === 'linear' && (
                <>
                  <PropertyRow label="Near">
                    <TextField size="small" type="number" value={sceneSettings.fogNear}
                      onChange={(e) => patchScene({ fogNear: parseFloat(e.target.value) || 0 })}
                      slotProps={{ htmlInput: { step: 0.5, min: 0 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                  <PropertyRow label="Far">
                    <TextField size="small" type="number" value={sceneSettings.fogFar}
                      onChange={(e) => patchScene({ fogFar: parseFloat(e.target.value) || 0 })}
                      slotProps={{ htmlInput: { step: 1, min: 0 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                </>
              )}
              {sceneSettings?.fogType === 'exp2' && (
                <PropertyRow label="Density">
                  <TextField size="small" type="number" value={sceneSettings.fogDensity}
                    onChange={(e) => patchScene({ fogDensity: parseFloat(e.target.value) || 0 })}
                    slotProps={{ htmlInput: { step: 0.001, min: 0 } }}
                    sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                  />
                </PropertyRow>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
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
              <Typography sx={sectionTitleSx}>Object</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
              {/* UUID */}
              <Box sx={{ mb: 0.75 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mb: 0.25, display: 'block' }}>
                  UUID
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'text.disabled', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.id}
                  </Typography>
                  <Tooltip title="Copy UUID">
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => navigator.clipboard.writeText(node.id)}>
                      <ContentCopyIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Regenerate UUID">
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => handleChange('__regenerateId', null)}>
                      <RefreshIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {/* Visible + shadow flags */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={node.visible} onChange={(e) => handleChange('visible', e.target.checked)} sx={{ p: 0.25 }} />}
                  label={<Typography sx={{ fontSize: '0.7rem' }}>Visible</Typography>}
                  sx={{ ml: 0, mr: 1 }}
                />
                {node.object && (
                  <>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={node.object.castShadow} onChange={(e) => handleChange('castShadow', e.target.checked)} sx={{ p: 0.25 }} />}
                      label={<Typography sx={{ fontSize: '0.7rem' }}>Cast Shadow</Typography>}
                      sx={{ ml: 0, mr: 1 }}
                    />
                    <FormControlLabel
                      control={<Checkbox size="small" checked={node.object.receiveShadow} onChange={(e) => handleChange('receiveShadow', e.target.checked)} sx={{ p: 0.25 }} />}
                      label={<Typography sx={{ fontSize: '0.7rem' }}>Receive Shadow</Typography>}
                      sx={{ ml: 0, mr: 1 }}
                    />
                    <FormControlLabel
                      control={<Checkbox size="small" checked={node.object.frustumCulled} onChange={(e) => handleChange('frustumCulled', e.target.checked)} sx={{ p: 0.25 }} />}
                      label={<Typography sx={{ fontSize: '0.7rem' }}>Frustum Cull</Typography>}
                      sx={{ ml: 0, mr: 0 }}
                    />
                  </>
                )}
              </Box>

              {node.object && (
                <>
                  {/* Render Order */}
                  <PropertyRow label="Render Order">
                    <TextField
                      size="small"
                      type="number"
                      value={node.object.renderOrder}
                      onChange={(e) => handleChange('renderOrder', parseInt(e.target.value, 10) || 0)}
                      slotProps={{ htmlInput: { step: 1 } }}
                      sx={{
                        flex: 1,
                        '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
                        '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                      }}
                    />
                  </PropertyRow>

                  {/* UserData */}
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mb: 0.25, display: 'block' }}>
                      UserData
                    </Typography>
                    <TextField
                      size="small"
                      multiline
                      minRows={2}
                      maxRows={4}
                      fullWidth
                      value={node.object.userData}
                      onChange={(e) => handleChange('userData', e.target.value)}
                      placeholder='{"key": "value"}'
                      sx={{
                        '& .MuiInputBase-root': { fontSize: '0.7rem', fontFamily: 'monospace' },
                        '& .MuiInputBase-input': { py: 0.5, px: 0.5 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                      }}
                    />
                  </Box>
                </>
              )}
            </AccordionDetails>
          </Accordion>

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
                label="Rotation °"
                values={node.transform.rotation.map((r) => parseFloat((r * (180 / Math.PI)).toFixed(4))) as [number, number, number]}
                step={1}
                onChange={(axis, value) => {
                  const rot: [number, number, number] = [...node.transform.rotation];
                  rot[axis] = value * (Math.PI / 180);
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

          {node.geometry && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Geometry</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                <PropertyRow label="Type">
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                    {GEO_TYPE_LABELS[node.geometry.geoType] ?? node.geometry.geoType}
                  </Typography>
                </PropertyRow>

                {node.geometry.geoType === 'custom' ? (
                  <>
                    {node.geometry.fileName && (
                      <PropertyRow label="File">
                        <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {node.geometry.fileName}
                        </Typography>
                      </PropertyRow>
                    )}
                    {node.geometry.vertexCount !== undefined && (
                      <PropertyRow label="Vertices">
                        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'primary.main', fontFamily: 'monospace' }}>
                          {node.geometry.vertexCount}
                        </Typography>
                      </PropertyRow>
                    )}
                    {node.geometry.indexCount !== undefined && (
                      <PropertyRow label="Triangles">
                        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'primary.main', fontFamily: 'monospace' }}>
                          {Math.floor(node.geometry.indexCount / 3)}
                        </Typography>
                      </PropertyRow>
                    )}
                  </>
                ) : (
                  (GEO_PARAM_DEFS[node.geometry.geoType] ?? []).map(({ key, label, step, min, integer }) => {
                    const val = node.geometry!.params[key] ?? GEO_PARAM_DEFAULTS[node.geometry!.geoType]?.[key] ?? 1;
                    return (
                      <PropertyRow key={key} label={label}>
                        <TextField
                          size="small"
                          type="number"
                          value={integer ? Math.round(val) : val}
                          onChange={(e) => {
                            const raw = parseFloat(e.target.value);
                            const v = isNaN(raw) ? (min ?? 0) : (min !== undefined ? Math.max(min, raw) : raw);
                            handleChange(`geometry.params.${key}`, integer ? Math.round(v) : v);
                          }}
                          slotProps={{ htmlInput: { step, min } }}
                          sx={{
                            flex: 1,
                            '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
                            '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                          }}
                        />
                      </PropertyRow>
                    );
                  })
                )}

                {node.geometry.attributes && (
                  <Box sx={{ mt: 0.75 }}>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.disabled', mb: 0.25 }}>
                      Attributes
                    </Typography>
                    {node.geometry.attributes.indexCount !== undefined && (
                      <PropertyRow label="index">
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.primary' }}>
                          {node.geometry.attributes.indexCount}
                        </Typography>
                      </PropertyRow>
                    )}
                    {node.geometry.attributes.positionCount !== undefined && (
                      <PropertyRow label="position">
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.primary' }}>
                          {node.geometry.attributes.positionCount}{' '}
                          <Typography component="span" variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>(3)</Typography>
                        </Typography>
                      </PropertyRow>
                    )}
                    {node.geometry.attributes.normalCount !== undefined && (
                      <PropertyRow label="normal">
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.primary' }}>
                          {node.geometry.attributes.normalCount}{' '}
                          <Typography component="span" variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>(3)</Typography>
                        </Typography>
                      </PropertyRow>
                    )}
                    {node.geometry.attributes.uvCount !== undefined && (
                      <PropertyRow label="uv">
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.primary' }}>
                          {node.geometry.attributes.uvCount}{' '}
                          <Typography component="span" variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>(2)</Typography>
                        </Typography>
                      </PropertyRow>
                    )}
                  </Box>
                )}

                {node.geometry.bounds && (() => {
                  const bounds = node.geometry.bounds!;
                  return (
                    <Box sx={{ mt: 0.75 }}>
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.disabled', mb: 0.25 }}>
                        Bounds
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                          <Box key={axis} sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flex: 1 }}>
                            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: AXIS_COLORS[axis.toLowerCase() as 'x' | 'y' | 'z'], minWidth: 10, textAlign: 'center' }}>
                              {axis}
                            </Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'text.secondary' }}>
                              {bounds[i]}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  );
                })()}
              </AccordionDetails>
            </Accordion>
          )}

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

          {node.camera && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Camera</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                {/* Current camera toggle */}
                <Box sx={{ mb: 0.75 }}>
                  <Button
                    size="small"
                    variant={node.id === activeCameraNodeId ? 'contained' : 'outlined'}
                    color={node.id === activeCameraNodeId ? 'primary' : 'inherit'}
                    fullWidth
                    onClick={() => onSetActiveCamera?.(node.id === activeCameraNodeId ? null : node.id)}
                    sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.25, height: 26 }}
                  >
                    {node.id === activeCameraNodeId ? 'Release Camera' : 'Set as Current'}
                  </Button>
                </Box>
                <PropertyRow label="Type">
                  <Typography variant="caption" sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                    {node.camera.cameraType}
                  </Typography>
                </PropertyRow>

                {node.camera.cameraType === 'perspective' && (
                  <PropertyRow label="FOV">
                    <TextField
                      size="small" type="number"
                      value={node.camera.fov}
                      onChange={(e) => handleChange('camera.fov', parseFloat(e.target.value) || 0)}
                      slotProps={{ htmlInput: { step: 1, min: 1, max: 180 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                )}

                {node.camera.cameraType === 'orthographic' && (
                  <>
                    {(['left', 'right', 'top', 'bottom'] as const).map((k) => (
                      <PropertyRow key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                        <TextField
                          size="small" type="number"
                          value={node.camera![k]}
                          onChange={(e) => handleChange(`camera.${k}`, parseFloat(e.target.value) || 0)}
                          slotProps={{ htmlInput: { step: 0.01 } }}
                          sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                        />
                      </PropertyRow>
                    ))}
                  </>
                )}

                {(['near', 'far'] as const).map((k) => (
                  <PropertyRow key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                    <TextField
                      size="small" type="number"
                      value={node.camera![k]}
                      onChange={(e) => handleChange(`camera.${k}`, parseFloat(e.target.value) || 0)}
                      slotProps={{ htmlInput: { step: k === 'near' ? 0.01 : 1, min: 0 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                ))}
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
                {node.light.lightType === 'hemisphere' && (
                  <PropertyRow label="Ground Color">
                    <input
                      type="color"
                      value={node.light.groundColor ?? '#444444'}
                      onChange={(e) => handleChange('light.groundColor', e.target.value)}
                      style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                      {node.light.groundColor ?? '#444444'}
                    </Typography>
                  </PropertyRow>
                )}
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

                {(node.light.lightType === 'point' || node.light.lightType === 'spot') && (
                  <>
                    <PropertyRow label="Distance">
                      <TextField
                        size="small" type="number"
                        value={node.light.distance ?? 0}
                        onChange={(e) => handleChange('light.distance', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                        sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                      />
                    </PropertyRow>
                    {node.light.lightType === 'spot' && (
                      <>
                        <PropertyRow label="Angle">
                          <TextField
                            size="small" type="number"
                            value={(node.light.angle ?? Math.PI / 10).toFixed(4)}
                            onChange={(e) => handleChange('light.angle', parseFloat(e.target.value) || 0)}
                            slotProps={{ htmlInput: { step: 0.01, min: 0, max: Math.PI / 2 } }}
                            sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                          />
                        </PropertyRow>
                        <PropertyRow label="Penumbra">
                          <TextField
                            size="small" type="number"
                            value={node.light.penumbra ?? 0}
                            onChange={(e) => handleChange('light.penumbra', parseFloat(e.target.value) || 0)}
                            slotProps={{ htmlInput: { step: 0.01, min: 0, max: 1 } }}
                            sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                          />
                        </PropertyRow>
                      </>
                    )}
                    <PropertyRow label="Decay">
                      <TextField
                        size="small" type="number"
                        value={node.light.decay ?? 2}
                        onChange={(e) => handleChange('light.decay', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                        sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                      />
                    </PropertyRow>
                    {/* Shadow sub-section */}
                    <Box sx={{ mt: 0.5, mb: 0.25 }}>
                      <Typography sx={{ ...sectionTitleSx, color: 'text.disabled', fontSize: '0.6rem', mb: 0.25 }}>Shadow</Typography>
                      <FormControlLabel
                        control={<Checkbox size="small" checked={node.object?.castShadow ?? false} onChange={(e) => handleChange('castShadow', e.target.checked)} sx={{ p: 0.25 }} />}
                        label={<Typography sx={{ fontSize: '0.7rem' }}>cast</Typography>}
                        sx={{ ml: 0, mb: 0.25 }}
                      />
                      <PropertyRow label="Intensity">
                        <TextField
                          size="small" type="number"
                          value={node.light.shadowIntensity ?? 1}
                          onChange={(e) => handleChange('light.shadowIntensity', parseFloat(e.target.value) || 0)}
                          slotProps={{ htmlInput: { step: 0.1, min: 0, max: 1 } }}
                          sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                        />
                      </PropertyRow>
                      <PropertyRow label="Bias">
                        <TextField
                          size="small" type="number"
                          value={node.light.shadowBias ?? 0}
                          onChange={(e) => handleChange('light.shadowBias', parseFloat(e.target.value) || 0)}
                          slotProps={{ htmlInput: { step: 0.00001 } }}
                          sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                        />
                      </PropertyRow>
                      <PropertyRow label="Normal Bias">
                        <TextField
                          size="small" type="number"
                          value={node.light.shadowNormalBias ?? 0}
                          onChange={(e) => handleChange('light.shadowNormalBias', parseFloat(e.target.value) || 0)}
                          slotProps={{ htmlInput: { step: 0.01 } }}
                          sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                        />
                      </PropertyRow>
                      <PropertyRow label="Radius">
                        <TextField
                          size="small" type="number"
                          value={node.light.shadowRadius ?? 1}
                          onChange={(e) => handleChange('light.shadowRadius', parseFloat(e.target.value) || 0)}
                          slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                          sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                        />
                      </PropertyRow>
                    </Box>
                  </>
                )}
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      )}
    </Box>
  );
}
