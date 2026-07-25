import { useEffect, useState } from 'react';
import type { Point2D, Project } from '@mhersztowski/core-cad';
import type { CadRenderer } from '../renderer/CadRenderer';
import { freecadIconUrl } from '../assets/freecadIcons';

export interface SketchConstraintLite {
  id: string;
  type: string;
  refs: string[];
  visible?: boolean;
}

/**
 * Punkt zaczepienia dla auto-constraintów prostokąta (id `rect-<id>-<type>-<i>`):
 * coincident → 4 rogi, vertical → boki L/R, horizontal → boki T/B. Dzięki temu
 * symbole rozkładają się jak w FreeCAD, mimo że rect to pojedyncza encja.
 */
function rectAutoAnchor(project: Project, c: { id: string; type: string; refs: string[] }): Point2D | null {
  const m = /^rect-(.+)-(coincident|vertical|horizontal)-(\d+)$/.exec(c.id);
  if (!m) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = project.entityRegistry.get(m[1]) as any;
  if (!e || e.type !== 'rect') return null;
  const i = Number(m[3]);
  const x0 = e.x, y0 = e.y, x1 = e.x + e.width, y1 = e.y + e.height;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (c.type === 'coincident') return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }][i] ?? null;
  if (c.type === 'vertical') return i === 0 ? { x: x0, y: cy } : { x: x1, y: cy };   // boki pionowe
  return i === 0 ? { x: cx, y: y0 } : { x: cx, y: y1 };                              // horizontal: boki poziome
}

/** Punkt zaczepienia symbolu dla danego ref-a (środek krawędzi / wierzchołek / środek okręgu). */
function refAnchor(project: Project, ref: string): Point2D | null {
  if (ref.startsWith('#')) return null; // oś układu — bez symbolu
  const [id, part] = ref.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = project.entityRegistry.get(id) as any;
  if (!e) return null;
  if (e.type === 'line') {
    if (part === 'p1') return { x: e.x1, y: e.y1 };
    if (part === 'p2') return { x: e.x2, y: e.y2 };
    return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
  }
  if (e.type === 'circle' || e.type === 'arc') return { x: e.cx, y: e.cy };
  if (e.type === 'point') return { x: e.x, y: e.y };
  if (e.type === 'rect') return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
  if (e.type === 'polyline' && e.points.length) return e.points[0];
  return null;
}

interface Props {
  constraints: SketchConstraintLite[];
  project: Project;
  renderer: CadRenderer | null;
  version: number;
}

/**
 * Renderuje małe ikony (symbole) constraintów na canvasie, przy zaznaczanych elementach — jak w FreeCAD.
 * Symbole tego samego elementu są układane obok siebie (stackowanie), stały rozmiar ekranowy.
 */
export function ConstraintSymbolsOverlay({ constraints, project, renderer, version }: Props) {
  const [, force] = useState(0);

  // Re-render przy pan/zoom.
  useEffect(() => {
    if (!renderer) return;
    const prev = renderer.onViewChange;
    renderer.onViewChange = () => { prev?.(); force(v => v + 1); };
    return () => { renderer.onViewChange = prev; };
  }, [renderer]);

  void version; // parent re-renderuje przy zmianach encji/constraintów

  if (!renderer || !constraints.length) return null;

  const perElement = new Map<string, number>();
  const glyphs: Array<{ sx: number; sy: number; url: string; key: string }> = [];
  for (const c of constraints) {
    if (c.visible === false) continue;
    const url = freecadIconUrl(`c_${c.type}`);
    if (!url) continue;
    const rectAnchor = rectAutoAnchor(project, c);
    const anchor = rectAnchor ?? refAnchor(project, c.refs[0]);
    if (!anchor) continue;
    // Auto-constrainty rect mają już odrębne kotwice (rogi/boki) → nie stackuj.
    const idx = rectAnchor ? 0 : (perElement.get(c.refs[0].split('.')[0]) ?? 0);
    if (!rectAnchor) perElement.set(c.refs[0].split('.')[0], idx + 1);
    const s = renderer.worldToScreen(anchor.x, anchor.y);
    glyphs.push({ sx: s.x + 4 + idx * 15, sy: s.y - 14, url, key: c.id });
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {glyphs.map(g => (
        <img
          key={g.key}
          src={g.url}
          width={13}
          height={13}
          alt=""
          style={{ position: 'absolute', left: g.sx, top: g.sy, display: 'block' }}
        />
      ))}
    </div>
  );
}
