import React, { useState, useCallback, useEffect } from 'react';
import type { PropertiesPanelProps, SceneSettings, SceneGeometryEntry } from '@mhersztowski/ui-core';
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
import Menu from '@mui/material/Menu';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LinkIcon from '@mui/icons-material/Link';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Popover from '@mui/material/Popover';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import PaletteIcon from '@mui/icons-material/Palette';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import LinkOffIcon from '@mui/icons-material/LinkOff';

const AXIS_COLORS = { x: '#ef5350', y: '#66bb6a', z: '#42a5f5' };

const GEO_TYPE_LABELS: Record<string, string> = {
  box: 'Box', sphere: 'Sphere', cylinder: 'Cylinder',
  plane: 'Plane', cone: 'Cone', torus: 'Torus', custom: 'Buffer', procedural: 'Procedural', nodes: 'Geometry Nodes',
};

const DEFAULT_PROCEDURAL_CODE = `// Return a THREE.BufferGeometry\nconst geo = new THREE.SphereGeometry(1, 32, 16);\nreturn geo;`;

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

/**
 * Smart-round a number for inspector display: clamp near-zero noise (≤1e-9)
 * to 0, otherwise toFixed(4) and strip trailing zeros via parseFloat.
 * Examples: 0.30000000000000004 → "0.3", 1.234567 → "1.2346", -1e-15 → "0".
 */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) < 1e-9) return '0';
  return parseFloat(n.toFixed(4)).toString();
}

/**
 * One axis input that decouples display from the prop value while the field is
 * focused — so typing "0.1234567" isn't truncated mid-keystroke by smart-round
 * — and re-syncs to the rounded prop value on blur or when an external change
 * (e.g. gizmo drag) arrives.
 */
function AxisInput({
  value, step, onChange,
}: {
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatNumber(value));

  // Re-sync the buffer to the prop whenever the external value changes AND we
  // aren't currently editing — keeps gizmo drags reflected in the input.
  useEffect(() => {
    if (!focused) setText(formatNumber(value));
  }, [value, focused]);

  return (
    <TextField
      size="small"
      type="number"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setText(formatNumber(value)); }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      slotProps={{ htmlInput: { step } }}
      sx={{
        '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
        '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
      }}
    />
  );
}

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
            <AxisInput value={values[i]} step={step} onChange={(v) => onChange(i, v)} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const FAV_STORAGE_KEY = 'scene3d_fav_colors';
const MAX_FAV = 20;

function ColorInput({
  label, value, onChange, favColors, onFavChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  favColors: string[];
  onFavChange: (colors: string[]) => void;
}) {
  const normVal = value.toLowerCase();
  const isFav = favColors.includes(normVal);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const toggleFav = () => {
    if (isFav) onFavChange(favColors.filter(c => c !== normVal));
    else onFavChange([normVal, ...favColors].slice(0, MAX_FAV));
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', minWidth: 50, flexShrink: 0 }}>
        {label}
      </Typography>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 20, border: 'none', padding: 0, cursor: 'pointer', background: 'none', flexShrink: 0 }}
      />
      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', flex: 1, minWidth: 0 }}>
        {value}
      </Typography>
      <Tooltip title={isFav ? 'Remove from favorites' : 'Add to favorites'}>
        <IconButton size="small" onClick={toggleFav} sx={{ p: 0.25, flexShrink: 0, color: isFav ? 'warning.main' : 'text.disabled' }}>
          {isFav ? <StarIcon sx={{ fontSize: 13 }} /> : <StarBorderIcon sx={{ fontSize: 13 }} />}
        </IconButton>
      </Tooltip>
      <Tooltip title={favColors.length > 0 ? 'Pick from favorites' : 'No favorites saved'}>
        <span>
          <IconButton
            size="small"
            disabled={favColors.length === 0}
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ p: 0.25, flexShrink: 0, color: favColors.length > 0 ? 'text.secondary' : 'text.disabled' }}
          >
            <PaletteIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { bgcolor: 'background.paper', p: 1 } } }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 168 }}>
          {favColors.map((c) => (
            <Tooltip key={c} title={c} placement="top">
              <Box
                component="span"
                onClick={() => { onChange(c); setAnchorEl(null); }}
                sx={{
                  display: 'inline-block',
                  width: 18, height: 18,
                  bgcolor: c,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: c === normVal ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)',
                  boxSizing: 'border-box',
                  flexShrink: 0,
                  transition: 'transform 0.1s, border-color 0.1s',
                  '&:hover': { transform: 'scale(1.25)', borderColor: 'rgba(255,255,255,0.7)' },
                }}
              />
            </Tooltip>
          ))}
        </Box>
      </Popover>
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
  onBrowseAudioFile,
  onEditGeometryNodes,
  onEditMesh,
  sceneGeometries,
  onAssignGeometry,
  onEditGeoPoint,
  activeGeoPoint,
  sceneNodes,
  onBindGeoPoint,
  className,
}: PropertiesPanelProps) {
  const [bindMenu, setBindMenu] = useState<{ el: HTMLElement; fieldKey: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [geoLinkAnchor, setGeoLinkAnchor] = useState<HTMLElement | null>(null);

  const [favColors, setFavColors] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_STORAGE_KEY) ?? '[]') as string[]; }
    catch { return []; }
  });
  const updateFavColors = useCallback((next: string[]) => {
    setFavColors(next);
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next));
  }, []);

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
                <ColorInput label="Color" value={sceneSettings.backgroundColor} onChange={(v) => patchScene({ backgroundColor: v })} favColors={favColors} onFavChange={updateFavColors} />
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
                <ColorInput label="Fog Color" value={sceneSettings.fogColor} onChange={(v) => patchScene({ fogColor: v })} favColors={favColors} onFavChange={updateFavColors} />
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
                values={node.transform.rotation.map((r) => r * (180 / Math.PI)) as [number, number, number]}
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

          {node.geoPrimitive && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Geometry</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                {node.geoPrimitive.metrics && node.geoPrimitive.metrics.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
                    {node.geoPrimitive.metrics.map((m) => (
                      <Chip
                        key={m.label}
                        size="small"
                        label={`${m.label}: ${m.value}`}
                        sx={{ height: 20, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                      />
                    ))}
                  </Box>
                )}
                {node.geoPrimitive.fields.map((field) => {
                  if (field.kind === 'vector3') {
                    const v = field.value as [number, number, number];
                    const gizmoActive = !!(activeGeoPoint && activeGeoPoint.nodeId === node.id && activeGeoPoint.fieldKey === field.key);
                    const boundName = field.binding ? (sceneNodes?.find((n) => n.id === field.binding)?.name ?? field.binding.slice(0, 8)) : null;
                    return (
                      <Box key={field.key} sx={{ position: 'relative' }}>
                        <Vector3Row
                          label={field.label}
                          values={v}
                          step={field.step ?? 0.1}
                          onChange={(axis, value) => {
                            const next: [number, number, number] = [...v];
                            next[axis] = value;
                            handleChange(`geo.${field.key}`, next);
                          }}
                        />
                        <Box sx={{ position: 'absolute', top: -3, right: 0, display: 'flex' }}>
                          {field.bindable && onBindGeoPoint && (
                            <Tooltip title={boundName ? `Bound to ${boundName} — change/unbind` : 'Bind this point to follow a node'}>
                              <IconButton
                                size="small"
                                onClick={(e) => setBindMenu({ el: e.currentTarget, fieldKey: field.key })}
                                sx={{ p: 0.25, color: boundName ? 'primary.main' : 'text.disabled', bgcolor: boundName ? 'action.selected' : 'transparent' }}
                              >
                                <LinkIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {field.gizmoEditable && onEditGeoPoint && (
                            <Tooltip title={gizmoActive ? 'Stop dragging this point' : 'Drag this point in the viewport'}>
                              <IconButton
                                size="small"
                                onClick={() => onEditGeoPoint(node.id, field.key)}
                                sx={{ p: 0.25, color: gizmoActive ? 'primary.main' : 'text.disabled', bgcolor: gizmoActive ? 'action.selected' : 'transparent' }}
                              >
                                <OpenWithIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        {boundName && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, mb: 0.25 }}>
                            <Chip
                              size="small"
                              icon={<LinkIcon sx={{ fontSize: 12 }} />}
                              label={`→ ${boundName}`}
                              onDelete={onBindGeoPoint ? () => onBindGeoPoint(node.id, field.key, null) : undefined}
                              sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.5 }, '& .MuiChip-icon': { ml: 0.25 } }}
                            />
                          </Box>
                        )}
                      </Box>
                    );
                  }
                  if (field.kind === 'number') {
                    return (
                      <PropertyRow key={field.key} label={field.label}>
                        <AxisInput
                          value={field.value as number}
                          step={field.step ?? 1}
                          onChange={(value) => handleChange(`geo.${field.key}`, Math.max(field.min ?? -Infinity, value))}
                        />
                      </PropertyRow>
                    );
                  }
                  if (field.kind === 'color') {
                    return (
                      <ColorInput
                        key={field.key}
                        label={field.label}
                        value={field.value as string}
                        onChange={(v) => handleChange(`geo.${field.key}`, v)}
                        favColors={favColors}
                        onFavChange={updateFavColors}
                      />
                    );
                  }
                  if (field.kind === 'boolean') {
                    return (
                      <FormControlLabel
                        key={field.key}
                        control={<Checkbox size="small" checked={field.value as boolean} onChange={(e) => handleChange(`geo.${field.key}`, e.target.checked)} sx={{ p: 0.25 }} />}
                        label={<Typography sx={{ fontSize: '0.7rem' }}>{field.label}</Typography>}
                        sx={{ ml: 0, mr: 1, display: 'flex' }}
                      />
                    );
                  }
                  // text
                  return (
                    <Box key={field.key} sx={{ mt: 0.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mb: 0.25, display: 'block' }}>
                        {field.label}
                      </Typography>
                      <TextField
                        size="small"
                        fullWidth
                        value={field.value as string}
                        placeholder="auto"
                        onChange={(e) => handleChange(`geo.${field.key}`, e.target.value)}
                        sx={{
                          '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
                          '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                        }}
                      />
                    </Box>
                  );
                })}
              </AccordionDetails>
            </Accordion>
          )}

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

          {node.geometry && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Geometry</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>

                {/* ── Geometry data-block: UUID + link picker ── */}
                {node.geometry.geoId && (() => {
                  const linkedEntries = (sceneGeometries ?? []).filter(e => e.nodeId !== node.id && e.geoId === node.geometry!.geoId);
                  const otherEntries = (sceneGeometries ?? []).filter(e => e.nodeId !== node.id);
                  return (
                    <Box sx={{ mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.25, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 0.5, px: 0.75, py: 0.4 }}>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'text.disabled', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                        {node.geometry.geoId.slice(0, 8)}
                        <Typography component="span" sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>
                          …{node.geometry.geoId.slice(-4)}
                        </Typography>
                      </Typography>
                      {linkedEntries.length > 0 && (
                        <Chip label={`×${linkedEntries.length + 1}`} size="small" color="primary"
                          sx={{ height: 14, fontSize: '0.55rem', '.MuiChip-label': { px: 0.5 } }} />
                      )}
                      <Tooltip title="Copy full geometry UUID">
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => navigator.clipboard.writeText(node.geometry!.geoId!)}>
                          <ContentCopyIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Regenerate geometry UUID">
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => handleChange('geometry.id', crypto.randomUUID())}>
                          <RefreshIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Tooltip>
                      {otherEntries.length > 0 && (
                        <Tooltip title="Link geometry from another object">
                          <IconButton size="small" sx={{ p: 0.25, color: geoLinkAnchor ? 'primary.main' : undefined }}
                            onClick={(e) => setGeoLinkAnchor(e.currentTarget)}>
                            <LinkIcon sx={{ fontSize: 11 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Menu
                        anchorEl={geoLinkAnchor}
                        open={Boolean(geoLinkAnchor)}
                        onClose={() => setGeoLinkAnchor(null)}
                        slotProps={{ paper: { sx: { maxHeight: 300, minWidth: 200 } } }}
                      >
                        {otherEntries.map((entry: SceneGeometryEntry) => (
                          <MenuItem
                            key={entry.nodeId}
                            sx={{ ...menuItemSx, gap: 0.75, display: 'flex', alignItems: 'center' }}
                            onClick={() => { onAssignGeometry?.(node.id, entry.nodeId); setGeoLinkAnchor(null); }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {entry.nodeName}
                              </Typography>
                              <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', fontFamily: 'monospace' }}>
                                {entry.geoType} · {entry.geoId.slice(0, 6)}
                              </Typography>
                            </Box>
                            {entry.geoId === node.geometry!.geoId && (
                              <Chip label="linked" size="small" color="primary"
                                sx={{ height: 14, fontSize: '0.55rem', '.MuiChip-label': { px: 0.5 } }} />
                            )}
                          </MenuItem>
                        ))}
                      </Menu>
                    </Box>
                  );
                })()}

                <PropertyRow label="Type">
                  <Select
                    size="small"
                    value={node.geometry.geoType}
                    onChange={(e) => handleChange('geometry.type', e.target.value)}
                    sx={selectSx}
                  >
                    {Object.entries(GEO_TYPE_LABELS).filter(([k]) => k !== 'custom').map(([k, label]) => (
                      <MenuItem key={k} value={k} sx={menuItemSx}>{label.toUpperCase()}</MenuItem>
                    ))}
                  </Select>
                </PropertyRow>

                <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    sx={{ fontSize: '0.7rem', textTransform: 'none', borderColor: 'rgba(255,255,255,0.2)', color: 'warning.main', flex: 1 }}
                    onClick={() => onEditMesh?.(node.id)}
                  >
                    Edit Mesh
                  </Button>
                  {node.geometry.geoType === 'nodes' && (
                    <Button
                      variant="outlined"
                      size="small"
                      sx={{ fontSize: '0.7rem', textTransform: 'none', borderColor: 'rgba(255,255,255,0.2)', color: 'primary.main', flex: 1 }}
                      onClick={() => onEditGeometryNodes?.(node.id, node.geometry!.nodesGraph ?? { nodes: [], edges: [] })}
                    >
                      Node Editor
                    </Button>
                  )}
                </Box>

                {node.geometry.geoType === 'procedural' && (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mb: 0.25, display: 'block' }}>
                      Code <Typography component="span" variant="caption" sx={{ color: 'text.disabled', fontSize: '0.6rem' }}>(THREE is available)</Typography>
                    </Typography>
                    <textarea
                      value={node.geometry.code ?? DEFAULT_PROCEDURAL_CODE}
                      onChange={(e) => handleChange('geometry.code', e.target.value)}
                      rows={10}
                      spellCheck={false}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        lineHeight: 1.5,
                        background: '#111',
                        color: '#d4d4d4',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4,
                        padding: '6px 8px',
                        resize: 'vertical',
                        outline: 'none',
                      }}
                    />
                  </Box>
                )}

                {node.geometry.geoType === 'custom' && (
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
                )}

                {!['custom', 'procedural', 'nodes'].includes(node.geometry.geoType) && (
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

          {node.material && (() => {
            const mat = node.material;
            const matType = mat.matType;
            const hasColor = !['MeshDepthMaterial', 'MeshNormalMaterial'].includes(matType);
            const hasOpacity = hasColor;
            const hasEmissive = ['MeshLambertMaterial','MeshPhongMaterial','MeshToonMaterial','MeshStandardMaterial','MeshPhysicalMaterial'].includes(matType);
            const hasFlatShading = ['MeshLambertMaterial','MeshMatcapMaterial','MeshPhongMaterial','MeshToonMaterial','MeshStandardMaterial','MeshPhysicalMaterial','MeshNormalMaterial'].includes(matType);
            const hasBlending = !['MeshDepthMaterial','MeshNormalMaterial','ShadowMaterial'].includes(matType);
            const hasAlpha = !['MeshDepthMaterial','MeshNormalMaterial'].includes(matType);
            const hasVertexColors = !['MeshDepthMaterial','MeshNormalMaterial'].includes(matType);
            const hasForceSinglePass = ['MeshBasicMaterial','MeshStandardMaterial','MeshPhysicalMaterial'].includes(matType);
            const hasReflectivity = ['MeshBasicMaterial','MeshLambertMaterial','MeshPhongMaterial'].includes(matType);
            const tfSx = { flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } };
            return (
              <Accordion defaultExpanded disableGutters sx={accordionSx}>
                <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                  <Typography sx={sectionTitleSx}>Material</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                  {/* UUID bar */}
                  {mat.matId && (
                    <Box sx={{ mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.25, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 0.5, px: 0.75, py: 0.4 }}>
                      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'text.disabled', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mat.matId.slice(0, 8)}
                        <Typography component="span" sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>…{mat.matId.slice(-4)}</Typography>
                      </Typography>
                      <Tooltip title="Copy material UUID">
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => navigator.clipboard.writeText(mat.matId!)}>
                          <ContentCopyIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Regenerate material UUID">
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => handleChange('material.id', crypto.randomUUID())}>
                          <RefreshIcon sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}

                  {/* Type */}
                  <PropertyRow label="Type">
                    <Select size="small" value={matType}
                      onChange={(e) => handleChange('material.type', e.target.value)} sx={selectSx}>
                      {['MeshBasicMaterial','MeshDepthMaterial','MeshNormalMaterial','MeshLambertMaterial',
                        'MeshMatcapMaterial','MeshPhongMaterial','MeshToonMaterial','MeshStandardMaterial',
                        'MeshPhysicalMaterial','ShadowMaterial'].map((t) => (
                        <MenuItem key={t} value={t} sx={menuItemSx}>{t}</MenuItem>
                      ))}
                    </Select>
                  </PropertyRow>

                  {/* Color */}
                  {hasColor && (
                    <ColorInput label="Color" value={mat.color} onChange={(v) => handleChange('material.color', v)} favColors={favColors} onFavChange={updateFavColors} />
                  )}

                  {/* Opacity */}
                  {hasOpacity && (
                    <PropertyRow label="Opacity">
                      <Slider size="small" value={mat.opacity} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.opacity', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {mat.opacity.toFixed(2)}
                      </Typography>
                    </PropertyRow>
                  )}

                  {/* Emissive */}
                  {hasEmissive && (<>
                    <ColorInput label="Emissive" value={mat.emissive ?? '#000000'} onChange={(v) => handleChange('material.emissive', v)} favColors={favColors} onFavChange={updateFavColors} />
                    <PropertyRow label="Emissive Int">
                      <Slider size="small" value={mat.emissiveIntensity ?? 1} min={0} max={5} step={0.01}
                        onChange={(_, v) => handleChange('material.emissiveIntensity', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.emissiveIntensity ?? 1).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                  </>)}

                  {/* Specular + Shininess (Phong) */}
                  {matType === 'MeshPhongMaterial' && (<>
                    <ColorInput label="Specular" value={mat.specular ?? '#111111'} onChange={(v) => handleChange('material.specular', v)} favColors={favColors} onFavChange={updateFavColors} />
                    <PropertyRow label="Shininess">
                      <TextField size="small" type="number" value={mat.shininess ?? 30}
                        onChange={(e) => handleChange('material.shininess', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 1, min: 0 } }} sx={tfSx} />
                    </PropertyRow>
                  </>)}

                  {/* Roughness + Metalness (Standard, Physical) */}
                  {['MeshStandardMaterial','MeshPhysicalMaterial'].includes(matType) && (<>
                    <PropertyRow label="Roughness">
                      <Slider size="small" value={mat.roughness ?? 1} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.roughness', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.roughness ?? 1).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <PropertyRow label="Metalness">
                      <Slider size="small" value={mat.metalness ?? 0} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.metalness', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.metalness ?? 0).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                  </>)}

                  {/* Reflectivity */}
                  {hasReflectivity && (
                    <PropertyRow label="Reflectivity">
                      <Slider size="small" value={mat.reflectivity ?? 1} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.reflectivity', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.reflectivity ?? 1).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                  )}

                  {/* Physical-only */}
                  {matType === 'MeshPhysicalMaterial' && (<>
                    <PropertyRow label="IOR">
                      <TextField size="small" type="number" value={mat.ior ?? 1.5}
                        onChange={(e) => handleChange('material.ior', parseFloat(e.target.value) || 1)}
                        slotProps={{ htmlInput: { step: 0.01, min: 1 } }} sx={tfSx} />
                    </PropertyRow>
                    <PropertyRow label="Clearcoat">
                      <Slider size="small" value={mat.clearcoat ?? 0} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.clearcoat', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.clearcoat ?? 0).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <PropertyRow label="CC Rough">
                      <Slider size="small" value={mat.clearcoatRoughness ?? 0} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.clearcoatRoughness', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.clearcoatRoughness ?? 0).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <PropertyRow label="Dispersion">
                      <TextField size="small" type="number" value={mat.dispersion ?? 0}
                        onChange={(e) => handleChange('material.dispersion', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 0.01, min: 0 } }} sx={tfSx} />
                    </PropertyRow>
                    <PropertyRow label="Iridescence">
                      <Slider size="small" value={mat.iridescence ?? 0} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.iridescence', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.iridescence ?? 0).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <PropertyRow label="Irid. IOR">
                      <TextField size="small" type="number" value={mat.iridescenceIOR ?? 1.3}
                        onChange={(e) => handleChange('material.iridescenceIOR', parseFloat(e.target.value) || 1)}
                        slotProps={{ htmlInput: { step: 0.01, min: 1 } }} sx={tfSx} />
                    </PropertyRow>
                    <PropertyRow label="Film Min nm">
                      <TextField size="small" type="number" value={mat.thinFilmThicknessMin ?? 100}
                        onChange={(e) => handleChange('material.thinFilmThicknessMin', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 10, min: 0 } }} sx={tfSx} />
                    </PropertyRow>
                    <PropertyRow label="Film Max nm">
                      <TextField size="small" type="number" value={mat.thinFilmThicknessMax ?? 400}
                        onChange={(e) => handleChange('material.thinFilmThicknessMax', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 10, min: 0 } }} sx={tfSx} />
                    </PropertyRow>
                    <PropertyRow label="Sheen">
                      <Slider size="small" value={mat.sheen ?? 0} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.sheen', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.sheen ?? 0).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <PropertyRow label="Sheen Rough">
                      <Slider size="small" value={mat.sheenRoughness ?? 1} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.sheenRoughness', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.sheenRoughness ?? 1).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <ColorInput label="Sheen Color" value={mat.sheenColor ?? '#000000'} onChange={(v) => handleChange('material.sheenColor', v)} favColors={favColors} onFavChange={updateFavColors} />
                    <PropertyRow label="Transmission">
                      <Slider size="small" value={mat.transmission ?? 0} min={0} max={1} step={0.01}
                        onChange={(_, v) => handleChange('material.transmission', v as number)} sx={{ flex: 1 }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                        {(mat.transmission ?? 0).toFixed(2)}
                      </Typography>
                    </PropertyRow>
                    <PropertyRow label="Thickness">
                      <TextField size="small" type="number" value={mat.thickness ?? 0}
                        onChange={(e) => handleChange('material.thickness', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 0.1, min: 0 } }} sx={tfSx} />
                    </PropertyRow>
                    <ColorInput label="Atten Color" value={mat.attenuationColor ?? '#ffffff'} onChange={(v) => handleChange('material.attenuationColor', v)} favColors={favColors} onFavChange={updateFavColors} />
                    <PropertyRow label="Atten Dist">
                      <TextField size="small" type="number" value={mat.attenuationDistance ?? 0}
                        onChange={(e) => handleChange('material.attenuationDistance', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 0.1, min: 0 } }} sx={tfSx} />
                    </PropertyRow>
                  </>)}

                  {/* Depth Material: depth packing */}
                  {matType === 'MeshDepthMaterial' && (
                    <PropertyRow label="Depth Pack">
                      <Select size="small" value={mat.depthPacking ?? 'basic'}
                        onChange={(e) => handleChange('material.depthPacking', e.target.value)} sx={selectSx}>
                        <MenuItem value="basic" sx={menuItemSx}>BASIC</MenuItem>
                        <MenuItem value="rgba" sx={menuItemSx}>RGBA</MenuItem>
                      </Select>
                    </PropertyRow>
                  )}

                  {/* Common flags row */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0, mt: 0.5 }}>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={mat.wireframe}
                        onChange={(e) => handleChange('material.wireframe', e.target.checked)} sx={{ p: 0.25 }} />}
                      label={<Typography sx={{ fontSize: '0.7rem' }}>Wireframe</Typography>}
                      sx={{ ml: 0, mr: 1 }}
                    />
                    {hasOpacity && (
                      <FormControlLabel
                        control={<Checkbox size="small" checked={mat.transparent}
                          onChange={(e) => handleChange('material.transparent', e.target.checked)} sx={{ p: 0.25 }} />}
                        label={<Typography sx={{ fontSize: '0.7rem' }}>Transparent</Typography>}
                        sx={{ ml: 0, mr: 1 }}
                      />
                    )}
                    {hasFlatShading && (
                      <FormControlLabel
                        control={<Checkbox size="small" checked={mat.flatShading ?? false}
                          onChange={(e) => handleChange('material.flatShading', e.target.checked)} sx={{ p: 0.25 }} />}
                        label={<Typography sx={{ fontSize: '0.7rem' }}>Flat Shading</Typography>}
                        sx={{ ml: 0, mr: 1 }}
                      />
                    )}
                    {hasVertexColors && (
                      <FormControlLabel
                        control={<Checkbox size="small" checked={mat.vertexColors}
                          onChange={(e) => handleChange('material.vertexColors', e.target.checked)} sx={{ p: 0.25 }} />}
                        label={<Typography sx={{ fontSize: '0.7rem' }}>Vtx Colors</Typography>}
                        sx={{ ml: 0, mr: 1 }}
                      />
                    )}
                    {hasForceSinglePass && (
                      <FormControlLabel
                        control={<Checkbox size="small" checked={mat.forceSinglePass}
                          onChange={(e) => handleChange('material.forceSinglePass', e.target.checked)} sx={{ p: 0.25 }} />}
                        label={<Typography sx={{ fontSize: '0.7rem' }}>Single Pass</Typography>}
                        sx={{ ml: 0, mr: 0 }}
                      />
                    )}
                  </Box>

                  {/* Side */}
                  <PropertyRow label="Side">
                    <Select size="small" value={mat.side}
                      onChange={(e) => handleChange('material.side', e.target.value)} sx={selectSx}>
                      <MenuItem value="front" sx={menuItemSx}>FRONT</MenuItem>
                      <MenuItem value="back" sx={menuItemSx}>BACK</MenuItem>
                      <MenuItem value="double" sx={menuItemSx}>DOUBLE</MenuItem>
                    </Select>
                  </PropertyRow>

                  {/* Blending */}
                  {hasBlending && (
                    <PropertyRow label="Blending">
                      <Select size="small" value={mat.blending}
                        onChange={(e) => handleChange('material.blending', e.target.value)} sx={selectSx}>
                        <MenuItem value="normal" sx={menuItemSx}>NORMAL</MenuItem>
                        <MenuItem value="additive" sx={menuItemSx}>ADDITIVE</MenuItem>
                        <MenuItem value="subtractive" sx={menuItemSx}>SUBTRACTIVE</MenuItem>
                        <MenuItem value="multiply" sx={menuItemSx}>MULTIPLY</MenuItem>
                      </Select>
                    </PropertyRow>
                  )}

                  {/* Depth Test / Write + Alpha Test */}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0, mt: 0.25 }}>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={mat.depthTest}
                        onChange={(e) => handleChange('material.depthTest', e.target.checked)} sx={{ p: 0.25 }} />}
                      label={<Typography sx={{ fontSize: '0.7rem' }}>Depth Test</Typography>}
                      sx={{ ml: 0, mr: 1 }}
                    />
                    <FormControlLabel
                      control={<Checkbox size="small" checked={mat.depthWrite}
                        onChange={(e) => handleChange('material.depthWrite', e.target.checked)} sx={{ p: 0.25 }} />}
                      label={<Typography sx={{ fontSize: '0.7rem' }}>Depth Write</Typography>}
                      sx={{ ml: 0, mr: 0 }}
                    />
                  </Box>
                  {hasAlpha && (
                    <PropertyRow label="Alpha Test">
                      <TextField size="small" type="number" value={mat.alphaTest}
                        onChange={(e) => handleChange('material.alphaTest', parseFloat(e.target.value) || 0)}
                        slotProps={{ htmlInput: { step: 0.01, min: 0, max: 1 } }} sx={tfSx} />
                    </PropertyRow>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })()}

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

          {node.audio && (
            <Accordion defaultExpanded disableGutters sx={accordionSx}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
                <Typography sx={sectionTitleSx}>Audio</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
                <Box sx={{ mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mb: 0.25, display: 'block' }}>
                    Source URL
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField
                      size="small"
                      value={node.audio.src}
                      onChange={(e) => handleChange('audio.src', e.target.value)}
                      placeholder="https://... or /users/.../audio.mp3"
                      sx={{
                        flex: 1,
                        '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
                        '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                      }}
                    />
                    {onBrowseAudioFile && (
                      <Tooltip title="Browse project audio files">
                        <IconButton
                          size="small"
                          sx={{ p: 0.25, flexShrink: 0 }}
                          onClick={async () => {
                            const path = await onBrowseAudioFile();
                            if (path != null) handleChange('audio.src', path);
                          }}
                        >
                          <FolderOpenIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
                <PropertyRow label="Volume">
                  <Slider size="small" value={node.audio.volume} min={0} max={1} step={0.01}
                    onChange={(_, v) => handleChange('audio.volume', v as number)} sx={{ flex: 1 }} />
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '0.65rem', minWidth: 28, textAlign: 'right' }}>
                    {node.audio.volume.toFixed(2)}
                  </Typography>
                </PropertyRow>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0, mb: 0.5 }}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={node.audio.loop} onChange={(e) => handleChange('audio.loop', e.target.checked)} sx={{ p: 0.25 }} />}
                    label={<Typography sx={{ fontSize: '0.7rem' }}>Loop</Typography>}
                    sx={{ ml: 0, mr: 1 }}
                  />
                  <FormControlLabel
                    control={<Checkbox size="small" checked={node.audio.autoplay} onChange={(e) => handleChange('audio.autoplay', e.target.checked)} sx={{ p: 0.25 }} />}
                    label={<Typography sx={{ fontSize: '0.7rem' }}>Autoplay</Typography>}
                    sx={{ ml: 0, mr: 1 }}
                  />
                  <FormControlLabel
                    control={<Checkbox size="small" checked={node.audio.positional ?? true} onChange={(e) => handleChange('audio.positional', e.target.checked)} sx={{ p: 0.25 }} />}
                    label={<Typography sx={{ fontSize: '0.7rem' }}>Positional</Typography>}
                    sx={{ ml: 0, mr: 0 }}
                  />
                </Box>
                {(node.audio.positional ?? true) && (<>
                  <PropertyRow label="Distance Model">
                    <Select size="small" value={node.audio.distanceModel}
                      onChange={(e) => handleChange('audio.distanceModel', e.target.value)}
                      sx={selectSx}>
                      <MenuItem value="inverse" sx={menuItemSx}>INVERSE</MenuItem>
                      <MenuItem value="linear" sx={menuItemSx}>LINEAR</MenuItem>
                      <MenuItem value="exponential" sx={menuItemSx}>EXPONENTIAL</MenuItem>
                    </Select>
                  </PropertyRow>
                  <PropertyRow label="Ref Dist">
                    <TextField size="small" type="number" value={node.audio.refDistance}
                      onChange={(e) => handleChange('audio.refDistance', parseFloat(e.target.value) || 1)}
                      slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                  <PropertyRow label="Max Dist">
                    <TextField size="small" type="number" value={node.audio.maxDistance}
                      onChange={(e) => handleChange('audio.maxDistance', parseFloat(e.target.value) || 0)}
                      slotProps={{ htmlInput: { step: 1, min: 0 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                  <PropertyRow label="Rolloff">
                    <TextField size="small" type="number" value={node.audio.rolloffFactor}
                      onChange={(e) => handleChange('audio.rolloffFactor', parseFloat(e.target.value) || 0)}
                      slotProps={{ htmlInput: { step: 0.1, min: 0 } }}
                      sx={{ flex: 1, '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' }, '& .MuiInputBase-input': { py: 0.25, px: 0.5 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' } }}
                    />
                  </PropertyRow>
                </>)}
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
                <ColorInput label="Color" value={node.light.color} onChange={(v) => handleChange('light.color', v)} favColors={favColors} onFavChange={updateFavColors} />
                {node.light.lightType === 'hemisphere' && (
                  <ColorInput label="Ground Color" value={node.light.groundColor ?? '#444444'} onChange={(v) => handleChange('light.groundColor', v)} favColors={favColors} onFavChange={updateFavColors} />
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

      {/* Bind-point picker: choose a scene node whose position drives this point */}
      <Menu
        open={Boolean(bindMenu)}
        anchorEl={bindMenu?.el ?? null}
        onClose={() => setBindMenu(null)}
        slotProps={{ paper: { sx: { maxHeight: 320, minWidth: 180 } } }}
      >
        {node && bindMenu && (() => {
          const fieldBinding = node.geoPrimitive?.fields.find((f) => f.key === bindMenu.fieldKey)?.binding ?? null;
          const items: React.ReactNode[] = [];
          if (fieldBinding) {
            items.push(
              <MenuItem key="__unbind" sx={menuItemSx} onClick={() => { onBindGeoPoint?.(node.id, bindMenu.fieldKey, null); setBindMenu(null); }}>
                <LinkOffIcon sx={{ fontSize: 16, mr: 1, color: 'error.main' }} /> Unbind
              </MenuItem>,
            );
          }
          (sceneNodes ?? []).filter((n) => n.id !== node.id).forEach((n) => {
            items.push(
              <MenuItem
                key={n.id}
                selected={n.id === fieldBinding}
                sx={menuItemSx}
                onClick={() => { onBindGeoPoint?.(node.id, bindMenu.fieldKey, n.id); setBindMenu(null); }}
              >
                {n.name} <Typography component="span" sx={{ ml: 0.75, fontSize: '0.6rem', color: 'text.disabled' }}>{n.type}</Typography>
              </MenuItem>,
            );
          });
          if (items.length === 0) items.push(<MenuItem key="__none" disabled sx={menuItemSx}>No other nodes</MenuItem>);
          return items;
        })()}
      </Menu>
    </Box>
  );
}
