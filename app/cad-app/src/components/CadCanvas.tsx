import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { Point2D, Project, SnapResult } from '@mhersztowski/core-cad';
import type { ViewMode } from '@mhersztowski/core-cad';
import { CadRenderer } from '../renderer/CadRenderer';
import { DimensionOverlay } from './DimensionOverlay';
import { GripOverlay } from './GripOverlay';
import { ScaleBar } from './ScaleBar';
import { SelectTool } from '../tools/SelectTool';
import { LineTool } from '../tools/LineTool';
import { CircleTool } from '../tools/CircleTool';
import { ArcTool } from '../tools/ArcTool';
import { RectTool } from '../tools/RectTool';
import { PolylineTool } from '../tools/PolylineTool';
import { MoveTool } from '../tools/MoveTool';
import { CopyTool } from '../tools/CopyTool';
import { RotateTool } from '../tools/RotateTool';
import { OffsetTool } from '../tools/OffsetTool';
import { TrimTool } from '../tools/TrimTool';
import { FilletTool } from '../tools/FilletTool';
import { DimensionTool } from '../tools/DimensionTool';
import { Box3dTool } from '../tools/Box3dTool';
import { Cylinder3dTool } from '../tools/Cylinder3dTool';
import { Sphere3dTool } from '../tools/Sphere3dTool';
import { freehandTool } from '../tools/FreehandTool';
import { textTool } from '../tools/TextTool';
import { imageTool } from '../tools/ImageTool';
import type { DimensionLabel, PenInput, Tool, ToolName } from '../tools/types';
import { DEFAULT_PEN_INPUT } from '../tools/types';

interface Props {
  project: Project;
  activeTool: ToolName;
  version: number;
  viewMode: ViewMode;
  injectedPoint?: Point2D | null;
  injectedAngle?: number | null;
  onLastPoint?: (p: Point2D) => void;
}

const filletTool = new FilletTool();

const tools: Record<ToolName, Tool> = {
  select: new SelectTool(),
  line: new LineTool(),
  circle: new CircleTool(),
  arc: new ArcTool(),
  rect: new RectTool(),
  polyline: new PolylineTool(),
  freehand: freehandTool,
  text: textTool,
  image: imageTool,
  move: new MoveTool(),
  copy: new CopyTool(),
  rotate: new RotateTool(),
  offset: new OffsetTool(),
  trim: new TrimTool(),
  fillet: filletTool,
  dimension: new DimensionTool(),
  box3d: new Box3dTool(),
  cylinder3d: new Cylinder3dTool(),
  sphere3d: new Sphere3dTool(),
};

export function CadCanvas({ project, activeTool, version, viewMode, injectedPoint, injectedAngle, onLastPoint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);
  const prevToolRef = useRef<ToolName>(activeTool);
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });

  const mouseRef = useRef({ isPanning: false, lastX: 0, lastY: 0, isDown: false });
  const [dimLabels, setDimLabels] = useState<DimensionLabel[]>([]);
  const [penInput, setPenInput] = useState<PenInput | null>(null);


  // Init renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CadRenderer(canvas, project);
    rendererRef.current = renderer;
    const parent = canvas.parentElement!;
    if (parent.clientWidth > 0 && parent.clientHeight > 0) {
      renderer.resize(parent.clientWidth, parent.clientHeight);
    }
    renderer.syncAll();

    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      renderer.resize(width, height);
    });
    ro.observe(canvas.parentElement!);

    return () => {
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [project]);

  // Sync renderer on project changes
  useEffect(() => {
    rendererRef.current?.syncAll();
  }, [version]);

  // Apply view mode changes
  useEffect(() => {
    rendererRef.current?.setViewMode(viewMode);
  }, [viewMode]);

  // Reset previous tool when tool changes
  useEffect(() => {
    if (prevToolRef.current !== activeTool) {
      tools[prevToolRef.current].reset();
      prevToolRef.current = activeTool;
      setDimLabels([]);
    }
  }, [activeTool]);

  // Handle injected point from CommandLine
  useEffect(() => {
    if (!injectedPoint) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const snap: SnapResult = { point: injectedPoint, mode: 'nearest' };
    const ctx = { project, snapResult: snap, pen: DEFAULT_PEN_INPUT };
    const tool = tools[activeTool];
    tool.onPointerDown(injectedPoint, ctx);
    renderer.setPreview(tool.getPreview());
    renderer.syncAll();
    onLastPoint?.(injectedPoint);
  }, [injectedPoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle injected angle (RotateTool or FilletTool from CommandLine)
  useEffect(() => {
    if (injectedAngle == null) return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (activeTool === 'rotate') {
      const rotateTool = tools['rotate'] as RotateTool;
      const snap: SnapResult = { point: cursorWorld, mode: 'nearest' };
      const ctx = { project, snapResult: snap, pen: DEFAULT_PEN_INPUT };
      rotateTool.rotateByDegrees(injectedAngle, ctx);
      renderer.setPreview(rotateTool.getPreview());
      renderer.syncAll();
    } else if (activeTool === 'fillet') {
      // Number input sets the fillet radius
      filletTool.radius = Math.max(0, injectedAngle);
    }
  }, [injectedAngle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve screen point → CAD world point (handles both 2D and 3D mode)
  const resolveWorldPoint = useCallback((sx: number, sy: number): Point2D | null => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    if (renderer.getViewMode() === '3d') {
      return renderer.screenToWorldPlane(sx, sy);
    }
    return renderer.screenToWorld(sx, sy);
  }, []);

  const getSnapPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): { snapResult: SnapResult; pen: PenInput } | null => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = resolveWorldPoint(sx, sy);
    if (!worldPt) return null;

    const pen: PenInput = {
      pointerType: (e.pointerType || 'mouse') as PenInput['pointerType'],
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      tangentialPressure: e.tangentialPressure,
    };

    // Freehand/text/image never snap — use raw cursor
    if (activeTool === 'freehand' || activeTool === 'text' || activeTool === 'image') {
      return { snapResult: { point: worldPt, mode: 'nearest' }, pen };
    }

    if (renderer.getViewMode() === '3d') {
      const gridSize = project.settings.gridSize;
      const snapped: Point2D = {
        x: Math.round(worldPt.x / gridSize) * gridSize,
        y: Math.round(worldPt.y / gridSize) * gridSize,
      };
      return { snapResult: { point: snapped, mode: 'grid' as const }, pen };
    }

    // Pen pressure modulates snap search radius:
    // light touch (low pressure) → wider area (forgiving), firm press → tighter (precise).
    const snapRadius = pen.pointerType === 'pen'
      ? Math.max(20, Math.round(70 * (1 - pen.pressure * 0.65)))
      : 50;

    const nearby = project.entityRegistry.getInBoundingBox({
      minX: worldPt.x - snapRadius, minY: worldPt.y - snapRadius,
      maxX: worldPt.x + snapRadius, maxY: worldPt.y + snapRadius,
    });
    return { snapResult: project.snapEngine.snap(worldPt, nearby, renderer.getPixelToWorld()), pen };
  }, [project, resolveWorldPoint, activeTool]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    // In 3D mode, OrbitControls handles pan/zoom — skip manual pan
    if (renderer.getViewMode() !== '3d' && mouseRef.current.isPanning) {
      const dx = e.clientX - mouseRef.current.lastX;
      const dy = e.clientY - mouseRef.current.lastY;
      renderer.pan(dx, dy);
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
      return;
    }

    const result = getSnapPoint(e);
    if (!result) return;
    const { snapResult: snap, pen } = result;
    setCursorWorld(snap.point);
    setPenInput(pen);
    if (renderer.getViewMode() !== '3d') {
      renderer.showSnapMarker(snap.mode !== 'nearest' ? snap.point : null);
    }

    const tool = tools[activeTool];
    tool.onPointerMove(snap.point, { project, snapResult: snap, pen });
    renderer.setPreview(tool.getPreview());
    setDimLabels(tool.getDimensionLabels?.() ?? []);
  }, [activeTool, project, getSnapPoint]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const renderer = rendererRef.current;
    if (!renderer) return;

    const is3d = renderer.getViewMode() === '3d';

    // 2D pan with middle/right click
    if (!is3d && (e.button === 1 || e.button === 2)) {
      mouseRef.current.isPanning = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
      return;
    }

    // In 3D mode, right/middle click is handled by OrbitControls
    if (is3d && e.button !== 0) return;

    mouseRef.current.isDown = true;
    const result = getSnapPoint(e);
    if (!result) return;
    const { snapResult: snap, pen } = result;
    setPenInput(pen);

    if (activeTool === 'select') {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const picked = is3d
        ? renderer.pickEntity3d(sx, sy)
        : renderer.pickEntity(sx, sy);
      if (picked) {
        project.selectionManager.select(picked, e.shiftKey);
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        renderer.syncAll();
        return;
      }
    }

    const tool = tools[activeTool];
    tool.onPointerDown(snap.point, { project, snapResult: snap, pen });
    renderer.setPreview(tool.getPreview());
    renderer.syncAll();
    setDimLabels(tool.getDimensionLabels?.() ?? []);
    onLastPoint?.(snap.point);
  }, [activeTool, project, getSnapPoint, onLastPoint]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    const renderer = rendererRef.current;

    if (mouseRef.current.isPanning) {
      mouseRef.current.isPanning = false;
      return;
    }

    const result = getSnapPoint(e);
    if (!result) return;
    const { snapResult: snap, pen } = result;

    const tool = tools[activeTool];
    tool.onPointerUp(snap.point, { project, snapResult: snap, pen });
    renderer?.setPreview(tool.getPreview());
    renderer?.syncAll();
    mouseRef.current.isDown = false;
  }, [activeTool, project, getSnapPoint]);

  const handleWheel = useCallback((e: WheelEvent) => {
    const renderer = rendererRef.current;
    if (!renderer || renderer.getViewMode() === '3d') return; // OrbitControls handles 3D zoom
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    renderer.zoomAt(sx, sy, factor);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    const tool = tools[activeTool];
    const snap: SnapResult = { point: cursorWorld, mode: 'nearest' };
    tool.onKeyDown(e.key, { project, snapResult: snap, pen: DEFAULT_PEN_INPUT });
    rendererRef.current?.setPreview(tool.getPreview());
    rendererRef.current?.syncAll();

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); project.undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); project.redo(); }

    if (e.key === ':') window.dispatchEvent(new Event('cad:focus-cmdline'));
  }, [activeTool, project, cursorWorld]);

  const is3d = viewMode === '3d';
  const cursor = is3d ? 'default' : activeTool === 'select' ? 'default' : 'crosshair';

  return (
    <Box
      sx={{ width: '100%', height: '100%', position: 'relative', outline: 'none' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor, touchAction: 'none' }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setPenInput(null)}
        onContextMenu={e => e.preventDefault()}
      />
      {!is3d && (
        <GripOverlay
          project={project}
          renderer={rendererRef.current}
          version={version}
          visible={activeTool === 'select'}
        />
      )}
      {!is3d && rendererRef.current && <ScaleBar renderer={rendererRef.current} />}
      {!is3d && rendererRef.current && dimLabels.length > 0 && (
        <DimensionOverlay
          labels={dimLabels}
          renderer={rendererRef.current}
          onCommit={() => {
            const renderer = rendererRef.current;
            const tool = tools[activeTool];
            if (!renderer) return;
            renderer.setPreview(tool.getPreview());
            renderer.syncAll();
            setDimLabels(tool.getDimensionLabels?.() ?? []);
          }}
        />
      )}
      {/* Pen / stylus indicator — visible only for pen/touch input */}
      {penInput && penInput.pointerType !== 'mouse' && (
        <Box sx={{
          position: 'absolute', top: 8, right: 8,
          bgcolor: 'rgba(0,0,0,0.72)', color: '#ccc',
          px: 1, py: 0.5, borderRadius: 1, fontSize: 11,
          fontFamily: 'monospace', pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', gap: '3px',
          minWidth: 110,
        }}>
          {/* Device type + pressure bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ color: '#4fc3f7' }}>{penInput.pointerType === 'pen' ? '✒' : '☞'}</span>
            <Box sx={{
              flex: 1, height: 5,
              bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden',
            }}>
              <Box sx={{
                width: `${penInput.pressure * 100}%`, height: '100%',
                bgcolor: penInput.pressure > 0.7 ? '#4fc3f7' : penInput.pressure > 0.35 ? '#81d4fa' : '#b3e5fc',
                transition: 'width 0.04s linear',
              }} />
            </Box>
            <span style={{ color: '#aaa', minWidth: 28, textAlign: 'right' }}>
              {(penInput.pressure * 100).toFixed(0)}%
            </span>
          </Box>
          {/* Tilt + twist */}
          {penInput.pointerType === 'pen' && (
            <Box sx={{ color: '#888', fontSize: 10, letterSpacing: '0.02em' }}>
              {`X:${penInput.tiltX >= 0 ? '+' : ''}${penInput.tiltX.toFixed(0)}°`}
              {`  Y:${penInput.tiltY >= 0 ? '+' : ''}${penInput.tiltY.toFixed(0)}°`}
              {penInput.twist !== 0 && `  ⟳${penInput.twist.toFixed(0)}°`}
            </Box>
          )}
        </Box>
      )}
      {/* Cursor coordinates overlay */}
      <Box sx={{
        position: 'absolute', bottom: 8, right: 8,
        bgcolor: 'rgba(0,0,0,0.6)', color: '#aaa',
        px: 1, py: 0.25, borderRadius: 1, fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none',
      }}>
        {cursorWorld.x.toFixed(2)}, {cursorWorld.y.toFixed(2)}
        {is3d && <span style={{ marginLeft: 8, color: '#4fc3f7' }}>3D</span>}
      </Box>
    </Box>
  );
}
