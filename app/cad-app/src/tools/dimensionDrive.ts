import type { DimensionEntity, Entity, Point2D, Project } from '@mhersztowski/core-cad';
import { translateEntity } from './entityTransform';

function dist(a: Point2D, b: Point2D): number { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Encje, do których odnosi się wymiar (z kotwic). */
export function dimRefs(dim: DimensionEntity): string[] {
  return [dim.anchor1?.entityId, dim.anchor2?.entityId].filter((x): x is string => !!x);
}

/** Aktualna (zmierzona) wartość wymiaru. */
export function measuredValue(dim: DimensionEntity): number {
  return Math.hypot(dim.x2 - dim.x1, dim.y2 - dim.y1);
}

function apply(project: Project, id: string, changes: Partial<Entity>): void {
  project.entityRegistry.update(id, changes as Record<string, unknown>);
  const e = project.entityRegistry.get(id);
  if (e) project.eventBus.emit('entity:updated', e);
}

/**
 * „Napędza" geometrię tak, by zmierzona wartość wymiaru == `value`.
 * Obsługa: średnica (okrąg/łuk), długość linii, bok prostokąta, oraz ogólna
 * odległość między dwiema encjami (przesunięcie drugiej). Utrzymuje pierwszą stronę.
 */
export function applyDimensionValue(project: Project, dim: DimensionEntity, value: number): void {
  if (!(value > 0)) return;
  const e1 = dim.anchor1?.entityId ? project.entityRegistry.get(dim.anchor1.entityId) : undefined;
  const e2 = dim.anchor2?.entityId ? project.entityRegistry.get(dim.anchor2.entityId) : undefined;

  // Średnica — obie kotwice na tym samym okręgu/łuku.
  if (e1 && e2 && e1.id === e2.id && (e1.type === 'circle' || e1.type === 'arc')) {
    apply(project, e1.id, { radius: Math.max(0.001, value / 2) });
    return;
  }

  const p1 = { x: dim.x1, y: dim.y1 }, p2 = { x: dim.x2, y: dim.y2 };
  const cur = dist(p1, p2);
  if (cur < 1e-6) return;
  const dir = { x: (p2.x - p1.x) / cur, y: (p2.y - p1.y) / cur };

  // Ta sama linia — przesuń koniec bliższy p2, utrzymując drugi.
  if (e1 && e2 && e1.id === e2.id && e1.type === 'line') {
    const lp1 = { x: e1.x1, y: e1.y1 }, lp2 = { x: e1.x2, y: e1.y2 };
    const keep1 = dist(p1, lp1) + dist(p2, lp2) <= dist(p1, lp2) + dist(p2, lp1);
    if (keep1) apply(project, e1.id, { x2: lp1.x + dir.x * value, y2: lp1.y + dir.y * value });
    else apply(project, e1.id, { x1: lp2.x + dir.x * value, y1: lp2.y + dir.y * value });
    return;
  }

  // Ten sam prostokąt — bok poziomy → szerokość, pionowy → wysokość (od narożnika origin).
  if (e1 && e2 && e1.id === e2.id && e1.type === 'rect') {
    if (Math.abs(dir.x) >= Math.abs(dir.y)) apply(project, e1.id, { width: value });
    else apply(project, e1.id, { height: value });
    return;
  }

  // Różne encje — przesuń drugą (lub pierwszą) o różnicę wzdłuż kierunku wymiaru.
  const delta = value - cur;
  if (e2) apply(project, e2.id, translateEntity(e2, dir.x * delta, dir.y * delta));
  else if (e1) apply(project, e1.id, translateEntity(e1, -dir.x * delta, -dir.y * delta));
}
