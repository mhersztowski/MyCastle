import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import CableIcon from '@mui/icons-material/Cable';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import UndoIcon from '@mui/icons-material/Undo';
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import FlipToFrontIcon from '@mui/icons-material/FlipToFront';
import FlipToBackIcon from '@mui/icons-material/FlipToBack';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { GRID, SNAP_RADIUS, WIRE_COLORS, pinWorldCenter, rotationOffset, type ComponentPlacement, type Wire, type WirePoint, type InteractionMode, type ElectronicsSchema } from '../../electronics/types';
import { getPartDef } from '../../electronics/partLibrary';
import type { PartDef } from '../../electronics/types';
import { ServerFileBrowser } from '../ServerFileBrowser';
import { ElectronicsPropertiesPanel } from './ElectronicsPropertiesPanel';
import { ELEC_EXT, readFileAt, writeFileAt } from '../../vfs/cadProjectApi';

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
        {/* Right pin headers — on the body's last column */}
        {part.pins.filter(p => p.x === w-1).map(p => (
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
        {/* Leads — end exactly at the pin centres (cell centres) so the visible
            stub doesn't overshoot the breadboard hole. */}
        <line x1={GRID/2} y1={GRID/2} x2={leads} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads+bodyW} y1={GRID/2} x2={px(w)-GRID/2} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
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
        {/* Leads end at the pin centres (cell centres). */}
        <line x1={GRID/2} y1={GRID/2} x2={leads} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads+domeR*1.5} y1={GRID/2} x2={px(w)-GRID/2} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
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
        {/* Leads end at the pin centres (cell centres). */}
        <line x1={GRID/2} y1={GRID/2} x2={leads} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
        <line x1={leads+bodyW} y1={GRID/2} x2={px(w)-GRID/2} y2={GRID/2} stroke="#bbb" strokeWidth={2} />
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
        {/* Leads — end at the pin centres (cell centres). */}
        {part.pins.map(p => (
          <line key={p.id} x1={px(p.x)+GRID/2} y1={px(p.y)+GRID/2} x2={px(p.x)+GRID/2} y2={cy+bodyR} stroke="#bbb" strokeWidth={2} />
        ))}
        <text x={cx-4} y={cy+4} fontSize={7} fontFamily="monospace" fill="white">{part.label}</text>
        {selected && <circle cx={cx} cy={cy} r={bodyR+2} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'buzzer') {
    // Round piezo buzzer — body fills the upper rows, leads drop from the
    // bottom of the body straight down to the pin row.
    const cx = px(w) / 2;
    const bodyAreaH = px(h - 1);          // reserve the last row for pins
    const cy = bodyAreaH / 2;
    const bodyR = Math.min(px(w), bodyAreaH) / 2 - 2;
    return (
      <g>
        <circle cx={cx} cy={cy} r={bodyR} fill={part.bodyColor} stroke="#212121" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={bodyR - 3} fill="none" stroke="#616161" strokeWidth={0.8} />
        {/* Sound hole */}
        <circle cx={cx} cy={cy} r={2.5} fill="#212121" />
        {/* + polarity marker */}
        <text x={cx + bodyR * 0.55} y={cy - bodyR * 0.45} fontSize={8} fontFamily="monospace"
          fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">+</text>
        {/* Leads from the lower edge of the body to each pin centre */}
        {part.pins.map(p => {
          const lx = px(p.x) + GRID / 2;
          const ly = px(p.y) + GRID / 2;
          const dx = lx - cx;
          const inside = dx * dx <= bodyR * bodyR;
          // Start where the vertical line crosses the body circle (lower side);
          // fall back to the body's bottom tangent if the pin sits outside it.
          const y0 = inside ? cy + Math.sqrt(bodyR * bodyR - dx * dx) : cy + bodyR;
          return <line key={p.id} x1={lx} y1={y0} x2={lx} y2={ly} stroke="#bbb" strokeWidth={2} />;
        })}
        {selected && <circle cx={cx} cy={cy} r={bodyR + 2} fill="none" stroke="#4fc3f7" strokeWidth={2} />}
      </g>
    );
  }

  if (part.bodyShape === 'joystick') {
    // PS-style 2-axis thumbstick module (KY-023): square PCB with a round
    // thumbstick centred above the bottom-edge pin header.
    const cx = px(w) / 2;
    const stickR = Math.min(px(w), px(h - 1)) / 2 - 6;
    const cy = stickR + 6;
    return (
      <g>
        <rect x={2} y={2} width={px(w) - 4} height={px(h) - 4} rx={3}
          fill={part.bodyColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        {/* Thumbstick base ring */}
        <circle cx={cx} cy={cy} r={stickR}
          fill="#37474f" stroke="#000" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={stickR * 0.78}
          fill="#455a64" stroke="#263238" strokeWidth={0.8} />
        {/* Thumbstick cap */}
        <circle cx={cx} cy={cy} r={stickR * 0.55}
          fill="#212121" stroke="#000" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={stickR * 0.45}
          fill="#37474f" />
        {/* 2-axis hint */}
        <line x1={cx - stickR * 0.32} y1={cy} x2={cx + stickR * 0.32} y2={cy}
          stroke="#90a4ae" strokeWidth={0.6} opacity={0.7} />
        <line x1={cx} y1={cy - stickR * 0.32} x2={cx} y2={cy + stickR * 0.32}
          stroke="#90a4ae" strokeWidth={0.6} opacity={0.7} />
        {/* Pin headers along the bottom-edge row */}
        {part.pins.filter(p => p.y === h - 1).map(p => (
          <rect key={p.id}
            x={px(p.x) + GRID / 2 - 3} y={px(h) - 6}
            width={6} height={6} rx={1} fill="#c0c0c0" />
        ))}
        {part.label && (
          <text x={cx} y={px(h - 1) - 4} textAnchor="middle" dominantBaseline="alphabetic"
            fontSize={8} fontFamily="monospace" fill="white" opacity={0.85}>
            {part.label}
          </text>
        )}
        {selected && <rect x={2} y={2} width={px(w) - 4} height={px(h) - 4} rx={3}
          fill="none" stroke="#4fc3f7" strokeWidth={2} />}
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
      {/* Bottom pins — exclude corners that are already drawn as left/right pins */}
      {part.pins.filter(p => (p.y === h-1 || p.y === h) && p.x !== 0 && p.x !== w-1 && p.x !== w).map(p => (
        <line key={p.id} x1={px(p.x)+GRID/2} y1={px(h)-2} x2={px(p.x)+GRID/2} y2={px(h)} stroke="#c0c0c0" strokeWidth={2} />
      ))}
      {/* Interior pins — fall back to a small square marker so unusually-placed
          pins (e.g. a header strip mid-body) are still visible on the canvas. */}
      {part.pins.filter(p =>
        p.x !== 0 && p.x !== w-1 && p.x !== w &&
        p.y !== 0 && p.y !== h-1 && p.y !== h
      ).map(p => (
        <rect key={p.id} x={px(p.x)+GRID/2-3} y={px(p.y)+GRID/2-3} width={6} height={6} rx={1} fill="#c0c0c0" />
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

// ── Pin labels (toggled per component via Properties) ─────────────────────────

function PinLabels({ part }: { part: PartDef }) {
  // Labels sit in the component's LOCAL frame and rotate with the package —
  // counter-rotating to keep them upright caused overlap on rotated DIP-style
  // chips because the text axis ended up parallel to the closely-spaced pin
  // row. Letting text rotate with the body matches PCB / breadboard convention
  // (read horizontal chip labels with a slight head tilt) and avoids collisions
  // by aligning each label perpendicular to its pin row.
  const LABEL_INSET = 12;
  const w = part.width, h = part.height;
  return (
    <>
      {part.pins.filter(p => p.label).map(p => {
        const cx = px(p.x) + GRID / 2;
        const cy = px(p.y) + GRID / 2;
        // Shift along ONE axis only — perpendicular to the edge the pin sits on.
        // A combined diagonal shift for corner pins (top-most of a DIP row) was
        // dragging those labels off the pin column once the chip was rotated.
        let ox = 0, oy = 0;
        if (p.x <= 0) ox = LABEL_INSET;
        else if (p.x >= w - 1) ox = -LABEL_INSET;
        else if (p.y <= 0) oy = LABEL_INSET;
        else if (p.y >= h - 1) oy = -LABEL_INSET;
        return (
          <text
            key={p.id}
            x={cx + ox}
            y={cy + oy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={7}
            fontFamily="monospace"
            fill="#4fc3f7"
            stroke="#1a1a1a"
            strokeWidth={2.5}
            paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {p.label}
          </text>
        );
      })}
    </>
  );
}

// ── Free-text label rendered above each component (value / designator) ───────

function ComponentLabel({ part, text, rotation }: { part: PartDef; text: string; rotation: number }) {
  // Anchor above the component's bounding box. Counter-rotating around the
  // anchor keeps the text upright on screen for any component rotation.
  const cx = px(part.width) / 2;
  const cy = -6;
  return (
    <text
      x={cx}
      y={cy}
      transform={`rotate(${-rotation} ${cx} ${cy})`}
      textAnchor="middle"
      dominantBaseline="alphabetic"
      fontSize={10}
      fontFamily="monospace"
      fontWeight={600}
      fill="#fff"
      stroke="#1a1a1a"
      strokeWidth={3}
      paintOrder="stroke"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {text}
    </text>
  );
}

// ── Snap helpers ──────────────────────────────────────────────────────────────

interface SnapTarget { gx: number; gy: number; pinKey?: string; compId?: string }

function snapToNearest(
  gx: number, gy: number,
  components: ComponentPlacement[],
  wireMode: boolean,
): SnapTarget {
  if (!wireMode) return { gx: Math.round(gx), gy: Math.round(gy) };

  // Wire fallback snaps to the half-cell lattice (0, 0.5, 1, 1.5, …) — twice
  // as dense as the integer cell grid. Pin centres and breadboard holes sit at
  // p+0.5, integer cell corners sit at p — both are valid wire vertices and
  // both align with the dotgrid rendered behind the canvas.
  let best: SnapTarget = { gx: Math.round(gx * 2) / 2, gy: Math.round(gy * 2) / 2 };
  let bestDist = SNAP_RADIUS;

  for (const comp of components) {
    const part = getPartDef(comp.partId);
    if (!part) continue;
    for (const pin of part.pins) {
      const c = pinWorldCenter(comp, part, pin);
      const dist = Math.hypot(gx - c.x, gy - c.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { gx: c.x, gy: c.y, pinKey: `${pin.x},${pin.y}`, compId: comp.id };
      }
    }
  }
  return best;
}

// ── Wire junction helpers ─────────────────────────────────────────────────────

/** True if point p lies on segment a–b (small tolerance for float error). */
function pointOnSegment(p: WirePoint, a: WirePoint, b: WirePoint): boolean {
  const EPS = 0.05;
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < EPS) return apx * apx + apy * apy < EPS;
  const cross = apx * aby - apy * abx;
  if ((cross * cross) / len2 > EPS) return false; // perpendicular distance too large
  const t = (apx * abx + apy * aby) / len2;
  return t >= -0.001 && t <= 1.001;
}

/** True if point p lies anywhere on the given wire's polyline. */
function pointOnWire(p: WirePoint, wire: Wire): boolean {
  for (let i = 0; i < wire.points.length - 1; i++) {
    if (pointOnSegment(p, wire.points[i], wire.points[i + 1])) return true;
  }
  return false;
}

/** True if point p touches any of the given wires (electrical junction). */
function isPointOnAnyWire(p: WirePoint, wires: Wire[]): boolean {
  return wires.some(w => pointOnWire(p, w));
}

/** True if point p coincides with a component pin (pin centres are at half-cell). */
function isPointOnAnyPin(p: WirePoint, components: ComponentPlacement[]): boolean {
  for (const comp of components) {
    const part = getPartDef(comp.partId);
    if (!part) continue;
    for (const pin of part.pins) {
      const c = pinWorldCenter(comp, part, pin);
      if (c.x === p.x && c.y === p.y) return true;
    }
  }
  return false;
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
  // Indices into wirePoints that connect to an existing wire (junctions).
  const [wireJunctions, setWireJunctions] = useState<number[]>([]);
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0]);
  const [cursorSnap, setCursorSnap] = useState<SnapTarget>({ gx: 0, gy: 0 });
  const [hoveredPinKey, setHoveredPinKey] = useState<{compId: string, pinKey: string} | null>(null);
  // Rotation (degrees) applied to the next placed component (cycled with R in place mode).
  const [placeRotation, setPlaceRotation] = useState(0);

  // View
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [zoom, setZoom] = useState(1);

  // Server (VFS) open/save dialog
  const [serverBrowser, setServerBrowser] = useState<'open' | 'save' | null>(null);

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
  const wiresRef = useRef(wires);
  wiresRef.current = wires;
  const wireColorRef = useRef(wireColor);
  wireColorRef.current = wireColor;
  const cursorSnapRef = useRef(cursorSnap);
  cursorSnapRef.current = cursorSnap;
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const placeRotationRef = useRef(placeRotation);
  placeRotationRef.current = placeRotation;

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
      setWireJunctions([]);
      setPlaceRotation(0);
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

  // ── Z-order ─────────────────────────────────────────────────────────────────
  // Render order = array order: an element later in the array is drawn on top.
  // Moving the selected element toward the end raises its z-order, toward the
  // start lowers it. Components and wires are independent layers.

  const reorderSelected = useCallback((dir: 1 | -1) => {
    if (!selectedId) return;
    function step<T extends { id: string }>(arr: T[]): T[] {
      const i = arr.findIndex(x => x.id === selectedId);
      if (i < 0) return arr;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = arr.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }
    if (selectedType === 'component') setComponents(step);
    else if (selectedType === 'wire') setWires(step);
  }, [selectedId, selectedType]);

  // ── Keyboard ────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (modeRef.current === 'wire' && wirePointsRef.current.length > 0) {
        // Esc finishes the wire immediately, trimmed back to the last point that
        // connects to another wire or a pin (trailing free segments discarded).
        const pts = wirePointsRef.current;
        let lastConn = -1;
        for (let i = 0; i < pts.length; i++) {
          if (isPointOnAnyWire(pts[i], wiresRef.current) ||
              isPointOnAnyPin(pts[i], componentsRef.current)) {
            lastConn = i;
          }
        }
        const finalPts = lastConn >= 1 ? pts.slice(0, lastConn + 1) : pts;
        if (finalPts.length >= 2) {
          setWires(ws => [...ws, {
            id: crypto.randomUUID(),
            points: finalPts,
            color: wireColorRef.current,
          }]);
        }
        setWirePoints([]);
        setWireJunctions([]);
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
    if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement)) {
      // Place mode: rotate the ghost. Select mode: rotate the selected component.
      if (modeRef.current === 'place') {
        setPlaceRotation(r => (r + 90) % 360);
      } else if (selectedId && selectedType === 'component') {
        setComponents(cs => cs.map(c =>
          c.id === selectedId ? { ...c, rotation: (c.rotation + 90) % 360 } : c
        ));
      }
    }
    if ((e.key === ']' || e.key === '[') && selectedId && !(e.target instanceof HTMLInputElement)) {
      // ] raises z-order, [ lowers it — for the selected component or wire.
      reorderSelected(e.key === ']' ? 1 : -1);
    }
  }, [selectedId, selectedType, wires, components, onPendingPartConsumed, reorderSelected]);

  const rotateSelected = useCallback(() => {
    if (!selectedId || selectedType !== 'component') return;
    setComponents(cs => cs.map(c =>
      c.id === selectedId ? { ...c, rotation: (c.rotation + 90) % 360 } : c
    ));
  }, [selectedId, selectedType]);

  /** Patch the currently selected component (used by the Properties panel). */
  const updateSelectedComponent = useCallback((updates: Partial<ComponentPlacement>) => {
    if (!selectedId || selectedType !== 'component') return;
    setComponents(cs => cs.map(c => (c.id === selectedId ? { ...c, ...updates } : c)));
  }, [selectedId, selectedType]);

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
        rotation: placeRotationRef.current,
      };
      setComponents(cs => [...cs, newComp]);
      // Stay in place mode (allow repeated placement)
    } else if (modeRef.current === 'wire') {
      const snap = snapToNearest(gx, gy, componentsRef.current, true);
      const pt: WirePoint = { x: snap.gx, y: snap.gy };
      const onWire = isPointOnAnyWire(pt, wiresRef.current);
      if (wirePointsRef.current.length === 0) {
        // Start new wire
        setWirePoints([pt]);
        setWireJunctions(onWire ? [0] : []);
      } else {
        // Add point or finish (double-click finishes)
        if (e.detail === 2 || (snap.compId && snap.pinKey && wirePointsRef.current.length > 0)) {
          // Finish wire
          if (wirePointsRef.current.length >= 1) {
            const newWire: Wire = {
              id: crypto.randomUUID(),
              points: [...wirePointsRef.current, pt],
              color: wireColorRef.current,
            };
            setWires(ws => [...ws, newWire]);
          }
          setWirePoints([]);
          setWireJunctions([]);
        } else {
          const newIdx = wirePointsRef.current.length;
          setWirePoints(pts => [...pts, pt]);
          if (onWire) setWireJunctions(js => [...js, newIdx]);
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
    // In wire/place mode the click must bubble to the canvas handler so a wire
    // can start on a pin that sits on top of the component body.
    if (modeRef.current !== 'select') return;
    e.stopPropagation();
    if (dragRef.current?.moved) return;
    setSelectedId(compId);
    setSelectedType('component');
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
    // Let the click bubble in wire/place mode so a new wire can start on top
    // of an existing one.
    if (modeRef.current !== 'select') return;
    e.stopPropagation();
    setSelectedId(wireId);
    setSelectedType('wire');
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
          setWireJunctions([]);
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
    setWireJunctions([]);
  }, []);

  // ── Server (VFS) Save / Load ──────────────────────────────────────────────────

  const handleServerOpen = useCallback(async (dir: string, name: string) => {
    const text = await readFileAt(dir, name, ELEC_EXT);
    const schema = JSON.parse(text) as ElectronicsSchema;
    setComponents(schema.components ?? []);
    setWires(schema.wires ?? []);
    setSelectedId(null);
    setSelectedType(null);
    setWirePoints([]);
    setWireJunctions([]);
  }, []);

  const handleServerSave = useCallback(async (dir: string, name: string) => {
    const schema: ElectronicsSchema = { version: 1, components: componentsRef.current, wires: wiresRef.current };
    await writeFileAt(dir, name, ELEC_EXT, JSON.stringify(schema, null, 2));
  }, []);

  // ── Derived render values ──────────────────────────────────────────────────

  const transformStr = `translate(${pan.x},${pan.y}) scale(${zoom})`;
  const inWireMode = mode === 'wire';

  // Junction dots: a wire vertex that lies on another wire = electrical connection.
  const junctionDots = useMemo(() => {
    const out: { x: number; y: number; color: string }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < wires.length; i++) {
      for (const p of wires[i].points) {
        for (let j = 0; j < wires.length; j++) {
          if (i === j) continue;
          if (pointOnWire(p, wires[j])) {
            const key = `${p.x},${p.y}`;
            if (!seen.has(key)) { seen.add(key); out.push({ x: p.x, y: p.y, color: wires[i].color }); }
            break;
          }
        }
      }
    }
    return out;
  }, [wires]);

  // Pending part ghost (follows cursor)
  const pendingPart = pendingPartId ? getPartDef(pendingPartId) : null;
  const ghostOffset = pendingPart
    ? rotationOffset(pendingPart.width, pendingPart.height, placeRotation)
    : { x: 0, y: 0 };

  // Selected component fed to the Properties panel.
  const selectedComponent = selectedType === 'component' && selectedId
    ? components.find(c => c.id === selectedId) ?? null
    : null;
  const selectedComponentPart = selectedComponent
    ? getPartDef(selectedComponent.partId) ?? null
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
              if (v !== 'wire') { setWirePoints([]); setWireJunctions([]); }
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

        <Tooltip title="Rotate selected 90° (R)">
          <span>
            <IconButton size="small" disabled={selectedType !== 'component'} onClick={rotateSelected}>
              <Rotate90DegreesCwIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Bring forward — raise z-order (])">
          <span>
            <IconButton size="small" disabled={!selectedId} onClick={() => reorderSelected(1)}>
              <FlipToFrontIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Send backward — lower z-order ([)">
          <span>
            <IconButton size="small" disabled={!selectedId} onClick={() => reorderSelected(-1)}>
              <FlipToBackIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
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

        <Box sx={{ display: 'flex', gap: 0.5, ml: 1, alignItems: 'center' }}>
          <Tooltip title="Open from server">
            <IconButton size="small" onClick={() => setServerBrowser('open')}>
              <CloudDownloadOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Save to server">
            <IconButton size="small" onClick={() => setServerBrowser('save')}>
              <CloudUploadOutlinedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open local file"><IconButton size="small" onClick={handleLoad} sx={{ fontSize: 11, color: 'text.secondary' }}>Open</IconButton></Tooltip>
          <Tooltip title="Save local file"><IconButton size="small" onClick={handleSave} sx={{ fontSize: 11, color: 'text.secondary' }}>Save</IconButton></Tooltip>
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
          {mode === 'place' && pendingPart && `Placing: ${pendingPart.name} — click to place · R to rotate · Esc to cancel`}
          {mode === 'wire' && wirePoints.length === 0 && 'Wire mode — click on a pin or anywhere to start'}
          {mode === 'wire' && wirePoints.length > 0 && `Wire in progress (${wirePoints.length} pts) — click to add point · double-click or click pin to finish · Esc finishes at last connection`}
          {mode === 'select' && selectedId && (selectedType === 'component' ? 'Del to delete · drag to move · R to rotate · [ ] z-order' : 'Del to delete · [ ] z-order')}
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
            {/* Dot grid background pattern. In wire mode the lattice is twice as
                dense AND placed at tile corners (world 0, 0.5, 1, …) so dots
                land on integer cell corners AND breadboard / pin half-cell
                positions — matching the wire snap. Other modes keep one dot
                per cell centre. */}
            {(() => {
              const step = (inWireMode ? GRID / 2 : GRID) * zoom;
              const cx = inWireMode ? 0 : step / 2;
              return (
                <pattern id="dotgrid" x={pan.x % step} y={pan.y % step}
                  width={step} height={step} patternUnits="userSpaceOnUse">
                  <circle cx={cx} cy={cx}
                    r={Math.max(0.5, zoom * (inWireMode ? 0.9 : 1.2))} fill="#333" />
                </pattern>
              );
            })()}
          </defs>
          {/* Background grid */}
          <rect width={svgSize.w} height={svgSize.h} fill="#1a1a1a" />
          <rect width={svgSize.w} height={svgSize.h} fill="url(#dotgrid)" />

          <g transform={transformStr}>
            {/* Placed components — drawn below wires so the wire layer stays on top. */}
            {components.map(comp => {
              const part = getPartDef(comp.partId);
              if (!part) return null;
              const isSelected = selectedId === comp.id;
              const hpk = hoveredPinKey?.compId === comp.id ? hoveredPinKey.pinKey : null;
              const off = rotationOffset(part.width, part.height, comp.rotation);
              return (
                <g
                  key={comp.id}
                  transform={`translate(${(comp.x + off.x) * GRID},${(comp.y + off.y) * GRID}) rotate(${comp.rotation})`}
                  style={{ cursor: mode === 'select' ? 'pointer' : 'crosshair' }}
                  onClick={e => handleComponentClick(comp.id, e)}
                  onMouseDown={e => handleComponentMouseDown(comp.id, e)}
                >
                  <PartBody part={part} w={part.width} h={part.height} selected={isSelected} />
                  <PinDots part={part} activeWireMode={inWireMode} snapPinKey={hpk} />
                  {comp.showPinLabels && <PinLabels part={part} />}
                  {comp.userLabel && <ComponentLabel part={part} text={comp.userLabel} rotation={comp.rotation} />}
                </g>
              );
            })}

            {/* Placed wires — always rendered on top of components. Wider transparent
                hit area keeps the thin stroke clickable. */}
            {wires.map(wire => {
              const pts = wire.points.map(p => `${p.x * GRID},${p.y * GRID}`).join(' ');
              const isSelected = selectedId === wire.id;
              return (
                <g key={wire.id}>
                  <polyline
                    points={pts}
                    stroke="transparent"
                    strokeWidth={14}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ cursor: mode === 'select' ? 'pointer' : 'crosshair' }}
                    onClick={e => handleWireClick(wire.id, e)}
                  />
                  <polyline
                    points={pts}
                    stroke={wire.color}
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'none' }}
                    opacity={isSelected ? 1 : 0.85}
                    filter={isSelected ? 'drop-shadow(0 0 3px #4fc3f7)' : undefined}
                  />
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

            {/* Junction dots — committed wire-to-wire connections */}
            {junctionDots.map((d, i) => (
              <circle key={`jd${i}`} cx={d.x * GRID} cy={d.y * GRID} r={4.5}
                fill={d.color} stroke="#1a1a1a" strokeWidth={1.2}
                style={{ pointerEvents: 'none' }} />
            ))}

            {/* Junction dots — in-progress wire connections */}
            {inWireMode && wireJunctions.map(idx => {
              const p = wirePoints[idx];
              if (!p) return null;
              return (
                <circle key={`jp${idx}`} cx={p.x * GRID} cy={p.y * GRID} r={4.5}
                  fill={wireColor} stroke="#1a1a1a" strokeWidth={1.2}
                  style={{ pointerEvents: 'none' }} />
              );
            })}

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
                transform={`translate(${(Math.round(cursorSnap.gx) + ghostOffset.x) * GRID},${(Math.round(cursorSnap.gy) + ghostOffset.y) * GRID}) rotate(${placeRotation})`}
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

      {/* Properties panel — selected component */}
      <ElectronicsPropertiesPanel
        component={selectedComponent}
        part={selectedComponentPart}
        onChange={updateSelectedComponent}
      />

      {serverBrowser && (
        <ServerFileBrowser
          open
          mode={serverBrowser}
          title={serverBrowser === 'open' ? 'Open Schematic from Server' : 'Save Schematic to Server'}
          extension={ELEC_EXT}
          defaultName="breadboard"
          storageKey="cad.electronicsBrowser.dir"
          onClose={() => setServerBrowser(null)}
          onOpen={handleServerOpen}
          onSave={handleServerSave}
        />
      )}
    </Box>
  );
}
