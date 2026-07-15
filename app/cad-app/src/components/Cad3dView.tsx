import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  Alert, Box, Button, ButtonGroup, Chip, Divider, Menu, MenuItem, Snackbar,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
// Material icons używane w toolbar-ach spoza Ops (np. GridOnIcon dla Add Sketch).
// Ops toolbar używa <FreeCadIcon> — kolorowe SVG z FreeCAD (LGPL).
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { FreeCadIcon } from './cad3d/FreeCadIcon';
import GridOnIcon from '@mui/icons-material/GridOn';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import NearMeIcon from '@mui/icons-material/NearMe';
import ScatterPlotIcon from '@mui/icons-material/ScatterPlot';
import TimelineIcon from '@mui/icons-material/Timeline';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import type { Project } from '@mhersztowski/core-cad';
import { useCad3d } from '../cad3d/useCad3d';
import { Cad3dViewport } from './cad3d/Cad3dViewport';
import { FeatureTreePanel } from './cad3d/FeatureTreePanel';
import { FeaturePropsPanel } from './cad3d/FeaturePropsPanel';
import { SceneTreePanel } from './cad3d/SceneTreePanel';
import { SketchEditor } from './cad3d/SketchEditor';
import type { SketchFeature, SketchPlane } from '../cad3d/types';
import { planeFromFace, datumParamsFromFace } from '../cad3d/subSelect';
import type { SubSelectMode, SubHit } from '../cad3d/subSelect';
import type { ActiveTemplate } from './RepositoryPanel';

interface Props {
  project: Project;
  version: number;
  mergeTreeRef?: MutableRefObject<((json: string) => void) | null>;
  /** Rejestruje funkcję zwracającą aktualne drzewo jako JSON — używane przez File menu / backend save. */
  getTreeJsonRef?: MutableRefObject<(() => string) | null>;
  /** Rejestruje funkcję ładującą drzewo z JSON — używane przez File menu / backend open. */
  replaceTreeRef?: MutableRefObject<((json: string) => void) | null>;
  /** Armed template for serial placement — each click in the viewport adds the template at origin. */
  placementTemplate?: ActiveTemplate | null;
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

export function Cad3dView({ project, version, mergeTreeRef, getTreeJsonRef, replaceTreeRef, placementTemplate }: Props) {
  const {
    tree, selectedId, editingSketchId,
    mergeFeatures, getTreeJson, replaceTree,
    addSketch, startEditSketch, exitSketch, getSketchProject,
    addExtrude, addPocket, addHole, addGroove,
    addMirror, addRevolve, addShell, addFillet, addChamfer, addLinearPattern, addPolarPattern, addLoft, addLoftCut, addSweep, addSweepCut, addHelix,
    addDatumPoint, addDatumLine, addDatumPlane, addDatumCs,
    removeFeature, updateFeature, toggleFeature, moveFeature,
    selectFeature, clearTree,
  } = useCad3d();

  const [sketchMenuAnchor, setSketchMenuAnchor] = useState<null | HTMLElement>(null);
  const [datumMenuAnchor, setDatumMenuAnchor] = useState<null | HTMLElement>(null);
  const [sceneRoot, setSceneRoot] = useState<THREE.Object3D | null>(null);
  const [subSelectMode, setSubSelectMode] = useState<SubSelectMode>('object');
  const [subHit, setSubHit] = useState<SubHit | null>(null);
  const [evalError, setEvalError] = useState<{ feature: string; reason: string } | null>(null);
  const placementFetchingRef = useRef(false);

  // Nasłuchuj błędów evaluatora OCC (evalExtrude/evalRevolve/…) — dyspozytor emituje
  // 'cad3d:eval-error' zamiast cichego return null, żeby użytkownik zobaczył konkretną
  // przyczynę (np. "szkic nie tworzy zamkniętego konturu").
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { feature: string; reason: string } | undefined;
      if (detail?.feature && detail?.reason) setEvalError({ feature: detail.feature, reason: detail.reason });
    };
    window.addEventListener('cad3d:eval-error', handler);
    return () => window.removeEventListener('cad3d:eval-error', handler);
  }, []);

  useEffect(() => {
    if (!mergeTreeRef) return;
    mergeTreeRef.current = mergeFeatures;
    return () => { mergeTreeRef.current = null; };
  }, [mergeTreeRef, mergeFeatures]);

  // Rejestruje save/load callbacks — App-level trzyma refs, File menu ich używa
  // do zapisu / odczytu CAD 3D feature tree z backendu VFS.
  useEffect(() => {
    if (!getTreeJsonRef) return;
    getTreeJsonRef.current = getTreeJson;
    return () => { getTreeJsonRef.current = null; };
  }, [getTreeJsonRef, getTreeJson]);

  useEffect(() => {
    if (!replaceTreeRef) return;
    replaceTreeRef.current = replaceTree;
    return () => { replaceTreeRef.current = null; };
  }, [replaceTreeRef, replaceTree]);

  const handleSceneChange = useCallback((root: THREE.Object3D) => setSceneRoot(root), []);
  const handleSubSelect = useCallback((hit: SubHit | null) => setSubHit(hit), []);

  const handleViewportPlacementClick = useCallback(() => {
    if (!placementTemplate || placementTemplate.mode !== 'cad3d') return;
    const fileUrl = placementTemplate.cadFile;
    if (!fileUrl || !mergeTreeRef?.current || placementFetchingRef.current) return;
    const url = fileUrl.startsWith('http') ? fileUrl : `${placementTemplate.rawBase.replace(/\/$/, '')}/${fileUrl}`;
    placementFetchingRef.current = true;
    fetch(url)
      .then(r => r.text())
      .then(text => { mergeTreeRef.current?.(text); })
      .catch(e => console.error('[Cad3dView] placement failed', e))
      .finally(() => { placementFetchingRef.current = false; });
  }, [placementTemplate, mergeTreeRef]);

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
  // Edge hit → midpoint + tangent direction (dla Fillet/Chamfer edge selection)
  const edgeHit = subHit?.type === 'edge' ? subHit : null;
  const edgeInfo = edgeHit ? {
    midpoint: [
      (edgeHit.a.x + edgeHit.b.x) / 2,
      (edgeHit.a.y + edgeHit.b.y) / 2,
      (edgeHit.a.z + edgeHit.b.z) / 2,
    ] as [number, number, number],
    tangent: (() => {
      const dx = edgeHit.b.x - edgeHit.a.x;
      const dy = edgeHit.b.y - edgeHit.a.y;
      const dz = edgeHit.b.z - edgeHit.a.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      return [dx / len, dy / len, dz / len] as [number, number, number];
    })(),
  } : null;

  const handleSketchOnFace = () => {
    if (!faceInfo) return;
    addSketch(faceInfo.plane, faceInfo.offset, faceInfo.planeMatrix, faceInfo.faceRef);
    setSubHit(null);
    setSubSelectMode('object');
  };

  // ── Datum (odniesienia geometryczne) na zaznaczonej face ──────────────────
  const datumParams = faceHit ? datumParamsFromFace(faceHit) : null;

  const handleDatumPointOnFace = () => {
    if (!datumParams) return;
    addDatumPoint(datumParams.position);
    setSubHit(null); setSubSelectMode('object');
  };
  const handleDatumLineOnFace = () => {
    if (!datumParams) return;
    // Linia prostopadła do face — direction = face normal, długość dopasowana do rozmiaru face
    addDatumLine(datumParams.position, datumParams.normal, datumParams.size);
    setSubHit(null); setSubSelectMode('object');
  };
  const handleDatumPlaneOnFace = () => {
    if (!datumParams) return;
    // Płaszczyzna wzdłuż face — normal = face normal
    addDatumPlane(datumParams.position, datumParams.normal, datumParams.size);
    setSubHit(null); setSubSelectMode('object');
  };
  const handleDatumCsOnFace = () => {
    if (!datumParams) return;
    // Układ współrzędnych z basis U/V/N face (Z osi CS = normal face)
    addDatumCs(datumParams.position, datumParams.rotationEulerXYZ, datumParams.size * 0.6);
    setSubHit(null); setSubSelectMode('object');
  };

  // Light theme lokalnie dla CAD 3D — jasne toolbary/paneły, jasne tło rendering.
  // Global theme aplikacji pozostaje dark (main.tsx). Owijamy TYLKO Cad3dView.
  const globalTheme = useTheme();
  const lightTheme = createTheme({
    ...globalTheme,
    palette: {
      ...globalTheme.palette,
      mode: 'light',
      primary: globalTheme.palette.primary,
      background: { default: '#fafafa', paper: '#ffffff' },
      text: { primary: '#212121', secondary: '#616161' },
      divider: 'rgba(0,0,0,0.12)',
    },
  });

  return (
    <ThemeProvider theme={lightTheme}>
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: 'background.default', color: 'text.primary' }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, flexWrap: 'wrap',
        borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
      }}>
        {/* Add sketch — smart when face is selected */}
        {faceInfo ? (
          <ButtonGroup size="small" variant="contained" color="success">
            <Tooltip title="Create sketch on selected face — arbitrary orientation, centered on face">
              <Button startIcon={<GridOnIcon />} onClick={handleSketchOnFace}>
                Sketch on Face
              </Button>
            </Tooltip>
            <Tooltip title="Punkt odniesienia na centroidzie face">
              <Button onClick={handleDatumPointOnFace}>Punkt</Button>
            </Tooltip>
            <Tooltip title="Linia odniesienia prostopadła do face (kierunek = normal)">
              <Button onClick={handleDatumLineOnFace}>Linia</Button>
            </Tooltip>
            <Tooltip title="Płaszczyzna odniesienia wzdłuż zaznaczonej face">
              <Button onClick={handleDatumPlaneOnFace}>Płaszczyzna</Button>
            </Tooltip>
            <Tooltip title="Układ współrzędnych na face (Z = normal, U/V basis w plane)">
              <Button onClick={handleDatumCsOnFace}>Układ</Button>
            </Tooltip>
          </ButtonGroup>
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
            <Button startIcon={<FreeCadIcon name="extrude" />} onClick={() => addExtrude(getSketchId(), [])}>Extrude</Button>
          </Tooltip>
          <Tooltip title="Pocket — subtract selected sketch from solid (CSG)">
            <Button startIcon={<FreeCadIcon name="pocket" />} onClick={() => addPocket(getSketchId(), [])}>Pocket</Button>
          </Tooltip>
          <Tooltip title="Hole — drill cylinder into solid from sketch circle centers (CSG)">
            <Button startIcon={<FreeCadIcon name="hole" />} onClick={() => addHole(getSketchId())}>Hole</Button>
          </Tooltip>
          <Tooltip title="Mirror accumulated solid">
            <Button startIcon={<FreeCadIcon name="mirror" />} onClick={() => addMirror()}>Mirror</Button>
          </Tooltip>
          <Tooltip title="Revolve selected sketch profile">
            <Button startIcon={<FreeCadIcon name="revolve" />} onClick={() => addRevolve(getSketchId(), [])}>Revolve</Button>
          </Tooltip>
          <Tooltip title="Groove — subtractive revolution, cuts groove into solid (CSG)">
            <Button startIcon={<FreeCadIcon name="groove" />} onClick={() => addGroove(getSketchId(), [])}>Groove</Button>
          </Tooltip>
          <Tooltip title="Shell — hollow the accumulated solid with a wall thickness">
            <Button startIcon={<FreeCadIcon name="shell" />} onClick={() => addShell()}>Shell</Button>
          </Tooltip>
          <Tooltip title="Fillet — round sharp edges with a radius">
            <Button startIcon={<FreeCadIcon name="fillet" />} onClick={() => addFillet()}>Fillet</Button>
          </Tooltip>
          <Tooltip title="Chamfer — bevel sharp edges with a distance">
            <Button startIcon={<FreeCadIcon name="chamfer" />} onClick={() => addChamfer()}>Chamfer</Button>
          </Tooltip>
          <Tooltip title="Linear Pattern — replicate feature(s) along a line">
            <Button startIcon={<FreeCadIcon name="linear_pattern" />} onClick={() => addLinearPattern()}>Linear</Button>
          </Tooltip>
          <Tooltip title="Polar Pattern — replicate feature(s) around an axis">
            <Button startIcon={<FreeCadIcon name="polar_pattern" />} onClick={() => addPolarPattern()}>Polar</Button>
          </Tooltip>
          <Tooltip title="Loft — blend through multiple sketch cross-sections">
            <Button startIcon={<FreeCadIcon name="loft" />} onClick={() => addLoft()}>Loft</Button>
          </Tooltip>
          <Tooltip title="Loft Cut — subtractive loft, cuts through cross-sections (CSG)">
            <Button startIcon={<FreeCadIcon name="loft_cut" />} onClick={() => addLoftCut()}>Loft Cut</Button>
          </Tooltip>
          <Tooltip title="Sweep — extrude a profile sketch along a path sketch">
            <Button startIcon={<FreeCadIcon name="sweep" />} onClick={() => addSweep()}>Sweep</Button>
          </Tooltip>
          <Tooltip title="Sweep Cut — subtractive sweep, removes material along a path (CSG)">
            <Button startIcon={<FreeCadIcon name="sweep_cut" />} onClick={() => addSweepCut()}>Sweep Cut</Button>
          </Tooltip>
          <Tooltip title="Helix — sweep a profile along a helical spine">
            <Button startIcon={<FreeCadIcon name="helix" />} onClick={() => addHelix()}>Helix</Button>
          </Tooltip>
        </ButtonGroup>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Odniesienia (datum) — punkt / linia / płaszczyzna / układ współrzędnych */}
        <Tooltip title="Odniesienia: punkt, linia, płaszczyzna, układ współrzędnych">
          <Button size="small" variant="outlined" startIcon={<GpsFixedIcon />} endIcon={<ArrowDropDownIcon />}
            onClick={e => setDatumMenuAnchor(e.currentTarget)}>
            Odniesienia
          </Button>
        </Tooltip>
        <Menu anchorEl={datumMenuAnchor} open={Boolean(datumMenuAnchor)} onClose={() => setDatumMenuAnchor(null)}>
          <MenuItem onClick={() => { setDatumMenuAnchor(null); addDatumPoint(); }}>Punkt odniesienia</MenuItem>
          <MenuItem onClick={() => { setDatumMenuAnchor(null); addDatumLine(); }}>Linia odniesienia</MenuItem>
          <MenuItem onClick={() => { setDatumMenuAnchor(null); addDatumPlane(); }}>Płaszczyzna odniesienia</MenuItem>
          <MenuItem onClick={() => { setDatumMenuAnchor(null); addDatumCs(); }}>Układ współrzędnych</MenuItem>
        </Menu>

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
            <ToggleButton value="object" sx={{ px: 1, color: 'text.primary' }}>
              <NearMeIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Vertex selection">
            <ToggleButton value="vertex" sx={{ px: 1, color: 'text.primary' }}>
              <ScatterPlotIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Edge selection">
            <ToggleButton value="edge" sx={{ px: 1, color: 'text.primary' }}>
              <TimelineIcon sx={{ fontSize: 14 }} />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Face selection">
            <ToggleButton value="face" sx={{ px: 1, color: 'text.primary' }}>
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
            selectedId={selectedId}
          />
          {/* Placement overlay — click anywhere in viewport to stamp template */}
          {placementTemplate?.mode === 'cad3d' && (
            <Box
              sx={{ position: 'absolute', inset: 0, cursor: 'copy', zIndex: 10 }}
              onClick={handleViewportPlacementClick}
            />
          )}
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
          onCreateDatumPlane={addDatumPlane}
          faceDatumParams={datumParams ? {
            position: datumParams.position,
            normal: datumParams.normal,
            size: datumParams.size,
          } : null}
          edgeParams={edgeInfo}
        />
      </Box>

      <Snackbar
        open={!!evalError}
        autoHideDuration={6000}
        onClose={() => setEvalError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setEvalError(null)} sx={{ maxWidth: 480 }}>
          <strong>{evalError?.feature}</strong> — {evalError?.reason}
        </Alert>
      </Snackbar>
    </Box>
    </ThemeProvider>
  );
}
