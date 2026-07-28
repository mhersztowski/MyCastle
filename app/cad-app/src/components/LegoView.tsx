/**
 * LegoView — a focused 3D Lego-set designer. Each brick is a GroupNode (box body
 * + stud cylinders) placed in a core-scene3d SceneGraph and rendered by
 * SimpleViewer (orbit camera: rotate/pan/zoom + a translate/rotate/scale gizmo).
 * Left: Scene tree. Right: Properties (transform + visibility + colour).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, IconButton, Tooltip, TextField, ToggleButton, ToggleButtonGroup,
  List, ListItemButton, ListItemText, Divider, MenuItem, Button, CircularProgress, InputAdornment,
  Snackbar, Alert, Menu, Checkbox, ListItemIcon,
} from '@mui/material';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import HeightIcon from '@mui/icons-material/Height';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import SearchIcon from '@mui/icons-material/Search';
import GridOnIcon from '@mui/icons-material/GridOn';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckIcon from '@mui/icons-material/Check';
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { Fragment } from 'react';
import * as THREE from 'three';
import { SimpleViewer, SceneGraph, SceneSerializer, SceneDeserializer, GroupNode, MeshNode, type SceneNode } from '@mhersztowski/core-scene3d';
import {
  loadPart, importModel, exportScene,
  ldrawStatus, ldrawInstall, ldrawParts, ldrawCategories, ldrawGetFavorites, ldrawSaveFavorites,
  type LdrawPart, type LdrawCategory,
} from './ldraw';
import { ServerFileBrowser } from './ServerFileBrowser';
import { writeFileAt, readFileAt } from '../vfs/cadProjectApi';
import { useRegisterFileOps } from '../fileops/FileOpsContext';
import { buildBaseplateLines, disposeBaseplateLines, neededBaseplateStuds } from './legoBaseplate';

import { syncOpenUrl } from '../vfs/openTarget';
const LEGO_EXT = '.lego.json';

// Lego units (scene = 1 unit per stud pitch). 1 plate = "flat" height.
const U = 1;          // stud pitch (X/Z)
const PLATE = 0.4;    // one plate height
// Real-world scale: 1 stud pitch = 8 mm = 0.8 cm. Used to report brick/group
// bounding-box dimensions in centimetres.
const CM_PER_UNIT = 0.8;
const toCm = (u: number) => u * CM_PER_UNIT;

const COLORS = ['#d01012', '#0055bf', '#f2cd37', '#237841', '#ffffff', '#1b2a34', '#a0a5a9', '#fe8a18', '#901f76', '#582a12'];

// Snap increments in scene units (1 stud = U = 20 LDU; 1 plate/"flat" = PLATE).
const SNAP_OPTIONS: { label: string; value: number }[] = [
  { label: 'None', value: 0 },
  { label: '1/20 Stud', value: U / 20 },
  { label: '1/4 Stud', value: U / 4 },
  { label: '1 Flat', value: PLATE },
  { label: '1/2 Stud', value: U / 2 },
  { label: '1 Stud', value: U },
  { label: '2 Studs', value: 2 * U },
  { label: '3 Studs', value: 3 * U },
  { label: '4 Studs', value: 4 * U },
  { label: '8 Studs', value: 8 * U },
];
const snapLabel = (v: number): string => SNAP_OPTIONS.find((o) => o.value === v)?.label ?? '—';
const snapTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step : v);

// Rotation snap increments in degrees (0 = None).
const ROT_SNAP_OPTIONS: { label: string; deg: number }[] = [
  { label: 'None', deg: 0 },
  { label: '1 Degree', deg: 1 },
  { label: '5 Degrees', deg: 5 },
  { label: '15 Degrees', deg: 15 },
  { label: '22.5 Degrees', deg: 22.5 },
  { label: '30 Degrees', deg: 30 },
  { label: '45 Degrees', deg: 45 },
  { label: '60 Degrees', deg: 60 },
  { label: '90 Degrees', deg: 90 },
  { label: '180 Degrees', deg: 180 },
];

type NodeData = ReturnType<SceneNode['toData']>;

/** Rebuild a detached node subtree from serialized data, with fresh IDs so the
 *  clone can live alongside the original (used by copy/cut/paste). */
function nodeFromData(data: NodeData): SceneNode {
  const g = SceneGraph.fromData({ version: '1.0.0', root: { type: 'group', name: 'clip', children: [data] } as never });
  const n = g.root.children[0];
  g.removeNode(n.id);
  n.traverse((c) => { c.id = crypto.randomUUID(); });
  return n;
}

let groupSeq = 0;

/** A user-created container group (holds bricks/subgroups) — distinct from the
 *  GroupNodes that represent individual bricks. */
const isContainer = (n: SceneNode): boolean => n.metadata?.isGroup === true;
function makeGroup(name?: string): GroupNode {
  return new GroupNode({ name: name ?? `Group ${++groupSeq}`, metadata: { isGroup: true } });
}

const round = (n: number) => Math.round(n * 100) / 100;

export function LegoView() {
  const graphRef = useRef<SceneGraph | null>(null);
  if (!graphRef.current) graphRef.current = new SceneGraph();
  const graph = graphRef.current;

  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // Multi-selection: `selectedIds` are all highlighted bricks; the last one is the
  // "primary" that drives the gizmo + Properties.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const primaryId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const selectOne = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), []);
  const toggleSel = useCallback((id: string) => setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])), []);
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  // Select tool: when on, dragging the viewport rubber-band-selects bricks.
  const [selectMode, setSelectMode] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  // Left (Scene) / right (Properties) panels — collapsible.
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);

  // Move-snap: bricks snap to a grid when dropped via the translate gizmo.
  // XY = horizontal plane (scene X/Z), Z = vertical (scene Y / height).
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapXY, setSnapXY] = useState(U / 2);
  const [snapZ, setSnapZ] = useState(U / 2);
  const [snapMenu, setSnapMenu] = useState<HTMLElement | null>(null);
  const [snapSub, setSnapSub] = useState<{ el: HTMLElement; axis: 'xy' | 'z' } | null>(null);
  // One-shot "frame the baseplate" on mount (and after loading a file) — we avoid
  // SimpleViewer's autoFit because it re-frames on every brick add/remove.
  const fitRef = useRef<(() => void) | null>(null);
  // Imperative handle to read the selected node's world bounding-box size (units).
  const boundsRef = useRef<((nodeId: string) => [number, number, number] | null) | null>(null);
  // Selected brick/group size in cm (width X, height Y, depth Z), recomputed after
  // selection/transform once three has applied the new matrices.
  const [boundsCm, setBoundsCm] = useState<{ w: number; h: number; d: number } | null>(null);
  // Retry a few times — the fit handle and merged baseplate geometry aren't ready
  // on the first frame.
  const fitSoon = useCallback(() => {
    [120, 350, 700].forEach((ms) => setTimeout(() => fitRef.current?.(), ms));
  }, []);
  useEffect(() => { fitSoon(); }, [fitSoon]);
  // Rotation snap: dropped rotations round to a fixed angle increment.
  const [rotSnapEnabled, setRotSnapEnabled] = useState(true);
  const [rotSnapDeg, setRotSnapDeg] = useState(30);
  const [rotMenu, setRotMenu] = useState<HTMLElement | null>(null);

  // Top-level bricks (root children).
  const bricks = useMemo(() => graph.root.children.slice(), [graph, version]);

  // Line-grid baseplate (primitives, not a scene node) that auto-sizes to the model.
  const baseplateStuds = useMemo(() => neededBaseplateStuds(graph.root.children as SceneNode[]), [graph, version]);
  const baseGrid = useMemo(() => buildBaseplateLines(baseplateStuds), [baseplateStuds]);
  useEffect(() => () => disposeBaseplateLines(baseGrid), [baseGrid]);
  const selected = useMemo(() => (primaryId ? (graph.findNode(primaryId) as SceneNode | null) : null), [graph, primaryId, version]);

  // Recompute the selected node's size after three has committed the new matrices
  // (one animation frame later). Cleared when nothing is selected.
  useEffect(() => {
    if (!primaryId) { setBoundsCm(null); return; }
    let raf = 0;
    let tries = 0;
    const tick = () => {
      const s = boundsRef.current?.(primaryId);
      if (s) { setBoundsCm({ w: toCm(s[0]), h: toCm(s[1]), d: toCm(s[2]) }); return; }
      if (tries++ < 10) raf = requestAnimationFrame(tick); // retry until geometry is ready
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [primaryId, version]);

  // "Center to nearest stud": snap every selected node onto the whole-stud grid
  // in X/Z (the horizontal baseplate grid). Y (height) is left untouched.
  const centerToStud = useCallback(() => {
    if (!selectedIds.length) return;
    for (const id of selectedIds) {
      const n = graph.findNode(id);
      if (!n) continue;
      const p = [...n.position] as [number, number, number];
      p[0] = Math.round(p[0] / U) * U;
      p[2] = Math.round(p[2] / U) * U;
      n.position = p;
    }
    bump();
  }, [selectedIds, graph, bump]);

  // Shift+click in the Scene list selects a contiguous range from the primary.
  const rangeSelect = useCallback((id: string) => {
    const ids = graph.root.children.map((b) => b.id);
    const a = ids.indexOf(primaryId ?? id);
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) { selectOne(id); return; }
    const [lo, hi] = a < b ? [a, b] : [b, a];
    setSelectedIds(ids.slice(lo, hi + 1));
  }, [graph, primaryId, selectOne]);

  const onRowClick = useCallback((e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) toggleSel(id);
    else if (e.shiftKey) rangeSelect(id);
    else selectOne(id);
  }, [toggleSel, rangeSelect, selectOne]);

  // ── Groups + drag-and-drop reparenting in the Scene tree ─────────────────────
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const toggleExpand = useCallback((id: string) => setCollapsedIds((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n;
  }), []);

  const addGroup = useCallback(() => {
    const g = makeGroup();
    graph.addNode(g);
    // Move the current top-level selection into the new group (keeps positions).
    for (const id of selectedIds) {
      const n = graph.findNode(id);
      if (n && n.parent === graph.root && n.id !== g.id) {
        const removed = n.parent.removeChild(n.id);
        if (removed) g.addChild(removed);
      }
    }
    selectOne(g.id);
    bump();
  }, [graph, selectedIds, selectOne, bump]);

  /** Move `srcId` under `targetId` (a container) or to the root (targetId=null).
   *  Local transform is kept; cycles and no-ops are rejected. */
  const reparent = useCallback((srcId: string, targetId: string | null) => {
    if (srcId === targetId) return;
    const src = graph.findNode(srcId);
    if (!src || !src.parent) return;
    if (targetId) {
      const target = graph.findNode(targetId);
      if (!target || !isContainer(target)) return;
      if (src.findById(targetId)) return; // would create a cycle
      if (src.parent.id === targetId) return; // already there
    } else if (src.parent === graph.root) return;
    const removed = src.parent.removeChild(srcId);
    if (!removed) return;
    if (targetId) graph.addNode(removed, targetId); else graph.root.addChild(removed);
    bump();
  }, [graph, bump]);

  // Staggered drop position so freshly added bricks don't stack on each other.
  const nextSpot = useCallback((): [number, number] => {
    const n = graph.root.children.length;
    return [(n % 5) * 3, Math.floor(n / 5) * 3];
  }, [graph]);

  // ── LDraw: install status, parts palette, import/export ──────────────────────
  const [ldStatus, setLdStatus] = useState<'checking' | 'ready' | 'absent' | 'installing'>('checking');
  const [partSearch, setPartSearch] = useState('');
  const [partList, setPartList] = useState<LdrawPart[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Category tree (whole library), shown when not searching.
  const [ldCats, setLdCats] = useState<LdrawCategory[]>([]);
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set());
  const [catParts, setCatParts] = useState<Record<string, LdrawPart[]>>({});
  const [catLoading, setCatLoading] = useState<Set<string>>(new Set());
  // Favourite parts (persisted on the backend), shown in a group at the top.
  const [favorites, setFavorites] = useState<LdrawPart[]>([]);
  const [favOpen, setFavOpen] = useState(true);
  const favSet = useMemo(() => new Set(favorites.map((f) => f.file)), [favorites]);

  const toggleFavorite = useCallback((part: LdrawPart) => {
    setFavorites((prev) => {
      const next = prev.some((f) => f.file === part.file)
        ? prev.filter((f) => f.file !== part.file)
        : [...prev, { file: part.file, desc: part.desc }];
      ldrawSaveFavorites(next).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    ldrawStatus()
      .then((s) => { if (alive) setLdStatus(s.installed ? 'ready' : 'absent'); })
      .catch(() => { if (alive) setLdStatus('absent'); });
    return () => { alive = false; };
  }, []);

  // Load the category tree once the library is ready.
  useEffect(() => {
    if (ldStatus !== 'ready') return;
    let alive = true;
    ldrawCategories().then((r) => { if (alive) setLdCats(r.categories); }).catch(() => {});
    return () => { alive = false; };
  }, [ldStatus]);

  // Load persisted favourites once.
  useEffect(() => {
    let alive = true;
    ldrawGetFavorites().then((f) => { if (alive) setFavorites(f); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Debounced search across the whole library (only when a term is typed).
  useEffect(() => {
    if (ldStatus !== 'ready' || !partSearch.trim()) { setPartList([]); return; }
    const t = setTimeout(() => { ldrawParts({ search: partSearch }).then((r) => setPartList(r.parts)).catch(() => setPartList([])); }, 250);
    return () => clearTimeout(t);
  }, [partSearch, ldStatus]);

  // Expand/collapse a category, lazy-loading its parts on first open.
  const toggleCat = useCallback((name: string) => {
    setExpandedCat((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); return next; }
      next.add(name);
      if (!catParts[name]) {
        setCatLoading((l) => new Set(l).add(name));
        ldrawParts({ category: name })
          .then((r) => setCatParts((m) => ({ ...m, [name]: r.parts })))
          .catch(() => setCatParts((m) => ({ ...m, [name]: [] })))
          .finally(() => setCatLoading((l) => { const n = new Set(l); n.delete(name); return n; }));
      }
      return next;
    });
  }, [catParts]);

  const doInstall = useCallback(async () => {
    setLdStatus('installing');
    const r = await ldrawInstall().catch((e) => ({ error: String(e) }));
    setLdStatus(r.error ? 'absent' : 'ready');
    if (r.error) alert('Instalacja biblioteki LDraw nie powiodła się: ' + r.error);
  }, []);

  const addLdrawPart = useCallback(async (part: LdrawPart) => {
    setBusy(part.file);
    try {
      const [x, z] = nextSpot();
      const g = await loadPart(part.file, color, part.desc || part.file);
      g.position = [x, g.position[1], z];
      graph.addNode(g);
      selectOne(g.id);
      bump();
    } catch (e) {
      alert('Nie udało się wczytać części ' + part.file + ': ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }, [graph, color, bump, nextSpot]);

  const onImportFile = useCallback(async (file: File) => {
    setBusy('import');
    try {
      const text = await file.text();
      const g = await importModel(text, file.name.replace(/\.(ldr|mpd|dat)$/i, ''));
      graph.addNode(g);
      selectOne(g.id);
      bump();
    } catch (e) {
      alert('Import LDraw nie powiódł się: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }, [graph, bump]);

  const onExport = useCallback(() => {
    const text = exportScene(graph.root.children as SceneNode[], 'lego-model');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lego-model.ldr';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [graph]);

  // ── Save/Load scene to the backend filesystem (VFS) ──────────────────────────
  const [serverMode, setServerMode] = useState<'open' | 'save' | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const doSave = useCallback(async (dir: string, name: string) => {
    const json = SceneSerializer.serialize(graph);
    await writeFileAt(dir, name, LEGO_EXT, json);
    setCurrentFile(name);
    setToast({ msg: `Zapisano: ${name}${LEGO_EXT}`, severity: 'success' });
  }, [graph]);

  const doLoad = useCallback(async (dir: string, name: string) => {
    const json = await readFileAt(dir, name, LEGO_EXT);
    syncOpenUrl(`${dir}/${name}${LEGO_EXT}`);
    graphRef.current = SceneDeserializer.deserialize(json);
    setSelectedIds([]);
    setCurrentFile(name);
    setToast({ msg: `Wczytano: ${name}${LEGO_EXT}`, severity: 'success' });
    bump();
    fitSoon();
  }, [bump, fitSoon]);

  // Register Lego's actions with the unified top-bar File menu.
  useRegisterFileOps('lego', {
    currentName: currentFile ? `${currentFile}${LEGO_EXT}` : null,
    server: [
      { label: 'Open Lego z serwera…', run: () => setServerMode('open') },
      { label: 'Save Lego na serwer…', run: () => setServerMode('save') },
    ],
    importItems: [
      { label: 'Importuj model LDraw…', secondary: '.ldr / .mpd / .dat', run: () => fileInputRef.current?.click() },
    ],
    exportItems: [
      { label: 'Eksportuj do LDraw', secondary: '.ldr', run: onExport },
    ],
  }, [currentFile, onExport]);

  // Map a clicked (possibly child) node back to its top-level brick group.
  const onSelect = useCallback((id: string | null) => {
    if (!id) { setSelectedIds([]); return; }
    const top = graph.root.children.find((b) => b.findById(id));
    selectOne(top ? top.id : id);
  }, [graph, selectOne]);

  const onGizmoEnd = useCallback((nodeId: string, m: 'translate' | 'rotate' | 'scale', value: [number, number, number]) => {
    const node = graph.findNode(nodeId);
    if (!node) return;
    if (m === 'translate') {
      let [x, y, z] = value;
      if (snapEnabled) { x = snapTo(x, snapXY); z = snapTo(z, snapXY); y = snapTo(y, snapZ); }
      node.position = [x, y, z];
    } else if (m === 'rotate') {
      let [rx, ry, rz] = value;
      if (rotSnapEnabled && rotSnapDeg > 0) {
        const step = (rotSnapDeg * Math.PI) / 180;
        rx = snapTo(rx, step); ry = snapTo(ry, step); rz = snapTo(rz, step);
      }
      node.rotation = [rx, ry, rz];
    } else node.scale = value;
    bump();
  }, [graph, bump, snapEnabled, snapXY, snapZ, rotSnapEnabled, rotSnapDeg]);

  // ── Scene item context menu (Cut / Copy / Paste / Delete) — multi-select aware ──
  const clipboardRef = useRef<NodeData[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [hasClip, setHasClip] = useState(false);

  const openCtxMenu = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault(); e.stopPropagation();
    // Right-clicking a brick outside the selection makes it the selection.
    setSelectedIds((p) => (p.includes(nodeId) ? p : [nodeId]));
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const doCopy = useCallback(() => {
    const data = selectedIds.map((id) => graph.findNode(id)?.toData()).filter(Boolean) as NodeData[];
    if (data.length) { clipboardRef.current = data; setHasClip(true); }
  }, [graph, selectedIds]);

  const doDelete = useCallback(() => {
    selectedIds.forEach((id) => graph.removeNode(id));
    setSelectedIds([]);
    bump();
  }, [graph, selectedIds, bump]);

  const doCut = useCallback(() => { doCopy(); doDelete(); }, [doCopy, doDelete]);

  const doPaste = useCallback(() => {
    const arr = clipboardRef.current;
    if (!arr.length) return;
    // Offset the whole clipboard by (2,2) studs so relative arrangement is kept.
    const newIds: string[] = [];
    for (const data of arr) {
      const clone = nodeFromData(data);
      clone.position = [clone.position[0] + 2 * U, clone.position[1], clone.position[2] + 2 * U];
      clone.name = `${clone.name}-copy`;
      graph.addNode(clone);
      newIds.push(clone.id);
    }
    setSelectedIds(newIds);
    bump();
  }, [graph, bump]);

  // Project each brick's approximate centre to viewport pixels using the live
  // camera SimpleViewer exposes on window (__r3f_camera).
  const projectBricks = useCallback((): { id: string; sx: number; sy: number }[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cam = (window as any).__r3f_camera as THREE.Camera | undefined;
    const vp = viewportRef.current;
    if (!cam || !vp) return [];
    const r = vp.getBoundingClientRect();
    const out: { id: string; sx: number; sy: number }[] = [];
    for (const b of graph.root.children) {
      if (!b.visible) continue;
      const p = new THREE.Vector3(b.position[0], b.position[1] + 0.6, b.position[2]).project(cam);
      if (p.z > 1) continue; // behind the camera
      out.push({ id: b.id, sx: (p.x * 0.5 + 0.5) * r.width, sy: (-p.y * 0.5 + 0.5) * r.height });
    }
    return out;
  }, [graph]);

  const selectInRect = useCallback((minX: number, minY: number, maxX: number, maxY: number, additive: boolean) => {
    const hits = projectBricks().filter((p) => p.sx >= minX && p.sx <= maxX && p.sy >= minY && p.sy <= maxY).map((p) => p.id);
    setSelectedIds((prev) => (additive ? Array.from(new Set([...prev, ...hits])) : hits));
  }, [projectBricks]);

  const clickSelectAt = useCallback((x: number, y: number, additive: boolean) => {
    let best: string | null = null; let bestD = 900; // ~30px radius²
    for (const p of projectBricks()) {
      const d = (p.sx - x) ** 2 + (p.sy - y) ** 2;
      if (d < bestD) { bestD = d; best = p.id; }
    }
    if (!best) { if (!additive) setSelectedIds([]); return; }
    if (additive) toggleSel(best); else selectOne(best);
  }, [projectBricks, toggleSel, selectOne]);

  // Forward an event to the underlying R3F canvas so OrbitControls keeps handling
  // pan (middle/right drag) and zoom (wheel) even while the select overlay is up.
  const forwardToCanvas = useCallback((e: React.PointerEvent | React.WheelEvent) => {
    const canvas = viewportRef.current?.querySelector('canvas');
    if (!canvas) return;
    const n = e.nativeEvent;
    // Re-dispatch a same-type event; OrbitControls captures the pointer on the
    // canvas afterwards, so the subsequent move/up bypass the overlay.
    canvas.dispatchEvent(new (n.constructor as typeof Event as any)(n.type, n));
  }, []);

  // Marquee (rubber-band) select — pointer-capture based so move/up are delivered
  // to the overlay itself, which works reliably for mouse, pen AND touch.
  const marqueeRef = useRef<{ x0: number; y0: number; additive: boolean; pointerId: number } | null>(null);

  const onMarqueeDown = useCallback((e: React.PointerEvent) => {
    // Mouse middle/right → OrbitControls pan/orbit; secondary touch (2nd finger) →
    // forward for pinch/pan. Primary mouse/pen/touch → start the marquee.
    if ((e.pointerType === 'mouse' && e.button !== 0) || (e.pointerType !== 'mouse' && !e.isPrimary)) {
      forwardToCanvas(e); return;
    }
    const vp = viewportRef.current; if (!vp) return;
    const r = vp.getBoundingClientRect();
    const x0 = e.clientX - r.left, y0 = e.clientY - r.top;
    marqueeRef.current = { x0, y0, additive: e.shiftKey || e.ctrlKey || e.metaKey, pointerId: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setMarquee({ x0, y0, x1: x0, y1: y0 });
  }, [forwardToCanvas]);

  const onMarqueeMove = useCallback((e: React.PointerEvent) => {
    const st = marqueeRef.current; if (!st || e.pointerId !== st.pointerId) return;
    const vp = viewportRef.current; if (!vp) return;
    const r = vp.getBoundingClientRect();
    setMarquee({ x0: st.x0, y0: st.y0, x1: e.clientX - r.left, y1: e.clientY - r.top });
  }, []);

  const onMarqueeUp = useCallback((e: React.PointerEvent) => {
    const st = marqueeRef.current; if (!st || e.pointerId !== st.pointerId) return;
    marqueeRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const vp = viewportRef.current;
    if (vp) {
      const r = vp.getBoundingClientRect();
      const x1 = e.clientX - r.left, y1 = e.clientY - r.top;
      if (Math.abs(x1 - st.x0) < 5 && Math.abs(y1 - st.y0) < 5) clickSelectAt(st.x0, st.y0, st.additive);
      else selectInRect(Math.min(st.x0, x1), Math.min(st.y0, y1), Math.max(st.x0, x1), Math.max(st.y0, y1), st.additive);
    }
    setMarquee(null);
  }, [clickSelectAt, selectInRect]);

  const setVec = (axis: 0 | 1 | 2, kind: 'position' | 'rotation' | 'scale', v: number) => {
    if (!selected) return;
    const arr = [...selected[kind]] as [number, number, number];
    arr[axis] = v;
    selected[kind] = arr;
    bump();
  };
  const setBrickColor = (c: string) => {
    if (!selected) return;
    selected.traverse((n) => { if (n instanceof MeshNode) n.setMaterialColor(c); });
    bump();
  };
  const brickColor = (b: SceneNode): string => {
    const body = b.children.find((c) => c instanceof MeshNode) as MeshNode | undefined;
    return body?.material.color ?? '#888';
  };

  // One LDraw-part row (used in favourites, search results and the category tree).
  const partRow = (p: LdrawPart, pl = 1) => {
    const fav = favSet.has(p.file);
    return (
      <ListItemButton key={p.file} onClick={() => addLdrawPart(p)} disabled={busy === p.file}
        sx={{ minHeight: 24, py: 0.125, pr: 0.25, pl }}>
        {busy === p.file
          ? <CircularProgress size={12} sx={{ mr: 0.75 }} />
          : <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: color, border: '1px solid rgba(0,0,0,0.3)', mr: 0.75, flexShrink: 0 }} />}
        <ListItemText sx={{ my: 0 }}
          primary={<Typography sx={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.desc}</Typography>}
          secondary={<Typography sx={{ fontSize: 9.5, color: 'text.disabled' }}>{p.file}</Typography>} />
        <Tooltip title={fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}>
          <IconButton size="small" sx={{ p: 0.25, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }}>
            {fav ? <StarIcon sx={{ fontSize: 15, color: '#f2cd37' }} /> : <StarBorderIcon sx={{ fontSize: 15, opacity: 0.5 }} />}
          </IconButton>
        </Tooltip>
      </ListItemButton>
    );
  };

  // Recursive Scene tree: containers expand into their children; bricks are leaves.
  const renderTree = (nodes: SceneNode[], depth: number) => nodes.map((b) => {
    const container = isContainer(b);
    const expanded = !collapsedIds.has(b.id);
    return (
      <Fragment key={b.id}>
        <ListItemButton selected={selectedIds.includes(b.id)} onClick={(e) => onRowClick(e, b.id)}
          onContextMenu={(e) => openCtxMenu(e, b.id)}
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; setDragId(b.id); e.stopPropagation(); }}
          onDragEnd={() => setDragId(null)}
          onDragOver={container ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
          onDrop={container ? (e) => { e.preventDefault(); e.stopPropagation(); const src = e.dataTransfer.getData('text/plain') || dragId; if (src) reparent(src, b.id); setDragId(null); } : undefined}
          sx={{ minHeight: 26, py: 0.125, pr: 0.5, pl: 0.75 + depth * 1.5, bgcolor: dragId && container && dragId !== b.id ? 'rgba(79,195,247,0.08)' : undefined }}>
          {container ? (
            <IconButton size="small" sx={{ p: 0.1, mr: 0.25 }} onClick={(e) => { e.stopPropagation(); toggleExpand(b.id); }}>
              {expanded ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          ) : (
            <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: brickColor(b), border: '1px solid rgba(0,0,0,0.3)', mr: 0.75, ml: 0.5, flexShrink: 0 }} />
          )}
          {container && <FolderIcon sx={{ fontSize: 14, mr: 0.5, color: '#f2cd37', flexShrink: 0 }} />}
          <ListItemText sx={{ my: 0 }} primary={<Typography sx={{ fontSize: 12, opacity: b.visible ? 1 : 0.45, fontWeight: container ? 600 : 400 }}>{b.name}</Typography>} />
          <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); b.visible = !b.visible; bump(); }}>
            {b.visible ? <VisibilityIcon sx={{ fontSize: 15 }} /> : <VisibilityOffIcon sx={{ fontSize: 15, opacity: 0.5 }} />}
          </IconButton>
          <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); graph.removeNode(b.id); setSelectedIds((p) => p.filter((x) => x !== b.id)); bump(); }}>
            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </ListItemButton>
        {container && expanded && renderTree(b.children, depth + 1)}
      </Fragment>
    );
  });

  return (
    <>
    <Box sx={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      {/* ── Scene (left) ── */}
      {showLeft && (
      <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ViewInArIcon sx={{ fontSize: 18, color: '#f2cd37' }} />
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Scene</Typography>
          <Tooltip title="Dodaj grupę (grupuje zaznaczone)">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={addGroup}><CreateNewFolderOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">{selectedIds.length > 1 ? `${selectedIds.length}/${bricks.length}` : bricks.length}</Typography>
        </Box>
        {/* Drop onto empty area moves a dragged brick/group back to the root. */}
        <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); const src = e.dataTransfer.getData('text/plain') || dragId; if (src) reparent(src, null); setDragId(null); }}>
          {bricks.length === 0 && (
            <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1.5, fontStyle: 'italic' }}>Dodaj cegłę z palety u góry.</Typography>
          )}
          {renderTree(graph.root.children as SceneNode[], 0)}
        </List>

        {/* ── LDraw parts palette ── */}
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', maxHeight: '48%', minHeight: 0 }}>
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Części LDraw</Typography>
            {ldStatus === 'ready' && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.main' }} />}
          </Box>

          {ldStatus === 'checking' && (
            <Box sx={{ px: 1.5, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={13} /><Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Sprawdzanie…</Typography>
            </Box>
          )}
          {(ldStatus === 'absent' || ldStatus === 'installing') && (
            <Box sx={{ px: 1.5, pb: 1.25 }}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 0.75 }}>
                Biblioteka części LDraw nie jest zainstalowana (~80&nbsp;MB).
              </Typography>
              <Button size="small" variant="outlined" fullWidth disabled={ldStatus === 'installing'}
                startIcon={ldStatus === 'installing' ? <CircularProgress size={13} /> : undefined}
                onClick={doInstall} sx={{ fontSize: 11, textTransform: 'none' }}>
                {ldStatus === 'installing' ? 'Instalowanie…' : 'Zainstaluj bibliotekę LDraw'}
              </Button>
            </Box>
          )}
          {ldStatus === 'ready' && (
            <>
              <Box sx={{ px: 1, pb: 0.5 }}>
                <TextField size="small" fullWidth placeholder="Szukaj części…" value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment>, sx: { fontSize: 12 } }} />
              </Box>
              <List dense sx={{ flex: 1, overflow: 'auto', py: 0 }}>
                {partSearch.trim() ? (
                  // Flat search results across the whole library.
                  partList.length === 0
                    ? <Typography sx={{ fontSize: 11, color: 'text.disabled', px: 1.5, py: 1, fontStyle: 'italic' }}>Brak wyników.</Typography>
                    : partList.map((p) => partRow(p, 1.5))
                ) : (
                  // Favourites group (top) + category tree — expand to lazy-load parts.
                  <>
                    {favorites.length > 0 && (
                      <Fragment>
                        <ListItemButton onClick={() => setFavOpen((v) => !v)} sx={{ minHeight: 26, py: 0.125, pr: 0.5, pl: 0.5 }}>
                          {favOpen ? <ExpandMoreIcon sx={{ fontSize: 16, mr: 0.25 }} /> : <ChevronRightIcon sx={{ fontSize: 16, mr: 0.25 }} />}
                          <StarIcon sx={{ fontSize: 14, mr: 0.5, color: '#f2cd37', flexShrink: 0 }} />
                          <ListItemText sx={{ my: 0 }} primary={<Typography sx={{ fontSize: 12, fontWeight: 600 }}>Favorites</Typography>} />
                          <Typography sx={{ fontSize: 10, color: 'text.disabled', ml: 0.5 }}>{favorites.length}</Typography>
                        </ListItemButton>
                        {favOpen && favorites.map((p) => partRow(p, 3))}
                        <Divider />
                      </Fragment>
                    )}
                    {ldCats.length === 0
                    ? <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={12} /><Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Ładowanie kategorii…</Typography></Box>
                    : ldCats.map((c) => {
                      const open = expandedCat.has(c.name);
                      return (
                        <Fragment key={c.name}>
                          <ListItemButton onClick={() => toggleCat(c.name)} sx={{ minHeight: 26, py: 0.125, pr: 0.5, pl: 0.5 }}>
                            {open ? <ExpandMoreIcon sx={{ fontSize: 16, mr: 0.25 }} /> : <ChevronRightIcon sx={{ fontSize: 16, mr: 0.25 }} />}
                            <ListItemText sx={{ my: 0 }} primary={<Typography sx={{ fontSize: 12, fontWeight: 600 }}>{c.name}</Typography>} />
                            <Typography sx={{ fontSize: 10, color: 'text.disabled', ml: 0.5 }}>{c.count}</Typography>
                          </ListItemButton>
                          {open && (catLoading.has(c.name)
                            ? <Box sx={{ pl: 3, py: 0.5 }}><CircularProgress size={12} /></Box>
                            : (catParts[c.name] ?? []).map((p) => partRow(p, 3)))}
                        </Fragment>
                      );
                    })}
                  </>
                )}
              </List>
            </>
          )}
        </Box>
      </Box>
      )}

      {/* ── Viewport (center) ── */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* palette / toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
          <Tooltip title={showLeft ? 'Ukryj panel Scene' : 'Pokaż panel Scene'}>
            <IconButton size="small" onClick={() => setShowLeft((v) => !v)} sx={{ color: showLeft ? 'primary.main' : 'text.secondary' }}>
              <ViewSidebarOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {COLORS.map((c) => (
              <Box key={c} onClick={() => setColor(c)} sx={{ width: 18, height: 18, borderRadius: '3px', bgcolor: c, cursor: 'pointer', border: color === c ? '2px solid #4fc3f7' : '1px solid rgba(0,0,0,0.35)' }} />
            ))}
          </Box>
          {busy === 'import' && <CircularProgress size={16} sx={{ ml: 0.5 }} />}
          {/* Hidden input driven by File ▸ Importuj model LDraw. */}
          <input ref={fileInputRef} type="file" accept=".ldr,.mpd,.dat" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ''; }} />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Select — klik zaznacza, przeciągnij prostokąt aby zaznaczyć wiele (Shift/Ctrl dodaje)">
            <ToggleButton value="select" size="small" selected={selectMode} onChange={() => setSelectMode((v) => !v)}
              sx={{ px: 0.75, py: 0.25, fontSize: 12, textTransform: 'none', gap: 0.5 }}>
              <HighlightAltIcon sx={{ fontSize: 16 }} /> Select
            </ToggleButton>
          </Tooltip>
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)}>
            <ToggleButton value="translate" sx={{ p: 0.5 }}><Tooltip title="Move"><OpenWithIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
            <ToggleButton value="rotate" sx={{ p: 0.5 }}><Tooltip title="Rotate"><RotateRightIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
            <ToggleButton value="scale" sx={{ p: 0.5 }}><Tooltip title="Scale"><HeightIcon sx={{ fontSize: 16 }} /></Tooltip></ToggleButton>
          </ToggleButtonGroup>
          <Tooltip title="Centruj zaznaczone do najbliższego studa (X/Z)">
            <span>
              <Button size="small" startIcon={<GpsFixedIcon sx={{ fontSize: 16 }} />} disabled={!selectedIds.length}
                onClick={centerToStud}
                sx={{ px: 0.75, py: 0.25, fontSize: 12, textTransform: 'none', color: 'text.secondary' }}>
                Stud
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Snap Move Options">
            <Button size="small" startIcon={<GridOnIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => setSnapMenu(e.currentTarget)}
              sx={{ px: 0.75, py: 0.25, fontSize: 12, textTransform: 'none', color: snapEnabled ? 'primary.main' : 'text.secondary' }}>
              Snap
            </Button>
          </Tooltip>
          <Tooltip title="Snap Rotation Options">
            <Button size="small" startIcon={<Rotate90DegreesCwIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => setRotMenu(e.currentTarget)}
              sx={{ px: 0.75, py: 0.25, fontSize: 12, textTransform: 'none', color: rotSnapEnabled ? 'primary.main' : 'text.secondary' }}>
              Rot
            </Button>
          </Tooltip>
          <Tooltip title={showRight ? 'Ukryj panel Properties' : 'Pokaż panel Properties'}>
            <IconButton size="small" onClick={() => setShowRight((v) => !v)} sx={{ color: showRight ? 'primary.main' : 'text.secondary' }}>
              <ViewSidebarOutlinedIcon sx={{ fontSize: 18, transform: 'scaleX(-1)' }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box ref={viewportRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <SimpleViewer
            sceneGraph={graph}
            version={version}
            selectedNodeId={primaryId}
            selectedNodeIds={selectedIds}
            transformMode={mode}
            onNodeSelect={onSelect}
            onGizmoTransformEnd={onGizmoEnd}
            showGrid={false}
            edges
            flatLighting
            viewCube
            showAxesGizmo={false}
            translationSnap={snapEnabled && snapXY > 0 ? snapXY : null}
            rotationSnap={rotSnapEnabled && rotSnapDeg > 0 ? (rotSnapDeg * Math.PI) / 180 : null}
            extraObjects={baseGrid}
            showBoundingBox
            gizmoSize={1.5}
            fitSceneRef={fitRef}
            boundsRef={boundsRef}
            cameraPreset="cad"
            style={{ width: '100%', height: '100%' }}
          />
          {/* Select tool: transparent overlay captures drags for rubber-band select. */}
          {selectMode && (
            <Box onPointerDown={onMarqueeDown} onPointerMove={onMarqueeMove} onPointerUp={onMarqueeUp} onPointerCancel={onMarqueeUp}
              onWheel={forwardToCanvas} onContextMenu={(e) => e.preventDefault()}
              sx={{ position: 'absolute', inset: 0, zIndex: 20, cursor: 'crosshair', touchAction: 'none' }}>
              {marquee && (
                <Box sx={{
                  position: 'absolute', pointerEvents: 'none',
                  left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
                  border: '1px solid #4fc3f7', bgcolor: 'rgba(79,195,247,0.12)',
                }} />
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Properties (right) ── */}
      {showRight && (
      <Box sx={{ width: 240, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Properties</Typography>
        </Box>
        {!selected ? (
          <Typography sx={{ fontSize: 12, color: 'text.disabled', p: 1.5, fontStyle: 'italic' }}>Zaznacz cegłę.</Typography>
        ) : (
          <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField size="small" variant="standard" value={selected.name}
                onChange={(e) => { selected.name = e.target.value; bump(); }} sx={{ flex: 1 }} inputProps={{ style: { fontSize: 13, fontWeight: 600 } }} />
              <IconButton size="small" onClick={() => { selected.visible = !selected.visible; bump(); }}>
                {selected.visible ? <VisibilityIcon sx={{ fontSize: 18 }} /> : <VisibilityOffIcon sx={{ fontSize: 18, opacity: 0.5 }} />}
              </IconButton>
            </Box>
            {(['position', 'rotation', 'scale'] as const).map((kind) => (
              <Box key={kind}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.25 }}>{kind}</Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {([0, 1, 2] as const).map((axis) => (
                    <TextField key={axis} size="small" type="number" label={['X', 'Y', 'Z'][axis]}
                      value={round(selected[kind][axis])}
                      onChange={(e) => setVec(axis, kind, Number(e.target.value) || 0)}
                      inputProps={{ step: kind === 'rotation' ? 15 : kind === 'scale' ? 0.1 : 0.5, style: { fontSize: 12, padding: '4px 6px' } }}
                      InputLabelProps={{ sx: { fontSize: 11 } }} sx={{ flex: 1 }} />
                  ))}
                </Box>
              </Box>
            ))}
            <Divider />
            <Box>
              <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Bounding box (cm)</Typography>
              {boundsCm ? (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {([['W', boundsCm.w], ['H', boundsCm.h], ['D', boundsCm.d]] as const).map(([lbl, v]) => (
                    <Box key={lbl} sx={{ flex: 1, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: '4px', py: 0.5 }}>
                      <Typography sx={{ fontSize: 9, color: 'text.disabled', lineHeight: 1 }}>{lbl}</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{v.toFixed(2)}</Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>—</Typography>
              )}
            </Box>
            <Divider />
            <Box>
              <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Kolor</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {COLORS.map((c) => (
                  <Box key={c} onClick={() => setBrickColor(c)} sx={{ width: 20, height: 20, borderRadius: '3px', bgcolor: c, cursor: 'pointer', border: brickColor(selected) === c ? '2px solid #4fc3f7' : '1px solid rgba(0,0,0,0.35)' }} />
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>
      )}
    </Box>

    {/* Snap Move Options menu + XY/Z increment submenus. */}
    <Menu anchorEl={snapMenu} open={Boolean(snapMenu)} onClose={() => { setSnapMenu(null); setSnapSub(null); }}
      slotProps={{ paper: { sx: { minWidth: 220 } } }}>
      <MenuItem dense onClick={() => setSnapEnabled((v) => !v)}>
        <ListItemIcon><Checkbox edge="start" size="small" checked={snapEnabled} tabIndex={-1} disableRipple sx={{ p: 0 }} /></ListItemIcon>
        <ListItemText primary="Move Snap Enabled" />
      </MenuItem>
      <Divider />
      <MenuItem dense disabled={!snapEnabled} onClick={(e) => setSnapSub({ el: e.currentTarget, axis: 'xy' })}>
        <ListItemText primary="Snap XY" secondary={snapLabel(snapXY)} />
        <ArrowRightIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
      </MenuItem>
      <MenuItem dense disabled={!snapEnabled} onClick={(e) => setSnapSub({ el: e.currentTarget, axis: 'z' })}>
        <ListItemText primary="Snap Z" secondary={snapLabel(snapZ)} />
        <ArrowRightIcon fontSize="small" sx={{ ml: 1, color: 'text.secondary' }} />
      </MenuItem>
    </Menu>
    <Menu anchorEl={snapSub?.el ?? null} open={Boolean(snapSub)} onClose={() => setSnapSub(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{ paper: { sx: { minWidth: 150 } } }}>
      {snapSub && SNAP_OPTIONS.map((o) => {
        const current = snapSub.axis === 'xy' ? snapXY : snapZ;
        return (
          <MenuItem key={o.label} dense selected={current === o.value}
            onClick={() => { (snapSub.axis === 'xy' ? setSnapXY : setSnapZ)(o.value); setSnapSub(null); setSnapMenu(null); }}>
            <ListItemIcon>{current === o.value ? <FiberManualRecordIcon sx={{ fontSize: 10 }} /> : null}</ListItemIcon>
            <ListItemText primary={o.label} />
          </MenuItem>
        );
      })}
    </Menu>

    {/* Scene item context menu: Cut / Copy / Paste / Delete (whole selection). */}
    <Menu open={Boolean(ctxMenu)} onClose={() => setCtxMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={ctxMenu ? { top: ctxMenu.y, left: ctxMenu.x } : undefined}>
      <MenuItem dense onClick={() => { doCut(); setCtxMenu(null); }}>Cut{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}</MenuItem>
      <MenuItem dense onClick={() => { doCopy(); setCtxMenu(null); }}>Copy{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}</MenuItem>
      <MenuItem dense disabled={!hasClip} onClick={() => { doPaste(); setCtxMenu(null); }}>Paste</MenuItem>
      <Divider />
      <MenuItem dense onClick={() => { doDelete(); setCtxMenu(null); }}>Delete{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}</MenuItem>
    </Menu>

    {/* Snap Rotation Options menu (flat list of angle increments). */}
    <Menu anchorEl={rotMenu} open={Boolean(rotMenu)} onClose={() => setRotMenu(null)}
      slotProps={{ paper: { sx: { minWidth: 210 } } }}>
      <MenuItem dense onClick={() => setRotSnapEnabled((v) => !v)}>
        <ListItemIcon>{rotSnapEnabled ? <CheckIcon sx={{ fontSize: 18 }} /> : null}</ListItemIcon>
        <ListItemText primary="Rotation Snap Enabled" />
      </MenuItem>
      <Divider />
      {ROT_SNAP_OPTIONS.map((o) => (
        <MenuItem key={o.label} dense disabled={!rotSnapEnabled} selected={rotSnapDeg === o.deg}
          onClick={() => { setRotSnapDeg(o.deg); setRotMenu(null); }}>
          <ListItemIcon>{rotSnapDeg === o.deg ? <FiberManualRecordIcon sx={{ fontSize: 10 }} /> : null}</ListItemIcon>
          <ListItemText primary={o.label} />
        </MenuItem>
      ))}
    </Menu>

    {/* Save/Load Lego scene to the backend filesystem (VFS). */}
    <ServerFileBrowser
      open={serverMode === 'open' || serverMode === 'save'}
      mode={serverMode ?? 'open'}
      title={serverMode === 'save' ? 'Zapisz zestaw Lego' : 'Otwórz zestaw Lego'}
      extension={LEGO_EXT}
      defaultName={currentFile ?? 'lego'}
      storageKey="lego.serverDir"
      onClose={() => setServerMode(null)}
      onOpen={doLoad}
      onSave={doSave}
      onDone={() => setServerMode(null)}
    />

    <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>{toast.msg}</Alert> : undefined}
    </Snackbar>
    </>
  );
}

export default LegoView;
