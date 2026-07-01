import {
  Box, List, ListItemButton, ListItemText, ListItemIcon, ListItemSecondaryAction,
  IconButton, Typography, Tooltip, Divider,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import FlipIcon from '@mui/icons-material/Flip';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import EditIcon from '@mui/icons-material/Edit';
import GridOnIcon from '@mui/icons-material/GridOn';
import AdjustIcon from '@mui/icons-material/Adjust';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import LayersIcon from '@mui/icons-material/Layers';
import GestureIcon from '@mui/icons-material/Gesture';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TimelineIcon from '@mui/icons-material/Timeline';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import type { Feature } from '../../cad3d/types';

const ICONS: Record<string, React.ReactNode> = {
  sketch:  <GridOnIcon fontSize="small" />,
  extrude: <ViewInArIcon fontSize="small" />,
  pocket:  <IndeterminateCheckBoxIcon fontSize="small" />,
  hole:    <RadioButtonUncheckedIcon fontSize="small" />,
  groove:   <RotateRightIcon fontSize="small" />,
  loft_cut: <LayersIcon fontSize="small" />,
  mirror:  <FlipIcon fontSize="small" />,
  revolve: <RotateRightIcon fontSize="small" />,
  shell:   <AdjustIcon fontSize="small" />,
  loft:    <LayersIcon fontSize="small" />,
  sweep:      <GestureIcon fontSize="small" />,
  sweep_cut:  <GestureIcon fontSize="small" />,
  helix:   <AutorenewIcon fontSize="small" />,
  datum_point: <FiberManualRecordIcon fontSize="small" />,
  datum_line:  <TimelineIcon fontSize="small" />,
  datum_plane: <CropSquareIcon fontSize="small" />,
  datum_cs:    <GpsFixedIcon fontSize="small" />,
};

interface Props {
  features: Feature[];
  selectedId: string | null;
  editingSketchId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onEditSketch: (id: string) => void;
}

export function FeatureTreePanel({
  features, selectedId, editingSketchId,
  onSelect, onToggle, onRemove, onMove, onEditSketch,
}: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}>
      <Typography variant="caption" sx={{ px: 1.5, py: 0.75, color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
        Feature Tree
      </Typography>
      <Divider />
      <List dense disablePadding sx={{ flex: 1, overflowY: 'auto' }}>
        {features.length === 0 && (
          <Typography variant="body2" sx={{ px: 2, py: 2, color: 'text.disabled' }}>
            No features yet
          </Typography>
        )}
        {features.map((f, idx) => {
          const isEditingSketch = f.id === editingSketchId;
          return (
            <ListItemButton
              key={f.id}
              selected={f.id === selectedId}
              onDoubleClick={() => { if (f.type === 'sketch') onEditSketch(f.id); }}
              onClick={() => onSelect(f.id)}
              sx={{
                opacity: f.enabled ? 1 : 0.45,
                pr: 9,
                borderLeft: isEditingSketch ? '3px solid' : '3px solid transparent',
                borderColor: isEditingSketch ? 'primary.main' : 'transparent',
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>{ICONS[f.type]}</ListItemIcon>
              <ListItemText
                primary={f.name}
                secondary={isEditingSketch ? 'editing…' : f.type}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption', color: isEditingSketch ? 'primary' : undefined }}
              />
              <ListItemSecondaryAction sx={{ display: 'flex', gap: 0 }}>
                {f.type === 'sketch' && (
                  <Tooltip title="Edit sketch">
                    <IconButton size="small" color={isEditingSketch ? 'primary' : 'default'} onClick={e => { e.stopPropagation(); onEditSketch(f.id); }}>
                      <EditIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={f.enabled ? 'Hide' : 'Show'}>
                  <IconButton size="small" onClick={e => { e.stopPropagation(); onToggle(f.id); }}>
                    {f.enabled ? <VisibilityIcon fontSize="inherit" /> : <VisibilityOffIcon fontSize="inherit" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Move up">
                  <span>
                    <IconButton size="small" disabled={idx === 0} onClick={e => { e.stopPropagation(); onMove(f.id, 'up'); }}>
                      <ArrowUpwardIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span>
                    <IconButton size="small" disabled={idx === features.length - 1} onClick={e => { e.stopPropagation(); onMove(f.id, 'down'); }}>
                      <ArrowDownwardIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton size="small" onClick={e => { e.stopPropagation(); onRemove(f.id); }}>
                    <DeleteIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}
