import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrailRoute, HoverState } from '../types';
import { cumulativeDistances } from '../utils/routeAnalysis';

interface Props {
  route: TrailRoute;
  hover: HoverState | null;
  onHoverProgress: (progress: number | null, coordIndex: number | null) => void;
}

const W = 600;
const H = 120;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 28;
const INNER_H = H - PAD_T - PAD_B;

export function ElevationChart({ route, hover, onHoverProgress }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(W);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSvgWidth(el.clientWidth || W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = svgWidth - PAD_L - PAD_R;

  const { cumDist, minElev, maxElev, totalDist, pathD, fillD, gridYs } =
    useMemo(() => {
      const coords = route.coordinates;
      const elevations = coords.map((c) => c[2]);
      const cumDist = cumulativeDistances(coords);
      const totalDist = cumDist[cumDist.length - 1] || 1;
      const minElev = Math.min(...elevations);
      const maxElev = Math.max(...elevations);
      const elevRange = (maxElev - minElev) || 1;

      const toX = (i: number) => PAD_L + (cumDist[i] / totalDist) * innerW;
      const toY = (e: number) => PAD_T + INNER_H - ((e - minElev) / elevRange) * INNER_H;

      const pts = coords.map((_, i) => `${toX(i)},${toY(elevations[i])}`);
      const pathD = `M ${pts.join(' L ')}`;
      const fillD = `M ${PAD_L},${PAD_T + INNER_H} L ${pts.join(' L ')} L ${toX(coords.length - 1)},${PAD_T + INNER_H} Z`;

      // Y-grid lines (4 intervals)
      const gridYs: { y: number; label: string }[] = [];
      for (let i = 0; i <= 4; i++) {
        const e = minElev + (elevRange * i) / 4;
        gridYs.push({ y: toY(e), label: `${Math.round(e)}` });
      }

      return { elevations, cumDist, minElev, maxElev, totalDist, pathD, fillD, gridYs };
    }, [route, innerW]);

  // X-grid labels (distance ticks)
  const xTicks = useMemo(() => {
    const count = Math.min(8, Math.floor(totalDist) + 1);
    const step = totalDist / count;
    const ticks: { x: number; label: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const d = i * step;
      ticks.push({
        x: PAD_L + (d / totalDist) * innerW,
        label: `${d.toFixed(1)}`,
      });
    }
    return ticks;
  }, [totalDist, innerW]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD_L;
    const progress = Math.max(0, Math.min(1, x / innerW));
    const targetDist = progress * totalDist;

    // Find closest coordinate
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < cumDist.length; i++) {
      const diff = Math.abs(cumDist[i] - targetDist);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    onHoverProgress(progress, best);
  }

  function handleMouseLeave() {
    onHoverProgress(null, null);
  }

  const hoverX =
    hover && hover.routeId === route.id
      ? PAD_L + (hover.distanceFromStart / totalDist) * innerW
      : null;

  const elevRange = (maxElev - minElev) || 1;
  const hoverY =
    hoverX != null && hover
      ? PAD_T + INNER_H - ((hover.elevation - minElev) / elevRange) * INNER_H
      : null;

  return (
    <svg
      ref={svgRef}
      width={svgWidth}
      height={H}
      style={{ display: 'block', cursor: 'crosshair', userSelect: 'none' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <linearGradient id={`elev-fill-${route.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#4fc3f7" stopOpacity="0.05" />
        </linearGradient>
        <clipPath id={`clip-${route.id}`}>
          <rect x={PAD_L} y={PAD_T} width={innerW} height={INNER_H} />
        </clipPath>
      </defs>

      {/* Y grid */}
      {gridYs.map(({ y, label }) => (
        <g key={label}>
          <line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke="#333" strokeWidth={1} />
          <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize={10} fill="#888">
            {label}
          </text>
        </g>
      ))}

      {/* X grid labels */}
      {xTicks.map(({ x, label }) => (
        <text key={label} x={x} y={H - 6} textAnchor="middle" fontSize={10} fill="#666">
          {label}
        </text>
      ))}

      {/* Area fill */}
      <path
        d={fillD}
        fill={`url(#elev-fill-${route.id})`}
        clipPath={`url(#clip-${route.id})`}
      />

      {/* Elevation line */}
      <path
        d={pathD}
        fill="none"
        stroke="#4fc3f7"
        strokeWidth={2}
        clipPath={`url(#clip-${route.id})`}
      />

      {/* Hover cursor */}
      {hoverX != null && hoverY != null && (
        <g>
          <line x1={hoverX} y1={PAD_T} x2={hoverX} y2={PAD_T + INNER_H} stroke="#fff" strokeWidth={1} strokeDasharray="3,3" />
          <circle cx={hoverX} cy={hoverY} r={4} fill="#fff" stroke="#4fc3f7" strokeWidth={2} />
          <rect x={hoverX + 6} y={hoverY - 18} width={72} height={16} rx={3} fill="#252526" opacity={0.9} />
          <text x={hoverX + 10} y={hoverY - 7} fontSize={10} fill="#e0e0e0">
            {hover!.elevation.toFixed(0)} m · {hover!.distanceFromStart.toFixed(2)} km
          </text>
        </g>
      )}

      {/* Axis labels */}
      <text x={PAD_L + innerW / 2} y={H - 0} textAnchor="middle" fontSize={9} fill="#555">
        Distance (km)
      </text>
      <text
        x={10}
        y={PAD_T + INNER_H / 2}
        textAnchor="middle"
        fontSize={9}
        fill="#555"
        transform={`rotate(-90, 10, ${PAD_T + INNER_H / 2})`}
      >
        m a.s.l.
      </text>
    </svg>
  );
}
