import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Project } from '@mhersztowski/core-cad';
import type { CadRenderer } from '../renderer/CadRenderer';

type GripHandle = {
  entityId: string;
  key: string;
  wx: number;
  wy: number;
};

function getHandles(project: Project): GripHandle[] {
  const handles: GripHandle[] = [];
  for (const id of project.selectionManager.getSelected()) {
    const e = project.entityRegistry.get(id);
    if (!e) continue;
    const layer = project.layerSystem.get(e.layerId);
    if (!layer?.visible) continue;
    switch (e.type) {
      case 'line':
        handles.push({ entityId: id, key: 'p1', wx: e.x1, wy: e.y1 });
        handles.push({ entityId: id, key: 'p2', wx: e.x2, wy: e.y2 });
        break;
      case 'rect':
        handles.push({ entityId: id, key: 'tl', wx: e.x,            wy: e.y });
        handles.push({ entityId: id, key: 'tr', wx: e.x + e.width,  wy: e.y });
        handles.push({ entityId: id, key: 'br', wx: e.x + e.width,  wy: e.y + e.height });
        handles.push({ entityId: id, key: 'bl', wx: e.x,            wy: e.y + e.height });
        break;
      case 'circle':
        handles.push({ entityId: id, key: 'c',  wx: e.cx,              wy: e.cy });
        handles.push({ entityId: id, key: 'r0', wx: e.cx + e.radius,   wy: e.cy });
        handles.push({ entityId: id, key: 'r1', wx: e.cx - e.radius,   wy: e.cy });
        handles.push({ entityId: id, key: 'r2', wx: e.cx,              wy: e.cy + e.radius });
        handles.push({ entityId: id, key: 'r3', wx: e.cx,              wy: e.cy - e.radius });
        break;
      case 'arc':
        handles.push({ entityId: id, key: 'c',     wx: e.cx, wy: e.cy });
        handles.push({ entityId: id, key: 'start',  wx: e.cx + e.radius * Math.cos(e.startAngle), wy: e.cy + e.radius * Math.sin(e.startAngle) });
        handles.push({ entityId: id, key: 'end',    wx: e.cx + e.radius * Math.cos(e.endAngle),   wy: e.cy + e.radius * Math.sin(e.endAngle) });
        break;
      case 'polyline':
        e.points.forEach((p: { x: number; y: number }, i: number) => {
          handles.push({ entityId: id, key: `p${i}`, wx: p.x, wy: p.y });
        });
        break;
    }
  }
  return handles;
}

function applyDrag(project: Project, entityId: string, key: string, wx: number, wy: number) {
  const e = project.entityRegistry.get(entityId);
  if (!e) return;
  let changes: Record<string, unknown> = {};
  switch (e.type) {
    case 'line':
      if (key === 'p1') changes = { x1: wx, y1: wy };
      if (key === 'p2') changes = { x2: wx, y2: wy };
      break;
    case 'rect': {
      const r = e.x + e.width, b = e.y + e.height;
      if (key === 'tl') changes = { x: wx, y: wy, width: r - wx,      height: b - wy };
      if (key === 'tr') changes = { y: wy,         width: wx - e.x,   height: b - wy };
      if (key === 'br') changes = {                width: wx - e.x,   height: wy - e.y };
      if (key === 'bl') changes = { x: wx,         width: r - wx,     height: wy - e.y };
      break;
    }
    case 'circle':
      if (key === 'c') {
        changes = { cx: wx, cy: wy };
      } else {
        const dx = wx - e.cx, dy = wy - e.cy;
        changes = { radius: Math.max(1, Math.sqrt(dx * dx + dy * dy)) };
      }
      break;
    case 'arc':
      if (key === 'c') {
        changes = { cx: wx, cy: wy };
      } else {
        const dx = wx - e.cx, dy = wy - e.cy;
        const angle = Math.atan2(dy, dx);
        const r = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        if (key === 'start') changes = { startAngle: angle, radius: r };
        if (key === 'end')   changes = { endAngle: angle };
      }
      break;
    case 'polyline': {
      const idx = parseInt(key.slice(1));
      const pts = [...e.points];
      pts[idx] = { x: wx, y: wy };
      changes = { points: pts };
      break;
    }
  }
  if (Object.keys(changes).length) {
    project.entityRegistry.update(entityId, changes);
    project.eventBus.emit('entity:updated', project.entityRegistry.get(entityId)!);
  }
}

interface Props {
  project: Project;
  renderer: CadRenderer | null;
  version: number;
  visible: boolean;
}

const HANDLE_SIZE = 9;

export function GripOverlay({ project, renderer, version: _version, visible }: Props) {
  const [, forceUpdate] = useState(0);
  const dragRef = useRef<{
    entityId: string;
    key: string;
    origEntity: unknown;
  } | null>(null);

  // Re-render when view changes (pan/zoom)
  useEffect(() => {
    if (!renderer) return;
    const prev = renderer.onViewChange;
    renderer.onViewChange = () => { prev?.(); forceUpdate(v => v + 1); };
    return () => { renderer.onViewChange = prev; };
  }, [renderer]);

  const handlePointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    entityId: string,
    key: string,
  ) => {
    if (!renderer) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      entityId,
      key,
      origEntity: { ...project.entityRegistry.get(entityId) },
    };
  }, [renderer, project]);

  const handlePointerMove = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragRef.current || !renderer) return;
    e.stopPropagation();
    const rect = renderer.getCanvasRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: wx, y: wy } = renderer.screenToWorld(sx, sy);
    applyDrag(project, dragRef.current.entityId, dragRef.current.key, wx, wy);
    renderer.syncAll();
    forceUpdate(v => v + 1);
  }, [renderer, project]);

  const handlePointerUp = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragRef.current || !renderer) return;
    e.stopPropagation();
    const { entityId, origEntity } = dragRef.current;
    const finalEntity = { ...project.entityRegistry.get(entityId) };
    // Push single history entry for the whole drag
    project.historyManager.push({
      type: 'update',
      description: 'Grip edit',
      undo: () => {
        project.entityRegistry.update(entityId, origEntity as Record<string, unknown>);
        project.eventBus.emit('entity:updated', project.entityRegistry.get(entityId)!);
        renderer.syncAll();
      },
      redo: () => {
        project.entityRegistry.update(entityId, finalEntity as Record<string, unknown>);
        project.eventBus.emit('entity:updated', project.entityRegistry.get(entityId)!);
        renderer.syncAll();
      },
    });
    project.eventBus.emit('history:changed', undefined as never);
    dragRef.current = null;
  }, [renderer, project]);

  if (!visible || !renderer) return null;

  const handles = getHandles(project);
  if (handles.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {handles.map(h => {
        const { x: sx, y: sy } = renderer.worldToScreen(h.wx, h.wy);
        return (
          <div
            key={`${h.entityId}-${h.key}`}
            onPointerDown={e => handlePointerDown(e, h.entityId, h.key)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: 'absolute',
              left: sx - HANDLE_SIZE / 2,
              top:  sy - HANDLE_SIZE / 2,
              width:  HANDLE_SIZE,
              height: HANDLE_SIZE,
              background: '#1e1e1e',
              border: '1.5px solid #4fc3f7',
              boxSizing: 'border-box',
              cursor: 'grab',
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
          />
        );
      })}
    </div>
  );
}
