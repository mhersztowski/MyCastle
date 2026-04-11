import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import CableIcon from '@mui/icons-material/Cable';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import UndoIcon from '@mui/icons-material/Undo';
import { GRID, SNAP_RADIUS, WIRE_COLORS, type ComponentPlacement, type Wire, type WirePoint, type InteractionMode, type ElectronicsSchema } from '../../electronics/types';
import { getPartDef } from '../../electronics/partLibrary';
import type { PartDef } from '../../electronics/types';

// ── Part renderer ─────────────────────────────────────────────────────────────

function PartBody({ part, w, h, selected }: { part: PartDef; w: number; h: number; selected: boolean }) {
  const px = (v: number) => v * GRID;
  const strokeColor = selected ? '#4fc3f7' : '#555';
  const strokeWidth = selected ? 2 : 1;

  if (part.bodyShape === 'breadboard') {
    const cols = 63, railH = 2, mainH = 5, gapH = 1;
    const oX = 1, oTop = 0, oMain = 3, oBot = oMain + mainH + gapH + mainH + gapH;
    return (
      <g>
        {/* Body */}
        <rect x={0} y={0} width={px(w)} height={px(h)} rx={4} fill="#e8e0d0" stroke={strokeColor} strokeWidth={strokeWidth} />
        {/* Top power rails */}
        <rect x={px(oX)} y={px(oTop)} width={px(cols)} height={px(railH)} rx={2} fill="#fce4e4" stroke="#e57373" strokeWidth={0.5} />
        <line x1={px(oX)} y1={px(oTop+0.5)} x2={px(oX+cols)} y2={px(oTop+0.5)} stroke="#e53935" strokeWidth={1} opacity={0.6} />
        <line x1={px(oX)} y1={px(oTop+1.5)} x2={px(oX+cols)} y2={px(oTop+1.5)} stroke="#1565c0" strokeWidth={1} opacity={0.6} />
        {/* Bottom power rails */}
        <rect x={px(oX)} y={px(oBot)} width={px(cols)} height={px(railH)} rx={2} fill="#fce4e4" stroke="#e57373" strokeWidth={0.5} />
        <line x1={px(oX)} y1={px(oBot+0.5)} x2={px(oX+cols)} y2={px(oBot+0.5)} stroke="#e53935" strokeWidth={1} opacity={0.6} />
        <line x1={px(oX)} y1={px(oBot+1.5)} x2={px(oX+cols)} y2={px(oBot+1.5)} stroke="#1565c0" strokeWidth={1} opacity={0.6} />
        {/* Main area rows a–e and f–j */}
        <rect x={px(oX)} y={px(oMain)} width={px(cols)} height={px(mainH)} rx={1} fill="#ede8da" stroke="#bbb" strokeWidth={0.5} />
        <rect x={px(oX)} y={px(oMain+mainH+gapH)} width={px(cols)} height={px(mainH)} rx={1} fill="#ede8da" stroke="#bbb" strokeWidth={0.5} />
        {/* Hole grid (pattern) */}
        <defs>
          <pattern id="holes" x={px(oX)} y={px(oTop)} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={GRID/2} cy={GRID/2} r={3} fill="#bbb" />
            <circle cx={GRID/2} cy={GRID/2} r={1.5} fill="#888" />
          </pattern>
        </defs>
        <rect x={px(oX)} y={px(oTop)} width={px(cols)} height={px(railH)} fill="url(#holes)" opacity={0.7} />
        <rect x={px(oX)} y={px(oMain)} width={px(cols)} height={px(mainH)} fill="url(#holes)" opacity={0.7} />
        <rect x={px(oX)} y={px(oMain+mainH+gapH)} width={px(cols)} height={px(mainH)} fill="url(#holes)" opacity={0.7} />
        <rect x={px(oX)} y={px(oBot)} width={px(cols)} height={px(railH)} fill="url(#holes)" opacity={0.7} />
        {/* Row labels */}
        {['a','b','c','d','e'].map((l, i) => (
          <text key={l} x={px(oX)-6} y={px(oMain+i)+GRID/2+4} textAnchor="middle" fontSize={9} fill="#888">{l}</text>
        ))}
        {['f','g','h','i','j'].map((l, i) => (
          <text key={l} x={px(oX)-6} y={px(oMain+mainH+gapH+i)+GRID/2+4} textAnchor="middle" fontSize={9} fill="#888">{l}</text>
        ))}
        {selected && <rect x={0} y={0} width={px(w)} height={px(h)} rx={4} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'dip') {
    const bodyX = px(0.5), bodyW = px(w) - px(1);
    return (
      <g>
        <rect x={bodyX} y={0} width={bodyW} height={px(h)} rx={3} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        {/* Notch */}
        <ellipse cx={bodyX + bodyW/2} cy={0} rx={px(0.4)} ry={px(0.2)} fill="#111" />
        {/* Left pin headers */}
        {part.pins.filter(p => p.x === 0).map(p => (
          <rect key={p.id} x={0} y={px(p.y)+GRID/2-3} width={px(0.5)} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {/* Right pin headers */}
        {part.pins.filter(p => p.x === 3 || p.x === w-1).map(p => (
          <rect key={p.id} x={bodyX+bodyW} y={px(p.y)+GRID/2-3} width={px(0.5)} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {/* Label */}
        {part.label && (
          <text x={px(w)/2} y={px(h)/2} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fontFamily="monospace" fill="white" style={{whiteSpace:'pre'}}>
            {part.label.split('\n').map((line, i, arr) => (
              <tspan key={i} x={px(w)/2} dy={i === 0 ? -(arr.length-1)*6 : 12}>{line}</tspan>
            ))}
          </text>
        )}
        {selected && <rect x={bodyX} y={0} width={bodyW} height={px(h)} rx={3} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'resistor') {
    const leads = 1.5 * GRID;
    const bodyX = leads, bodyW = px(w) - leads * 2;
    return (
      <g>
        {/* Leads */}
        <line x1={0} y1={GRID/2} x2={leads} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads+bodyW} y1={GRID/2} x2={px(w)} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        {/* Body */}
        <rect x={bodyX} y={GRID/2-6} width={bodyW} height={12} rx={4} fill={part.bodyColor} stroke="#8d6e63" strokeWidth={1} />
        {/* Resistance color bands (decorative) */}
        <rect x={bodyX+8} y={GRID/2-6} width={4} height={12} fill="#333" opacity={0.8} />
        <rect x={bodyX+14} y={GRID/2-6} width={4} height={12} fill="#e53935" opacity={0.8} />
        <rect x={bodyX+20} y={GRID/2-6} width={4} height={12} fill="#e53935" opacity={0.8} />
        <rect x={bodyX+bodyW-10} y={GRID/2-6} width={4} height={12} fill="#ffd600" opacity={0.8} />
        {selected && <rect x={bodyX} y={GRID/2-6} width={bodyW} height={12} rx={4} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'led') {
    const leads = 1 * GRID;
    const domeR = 10, bodyX = leads;
    const color = part.indicatorColor ?? part.bodyColor;
    return (
      <g>
        {/* Leads */}
        <line x1={0} y1={GRID/2} x2={leads} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads+domeR*1.5} y1={GRID/2} x2={px(w)} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        {/* Flat cathode side */}
        <polygon points={`${bodyX},${GRID/2-10} ${bodyX},${GRID/2+10} ${bodyX+domeR},${GRID/2}`}
          fill={color} stroke={part.bodyColor} strokeWidth={1} />
        {/* Dome anode */}
        <circle cx={bodyX+domeR} cy={GRID/2} r={domeR} fill={color} stroke={part.bodyColor} strokeWidth={1} />
        {/* Shine */}
        <ellipse cx={bodyX+domeR-3} cy={GRID/2-4} rx={3} ry={5} fill="white" opacity={0.35} />
        {selected && <circle cx={bodyX+domeR} cy={GRID/2} r={domeR+2} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'button') {
    return (
      <g>
        <rect x={px(0.5)} y={px(0.5)} width={px(w)-px(1)} height={px(h)-px(1)} rx={2} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        {/* Corner leads */}
        {part.pins.map(p => (
          <rect key={p.id} x={px(p.x)+GRID/2-3} y={px(p.y)+GRID/2-3} width={6} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {/* Button cap */}
        <circle cx={px(w)/2} cy={px(h)/2} r={GRID*0.4} fill="#78909c" stroke="#546e7a" strokeWidth={1} />
        <circle cx={px(w)/2} cy={px(h)/2} r={GRID*0.28} fill="#90a4ae" />
        {selected && <rect x={px(0.5)} y={px(0.5)} width={px(w)-px(1)} height={px(h)-px(1)} rx={2} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'capacitor') {
    const leads = 1 * GRID;
    const bodyX = leads, bodyW = GRID * 1.2;
    return (
      <g>
        <line x1={0} y1={GRID/2} x2={leads} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads+bodyW} y1={GRID/2} x2={px(w)} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <rect x={bodyX} y={GRID/2-9} width={bodyW} height={18} rx={3} fill={part.bodyColor} stroke="#f57f17" strokeWidth={1} />
        {selected && <rect x={bodyX} y={GRID/2-9} width={bodyW} height={18} rx={3} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'transistor') {
    const bodyR = GRID * 0.7;
    const cx = px(w)/2, cy = GRID * 0.5;
    return (
      <g>
        {/* D-shaped body */}
        <path d={`M ${cx} ${cy-bodyR} A ${bodyR} ${bodyR} 0 1 1 ${cx} ${cy+bodyR} L ${cx} ${cy-bodyR} Z`}
          fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        {/* Flat side */}
        <line x1={cx} y1={cy-bodyR} x2={cx} y2={cy+bodyR} stroke={strokeColor} strokeWidth={strokeWidth} />
        {/* Leads */}
        {part.pins.map(p => (
          <line key={p.id} x1={px(p.x)+GRID/2} y1={px(p.y)} x2={px(p.x)+GRID/2} y2={cy+bodyR} stroke="#bbb" strokeWidth={2} />
        ))}
        <text x={cx-4} y={cy+4} fontSize={7} fontFamily="monospace" fill="white">{part.label}</text>
        {selected && <circle cx={cx} cy={cy} r={bodyR+2} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  // Generic IC / ic shape
  return (
    <g>
      <rect x={2} y={2} width={px(w)-4} height={px(h)-4} rx={3} fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
      {/* Left side pins */}
      {part.pins.filter(p => p.x === 0).map(p => (
        <line key={p.id} x1={0} y1={px(p.y)+GRID/2} x2={2} y2={px(p.y)+GRID/2} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {/* Right side pins */}
      {part.pins.filter(p => p.x === w-1 || p.x === w).map(p => (
        <line key={p.id} x1={px(w)-2} y1={px(p.y)+GRID/2} x2={px(w)} y2={px(p.y)+GRID/2} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {/* Bottom pins */}
      {part.pins.filter(p => p.y === h-1 || p.y === h).map(p => (
        <line key={p.id} x1={px(p.x)+GRID/2} y1={px(h)-2} x2={px(p.x)+GRID/2} y2={px(h)} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {part.label && (
        <text x={px(w)/2} y={px(h)/2} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fontFamily="monospace" fill="white">
          {part.label.split('\n').map((line, i, arr) => (
            <tspan key={i} x={px(w)/2} dy={i === 0 ? -(arr.length-1)*6 : 12}>{line}</tspan>
          ))}
        </text>
      )}
      {selected && <rect x={2} y={2} width={px(w)-4} height={px(h)-4} rx={3} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
    </g>
  );
}

// ── Pin dots (shown in wire mode or when hovering) ────────────────────────────

function PinDots({ part, activeWireMode, snapPinKey }: {
  part: PartDef;
  activeWireMode: boolean;
  snapPinKey: string | null;
}) {
  if (!activeWireMode && !snapPinKey) return null;
  return (
    <>
      {part.pins.map(p => {
        const key = `${p.x},${p.y}`;
        const isSnapped = snapPinKey === key;
        return (
          <circle
            key={p.id}
            cx={px(p.x) + GRID / 2}
            cy={px(p.y) + GRID / 2}
            r={isSnapped ? 6 : 4}
            fill={isSnapped ? '#4fc3f7' : 'rgba(79,195,247,0.4)'}
            stroke={isSnapped ? '#4fc3f7' : 'rgba(79,195,247,0.6)'}
            strokeWidth={1}
            style={{ cursor: 'crosshair' }}
          />
        );
      })}
    </>
  );
}

function px(v: number) { return v * GRID; }

// ── Snap helpers ──────────────────────────────────────────────────────────────

interface SnapTarget { gx: number; gy: number; pinKey?: string; compId?: string }

function snapToNearest(
  gx: number, gy: number,
  components: ComponentPlacement[],
  wireMode: boolean,
): SnapTarget {
  if (!wireMode) return { gx: Math.round(gx), gy: Math.round(gy) };

  let best: SnapTarget = { gx: Math.round(gx), gy: Math.round(gy) };
  let bestDist = SNAP_RADIUS;

  for (const comp of components) {
    const part = getPartDef(comp.partId);
    if (!part) continue;
    for (const pin of part.pins) {
      const px_ = comp.x + pin.x + 0.5;
      const py_ = comp.y + pin.y + 0.5;
      const dist = Math.hypot(gx - px_, gy - py_);
      if (dist < bestDist) {
        bestDist = dist;
        best = { gx: px_, gy: py_, pinKey: `${pin.x},${pin.y}`, compId: comp.id };
      }
    }
  }
  return best;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  pendingPartId: string | null;
  onPendingPartConsumed: () => void;
}

export function BreadboardCanvas({ pendingPartId, onPendingPartConsumed }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: 800, h: 600 });

  // Schema state
  const [components, setComponents] = useState<ComponentPlacement[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);

  // Interaction
  const [mode, setMode] = useState<InteractionMode>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'component' | 'wire' | null>(null);
  const [wirePoints, setWirePoints] = useState<WirePoint[]>([]);
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0]);
  const [cursorSnap, setCursorSnap] = useState<SnapTarget>({ gx: 0, gy: 0 });
  const [hoveredPinKey, setHoveredPinKey] = useState<{compId: string, pinKey: string} | null>(null);

  // View
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);

  // Drag refs (avoid stale closures)
  const dragRef = useRef<{
    type: 'pan' | 'component';
    compId?: string;
    startClientX: number;
    startClientY: number;
    origPanX?: number;
    origPanY?: number;
    origCompX?: number;
    origCompY?: number;
    moved: boolean;
  } | null>(null);

  // Track mode in ref for event handlers
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pendingPartIdRef = useRef(pendingPartId);
  pendingPartIdRef.current = pendingPartId;
  const componentsRef = useRef(components);
  componentsRef.current = components;
  const wirePointsRef = useRef(wirePoints);
  wirePointsRef.current = wirePoints;
  const wireColorRef = useRef(wireColor);
  wireColorRef.current = wireColor;
  const cursorSnapRef = useRef(cursorSnap);
  cursorSnapRef.current = cursorSnap;
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSvgSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Switch to place mode when a part is selected in the library
  useEffect(() => {
    if (pendingPartId) {
      setMode('place');
      setSelectedId(null);
      setSelectedType(null);
      setWirePoints([]);
    }
  }, [pendingPartId]);

  // Coordinate conversion
  const clientToGrid = useCallback((clientX: number, clientY: number): { gx: number; gy: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const p = panRef.current;
    const z = zoomRef.current;
    return { gx: (sx - p.x) / (z * GRID), gy: (sy - p.y) / (z * GRID) };
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (modeRef.current === 'wire' && wirePointsRef.current.length > 0) {
        setWirePoints([]);
      } else if (modeRef.current === 'place') {
        setMode('select');
        onPendingPartConsumed();
      } else {
        setSelectedId(null);
        setSelectedType(null);
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !(e.target instanceof HTMLInputElement)) {
      if (selectedId && selectedType === 'component') {
        setComponents(cs => cs.filter(c => c.id !== selectedId));
        setSelectedId(null); setSelectedType(null);
      } else if (selectedId && selectedType === 'wire') {
        setWires(ws => ws.filter(w => w.id !== selectedId));
        setSelectedId(null); setSelectedType(null);
      }
    }
    if (e.ctrlKey && e.key === 'z') {
      // Simple undo: remove last component or wire
      if (wires.length > 0) {
        setWires(ws => ws.slice(0, -1));
      } else if (components.length > 0) {
        setComponents(cs => cs.slice(0, -1));
      }
    }
  }, [selectedId, selectedType, wires, components, onPendingPartConsumed]);

  // ── Mouse events ────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const { gx, gy } = clientToGrid(e.clientX, e.clientY);
    const snap = snapToNearest(gx, gy, componentsRef.current, modeRef.current === 'wire');
    setCursorSnap(snap);
    if (snap.compId && snap.pinKey) {
      setHoveredPinKey({ compId: snap.compId, pinKey: snap.pinKey });
    } else {
      setHoveredPinKey(null);
    }

    const dr = dragRef.current;
    if (!dr) return;

    const dx = e.clientX - dr.startClientX;
    const dy = e.clientY - dr.startClientY;
    if (Math.hypot(dx, dy) > 3) dr.moved = true;
    if (!dr.moved) return;

    if (dr.type === 'pan') {
      setPan({ x: (dr.origPanX ?? 0) + dx, y: (dr.origPanY ?? 0) + dy });
    } else if (dr.type === 'component' && dr.compId) {
      const z = zoomRef.current;
      const newGx = Math.round((dr.origCompX ?? 0) + dx / (z * GRID));
      const newGy = Math.round((dr.origCompY ?? 0) + dy / (z * GRID));
      setComponents(cs => cs.map(c =>
        c.id === dr.compId ? { ...c, x: newGx, y: newGy } : c
      ));
    }
  }, [clientToGrid]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle or right mouse → pan
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      dragRef.current = {
        type: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        origPanX: panRef.current.x,
        origPanY: panRef.current.y,
        moved: false,
      };
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(z => {
      const nz = Math.max(0.2, Math.min(4, z * factor));
      // Zoom toward cursor
      setPan(p => ({
        x: cx - (cx - p.x) * (nz / z),
        y: cy - (cy - p.y) * (nz / z),
      }));
      return nz;
    });
  }, []);

  // Click on canvas background
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (dragRef.current?.moved) return;
    const { gx, gy } = clientToGrid(e.clientX, e.clientY);

    if (modeRef.current === 'place' && pendingPartIdRef.current) {
      const part = getPartDef(pendingPartIdRef.current);
      if (!part) return;
      const newComp: ComponentPlacement = {
        id: crypto.randomUUID(),
        partId: pendingPartIdRef.current,
        x: Math.round(gx),
        y: Math.round(gy),
        rotation: 0,
      };
      setComponents(cs => [...cs, newComp]);
      // Stay in place mode (allow repeated placement)
    } else if (modeRef.current === 'wire') {
      const snap = snapToNearest(gx, gy, componentsRef.current, true);
      if (wirePointsRef.current.length === 0) {
        // Start new wire
        setWirePoints([{ x: snap.gx, y: snap.gy }]);
      } else {
        // Add point or finish (double-click finishes)
        if (e.detail === 2 || (snap.compId && snap.pinKey && wirePointsRef.current.length > 0)) {
          // Finish wire
          if (wirePointsRef.current.length >= 1) {
            const newWire: Wire = {
              id: crypto.randomUUID(),
              points: [...wirePointsRef.current, { x: snap.gx, y: snap.gy }],
              color: wireColorRef.current,
            };
            setWires(ws => [...ws, newWire]);
          }
          setWirePoints([]);
        } else {
          setWirePoints(pts => [...pts, { x: snap.gx, y: snap.gy }]);
        }
      }
    } else {
      // Deselect
      setSelectedId(null);
      setSelectedType(null);
    }
  }, [clientToGrid]);

  // Click on a component
  const handleComponentClick = useCallback((compId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current?.moved) return;
    if (modeRef.current === 'select') {
      setSelectedId(compId);
      setSelectedType('component');
    }
  }, []);

  const handleComponentMouseDown = useCallback((compId: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (modeRef.current !== 'select') return;
    const comp = componentsRef.current.find(c => c.id === compId);
    if (!comp) return;
    dragRef.current = {
      type: 'component',
      compId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origCompX: comp.x,
      origCompY: comp.y,
      moved: false,
    };
  }, []);

  const handleWireClick = useCallback((wireId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (modeRef.current === 'select') {
      setSelectedId(wireId);
      setSelectedType('wire');
    }
  }, []);

  // ── Save / Load ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const schema: ElectronicsSchema = { version: 1, components, wires };
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'breadboard.elec.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [components, wires]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.elec.json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const schema = JSON.parse(ev.target!.result as string) as ElectronicsSchema;
          setComponents(schema.components ?? []);
          setWires(schema.wires ?? []);
          setSelectedId(null);
          setSelectedType(null);
          setWirePoints([]);
        } catch {
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleClear = useCallback(() => {
    if (!window.confirm('Clear the entire schematic?')) return;
    setComponents([]);
    setWires([]);
    setSelectedId(null);
    setSelectedType(null);
    setWirePoints([]);
  }, []);

  // ── Derived render values ──────────────────────────────────────────────────

  const transformStr = `translate(${pan.x},${pan.y}) scale(${zoom})`;
  const inWireMode = mode === 'wire';

  // Pending part ghost (follows cursor)
  const pendingPart = pendingPartId ? getPartDef(pendingPartId) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5,
        bgcolor: 'background.paper', borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v: InteractionMode | null) => {
            if (v) {
              setMode(v);
              if (v !== 'place') onPendingPartConsumed();
              if (v !== 'wire') setWirePoints([]);
            }
          }}
          size="small"
          sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25 } }}
        >
          <Tooltip title="Select / Move (V)">
            <ToggleButton value="select"><NearMeIcon sx={{ fontSize: 16 }} /></ToggleButton>
          </Tooltip>
          <Tooltip title="Draw Wire (W)">
            <ToggleButton value="wire"><CableIcon sx={{ fontSize: 16 }} /></ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>

        {/* Wire color picker */}
        {inWireMode && (
          <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
            {WIRE_COLORS.map(c => (
              <Box
                key={c}
                onClick={() => setWireColor(c)}
                sx={{
                  width: 16, height: 16, borderRadius: '50%', bgcolor: c,
                  border: wireColor === c ? '2px solid #fff' : '2px solid transparent',
                  cursor: 'pointer', flexShrink: 0,
                }}
              />
            ))}
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Undo last (Ctrl+Z)">
          <IconButton size="small" onClick={() => {
            if (wires.length > 0) setWires(ws => ws.slice(0, -1));
            else if (components.length > 0) setComponents(cs => cs.slice(0, -1));
          }}>
            <UndoIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Delete selected (Del)">
          <span>
            <IconButton size="small" disabled={!selectedId} onClick={() => {
              if (selectedId && selectedType === 'component')
                setComponents(cs => cs.filter(c => c.id !== selectedId));
              else if (selectedId && selectedType === 'wire')
                setWires(ws => ws.filter(w => w.id !== selectedId));
              setSelectedId(null); setSelectedType(null);
            }}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Zoom in">
          <IconButton size="small" onClick={() => setZoom(z => Math.min(4, z * 1.25))}>
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom out">
          <IconButton size="small" onClick={() => setZoom(z => Math.max(0.2, z / 1.25))}>
            <RemoveIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
          <Tooltip title="Open file"><IconButton size="small" onClick={handleLoad} sx={{ fontSize: 11, color: 'text.secondary' }}>Open</IconButton></Tooltip>
          <Tooltip title="Save file"><IconButton size="small" onClick={handleSave} sx={{ fontSize: 11, color: 'text.secondary' }}>Save</IconButton></Tooltip>
          <Tooltip title="Clear all"><IconButton size="small" onClick={handleClear} sx={{ fontSize: 11, color: 'error.main' }}>Clear</IconButton></Tooltip>
        </Box>
      </Box>

      {/* Canvas */}
      <Box
        ref={containerRef}
        sx={{ flex: 1, overflow: 'hidden', bgcolor: '#1a1a1a', position: 'relative' }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Mode hint */}
        <Box sx={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 10,
          fontSize: 11, fontFamily: 'monospace', color: 'text.disabled',
          pointerEvents: 'none',
        }}>
          {mode === 'place' && pendingPart && `Placing: ${pendingPart.name} — click to place · Esc to cancel`}
          {mode === 'wire' && wirePoints.length === 0 && 'Wire mode — click on a pin or anywhere to start'}
          {mode === 'wire' && wirePoints.length > 0 && `Wire in progress (${wirePoints.length} pts) — click to add point · double-click or click pin to finish · Esc to cancel`}
          {mode === 'select' && selectedId && 'Del to delete · drag to move'}
        </Box>

        <svg
          ref={svgRef}
          width={svgSize.w}
          height={svgSize.h}
          style={{ display: 'block', cursor: mode === 'place' ? 'crosshair' : mode === 'wire' ? 'crosshair' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleSvgClick}
          onWheel={handleWheel}
          onContextMenu={e => e.preventDefault()}
        >
          <defs>
            {/* Dot grid background pattern */}
            <pattern id="dotgrid" x={pan.x % (GRID * zoom)} y={pan.y % (GRID * zoom)}
              width={GRID * zoom} height={GRID * zoom} patternUnits="userSpaceOnUse">
              <circle cx={GRID * zoom / 2} cy={GRID * zoom / 2} r={Math.max(0.5, zoom * 1.2)} fill="#333" />
            </pattern>
          </defs>
          {/* Background grid */}
          <rect width={svgSize.w} height={svgSize.h} fill="#1a1a1a" />
          <rect width={svgSize.w} height={svgSize.h} fill="url(#dotgrid)" />

          <g transform={transformStr}>
            {/* Placed wires */}
            {wires.map(wire => (
              <polyline
                key={wire.id}
                points={wire.points.map(p => `${p.x * GRID},${p.y * GRID}`).join(' ')}
                stroke={wire.color}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ cursor: 'pointer' }}
                onClick={e => handleWireClick(wire.id, e)}
                opacity={selectedId === wire.id ? 1 : 0.85}
                filter={selectedId === wire.id ? 'drop-shadow(0 0 3px #4fc3f7)' : undefined}
              />
            ))}

            {/* Placed components */}
            {components.map(comp => {
              const part = getPartDef(comp.partId);
              if (!part) return null;
              const isSelected = selectedId === comp.id;
              const hpk = hoveredPinKey?.compId === comp.id ? hoveredPinKey.pinKey : null;
              return (
                <g
                  key={comp.id}
                  transform={`translate(${comp.x * GRID},${comp.y * GRID})`}
                  style={{ cursor: mode === 'select' ? 'pointer' : 'crosshair' }}
                  onClick={e => handleComponentClick(comp.id, e)}
                  onMouseDown={e => handleComponentMouseDown(comp.id, e)}
                >
                  <PartBody part={part} w={part.width} h={part.height} selected={isSelected} />
                  <PinDots part={part} activeWireMode={inWireMode} snapPinKey={hpk} />
                </g>
              );
            })}

            {/* Wire in progress */}
            {inWireMode && wirePoints.length > 0 && (
              <>
                <polyline
                  points={[...wirePoints, { x: cursorSnap.gx, y: cursorSnap.gy }]
                    .map(p => `${p.x * GRID},${p.y * GRID}`).join(' ')}
                  stroke={wireColor}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="6 4"
                  opacity={0.75}
                />
                {/* Start point dot */}
                <circle cx={wirePoints[0].x * GRID} cy={wirePoints[0].y * GRID} r={5} fill={wireColor} opacity={0.9} />
              </>
            )}

            {/* Snap indicator */}
            {(inWireMode || mode === 'place') && (
              <circle
                cx={cursorSnap.gx * GRID}
                cy={cursorSnap.gy * GRID}
                r={4}
                fill="none"
                stroke="#4fc3f7"
                strokeWidth={1.5}
                opacity={0.7}
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* Ghost for component being placed */}
            {mode === 'place' && pendingPart && (
              <g
                transform={`translate(${Math.round(cursorSnap.gx) * GRID},${Math.round(cursorSnap.gy) * GRID})`}
                opacity={0.6}
                style={{ pointerEvents: 'none' }}
              >
                <PartBody part={pendingPart} w={pendingPart.width} h={pendingPart.height} selected={false} />
              </g>
            )}
          </g>
        </svg>
      </Box>
    </Box>
  );
}
