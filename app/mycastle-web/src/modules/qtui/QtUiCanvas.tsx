// QtUiCanvas — a drag-and-drop visual designer for a QtUiScene, rendering
// MinisQt-style representations of the widgets onto an HTML <canvas>.
//
//   • Drag a widget type from the palette and drop it into any container.
//   • Click a widget to select it (syncs with the tree + property panel).
//   • Drag an existing widget to reorder it (layout containers) or reposition
//     it (absolute-geometry containers).
//
// Pixel-faithful preview still comes from "Build & Run (WASM)"; this canvas is
// the interactive design surface.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import {
  drawScene, hitTest, hitContainer, dropIndex, hitHandle, resizeGeom, drawHandles,
  type LaidOut, type HandleId, type Rect,
} from './qtCanvasRenderer';
import { insertChild, moveNode, findParent, findNode, patchNode } from './qtTree';
import { ADDABLE_WIDGETS, makeNode, type QtUiScene, type QtWidgetClass } from './QtUiTypes';

const DND_TYPE = 'application/qtui-widget';

interface Props {
  scene: QtUiScene;
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (scene: QtUiScene) => void;
}

interface DragState {
  id: string;
  mode: 'absolute' | 'reorder' | 'resize';
  handle?: HandleId;                     // for resize mode
  startX: number; startY: number;       // scene coords at mousedown
  origGeom: [number, number, number, number]; // for absolute / resize mode
  moved: boolean;
}

const HANDLE_PX = 8;   // on-screen handle size

export function QtUiCanvas({ scene, selectedId, onSelect, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const laidRef = useRef<LaidOut[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const [scale, setScale] = useState(1);
  const [dropHint, setDropHint] = useState<string | null>(null);

  // Fit the scene into the available area (clamped).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const recompute = () => {
      const aw = el.clientWidth - 24, ah = el.clientHeight - 24;
      if (aw <= 0 || ah <= 0) return;
      setScale(Math.max(0.5, Math.min(aw / scene.width, ah / scene.height, 2)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scene.width, scene.height]);

  // Is the selected widget absolutely positioned (parent has no layout)? Only
  // then do x/y/w/h and resize handles apply.
  const selParent = findParent(scene.root, selectedId);
  const selAbsolute = selectedId !== scene.root.id && (!selParent?.layout || selParent.layout === 'none');

  // Redraw whenever the scene, selection or scale change.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const laid = drawScene(ctx, scene, selectedId);
    laidRef.current = laid;
    if (selAbsolute) {
      const sel = laid.find((l) => l.node.id === selectedId);
      if (sel) drawHandles(ctx, sel.rect, HANDLE_PX / scale);
    }
  }, [scene, selectedId, scale, selAbsolute]);

  const toScene = useCallback((clientX: number, clientY: number) => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }, [scale]);

  // ── Pointer: select + drag existing widgets ────────────────────────────────
  const parentOrigin = (id: string | undefined): Rect =>
    (id && laidRef.current.find((l) => l.node.id === id)?.rect) || { x: 0, y: 0, w: 0, h: 0 };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toScene(e.clientX, e.clientY);

    // 1) Resize handle of the already-selected, absolutely-positioned widget.
    if (selAbsolute) {
      const sel = laidRef.current.find((l) => l.node.id === selectedId);
      if (sel) {
        const h = hitHandle(sel.rect, x, y, (HANDLE_PX / scale) / 2 + 2 / scale);
        if (h) {
          const node = findNode(scene.root, selectedId);
          const po = parentOrigin(selParent?.id);
          const g = node?.geometry ?? [sel.rect.x - po.x, sel.rect.y - po.y, sel.rect.w, sel.rect.h];
          dragRef.current = { id: selectedId, mode: 'resize', handle: h, startX: x, startY: y, origGeom: g as [number, number, number, number], moved: false };
          canvasRef.current?.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    const hit = hitTest(laidRef.current, x, y);
    if (!hit) { onSelect(scene.root.id); return; }
    onSelect(hit.node.id);
    if (hit.node.id === scene.root.id) return;   // can't drag the root
    const parent = findParent(scene.root, hit.node.id);
    const absolute = !parent?.layout || parent.layout === 'none';
    const g = hit.node.geometry ?? [
      hit.rect.x - (laidRef.current.find((l) => l.node.id === parent?.id)?.rect.x ?? 0),
      hit.rect.y - (laidRef.current.find((l) => l.node.id === parent?.id)?.rect.y ?? 0),
      hit.rect.w, hit.rect.h,
    ];
    dragRef.current = { id: hit.node.id, mode: absolute ? 'absolute' : 'reorder', startX: x, startY: y, origGeom: g, moved: false };
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const { x, y } = toScene(e.clientX, e.clientY);
    if (!drag) return;
    const dx = x - drag.startX, dy = y - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    if (drag.mode === 'resize' && drag.handle) {
      const ng = resizeGeom(drag.origGeom, drag.handle, dx, dy);
      onChange({ ...scene, root: patchNode(scene.root, drag.id, { geometry: ng }) });
    } else if (drag.mode === 'absolute') {
      const [, , w, h] = drag.origGeom;
      const ng: [number, number, number, number] = [Math.round(drag.origGeom[0] + dx), Math.round(drag.origGeom[1] + dy), w, h];
      onChange({ ...scene, root: patchNode(scene.root, drag.id, { geometry: ng }) });
    } else {
      const tgt = hitContainer(laidRef.current, x, y, drag.id);
      setDropHint(tgt?.node.id ?? null);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDropHint(null);
    if (!drag || !drag.moved || drag.mode !== 'reorder') return;
    const { x, y } = toScene(e.clientX, e.clientY);
    const tgt = hitContainer(laidRef.current, x, y, drag.id);
    const container = tgt?.node ?? scene.root;
    const idx = dropIndex(laidRef.current, container, x, y);
    onChange({ ...scene, root: moveNode(scene.root, drag.id, container.id, idx) });
  };

  // ── Palette drop: add a new widget ─────────────────────────────────────────
  const onDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setDropHint(null);
    const cls = e.dataTransfer.getData(DND_TYPE) as QtWidgetClass;
    if (!cls) return;
    const { x, y } = toScene(e.clientX, e.clientY);
    const tgt = hitContainer(laidRef.current, x, y);
    const container = tgt?.node ?? scene.root;
    const node = makeNode(cls);
    // Absolute container: drop where the cursor is.
    if (!container.layout || container.layout === 'none') {
      const base = tgt?.rect ?? { x: 0, y: 0, w: scene.width, h: scene.height };
      node.geometry = [Math.round(x - base.x), Math.round(y - base.y), cls === 'QWidget' ? 120 : 120, cls === 'QSlider' ? 24 : 28];
    }
    const idx = dropIndex(laidRef.current, container, x, y);
    onChange({ ...scene, root: insertChild(scene.root, container.id, node, idx) });
    onSelect(node.id);
  };

  const onDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (e.dataTransfer.types.includes(DND_TYPE)) {
      e.preventDefault();
      const { x, y } = toScene(e.clientX, e.clientY);
      const tgt = hitContainer(laidRef.current, x, y);
      setDropHint(tgt?.node.id ?? scene.root.id);
    }
  };

  const dropName = dropHint ? findNode(scene.root, dropHint)?.id : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Palette */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.25 }}>
          Drag onto the canvas:
        </Typography>
        {ADDABLE_WIDGETS.map((w) => (
          <Chip
            key={w.class}
            label={w.label}
            size="small"
            variant="outlined"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(DND_TYPE, w.class); e.dataTransfer.effectAllowed = 'copy'; }}
            sx={{ cursor: 'grab' }}
          />
        ))}
      </Box>

      {/* Canvas viewport */}
      <Box ref={wrapRef} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', bgcolor: 'action.hover', p: 1.5, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={scene.width}
          height={scene.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDropHint(null)}
          style={{
            width: scene.width * scale,
            height: scene.height * scale,
            boxShadow: '0 0 0 1px rgba(255,255,255,0.15)',
            imageRendering: 'pixelated',
            touchAction: 'none',
            cursor: 'pointer',
          }}
        />
        {dropName && (
          <Typography variant="caption" sx={{ position: 'absolute', top: 4, left: 8, color: 'primary.main' }}>
            → {dropName}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default QtUiCanvas;
