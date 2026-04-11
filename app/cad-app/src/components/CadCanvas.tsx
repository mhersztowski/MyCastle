import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { Project, SnapResult } from '@mhersztowski/core-cad';
import { CadRenderer } from '../renderer/CadRenderer';
import { SelectTool } from '../tools/SelectTool';
import { LineTool } from '../tools/LineTool';
import { CircleTool } from '../tools/CircleTool';
import { RectTool } from '../tools/RectTool';
import { PolylineTool } from '../tools/PolylineTool';
import type { Tool, ToolName } from '../tools/types';

interface Props {
  project: Project;
  activeTool: ToolName;
  version: number;
}

const tools: Record<ToolName, Tool> = {
  select: new SelectTool(),
  line: new LineTool(),
  circle: new CircleTool(),
  rect: new RectTool(),
  polyline: new PolylineTool(),
};

export function CadCanvas({ project, activeTool, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);
  const prevToolRef = useRef<ToolName>(activeTool);
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });

  // Mouse state for pan
  const mouseRef = useRef({ isPanning: false, lastX: 0, lastY: 0, isDown: false });

  // Init renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CadRenderer(canvas, project);
    rendererRef.current = renderer;
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

  // Sync renderer when project changes
  useEffect(() => {
    rendererRef.current?.syncAll();
  }, [version]);

  // Reset previous tool when tool changes
  useEffect(() => {
    if (prevToolRef.current !== activeTool) {
      tools[prevToolRef.current].reset();
      prevToolRef.current = activeTool;
    }
  }, [activeTool]);

  const getSnapPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return null;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = renderer.screenToWorld(sx, sy);
    const nearby = project.entityRegistry.getInBoundingBox({
      minX: worldPt.x - 50, minY: worldPt.y - 50,
      maxX: worldPt.x + 50, maxY: worldPt.y + 50,
    });
    return project.snapEngine.snap(worldPt, nearby, renderer.getPixelToWorld());
  }, [project]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    // Pan with middle button or right button
    if (mouseRef.current.isPanning) {
      const dx = e.clientX - mouseRef.current.lastX;
      const dy = e.clientY - mouseRef.current.lastY;
      renderer.pan(dx, dy);
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
      return;
    }

    const snap = getSnapPoint(e);
    if (!snap) return;
    setCursorWorld(snap.point);
    renderer.showSnapMarker(snap.mode !== 'nearest' ? snap.point : null);

    const tool = tools[activeTool];
    tool.onPointerMove(snap.point, { project, snapResult: snap });
    renderer.setPreview(tool.getPreview());
  }, [activeTool, project, getSnapPoint]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const renderer = rendererRef.current;
    if (!renderer) return;

    // Middle mouse = pan
    if (e.button === 1 || (e.button === 2)) {
      mouseRef.current.isPanning = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
      return;
    }

    mouseRef.current.isDown = true;
    const snap = getSnapPoint(e);
    if (!snap) return;

    const tool = tools[activeTool];

    if (activeTool === 'select') {
      // Check if clicking on an entity
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const picked = renderer.pickEntity(sx, sy);
      if (picked) {
        project.selectionManager.select(picked, e.shiftKey);
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        renderer.syncAll();
        return;
      }
    }

    tool.onPointerDown(snap.point, { project, snapResult: snap });
    renderer.setPreview(tool.getPreview());
    renderer.syncAll();
  }, [activeTool, project, getSnapPoint]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);

    if (mouseRef.current.isPanning) {
      mouseRef.current.isPanning = false;
      return;
    }

    const snap = getSnapPoint(e);
    if (!snap) return;

    const tool = tools[activeTool];
    tool.onPointerUp(snap.point, { project, snapResult: snap });
    rendererRef.current?.setPreview(tool.getPreview());
    rendererRef.current?.syncAll();
    mouseRef.current.isDown = false;
  }, [activeTool, project, getSnapPoint]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const renderer = rendererRef.current;
    if (!renderer) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    renderer.zoomAt(sx, sy, factor);
  }, []);

  // Attach wheel listener (non-passive for preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tool = tools[activeTool];
    const snap: SnapResult = { point: cursorWorld, mode: 'nearest' };
    tool.onKeyDown(e.key, { project, snapResult: snap });
    rendererRef.current?.setPreview(tool.getPreview());
    rendererRef.current?.syncAll();

    // Global shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); project.undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); project.redo(); }
  }, [activeTool, project, cursorWorld]);

  const cursor = activeTool === 'select' ? 'default' : 'crosshair';

  return (
    <Box
      sx={{ width: '100%', height: '100%', position: 'relative', outline: 'none' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onContextMenu={e => e.preventDefault()}
      />
      {/* Cursor coordinates overlay */}
      <Box sx={{
        position: 'absolute', bottom: 8, right: 8,
        bgcolor: 'rgba(0,0,0,0.6)', color: '#aaa',
        px: 1, py: 0.25, borderRadius: 1, fontSize: 12, fontFamily: 'monospace', pointerEvents: 'none',
      }}>
        {cursorWorld.x.toFixed(2)}, {cursorWorld.y.toFixed(2)}
      </Box>
    </Box>
  );
}
