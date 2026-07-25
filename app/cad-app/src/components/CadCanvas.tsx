import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box } from '@mui/material';
import type { Entity, Point2D, Project, ProjectData, SnapResult } from '@mhersztowski/core-cad';
import type { ViewMode } from '@mhersztowski/core-cad';
import { CadRenderer } from '../renderer/CadRenderer';
import { buildEntityObject } from '../renderer/EntityMeshBuilder';
import { shiftEntity, computeEntitiesCentroid } from '../io/CadExporter';
import { translateEntity } from '../tools/entityTransform';
import { pickSub, subElementsInRect } from '../tools/sketchPick';
import { DimensionOverlay } from './DimensionOverlay';
import { GripOverlay } from './GripOverlay';
import { ConstraintSymbolsOverlay, type SketchConstraintLite } from './ConstraintSymbolsOverlay';
import { ScaleBar } from './ScaleBar';
import { SelectTool } from '../tools/SelectTool';
import { LineTool } from '../tools/LineTool';
import { CircleTool } from '../tools/CircleTool';
import { Circle3PointTool } from '../tools/Circle3PointTool';
import { PointTool } from '../tools/PointTool';
import { ArcTool } from '../tools/ArcTool';
import { Arc3PointTool } from '../tools/Arc3PointTool';
import { RectTool } from '../tools/RectTool';
import { RectCenterTool } from '../tools/RectCenterTool';
import { polygonTool } from '../tools/PolygonTool';
import { SlotTool } from '../tools/SlotTool';
import { ArcSlotTool } from '../tools/ArcSlotTool';
import { bsplineTool } from '../tools/BSplineTool';
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
import type { DimensionLabel, PenInput, PreviewGeometry, Tool, ToolName } from '../tools/types';
import { DEFAULT_PEN_INPUT } from '../tools/types';
import type { ActiveTemplate } from './RepositoryPanel';

interface Props {
  project: Project;
  activeTool: ToolName;
  version: number;
  viewMode: ViewMode;
  injectedPoint?: Point2D | null;
  injectedAngle?: number | null;
  onLastPoint?: (p: Point2D) => void;
  /** Armed template for serial stamp-placement at cursor position. */
  placementTemplate?: ActiveTemplate | null;
  /** Called when Esc is pressed while placement is active. */
  onCancelPlacement?: () => void;
  /** Motyw kanwy — 'light' daje białe tło + jasną siatkę (np. edytor szkicu CAD NEW). */
  theme?: 'light' | 'dark';
  /** Tryb sub-selekcji (szkic): klik zaznacza wierzchołki/krawędzie do constraintów. */
  subSelect?: boolean;
  /** Callback z aktualnymi refami zaznaczonych pod-elementów (format solvera). */
  onSubSelect?: (refs: string[]) => void;
  /** Zmiana tej wartości czyści sub-selekcję (np. po zastosowaniu constraintu). */
  subSelectClear?: number;
  /** Czysty klik na wymiar (select) → otwórz dialog wartości. Wykrywane na pointerup z tolerancją. */
  onDimensionClick?: (id: string) => void;
  /** Constrainty szkicu — renderowane jako symbole na canvasie przy elementach. */
  constraints?: SketchConstraintLite[];
}

/** Odległość punktu do linii wymiarowej (na offsecie) — do wykrywania kliknięcia wymiaru. */
function dimensionPickDistance(dim: { x1: number; y1: number; x2: number; y2: number; offset: number }, p: Point2D): number {
  const dx = dim.x2 - dim.x1, dy = dim.y2 - dim.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * dim.offset, ny = (dx / len) * dim.offset;
  const a = { x: dim.x1 + nx, y: dim.y1 + ny }, b = { x: dim.x2 + nx, y: dim.y2 + ny };
  const ex = b.x - a.x, ey = b.y - a.y;
  const l2 = ex * ex + ey * ey;
  let t = l2 < 1e-9 ? 0 : ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * ex), p.y - (a.y + t * ey));
}

interface PlacementData {
  entities: Entity[];
  centroid: { x: number; y: number };
  layers: ProjectData['layers'];
}

const filletTool = new FilletTool();

const tools: Record<ToolName, Tool> = {
  select: new SelectTool(),
  line: new LineTool(),
  circle: new CircleTool(),
  circle3p: new Circle3PointTool(),
  point: new PointTool(),
  arc: new ArcTool(),
  arc3p: new Arc3PointTool(),
  rect: new RectTool(),
  rectCenter: new RectCenterTool(),
  polygon: polygonTool,
  slot: new SlotTool(),
  arcSlot: new ArcSlotTool(),
  bspline: bsplineTool,
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

export function CadCanvas({ project, activeTool, version, viewMode, injectedPoint, injectedAngle, onLastPoint, placementTemplate, onCancelPlacement, theme, subSelect, onSubSelect, subSelectClear, onDimensionClick, constraints }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);
  const prevToolRef = useRef<ToolName>(activeTool);
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0 });
  const [cursorActive, setCursorActive] = useState(false); // kursor nad kanwą (do krzyżyka)
  const [previewGeom, setPreviewGeom] = useState<PreviewGeometry | null>(null); // podgląd rysowanego kształtu (kropki wierzchołków)
  const placementDataRef = useRef<PlacementData | null>(null);

  const mouseRef = useRef({ isPanning: false, lastX: 0, lastY: 0, isDown: false });
  // Przeciąganie zaznaczonych encji w trybie select (klik+drag na krawędzi/ciele).
  const selectDragRef = useRef<{ base: Point2D; orig: Map<string, Entity>; moved: boolean } | null>(null);
  // Sub-selekcja (szkic): wybrane pod-elementy do constraintów.
  const subSelRef = useRef<Array<{ ref: string; segs: Array<{ a: Point2D; b: Point2D }>; vertex?: Point2D }>>([]);
  // Rysuje podświetlenie sub-selekcji (wybrane + opcjonalny hover) na osobnej warstwie renderera.
  const renderSubHighlight = (hover?: { segs: Array<{ a: Point2D; b: Point2D }>; vertex?: Point2D } | null) => {
    const r = rendererRef.current;
    if (!r) return;
    const items = hover ? [...subSelRef.current, hover] : subSelRef.current;
    const segs = items.flatMap(s => s.segs);
    const verts = items.map(s => s.vertex).filter((v): v is Point2D => !!v);
    if (segs.length || verts.length) r.setHighlight(segs, verts);
    else r.clearHighlight();
  };
  // Początek kliknięcia (select) — do rozróżnienia kliknięcia od przeciągnięcia (dialog wymiaru).
  const clickStartRef = useRef<Point2D | null>(null);
  // Zaznaczanie ramką (box select) w trybie sub-selekcji.
  const boxSelRef = useRef<{ start: Point2D } | null>(null);
  const [dimLabels, setDimLabels] = useState<DimensionLabel[]>([]);
  const [penInput, setPenInput] = useState<PenInput | null>(null);
  const [zoomTick, setZoomTick] = useState(0); // bumps on zoom so dimension labels re-project


  // Init renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CadRenderer(canvas, project, { theme });
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

  // Placement template: fetch entities, build ghost objects
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (!placementTemplate || (placementTemplate.mode !== 'cad' && placementTemplate.mode !== 'electronics')) {
      renderer.clearPlacement();
      placementDataRef.current = null;
      return;
    }
    const fileUrl = placementTemplate.cadFile;
    if (!fileUrl) return;
    const url = fileUrl.startsWith('http') ? fileUrl : `${placementTemplate.rawBase.replace(/\/$/, '')}/${fileUrl}`;
    fetch(url)
      .then(r => r.json())
      .then((data: ProjectData) => {
        const entities = data.entities ?? [];
        const centroid = computeEntitiesCentroid(entities);
        placementDataRef.current = { entities, centroid, layers: data.layers };
        // Build ghost THREE objects
        const objs = entities.map(entity => {
          const obj = buildEntityObject(entity, undefined, false);
          obj.traverse(o => {
            const mat = (o as THREE.Line).material as THREE.LineBasicMaterial | undefined;
            if (mat) {
              mat.transparent = true;
              mat.opacity = 0.45;
              mat.color.setHex(0x66aaff);
              mat.needsUpdate = true;
            }
          });
          return obj;
        });
        rendererRef.current?.setPlacementObjects(objs, centroid.x, centroid.y);
      })
      .catch(console.error);

    return () => {
      rendererRef.current?.clearPlacement();
      placementDataRef.current = null;
    };
  }, [placementTemplate]);

  // Zewnętrzne wyczyszczenie sub-selekcji (np. po zastosowaniu constraintu).
  useEffect(() => {
    if (subSelectClear === undefined) return;
    subSelRef.current = [];
    rendererRef.current?.clearHighlight();
    rendererRef.current?.syncAll();
  }, [subSelectClear]);

  // Usunięcie encji (np. Delete) → od razu odśwież widok: skasuj podświetlenie usuniętych
  // pod-elementów i przebuduj meshe (bez tego trzeba było kliknąć, by zniknęły).
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bus = (project as any).eventBus;
    if (!bus?.on) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onRemoved = (payload: any) => {
      const id = typeof payload === 'string' ? payload : payload?.id;
      if (id) {
        const before = subSelRef.current.length;
        subSelRef.current = subSelRef.current.filter(s => s.ref.split('.')[0] !== id);
        if (subSelRef.current.length !== before) onSubSelect?.(subSelRef.current.map(s => s.ref));
      }
      renderSubHighlight();
      rendererRef.current?.syncAll();
    };
    const unsub = bus.on('entity:removed', onRemoved);
    return () => { if (typeof unsub === 'function') unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, onSubSelect]);

  // Reset previous tool when tool changes
  useEffect(() => {
    if (prevToolRef.current !== activeTool) {
      tools[prevToolRef.current].reset();
      prevToolRef.current = activeTool;
      setDimLabels([]);
      setPreviewGeom(null);
      subSelRef.current = [];          // wyczyść sub-selekcję przy zmianie narzędzia
      onSubSelect?.([]);
      rendererRef.current?.clearHighlight();
      rendererRef.current?.setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Przeciąganie zaznaczonych encji w trybie select — przesuwa całe zaznaczenie za kursorem.
    if (selectDragRef.current && mouseRef.current.isDown) {
      const d = selectDragRef.current;
      const dx = snap.point.x - d.base.x, dy = snap.point.y - d.base.y;
      if (!d.moved && Math.hypot(dx, dy) < (renderer.getPixelToWorld?.() ?? 1) * 3) return; // próg
      d.moved = true;
      for (const [id, orig] of d.orig) {
        project.entityRegistry.update(id, translateEntity(orig, dx, dy));
        const ent = project.entityRegistry.get(id);
        if (ent) project.eventBus.emit('entity:updated', ent); // → odświeża powiązane wymiary
      }
      renderer.syncAll();
      return;
    }

    if (renderer.getViewMode() !== '3d') {
      renderer.showSnapMarker(snap.mode !== 'nearest' ? snap.point : null);
    }

    // Zaznaczanie ramką — rysuj prostokąt.
    if (boxSelRef.current && mouseRef.current.isDown) {
      renderer.setPreview({ type: 'rect', points: [boxSelRef.current.start, snap.point] });
      return;
    }

    // Sub-selekcja (szkic): podświetl najbliższy pod-element + utrzymaj podświetlenie wybranych.
    if (activeTool === 'select' && subSelect && renderer.getViewMode() !== '3d') {
      // Trafianie liczymy na SUROWYM kursorze (nie na snap.point) — snap robi fallback
      // na grid, przez co punkt przeskakuje o ~pół komórki i przy części zoomów
      // wypada poza tolerancję. Raw + próg 12px daje selekcję niezależną od zoomu/siatki.
      const rawRect = canvasRef.current!.getBoundingClientRect();
      const raw = renderer.screenToWorld(e.clientX - rawRect.left, e.clientY - rawRect.top);
      const th = (rendererRef.current?.getPixelToWorld() ?? 1) * 12;
      const hit = pickSub(raw, project.entityRegistry.getAll(), th);
      renderSubHighlight(hit ? { segs: hit.segs, vertex: hit.vertex } : null);
      return;
    }

    // Move placement ghost if armed
    if (placementTemplate && placementDataRef.current) {
      renderer.movePlacement(snap.point.x, snap.point.y);
    }

    setCursorActive(true);
    const tool = tools[activeTool];
    tool.onPointerMove(snap.point, { project, snapResult: snap, pen, pixelToWorld: rendererRef.current?.getPixelToWorld() ?? 1 });
    const prev = tool.getPreview();
    renderer.setPreview(prev);
    setPreviewGeom(prev);
    setDimLabels(tool.getDimensionLabels?.() ?? []);
  }, [activeTool, project, getSnapPoint, placementTemplate, subSelect, onSubSelect]);

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
    clickStartRef.current = activeTool === 'select' ? snap.point : null;

    // Placement mode: stamp entities at clicked world position
    if (placementTemplate && placementDataRef.current && e.button === 0 && !is3d) {
      const pdata = placementDataRef.current;
      const dx = snap.point.x - pdata.centroid.x;
      const dy = snap.point.y - pdata.centroid.y;
      for (const layer of pdata.layers.layers) {
        if (layer.id === '0') continue;
        project.layerSystem.addWithId(layer);
      }
      for (const entity of pdata.entities) {
        const shifted = shiftEntity(entity, dx, dy);
        project.entityRegistry.addWithId({ ...shifted, id: crypto.randomUUID() });
      }
      project.eventBus.emit('project:loaded', null);
      renderer.syncAll();
      return;
    }

    // Sub-selekcja (szkic): klik zaznacza wierzchołek/krawędź do constraintów (toggle, akumuluje).
    if (activeTool === 'select' && subSelect && !is3d) {
      const rect = canvasRef.current!.getBoundingClientRect();
      // Trafianie na SUROWYM kursorze (nie snap.point) — patrz komentarz w handlePointerMove.
      const raw = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const th = (rendererRef.current?.getPixelToWorld() ?? 1) * 12;
      const hit = pickSub(raw, project.entityRegistry.getAll(), th);
      if (hit) {
        const cur = subSelRef.current;
        const i = cur.findIndex(s => s.ref === hit.ref);
        if (i >= 0) cur.splice(i, 1);                                       // ponowny klik → odznacz
        else cur.push({ ref: hit.ref, segs: hit.segs, vertex: hit.vertex }); // akumuluj
        // Przebuduj zaznaczenie encji nadrzędnych (gripy/drag) z aktualnego zestawu pod-elementów.
        project.selectionManager.clear();
        for (const id of new Set(cur.map(s => s.ref.split('.')[0]))) if (!id.startsWith('#')) project.selectionManager.select(id, true);
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        onSubSelect?.(cur.map(s => s.ref));
        renderSubHighlight();
        renderer.syncAll();
        clickStartRef.current = null; // wybór pod-elementu → nie otwieraj dialogu wymiaru na pointerup
        return;
      }
      // Brak pod-elementu: jeśli pusto → rozpocznij zaznaczanie ramką; jeśli encja (wymiar) → fall-through.
      const pickedHere = renderer.pickEntity(e.clientX - rect.left, e.clientY - rect.top);
      if (!pickedHere) {
        boxSelRef.current = { start: snap.point };
        clickStartRef.current = null;
        return;
      }
      // Encja pod kursorem (np. wymiar) → pozwól normalnej selekcji (dialog wartości).
      if (subSelRef.current.length) { subSelRef.current = []; onSubSelect?.([]); renderer.clearHighlight(); }
    }

    if (activeTool === 'select') {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const picked = is3d
        ? renderer.pickEntity3d(sx, sy)
        : renderer.pickEntity(sx, sy);
      if (picked) {
        // Klik na już zaznaczonej (bez Shift) zachowuje całe zaznaczenie do przeciągnięcia grupy.
        if (!(project.selectionManager.isSelected(picked) && !e.shiftKey)) {
          project.selectionManager.select(picked, e.shiftKey);
        }
        // Zawsze emituj — nawet gdy zaznaczenie się nie zmieniło (ponowny klik wymiaru → dialog).
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        renderer.syncAll();
        // Uzbrój przeciąganie zaznaczonych encji (2D) — przesuwanie krawędziami/ciałem.
        if (!is3d) {
          const orig = new Map<string, Entity>();
          for (const id of project.selectionManager.getSelected()) {
            const en = project.entityRegistry.get(id);
            if (en && !en.locked) orig.set(id, en);
          }
          if (orig.size) selectDragRef.current = { base: snap.point, orig, moved: false };
        }
        return;
      }
      // Klik w pustym miejscu (bez Shift) → wyczyść zaznaczenie.
      if (!e.shiftKey && project.selectionManager.count() > 0) {
        project.selectionManager.clear();
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        renderer.syncAll();
      }
    }

    const tool = tools[activeTool];
    tool.onPointerDown(snap.point, { project, snapResult: snap, pen, pixelToWorld: rendererRef.current?.getPixelToWorld() ?? 1 });
    const prev = tool.getPreview();
    renderer.setPreview(prev);
    setPreviewGeom(prev);
    renderer.syncAll();
    setDimLabels(tool.getDimensionLabels?.() ?? []);
    onLastPoint?.(snap.point);
  }, [activeTool, project, getSnapPoint, onLastPoint, placementTemplate, subSelect, onSubSelect]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    const renderer = rendererRef.current;

    if (mouseRef.current.isPanning) {
      mouseRef.current.isPanning = false;
      return;
    }

    // Zakończenie zaznaczania ramką — dodaj pod-elementy w środku (albo wyczyść, gdy to był klik).
    if (boxSelRef.current && renderer) {
      const bs = boxSelRef.current;
      boxSelRef.current = null;
      mouseRef.current.isDown = false;
      renderer.setPreview(null);
      const up = getSnapPoint(e)?.snapResult.point ?? bs.start;
      const pxw = renderer.getPixelToWorld?.() ?? 1;
      if (Math.hypot(up.x - bs.start.x, up.y - bs.start.y) < pxw * 4) {
        // Klik na pusto → wyczyść sub-selekcję.
        subSelRef.current = []; onSubSelect?.([]);
        project.selectionManager.clear();
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        renderer.clearHighlight();
      } else {
        const min = { x: Math.min(bs.start.x, up.x), y: Math.min(bs.start.y, up.y) };
        const max = { x: Math.max(bs.start.x, up.x), y: Math.max(bs.start.y, up.y) };
        const picks = subElementsInRect(project.entityRegistry.getAll(), min, max, pxw * 5);
        const cur = subSelRef.current;
        for (const p of picks) if (!cur.some(s => s.ref === p.ref)) cur.push({ ref: p.ref, segs: p.segs, vertex: p.vertex });
        project.selectionManager.clear();
        for (const id of new Set(cur.map(s => s.ref.split('.')[0]))) if (!id.startsWith('#')) project.selectionManager.select(id, true);
        project.eventBus.emit('selection:changed', project.selectionManager.getSelected());
        onSubSelect?.(cur.map(s => s.ref));
        renderSubHighlight();
      }
      renderer.syncAll();
      return;
    }

    // Czysty klik na wymiar (select) → otwórz dialog wartości. Wykrywane na pointerup (koniec gestu,
    // nie w trakcie — zapobiega miganiu na mobile) z generatywną tolerancją (łatwiej trafić palcem).
    if (activeTool === 'select' && onDimensionClick && renderer) {
      const up = getSnapPoint(e)?.snapResult.point;
      const start = clickStartRef.current;
      clickStartRef.current = null;
      const pxw = renderer.getPixelToWorld?.() ?? 1;
      const moved = !!selectDragRef.current?.moved || (!!up && !!start && Math.hypot(up.x - start.x, up.y - start.y) > pxw * 4);
      if (up && start && !moved) {
        let bestId: string | null = null, bestD = pxw * 18; // ~18 px tolerancji
        for (const dim of project.entityRegistry.getByType('dimension')) {
          const d = dimensionPickDistance(dim as unknown as { x1: number; y1: number; x2: number; y2: number; offset: number }, up);
          if (d < bestD) { bestD = d; bestId = dim.id; }
        }
        if (bestId) {
          selectDragRef.current = null;
          mouseRef.current.isDown = false;
          onDimensionClick(bestId);
          return;
        }
      }
    }

    // Zakończenie przeciągania zaznaczenia — jeden wpis historii na cały ruch.
    if (selectDragRef.current) {
      const d = selectDragRef.current;
      selectDragRef.current = null;
      mouseRef.current.isDown = false;
      if (d.moved && renderer) {
        const finals = new Map<string, Entity>();
        for (const id of d.orig.keys()) { const en = project.entityRegistry.get(id); if (en) finals.set(id, en); }
        const apply = (m: Map<string, Entity>) => {
          for (const [id, ent] of m) {
            project.entityRegistry.update(id, ent as unknown as Record<string, unknown>);
            const e2 = project.entityRegistry.get(id);
            if (e2) project.eventBus.emit('entity:updated', e2);
          }
          renderer.syncAll();
        };
        project.historyManager.push({
          type: 'update', description: 'Move (drag)',
          undo: () => apply(d.orig),
          redo: () => apply(finals),
        });
        project.eventBus.emit('history:changed', undefined as never);
      }
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
  }, [activeTool, project, getSnapPoint, onDimensionClick]);

  const handleWheel = useCallback((e: WheelEvent) => {
    const renderer = rendererRef.current;
    if (!renderer || renderer.getViewMode() === '3d') return; // OrbitControls handles 3D zoom
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    renderer.zoomAt(sx, sy, factor);
    setZoomTick(t => t + 1); // re-project dimension labels at the new zoom
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;

    if (e.key === 'Escape' && placementTemplate) {
      onCancelPlacement?.();
      return;
    }

    const tool = tools[activeTool];
    const snap: SnapResult = { point: cursorWorld, mode: 'nearest' };
    tool.onKeyDown(e.key, { project, snapResult: snap, pen: DEFAULT_PEN_INPUT });
    rendererRef.current?.setPreview(tool.getPreview());
    rendererRef.current?.syncAll();

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      project.undo();
      rendererRef.current?.syncAll();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      project.redo();
      rendererRef.current?.syncAll();
    }

    if (e.key === ':') window.dispatchEvent(new Event('cad:focus-cmdline'));
  }, [activeTool, project, cursorWorld, placementTemplate, onCancelPlacement]);

  const is3d = viewMode === '3d';
  const cursor = placementTemplate ? 'copy' : is3d ? 'default' : activeTool === 'select' ? 'default' : 'crosshair';

  // Length labels for committed dimensions — drawn as HTML so they stay crisp and
  // a constant on-screen size at any zoom. Recomputed each render (cheap); the
  // overlay re-projects on pan (cursorWorld), zoom (zoomTick) and edits (version).
  void zoomTick; void version;
  const committedDimLabels: DimensionLabel[] = is3d ? [] : project.entityRegistry.getByType('dimension')
    .map(e => e as unknown as { x1: number; y1: number; x2: number; y2: number; offset: number; visible: boolean })
    .filter(d => d.visible)
    .map(d => {
      const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
      const len = Math.hypot(dx, dy);
      const l = len || 1;
      const nx = (-dy / l) * d.offset, ny = (dx / l) * d.offset;
      return {
        worldX: (d.x1 + d.x2) / 2 + nx,
        worldY: (d.y1 + d.y2) / 2 + ny,
        text: len.toFixed(2),
        variant: 'primary' as const,
      };
    });
  const overlayLabels = [...committedDimLabels, ...dimLabels];

  // Krzyżyk kursora (przy narzędziach rysowania) + kropki wierzchołków polyline/rect. Rzutowane
  // z world→screen na żywo, więc podążają za pan/zoom przy re-renderze (cursorWorld/zoomTick).
  const rendererNow = rendererRef.current;
  const crosshair = (!is3d && rendererNow && cursorActive && activeTool !== 'select')
    ? rendererNow.worldToScreen(cursorWorld.x, cursorWorld.y) : null;
  const vertexDots: { x: number; y: number }[] = [];
  if (!is3d && rendererNow && previewGeom) {
    if (previewGeom.type === 'polyline') {
      for (const p of previewGeom.points) vertexDots.push(rendererNow.worldToScreen(p.x, p.y));
    } else if (previewGeom.type === 'rect' && previewGeom.points.length >= 2) {
      const a = previewGeom.points[0], b = previewGeom.points[1];
      for (const c of [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] as [number, number][]) {
        vertexDots.push(rendererNow.worldToScreen(c[0], c[1]));
      }
    }
  }

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
        onPointerLeave={() => { setPenInput(null); setCursorActive(false); }}
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
      {!is3d && constraints && constraints.length > 0 && (
        <ConstraintSymbolsOverlay
          constraints={constraints}
          project={project}
          renderer={rendererRef.current}
          version={version}
        />
      )}
      {!is3d && rendererRef.current && <ScaleBar renderer={rendererRef.current} />}
      {!is3d && rendererRef.current && overlayLabels.length > 0 && (
        <DimensionOverlay
          labels={overlayLabels}
          renderer={rendererRef.current}
          touchMode={penInput?.pointerType === 'touch' || penInput?.pointerType === 'pen'}
          onCommit={() => {
            const renderer = rendererRef.current;
            const tool = tools[activeTool];
            if (!renderer) return;
            renderer.setPreview(tool.getPreview());
            renderer.syncAll();
            setDimLabels(tool.getDimensionLabels?.() ?? []);
          }}
          onCommitDraft={() => {
            const renderer = rendererRef.current;
            const tool = tools[activeTool];
            if (!renderer) return;
            const ok = tool.commitDraft?.({
              project,
              snapResult: { point: { x: 0, y: 0 }, mode: 'nearest' },
              pen: penInput ?? DEFAULT_PEN_INPUT,
              pixelToWorld: renderer.getPixelToWorld() ?? 1,
            });
            if (ok) {
              renderer.setPreview(tool.getPreview());
              renderer.syncAll();
              setPreviewGeom(null);
              setDimLabels(tool.getDimensionLabels?.() ?? []);
            }
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

      {/* Krzyżyk kursora + odczyt pozycji we współrzędnych układu (przy narzędziach rysowania) */}
      {crosshair && (
        <>
          <Box sx={{ position: 'absolute', left: 0, top: crosshair.y, width: '100%', borderTop: '1px dashed rgba(120,200,255,0.4)', pointerEvents: 'none' }} />
          <Box sx={{ position: 'absolute', top: 0, left: crosshair.x, height: '100%', borderLeft: '1px dashed rgba(120,200,255,0.4)', pointerEvents: 'none' }} />
          <Box sx={{ position: 'absolute', left: crosshair.x + 12, top: crosshair.y + 10, bgcolor: 'rgba(0,0,0,0.72)', color: '#7fd1ff', fontFamily: 'monospace', fontSize: 11, px: 0.75, py: '1px', borderRadius: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            X {cursorWorld.x.toFixed(2)}  Y {cursorWorld.y.toFixed(2)}
          </Box>
        </>
      )}

      {/* Kropki wierzchołków rysowanej polyline / prostokąta */}
      {vertexDots.map((d, i) => (
        <Box key={i} sx={{ position: 'absolute', left: d.x - 3.5, top: d.y - 3.5, width: 7, height: 7, borderRadius: '50%', bgcolor: '#7fd1ff', border: '1.5px solid #fff', boxSizing: 'border-box', pointerEvents: 'none' }} />
      ))}
    </Box>
  );
}
