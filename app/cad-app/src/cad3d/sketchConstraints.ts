/**
 * 2D geometric constraint solver dla SketchEditor.
 *
 * Implementacja Newton-Raphson na wektorze parametrów [x0, y0, x1, y1, ...].
 * Każdy constraint definiuje equation `f(params) = 0` — solver iteracyjnie
 * konwerguje żeby wszystkie f równały się 0.
 *
 * Wspiera podstawowe FreeCAD-style constraints:
 * - Coincident (dwa punkty w tym samym miejscu)
 * - Horizontal (linia y1 == y2)
 * - Vertical (linia x1 == x2)
 * - Parallel (dwie linie równoległe — cross product = 0)
 * - Perpendicular (dwie linie prostopadłe — dot product = 0)
 * - Equal length (dwie linie tej samej długości)
 * - Distance (odległość między punktami / długość linii)
 * - Fixed (punkt zablokowany na aktualnej pozycji)
 *
 * Uwaga: to nie jest optymalny solver jak PlaneGCS. Wystarczy dla typowych
 * sketchów CAD (~10-50 constraints).
 */

export type ConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  // Dimensions (constraint z wartością)
  | 'distance'              // ogólna odległość między 2 punktami == value
  | 'horizontal_distance'   // |xa - xb| == value
  | 'vertical_distance'     // |ya - yb| == value
  | 'radius'                // circle.radius == value
  | 'diameter'              // circle.radius * 2 == value
  | 'angle'                 // kąt między 2 liniami == value (deg)
  | 'fixed';                // punkt zablokowany na pozycji

export interface SketchConstraint {
  id: string;
  type: ConstraintType;
  /** Referencje do entities lub punktów. Format zależy od typu constraint.
   *  Dla coincident: 2 point refs (`entityId.point`, np. `line1.p1`, `circle2.center`)
   *  Dla horizontal/vertical: 1 line ref (`entityId`)
   *  Dla parallel/perpendicular/equal: 2 line refs
   *  Dla distance/angle: 2 refs + `value`
   *  Dla fixed: 1 point ref */
  refs: string[];
  /** Wartość dla distance/angle. */
  value?: number;
  /** Widoczność w UI (visibility toggle w panel Constraints). */
  visible?: boolean;
  name?: string;
}

/**
 * Sketch entity (uproszczony — mirrors core-cad EntityRegistry shape).
 * Solver operuje TYLKO na tych 4 typach.
 */
export type SketchEntity =
  | { type: 'line'; id: string; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; id: string; cx: number; cy: number; radius: number }
  | { type: 'rect'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'point'; id: string; x: number; y: number };

/**
 * Parsuje ref w formacie `entityId.point` na `{ entityId, part }`.
 * `part` może być: 'p1', 'p2' (dla linii), 'center' (circle), 'p1'..'p4' (rect),
 * 'position' (point), lub undefined (całe entity — dla parallel/equal).
 */
function parseRef(ref: string): { entityId: string; part?: string } {
  const dotIdx = ref.indexOf('.');
  if (dotIdx < 0) return { entityId: ref };
  return { entityId: ref.slice(0, dotIdx), part: ref.slice(dotIdx + 1) };
}

/**
 * Zwraca [x, y] punktu z entity wg `part`.
 * Rzuca Error jeśli entity/part nie istnieje.
 */
function getPoint(entities: SketchEntity[], ref: string): { x: number; y: number; entityIdx: number; xKey: string; yKey: string } {
  const { entityId, part } = parseRef(ref);
  const idx = entities.findIndex(e => e.id === entityId);
  if (idx < 0) throw new Error(`Entity ${entityId} not found`);
  const e = entities[idx];

  if (e.type === 'line') {
    if (part === 'p1' || !part) return { x: e.x1, y: e.y1, entityIdx: idx, xKey: 'x1', yKey: 'y1' };
    if (part === 'p2')          return { x: e.x2, y: e.y2, entityIdx: idx, xKey: 'x2', yKey: 'y2' };
  } else if (e.type === 'circle') {
    if (part === 'center' || !part) return { x: e.cx, y: e.cy, entityIdx: idx, xKey: 'cx', yKey: 'cy' };
  } else if (e.type === 'rect') {
    if (part === 'p1')          return { x: e.x, y: e.y, entityIdx: idx, xKey: 'x', yKey: 'y' };
    // rect ma 4 corners, ale solver głównie użuwa p1 (position)
  } else if (e.type === 'point') {
    return { x: e.x, y: e.y, entityIdx: idx, xKey: 'x', yKey: 'y' };
  }
  throw new Error(`Cannot get point from ${e.type} with part '${part}'`);
}

/**
 * Zwraca line vector [dx, dy] z entity (jeśli line).
 */
function getLineVec(entities: SketchEntity[], ref: string): { dx: number; dy: number; p1: { x: number; y: number }; p2: { x: number; y: number } } {
  const { entityId } = parseRef(ref);
  const e = entities.find(x => x.id === entityId);
  if (!e || e.type !== 'line') throw new Error(`${entityId} is not a line`);
  return {
    dx: e.x2 - e.x1, dy: e.y2 - e.y1,
    p1: { x: e.x1, y: e.y1 },
    p2: { x: e.x2, y: e.y2 },
  };
}

/**
 * Buduje equation residual dla constraint — zwraca [f(params)] (może być
 * lista wartości gdy constraint daje kilka równań, np. coincident = 2 eqs
 * dla x i y).
 */
function residuals(constraint: SketchConstraint, entities: SketchEntity[]): number[] {
  try {
    switch (constraint.type) {
      case 'coincident': {
        // 2 punkty muszą być w tym samym miejscu: x1-x2=0, y1-y2=0
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        return [a.x - b.x, a.y - b.y];
      }
      case 'horizontal': {
        // Linia horyzontalna: y1 == y2
        const line = getLineVec(entities, constraint.refs[0]);
        return [line.p1.y - line.p2.y];
      }
      case 'vertical': {
        // Linia wertykalna: x1 == x2
        const line = getLineVec(entities, constraint.refs[0]);
        return [line.p1.x - line.p2.x];
      }
      case 'parallel': {
        // Cross product = 0: dx1*dy2 - dy1*dx2 = 0
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        return [a.dx * b.dy - a.dy * b.dx];
      }
      case 'perpendicular': {
        // Dot product = 0: dx1*dx2 + dy1*dy2 = 0
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        return [a.dx * b.dx + a.dy * b.dy];
      }
      case 'equal': {
        // Same length: len_a^2 - len_b^2 = 0 (kwadraty żeby uniknąć sqrt niedokładności)
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        const la2 = a.dx * a.dx + a.dy * a.dy;
        const lb2 = b.dx * b.dx + b.dy * b.dy;
        return [la2 - lb2];
      }
      case 'distance': {
        // Odległość między 2 punktami == value
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        return [d - (constraint.value ?? 0)];
      }
      case 'horizontal_distance': {
        // |xa - xb| == value (używamy kwadratu żeby uniknąć rozgałęzienia na abs)
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        const target = constraint.value ?? 0;
        return [(a.x - b.x) * (a.x - b.x) - target * target];
      }
      case 'vertical_distance': {
        const a = getPoint(entities, constraint.refs[0]);
        const b = getPoint(entities, constraint.refs[1]);
        const target = constraint.value ?? 0;
        return [(a.y - b.y) * (a.y - b.y) - target * target];
      }
      case 'radius': {
        // Znajdź circle w entities i sprawdź radius
        const { entityId } = parseRef(constraint.refs[0]);
        const e = entities.find(x => x.id === entityId);
        if (!e || e.type !== 'circle') return [];
        return [e.radius - (constraint.value ?? 0)];
      }
      case 'diameter': {
        const { entityId } = parseRef(constraint.refs[0]);
        const e = entities.find(x => x.id === entityId);
        if (!e || e.type !== 'circle') return [];
        return [e.radius * 2 - (constraint.value ?? 0)];
      }
      case 'angle': {
        // Kąt między liniami == value (rad)
        const a = getLineVec(entities, constraint.refs[0]);
        const b = getLineVec(entities, constraint.refs[1]);
        const angA = Math.atan2(a.dy, a.dx);
        const angB = Math.atan2(b.dy, b.dx);
        let diff = angB - angA;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return [diff - ((constraint.value ?? 0) * Math.PI / 180)];
      }
      case 'fixed':
      case 'tangent':
        // Fixed jest handled przez lockedIndices (nie w residuals).
        // Tangent — nieimplementowany w MVP.
        return [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Uruchamia Newton-Raphson solver na constraints.
 *
 * Wektor parametrów: dla każdego entity, params zawierają jego pola numeryczne
 * (x1, y1, x2, y2 dla line; cx, cy, radius dla circle; itd.).
 *
 * Solver iteracyjnie przesuwa params żeby zminimalizować sum(residuals^2).
 *
 * @returns updated entities (nowe kopie z zaktualizowanymi parametrami).
 */
export function solveConstraints(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  fixedRefs: string[] = [],
  maxIter = 30,
  tol = 1e-6,
): { entities: SketchEntity[]; converged: boolean; iterations: number; residual: number } {
  if (constraints.length === 0) {
    return { entities: [...entities], converged: true, iterations: 0, residual: 0 };
  }

  // Zbuduj mapę: entityId → array parametrów (x1, y1, x2, y2, ...)
  const paramKeys: Array<{ entityIdx: number; key: string }> = [];
  const workEntities: SketchEntity[] = entities.map(e => ({ ...e } as SketchEntity));
  for (let i = 0; i < workEntities.length; i++) {
    const e = workEntities[i];
    if (e.type === 'line') {
      paramKeys.push({ entityIdx: i, key: 'x1' });
      paramKeys.push({ entityIdx: i, key: 'y1' });
      paramKeys.push({ entityIdx: i, key: 'x2' });
      paramKeys.push({ entityIdx: i, key: 'y2' });
    } else if (e.type === 'circle') {
      paramKeys.push({ entityIdx: i, key: 'cx' });
      paramKeys.push({ entityIdx: i, key: 'cy' });
      paramKeys.push({ entityIdx: i, key: 'radius' });
    } else if (e.type === 'rect') {
      paramKeys.push({ entityIdx: i, key: 'x' });
      paramKeys.push({ entityIdx: i, key: 'y' });
      paramKeys.push({ entityIdx: i, key: 'width' });
      paramKeys.push({ entityIdx: i, key: 'height' });
    } else if (e.type === 'point') {
      paramKeys.push({ entityIdx: i, key: 'x' });
      paramKeys.push({ entityIdx: i, key: 'y' });
    }
  }
  const nParams = paramKeys.length;

  // Zbierz indeksy parametrów LOCKED (fixed constraints + user-provided fixedRefs)
  const lockedParams = new Set<number>();
  const allFixed = [...fixedRefs];
  for (const c of constraints) {
    if (c.type === 'fixed') allFixed.push(...c.refs);
  }
  for (const ref of allFixed) {
    try {
      const pt = getPoint(workEntities, ref);
      // Znajdź indeksy w paramKeys
      for (let i = 0; i < nParams; i++) {
        if (paramKeys[i].entityIdx === pt.entityIdx &&
            (paramKeys[i].key === pt.xKey || paramKeys[i].key === pt.yKey)) {
          lockedParams.add(i);
        }
      }
    } catch { /* skip invalid ref */ }
  }

  // Function do read/write param value
  const getParam = (i: number): number => {
    const { entityIdx, key } = paramKeys[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (workEntities[entityIdx] as any)[key];
  };
  const setParam = (i: number, v: number) => {
    if (lockedParams.has(i)) return;
    const { entityIdx, key } = paramKeys[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (workEntities[entityIdx] as any)[key] = v;
  };

  const eps = 1e-5;

  const evalResiduals = (): number[] => {
    const r: number[] = [];
    for (const c of constraints) {
      r.push(...residuals(c, workEntities));
    }
    return r;
  };

  // Newton-Raphson: dla każdej iteracji policz Jacobian J i rozwiąż
  // J * dx = -r (przez normal equations J^T J dx = -J^T r).
  let converged = false;
  let iter = 0;
  let finalRes = Infinity;

  for (iter = 0; iter < maxIter; iter++) {
    const r = evalResiduals();
    if (r.length === 0) { converged = true; break; }
    finalRes = Math.sqrt(r.reduce((s, x) => s + x * x, 0));
    if (finalRes < tol) { converged = true; break; }

    const nRes = r.length;
    // Policz Jacobian numerycznie (dR/dparam via finite difference)
    // J to matrix nRes × nParams
    const J: number[][] = Array.from({ length: nRes }, () => new Array(nParams).fill(0));
    for (let p = 0; p < nParams; p++) {
      if (lockedParams.has(p)) continue;
      const origVal = getParam(p);
      setParam(p, origVal + eps);
      const rPlus = evalResiduals();
      setParam(p, origVal);
      for (let i = 0; i < nRes; i++) {
        J[i][p] = (rPlus[i] - r[i]) / eps;
      }
    }

    // Normal equations: A = J^T J, b = -J^T r
    // Rozwiąż A * dx = b przez damping (Levenberg-Marquardt lite):
    // (A + λ I) dx = b, λ małe.
    const A: number[][] = Array.from({ length: nParams }, () => new Array(nParams).fill(0));
    const b: number[] = new Array(nParams).fill(0);
    for (let i = 0; i < nParams; i++) {
      for (let j = 0; j < nParams; j++) {
        let sum = 0;
        for (let k = 0; k < nRes; k++) sum += J[k][i] * J[k][j];
        A[i][j] = sum;
      }
      let bi = 0;
      for (let k = 0; k < nRes; k++) bi -= J[k][i] * r[k];
      b[i] = bi;
    }
    // Damping
    const lambda = 1e-6;
    for (let i = 0; i < nParams; i++) A[i][i] += lambda;
    // Fixed params: force dx=0 (zero row + zero col + 1 na diagonal)
    for (const p of lockedParams) {
      for (let j = 0; j < nParams; j++) { A[p][j] = 0; A[j][p] = 0; }
      A[p][p] = 1;
      b[p] = 0;
    }

    const dx = solveGauss(A, b);
    if (!dx) break;

    // Zastosuj update z krokiem tłumienia (żeby nie divergować)
    for (let p = 0; p < nParams; p++) {
      setParam(p, getParam(p) + dx[p]);
    }
  }

  return { entities: workEntities, converged, iterations: iter, residual: finalRes };
}

/** Gauss elimination z partial pivoting. Zwraca solution x lub null gdy singular. */
function solveGauss(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  // Kopiuj żeby nie mutować argumentów
  const M: number[][] = A.map(row => [...row, 0]);
  for (let i = 0; i < n; i++) M[i][n] = b[i];

  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-12) return null; // singular
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    // Eliminacja
    for (let k = i + 1; k < n; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  // Back-substitute
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
}

/** Pretty-printed constraint name dla UI. */
export function constraintTypeLabel(type: ConstraintType): string {
  const labels: Record<ConstraintType, string> = {
    coincident: 'Coincident',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    parallel: 'Parallel',
    perpendicular: 'Perpendicular',
    tangent: 'Tangent',
    equal: 'Equal',
    distance: 'Distance',
    horizontal_distance: 'Horizontal Distance',
    vertical_distance: 'Vertical Distance',
    radius: 'Radius',
    diameter: 'Diameter',
    angle: 'Angle',
    fixed: 'Fixed',
  };
  return labels[type] ?? type;
}
