/**
 * CadPreview.tsx — płaski podgląd rysunku CAD.
 *
 * Świadomie **mały**: rysuje linie, okręgi, łuki, prostokąty i łamane, a resztę
 * kształtów zaznacza punktem w miejscu ich zasięgu. Pełny renderer rysunku
 * mieszka w cad-app i tam ma zostać — powtórzenie go tutaj dałoby dwa miejsca,
 * w których ten sam rysunek wygląda inaczej.
 *
 * Zadaniem tego podglądu jest **orientacja**: co jest w pliku, gdzie leży
 * zaznaczony obiekt, czy skrypt zrobił to, co miał zrobić.
 */
import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { INode, IScene } from '@mhersztowski/core-cad-viewer';

export interface CadPreviewProps {
  scene: IScene;
  version: number;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
}

interface Punkt { x: number; y: number }

const punkt = (v: unknown): Punkt | null => {
  const p = v as Punkt | undefined;
  return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
};

/** Zasięg rysunku — z niego bierze się układ współrzędnych podglądu. */
function zasieg(wezly: INode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;

  const dodaj = (p: Punkt | null, promien = 0) => {
    if (!p) return;
    minX = Math.min(minX, p.x - promien);
    minY = Math.min(minY, p.y - promien);
    maxX = Math.max(maxX, p.x + promien);
    maxY = Math.max(maxY, p.y + promien);
  };

  for (const w of wezly) {
    const d = w.getData();
    dodaj(punkt(d.start));
    dodaj(punkt(d.end));
    dodaj(punkt(d.center), typeof d.radius === 'number' ? d.radius : 0);
    dodaj(punkt(d.position));
    for (const p of (Array.isArray(d.points) ? d.points : [])) dodaj(punkt(p));
  }

  if (!Number.isFinite(minX)) return { minX: -50, minY: -50, maxX: 50, maxY: 50 };
  // Margines, żeby kształty nie dotykały krawędzi.
  const margines = Math.max(5, (maxX - minX + maxY - minY) * 0.05);
  return { minX: minX - margines, minY: minY - margines, maxX: maxX + margines, maxY: maxY + margines };
}

function Ksztalt({ node, zaznaczony, onSelect }: {
  node: INode;
  zaznaczony: boolean;
  onSelect: (id: string) => void;
}) {
  const d = node.getData();
  const kolor = zaznaczony ? '#1976d2' : '#90a4ae';
  const grubosc = zaznaczony ? 1.6 : 0.8;
  const wspolne = {
    stroke: kolor,
    strokeWidth: grubosc,
    fill: 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    style: { cursor: 'pointer' },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(node.id); },
  };

  const start = punkt(d.start);
  const end = punkt(d.end);
  const center = punkt(d.center);

  if (d.type === 'line' && start && end) {
    return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...wspolne} />;
  }
  if (d.type === 'circle' && center && typeof d.radius === 'number') {
    return <circle cx={center.x} cy={center.y} r={d.radius} {...wspolne} />;
  }
  if (d.type === 'rect' && start && end) {
    return (
      <rect
        x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)}
        width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)}
        {...wspolne}
      />
    );
  }
  if ((d.type === 'polyline' || d.type === 'freehand') && Array.isArray(d.points)) {
    const punkty = (d.points as unknown[]).map(punkt).filter((p): p is Punkt => p !== null);
    if (punkty.length < 2) return null;
    return <polyline points={punkty.map((p) => `${p.x},${p.y}`).join(' ')} {...wspolne} />;
  }
  if (d.type === 'arc' && center && typeof d.radius === 'number') {
    // Łuk rysujemy jako okrąg przerywany — kąty bywają zapisane różnie,
    // a mylący łuk jest gorszy od czytelnej wskazówki „tu jest łuk".
    return <circle cx={center.x} cy={center.y} r={d.radius} {...wspolne} strokeDasharray="2 2" />;
  }

  // Kształt, którego ten podgląd nie rysuje — pokazujemy, że istnieje i gdzie.
  const gdzie = start ?? center ?? punkt(d.position);
  if (!gdzie) return null;
  return <circle cx={gdzie.x} cy={gdzie.y} r={1.5} {...wspolne} fill={kolor} />;
}

export function CadPreview({ scene, version, selectedIds, onSelect }: CadPreviewProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wezly = useMemo(() => scene.getAllNodes().filter((n) => n.getData().type !== 'layer'), [scene, version]);
  const pudlo = useMemo(() => zasieg(wezly), [wezly]);

  if (!wezly.length) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Rysunek jest pusty.</Typography>
      </Box>
    );
  }

  return (
    <svg
      onClick={() => onSelect(null)}
      viewBox={`${pudlo.minX} ${pudlo.minY} ${pudlo.maxX - pudlo.minX} ${pudlo.maxY - pudlo.minY}`}
      style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.02)' }}
      // Rysunek techniczny ma oś Y w górę, a SVG w dół — bez odbicia wszystko
      // byłoby lustrzane wobec tego, co pokazuje cad-app.
      transform="scale(1,-1)"
    >
      {wezly.map((node) => (
        <Ksztalt
          key={node.id}
          node={node}
          zaznaczony={selectedIds.includes(node.id)}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}
