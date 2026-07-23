import React, { useState } from 'react';
import { Box, Tooltip, IconButton, Divider, Typography, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import GestureIcon from '@mui/icons-material/Gesture';
import TitleIcon from '@mui/icons-material/Title';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import type { ViewMode } from '@mhersztowski/core-cad';
import type { ToolName } from '../tools/types';
import { polygonTool } from '../tools/PolygonTool';
import { bsplineTool } from '../tools/BSplineTool';

interface Props {
  activeTool: ToolName;
  onToolChange: (tool: ToolName) => void;
  viewMode: ViewMode;
}

/** Ikona narzędzia z FreeCAD (public/icons/freecad/<name>.svg — pobrane skryptem fetch-freecad-icons.sh). */
function FcIcon({ name, size = 18 }: { name: string; size?: number }) {
  return <img src={`/icons/freecad/${name}.svg`} width={size} height={size} alt="" style={{ display: 'block' }} />;
}

type Variant = {
  name: ToolName; label: string; icon: React.ReactNode;
  sides?: number;
  bspline?: { interpolating: boolean; periodic: boolean };
};
type Group = { key: string; variants: Variant[] };

const SIMPLE_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'select', label: 'Select (S)',                  icon: <NearMeIcon fontSize="small" /> },
  { name: 'point',  label: 'Point (PT) — click to place', icon: <FcIcon name="point" /> },
  { name: 'line',   label: 'Line (L)',                    icon: <FcIcon name="line" /> },
];

const CIRCLE_GROUP: Group = { key: 'circle', variants: [
  { name: 'circle',   label: 'Circle (center + radius)',    icon: <FcIcon name="circle" /> },
  { name: 'circle3p', label: 'Circle by 3 points',          icon: <FcIcon name="circle_3p" /> },
] };

const ARC_GROUP: Group = { key: 'arc', variants: [
  { name: 'arc',   label: 'Arc (center, start, end)',       icon: <FcIcon name="arc" /> },
  { name: 'arc3p', label: 'Arc by 3 points',                icon: <FcIcon name="arc_3p" /> },
] };

const RECT_GROUP: Group = { key: 'rect', variants: [
  { name: 'rect',       label: 'Rectangle (2 corners)',     icon: <FcIcon name="rect" /> },
  { name: 'rectCenter', label: 'Centered rectangle',        icon: <FcIcon name="rect_center" /> },
] };

const POLYGON_GROUP: Group = { key: 'polygon', variants: [
  { name: 'polygon', label: 'Triangle',        sides: 3, icon: <FcIcon name="polygon_triangle" /> },
  { name: 'polygon', label: 'Square',          sides: 4, icon: <FcIcon name="polygon_square" /> },
  { name: 'polygon', label: 'Pentagon',        sides: 5, icon: <FcIcon name="polygon_pentagon" /> },
  { name: 'polygon', label: 'Hexagon',         sides: 6, icon: <FcIcon name="polygon_hexagon" /> },
  { name: 'polygon', label: 'Heptagon',        sides: 7, icon: <FcIcon name="polygon_heptagon" /> },
  { name: 'polygon', label: 'Octagon',         sides: 8, icon: <FcIcon name="polygon_octagon" /> },
  { name: 'polygon', label: 'Regular polygon',           icon: <FcIcon name="polygon_regular" /> },
] };

const SLOT_GROUP: Group = { key: 'slot', variants: [
  { name: 'slot',    label: 'Create slot',     icon: <FcIcon name="slot" /> },
  { name: 'arcSlot', label: 'Create arc slot', icon: <FcIcon name="arc_slot" /> },
] };

const BSPLINE_GROUP: Group = { key: 'bspline', variants: [
  { name: 'bspline', label: 'B-spline by control points',          bspline: { interpolating: false, periodic: false }, icon: <FcIcon name="bspline" /> },
  { name: 'bspline', label: 'Periodic B-spline by control points', bspline: { interpolating: false, periodic: true },  icon: <FcIcon name="bspline_periodic" /> },
  { name: 'bspline', label: 'B-spline by knots',                   bspline: { interpolating: true,  periodic: false }, icon: <FcIcon name="bspline_knots" /> },
  { name: 'bspline', label: 'Periodic B-spline by knots',          bspline: { interpolating: true,  periodic: true },  icon: <FcIcon name="bspline_knots_periodic" /> },
] };

const SOLID_TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: 'box3d', label: 'Box (BX) — click two corners', icon: <CropSquareIcon fontSize="small" /> },
  { name: 'cylinder3d', label: 'Cylinder (CY) — center + edge', icon: <CircleOutlinedIcon fontSize="small" /> },
  { name: 'sphere3d', label: 'Sphere (SP) — center + edge', icon: <ViewInArIcon fontSize="small" /> },
];

function ToolButton({ name, label, icon, activeTool, onToolChange }: {
  name: ToolName; label: string; icon: React.ReactNode; activeTool: ToolName; onToolChange: (t: ToolName) => void;
}) {
  const active = activeTool === name;
  return (
    <Tooltip title={label} placement="right">
      <IconButton
        onClick={() => onToolChange(name)}
        sx={{
          width: 32, height: 32, borderRadius: 1,
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: active ? 'rgba(79,195,247,0.12)' : 'transparent',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
}

/** Split-button z pod-menu wariantów (FreeCAD-style). Klik = ostatni wariant, ▾ = lista. */
function SplitToolButton({ group, sel, onSel, activeTool, onPick }: {
  group: Group; sel: number; onSel: (i: number) => void;
  activeTool: ToolName; onPick: (v: Variant) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const cur = group.variants[sel] ?? group.variants[0];
  const groupActive = group.variants.some(v => v.name === activeTool);

  return (
    <Box sx={{ position: 'relative', width: 32, height: 32 }}>
      <Tooltip title={cur.label} placement="right">
        <IconButton
          onClick={() => onPick(cur)}
          sx={{
            width: 32, height: 32, borderRadius: 1,
            color: groupActive ? 'primary.main' : 'text.secondary',
            bgcolor: groupActive ? 'rgba(79,195,247,0.12)' : 'transparent',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          {cur.icon}
        </IconButton>
      </Tooltip>
      {/* Kciuk otwierający listę wariantów */}
      <Box
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}
        sx={{
          position: 'absolute', right: -1, bottom: -1, width: 12, height: 12,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          color: 'text.disabled', cursor: 'pointer',
          '&:hover': { color: 'primary.main' },
        }}
      >
        <ArrowDropDownIcon sx={{ fontSize: 14, mb: '-3px', mr: '-3px' }} />
      </Box>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {group.variants.map((v, i) => (
          <MenuItem
            key={v.label}
            selected={i === sel}
            onClick={() => { onSel(i); onPick(v); setAnchor(null); }}
            sx={{ minWidth: 220 }}
          >
            <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32 }}>{v.icon}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{v.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

export function Toolbar({ activeTool, onToolChange, viewMode }: Props) {
  // Ostatnio wybrany wariant w każdej grupie (domyślnie: pierwszy; polygon → Hexagon).
  const [sel, setSel] = useState<Record<string, number>>({ circle: 0, arc: 0, rect: 0, polygon: 3, slot: 0, bspline: 0 });

  const pick = (v: Variant) => {
    if (v.sides != null) polygonTool.setSides(v.sides);
    if (v.bspline) bsplineTool.setMode(v.bspline);
    onToolChange(v.name);
  };

  const groupProps = (g: Group) => ({
    group: g, sel: sel[g.key] ?? 0,
    onSel: (i: number) => setSel(s => ({ ...s, [g.key]: i })),
    activeTool, onPick: pick,
  });

  return (
    <Box sx={{
      width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 0.5, py: 1, bgcolor: 'background.paper', borderRight: '1px solid rgba(255,255,255,0.08)',
      overflowY: 'auto',
    }}>
      {SIMPLE_TOOLS.map(t => (
        <ToolButton key={t.name} {...t} activeTool={activeTool} onToolChange={onToolChange} />
      ))}
      <SplitToolButton {...groupProps(CIRCLE_GROUP)} />
      <SplitToolButton {...groupProps(ARC_GROUP)} />
      <SplitToolButton {...groupProps(RECT_GROUP)} />
      <SplitToolButton {...groupProps(POLYGON_GROUP)} />
      <SplitToolButton {...groupProps(SLOT_GROUP)} />
      <SplitToolButton {...groupProps(BSPLINE_GROUP)} />
      <ToolButton name="polyline" label="Polyline (P)" icon={<FcIcon name="polyline" />} activeTool={activeTool} onToolChange={onToolChange} />
      <ToolButton name="freehand" label="Freehand (FH)" icon={<GestureIcon fontSize="small" />} activeTool={activeTool} onToolChange={onToolChange} />
      <ToolButton name="text" label="Text (TX) — click to place" icon={<TitleIcon fontSize="small" />} activeTool={activeTool} onToolChange={onToolChange} />
      <ToolButton name="image" label="Image (IM) — click to insert" icon={<ImageOutlinedIcon fontSize="small" />} activeTool={activeTool} onToolChange={onToolChange} />

      {/* 3D solid primitives — visible only in 3D mode */}
      {viewMode === '3d' && (
        <>
          <Divider flexItem sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.08)' }} />
          <Tooltip title="3D Solids" placement="right">
            <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled', letterSpacing: 0.5 }}>
              3D
            </Typography>
          </Tooltip>
          {SOLID_TOOLS.map(t => (
            <ToolButton key={t.name} {...t} activeTool={activeTool} onToolChange={onToolChange} />
          ))}
        </>
      )}
    </Box>
  );
}
