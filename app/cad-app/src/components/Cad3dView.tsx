import { useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Box, Button, ButtonGroup, Chip, Divider, Menu, MenuItem,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FlipIcon from '@mui/icons-material/Flip';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import AdjustIcon from '@mui/icons-material/Adjust';
import LayersIcon from '@mui/icons-material/Layers';
import GestureIcon from '@mui/icons-material/Gesture';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import GridOnIcon from '@mui/icons-material/GridOn';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import NearMeIcon from '@mui/icons-material/NearMe';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import TimelineIcon from '@mui/icons-material/Timeline';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import type { Project } from '@mhersztowski/core-cad';
import { useCad3d } from '../cad3d/useCad3d';
import { Cad3dViewport } from './cad3d/Cad3dViewport';
import { FeatureTreePanel } from './cad3d/FeatureTreePanel';
import { FeaturePropsPanel } from './cad3d/FeaturePropsPanel';
import { SceneTreePanel } from './cad3d/SceneTreePanel';
import { SketchEditor } from './cad3d/SketchEditor';
import type { SketchFeature, SketchPlane } from '../cad3d/types';
import { planeFromFace } from '../cad3d/subSelect';
import type { SubSelectMode, SubHit } from '../cad3d/subSelect';

interface Props {
  project: Project;
  version: number;
}

function fmt(v: number) { return v.toFixed(2); }

function SubHitLabel({ hit }: { hit: SubHit | null }) {
  if (!hit) return null;

  let label = '';
  let color: 'default' | 'warning' | 'info' | 'success' = 'default';

  if (hit.type === 'vertex') {
    const p = hit.position;
    label = `Vertex  (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`;
    color = 'info';
  } else if (hit.type === 'edge') {
    const len = hit.a.distanceTo(hit.b);
    label = `Edge  L = ${fmt(len)}`;
    color = 'warning';
  } else if (hit.type === 'face') {
    const n = hit.normal;
    label = `Face  N (${fmt(n.x)}, ${fmt(n.y)}, ${fmt(n.z)})`;
    color = 'success';
  }

  return (
    <Chip
      label={label}
      size="small"
      color={color}
      variant="outlined"
      sx={{ fontFamily: 'monospace', fontSize: '0.68rem', height: 22 }}
    />
  );
}

export function Cad3dView({ project, version }: Props) {
  const {
    tree, selectedId, editingSketchId,
    addSketch, startEditSketch, exitSketch, getSketchProject,
    addExtrude, addPocket, addHole, addGroove,
    addMirror, addRevolve, addShell, addLoft, addLoftCut, addSweep, addSweepCut, addHelix,
    removeFeature, updateFeature, toggleFeature, moveFeature,
    selectFeature, clearTree,
  } = useCad3d();

  const [sketchMenuAnchor, setSketchMenuAnchor] = useState<null | HTMLElement>(null);
  const [sceneRoot, setSceneRoot] = useState<THREE.Object3D | null>(null);
  const [subSelectMode, setSubSelectMode] = useState<SubSelectMode>('object');
  const [subHit, setSubHit] = useState<SubHit | null>(null);

  const handleSceneChange = useCallback((root: THREE.Object3D) => setSceneRoot(root), []);
  const handleSubSelect = useCallback((hit: SubHit | null) => setSubHit(hit), []);

  const handleModeChange = (_: React.MouseEvent, value: SubSelectMode | null) => {
    if (value) { setSubSelectMode(value); setSubHit(null); }
  };

  const selectedFeature = tree.features.find(f => f.id === selectedId) ?? null;

  if (editingSketchId) {
    const sketch = tree.features.find(f => f.id === editingSketchId) as SketchFeature | undefined;
    if (sketch) {
      return (
        <SketchEditor
          project={getSketchProject(editingSketchId)}
          plane={sketch.plane}
          onExit={exitSketch}
        />
      );
    }
  }

  function getSketchId(): string | null {
    const selected = selectedId ? tree.features.find(f => f.id === selectedId) : null;
    if (selected?.type === 'sketch') return selected.id;
    const sketches = tree.features.filter(f => f.type === 'sketch');
    return sketches.length > 0 ? sketches[sketches.length - 1].id : null;
  }

  const handleAddSketch = (plane: SketchPlane) => { setSketchMenuAnchor(null); addSketch(plane); };

  const faceHit = subHit?.type === 'face' ? subHit : null;
  const faceInfo = faceHit ? planeFromFace(faceHit) : null;

  const handleSketchOnFace = () => {
    if (!faceInfo) return;
    addSketch(faceInfo.plane, faceInfo.offset, faceInfo.planeMatrix);
    setSubHit(null);
    setSubSelectMode('object');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, flexWrap: 'wrap',
        borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
      }}>
        {/* Add sketch — smart when face is selected */}
        {faceInfo ? (
          <Tooltip title={`Create sketch on selected face — arbitrary orientation, centered on face`}>
            <Button size="small" variant="contained" color="success"
              startIcon={<GridOnIcon />}
              onClick={handleSketchOnFace}
            >
              Sketch on Face
            </Button>
          </Tooltip>
        ) : (
          <>
            <Tooltip title="Add a new sketch on a plane">
              <Button size="small" variant="contained" color="primary"
                startIcon={<GridOnIcon />} endIcon={<ArrowDropDownIcon />}
                onClick={e => setSketchMenuAnchor(e.currentTarget)}
              >
                Add Sketch
              </Button>
            </Tooltip>
            <Menu anchorEl={sketchMenuAnchor} open={!!sketchMenuAnchor} onClose={() => setSketchMenuAnchor(null)}>
              <MenuItem onClick={() => handleAddSketch('XY')}>XY — front plane</MenuItem>
              <MenuItem onClick={() => handleAddSketch('XZ')}>XZ — top plane</MenuItem>
              <MenuItem onClick={() => handleAddSketch('YZ')}>YZ — right plane</MenuItem>
            </Menu>
          </>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Operations */}
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Ops:</Typography>
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Extrude selected sketch">
            <Button startIcon={<ViewInArIcon />} onClick={() => addExtrude(getSketchId(), [])}>Extrude</Button>
          </Tooltip>
          <Tooltip title="Pocket — subtract selected sketch from solid (CSG)">
            <Button startIcon={<IndeterminateCheckBoxIcon />} onClick={() => addPocket(getSketchId(), [])}>Pocket</Button>
          </Tooltip>
          <Tooltip title="Hole — drill cylinder into solid from sketch circle centers (CSG)">
            <Button startIcon={<RadioButtonUncheckedIcon />} onClick={() => addHole(getSketchId())}>Hole</Button>
          </Tooltip>
          <Tooltip title="Mirror accumulated solid">
            <Button startIcon={<FlipIcon />} onClick={() => addMirror()}>Mirror</Button>
          </Tooltip>
          <Tooltip title="Revolve selected sketch profile">
            <Button startIcon={<RotateRightIcon />} onClick={() => addRevolve(getSketchId(), [])}>Revolve</Button>
          </Tooltip>
          <Tooltip title="Groove — subtractive revolution, cuts groove into solid (CSG)">
            <Button startIcon={<RotateRightIcon />} onClick={() => addGroove(getSketchId(), [])}>Groove</Button>
          </Tooltip>
          <Tooltip title="Shell — hollow the accumulated solid with a wall thickness">
            <Button startIcon={<AdjustIcon />} onClick={() => addShell()}>Shell</Button>
          </Tooltip>
          <Tooltip title="Loft — blend through multiple sketch cross-sections">
            <Button startIcon={<LayersIcon />} onClick={() => addLoft()}>Loft</Button>
          </Tooltip>
          <Tooltip title="Loft Cut — subtractive loft, cuts through cross-sections (CSG)">
            <Button startIcon={<LayersIcon />} onClick={() => addLoftCut()}>Loft Cut</Button>
          </Tooltip>
          <Tooltip title="Sweep — extrude a profile sketch along a path sketch">
            <Button startIcon={<GestureIcon />} onClick={() => addSweep()}>Sweep</Button>
          </Tooltip>
          <Tooltip title="Sweep Cut — subtractive sweep, removes material along a path (CSG)">
            <Button startIcon={<GestureIcon />} onClick={() => addSweepCut()}>Sweep Cut</Button>
          </Tooltip>
          <Tooltip title="Helix — sweep a profile along a helical spine">
            <Button startIcon={<AutorenewIcon />} onClick={() => addHelix()}>Helix</Button>
          </Tooltip>
        </ButtonGroup>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Sub-selection mode */}
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Select:</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={subSelectMode}
          onChange={handleModeChange}
          sx={{ height: 28 }}
        >
          <Tooltip title="Object mode (default)">
            <ToggleButton value="object" sx={{ px: 1 }}>
              <NearMeIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Vertex selection">
            <ToggleButton value="vertex" sx={{ px: 1 }}>
              <ScatterPlotIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Edge selection">
            <ToggleButton value="edge" sx={{ px: 1 }}>
              <TimelineIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Face selection">
            <ToggleButton value="face" sx={{ px: 1 }}>
              <CropSquareIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        {subSelectMode !== 'object' && <SubHitLabel hit={subHit} />}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Clear all features">
          <Button size="small" color="error" variant="outlined" startIcon={<DeleteSweepIcon />} onClick={clearTree}>
            Clear
          </Button>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.disabled">
          {tree.features.length} feature{tree.features.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Main area */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left column */}
        <Box sx={{ width: 220, height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {/* Feature tree — shrinks at 50% so scene tree always has room */}
          <Box sx={{ flex: '0 0 auto', maxHeight: '50%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <FeatureTreePanel
              features={tree.features}
              selectedId={selectedId}
              editingSketchId={editingSketchId}
              onSelect={selectFeature}
              onToggle={toggleFeature}
              onRemove={removeFeature}
              onMove={moveFeature}
              onEditSketch={startEditSketch}
            />
          </Box>
          <Divider sx={{ flexShrink: 0 }} />
          {/* Scene tree — takes all remaining space */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SceneTreePanel
              sceneRoot={sceneRoot}
              features={tree.features}
              selectedId={selectedId}
              onSelect={selectFeature}
            />
          </Box>
        </Box>

        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Cad3dViewport
            tree={tree}
            project={project}
            version={version}
            subSelectMode={subSelectMode}
            style={{ position: 'absolute', inset: 0 }}
            onSceneChange={handleSceneChange}
            onSubSelect={handleSubSelect}
          />
          {/* Sub-selection mode indicator overlay */}
          {subSelectMode !== 'object' && (
            <Box sx={{
              position: 'absolute', bottom: 8, left: 8,
              bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1, px: 1, py: 0.5,
              pointerEvents: 'none',
            }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                {subSelectMode === 'vertex' && 'Vertex mode — hover to preview, click to select'}
                {subSelectMode === 'edge' && 'Edge mode — hover to preview, click to select'}
                {subSelectMode === 'face' && 'Face mode — hover to preview, click to select'}
              </Typography>
            </Box>
          )}
        </Box>

        <FeaturePropsPanel
          feature={selectedFeature}
          features={tree.features}
          onUpdate={updateFeature}
          onEditSketch={startEditSketch}
        />
      </Box>
    </Box>
  );
}
