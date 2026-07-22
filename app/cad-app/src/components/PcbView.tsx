import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Button, TextField, MenuItem, Menu, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, List, ListItemButton, ListItemText, ListSubheader,
  CircularProgress, Divider, IconButton, Link, Snackbar, Alert,
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { createSvgIcon } from '@mui/material/utils';
import * as THREE from 'three';
import { SimpleViewer, SceneGraph } from '@mhersztowski/core-scene3d';
import { useRegisterFileOps } from '../fileops/FileOpsContext';
import { MyElementsDialog } from './electronics/MyElementsDialog';
import { BomDialog } from './electronics/BomDialog';
import type { MyElement } from '../electronics/myElements';

// Ikony
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import StraightenIcon from '@mui/icons-material/Straighten';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import FlipIcon from '@mui/icons-material/Flip';
import FlipVIcon from '@mui/icons-material/SwapVert';
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft';
import AlignHorizontalCenterIcon from '@mui/icons-material/AlignHorizontalCenter';
import AlignHorizontalRightIcon from '@mui/icons-material/AlignHorizontalRight';
import AlignVerticalTopIcon from '@mui/icons-material/AlignVerticalTop';
import AlignVerticalCenterIcon from '@mui/icons-material/AlignVerticalCenter';
import AlignVerticalBottomIcon from '@mui/icons-material/AlignVerticalBottom';
import HorizontalDistributeIcon from '@mui/icons-material/ViewWeek';
import VerticalDistributeIcon from '@mui/icons-material/ViewStream';
import FlipToFrontIcon from '@mui/icons-material/FlipToFront';
import FlipToBackIcon from '@mui/icons-material/FlipToBack';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import DeveloperBoardIcon from '@mui/icons-material/DeveloperBoard';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GridOnIcon from '@mui/icons-material/GridOn';
import RemoveIcon from '@mui/icons-material/Remove';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CheckIcon from '@mui/icons-material/Check';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import CreateOutlinedIcon from '@mui/icons-material/CreateOutlined';
import type { SvgIconComponent } from '@mui/icons-material';

type Editor = 'schematic' | 'pcb' | 'symbol' | 'footprint';
interface Tool { id: string; title: string; icon: SvgIconComponent }
interface SymbolTab { id: string; name: string }
interface SheetTab { id: string; name: string; desc: string }
// Wskaźnik dokumentu (arkusz o danym id albo PCB) — używany przez dialogi Modyfikuj/Klonuj/Historia
type DocRef = { kind: 'sheet'; id: string } | { kind: 'pcb' };
// Filtry dialogu „Find Similar Objects" (op: Any/Równe/Różne)
type SimField = { op: 'any' | 'eq' | 'ne'; val: string };
interface SimFilters { name: SimField; prefix: SimField; footprint: SimField; id: SimField }

// ── Kolory ────────────────────────────────────────────────────────────────────
const C = {
  bar: '#ffffff', barBorder: '#e2e4e7', menuText: '#3a3f45',
  icon: '#5b6169', iconDisabled: '#c4c8cd',
  rail: '#f4f5f7', railActive: '#2196f3', logoTeal: '#13a3b3',
  treeSel: '#3b82d6', link: '#2f7fe0', panelBorder: '#e2e4e7',
  fieldBorder: '#cdd1d6', labelText: '#5b6169',
  toolActive: '#d6e8fb', schRed: '#9b1c1c', schBlue: '#1414b0', green: '#2e9e6b',
};

// ── Pan / Zoom ────────────────────────────────────────────────────────────────
interface View { x: number; y: number; zoom: number }
type SetView = (updater: (v: View) => View) => void;

// „ładny" krok linijki (1/2/5 × 10^k) dla docelowego odstępu px
function niceNum(x: number) {
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

// Zoom scrollem (do kursora) — natywny listener {passive:false}, by móc preventDefault
function usePanZoom(svgRef: React.RefObject<SVGSVGElement | null>, setView: SetView) {
  const ref = useRef(setView); ref.current = setView;
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      ref.current((v) => {
        const z = Math.min(20, Math.max(0.1, v.zoom * factor));
        const wx = (mx - v.x) / v.zoom, wy = (my - v.y) / v.zoom;
        return { x: mx - wx * z, y: my - wy * z, zoom: z };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svgRef]);
}

// Zoom gestem szczypania (pinch) na dotyku — śledzi 2 wskaźniki, skaluje wokół ich środka.
// Zwraca helpery wpinane w onPointerDown/Move/Up canvasu; `active()` = pinch w toku (pomiń pan/rysowanie).
function usePinch(svgRef: React.RefObject<SVGSVGElement | null>, setView: SetView) {
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<null | { d0: number; z0: number; wx: number; wy: number }>(null);
  const startBase = (view: View) => {
    const [a, b] = [...pts.current.values()]; const r = svgRef.current?.getBoundingClientRect(); if (!r || !a || !b) return;
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    base.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.zoom, wx: (mx - view.x) / view.zoom, wy: (my - view.y) / view.zoom };
  };
  const add = (e: React.PointerEvent, view: View) => { pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.current.size === 2) startBase(view); };
  const move = (e: React.PointerEvent): boolean => {
    if (!pts.current.has(e.pointerId)) return false;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size < 2 || !base.current) return false;
    const [a, b] = [...pts.current.values()]; const r = svgRef.current?.getBoundingClientRect(); if (!r) return false;
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top; const d = Math.hypot(a.x - b.x, a.y - b.y);
    const bs = base.current; const z = Math.min(20, Math.max(0.1, bs.z0 * (d / bs.d0)));
    setView(() => ({ x: mx - bs.wx * z, y: my - bs.wy * z, zoom: z }));
    return true;
  };
  const up = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) base.current = null; };
  const active = () => pts.current.size >= 2;
  return { add, move, up, active };
}

// Warstwa płótna z pan (LPM) + zoom (scroll); treść w grupie z transformacją
// ── Pionowy splitter (zmiana szerokości panelu; działa myszą/dotykiem/piórem) ──
function VSplitter({ onResize }: { onResize: (dx: number) => void }) {
  const last = useRef<number | null>(null);
  const down = (e: React.PointerEvent) => { last.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (last.current == null) return; const d = e.clientX - last.current; last.current = e.clientX; onResize(d); };
  const up = (e: React.PointerEvent) => { last.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ } };
  return <Box onPointerDown={down} onPointerMove={move} onPointerUp={up} sx={{ width: 6, flexShrink: 0, cursor: 'col-resize', touchAction: 'none', bgcolor: 'transparent', '&:hover': { bgcolor: '#cfe0f7' }, borderLeft: `1px solid ${C.panelBorder}` }} />;
}
// Zakładka zwijania/rozwijania panelu bocznego (zawsze widoczna)
function CollapseTab({ open, side, onToggle }: { open: boolean; side: 'left' | 'right'; onToggle: () => void }) {
  const ch = side === 'left' ? (open ? '‹' : '›') : (open ? '›' : '‹');
  return <Box onClick={onToggle} title={open ? 'Ukryj panel' : 'Pokaż panel'} sx={{ width: 13, flexShrink: 0, bgcolor: '#f0f2f4', borderLeft: `1px solid ${C.panelBorder}`, borderRight: `1px solid ${C.panelBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', '&:hover': { bgcolor: '#e4e7ea' } }}><Typography sx={{ fontSize: 13, color: '#6b7177', userSelect: 'none' }}>{ch}</Typography></Box>;
}

// Styl poziomego przewijania paska narzędzi palcem/piórem, gdy nie mieści się na
// ekranie: dzieci nie kurczą się (więc treść realnie wystaje), gest poziomy = scroll,
// pasek przewijania ukryty.
const HSCROLL_SX = {
  overflowX: 'auto' as const,
  overflowY: 'hidden' as const,
  WebkitOverflowScrolling: 'touch' as const,
  touchAction: 'pan-x' as const,
  '&::-webkit-scrollbar': { display: 'none' },
  scrollbarWidth: 'none' as const,
  '& > *': { flexShrink: 0 },
};

// ── Przeciągany panel ─────────────────────────────────────────────────────────
// Dokowany pasek narzędzi (osadzony na stałe u góry canvasu; zamiast pływających palet)
function DockedTools({ editor, activeTool, setActiveTool }: { editor: Editor; activeTool: string; setActiveTool: (id: string) => void }) {
  const groups: { tools: Tool[] }[] =
    editor === 'schematic' ? [{ tools: WIRING_TOOLS }, { tools: SYMBOL_TOOLS.slice(1) }]
      : editor === 'pcb' ? [{ tools: FOOTPRINT_TOOLS }]
        : editor === 'symbol' ? [{ tools: SYMBOL_TOOLS }]
          : [{ tools: FOOTPRINT_TOOLS }];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, height: 34, bgcolor: C.bar, borderBottom: `1px solid ${C.barBorder}`, px: 0.5, ...HSCROLL_SX }}>
      {groups.map((g, gi) => (
        <Box key={gi} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {gi > 0 && <Box sx={{ width: '1px', height: 20, bgcolor: '#d7dadd', mx: 0.75, flexShrink: 0 }} />}
          {g.tools.map((t) => (
            <Tooltip key={t.id} title={t.title} arrow placement="bottom" enterDelay={300} disableInteractive>
              <Box onClick={() => setActiveTool(t.id)}
                sx={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0.5, cursor: 'pointer', flexShrink: 0, bgcolor: activeTool === t.id ? C.toolActive : 'transparent', '&:hover': { bgcolor: activeTool === t.id ? C.toolActive : '#eef1f4' } }}>
                <t.icon sx={{ fontSize: 17, color: activeTool === t.id ? '#1976d2' : C.icon }} />
              </Box>
            </Tooltip>
          ))}
        </Box>
      ))}
    </Box>
  );
}

// ── Własne ikony narzędzi (SVG, styl EDA) — spójne z paletami EasyEDA ─────────
const SI = (children: React.ReactNode, name: string) => createSvgIcon(<g fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{children}</g>, name);
const dot = (x: number, y: number, r = 1.6) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
const WireIcon = SI(<>{dot(4.5, 7)}<path d="M5 7 H11 V17 H19" />{dot(19.5, 17)}</>, 'Wire');
const BusIcon = SI(<><path d="M4 6 V12 L10 18 H20" strokeWidth={2.4} />{dot(4, 6, 1.4)}{dot(20, 18, 1.4)}</>, 'Bus');
const BusEntryIcon = SI(<><path d="M6.5 7.5 L17.5 16.5" />{dot(6.5, 7.5, 1.4)}{dot(17.5, 16.5, 1.4)}</>, 'BusEntry');
const NetLabelIcon = SI(<><rect x={3} y={7} width={18} height={10} rx={1} /><path d="M8 15 V10 L14 15 V10" /></>, 'NetLabel');
const GndIcon = SI(<path d="M12 4 V12 M6 12 H18 M8.5 15 H15.5 M11 18 H13" />, 'Gnd');
const NetPortIcon = SI(<path d="M4 8 H14 L20 12 L14 16 H4 Z" />, 'NetPort');
const VccIcon = SI(<><path d="M6 10 H18 M12 10 V20" /><text x={12} y={7.5} fontSize={6} textAnchor="middle" fill="currentColor" stroke="none" fontFamily="sans-serif">VCC</text></>, 'Vcc');
const V5Icon = SI(<><path d="M6 10 H18 M12 10 V20" /><text x={12} y={7.5} fontSize={6} textAnchor="middle" fill="currentColor" stroke="none" fontFamily="sans-serif">+5V</text></>, 'V5');
const NoConnectIcon = SI(<path d="M7 7 L17 17 M17 7 L7 17" />, 'NoConnect');
const ProbeIcon = SI(<><path d="M5 19 L13 11" /><path d="M11 9 L15 13 L13 15 Z" fill="currentColor" stroke="none" /><path d="M14 7 q1.5 1.6 3 0 q1.5 -1.6 3 0" /></>, 'Probe');
const PinIcon = SI(<>{dot(4.5, 12)}<path d="M6 12 H14 M16 8 V16" /></>, 'Pin');
const LineIcon = SI(<path d="M4 16 L9 9 L13 14 L20 6" />, 'Line');
const BezierIcon = SI(<path d="M4 17 C4 9 11 9 12 12 C13 15 20 15 20 7" />, 'Bezier');
const ArcIcon = SI(<><path d="M5 17 A10 10 0 0 1 17 5" />{dot(5, 17, 1.4)}{dot(17, 5, 1.4)}</>, 'Arc');
const ArcCIcon = SI(<><path d="M5 19 A14 14 0 0 1 19 5" />{dot(5, 19, 1.4)}</>, 'ArcC');
const ArrowIcon = SI(<path d="M8 5 L16 12 L8 19" />, 'ArrowTool');
const PieIcon = SI(<path d="M12 12 L12 4 A8 8 0 1 0 20 12 Z" />, 'Pie');
const OriginIcon = SI(<><path d="M5 5 V19 H19" /><path d="M2.5 8 L5 5 L7.5 8" /><path d="M16 16.5 L19 19 L16 21.5" /></>, 'Origin');
const TextIcon = SI(<path d="M5 6 H19 M12 6 V18 M9 18 H15" />, 'TextTool');
const RectIcon = SI(<rect x={5} y={6.5} width={14} height={11} rx={0.5} />, 'RectTool');
const EllipseIcon = SI(<circle cx={12} cy={12} r={7} />, 'EllipseTool');
const PolygonIcon = SI(<path d="M4 6 H13 L20 12 L13 18 H4 Z" />, 'PolygonTool');
const TrackIcon = SI(<>{dot(4.5, 7)}<path d="M5 7 H11 V17 H19" strokeWidth={2} />{dot(19.5, 17)}</>, 'Track');
const PadIcon = SI(<circle cx={12} cy={12} r={6.5} strokeWidth={3.4} />, 'Pad');
const ViaIcon = SI(<><circle cx={12} cy={12} r={6.5} /><circle cx={12} cy={12} r={2.4} /></>, 'Via');
const HoleIcon = SI(<><circle cx={12} cy={12} r={6.5} /><path d="M12 2.5 V6.5 M12 17.5 V21.5 M2.5 12 H6.5 M17.5 12 H21.5" /></>, 'Hole');
const AngleIcon = SI(<><path d="M5 19 H20 M5 19 L17 7" /><path d="M12 19 A7 7 0 0 0 9.7 13.6" /></>, 'AngleTool');
const DimensionIcon = SI(<><path d="M6 17 L18 7" /><path d="M6 17 l1.6 -4 M6 17 l4 -1.6" /><path d="M18 7 l-1.6 4 M18 7 l-4 1.6" /></>, 'DimensionTool');
const FillIcon = SI(<><rect x={5} y={6} width={14} height={12} rx={1} /><path d="M7 15 L15 7 M10 17 L17 10 M7 11 L11 7" /></>, 'Fill');
const CopperIcon = SI(<><path d="M4 7 H20 V17 H4 Z" /><path d="M6 15 L14 7 M9 17 L18 8 M4 12 L9 7" /></>, 'Copper');

// ── Definicje narzędzi ────────────────────────────────────────────────────────
const WIRING_TOOLS: Tool[] = [
  { id: 'wire', title: 'Wire (W)', icon: WireIcon },
  { id: 'bus', title: 'Bus (B)', icon: BusIcon },
  { id: 'busentry', title: 'Bus Entry (U)', icon: BusEntryIcon },
  { id: 'netlabel', title: 'Net Label (N)', icon: NetLabelIcon },
  { id: 'gnd', title: 'Net Flag GND (Ctrl+G)', icon: GndIcon },
  { id: 'netport', title: 'Port Sieci', icon: NetPortIcon },
  { id: 'vcc', title: 'NetFlag VCC (Ctrl+Q)', icon: VccIcon },
  { id: 'v5', title: 'Flaga sieci +5V', icon: V5Icon },
  { id: 'noconnect', title: 'Flaga braku połączenia', icon: NoConnectIcon },
  { id: 'probe', title: 'Sonda napięcia', icon: ProbeIcon },
  { id: 'pin', title: 'Pin (P)', icon: PinIcon },
];
// Skróty narzędzi sieciowych arkusza (mają pierwszeństwo przed skrótami rysowania symbolu)
const SHEET_SHORTCUTS: Record<string, string> = { w: 'wire', b: 'bus', u: 'busentry', n: 'netlabel' };
// Narzędzia rysowania edytora symbolu — akcje + skróty klawiszowe
const SYMBOL_TOOLS: Tool[] = [
  { id: 'pin', title: 'Pin (P)', icon: PinIcon },
  { id: 'line', title: 'Line (L)', icon: LineIcon },
  { id: 'bezier', title: 'Bezier (Q)', icon: BezierIcon },
  { id: 'arc', title: 'Arc (C)', icon: ArcIcon },
  { id: 'arrow', title: 'Końcówka strzałki', icon: ArrowIcon },
  { id: 'text', title: 'Text (T)', icon: TextIcon },
  { id: 'freehand', title: 'Freehand Draw (F)', icon: CreateOutlinedIcon },
  { id: 'rect', title: 'Rectangle (S)', icon: RectIcon },
  { id: 'polygon', title: 'Polygon (O)', icon: PolygonIcon },
  { id: 'ellipse', title: 'Ellipse (E)', icon: EllipseIcon },
  { id: 'pie', title: 'Wycinek koła', icon: PieIcon },
  { id: 'image', title: 'Obraz', icon: ImageOutlinedIcon },
  { id: 'pan', title: 'Przeciągnij', icon: PanToolOutlinedIcon },
  { id: 'origin', title: 'Set Canvas Origin (Home)', icon: OriginIcon },
];
// Skrót klawiszowy → id narzędzia
const SYMBOL_SHORTCUTS: Record<string, string> = { p: 'pin', l: 'line', q: 'bezier', c: 'arc', t: 'text', f: 'freehand', s: 'rect', o: 'polygon', e: 'ellipse' };

// ── Górny pasek menu (Plik → Nowy → Symbol) ───────────────────────────────────
// Pozycja menu ze skrótem po prawej (Cmd+Z itp.)
function MI({ label, sc, icon, disabled, onClick }: { label: string; sc?: string; icon?: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return <MenuItem disabled={disabled} onClick={onClick} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 240 }}>{icon}<span>{label}</span>{sc && <span style={{ marginLeft: 'auto', color: '#9aa0a6', fontSize: 12.5, paddingLeft: 24 }}>{sc}</span>}</MenuItem>;
}
function TopMenuBar({ editor, onNewProject, onNewSymbol, onNewSchematic, onNewPcb, onNewFootprint, onSave, onImport, onOpenProject, editOps, formatOps, placeTools, onPlaceTool, onPanTool, onFind, onFindSimilar, onSaveProject, onSaveProjectAs, saving, onExportObj, onExportGerber }: { editor: Editor; onNewProject: () => void; onNewSymbol: () => void; onNewSchematic: () => void; onNewPcb: () => void; onNewFootprint: () => void; onSave?: () => void; onImport: () => void; onOpenProject: () => void; editOps: EditOps; formatOps: FormatOps; placeTools: Tool[]; onPlaceTool: (id: string) => void; onPanTool: () => void; onFind: () => void; onFindSimilar: () => void; onSaveProject: () => void; onSaveProjectAs: () => void; saving: boolean; onExportObj: () => void; onExportGerber: () => void }) {
  const menus: Record<Editor, string[]> = {
    schematic: ['Plik', 'Edycja', 'Umieść', 'Format', 'Zobacz', 'Design', 'Narzędzia', 'Fabrication', 'Zaawansowane', 'Ustawienia', 'Pomoc'],
    pcb: ['Plik', 'Edycja', 'Umieść', 'Format', 'Zobacz', 'Design', 'Trasa', 'Narzędzia', 'Fabrication', 'Zaawansowane', 'Ustawienia', 'Pomoc'],
    symbol: ['Plik', 'Edycja', 'Umieść', 'Format', 'Zobacz', 'Narzędzia', 'Zaawansowane', 'Ustawienia', 'Pomoc'],
    footprint: ['Plik', 'Edycja', 'Umieść', 'Format', 'Zobacz', 'Narzędzia', 'Zaawansowane', 'Ustawienia', 'Pomoc'],
  };
  const [plikAnchor, setPlikAnchor] = useState<null | HTMLElement>(null);
  const [nowyAnchor, setNowyAnchor] = useState<null | HTMLElement>(null);
  const [eksportAnchor, setEksportAnchor] = useState<null | HTMLElement>(null);
  const [open, setOpen] = useState<{ name: string; el: HTMLElement } | null>(null);
  const closeAll = () => { setPlikAnchor(null); setNowyAnchor(null); setEksportAnchor(null); setOpen(null); };
  const fs = !formatOps.hasSel, es = !editOps.hasSel;
  return (
    <Box sx={{ height: 40, flexShrink: 0, bgcolor: C.bar, borderBottom: `1px solid ${C.barBorder}`, display: 'flex', alignItems: 'center', px: 1.5, ...HSCROLL_SX }}>
      {menus[editor].map((m) => (
        <Box key={m} onClick={(e) => { if (m === 'Plik') setPlikAnchor(e.currentTarget as HTMLElement); else if (m === 'Edycja' || m === 'Umieść' || m === 'Format') setOpen({ name: m, el: e.currentTarget as HTMLElement }); }}
          sx={{ px: 1, py: 0.5, fontSize: 13.5, color: C.menuText, cursor: 'default', borderRadius: 0.5, '&:hover': { bgcolor: '#eef1f4' } }}>{m}</Box>
      ))}
      <Menu anchorEl={plikAnchor} open={Boolean(plikAnchor)} onClose={closeAll}>
        <MenuItem onClick={(e) => setNowyAnchor(e.currentTarget as HTMLElement)} sx={{ fontSize: 13.5, gap: 2 }}>Nowy <KeyboardArrowRightIcon sx={{ fontSize: 18, ml: 'auto' }} /></MenuItem>
        <MenuItem sx={{ fontSize: 13.5 }} onClick={() => { onOpenProject(); closeAll(); }}>Otwórz…</MenuItem>
        <MenuItem sx={{ fontSize: 13.5 }} onClick={() => { onImport(); closeAll(); }}>Importuj…</MenuItem>
        <Divider />
        <MenuItem disabled={saving} sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onSaveProject(); closeAll(); }}><SaveOutlinedIcon sx={{ fontSize: 17 }} />{saving ? 'Zapisywanie…' : 'Zapisz'}</MenuItem>
        <MenuItem disabled={saving} sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onSaveProjectAs(); closeAll(); }}><SaveOutlinedIcon sx={{ fontSize: 17 }} />Zapisz jako…</MenuItem>
        {onSave && <MenuItem sx={{ fontSize: 13.5 }} onClick={() => { onSave(); closeAll(); }}>{editor === 'footprint' ? 'Zapisz jako Footprint…' : 'Zapisz jako Symbol…'}</MenuItem>}
        <Divider />
        <MenuItem onClick={(e) => setEksportAnchor(e.currentTarget as HTMLElement)} sx={{ fontSize: 13.5, gap: 2 }}>Eksport <KeyboardArrowRightIcon sx={{ fontSize: 18, ml: 'auto' }} /></MenuItem>
      </Menu>
      <Menu anchorEl={eksportAnchor} open={Boolean(eksportAnchor)} onClose={closeAll} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onExportObj(); closeAll(); }}><ViewInArIcon sx={{ fontSize: 17, color: '#c9a227' }} />OBJ (model 3D płytki)…</MenuItem>
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onExportGerber(); closeAll(); }}><GridOnIcon sx={{ fontSize: 17, color: '#c9a227' }} />Gerber (ZIP)…</MenuItem>
      </Menu>
      <Menu anchorEl={nowyAnchor} open={Boolean(nowyAnchor)} onClose={closeAll} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onNewProject(); closeAll(); }}><FolderOpenIcon sx={{ fontSize: 17, color: C.icon }} />Projekt…</MenuItem>
        <Divider />
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onNewSchematic(); closeAll(); }}><DescriptionOutlinedIcon sx={{ fontSize: 17, color: '#2f7fe0' }} />Schemat</MenuItem>
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onNewPcb(); closeAll(); }}><GridOnIcon sx={{ fontSize: 17, color: '#3aa757' }} />PCB</MenuItem>
        <Divider />
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onNewSymbol(); closeAll(); }}><MemoryOutlinedIcon sx={{ fontSize: 17, color: '#3b82d6' }} />Symbol</MenuItem>
        <MenuItem sx={{ fontSize: 13.5, gap: 1.5 }} onClick={() => { onNewFootprint(); closeAll(); }}><DeveloperBoardIcon sx={{ fontSize: 17, color: '#e0533d' }} />Footprint</MenuItem>
      </Menu>
      {/* Edycja */}
      <Menu anchorEl={open?.name === 'Edycja' ? open.el : null} open={open?.name === 'Edycja'} onClose={closeAll}>
        <MI label="Cofnij" sc="Cmd+Z" icon={<UndoIcon sx={{ fontSize: 17, color: editOps.canUndo ? C.icon : C.iconDisabled }} />} disabled={!editOps.canUndo} onClick={() => { editOps.undo(); closeAll(); }} />
        <MI label="Ponów" sc="Cmd+Y" icon={<RedoIcon sx={{ fontSize: 17, color: editOps.canRedo ? C.icon : C.iconDisabled }} />} disabled={!editOps.canRedo} onClick={() => { editOps.redo(); closeAll(); }} />
        <MI label="Kopiuj" sc="Cmd+C" icon={<ContentCopyOutlinedIcon sx={{ fontSize: 17 }} />} disabled={es} onClick={() => { editOps.copy(); closeAll(); }} />
        <MI label="Wklej" sc="Cmd+V" icon={<ContentPasteOutlinedIcon sx={{ fontSize: 17 }} />} disabled={!editOps.hasClip} onClick={() => { editOps.paste(); closeAll(); }} />
        <MI label="Wytnij" sc="Cmd+X" icon={<ContentCutIcon sx={{ fontSize: 17 }} />} disabled={es} onClick={() => { editOps.cut(); closeAll(); }} />
        <MI label="Usuń" sc="Delete" icon={<DeleteOutlineIcon sx={{ fontSize: 17 }} />} disabled={es} onClick={() => { editOps.del(); closeAll(); }} />
        <MI label="Przeciągnij" sc="D" icon={<PanToolOutlinedIcon sx={{ fontSize: 17 }} />} onClick={() => { onPanTool(); closeAll(); }} />
        <Divider />
        <MI label="Znajdź…" sc="Cmd+F" onClick={() => { onFind(); closeAll(); }} />
        <MI label="Find Similar Objects…" sc="Cmd+Shift+F" onClick={() => { onFindSimilar(); closeAll(); }} />
      </Menu>
      {/* Umieść — narzędzia z pływających palet */}
      <Menu anchorEl={open?.name === 'Umieść' ? open.el : null} open={open?.name === 'Umieść'} onClose={closeAll} sx={{ '& .MuiPaper-root': { maxHeight: 460 } }}>
        {placeTools.map((t) => <MenuItem key={t.id} onClick={() => { onPlaceTool(t.id); closeAll(); }} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 220 }}><t.icon sx={{ fontSize: 17, color: C.icon }} />{t.title}</MenuItem>)}
      </Menu>
      {/* Format */}
      <Menu anchorEl={open?.name === 'Format' ? open.el : null} open={open?.name === 'Format'} onClose={closeAll}>
        <MI label="Obróć w lewo o 90°" icon={<RotateLeftIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.rotL(); closeAll(); }} />
        <MI label="Obróć w prawo o 90°" icon={<RotateRightIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.rotR(); closeAll(); }} />
        <MI label="Odbij w poziomie" sc="X" icon={<FlipIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.flipH(); closeAll(); }} />
        <MI label="Odbij w pionie" sc="Y" icon={<FlipIcon sx={{ fontSize: 17, transform: 'rotate(90deg)' }} />} disabled={fs} onClick={() => { formatOps.flipV(); closeAll(); }} />
        <Divider />
        <MI label="Wyrównaj do lewej" sc="Cmd+Shift+L" icon={<AlignHorizontalLeftIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.alignLeft(); closeAll(); }} />
        <MI label="Wyrównaj do prawej" sc="Cmd+Shift+R" icon={<AlignHorizontalRightIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.alignRight(); closeAll(); }} />
        <MI label="Wyrównaj do góry" sc="Cmd+Shift+O" icon={<AlignVerticalTopIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.alignTop(); closeAll(); }} />
        <MI label="Wyrównaj do spodu" sc="Cmd+Shift+B" icon={<AlignVerticalBottomIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.alignBottom(); closeAll(); }} />
        <MI label="Wyśrodkuj w poziomie" sc="Shift+Alt+H" icon={<AlignHorizontalCenterIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.centerH(); closeAll(); }} />
        <MI label="Wyśrodkuj w pionie" sc="Shift+Alt+E" icon={<AlignVerticalCenterIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.centerV(); closeAll(); }} />
        <MI label="Siatka wyrównania" sc="Cmd+Shift+G" icon={<GridOnIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.gridAlign(); closeAll(); }} />
        <MI label="Rozmieść w poziomie" sc="Cmd+Shift+H" icon={<HorizontalDistributeIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.distH(); closeAll(); }} />
        <MI label="Rozmieść w pionie" sc="Cmd+Shift+E" icon={<VerticalDistributeIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.distV(); closeAll(); }} />
        <MI label="Rozmieść równomiernie lewą krawędź" icon={<HorizontalDistributeIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.distLeft(); closeAll(); }} />
        <MI label="Rozmieść równomiernie górną krawędź" icon={<VerticalDistributeIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.distTop(); closeAll(); }} />
        <MI label="Distribute Array…" onClick={() => { formatOps.distArray(); closeAll(); }} />
        <Divider />
        <MI label="Przesuń na wierzch" icon={<FlipToFrontIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.front(); closeAll(); }} />
        <MI label="Przesuń na spód" icon={<FlipToBackIcon sx={{ fontSize: 17 }} />} disabled={fs} onClick={() => { formatOps.back(); closeAll(); }} />
      </Menu>
      <Box sx={{ flex: 1 }} />
    </Box>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function TbIcon({ icon: Icon, disabled, onClick, title }: { icon: SvgIconComponent; disabled?: boolean; onClick?: () => void; title?: string }) {
  const btn = <Box onClick={disabled ? undefined : onClick} sx={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0.75, cursor: disabled ? 'default' : 'pointer', '&:hover': { bgcolor: disabled ? 'transparent' : '#eef1f4' } }}><Icon sx={{ fontSize: 19, color: disabled ? C.iconDisabled : C.icon }} /></Box>;
  return title ? <Tooltip title={title} arrow placement="bottom" enterDelay={300} disableInteractive>{btn}</Tooltip> : btn;
}
const TbDiv = () => <Box sx={{ width: '1px', height: 22, bgcolor: '#e2e4e7', mx: 0.5 }} />;
const TbText = ({ label }: { label: string }) => <Box sx={{ px: 1, height: 28, display: 'flex', alignItems: 'center', borderRadius: 0.75, fontSize: 13, color: C.icon, '&:hover': { bgcolor: '#eef1f4' } }}>{label}</Box>;
interface EditOps { undo: () => void; redo: () => void; cut: () => void; copy: () => void; paste: () => void; del: () => void; canUndo: boolean; canRedo: boolean; hasSel: boolean; hasClip: boolean }
interface FormatOps {
  rotL: () => void; rotR: () => void; flipH: () => void; flipV: () => void;
  alignLeft: () => void; alignRight: () => void; alignTop: () => void; alignBottom: () => void; centerH: () => void; centerV: () => void;
  gridAlign: () => void; distH: () => void; distV: () => void; distLeft: () => void; distTop: () => void; distArray: () => void;
  front: () => void; back: () => void; hasSel: boolean;
}
function Toolbar({ editor, onSave, ops, fmt, onZoomIn, onZoomOut, onFit, onFind, onFindSimilar, onAnnotate, on3dView, onMyElements, onBom }: { editor: Editor; onSave?: () => void; ops: EditOps; fmt: FormatOps; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onFind: () => void; onFindSimilar: () => void; onAnnotate: () => void; on3dView?: () => void; onMyElements?: () => void; onBom?: () => void }) {
  return (
    <Box sx={{ height: 40, flexShrink: 0, bgcolor: C.bar, borderBottom: `1px solid ${C.barBorder}`, display: 'flex', alignItems: 'center', px: 1, ...HSCROLL_SX }}>
      <TbIcon icon={FolderOpenIcon} /><TbIcon icon={SaveOutlinedIcon} disabled={!onSave} onClick={onSave} title={editor === 'footprint' ? 'Zapisz jako Footprint' : 'Zapisz jako Symbol'} /><TbDiv />
      <TbIcon icon={UndoIcon} disabled={!ops.canUndo} onClick={ops.undo} title="Cofnij (Ctrl+Z)" /><TbIcon icon={RedoIcon} disabled={!ops.canRedo} onClick={ops.redo} title="Ponów (Ctrl+Y)" /><TbIcon icon={ContentCopyOutlinedIcon} disabled={!ops.hasSel} onClick={ops.copy} title="Kopiuj (Ctrl+C)" /><TbIcon icon={ContentPasteOutlinedIcon} disabled={!ops.hasClip} onClick={ops.paste} title="Wklej (Ctrl+V)" /><TbIcon icon={ContentCutIcon} disabled={!ops.hasSel} onClick={ops.cut} title="Wytnij (Ctrl+X)" /><TbIcon icon={DeleteOutlineIcon} disabled={!ops.hasSel} onClick={ops.del} title="Usuń (Del)" /><TbDiv />
      <TbIcon icon={SearchIcon} onClick={onFind} title="Znajdź…" /><TbIcon icon={ManageSearchIcon} onClick={onFindSimilar} title="Find Similar Objects…" /><TbIcon icon={StraightenIcon} onClick={onAnnotate} title="Adnotacja…" /><TbDiv />
      <TbIcon icon={ZoomInIcon} onClick={onZoomIn} title="Powiększ" /><TbIcon icon={ZoomOutIcon} onClick={onZoomOut} title="Pomniejsz" /><TbIcon icon={FitScreenIcon} onClick={onFit} title="Dopasuj do okna" />
      {editor === 'pcb' && (<><TbText label="2D" /><TbText label="3D" /></>)}<TbDiv />
      <TbIcon icon={RotateLeftIcon} disabled={!fmt.hasSel} onClick={fmt.rotL} title="Obróć w lewo 90°" /><TbIcon icon={RotateRightIcon} disabled={!fmt.hasSel} onClick={fmt.rotR} title="Obróć w prawo 90°" /><TbIcon icon={FlipIcon} disabled={!fmt.hasSel} onClick={fmt.flipH} title="Odbij w poziomie (X)" /><TbIcon icon={FlipVIcon} disabled={!fmt.hasSel} onClick={fmt.flipV} title="Odbij w pionie (Y)" />
      <TbIcon icon={AlignHorizontalLeftIcon} disabled={!fmt.hasSel} onClick={fmt.alignLeft} title="Wyrównaj do lewej" /><TbIcon icon={AlignHorizontalCenterIcon} disabled={!fmt.hasSel} onClick={fmt.centerH} title="Wyśrodkuj w poziomie" /><TbIcon icon={AlignHorizontalRightIcon} disabled={!fmt.hasSel} onClick={fmt.alignRight} title="Wyrównaj do prawej" />
      <TbIcon icon={AlignVerticalTopIcon} disabled={!fmt.hasSel} onClick={fmt.alignTop} title="Wyrównaj do góry" /><TbIcon icon={AlignVerticalCenterIcon} disabled={!fmt.hasSel} onClick={fmt.centerV} title="Wyśrodkuj w pionie" /><TbIcon icon={AlignVerticalBottomIcon} disabled={!fmt.hasSel} onClick={fmt.alignBottom} title="Wyrównaj do spodu" />
      <TbIcon icon={HorizontalDistributeIcon} disabled={!fmt.hasSel} onClick={fmt.distH} title="Rozmieść w poziomie" /><TbIcon icon={VerticalDistributeIcon} disabled={!fmt.hasSel} onClick={fmt.distV} title="Rozmieść w pionie" />
      <TbIcon icon={FlipToFrontIcon} disabled={!fmt.hasSel} onClick={fmt.front} title="Przesuń na wierzch" /><TbIcon icon={FlipToBackIcon} disabled={!fmt.hasSel} onClick={fmt.back} title="Przesuń na spód" />
      <Box sx={{ flex: 1 }} />
      {(editor === 'pcb' || editor === 'schematic') && <Box onClick={onMyElements} sx={{ px: 1.25, height: 28, display: 'flex', alignItems: 'center', gap: 0.75, borderRadius: 0.75, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.icon, '&:hover': { bgcolor: '#eef1f4' } }} title="Moje elementy — osobista biblioteka części"><Inventory2OutlinedIcon sx={{ fontSize: 18 }} />Moje elementy</Box>}
      {editor === 'pcb' && <Box onClick={onBom} sx={{ px: 1.25, height: 28, display: 'flex', alignItems: 'center', gap: 0.75, borderRadius: 0.75, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.icon, '&:hover': { bgcolor: '#eef1f4' } }} title="Lista BOM — zestawienie materiałowe projektu"><ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />Lista BOM</Box>}
      {editor === 'pcb' && <Box onClick={on3dView} sx={{ px: 1.25, height: 28, display: 'flex', alignItems: 'center', gap: 0.75, borderRadius: 0.75, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.icon, '&:hover': { bgcolor: '#eef1f4' } }} title="Podgląd płytki 3D (Scene3D)"><ViewInArIcon sx={{ fontSize: 18 }} />3dView</Box>}
    </Box>
  );
}


// ── Panel projektu ────────────────────────────────────────────────────────────
interface TreeExp { user: boolean; project: boolean }
function ProjectPanel({ width = 240, projectName, sheets, activeSheetId, pcbName, editor, exp, onToggle, onSelectDoc, onModifyDoc, onCtxProject, onCtxDoc, filter, onFilter }: {
  width?: number; projectName: string; sheets: SheetTab[]; activeSheetId: string; pcbName: string; editor: Editor;
  exp: TreeExp; onToggle: (node: 'user' | 'project') => void;
  onSelectDoc: (ref: DocRef) => void; onModifyDoc: (ref: DocRef) => void;
  onCtxProject: (e: React.MouseEvent) => void; onCtxDoc: (e: React.MouseEvent, ref: DocRef) => void;
  filter: string; onFilter: (v: string) => void;
}) {
  const caret = (open: boolean) => (open ? <KeyboardArrowDownIcon sx={{ fontSize: 16, color: C.icon }} /> : <KeyboardArrowRightIcon sx={{ fontSize: 16, color: C.icon }} />);
  const rowSx = (sel: boolean, pl: number) => ({ display: 'flex', alignItems: 'center', gap: 0.5, pl, pr: 1, py: 0.5, cursor: 'default', userSelect: 'none' as const, bgcolor: sel ? C.treeSel : 'transparent', color: sel ? '#fff' : '#2b2f34', '&:hover': { bgcolor: sel ? C.treeSel : '#eef1f4' } });
  const f = filter.trim().toLowerCase();
  const showPcb = !f || pcbName.toLowerCase().includes(f);
  return (
    <Box sx={{ width, flexShrink: 0, bgcolor: '#fff', borderRight: `1px solid ${C.panelBorder}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, color: '#2b2f34' }}>Work Space: Osobiste <KeyboardArrowDownIcon sx={{ fontSize: 18, ml: 0.25 }} /></Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, fontSize: 12.5, color: '#6b7177' }}><span>Wszystkie kategorie(28)</span><span style={{ color: '#c4c8cd' }}>|</span><span style={{ color: C.link }}>Otworzon…</span></Box>
      </Box>
      <Box sx={{ px: 1.5, pb: 1 }}><TextField size="small" placeholder="Filtr" value={filter} onChange={(e) => onFilter(e.target.value)} fullWidth InputProps={{ sx: { fontSize: 13, height: 30 } }} /></Box>
      <Box sx={{ flex: 1, overflow: 'auto', fontSize: 13.5 }}>
        <Box sx={rowSx(false, 1)} onClick={() => onToggle('user')}>{caret(exp.user)}<PersonOutlineIcon sx={{ fontSize: 17, color: '#606770' }} /> Mhersztowski</Box>
        {exp.user && (
          <Box sx={rowSx(false, 2.5)} onClick={() => onToggle('project')} onContextMenu={onCtxProject}>{caret(exp.project)}<FolderOutlinedIcon sx={{ fontSize: 16, color: '#e0a83a' }} /> {projectName}</Box>
        )}
        {exp.user && exp.project && sheets.filter((s) => !f || s.name.toLowerCase().includes(f)).map((s) => {
          const sel = editor === 'schematic' && activeSheetId === s.id;
          return <Box key={s.id} sx={rowSx(sel, 5)} onClick={() => onSelectDoc({ kind: 'sheet', id: s.id })} onDoubleClick={() => onModifyDoc({ kind: 'sheet', id: s.id })} onContextMenu={(e) => onCtxDoc(e, { kind: 'sheet', id: s.id })}><DescriptionOutlinedIcon sx={{ fontSize: 16, color: sel ? '#fff' : '#e0a83a' }} /> {s.name}</Box>;
        })}
        {exp.user && exp.project && showPcb && (
          <Box sx={rowSx(editor === 'pcb', 5)} onClick={() => onSelectDoc({ kind: 'pcb' })} onDoubleClick={() => onModifyDoc({ kind: 'pcb' })} onContextMenu={(e) => onCtxDoc(e, { kind: 'pcb' })}><GridOnIcon sx={{ fontSize: 16, color: editor === 'pcb' ? '#fff' : '#3aa757' }} /> {pcbName}</Box>
        )}
      </Box>
    </Box>
  );
}

// ── Zakładki dokumentów (wiele symboli) ───────────────────────────────────────
function DocTabs({ editor, setEditor, symbols, activeSymbolId, onSelectSymbol, onCloseSymbol, footprints, activeFootprintId, onSelectFootprint, onCloseFootprint, projectName, pcbName }: {
  editor: Editor; setEditor: (e: Editor) => void; symbols: SymbolTab[]; activeSymbolId: string | null; onSelectSymbol: (id: string) => void; onCloseSymbol: (id: string) => void;
  footprints: SymbolTab[]; activeFootprintId: string | null; onSelectFootprint: (id: string) => void; onCloseFootprint: (id: string) => void;
  projectName: string; pcbName: string;
}) {
  const tab = (active: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 0.75, px: 2, height: 34, borderRight: `1px solid ${C.barBorder}`,
    fontSize: 13.5, cursor: 'default', bgcolor: active ? '#fff' : '#f0f2f4', color: active ? '#2b2f34' : '#6b7177',
    borderTop: active ? '2px solid #4a90e2' : '2px solid transparent',
  });
  return (
    <Box sx={{ height: 35, flexShrink: 0, bgcolor: '#f0f2f4', borderBottom: `1px solid ${C.barBorder}`, display: 'flex', alignItems: 'stretch', ...HSCROLL_SX }}>
      <Box sx={tab(false)}>Start</Box>
      <Box sx={tab(editor === 'schematic')} onClick={() => setEditor('schematic')}><FolderOutlinedIcon sx={{ fontSize: 16, color: '#e0a83a' }} /> {projectName}</Box>
      <Box sx={tab(editor === 'pcb')} onClick={() => setEditor('pcb')}><GridOnIcon sx={{ fontSize: 16, color: '#3aa757' }} /> *{pcbName}</Box>
      {symbols.map((s) => (
        <Box key={s.id} sx={tab(editor === 'symbol' && activeSymbolId === s.id)} onClick={() => onSelectSymbol(s.id)}>
          <MemoryOutlinedIcon sx={{ fontSize: 16, color: '#3b82d6' }} /> {s.name}
          <CloseIcon sx={{ fontSize: 14, ml: 0.5, color: C.icon }} onClick={(e) => { e.stopPropagation(); onCloseSymbol(s.id); }} />
        </Box>
      ))}
      {footprints.map((s) => (
        <Box key={s.id} sx={tab(editor === 'footprint' && activeFootprintId === s.id)} onClick={() => onSelectFootprint(s.id)}>
          <DeveloperBoardIcon sx={{ fontSize: 16, color: '#e0533d' }} /> {s.name}
          <CloseIcon sx={{ fontSize: 14, ml: 0.5, color: C.icon }} onClick={(e) => { e.stopPropagation(); onCloseFootprint(s.id); }} />
        </Box>
      ))}
    </Box>
  );
}

// ── Dynamiczna linijka (dostosowuje się do pan/zoom) ──────────────────────────
function Ruler({ orientation, view, length, originAxis, unit = 1 }: { orientation: 'h' | 'v'; view: View; length: number; originAxis: number; unit?: number }) {
  const horiz = orientation === 'h';
  const offset = horiz ? view.x : view.y;
  const z = view.zoom;
  const sign = horiz ? 1 : -1; // pion: oś do góry
  const step = niceNum(70 / z * unit); // krok w jednostkach wyświetlania (unit = świat→jednostka, np. mm)
  // wartość WYŚWIETLANA (unit) w pozycji ekranowej s / pozycja ekranowa dla wartości wyświetlanej
  const valAt = (s: number) => sign * ((s - offset) / z - originAxis) * unit;
  const screenAt = (val: number) => offset + (sign * (val / unit) + originAxis) * z;
  const vA = valAt(0), vB = valAt(length);
  const lo = Math.min(vA, vB), hi = Math.max(vA, vB);
  const fmt = (v: number) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step < 0.1 ? 2 : 1));
  const ticks: { s: number; label: string }[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) {
    const s = screenAt(v);
    if (s >= -2 && s <= length + 2) ticks.push({ s, label: fmt(v) });
  }
  if (horiz) return (
    <Box sx={{ height: 18, flex: 1, bgcolor: '#f4f5f7', borderBottom: `1px solid ${C.barBorder}`, position: 'relative', overflow: 'hidden' }}>
      {ticks.map((t, i) => <Box key={i} sx={{ position: 'absolute', left: t.s, top: 0, bottom: 0, borderLeft: '1px solid #d4d7da' }}><Box component="span" sx={{ position: 'absolute', left: 2, top: 2, fontSize: 9, color: '#8a9096', whiteSpace: 'nowrap' }}>{t.label}</Box></Box>)}
    </Box>
  );
  return (
    <Box sx={{ width: 18, bgcolor: '#f4f5f7', borderRight: `1px solid ${C.barBorder}`, position: 'relative', overflow: 'hidden' }}>
      {ticks.map((t, i) => <Box key={i} sx={{ position: 'absolute', top: t.s, left: 0, right: 0, borderTop: '1px solid #d4d7da' }}><Box component="span" sx={{ position: 'absolute', top: 1, left: 1, fontSize: 9, color: '#8a9096', writingMode: 'vertical-rl' }}>{t.label}</Box></Box>)}
    </Box>
  );
}

// ── Biblioteka symboli schematu ───────────────────────────────────────────────
interface CompDef { id: string; name: string; category: string; refPrefix: string; pins: number; draw: (preview?: boolean) => React.ReactNode }
interface EasyEdaSym { shapes: string[]; bbox: { x: number; y: number; width: number; height: number } | null }
interface PlacedComp {
  id: string; defId: string; x: number; y: number; ref: string; label: string; pins: number;
  octopart?: boolean; easyeda?: EasyEdaSym; fp?: EasyEdaSym; savedEls?: El[]; fpEls?: FpEl[];
  pcbX?: number; pcbY?: number; // pozycja footprintu na PCB (niezależna od pozycji symbolu x/y na schemacie)
  // Właściwości komponentu (sheet/PCB) — prezentacja + atrybuty
  layer?: string; rotation?: number; showPrefix?: string; showName?: string; addToBom?: string; locked?: string; convertToPcb?: string; displayFootprint?: string;
  footprint?: string; supplier?: string; supplierPart?: string; manufacturer?: string; mfrPart?: string; jlcpcb?: string; link?: string; model3d?: string;
}

// Kolor warstwy footprintu EasyEDA
const fpLayerColor = (layer: string) => ({ '1': '#d94a4a', '2': '#3a6bd6', '3': '#e8c84a', '10': '#c9a227', '11': '#c9a227', '12': '#e8c84a', '100': '#c9a227' } as Record<string, string>)[layer] ?? '#e8c84a';
// Numer warstwy EasyEDA → nazwa naszej warstwy (kolor z panelu Layers); EE_FLIP zamienia górne↔dolne (dla dolnej strony)
const EE_LAYER_NAME: Record<string, string> = { '1': 'Górna warstwa', '2': 'Dolna warstwa', '3': 'Górna warstwa opisowa', '4': 'Dolna warstwa opisowa', '5': 'Górna warstwa maski pasty lutowniczej', '6': 'Dolna warstwa maski pasty lutowniczej', '7': 'Górna warstwa maski lutowniczej', '8': 'Dolna warstwa maski lutowniczej', '10': 'Obrys płyty', '11': 'Wielowastwa', '12': 'Dokument', '13': 'Górny montaż', '14': 'Dolny montaż', '100': 'Wielowastwa' };
const EE_FLIP: Record<string, string> = { '1': '2', '2': '1', '3': '4', '4': '3', '5': '6', '6': '5', '7': '8', '8': '7', '13': '14', '14': '13' };
const eeLayerColor = (layerNum: string, layers?: LayerState, flip?: boolean): string => {
  const ln = flip && EE_FLIP[layerNum] ? EE_FLIP[layerNum] : layerNum;
  const name = EE_LAYER_NAME[ln];
  if (name && layers && layers[name]) return layers[name].color;
  return name ? fpLayer(name) : fpLayerColor(layerNum);
};

// Transform tekstu utrzymujący go „prosto" (poziomo, czytelnie) mimo obrotu/odbicia grupy nadrzędnej.
// Kontr-rotacja wokół punktu zaczepienia tekstu (+ ewentualne odbicie dla strony dolnej/flipa).
const uprightT = (x: number, y: number, rot?: number, mir?: boolean): string | undefined => {
  const r = rot || 0; if (!r && !mir) return undefined;
  return mir ? `translate(${x} ${y}) scale(-1 1) rotate(${-r}) translate(${-x} ${-y})` : `rotate(${-r} ${x} ${y})`;
};
// Parser footprintu EasyEDA (packageDetail.dataStr.shape) → SVG na canvas PCB
function renderFootprint(fp: EasyEdaSym, preview?: boolean, layers?: LayerState, flip?: boolean, tr?: number) {
  const SC = 4; // 1 jednostka ≈ 10 mil → skala dla czytelności
  const cx = fp.bbox ? fp.bbox.x + fp.bbox.width / 2 : 0;
  const cy = fp.bbox ? fp.bbox.y + fp.bbox.height / 2 : 0;
  const out: React.ReactNode[] = [];
  const col = (ln: string) => eeLayerColor(ln, layers, flip); // kolor wg warstwy (z panelu Layers, z odbiciem strony)
  fp.shapes.forEach((s, i) => {
    const t = s.split('~');
    switch (t[0]) {
      case 'PAD': {
        // PAD~shape~cx~cy~w~h~layer~net~num~holeR~... → t[6] = warstwa (1 top / 2 bottom / 11 multi)
        const shape = t[1], px = +t[2], py = +t[3], w = +t[4], h = +t[5], pc = col(t[6] || '11'), num = t[8], holeR = +t[9] || 0;
        if (shape === 'RECT') out.push(<rect key={`pad${i}`} x={px - w / 2} y={py - h / 2} width={w} height={h} fill={pc} stroke="none" opacity={preview ? 0.6 : 0.95} />);
        else out.push(<ellipse key={`pad${i}`} cx={px} cy={py} rx={w / 2} ry={h / 2} fill={pc} stroke="none" opacity={preview ? 0.6 : 0.95} />);
        if (holeR > 0) out.push(<circle key={`hole${i}`} cx={px} cy={py} r={holeR} fill="#111" stroke="none" />);
        if (num) out.push(<text key={`num${i}`} x={px} y={py + 0.6} fontSize={1.6} fill="#1b1f24" stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(px, py + 0.6, tr, flip)}>{num}</text>);
        break;
      }
      case 'TRACK': out.push(<polyline key={`trk${i}`} points={t[4]} fill="none" stroke={col(t[2])} strokeWidth={Math.max(0.15, +t[1] || 0.6)} strokeLinecap="round" opacity={preview ? 0.6 : 1} />); break;
      case 'CIRCLE': out.push(<circle key={`cir${i}`} cx={+t[1]} cy={+t[2]} r={+t[3]} fill="none" stroke={col(t[5])} strokeWidth={Math.max(0.12, +t[4] || 0.3)} opacity={preview ? 0.6 : 1} />); break;
      case 'ARC': out.push(<path key={`arc${i}`} d={t[4]} fill="none" stroke={col(t[2])} strokeWidth={Math.max(0.15, +t[1] || 0.5)} opacity={preview ? 0.6 : 1} />); break;
      default: break; // SOLIDREGION / SVGNODE / TEXT — pomijamy
    }
  });
  return <g transform={`scale(${SC}) translate(${-cx},${-cy})`}>{out}</g>;
}
function renderPcbPart(comp: PlacedComp, key: React.Key, preview = false, layers?: LayerState) {
  const bottom = comp.layer === 'Dolna warstwa'; // dolna strona → lustro + zamiana warstw góra↔dół (kolory)
  const rot = comp.rotation || 0;
  const body = comp.fp
    ? renderFootprint(comp.fp, preview, layers, bottom, rot)
    : comp.fpEls && comp.fpEls.length
      // Footprint z Work Space (własne FpEl na warstwach) — wyśrodkowany w (0,0), renderowany z kolorami warstw.
      ? (() => { const bb = unionBB(comp.fpEls, elBBoxFp); return <g transform={`translate(${-(bb.x + bb.w / 2)},${-(bb.y + bb.h / 2)})`}>{comp.fpEls.map((el, i) => renderFpEl(el, i, preview, layers))}</g>; })()
      : <g><rect x={-14} y={-10} width={28} height={20} fill="none" stroke="#e8c84a" strokeWidth={1} strokeDasharray={preview ? '3 2' : undefined} /></g>;
  // Footprint na PCB ma WŁASNĄ pozycję (pcbX/pcbY), niezależną od symbolu na schemacie (x/y).
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y;
  const tf = `translate(${px},${py}) rotate(${rot})${bottom ? ' scale(-1,1)' : ''}`;
  return <g key={key} transform={tf} opacity={preview ? 0.7 : 1}>{body}
    {comp.showPrefix !== 'Nie' && <text x={0} y={-14} fontSize={7} fill={bottom ? '#3a6bd6' : '#e8c84a'} stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(0, -14, rot, bottom)}>{comp.ref}</text>}
    {comp.showName === 'Tak' && <text x={0} y={16} fontSize={6} fill={bottom ? '#3a6bd6' : '#e8c84a'} stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(0, 16, rot, bottom)}>{comp.label}</text>}
  </g>;
}

// Geometria linii pinu: z ścieżki (M x y h/v/l) + punktu kropki wyznacz koniec wewnętrzny (przy body) i kierunek
function parsePinLine(d: string, dot: { x: number; y: number }) {
  const m = d.match(/M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*([hvHVlL])?\s*(-?[\d.]+)?(?:[ ,]+(-?[\d.]+))?/);
  if (!m) return { inner: dot, dir: { x: 1, y: 0 } };
  const sx = +m[1], sy = +m[2], cmd = m[3], a = m[4] ? +m[4] : 0, b = m[5] ? +m[5] : 0;
  let ex = sx, ey = sy;
  if (cmd === 'h') ex = sx + a; else if (cmd === 'H') ex = a;
  else if (cmd === 'v') ey = sy + a; else if (cmd === 'V') ey = a;
  else if (cmd === 'l') { ex = sx + a; ey = sy + b; } else if (cmd === 'L') { ex = a; ey = b; }
  const inner = Math.hypot(ex - dot.x, ey - dot.y) >= Math.hypot(sx - dot.x, sy - dot.y) ? { x: ex, y: ey } : { x: sx, y: sy };
  const len = Math.hypot(inner.x - dot.x, inner.y - dot.y) || 1;
  return { inner, dir: { x: (inner.x - dot.x) / len, y: (inner.y - dot.y) / len } };
}

// Parser symbolu EasyEDA (dataStr.shape) → elementy SVG, wyśrodkowany w (0,0)
type PinInfo = { i: number; dot: Pt; inner: Pt; dir: Pt; name: string; nameColor: string; num: string; numColor: string };
function renderEasyEdaSymbol(sym: EasyEdaSym, preview?: boolean, tr?: number, mir?: boolean) {
  const p = scProps(preview);
  const cx = sym.bbox ? sym.bbox.x + sym.bbox.width / 2 : 0;
  const cy = sym.bbox ? sym.bbox.y + sym.bbox.height / 2 : 0;
  const out: React.ReactNode[] = [];
  const pins: PinInfo[] = [];
  sym.shapes.forEach((s, i) => {
    const t = s.split('~');
    switch (t[0]) {
      case 'R': out.push(<rect key={i} x={+t[1]} y={+t[2]} rx={+t[3] || 0} ry={+t[4] || 0} width={+t[5]} height={+t[6]} {...p} />); break;
      case 'E': out.push(<ellipse key={i} cx={+t[1]} cy={+t[2]} rx={+t[3]} ry={+t[4]} {...p} />); break;
      case 'PL': case 'PG': { const pts = t[1]; if (t[0] === 'PG') out.push(<polygon key={i} points={pts} {...p} />); else out.push(<polyline key={i} points={pts} {...p} />); break; }
      case 'PT': case 'A': out.push(<path key={i} d={t[1]} {...p} />); break;
      case 'P': {
        const segs = s.split('^^'); const pathD = segs[2]?.split('~')[0]; const ds = segs[1]?.split('~');
        const dot = ds && ds.length >= 2 ? { x: +ds[0], y: +ds[1] } : null;
        if (pathD) out.push(<path key={`pp${i}`} d={pathD} {...p} />);
        if (dot) out.push(<circle key={`pd${i}`} cx={dot.x} cy={dot.y} r={1.4} fill={RED} stroke="none" />);
        if (dot && pathD) {
          const { inner, dir } = parsePinLine(pathD, dot);
          const nameSeg = segs[3]?.split('~'), numSeg = segs[4]?.split('~');
          pins.push({ i, dot, inner, dir, name: nameSeg && nameSeg[0] === '1' && nameSeg[4] ? nameSeg[4] : '', nameColor: nameSeg?.[8] || '#0000FF', num: numSeg && numSeg[0] === '1' && numSeg[4] ? numSeg[4] : '', numColor: numSeg?.[8] || '#0000FF' });
        }
        break;
      }
      default: break;
    }
  });
  // Rozmieszczenie etykiet pinów: grupuj wg strony, a gdy gęsto — układaj w kilku rzędach (kolumnach),
  // aby nazwy/numery nie nachodziły na siebie (greedy: najniższy wolny rząd wzdłuż osi pinów).
  const fs = 6, gap = 3;
  const sideKey = (pn: PinInfo) => (Math.abs(pn.dir.x) >= Math.abs(pn.dir.y) ? (pn.dir.x >= 0 ? 'L' : 'R') : (pn.dir.y >= 0 ? 'T' : 'B'));
  const groups = new Map<string, PinInfo[]>();
  pins.forEach((pn) => { const g = groups.get(sideKey(pn)) || []; g.push(pn); groups.set(sideKey(pn), g); });
  groups.forEach((arr, k) => {
    const horiz = k === 'L' || k === 'R';
    arr.sort((a, b) => (horiz ? a.inner.y - b.inner.y : a.inner.x - b.inner.x));
    const maxNameLen = arr.reduce((m, pn) => Math.max(m, pn.name.length), 1);
    const nameCol = fs * (maxNameLen * 0.62 + 1.5), numCol = fs * 1.5, half = fs * 0.62;
    const rowEnds: number[] = [];
    arr.forEach((pn) => {
      const along = horiz ? pn.inner.y : pn.inner.x;
      let row = rowEnds.findIndex((e) => e <= along - half);
      if (row === -1) row = rowEnds.length;
      rowEnds[row] = along + half;
      if (pn.name) {
        const anchor = pn.dir.x > 0.3 ? 'start' : pn.dir.x < -0.3 ? 'end' : 'middle';
        const off = gap + row * nameCol; const nx = pn.inner.x + pn.dir.x * off, ny = pn.inner.y + pn.dir.y * off + (horiz ? fs * 0.35 : 0);
        out.push(<text key={`pname${pn.i}`} x={nx} y={ny} fontSize={fs} fill={pn.nameColor} stroke="none" textAnchor={anchor} fontFamily="sans-serif" transform={uprightT(nx, ny, tr, mir)}>{pn.name}</text>);
      }
      if (pn.num) {
        const perp = { x: -pn.dir.y, y: pn.dir.x }, sgn = perp.y <= 0 ? 1 : -1;
        const mx = (pn.dot.x + pn.inner.x) / 2, my = (pn.dot.y + pn.inner.y) / 2, off = gap + row * numCol;
        const qx = mx + perp.x * off * sgn, qy = my + perp.y * off * sgn - 0.6;
        out.push(<text key={`pnum${pn.i}`} x={qx} y={qy} fontSize={fs} fill={pn.numColor} stroke="none" textAnchor="middle" fontFamily="sans-serif" transform={uprightT(qx, qy, tr, mir)}>{pn.num}</text>);
      }
    });
  });
  return <g transform={`translate(${-cx},${-cy})`}>{out}</g>;
}

const RED = C.schRed;
const scProps = (preview?: boolean) => ({ stroke: RED, strokeWidth: 1.4, fill: 'none' as const, strokeDasharray: preview ? '4 3' : undefined });
const txt = (x: number, y: number, s: string, anchor: 'start' | 'middle' | 'end' = 'middle') => <text x={x} y={y} fontSize={9} fill={RED} stroke="none" textAnchor={anchor} fontFamily="sans-serif">{s}</text>;

// Generyczny symbol IC z N pinami (dla części z Octopart) — środek w (0,0)
function drawGenericIC(pins: number, label: string, preview?: boolean) {
  const perSide = Math.max(1, Math.ceil(pins / 2));
  const pitch = 12, h = Math.max(40, perSide * pitch + 10), w = Math.max(60, label.length * 6.5);
  const p = scProps(preview);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < perSide; i++) { const y = -h / 2 + 12 + i * pitch; nodes.push(<line key={`l${i}`} x1={-w / 2 - 16} y1={y} x2={-w / 2} y2={y} {...p} />); nodes.push(<text key={`ln${i}`} x={-w / 2 + 3} y={y + 3} fontSize={7} fill={RED} stroke="none">{i + 1}</text>); }
  for (let i = 0; i < pins - perSide; i++) { const y = -h / 2 + 12 + i * pitch; nodes.push(<line key={`r${i}`} x1={w / 2} y1={y} x2={w / 2 + 16} y2={y} {...p} />); nodes.push(<text key={`rn${i}`} x={w / 2 - 3} y={y + 3} fontSize={7} fill={RED} stroke="none" textAnchor="end">{perSide + i + 1}</text>); }
  return <g>{<rect x={-w / 2} y={-h / 2} width={w} height={h} {...p} />}{nodes}{txt(0, -h / 2 - 6, label)}</g>;
}

const SCHEMATIC_LIB: CompDef[] = [
  { id: 'R', name: 'Resistor', category: 'Passive', refPrefix: 'R', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -10, 'R?')}<line x1={-25} y1={0} x2={-12} y2={0} {...p} /><path d="M-12 0 l3 -6 l6 12 l6 -12 l6 12 l3 -6" {...p} /><line x1={12} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'C', name: 'Capacitor', category: 'Passive', refPrefix: 'C', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -14, 'C?')}<line x1={-25} y1={0} x2={-4} y2={0} {...p} /><line x1={-4} y1={-9} x2={-4} y2={9} {...p} /><line x1={4} y1={-9} x2={4} y2={9} {...p} /><line x1={4} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'L', name: 'Inductor', category: 'Passive', refPrefix: 'L', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -12, 'L?')}<line x1={-25} y1={0} x2={-15} y2={0} {...p} /><path d="M-15 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0 a5 5 0 0 1 10 0" {...p} /><line x1={15} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'D', name: 'Diode', category: 'Discrete', refPrefix: 'D', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -12, 'D?')}<line x1={-25} y1={0} x2={-7} y2={0} {...p} /><path d="M-7 -8 l14 8 l-14 8 Z" {...p} /><line x1={7} y1={-8} x2={7} y2={8} {...p} /><line x1={7} y1={0} x2={25} y2={0} {...p} /></g>; } },
  { id: 'LED', name: 'LED', category: 'Discrete', refPrefix: 'D', pins: 2, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -14, 'LED?')}<line x1={-25} y1={0} x2={-7} y2={0} {...p} /><path d="M-7 -8 l14 8 l-14 8 Z" {...p} /><line x1={7} y1={-8} x2={7} y2={8} {...p} /><line x1={7} y1={0} x2={25} y2={0} {...p} /><path d="M6 -10 l6 -6 m-2 -4 l4 0 0 4" {...p} /></g>; } },
  { id: 'Q', name: 'NPN Transistor', category: 'Discrete', refPrefix: 'Q', pins: 3, draw: (pv) => { const p = scProps(pv); return <g>{txt(14, -12, 'Q?')}<circle cx={0} cy={0} r={14} {...p} /><line x1={-20} y1={0} x2={-5} y2={0} {...p} /><line x1={-5} y1={-9} x2={-5} y2={9} {...p} /><line x1={-5} y1={-5} x2={8} y2={-12} {...p} /><line x1={-5} y1={5} x2={8} y2={12} {...p} /><line x1={8} y1={-12} x2={8} y2={-22} {...p} /><line x1={8} y1={12} x2={8} y2={22} {...p} /></g>; } },
  { id: 'GND', name: 'Ground', category: 'Power', refPrefix: 'GND', pins: 1, draw: (pv) => { const p = scProps(pv); return <g><line x1={0} y1={-14} x2={0} y2={0} {...p} /><line x1={-11} y1={0} x2={11} y2={0} {...p} /><line x1={-7} y1={5} x2={7} y2={5} {...p} /><line x1={-3} y1={10} x2={3} y2={10} {...p} /></g>; } },
  { id: 'VCC', name: 'VCC', category: 'Power', refPrefix: 'VCC', pins: 1, draw: (pv) => { const p = scProps(pv); return <g>{txt(0, -18, 'VCC')}<line x1={0} y1={14} x2={0} y2={0} {...p} /><line x1={-9} y1={0} x2={9} y2={0} {...p} /></g>; } },
  { id: 'U8', name: 'IC (8-pin)', category: 'IC', refPrefix: 'U', pins: 8, draw: (pv) => drawGenericIC(8, 'U?', pv) },
  { id: 'J1x4', name: 'Header 1x4', category: 'Connector', refPrefix: 'J', pins: 4, draw: (pv) => { const p = scProps(pv); const n: React.ReactNode[] = []; for (let i = 0; i < 4; i++) { const y = -21 + i * 14; n.push(<line key={i} x1={12} y1={y} x2={26} y2={y} {...p} />); n.push(<circle key={`c${i}`} cx={9} cy={y} r={2} fill={RED} stroke="none" />); } return <g>{txt(0, -30, 'J?')}<rect x={-12} y={-28} width={24} height={56} {...p} />{n}</g>; } },
];
const LIB_BY_ID = Object.fromEntries(SCHEMATIC_LIB.map((d) => [d.id, d]));

function renderPlaced(comp: PlacedComp, key: React.Key, preview = false) {
  const def = LIB_BY_ID[comp.defId];
  const rot = comp.rotation || 0, bmir = comp.layer === 'Dolna warstwa'; // teksty utrzymywane „prosto" mimo rotacji/odbicia
  const body = comp.savedEls ? <g>{comp.savedEls.map((el, i) => renderEl(el, i, preview, { rot, mir: bmir }))}</g>
    : comp.easyeda ? renderEasyEdaSymbol(comp.easyeda, preview, rot, bmir)
      : comp.octopart || !def ? drawGenericIC(comp.pins, comp.label, preview)
        : def.draw(preview);
  const labelY = comp.easyeda && comp.easyeda.bbox ? comp.easyeda.bbox.height / 2 + 12 : 30;
  const mir = bmir ? ' scale(-1,1)' : ''; // „Dolna warstwa" = flaga odbicia symbolu
  // Na schemacie prefiks (R1) sterowany showPrefix; wartość (label, np. „10 kΩ") pokazujemy
  // domyślnie — ukrywa ją tylko showName === 'Nie' (części EasyEDA/Octopart zawsze pokazują wartość).
  const showRef = comp.showPrefix !== 'Nie';
  const showVal = !!comp.label && (comp.showName !== 'Nie' || !!comp.easyeda || !!comp.octopart);
  const caption = [showRef ? comp.ref : '', showVal ? comp.label : ''].filter(Boolean).join('  ');
  return <g key={key} transform={`translate(${comp.x},${comp.y})`} opacity={preview ? 0.6 : 1}><g transform={`rotate(${comp.rotation || 0})${mir}`}>{body}</g>{caption && <text x={0} y={labelY} fontSize={8} fill={C.schBlue} stroke="none" textAnchor="middle" fontFamily="sans-serif">{caption}</text>}</g>;
}

// Prostokątny obrys umieszczonego komponentu (do zaznaczania klikiem)
function placedBBox(comp: PlacedComp): { x: number; y: number; w: number; h: number } {
  if (comp.savedEls && comp.savedEls.length) {
    const bs = comp.savedEls.map(elBBox); const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)), x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
    return { x: comp.x + x0, y: comp.y + y0, w: x1 - x0, h: y1 - y0 };
  }
  if (comp.easyeda?.bbox) return { x: comp.x - comp.easyeda.bbox.width / 2, y: comp.y - comp.easyeda.bbox.height / 2, w: comp.easyeda.bbox.width, h: comp.easyeda.bbox.height };
  return { x: comp.x - 40, y: comp.y - 25, w: 80, h: 55 };
}
// Obrys komponentu na PCB (renderPcbPart: footprint wyśrodkowany w (x,y), skala ×4)
function pcbPartBBox(comp: PlacedComp): { x: number; y: number; w: number; h: number } {
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y; // pozycja footprintu na PCB (niezależna od symbolu)
  const b = comp.fp?.bbox;
  if (b) return { x: px - b.width * 2, y: py - b.height * 2, w: b.width * 4, h: b.height * 4 };
  if (comp.fpEls && comp.fpEls.length) { const bb = unionBB(comp.fpEls, elBBoxFp); return { x: px - bb.w / 2, y: py - bb.h / 2, w: bb.w, h: bb.h }; }
  return { x: px - 16, y: py - 12, w: 32, h: 24 };
}
function hitTestPcbPart(arr: PlacedComp[], p: { x: number; y: number }, pad = 6): number | null {
  for (let i = arr.length - 1; i >= 0; i--) { const b = pcbPartBBox(arr[i]); if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return i; }
  return null;
}
function hitTestPlaced(arr: PlacedComp[], p: { x: number; y: number }, pad = 6): number | null {
  for (let i = arr.length - 1; i >= 0; i--) { const b = placedBBox(arr[i]); if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return i; }
  return null;
}
function selHighlight(b: { x: number; y: number; w: number; h: number }, zoom: number, color: string) {
  return <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke={color} strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} pointerEvents="none" />;
}
// Kopia elementu z przesunięciem +10/+10 i nowym ID (do wklejania)
function cloneShifted(el: unknown, editor: Editor): unknown {
  const c = JSON.parse(JSON.stringify(el)) as Record<string, unknown>;
  (['x', 'y', 'cx', 'cy', 'x1', 'y1', 'x2', 'y2'] as const).forEach((k) => { if (typeof c[k] === 'number') c[k] = (c[k] as number) + 10; });
  if (Array.isArray(c.pts)) c.pts = (c.pts as { x: number; y: number }[]).map((p) => ({ x: p.x + 10, y: p.y + 10 }));
  c.id = editor === 'schematic' || editor === 'pcb' ? `pc_${newId()}` : newId();
  return c;
}

// Dekoracje arkusza (ramka rysunkowa + tabliczka tytułowa) — rysowane w świecie
// jako `overlay` generalizowanego SymbolEditorCanvas (ten sam canvas co edytor symbolu).
function SheetFrame() {
  return (
    <>
      <g stroke={C.schRed} strokeWidth={1} fill={C.schRed} fontFamily="sans-serif">
        <line x1={40} y1={70} x2={1200} y2={70} /><line x1={40} y1={76} x2={1200} y2={76} />
        {[1, 2, 3].map((n, i) => <g key={`zt${n}`}><line x1={40 + (i + 1) * 300} y1={70} x2={40 + (i + 1) * 300} y2={76} /><text x={40 + i * 300 + 150} y={74.5} fontSize={8} textAnchor="middle" stroke="none">{n}</text></g>)}
        <line x1={40} y1={640} x2={1200} y2={640} /><line x1={40} y1={646} x2={1200} y2={646} />
        {[1, 2, 3, 4].map((n, i) => <g key={`zb${n}`}><line x1={40 + (i + 1) * 290} y1={640} x2={40 + (i + 1) * 290} y2={646} /><text x={40 + i * 290 + 145} y={644.5} fontSize={8} textAnchor="middle" stroke="none">{n}</text></g>)}
        <rect x={1000} y={560} width={190} height={80} fill="none" /><line x1={1000} y1={588} x2={1190} y2={588} />
        <text x={1006} y={580} fontSize={11} stroke="none">TITLE:</text>
        <g transform="translate(1010,605)" stroke="none" fill={C.logoTeal}><circle cx={8} cy={0} r={7} fill={C.logoTeal} /><text x={20} y={4} fontSize={12} fontWeight={700} fill={C.logoTeal}>EasyEDA</text></g>
      </g>
    </>
  );
}

// ── Aktywny canvas edytora symbolu ────────────────────────────────────────────
type Pt = { x: number; y: number };
// Pełny model pinu (edytowalny w panelu „Atrybut Pinu")
interface PinEl {
  t: 'pin'; x: number; y: number;
  name: string; number: string; spice: string;
  showName: boolean; showNumber: boolean;
  length: number; rotation: number;
  pinColor: string; nameColor: string; numberColor: string;
  dot: boolean; clock: boolean; show: boolean;
  electrical: string; fontFamily: string; fontSize: string; locked: boolean; id: string;
}
interface ShapeStyle { stroke: string; strokeWidth: number; strokeStyle: string; fill: string; locked: boolean; id: string }
type El =
  | PinEl
  | ({ t: 'line'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'polygon'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'bezier'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'freehand'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; roundRadius: number } & ShapeStyle)
  | ({ t: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & ShapeStyle)
  | ({ t: 'arc'; cx: number; cy: number; rx: number; ry: number } & ShapeStyle)
  | ({ t: 'pie'; cx: number; cy: number; rx: number; ry: number } & ShapeStyle)
  | { t: 'arrow'; x: number; y: number; fill: string; arrowType: string; size: number; rotation: number; locked: boolean; id: string }
  | { t: 'text'; x: number; y: number; text: string; color: string; fontFamily: string; fontSize: string; fontWeight: string; fontStyle: string; anchor: string; baseline: string; textType: string; locked: boolean; id: string }
  | { t: 'image'; x: number; y: number; w: number; h: number; url: string; rotation: number; locked: boolean; id: string }
  // ── Elementy sieciowe arkusza (Narzędzia połączeń) ──
  | ({ t: 'wire'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'bus'; pts: Pt[] } & ShapeStyle)
  | ({ t: 'busentry'; x1: number; y1: number; x2: number; y2: number } & ShapeStyle)
  | { t: 'netlabel'; x: number; y: number; name: string; color: string; fontFamily: string; fontSize: string; locked: boolean; id: string }
  | (NetSym & { t: 'netflag'; flagType: 'gnd' | 'vcc' | 'v5' })
  | (NetSym & { t: 'netport' })
  | (NetSym & { t: 'probe' })
  | { t: 'noconnect'; x: number; y: number; stroke: string; locked: boolean; id: string }
  | { t: 'group'; children: El[]; locked: boolean; id: string };
// Wspólne pola symbolu sieciowego z etykietą tekstową (Net Flag / Port sieci / Sonda napięcia).
// Tekst („name") można zaznaczyć osobno → panel „Właściwości tekstu" (fontWeight/fontStyle/anchor/textType).
interface NetSym { x: number; y: number; name: string; show: boolean; color: string; fontFamily: string; fontSize: string; fontWeight: string; fontStyle: string; anchor: string; textType: string; locked: boolean; id: string }

const SYM_COLOR = '#9b1c1c';
let ggeSeq = 118;
const newId = () => `gge${(ggeSeq += 3)}`;
const shStyle = (): ShapeStyle => ({ stroke: '#000000', strokeWidth: 1, strokeStyle: 'linia', fill: 'none', locked: false, id: newId() });
const pickStyle = (e: ShapeStyle): ShapeStyle => ({ stroke: e.stroke, strokeWidth: e.strokeWidth, strokeStyle: e.strokeStyle, fill: e.fill, locked: e.locked, id: e.id });
const dashOf = (s: string) => (s === 'dash' ? '6 4' : s === 'kropka' ? '2 3' : undefined);
const sa = (e: ShapeStyle, preview?: boolean) => ({ stroke: e.stroke || '#000000', strokeWidth: e.strokeWidth || 1, fill: e.fill && e.fill !== 'none' ? e.fill : 'none', strokeDasharray: preview ? '4 3' : dashOf(e.strokeStyle) } as const);
const ANCHOR: Record<string, 'start' | 'middle' | 'end'> = { 'początek': 'start', 'środek': 'middle', 'koniec': 'end' };

function makePin(x: number, y: number, no: number): PinEl {
  return { t: 'pin', x, y, name: String(no), number: String(no), spice: String(no), showName: true, showNumber: true, length: 20, rotation: 0, pinColor: '#880000', nameColor: '#0000FF', numberColor: '#0000FF', dot: false, clock: false, show: true, electrical: 'Undefined', fontFamily: 'Verdana', fontSize: '7pt', locked: false, id: `gge${10 + no}` };
}
const makeArrow = (x: number, y: number): El => ({ t: 'arrow', x, y, fill: '#000000', arrowType: '3', size: 15, rotation: 0, locked: false, id: newId() });
const makeText = (x: number, y: number, text: string): El => ({ t: 'text', x, y, text, color: '#0000FF', fontFamily: 'Verdana', fontSize: '9pt', fontWeight: '(Automatycznie)', fontStyle: '(Automatycznie)', anchor: 'początek', baseline: '', textType: 'komentarz', locked: false, id: newId() });
const makeImage = (x: number, y: number): El => ({ t: 'image', x, y, w: 80, h: 60, url: '', rotation: 0, locked: false, id: newId() });
const pinEnd = (p: PinEl) => { const r = (p.rotation || 0) * Math.PI / 180; return { x: p.x + Math.cos(r) * p.length, y: p.y + Math.sin(r) * p.length }; };

// ── Makery elementów sieciowych (Narzędzia połączeń) ──
const NET_GREEN = '#008800';
const makeWire = (p: Pt): El => ({ t: 'wire', pts: [p], stroke: NET_GREEN, strokeWidth: 1, strokeStyle: 'linia', fill: 'none', locked: false, id: newId() });
const makeBus = (p: Pt): El => ({ t: 'bus', pts: [p], stroke: NET_GREEN, strokeWidth: 2, strokeStyle: 'linia', fill: 'none', locked: false, id: newId() });
const makeBusEntry = (x: number, y: number): El => ({ t: 'busentry', x1: x, y1: y, x2: x + 10, y2: y - 10, stroke: NET_GREEN, strokeWidth: 1, strokeStyle: 'linia', fill: 'none', locked: false, id: newId() });
const makeNetLabel = (x: number, y: number, name: string): El => ({ t: 'netlabel', x, y, name, color: '#0000ff', fontFamily: 'Times New Roman', fontSize: '7pt', locked: false, id: newId() });
const netSymBase = (x: number, y: number, name: string, size: string, textType: string): NetSym => ({ x, y, name, show: true, color: '#000000', fontFamily: 'Times New Roman', fontSize: size, fontWeight: '(Automatycznie)', fontStyle: '(Automatycznie)', anchor: 'początek', textType, locked: false, id: newId() });
const makeNetFlag = (x: number, y: number, flagType: 'gnd' | 'vcc' | 'v5', name: string): El => ({ t: 'netflag', flagType, ...netSymBase(x, y, name, '9pt', 'nazwa'), color: '#000000' });
const makeNetPort = (x: number, y: number, name: string): El => ({ t: 'netport', ...netSymBase(x, y, name, '8pt', 'nazwa'), color: '#0000FF' });
const makeProbe = (x: number, y: number, name: string): El => ({ t: 'probe', ...netSymBase(x, y, name, '9pt', 'komentarz'), color: '#0000FF' });
const makeNoConnect = (x: number, y: number): El => ({ t: 'noconnect', x, y, stroke: '#33cc33', locked: false, id: newId() });
// Pozycja etykiety tekstowej symbolu sieciowego (względem punktu zaczepienia).
const netLabelPos = (el: NetSym & { t: 'netflag' | 'netport' | 'probe'; flagType?: string }): Pt =>
  el.t === 'netflag' ? (el.flagType === 'gnd' ? { x: el.x, y: el.y + 34 } : { x: el.x, y: el.y - 24 }) : { x: el.x + 14, y: el.y + 4 };

function renderEl(el: El, key: React.Key, preview = false, upr?: { rot: number; mir: boolean }) {
  const ut = (x: number, y: number) => (upr ? uprightT(x, y, upr.rot, upr.mir) : undefined); // teksty „prosto" mimo rotacji
  // własny obrót + odbicie glifu (net/tekst): rotate(rot) wokół zaczepienia, opcjonalnie scale(-1,1)
  const selfRot = (x: number, y: number): string | undefined => {
    const r = (el as { rot?: number }).rot || 0, f = (el as { flip?: boolean }).flip;
    if (!r && !f) return undefined;
    return `translate(${x} ${y}) rotate(${r})${f ? ' scale(-1 1)' : ''} translate(${-x} ${-y})`;
  };
  switch (el.t) {
    case 'pin': {
      const e = pinEnd(el), fs = parseInt(el.fontSize) || 7, out = Math.cos((el.rotation || 0) * Math.PI / 180) >= 0, sw = preview ? 1 : 1.4, dash = preview ? '4 3' : undefined;
      const nx = e.x + (out ? 4 : -4), ny = e.y + fs / 3, mx = (el.x + e.x) / 2, my = el.y - 3;
      return <g key={key} opacity={preview ? 0.6 : el.show === false ? 0.35 : 1}>
        <line x1={el.x} y1={el.y} x2={e.x} y2={e.y} stroke={el.pinColor || SYM_COLOR} strokeWidth={sw} strokeDasharray={dash} />
        {el.dot ? <circle cx={el.x} cy={el.y} r={2.4} fill="none" stroke={el.pinColor || SYM_COLOR} strokeWidth={1} /> : <circle cx={el.x} cy={el.y} r={1.4} fill={el.pinColor || SYM_COLOR} />}
        {el.clock && <path d={`M${e.x},${e.y - 4} L${e.x + (out ? 5 : -5)},${e.y} L${e.x},${e.y + 4}`} fill="none" stroke={el.pinColor || SYM_COLOR} strokeWidth={1} />}
        {el.showName !== false && <text x={nx} y={ny} fontSize={fs} fill={el.nameColor || '#0000FF'} textAnchor={out ? 'start' : 'end'} fontFamily={el.fontFamily || 'sans-serif'} stroke="none" transform={ut(nx, ny)}>{el.name}</text>}
        {el.showNumber !== false && <text x={mx} y={my} fontSize={fs} fill={el.numberColor || '#0000FF'} textAnchor="middle" fontFamily={el.fontFamily || 'sans-serif'} stroke="none" transform={ut(mx, my)}>{el.number}</text>}
      </g>;
    }
    case 'line': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} />;
    case 'polygon': return <polygon key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} />;
    case 'freehand': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} />;
    case 'bezier': { const [a, b, c] = el.pts; if (!a || !b) return null; return <path key={key} d={c ? `M${a.x},${a.y} Q${b.x},${b.y} ${c.x},${c.y}` : `M${a.x},${a.y} L${b.x},${b.y}`} {...sa(el, preview)} />; }
    case 'rect': return <rect key={key} x={Math.min(el.x, el.x + el.w)} y={Math.min(el.y, el.y + el.h)} width={Math.abs(el.w)} height={Math.abs(el.h)} rx={el.roundRadius || 0} ry={el.roundRadius || 0} {...sa(el, preview)} />;
    case 'ellipse': return <ellipse key={key} cx={el.cx} cy={el.cy} rx={Math.abs(el.rx)} ry={Math.abs(el.ry)} {...sa(el, preview)} />;
    case 'arc': return <path key={key} d={`M${el.cx - el.rx},${el.cy} A${Math.abs(el.rx)},${Math.abs(el.ry)} 0 0 1 ${el.cx + el.rx},${el.cy}`} {...sa(el, preview)} />;
    case 'pie': { const a0 = -50 * Math.PI / 180, a1 = 230 * Math.PI / 180; const p0 = { x: el.cx + el.rx * Math.cos(a0), y: el.cy + el.ry * Math.sin(a0) }, p1 = { x: el.cx + el.rx * Math.cos(a1), y: el.cy + el.ry * Math.sin(a1) }; return <path key={key} d={`M${el.cx},${el.cy} L${p0.x},${p0.y} A${Math.abs(el.rx)},${Math.abs(el.ry)} 0 1 1 ${p1.x},${p1.y} Z`} {...sa(el, preview)} />; }
    case 'arrow': { const s = el.size / 15; return <g key={key} transform={`translate(${el.x},${el.y}) rotate(${el.rotation})`} opacity={preview ? 0.6 : 1}><path d={`M0,0 l${-14 * s},${-6 * s} l0,${12 * s} Z`} fill={el.fill || '#000000'} stroke="none" /></g>; }
    case 'text': return <text key={key} x={el.x} y={el.y} fontSize={parseInt(el.fontSize) || 9} fill={el.color || '#0000FF'} fontFamily={el.fontFamily || 'sans-serif'} textAnchor={ANCHOR[el.anchor] || 'start'} fontWeight={el.fontWeight === 'bold' ? 'bold' : undefined} fontStyle={el.fontStyle === 'italic' ? 'italic' : undefined} stroke="none" opacity={preview ? 0.6 : 1} transform={upr ? ut(el.x, el.y) : selfRot(el.x, el.y)}>{el.text}</text>;
    case 'image': return <g key={key} transform={`rotate(${el.rotation} ${el.x + el.w / 2} ${el.y + el.h / 2})`} opacity={preview ? 0.6 : 1}>{el.url ? <image href={el.url} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="none" /> : <><rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#888" strokeDasharray="4 3" /><circle cx={el.x + el.w * 0.28} cy={el.y + el.h * 0.32} r={4} fill="#888" /></>}</g>;
    case 'wire': case 'bus': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} {...sa(el, preview)} strokeLinejoin="round" strokeLinecap="round" />;
    case 'busentry': return <line key={key} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...sa(el, preview)} strokeLinecap="round" />;
    case 'netlabel': return <text key={key} x={el.x} y={el.y} fontSize={parseInt(el.fontSize) || 7} fill={el.color || '#0000ff'} fontFamily={el.fontFamily || 'serif'} stroke="none" opacity={preview ? 0.6 : 1} transform={selfRot(el.x, el.y)}>{el.name}</text>;
    case 'netflag': case 'netport': case 'probe': {
      const lp = netLabelPos(el), fs = parseInt(el.fontSize) || 9;
      const label = el.show !== false && <text x={lp.x} y={lp.y} fontSize={fs} fill={el.color || '#000000'} fontFamily={el.fontFamily || 'serif'} textAnchor={ANCHOR[el.anchor] || 'start'} fontWeight={el.fontWeight === 'bold' ? 'bold' : undefined} fontStyle={el.fontStyle === 'italic' ? 'italic' : undefined} stroke="none" transform={uprightT(lp.x, lp.y, (el as { rot?: number }).rot || 0, (el as { flip?: boolean }).flip)}>{el.name}</text>;
      const gc = el.color || '#000000';
      let glyph: React.ReactNode = null;
      if (el.t === 'netflag' && el.flagType === 'gnd') glyph = <><line x1={el.x} y1={el.y} x2={el.x} y2={el.y + 12} /><line x1={el.x - 8} y1={el.y + 12} x2={el.x + 8} y2={el.y + 12} /><line x1={el.x - 5} y1={el.y + 16} x2={el.x + 5} y2={el.y + 16} /><line x1={el.x - 2} y1={el.y + 20} x2={el.x + 2} y2={el.y + 20} /></>;
      else if (el.t === 'netflag') glyph = <><line x1={el.x} y1={el.y} x2={el.x} y2={el.y - 12} /><line x1={el.x - 8} y1={el.y - 12} x2={el.x + 8} y2={el.y - 12} /><path d={`M${el.x - 5},${el.y - 12} L${el.x},${el.y - 19} L${el.x + 5},${el.y - 12} Z`} fill={gc} /></>;
      else if (el.t === 'netport') glyph = <polygon points={`${el.x},${el.y} ${el.x + 8},${el.y - 7} ${el.x + 46},${el.y - 7} ${el.x + 46},${el.y + 7} ${el.x + 8},${el.y + 7}`} fill="none" />;
      else glyph = <><circle cx={el.x} cy={el.y} r={5} fill="none" /><line x1={el.x + 5} y1={el.y} x2={el.x + 11} y2={el.y} /><path d={`M${el.x - 2},${el.y + 2} L${el.x},${el.y - 3} L${el.x + 2},${el.y + 2}`} fill="none" /></>;
      return <g key={key} stroke={gc} strokeWidth={1} fill="none" opacity={preview ? 0.6 : 1} transform={selfRot(el.x, el.y)}>{glyph}{label}</g>;
    }
    case 'noconnect': { const s = 6; return <g key={key} stroke={el.stroke || '#33cc33'} strokeWidth={1.4} opacity={preview ? 0.6 : 1} transform={selfRot(el.x, el.y)}><line x1={el.x - s} y1={el.y - s} x2={el.x + s} y2={el.y + s} /><line x1={el.x - s} y1={el.y + s} x2={el.x + s} y2={el.y - s} /></g>; }
    case 'group': return <g key={key} opacity={preview ? 0.6 : 1}>{el.children.map((c, i) => renderEl(c, i, preview, upr))}</g>;
    default: return null;
  }
}
// Prostokątny obrys (bbox) elementu — do trafiania kliknięciem
function elBBox(el: El): { x: number; y: number; w: number; h: number } {
  switch (el.t) {
    case 'pin': { const e = pinEnd(el); return { x: Math.min(el.x, e.x), y: Math.min(el.y, e.y), w: Math.abs(e.x - el.x), h: Math.abs(e.y - el.y) }; }
    case 'line': case 'polygon': case 'bezier': case 'freehand': { const xs = el.pts.map((p) => p.x), ys = el.pts.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'rect': return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
    case 'ellipse': case 'arc': case 'pie': return { x: el.cx - Math.abs(el.rx), y: el.cy - Math.abs(el.ry), w: 2 * Math.abs(el.rx), h: 2 * Math.abs(el.ry) };
    case 'arrow': return { x: el.x - el.size, y: el.y - el.size, w: el.size * 2, h: el.size * 2 };
    case 'text': { const fs = parseInt(el.fontSize) || 9; return { x: el.x, y: el.y - fs, w: Math.max(20, el.text.length * fs * 0.6), h: fs * 1.4 }; }
    case 'image': return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'wire': case 'bus': { const xs = el.pts.map((p) => p.x), ys = el.pts.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'busentry': return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    case 'netlabel': { const fs = parseInt(el.fontSize) || 7; return { x: el.x, y: el.y - fs, w: Math.max(20, el.name.length * fs * 0.6), h: fs * 1.4 }; }
    case 'netflag': case 'netport': case 'probe': { const glyph = el.t === 'netport' ? { x: el.x, y: el.y - 7, w: 46, h: 14 } : el.t === 'probe' ? { x: el.x - 5, y: el.y - 5, w: 16, h: 10 } : (el.flagType === 'gnd' ? { x: el.x - 8, y: el.y, w: 16, h: 20 } : { x: el.x - 8, y: el.y - 19, w: 16, h: 19 }); const tb = elTextBBox(el); if (!tb) return glyph; const x0 = Math.min(glyph.x, tb.x), y0 = Math.min(glyph.y, tb.y); return { x: x0, y: y0, w: Math.max(glyph.x + glyph.w, tb.x + tb.w) - x0, h: Math.max(glyph.y + glyph.h, tb.y + tb.h) - y0 }; }
    case 'noconnect': return { x: el.x - 6, y: el.y - 6, w: 12, h: 12 };
    case 'group': { const bs = el.children.map(elBBox); if (!bs.length) return { x: 0, y: 0, w: 0, h: 0 }; const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y)); return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }; }
    default: return { x: 0, y: 0, w: 0, h: 0 };
  }
}
// Bbox po transformacji rotate(rot)+[scale(-1,1)] wokół zaczepienia — do ramki/trafiania obróconych glifów.
const rotFlipBBox = (b: { x: number; y: number; w: number; h: number }, ax: number, ay: number, rot: number, flip: boolean) => {
  if (!rot && !flip) return b;
  const r = (rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const xs: number[] = [], ys: number[] = [];
  for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]) {
    let dx = px - ax; const dy = py - ay; if (flip) dx = -dx;
    xs.push(ax + dx * c - dy * s); ys.push(ay + dx * s + dy * c);
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
};
const xformPt = (p: Pt, ax: number, ay: number, rot: number, flip: boolean): Pt => {
  const r = (rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); let dx = p.x - ax; const dy = p.y - ay; if (flip) dx = -dx;
  return { x: ax + dx * c - dy * s, y: ay + dx * s + dy * c };
};
const unionBBox = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => { const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y); return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 }; };
// Sam obrys glifu symbolu sieci (bez etykiety), w układzie niezrotowanym
const netGlyphBox = (el: El & { t: 'netflag' | 'netport' | 'probe' }) => el.t === 'netport' ? { x: el.x, y: el.y - 7, w: 46, h: 14 } : el.t === 'probe' ? { x: el.x - 5, y: el.y - 5, w: 16, h: 10 } : ((el as { flagType?: string }).flagType === 'gnd' ? { x: el.x - 8, y: el.y, w: 16, h: 20 } : { x: el.x - 8, y: el.y - 19, w: 16, h: 19 });
// Wizualny bbox elementu (uwzględnia `rot`/`flip`) — do ramki zaznaczenia i trafiania kliknięciem.
function elBBoxV(el: El): { x: number; y: number; w: number; h: number } {
  const e = el as { x?: number; y?: number; rot?: number; flip?: boolean };
  if ((!e.rot && !e.flip) || typeof e.x !== 'number' || typeof e.y !== 'number') return elBBox(el);
  const rot = e.rot || 0, flip = !!e.flip;
  // Symbole sieci: glif obraca/odbija się, ale etykieta zostaje „prosto" → licz ramkę z faktycznych pozycji
  if (el.t === 'netflag' || el.t === 'netport' || el.t === 'probe') {
    const gv = rotFlipBBox(netGlyphBox(el), e.x, e.y, rot, flip);
    const lb = elTextBBox(el); if (!lb) return gv;
    const lp = netLabelPos(el), la = xformPt(lp, e.x, e.y, rot, flip);
    return unionBBox(gv, { x: lb.x + la.x - lp.x, y: lb.y + la.y - lp.y, w: lb.w, h: lb.h });
  }
  return rotFlipBBox(elBBox(el), e.x, e.y, rot, flip);
}
// ── Generyczne transformacje geometryczne (obrót/odbicie/przesunięcie) ─────────
// Działają na El i FpEl (po nazwach pól: x/y, cx/cy, x1y1/x2y2, pts[], w/h, rot/rotation).
const mod360 = (a: number) => ((Math.round(a) % 360) + 360) % 360;
type XY = { x: number; y: number };
function geomXform<T>(el: T, tp: (p: XY) => XY, swap: boolean, angle?: (a: number) => number): T {
  const o = { ...(el as Record<string, unknown>) };
  const hasRot = typeof o.rot === 'number' || typeof o.rotation === 'number';
  if (typeof o.w === 'number' && typeof o.h === 'number' && typeof o.x === 'number' && typeof o.y === 'number') {
    const w = o.w as number, h = o.h as number;
    const c = tp({ x: (o.x as number) + w / 2, y: (o.y as number) + h / 2 });
    const nw = swap && !hasRot ? h : w, nh = swap && !hasRot ? w : h;
    o.w = nw; o.h = nh; o.x = c.x - nw / 2; o.y = c.y - nh / 2;
  } else {
    const mv = (xk: string, yk: string) => { if (typeof o[xk] === 'number' && typeof o[yk] === 'number') { const np = tp({ x: o[xk] as number, y: o[yk] as number }); o[xk] = np.x; o[yk] = np.y; } };
    mv('x', 'y'); mv('cx', 'cy'); mv('x1', 'y1'); mv('x2', 'y2');
  }
  if (Array.isArray(o.pts)) o.pts = (o.pts as XY[]).map(tp);
  if (Array.isArray(o.children)) o.children = (o.children as unknown[]).map((c) => geomXform(c, tp, swap, angle));
  if (angle) { if (typeof o.rotation === 'number') o.rotation = mod360(angle(o.rotation as number)); if (typeof o.rot === 'number') o.rot = mod360(angle(o.rot as number)); }
  return o as T;
}
const translateEl = <T,>(el: T, dx: number, dy: number): T => geomXform(el, (p) => ({ x: p.x + dx, y: p.y + dy }), false);
const rotateEl = <T,>(el: T, pv: XY, cw: boolean): T => geomXform(el, (p) => (cw ? { x: pv.x - (p.y - pv.y), y: pv.y + (p.x - pv.x) } : { x: pv.x + (p.y - pv.y), y: pv.y - (p.x - pv.x) }), true, (a) => a + (cw ? 90 : -90));
const flipElH = <T,>(el: T, pv: XY): T => geomXform(el, (p) => ({ x: 2 * pv.x - p.x, y: p.y }), false, (a) => 180 - a);
const flipElV = <T,>(el: T, pv: XY): T => geomXform(el, (p) => ({ x: p.x, y: 2 * pv.y - p.y }), false, (a) => -a);

// Obrys samej etykiety tekstowej symbolu sieciowego (do osobnego zaznaczania tekstu).
function elTextBBox(el: El): { x: number; y: number; w: number; h: number } | null {
  if (el.t !== 'netflag' && el.t !== 'netport' && el.t !== 'probe') return null;
  if (el.show === false || !el.name) return null;
  const lp = netLabelPos(el), fs = parseInt(el.fontSize) || 9;
  return { x: lp.x, y: lp.y - fs, w: Math.max(16, el.name.length * fs * 0.6), h: fs * 1.4 };
}

function SymbolEditorCanvas({ elements, onChange, activeTool, setActiveTool, view, setView, origin, setOrigin, selectedIdx, onSelect, onMouse, work, overlay, onContextMenu, placing, onPlace, onEmptyClick, selectedPart, schematicMode, selectedIdxs, hitPlaced, onPlacedMove, onPlacedMoveEnd, marqueeMode, onSelectMany, placedBBoxes, onSelectManyPlaced }: {
  elements: El[]; onChange: (els: El[]) => void; activeTool: string; setActiveTool: (id: string) => void;
  view: View; setView: SetView; origin: Pt; setOrigin: (p: Pt) => void;
  selectedIdx: number | null; onSelect: (i: number | null, part?: 'body' | 'text', additive?: boolean) => void; onMouse: (p: Pt) => void; work: SymWork;
  // Rozszerzenia dla trybu arkusza (Sheet): podkład (ramka + komponenty), menu kontekstowe,
  // stawianie komponentów, klik w „puste" (zaznaczanie komponentów), narzędzia sieciowe + sub-selekcja tekstu.
  overlay?: React.ReactNode; onContextMenu?: (e: React.MouseEvent) => void;
  placing?: PlacedComp | null; onPlace?: (p: Pt) => void; onEmptyClick?: (p: Pt) => void;
  selectedPart?: 'body' | 'text'; schematicMode?: boolean; selectedIdxs?: number[];
  // Przeciąganie umieszczonych komponentów (warstwa placed) — hit-test + move zwrotnie do PcbView
  hitPlaced?: (p: Pt) => number | null; onPlacedMove?: (idx: number, dx: number, dy: number) => void; onPlacedMoveEnd?: (idx: number, dx: number, dy: number) => void;
  // Zaznaczanie grupowe prostokątem (marquee): tryb (przycisk mobile) lub Shift+przeciągnięcie
  marqueeMode?: boolean; onSelectMany?: (idxs: number[]) => void;
  // Bboxy umieszczonych komponentów → marquee zaznacza też komponenty (nie tylko rysunek)
  placedBBoxes?: { x: number; y: number; w: number; h: number }[]; onSelectManyPlaced?: (idxs: number[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  usePanZoom(svgRef, setView);
  const pinch = usePinch(svgRef, setView);
  const [draft, setDraft] = useState<El | null>(null);
  const [mouse, setMouse] = useState<Pt | null>(null);
  const dragRef = useRef<{ mode: 'pan' | 'draw' | 'move' | 'moveplaced' | 'marquee' | 'grip'; tool?: string; start?: Pt; pts?: Pt[]; sx: number; sy: number; vx: number; vy: number; midxs?: number[]; mstart?: Pt } | null>(null);
  const gripRef = useRef<{ idx: number; grip: ElGrip; orig: El } | null>(null);
  const [gripDraft, setGripDraft] = useState<{ idx: number; el: El } | null>(null);
  const movedRef = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const [moveDelta, setMoveDelta] = useState<{ idxs: number[]; dx: number; dy: number } | null>(null); // podgląd przeciągania elementu
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null); // prostokąt zaznaczenia grupowego

  const commit = (el: El) => onChange([...elements, el]);
  // ekran → world (uwzględnia pan + zoom), snap wg „Rozmiar przyciągania"
  const snapS = work.snap === 'Nie' ? 1 : Math.max(1, parseFloat(work.snapSize) || 10);
  const sn = (v: number) => Math.round(v / snapS) * snapS;
  const world = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: sn((e.clientX - r.left - view.x) / view.zoom), y: sn((e.clientY - r.top - view.y) / view.zoom) };
  };
  // Kandydaci trafienia: wszystkie elementy pod kursorem, „najmniejsze/na wierzchu najpierw" —
  // dzięki temu drobny element pod dużym obrysem jest łatwo trafialny (mniejsza powierzchnia wygrywa).
  const hitCandidates = (p: Pt): number[] => {
    const pad = 8 / view.zoom;
    const cands: { i: number; area: number }[] = [];
    for (let i = 0; i < elements.length; i++) { const b = elBBoxV(elements[i]); if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) cands.push({ i, area: Math.max(1, b.w) * Math.max(1, b.h) }); }
    cands.sort((a, b) => (a.area - b.area) || (b.i - a.i));
    return cands.map((c) => c.i);
  };
  const hitTest = (p: Pt): number | null => { const c = hitCandidates(p); return c.length ? c[0] : null; };
  const selDownRef = useRef(false); // pointerDown obsłużył już zaznaczenie → onClick nie dubluje wyboru
  const DRAWDRAG = ['rect', 'ellipse', 'freehand', 'arc', 'pie'];
  const panMode = activeTool === '' || activeTool === 'pan';
  const styleRef = useRef<ShapeStyle>(shStyle());
  const downPos = useRef({ x: 0, y: 0 });

  // buduje szkic elementu z przeciągnięcia (prostokąt/elipsa/łuk/wycinek)
  const buildDrag = (tool: string, s: Pt, p: Pt): El => {
    const st = styleRef.current;
    if (tool === 'rect') return { t: 'rect', x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y, roundRadius: 0, ...st };
    const cx = (s.x + p.x) / 2, cy = (s.y + p.y) / 2, rx = Math.abs(p.x - s.x) / 2, ry = Math.abs(p.y - s.y) / 2;
    return { t: tool as 'ellipse', cx, cy, rx, ry, ...st };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') pinch.add(e, view);
    if (pinch.active()) { dragRef.current = null; setGrabbing(false); setDraft(null); return; } // 2 palce → pinch, nie pan/rysowanie
    selDownRef.current = false;
    // Panoramowanie: środkowy przycisk / Alt+lewy
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; setGrabbing(true); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    if (e.button !== 0) return;
    movedRef.current = false; downPos.current = { x: e.clientX, y: e.clientY };
    if (placing) return; // tryb stawiania: bez pan/move — ruch przesuwa ducha (onMouse), tap/podniesienie osadza (onClick)
    if (panMode) {
      const wp = world(e);
      // Uchwyty (gripy) — edycja geometrii tylko przy POJEDYNCZYM zaznaczeniu (przy grupie klik odznacza normalnie)
      const soloSel = (selectedIdxs?.length ?? 0) <= 1 && selectedIdx != null ? selectedIdx : null;
      if (!e.shiftKey && soloSel != null) {
        const el = elements[soloSel]; const tol = Math.min(10, 6 / view.zoom);
        const g = el && !(el as { locked?: boolean }).locked ? gripsEl(el).find((gg) => Math.abs(gg.x - wp.x) <= tol && Math.abs(gg.y - wp.y) <= tol) : undefined;
        if (g) { selDownRef.current = true; gripRef.current = { idx: soloSel, grip: g, orig: el }; setGripDraft({ idx: soloSel, el }); dragRef.current = { mode: 'grip', mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); return; }
      }
      const hit = hitTest(wp);
      if (hit != null && !(elements[hit] as { locked?: boolean }).locked) { // klik elementu = zaznacz (Shift = dołącz/odłącz); przeciągnięcie przesuwa
        selDownRef.current = true;
        if (e.shiftKey) { onSelect(hit, 'body', true); e.currentTarget.setPointerCapture(e.pointerId); return; } // tylko dołącz/odłącz — bez przeciągania
        const multi = selectedIdxs && selectedIdxs.length > 1 && selectedIdxs.includes(hit);
        if (!multi) { const tb = elTextBBox(elements[hit]); const pad = 8 / view.zoom; const part: 'body' | 'text' = tb && wp.x >= tb.x - pad && wp.x <= tb.x + tb.w + pad && wp.y >= tb.y - pad && wp.y <= tb.y + tb.h + pad ? 'text' : 'body'; onSelect(hit, part, false); }
        dragRef.current = { mode: 'move', midxs: multi ? selectedIdxs! : [hit], mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      if (hit == null && hitPlaced) { // przeciąganie umieszczonego komponentu (warstwa placed)
        const pi = hitPlaced(wp);
        if (pi != null) { dragRef.current = { mode: 'moveplaced', midxs: [pi], mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); return; }
      }
      // Puste miejsce: tryb „Zaznacz obszar" lub Shift (mysz) → prostokąt zaznaczenia; inaczej panoramowanie
      if (hit == null && onSelectMany && (marqueeMode || (e.shiftKey && e.pointerType !== 'touch'))) {
        dragRef.current = { mode: 'marquee', mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; setMarquee({ x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y }); e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; setGrabbing(true); e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    const p = world(e);
    if (activeTool === 'freehand') { styleRef.current = shStyle(); dragRef.current = { mode: 'draw', tool: 'freehand', start: p, pts: [p], sx: 0, sy: 0, vx: 0, vy: 0 }; setDraft({ t: 'freehand', pts: [p], ...styleRef.current }); }
    else if (DRAWDRAG.includes(activeTool)) { styleRef.current = shStyle(); dragRef.current = { mode: 'draw', tool: activeTool, start: p, sx: 0, sy: 0, vx: 0, vy: 0 }; setDraft(buildDrag(activeTool, p, p)); }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pinch.move(e)) return; // gest szczypania — skalowanie, pomiń pan/rysowanie
    const p = world(e); setMouse(p); onMouse(p);
    const dr = dragRef.current;
    if (dr) {
      if (Math.abs(e.clientX - downPos.current.x) + Math.abs(e.clientY - downPos.current.y) > 4) movedRef.current = true;
      if (dr.mode === 'pan') { setView((v) => ({ ...v, x: dr.vx + (e.clientX - dr.sx), y: dr.vy + (e.clientY - dr.sy) })); return; }
      if (dr.mode === 'grip') { const gr = gripRef.current; if (gr) setGripDraft({ idx: gr.idx, el: gr.grip.on(gr.orig, p) }); return; }
      if (dr.mode === 'move') { setMoveDelta({ idxs: dr.midxs!, dx: p.x - dr.mstart!.x, dy: p.y - dr.mstart!.y }); return; }
      if (dr.mode === 'moveplaced') { onPlacedMove?.(dr.midxs![0], p.x - dr.mstart!.x, p.y - dr.mstart!.y); return; }
      if (dr.mode === 'marquee') { setMarquee({ x0: dr.mstart!.x, y0: dr.mstart!.y, x1: p.x, y1: p.y }); return; }
      if (dr.tool === 'freehand') { dr.pts!.push(p); setDraft({ t: 'freehand', pts: [...dr.pts!], ...styleRef.current }); return; }
      setDraft(buildDrag(dr.tool!, dr.start!, p));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pinch.up(e);
    const dr = dragRef.current; if (!dr) return; dragRef.current = null; setGrabbing(false);
    if (dr.mode === 'pan') return;
    if (dr.mode === 'grip') { const gr = gripRef.current; gripRef.current = null; if (gr && movedRef.current) { const np = world(e); const edited = gr.grip.on(gr.orig, np); onChange(elements.map((el, i) => (i === gr.idx ? edited : el))); } setGripDraft(null); return; }
    if (dr.mode === 'move') { const p2 = world(e); const dx = p2.x - dr.mstart!.x, dy = p2.y - dr.mstart!.y; if (movedRef.current && (dx || dy)) { const set = new Set(dr.midxs!); onChange(elements.map((el, i) => (set.has(i) ? translateEl(el, dx, dy) : el))); } setMoveDelta(null); return; }
    if (dr.mode === 'moveplaced') { const p2 = world(e); onPlacedMoveEnd?.(dr.midxs![0], p2.x - dr.mstart!.x, p2.y - dr.mstart!.y); return; }
    if (dr.mode === 'marquee') {
      const p2 = world(e); const rx0 = Math.min(dr.mstart!.x, p2.x), ry0 = Math.min(dr.mstart!.y, p2.y), rx1 = Math.max(dr.mstart!.x, p2.x), ry1 = Math.max(dr.mstart!.y, p2.y);
      const idxs = elements.map((el, i) => { const b = elBBoxV(el); return b.x <= rx1 && b.x + b.w >= rx0 && b.y <= ry1 && b.y + b.h >= ry0 ? i : -1; }).filter((i) => i >= 0);
      const pidxs = (placedBBoxes || []).map((b, i) => (b.x <= rx1 && b.x + b.w >= rx0 && b.y <= ry1 && b.y + b.h >= ry0 ? i : -1)).filter((i) => i >= 0);
      onSelectMany?.(idxs); onSelectManyPlaced?.(pidxs); setMarquee(null); return;
    }
    const p = world(e), s = dr.start!;
    if (dr.tool === 'freehand') { if (dr.pts!.length > 1) commit({ t: 'freehand', pts: dr.pts!, ...styleRef.current }); }
    else if (Math.abs(p.x - s.x) > 2 && Math.abs(p.y - s.y) > 2) commit(buildDrag(dr.tool!, s, p));
    setDraft(null);
  };
  const onClick = (e: React.MouseEvent) => {
    if (placing) { if (!movedRef.current) onPlace?.(world(e)); return; } // tryb stawiania komponentu (arkusz)
    const t = activeTool;
    if (DRAWDRAG.includes(t)) return;
    if (panMode) { // zaznaczanie elementu obsłużone w pointerDown; tu tylko puste miejsce (odznacz / komponent)
      if (marqueeMode) return; // w trybie prostokąta zaznaczanie obsługuje pointerUp
      if (selDownRef.current) { selDownRef.current = false; return; } // wybór już wykonany w pointerDown
      if (!movedRef.current) {
        const wp = world(e); const hit = hitTest(wp);
        if (hit == null) { if (onEmptyClick && !e.shiftKey) onEmptyClick(wp); else if (!e.shiftKey) onSelect(null); }
      }
      return;
    }
    const p = world(e);
    const nextName = (prefix: string) => `${prefix}${elements.filter((el) => el.t === t).length + 1}`;
    switch (t) {
      case 'pin': { const no = elements.filter((el) => el.t === 'pin').length + 1; commit(makePin(p.x, p.y, no)); break; }
      case 'arrow': commit(makeArrow(p.x, p.y)); break;
      case 'image': commit(makeImage(p.x, p.y)); break;
      case 'origin': setOrigin(p); break;
      case 'text': { const s = window.prompt('Tekst:', 'Text'); if (s !== null) commit(makeText(p.x, p.y, s || 'Text')); break; }
      // ── Narzędzia połączeń (arkusz) ──
      case 'busentry': commit(makeBusEntry(p.x, p.y)); break;
      case 'netlabel': commit(makeNetLabel(p.x, p.y, nextName('netLabel'))); break;
      case 'gnd': commit(makeNetFlag(p.x, p.y, 'gnd', 'GND')); break;
      case 'vcc': commit(makeNetFlag(p.x, p.y, 'vcc', 'VCC')); break;
      case 'v5': commit(makeNetFlag(p.x, p.y, 'v5', '+5V')); break;
      case 'netport': commit(makeNetPort(p.x, p.y, nextName('netPort'))); break;
      case 'probe': commit(makeProbe(p.x, p.y, nextName('volProbe'))); break;
      case 'noconnect': commit(makeNoConnect(p.x, p.y)); break;
      case 'wire': case 'bus': {
        setDraft((d) => (d && d.t === t ? { ...d, pts: [...d.pts, p] } : (t === 'wire' ? makeWire(p) : makeBus(p))));
        break;
      }
      case 'line': case 'polygon': {
        setDraft((d) => (d && d.t === t ? { ...d, pts: [...d.pts, p] } : { t, pts: [p], ...shStyle() } as El));
        break;
      }
      case 'bezier': {
        const cur = draft && draft.t === 'bezier' ? draft.pts : [];
        const style = draft && draft.t === 'bezier' ? pickStyle(draft) : shStyle();
        const pts = [...cur, p];
        if (pts.length >= 3) { commit({ t: 'bezier', pts, ...style }); setDraft(null); }
        else setDraft({ t: 'bezier', pts, ...style });
        break;
      }
    }
  };
  const finishPoly = () => {
    if (draft && (draft.t === 'line' || draft.t === 'polygon' || draft.t === 'wire' || draft.t === 'bus') && draft.pts.length >= 2) commit(draft);
    setDraft(null);
  };
  const finishRef = useRef(finishPoly); finishRef.current = finishPoly; // zawsze aktualny (bez tego Enter/„Zakończ" czyta stary draft)

  // Skróty klawiszowe (P/L/Q/C/T/F/S/O/E, Home, Enter, Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && schematicMode) { // Ctrl/Cmd+G = GND, Ctrl/Cmd+Q = VCC (flagi zasilania)
        const k = e.key.toLowerCase();
        if (k === 'g') { e.preventDefault(); setActiveTool('gnd'); setDraft(null); return; }
        if (k === 'q') { e.preventDefault(); setActiveTool('vcc'); setDraft(null); return; }
      }
      if (e.ctrlKey || e.metaKey) return; // pozostałe Ctrl/Cmd (C/V/X/Z) obsługuje globalny handler
      if (e.key === 'Home') { e.preventDefault(); setActiveTool('origin'); return; }
      if (e.key === 'Enter') { finishRef.current(); return; }
      if (e.key === 'Escape') { setDraft(null); setActiveTool(''); return; }
      const id = (schematicMode ? SHEET_SHORTCUTS[e.key.toLowerCase()] : undefined) ?? SYMBOL_SHORTCUTS[e.key.toLowerCase()];
      if (id) { e.preventDefault(); setActiveTool(id); setDraft(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cursor = panMode ? (grabbing ? 'grabbing' : 'grab') : 'crosshair';
  const isMulti = draft && (draft.t === 'line' || draft.t === 'polygon' || draft.t === 'bezier' || draft.t === 'wire' || draft.t === 'bus');
  const previewDraft: El | null = draft && isMulti && mouse ? ({ ...draft, pts: [...(draft as { pts: Pt[] }).pts, mouse] } as El) : draft;
  const g = (Math.max(1, parseFloat(work.gridSize) || 10)) * view.zoom;

  return (
    <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', touchAction: 'none', cursor, userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onPointerCancel={onPointerUp} onClick={onClick}
      onDoubleClick={finishPoly} onContextMenu={(e) => { e.preventDefault(); if (draft && (draft.t === 'line' || draft.t === 'polygon' || draft.t === 'bezier' || draft.t === 'wire' || draft.t === 'bus')) finishPoly(); else if (onContextMenu) onContextMenu(e); }}>
      <defs><pattern id="symgrid" width={g} height={g} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x},${view.y})`}><path d={`M${g} 0 L0 0 0 ${g}`} fill="none" stroke={work.gridColor || '#eceef0'} strokeOpacity={work.gridShow === 'Nie' ? 0 : 0.7} strokeWidth={1} /></pattern></defs>
      <rect width="100%" height="100%" fill={work.bg || '#ffffff'} /><rect width="100%" height="100%" fill="url(#symgrid)" />
      <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
        {/* podkład arkusza (ramka + komponenty + duch stawiania) */}
        {overlay}
        {/* początek układu (0,0) */}
        <line x1={origin.x} y1={origin.y - 5000} x2={origin.x} y2={origin.y + 5000} stroke="#b7bbc0" strokeWidth={1 / view.zoom} />
        <line x1={origin.x - 5000} y1={origin.y} x2={origin.x + 5000} y2={origin.y} stroke="#b7bbc0" strokeWidth={1 / view.zoom} />
        <circle cx={origin.x} cy={origin.y} r={4 / view.zoom} fill="none" stroke="#e0a020" strokeWidth={1.5 / view.zoom} />
        {elements.map((el, i) => renderEl(gripDraft && gripDraft.idx === i ? gripDraft.el : (moveDelta && moveDelta.idxs.includes(i) ? translateEl(el, moveDelta.dx, moveDelta.dy) : el), i))}
        {previewDraft && renderEl(previewDraft, 'draft', true)}
        {(() => { const sel = selectedIdxs && selectedIdxs.length ? selectedIdxs : selectedIdx != null ? [selectedIdx] : []; const showGrips = sel.length <= 12; return sel.map((si) => {
          if (!elements[si]) return null;
          const moved = gripDraft && gripDraft.idx === si ? gripDraft.el : moveDelta && moveDelta.idxs.includes(si) ? translateEl(elements[si], moveDelta.dx, moveDelta.dy) : elements[si];
          const tb = si === selectedIdx && selectedPart === 'text' ? elTextBBox(moved) : null;
          const b = tb ?? elBBoxV(moved);
          return <g key={si}>
            <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke="#2196f3" strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`} />
            {showGrips && !tb && gripMarkers(gripsEl(moved), view.zoom, `s${si}`, '#2196f3')}
          </g>;
        }); })()}
        {marquee && <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} fill="#2196f3" fillOpacity={0.12} stroke="#2196f3" strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`} />}
      </g>
    </svg>
  );
}

// ── Panel warstw (PCB) ────────────────────────────────────────────────────────
// Zawartość panelu Layers/Objects, zadokowana w zakładce prawego panelu
// (obok Properties) na wszystkich rozmiarach ekranu.
function LayersPanelBody({ layers, activeLayer, onColor, onToggle, onActive, objVis, onObjToggle, copper, docked }: {
  layers: LayerState; activeLayer: string; onColor: (name: string, color: string) => void; onToggle: (name: string) => void; onActive: (name: string) => void;
  objVis: Record<string, boolean>; onObjToggle: (cat: string) => void; copper?: number; docked?: boolean;
}) {
  const [tab, setTab] = useState<'All' | 'Copper' | 'Non-Copper' | 'Object'>('All');
  const allDefs = layerDefsFor(copper ?? 2); // uwzględnia warstwy Inner przy Copper Layer > 2
  const defs = tab === 'Copper' ? allDefs.filter((d) => d.group === 'copper') : tab === 'Non-Copper' ? allDefs.filter((d) => d.group === 'non-copper') : allDefs;
  const allObj = OBJECT_CATS.every((c) => objVis[c] !== false);
  // Zadokowany wypełnia dostępną wysokość zakładki; pływający ma stałą maks. wysokość.
  const listSx = docked ? { flex: 1, minHeight: 0, overflow: 'auto' } : { maxHeight: 460, overflow: 'auto' };
  return (
    <>
      <Box sx={{ display: 'flex', borderBottom: `1px solid ${C.barBorder}`, fontSize: 13, flexShrink: 0 }}>
        {(['All', 'Copper', 'Non-Copper', 'Object'] as const).map((t) => <Box key={t} onClick={() => setTab(t)} sx={{ px: 1.5, py: 0.75, cursor: 'default', color: tab === t ? '#2196f3' : '#5b6169', fontWeight: tab === t ? 600 : 400, borderBottom: tab === t ? '2px solid #2196f3' : '2px solid transparent' }}>{t}</Box>)}
      </Box>
      {tab !== 'Object' ? (
        <Box sx={listSx}>
          {defs.map((d) => {
            const st = layers[d.name] ?? { color: d.color, visible: true }; const active = activeLayer === d.name;
            return (
              <Box key={d.name} onClick={() => onActive(d.name)} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: '1px solid #f0f1f3', bgcolor: active ? '#fff' : '#eceef1' }}>
                {/* Próbka koloru (klik = zmiana koloru) */}
                <Box component="label" onClick={(e) => e.stopPropagation()} title="Zmień kolor warstwy" sx={{ position: 'relative', width: 28, height: 20, borderRadius: 0.5, bgcolor: st.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.2)' }}>
                  {active && <EditOutlinedIcon sx={{ fontSize: 13, color: '#fff' }} />}
                  <input type="color" value={st.color} onChange={(e) => onColor(d.name, e.target.value)} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', padding: 0, margin: 0, border: 'none', opacity: 0, cursor: 'pointer' }} />
                </Box>
                {/* Oko (klik = widoczność) w osobnym kontenerze, by nie kolidowało z próbką */}
                <Box onClick={(e) => { e.stopPropagation(); if (d.eye !== false) onToggle(d.name); }} title="Widoczność warstwy" sx={{ width: 26, height: 22, mx: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: d.eye !== false ? 'pointer' : 'default', borderRadius: 0.5, '&:hover': { bgcolor: d.eye !== false ? '#e2e6ea' : 'transparent' } }}>
                  {d.eye !== false && (st.visible ? <VisibilityOutlinedIcon sx={{ fontSize: 17, color: '#606770' }} /> : <VisibilityOffOutlinedIcon sx={{ fontSize: 17, color: '#b6bcc2' }} />)}
                </Box>
                <Typography sx={{ fontSize: 13, color: '#2b2f34', lineHeight: 1.15, flex: 1, minWidth: 0 }}>{d.name}</Typography>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box sx={listSx}>
          <Box onClick={() => onObjToggle('__all__')} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.7, gap: 1.5, borderBottom: '1px solid #f0f1f3', bgcolor: '#eceef1' }}>
            <Box sx={{ width: 20, display: 'flex', justifyContent: 'center' }}>{allObj && <CheckIcon sx={{ fontSize: 17, color: '#2b2f34' }} />}</Box>
            <Box sx={{ width: 17 }} /><Typography sx={{ fontSize: 13.5 }}>Wszystko</Typography>
          </Box>
          {OBJECT_CATS.map((c) => (
            <Box key={c} onClick={() => onObjToggle(c)} sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.7, gap: 1.5, borderBottom: '1px solid #f0f1f3', bgcolor: '#eceef1' }}>
              <Box sx={{ width: 20, display: 'flex', justifyContent: 'center' }}>{objVis[c] !== false && <CheckIcon sx={{ fontSize: 17, color: '#2b2f34' }} />}</Box>
              <VisibilityOutlinedIcon sx={{ fontSize: 17, color: objVis[c] !== false ? '#606770' : '#c4c8cd' }} /><Typography sx={{ fontSize: 13.5, color: '#2b2f34' }}>{c}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </>
  );
}

// ── Aktywne Properties (natywne pola — stabilny, spójny render) ───────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.4, gap: 1 }}><Typography title={label} sx={{ fontSize: 12.5, color: C.labelText, width: 112, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Typography>{children}</Box>;
}
const inStyle = (disabled?: boolean): React.CSSProperties => ({ flex: 1, width: '100%', minWidth: 0, height: 26, border: `1px solid ${C.fieldBorder}`, borderRadius: 4, background: disabled ? '#f1f2f4' : '#fff', color: disabled ? '#9aa0a6' : '#2b2f34', fontSize: 12.5, padding: '0 8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' });
function TxtInput({ value, onChange, disabled }: { value: string; onChange?: (v: string) => void; disabled?: boolean }) {
  return <input value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} style={inStyle(disabled)} />;
}
function SelInput({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inStyle(), cursor: 'pointer', padding: '0 4px' }}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}
function FieldText({ label, value, disabled, swatch }: { label: string; value: string; disabled?: boolean; swatch?: string }) {
  const [v, setV] = useState(value);
  return <Row label={label}><Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>{swatch && <Box sx={{ width: 14, height: 14, bgcolor: swatch, border: '1px solid #b8bcc1', borderRadius: 0.25, flexShrink: 0 }} />}<TxtInput value={v} disabled={disabled} onChange={setV} /></Box></Row>;
}
function FieldSelect({ label, value, options }: { label: string; value: string; options: string[] }) {
  const [v, setV] = useState(value);
  return <Row label={label}><SelInput value={v} options={options} onChange={setV} /></Row>;
}
function SectionHeader({ title }: { title: string }) {
  return <Box sx={{ display: 'flex', alignItems: 'center', px: 0.75, py: 0.75, borderBottom: `1px solid ${C.panelBorder}` }}><ArrowRightIcon sx={{ fontSize: 18, color: C.icon, transform: 'rotate(45deg)' }} /><Typography sx={{ fontSize: 13, color: '#2b2f34', fontWeight: 500 }}>{title}</Typography></Box>;
}
function MouseBlock({ rows }: { rows: [string, string][] }) {
  return <Box sx={{ borderTop: `1px solid ${C.panelBorder}`, mt: 0.5 }}>{rows.map(([k, val]) => <Box key={k} sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, gap: 1 }}><Typography sx={{ fontSize: 12.5, color: C.labelText, width: 90, flexShrink: 0 }}>{k}</Typography><Box sx={{ flex: 1, border: `1px solid ${C.fieldBorder}`, borderRadius: 0.75, px: 0.75, height: 24, display: 'flex', alignItems: 'center', bgcolor: '#fff' }}><Typography sx={{ fontSize: 12.5, color: '#2b2f34' }}>{val}</Typography></Box></Box>)}</Box>;
}
function PropsShell({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <Box sx={{ width: '100%', flex: 1, bgcolor: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, borderBottom: `1px solid ${C.panelBorder}` }}><Typography sx={{ fontSize: 13.5, color: '#2b2f34', flex: 1 }}>Zaznaczone obiekty</Typography><Typography sx={{ fontSize: 13.5, color: '#2b2f34' }}>{count}</Typography></Box>
      {children}
    </Box>
  );
}
interface SymWork { bg: string; gridShow: string; gridColor: string; gridStyle: string; gridSize: string; snap: string; snapSize: string; altDrag: string }
const emptySymWork = (): SymWork => ({ bg: '#FFFFFF', gridShow: 'Tak', gridColor: '#CCCCCC', gridStyle: 'linia', gridSize: '10', snap: 'Tak', snapSize: '10', altDrag: '5' });
function WorkspaceAttrs({ work, onChange }: { work?: SymWork; onChange?: (p: Partial<SymWork>) => void }) {
  if (work && onChange) {
    return (
      <>
        <SectionHeader title="Atrybuty obszaru roboczego" />
        <CColor label="Tło" value={work.bg} onChange={(v) => onChange({ bg: v })} />
        <CSelect label="Wyświetlanie …" value={work.gridShow} options={['Tak', 'Nie']} onChange={(v) => onChange({ gridShow: v })} />
        <CColor label="Kolor siatki" value={work.gridColor} onChange={(v) => onChange({ gridColor: v })} />
        <CSelect label="Styl siatki" value={work.gridStyle} options={['linia', 'kropka']} onChange={(v) => onChange({ gridStyle: v })} />
        <CField label="Rozmiar siatki" value={work.gridSize} onChange={(v) => onChange({ gridSize: v })} />
        <CSelect label="Przyciągaj" value={work.snap} options={['Tak', 'Nie']} onChange={(v) => onChange({ snap: v })} />
        <CField label="Rozmiar przy…" value={work.snapSize} onChange={(v) => onChange({ snapSize: v })} />
        <CField label="Przeciąganie Alt" value={work.altDrag} onChange={(v) => onChange({ altDrag: v })} />
      </>
    );
  }
  return (
    <>
      <SectionHeader title="Atrybuty obszaru roboczego" />
      <FieldText label="Tło" value="#FFFFFF" swatch="#ffffff" /><FieldSelect label="Wyświetlanie …" value="Tak" options={['Tak', 'Nie']} />
      <FieldText label="Kolor siatki" value="#CCCCCC" swatch="#cccccc" /><FieldSelect label="Styl siatki" value="linia" options={['linia', 'kropka']} />
      <FieldText label="Rozmiar siatki" value="5" /><FieldSelect label="Przyciągaj" value="Tak" options={['Tak', 'Nie']} />
      <FieldText label="Rozmiar przy…" value="5" /><FieldText label="Przeciąganie Alt" value="5" />
    </>
  );
}

// Kontrolowane pola (odzwierciedlają bieżący element)
function CField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <Row label={label}><TxtInput value={value} onChange={onChange} disabled={disabled} /></Row>;
}
// Pole liczbowe z jednostką (np. „2.540mm"). Edytuje LOKALNY tekst i commituje dopiero
// na blur/Enter — inaczej round-trip parse↔format przeformatowywał wartość przy każdym
// znaku (kursor skakał, nie dało się wpisać liczby).
function NumUnitField({ label, value, onCommit, disabled }: { label: string; value: string; onCommit: (v: string) => void; disabled?: boolean }) {
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <Row label={label}>
      <input
        value={edit ?? value}
        disabled={disabled}
        onChange={(e) => setEdit(e.target.value)}
        onFocus={(e) => { setEdit(value); const t = e.currentTarget; requestAnimationFrame(() => { try { t.select(); } catch { /* ignore */ } }); }}
        onBlur={() => { if (edit != null) { onCommit(edit); setEdit(null); } }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setEdit(null); e.currentTarget.blur(); } }}
        style={inStyle(disabled)}
      />
    </Row>
  );
}
function CSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return <Row label={label}><SelInput value={value} options={options} onChange={onChange} /></Row>;
}
function CColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Row label={label}><input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inStyle(), background: value || '#fff', color: '#fff', textShadow: '0 0 2px rgba(0,0,0,0.8)' }} /></Row>;
}
type Patch = Record<string, unknown>;
function StyleFields({ el, onChange }: { el: ShapeStyle; onChange: (p: Patch) => void }) {
  return (
    <>
      <CColor label="Kolor krawędzi" value={el.stroke} onChange={(v) => onChange({ stroke: v })} />
      <CSelect label="Szerokość kr…" value={String(el.strokeWidth)} options={['0.5', '1', '2', '3', '4', '5']} onChange={(v) => onChange({ strokeWidth: Number(v) })} />
      <CSelect label="Styl krawędzi" value={el.strokeStyle} options={['linia', 'dash', 'kropka']} onChange={(v) => onChange({ strokeStyle: v })} />
      <CField label="Kolor wypełni…" value={el.fill} onChange={(v) => onChange({ fill: v })} />
    </>
  );
}
const LockId = ({ el, onChange }: { el: { locked: boolean; id: string }; onChange: (p: Patch) => void }) => (
  <>
    <CSelect label="Locked" value={el.locked ? 'Tak' : 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ locked: v === 'Tak' })} />
    <CField label="ID" value={el.id} onChange={() => { }} disabled />
  </>
);
const SHAPE_TITLE: Record<string, string> = { line: 'Linia łamana', bezier: 'Krzywa Beziera', arc: 'Łuk', pie: 'Wycinek koła', arrow: 'Końcówka Strzałki', text: 'Właściwości tekstu', freehand: 'Freedraw', rect: 'Prostokąt', polygon: 'Wielobok', ellipse: 'Elipsa', image: 'Obraz', wire: 'Przewód', bus: 'Szyna', busentry: 'Wejście szyny', netlabel: 'Etykieta sieci', netflag: 'Net Flag', netport: 'Port sieci', probe: 'Sonda napięcia', noconnect: 'Flaga braku połączenia', group: 'Grupa' };
function ShapeProps({ el, onChange }: { el: El; onChange: (p: Patch) => void }) {
  const title = SHAPE_TITLE[el.t] ?? el.t;
  const num = (v: string) => Number(v) || 0;
  switch (el.t) {
    case 'line': case 'bezier': case 'freehand': case 'polygon':
      return <><SectionHeader title={title} /><StyleFields el={el} onChange={onChange} /><LockId el={el} onChange={onChange} /></>;
    case 'rect':
      return <><SectionHeader title={title} /><StyleFields el={el} onChange={onChange} />
        <NumUnitField label="Round Radius" value={String(el.roundRadius)} onCommit={(v) => onChange({ roundRadius: num(v) })} />
        <NumUnitField label="Szerokość" value={String(Math.round(Math.abs(el.w)))} onCommit={(v) => onChange({ w: num(v) })} />
        <NumUnitField label="Wysokość" value={String(Math.round(Math.abs(el.h)))} onCommit={(v) => onChange({ h: num(v) })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'ellipse': case 'arc': case 'pie':
      return <><SectionHeader title={title} /><StyleFields el={el} onChange={onChange} />
        <NumUnitField label="Środek X" value={String(Math.round(el.cx))} onCommit={(v) => onChange({ cx: num(v) })} />
        <NumUnitField label="Środek Y" value={String(Math.round(-el.cy))} onCommit={(v) => onChange({ cy: -num(v) })} />
        <NumUnitField label="X Radius" value={String(Math.round(Math.abs(el.rx)))} onCommit={(v) => onChange({ rx: num(v) })} />
        <NumUnitField label="Y Radius" value={String(Math.round(Math.abs(el.ry)))} onCommit={(v) => onChange({ ry: num(v) })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'arrow':
      return <><SectionHeader title={title} />
        <CColor label="Kolor wypełni…" value={el.fill} onChange={(v) => onChange({ fill: v })} />
        <CSelect label="Typ" value={el.arrowType} options={['1', '2', '3', '4', '5']} onChange={(v) => onChange({ arrowType: v })} />
        <CSelect label="Rozmiar" value={String(el.size)} options={['5', '10', '15', '20', '25', '30']} onChange={(v) => onChange({ size: num(v) })} />
        <CSelect label="Orientacja" value={`${el.rotation}°`} options={['0°', '90°', '180°', '270°']} onChange={(v) => onChange({ rotation: parseInt(v, 10) || 0 })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'text':
      return <><SectionHeader title={title} />
        <CField label="Tekst" value={el.text} onChange={(v) => onChange({ text: v })} />
        <CColor label="Kolor" value={el.color} onChange={(v) => onChange({ color: v })} />
        <CSelect label="Rodzina czcio…" value={el.fontFamily} options={['Verdana', 'Arial', 'Times New Roman', 'Courier New']} onChange={(v) => onChange({ fontFamily: v })} />
        <CSelect label="Rozmiar czcio…" value={el.fontSize} options={['7pt', '8pt', '9pt', '10pt', '12pt', '14pt']} onChange={(v) => onChange({ fontSize: v })} />
        <CSelect label="Grubość czci…" value={el.fontWeight} options={['(Automatycznie)', 'normal', 'bold']} onChange={(v) => onChange({ fontWeight: v })} />
        <CSelect label="Stylk czcionki" value={el.fontStyle} options={['(Automatycznie)', 'normal', 'italic']} onChange={(v) => onChange({ fontStyle: v })} />
        <CSelect label="Kotwica tekstu" value={el.anchor} options={['początek', 'środek', 'koniec']} onChange={(v) => onChange({ anchor: v })} />
        <CSelect label="Linia bazowa" value={el.baseline} options={['', 'auto', 'middle', 'hanging', 'ideographic']} onChange={(v) => onChange({ baseline: v })} />
        <CSelect label="Typ tekstu" value={el.textType} options={['komentarz', 'nazwa', 'spice']} onChange={(v) => onChange({ textType: v })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'image':
      return <><SectionHeader title={title} />
        <CField label="URL Obrazka" value={el.url} onChange={(v) => onChange({ url: v })} />
        <NumUnitField label="Lokalizacja X" value={String(Math.round(el.x))} onCommit={(v) => onChange({ x: num(v) })} />
        <NumUnitField label="Lokalizacja Y" value={String(Math.round(el.y))} onCommit={(v) => onChange({ y: num(v) })} />
        <NumUnitField label="Szerokość" value={String(Math.round(el.w))} onCommit={(v) => onChange({ w: num(v) })} />
        <NumUnitField label="Wysokość" value={String(Math.round(el.h))} onCommit={(v) => onChange({ h: num(v) })} />
        <CSelect label="Orientacja" value={`${el.rotation}°`} options={['0°', '90°', '180°', '270°']} onChange={(v) => onChange({ rotation: parseInt(v, 10) || 0 })} />
        <LockId el={el} onChange={onChange} /></>;
    // ── Elementy sieciowe arkusza ──
    case 'wire': case 'bus':
      return <><SectionHeader title={title} /><StyleFields el={el} onChange={onChange} /><LockId el={el} onChange={onChange} /></>;
    case 'busentry':
      return <><SectionHeader title={title} />
        <CField label="Wejście szyny X1" value={String(Math.round(el.x1))} onChange={() => { }} disabled />
        <CField label="Wejście szyny Y1" value={String(Math.round(-el.y1))} onChange={() => { }} disabled />
        <CField label="Wejście szyny X2" value={String(Math.round(el.x2))} onChange={() => { }} disabled />
        <CField label="Wejście szyny Y2" value={String(Math.round(-el.y2))} onChange={() => { }} disabled />
        <LockId el={el} onChange={onChange} /></>;
    case 'netlabel':
      return <><SectionHeader title={title} />
        <CField label="Nazwa" value={el.name} onChange={(v) => onChange({ name: v })} />
        <CColor label="Kolor" value={el.color} onChange={(v) => onChange({ color: v })} />
        <CSelect label="Rodzina czcio…" value={el.fontFamily} options={['Times New Roman', 'Verdana', 'Arial', 'Courier New']} onChange={(v) => onChange({ fontFamily: v })} />
        <CSelect label="Rozmiar czcio…" value={el.fontSize} options={['7pt', '8pt', '9pt', '10pt', '12pt', '14pt']} onChange={(v) => onChange({ fontSize: v })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'netflag': case 'netport': case 'probe':
      return <><SectionHeader title={title} />
        <CField label="Nazwa" value={el.name} onChange={(v) => onChange({ name: v })} />
        <CSelect label="Wyświetlana …" value={el.show ? 'Tak' : 'Nie'} options={['Tak', 'Nie']} onChange={(v) => onChange({ show: v === 'Tak' })} />
        <CColor label="Kolor" value={el.color} onChange={(v) => onChange({ color: v })} />
        <CSelect label="Rodzina czcio…" value={el.fontFamily} options={['Times New Roman', 'Verdana', 'Arial', 'Courier New']} onChange={(v) => onChange({ fontFamily: v })} />
        <CSelect label="Rozmiar czcio…" value={el.fontSize} options={['7pt', '8pt', '9pt', '10pt', '12pt', '14pt']} onChange={(v) => onChange({ fontSize: v })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'noconnect':
      return <><SectionHeader title={title} />
        <CColor label="Kolor krawędzi" value={el.stroke} onChange={(v) => onChange({ stroke: v })} />
        <LockId el={el} onChange={onChange} /></>;
    case 'group':
      return <><SectionHeader title={title} /><CField label="Liczba elementów" value={String(el.children.length)} onChange={() => { }} disabled /><LockId el={el} onChange={onChange} /></>;
    default: return null;
  }
}
// Panel „Właściwości tekstu" dla etykiety symbolu sieciowego (osobna sub-selekcja tekstu).
function NetTextProps({ el, onChange }: { el: NetSym; onChange: (p: Patch) => void }) {
  return (
    <>
      <SectionHeader title="Właściwości tekstu" />
      <CField label="Tekst" value={el.name} onChange={(v) => onChange({ name: v })} />
      <CColor label="Kolor" value={el.color} onChange={(v) => onChange({ color: v })} />
      <CSelect label="Rodzina czcio…" value={el.fontFamily} options={['Times New Roman', 'Verdana', 'Arial', 'Courier New']} onChange={(v) => onChange({ fontFamily: v })} />
      <CSelect label="Rozmiar czcio…" value={el.fontSize} options={['7pt', '8pt', '9pt', '10pt', '12pt', '14pt']} onChange={(v) => onChange({ fontSize: v })} />
      <CSelect label="Grubość czci…" value={el.fontWeight} options={['(Automatycznie)', 'normal', 'bold']} onChange={(v) => onChange({ fontWeight: v })} />
      <CSelect label="Stylk czcionki" value={el.fontStyle} options={['(Automatycznie)', 'normal', 'italic']} onChange={(v) => onChange({ fontStyle: v })} />
      <CSelect label="Kotwica tekstu" value={el.anchor} options={['początek', 'środek', 'koniec']} onChange={(v) => onChange({ anchor: v })} />
      <CSelect label="Typ tekstu" value={el.textType} options={['komentarz', 'nazwa', 'spice']} onChange={(v) => onChange({ textType: v })} />
      <CField label="ID" value={el.id} onChange={() => { }} disabled />
    </>
  );
}
function PinAttrs({ pin, onChange }: { pin: PinEl; onChange: (patch: Patch) => void }) {
  return (
    <>
      <SectionHeader title="Atrybut Pinu" />
      <CField label="Nazwa" value={pin.name} onChange={(v) => onChange({ name: v })} />
      <CField label="Numer" value={pin.number} onChange={(v) => onChange({ number: v })} />
      <CField label="Spice Number" value={pin.spice} onChange={(v) => onChange({ spice: v })} />
      <CSelect label="Wyświetlana …" value={pin.showName ? 'Tak' : 'Nie'} options={['Tak', 'Nie']} onChange={(v) => onChange({ showName: v === 'Tak' })} />
      <CSelect label="Wyświetl Numer" value={pin.showNumber ? 'Tak' : 'Nie'} options={['Tak', 'Nie']} onChange={(v) => onChange({ showNumber: v === 'Tak' })} />
      <NumUnitField label="Długość" value={String(pin.length)} onCommit={(v) => onChange({ length: Number(v) || 0 })} />
      <CSelect label="Orientacja" value={`${pin.rotation}°`} options={['0°', '90°', '180°', '270°']} onChange={(v) => onChange({ rotation: parseInt(v, 10) || 0 })} />
      <NumUnitField label="Początek X" value={String(pin.x)} onCommit={(v) => onChange({ x: Number(v) || 0 })} />
      <NumUnitField label="Początek Y" value={String(-pin.y)} onCommit={(v) => onChange({ y: -(Number(v) || 0) })} />
      <CColor label="Pin Color" value={pin.pinColor} onChange={(v) => onChange({ pinColor: v })} />
      <CColor label="Name Color" value={pin.nameColor} onChange={(v) => onChange({ nameColor: v })} />
      <CColor label="Number Color" value={pin.numberColor} onChange={(v) => onChange({ numberColor: v })} />
      <CSelect label="Dot" value={pin.dot ? 'Tak' : 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ dot: v === 'Tak' })} />
      <CSelect label="Zegar" value={pin.clock ? 'Tak' : 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ clock: v === 'Tak' })} />
      <CSelect label="Pokaż" value={pin.show ? 'Tak' : 'Nie'} options={['Tak', 'Nie']} onChange={(v) => onChange({ show: v === 'Tak' })} />
      <CSelect label="Elektrycznie" value={pin.electrical} options={['Undefined', 'Input', 'Output', 'Bidirectional', 'Power']} onChange={(v) => onChange({ electrical: v })} />
      <CSelect label="Rodzina czcio…" value={pin.fontFamily} options={['Verdana', 'Arial', 'Times New Roman', 'Courier New']} onChange={(v) => onChange({ fontFamily: v })} />
      <CSelect label="Rozmiar czcio…" value={pin.fontSize} options={['5pt', '6pt', '7pt', '8pt', '9pt', '10pt', '12pt']} onChange={(v) => onChange({ fontSize: v })} />
      <CSelect label="Locked" value={pin.locked ? 'Tak' : 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ locked: v === 'Tak' })} />
      <CField label="ID" value={pin.id} onChange={() => { }} disabled />
    </>
  );
}

function SchematicProperties({ mouse, sel, selPart, onSelChange, work, onWork }: { mouse: [string, string][]; sel: El | null; selPart?: 'body' | 'text'; onSelChange: (patch: Patch) => void; work: SymWork; onWork: (patch: Partial<SymWork>) => void }) {
  if (sel) {
    const isNetSym = sel.t === 'netflag' || sel.t === 'netport' || sel.t === 'probe';
    const body = sel.t === 'pin' ? <PinAttrs pin={sel} onChange={onSelChange} />
      : isNetSym && selPart === 'text' ? <NetTextProps el={sel} onChange={onSelChange} />
        : <ShapeProps el={sel} onChange={onSelChange} />;
    return <PropsShell count={1}>{body}<MouseBlock rows={mouse} /></PropsShell>;
  }
  return <PropsShell count={0}><WorkspaceAttrs work={work} onChange={onWork} /><MouseBlock rows={mouse} /></PropsShell>;
}
interface SymMeta { addToBom: string; convertTo: string; name: string; footprint: string; pre: string; supplier: string; supplierPart: string; manufacturer: string; mfrPart: string }
const emptySymMeta = (): SymMeta => ({ addToBom: 'Tak', convertTo: 'Tak', name: 'NowySymbol', footprint: '', pre: 'U?', supplier: 'Nieznany', supplierPart: '', manufacturer: '', mfrPart: '' });
function SymbolProperties({ mouse, sel, onSelChange, meta, onMeta, work, onWork }: { mouse: [string, string][]; sel: El | null; onSelChange: (patch: Patch) => void; meta: SymMeta; onMeta: (patch: Partial<SymMeta>) => void; work: SymWork; onWork: (patch: Partial<SymWork>) => void }) {
  if (sel) {
    return <PropsShell count={1}>{sel.t === 'pin' ? <PinAttrs pin={sel} onChange={onSelChange} /> : <ShapeProps el={sel} onChange={onSelChange} />}<MouseBlock rows={mouse} /></PropsShell>;
  }
  return (
    <PropsShell count={0}>
      <WorkspaceAttrs work={work} onChange={onWork} />
      <SectionHeader title="Atrybuty dodatkowe" />
      <CSelect label="Dodaj Do BOM" value={meta.addToBom} options={['Tak', 'Nie']} onChange={(v) => onMeta({ addToBom: v })} />
      <CSelect label="Konwertuj Do …" value={meta.convertTo} options={['Tak', 'Nie']} onChange={(v) => onMeta({ convertTo: v })} />
      <CField label="Nazwa" value={meta.name} onChange={(v) => onMeta({ name: v })} />
      <CField label="Footprint" value={meta.footprint} onChange={(v) => onMeta({ footprint: v })} />
      <CField label="Pre" value={meta.pre} onChange={(v) => onMeta({ pre: v })} />
      <CSelect label="Dostawca" value={meta.supplier} options={['Nieznany', 'LCSC', 'Mouser', 'DigiKey']} onChange={(v) => onMeta({ supplier: v })} />
      <CField label="Część Dosta…" value={meta.supplierPart} onChange={(v) => onMeta({ supplierPart: v })} />
      <CField label="Producent" value={meta.manufacturer} onChange={(v) => onMeta({ manufacturer: v })} />
      <CField label="Część Produc…" value={meta.mfrPart} onChange={(v) => onMeta({ mfrPart: v })} />
      <CField label="Współtwórca" value="mhersztowski" onChange={() => { }} disabled />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.5 }}>
        <Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13, width: 160 }}>Add Parameter</Button>
        <Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13, width: 160 }}>View Datasheet</Button>
      </Box>
      <MouseBlock rows={mouse} />
    </PropsShell>
  );
}

// ── Edytor Footprint (EasyEDA 1:1) ────────────────────────────────────────────
interface FpMeta { units: string; bg: string; gridShow: string; gridColor: string; gridStyle: string; snap: string; gridSize: string; snapSize: string; dragAlt: string; routeWidth: string; routeAngle: string; removeLoop: string; cutSilk: string; footprint: string; pre: string; model3d: string; symbol: string }
const emptyFpMeta = (): FpMeta => ({ units: 'mm', bg: '#000000', gridShow: 'Tak', gridColor: '#FFFFFF', gridStyle: 'linia', snap: 'Tak', gridSize: '2.540mm', snapSize: '0.127mm', dragAlt: '0.127mm', routeWidth: '0.254mm', routeAngle: 'Linia 45°', removeLoop: 'Nie', cutSilk: 'Tak', footprint: '', pre: 'U?', model3d: '', symbol: '' });
// mm ⇄ jednostki świata (1 jedn = 1 mil); Y w konwencji „do góry"
const W2MM = 0.0254;
const toMm = (v: number) => `${(v * W2MM).toFixed(3)}mm`;
const fromMm = (s: string) => { const n = parseFloat(s); return Number.isNaN(n) ? 0 : n / W2MM; };
// ── Model warstw PCB/footprint (kolor + widoczność edytowalne w panelu Layers) ──
type LayerGroup = 'copper' | 'non-copper' | 'other';
interface LayerDef { name: string; color: string; group: LayerGroup; eye?: boolean }
const LAYER_DEFS: LayerDef[] = [
  { name: 'Górna warstwa', color: '#ff2b2b', group: 'copper' },
  { name: 'Dolna warstwa', color: '#0000ff', group: 'copper' },
  { name: 'Górna warstwa opisowa', color: '#f5c518', group: 'non-copper' },
  { name: 'Dolna warstwa opisowa', color: '#6cc04a', group: 'non-copper' },
  { name: 'Górna warstwa maski pasty lutowniczej', color: '#808080', group: 'non-copper' },
  { name: 'Dolna warstwa maski pasty lutowniczej', color: '#7a1414', group: 'non-copper' },
  { name: 'Górna warstwa maski lutowniczej', color: '#800080', group: 'non-copper' },
  { name: 'Dolna warstwa maski lutowniczej', color: '#9b30ff', group: 'non-copper' },
  { name: 'Ratlines', color: '#5b7cff', group: 'other', eye: false },
  { name: 'Obrys płyty', color: '#ff33cc', group: 'other' },
  { name: 'Wielowastwa', color: '#c0c0c0', group: 'copper' },
  { name: 'Dokument', color: '#ffffff', group: 'other' },
  { name: 'Górny montaż', color: '#3cb371', group: 'other' },
  { name: 'Dolny montaż', color: '#4169e1', group: 'other' },
  { name: 'Mechanika', color: '#ff33cc', group: 'other' },
  { name: '3DModel', color: '#87cefa', group: 'other' },
  { name: 'ComponentShapeLayer', color: '#3cb0a0', group: 'other' },
  { name: 'LeadShapeLayer', color: '#cc8888', group: 'other' },
  { name: 'ComponentMarkingLayer', color: '#5fe0c0', group: 'other' },
];
type LayerState = Record<string, { color: string; visible: boolean }>;
const defaultLayers = (): LayerState => Object.fromEntries(LAYER_DEFS.map((l) => [l.name, { color: l.color, visible: true }]));
// Warstwy wewnętrzne miedzi (Inner1, Inner2…) pojawiają się przy Copper Layer > 2 — między Górną a Dolną
const INNER_COLORS = ['#c98a2a', '#2aa0a0', '#9a5a2a', '#5a9a2a', '#2a5a9a', '#9a2a9a'];
const layerDefsFor = (copper: number): LayerDef[] => {
  const n = Math.max(0, (copper || 2) - 2);
  if (!n) return LAYER_DEFS;
  const inners: LayerDef[] = Array.from({ length: n }, (_, i) => ({ name: `Inner${i + 1}`, color: INNER_COLORS[i % INNER_COLORS.length], group: 'copper' as const }));
  const idx = LAYER_DEFS.findIndex((d) => d.name === 'Dolna warstwa'); // wstaw przed „Dolna warstwa"
  return [...LAYER_DEFS.slice(0, idx), ...inners, ...LAYER_DEFS.slice(idx)];
};
const FP_LAYERS = LAYER_DEFS.map((l) => l.name);
const fpLayer = (l: string) => LAYER_DEFS.find((d) => d.name === l)?.color ?? '#c9a227';
// Kategorie zakładki „Object" (widoczność typów obiektów)
const OBJECT_CATS = ['Komponent', 'Prefiks', 'Nazwa', 'Przewód', 'Pad', 'Otwór', 'Tekst', 'Wypełnienie'];

// ── Wspólne właściwości zaznaczonej grupy (pola obecne we WSZYSTKICH zaznaczonych) ──
const GROUP_FIELDS: { key: string; label: string; kind: 'color' | 'select' | 'text' | 'num' | 'boolsel'; opts?: string[]; num?: boolean }[] = [
  { key: 'stroke', label: 'Kolor krawędzi', kind: 'color' },
  { key: 'strokeWidth', label: 'Szerokość kr…', kind: 'select', opts: ['0.5', '1', '2', '3', '4', '5'], num: true },
  { key: 'strokeStyle', label: 'Styl krawędzi', kind: 'select', opts: ['linia', 'dash', 'kropka'] },
  { key: 'fill', label: 'Wypełnienie', kind: 'text' },
  { key: 'color', label: 'Kolor', kind: 'color' },
  { key: 'fontFamily', label: 'Rodzina czcio…', kind: 'select', opts: ['Verdana', 'Times New Roman', 'Arial', 'Courier New'] },
  { key: 'fontSize', label: 'Rozmiar czcio…', kind: 'select', opts: ['7pt', '8pt', '9pt', '10pt', '12pt', '14pt'] },
  { key: 'width', label: 'Szerokość', kind: 'num' },
  { key: 'layer', label: 'Warstwy', kind: 'select', opts: FP_LAYERS },
  { key: 'rot', label: 'Orientacja', kind: 'select', opts: ['0', '90', '180', '270'], num: true },
  { key: 'locked', label: 'Locked', kind: 'boolsel' },
];
function GroupProps({ els, onChange }: { els: Record<string, unknown>[]; onChange: (p: Patch) => void }) {
  const has = (k: string) => els.length > 0 && els.every((e) => k in e);
  const common = (k: string) => { const v = els[0]?.[k]; return els.every((e) => e[k] === v) ? v : undefined; };
  return (
    <>
      <SectionHeader title={`Właściwości grupy (${els.length})`} />
      {GROUP_FIELDS.filter((f) => has(f.key)).map((f) => {
        const cv = common(f.key);
        if (f.kind === 'color') return <CColor key={f.key} label={f.label} value={String(cv ?? '')} onChange={(v) => onChange({ [f.key]: v })} />;
        if (f.kind === 'text') return <CField key={f.key} label={f.label} value={String(cv ?? '')} onChange={(v) => onChange({ [f.key]: v })} />;
        if (f.kind === 'num') return <NumUnitField key={f.key} label={f.label} value={cv == null ? '' : String(cv)} onCommit={(v) => onChange({ [f.key]: Number(v) || 0 })} />;
        if (f.kind === 'boolsel') return <CSelect key={f.key} label={f.label} value={cv === true ? 'Tak' : cv === false ? 'Nie' : ''} options={['Nie', 'Tak']} onChange={(v) => onChange({ [f.key]: v === 'Tak' })} />;
        return <CSelect key={f.key} label={f.label} value={cv == null ? '' : String(cv)} options={f.opts!} onChange={(v) => onChange({ [f.key]: f.num ? Number(v) || 0 : v })} />;
      })}
    </>
  );
}

interface FpBase { id: string; locked: boolean }
type FpEl =
  | ({ t: 'track'; pts: Pt[]; width: number; layer: string } & FpBase)
  | ({ t: 'pad'; x: number; y: number; shape: string; w: number; h: number; rot: number; holeShape: string; hole: number; plated: string; num: string; expansion: number; layer: string } & FpBase)
  | ({ t: 'via'; x: number; y: number; dia: number; holeW: number } & FpBase)
  | ({ t: 'ftext'; x: number; y: number; text: string; font: string; lineWidth: number; height: number; rot: number; layer: string } & FpBase)
  | ({ t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; width: number; dir: string; arcType: string; layer: string } & FpBase)
  | ({ t: 'fcircle'; cx: number; cy: number; r: number; width: number; layer: string } & FpBase)
  | ({ t: 'hole'; x: number; y: number; hole: number } & FpBase)
  | ({ t: 'fill'; pts: Pt[]; fillType: string; layer: string } & FpBase)
  | ({ t: 'dimension'; x1: number; y1: number; x2: number; y2: number; unit: string; precision: number; width: number; layer: string } & FpBase)
  | ({ t: 'frect'; x: number; y: number; w: number; h: number; fill: string; width: number; layer: string } & FpBase)
  | ({ t: 'copper'; pts: Pt[]; layer: string; name: string; net: string; clearance: number; connect: string; spokeWidth: number; keepIsland: string; fillStyle: string; copperToRa: number; improveProd: string } & FpBase)
  | ({ t: 'group'; children: FpEl[] } & FpBase);

const fpTrack = (p: Pt): FpEl => ({ t: 'track', pts: [p], width: 10, layer: 'Górna warstwa', locked: false, id: newId() });
const fpCopper = (p: Pt): FpEl => ({ t: 'copper', pts: [p], layer: 'Górna warstwa', name: newId(), net: '', clearance: 10, connect: 'Obramowanie', spokeWidth: 0, keepIsland: 'Nie', fillStyle: 'Stałe', copperToRa: 10, improveProd: 'Tak', locked: false, id: newId() });
const fpPad = (x: number, y: number, no: number): FpEl => ({ t: 'pad', x, y, shape: 'Okrąg', w: 60, h: 60, rot: 0, holeShape: 'Okrąg', hole: 36, plated: 'Tak', num: String(no), expansion: 2, layer: 'Wielowastwa', locked: false, id: newId() });
const fpVia = (x: number, y: number): FpEl => ({ t: 'via', x, y, dia: 24, holeW: 12, locked: false, id: newId() });
const fpText = (x: number, y: number, text: string): FpEl => ({ t: 'ftext', x, y, text, font: 'domyślny', lineWidth: 8, height: 80, rot: 0, layer: 'Górna warstwa', locked: false, id: newId() });
const fpHole = (x: number, y: number): FpEl => ({ t: 'hole', x, y, hole: 80, locked: false, id: newId() });

function renderFpEl(el: FpEl, key: React.Key, preview = false, layers?: LayerState) {
  const op = preview ? 0.6 : 1;
  const layer = 'layer' in el ? el.layer : undefined;
  const st = layer && layers ? layers[layer] : undefined;
  if (st && !st.visible && !preview) return null; // warstwa ukryta → nie rysuj
  const col = st ? st.color : layer ? fpLayer(layer) : '#c9a227';
  switch (el.t) {
    case 'track': return <polyline key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={col} strokeWidth={el.width} strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
    case 'pad': { const pc = st ? st.color : fpLayer(el.layer); const pad = el.shape === 'Prostokąt' ? <rect x={-el.w / 2} y={-el.h / 2} width={el.w} height={el.h} fill={pc} /> : <ellipse cx={0} cy={0} rx={el.w / 2} ry={el.h / 2} fill={pc} />; return <g key={key} transform={`translate(${el.x},${el.y}) rotate(${el.rot})`} opacity={op}>{pad}{el.hole > 0 && <circle r={el.hole / 2} fill="#111" />}<text y={3} fontSize={7} fill="#1b1f24" textAnchor="middle" fontFamily="sans-serif">{el.num}</text></g>; }
    case 'via': return <g key={key} opacity={op}><circle cx={el.x} cy={el.y} r={el.dia / 2} fill="#c9a227" /><circle cx={el.x} cy={el.y} r={el.holeW / 2} fill="#111" /></g>;
    case 'ftext': return <text key={key} x={el.x} y={el.y} fontSize={el.height} fill={col} fontFamily="sans-serif" transform={`rotate(${el.rot} ${el.x} ${el.y})`} opacity={op}>{el.text}</text>;
    case 'arc': { const rad = (d: number) => d * Math.PI / 180; const p0 = { x: el.cx + el.r * Math.cos(rad(el.a0)), y: el.cy + el.r * Math.sin(rad(el.a0)) }, p1 = { x: el.cx + el.r * Math.cos(rad(el.a1)), y: el.cy + el.r * Math.sin(rad(el.a1)) }; const large = Math.abs(el.a1 - el.a0) % 360 > 180 ? 1 : 0, sweep = el.dir === 'Anti-Clockwise' ? 0 : 1; return <path key={key} d={`M${p0.x},${p0.y} A${el.r},${el.r} 0 ${large} ${sweep} ${p1.x},${p1.y}`} fill="none" stroke={col} strokeWidth={el.width} opacity={op} />; }
    case 'fcircle': return <circle key={key} cx={el.cx} cy={el.cy} r={Math.abs(el.r)} fill="none" stroke={col} strokeWidth={el.width} opacity={op} />;
    case 'hole': return <circle key={key} cx={el.x} cy={el.y} r={el.hole / 2} fill="#111" stroke="#c9a227" strokeWidth={1} opacity={op} />;
    case 'fill': return <polygon key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={col} fillOpacity={0.35} stroke={col} strokeWidth={2} opacity={op} />;
    case 'copper': return <polygon key={key} points={el.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={col} fillOpacity={el.fillStyle === 'Brak' ? 0 : 0.28} stroke={col} strokeWidth={2} strokeDasharray={preview ? '4 3' : undefined} opacity={op} />;
    case 'dimension': { const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1); return <g key={key} opacity={op}><line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={col} strokeWidth={el.width} /><text x={(el.x1 + el.x2) / 2} y={(el.y1 + el.y2) / 2 - 4} fontSize={28} fill={col} textAnchor="middle">{(len * W2MM).toFixed(el.precision)}mm</text></g>; }
    case 'frect': return <rect key={key} x={Math.min(el.x, el.x + el.w)} y={Math.min(el.y, el.y + el.h)} width={Math.abs(el.w)} height={Math.abs(el.h)} fill={el.fill === 'Tak' ? col : 'none'} stroke={col} strokeWidth={el.width} opacity={op} />;
    case 'group': return <g key={key} opacity={op}>{el.children.map((c, i) => renderFpEl(c, `${key}-${i}`, preview, layers))}</g>;
    default: return null;
  }
}
function elBBoxFp(el: FpEl): { x: number; y: number; w: number; h: number } {
  if (el.t === 'group') { if (!el.children.length) return { x: 0, y: 0, w: 0, h: 0 }; const bs = el.children.map(elBBoxFp); const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y)); return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 }; }
  switch (el.t) {
    case 'track': case 'fill': case 'copper': { const xs = el.pts.map((p) => p.x), ys = el.pts.map((p) => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'pad': return { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
    case 'via': return { x: el.x - el.dia / 2, y: el.y - el.dia / 2, w: el.dia, h: el.dia };
    case 'ftext': return { x: el.x, y: el.y - el.height, w: Math.max(20, el.text.length * el.height * 0.6), h: el.height * 1.3 };
    case 'arc': case 'fcircle': return { x: el.cx - Math.abs(el.r), y: el.cy - Math.abs(el.r), w: 2 * Math.abs(el.r), h: 2 * Math.abs(el.r) };
    case 'hole': return { x: el.x - el.hole / 2, y: el.y - el.hole / 2, w: el.hole, h: el.hole };
    case 'dimension': { const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2); return { x, y, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) }; }
    case 'frect': return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
    default: return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// ── Uchwyty (gripy) zaznaczonego elementu — punkty charakterystyczne + edycja geometrii ───────
// Każdy grip ma pozycję (x,y) oraz `on(orig, np)` zwracające zmodyfikowany element po przeciągnięciu.
type ElGrip = { x: number; y: number; on: (el: El, np: Pt) => El };
type FpGrip = { x: number; y: number; on: (el: FpEl, np: Pt) => FpEl };
const setPt = (pts: Pt[], i: number, np: Pt): Pt[] => pts.map((p, k) => (k === i ? np : p));
const moveSeg = (pts: Pt[], i: number, np: Pt): Pt[] => { const dx = np.x - (pts[i].x + pts[i + 1].x) / 2, dy = np.y - (pts[i].y + pts[i + 1].y) / 2; return pts.map((p, k) => (k === i || k === i + 1 ? { x: p.x + dx, y: p.y + dy } : p)); };
// Gripy dla geometrii opartej na liście punktów: wierzchołki (przesuń wierzchołek) + środki (przesuń odcinek)
function ptsGrips<T extends { pts: Pt[] }>(el: T): { x: number; y: number; on: (e: T, np: Pt) => T }[] {
  const g: { x: number; y: number; on: (e: T, np: Pt) => T }[] = [];
  el.pts.forEach((p, i) => g.push({ x: p.x, y: p.y, on: (e, np) => ({ ...e, pts: setPt(e.pts, i, np) }) }));
  for (let i = 0; i + 1 < el.pts.length; i++) g.push({ x: (el.pts[i].x + el.pts[i + 1].x) / 2, y: (el.pts[i].y + el.pts[i + 1].y) / 2, on: (e, np) => ({ ...e, pts: moveSeg(e.pts, i, np) }) });
  return g;
}
// Gripy prostokąta: 4 narożniki (resize) + 4 środki krawędzi (resize 1 wymiar) + środek (przesuń)
function rectGrips<T extends { x: number; y: number; w: number; h: number }>(el: T): { x: number; y: number; on: (e: T, np: Pt) => T }[] {
  const { x, y, w, h } = el, x1 = x + w, y1 = y + h, cx = x + w / 2, cy = y + h / 2;
  const R = (e: T) => ({ x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h });
  return [
    { x, y, on: (e, np) => { const r = R(e); return { ...e, x: np.x, y: np.y, w: r.x1 - np.x, h: r.y1 - np.y }; } },
    { x: x1, y, on: (e, np) => { const r = R(e); return { ...e, y: np.y, w: np.x - r.x0, h: r.y1 - np.y }; } },
    { x: x1, y: y1, on: (e, np) => ({ ...e, w: np.x - e.x, h: np.y - e.y }) },
    { x, y: y1, on: (e, np) => { const r = R(e); return { ...e, x: np.x, w: r.x1 - np.x, h: np.y - r.y0 }; } },
    { x: cx, y, on: (e, np) => { const r = R(e); return { ...e, y: np.y, h: r.y1 - np.y }; } },
    { x: x1, y: cy, on: (e, np) => ({ ...e, w: np.x - e.x }) },
    { x: cx, y: y1, on: (e, np) => ({ ...e, h: np.y - e.y }) },
    { x, y: cy, on: (e, np) => { const r = R(e); return { ...e, x: np.x, w: r.x1 - np.x }; } },
    { x: cx, y: cy, on: (e, np) => ({ ...e, x: np.x - e.w / 2, y: np.y - e.h / 2 }) },
  ];
}
// Gripy elipsy/łuku: środek (przesuń) + 4 kwadranty (promień rx/ry)
function radGrips<T extends { cx: number; cy: number; rx: number; ry: number }>(el: T): { x: number; y: number; on: (e: T, np: Pt) => T }[] {
  return [
    { x: el.cx, y: el.cy, on: (e, np) => ({ ...e, cx: np.x, cy: np.y }) },
    { x: el.cx - el.rx, y: el.cy, on: (e, np) => ({ ...e, rx: Math.abs(np.x - e.cx) }) },
    { x: el.cx + el.rx, y: el.cy, on: (e, np) => ({ ...e, rx: Math.abs(np.x - e.cx) }) },
    { x: el.cx, y: el.cy - el.ry, on: (e, np) => ({ ...e, ry: Math.abs(np.y - e.cy) }) },
    { x: el.cx, y: el.cy + el.ry, on: (e, np) => ({ ...e, ry: Math.abs(np.y - e.cy) }) },
  ];
}
function gripsEl(el: El): ElGrip[] {
  switch (el.t) {
    case 'line': case 'polygon': case 'bezier': case 'wire': case 'bus': case 'freehand': return ptsGrips(el) as ElGrip[];
    case 'rect': return rectGrips(el) as ElGrip[];
    case 'ellipse': case 'arc': case 'pie': return radGrips(el) as ElGrip[];
    case 'busentry': return [
      { x: el.x1, y: el.y1, on: (e, np) => ({ ...(e as El & { x1: number; y1: number }), x1: np.x, y1: np.y }) },
      { x: el.x2, y: el.y2, on: (e, np) => ({ ...(e as El & { x2: number; y2: number }), x2: np.x, y2: np.y }) },
    ];
    // Elementy punktowe (pin, GND/VCC/+5V, net, X, text, strzałka, obraz) — nie edytuje się ich gripami
    default: return [];
  }
}
function gripsFp(el: FpEl): FpGrip[] {
  switch (el.t) {
    case 'track': case 'copper': case 'fill': return ptsGrips(el) as FpGrip[];
    case 'frect': return rectGrips(el) as FpGrip[];
    case 'fcircle': case 'arc': { const cx = el.cx, cy = el.cy, r = Math.abs(el.r); return [
      { x: cx, y: cy, on: (e, np) => ({ ...(e as FpEl & { cx: number; cy: number }), cx: np.x, cy: np.y }) },
      { x: cx - r, y: cy, on: (e, np) => ({ ...(e as FpEl & { cx: number; r: number }), r: Math.hypot(np.x - (e as FpEl & { cx: number }).cx, np.y - (e as FpEl & { cy: number }).cy) }) },
      { x: cx + r, y: cy, on: (e, np) => ({ ...(e as FpEl & { r: number }), r: Math.hypot(np.x - (e as FpEl & { cx: number }).cx, np.y - (e as FpEl & { cy: number }).cy) }) },
      { x: cx, y: cy - r, on: (e, np) => ({ ...(e as FpEl & { r: number }), r: Math.hypot(np.x - (e as FpEl & { cx: number }).cx, np.y - (e as FpEl & { cy: number }).cy) }) },
      { x: cx, y: cy + r, on: (e, np) => ({ ...(e as FpEl & { r: number }), r: Math.hypot(np.x - (e as FpEl & { cx: number }).cx, np.y - (e as FpEl & { cy: number }).cy) }) },
    ]; }
    case 'pad': { const hw = el.w / 2, hh = el.h / 2; const corner = (e: FpEl, np: Pt) => ({ ...(e as FpEl & { x: number; y: number; w: number; h: number }), w: Math.max(1, 2 * Math.abs(np.x - (e as FpEl & { x: number }).x)), h: Math.max(1, 2 * Math.abs(np.y - (e as FpEl & { y: number }).y)) }); return [
      { x: el.x, y: el.y, on: (e, np) => ({ ...(e as FpEl & { x: number; y: number }), x: np.x, y: np.y }) },
      { x: el.x - hw, y: el.y - hh, on: corner }, { x: el.x + hw, y: el.y - hh, on: corner }, { x: el.x + hw, y: el.y + hh, on: corner }, { x: el.x - hw, y: el.y + hh, on: corner },
    ]; }
    case 'dimension': return [
      { x: el.x1, y: el.y1, on: (e, np) => ({ ...(e as FpEl & { x1: number; y1: number }), x1: np.x, y1: np.y }) },
      { x: el.x2, y: el.y2, on: (e, np) => ({ ...(e as FpEl & { x2: number; y2: number }), x2: np.x, y2: np.y }) },
    ];
    // via / hole / ftext — punktowe, bez edycji gripami
    default: return [];
  }
}
// Rysuje markery (uchwyty) w punktach gripów — stały rozmiar ekranowy niezależnie od zoomu
function gripMarkers(pts: { x: number; y: number }[], zoom: number, keyPrefix: string, color = '#4fc3f7'): React.ReactNode[] {
  const s = 3.2 / zoom;
  return pts.map((p, i) => <rect key={`${keyPrefix}-g${i}`} x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} fill="#ffffff" stroke={color} strokeWidth={1.2 / zoom} style={{ cursor: 'pointer' }} />);
}

const FOOTPRINT_TOOLS: Tool[] = [
  { id: 'track', title: 'Track (W)', icon: TrackIcon }, { id: 'pad', title: 'Pad (P)', icon: PadIcon },
  { id: 'via', title: 'Via (V)', icon: ViaIcon }, { id: 'ftext', title: 'Text (S)', icon: TextIcon },
  { id: 'arc', title: 'Łuk', icon: ArcIcon }, { id: 'arcc', title: 'Arc center (U)', icon: ArcCIcon },
  { id: 'fcircle', title: 'Circle (C)', icon: EllipseIcon }, { id: 'pan', title: 'Przenieś', icon: PanToolOutlinedIcon },
  { id: 'hole', title: 'Otwór', icon: HoleIcon }, { id: 'image', title: 'Obraz', icon: ImageOutlinedIcon },
  { id: 'origin', title: 'Set Canvas Origin (Home)', icon: OriginIcon }, { id: 'protractor', title: 'Kątomierz', icon: AngleIcon },
  { id: 'fill', title: 'Obszar Wypełniony', icon: FillIcon }, { id: 'dimension', title: 'Dimension (N)', icon: DimensionIcon },
  { id: 'frect', title: 'Prostokąt', icon: RectIcon }, { id: 'copper', title: 'Copper Area (E)', icon: CopperIcon },
];
const FP_SHORTCUTS: Record<string, string> = { w: 'track', p: 'pad', v: 'via', s: 'ftext', u: 'arcc', c: 'fcircle', n: 'dimension', e: 'copper' };

function FootprintCanvas({ elements, onChange, activeTool, setActiveTool, view, setView, onMouse, meta, selectedIdx, onSelect, overlay, onContextMenu, selectedIdxs, layers, activeLayer, marqueeMode, onSelectMany, hitPlaced, onEmptyClick, onPlacedMove, onPlacedMoveEnd, placing, onPlace, placedBBoxes, onSelectManyPlaced }: {
  elements: FpEl[]; onChange: (els: FpEl[]) => void; activeTool: string; setActiveTool: (id: string) => void;
  view: View; setView: SetView; onMouse: (p: Pt) => void; meta: FpMeta; selectedIdx: number | null; onSelect: (i: number | null, additive?: boolean) => void; selectedIdxs?: number[];
  overlay?: React.ReactNode; onContextMenu?: (e: React.MouseEvent) => void; layers?: LayerState; activeLayer?: string;
  marqueeMode?: boolean; onSelectMany?: (idxs: number[]) => void;
  // Zaznaczanie/przesuwanie komponentów z warstwy „placed" (wstawionych przez Place Component) + stawianie
  hitPlaced?: (p: Pt) => number | null; onEmptyClick?: (p: Pt) => void; onPlacedMove?: (idx: number, dx: number, dy: number) => void; onPlacedMoveEnd?: (idx: number, dx: number, dy: number) => void;
  placing?: PlacedComp | null; onPlace?: (p: Pt) => void;
  // Bboxy umieszczonych komponentów → marquee zaznacza też komponenty
  placedBBoxes?: { x: number; y: number; w: number; h: number }[]; onSelectManyPlaced?: (idxs: number[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  usePanZoom(svgRef, setView);
  const pinch = usePinch(svgRef, setView);
  const [draft, setDraft] = useState<FpEl | null>(null);
  const [mouse, setMouse] = useState<Pt | null>(null);
  const dragRef = useRef<{ mode: 'pan' | 'draw' | 'move' | 'marquee' | 'moveplaced' | 'grip'; tool?: string; start?: Pt; sx: number; sy: number; vx: number; vy: number; midxs?: number[]; mstart?: Pt } | null>(null);
  const gripRef = useRef<{ idx: number; grip: FpGrip; orig: FpEl } | null>(null);
  const [gripDraft, setGripDraft] = useState<{ idx: number; el: FpEl } | null>(null);
  const movedRef = useRef(false);
  const [grab, setGrab] = useState(false);
  const [moveDelta, setMoveDelta] = useState<{ idxs: number[]; dx: number; dy: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Nowe elementy z właściwością „Warstwy" trafiają na aktywną (domyślną) warstwę z panelu Layers.
  const commit = (el: FpEl) => { const e2 = activeLayer && 'layer' in el ? { ...el, layer: activeLayer } as FpEl : el; onChange([...elements, e2]); };
  const snapS = meta.snap === 'Nie' ? 1 : Math.max(1, fromMm(meta.snapSize) || 5);
  const world = (e: { clientX: number; clientY: number }): Pt => { const r = svgRef.current!.getBoundingClientRect(); const sn = (v: number) => Math.round(v / snapS) * snapS; return { x: sn((e.clientX - r.left - view.x) / view.zoom), y: sn((e.clientY - r.top - view.y) / view.zoom) }; };
  // Trafienie pojedynczego elementu (obsługuje krawędziowe trafianie niewypełnionych obrysów)
  const hitOne = (el: FpEl, p: Pt, pad: number): boolean => {
    if (el.t === 'fcircle') { const d = Math.hypot(p.x - el.cx, p.y - el.cy); return Math.abs(d - Math.abs(el.r)) <= pad + el.width / 2; }
    if (el.t === 'frect' && el.fill !== 'Tak') {
      const x0 = Math.min(el.x, el.x + el.w), x1 = Math.max(el.x, el.x + el.w), y0 = Math.min(el.y, el.y + el.h), y1 = Math.max(el.y, el.y + el.h);
      const inX = p.x >= x0 - pad && p.x <= x1 + pad, inY = p.y >= y0 - pad && p.y <= y1 + pad;
      return ((Math.abs(p.x - x0) <= pad || Math.abs(p.x - x1) <= pad) && inY) || ((Math.abs(p.y - y0) <= pad || Math.abs(p.y - y1) <= pad) && inX);
    }
    const b = elBBoxFp(el); return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
  };
  // Kandydaci pod kursorem, „najmniejsze/na wierzchu najpierw" (drobny element pod dużym obrysem łatwo trafialny)
  const hitCandidates = (p: Pt): number[] => {
    const pad = 8 / view.zoom;
    const cands: { i: number; area: number }[] = [];
    for (let i = 0; i < elements.length; i++) { if (hitOne(elements[i], p, pad)) { const b = elBBoxFp(elements[i]); cands.push({ i, area: Math.max(1, b.w) * Math.max(1, b.h) }); } }
    cands.sort((a, b) => (a.area - b.area) || (b.i - a.i));
    return cands.map((c) => c.i);
  };
  const hitTest = (p: Pt): number | null => { const c = hitCandidates(p); return c.length ? c[0] : null; };
  const selDownRef = useRef(false); // pointerDown obsłużył już zaznaczenie → onClk nie dubluje wyboru
  const DRAG = ['frect', 'fcircle', 'arc', 'arcc', 'dimension'];
  const panMode = activeTool === '' || activeTool === 'pan';
  const downPos = useRef({ x: 0, y: 0 });

  const buildDrag = (tool: string, s: Pt, p: Pt): FpEl => {
    if (tool === 'frect') return { t: 'frect', x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y, fill: 'Nie', width: 10, layer: 'Górna warstwa opisowa', locked: false, id: newId() };
    if (tool === 'fcircle') return { t: 'fcircle', cx: s.x, cy: s.y, r: Math.hypot(p.x - s.x, p.y - s.y), width: 10, layer: 'Górna warstwa', locked: false, id: newId() };
    if (tool === 'dimension') return { t: 'dimension', x1: s.x, y1: s.y, x2: p.x, y2: p.y, unit: 'mm', precision: 3, width: 4, layer: 'Dokument', locked: false, id: newId() };
    return { t: 'arc', cx: s.x, cy: s.y, r: Math.hypot(p.x - s.x, p.y - s.y) || 1, a0: 0, a1: 180, width: 10, dir: 'Anti-Clockwise', arcType: 'Center Point Arc', layer: 'Górna warstwa', locked: false, id: newId() };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') pinch.add(e, view);
    if (pinch.active()) { dragRef.current = null; setGrab(false); setDraft(null); return; } // 2 palce → pinch
    selDownRef.current = false;
    // Panoramowanie: środkowy przycisk / Alt+lewy
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; setGrab(true); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    if (e.button !== 0) return; movedRef.current = false; downPos.current = { x: e.clientX, y: e.clientY };
    if (placing) return; // tryb stawiania: bez pan/move — ruch przesuwa ducha (onMouse), tap osadza (onClk)
    if (panMode) {
      const wp = world(e);
      // Uchwyty (gripy) — edycja geometrii tylko przy POJEDYNCZYM zaznaczeniu (przy grupie klik odznacza normalnie)
      const soloSel = (selectedIdxs?.length ?? 0) <= 1 && selectedIdx != null ? selectedIdx : null;
      if (!e.shiftKey && soloSel != null) {
        const el = elements[soloSel]; const tol = Math.min(10, 6 / view.zoom);
        const g = el && !(el as { locked?: boolean }).locked ? gripsFp(el).find((gg) => Math.abs(gg.x - wp.x) <= tol && Math.abs(gg.y - wp.y) <= tol) : undefined;
        if (g) { selDownRef.current = true; gripRef.current = { idx: soloSel, grip: g, orig: el }; setGripDraft({ idx: soloSel, el }); dragRef.current = { mode: 'grip', mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); return; } }

      const hit = hitTest(wp);
      if (hit != null && !(elements[hit] as { locked?: boolean }).locked) { // klik = zaznacz (Shift = dołącz/odłącz); przeciągnięcie przesuwa
        selDownRef.current = true;
        if (e.shiftKey) { onSelect(hit, true); e.currentTarget.setPointerCapture(e.pointerId); return; }
        const multi = selectedIdxs && selectedIdxs.length > 1 && selectedIdxs.includes(hit);
        if (!multi) onSelect(hit, false);
        dragRef.current = { mode: 'move', midxs: multi ? selectedIdxs! : [hit], mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      if (hit == null && hitPlaced) { // przeciąganie komponentu z warstwy „placed" (Place Component)
        const pi = hitPlaced(wp);
        if (pi != null) { dragRef.current = { mode: 'moveplaced', midxs: [pi], mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); return; }
      }
      // Puste miejsce: tryb „Zaznacz obszar" lub Shift (mysz) → prostokąt zaznaczenia; inaczej panoramowanie
      if (hit == null && onSelectMany && (marqueeMode || (e.shiftKey && e.pointerType !== 'touch'))) {
        dragRef.current = { mode: 'marquee', mstart: wp, sx: 0, sy: 0, vx: 0, vy: 0 }; setMarquee({ x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y }); e.currentTarget.setPointerCapture(e.pointerId); return;
      }
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; setGrab(true); e.currentTarget.setPointerCapture(e.pointerId); return;
    }
    if (DRAG.includes(activeTool)) { const p = world(e); dragRef.current = { mode: 'draw', tool: activeTool, start: p, sx: 0, sy: 0, vx: 0, vy: 0 }; }
  };
  const onMove = (e: React.PointerEvent) => {
    if (pinch.move(e)) return; // gest szczypania
    const p = world(e); setMouse(p); onMouse(p);
    const dr = dragRef.current; if (!dr) return;
    if (Math.abs(e.clientX - downPos.current.x) + Math.abs(e.clientY - downPos.current.y) > 4) movedRef.current = true;
    if (dr.mode === 'pan') { setView((v) => ({ ...v, x: dr.vx + (e.clientX - dr.sx), y: dr.vy + (e.clientY - dr.sy) })); return; }
    if (dr.mode === 'grip') { const gr = gripRef.current; if (gr) setGripDraft({ idx: gr.idx, el: gr.grip.on(gr.orig, p) }); return; }
    if (dr.mode === 'move') { setMoveDelta({ idxs: dr.midxs!, dx: p.x - dr.mstart!.x, dy: p.y - dr.mstart!.y }); return; }
    if (dr.mode === 'moveplaced') { onPlacedMove?.(dr.midxs![0], p.x - dr.mstart!.x, p.y - dr.mstart!.y); return; }
    if (dr.mode === 'marquee') { setMarquee({ x0: dr.mstart!.x, y0: dr.mstart!.y, x1: p.x, y1: p.y }); return; }
    setDraft(buildDrag(dr.tool!, dr.start!, p));
  };
  const onUp = (e: React.PointerEvent) => {
    pinch.up(e);
    const dr = dragRef.current; if (!dr) return; dragRef.current = null; setGrab(false);
    if (dr.mode === 'pan') return;
    if (dr.mode === 'grip') { const gr = gripRef.current; gripRef.current = null; if (gr && movedRef.current) { const np = world(e); const edited = gr.grip.on(gr.orig, np); onChange(elements.map((el, i) => (i === gr.idx ? edited : el))); } setGripDraft(null); return; }
    if (dr.mode === 'move') { const p2 = world(e); const dx = p2.x - dr.mstart!.x, dy = p2.y - dr.mstart!.y; if (movedRef.current && (dx || dy)) { const set = new Set(dr.midxs!); onChange(elements.map((el, i) => (set.has(i) ? translateEl(el, dx, dy) : el))); } setMoveDelta(null); return; }
    if (dr.mode === 'moveplaced') { const p2 = world(e); onPlacedMoveEnd?.(dr.midxs![0], p2.x - dr.mstart!.x, p2.y - dr.mstart!.y); return; }
    if (dr.mode === 'marquee') {
      const p2 = world(e); const rx0 = Math.min(dr.mstart!.x, p2.x), ry0 = Math.min(dr.mstart!.y, p2.y), rx1 = Math.max(dr.mstart!.x, p2.x), ry1 = Math.max(dr.mstart!.y, p2.y);
      const idxs = elements.map((el, i) => { const b = elBBoxFp(el); return b.x <= rx1 && b.x + b.w >= rx0 && b.y <= ry1 && b.y + b.h >= ry0 ? i : -1; }).filter((i) => i >= 0);
      const pidxs = (placedBBoxes || []).map((b, i) => (b.x <= rx1 && b.x + b.w >= rx0 && b.y <= ry1 && b.y + b.h >= ry0 ? i : -1)).filter((i) => i >= 0);
      onSelectMany?.(idxs); onSelectManyPlaced?.(pidxs); setMarquee(null); return;
    }
    const p = world(e), s = dr.start!;
    if (Math.abs(p.x - s.x) > 2 || Math.abs(p.y - s.y) > 2) commit(buildDrag(dr.tool!, s, p));
    setDraft(null);
  };
  const onClk = (e: React.MouseEvent) => {
    if (placing) { if (!movedRef.current) onPlace?.(world(e)); return; } // osadzenie komponentu (Place Component)
    const t = activeTool; if (DRAG.includes(t)) return;
    if (panMode) { if (marqueeMode) return; if (selDownRef.current) { selDownRef.current = false; return; } if (!movedRef.current) { const wp = world(e); if (hitTest(wp) == null) { if (onEmptyClick && !e.shiftKey) onEmptyClick(wp); else if (!e.shiftKey) onSelect(null); } } return; }
    const p = world(e);
    switch (t) {
      case 'pad': { const no = elements.filter((el) => el.t === 'pad').length + 1; commit(fpPad(p.x, p.y, no)); break; }
      case 'via': commit(fpVia(p.x, p.y)); break;
      case 'hole': commit(fpHole(p.x, p.y)); break;
      case 'ftext': { const s = window.prompt('Tekst:', 'TEXT'); if (s !== null) commit(fpText(p.x, p.y, s || 'TEXT')); break; }
      case 'track': setDraft((d) => (d && d.t === 'track' ? { ...d, pts: [...d.pts, p] } : fpTrack(p))); break;
      case 'fill': setDraft((d) => (d && d.t === 'fill' ? { ...d, pts: [...d.pts, p] } : { t: 'fill', pts: [p], fillType: 'Stałe', layer: 'Górna warstwa', locked: false, id: newId() })); break;
      case 'copper': setDraft((d) => (d && d.t === 'copper' ? { ...d, pts: [...d.pts, p] } : fpCopper(p))); break;
    }
  };
  const finish = () => { if (draft && (draft.t === 'track' || draft.t === 'fill' || draft.t === 'copper') && draft.pts.length >= 2) commit(draft); setDraft(null); };
  const finishRef = useRef(finish); finishRef.current = finish;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey) return; // Ctrl+C/V/X/Z obsługuje globalny handler
      if (e.key === 'Home') { e.preventDefault(); setActiveTool('origin'); return; }
      if (e.key === 'Enter') { finishRef.current(); return; }
      if (e.key === 'Escape') { setDraft(null); setActiveTool(''); return; }
      const id = FP_SHORTCUTS[e.key.toLowerCase()]; if (id) { e.preventDefault(); setActiveTool(id); setDraft(null); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const g = parseFloat(meta.gridSize) ? (parseFloat(meta.gridSize) / W2MM) * view.zoom : 100 * view.zoom;
  const preview = draft && (draft.t === 'track' || draft.t === 'fill' || draft.t === 'copper') && mouse ? ({ ...draft, pts: [...draft.pts, mouse] } as FpEl) : draft;
  return (
    <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block', touchAction: 'none', cursor: panMode ? (grab ? 'grabbing' : 'grab') : 'crosshair', userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp} onClick={onClk} onDoubleClick={finish} onContextMenu={onContextMenu ?? ((e) => { e.preventDefault(); finish(); })}>
      <defs><pattern id="fpgrid" width={g} height={g} patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x},${view.y})`}><path d={`M${g} 0 L0 0 0 ${g}`} fill="none" stroke={meta.gridColor || '#FFFFFF'} strokeOpacity={meta.gridShow === 'Nie' ? 0 : 0.22} strokeWidth={1} /></pattern></defs>
      <rect width="100%" height="100%" fill={meta.bg || '#000000'} /><rect width="100%" height="100%" fill="url(#fpgrid)" />
      <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
        {elements.map((el, i) => renderFpEl(gripDraft && gripDraft.idx === i ? gripDraft.el : (moveDelta && moveDelta.idxs.includes(i) ? translateEl(el, moveDelta.dx, moveDelta.dy) : el), i, false, layers))}
        {preview && renderFpEl(preview, 'draft', true, layers)}
        {/* Wstawione komponenty (footprinty) rysujemy NAD miedzią/wypełnieniami płytki —
            inaczej wypełnienie warstwy płytki przykrywało pady (np. górnej warstwy) footprintu. */}
        {overlay}
        {(() => { const sel = selectedIdxs && selectedIdxs.length ? selectedIdxs : selectedIdx != null ? [selectedIdx] : []; const showGrips = sel.length <= 12; return sel.map((si) => { if (!elements[si]) return null; const el = gripDraft && gripDraft.idx === si ? gripDraft.el : moveDelta && moveDelta.idxs.includes(si) ? translateEl(elements[si], moveDelta.dx, moveDelta.dy) : elements[si]; const b = elBBoxFp(el); return <g key={si}><rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke="#4fc3f7" strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`} />{showGrips && gripMarkers(gripsFp(el), view.zoom, `s${si}`)}</g>; }); })()}
        {marquee && <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} fill="#4fc3f7" fillOpacity={0.12} stroke="#4fc3f7" strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${2 / view.zoom}`} />}
      </g>
    </svg>
  );
}

// Panel właściwości pojedynczego elementu footprintu
function FpElProps({ el, onChange, layerNames }: { el: FpEl; onChange: (p: Patch) => void; layerNames?: string[] }) {
  const layerSel = (l: string) => <CSelect label="Warstwy" value={l} options={layerNames ?? FP_LAYERS} onChange={(v) => onChange({ layer: v })} />;
  const locked = <CSelect label="Locked" value={el.locked ? 'Tak' : 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ locked: v === 'Tak' })} />;
  const idf = <CField label="ID" value={el.id} onChange={() => { }} disabled />;
  const mm = (lbl: string, val: number, key: string, yup = false) => <NumUnitField label={lbl} value={toMm(yup ? -val : val)} onCommit={(v) => onChange({ [key]: yup ? -fromMm(v) : fromMm(v) })} />;
  const expose = <Box sx={{ px: 1.5, py: 1 }}><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13, width: '100%' }}>Expose Copper</Button></Box>;
  switch (el.t) {
    case 'track': { const p0 = el.pts[0] ?? { x: 0, y: 0 }, pN = el.pts[el.pts.length - 1] ?? { x: 0, y: 0 }; const len = el.pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - el.pts[i - 1].x, p.y - el.pts[i - 1].y) : 0), 0); const setP = (idx: number, nx: number, ny: number) => onChange({ pts: el.pts.map((p, i) => (i === idx ? { x: nx, y: ny } : p)) });
      return <><SectionHeader title="Właściwości ścieżki" />{layerSel(el.layer)}{mm('Szerokość', el.width, 'width')}
        <NumUnitField label="Początek X" value={toMm(p0.x)} onCommit={(v) => setP(0, fromMm(v), p0.y)} /><NumUnitField label="Początek Y" value={toMm(-p0.y)} onCommit={(v) => setP(0, p0.x, -fromMm(v))} />
        <NumUnitField label="Koniec X" value={toMm(pN.x)} onCommit={(v) => setP(el.pts.length - 1, fromMm(v), pN.y)} /><NumUnitField label="Koniec Y" value={toMm(-pN.y)} onCommit={(v) => setP(el.pts.length - 1, pN.x, -fromMm(v))} />
        <CField label="Długość" value={toMm(len)} onChange={() => { }} disabled />{idf}{locked}{expose}</>; }
    case 'pad':
      return <><SectionHeader title="Właściwości pola lutowniczego" />{layerSel(el.layer)}
        <CField label="Numer" value={el.num} onChange={(v) => onChange({ num: v })} /><CSelect label="Kształt" value={el.shape} options={['Okrąg', 'Prostokąt', 'Owal']} onChange={(v) => onChange({ shape: v })} />
        {mm('Szerokość', el.w, 'w')}{mm('Wysokość', el.h, 'h')}<NumUnitField label="Obrót" value={String(el.rot)} onCommit={(v) => onChange({ rot: Number(v) || 0 })} />
        <CSelect label="Kształt Otworu" value={el.holeShape} options={['Okrąg', 'Slot']} onChange={(v) => onChange({ holeShape: v })} />{mm('Otwór', el.hole, 'hole')}<CSelect label="Powlekany" value={el.plated} options={['Tak', 'Nie']} onChange={(v) => onChange({ plated: v })} />
        {mm('Środek X', el.x, 'x')}{mm('Środek Y', el.y, 'y', true)}{mm('Ekspancja Ma…', el.expansion, 'expansion')}{idf}{locked}</>;
    case 'via':
      return <><SectionHeader title="Właściwości przelotki" />{mm('Średnica', el.dia, 'dia')}{mm('Szerokość Wi…', el.holeW, 'holeW')}{mm('Środek X', el.x, 'x')}{mm('Środek Y', el.y, 'y', true)}{idf}{locked}{expose}</>;
    case 'ftext':
      return <><SectionHeader title="Właściwości tekstu" />{layerSel(el.layer)}<CField label="Tekst" value={el.text} onChange={(v) => onChange({ text: v })} /><CSelect label="Rodzina czcio…" value={el.font} options={['domyślny', 'NotoSans', 'NotoSerif']} onChange={(v) => onChange({ font: v })} />
        <Box sx={{ px: 1.5, py: 0.5 }}><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13, width: '100%' }}>Fonts Management</Button></Box>
        {mm('Szerokość linii', el.lineWidth, 'lineWidth')}{mm('Wysokość', el.height, 'height')}<NumUnitField label="Obrót" value={String(el.rot)} onCommit={(v) => onChange({ rot: Number(v) || 0 })} />{locked}{idf}</>;
    case 'arc': { const len = Math.abs((el.a1 - el.a0) * Math.PI / 180) * el.r;
      return <><SectionHeader title="Właściwości łuku" /><CSelect label="Typ łuku" value={el.arcType} options={['Center Point Arc', 'Three Point Arc']} onChange={(v) => onChange({ arcType: v })} />{layerSel(el.layer)}{mm('Szerokość', el.width, 'width')}{mm('Promień', el.r, 'r')}
        <CField label="Długość" value={toMm(len)} onChange={() => { }} disabled /><NumUnitField label="Kąt Rozpoczę…" value={String(el.a0)} onCommit={(v) => onChange({ a0: Number(v) || 0 })} /><NumUnitField label="Kąt Zakończe…" value={String(el.a1)} onCommit={(v) => onChange({ a1: Number(v) || 0 })} />
        {mm('Środek X', el.cx, 'cx')}{mm('Środek Y', el.cy, 'cy', true)}<CSelect label="Kierunek Obrotu" value={el.dir} options={['Anti-Clockwise', 'Clockwise']} onChange={(v) => onChange({ dir: v })} />{locked}{expose}{idf}</>; }
    case 'fcircle':
      return <><SectionHeader title="Właściwości okręgu" />{layerSel(el.layer)}{mm('Szerokość', el.width, 'width')}{mm('Środek X', el.cx, 'cx')}{mm('Środek Y', el.cy, 'cy', true)}{mm('Promień', el.r, 'r')}{locked}{idf}</>;
    case 'hole':
      return <><SectionHeader title="Właściwości otworu" />{mm('Otwór', el.hole, 'hole')}{mm('Środek X', el.x, 'x')}{mm('Środek Y', el.y, 'y', true)}{idf}{locked}</>;
    case 'fill':
      return <><SectionHeader title="Obszar wypełniony" />{layerSel(el.layer)}<CSelect label="Typ" value={el.fillType} options={['Stałe', 'Siatka']} onChange={(v) => onChange({ fillType: v })} />{locked}
        <Box sx={{ px: 1.5, py: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13 }}>Edycja punktów</Button><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13 }}>Expose Copper</Button></Box>{idf}</>;
    case 'dimension': { const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      return <><SectionHeader title="Właściwości wymiarów" />{layerSel(el.layer)}<CSelect label="jednostka" value={el.unit} options={['mm', 'mil', 'inch']} onChange={(v) => onChange({ unit: v })} />
        <CField label="Długość" value={toMm(len)} onChange={() => { }} disabled /><CField label="Wysokość" value={toMm(Math.abs(el.y2 - el.y1))} onChange={() => { }} disabled />{mm('Szerokość', el.width, 'width')}<NumUnitField label="Dokładność" value={String(el.precision)} onCommit={(v) => onChange({ precision: Number(v) || 0 })} />
        {mm('Początek X', el.x1, 'x1')}{mm('Początek Y', el.y1, 'y1', true)}{mm('Koniec X', el.x2, 'x2')}{mm('Koniec Y', el.y2, 'y2', true)}{locked}{idf}</>; }
    case 'frect':
      return <><SectionHeader title="Właściwości prostokątu" />{layerSel(el.layer)}{mm('Początek X', el.x, 'x')}{mm('Początek Y', el.y, 'y', true)}{mm('Szerokość', el.w, 'w')}{mm('Wysokość', el.h, 'h')}<CSelect label="Fill" value={el.fill} options={['Nie', 'Tak']} onChange={(v) => onChange({ fill: v })} />{mm('Szerokość kr…', el.width, 'width')}{locked}{idf}</>;
    case 'copper':
      return <><SectionHeader title="Właściwości powierzchni miedzi" />{layerSel(el.layer)}
        <CField label="Nazwa" value={el.name} onChange={(v) => onChange({ name: v })} /><CField label="Sieć" value={el.net} onChange={(v) => onChange({ net: v })} />
        {mm('Odstęp', el.clearance, 'clearance')}<CSelect label="Połączenie z …" value={el.connect} options={['Obramowanie', 'Bezpośrednio', 'Termiczne']} onChange={(v) => onChange({ connect: v })} />{mm('Spoke Width', el.spokeWidth, 'spokeWidth')}
        <CSelect label="Pozostaw jak…" value={el.keepIsland} options={['Nie', 'Tak']} onChange={(v) => onChange({ keepIsland: v })} /><CSelect label="Styl wypełnienia" value={el.fillStyle} options={['Stałe', 'Siatka', 'Brak']} onChange={(v) => onChange({ fillStyle: v })} />
        {mm('Miedź do Ra…', el.copperToRa, 'copperToRa')}<CSelect label="Popraw Prod…" value={el.improveProd} options={['Tak', 'Nie']} onChange={(v) => onChange({ improveProd: v })} />{locked}
        <Box sx={{ px: 1.5, py: 0.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13 }}>Przbuduj Obszar Miedzi</Button><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13 }}>Edycja punktów</Button><Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13 }}>Add/Remove Vias</Button></Box>{idf}</>;
    default: return null;
  }
}

function FootprintProperties({ mouse, meta, onMeta, sel, onSelChange, layerNames }: { mouse: [string, string][]; meta: FpMeta; onMeta: (patch: Partial<FpMeta>) => void; sel: FpEl | null; onSelChange: (patch: Patch) => void; layerNames?: string[] }) {
  if (sel) return <PropsShell count={1}><FpElProps el={sel} onChange={onSelChange} layerNames={layerNames} /><MouseBlock rows={mouse} /></PropsShell>;
  return (
    <PropsShell count={0}>
      <SectionHeader title="Atrybuty obszaru roboczego" />
      <CSelect label="Jednostki" value={meta.units} options={['mm', 'mil', 'inch']} onChange={(v) => onMeta({ units: v })} />
      <CColor label="Tło" value={meta.bg} onChange={(v) => onMeta({ bg: v })} />
      <SectionHeader title="Siatka" />
      <CSelect label="Wyświetlanie …" value={meta.gridShow} options={['Tak', 'Nie']} onChange={(v) => onMeta({ gridShow: v })} />
      <CColor label="Kolor siatki" value={meta.gridColor} onChange={(v) => onMeta({ gridColor: v })} />
      <CSelect label="Styl siatki" value={meta.gridStyle} options={['linia', 'kropka']} onChange={(v) => onMeta({ gridStyle: v })} />
      <CSelect label="Przyciągaj" value={meta.snap} options={['Tak', 'Nie']} onChange={(v) => onMeta({ snap: v })} />
      <CField label="Rozmiar siatki" value={meta.gridSize} onChange={(v) => onMeta({ gridSize: v })} />
      <CField label="Rozmiar przy…" value={meta.snapSize} onChange={(v) => onMeta({ snapSize: v })} />
      <CField label="Przeciąganie Alt" value={meta.dragAlt} onChange={(v) => onMeta({ dragAlt: v })} />
      <SectionHeader title="Inny" />
      <CField label="Szerokość ro…" value={meta.routeWidth} onChange={(v) => onMeta({ routeWidth: v })} />
      <CSelect label="kąt routingu" value={meta.routeAngle} options={['Linia 45°', 'Linia 90°', 'Dowolny kąt']} onChange={(v) => onMeta({ routeAngle: v })} />
      <CSelect label="Usuń Pętlę" value={meta.removeLoop} options={['Nie', 'Tak']} onChange={(v) => onMeta({ removeLoop: v })} />
      <CSelect label="Cut SilkScreen" value={meta.cutSilk} options={['Tak', 'Nie']} onChange={(v) => onMeta({ cutSilk: v })} />
      <SectionHeader title="Atrybuty dodatkowe" />
      <CField label="Footprint" value={meta.footprint} onChange={(v) => onMeta({ footprint: v })} />
      <CField label="Pre" value={meta.pre} onChange={(v) => onMeta({ pre: v })} />
      <CField label="3DModel" value={meta.model3d} onChange={(v) => onMeta({ model3d: v })} />
      <CField label="Współtwórca" value="mhersztowski" onChange={() => { }} disabled />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.5 }}>
        <Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13, width: 160 }}>Add Parameter</Button>
      </Box>
      <MouseBlock rows={mouse} />
    </PropsShell>
  );
}

// Panel „Właściwości Komponentu" — dla komponentu (footprintu) wstawionego na PCB
function PlacedProps({ comp, onChange, mouse }: { comp: PlacedComp; onChange: (p: Partial<PlacedComp>) => void; mouse: [string, string][] }) {
  const num = (v: string) => Number(v) || 0;
  return (
    <PropsShell count={1}>
      <SectionHeader title="Właściwości Komponentu" />
      <CSelect label="Warstwy" value={comp.layer || 'Górna warstwa'} options={['Górna warstwa', 'Dolna warstwa']} onChange={(v) => onChange({ layer: v })} />
      <CField label="Prefiks" value={comp.ref} onChange={(v) => onChange({ ref: v })} />
      <CSelect label="Wyświetl Prefiks" value={comp.showPrefix || 'Tak'} options={['Tak', 'Nie']} onChange={(v) => onChange({ showPrefix: v })} />
      <CField label="Nazwa" value={comp.label} onChange={(v) => onChange({ label: v })} />
      <CSelect label="Wyświetlana …" value={comp.showName || 'Nie'} options={['Tak', 'Nie']} onChange={(v) => onChange({ showName: v })} />
      <NumUnitField label="Lokalizacja X" value={toMm(comp.pcbX ?? comp.x)} onCommit={(v) => onChange({ pcbX: fromMm(v) })} />
      <NumUnitField label="Lokalizacja Y" value={toMm(-(comp.pcbY ?? comp.y))} onCommit={(v) => onChange({ pcbY: -fromMm(v) })} />
      <NumUnitField label="Obrót" value={String(comp.rotation || 0)} onCommit={(v) => onChange({ rotation: num(v) })} />
      <CSelect label="Dodaj do BOM" value={comp.addToBom || 'Tak'} options={['Tak', 'Nie']} onChange={(v) => onChange({ addToBom: v })} />
      <CSelect label="Locked" value={comp.locked || 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ locked: v })} />
      <CField label="ID" value={comp.id} onChange={() => { }} disabled />
      <SectionHeader title="Atrybuty dodatkowe" />
      <CField label="Footprint" value={comp.footprint || comp.defId} onChange={() => { }} disabled />
      <CSelect label="Dostawca" value={comp.supplier || 'Nieznany'} options={['LCSC', 'Nieznany', 'Mouser', 'DigiKey']} onChange={(v) => onChange({ supplier: v })} />
      <CField label="Część Dosta…" value={comp.supplierPart || ''} onChange={(v) => onChange({ supplierPart: v })} />
      <CField label="Producent" value={comp.manufacturer || ''} onChange={(v) => onChange({ manufacturer: v })} />
      <CField label="Część Produc…" value={comp.mfrPart || ''} onChange={(v) => onChange({ mfrPart: v })} />
      <CField label="JLCPCB Part …" value={comp.jlcpcb || ''} onChange={(v) => onChange({ jlcpcb: v })} />
      <CField label="Łącze" value={comp.link || ''} onChange={(v) => onChange({ link: v })} />
      <CField label="3DModel" value={comp.model3d || ''} onChange={(v) => onChange({ model3d: v })} />
      <CField label="Współtwórca" value={comp.supplier === 'LCSC' ? 'LCSC' : 'mhersztowski'} onChange={() => { }} disabled />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.5 }}>
        <Button variant="outlined" size="small" sx={{ textTransform: 'none', color: C.green, borderColor: C.green, fontSize: 13, width: 160 }}>Add Parameter</Button>
      </Box>
      <MouseBlock rows={mouse} />
    </PropsShell>
  );
}

// Panel „Właściwości Komponentu" — dla symbolu (komponentu) na arkuszu (Image #84)
function SchPlacedProps({ comp, onChange, mouse, onEditSymbol }: { comp: PlacedComp; onChange: (p: Partial<PlacedComp>) => void; mouse: [string, string][]; onEditSymbol: () => void }) {
  const greenBtn = { textTransform: 'none' as const, color: C.green, borderColor: C.green, fontSize: 13, width: 200 };
  return (
    <PropsShell count={1}>
      <SectionHeader title="Właściwości Komponentu" />
      <CField label="Nazwa" value={comp.label} onChange={(v) => onChange({ label: v })} />
      <CSelect label="Wyświetlana …" value={comp.showName || 'Tak'} options={['Tak', 'Nie']} onChange={(v) => onChange({ showName: v })} />
      <CField label="Prefiks" value={comp.ref} onChange={(v) => onChange({ ref: v })} />
      <CSelect label="Wyświetl Prefiks" value={comp.showPrefix || 'Tak'} options={['Tak', 'Nie']} onChange={(v) => onChange({ showPrefix: v })} />
      <CSelect label="Konwertuj do …" value={comp.convertToPcb || 'Tak'} options={['Tak', 'Nie']} onChange={(v) => onChange({ convertToPcb: v })} />
      <CSelect label="Dodaj do BOM" value={comp.addToBom || 'Tak'} options={['Tak', 'Nie']} onChange={(v) => onChange({ addToBom: v })} />
      <CSelect label="Locked" value={comp.locked || 'Nie'} options={['Nie', 'Tak']} onChange={(v) => onChange({ locked: v })} />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1 }}>
        <Button variant="outlined" size="small" onClick={onEditSymbol} sx={greenBtn}>Edycja symbolu…</Button>
        <Button variant="outlined" size="small" onClick={() => window.open('https://easyeda.com', '_blank')} sx={greenBtn}>Report Error…</Button>
      </Box>
      <CField label="ID" value={comp.id} onChange={() => { }} disabled />
      <SectionHeader title="Atrybuty dodatkowe" />
      <CField label="Footprint" value={comp.footprint || comp.defId} onChange={(v) => onChange({ footprint: v })} />
      <CSelect label="Display Footp…" value={comp.displayFootprint || 'Nie'} options={['Tak', 'Nie']} onChange={(v) => onChange({ displayFootprint: v })} />
      <CSelect label="Dostawca" value={comp.supplier || 'Nieznany'} options={['LCSC', 'Nieznany', 'Mouser', 'DigiKey']} onChange={(v) => onChange({ supplier: v })} />
      <CField label="Część Dosta…" value={comp.supplierPart || ''} onChange={(v) => onChange({ supplierPart: v })} />
      <CField label="Producent" value={comp.manufacturer || ''} onChange={(v) => onChange({ manufacturer: v })} />
      <CField label="Część Produc…" value={comp.mfrPart || ''} onChange={(v) => onChange({ mfrPart: v })} />
      <CField label="JLCPCB Part …" value={comp.jlcpcb || ''} onChange={(v) => onChange({ jlcpcb: v })} />
      <CField label="Współtwórca" value={comp.supplier === 'LCSC' ? 'LCSC' : 'mhersztowski'} onChange={() => { }} disabled />
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1.5 }}>
        <Button variant="outlined" size="small" sx={greenBtn}>Add Parameter</Button>
        <Button variant="outlined" size="small" onClick={() => window.open(comp.supplierPart ? `https://www.lcsc.com/product-detail/${encodeURIComponent(comp.supplierPart)}.html` : 'https://www.lcsc.com', '_blank')} sx={greenBtn}>View Datasheet</Button>
      </Box>
      <MouseBlock rows={mouse} />
    </PropsShell>
  );
}

// ── EasyEDA / LCSC (proxy w cad-backend, bez tokena) ──────────────────────────
interface EasyProduct { lcsc: string; mpn: string; package: string; manufacturer: string; stock?: number; smtStock?: number; price?: string }
interface PickResult { defId: string; label: string; pins: number; octopart?: boolean; easyeda?: EasyEdaSym; fp?: EasyEdaSym; refPrefix?: string; savedEls?: El[]; fpEls?: FpEl[]; lcsc?: string; supplier?: string; manufacturer?: string; footprint?: string; mfrPart?: string }

// ── Import symboli / footprintów (KiCad / Eagle / EasyEDA) ────────────────────
type SNode = string | SNode[];
function parseSexpr(text: string): SNode {
  let i = 0; const n = text.length;
  const ws = () => { while (i < n && /\s/.test(text[i])) i++; };
  function node(): SNode {
    ws();
    if (text[i] === '(') { i++; const a: SNode[] = []; ws(); while (i < n && text[i] !== ')') { a.push(node()); ws(); } i++; return a; }
    if (text[i] === '"') { i++; let s = ''; while (i < n && text[i] !== '"') { if (text[i] === '\\') { s += text[i + 1] ?? ''; i += 2; } else s += text[i++]; } i++; return s; }
    let s = ''; while (i < n && !/[\s()"]/.test(text[i])) s += text[i++]; return s;
  }
  return node();
}
const sIsList = (x: SNode): x is SNode[] => Array.isArray(x);
const sTag = (x: SNode) => (sIsList(x) && typeof x[0] === 'string' ? x[0] : '');
const sKids = (x: SNode[], t: string) => x.filter((c) => sTag(c) === t) as SNode[][];
const sKid = (x: SNode[], t: string) => sKids(x, t)[0];
const sNum = (v: SNode | undefined) => { const f = parseFloat(String(v ?? '')); return Number.isNaN(f) ? 0 : f; };
const KI_SYM = 10;            // px symbolu na mm
const MM_W = 1 / W2MM;        // jednostki świata footprintu (mil) na mm
const kiLayer = (l: string) => (/B\.Cu/.test(l) ? 'Dolna warstwa' : /\*\.Cu/.test(l) ? 'Wielowastwa' : /\.Cu/.test(l) ? 'Górna warstwa' : 'Górna warstwa opisowa');
const mkPad = (x: number, y: number, num: string, shape: string, w: number, h: number, hole: number, layer: string, rot = 0): FpEl => ({ t: 'pad', x, y, shape, w, h, rot, holeShape: 'Okrąg', hole, plated: 'Tak', num, expansion: 2, layer, locked: false, id: newId() });
interface ImportResult { symbols: { name: string; els: El[] }[]; footprints: { name: string; els: FpEl[] }[]; note?: string }

function parseKicadSym(text: string): { name: string; els: El[] }[] {
  const root = parseSexpr(text); if (!sIsList(root)) return [];
  const out: { name: string; els: El[] }[] = []; const S = KI_SYM;
  for (const sym of sKids(root, 'symbol')) {
    const name = String(sym[1] ?? 'symbol'); const els: El[] = [];
    const walk = (node: SNode[]) => { for (const c of node) { if (!sIsList(c)) continue; const t = sTag(c);
      if (t === 'pin') { const at = sKid(c, 'at'), len = sKid(c, 'length'), nm = sKid(c, 'name'), nu = sKid(c, 'number'); const x = sNum(at?.[1]) * S, y = -sNum(at?.[2]) * S, ang = sNum(at?.[3]); const p = makePin(x, y, els.filter((e) => e.t === 'pin').length + 1); els.push({ ...p, x, y, length: (sNum(len?.[1]) * S) || 20, rotation: (360 - ang) % 360, name: String(nm?.[1] ?? p.name), number: String(nu?.[1] ?? p.number) }); }
      else if (t === 'rectangle') { const s = sKid(c, 'start'), e = sKid(c, 'end'); const x1 = sNum(s?.[1]) * S, y1 = -sNum(s?.[2]) * S, x2 = sNum(e?.[1]) * S, y2 = -sNum(e?.[2]) * S; els.push({ t: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), roundRadius: 0, ...shStyle() }); }
      else if (t === 'polyline') { const pts = sKid(c, 'pts'); const P = pts ? sKids(pts, 'xy').map((xy) => ({ x: sNum(xy[1]) * S, y: -sNum(xy[2]) * S })) : []; if (P.length >= 2) els.push({ t: 'line', pts: P, ...shStyle() }); }
      else if (t === 'circle') { const ct = sKid(c, 'center'), rd = sKid(c, 'radius'); els.push({ t: 'ellipse', cx: sNum(ct?.[1]) * S, cy: -sNum(ct?.[2]) * S, rx: sNum(rd?.[1]) * S, ry: sNum(rd?.[1]) * S, ...shStyle() }); }
      else if (t === 'text') { const at = sKid(c, 'at'); els.push(makeText(sNum(at?.[1]) * S, -sNum(at?.[2]) * S, String(c[1] ?? ''))); }
      else if (t === 'symbol') walk(c);
    } };
    walk(sym); if (els.length) out.push({ name, els });
  }
  return out;
}
function parseKicadMod(text: string): { name: string; els: FpEl[] } | null {
  const root = parseSexpr(text); if (!sIsList(root)) return null;
  if (sTag(root) !== 'footprint' && sTag(root) !== 'module') return null;
  const name = String(root[1] ?? 'footprint'); const els: FpEl[] = []; const S = MM_W;
  for (const c of root) { if (!sIsList(c)) continue; const t = sTag(c);
    if (t === 'pad') { const num = String(c[1] ?? ''); const sh = String(c[3] ?? 'circle'); const at = sKid(c, 'at'), sz = sKid(c, 'size'), dr = sKid(c, 'drill'), ly = sKid(c, 'layers'); const shape = /rect|round/.test(sh) ? 'Prostokąt' : /oval/.test(sh) ? 'Owal' : 'Okrąg'; const layer = ly && ly.slice(1).some((l) => /\*\.Cu/.test(String(l))) ? 'Wielowastwa' : ly && ly.slice(1).some((l) => /B\.Cu/.test(String(l))) ? 'Dolna warstwa' : 'Górna warstwa'; els.push(mkPad(sNum(at?.[1]) * S, sNum(at?.[2]) * S, num, shape, sNum(sz?.[1]) * S, sNum(sz?.[2]) * S, sNum(dr?.[1]) * S, layer, sNum(at?.[3]))); }
    else if (t === 'fp_line' || t === 'gr_line') { const s = sKid(c, 'start'), e = sKid(c, 'end'), w = sKid(c, 'width'), ly = sKid(c, 'layer'); els.push({ t: 'track', pts: [{ x: sNum(s?.[1]) * S, y: sNum(s?.[2]) * S }, { x: sNum(e?.[1]) * S, y: sNum(e?.[2]) * S }], width: (sNum(w?.[1]) * S) || 4, layer: kiLayer(String(ly?.[1] ?? '')), locked: false, id: newId() }); }
    else if (t === 'fp_circle') { const ct = sKid(c, 'center'), e = sKid(c, 'end'), w = sKid(c, 'width'), ly = sKid(c, 'layer'); const cx = sNum(ct?.[1]) * S, cy = sNum(ct?.[2]) * S; els.push({ t: 'fcircle', cx, cy, r: Math.hypot(sNum(e?.[1]) * S - cx, sNum(e?.[2]) * S - cy) || 20, width: (sNum(w?.[1]) * S) || 4, layer: kiLayer(String(ly?.[1] ?? '')), locked: false, id: newId() }); }
    else if (t === 'fp_text') { const at = sKid(c, 'at'), ly = sKid(c, 'layer'); els.push({ t: 'ftext', x: sNum(at?.[1]) * S, y: sNum(at?.[2]) * S, text: String(c[2] ?? ''), font: 'domyślny', lineWidth: 8, height: 40, rot: sNum(at?.[3]), layer: kiLayer(String(ly?.[1] ?? '')), locked: false, id: newId() }); }
  }
  return els.length ? { name, els } : null;
}
function parseEagle(text: string): ImportResult {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const symbols: { name: string; els: El[] }[] = []; const footprints: { name: string; els: FpEl[] }[] = [];
  const SS = KI_SYM, FS = MM_W; const A = (el: Element, a: string) => parseFloat(el.getAttribute(a) || '0') || 0;
  const rotOf = (el: Element) => parseFloat((el.getAttribute('rot') || 'R0').replace(/[^\d.-]/g, '')) || 0;
  doc.querySelectorAll('symbols > symbol').forEach((sym) => {
    const name = sym.getAttribute('name') || 'symbol'; const els: El[] = [];
    sym.querySelectorAll('pin').forEach((pin, idx) => { const x = A(pin, 'x') * SS, y = -A(pin, 'y') * SS; const lm: Record<string, number> = { point: 0, short: 2.54, middle: 5.08, long: 7.62 }; const L = (lm[pin.getAttribute('length') || 'long'] ?? 7.62) * SS; const p = makePin(x, y, idx + 1); els.push({ ...p, x, y, length: L || 20, rotation: (360 - rotOf(pin)) % 360, name: pin.getAttribute('name') || p.name, number: String(idx + 1) }); });
    sym.querySelectorAll('wire').forEach((w) => els.push({ t: 'line', pts: [{ x: A(w, 'x1') * SS, y: -A(w, 'y1') * SS }, { x: A(w, 'x2') * SS, y: -A(w, 'y2') * SS }], ...shStyle() }));
    sym.querySelectorAll('rectangle').forEach((r) => { const x1 = A(r, 'x1') * SS, y1 = -A(r, 'y1') * SS, x2 = A(r, 'x2') * SS, y2 = -A(r, 'y2') * SS; els.push({ t: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), roundRadius: 0, ...shStyle() }); });
    sym.querySelectorAll('circle').forEach((c) => els.push({ t: 'ellipse', cx: A(c, 'x') * SS, cy: -A(c, 'y') * SS, rx: A(c, 'radius') * SS, ry: A(c, 'radius') * SS, ...shStyle() }));
    sym.querySelectorAll('text').forEach((tx) => els.push(makeText(A(tx, 'x') * SS, -A(tx, 'y') * SS, tx.textContent || '')));
    if (els.length) symbols.push({ name, els });
  });
  doc.querySelectorAll('packages > package').forEach((pkg) => {
    const name = pkg.getAttribute('name') || 'package'; const els: FpEl[] = [];
    pkg.querySelectorAll('smd').forEach((s, idx) => els.push(mkPad(A(s, 'x') * FS, -A(s, 'y') * FS, s.getAttribute('name') || String(idx + 1), 'Prostokąt', A(s, 'dx') * FS, A(s, 'dy') * FS, 0, 'Górna warstwa', rotOf(s))));
    pkg.querySelectorAll('pad').forEach((s, idx) => { const d = A(s, 'drill') * FS; const dia = (A(s, 'diameter') || A(s, 'drill') * 1.8) * FS; els.push(mkPad(A(s, 'x') * FS, -A(s, 'y') * FS, s.getAttribute('name') || String(idx + 1), 'Okrąg', dia, dia, d, 'Wielowastwa')); });
    pkg.querySelectorAll('wire').forEach((w) => els.push({ t: 'track', pts: [{ x: A(w, 'x1') * FS, y: -A(w, 'y1') * FS }, { x: A(w, 'x2') * FS, y: -A(w, 'y2') * FS }], width: (A(w, 'width') * FS) || 4, layer: 'Górna warstwa opisowa', locked: false, id: newId() }));
    pkg.querySelectorAll('circle').forEach((c) => els.push({ t: 'fcircle', cx: A(c, 'x') * FS, cy: -A(c, 'y') * FS, r: A(c, 'radius') * FS, width: (A(c, 'width') * FS) || 4, layer: 'Górna warstwa opisowa', locked: false, id: newId() }));
    pkg.querySelectorAll('text').forEach((tx) => els.push({ t: 'ftext', x: A(tx, 'x') * FS, y: -A(tx, 'y') * FS, text: tx.textContent || '', font: 'domyślny', lineWidth: 8, height: 40, rot: 0, layer: 'Górna warstwa opisowa', locked: false, id: newId() }));
    if (els.length) footprints.push({ name, els });
  });
  return { symbols, footprints };
}
function easyShapesToEl(shapes: string[], bbox: { x: number; y: number; width: number; height: number } | null): El[] {
  const cx = bbox ? bbox.x + bbox.width / 2 : 0, cy = bbox ? bbox.y + bbox.height / 2 : 0; const els: El[] = [];
  for (const s of shapes) { const t = s.split('~'); const ox = (v: number) => v - cx, oy = (v: number) => v - cy;
    if (t[0] === 'R') els.push({ t: 'rect', x: ox(+t[1]), y: oy(+t[2]), w: +t[5], h: +t[6], roundRadius: +t[3] || 0, ...shStyle() });
    else if (t[0] === 'E') els.push({ t: 'ellipse', cx: ox(+t[1]), cy: oy(+t[2]), rx: +t[3], ry: +t[4], ...shStyle() });
    else if (t[0] === 'PL' || t[0] === 'PG') { const nums = t[1].trim().split(/[\s,]+/).map(Number); const pts: Pt[] = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: ox(nums[i]), y: oy(nums[i + 1]) }); if (pts.length >= 2) els.push({ t: t[0] === 'PG' ? 'polygon' : 'line', pts, ...shStyle() }); }
    else if (t[0] === 'P') { const seg = s.split('^^'); const dot = seg[1]?.split('~'); if (dot && dot.length >= 2) { const x = ox(+dot[0]), y = oy(+dot[1]); els.push({ ...makePin(x, y, els.filter((e) => e.t === 'pin').length + 1), x, y }); } }
  }
  return els;
}
function easyShapesToFp(shapes: string[], bbox: { x: number; y: number; width: number; height: number } | null): FpEl[] {
  const SC = 10; const cx = bbox ? bbox.x + bbox.width / 2 : 0, cy = bbox ? bbox.y + bbox.height / 2 : 0; const els: FpEl[] = [];
  const ox = (v: number) => (v - cx) * SC, oy = (v: number) => (v - cy) * SC;
  for (const s of shapes) { const t = s.split('~');
    if (t[0] === 'PAD') { const shape = /RECT/i.test(t[1]) ? 'Prostokąt' : /OVAL/i.test(t[1]) ? 'Owal' : 'Okrąg'; els.push(mkPad(ox(+t[2]), oy(+t[3]), t[8] || '', shape, (+t[4]) * SC, (+t[5]) * SC, (+t[9] || 0) * SC, 'Wielowastwa')); }
    else if (t[0] === 'TRACK') { const nums = t[4].trim().split(/[\s,]+/).map(Number); const pts: Pt[] = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: ox(nums[i]), y: oy(nums[i + 1]) }); if (pts.length >= 2) els.push({ t: 'track', pts, width: (+t[1] || 0.4) * SC, layer: 'Górna warstwa opisowa', locked: false, id: newId() }); }
    else if (t[0] === 'CIRCLE') els.push({ t: 'fcircle', cx: ox(+t[1]), cy: oy(+t[2]), r: (+t[3]) * SC, width: (+t[4] || 0.3) * SC, layer: 'Górna warstwa opisowa', locked: false, id: newId() });
  }
  return els;
}
function parseEasyEdaJson(text: string): ImportResult {
  const symbols: { name: string; els: El[] }[] = []; const footprints: { name: string; els: FpEl[] }[] = [];
  try {
    const d = JSON.parse(text); const r = d.result ?? d;
    const sym = r.dataStr ?? r.symbol; const shapes = sym?.shape ?? sym?.shapes;
    if (Array.isArray(shapes)) { const els = easyShapesToEl(shapes, sym.BBox ?? sym.bbox ?? null); if (els.length) symbols.push({ name: r.title ?? 'EasyEDA', els }); }
    const fp = r.packageDetail?.dataStr ?? r.footprint; const fsh = fp?.shape ?? fp?.shapes;
    if (Array.isArray(fsh)) { const els = easyShapesToFp(fsh, fp.BBox ?? fp.bbox ?? null); if (els.length) footprints.push({ name: `${r.title ?? 'EasyEDA'}_fp`, els }); }
  } catch { /* ignore */ }
  return { symbols, footprints };
}
function parseImportFile(name: string, text: string): ImportResult {
  const ext = (name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'kicad_sym' || (ext === 'lib' && text.includes('kicad_symbol_lib'))) return { symbols: parseKicadSym(text), footprints: [] };
    if (ext === 'kicad_mod' || ext === 'mod') { const fp = parseKicadMod(text); return { symbols: [], footprints: fp ? [fp] : [] }; }
    if (ext === 'lbr') return parseEagle(text);
    if (ext === 'json') return parseEasyEdaJson(text);
    if (['schlib', 'pcblib', 'intlib', 'lib'].includes(ext)) return { symbols: [], footprints: [], note: 'Formaty Altium (.SchLib/.PcbLib/.IntLib) są binarne — nieobsługiwane bezpośrednio w przeglądarce. Wyeksportuj do KiCad (.kicad_sym/.kicad_mod) lub EasyEDA (.json) i zaimportuj ponownie.' };
    return { symbols: [], footprints: [], note: 'Nieznany format pliku.' };
  } catch (e) { return { symbols: [], footprints: [], note: `Błąd parsowania: ${e instanceof Error ? e.message : String(e)}` }; }
}

function ImportDialog({ open, onClose, onSymbol, onFootprint }: { open: boolean; onClose: () => void; onSymbol: (name: string, els: El[]) => void; onFootprint: (name: string, els: FpEl[]) => void }) {
  const [res, setRes] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (open) { setRes(null); setFileName(''); } }, [open]);
  const onFile = (f: File) => { setFileName(f.name); const rd = new FileReader(); rd.onload = () => setRes(parseImportFile(f.name, String(rd.result || ''))); rd.readAsText(f); };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, fontSize: 16 }}>Importuj symbol / footprint<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: '6px !important' }}>
        <input ref={inputRef} type="file" hidden accept=".kicad_sym,.kicad_mod,.lbr,.json,.mod,.lib,.SchLib,.PcbLib,.IntLib" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Button variant="contained" size="small" onClick={() => inputRef.current?.click()} sx={{ textTransform: 'none' }}>Wybierz plik…</Button>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{fileName || 'KiCad (.kicad_sym/.kicad_mod), Eagle (.lbr), EasyEDA (.json)'}</Typography>
        </Box>
        {res?.note && <Typography sx={{ fontSize: 12, color: 'warning.main', mb: 1 }}>{res.note}</Typography>}
        {res && (res.symbols.length > 0 || res.footprints.length > 0) && (
          <List dense sx={{ maxHeight: 360, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            {res.symbols.length > 0 && <ListSubheader sx={{ fontSize: 11, lineHeight: '26px', bgcolor: '#f6f7f8' }}>Symbole ({res.symbols.length})</ListSubheader>}
            {res.symbols.map((s, i) => (
              <ListItemButton key={`s${i}`} onClick={() => { onSymbol(s.name, s.els); onClose(); }}>
                <MemoryOutlinedIcon sx={{ fontSize: 18, color: '#3b82d6', mr: 1 }} /><ListItemText primary={<Typography sx={{ fontSize: 13 }}>{s.name}</Typography>} secondary={<Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{s.els.length} elem. · otwórz jako Symbol</Typography>} />
              </ListItemButton>
            ))}
            {res.footprints.length > 0 && <ListSubheader sx={{ fontSize: 11, lineHeight: '26px', bgcolor: '#f6f7f8' }}>Footprinty ({res.footprints.length})</ListSubheader>}
            {res.footprints.map((s, i) => (
              <ListItemButton key={`f${i}`} onClick={() => { onFootprint(s.name, s.els); onClose(); }}>
                <DeveloperBoardIcon sx={{ fontSize: 18, color: '#e0533d', mr: 1 }} /><ListItemText primary={<Typography sx={{ fontSize: 13 }}>{s.name}</Typography>} secondary={<Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{s.els.length} elem. · otwórz jako Footprint</Typography>} />
              </ListItemButton>
            ))}
          </List>
        )}
        {res && res.symbols.length === 0 && res.footprints.length === 0 && !res.note && <Typography sx={{ fontSize: 12, color: 'text.disabled', fontStyle: 'italic' }}>Nie znaleziono symboli ani footprintów w pliku.</Typography>}
      </DialogContent>
    </Dialog>
  );
}

interface SavedSym { name: string; title: string; owner?: string; manufacturer?: string; mfrPart?: string; tags?: string; footprint?: string; symbol?: string }
// ── Okno „Library" (EasyEDA 1:1): wyszukiwarka symboli/footprintów + podgląd ──
interface LibRow { key: string; name: string; title: string; pkg: string; owner: string; source: 'ws-sym' | 'ws-fp' | 'lcsc'; lcsc?: string; stock?: number; smtStock?: number; price?: string; linkedFp?: string; linkedSym?: string }
interface Fav { key: string; source: 'ws-sym' | 'ws-fp' | 'lcsc'; name: string; title: string; lcsc?: string; category: string }
const loadFavs = (): Fav[] => { try { return JSON.parse(localStorage.getItem('pcb-favorites') || '[]'); } catch { return []; } };
type LibPrev = { kind: 'sym-el'; els: El[] } | { kind: 'fp-el'; els: FpEl[] } | { kind: 'easy-sym'; sym: EasyEdaSym } | { kind: 'easy-fp'; fp: EasyEdaSym } | { kind: 'easy'; sym?: EasyEdaSym; fp?: EasyEdaSym; prefix?: string } | null;
// viewBox dopasowany do treści (padding), by podgląd wypełniał panel
const fitVB = (b: { x: number; y: number; w: number; h: number }, pad = 8) => `${b.x - pad} ${b.y - pad} ${Math.max(1, b.w) + 2 * pad} ${Math.max(1, b.h) + 2 * pad}`;
const unionBB = <T,>(arr: T[], bb: (e: T) => { x: number; y: number; w: number; h: number }) => {
  if (!arr.length) return { x: -20, y: -20, w: 40, h: 40 };
  const bs = arr.map(bb); const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};
// SVG, które po zamontowaniu mierzy realny bounding box treści (getBBox — obejmuje
// też teksty pinów rysowane poza bbox symbolu) i ustawia dokładny viewBox. Dzięki
// temu symbol z etykietami nie jest ucinany, niezależnie od proporcji kontenera.
function AutoFitSvg({ children, pad = 8, background }: { children: React.ReactNode; pad?: number; background?: string }) {
  const gRef = useRef<SVGGElement | null>(null);
  const [vb, setVb] = useState<string | undefined>(undefined);
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    try {
      const b = g.getBBox();
      if (b.width > 0 && b.height > 0) setVb(`${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`);
    } catch { /* getBBox może rzucić zanim SVG jest w layoutcie */ }
  });
  return (
    <svg width="100%" height="100%" viewBox={vb} preserveAspectRatio="xMidYMid meet" style={background ? { background } : undefined}>
      <g ref={gRef}>{children}</g>
    </svg>
  );
}
function LibraryPreview({ prev, type }: { prev: LibPrev; type: string }) {
  if (!prev) return <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0a6', fontSize: 12 }}>Wybierz element, aby zobaczyć podgląd</Box>;
  if (prev.kind === 'sym-el') return <svg width="100%" height="100%" viewBox={fitVB(unionBB(prev.els, elBBox))} preserveAspectRatio="xMidYMid meet">{prev.els.map((el, i) => renderEl(el, i))}</svg>;
  if (prev.kind === 'fp-el') return <svg width="100%" height="100%" viewBox={fitVB(unionBB(prev.els, elBBoxFp), 30)} preserveAspectRatio="xMidYMid meet" style={{ background: '#111' }}>{prev.els.map((el, i) => renderFpEl(el, i))}</svg>;
  // Etykiety pinów rysowane są POZA bbox symbolu → mierzymy realny zasięg (getBBox),
  // żeby symbol z tekstami nie był ucinany.
  if (prev.kind === 'easy-sym') return <AutoFitSvg pad={8}>{renderEasyEdaSymbol(prev.sym)}</AutoFitSvg>;
  if (prev.kind === 'easy-fp') return <AutoFitSvg pad={30} background="#111">{renderFootprint(prev.fp)}</AutoFitSvg>;
  // 'easy' (część LCSC) — pokaż OBA: symbol u góry, footprint niżej
  if (!prev.sym && !prev.fp) return <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0a6', fontSize: 12 }}>Brak podglądu</Box>;
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {prev.sym && (<><Box sx={{ px: 1, py: 0.25, fontSize: 10.5, color: '#5b6169', bgcolor: '#f2f3f5' }}>Symbol</Box><Box sx={{ flex: 1, minHeight: 0 }}><LibraryPreview prev={{ kind: 'easy-sym', sym: prev.sym }} type={type} /></Box></>)}
      {prev.fp && (<><Box sx={{ px: 1, py: 0.25, fontSize: 10.5, color: '#5b6169', bgcolor: '#f2f3f5', borderTop: `1px solid ${C.barBorder}` }}>Footprint</Box><Box sx={{ flex: 1, minHeight: 0 }}><LibraryPreview prev={{ kind: 'easy-fp', fp: prev.fp }} type={type} /></Box></>)}
    </Box>
  );
}
// Jasny motyw dla okna biblioteki (aplikacja działa w trybie dark → hardcodowane jasne kolory
// zlewałyby się z ciemnym Paper i pola tekstowe miałyby biały tekst na białym tle).
const libLightTheme = createTheme({ palette: { mode: 'light', background: { paper: '#ffffff', default: '#ffffff' } } });
function PlaceComponentDialog({ open, onClose, onPick, onEditSymbol, onEditFootprint }: { open: boolean; onClose: () => void; onPick: (r: PickResult) => void; onEditSymbol: (title: string, els: El[], footprint?: string) => void; onEditFootprint: (title: string, els: FpEl[], symbol?: string) => void }) {
  const [engine, setEngine] = useState<'EasyEDA' | 'LCSC' | 'My'>('EasyEDA');
  const [type, setType] = useState('Symbol');
  const [cls, setCls] = useState('Work Space');
  const [query, setQuery] = useState('');
  const [kw, setKw] = useState('');
  const [wsSym, setWsSym] = useState<SavedSym[]>([]);
  const [wsFp, setWsFp] = useState<SavedSym[]>([]);
  const [easy, setEasy] = useState<EasyProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [prev, setPrev] = useState<LibPrev>(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  // Ulubione (localStorage) + lewy panel (My Libraries / kategoria My Favorites) + menu kontekstowe wiersza
  const [favs, setFavs] = useState<Fav[]>(loadFavs);
  const [leftSel, setLeftSel] = useState<'lib' | { fav: string | null } | null>(null);
  const [ctxRow, setCtxRow] = useState<{ x: number; y: number; row: LibRow } | null>(null);
  const saveFavs = (next: Fav[]) => { setFavs(next); try { localStorage.setItem('pcb-favorites', JSON.stringify(next)); } catch { /* ignore */ } };
  const favKey = (r: { source: string; name: string; lcsc?: string }) => `${r.source}:${r.lcsc || r.name}`;
  const isFav = (r: { source: string; name: string; lcsc?: string }) => favs.some((f) => favKey(f) === favKey(r));
  const toggleFav = (r: LibRow) => {
    if (isFav(r)) saveFavs(favs.filter((f) => favKey(f) !== favKey(r)));
    else { const cat = (window.prompt('Kategoria (My Favorites):', 'Wszystko') || 'Wszystko').trim() || 'Wszystko'; saveFavs([...favs, { key: r.key, source: r.source, name: r.name, title: r.title, lcsc: r.lcsc, category: cat }]); }
  };
  const favCats = Array.from(new Set(favs.map((f) => f.category)));

  // Work Space: symbole + footprinty zapisane na serwerze
  const reloadWs = async () => { try { const [rs, rf] = await Promise.all([fetch('/api/symbols'), fetch('/api/footprints')]); const ds = await rs.json(), df = await rf.json(); setWsSym(Array.isArray(ds.symbols) ? ds.symbols : []); setWsFp(Array.isArray(df.footprints) ? df.footprints : []); } catch { /* offline */ } };
  useEffect(() => { if (open) reloadWs(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Wyszukiwarka LCSC/EasyEDA (debounce)
  useEffect(() => {
    if (!open || query.trim().length < 2) { setEasy([]); return; }
    let cancel = false; setLoading(true);
    const h = setTimeout(async () => {
      try { const r = await fetch(`/api/easyeda/search?q=${encodeURIComponent(query.trim())}`); const d = await r.json(); if (!cancel) setEasy(Array.isArray(d.products) ? d.products : []); } catch { if (!cancel) setEasy([]); } finally { if (!cancel) setLoading(false); }
    }, 450);
    return () => { cancel = true; clearTimeout(h); };
  }, [query, open]);
  useEffect(() => { if (open) { setSelKey(null); setPrev(null); setError(null); } }, [open, type, cls]);

  const kwl = kw.trim().toLowerCase(), ql = query.trim().toLowerCase();
  const match = (s: string) => { const l = s.toLowerCase(); return (!kwl || l.includes(kwl)) && (!ql || l.includes(ql)); };
  const wsSymRows = (): LibRow[] => wsSym.filter((s) => match(s.title || s.name)).map((s) => ({ key: `ws:${s.name}`, name: s.name, title: s.title || s.name, pkg: s.footprint || s.mfrPart || '', owner: s.owner || 'mhersztowski', source: 'ws-sym' as const, linkedFp: s.footprint }));
  const wsFpRows = (): LibRow[] => wsFp.filter((s) => match(s.title || s.name)).map((s) => ({ key: `wf:${s.name}`, name: s.name, title: s.title || s.name, pkg: s.tags || '', owner: s.owner || 'mhersztowski', source: 'ws-fp' as const, linkedSym: s.symbol }));
  // Budowa wierszy zależnie od Typu + Klasy (lub lewego panelu: My Libraries / kategoria ulubionych)
  const ONLINE_CLS = ['LCSC', 'System', 'JLCPCB Assembled', 'Wkład użytkownika', 'Śledź'];
  const rows: LibRow[] = (() => {
    let base: LibRow[];
    // My Libraries → wszystkie wbudowane (symbole + footprinty z serwera)
    if (leftSel === 'lib') base = [...wsSymRows(), ...wsFpRows()];
    // My Favorites → ulubione (opcjonalnie wg kategorii)
    else if (leftSel && typeof leftSel === 'object') base = favs.filter((f) => (leftSel.fav === null || f.category === leftSel.fav) && match(f.title)).map((f) => ({ key: f.key, name: f.name, title: f.title, pkg: '', owner: 'mhersztowski', source: f.source, lcsc: f.lcsc }));
    // Silnik „My" = zawsze moje zapisane na serwerze
    else if (engine === 'My' || cls === 'Work Space') base = type === 'Footprint' ? wsFpRows() : wsSymRows();
    else if (ONLINE_CLS.includes(cls)) base = easy.filter((p) => match(p.mpn || p.lcsc)).map((p, i) => ({ key: `${cls}:${p.lcsc}:${i}`, name: p.lcsc, title: p.mpn || p.lcsc, pkg: p.package || '', owner: p.manufacturer || 'LCSC', source: 'lcsc' as const, lcsc: p.lcsc, stock: p.stock, smtStock: p.smtStock, price: p.price }));
    else base = [];
    // Wyszukiwanie po numerze LCSC (np. C25804) — ZAWSZE dodaj wiersz na górze (niezależnie od klasy/silnika)
    const numQ = query.trim().toUpperCase();
    if (/^C\d{2,}$/.test(numQ) && !base.some((r) => r.lcsc?.toUpperCase() === numQ)) base = [{ key: `num:${numQ}`, name: numQ, title: numQ, pkg: '', owner: 'LCSC', source: 'lcsc', lcsc: numQ }, ...base];
    return base;
  })();
  const counts = { ws: (type === 'Footprint' ? wsFp : wsSym).length, online: easy.length };
  const sel = rows.find((r) => r.key === selKey) || null;

  // Pobranie danych podglądu przy wyborze wiersza
  useEffect(() => {
    if (!sel) { setPrev(null); return; }
    let cancel = false; setPrevLoading(true); setPrev(null);
    (async () => {
      try {
        if (sel.source === 'ws-sym') { const r = await fetch(`/api/symbols/${encodeURIComponent(sel.name)}`); const d = await r.json(); if (!cancel) setPrev({ kind: 'sym-el', els: Array.isArray(d.elements) ? d.elements : [] }); }
        else if (sel.source === 'ws-fp') { const r = await fetch(`/api/footprints/${encodeURIComponent(sel.name)}`); const d = await r.json(); if (!cancel) setPrev({ kind: 'fp-el', els: Array.isArray(d.elements) ? d.elements : [] }); }
        else if (sel.source === 'lcsc' && sel.lcsc) { const r = await fetch(`/api/easyeda/component/${encodeURIComponent(sel.lcsc)}`); const d = await r.json(); if (!cancel) setPrev({ kind: 'easy', sym: d.symbol || undefined, fp: d.footprint || undefined, prefix: d.prefix }); }
      } catch { if (!cancel) setPrev(null); } finally { if (!cancel) setPrevLoading(false); }
    })();
    return () => { cancel = true; };
  }, [selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const doPlace = async () => {
    if (!sel) return; setBusy(true); setError(null);
    try {
      if (sel.source === 'ws-sym') {
        const d = await (await fetch(`/api/symbols/${encodeURIComponent(sel.name)}`)).json();
        const els = (Array.isArray(d.elements) ? d.elements : (prev && prev.kind === 'sym-el' ? prev.els : [])) as El[];
        // Powiązany footprint (ustawiony przy zapisie symbolu) → dołącz jego geometrię, by na PCB pokazał się właściwy footprint.
        // Link może być ustawiony po którejkolwiek stronie — więc szukamy dwukierunkowo:
        //  1) symbol.footprint,  2) footprint, który wskazuje na ten symbol (footprint.symbol === nazwa symbolu).
        let fpName = sel.linkedFp || d.footprint;
        if (!fpName) { const rev = wsFp.find((fp) => fp.symbol && fp.symbol === sel.name); if (rev) fpName = rev.name; }
        let fpEls: FpEl[] | undefined;
        if (fpName) { try { const fd = await (await fetch(`/api/footprints/${encodeURIComponent(fpName)}`)).json(); if (Array.isArray(fd.elements)) fpEls = fd.elements; } catch { /* brak/niedostępny footprint */ } }
        onPick({ defId: 'saved', label: sel.title, pins: 0, savedEls: els, fpEls, refPrefix: 'U' }); onClose();
      }
      else if (sel.source === 'lcsc' && sel.lcsc) { const d = prev && prev.kind === 'easy' ? prev : await (await fetch(`/api/easyeda/component/${encodeURIComponent(sel.lcsc)}`)).json(); onPick({ defId: 'easyeda', label: sel.title, pins: 0, easyeda: d.sym || d.symbol, fp: d.fp || d.footprint, refPrefix: d.prefix, lcsc: sel.lcsc, supplier: 'LCSC', manufacturer: sel.owner, footprint: sel.pkg }); onClose(); }
      else if (sel.source === 'ws-fp') {
        const d = await (await fetch(`/api/footprints/${encodeURIComponent(sel.name)}`)).json();
        const els = (Array.isArray(d.elements) ? d.elements : (prev && prev.kind === 'fp-el' ? prev.els : [])) as FpEl[];
        // Powiązany symbol (ustawiony przy zapisie footprintu) → dołącz jego geometrię, by na schemacie pokazał się właściwy symbol.
        // Dwukierunkowo: 1) footprint.symbol, 2) symbol, który wskazuje na ten footprint (symbol.footprint === nazwa footprintu).
        let symName = sel.linkedSym || d.symbol;
        if (!symName) { const rev = wsSym.find((sy) => sy.footprint && sy.footprint === sel.name); if (rev) symName = rev.name; }
        let savedEls: El[] | undefined;
        if (symName) { try { const sd = await (await fetch(`/api/symbols/${encodeURIComponent(symName)}`)).json(); if (Array.isArray(sd.elements)) savedEls = sd.elements; } catch { /* brak/niedostępny symbol */ } }
        onPick({ defId: savedEls ? 'saved' : 'ic-generic', label: sel.title, pins: 0, fpEls: els, savedEls, refPrefix: 'U' }); onClose();
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const doEdit = async () => {
    if (!sel) return; setBusy(true); setError(null);
    try {
      if (sel.source === 'ws-sym') { const d = await (await fetch(`/api/symbols/${encodeURIComponent(sel.name)}`)).json(); const els = (Array.isArray(d.elements) ? d.elements : (prev && prev.kind === 'sym-el' ? prev.els : [])) as El[]; onEditSymbol(sel.title, els, d.footprint || sel.linkedFp); onClose(); }
      else if (sel.source === 'ws-fp') { const d = await (await fetch(`/api/footprints/${encodeURIComponent(sel.name)}`)).json(); const els = (Array.isArray(d.elements) ? d.elements : (prev && prev.kind === 'fp-el' ? prev.els : [])) as FpEl[]; onEditFootprint(sel.title, els, d.symbol || sel.linkedSym); onClose(); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  // Akcje menu kontekstowego wiersza (na konkretnym elemencie r)
  const rowEls = async (r: LibRow): Promise<unknown[]> => {
    if (r.source === 'ws-sym') return (await (await fetch(`/api/symbols/${encodeURIComponent(r.name)}`)).json()).elements || [];
    if (r.source === 'ws-fp') return (await (await fetch(`/api/footprints/${encodeURIComponent(r.name)}`)).json()).elements || [];
    return [];
  };
  const editRow = async (r: LibRow) => { setBusy(true); setError(null); try { if (r.source === 'ws-sym') { onEditSymbol(r.title, await rowEls(r) as El[], r.linkedFp); onClose(); } else if (r.source === 'ws-fp') { onEditFootprint(r.title, await rowEls(r) as FpEl[], r.linkedSym); onClose(); } else setError('Edycja dostępna dla elementów z serwera (Work Space).'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const cloneRow = async (r: LibRow) => { setBusy(true); setError(null); try { if (r.source === 'lcsc') { setError('Klonowanie dostępne dla elementów z serwera.'); return; } const url = r.source === 'ws-fp' ? '/api/footprints' : '/api/symbols'; await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${r.title}_kopia`, elements: await rowEls(r) }) }); await reloadWs(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const viewDatasheet = (r: LibRow) => window.open(r.lcsc ? `https://www.lcsc.com/product-detail/${encodeURIComponent(r.lcsc)}.html` : `https://www.google.com/search?q=${encodeURIComponent(r.title + ' datasheet')}`, '_blank');

  const TYPES = ['Symbol', 'Footprint', 'Symbol Spice', 'SCH Module', 'Moduł PCB', '3D Model'];
  const CLASSES: [string, string][] = [['Work Space', `Work Space(${counts.ws})`], ['LCSC', `LCSC(${counts.online})`], ['JLCPCB Assembled', `JLCPCB Assembled(${counts.online})`], ['System', `System(${counts.online})`], ['Śledź', 'Śledź(0)'], ['Wkład użytkownika', `Wkład użytkownika(${counts.online || '999+'})`]];
  const tabSx = (a: boolean) => ({ px: 1.25, py: 0.5, fontSize: 13.5, cursor: 'default', borderRadius: 0.75, color: a ? '#1565c0' : '#2b2f34', bgcolor: a ? '#dcecfd' : 'transparent', border: a ? '1px solid #9ac0f0' : '1px solid transparent', fontWeight: a ? 600 : 400, whiteSpace: 'nowrap', '&:hover': { bgcolor: a ? '#dcecfd' : '#eef1f4' } });
  const isOnline = engine !== 'My' && ONLINE_CLS.includes(cls);
  const isFp = type === 'Footprint' || isOnline;
  const canEdit = sel?.source === 'ws-sym' || sel?.source === 'ws-fp';

  return (
    <ThemeProvider theme={libLightTheme}>
    <Dialog open={open} onClose={onClose} maxWidth={false} fullWidth PaperProps={{ sx: { borderRadius: 1, width: '92vw', maxWidth: 1180, height: '88vh', bgcolor: '#fff', color: '#2b2f34' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, bgcolor: '#eceef1', borderBottom: `1px solid ${C.barBorder}` }}>
        <SearchIcon sx={{ fontSize: 18, color: '#3a3f45', mr: 0.75 }} /><Typography sx={{ fontSize: 15, color: '#2b2f34', flex: 1 }}>Library</Typography>
        <Box sx={{ px: 1, py: 0.25, fontSize: 12, border: `1px solid ${C.barBorder}`, borderRadius: 0.5, mr: 1, color: '#5b6169' }}>MIN</Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 1 }}>
        {/* Search Engine */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ width: 110, fontSize: 13, color: '#5b6169', fontWeight: 500 }}>Search Engine</Typography>
          <Box sx={tabSx(engine === 'EasyEDA')} onClick={() => { setEngine('EasyEDA'); setLeftSel(null); }}>EasyEDA</Box>
          <Box sx={tabSx(engine === 'LCSC')} onClick={() => { setEngine('LCSC'); setLeftSel(null); }}>LCSC Electronics</Box>
          <Box sx={tabSx(engine === 'My')} onClick={() => { setEngine('My'); setCls('Work Space'); setLeftSel(null); }}>My (serwer)</Box>
          <Box sx={{ flex: 1 }} />
          <TextField autoFocus size="small" placeholder={cls === 'Work Space' ? 'Filtruj moje symbole/footprinty…' : 'Szukaj w LCSC/EasyEDA (nazwa / MPN)…'} value={query} onChange={(e) => setQuery(e.target.value)} sx={{ width: 420 }}
            InputProps={{ sx: { fontSize: 13.5 }, endAdornment: <><IconButton size="small" onClick={() => setQuery('')}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>{loading ? <CircularProgress size={16} /> : <SearchIcon sx={{ fontSize: 18, color: '#5b6169' }} />}</> }} />
          <Link sx={{ fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer', ml: 1 }} onClick={() => window.open('https://easyeda.com', '_blank')}>Apply New Parts for Free</Link>
        </Box>
        {/* Typy */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ width: 110, fontSize: 13, color: '#5b6169', fontWeight: 500 }}>Typy</Typography>
          {TYPES.map((t) => <Box key={t} sx={tabSx(type === t)} onClick={() => { setType(t); setLeftSel(null); }}>{t}</Box>)}
        </Box>
        {/* Klasy */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography sx={{ width: 110, fontSize: 13, color: '#5b6169', fontWeight: 500 }}>Klasy</Typography>
          {CLASSES.map(([k, lbl]) => <Box key={k} sx={tabSx(cls === k)} onClick={() => { setCls(k); setLeftSel(null); }}>{lbl}</Box>)}
        </Box>
        {/* Ciało: lewy filtr | tabela | podgląd */}
        <Box sx={{ flex: 1, display: 'flex', minHeight: 0, border: `1px solid ${C.barBorder}`, borderRadius: 1, overflow: 'hidden' }}>
          <Box sx={{ width: 210, flexShrink: 0, borderRight: `1px solid ${C.barBorder}`, display: 'flex', flexDirection: 'column', p: 1, gap: 1, overflow: 'auto' }}>
            <TextField size="small" placeholder="Keyword to Filter" value={kw} onChange={(e) => setKw(e.target.value)} InputProps={{ sx: { fontSize: 12.5 } }} />
            {(() => { const leftItem = (active: boolean, label: React.ReactNode, onClick: () => void, pl = 1) => <Box onClick={onClick} sx={{ pl, py: 0.4, fontSize: 13, borderRadius: 0.5, cursor: 'default', color: active ? '#1565c0' : '#2b2f34', bgcolor: active ? '#dcecfd' : 'transparent', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', '&:hover': { bgcolor: active ? '#dcecfd' : '#eef1f4' } }}>{label}</Box>; return (<>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, mt: 0.5 }}>My Libraries<RemoveIcon sx={{ fontSize: 16, color: C.icon }} /></Box>
              {leftItem(leftSel === 'lib', `Wszystko (${wsSym.length + wsFp.length})`, () => setLeftSel('lib'))}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600, mt: 0.5 }}>My Favorites<RemoveIcon sx={{ fontSize: 16, color: C.icon }} /></Box>
              {leftItem(!!leftSel && typeof leftSel === 'object' && leftSel.fav === null, `Wszystko (${favs.length})`, () => setLeftSel({ fav: null }))}
              {favCats.map((c) => leftItem(!!leftSel && typeof leftSel === 'object' && leftSel.fav === c, `${c} (${favs.filter((f) => f.category === c).length})`, () => setLeftSel({ fav: c })))}
              {favCats.length === 0 && <Box sx={{ pl: 1, py: 0.4, fontSize: 11.5, color: '#9aa0a6' }}>Brak ulubionych (dodaj z menu ▸)</Box>}
            </>); })()}
          </Box>
          {/* Tabela wyników */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', px: 1.5, py: 0.75, borderBottom: `2px solid ${C.barBorder}`, bgcolor: '#fafbfc', fontSize: 13, fontWeight: 600, color: '#000' }}>
              <Box sx={{ flex: 1, minWidth: 120 }}>Nazwa (Numer części)</Box><Box sx={{ width: 220, display: { xs: 'none', md: 'block' } }}>{isFp ? 'Footprint' : 'package'}</Box><Box sx={{ width: 140, display: { xs: 'none', md: 'block' } }}>owner</Box>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {loading && isOnline && <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>}
              {!loading && rows.length === 0 && <Box sx={{ p: 2, fontSize: 12.5, color: '#9aa0a6' }}>{isOnline ? (query.trim().length < 2 ? 'Wpisz min. 2 znaki lub numer LCSC (np. C25804), aby wyszukać online.' : 'Brak wyników.') : 'Brak elementów w Work Space. Zapisz symbol/footprint w edytorze (Save).'}</Box>}
              {rows.map((r) => (
                <Box key={r.key} onClick={() => setSelKey(r.key)} onDoubleClick={doPlace} onContextMenu={(e) => { e.preventDefault(); setSelKey(r.key); setCtxRow({ x: e.clientX, y: e.clientY, row: r }); }} sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, cursor: 'default', borderBottom: '1px solid #f0f1f3', bgcolor: selKey === r.key ? '#2f7fe0' : 'transparent', color: selKey === r.key ? '#fff' : '#000', '&:hover': { bgcolor: selKey === r.key ? '#2f7fe0' : '#f4f6f8' } }}>
                  <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 120 }}>
                    {r.source === 'ws-fp' ? <DeveloperBoardIcon sx={{ fontSize: 16, color: selKey === r.key ? '#fff' : '#e0533d', flexShrink: 0 }} /> : <MemoryOutlinedIcon sx={{ fontSize: 16, color: selKey === r.key ? '#fff' : '#3b82d6', flexShrink: 0 }} />}
                    {isFav(r) && <FavoriteIcon sx={{ fontSize: 13, color: selKey === r.key ? '#fff' : '#e05656', flexShrink: 0 }} />}
                    <Typography sx={{ fontSize: 13, color: selKey === r.key ? '#fff' : '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}{r.lcsc && r.lcsc !== r.title ? ` (${r.lcsc})` : ''}</Typography>
                  </Box>
                  <Box title={r.pkg} sx={{ width: 220, display: { xs: 'none', md: 'block' }, fontSize: 12.5, color: selKey === r.key ? '#fff' : '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pr: 1 }}>{r.pkg || '—'}</Box>
                  <Box title={r.owner} sx={{ width: 140, display: { xs: 'none', md: 'block' }, fontSize: 12.5, color: selKey === r.key ? '#fff' : '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.owner || '—'}</Box>
                </Box>
              ))}
            </Box>
          </Box>
          {/* Podgląd */}
          <Box sx={{ width: 200, flexShrink: 0, borderLeft: `1px solid ${C.barBorder}`, display: 'flex', flexDirection: 'column', bgcolor: '#fbfbfc' }}>
            <Box sx={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0 }}>{prevLoading ? <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={20} /></Box> : <LibraryPreview prev={prev} type={type} />}</Box>
          </Box>
        </Box>
        {/* Breadcrumb + stany magazynowe + błąd */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 20, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 12.5, color: '#2b2f34' }}>{engine} &gt; {type} &gt; {cls}{sel ? ` > ${sel.title}` : ''}</Typography>
          {sel?.source === 'lcsc' && (<>
            <span style={{ flex: 1 }} />
            {sel.price && <Typography sx={{ fontSize: 14, color: '#d64545', fontWeight: 600 }}>{sel.price.startsWith('$') ? sel.price : `$${sel.price}`}</Typography>}
            <Typography sx={{ fontSize: 12.5, color: '#2b2f34' }}>Numer części LCSC: {sel.lcsc}</Typography>
            <Typography sx={{ fontSize: 12.5, color: '#2b2f34' }}>LCSC Stan: <b style={{ color: (sel.stock ?? 0) > 0 ? '#2e7d32' : '#d64545' }}>{sel.stock ?? 0}</b></Typography>
            <Typography sx={{ fontSize: 12.5, color: '#2b2f34' }}>JLCPCB SMT Stock: <b style={{ color: (sel.smtStock ?? 0) > 0 ? '#2e7d32' : '#d64545' }}>{sel.smtStock ?? 0}</b></Typography>
          </>)}
          {error && <Typography sx={{ fontSize: 12, color: 'error.main' }}>· {error}</Typography>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5, gap: 1 }}>
        <Button variant="contained" onClick={() => window.open('https://easyeda.com', '_blank')} sx={{ textTransform: 'none' }}>Apply New Part</Button>
        <Button variant="contained" color="inherit" onClick={() => window.open('https://easyeda.com', '_blank')} sx={{ textTransform: 'none', bgcolor: '#5b8def', color: '#fff', '&:hover': { bgcolor: '#4a7fe0' } }}>Report Error</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!canEdit || busy} startIcon={<EditOutlinedIcon sx={{ fontSize: 17 }} />} onClick={doEdit} sx={{ textTransform: 'none' }}>Edycja</Button>
        <Button variant="contained" disabled={!sel || busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlaceOutlinedIcon sx={{ fontSize: 17 }} />} onClick={doPlace} sx={{ textTransform: 'none' }}>Umieść</Button>
        <Button variant="contained" onClick={(e) => setMoreAnchor(e.currentTarget)} endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 18 }} />} sx={{ textTransform: 'none' }}>Więcej</Button>
        <Menu anchorEl={moreAnchor} open={!!moreAnchor} onClose={() => setMoreAnchor(null)}>
          <MenuItem disabled={!canEdit} onClick={() => { doEdit(); setMoreAnchor(null); }} sx={{ fontSize: 13.5 }}>Edytuj kopię</MenuItem>
          <MenuItem disabled={!sel} onClick={() => { doPlace(); setMoreAnchor(null); }} sx={{ fontSize: 13.5 }}>Umieść i kontynuuj</MenuItem>
          <MenuItem onClick={() => setMoreAnchor(null)} sx={{ fontSize: 13.5 }}>Odśwież listę</MenuItem>
        </Menu>
        <Button variant="contained" color="inherit" startIcon={<CloseIcon sx={{ fontSize: 16 }} />} onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', color: '#fff', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
      {/* Menu kontekstowe wiersza (prawy klik) */}
      <Menu open={!!ctxRow} onClose={() => setCtxRow(null)} anchorReference="anchorPosition" anchorPosition={ctxRow ? { top: ctxRow.y, left: ctxRow.x } : undefined}>
        {(() => {
          const r = ctxRow?.row; if (!r) return null; const fav = isFav(r); const c = () => setCtxRow(null);
          const mi = (label: string, onClick: () => void, icon?: React.ReactNode, disabled?: boolean) => <MenuItem key={label} disabled={disabled} onClick={() => { onClick(); c(); }} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 190 }}>{icon}{label}</MenuItem>;
          return [
            mi('Edycja', () => editRow(r), <EditOutlinedIcon sx={{ fontSize: 17, color: '#2f7fe0' }} />, r.source === 'lcsc'),
            mi('Klonuj', () => cloneRow(r), <ContentCopyOutlinedIcon sx={{ fontSize: 17, color: C.icon }} />, r.source === 'lcsc'),
            mi(fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', () => toggleFav(r), fav ? <FavoriteIcon sx={{ fontSize: 17, color: '#e05656' }} /> : <FavoriteBorderIcon sx={{ fontSize: 17, color: '#e05656' }} />),
            mi('Odśwież', () => reloadWs(), <RefreshIcon sx={{ fontSize: 17, color: '#3aa757' }} />),
            <Divider key="d" />,
            mi('View Datasheet…', () => viewDatasheet(r)),
            mi('Report Error…', () => window.open('https://easyeda.com', '_blank')),
            mi('View Owner', () => window.alert(`Owner: ${r.owner}`)),
            mi('View Detail', () => window.alert(`${r.title}${r.lcsc ? `\nLCSC: ${r.lcsc}` : ''}\nPackage: ${r.pkg || '—'}\nOwner: ${r.owner}\nŹródło: ${r.source}`)),
          ];
        })()}
      </Menu>
    </Dialog>
    </ThemeProvider>
  );
}

// ── Dialog „Zapisz jako Symbol" (zapis do współdzielonej biblioteki) ──────────
interface SymbolMeta { title: string; owner: string; supplier: string; supplierOther: string; supplierPart: string; manufacturer: string; mfrPart: string; link: string; tags: string; description: string; footprint: string }
const emptyMeta = (): SymbolMeta => ({ title: 'NowySymbol', owner: 'mhersztowski', supplier: 'Unknown', supplierOther: '', supplierPart: '', manufacturer: '', mfrPart: '', link: '', tags: '', description: '', footprint: '' });

function SaveSymbolDialog({ open, onClose, onSave, initialTitle, initialFootprint }: { open: boolean; onClose: () => void; onSave: (m: SymbolMeta) => Promise<void>; initialTitle?: string; initialFootprint?: string }) {
  const [m, setM] = useState<SymbolMeta>(emptyMeta);
  const [fpList, setFpList] = useState<{ name: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Domyślny tytuł = nazwa otwartego symbolu (Place Component → Edycja), by Save szedł „na siebie".
  // Pobieramy listę footprintów z Work Space do comboboxa powiązania.
  useEffect(() => { if (open) { setM({ ...emptyMeta(), title: initialTitle?.trim() || emptyMeta().title, footprint: initialFootprint || '' }); setErr(null); fetch('/api/footprints').then((r) => r.json()).then((d) => setFpList(Array.isArray(d.footprints) ? d.footprints : [])).catch(() => { }); } }, [open, initialTitle, initialFootprint]);
  const upd = (k: keyof SymbolMeta, v: string) => setM((s) => ({ ...s, [k]: v }));
  const doSave = async () => { setSaving(true); setErr(null); try { await onSave(m); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); } };

  const label = (t: string) => <Typography sx={{ width: 96, fontSize: 13.5, color: '#3a3f45', pt: 0.9, flexShrink: 0, textAlign: 'right' }}>{t}</Typography>;
  const tf = { size: 'small' as const, fullWidth: true, InputProps: { sx: { fontSize: 13.5 } } };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>
        Zapisz jako Symbol
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Właściciel:')}<TextField {...tf} value={m.owner} disabled /><Link href="#" onClick={(e) => e.preventDefault()} sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>Utwórz zespół</Link></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Tytuł:')}<TextField {...tf} autoFocus value={m.title} onChange={(e) => upd('title', e.target.value)} onFocus={(e) => e.target.select()} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Footprint:')}
          <select value={m.footprint} onChange={(e) => upd('footprint', e.target.value)} style={{ height: 34, width: '100%', border: `1px solid ${C.fieldBorder}`, borderRadius: 4, fontSize: 13.5, padding: '0 6px', background: '#fff' }}>
            <option value="">— brak powiązania —</option>
            {fpList.map((f) => <option key={f.name} value={f.name}>{f.title || f.name}</option>)}
          </select>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Dostawca:')}
          <select value={m.supplier} onChange={(e) => upd('supplier', e.target.value)} style={{ height: 34, border: `1px solid ${C.fieldBorder}`, borderRadius: 4, fontSize: 13.5, padding: '0 6px', background: '#fff' }}>{['Unknown', 'LCSC', 'Mouser', 'DigiKey', 'Farnell', 'Inne'].map((o) => <option key={o} value={o}>{o}</option>)}</select>
          <Typography sx={{ fontSize: 13, color: '#6b7177' }}>Lub</Typography><TextField {...tf} placeholder="Inne" value={m.supplierOther} onChange={(e) => upd('supplierOther', e.target.value)} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Część dostawcy:')}<TextField {...tf} placeholder="296-6501-2-ND" value={m.supplierPart} onChange={(e) => upd('supplierPart', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('producent:')}<TextField {...tf} placeholder="ReliaPro" value={m.manufacturer} onChange={(e) => upd('manufacturer', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Część producenta:')}<TextField {...tf} placeholder="NE555DR" value={m.mfrPart} onChange={(e) => upd('mfrPart', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Łącze:')}<TextField {...tf} placeholder="http://www.ti.com/lit/ds/symlink/ne555.pdf" value={m.link} onChange={(e) => upd('link', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Tags:')}<TextField {...tf} placeholder="Split by ';' for multi tags" value={m.tags} onChange={(e) => upd('tags', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>{label('Opis:')}<TextField {...tf} multiline minRows={3} value={m.description} onChange={(e) => upd('description', e.target.value)} /></Box>
        {err && <Typography sx={{ fontSize: 12.5, color: 'error.main', pl: '108px' }}>{err}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={doSave} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ textTransform: 'none' }}>✓ Zapisz</Button>
        <Button variant="contained" color="inherit" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', color: '#fff', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Zapisz jako Footprint" ────────────────────────────────────────────
interface FpSaveMeta { title: string; owner: string; tags: string; link: string; description: string; symbol: string }
const emptyFpSave = (): FpSaveMeta => ({ title: 'NEW_FOOTPRINT', owner: 'mhersztowski', tags: '', link: '', description: '', symbol: '' });
function SaveFootprintDialog({ open, onClose, onSave, initialTitle, initialSymbol }: { open: boolean; onClose: () => void; onSave: (m: FpSaveMeta) => Promise<void>; initialTitle?: string; initialSymbol?: string }) {
  const [m, setM] = useState<FpSaveMeta>(emptyFpSave);
  const [symList, setSymList] = useState<{ name: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Domyślny tytuł = nazwa otwartego footprintu (Place Component → Edycja), by Save szedł „na siebie".
  // Pobieramy listę symboli z Work Space do comboboxa powiązania.
  useEffect(() => { if (open) { setM({ ...emptyFpSave(), title: initialTitle?.trim() || emptyFpSave().title, symbol: initialSymbol || '' }); setErr(null); fetch('/api/symbols').then((r) => r.json()).then((d) => setSymList(Array.isArray(d.symbols) ? d.symbols : [])).catch(() => { }); } }, [open, initialTitle, initialSymbol]);
  const upd = (k: keyof FpSaveMeta, v: string) => setM((s) => ({ ...s, [k]: v }));
  const doSave = async () => { setSaving(true); setErr(null); try { await onSave(m); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); } };
  const label = (t: string) => <Typography sx={{ width: 96, fontSize: 13.5, color: '#3a3f45', pt: 0.9, flexShrink: 0, textAlign: 'right' }}>{t}</Typography>;
  const tf = { size: 'small' as const, fullWidth: true, InputProps: { sx: { fontSize: 13.5 } } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Zapisz jako Footprint<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Właściciel:')}<TextField {...tf} value={m.owner} disabled /><Link href="#" onClick={(e) => e.preventDefault()} sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>Utwórz zespół</Link></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Tytuł:')}<TextField {...tf} autoFocus value={m.title} onChange={(e) => upd('title', e.target.value)} onFocus={(e) => e.target.select()} /><Link href="#" onClick={(e) => e.preventDefault()} sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>Footprint Naming Reference</Link></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Symbol:')}
          <select value={m.symbol} onChange={(e) => upd('symbol', e.target.value)} style={{ height: 34, width: '100%', border: `1px solid ${C.fieldBorder}`, borderRadius: 4, fontSize: 13.5, padding: '0 6px', background: '#fff' }}>
            <option value="">— brak powiązania —</option>
            {symList.map((s) => <option key={s.name} value={s.name}>{s.title || s.name}</option>)}
          </select>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Tags:')}<TextField {...tf} placeholder="Split by ';' for multi tags" value={m.tags} onChange={(e) => upd('tags', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{label('Łącze:')}<TextField {...tf} value={m.link} onChange={(e) => upd('link', e.target.value)} /></Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>{label('Opis:')}<TextField {...tf} multiline minRows={4} value={m.description} onChange={(e) => upd('description', e.target.value)} /></Box>
        {err && <Typography sx={{ fontSize: 12.5, color: 'error.main', pl: '108px' }}>{err}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={doSave} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ textTransform: 'none' }}>✓ Zapisz</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', color: '#fff', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Ustawienia dokumentu" ─────────────────────────────────────────────
const SHEET_SIZES: Record<string, [number, number]> = { A5: [210.0, 148.0], A4: [296.926, 209.804], A3: [420.0, 297.0], A2: [594.0, 420.0], Letter: [279.4, 215.9], Custom: [297, 210] };
interface DocSettings { size: string; w: string; h: string; orientation: string }
const emptyDoc = (): DocSettings => ({ size: 'A4', w: '296.926', h: '209.804', orientation: 'Poziomo' });
function DocSettingsDialog({ open, onClose, initial, onPlace }: { open: boolean; onClose: () => void; initial: DocSettings; onPlace: (d: DocSettings) => void }) {
  const [d, setD] = useState<DocSettings>(initial);
  useEffect(() => { if (open) setD(initial); }, [open, initial]);
  const setSize = (s: string) => { const [w, h] = SHEET_SIZES[s] ?? SHEET_SIZES.A4; setD((p) => ({ ...p, size: s, ...(s === 'Custom' ? {} : (p.orientation === 'Pionowo' ? { w: String(h), h: String(w) } : { w: String(w), h: String(h) })) })); };
  const setOri = (o: string) => setD((p) => (o === p.orientation ? p : { ...p, orientation: o, w: p.h, h: p.w }));
  const fld = { size: 'small' as const, InputProps: { sx: { fontSize: 13.5 } } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Ustawienia dokumentu<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: '18px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ width: 120, fontSize: 13.5, textAlign: 'right', color: '#3a3f45' }}>Rozmiar arkusza:</Typography>
          <select value={d.size} onChange={(e) => setSize(e.target.value)} style={{ height: 34, border: `1px solid ${C.fieldBorder}`, borderRadius: 4, fontSize: 13.5, padding: '0 6px', background: '#fff' }}>{Object.keys(SHEET_SIZES).map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <TextField {...fld} value={d.w} onChange={(e) => setD((p) => ({ ...p, w: e.target.value, size: 'Custom' }))} sx={{ width: 150 }} />
          <Typography sx={{ fontSize: 14 }}>*</Typography>
          <TextField {...fld} value={d.h} onChange={(e) => setD((p) => ({ ...p, h: e.target.value, size: 'Custom' }))} sx={{ width: 150 }} />
          <Typography sx={{ fontSize: 13.5, color: '#6b7177' }}>(mm)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ width: 120, fontSize: 13.5, textAlign: 'right', color: '#3a3f45' }}>Orientacja:</Typography>
          <select value={d.orientation} onChange={(e) => setOri(e.target.value)} style={{ height: 34, border: `1px solid ${C.fieldBorder}`, borderRadius: 4, fontSize: 13.5, padding: '0 6px', background: '#fff' }}>{['Poziomo', 'Pionowo'].map((o) => <option key={o} value={o}>{o}</option>)}</select>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={() => setD((p) => ({ ...p, size: 'Custom' }))} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Add custom</Button>
        <Button variant="contained" onClick={() => { onPlace(d); onClose(); }} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Umieść</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Modyfikuj informację o pliku" (Tytuł + Opis) ──────────────────────
function FileInfoDialog({ open, name, desc, onClose, onOk }: { open: boolean; name: string; desc: string; onClose: () => void; onOk: (title: string, desc: string) => void }) {
  const [title, setTitle] = useState(name);
  const [d, setD] = useState(desc);
  useEffect(() => { if (open) { setTitle(name); setD(desc); } }, [open, name, desc]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Modyfikuj informację o pliku<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}><Typography sx={{ width: 60, fontSize: 14, textAlign: 'right' }}>Tytuł:</Typography><TextField autoFocus size="small" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} InputProps={{ sx: { fontSize: 14 } }} /></Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}><Typography sx={{ width: 60, fontSize: 14, textAlign: 'right', mt: 1 }}>Opis:</Typography><TextField size="small" fullWidth multiline minRows={3} value={d} onChange={(e) => setD(e.target.value)} InputProps={{ sx: { fontSize: 14 } }} /></Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={() => title.trim() && onOk(title.trim(), d)} sx={{ textTransform: 'none' }}>✓ Ok</Button>
        <Button variant="contained" color="inherit" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', color: '#fff', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Klonuj" (Właściciel / Tytuł / Projekt) ────────────────────────────
function CloneFileDialog({ open, name, projectName, onClose, onOk }: { open: boolean; name: string; projectName: string; onClose: () => void; onOk: (title: string) => void }) {
  const [title, setTitle] = useState(name);
  useEffect(() => { if (open) setTitle(name); }, [open, name]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Klonuj<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography sx={{ width: 70, fontSize: 14, textAlign: 'right' }}>Właściciel:</Typography>
          <TextField select size="small" value="mhersztowski" sx={{ flex: 1 }} SelectProps={{ native: true }} InputProps={{ sx: { fontSize: 14 } }}><option value="mhersztowski">mhersztowski</option></TextField>
          <Link sx={{ fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>Utwórz zespół</Link>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}><Typography sx={{ width: 70, fontSize: 14, textAlign: 'right' }}>Tytuł:</Typography><TextField autoFocus size="small" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} InputProps={{ sx: { fontSize: 14 } }} /></Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Typography sx={{ width: 70, fontSize: 14, textAlign: 'right' }}>Projekt:</Typography><Box sx={{ flex: 1, border: `1px solid ${C.fieldBorder}`, borderRadius: 0.75, px: 1.25, py: 0.9, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 0.75, color: '#2b2f34' }}><KeyboardArrowRightIcon sx={{ fontSize: 16, color: C.icon }} /><PersonOutlineIcon sx={{ fontSize: 16, color: '#606770' }} /> Mhersztowski <KeyboardArrowRightIcon sx={{ fontSize: 16, color: C.icon }} /><FolderOutlinedIcon sx={{ fontSize: 15, color: '#e0a83a' }} /> {projectName}</Box></Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={() => title.trim() && onOk(title.trim())} sx={{ textTransform: 'none' }}>✓ Ok</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Pokaż plik historii" (tabela zapisów + Odtwórz) ───────────────────
function HistoryFileDialog({ open, snaps, onClose, onRestore }: { open: boolean; snaps: { snap: { time: string; by: string; data: unknown[] }; num: number }[]; onClose: () => void; onRestore: (num: number) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { if (open) setSel(null); }, [open]);
  const rows = snaps.slice().reverse();
  const cell = { flex: 1, px: 2, py: 1.25, fontSize: 13.5 } as const;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 1, height: 560 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Pokaż plik historii<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 1.5, pb: 1, fontSize: 13.5, color: '#2b2f34' }}>Do odtworzenia proszę wybrać historię<br /><span style={{ color: '#e07a3d' }}>Be careful! When you click the "Recover" button, this sheet will be overwritten!</span></Box>
        <Box sx={{ display: 'flex', borderTop: `1px solid ${C.fieldBorder}`, borderBottom: `2px solid ${C.fieldBorder}`, bgcolor: '#fafbfc', fontWeight: 500 }}><Box sx={{ ...cell, flex: 0.5 }}>Numer</Box><Box sx={cell}>Czas zapisu</Box><Box sx={cell}>Edytor</Box></Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {rows.length === 0 && <Box sx={{ px: 2, py: 2, fontSize: 13.5, color: '#8a9096' }}>Brak zapisów historii</Box>}
          {rows.map((r) => (
            <Box key={r.num} onClick={() => setSel(r.num)} sx={{ display: 'flex', cursor: 'default', borderBottom: '1px solid #eef0f2', bgcolor: sel === r.num ? '#e3f0ff' : 'transparent', '&:hover': { bgcolor: sel === r.num ? '#e3f0ff' : '#f4f6f8' } }}>
              <Box sx={{ ...cell, flex: 0.5 }}>{r.num}</Box><Box sx={cell}>{r.snap.time}</Box><Box sx={cell}>{r.snap.by}</Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" disabled={sel == null} onClick={() => { if (sel != null) onRestore(sel); }} sx={{ textTransform: 'none' }}>Odtwórz</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Znajdź" (radio kryteriów + Find Next) ─────────────────────────────
function FindDialog({ open, onClose, onFindNext }: { open: boolean; onClose: () => void; onFindNext: (mode: 'prefix' | 'name' | 'footprint' | 'netlabel', q: string) => void }) {
  const [mode, setMode] = useState<'prefix' | 'name' | 'footprint' | 'netlabel'>('prefix');
  const [q, setQ] = useState('');
  const opt = (v: typeof mode, label: string) => <Box onClick={() => setMode(v)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'default', fontSize: 13.5 }}><Box sx={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${mode === v ? '#2f7fe0' : '#b6bcc2'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{mode === v && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#2f7fe0' }} />}</Box>{label}</Box>;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Znajdź<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
          <Typography sx={{ fontSize: 13.5, mt: 0.25 }}>Znajdź</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{opt('prefix', "Component's Prefix")}{opt('name', "Component's Name")}{opt('footprint', "Component's Footprint")}{opt('netlabel', 'Etykieta sieci')}</Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField autoFocus size="small" fullWidth value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onFindNext(mode, q); }} InputProps={{ sx: { fontSize: 14 } }} />
          <Button variant="outlined" onClick={() => onFindNext(mode, q)} sx={{ textTransform: 'none', color: C.green, borderColor: C.green, whiteSpace: 'nowrap' }}>Find Next</Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog „Find Similar Objects" (Kind/Range + filtry właściwości) ────────────
const SIM_OPS = [{ v: 'any', l: 'Any' }, { v: 'eq', l: 'Równe' }, { v: 'ne', l: 'Różne' }];
function SimRow({ label, op, val, onOp, onVal, valSelect }: { label: string; op: string; val: string; onOp: (v: string) => void; onVal: (v: string) => void; valSelect?: string[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
      <Typography sx={{ width: 150, fontSize: 13.5, flexShrink: 0 }}>{label}</Typography>
      <select value={op} onChange={(e) => onOp(e.target.value)} style={{ ...inStyle(), width: 110, flex: 'none' }}>{SIM_OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
      {valSelect ? <select value={val} onChange={(e) => onVal(e.target.value)} style={{ ...inStyle() }}>{valSelect.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        : <input value={val} onChange={(e) => onVal(e.target.value)} style={{ ...inStyle() }} />}
    </Box>
  );
}
function FindSimilarDialog({ open, onClose, onFind }: { open: boolean; onClose: () => void; onFind: (f: SimFilters) => void }) {
  const blank: SimFilters = { name: { op: 'any', val: '' }, prefix: { op: 'any', val: '' }, footprint: { op: 'any', val: '' }, id: { op: 'any', val: '' } };
  const [f, setF] = useState<SimFilters>(blank);
  const [kind, setKind] = useState('Komponent'); const [range, setRange] = useState('Current Sheet');
  useEffect(() => { if (open) { setF(blank); setKind('Komponent'); setRange('Current Sheet'); } /* eslint-disable-next-line */ }, [open]);
  const set = (k: keyof SimFilters, patch: Partial<SimField>) => setF((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
  const yesNo = ['Tak', 'Nie'];
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Find Similar Objects<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: 2.5, maxHeight: 480 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}><Typography sx={{ width: 150, fontSize: 13.5 }}>Kind</Typography><select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...inStyle() }}><option>Komponent</option><option>Przewód</option><option>Etykieta sieci</option></select></Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}><Typography sx={{ width: 150, fontSize: 13.5 }}>Range</Typography><select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...inStyle() }}><option>Current Sheet</option><option>All Sheets</option></select></Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1 }}>Właściwości Komponentu</Typography>
        <SimRow label="Nazwa" op={f.name.op} val={f.name.val} onOp={(v) => set('name', { op: v as SimField['op'] })} onVal={(v) => set('name', { val: v })} />
        <SimRow label="Wyświetlana nazwa" op="any" val="Tak" onOp={() => { }} onVal={() => { }} valSelect={yesNo} />
        <SimRow label="Prefiks" op={f.prefix.op} val={f.prefix.val} onOp={(v) => set('prefix', { op: v as SimField['op'] })} onVal={(v) => set('prefix', { val: v })} />
        <SimRow label="Wyświetl Prefiks" op="any" val="Tak" onOp={() => { }} onVal={() => { }} valSelect={yesNo} />
        <SimRow label="Konwertuj do PCB" op="any" val="Tak" onOp={() => { }} onVal={() => { }} valSelect={yesNo} />
        <SimRow label="Dodaj do BOM" op="any" val="Tak" onOp={() => { }} onVal={() => { }} valSelect={yesNo} />
        <SimRow label="Locked" op="any" val="Tak" onOp={() => { }} onVal={() => { }} valSelect={yesNo} />
        <SimRow label="ID" op={f.id.op} val={f.id.val} onOp={(v) => set('id', { op: v as SimField['op'] })} onVal={(v) => set('id', { val: v })} />
        <Typography sx={{ fontSize: 14, fontWeight: 600, my: 1 }}>Atrybuty dodatkowe</Typography>
        <SimRow label="Dostawca" op="any" val="LCSC" onOp={() => { }} onVal={() => { }} valSelect={['LCSC', 'Mouser', 'DigiKey', 'Nieznany']} />
        <SimRow label="Część Dostawcy" op="any" val="" onOp={() => { }} onVal={() => { }} />
        <SimRow label="Footprint" op={f.footprint.op} val={f.footprint.val} onOp={(v) => set('footprint', { op: v as SimField['op'] })} onVal={(v) => set('footprint', { val: v })} />
        <SimRow label="Display Footprint" op="any" val="Tak" onOp={() => { }} onVal={() => { }} valSelect={yesNo} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={() => onFind(f)} sx={{ textTransform: 'none' }}>Znajdź</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Adnotacja" (zakres / metoda / kierunek) ───────────────────────────
function AnnotationDialog({ open, onClose, onAnnotate, onReset }: { open: boolean; onClose: () => void; onAnnotate: (scope: 'all' | 'current' | 'selected', method: 'reannotate' | 'keep', dir: 'rows' | 'cols') => void; onReset: () => void }) {
  const [scope, setScope] = useState<'all' | 'current' | 'selected'>('all');
  const [method, setMethod] = useState<'reannotate' | 'keep'>('reannotate');
  const [dir, setDir] = useState<'rows' | 'cols'>('rows');
  const radio = <V,>(cur: V, v: V, set: (v: V) => void, label: string) => <Box onClick={() => set(v)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'default', fontSize: 13.5, py: 0.4 }}><Box sx={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${cur === v ? '#2f7fe0' : '#b6bcc2'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cur === v && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#2f7fe0' }} />}</Box>{label}</Box>;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Adnotacja<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>Zakres</Typography>
        {radio(scope, 'all', setScope, 'All pages')}{radio(scope, 'current', setScope, 'Current page only')}{radio(scope, 'selected', setScope, 'Selected components')}
        <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 1.5, mb: 0.5 }}>Metoda</Typography>
        {radio(method, 'reannotate', setMethod, 'Ponownie wszędzie adnotuj')}{radio(method, 'keep', setMethod, 'Pozostaw istniejącą adnotację')}
        <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 1.5, mb: 0.5 }}>Kierunek</Typography>
        {radio(dir, 'rows', setDir, 'Wierszy')}{radio(dir, 'cols', setDir, 'Kolumn')}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onReset} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Resetuj</Button>
        <Button variant="contained" onClick={() => { onAnnotate(scope, method, dir); onClose(); }} sx={{ textTransform: 'none' }}>✓ Adnotacja</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Eksport Gerber (RS-274X) + wiercenie (Excellon) + ZIP (store, bez zależności) ──
// Jednostka świata = 1 mil = 0.001 cala → format 2.4 (cale): wartość_mil × 10.
const G_UNIT = (v: number) => String(Math.round(v * 10));
// Numer warstwy EasyEDA → nazwa naszej warstwy (z odbiciem góra↔dół dla strony dolnej)
function eeNameFlip(layerNum: string, flip: boolean): string {
  const ln = flip && EE_FLIP[layerNum] ? EE_FLIP[layerNum] : layerNum;
  return EE_LAYER_NAME[ln] || 'Górna warstwa opisowa';
}
// Umieszczony footprint (EasyEDA shapes) → elementy FpEl w układzie świata (mil).
// Odwzorowuje transformację renderPcbPart/renderFootprint: wyśrodkowanie, skala ×4,
// obrót komponentu i lustro + zamiana warstw dla strony dolnej. Używane w eksporcie Gerber.
function placedFpEls(comp: PlacedComp): FpEl[] {
  const fp = comp.fp;
  if (!fp) return [];
  const SC = 4;
  const cx = fp.bbox ? fp.bbox.x + fp.bbox.width / 2 : 0;
  const cy = fp.bbox ? fp.bbox.y + fp.bbox.height / 2 : 0;
  const bottom = comp.layer === 'Dolna warstwa';
  const rad = ((comp.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const ortho = Math.abs(sin) > Math.abs(cos); // obrót ~90/270° → zamiana wymiarów prostokątów
  const px = comp.pcbX ?? comp.x, py = comp.pcbY ?? comp.y; // pozycja footprintu na PCB
  const tp = (sx: number, sy: number): Pt => {
    let x = (sx - cx) * SC; const y = (sy - cy) * SC;
    if (bottom) x = -x;
    return { x: px + (x * cos - y * sin), y: py + (x * sin + y * cos) };
  };
  const out: FpEl[] = [];
  fp.shapes.forEach((s) => {
    const t = s.split('~');
    switch (t[0]) {
      case 'PAD': {
        const shape = /RECT/i.test(t[1]) ? 'Prostokąt' : /OVAL/i.test(t[1]) ? 'Owal' : 'Okrąg';
        const p = tp(+t[2], +t[3]);
        let w = (+t[4] || 0) * SC, h = (+t[5] || 0) * SC;
        if (ortho) { const tmp = w; w = h; h = tmp; }
        out.push(mkPad(p.x, p.y, t[8] || '', shape, w, h, (+t[9] || 0) * 2 * SC, eeNameFlip(t[6] || '11', bottom), comp.rotation || 0));
        break;
      }
      case 'TRACK': {
        const nums = (t[4] || '').trim().split(/[\s,]+/).map(Number);
        const pts: Pt[] = [];
        for (let i = 0; i + 1 < nums.length; i += 2) pts.push(tp(nums[i], nums[i + 1]));
        if (pts.length >= 2) out.push({ t: 'track', pts, width: Math.max(1, (+t[1] || 0.6) * SC), layer: eeNameFlip(t[2] || '3', bottom), locked: false, id: newId() });
        break;
      }
      case 'CIRCLE': {
        const c = tp(+t[1], +t[2]);
        out.push({ t: 'fcircle', cx: c.x, cy: c.y, r: (+t[3] || 0) * SC, width: Math.max(1, (+t[4] || 0.3) * SC), layer: eeNameFlip(t[5] || '3', bottom), locked: false, id: newId() });
        break;
      }
      default: break; // ARC (ścieżka), SOLIDREGION, TEXT — pomijane w Gerberze
    }
  });
  return out;
}
function gerberFile(els: FpEl[], name: string, layers: string[], copper: boolean): string {
  const head = [`G04 ${name} *`, '%FSLAX24Y24*%', '%MOIN*%', 'G01*'];
  const aps: string[] = []; const apMap = new Map<string, number>(); let dc = 10;
  const ap = (def: string) => { if (!apMap.has(def)) { apMap.set(def, dc); aps.push(`%ADD${dc}${def}*%`); dc++; } return apMap.get(def)!; };
  const ops: string[] = [];
  const mv = (x: number, y: number) => `X${G_UNIT(x)}Y${G_UNIT(y)}D02*`;
  const ln = (x: number, y: number) => `X${G_UNIT(x)}Y${G_UNIT(y)}D01*`;
  const fl = (x: number, y: number) => `X${G_UNIT(x)}Y${G_UNIT(y)}D03*`;
  const inc = (l?: string) => l != null && layers.includes(l);
  const inch = (v: number) => (v / 1000).toFixed(4);
  for (const el of els) {
    if (el.t === 'track' && inc(el.layer) && el.pts.length) { const d = ap(`C,${inch(el.width)}`); ops.push(`D${d}*`, mv(el.pts[0].x, -el.pts[0].y)); el.pts.slice(1).forEach((pp) => ops.push(ln(pp.x, -pp.y))); }
    else if (el.t === 'copper' && inc(el.layer) && el.pts.length) { const d = ap('C,0.0080'); ops.push(`D${d}*`, mv(el.pts[0].x, -el.pts[0].y)); el.pts.slice(1).forEach((pp) => ops.push(ln(pp.x, -pp.y))); ops.push(ln(el.pts[0].x, -el.pts[0].y)); }
    else if (el.t === 'pad' && (inc(el.layer) || (copper && el.layer === 'Wielowastwa'))) { const d = el.shape === 'Prostokąt' ? ap(`R,${inch(el.w)}X${inch(el.h)}`) : ap(`C,${inch(el.w)}`); ops.push(`D${d}*`, fl(el.x, -el.y)); }
    else if (el.t === 'via' && copper) { const d = ap(`C,${inch(el.dia)}`); ops.push(`D${d}*`, fl(el.x, -el.y)); }
    else if (el.t === 'frect' && inc(el.layer)) { const d = ap('C,0.0060'); ops.push(`D${d}*`); const x0 = el.x, y0 = -el.y, x1 = el.x + el.w, y1 = -(el.y + el.h); ops.push(mv(x0, y0), ln(x1, y0), ln(x1, y1), ln(x0, y1), ln(x0, y0)); }
    else if (el.t === 'fcircle' && inc(el.layer)) { const d = ap('C,0.0060'); ops.push(`D${d}*`); for (let i = 0; i <= 64; i++) { const a = (i / 64) * 2 * Math.PI, x = el.cx + el.r * Math.cos(a), y = -(el.cy + el.r * Math.sin(a)); ops.push(i === 0 ? mv(x, y) : ln(x, y)); } }
    else if (el.t === 'arc' && inc(el.layer)) { const d = ap(`C,${inch(el.width)}`); ops.push(`D${d}*`); const a0 = el.a0 * Math.PI / 180, a1 = el.a1 * Math.PI / 180; for (let i = 0; i <= 32; i++) { const a = a0 + (a1 - a0) * (i / 32), x = el.cx + el.r * Math.cos(a), y = -(el.cy + el.r * Math.sin(a)); ops.push(i === 0 ? mv(x, y) : ln(x, y)); } }
    else if (el.t === 'ftext' && inc(el.layer)) { /* tekst pomijamy w Gerberze (brak wektoryzacji) */ }
  }
  return [...head, ...aps, ...ops, 'M02*'].join('\r\n');
}
function drillFile(els: FpEl[]): string {
  const holes: { x: number; y: number; d: number }[] = [];
  for (const el of els) {
    if (el.t === 'pad' && el.hole > 0) holes.push({ x: el.x, y: -el.y, d: el.hole });
    else if (el.t === 'via') holes.push({ x: el.x, y: -el.y, d: el.holeW });
    else if (el.t === 'hole') holes.push({ x: el.x, y: -el.y, d: el.hole });
  }
  const tools = new Map<number, number>(); const byTool = new Map<number, { x: number; y: number }[]>(); let tn = 1;
  for (const h of holes) { if (!tools.has(h.d)) { tools.set(h.d, tn); byTool.set(tn, []); tn++; } byTool.get(tools.get(h.d)!)!.push({ x: h.x, y: h.y }); }
  const L = ['M48', 'INCH,TZ'];
  tools.forEach((t, d) => L.push(`T${t}C${(d / 1000).toFixed(4)}`));
  L.push('%');
  tools.forEach((t) => { L.push(`T${t}`); byTool.get(t)!.forEach((pp) => L.push(`X${G_UNIT(pp.x)}Y${G_UNIT(pp.y)}`)); });
  L.push('M30');
  return L.join('\r\n');
}
function crc32(bytes: Uint8Array): number { let c = ~0; for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; }
function zipStore(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const u16 = (n: number) => Uint8Array.from([n & 255, (n >> 8) & 255]);
  const u32 = (n: number) => Uint8Array.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  const cat = (a: Uint8Array[]) => { const len = a.reduce((s, x) => s + x.length, 0); const r = new Uint8Array(len); let o = 0; a.forEach((x) => { r.set(x, o); o += x.length; }); return r; };
  for (const f of files) {
    const nm = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const lfh = cat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nm.length), u16(0), nm, data]);
    parts.push(lfh);
    central.push(cat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nm]));
    offset += lfh.length;
  }
  const cd = cat(central);
  const eocd = cat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
  return new Blob([cat(parts), cd, eocd] as BlobPart[], { type: 'application/zip' });
}

// ── Model 3D płytki (podgląd Scene3D + eksport OBJ) ────────────────────────────
const BOARD_THICK_MM = 1.6, CU_THICK_MM = 0.05, BODY_H_MM = 1.2;
const PCB_GREEN = '#0e7d3a'; // klasyczny kolor laminatu PCB (soldermask) — podłoże zawsze zielone
// Wiersze panelu warstw 3D (klucz widoczności + etykieta + nazwa warstwy PCB do koloru + kolor zapasowy)
const BOARD_ROWS: { key: string; label: string; layerName?: string; fallback: string }[] = [
  { key: 'board', label: 'Podłoże (obrys)', fallback: PCB_GREEN },
  { key: 'cu-top', label: 'Górna warstwa (miedź)', layerName: 'Górna warstwa', fallback: '#c9a227' },
  { key: 'cu-bot', label: 'Dolna warstwa (miedź)', layerName: 'Dolna warstwa', fallback: '#c9a227' },
  { key: 'cu-multi', label: 'Wielowarstwa / przeloty', layerName: 'Wielowastwa', fallback: '#c9a227' },
  { key: 'silk-top', label: 'Górna opisowa', layerName: 'Górna warstwa opisowa', fallback: '#f2f2f2' },
  { key: 'silk-bot', label: 'Dolna opisowa', layerName: 'Dolna warstwa opisowa', fallback: '#f2f2f2' },
  { key: 'body-top', label: 'Komponenty (góra)', fallback: '#2b2f36' },
  { key: 'body-bot', label: 'Komponenty (dół)', fallback: '#2b2f36' },
];
// Nazwa warstwy PCB → klucz wiersza panelu 3D
function rowKeyOfLayer(layer: string): string | null {
  switch (layer) {
    case 'Górna warstwa': return 'cu-top';
    case 'Dolna warstwa': return 'cu-bot';
    case 'Wielowastwa': return 'cu-multi';
    case 'Górna warstwa opisowa': return 'silk-top';
    case 'Dolna warstwa opisowa': return 'silk-bot';
    default: return null;
  }
}
// Wysokość bazowa (z, mm) plate wg klucza wiersza
function rowZ(key: string): number {
  switch (key) {
    case 'cu-top': case 'cu-multi': return BOARD_THICK_MM;
    case 'cu-bot': return -CU_THICK_MM;
    case 'silk-top': return BOARD_THICK_MM + CU_THICK_MM;
    case 'silk-bot': return -CU_THICK_MM * 2;
    default: return BOARD_THICK_MM;
  }
}
function board3dBounds(els: FpEl[]): { minx: number; miny: number; maxx: number; maxy: number } {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const acc = (x: number, y: number) => { if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y; };
  for (const e of els) {
    if (e.t === 'frect') { acc(e.x, e.y); acc(e.x + e.w, e.y + e.h); }
    else if (e.t === 'fcircle') { acc(e.cx - e.r, e.cy - e.r); acc(e.cx + e.r, e.cy + e.r); }
    else if (e.t === 'track' || e.t === 'copper' || e.t === 'fill') { for (const p of e.pts) acc(p.x, p.y); }
    else if (e.t === 'pad') { acc(e.x - e.w, e.y - e.h); acc(e.x + e.w, e.y + e.h); }
    else if (e.t === 'arc') { acc(e.cx - e.r, e.cy - e.r); acc(e.cx + e.r, e.cy + e.r); }
  }
  if (minx === Infinity) { minx = miny = 0; maxx = maxy = 1000; }
  return { minx, miny, maxx, maxy };
}
// Wiersze warstw obecne w danej płytce (do panelu widoczności) z kolorem z warstw PCB
function boardLayerRows(pcbEls: FpEl[], placed: PlacedComp[], layers?: LayerState): { key: string; label: string; color: string }[] {
  const present = new Set<string>(['board']);
  const allEls = [...pcbEls, ...placed.flatMap(placedFpEls)];
  for (const e of allEls) { if ('layer' in e) { const k = rowKeyOfLayer(e.layer); if (k) present.add(k); } }
  for (const c of placed) { if (c.fp) present.add(c.layer === 'Dolna warstwa' ? 'body-bot' : 'body-top'); }
  return BOARD_ROWS.filter((r) => present.has(r.key)).map((r) => ({ key: r.key, label: r.label, color: (r.layerName && layers?.[r.layerName]?.color) || r.fallback }));
}
// THREE.Group modelu płytki: podłoże z otworami (ExtrudeGeometry) + miedź/silk (pady/ścieżki) + obudowy komponentów.
// Jednostki mm, wyśrodkowane w (0,0); kolory z warstw PCB; `hidden` ukrywa wiersze wg klucza.
function buildBoardGroup(pcbEls: FpEl[], placed: PlacedComp[], layers?: LayerState, hidden?: Set<string>): THREE.Group {
  const g = new THREE.Group();
  const allEls = [...pcbEls, ...placed.flatMap(placedFpEls)];
  const outline = pcbEls.filter((e) => (e.t === 'frect' || e.t === 'fcircle') && e.layer === 'Obrys płyty');
  const b = board3dBounds(outline.length ? outline : allEls);
  const cxw = (b.minx + b.maxx) / 2, cyw = (b.miny + b.maxy) / 2;
  const X = (x: number) => (x - cxw) * W2MM, Y = (y: number) => -(y - cyw) * W2MM; // świat(mil)→mm, oś Y w górę
  const isHidden = (key: string) => hidden?.has(key) ?? false;
  const col = (name: string | undefined, fallback: string) => (name && layers?.[name]?.color) || fallback;
  const colorByKey = (key: string): string => { const r = BOARD_ROWS.find((x) => x.key === key); return r ? col(r.layerName, r.fallback) : '#c9a227'; };
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  // Materiał z silną emisją własnego koloru → warstwy są czytelne i „świecą" niezależnie od oświetlenia sceny.
  const matFor = (hex: string, kind: 'cu' | 'silk' | 'sub' | 'body') => {
    const ck = kind + hex; let m = matCache.get(ck);
    if (!m) {
      const c = new THREE.Color(hex);
      const emI = kind === 'sub' ? 0.4 : kind === 'body' ? 0.6 : 0.9; // ~pełna emisja dla warstw, mniejsza dla podłoża/obudów
      m = new THREE.MeshStandardMaterial({ color: c, emissive: c.clone(), emissiveIntensity: emI, roughness: kind === 'cu' ? 0.4 : kind === 'body' ? 0.55 : 0.8, metalness: kind === 'cu' ? 0.5 : 0.1, side: THREE.DoubleSide });
      matCache.set(ck, m);
    }
    return m;
  };
  // Globalne oświetlenie sceny (ambient + 2 kierunkowe) — dokładane do modelu, by dodać delikatne cieniowanie brył.
  g.add(new THREE.AmbientLight(0xffffff, 0.75));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6); keyLight.position.set(0.5, 1, 2); g.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.3); fillLight.position.set(-1, -0.6, 1); g.add(fillLight);
  // Otwory (wiercenie) — pady przelotowe, vias, otwory montażowe
  const drills: { x: number; y: number; r: number }[] = [];
  for (const e of allEls) {
    if (e.t === 'pad' && e.hole > 0) drills.push({ x: e.x, y: e.y, r: e.hole / 2 });
    else if (e.t === 'via') drills.push({ x: e.x, y: e.y, r: e.holeW / 2 });
    else if (e.t === 'hole') drills.push({ x: e.x, y: e.y, r: e.hole / 2 });
  }
  // Podłoże jako ExtrudeGeometry z realnymi dziurami
  const circ = outline.find((e) => e.t === 'fcircle') as (FpEl & { t: 'fcircle' }) | undefined;
  if (!isHidden('board')) {
    const shape = new THREE.Shape();
    if (circ) shape.absarc(X(circ.cx), Y(circ.cy), circ.r * W2MM, 0, Math.PI * 2, false);
    else {
      const xs = [X(b.minx), X(b.maxx)], ys = [Y(b.miny), Y(b.maxy)];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      shape.moveTo(x0, y0); shape.lineTo(x1, y0); shape.lineTo(x1, y1); shape.lineTo(x0, y1); shape.lineTo(x0, y0);
    }
    for (const d of drills) { const path = new THREE.Path(); path.absarc(X(d.x), Y(d.y), Math.max(d.r * W2MM, 0.05), 0, Math.PI * 2, true); shape.holes.push(path); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: BOARD_THICK_MM, bevelEnabled: false, curveSegments: 24 });
    g.add(new THREE.Mesh(geo, matFor(colorByKey('board'), 'sub'))); // podłoże zielone; już w z ∈ [0, thick]
  }
  // Miedź / silk (pady, ścieżki, okręgi)
  for (const e of allEls) {
    if ((e.t === 'frect' || e.t === 'fcircle') && e.layer === 'Obrys płyty') continue;
    if (e.t === 'pad') {
      const key = rowKeyOfLayer(e.layer) ?? 'cu-top';
      if (isHidden(key)) continue;
      const c = colorByKey(key);
      const w = Math.max(e.w * W2MM, 0.05), h = Math.max(e.h * W2MM, 0.05);
      const round = e.shape === 'Okrąg' || e.shape === 'Owal';
      if (e.hole > 0) { // przelotowy → pierścień miedzi na górze i dole (otwór widoczny na wylot)
        const drillR = Math.max(e.hole / 2 * W2MM, 0.05), outR = Math.max(Math.max(w, h) / 2, drillR + 0.12);
        const ringGeo = new THREE.RingGeometry(drillR, outR, round ? 28 : 4);
        for (const zc of [BOARD_THICK_MM + CU_THICK_MM / 2, -CU_THICK_MM / 2]) { const ring = new THREE.Mesh(ringGeo, matFor(c, 'cu')); ring.position.set(X(e.x), Y(e.y), zc); g.add(ring); }
        continue;
      }
      const z = rowZ(key);
      const m = round
        ? (() => { const cy = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, CU_THICK_MM, 20), matFor(c, 'cu')); cy.rotation.x = Math.PI / 2; return cy; })()
        : new THREE.Mesh(new THREE.BoxGeometry(w, h, CU_THICK_MM), matFor(c, 'cu'));
      m.position.set(X(e.x), Y(e.y), z + CU_THICK_MM / 2);
      g.add(m);
      continue;
    }
    const key = 'layer' in e ? rowKeyOfLayer(e.layer) : null;
    if (!key || isHidden(key)) continue;
    const c = colorByKey(key), z = rowZ(key), kind: 'cu' | 'silk' = key.startsWith('cu') ? 'cu' : 'silk';
    if (e.t === 'track' || e.t === 'copper') {
      const wmm = Math.max(('width' in e ? e.width : 8) * W2MM, 0.05);
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const ax = X(e.pts[i].x), ay = Y(e.pts[i].y), bx = X(e.pts[i + 1].x), by = Y(e.pts[i + 1].y);
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
        if (len < 1e-4) continue;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(len, wmm, CU_THICK_MM), matFor(c, kind));
        seg.position.set((ax + bx) / 2, (ay + by) / 2, z + CU_THICK_MM / 2);
        seg.rotation.z = Math.atan2(dy, dx);
        g.add(seg);
      }
    } else if (e.t === 'fcircle') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(e.r * W2MM, 0.05), Math.max(e.width * W2MM / 2, 0.04), 6, 40), matFor(c, kind));
      ring.position.set(X(e.cx), Y(e.cy), z + CU_THICK_MM / 2); g.add(ring);
    }
  }
  // Obudowy komponentów (uproszczone bryły z bbox footprintu)
  for (const c of placed) {
    if (!c.fp) continue;
    const bottom = c.layer === 'Dolna warstwa', key = bottom ? 'body-bot' : 'body-top';
    if (isHidden(key)) continue;
    const bb = pcbPartBBox(c);
    const w = Math.max(bb.w * W2MM, 0.3), h = Math.max(bb.h * W2MM, 0.3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, BODY_H_MM), matFor(colorByKey(key), 'body'));
    m.position.set(X(bb.x + bb.w / 2), Y(bb.y + bb.h / 2), bottom ? -CU_THICK_MM - BODY_H_MM / 2 : BOARD_THICK_MM + BODY_H_MM / 2);
    g.add(m);
  }
  return g;
}
// Serializacja THREE.Object3D → tekst OBJ (v/vn/f w world-space), bez zależności zewnętrznych
function object3dToObj(root: THREE.Object3D, name = 'pcb'): string {
  root.updateMatrixWorld(true);
  const lines: string[] = [`# ${name} — MyCastle CAD`, `o ${name}`];
  let base = 1;
  const v = new THREE.Vector3(), nrm = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) return;
    nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); lines.push(`v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`); }
    const nAttr = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (nAttr) for (let i = 0; i < nAttr.count; i++) { nrm.fromBufferAttribute(nAttr, i).applyMatrix3(nm).normalize(); lines.push(`vn ${nrm.x.toFixed(4)} ${nrm.y.toFixed(4)} ${nrm.z.toFixed(4)}`); }
    const face = (a: number, bb: number, c: number) => { const A = base + a, B = base + bb, C = base + c; lines.push(nAttr ? `f ${A}//${A} ${B}//${B} ${C}//${C}` : `f ${A} ${B} ${C}`); };
    const idx = geo.getIndex();
    if (idx) for (let i = 0; i < idx.count; i += 3) face(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    else for (let i = 0; i < pos.count; i += 3) face(i, i + 1, i + 2);
    base += pos.count;
  });
  return lines.join('\n');
}
// Dialog podglądu 3D płytki (Scene3D / SimpleViewer) — z panelem widoczności warstw
function Board3DDialog({ open, onClose, pcbEls, placed, name, layers }: { open: boolean; onClose: () => void; pcbEls: FpEl[]; placed: PlacedComp[]; name: string; layers?: LayerState }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setHidden(new Set()); }, [open]);
  const rows = useMemo(() => (open ? boardLayerRows(pcbEls, placed, layers) : []), [open, pcbEls, placed, layers]);
  const hiddenKey = [...hidden].sort().join(',');
  const group = useMemo(() => (open ? buildBoardGroup(pcbEls, placed, layers, hidden) : null), [open, pcbEls, placed, layers, hiddenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const emptyGraph = useMemo(() => new SceneGraph(), []);
  const fitRef = useRef<(() => void) | null>(null);
  useEffect(() => { if (open && group) { const id = setTimeout(() => fitRef.current?.(), 80); return () => clearTimeout(id); } }, [open, group]);
  const toggle = (key: string) => setHidden((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '84vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Podgląd 3D — {name}<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ p: 0, bgcolor: '#1a1d21', display: 'flex' }}>
        <Box sx={{ width: 208, flexShrink: 0, bgcolor: '#22262b', borderRight: '1px solid #333', p: 1, overflowY: 'auto' }}>
          <Box sx={{ fontSize: 12, fontWeight: 700, color: '#aeb4bb', px: 0.5, py: 0.5, letterSpacing: 0.3 }}>WARSTWY</Box>
          {rows.map((r) => (
            <Box key={r.key} onClick={() => toggle(r.key)} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.75, py: 0.6, borderRadius: 0.75, cursor: 'pointer', opacity: hidden.has(r.key) ? 0.4 : 1, '&:hover': { bgcolor: '#2c3138' } }}>
              {hidden.has(r.key) ? <VisibilityOffOutlinedIcon sx={{ fontSize: 17, color: '#8a9096' }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 17, color: '#cfd4d9' }} />}
              <Box sx={{ width: 13, height: 13, borderRadius: 0.4, bgcolor: r.color, border: '1px solid #0006', flexShrink: 0 }} />
              <Box sx={{ fontSize: 12.5, color: '#dfe3e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {group && <SimpleViewer sceneGraph={emptyGraph} extraObjects={group} autoFit fitSceneRef={fitRef} cameraPreset="cad" backgroundColor="#1a1d21" showGrid={false} style={{ width: '100%', height: '100%' }} />}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog „Nowe PCB" (właściwości nowej płytki + obrys) ──────────────────────
interface NewPcbCfg { units: string; copper: number; outline: string; x: number; y: number; w: number; h: number }
function NewPcbDialog({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (c: NewPcbCfg) => void }) {
  const [units, setUnits] = useState('mm'); const [copper, setCopper] = useState('2'); const [outline, setOutline] = useState('Prostokątny');
  const [x, setX] = useState('0'); const [y, setY] = useState('100'); const [w, setW] = useState('100'); const [h, setH] = useState('100');
  useEffect(() => { if (open) { setUnits('mm'); setCopper('2'); setOutline('Prostokątny'); setX('0'); setY('100'); setW('100'); setH('100'); } }, [open]);
  const num = (v: string) => Number(v) || 0;
  const row = (label: string, node: React.ReactNode, node2?: React.ReactNode) => (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2.5 }}>
      <Typography sx={{ width: 150, fontSize: 14, color: '#2b2f34' }}>{label}</Typography>{node}
      {node2}
    </Box>
  );
  const numField = (label: string, val: string, set: (v: string) => void) => (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
      <Typography sx={{ width: 90, fontSize: 14, color: '#2b2f34' }}>{label}</Typography>
      <input value={val} onChange={(e) => set(e.target.value)} style={{ ...inStyle(), width: 120, height: 34, flex: 'none' }} />
      <Typography sx={{ fontSize: 13, color: '#5b6169', ml: 1 }}>{units}</Typography>
    </Box>
  );
  const sel = (val: string, set: (v: string) => void, opts: string[]) => <select value={val} onChange={(e) => set(e.target.value)} style={{ ...inStyle(), width: 200, height: 34, flex: 'none' }}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Nowe PCB<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        {row('Jednostki', sel(units, setUnits, ['mm', 'mil']))}
        {row('Copper Layer', sel(copper, setCopper, ['1', '2', '4', '6']))}
        {row('Board Outline', sel(outline, setOutline, ['Prostokątny', 'Okrągły']))}
        {row('', numField('Początek X:', x, setX), numField('Początek Y:', y, setY))}
        {row('', numField('Szerokość:', w, setW), outline === 'Okrągły' ? <Box sx={{ flex: 1 }} /> : numField('Wysokość:', h, setH))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={() => onApply({ units, copper: num(copper), outline, x: num(x), y: num(y), w: num(w), h: outline === 'Okrągły' ? num(w) : num(h) })} sx={{ textTransform: 'none' }}>Zastosuj</Button>
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', bgcolor: '#5b8def', '&:hover': { bgcolor: '#4a7fe0' } }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog „Otwórz projekt" (lista projektów zapisanych na serwerze) ──────────
function OpenProjectDialog({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (name: string) => void }) {
  const [projects, setProjects] = useState<{ name: string; title: string; savedAt?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const reload = () => { setLoading(true); fetch('/api/projects').then((r) => r.json()).then((d) => setProjects(Array.isArray(d.projects) ? d.projects : [])).catch(() => setProjects([])).finally(() => setLoading(false)); };
  useEffect(() => { if (open) { setSel(null); reload(); } }, [open]);
  const del = async (name: string) => { if (!window.confirm(`Usunąć projekt „${name}" z serwera?`)) return; try { await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: 'DELETE' }); } catch { /* ignore */ } reload(); };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f2f3f5', py: 1.25, fontSize: 15 }}>Otwórz projekt (serwer)<IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {loading && <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
        {!loading && projects.length === 0 && <Box sx={{ px: 2, py: 2, fontSize: 13, color: '#8a9096' }}>Brak zapisanych projektów. Zapisz projekt przez Plik → Zapisz.</Box>}
        <List dense sx={{ maxHeight: 380, overflow: 'auto' }}>
          {projects.map((p) => (
            <ListItemButton key={p.name} selected={sel === p.name} onClick={() => setSel(p.name)} onDoubleClick={() => { onOpen(p.name); onClose(); }}>
              <FolderOpenIcon sx={{ fontSize: 18, color: '#e0a83a', mr: 1.5 }} />
              <ListItemText primary={p.title || p.name} secondary={p.savedAt ? new Date(p.savedAt).toLocaleString() : ''} primaryTypographyProps={{ fontSize: 13.5 }} secondaryTypographyProps={{ fontSize: 11.5 }} />
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); del(p.name); }}><DeleteOutlineIcon sx={{ fontSize: 17, color: C.icon }} /></IconButton>
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={reload} sx={{ textTransform: 'none' }}>Odśwież</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!sel} onClick={() => { if (sel) { onOpen(sel); onClose(); } }} sx={{ textTransform: 'none' }}>Otwórz</Button>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
}

// Podgląd symbolu + footprintu dla numeru LCSC (EasyEDA). Samodzielny — pobiera z
// `/api/easyeda/component/{lcsc}` i renderuje istniejącymi rendererami. Używany m.in.
// przez dialog „Moje elementy" (przekazywany jako render-prop, by uniknąć cyklu importów).
export function LcscPreview({ lcsc }: { lcsc: string }) {
  const [data, setData] = useState<{ symbol?: EasyEdaSym; footprint?: EasyEdaSym } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = lcsc.trim();
    if (!code) { setData(null); setError(null); return; }
    let cancel = false;
    setLoading(true); setError(null);
    // Debounce — pole LCSC może się zmieniać przy pisaniu; nie odpytuj przy każdym znaku.
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/easyeda/component/${encodeURIComponent(code)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!cancel) setData({ symbol: d.symbol || d.sym, footprint: d.footprint || d.fp });
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 350);
    return () => { cancel = true; clearTimeout(timer); };
  }, [lcsc]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={22} /></Box>;
  if (error) return <Typography variant="body2" color="error">Nie udało się pobrać danych EasyEDA dla {lcsc}: {error}</Typography>;
  if (!data) return null;

  const sym = data.symbol, fp = data.footprint;
  const symW = sym?.bbox?.width || 100, symH = sym?.bbox?.height || 100;
  const fpW = (fp?.bbox?.width || 40) * 4, fpH = (fp?.bbox?.height || 40) * 4;
  const vb = (w: number, h: number, pad: number) => `${-w / 2 - pad} ${-h / 2 - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  const boxSx = { height: 160, border: '1px solid rgba(0,0,0,0.2)', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const;
  const empty = { color: 'text.disabled', fontSize: 13 };

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Box sx={{ width: 240, maxWidth: '100%' }}>
        <Typography variant="caption" color="text.secondary">Symbol</Typography>
        <Box sx={{ ...boxSx, bgcolor: '#fff' }}>
          {sym && sym.shapes?.length
            ? <svg width="100%" height="100%" viewBox={vb(symW, symH, Math.max(40, Math.max(symW, symH) * 0.3))} preserveAspectRatio="xMidYMid meet">{renderEasyEdaSymbol(sym)}</svg>
            : <Box sx={empty}>brak symbolu</Box>}
        </Box>
      </Box>
      <Box sx={{ width: 240, maxWidth: '100%' }}>
        <Typography variant="caption" color="text.secondary">Footprint</Typography>
        <Box sx={{ ...boxSx, bgcolor: '#111' }}>
          {fp && fp.shapes?.length
            ? <svg width="100%" height="100%" viewBox={vb(fpW, fpH, 30)} preserveAspectRatio="xMidYMid meet">{renderFootprint(fp)}</svg>
            : <Box sx={empty}>brak footprintu</Box>}
        </Box>
      </Box>
    </Box>
  );
}

// ── Klon EasyEDA STD ──────────────────────────────────────────────────────────
export function PcbView() {
  const [editor, setEditor] = useState<Editor>('schematic');
  const [activeTool, setActiveTool] = useState('');
  const [symbols, setSymbols] = useState<SymbolTab[]>([]);
  const [activeSymbolId, setActiveSymbolId] = useState<string | null>(null);
  const [symbolEls, setSymbolEls] = useState<Record<string, El[]>>({});
  const [symbolMeta, setSymbolMeta] = useState<Record<string, SymMeta>>({});
  const [symWork, setSymWork] = useState<SymWork>(emptySymWork());
  const updSymWork = (patch: Partial<SymWork>) => setSymWork((s) => ({ ...s, ...patch }));
  const symSeq = useRef(0);
  // Arkusze (Sheets): wiele arkuszy w projekcie. Każdy ma własne rysunki (sheetEls) i
  // umieszczone komponenty (sheetPlaced). Aktywny arkusz jest edytowany na canvasie.
  const [sheets, setSheets] = useState<SheetTab[]>([{ id: 'sheet1', name: 'Sheet_1', desc: '' }]);
  const [activeSheetId, setActiveSheetId] = useState('sheet1');
  const [sheetEls, setSheetEls] = useState<Record<string, El[]>>({ sheet1: [] });
  const [sheetPlaced, setSheetPlaced] = useState<Record<string, PlacedComp[]>>({ sheet1: [] });
  const sheetSeq = useRef(1);
  const activeSheet = sheets.find((s) => s.id === activeSheetId) ?? sheets[0];
  const sheetName = activeSheet?.name ?? 'Sheet_1';
  const schematicEls = sheetEls[activeSheetId] ?? [];
  const setSchematicEls = (u: El[] | ((p: El[]) => El[])) => setSheetEls((m) => { const prev = m[activeSheetId] ?? []; return { ...m, [activeSheetId]: typeof u === 'function' ? (u as (p: El[]) => El[])(prev) : u }; });
  const [schWork, setSchWork] = useState<SymWork>(emptySymWork());
  const updSchWork = (patch: Partial<SymWork>) => setSchWork((s) => ({ ...s, ...patch }));
  const [schOrigin, setSchOrigin] = useState<Pt>({ x: 0, y: 0 });
  const [selPlaced, setSelPlaced] = useState<number | null>(null);
  const [selPlacedIdxs, setSelPlacedIdxs] = useState<number[]>([]); // multi-selekcja komponentów (marquee)
  const [placedMove, setPlacedMove] = useState<{ idx: number; dx: number; dy: number } | null>(null); // podgląd przeciągania komponentu
  const [selectedPart, setSelectedPart] = useState<'body' | 'text'>('body'); // sub-selekcja tekstu symbolu sieciowego
  // Footprinty
  const [footprints, setFootprints] = useState<SymbolTab[]>([]);
  const [activeFootprintId, setActiveFootprintId] = useState<string | null>(null);
  const [footprintEls, setFootprintEls] = useState<Record<string, FpEl[]>>({});
  const [footprintMeta, setFootprintMeta] = useState<Record<string, FpMeta>>({});
  const fpSeq = useRef(0);
  // PCB: własna warstwa elementów (ścieżki/pady/miedź…) rysowana narzędziami footprintu, komponenty jako podkład
  const [pcbEls, setPcbEls] = useState<FpEl[]>([]);
  const [pcbMeta, setPcbMeta] = useState<FpMeta>(emptyFpMeta());
  const updatePcbMeta = (patch: Partial<FpMeta>) => setPcbMeta((s) => ({ ...s, ...patch }));
  // Warstwy PCB/footprint (kolor + widoczność + aktywna) i widoczność obiektów (zakładka Object)
  const [layers, setLayers] = useState<LayerState>(defaultLayers());
  const [activeLayer, setActiveLayer] = useState('Górna warstwa');
  const [objVis, setObjVis] = useState<Record<string, boolean>>({});
  const setLayerColor = (name: string, color: string) => setLayers((s) => ({ ...s, [name]: { ...(s[name] ?? { visible: true }), color } }));
  const toggleLayer = (name: string) => setLayers((s) => ({ ...s, [name]: { ...(s[name] ?? { color: '#888' }), visible: !(s[name]?.visible ?? true) } }));
  const toggleObj = (cat: string) => { if (cat === '__all__') { const all = OBJECT_CATS.every((c) => objVis[c] !== false); setObjVis(Object.fromEntries(OBJECT_CATS.map((c) => [c, !all]))); } else setObjVis((s) => ({ ...s, [cat]: s[cat] === false })); };

  // Widok (pan/zoom) osobny dla każdego edytora + początek układu symbolu
  const [views, setViews] = useState<Record<Editor, View>>({ schematic: { x: 0, y: 0, zoom: 1 }, pcb: { x: 0, y: 0, zoom: 1 }, symbol: { x: 400, y: 300, zoom: 1 }, footprint: { x: 400, y: 300, zoom: 1 } });
  const view = views[editor];
  const setView: SetView = (u) => setViews((vs) => ({ ...vs, [editor]: u(vs[editor]) }));
  const [symOrigin, setSymOrigin] = useState<Pt>({ x: 0, y: 0 });

  // Pomiar obszaru canvasu → linijki znają swoją długość
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const originAxisX = editor === 'symbol' ? symOrigin.x : editor === 'schematic' ? schOrigin.x : 0;
  const originAxisY = editor === 'symbol' ? symOrigin.y : editor === 'schematic' ? schOrigin.y : 0;

  // Schemat: komponenty umieszczone (per aktywny arkusz), tryb stawiania, siatka/przyciąganie
  const placed = sheetPlaced[activeSheetId] ?? [];
  const setPlaced = (u: PlacedComp[] | ((p: PlacedComp[]) => PlacedComp[])) => setSheetPlaced((m) => { const prev = m[activeSheetId] ?? []; return { ...m, [activeSheetId]: typeof u === 'function' ? (u as (p: PlacedComp[]) => PlacedComp[])(prev) : u }; });
  const allPlaced = sheets.flatMap((s) => sheetPlaced[s.id] ?? []); // wszystkie komponenty projektu (podkład PCB)
  const [placing, setPlacing] = useState<PlacedComp | null>(null);
  const [refSeq, setRefSeq] = useState<Record<string, number>>({});
  const [gridSize, setGridSize] = useState(10);
  const [snapSize, setSnapSize] = useState(10);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [gridSub, setGridSub] = useState<null | HTMLElement>(null);
  const [snapSub, setSnapSub] = useState<null | HTMLElement>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  // Panel Workspace (drzewo projektu): nazwy dokumentów, rozwinięcie, filtr, menu kontekstowe
  const [projectName, setProjectName] = useState('test1');
  const [pcbName, setPcbName] = useState('PCB_test1');
  const [treeExp, setTreeExp] = useState<TreeExp>({ user: true, project: true });
  const [treeFilter, setTreeFilter] = useState('');
  const [treeCtx, setTreeCtx] = useState<{ x: number; y: number; kind: 'project' | 'doc'; ref?: DocRef } | null>(null);
  const [tabCtx, setTabCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  const [mgrSub, setMgrSub] = useState<null | HTMLElement>(null);
  const [verSub, setVerSub] = useState<null | HTMLElement>(null);
  const [colSub, setColSub] = useState<null | HTMLElement>(null);
  const [snack, setSnack] = useState<string | null>(null);
  // Dialogi dokumentu: Modyfikuj / Klonuj / Historia — z docelowym dokumentem (DocRef)
  const [modifyRef, setModifyRef] = useState<DocRef | null>(null);
  const [cloneRef, setCloneRef] = useState<DocRef | null>(null);
  const [histRef, setHistRef] = useState<DocRef | null>(null);
  // Dialogi toolbaru: Znajdź / Find Similar / Adnotacja + zapis projektu na serwer
  const [findOpen, setFindOpen] = useState(false);
  const [findSimOpen, setFindSimOpen] = useState(false);
  const [annotOpen, setAnnotOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openProjOpen, setOpenProjOpen] = useState(false);
  const [newPcbOpen, setNewPcbOpen] = useState(false);
  const [board3dOpen, setBoard3dOpen] = useState(false);
  const [myElementsOpen, setMyElementsOpen] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const [pcbCopper, setPcbCopper] = useState(2);
  const layerNames = layerDefsFor(pcbCopper).map((d) => d.name); // z warstwami Inner przy >2 warstwach miedzi
  const findCursor = useRef(0);
  const toast = (msg: string) => setSnack(msg);
  const placeSeq = useRef(0);
  const snapshotRef = useRef<() => void>(() => { });
  const placedSnapshotRef = useRef<() => void>(() => { }); // osobna migawka warstwy komponentów (undo stawiania/usuwania)
  // Panele boczne: pokazywanie/ukrywanie + szerokość (splitter)
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [leftW, setLeftW] = useState(240);
  const [rightW, setRightW] = useState(300);
  // Panel „Layers and Objects" jest zadokowany w prawym panelu w zakładce obok
  // Properties (na wszystkich rozmiarach ekranu; nie pływa nad canvasem).
  const [rightTab, setRightTab] = useState<'layers' | 'props'>('props');

  const snapTo = (v: number) => Math.round(v / snapSize) * snapSize;
  const zoomAround = (factor: number) => setView((v) => {
    const cx = size.w / 2, cy = size.h / 2;
    const z = Math.min(20, Math.max(0.1, v.zoom * factor));
    const wx = (cx - v.x) / v.zoom, wy = (cy - v.y) / v.zoom;
    return { x: cx - wx * z, y: cy - wy * z, zoom: z };
  });
  const fitToWindow = () => setView(() => {
    if (!size.w || !size.h) return { x: 0, y: 0, zoom: 1 };
    const bx = 20, by = 60, bw = 1200, bh = 620; // obszar treści schematu
    const z = Math.min(size.w / (bw + 2 * bx), size.h / (bh + 2 * by), 4);
    return { x: (size.w - bw * z) / 2 - bx * z, y: (size.h - bh * z) / 2 - by * z, zoom: z };
  });
  const startPlacing = (r: PickResult) => {
    const def = LIB_BY_ID[r.defId];
    const prefix = (r.refPrefix || (r.octopart ? 'U' : def?.refPrefix) || 'U').replace(/\?.*$/, '') || 'U';
    const n = (refSeq[prefix] ?? 0) + 1;
    setRefSeq((m) => ({ ...m, [prefix]: n }));
    placeSeq.current += 1;
    // Duch startuje na środku widoku, żeby był widoczny i „Osadź tutaj" działało bez przeciągania (mobile)
    const cx = size.w ? snapTo((size.w / 2 - view.x) / view.zoom) : 0, cy = size.h ? snapTo((size.h / 2 - view.y) / view.zoom) : 0;
    setPlacing({ id: `pc_${placeSeq.current}`, defId: r.defId, x: cx, y: cy, ref: `${prefix}${n}`, label: r.label, pins: r.pins, octopart: r.octopart, easyeda: r.easyeda, fp: r.fp, savedEls: r.savedEls, fpEls: r.fpEls,
      layer: 'Górna warstwa', rotation: 0, showPrefix: 'Tak', showName: 'Tak', addToBom: 'Tak', locked: 'Nie', convertToPcb: 'Tak', displayFootprint: 'Nie',
      footprint: r.footprint || r.defId, supplier: r.supplier || (r.lcsc ? 'LCSC' : 'Nieznany'), supplierPart: r.lcsc || '', manufacturer: r.manufacturer || '', mfrPart: r.mfrPart || r.label, jlcpcb: '', link: '', model3d: r.footprint || '' });
  };
  const placeAt = (p: { x: number; y: number }) => {
    if (!placing) return;
    placedSnapshotRef.current();
    // pcbX/pcbY inicjalizujemy tą samą pozycją co symbol — od tej chwili footprint (PCB) i symbol (schemat) ruszają się niezależnie.
    setPlaced((arr) => [...arr, { ...placing, x: snapTo(p.x), y: snapTo(p.y), pcbX: snapTo(p.x), pcbY: snapTo(p.y) }]);
    setPlacing(null); // jednorazowe postawienie
  };
  const moveGhost = (p: { x: number; y: number }) => { if (placing) setPlacing((c) => (c ? { ...c, x: snapTo(p.x), y: snapTo(p.y) } : c)); };
  // Wstaw element z „Moje elementy" jako komponent — startuje ducha do osadzenia na aktywnym arkuszu/PCB.
  const insertMyElement = async (el: MyElement) => {
    const valueLabel = el.value
      ? `${el.value}${el.valueUnit && el.valueUnit !== '—' ? ' ' + el.valueUnit : ''}`
      : (el.name || 'U');
    const code = (el.lcsc || '').trim();
    // Element z LCSC → pobierz prawdziwy symbol + footprint z EasyEDA (pady na warstwach).
    if (code) {
      try {
        const r = await fetch(`/api/easyeda/component/${encodeURIComponent(code)}`);
        if (r.ok) {
          const d = await r.json();
          const easyeda = d.symbol || d.sym;
          const fp = d.footprint || d.fp;
          if (easyeda || fp) {
            startPlacing({
              defId: 'easyeda', label: valueLabel, pins: 0,
              easyeda, fp, refPrefix: d.prefix,
              lcsc: code, supplier: 'LCSC',
              manufacturer: '', mfrPart: el.mpn || undefined,
              footprint: el.packageType || undefined,
            });
            return;
          }
        }
      } catch { /* brak sieci / brak części → fallback poniżej */ }
    }
    // Fallback: generyczny symbol schematu wg typu (bez footprintu EasyEDA).
    const t = (el.componentType || '').toLowerCase();
    const map =
      /resistor|potentiom|thermistor|varistor|rezystor/.test(t) ? { defId: 'R', refPrefix: 'R', pins: 2 }
      : /capacitor|kondensator/.test(t) ? { defId: 'C', refPrefix: 'C', pins: 2 }
      : /inductor|ferrite|choke|cewka|dławik/.test(t) ? { defId: 'L', refPrefix: 'L', pins: 2 }
      : /\bled\b/.test(t) ? { defId: 'LED', refPrefix: 'D', pins: 2 }
      : /diode|bridge|dioda/.test(t) ? { defId: 'D', refPrefix: 'D', pins: 2 }
      : /transistor|mosfet|jfet|igbt|tranzystor/.test(t) ? { defId: 'Q', refPrefix: 'Q', pins: 3 }
      : /connector|header|złącze|goldpin/.test(t) ? { defId: 'J1x4', refPrefix: 'J', pins: 4 }
      : { defId: 'U8', refPrefix: 'U', pins: 8 };
    startPlacing({
      defId: map.defId, refPrefix: map.refPrefix, pins: map.pins, label: valueLabel,
      footprint: el.packageType || undefined,
      lcsc: code || undefined,
      supplier: code ? 'LCSC' : undefined,
      mfrPart: el.mpn || undefined,
    });
  };
  // Przesunięcie komponentu z warstwy „placed" po indeksie w allPlaced (na PCB) → aktualizuje właściwy arkusz
  const moveAllPlaced = (idx: number, dx: number, dy: number) => {
    const comp = allPlaced[idx]; if (!comp) return;
    const sid = sheets.find((s) => (sheetPlaced[s.id] ?? []).some((c) => c.id === comp.id))?.id;
    if (!sid) return;
    snapshotColl('schematic', `pl:${sid}`);
    // Na PCB przesuwamy tylko pozycję footprintu (pcbX/pcbY) — pozycja symbolu na schemacie (x/y) bez zmian.
    setSheetPlaced((m) => ({ ...m, [sid]: (m[sid] ?? []).map((c) => (c.id === comp.id ? { ...c, pcbX: (c.pcbX ?? c.x) + dx, pcbY: (c.pcbY ?? c.y) + dy } : c)) }));
  };
  // Przesunięcie wielu komponentów (multi-selekcja marquee) — po indeksach w allPlaced/placed
  const moveManyPlaced = (idxs: number[], dx: number, dy: number, src: PlacedComp[]) => {
    const ids = new Set(idxs.map((i) => src[i]?.id).filter(Boolean));
    if (!ids.size) return;
    const sids = sheets.filter((s) => (sheetPlaced[s.id] ?? []).some((c) => ids.has(c.id))).map((s) => s.id);
    sids.forEach((sid) => snapshotColl('schematic', `pl:${sid}`));
    setSheetPlaced((m) => { const n = { ...m }; sids.forEach((sid) => { n[sid] = (m[sid] ?? []).map((c) => (ids.has(c.id) ? { ...c, pcbX: (c.pcbX ?? c.x) + dx, pcbY: (c.pcbY ?? c.y) + dy } : c)); }); return n; });
  };
  // Edycja właściwości zaznaczonego komponentu (panel Właściwości Komponentu na PCB)
  const selectedPlacedComp: PlacedComp | null = selPlaced == null ? null : editor === 'pcb' ? (allPlaced[selPlaced] ?? null) : editor === 'schematic' ? (placed[selPlaced] ?? null) : null;
  const updatePlacedComp = (patch: Partial<PlacedComp>) => {
    const comp = selectedPlacedComp; if (!comp) return;
    const sid = sheets.find((s) => (sheetPlaced[s.id] ?? []).some((c) => c.id === comp.id))?.id; if (!sid) return;
    setSheetPlaced((m) => ({ ...m, [sid]: (m[sid] ?? []).map((c) => (c.id === comp.id ? { ...c, ...patch } : c)) }));
  };

  // Żywe współrzędne myszy (wspólne dla wszystkich canvasów) + zaznaczenie pinu
  const [mousePos, setMousePos] = useState<Pt | null>(null);
  const [mouseDelta, setMouseDelta] = useState<Pt>({ x: 0, y: 0 });
  const prevMouse = useRef<Pt | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<number[]>([]); // multi-selekcja (Shift+klik / prostokąt) — do wyrównywania i edycji wspólnych właściwości
  const [marqueeMode, setMarqueeMode] = useState(false); // tryb zaznaczania prostokątem (przycisk, głównie mobile)
  // Aktualizacja współrzędnych myszy dławiona do 1×/klatkę (bez tego każdy ruch
  // przerysowuje całe płótno → zacinanie i utrudnione zaznaczanie).
  const mouseRaf = useRef<number | null>(null);
  const pendingMouse = useRef<Pt | null>(null);
  const onCanvasMouse = (p: Pt) => {
    moveGhost(p);
    pendingMouse.current = p;
    if (mouseRaf.current != null) return;
    mouseRaf.current = requestAnimationFrame(() => {
      mouseRaf.current = null;
      const cur = pendingMouse.current; if (!cur) return;
      const prev = prevMouse.current;
      if (prev) setMouseDelta({ x: cur.x - prev.x, y: cur.y - prev.y });
      prevMouse.current = cur;
      setMousePos(cur);
    });
  };
  useEffect(() => { setSelectedIdx(null); setSelectedIdxs([]); setSelPlaced(null); setSelPlacedIdxs([]); setSelectedPart('body'); }, [activeSymbolId, activeSheetId, editor]);
  useEffect(() => { if (activeTool !== '') { setSelectedIdx(null); setSelectedIdxs([]); setSelPlaced(null); setSelPlacedIdxs([]); setSelectedPart('body'); } }, [activeTool]);
  // Zunifikowane zaznaczanie elementu (Shift+klik = dołącz/odłącz do multi-selekcji)
  const selectEl = (i: number | null, part: 'body' | 'text' = 'body', additive = false) => {
    if (i == null) { if (!additive) { setSelectedIdx(null); setSelectedIdxs([]); setSelPlaced(null); setSelPlacedIdxs([]); } return; }
    setSelectedPart(part); setSelPlaced(null); setSelPlacedIdxs([]);
    if (additive) { setSelectedIdxs((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])); setSelectedIdx(i); }
    else { setSelectedIdx(i); setSelectedIdxs([i]); }
  };
  // Zaznaczenie grupowe prostokątem (marquee) → multi-selekcja elementów rysunkowych
  const onSelectManyIdx = (idxs: number[]) => { setSelectedIdxs(idxs); setSelectedIdx(idxs.length ? idxs[idxs.length - 1] : null); setSelPlaced(null); setSelPlacedIdxs([]); setSelectedPart('body'); };
  // Marquee → multi-selekcja umieszczonych komponentów (symbole/footprinty)
  const onSelectManyPlaced = (idxs: number[]) => { setSelPlacedIdxs(idxs); setSelPlaced(idxs.length ? idxs[0] : null); };

  const activeEls = activeSymbolId ? (symbolEls[activeSymbolId] ?? []) : [];
  const selectedEl: El | null = selectedIdx != null ? (activeEls[selectedIdx] ?? null) : null;
  // Zaznaczony rysunek arkusza + jego edycja (analogicznie do edytora symbolu)
  const selectedSchEl: El | null = editor === 'schematic' && selectedIdx != null ? (schematicEls[selectedIdx] ?? null) : null;
  const updateSchEl = (patch: Record<string, unknown>) => {
    if (selectedIdx == null) return;
    setSchematicEls((arr) => { const a = [...arr]; const el = a[selectedIdx]; if (!el) return arr; a[selectedIdx] = { ...(el as unknown as Record<string, unknown>), ...patch } as unknown as El; return a; });
  };
  const updateEl = (patch: Record<string, unknown>) => {
    if (selectedIdx == null || !activeSymbolId) return;
    setSymbolEls((m) => { const arr = [...(m[activeSymbolId] ?? [])]; const el = arr[selectedIdx]; if (!el) return m; arr[selectedIdx] = { ...(el as Record<string, unknown>), ...patch } as unknown as El; return { ...m, [activeSymbolId]: arr }; });
  };

  // Zapis symbolu do współdzielonej biblioteki (backend, widoczne dla wszystkich projektów)
  const [saveOpen, setSaveOpen] = useState(false);
  const saveSymbol = async (meta: SymbolMeta) => {
    const elements = activeSymbolId ? (symbolEls[activeSymbolId] ?? []) : [];
    const res = await fetch('/api/symbols', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...meta, elements }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
  };
  const [fpSaveOpen, setFpSaveOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [docSettings, setDocSettings] = useState<DocSettings>(emptyDoc());
  const saveFootprint = async (meta: FpSaveMeta) => {
    const elements = activeFootprintId ? (footprintEls[activeFootprintId] ?? []) : [];
    const res = await fetch('/api/footprints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...meta, elements }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
  };

  // Współrzędne myszy w konwencji linijek (oś Y do góry; footprint w mm: 1 jedn = 1 mil)
  const fmtMouse = (v: number) => (editor === 'footprint' || editor === 'pcb' ? `${(v * W2MM).toFixed(3)}mm` : String(Math.round(v)));
  const mRows: [string, string][] = mousePos
    ? [['Mysz-X', fmtMouse(mousePos.x - originAxisX)], ['Mysz-Y', fmtMouse(originAxisY - mousePos.y)], ['Mysz-DX', fmtMouse(mouseDelta.x)], ['Mysz-DY', fmtMouse(-mouseDelta.y)]]
    : [['Mysz-X', '—'], ['Mysz-Y', '—'], ['Mysz-DX', '—'], ['Mysz-DY', '—']];

  // Esc anuluje stawianie
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  const activeSymbol = symbols.find((s) => s.id === activeSymbolId) || null;
  const activeFootprint = footprints.find((s) => s.id === activeFootprintId) || null;
  const currentName = editor === 'pcb' ? `*${pcbName}` : editor === 'symbol' ? (activeSymbol?.name ?? '*New_Symbol') : editor === 'footprint' ? (activeFootprint?.name ?? '*NEW_FOOTPRINT') : sheetName;
  useRegisterFileOps('pcb', { currentName }, [currentName]);

  // ── Akcje panelu Workspace (drzewo projektu) ──
  const closeTreeMenus = () => { setTreeCtx(null); setMgrSub(null); setVerSub(null); setColSub(null); };
  const refName = (r: DocRef) => (r.kind === 'pcb' ? pcbName : sheets.find((s) => s.id === r.id)?.name ?? '');
  const openDoc = (r: DocRef) => { if (r.kind === 'sheet') setActiveSheetId(r.id); setEditor(r.kind === 'pcb' ? 'pcb' : 'schematic'); setSelectedIdx(null); setSelPlaced(null); };
  // ── Zarządzanie arkuszami ──
  const switchSheet = (id: string) => { setActiveSheetId(id); setEditor('schematic'); setSelectedIdx(null); setSelPlaced(null); };
  const addSheet = () => { sheetSeq.current += 1; const id = `sheet${sheetSeq.current}`; const name = `Sheet_${sheetSeq.current}`; setSheets((s) => [...s, { id, name, desc: '' }]); setSheetEls((m) => ({ ...m, [id]: [] })); setSheetPlaced((m) => ({ ...m, [id]: [] })); setActiveSheetId(id); setEditor('schematic'); };
  const renameSheet = (id: string, name: string, desc?: string) => setSheets((s) => s.map((x) => (x.id === id ? { ...x, name, desc: desc ?? x.desc } : x)));
  const deleteSheet = (id: string) => {
    if (sheets.length <= 1) { toast('Nie można usunąć jedynego arkusza'); return; }
    if (!window.confirm(`Usunąć arkusz „${sheets.find((s) => s.id === id)?.name}"?`)) return;
    const rest = sheets.filter((x) => x.id !== id);
    setSheets(rest); setSheetEls((m) => { const n = { ...m }; delete n[id]; return n; }); setSheetPlaced((m) => { const n = { ...m }; delete n[id]; return n; });
    if (activeSheetId === id) setActiveSheetId(rest[0].id);
    toast('Arkusz usunięty');
  };
  const cloneSheet = (id: string, title: string) => {
    sheetSeq.current += 1; const nid = `sheet${sheetSeq.current}`;
    setSheets((s) => { const idx = s.findIndex((x) => x.id === id); const n = [...s]; n.splice(idx + 1, 0, { id: nid, name: title, desc: '' }); return n; });
    setSheetEls((m) => ({ ...m, [nid]: JSON.parse(JSON.stringify(m[id] ?? [])) }));
    setSheetPlaced((m) => ({ ...m, [nid]: JSON.parse(JSON.stringify(m[id] ?? [])) }));
    setActiveSheetId(nid); setEditor('schematic'); toast(`Sklonowano do „${title}"`);
  };
  const moveSheet = (id: string, dir: -1 | 1) => setSheets((s) => { const i = s.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= s.length) return s; const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  // Dialogi Modyfikuj / Klonuj — zapis
  const applyModify = (title: string, desc: string) => { if (!modifyRef) return; if (modifyRef.kind === 'pcb') setPcbName(title); else renameSheet(modifyRef.id, title, desc); toast('Zapisano informacje o pliku'); };
  const applyClone = (title: string) => { if (!cloneRef) return; if (cloneRef.kind === 'pcb') toast(`Sklonowano „${title}"`); else cloneSheet(cloneRef.id, title); };
  const cloneDefaultTitle = (r: DocRef | null) => (r ? `${refName(r)}_kopia` : 'Sheet');
  const deleteDoc = (r: DocRef) => {
    if (r.kind === 'sheet') { deleteSheet(r.id); return; }
    if (!window.confirm(`Usunąć zawartość dokumentu „${pcbName}"?`)) return;
    snapshotColl('pcb', 'pcb'); setPcbEls([]); setSelectedIdx(null); setSelPlaced(null); toast('Usunięto zawartość dokumentu');
  };
  const exportProject = () => {
    const data = { project: projectName, sheets: sheets.map((s) => ({ name: s.name, desc: s.desc, elements: sheetEls[s.id] ?? [], placed: sheetPlaced[s.id] ?? [] })), pcb: { name: pcbName, elements: pcbEls }, symbols: symbols.map((s) => ({ ...s, elements: symbolEls[s.id] ?? [] })), footprints: footprints.map((s) => ({ ...s, elements: footprintEls[s.id] ?? [] })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${projectName}.eprj.json`; a.click(); URL.revokeObjectURL(a.href);
    toast('Projekt wyeksportowany');
  };
  const renameProject = () => { const v = window.prompt('Nazwa projektu:', projectName); if (v && v.trim()) { setProjectName(v.trim()); toast('Zmieniono nazwę projektu'); } };

  // Plik → Nowy → Symbol: dodaje NOWĄ zakładkę
  const addSymbol = () => {
    symSeq.current += 1;
    const n = symbols.length + 1;
    const id = `sym_${Date.now().toString(36)}_${symSeq.current}`;
    const name = n === 1 ? '*New_Symbol' : `*New_Symbol${n}`;
    setSymbols((s) => [...s, { id, name }]);
    setSymbolEls((m) => ({ ...m, [id]: [] }));
    setSymbolMeta((m) => ({ ...m, [id]: emptySymMeta() }));
    setActiveSymbolId(id);
    setEditor('symbol');
    setActiveTool('');
  };
  const selectSymbol = (id: string) => { setActiveSymbolId(id); setEditor('symbol'); };
  const closeSymbol = (id: string) => {
    setSymbols((s) => {
      const next = s.filter((x) => x.id !== id);
      if (activeSymbolId === id) { if (next.length) { setActiveSymbolId(next[next.length - 1].id); } else { setActiveSymbolId(null); setEditor('schematic'); } }
      return next;
    });
    setSymbolEls((m) => { const { [id]: _drop, ...rest } = m; return rest; });
  };
  const symMeta = activeSymbolId ? (symbolMeta[activeSymbolId] ?? emptySymMeta()) : emptySymMeta();
  const updateSymMeta = (patch: Partial<SymMeta>) => { if (activeSymbolId) setSymbolMeta((m) => ({ ...m, [activeSymbolId]: { ...(m[activeSymbolId] ?? emptySymMeta()), ...patch } })); };

  // Plik → Nowy → Footprint
  const addFootprint = () => {
    fpSeq.current += 1;
    const n = footprints.length + 1;
    const id = `fp_${Date.now().toString(36)}_${fpSeq.current}`;
    const name = n === 1 ? '*NEW_FOOTPRINT' : `*NEW_FOOTPRINT${n}`;
    setFootprints((s) => [...s, { id, name }]);
    setFootprintEls((m) => ({ ...m, [id]: [] }));
    setFootprintMeta((m) => ({ ...m, [id]: emptyFpMeta() }));
    setActiveFootprintId(id);
    setEditor('footprint');
    setActiveTool('');
  };
  const selectFootprint = (id: string) => { setActiveFootprintId(id); setEditor('footprint'); };
  const closeFootprint = (id: string) => {
    setFootprints((s) => {
      const next = s.filter((x) => x.id !== id);
      if (activeFootprintId === id) { if (next.length) { setActiveFootprintId(next[next.length - 1].id); } else { setActiveFootprintId(null); setEditor('schematic'); } }
      return next;
    });
    setFootprintEls((m) => { const { [id]: _drop, ...rest } = m; return rest; });
  };
  // Import → nowa zakładka symbolu/footprintu z wczytanymi elementami
  const [importOpen, setImportOpen] = useState(false);
  const importSymbol = (name: string, els: El[], footprint?: string) => {
    symSeq.current += 1; const id = `sym_${Date.now().toString(36)}_${symSeq.current}`;
    setSymbols((s) => [...s, { id, name: `*${name || 'Imported'}` }]);
    setSymbolEls((m) => ({ ...m, [id]: els })); setSymbolMeta((m) => ({ ...m, [id]: { ...emptySymMeta(), name, footprint: footprint || '' } }));
    setActiveSymbolId(id); setEditor('symbol'); setActiveTool('');
  };
  const importFootprint = (name: string, els: FpEl[], symbol?: string) => {
    fpSeq.current += 1; const id = `fp_${Date.now().toString(36)}_${fpSeq.current}`;
    setFootprints((s) => [...s, { id, name: `*${name || 'Imported'}` }]);
    setFootprintEls((m) => ({ ...m, [id]: els })); setFootprintMeta((m) => ({ ...m, [id]: { ...emptyFpMeta(), footprint: name, symbol: symbol || '' } }));
    setActiveFootprintId(id); setEditor('footprint'); setActiveTool('');
  };
  const activeFpEls = activeFootprintId ? (footprintEls[activeFootprintId] ?? []) : [];
  const fpMeta = activeFootprintId ? (footprintMeta[activeFootprintId] ?? emptyFpMeta()) : emptyFpMeta();
  const updateFpMeta = (patch: Partial<FpMeta>) => { if (activeFootprintId) setFootprintMeta((m) => ({ ...m, [activeFootprintId]: { ...(m[activeFootprintId] ?? emptyFpMeta()), ...patch } })); };
  const selectedFpEl: FpEl | null = selectedIdx == null ? null : editor === 'footprint' ? (activeFpEls[selectedIdx] ?? null) : editor === 'pcb' ? (pcbEls[selectedIdx] ?? null) : null;
  const updateFpEl = (patch: Record<string, unknown>) => {
    if (selectedIdx == null) return;
    const apply = (arr: FpEl[]): FpEl[] => { const a = [...arr]; const el = a[selectedIdx]; if (!el) return arr; a[selectedIdx] = { ...(el as unknown as Record<string, unknown>), ...patch } as unknown as FpEl; return a; };
    if (editor === 'footprint' && activeFootprintId) setFootprintEls((m) => ({ ...m, [activeFootprintId]: apply(m[activeFootprintId] ?? []) }));
    else if (editor === 'pcb') setPcbEls(apply);
  };

  // ── Historia (undo/redo) + schowek (cut/copy/paste) ──────────────────────────
  type Snap = { editor: Editor; key: string; data: unknown[]; time: string; by: string };
  const [undoStack, setUndoStack] = useState<Snap[]>([]);
  const [redoStack, setRedoStack] = useState<Snap[]>([]);
  const [clip, setClip] = useState<{ editor: Editor; els?: unknown[]; placed?: PlacedComp[] } | null>(null);
  // Arkusz: klucz 'sh:<id>' → rysunki arkusza; 'pl:<id>' → komponenty arkusza (undo per-arkusz)
  const schKey = `sh:${activeSheetId}`, plKey = `pl:${activeSheetId}`;
  const ctxKey = editor === 'symbol' ? (activeSymbolId ?? '') : editor === 'footprint' ? (activeFootprintId ?? '') : editor === 'pcb' ? 'pcb' : schKey;
  const canEditColl = editor === 'schematic' || editor === 'pcb' || (editor === 'symbol' && !!activeSymbolId) || (editor === 'footprint' && !!activeFootprintId);
  const getColl = (ed: Editor, key: string): unknown[] => (ed === 'symbol' ? (symbolEls[key] ?? []) : ed === 'footprint' ? (footprintEls[key] ?? []) : ed === 'pcb' ? pcbEls : key.startsWith('pl:') ? (sheetPlaced[key.slice(3)] ?? []) : key.startsWith('sh:') ? (sheetEls[key.slice(3)] ?? []) : schematicEls);
  const setColl = (ed: Editor, key: string, data: unknown[]) => { if (ed === 'symbol') setSymbolEls((m) => ({ ...m, [key]: data as El[] })); else if (ed === 'footprint') setFootprintEls((m) => ({ ...m, [key]: data as FpEl[] })); else if (ed === 'pcb') setPcbEls(data as FpEl[]); else if (key.startsWith('pl:')) setSheetPlaced((m) => ({ ...m, [key.slice(3)]: data as PlacedComp[] })); else if (key.startsWith('sh:')) setSheetEls((m) => ({ ...m, [key.slice(3)]: data as El[] })); else setSchematicEls(data as El[]); };
  const nowStr = () => { const p = (n: number) => String(n).padStart(2, '0'); const d = new Date(); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const snapshotColl = (ed: Editor, key: string) => { setUndoStack((s) => [...s.slice(-49), { editor: ed, key, data: [...getColl(ed, key)], time: nowStr(), by: 'mhersztowski' }]); setRedoStack([]); };
  const snapshot = () => { if (!canEditColl) return; snapshotColl(editor, ctxKey); };
  snapshotRef.current = snapshot;
  placedSnapshotRef.current = () => snapshotColl('schematic', plKey);
  const undo = () => { if (!undoStack.length) return; const sn = undoStack[undoStack.length - 1]; const cur: Snap = { editor: sn.editor, key: sn.key, data: [...getColl(sn.editor, sn.key)], time: nowStr(), by: 'mhersztowski' }; setUndoStack((s) => s.slice(0, -1)); setRedoStack((r) => [...r, cur]); setColl(sn.editor, sn.key, sn.data); setSelectedIdx(null); setSelPlaced(null); };
  const redo = () => { if (!redoStack.length) return; const sn = redoStack[redoStack.length - 1]; const cur: Snap = { editor: sn.editor, key: sn.key, data: [...getColl(sn.editor, sn.key)], time: nowStr(), by: 'mhersztowski' }; setRedoStack((r) => r.slice(0, -1)); setUndoStack((s) => [...s, cur]); setColl(sn.editor, sn.key, sn.data); setSelectedIdx(null); setSelPlaced(null); };
  const restoreSnap = (sn: Snap) => { setColl(sn.editor, sn.key, sn.data); setSelectedIdx(null); setSelPlaced(null); toast('Odtworzono zapis historii'); };
  const selColl = getColl(editor, ctxKey);
  // Indeksy zaznaczonych komponentów (marquee lub pojedynczy klik) — do highlightu/przenoszenia/usuwania grupowego
  const placedSrc = editor === 'pcb' ? allPlaced : placed;
  const selPlacedAll = selPlacedIdxs.length ? selPlacedIdxs : (selPlaced != null ? [selPlaced] : []);
  const placedDrag = placedMove ? (selPlacedAll.includes(placedMove.idx) ? selPlacedAll : [placedMove.idx]) : [];
  const hasElSel = selectedIdx != null && selectedIdx < selColl.length && canEditColl;
  const hasPlacedSel = !!selectedPlacedComp || selPlacedIdxs.length > 0; // zaznaczony komponent(y) (sheet lub PCB)
  const hasSel = hasElSel || hasPlacedSel;
  const hasClip = !!clip && clip.editor === editor && canEditColl;
  const deleteSelected = () => {
    let did = false;
    // Komponenty (placed) — usuń wszystkie zaznaczone po id (z arkuszy, w których leżą)
    if (selPlacedAll.length) {
      const ids = new Set(selPlacedAll.map((i) => placedSrc[i]?.id).filter(Boolean));
      const sids = sheets.filter((s) => (sheetPlaced[s.id] ?? []).some((c) => ids.has(c.id))).map((s) => s.id);
      sids.forEach((sid) => snapshotColl('schematic', `pl:${sid}`));
      setSheetPlaced((m) => { const n = { ...m }; sids.forEach((sid) => { n[sid] = (m[sid] ?? []).filter((c) => !ids.has(c.id)); }); return n; });
      setSelPlaced(null); setSelPlacedIdxs([]); did = true;
    }
    // Elementy rysunkowe — usuń wszystkie zaznaczone
    if (hasElSel) { snapshot(); const del = new Set(selectedIdxs.length ? selectedIdxs : [selectedIdx!]); setColl(editor, ctxKey, selColl.filter((_, i) => !del.has(i))); setSelectedIdx(null); setSelectedIdxs([]); did = true; }
    return did;
  };
  const copySelected = () => {
    const els = (selectedIdxs.length ? selectedIdxs : selectedIdx != null ? [selectedIdx] : []).filter((i) => i < selColl.length).map((i) => JSON.parse(JSON.stringify(selColl[i])));
    const pc = selPlacedAll.map((i) => placedSrc[i]).filter(Boolean).map((c) => JSON.parse(JSON.stringify(c)) as PlacedComp);
    if (!els.length && !pc.length) return;
    setClip({ editor, els: els.length ? els : undefined, placed: pc.length ? pc : undefined });
  };
  const cutSelected = () => { if (!hasSel) return; copySelected(); deleteSelected(); };
  const paste = () => {
    if (!hasClip || !clip) return;
    // Elementy rysunkowe
    if (clip.els && clip.els.length) {
      snapshot(); const base = selColl.length; const cloned = clip.els.map((el) => cloneShifted(el, editor));
      setColl(editor, ctxKey, [...selColl, ...cloned]);
      const newIdxs = cloned.map((_, k) => base + k);
      setSelectedIdxs(newIdxs.length > 1 ? newIdxs : []); setSelectedIdx(newIdxs[newIdxs.length - 1]);
    }
    // Komponenty (placed) — sklonuj z nowym id i przesunięciem, dodaj do bieżącego arkusza
    if (clip.placed && clip.placed.length) {
      snapshotColl('schematic', plKey);
      const cloned = clip.placed.map((c) => ({ ...JSON.parse(JSON.stringify(c)) as PlacedComp, id: newId(), x: c.x + 40, y: c.y + 40 }));
      setPlaced((a) => [...a, ...cloned]);
      setSelPlaced(null); setSelPlacedIdxs([]);
    }
  };
  const isFpEd = editor === 'pcb' || editor === 'footprint';
  const canGroup = isFpEd || editor === 'schematic'; // grupowanie działa w footprint/pcb i na arkuszu
  const groupSel = () => {
    if (!hasElSel || !canGroup) return; const idxs = selectedIdxs.length ? selectedIdxs : [selectedIdx!]; snapshot();
    const set = new Set(idxs);
    const children = idxs.flatMap((i) => { const el = selColl[i] as { t: string; children?: unknown[] }; return el.t === 'group' && el.children ? el.children : [el]; });
    const grp = { t: 'group', children, locked: false, id: newId() };
    const next = [...selColl.filter((_, i) => !set.has(i)), grp];
    setColl(editor, ctxKey, next); setSelectedIdxs([]); setSelectedIdx(next.length - 1);
  };
  const ungroupSel = () => { if (!hasElSel || !canGroup) return; const el = selColl[selectedIdx!] as { t: string; children?: unknown[] }; if (el.t !== 'group' || !el.children) return; snapshot(); setColl(editor, ctxKey, [...selColl.slice(0, selectedIdx!), ...el.children, ...selColl.slice(selectedIdx! + 1)]); setSelectedIdx(null); };
  const isGroupSel = hasElSel && (selColl[selectedIdx!] as { t?: string })?.t === 'group';

  // ── Operacje Format (obrót / odbicie / wyrównanie / rozmieszczenie / kolejność) ──
  const bboxOf = (el: unknown): { x: number; y: number; w: number; h: number } => (editor === 'pcb' || editor === 'footprint' ? elBBoxFp(el as FpEl) : elBBox(el as El));
  const fmtIdxs = () => (selectedIdxs.length ? selectedIdxs : selectedIdx != null ? [selectedIdx] : []);
  const fmtCount = selectedIdxs.length || (selectedIdx != null ? 1 : 0);
  // Edycja wspólnych właściwości zaznaczonej grupy — patch stosowany do wszystkich zaznaczonych
  const updateGroup = (patch: Record<string, unknown>) => { if (selectedIdxs.length < 2) return; snapshot(); const set = new Set(selectedIdxs); setColl(editor, ctxKey, selColl.map((el, i) => (set.has(i) ? { ...(el as Record<string, unknown>), ...patch } : el))); };
  const mapSel = (idxs: number[], fn: (el: unknown) => unknown) => { snapshot(); const set = new Set(idxs); setColl(editor, ctxKey, selColl.map((el, i) => (set.has(i) ? fn(el) : el))); };
  // bbox komponentu (w świecie, bez uwzgl. rotacji — jak render placedBBox/pcbPartBBox)
  const placedBox = (c: PlacedComp) => (editor === 'pcb' ? pcbPartBBox(c) : placedBBox(c));
  // Rotacja wektora o kąt (stopnie), układ SVG (y w dół, dodatni = zgodnie z zegarem)
  const rad = (d: number) => (d * Math.PI) / 180;
  const rotV = (v: Pt, deg: number): Pt => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }; };
  // Render komponentu: translate(x,y)·rotate(rot)·[scale(-1,1) gdy „Dolna warstwa"]·body.
  // Rzeczywisty środek geometryczny w świecie (z uwzgl. rotacji/odbicia) + lokalny offset środka body.
  const bodyGeom = (c: PlacedComp) => {
    const b = placedBox(c); const cl: Pt = { x: b.x + b.w / 2 - c.x, y: b.y + b.h / 2 - c.y };
    const mir = c.layer === 'Dolna warstwa'; const off = rotV(mir ? { x: -cl.x, y: cl.y } : cl, c.rotation || 0);
    return { center: { x: c.x + off.x, y: c.y + off.y } as Pt, cl };
  };
  // Odtwórz zaczepienie tak, by środek geometryczny wypadł w `center` przy zadanej rotacji/odbiciu
  const anchorFor = (center: Pt, rot: number, mir: boolean, cl: Pt): Pt => { const off = rotV(mir ? { x: -cl.x, y: cl.y } : cl, rot); return { x: center.x - off.x, y: center.y - off.y }; };
  // Elementy „glifowe" (GND/VCC/+5V, net, X, tekst) — render rotate(rot) wokół zaczepienia; obracamy je
  // przez obrót zaczepienia + pole `rot` (nie przez geometrię).
  const GLYPH_ROT = new Set(['netflag', 'netlabel', 'netport', 'probe', 'noconnect', 'text']);
  // Lokalny offset środka glifu (niezrotowany bbox) względem zaczepienia
  const glyphCl = (el: unknown): Pt => { const a = el as { x: number; y: number }; const b = bboxOf(el); return { x: b.x + b.w / 2 - a.x, y: b.y + b.h / 2 - a.y }; };
  // Rzeczywisty środek glifu w świecie (z uwzgl. `rot` i `flip`)
  const glyphCenter = (el: unknown): Pt => {
    const a = el as { x: number; y: number }; const cl = glyphCl(el); const f = (el as { flip?: boolean }).flip;
    const ro = rotV(f ? { x: -cl.x, y: cl.y } : cl, (el as { rot?: number }).rot || 0);
    return { x: a.x + ro.x, y: a.y + ro.y };
  };
  // Pivot = środek geometryczny zaznaczenia (kształty: rozpiętość bbox; glify/komponenty: rzeczywisty środek).
  // Dla pojedynczego obiektu pivot = jego środek → obrót/odbicie w miejscu (także gdy już obrócony).
  const unifiedPivot = (idxs: number[], pIdxs: number[]) => {
    const xs: number[] = [], ys: number[] = [];
    idxs.forEach((i) => {
      const el = selColl[i];
      if (GLYPH_ROT.has((el as { t: string }).t)) { const c = glyphCenter(el); xs.push(c.x); ys.push(c.y); }
      else { const b = bboxOf(el); xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); }
    });
    pIdxs.forEach((i) => { const c = placedSrc[i]; if (c) { const ctr = bodyGeom(c).center; xs.push(ctr.x); ys.push(ctr.y); } });
    if (!xs.length) return { x: 0, y: 0 };
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };
  const mapPlaced = (pIdxs: number[], fn: (c: PlacedComp) => PlacedComp) => {
    const ids = new Set(pIdxs.map((i) => placedSrc[i]?.id).filter(Boolean));
    if (!ids.size) return;
    const sids = sheets.filter((s) => (sheetPlaced[s.id] ?? []).some((c) => ids.has(c.id))).map((s) => s.id);
    sids.forEach((sid) => snapshotColl('schematic', `pl:${sid}`));
    setSheetPlaced((m) => { const n = { ...m }; sids.forEach((sid) => { n[sid] = (m[sid] ?? []).map((c) => (ids.has(c.id) ? fn(c) : c)); }); return n; });
  };
  const rotGlyph = (el: unknown, pv: XY, cw: boolean): unknown => {
    const e = el as Record<string, unknown>; const ax = e.x as number, ay = e.y as number;
    const na = cw ? { x: pv.x - (ay - pv.y), y: pv.y + (ax - pv.x) } : { x: pv.x + (ay - pv.y), y: pv.y - (ax - pv.x) };
    return { ...e, x: na.x, y: na.y, rot: mod360(((e.rot as number) || 0) + (cw ? 90 : -90)) };
  };
  const flipGlyph = (el: unknown, pv: XY, horiz: boolean): unknown => {
    const e = el as Record<string, unknown>; const cl = glyphCl(el); const flip = !!e.flip, rot = (e.rot as number) || 0;
    const oc = glyphCenter(el); // środek rzeczywisty
    const nc = horiz ? { x: 2 * pv.x - oc.x, y: oc.y } : { x: oc.x, y: 2 * pv.y - oc.y }; // odbicie środka względem osi
    // Czysty tekst (netlabel/text): nie lustrzymy ani nie obracamy — tylko przenosimy na odbitą pozycję
    if (e.t === 'netlabel' || e.t === 'text') { const o = rotV(flip ? { x: -cl.x, y: cl.y } : cl, rot); return { ...e, x: nc.x - o.x, y: nc.y - o.y }; }
    const nflip = !flip, nr = mod360(horiz ? -rot : 180 - rot);
    const off = rotV(nflip ? { x: -cl.x, y: cl.y } : cl, nr); // odtwórz zaczepienie, by nowy środek trafił w nc
    return { ...e, x: nc.x - off.x, y: nc.y - off.y, rot: nr, flip: nflip };
  };
  const rotateSel = (cw: boolean) => {
    const idxs = fmtIdxs(), pIdxs = selPlacedAll; if (!idxs.length && !pIdxs.length) return;
    const pv = unifiedPivot(idxs, pIdxs);
    if (idxs.length) mapSel(idxs, (el) => (GLYPH_ROT.has((el as { t: string }).t) ? rotGlyph(el, pv, cw) : rotateEl(el, pv, cw)));
    if (pIdxs.length) mapPlaced(pIdxs, (c) => {
      const { center, cl } = bodyGeom(c); const d = { x: center.x - pv.x, y: center.y - pv.y };
      const nc = cw ? { x: pv.x - d.y, y: pv.y + d.x } : { x: pv.x + d.y, y: pv.y - d.x }; // obrót środka wokół pivota
      const nr = ((((c.rotation || 0) + (cw ? 90 : -90)) % 360) + 360) % 360;
      const a = anchorFor(nc, nr, c.layer === 'Dolna warstwa', cl);
      return { ...c, x: a.x, y: a.y, rotation: nr };
    });
  };
  const flipSel = (horiz: boolean) => {
    const idxs = fmtIdxs(), pIdxs = selPlacedAll; if (!idxs.length && !pIdxs.length) return;
    const pv = unifiedPivot(idxs, pIdxs);
    if (idxs.length) mapSel(idxs, (el) => (GLYPH_ROT.has((el as { t: string }).t) ? flipGlyph(el, pv, horiz) : (horiz ? flipElH(el, pv) : flipElV(el, pv))));
    if (pIdxs.length) mapPlaced(pIdxs, (c) => {
      const { center, cl } = bodyGeom(c);
      const nc: Pt = horiz ? { x: 2 * pv.x - center.x, y: center.y } : { x: center.x, y: 2 * pv.y - center.y };
      // Odbicie = mirror środka + zamiana strony (góra↔dół, scale(-1,1)) + korekta rotacji (H:-rot, V:180-rot)
      const nr = ((((horiz ? -(c.rotation || 0) : 180 - (c.rotation || 0)) % 360) + 360) % 360);
      const layer = c.layer === 'Dolna warstwa' ? 'Górna warstwa' : c.layer === 'Górna warstwa' ? 'Dolna warstwa' : c.layer;
      const a = anchorFor(nc, nr, layer === 'Dolna warstwa', cl);
      return { ...c, x: a.x, y: a.y, rotation: nr, layer };
    });
  };
  // Zaznaczone obiekty (elementy rysunkowe + komponenty) z bboxami — wspólna baza dla wyrównania/rozmieszczenia
  type SelItem = { el?: number; pid?: string; b: { x: number; y: number; w: number; h: number } };
  const selItems = (): SelItem[] => [
    ...fmtIdxs().map((i) => ({ el: i, b: bboxOf(selColl[i]) } as SelItem)),
    ...selPlacedAll.map((i) => placedSrc[i]).filter(Boolean).map((c) => ({ pid: c.id, b: placedBox(c) } as SelItem)),
  ];
  // Zastosuj per-obiekt przesunięcia (elementy przez translateEl, komponenty przez x/y) — jedną migawką
  const applyMoves = (items: SelItem[], move: (t: SelItem) => { dx: number; dy: number }) => {
    const elMoves = new Map<number, { dx: number; dy: number }>(), plMoves = new Map<string, { dx: number; dy: number }>();
    items.forEach((t) => { const mv = move(t); if (!mv.dx && !mv.dy) return; if (t.el != null) elMoves.set(t.el, mv); else if (t.pid) plMoves.set(t.pid, mv); });
    if (elMoves.size) { snapshot(); setColl(editor, ctxKey, selColl.map((el, i) => { const m = elMoves.get(i); return m ? translateEl(el, m.dx, m.dy) : el; })); }
    if (plMoves.size) {
      const sids = sheets.filter((s) => (sheetPlaced[s.id] ?? []).some((c) => plMoves.has(c.id))).map((s) => s.id);
      sids.forEach((sid) => snapshotColl('schematic', `pl:${sid}`));
      setSheetPlaced((m) => { const n = { ...m }; sids.forEach((sid) => { n[sid] = (m[sid] ?? []).map((c) => { const mv = plMoves.get(c.id); return mv ? { ...c, x: c.x + mv.dx, y: c.y + mv.dy } : c; }); }); return n; });
    }
  };
  // Wyrównanie do wspólnej krawędzi/środka grupy (uwzględnia bbox każdego obiektu — elementu i komponentu)
  const alignSel = (mode: 'left' | 'right' | 'top' | 'bottom' | 'cx' | 'cy') => {
    const items = selItems(); if (items.length < 2) { toast('Zaznacz min. 2 obiekty (Shift+klik lub prostokąt)'); return; }
    const x0 = Math.min(...items.map((t) => t.b.x)), y0 = Math.min(...items.map((t) => t.b.y)), x1 = Math.max(...items.map((t) => t.b.x + t.b.w)), y1 = Math.max(...items.map((t) => t.b.y + t.b.h));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    applyMoves(items, ({ b }) => {
      if (mode === 'left') return { dx: x0 - b.x, dy: 0 };
      if (mode === 'right') return { dx: x1 - (b.x + b.w), dy: 0 };
      if (mode === 'top') return { dx: 0, dy: y0 - b.y };
      if (mode === 'bottom') return { dx: 0, dy: y1 - (b.y + b.h) };
      if (mode === 'cx') return { dx: cx - (b.x + b.w / 2), dy: 0 };
      return { dx: 0, dy: cy - (b.y + b.h / 2) };
    });
  };
  // Rozmieszczenie równomierne: 'edge' = równe odstępy między krawędziami wiodącymi, inaczej równe przerwy między bboxami
  const distributeSel = (axis: 'h' | 'v', edge: boolean) => {
    const items = selItems(); if (items.length < 3) { toast('Zaznacz min. 3 obiekty (Shift+klik lub prostokąt)'); return; }
    const sorted = [...items].sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = sorted[0].b, last = sorted[sorted.length - 1].b; const moves = new Map<SelItem, { dx: number; dy: number }>();
    if (edge) { const s = axis === 'h' ? first.x : first.y, e = axis === 'h' ? last.x : last.y; const step = (e - s) / (sorted.length - 1); sorted.forEach((it, k) => { const tgt = s + step * k; moves.set(it, axis === 'h' ? { dx: tgt - it.b.x, dy: 0 } : { dx: 0, dy: tgt - it.b.y }); }); }
    else { const total = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y; const sizes = sorted.reduce((acc, it) => acc + (axis === 'h' ? it.b.w : it.b.h), 0); const gap = (total - sizes) / (sorted.length - 1); let pos = axis === 'h' ? first.x : first.y; sorted.forEach((it) => { moves.set(it, axis === 'h' ? { dx: pos - it.b.x, dy: 0 } : { dx: 0, dy: pos - it.b.y }); pos += (axis === 'h' ? it.b.w : it.b.h) + gap; }); }
    applyMoves(sorted, (t) => moves.get(t) ?? { dx: 0, dy: 0 });
  };
  const gridAlignSel = () => { const items = selItems(); if (!items.length) return; const g = Math.max(1, gridSize); applyMoves(items, ({ b }) => ({ dx: Math.round(b.x / g) * g - b.x, dy: Math.round(b.y / g) * g - b.y })); };
  const zOrderSel = (front: boolean) => { const idxs = fmtIdxs(); if (!idxs.length) return; snapshot(); const set = new Set(idxs); const sel = selColl.filter((_, i) => set.has(i)); const rest = selColl.filter((_, i) => !set.has(i)); setColl(editor, ctxKey, front ? [...rest, ...sel] : [...sel, ...rest]); setSelectedIdx(null); setSelectedIdxs([]); };
  const findAction = () => { findCursor.current = 0; setFindOpen(true); };
  const findSimilar = () => setFindSimOpen(true);
  // Znajdź → następne dopasowanie (cyklicznie). Tryby: prefix/name/footprint komponentu lub etykieta sieci.
  const findNext = (mode: 'prefix' | 'name' | 'footprint' | 'netlabel', query: string) => {
    const q = query.trim().toLowerCase(); if (!q) return;
    if (mode === 'netlabel') {
      const idxs = schematicEls.map((el, i) => (el.t === 'netlabel' && el.name.toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) { toast('Brak wyników'); return; }
      const k = findCursor.current % idxs.length; findCursor.current = k + 1; selectEl(idxs[k]); toast(`Dopasowanie ${k + 1}/${idxs.length}`);
    } else {
      const val = (c: PlacedComp) => (mode === 'prefix' ? c.ref : mode === 'name' ? c.label : c.defId ?? '');
      const idxs = placed.map((c, i) => (String(val(c) ?? '').toLowerCase().includes(q) ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) { toast('Brak wyników'); return; }
      const k = findCursor.current % idxs.length; findCursor.current = k + 1; setSelPlaced(idxs[k]); setSelectedIdx(null); setSelectedIdxs([]); toast(`Dopasowanie ${k + 1}/${idxs.length}`);
    }
  };
  // Find Similar Objects → multi-selekcja komponentów wg filtrów (Any pomija dane pole)
  const applyFindSimilar = (filters: SimFilters) => {
    const prefixOf = (r: string) => (r.match(/^([A-Za-z]+)/)?.[1] ?? '');
    const test = (op: string, a: string, b: string) => (op === 'any' ? true : op === 'ne' ? a.toLowerCase() !== b.toLowerCase() : a.toLowerCase() === b.toLowerCase());
    const matchIdxs = placed.map((c, i) => {
      const ok = test(filters.name.op, c.label ?? '', filters.name.val)
        && test(filters.prefix.op, prefixOf(c.ref ?? ''), filters.prefix.val)
        && test(filters.footprint.op, String(c.defId ?? ''), filters.footprint.val)
        && test(filters.id.op, c.id ?? '', filters.id.val);
      return ok ? i : -1;
    }).filter((i) => i >= 0);
    if (!matchIdxs.length) { toast('Brak dopasowań'); return; }
    // Komponenty żyją w warstwie placed → zaznaczamy pierwszy przez selPlaced; resztę sygnalizujemy tostem
    setSelPlaced(matchIdxs[0]); setSelectedIdx(null); setSelectedIdxs([]);
    toast(`Znaleziono ${matchIdxs.length} podobnych komponentów`);
  };
  // Adnotacja — numerowanie referencji komponentów (R1, C1, U1…) wg pozycji
  const annotate = (scope: 'all' | 'current' | 'selected', method: 'reannotate' | 'keep', dir: 'rows' | 'cols') => {
    const prefixOf = (r: string) => (r.match(/^([A-Za-z]+)/)?.[1] ?? 'U');
    const sheetIds = scope === 'all' ? sheets.map((s) => s.id) : [activeSheetId];
    setSheetPlaced((m) => {
      const nm = { ...m }; const counters: Record<string, number> = {};
      for (const sid of sheetIds) {
        const arr = [...(nm[sid] ?? [])];
        const idxOrder = arr.map((_, i) => i).filter((i) => scope !== 'selected' || i === selPlaced)
          .sort((a, b) => (dir === 'cols' ? (arr[a].x - arr[b].x || arr[a].y - arr[b].y) : (arr[a].y - arr[b].y || arr[a].x - arr[b].x)));
        for (const i of idxOrder) {
          const c = arr[i], pre = prefixOf(c.ref); const cur = parseInt(c.ref.slice(pre.length), 10); const numbered = !Number.isNaN(cur);
          if (method === 'keep' && numbered) { counters[pre] = Math.max(counters[pre] ?? 0, cur); continue; }
          counters[pre] = (counters[pre] ?? 0) + 1; arr[i] = { ...c, ref: `${pre}${counters[pre]}` };
        }
        nm[sid] = arr;
      }
      return nm;
    });
    toast('Adnotacja wykonana');
  };
  const annotateReset = () => { setSheetPlaced((m) => { const nm = { ...m }; for (const s of sheets) nm[s.id] = (nm[s.id] ?? []).map((c) => ({ ...c, ref: `${c.ref.match(/^[A-Za-z]+/)?.[0] ?? 'U'}?` })); return nm; }); toast('Adnotacje zresetowane'); };
  // Pełny zapis projektu na serwer (wszystkie dokumenty + historia)
  const buildProjectData = (name: string) => ({ name, project: name, version: 1, sheets: sheets.map((s) => ({ id: s.id, name: s.name, desc: s.desc, elements: sheetEls[s.id] ?? [], placed: sheetPlaced[s.id] ?? [] })), activeSheetId, pcb: { name: pcbName, elements: pcbEls, meta: pcbMeta }, schWork, symbols: symbols.map((s) => ({ id: s.id, name: s.name, elements: symbolEls[s.id] ?? [], meta: symbolMeta[s.id] })), footprints: footprints.map((s) => ({ id: s.id, name: s.name, elements: footprintEls[s.id] ?? [], meta: footprintMeta[s.id] })), history: undoStack });
  const saveProject = async (nameArg?: string) => {
    const name = (nameArg ?? projectName).trim() || 'project'; setSaving(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildProjectData(name)) });
      const d = await res.json().catch(() => ({})); if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
      if (nameArg) setProjectName(name); toast(`Projekt zapisany na serwerze: „${name}"`);
    } catch (e) { toast(`Błąd zapisu: ${e instanceof Error ? e.message : String(e)}`); } finally { setSaving(false); }
  };
  const saveProjectAs = () => { const v = window.prompt('Zapisz projekt jako:', projectName); if (v && v.trim()) saveProject(v.trim()); };
  // Plik → Nowy → Projekt…: świeży, pusty projekt (kasuje bieżącą zawartość)
  const newProject = () => {
    if (!window.confirm('Utworzyć nowy projekt? Niezapisane zmiany zostaną utracone.')) return;
    const v = (window.prompt('Nazwa projektu:', 'Untitled') || 'Untitled').trim() || 'Untitled';
    setProjectName(v);
    setSheets([{ id: 'sheet1', name: 'Sheet_1', desc: '' }]); setActiveSheetId('sheet1'); sheetSeq.current = 1;
    setSheetEls({ sheet1: [] }); setSheetPlaced({ sheet1: [] });
    setPcbName('PCB_test1'); setPcbEls([]); setPcbMeta(emptyFpMeta());
    setSymbols([]); setSymbolEls({}); setSymbolMeta({}); setActiveSymbolId(null);
    setFootprints([]); setFootprintEls({}); setFootprintMeta({}); setActiveFootprintId(null);
    setUndoStack([]); setRedoStack([]); setSelectedIdx(null); setSelectedIdxs([]); setSelPlaced(null);
    setEditor('schematic'); setActiveTool('');
    toast(`Utworzono nowy projekt „${v}"`);
  };
  // Plik → Otwórz: wczytanie pełnego projektu z serwera (odtwarza wszystkie dokumenty + historię)
  const loadProject = async (name: string) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      type PDoc = { id: string; name: string; desc?: string; elements?: unknown[]; placed?: unknown[]; meta?: unknown };
      const rawSheets = (Array.isArray(d.sheets) ? d.sheets : []) as PDoc[];
      const sh: SheetTab[] = rawSheets.length ? rawSheets.map((s) => ({ id: s.id, name: s.name, desc: s.desc || '' })) : [{ id: 'sheet1', name: 'Sheet_1', desc: '' }];
      setProjectName(String(d.project || name));
      setSheets(sh);
      setSheetEls(Object.fromEntries((rawSheets.length ? rawSheets : sh).map((s) => [s.id, (Array.isArray((s as PDoc).elements) ? (s as PDoc).elements : []) as El[]])));
      setSheetPlaced(Object.fromEntries((rawSheets.length ? rawSheets : sh).map((s) => [s.id, (Array.isArray((s as PDoc).placed) ? (s as PDoc).placed : []) as PlacedComp[]])));
      setActiveSheetId(d.activeSheetId && sh.some((s) => s.id === d.activeSheetId) ? d.activeSheetId : sh[0].id);
      sheetSeq.current = sh.length;
      setPcbName(String(d.pcb?.name || 'PCB_test1')); setPcbEls((Array.isArray(d.pcb?.elements) ? d.pcb.elements : []) as FpEl[]); if (d.pcb?.meta) setPcbMeta(d.pcb.meta as FpMeta);
      if (d.schWork) setSchWork(d.schWork as SymWork);
      const syms = (Array.isArray(d.symbols) ? d.symbols : []) as PDoc[];
      setSymbols(syms.map((s) => ({ id: s.id, name: s.name })));
      setSymbolEls(Object.fromEntries(syms.map((s) => [s.id, (s.elements || []) as El[]])));
      setSymbolMeta(Object.fromEntries(syms.map((s) => [s.id, (s.meta as SymMeta) || emptySymMeta()])));
      setActiveSymbolId(null);
      const fps = (Array.isArray(d.footprints) ? d.footprints : []) as PDoc[];
      setFootprints(fps.map((s) => ({ id: s.id, name: s.name })));
      setFootprintEls(Object.fromEntries(fps.map((s) => [s.id, (s.elements || []) as FpEl[]])));
      setFootprintMeta(Object.fromEntries(fps.map((s) => [s.id, (s.meta as FpMeta) || emptyFpMeta()])));
      setActiveFootprintId(null);
      setUndoStack(Array.isArray(d.history) ? d.history : []); setRedoStack([]);
      setSelectedIdx(null); setSelectedIdxs([]); setSelPlaced(null);
      setEditor('schematic'); setActiveTool('');
      toast(`Wczytano projekt „${d.project || name}"`);
    } catch (e) { toast(`Błąd wczytywania: ${e instanceof Error ? e.message : String(e)}`); }
  };
  // Plik → Nowy → PCB: dialog właściwości → utwórz obrys płyty na warstwie „Obrys płyty"
  const applyNewPcb = (c: NewPcbCfg) => {
    const toW = (v: number) => (c.units === 'mm' ? v / W2MM : v); // mm/mil → jednostki świata (mil)
    const xw = toW(c.x), yw = toW(c.y), ww = toW(c.w), hw = toW(c.h);
    const outlineEl: FpEl = c.outline === 'Okrągły'
      ? { t: 'fcircle', cx: xw + ww / 2, cy: -(yw + hw / 2), r: ww / 2, width: 6, layer: 'Obrys płyty', locked: false, id: newId() }
      : { t: 'frect', x: xw, y: -(yw + hw), w: ww, h: hw, fill: 'Nie', width: 6, layer: 'Obrys płyty', locked: false, id: newId() };
    setPcbMeta((m) => ({ ...m, units: c.units }));
    setPcbCopper(c.copper);
    // Warstwy Inner (>2 warstwy miedzi) — dodaj wpisy koloru/widoczności do stanu warstw
    setLayers((s) => { const n = { ...s }; layerDefsFor(c.copper).filter((d) => d.name.startsWith('Inner')).forEach((d) => { if (!n[d.name]) n[d.name] = { color: d.color, visible: true }; }); return n; });
    // Nowa płytka: usuń poprzedni obrys, dodaj nowy
    snapshotColl('pcb', 'pcb');
    setPcbEls((prev) => [...prev.filter((el) => !((el.t === 'frect' || el.t === 'fcircle') && el.layer === 'Obrys płyty')), outlineEl]);
    setActiveLayer('Górna warstwa'); setEditor('pcb'); setActiveTool(''); setSelectedIdx(null); setSelectedIdxs([]);
    // Dopasuj widok PCB do obrysu (inaczej płytka bywa poza ekranem — współrzędne świata w milach)
    const b = elBBoxFp(outlineEl);
    setViews((vs) => {
      if (!size.w || !size.h) return vs;
      const pad = 60, z = Math.min((size.w - pad) / Math.max(1, b.w), (size.h - pad) / Math.max(1, b.h), 8);
      return { ...vs, pcb: { x: size.w / 2 - (b.x + b.w / 2) * z, y: size.h / 2 - (b.y + b.h / 2) * z, zoom: z } };
    });
    toast(`Utworzono PCB ${c.w}×${c.h} ${c.units} (${c.copper} warstw miedzi)`);
  };
  // Generowanie plików Gerber (+ wiercenie) i pobranie jako ZIP — uwzględnia obrys płyty
  const exportGerber = () => {
    const base = projectName.replace(/[^\w\-]+/g, '_') || 'pcb';
    // Geometria = elementy rysowane na PCB + footprinty osadzonych komponentów (rozłożone na warstwy)
    const gEls: FpEl[] = [...pcbEls, ...allPlaced.flatMap(placedFpEls)];
    const files: { name: string; data: string }[] = [
      { name: `${base}-Edge_Cuts.gko`, data: gerberFile(gEls, 'Board Outline', ['Obrys płyty'], false) },
      { name: `${base}-F_Cu.gtl`, data: gerberFile(gEls, 'Top Copper', ['Górna warstwa', 'Wielowastwa'], true) },
      { name: `${base}-B_Cu.gbl`, data: gerberFile(gEls, 'Bottom Copper', ['Dolna warstwa', 'Wielowastwa'], true) },
      { name: `${base}-F_Silk.gto`, data: gerberFile(gEls, 'Top Silk', ['Górna warstwa opisowa'], false) },
      { name: `${base}-B_Silk.gbo`, data: gerberFile(gEls, 'Bottom Silk', ['Dolna warstwa opisowa'], false) },
      { name: `${base}.drl`, data: drillFile(gEls) },
    ];
    // Warstwy wewnętrzne — każdy plik zawiera elementy przypisane do „Inner{i}" (+ pady wielowarstwowe/vias)
    const innerCount = Math.max(0, pcbCopper - 2);
    for (let i = 1; i <= innerCount; i++) files.push({ name: `${base}-In${i}_Cu.g${i + 1}`, data: gerberFile(gEls, `Inner ${i}`, [`Inner${i}`, 'Wielowastwa'], true) });
    const hasOutline = pcbEls.some((el) => (el.t === 'frect' || el.t === 'fcircle') && el.layer === 'Obrys płyty');
    if (!hasOutline) { toast('Uwaga: brak obrysu płyty (warstwa „Obrys płyty") — Gerber bez krawędzi.'); }
    const blob = zipStore(files);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}-gerber.zip`; a.click(); URL.revokeObjectURL(a.href);
    toast('Wygenerowano Gerber (ZIP)');
  };
  // Plik → Eksport → OBJ: model 3D płytki (podłoże + miedź/silk + obudowy komponentów)
  const exportObj = () => {
    const base = projectName.replace(/[^\w\-]+/g, '_') || 'pcb';
    const group = buildBoardGroup(pcbEls, allPlaced, layers);
    const obj = object3dToObj(group, base);
    const blob = new Blob([obj], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}.obj`; a.click(); URL.revokeObjectURL(a.href);
    toast('Wyeksportowano model 3D (.obj)');
  };
  const panTool = () => setActiveTool('pan');
  const formatOps: FormatOps = { rotL: () => rotateSel(false), rotR: () => rotateSel(true), flipH: () => flipSel(true), flipV: () => flipSel(false), alignLeft: () => alignSel('left'), alignRight: () => alignSel('right'), alignTop: () => alignSel('top'), alignBottom: () => alignSel('bottom'), centerH: () => alignSel('cx'), centerV: () => alignSel('cy'), gridAlign: gridAlignSel, distH: () => distributeSel('h', false), distV: () => distributeSel('v', false), distLeft: () => distributeSel('h', true), distTop: () => distributeSel('v', true), distArray: () => toast('Distribute Array — parametry macierzy (wkrótce)'), front: () => zOrderSel(true), back: () => zOrderSel(false), hasSel: fmtCount > 0 || selPlacedAll.length > 0 };
  const placeTools: Tool[] = editor === 'schematic' ? [...WIRING_TOOLS, ...SYMBOL_TOOLS.slice(1)] : editor === 'pcb' ? FOOTPRINT_TOOLS : editor === 'symbol' ? SYMBOL_TOOLS : FOOTPRINT_TOOLS;

  // Globalne skróty edycji (Ctrl+Z/Y/C/X/V, Delete) + Format — czytają najświeższe operacje przez ref
  const opsRef = useRef({ undo, redo, copySelected, cutSelected, paste, deleteSelected, hasSel, formatOps, panTool, findAction, findSimilar });
  opsRef.current = { undo, redo, copySelected, cutSelected, paste, deleteSelected, hasSel, formatOps, panTool, findAction, findSimilar };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement as HTMLElement | null; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase(); const o = opsRef.current; const f = o.formatOps;
      if (mod && e.shiftKey && k === 'l') { e.preventDefault(); f.alignLeft(); }
      else if (mod && e.shiftKey && k === 'r') { e.preventDefault(); f.alignRight(); }
      else if (mod && e.shiftKey && k === 'o') { e.preventDefault(); f.alignTop(); }
      else if (mod && e.shiftKey && k === 'b') { e.preventDefault(); f.alignBottom(); }
      else if (mod && e.shiftKey && k === 'g') { e.preventDefault(); f.gridAlign(); }
      else if (mod && e.shiftKey && k === 'h') { e.preventDefault(); f.distH(); }
      else if (mod && e.shiftKey && k === 'e') { e.preventDefault(); f.distV(); }
      else if (mod && e.shiftKey && k === 'f') { e.preventDefault(); o.findSimilar(); }
      else if (e.altKey && e.shiftKey && k === 'h') { e.preventDefault(); f.centerH(); }
      else if (e.altKey && e.shiftKey && k === 'e') { e.preventDefault(); f.centerV(); }
      else if (mod && k === 'f') { e.preventDefault(); o.findAction(); }
      else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? o.redo() : o.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); o.redo(); }
      else if (mod && k === 'c') { e.preventDefault(); o.copySelected(); }
      else if (mod && k === 'x') { e.preventDefault(); o.cutSelected(); }
      else if (mod && k === 'v') { e.preventDefault(); o.paste(); }
      else if (!mod && !e.altKey && k === 'x') { e.preventDefault(); f.flipH(); }
      else if (!mod && !e.altKey && k === 'y') { e.preventDefault(); f.flipV(); }
      else if (!mod && !e.altKey && k === 'd') { e.preventDefault(); o.panTool(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && o.hasSel) { e.preventDefault(); o.deleteSelected(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const editOps = { undo, redo, cut: cutSelected, copy: copySelected, paste, del: deleteSelected, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, hasSel, hasClip };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, bgcolor: '#fff', fontFamily: 'sans-serif' }}>
      <TopMenuBar editor={editor} onNewProject={newProject} onNewSymbol={addSymbol} onNewSchematic={addSheet} onNewPcb={() => setNewPcbOpen(true)} onNewFootprint={addFootprint} onSave={editor === 'symbol' ? () => setSaveOpen(true) : editor === 'footprint' ? () => setFpSaveOpen(true) : undefined} onImport={() => setImportOpen(true)} onOpenProject={() => setOpenProjOpen(true)} editOps={editOps} formatOps={formatOps} placeTools={placeTools} onPlaceTool={setActiveTool} onPanTool={panTool} onFind={findAction} onFindSimilar={findSimilar} onSaveProject={() => saveProject()} onSaveProjectAs={saveProjectAs} saving={saving} onExportObj={exportObj} onExportGerber={exportGerber} />
      <Toolbar editor={editor} onSave={editor === 'symbol' ? () => setSaveOpen(true) : editor === 'footprint' ? () => setFpSaveOpen(true) : undefined} ops={editOps} fmt={formatOps} onZoomIn={() => zoomAround(1.25)} onZoomOut={() => zoomAround(1 / 1.25)} onFit={fitToWindow} onFind={findAction} onFindSimilar={findSimilar} onAnnotate={() => setAnnotOpen(true)} on3dView={() => setBoard3dOpen(true)} onMyElements={() => setMyElementsOpen(true)} onBom={() => setBomOpen(true)} />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {showLeft && <ProjectPanel width={leftW} projectName={projectName} sheets={sheets} activeSheetId={activeSheetId} pcbName={pcbName} editor={editor}
          exp={treeExp} onToggle={(n) => setTreeExp((s) => ({ ...s, [n]: !s[n] }))}
          onSelectDoc={openDoc} onModifyDoc={(ref) => setModifyRef(ref)}
          onCtxProject={(e) => { e.preventDefault(); setTreeCtx({ x: e.clientX, y: e.clientY, kind: 'project' }); }}
          onCtxDoc={(e, ref) => { e.preventDefault(); openDoc(ref); setTreeCtx({ x: e.clientX, y: e.clientY, kind: 'doc', ref }); }}
          filter={treeFilter} onFilter={setTreeFilter} />}
        {showLeft && <VSplitter onResize={(d) => setLeftW((w) => { const nw = w + d; if (nw < 130) { setShowLeft(false); return w; } return Math.min(440, Math.max(150, nw)); })} />}
        <CollapseTab open={showLeft} side="left" onToggle={() => setShowLeft((v) => !v)} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <DocTabs editor={editor} setEditor={setEditor} symbols={symbols} activeSymbolId={activeSymbolId} onSelectSymbol={selectSymbol} onCloseSymbol={closeSymbol} footprints={footprints} activeFootprintId={activeFootprintId} onSelectFootprint={selectFootprint} onCloseFootprint={closeFootprint} projectName={projectName} pcbName={pcbName} />
          {/* Dokowany pasek narzędzi (osadzony na stałe u góry canvasu) */}
          <DockedTools editor={editor} activeTool={activeTool} setActiveTool={setActiveTool} />
          {/* Górna linijka (z narożnikiem wyrównującym do canvasu) */}
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            <Box sx={{ width: 18, height: 18, bgcolor: '#f4f5f7', borderRight: `1px solid ${C.barBorder}`, borderBottom: `1px solid ${C.barBorder}` }} />
            <Ruler orientation="h" view={view} length={size.w} originAxis={originAxisX} unit={editor === 'pcb' || editor === 'footprint' ? W2MM : 1} />
          </Box>
          <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <Ruler orientation="v" view={view} length={size.h} originAxis={originAxisY} unit={editor === 'pcb' || editor === 'footprint' ? W2MM : 1} />
            <Box ref={canvasRef} sx={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
              {editor === 'schematic' && (
                <SymbolEditorCanvas elements={schematicEls} onChange={(e) => { snapshot(); setSchematicEls(e); }} activeTool={activeTool} setActiveTool={setActiveTool} view={view} setView={setView} origin={schOrigin} setOrigin={setSchOrigin} selectedIdx={selectedIdx} selectedIdxs={selectedIdxs} selectedPart={selectedPart} schematicMode onSelect={selectEl} onMouse={onCanvasMouse} work={schWork}
                  placing={placing} onPlace={placeAt}
                  placedBBoxes={placed.map(placedBBox)} onSelectManyPlaced={onSelectManyPlaced}
                  onEmptyClick={(p) => { const i = hitTestPlaced(placed, p, 8 / view.zoom); setSelPlaced(i); setSelPlacedIdxs([]); setSelectedIdx(null); setSelectedIdxs([]); }}
                  hitPlaced={(p) => hitTestPlaced(placed, p, 8 / view.zoom)}
                  onPlacedMove={(idx, dx, dy) => { setPlacedMove({ idx, dx, dy }); if (!selPlacedIdxs.includes(idx)) { setSelPlaced(idx); setSelPlacedIdxs([]); } setSelectedIdx(null); }}
                  onPlacedMoveEnd={(idx, dx, dy) => { if (dx || dy) { const grp = selPlacedAll.includes(idx) ? selPlacedAll : [idx]; const set = new Set(grp); placedSnapshotRef.current(); setPlaced((arr) => arr.map((c, i) => (set.has(i) ? { ...c, x: c.x + dx, y: c.y + dy } : c))); } setPlacedMove(null); }}
                  marqueeMode={marqueeMode} onSelectMany={onSelectManyIdx}
                  onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}
                  overlay={<>
                    <SheetFrame />
                    {placed.map((c, i) => renderPlaced(placedMove && placedDrag.includes(i) ? { ...c, x: c.x + placedMove.dx, y: c.y + placedMove.dy } : c, c.id))}
                    {placing && renderPlaced(placing, 'placing', true)}
                    {selPlacedAll.filter((i) => placed[i]).map((i) => <g key={`plhl${i}`}>{selHighlight(placedBBox(placedMove && placedDrag.includes(i) ? { ...placed[i], x: placed[i].x + placedMove.dx, y: placed[i].y + placedMove.dy } : placed[i]), view.zoom, '#2196f3')}</g>)}
                  </>} />
              )}
              {editor === 'pcb' && <FootprintCanvas elements={pcbEls} onChange={(e) => { snapshot(); setPcbEls(e); }} activeTool={activeTool} setActiveTool={setActiveTool} view={view} setView={setView} onMouse={onCanvasMouse} meta={pcbMeta} selectedIdx={selectedIdx} selectedIdxs={selectedIdxs} onSelect={(i, additive) => selectEl(i, 'body', additive)} layers={layers} activeLayer={activeLayer} marqueeMode={marqueeMode} onSelectMany={onSelectManyIdx}
                hitPlaced={(p) => hitTestPcbPart(allPlaced, p, 8 / view.zoom)}
                placedBBoxes={allPlaced.map(pcbPartBBox)} onSelectManyPlaced={onSelectManyPlaced}
                onEmptyClick={(p) => { const i = hitTestPcbPart(allPlaced, p, 8 / view.zoom); setSelPlaced(i); setSelPlacedIdxs([]); setSelectedIdx(null); setSelectedIdxs([]); }}
                onPlacedMove={(idx, dx, dy) => { setPlacedMove({ idx, dx, dy }); if (!selPlacedIdxs.includes(idx)) { setSelPlaced(idx); setSelPlacedIdxs([]); } setSelectedIdx(null); setSelectedIdxs([]); }}
                onPlacedMoveEnd={(idx, dx, dy) => { if (dx || dy) { const grp = selPlacedAll.includes(idx) ? selPlacedAll : [idx]; grp.length > 1 ? moveManyPlaced(grp, dx, dy, allPlaced) : moveAllPlaced(idx, dx, dy); } setPlacedMove(null); }}
                overlay={objVis['Komponent'] !== false ? <>
                  {allPlaced.map((c, i) => renderPcbPart(placedMove && placedDrag.includes(i) ? { ...c, pcbX: (c.pcbX ?? c.x) + placedMove.dx, pcbY: (c.pcbY ?? c.y) + placedMove.dy } : c, c.id, false, layers))}
                  {placing && renderPcbPart(placing, 'placing', true, layers)}
                  {selPlacedAll.filter((i) => allPlaced[i]).map((i) => <g key={`plhl${i}`}>{selHighlight(pcbPartBBox(placedMove && placedDrag.includes(i) ? { ...allPlaced[i], pcbX: (allPlaced[i].pcbX ?? allPlaced[i].x) + placedMove.dx, pcbY: (allPlaced[i].pcbY ?? allPlaced[i].y) + placedMove.dy } : allPlaced[i]), view.zoom, '#4fc3f7')}</g>)}
                </> : (placing ? <>{placing && renderPcbPart(placing, 'placing', true, layers)}</> : null)} placing={placing} onPlace={placeAt} onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }} />}
              {editor === 'symbol' && activeSymbolId && (
                <SymbolEditorCanvas key={activeSymbolId} elements={activeEls} onChange={(e) => { snapshot(); setSymbolEls((m) => ({ ...m, [activeSymbolId]: e })); }} activeTool={activeTool} setActiveTool={setActiveTool} view={view} setView={setView} origin={symOrigin} setOrigin={setSymOrigin} selectedIdx={selectedIdx} selectedIdxs={selectedIdxs} onSelect={selectEl} onMouse={onCanvasMouse} work={symWork} marqueeMode={marqueeMode} onSelectMany={onSelectManyIdx} />
              )}
              {editor === 'footprint' && activeFootprintId && (
                <FootprintCanvas key={activeFootprintId} elements={activeFpEls} onChange={(e) => { snapshot(); setFootprintEls((m) => ({ ...m, [activeFootprintId]: e })); }} activeTool={activeTool} setActiveTool={setActiveTool} view={view} setView={setView} onMouse={onCanvasMouse} meta={fpMeta} selectedIdx={selectedIdx} selectedIdxs={selectedIdxs} onSelect={(i, additive) => selectEl(i, 'body', additive)} layers={layers} activeLayer={activeLayer} marqueeMode={marqueeMode} onSelectMany={onSelectManyIdx} />
              )}

              {editor === 'schematic' && (
                <>
                  <Box sx={{ position: 'absolute', left: 16, bottom: 8, display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: 'calc(100% - 32px)', overflowX: 'auto' }}>
                    {sheets.map((s) => (
                      <Box key={s.id} onClick={() => switchSheet(s.id)} onDoubleClick={() => setModifyRef({ kind: 'sheet', id: s.id })}
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: '#fff', border: `1px solid ${activeSheetId === s.id ? '#4a90e2' : C.barBorder}`, borderRadius: 0.75, px: 1.25, py: 0.5, fontSize: 13, color: '#2b2f34', cursor: 'default', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        *{s.name}
                        <KeyboardArrowUpIcon sx={{ fontSize: 16, color: C.icon, '&:hover': { color: '#2f7fe0' } }} onClick={(e) => { e.stopPropagation(); setTabCtx({ x: e.clientX, y: e.clientY, id: s.id }); }} />
                      </Box>
                    ))}
                    <Box onClick={addSheet} sx={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#fff', border: `1px solid ${C.barBorder}`, borderRadius: 0.75, cursor: 'default', flexShrink: 0, '&:hover': { bgcolor: '#eef1f4' } }}><AddIcon sx={{ fontSize: 18, color: C.icon }} /></Box>
                  </Box>
                </>
              )}

              {/* Pasek akcji dla dotyku/pióra: kończenie rysowania / wyjście z narzędzia / anulowanie stawiania */}
              {placing && (
                <Box sx={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, zIndex: 16 }}>
                  <Button variant="contained" size="small" onClick={() => placeAt({ x: placing.x, y: placing.y })} sx={{ textTransform: 'none', boxShadow: 3, bgcolor: C.green, '&:hover': { bgcolor: '#268a5c' } }}>✓ Osadź tutaj</Button>
                  <Button variant="contained" size="small" color="error" onClick={() => setPlacing(null)} sx={{ textTransform: 'none', boxShadow: 3 }}>Anuluj wstawianie</Button>
                </Box>
              )}
              {!placing && activeTool !== '' && (editor === 'schematic' || editor === 'symbol' || editor === 'pcb' || editor === 'footprint') && (
                <Box sx={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, zIndex: 16 }}>
                  <Button variant="contained" size="small" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))} sx={{ textTransform: 'none', boxShadow: 3, bgcolor: C.green, '&:hover': { bgcolor: '#268a5c' } }}>✓ Zakończ</Button>
                  <Button variant="contained" size="small" color="inherit" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))} sx={{ textTransform: 'none', boxShadow: 3, bgcolor: '#eef1f4', color: '#3a3f45', '&:hover': { bgcolor: '#e2e6ea' } }}>Wyjdź z narzędzia</Button>
                </Box>
              )}
              {/* Tryb normalny: przełącznik zaznaczania grupowego prostokątem (desktop: też Shift+przeciągnięcie) */}
              {!placing && activeTool === '' && (
                <Box sx={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1, zIndex: 16 }}>
                  <Button variant="contained" size="small" onClick={() => setMarqueeMode((v) => !v)} startIcon={<HighlightAltIcon sx={{ fontSize: 17 }} />} sx={{ textTransform: 'none', boxShadow: 3, bgcolor: marqueeMode ? C.green : '#eef1f4', color: marqueeMode ? '#fff' : '#3a3f45', '&:hover': { bgcolor: marqueeMode ? '#268a5c' : '#e2e6ea' } }}>{marqueeMode ? 'Zaznaczanie obszaru: WŁ' : 'Zaznacz obszar'}</Button>
                  {(selectedIdxs.length > 1 || selPlacedIdxs.length > 1) && <Button variant="contained" size="small" color="inherit" onClick={() => { setSelectedIdxs([]); setSelectedIdx(null); setSelPlacedIdxs([]); setSelPlaced(null); }} sx={{ textTransform: 'none', boxShadow: 3, bgcolor: '#eef1f4', color: '#3a3f45', '&:hover': { bgcolor: '#e2e6ea' } }}>Odznacz ({selectedIdxs.length + selPlacedIdxs.length})</Button>}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
        <CollapseTab open={showRight} side="right" onToggle={() => setShowRight((v) => !v)} />
        {showRight && <VSplitter onResize={(d) => setRightW((w) => { const nw = w - d; if (nw < 150) { setShowRight(false); return w; } return Math.min(560, Math.max(180, nw)); })} />}
        {showRight && (() => {
          const propsContent = selectedIdxs.length > 1 ? (
            <PropsShell count={selectedIdxs.length}><GroupProps els={selectedIdxs.map((i) => selColl[i]).filter(Boolean) as Record<string, unknown>[]} onChange={updateGroup} /><MouseBlock rows={mRows} /></PropsShell>
          ) : selectedPlacedComp ? (
            editor === 'schematic'
              ? <SchPlacedProps comp={selectedPlacedComp} onChange={updatePlacedComp} mouse={mRows} onEditSymbol={() => { const c = selectedPlacedComp; if (c.savedEls && c.savedEls.length) importSymbol(c.label, c.savedEls); else toast('Edycja dostępna dla symboli z serwera (Place Component → Edycja).'); }} />
              : <PlacedProps comp={selectedPlacedComp} onChange={updatePlacedComp} mouse={mRows} />
          ) : (<>
            {editor === 'schematic' && <SchematicProperties mouse={mRows} sel={selectedSchEl} selPart={selectedPart} onSelChange={updateSchEl} work={schWork} onWork={updSchWork} />}
            {editor === 'pcb' && <FootprintProperties mouse={mRows} meta={pcbMeta} onMeta={updatePcbMeta} sel={selectedFpEl} onSelChange={updateFpEl} layerNames={layerNames} />}
            {editor === 'symbol' && <SymbolProperties mouse={mRows} sel={selectedEl} onSelChange={updateEl} meta={symMeta} onMeta={updateSymMeta} work={symWork} onWork={updSymWork} />}
            {editor === 'footprint' && <FootprintProperties mouse={mRows} meta={fpMeta} onMeta={updateFpMeta} sel={selectedFpEl} onSelChange={updateFpEl} layerNames={layerNames} />}
          </>);

          // Edytory bez warstw (schematic/symbol): tylko Properties.
          if (!(editor === 'pcb' || editor === 'footprint')) {
            return (
              <Box sx={{ width: rightW, flexShrink: 0, display: 'flex', borderLeft: `1px solid ${C.panelBorder}`, minHeight: 0 }}>
                {propsContent}
              </Box>
            );
          }

          // PCB/footprint: zadokowany „Layers and Objects" w zakładce obok Properties (wszystkie layouty).
          return (
            <Box sx={{ width: rightW, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${C.panelBorder}`, minHeight: 0 }}>
              <Box sx={{ display: 'flex', flexShrink: 0, borderBottom: `1px solid ${C.barBorder}`, bgcolor: C.bar }}>
                {([['layers', 'Layers and Objects'], ['props', 'Properties']] as const).map(([k, label]) => (
                  <Box key={k} onClick={() => setRightTab(k)} sx={{ flex: 1, textAlign: 'center', px: 1, py: 0.75, fontSize: 12.5, cursor: 'pointer', color: rightTab === k ? '#2196f3' : '#5b6169', fontWeight: rightTab === k ? 600 : 400, borderBottom: rightTab === k ? '2px solid #2196f3' : '2px solid transparent' }}>{label}</Box>
                ))}
              </Box>
              {rightTab === 'layers' ? (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <LayersPanelBody docked layers={layers} activeLayer={activeLayer} onColor={setLayerColor} onToggle={toggleLayer} onActive={setActiveLayer} objVis={objVis} onObjToggle={toggleObj} copper={pcbCopper} />
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'auto' }}>
                  {propsContent}
                </Box>
              )}
            </Box>
          );
        })()}
      </Box>

      {/* Menu kontekstowe canvasu Sheet */}
      {(() => {
        const close = () => { setCtx(null); setGridSub(null); setSnapSub(null); };
        const item = (label: string, onClick: () => void, icon?: React.ReactNode, extra?: object) => (
          <MenuItem onClick={() => { onClick(); close(); }} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 220 }} {...extra}>{icon}{label}</MenuItem>
        );
        const sizes = [1, 2, 5, 10, 20, 25, 50, 100];
        return (
          <>
            <Menu open={!!ctx} onClose={close} anchorReference="anchorPosition" anchorPosition={ctx ? { top: ctx.y, left: ctx.x } : undefined}>
              <MenuItem disabled sx={{ fontSize: 13.5 }}>Find Similar Objects…</MenuItem>
              {item('Place Component…', () => setPlaceOpen(true))}
              <Divider />
              {item('Kopiuj', copySelected, <ContentCopyOutlinedIcon sx={{ fontSize: 17, color: C.icon }} />, { disabled: !hasSel })}
              {item('Wklej', paste, <ContentPasteOutlinedIcon sx={{ fontSize: 17, color: C.icon }} />, { disabled: !hasClip })}
              {item('Wytnij', cutSelected, <ContentCutIcon sx={{ fontSize: 17, color: C.icon }} />, { disabled: !hasSel })}
              {item('Usuń', deleteSelected, <DeleteOutlineIcon sx={{ fontSize: 17, color: '#d64545' }} />, { disabled: !hasSel })}
              <Divider />
              {item('Powiększ', () => zoomAround(1.25), <ZoomInIcon sx={{ fontSize: 17, color: '#2f7fe0' }} />)}
              {item('Pomniejsz', () => zoomAround(1 / 1.25), <ZoomOutIcon sx={{ fontSize: 17, color: '#2f7fe0' }} />)}
              {item('Dopasuj do okna', fitToWindow, <FitScreenIcon sx={{ fontSize: 17, color: C.icon }} />)}
              <Divider />
              <MenuItem onClick={(e) => setGridSub(e.currentTarget)} sx={{ fontSize: 13.5, gap: 1.5 }}>Rozmiar siatki<KeyboardArrowRightIcon sx={{ fontSize: 18, ml: 'auto' }} /></MenuItem>
              <MenuItem onClick={(e) => setSnapSub(e.currentTarget)} sx={{ fontSize: 13.5, gap: 1.5 }}>Rozmiar przyciągania<KeyboardArrowRightIcon sx={{ fontSize: 18, ml: 'auto' }} /></MenuItem>
              {canGroup && <Divider />}
              {canGroup && <MenuItem disabled={!hasElSel} onClick={() => { groupSel(); close(); }} sx={{ fontSize: 13.5 }}>Grupuj</MenuItem>}
              {canGroup && <MenuItem disabled={!isGroupSel} onClick={() => { ungroupSel(); close(); }} sx={{ fontSize: 13.5 }}>Rozgrupuj</MenuItem>}
              <Divider />
              <MenuItem onClick={() => { setDocOpen(true); close(); }} sx={{ fontSize: 13.5 }}>Ustawienia dokumentu…</MenuItem>
              <MenuItem onClick={close} sx={{ fontSize: 13.5 }}>Atrybuty obszaru roboczego…</MenuItem>
            </Menu>
            <Menu open={!!gridSub} anchorEl={gridSub} onClose={() => setGridSub(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
              {sizes.map((s) => <MenuItem key={s} selected={gridSize === s} onClick={() => { setGridSize(s); close(); }} sx={{ fontSize: 13 }}>{s}</MenuItem>)}
            </Menu>
            <Menu open={!!snapSub} anchorEl={snapSub} onClose={() => setSnapSub(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
              {sizes.map((s) => <MenuItem key={s} selected={snapSize === s} onClick={() => { setSnapSize(s); close(); }} sx={{ fontSize: 13 }}>{s}</MenuItem>)}
            </Menu>
          </>
        );
      })()}

      {/* Menu kontekstowe panelu Workspace (projekt / dokument) */}
      {(() => {
        const close = closeTreeMenus;
        const it = (label: string, onClick: () => void, icon?: React.ReactNode, extra?: object) => (
          <MenuItem key={label} onClick={() => { onClick(); close(); }} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 210 }} {...extra}>{icon}{label}</MenuItem>
        );
        const sub = (label: string, set: (el: HTMLElement) => void, icon?: React.ReactNode) => (
          <MenuItem key={label} onClick={(e) => set(e.currentTarget)} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 210 }}>{icon}{label}<KeyboardArrowRightIcon sx={{ fontSize: 18, ml: 'auto' }} /></MenuItem>
        );
        const subMenu = { anchorOrigin: { vertical: 'top', horizontal: 'right' } as const, transformOrigin: { vertical: 'top', horizontal: 'left' } as const };
        const isProj = treeCtx?.kind === 'project';
        const ref: DocRef = treeCtx?.ref ?? { kind: 'sheet', id: activeSheetId };
        const deleteProject = () => { if (window.confirm(`Usunąć projekt „${projectName}"? Wyczyści to wszystkie dokumenty.`)) { setSheets([{ id: 'sheet1', name: 'Sheet_1', desc: '' }]); setSheetEls({ sheet1: [] }); setSheetPlaced({ sheet1: [] }); setActiveSheetId('sheet1'); setPcbEls([]); setSelectedIdx(null); setSelPlaced(null); toast('Projekt usunięty'); } };
        return (
          <>
            <Menu open={!!treeCtx} onClose={close} anchorReference="anchorPosition" anchorPosition={treeCtx ? { top: treeCtx.y, left: treeCtx.x } : undefined}>
              {isProj ? [
                <MenuItem key="close" onClick={() => { setTreeExp((s) => ({ ...s, project: false })); toast('Zamknięto projekt'); close(); }} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 210 }}>Zamknij projekt</MenuItem>,
                <Divider key="d1" />,
                it('Migrate to Pro Edition…', () => toast('Migracja do Pro Edition (funkcja chmurowa EasyEDA)')),
                it('Klonuj', () => toast(`Sklonowano projekt „${projectName}"`)),
                it('Przenieś', () => toast('Przeniesiono projekt')),
                sub('Manage Project', setMgrSub),
                sub('Wersja', setVerSub),
                <Divider key="d2" />,
                it('Nowy schemat', addSheet, <DescriptionOutlinedIcon sx={{ fontSize: 17, color: '#2f7fe0' }} />),
                it('Nowe PCB', () => setNewPcbOpen(true), <GridOnIcon sx={{ fontSize: 17, color: '#3aa757' }} />),
                it('Generuj Gerber (ZIP)', exportGerber, <GridOnIcon sx={{ fontSize: 17, color: '#c9a227' }} />),
                <Divider key="d3" />,
                sub('Collapse / Expand', setColSub),
                it('Odśwież listę', () => toast('Lista odświeżona'), <RefreshIcon sx={{ fontSize: 17, color: '#3aa757' }} />),
              ] : [
                it('Otwórz', () => openDoc(ref), <EditOutlinedIcon sx={{ fontSize: 17, color: '#2f7fe0' }} />),
                it('Modyfikuj', () => setModifyRef(ref)),
                it('Klonuj', () => setCloneRef(ref)),
                it('Usuń', () => deleteDoc(ref), <DeleteOutlineIcon sx={{ fontSize: 17, color: '#3aa757' }} />),
                it('Zapisy Historii…', () => setHistRef(ref), <HistoryIcon sx={{ fontSize: 17, color: C.icon }} />),
                <Divider key="d1" />,
                it('Odśwież listę', () => toast('Lista odświeżona'), <RefreshIcon sx={{ fontSize: 17, color: '#3aa757' }} />),
              ]}
            </Menu>
            <Menu open={!!mgrSub} anchorEl={mgrSub} onClose={() => setMgrSub(null)} {...subMenu}>
              {it('Zobacz', () => toast('Zobacz projekt'))}
              {it('Edycja', renameProject)}
              {it('Members', () => toast('Zarządzanie członkami (funkcja chmurowa)'))}
              {it('Attachment', () => toast('Załączniki projektu'))}
              {it('Pobierz', exportProject)}
              {it('Usuń', deleteProject, <DeleteOutlineIcon sx={{ fontSize: 17, color: '#3aa757' }} />)}
              <MenuItem disabled sx={{ fontSize: 13.5, minWidth: 190 }}>Archive</MenuItem>
              {it('Transfer', () => toast('Transfer projektu'))}
              {it('Udostępnij', () => toast('Udostępniono projekt'))}
              {it('Version Management', () => toast('Zarządzanie wersjami'))}
              {it('View Homepage', () => window.open('https://easyeda.com', '_blank'))}
              {it('Backup Project', exportProject)}
            </Menu>
            <Menu open={!!verSub} anchorEl={verSub} onClose={() => setVerSub(null)} {...subMenu}>
              {it('New Version', () => toast('Utworzono nową wersję'))}
              {it('Switch Version', () => toast('Przełączanie wersji'))}
              {it('Version Management', () => toast('Zarządzanie wersjami'))}
            </Menu>
            <Menu open={!!colSub} anchorEl={colSub} onClose={() => setColSub(null)} {...subMenu}>
              {it('Zwiń', () => setTreeExp((s) => ({ ...s, project: false })))}
              {it('Expand', () => setTreeExp((s) => ({ ...s, project: true })))}
              {it('Zwiń wszystko', () => setTreeExp({ user: false, project: false }))}
              {it('Rozwiń wszystko', () => setTreeExp({ user: true, project: true }))}
            </Menu>
          </>
        );
      })()}

      {/* Menu kontekstowe zakładki arkusza (strzałka ^ na dole) */}
      {(() => {
        const c = () => setTabCtx(null);
        const id = tabCtx?.id ?? '';
        const mi = (label: string, onClick: () => void, icon?: React.ReactNode, extra?: object) => <MenuItem onClick={() => { onClick(); c(); }} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 190 }} {...extra}>{icon}{label}</MenuItem>;
        return (
          <Menu open={!!tabCtx} onClose={c} anchorReference="anchorPosition" anchorPosition={tabCtx ? { top: tabCtx.y, left: tabCtx.x } : undefined}>
            {mi('Usuń', () => deleteSheet(id), <DeleteOutlineIcon sx={{ fontSize: 17, color: '#3aa757' }} />)}
            {mi('Zapisz jako…', () => setCloneRef({ kind: 'sheet', id }))}
            {mi('Zapisy Historii…', () => setHistRef({ kind: 'sheet', id }))}
            {mi('Zmień nazwę', () => setModifyRef({ kind: 'sheet', id }))}
            {mi('Move Forward', () => moveSheet(id, 1))}
            {mi('Move Backward', () => moveSheet(id, -1))}
          </Menu>
        );
      })()}

      <FileInfoDialog open={!!modifyRef} name={modifyRef ? refName(modifyRef) : ''} desc={modifyRef?.kind === 'sheet' ? (sheets.find((s) => s.id === modifyRef.id)?.desc ?? '') : ''} onClose={() => setModifyRef(null)} onOk={(t, d) => { applyModify(t, d); setModifyRef(null); }} />
      <CloneFileDialog open={!!cloneRef} name={cloneRef ? cloneDefaultTitle(cloneRef) : ''} projectName={projectName} onClose={() => setCloneRef(null)} onOk={(t) => { applyClone(t); setCloneRef(null); }} />
      <HistoryFileDialog open={!!histRef} snaps={(() => {
        if (!histRef) return [];
        const match = histRef.kind === 'pcb' ? (k: string) => k === 'pcb' : (k: string) => k === `sh:${histRef.id}` || k === `pl:${histRef.id}`;
        return undoStack.map((s, i) => ({ snap: s, num: i + 1 })).filter((x) => match(x.snap.key));
      })()} onClose={() => setHistRef(null)} onRestore={(num) => { if (undoStack[num - 1]) restoreSnap(undoStack[num - 1]); setHistRef(null); }} />

      <FindDialog open={findOpen} onClose={() => setFindOpen(false)} onFindNext={findNext} />
      <FindSimilarDialog open={findSimOpen} onClose={() => setFindSimOpen(false)} onFind={(f) => { applyFindSimilar(f); setFindSimOpen(false); }} />
      <AnnotationDialog open={annotOpen} onClose={() => setAnnotOpen(false)} onAnnotate={annotate} onReset={annotateReset} />
      <Board3DDialog open={board3dOpen} onClose={() => setBoard3dOpen(false)} pcbEls={pcbEls} placed={allPlaced} name={projectName || 'pcb'} layers={layers} />
      <MyElementsDialog
        open={myElementsOpen}
        onClose={() => setMyElementsOpen(false)}
        onInsert={(el) => { insertMyElement(el); setMyElementsOpen(false); }}
        renderLcscPreview={(lcsc) => <LcscPreview lcsc={lcsc} />}
      />
      <BomDialog open={bomOpen} onClose={() => setBomOpen(false)} projectName={projectName} placed={allPlaced} />

      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" onClose={() => setSnack(null)} sx={{ fontSize: 13.5 }}>{snack}</Alert>
      </Snackbar>

      <OpenProjectDialog open={openProjOpen} onClose={() => setOpenProjOpen(false)} onOpen={loadProject} />
      <NewPcbDialog open={newPcbOpen} onClose={() => setNewPcbOpen(false)} onApply={(c) => { applyNewPcb(c); setNewPcbOpen(false); }} />
      <PlaceComponentDialog open={placeOpen} onClose={() => setPlaceOpen(false)} onPick={startPlacing} onEditSymbol={importSymbol} onEditFootprint={importFootprint} />
      <SaveSymbolDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={saveSymbol} initialTitle={symMeta.name} initialFootprint={symMeta.footprint} />
      <SaveFootprintDialog open={fpSaveOpen} onClose={() => setFpSaveOpen(false)} onSave={saveFootprint} initialTitle={fpMeta.footprint} initialSymbol={fpMeta.symbol} />
      <DocSettingsDialog open={docOpen} onClose={() => setDocOpen(false)} initial={docSettings} onPlace={setDocSettings} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onSymbol={importSymbol} onFootprint={importFootprint} />
    </Box>
  );
}
