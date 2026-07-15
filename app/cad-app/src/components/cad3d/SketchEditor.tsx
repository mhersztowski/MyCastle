import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Divider, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import type { Project } from '@mhersztowski/core-cad';
import type { Point2D } from '@mhersztowski/core-cad';
import { ActionBar } from '../ActionBar';
import { CadCanvas } from '../CadCanvas';
import { CommandLine } from '../CommandLine';
import { LayerPanel } from '../LayerPanel';
import { PropertiesPanel } from '../PropertiesPanel';
import { StatusBar } from '../StatusBar';
import { Toolbar } from '../Toolbar';
import { useProject } from '../../hooks/useProject';
import type { SketchPlane } from '../../cad3d/types';
import type { ToolName } from '../../tools/types';
import { ConstraintsPanel, ElementsPanel } from './ConstraintsPanel';
import type { ConstraintType, SketchConstraint, SketchEntity } from '../../cad3d/sketchConstraints';
import { constraintTypeLabel, solveConstraints } from '../../cad3d/sketchConstraints';

interface Props {
  project: Project;
  plane: SketchPlane;
  onExit: () => void;
}

const PLANE_LABEL: Record<SketchPlane, string> = {
  XY: 'XY — front plane',
  XZ: 'XZ — top plane',
  YZ: 'YZ — right plane',
  face: 'Face plane',
};

export function SketchEditor({ project, plane, onExit }: Props) {
  const { version } = useProject(project);
  // Domyślnie 'select' — user musi klikać elements w scenie żeby applikować constraints.
  // Przełączenie na 'line' / 'circle' etc. wchodzi w tryb rysowania.
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [rightTab, setRightTab] = useState<'layers' | 'properties' | 'constraints' | 'elements'>('constraints');
  const [injectedPoint, setInjectedPoint] = useState<Point2D | null>(null);
  const [injectedAngle, setInjectedAngle] = useState<number | null>(null);
  const lastPointRef = useRef<Point2D | null>(null);

  // Constraints state (local w editorze; przy Exit Sketch zapisuje się do SketchFeature.constraints).
  const [constraints, setConstraints] = useState<SketchConstraint[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);

  const handleToolChange = useCallback((tool: ToolName) => {
    setActiveTool(tool);
    setInjectedPoint(null);
    setInjectedAngle(null);
  }, []);

  // Subscribe do event bus — CadCanvas.select tool emituje 'selection:changed'
  // z listą ID zaznaczonych entities. Synchronizujemy z lokalnym stanem UI.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBus = (project as any).eventBus;
    if (!eventBus?.on) return;
    const handler = (ids: string[]) => {
      setSelectedElementIds(Array.isArray(ids) ? [...ids] : []);
    };
    const unsub = eventBus.on('selection:changed', handler);
    // Init z aktualnym stanem
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (project as any).selectionManager?.getSelected?.() ?? [];
    if (current.length > 0) setSelectedElementIds([...current]);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [project]);

  // Entities z EntityRegistry projektu — używane w Elements panel + solver
  const entities = useMemo(() => {
    const raw = project.entityRegistry.getAll() as unknown as Array<{ id: string; type: string; name?: string } & Record<string, unknown>>;
    void version; // deps na re-render
    return raw;
  }, [project, version]);

  const addConstraint = (type: ConstraintType, refs: string[], value?: number) => {
    if (refs.length === 0) return;
    const newConstraint: SketchConstraint = {
      id: `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type, refs, value,
      visible: true,
      name: `${constraintTypeLabel(type)}${constraints.length + 1}`,
    };
    const nextConstraints = [...constraints, newConstraint];
    setConstraints(nextConstraints);
    // Uruchom solver z aktualnymi entities
    runSolver(nextConstraints);
    setSelectedElementIds([]);
  };

  const runSolver = (currConstraints: SketchConstraint[]) => {
    const sketchEntities: SketchEntity[] = entities
      .filter(e => e.type === 'line' || e.type === 'circle' || e.type === 'rect' || e.type === 'point')
      .map(e => ({ ...e } as unknown as SketchEntity));
    const result = solveConstraints(sketchEntities, currConstraints);
    console.log('[solver]', { converged: result.converged, iter: result.iterations, res: result.residual });
    if (result.converged) {
      // Aplikuj wyniki przez project.updateEntity() — emituje 'entity:updated'
      // które triggeruje useProject.version bump → CadCanvas re-render.
      for (const e of result.entities) {
        try {
          const changes: Record<string, unknown> = {};
          for (const key of Object.keys(e)) {
            if (key === 'id' || key === 'type') continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            changes[key] = (e as unknown as any)[key];
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          project.updateEntity(e.id, changes as any);
        } catch (err) {
          console.warn('[solver] updateEntity failed', e.id, err);
        }
      }
    }
  };

  // Toolbar handlers dla constraints
  const constraintHandlers: Array<{ type: ConstraintType; label: string; refsRequired: number; needsValue?: boolean }> = [
    { type: 'coincident', label: 'Coincident (2 punkty)', refsRequired: 2 },
    { type: 'horizontal', label: 'Horizontal (linia)', refsRequired: 1 },
    { type: 'vertical', label: 'Vertical (linia)', refsRequired: 1 },
    { type: 'parallel', label: 'Parallel (2 linie)', refsRequired: 2 },
    { type: 'perpendicular', label: 'Perpendicular (2 linie)', refsRequired: 2 },
    { type: 'equal', label: 'Equal (2 linie równej długości)', refsRequired: 2 },
    { type: 'distance', label: 'Distance (odległość)', refsRequired: 2, needsValue: true },
    { type: 'fixed', label: 'Fixed (zablokuj punkt)', refsRequired: 1 },
  ];

  const applyConstraintFromToolbar = (type: ConstraintType, refsRequired: number, needsValue: boolean = false) => {
    if (selectedElementIds.length < refsRequired) {
      alert(`${constraintTypeLabel(type)} wymaga ${refsRequired} zaznaczonych elementów. Zaznaczono: ${selectedElementIds.length}`);
      return;
    }
    let value: number | undefined = undefined;
    if (needsValue) {
      const input = prompt('Podaj wartość:');
      if (!input) return;
      value = parseFloat(input);
      if (isNaN(value)) return;
    }
    addConstraint(type, selectedElementIds.slice(0, refsRequired), value);
  };

  // Dimension dropdown menu
  const [dimAnchor, setDimAnchor] = useState<HTMLElement | null>(null);

  const dimensionOptions: Array<{ type: ConstraintType | 'auto'; label: string }> = [
    { type: 'auto', label: 'Dimension (intelligent)' },
    { type: 'horizontal_distance', label: 'Horizontal Dimension' },
    { type: 'vertical_distance', label: 'Vertical Dimension' },
    { type: 'distance', label: 'Distance Dimension' },
    { type: 'radius', label: 'Radius Dimension' },
    { type: 'diameter', label: 'Diameter Dimension' },
    { type: 'angle', label: 'Angle Dimension' },
    { type: 'fixed', label: 'Lock Position' },
  ];

  const applyDimension = (type: ConstraintType | 'auto') => {
    setDimAnchor(null);
    if (type === 'auto') {
      // Intelligent — na podstawie liczby i typu zaznaczonych elementów wybierz najlepszy typ
      const selEntities = selectedElementIds.map(id => entities.find(e => e.id === id)).filter(Boolean) as Array<{ id: string; type: string }>;
      if (selEntities.length === 0) {
        alert('Zaznacz element(y) najpierw');
        return;
      }
      if (selEntities.length === 1) {
        const e = selEntities[0];
        if (e.type === 'circle') applyConstraintFromToolbar('radius', 1, true);
        else if (e.type === 'line') applyConstraintFromToolbar('distance', 1, true);  // długość linii — wymaga refów p1/p2
        else applyConstraintFromToolbar('fixed', 1);
      } else if (selEntities.length === 2) {
        const [a, b] = selEntities;
        if (a.type === 'line' && b.type === 'line') applyConstraintFromToolbar('angle', 2, true);
        else applyConstraintFromToolbar('distance', 2, true);
      } else {
        alert('Intelligent Dimension obsługuje 1-2 elementy. Wybierz konkretny typ z menu.');
      }
      return;
    }

    // Konkretne typy
    switch (type) {
      case 'horizontal_distance':
      case 'vertical_distance':
      case 'distance':
      case 'angle':
        applyConstraintFromToolbar(type, 2, true);
        break;
      case 'radius':
      case 'diameter':
        applyConstraintFromToolbar(type, 1, true);
        break;
      case 'fixed':
        applyConstraintFromToolbar('fixed', 1);
        break;
    }
  };

  // Light theme lokalnie dla SketchEditor — spójny wygląd z CAD 3D View.
  // Global theme aplikacji pozostaje dark; owijamy TYLKO ten komponent.
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
      {/* Sketch header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 0.5,
        bgcolor: 'primary.dark', borderBottom: '1px solid', borderColor: 'primary.main', flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.contrastText', letterSpacing: 0.5 }}>
          SKETCH EDITOR
        </Typography>
        <Chip label={PLANE_LABEL[plane]} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          onClick={onExit}
        >
          Exit Sketch
        </Button>
      </Box>

      <ActionBar activeTool={activeTool} onToolChange={handleToolChange} project={project} />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar activeTool={activeTool} onToolChange={handleToolChange} viewMode="2d" />

        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <CadCanvas
            project={project}
            activeTool={activeTool}
            version={version}
            viewMode="2d"
            injectedPoint={injectedPoint}
            injectedAngle={injectedAngle}
            onLastPoint={p => { lastPointRef.current = p; }}
          />
        </Box>

        <Box sx={{
          width: 260, display: 'flex', flexDirection: 'column',
          bgcolor: 'background.paper', borderLeft: '1px solid rgba(0,0,0,0.12)',
        }}>
          {/* Dimension dropdown — osobny wiersz, wyraźnie widoczny */}
          <Box sx={{
            display: 'flex', p: 0.5, borderBottom: '1px solid rgba(0,0,0,0.12)',
            bgcolor: 'background.paper',
          }}>
            <Button
              size="small"
              variant="outlined"
              fullWidth
              onClick={e => setDimAnchor(e.currentTarget)}
              sx={{
                borderColor: '#c62828', color: '#c62828',
                justifyContent: 'flex-start', gap: 1, fontSize: 12,
                '&:hover': { borderColor: '#c62828', bgcolor: 'rgba(198,40,40,0.08)' },
              }}
              startIcon={<DimensionIcon />}
              endIcon={<span style={{ fontSize: 10 }}>▾</span>}
            >
              Dimension
            </Button>
            <Menu anchorEl={dimAnchor} open={!!dimAnchor} onClose={() => setDimAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
              {dimensionOptions.map(opt => (
                <MenuItem key={opt.type} dense onClick={() => applyDimension(opt.type)}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DimensionSubIcon type={opt.type} />
                    <Typography variant="body2">{opt.label}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
          </Box>

          {/* Toolbar constraints — 8 buttons w stylu FreeCAD */}
          <Box sx={{
            display: 'flex', flexWrap: 'wrap', gap: 0.25, p: 0.5,
            borderBottom: '1px solid rgba(0,0,0,0.12)',
            bgcolor: 'action.hover',
          }}>
            {constraintHandlers.map(h => (
              <Tooltip key={h.type} title={h.label}>
                <Box
                  onClick={() => applyConstraintFromToolbar(h.type, h.refsRequired, !!h.needsValue)}
                  sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, cursor: 'pointer',
                    borderRadius: 0.5,
                    color: '#c62828',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <ConstraintToolbarIcon type={h.type} />
                </Box>
              </Tooltip>
            ))}
          </Box>

          {/* Tabs (4 zakładki) */}
          <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
            {(['constraints', 'elements', 'layers', 'properties'] as const).map(tab => (
              <Box
                key={tab}
                onClick={() => setRightTab(tab)}
                sx={{
                  flex: 1, py: 0.5, textAlign: 'center', cursor: 'pointer', fontSize: 10,
                  color: rightTab === tab ? 'primary.main' : 'text.secondary',
                  borderBottom: rightTab === tab ? '2px solid' : '2px solid transparent',
                  borderColor: rightTab === tab ? 'primary.main' : 'transparent',
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </Box>
            ))}
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {rightTab === 'constraints' && (
              <ConstraintsPanel
                constraints={constraints}
                onToggleVisibility={(id, visible) =>
                  setConstraints(constraints.map(c => c.id === id ? { ...c, visible } : c))}
                onDelete={id => {
                  const next = constraints.filter(c => c.id !== id);
                  setConstraints(next);
                  runSolver(next);
                }}
                onSelect={setSelectedConstraintId}
                selectedId={selectedConstraintId}
              />
            )}
            {rightTab === 'elements' && (
              <ElementsPanel
                entities={entities}
                onSelect={(id) => {
                  // Toggle selection przez selectionManager żeby propagacja poszła też do canvas
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sm = (project as any).selectionManager;
                  if (sm) {
                    const isSelected = selectedElementIds.includes(id);
                    if (isSelected) sm.deselect?.(id);
                    else sm.select?.(id, true); // multi-select mode (jak shift)
                    // Emit żeby subscribe w useEffect zaktualizował setSelectedElementIds
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (project as any).eventBus?.emit?.('selection:changed', sm.getSelected?.() ?? []);
                  } else {
                    // Fallback bez selectionManager
                    setSelectedElementIds(prev => prev.includes(id)
                      ? prev.filter(x => x !== id) : [...prev, id]);
                  }
                }}
                selectedId={selectedElementIds[0] ?? null}
              />
            )}
            {rightTab === 'layers' && <LayerPanel project={project} version={version} />}
            {rightTab === 'properties' && <PropertiesPanel project={project} version={version} />}
          </Box>

          {/* Info: selected elements count */}
          {selectedElementIds.length > 0 && (
            <Box sx={{ p: 0.5, borderTop: '1px solid rgba(0,0,0,0.12)', bgcolor: 'primary.dark' }}>
              <Typography variant="caption" sx={{ color: 'primary.contrastText', fontSize: 10 }}>
                {selectedElementIds.length} zaznaczonych elementów
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Divider />
      <StatusBar project={project} activeTool={activeTool} viewMode="2d" />
      <CommandLine
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onCoordinate={p => setInjectedPoint({ ...p })}
        onAngle={deg => setInjectedAngle(deg + Math.random() * 1e-10)}
        lastPoint={lastPointRef.current}
      />
    </Box>
    </ThemeProvider>
  );
}

/** Ikony constraint toolbar w stylu FreeCAD (czerwone SVG). */
function ConstraintToolbarIcon({ type }: { type: ConstraintType }) {
  const c = '#c62828';
  const s = { width: 20, height: 20, viewBox: '0 0 20 20', xmlns: 'http://www.w3.org/2000/svg' };
  switch (type) {
    case 'coincident':
      return <svg {...s}><circle cx="10" cy="10" r="3.5" fill={c} /><line x1="2" y1="18" x2="18" y2="2" stroke={c} strokeWidth="2" /></svg>;
    case 'horizontal':
      return <svg {...s}><line x1="2" y1="10" x2="18" y2="10" stroke={c} strokeWidth="3" /></svg>;
    case 'vertical':
      return <svg {...s}><line x1="10" y1="2" x2="10" y2="18" stroke={c} strokeWidth="3" /></svg>;
    case 'parallel':
      return <svg {...s}><line x1="4" y1="3" x2="12" y2="17" stroke={c} strokeWidth="2" /><line x1="9" y1="3" x2="17" y2="17" stroke={c} strokeWidth="2" /></svg>;
    case 'perpendicular':
      return <svg {...s}><line x1="3" y1="3" x2="17" y2="17" stroke={c} strokeWidth="2" /><line x1="17" y1="3" x2="3" y2="17" stroke={c} strokeWidth="2" /></svg>;
    case 'equal':
      return <svg {...s}><line x1="3" y1="7" x2="17" y2="7" stroke={c} strokeWidth="2" /><line x1="3" y1="13" x2="17" y2="13" stroke={c} strokeWidth="2" /></svg>;
    case 'distance':
      return <svg {...s}><line x1="3" y1="10" x2="17" y2="10" stroke={c} strokeWidth="1.5" /><line x1="3" y1="7" x2="3" y2="13" stroke={c} strokeWidth="2" /><line x1="17" y1="7" x2="17" y2="13" stroke={c} strokeWidth="2" /></svg>;
    case 'fixed':
      return <svg {...s}><circle cx="10" cy="10" r="5" fill="none" stroke={c} strokeWidth="2" /><line x1="10" y1="4" x2="10" y2="16" stroke={c} strokeWidth="1" /><line x1="4" y1="10" x2="16" y2="10" stroke={c} strokeWidth="1" /></svg>;
    default:
      return <svg {...s}><rect x="4" y="4" width="12" height="12" fill="none" stroke={c} strokeWidth="1.5" /></svg>;
  }
}

/** Dimension toolbar icon — czerwony trójkąt-strzałka jak w FreeCAD. */
function DimensionIcon() {
  const c = '#c62828';
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M 2 15 L 18 5 L 15 3 L 2 12 Z" fill={c} stroke={c} strokeWidth="1" />
      <line x1="4" y1="17" x2="18" y2="17" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

/** Ikony dla poszczególnych typów dimension w submenu. */
function DimensionSubIcon({ type }: { type: ConstraintType | 'auto' }) {
  const c = '#c62828';
  const s = { width: 16, height: 16, viewBox: '0 0 16 16', xmlns: 'http://www.w3.org/2000/svg' };
  switch (type) {
    case 'auto':
      return <svg {...s}><path d="M 1 12 L 15 4 L 12 2 L 1 10 Z" fill={c} /></svg>;
    case 'horizontal_distance':
      return <svg {...s}><line x1="2" y1="8" x2="14" y2="8" stroke={c} strokeWidth="1.5" /><line x1="2" y1="5" x2="2" y2="11" stroke={c} strokeWidth="2" /><line x1="14" y1="5" x2="14" y2="11" stroke={c} strokeWidth="2" /></svg>;
    case 'vertical_distance':
      return <svg {...s}><line x1="8" y1="2" x2="8" y2="14" stroke={c} strokeWidth="1.5" /><line x1="5" y1="2" x2="11" y2="2" stroke={c} strokeWidth="2" /><line x1="5" y1="14" x2="11" y2="14" stroke={c} strokeWidth="2" /></svg>;
    case 'distance':
      return <svg {...s}><path d="M 3 12 L 13 4" stroke={c} strokeWidth="1.5" /><circle cx="3" cy="12" r="1.5" fill={c} /><circle cx="13" cy="4" r="1.5" fill={c} /></svg>;
    case 'radius':
      return <svg {...s}><circle cx="8" cy="8" r="5" fill="none" stroke={c} strokeWidth="1.5" /><line x1="8" y1="8" x2="12.5" y2="4.5" stroke={c} strokeWidth="1.5" /></svg>;
    case 'diameter':
      return <svg {...s}><circle cx="8" cy="8" r="5" fill="none" stroke={c} strokeWidth="1.5" /><text x="6" y="11" fontSize="9" fill={c}>Ø</text></svg>;
    case 'angle':
      return <svg {...s}><path d="M 2 14 L 14 14 M 2 14 L 12 4" stroke={c} strokeWidth="1.5" fill="none" /><path d="M 5 12 A 3 3 0 0 0 4 10" stroke={c} strokeWidth="1" fill="none" /></svg>;
    case 'fixed':
      return <svg {...s}><rect x="4" y="7" width="8" height="6" fill="none" stroke={c} strokeWidth="1.5" /><path d="M 6 7 L 6 5 A 2 2 0 0 1 10 5 L 10 7" stroke={c} strokeWidth="1.5" fill="none" /></svg>;
    default:
      return null;
  }
}
