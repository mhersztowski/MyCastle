import * as THREE from 'three';
import { Project } from '@mhersztowski/core-cad';
import type { ChamferFeature, DatumCsFeature, DatumLineFeature, DatumPlaneFeature, DatumPointFeature, ExtrudeFeature, FeatureTree, FilletFeature, HoleFeature, PocketFeature, RevolveFeature, SketchFeature } from './types';
import { evaluateFeatureTreeOcc } from './occ/occEvaluate';
import { preloadOcc } from './occ/occLoader';

// Start loading OCC WASM as early as possible
preloadOcc();

// Sketch wireframe kolor — ciemniejszy niebieski żeby był widoczny na jasnym tle rendering (light theme).
const SKETCH_COLOR = new THREE.Color('#1976d2');

// ── Sketch wireframe helpers (kept in Three.js for instant display) ──────────

function loadSketchProject(sketch: SketchFeature): Project | null {
  if (!sketch.projectData) return null;
  try { return Project.fromJSON(JSON.parse(sketch.projectData)); } catch { return null; }
}

function entityToLinePoints(entity: Record<string, unknown>): THREE.Vector3[][] {
  const type = entity['type'] as string;
  if (type === 'line') {
    return [[
      new THREE.Vector3(entity['x1'] as number, entity['y1'] as number, 0),
      new THREE.Vector3(entity['x2'] as number, entity['y2'] as number, 0),
    ]];
  }
  if (type === 'rect') {
    const x = entity['x'] as number, y = entity['y'] as number;
    const w = entity['width'] as number, h = entity['height'] as number;
    return [[
      new THREE.Vector3(x, y, 0), new THREE.Vector3(x + w, y, 0),
      new THREE.Vector3(x + w, y + h, 0), new THREE.Vector3(x, y + h, 0),
      new THREE.Vector3(x, y, 0),
    ]];
  }
  if (type === 'circle') {
    const cx = entity['cx'] as number, cy = entity['cy'] as number, r = entity['radius'] as number;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    return [pts];
  }
  if (type === 'polyline') {
    const ps = entity['points'] as Array<{ x: number; y: number }>;
    const closed = entity['closed'] as boolean;
    const verts = ps.map(p => new THREE.Vector3(p.x, p.y, 0));
    if (closed && verts.length > 0) verts.push(verts[0].clone());
    return [verts];
  }
  if (type === 'arc') {
    const cx = entity['cx'] as number, cy = entity['cy'] as number, r = entity['radius'] as number;
    const a0 = entity['startAngle'] as number, a1 = entity['endAngle'] as number;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = a0 + (a1 - a0) * (i / 32);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0));
    }
    return [pts];
  }
  return [];
}

function applyPlaneTransform(
  group: THREE.Group,
  sketch: Pick<SketchFeature, 'plane' | 'offset' | 'planeMatrix'>,
): void {
  if (sketch.plane === 'face' && sketch.planeMatrix) {
    const mat = new THREE.Matrix4().fromArray(sketch.planeMatrix);
    mat.decompose(group.position, group.quaternion, group.scale);
    return;
  }
  switch (sketch.plane) {
    case 'XY': group.position.z = sketch.offset; break;
    case 'XZ': group.rotation.x = Math.PI / 2; group.position.y = sketch.offset; break;
    case 'YZ': group.rotation.y = Math.PI / 2; group.position.x = sketch.offset; break;
  }
}

function applySketch(feature: SketchFeature): THREE.Object3D {
  const group = new THREE.Group();
  group.userData['featureId'] = feature.id;

  // NIE rysujemy półprzezroczystej plane 500×500 — dla szkicu na face bryły
  // plane pokrywała się z bryłą i powodowała efekt "prześwitywania" mimo że
  // opacity=0.04. Wystarczą same linie rysunku szkicu jako wizualna referencja.

  const sketchProject = loadSketchProject(feature);
  if (sketchProject) {
    const lineMat = new THREE.LineBasicMaterial({ color: SKETCH_COLOR, transparent: true, opacity: 0.7 });
    const entities = (sketchProject as Project).entityRegistry.getAll() as unknown as Record<string, unknown>[];
    for (const entity of entities) {
      for (const pts of entityToLinePoints(entity)) {
        if (pts.length < 2) continue;
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geo, lineMat));
      }
    }
  }

  applyPlaneTransform(group, feature);
  return group;
}

// ── Datum / odniesienia (pomoc geometryczna, czyste Three.js — bez OCC) ──────────

const DATUM_COLOR = new THREE.Color('#ffce54'); // żółty (FreeCAD-like)

function buildDatumPoint(f: DatumPointFeature): THREE.Object3D {
  const g = new THREE.Group();
  g.userData['featureId'] = f.id;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(3, 16, 12),
    new THREE.MeshBasicMaterial({ color: DATUM_COLOR }),
  );
  g.add(sphere);
  // Krzyżyk dla czytelności w rzutach.
  const k = 8;
  const pts = [
    new THREE.Vector3(-k, 0, 0), new THREE.Vector3(k, 0, 0),
    new THREE.Vector3(0, -k, 0), new THREE.Vector3(0, k, 0),
    new THREE.Vector3(0, 0, -k), new THREE.Vector3(0, 0, k),
  ];
  const mat = new THREE.LineBasicMaterial({ color: DATUM_COLOR });
  for (let i = 0; i < pts.length; i += 2) {
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pts[i], pts[i + 1]]), mat));
  }
  g.position.set(...f.position);
  return g;
}

function buildDatumLine(f: DatumLineFeature): THREE.Object3D {
  const g = new THREE.Group();
  g.userData['featureId'] = f.id;
  const dir = new THREE.Vector3(...f.direction);
  if (dir.lengthSq() === 0) dir.set(1, 0, 0);
  dir.normalize().multiplyScalar(f.length);
  const a = new THREE.Vector3(...f.position);
  const b = a.clone().add(dir);
  const mat = new THREE.LineBasicMaterial({ color: DATUM_COLOR });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat));
  // Końce.
  for (const p of [a, b]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), new THREE.MeshBasicMaterial({ color: DATUM_COLOR }));
    s.position.copy(p);
    g.add(s);
  }
  return g;
}

function buildDatumPlane(f: DatumPlaneFeature): THREE.Object3D {
  const g = new THREE.Group();
  g.userData['featureId'] = f.id;
  const s = Math.max(1, f.size);
  const planeGeo = new THREE.PlaneGeometry(s, s);
  g.add(new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
    color: DATUM_COLOR, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
  })));
  // Obrys + normalna.
  const h = s / 2;
  const border = [
    new THREE.Vector3(-h, -h, 0), new THREE.Vector3(h, -h, 0),
    new THREE.Vector3(h, h, 0), new THREE.Vector3(-h, h, 0), new THREE.Vector3(-h, -h, 0),
  ];
  const mat = new THREE.LineBasicMaterial({ color: DATUM_COLOR, transparent: true, opacity: 0.8 });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(border), mat));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, s * 0.25)]), mat));
  // Orientacja: domyślna normalna płaszczyzny to +Z; obróć do żądanej.
  const n = new THREE.Vector3(...f.normal);
  if (n.lengthSq() === 0) n.set(0, 0, 1);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.normalize());
  g.position.set(...f.position);
  return g;
}

function buildDatumCs(f: DatumCsFeature): THREE.Object3D {
  const g = new THREE.Group();
  g.userData['featureId'] = f.id;
  g.add(new THREE.AxesHelper(Math.max(1, f.size)));
  const o = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  g.add(o);
  const d2r = Math.PI / 180;
  g.rotation.set(f.rotation[0] * d2r, f.rotation[1] * d2r, f.rotation[2] * d2r);
  g.position.set(...f.position);
  return g;
}

/** Buduje obiekty pomocnicze „datum" (odniesienia) dla całego drzewa (sync, Three.js). */
export function buildDatumHelpers(tree: FeatureTree): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'datum-helpers';
  for (const f of tree.features) {
    if (!f.enabled) continue;
    if (f.type === 'datum_point') root.add(buildDatumPoint(f as DatumPointFeature));
    else if (f.type === 'datum_line') root.add(buildDatumLine(f as DatumLineFeature));
    else if (f.type === 'datum_plane') root.add(buildDatumPlane(f as DatumPlaneFeature));
    else if (f.type === 'datum_cs') root.add(buildDatumCs(f as DatumCsFeature));
  }
  return root;
}

/** Builds sketch wireframe objects for all sketches in the tree (sync, instant). */
export function buildSketchWireframes(tree: FeatureTree): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'sketch-wireframes';
  for (const feature of tree.features) {
    if (feature.enabled && feature.type === 'sketch') {
      root.add(applySketch(feature as SketchFeature));
    }
  }
  return root;
}

/**
 * Bounding box XY entities szkicu (2D). Zwraca środek i rozmiary.
 * Obsługuje: rect, circle, polyline, line.
 */
function entitiesBBoxXY(entities: Record<string, unknown>[]):
  { cx: number; cy: number; sizeX: number; sizeY: number } | null {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  };
  for (const e of entities) {
    const t = e['type'] as string;
    if (t === 'rect') {
      const x = e['x'] as number, y = e['y'] as number;
      const w = e['width'] as number, h = e['height'] as number;
      acc(x, y); acc(x + w, y + h);
    } else if (t === 'circle') {
      const cx = e['cx'] as number, cy = e['cy'] as number, r = e['radius'] as number;
      acc(cx - r, cy - r); acc(cx + r, cy + r);
    } else if (t === 'polyline') {
      const pts = (e['points'] as Array<{ x: number; y: number }>) ?? [];
      for (const p of pts) acc(p.x, p.y);
    } else if (t === 'line') {
      acc(e['x1'] as number, e['y1'] as number);
      acc(e['x2'] as number, e['y2'] as number);
    }
  }
  if (!isFinite(xMin) || !isFinite(yMax)) return null;
  return {
    cx: (xMin + xMax) / 2,
    cy: (yMin + yMax) / 2,
    sizeX: Math.max(1, xMax - xMin),
    sizeY: Math.max(1, yMax - yMin),
  };
}

/**
 * Wireframe preview bryły extrude/pocket + strzałka kierunku prism.
 * Rysuje: półprzezroczysty box, ostre czerwone/niebieskie edges, strzałkę.
 */
function buildFeaturePreview(
  feature: ExtrudeFeature | PocketFeature,
  tree: FeatureTree,
): THREE.Object3D | null {
  const sketch = tree.features.find(
    f => f.id === feature.sketchId && f.type === 'sketch',
  ) as SketchFeature | undefined;
  if (!sketch || !sketch.projectData) return null;

  const proj = loadSketchProject(sketch);
  if (!proj) return null;
  const entities = proj.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  if (entities.length === 0) return null;

  const bbox = entitiesBBoxXY(entities);
  if (!bbox) return null;

  const isPocket = feature.type === 'pocket';
  const color = isPocket ? 0xff2a2a : 0x2aa8ff;

  // Depth uwzględniając through_all
  const depth = feature.extrudeType === 'through_all'
    ? 200
    : Math.max(1, Math.abs(feature.height));
  const sign = feature.reversed ? -1 : 1;

  // Preview box centrowany na centroidzie bboxa; przesunięty w local Z zgodnie
  // z direction/reversed/symmetric — tak samo jak faktyczny prism.
  const centerZ = feature.symmetric ? 0 : (sign * depth) / 2;

  const group = new THREE.Group();
  group.userData['isPreview'] = true;

  // Edges preview — WIDOCZNE PRZEZ BRYŁĘ. Bez tego preview extrude był w tym
  // samym miejscu co wynikowa bryła → cały preview zakryty przez solid mesh.
  // depthTest=false + renderOrder rysuje edges NAD wszystkim (X-ray view).
  const boxGeo = new THREE.BoxGeometry(bbox.sizeX, bbox.sizeY, depth);
  const edgesGeo = new THREE.EdgesGeometry(boxGeo);
  const edgesMat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });
  const edges = new THREE.LineSegments(edgesGeo, edgesMat);
  edges.position.set(bbox.cx, bbox.cy, centerZ);
  edges.renderOrder = 999;
  group.add(edges);
  boxGeo.dispose();

  // Strzałka kierunku prism — od plane szkicu (Z=0 local) w kierunku prism.
  // Również z depthTest: false — widoczna nawet gdy prism jest wewnątrz bryły.
  const arrowLen = feature.symmetric ? depth / 2 : depth;
  const arrowDirZ = sign;
  const dir = new THREE.Vector3(0, 0, arrowDirZ);
  const origin = new THREE.Vector3(bbox.cx, bbox.cy, 0);
  const arrow = new THREE.ArrowHelper(
    dir, origin, arrowLen,
    color, arrowLen * 0.25, arrowLen * 0.14,
  );
  arrow.traverse(obj => {
    if ((obj as THREE.Mesh).material) {
      const m = (obj as THREE.Mesh).material as THREE.Material;
      m.depthTest = false; m.depthWrite = false;
    }
    if ((obj as THREE.Line).material) {
      const m = (obj as THREE.Line).material as THREE.Material;
      m.depthTest = false; m.depthWrite = false;
    }
    obj.renderOrder = 999;
  });
  group.add(arrow);

  // Aplikuj transformację plane szkicu → world.
  applyPlaneTransform(group, sketch);

  return group;
}

/**
 * Wireframe preview dla Hole — dla każdego okręgu w sketch rysuje przezroczysty
 * walec + strzałkę pokazującą kierunek wiercenia. Kolor czerwony (jak pocket)
 * bo Hole to operacja subtraktywna.
 */
function buildHolePreview(
  feature: HoleFeature,
  tree: FeatureTree,
): THREE.Object3D | null {
  const sketch = tree.features.find(
    f => f.id === feature.sketchId && f.type === 'sketch',
  ) as SketchFeature | undefined;
  if (!sketch) return null;

  const proj = loadSketchProject(sketch);
  if (!proj) return null;
  const entities = proj.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  const circles = entities.filter(e => e['type'] === 'circle');
  if (circles.length === 0) return null;

  const color = 0xff2a2a; // czerwony — Hole to cut
  const radius = Math.max(0.5, (feature.diameter ?? 6) / 2);
  const through = feature.depthType === 'through_all';
  const depth = through ? 200 : Math.max(1, feature.depth ?? 25);

  // Kierunek wiercenia — tak jak w evalHole:
  // sketch on face → -Z sketch (do wnętrza bryły)
  // sketch on plane XY/XZ/YZ → +Z sketch (do bryły która stoi po +normal)
  const isOnFace = sketch.plane === 'face';
  const defaultSign = isOnFace ? -1 : 1;
  const sign = feature.reversed ? -defaultSign : defaultSign;

  const group = new THREE.Group();
  group.userData['isPreview'] = true;

  const cylinderMat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });

  for (const c of circles) {
    const cx = c['cx'] as number;
    const cy = c['cy'] as number;

    // Wireframe walca — CylinderGeometry Three.js jest wzdłuż osi Y,
    // rotujemy tak żeby były wzdłuż lokalnej osi Z sketch.
    const cylGeo = new THREE.CylinderGeometry(radius, radius, depth, 24, 1, false);
    // Rotate Y-up cylinder → Z-up
    cylGeo.rotateX(Math.PI / 2);
    const edgesGeo = new THREE.EdgesGeometry(cylGeo);
    const edges = new THREE.LineSegments(edgesGeo, cylinderMat);
    // Position — centrum walca w połowie głębokości od plane szkicu w kierunku sign
    edges.position.set(cx, cy, (sign * depth) / 2);
    edges.renderOrder = 999;
    group.add(edges);
    cylGeo.dispose();

    // Strzałka kierunku wiercenia — od plane szkicu w kierunku dna otworu
    const arrowLen = depth;
    const dirVec = new THREE.Vector3(0, 0, sign);
    const origin = new THREE.Vector3(cx, cy, 0);
    const arrow = new THREE.ArrowHelper(
      dirVec, origin, arrowLen,
      color, arrowLen * 0.25, arrowLen * 0.14,
    );
    arrow.traverse(obj => {
      if ((obj as THREE.Mesh).material) {
        const m = (obj as THREE.Mesh).material as THREE.Material;
        m.depthTest = false; m.depthWrite = false;
      }
      if ((obj as THREE.Line).material) {
        const m = (obj as THREE.Line).material as THREE.Material;
        m.depthTest = false; m.depthWrite = false;
      }
      obj.renderOrder = 999;
    });
    group.add(arrow);
  }

  applyPlaneTransform(group, sketch);
  return group;
}

/**
 * Wireframe preview dla Revolve/Groove:
 *  - Pomarańczowa oś obrotu (długa linia z strzałką kierunku)
 *  - Kopie profilu obrócone o różne kąty (sweep visualization) —
 *    niebieskie dla Revolve additive, czerwone dla Groove subtractive
 *
 * Kopie są w local sketch space i respektują wybrane pole `axis` (X/Y/Z),
 * kąty `angle` / `angle2` oraz `reversed`.
 */
function buildRevolveAxisPreview(
  feature: RevolveFeature,
  tree: FeatureTree,
): THREE.Object3D | null {
  const sketch = tree.features.find(
    f => f.id === feature.sketchId && f.type === 'sketch',
  ) as SketchFeature | undefined;
  if (!sketch) return null;

  // Kierunek osi w local sketch space (analogicznie do evalRevolve)
  let axDir: [number, number, number] = [0, 1, 0];
  if (feature.axis === 'sketch_horizontal' || feature.axis === 'X') axDir = [1, 0, 0];
  else if (feature.axis === 'Z') axDir = [0, 0, 1];
  if (feature.reversed) axDir = [-axDir[0], -axDir[1], -axDir[2]];

  // Zakres kątów (analogicznie do evalRevolve)
  const typeExt = feature.revolveTypeExt;
  const isTwoAngles = typeExt === 'two_angles';
  const isToLast = typeExt === 'to_last' || feature.revolveType === 'through_all';
  const angle1 = Math.max(1, Math.min(360, feature.angle));
  const angle2 = Math.max(0, Math.min(360, feature.angle2 ?? 0));
  const totalDeg = isToLast ? 360 : (isTwoAngles ? Math.min(360, angle1 + angle2) : angle1);
  const isSymmetric = feature.revolveType === 'symmetric' ||
    (feature.revolveType === 'dimension' && feature.symmetric && !isTwoAngles);
  const phiStartDeg = isTwoAngles ? -angle2 : (isSymmetric ? -totalDeg / 2 : 0);

  const group = new THREE.Group();
  group.userData['isPreview'] = true;

  // ── Oś obrotu ──────────────────────────────────────────────────────────────
  const axisColor = 0xff8800;
  const axisLen = 500;
  const linePoints = [
    new THREE.Vector3(-axisLen * axDir[0], -axisLen * axDir[1], -axisLen * axDir[2]),
    new THREE.Vector3( axisLen * axDir[0],  axisLen * axDir[1],  axisLen * axDir[2]),
  ];
  const axisLineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
  const axisLineMat = new THREE.LineBasicMaterial({
    color: axisColor, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });
  const axisLine = new THREE.Line(axisLineGeo, axisLineMat);
  axisLine.renderOrder = 999;
  group.add(axisLine);

  const axisArrow = new THREE.ArrowHelper(
    new THREE.Vector3(...axDir), new THREE.Vector3(0, 0, 0), 60,
    axisColor, 15, 8,
  );
  axisArrow.traverse(obj => {
    if ((obj as THREE.Mesh).material) {
      const m = (obj as THREE.Mesh).material as THREE.Material;
      m.depthTest = false; m.depthWrite = false;
    }
    if ((obj as THREE.Line).material) {
      const m = (obj as THREE.Line).material as THREE.Material;
      m.depthTest = false; m.depthWrite = false;
    }
    obj.renderOrder = 999;
  });
  group.add(axisArrow);

  // ── Profile sweep — kopie profilu obrócone o różne kąty ────────────────────
  // feature.type może być 'groove' po cast — signature ma 'revolve' dla ergonomii typów
  const isGroove = (feature.type as string) === 'groove';
  const profileColor = isGroove ? 0xff2a2a : 0x2aa8ff;
  const proj = loadSketchProject(sketch);
  if (!proj) {
    applyPlaneTransform(group, sketch);
    return group;
  }
  const entities = proj.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  if (entities.length === 0) {
    applyPlaneTransform(group, sketch);
    return group;
  }

  // Zbierz points wszystkich entities (dla drawing wireframe)
  const profilePolylines: THREE.Vector3[][] = [];
  for (const e of entities) {
    for (const pts of entityToLinePoints(e)) {
      if (pts.length >= 2) profilePolylines.push(pts);
    }
  }
  if (profilePolylines.length === 0) {
    applyPlaneTransform(group, sketch);
    return group;
  }

  const axisVec = new THREE.Vector3(...axDir).normalize();
  const totalRad = (totalDeg * Math.PI) / 180;
  const phiStartRad = (phiStartDeg * Math.PI) / 180;

  // ── (a) Start i end profile — mocno widoczne krawędzie zakresu ──────────────
  const profileMat = new THREE.LineBasicMaterial({
    color: profileColor, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });
  for (const phiRad of [phiStartRad, phiStartRad + totalRad]) {
    for (const pts of profilePolylines) {
      const rotatedPts = pts.map(p => p.clone().applyAxisAngle(axisVec, phiRad));
      const geo = new THREE.BufferGeometry().setFromPoints(rotatedPts);
      const line = new THREE.Line(geo, profileMat);
      line.renderOrder = 999;
      group.add(line);
    }
  }

  // ── (b) Kilka pośrednich kopii (lżejsze linie) ─────────────────────────────
  const intermediateCount = Math.max(0, Math.min(6, Math.round(totalDeg / 60) - 1));
  const midMat = new THREE.LineBasicMaterial({
    color: profileColor, transparent: true, opacity: 0.35,
    depthTest: false, depthWrite: false,
  });
  for (let i = 1; i <= intermediateCount; i++) {
    const t = i / (intermediateCount + 1);
    const phiRad = phiStartRad + t * totalRad;
    for (const pts of profilePolylines) {
      const rotatedPts = pts.map(p => p.clone().applyAxisAngle(axisVec, phiRad));
      const geo = new THREE.BufferGeometry().setFromPoints(rotatedPts);
      const line = new THREE.Line(geo, midMat);
      line.renderOrder = 999;
      group.add(line);
    }
  }

  // ── (c) ARC — ślad każdego wierzchołka profilu wokół osi (trajectory) ──────
  // To wizualizuje CAŁY ZAKRES kątów — kluczowa różnica vs poprzednia wersja.
  const arcMat = new THREE.LineBasicMaterial({
    color: profileColor, transparent: true, opacity: 0.55,
    depthTest: false, depthWrite: false,
  });
  const arcSteps = Math.max(12, Math.round(totalDeg / 5)); // gęstość łuku
  for (const pts of profilePolylines) {
    // Bierzemy tylko unikalne wierzchołki (żeby nie multiplikować dla polyline z closed)
    const seen = new Set<string>();
    for (const p of pts) {
      const key = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Arc w zakresie [phiStartRad, phiStartRad + totalRad]
      const arcPts: THREE.Vector3[] = [];
      for (let s = 0; s <= arcSteps; s++) {
        const phi = phiStartRad + (s / arcSteps) * totalRad;
        arcPts.push(p.clone().applyAxisAngle(axisVec, phi));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(arcPts);
      const arc = new THREE.Line(geo, arcMat);
      arc.renderOrder = 999;
      group.add(arc);
    }
  }

  applyPlaneTransform(group, sketch);
  return group;
}

/**
 * Highlight edges wybranych w Fillet/Chamfer — pomarańczowe grube linie w scenie.
 * Rysuje sfery na midpoint edge z hint (nie prawdziwe krawędzie, bo bryła
 * przed fillet może nie mieć dokładnie tych samych edges jak przy dodawaniu).
 */
function buildEdgeSelectionPreview(
  feature: FilletFeature | ChamferFeature,
): THREE.Object3D | null {
  const edges = feature.edges ?? [];
  if (edges.length === 0) return null;

  const group = new THREE.Group();
  group.userData['isPreview'] = true;

  const color = 0xff8800; // pomarańczowy — kolor wybranej krawędzi
  const highlightMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false,
  });

  for (const e of edges) {
    // Sfera w midpoint edge
    const sphereGeo = new THREE.SphereGeometry(3, 12, 8);
    const sphere = new THREE.Mesh(sphereGeo, highlightMat);
    sphere.position.set(e.hintPoint[0], e.hintPoint[1], e.hintPoint[2]);
    sphere.renderOrder = 999;
    group.add(sphere);

    // Krótka linia w kierunku tangent (żeby pokazać orientację edge)
    const tanLen = 8;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(
        e.hintPoint[0] - tanLen * e.hintNormal[0],
        e.hintPoint[1] - tanLen * e.hintNormal[1],
        e.hintPoint[2] - tanLen * e.hintNormal[2],
      ),
      new THREE.Vector3(
        e.hintPoint[0] + tanLen * e.hintNormal[0],
        e.hintPoint[1] + tanLen * e.hintNormal[1],
        e.hintPoint[2] + tanLen * e.hintNormal[2],
      ),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.9,
      depthTest: false, depthWrite: false,
      linewidth: 3,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 999;
    group.add(line);
  }

  return group;
}

/**
 * Full async evaluation via OpenCascade.js WASM.
 * Returns a Three.js scene graph with all solid features tessellated.
 * Gdy `selectedId` wskazuje na feature typu extrude/pocket/hole, dorzuca
 * overlay wireframe preview pokazujący kierunek i objętość operacji.
 */
export async function evaluateFeatureTreeAsync(
  tree: FeatureTree,
  project: Project,
  selectedId?: string | null,
): Promise<THREE.Object3D> {
  // EDIT MODE dla Fillet/Chamfer: gdy user zaznaczy Fillet/Chamfer w drzewie,
  // po tym feature bryła nie ma już ostrych krawędzi (arc zamiast edges).
  // Żeby user mógł wybrać krawędzie do zaokrąglenia, ewaluujemy drzewo
  // POMIJAJĄC ten feature — dostajemy stan PRZED nim (bryła z ostrymi edges,
  // klikalna w trybie Edge select).
  let workingTree = tree;
  const selectedFeature = selectedId ? tree.features.find(f => f.id === selectedId) : null;
  const isEditingEdgeOp = selectedFeature && selectedFeature.enabled
    && (selectedFeature.type === 'fillet' || selectedFeature.type === 'chamfer');
  if (isEditingEdgeOp) {
    // Zbuduj kopię drzewa bez wybranego Fillet/Chamfer (skip go w ewaluacji)
    workingTree = {
      ...tree,
      features: tree.features.map(f =>
        f.id === selectedId ? { ...f, enabled: false } : f
      ),
    };
  }

  const sketchesPlaceholder = new THREE.Group();
  sketchesPlaceholder.name = 'sketch-wireframes-placeholder';
  const root = await evaluateFeatureTreeOcc(workingTree, project, sketchesPlaceholder);
  // Teraz tree.features mają updated planeMatrix — zbuduj wireframes.
  const sketches = buildSketchWireframes(workingTree);
  root.add(sketches);
  root.add(buildDatumHelpers(workingTree));

  if (isEditingEdgeOp && selectedFeature) {
    // Highlight WYBRANE edges (pomarańczowe sfery + linie w midpoints)
    const edgePreview = buildEdgeSelectionPreview(selectedFeature as FilletFeature | ChamferFeature);
    if (edgePreview) root.add(edgePreview);
    console.log('[evaluate] EDIT MODE dla Fillet/Chamfer — bryła PRZED, edges wybrane:',
      (selectedFeature as FilletFeature).edges?.length ?? 0);
  }

  if (selectedId && !isEditingEdgeOp) {
    // Preview overlays tylko gdy NIE jesteśmy w edit mode dla edges
    const selected = tree.features.find(f => f.id === selectedId);
    if (selected && selected.enabled) {
      if (selected.type === 'extrude' || selected.type === 'pocket') {
        const preview = buildFeaturePreview(
          selected as ExtrudeFeature | PocketFeature,
          tree,
        );
        if (preview) root.add(preview);
      } else if (selected.type === 'hole') {
        const preview = buildHolePreview(selected as HoleFeature, tree);
        if (preview) root.add(preview);
      } else if (selected.type === 'revolve' || selected.type === 'groove') {
        const preview = buildRevolveAxisPreview(selected as RevolveFeature, tree);
        if (preview) root.add(preview);
      }
    }
  }

  return root;
}
