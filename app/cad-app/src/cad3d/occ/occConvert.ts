import * as THREE from 'three';
import type { OCC } from './occLoader';
import type { SketchFeature } from '../types';

// ── Memory helper ──────────────────────────────────────────────────────────────

type Deletable = { delete(): void };

export class OccScope {
  private owned: Deletable[] = [];
  track<T extends Deletable>(obj: T): T { this.owned.push(obj); return obj; }
  dispose(): void {
    for (let i = this.owned.length - 1; i >= 0; i--) {
      try { this.owned[i].delete(); } catch { /* ignore */ }
    }
    this.owned = [];
  }
}

// ── Plane transform helpers ────────────────────────────────────────────────────

/** Returns a gp_Trsf mapping from the sketch's local XY space to world space. */
export function sketchToWorldTrsf(oc: OCC, sketch: Pick<SketchFeature, 'plane' | 'offset' | 'planeMatrix'>): unknown {
  const trsf = new oc.gp_Trsf_1();

  if (sketch.plane === 'face' && sketch.planeMatrix) {
    // Column-major THREE.Matrix4 → row-major gp_Trsf
    const m = sketch.planeMatrix;
    trsf.SetValues_1(
      m[0], m[4], m[8],  m[12],
      m[1], m[5], m[9],  m[13],
      m[2], m[6], m[10], m[14],
    );
    return trsf;
  }

  if (sketch.plane === 'XY') {
    trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, sketch.offset));
    return trsf;
  }

  if (sketch.plane === 'XZ') {
    // Rotate XY → XZ (local Y becomes world Z), then translate in Y
    const rotTrsf = new oc.gp_Trsf_1();
    rotTrsf.SetRotation_1(
      new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0)),
      Math.PI / 2,
    );
    trsf.SetTranslation_1(new oc.gp_Vec_4(0, sketch.offset, 0));
    trsf.Multiply_1(rotTrsf);
    return trsf;
  }

  // YZ
  const rotTrsf = new oc.gp_Trsf_1();
  rotTrsf.SetRotation_1(
    new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 1, 0)),
    Math.PI / 2,
  );
  trsf.SetTranslation_1(new oc.gp_Vec_4(sketch.offset, 0, 0));
  trsf.Multiply_1(rotTrsf);
  return trsf;
}

// ── Sketch entity → OCC wire ───────────────────────────────────────────────────

type Entity = Record<string, unknown>;

/** Builds closed OCC wires from sketch entities (in local XY plane). Returns wire handles. */
export function entitiesToWires(oc: OCC, entities: Entity[], sc: OccScope): unknown[] {
  const wires: unknown[] = [];

  // 1. Direct closed shapes: circle, rect, closed polyline
  for (const e of entities) {
    const w = tryBuildClosedWire(oc, e, sc);
    if (w) wires.push(w);
  }

  // 2. Chain open segments (lines, arcs, open polylines) into closed contours
  const openSegs = entities.filter(e => !isDirectlyClosed(e));
  const chained = chainSegmentsToWires(oc, openSegs, sc);
  wires.push(...chained);

  return wires;
}

function isDirectlyClosed(e: Entity): boolean {
  return e['type'] === 'circle' || e['type'] === 'rect' ||
    (e['type'] === 'polyline' && (e['closed'] as boolean));
}

function tryBuildClosedWire(oc: OCC, e: Entity, sc: OccScope): unknown | null {
  const type = e['type'] as string;

  if (type === 'circle') {
    const cx = e['cx'] as number, cy = e['cy'] as number, r = e['radius'] as number;
    const ax2 = sc.track(new oc.gp_Ax2_3(
      sc.track(new oc.gp_Pnt_3(cx, cy, 0)),
      sc.track(new oc.gp_Dir_4(0, 0, 1)),
    ));
    const circ = sc.track(new oc.gp_Circ_2(ax2, r));
    const edge = sc.track(new oc.BRepBuilderAPI_MakeEdge_8(circ)).Edge();
    const wb = sc.track(new oc.BRepBuilderAPI_MakeWire_2(edge));
    return wb.Wire();
  }

  if (type === 'rect') {
    const x = e['x'] as number, y = e['y'] as number;
    const w = e['width'] as number, h = e['height'] as number;
    const pts = [
      sc.track(new oc.gp_Pnt_3(x, y, 0)),
      sc.track(new oc.gp_Pnt_3(x + w, y, 0)),
      sc.track(new oc.gp_Pnt_3(x + w, y + h, 0)),
      sc.track(new oc.gp_Pnt_3(x, y + h, 0)),
    ];
    const wb = sc.track(new oc.BRepBuilderAPI_MakeWire_1());
    for (let i = 0; i < 4; i++) {
      const edge = sc.track(new oc.BRepBuilderAPI_MakeEdge_3(pts[i], pts[(i + 1) % 4])).Edge();
      wb.Add_1(edge);
    }
    return wb.Wire();
  }

  if (type === 'polyline' && (e['closed'] as boolean)) {
    const pts2 = e['points'] as Array<{ x: number; y: number }>;
    if (pts2.length < 3) return null;
    const wb = sc.track(new oc.BRepBuilderAPI_MakeWire_1());
    for (let i = 0; i < pts2.length; i++) {
      const p1 = sc.track(new oc.gp_Pnt_3(pts2[i].x, pts2[i].y, 0));
      const p2 = sc.track(new oc.gp_Pnt_3(pts2[(i + 1) % pts2.length].x, pts2[(i + 1) % pts2.length].y, 0));
      wb.Add_1(sc.track(new oc.BRepBuilderAPI_MakeEdge_3(p1, p2)).Edge());
    }
    return wb.Wire();
  }

  return null;
}

interface ChainSeg {
  sx: number; sy: number;
  ex: number; ey: number;
  addToWire(oc: OCC, wb: unknown, sc: OccScope): void;
}

function entityToChainSeg(e: Entity): ChainSeg | null {
  const type = e['type'] as string;

  if (type === 'line') {
    const x1 = e['x1'] as number, y1 = e['y1'] as number;
    const x2 = e['x2'] as number, y2 = e['y2'] as number;
    return {
      sx: x1, sy: y1, ex: x2, ey: y2,
      addToWire(oc, wb, sc) {
        const edge = sc.track(new oc.BRepBuilderAPI_MakeEdge_3(
          sc.track(new oc.gp_Pnt_3(x1, y1, 0)),
          sc.track(new oc.gp_Pnt_3(x2, y2, 0)),
        )).Edge();
        (wb as { Add_1(e: unknown): void }).Add_1(edge);
      },
    };
  }

  if (type === 'arc') {
    const cx = e['cx'] as number, cy = e['cy'] as number, r = e['radius'] as number;
    const a0 = e['startAngle'] as number, a1 = e['endAngle'] as number;
    return {
      sx: cx + Math.cos(a0) * r, sy: cy + Math.sin(a0) * r,
      ex: cx + Math.cos(a1) * r, ey: cy + Math.sin(a1) * r,
      addToWire(oc, wb, sc) {
        const ax2 = sc.track(new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(cx, cy, 0)),
          sc.track(new oc.gp_Dir_4(0, 0, 1)),
        ));
        const circ = sc.track(new oc.gp_Circ_2(ax2, r));
        const edge = sc.track(new oc.BRepBuilderAPI_MakeEdge_9(circ, a0, a1)).Edge();
        (wb as { Add_1(e: unknown): void }).Add_1(edge);
      },
    };
  }

  if (type === 'polyline') {
    const pts = e['points'] as Array<{ x: number; y: number }>;
    if (pts.length < 2) return null;
    return {
      sx: pts[0].x, sy: pts[0].y,
      ex: pts[pts.length - 1].x, ey: pts[pts.length - 1].y,
      addToWire(oc, wb, sc) {
        for (let i = 0; i < pts.length - 1; i++) {
          const edge = sc.track(new oc.BRepBuilderAPI_MakeEdge_3(
            sc.track(new oc.gp_Pnt_3(pts[i].x, pts[i].y, 0)),
            sc.track(new oc.gp_Pnt_3(pts[i + 1].x, pts[i + 1].y, 0)),
          )).Edge();
          (wb as { Add_1(e: unknown): void }).Add_1(edge);
        }
      },
    };
  }

  return null;
}

const CHAIN_TOL = 0.5;

function chainSegmentsToWires(oc: OCC, entities: Entity[], sc: OccScope): unknown[] {
  const segs: (ChainSeg & { used: boolean; reversed?: boolean })[] = entities
    .map(e => entityToChainSeg(e))
    .filter((s): s is ChainSeg => s !== null)
    .map(s => ({ ...s, used: false }));

  const wires: unknown[] = [];

  for (let si = 0; si < segs.length; si++) {
    if (segs[si].used) continue;
    segs[si].used = true;

    const wb = sc.track(new oc.BRepBuilderAPI_MakeWire_1());
    segs[si].addToWire(oc, wb, sc);

    let chainSx = segs[si].sx, chainSy = segs[si].sy;
    let chainEx = segs[si].ex, chainEy = segs[si].ey;

    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].used) continue;
        const d = (ax: number, ay: number, bx: number, by: number) =>
          Math.hypot(ax - bx, ay - by);
        if (d(segs[i].sx, segs[i].sy, chainEx, chainEy) < CHAIN_TOL) {
          segs[i].addToWire(oc, wb, sc);
          chainEx = segs[i].ex; chainEy = segs[i].ey;
          segs[i].used = true; extended = true; break;
        }
        if (d(segs[i].ex, segs[i].ey, chainEx, chainEy) < CHAIN_TOL) {
          // Reversed — add as reversed line segments
          const pts = reverseEntityPoints(entities.find(e => entityToChainSeg(e) === segs[i]) ?? {});
          for (let pi = 0; pi + 1 < pts.length; pi++) {
            wb.Add_1(sc.track(new oc.BRepBuilderAPI_MakeEdge_3(
              sc.track(new oc.gp_Pnt_3(pts[pi].x, pts[pi].y, 0)),
              sc.track(new oc.gp_Pnt_3(pts[pi + 1].x, pts[pi + 1].y, 0)),
            )).Edge());
          }
          chainEx = segs[i].sx; chainEy = segs[i].sy;
          segs[i].used = true; extended = true; break;
        }
      }
    }

    if (Math.hypot(chainEx - chainSx, chainEy - chainSy) < CHAIN_TOL) {
      try {
        // Close the wire by connecting end back to start
        if (Math.hypot(chainEx - chainSx, chainEy - chainSy) > 0.001) {
          wb.Add_1(sc.track(new oc.BRepBuilderAPI_MakeEdge_3(
            sc.track(new oc.gp_Pnt_3(chainEx, chainEy, 0)),
            sc.track(new oc.gp_Pnt_3(chainSx, chainSy, 0)),
          )).Edge());
        }
        const w = wb.Wire();
        wires.push(w);
      } catch { /* non-planar chain, skip */ }
    }
  }

  return wires;
}

function reverseEntityPoints(e: Entity): Array<{ x: number; y: number }> {
  const type = e['type'] as string;
  if (type === 'line') {
    return [{ x: e['x2'] as number, y: e['y2'] as number }, { x: e['x1'] as number, y: e['y1'] as number }];
  }
  if (type === 'polyline') {
    return [...(e['points'] as Array<{ x: number; y: number }>)].reverse();
  }
  return [];
}

// ── Wire → Face ────────────────────────────────────────────────────────────────

/** Converts a list of OCC wires (in local XY) to a planar OCC Face. */
export function wiresToFace(oc: OCC, wires: unknown[], sc: OccScope): unknown | null {
  if (wires.length === 0) return null;

  // Outer face from first wire
  const faceMaker = sc.track(new oc.BRepBuilderAPI_MakeFace_15(wires[0] as object, false));
  if (!faceMaker.IsDone()) return null;

  // Inner wires (holes) for subsequent wires
  for (let i = 1; i < wires.length; i++) {
    faceMaker.Add(wires[i] as object);
  }

  return faceMaker.Face();
}

// ── Profile points for revolve (2D, from entities) ────────────────────────────

export function entitiesToProfile2D(entities: Entity[]): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (const e of entities) {
    if (e['type'] === 'line') {
      pts.push({ x: e['x1'] as number, y: e['y1'] as number });
      pts.push({ x: e['x2'] as number, y: e['y2'] as number });
    } else if (e['type'] === 'polyline') {
      pts.push(...(e['points'] as Array<{ x: number; y: number }>));
    }
  }
  return pts;
}

// ── OCC Shape → Three.js BufferGeometry ────────────────────────────────────────

export function shapeToThreeMesh(
  oc: OCC,
  shape: unknown,
  linearDeflection = 0.5,
  angularDeflection = 0.3,
): { geo: THREE.BufferGeometry; edgeGeo: THREE.BufferGeometry } {
  // Tessellate
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape as object, linearDeflection, false, angularDeflection, false,
  );
  mesher.Perform_1();

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;

  const faceExplorer = new oc.TopExp_Explorer_2(
    shape as object,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );

  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face_1(faceExplorer.Current());
    const aLoc = new oc.TopLoc_Location_1();
    const poly = oc.BRep_Tool.Triangulation(face, aLoc, 0);

    if (!poly.IsNull()) {
      const p = poly.get();
      const nn = p.NbNodes();
      const isReversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

      // Compute location transform matrix (apply to each vertex)
      let applyLoc = false;
      let locMat: THREE.Matrix4 | null = null;
      if (!aLoc.IsIdentity()) {
        applyLoc = true;
        // Build transform matrix from location's gp_Trsf
        const gt = aLoc.IsIdentity(); // returns bool — we just use identity fallback
        void gt; // suppress unused warning; full location support requires deeper OCC binding
      }

      for (let i = 1; i <= nn; i++) {
        const node = p.Node(i);
        let nx = node.X(), ny = node.Y(), nz = node.Z();
        if (applyLoc && locMat) {
          const v = new THREE.Vector3(nx, ny, nz).applyMatrix4(locMat);
          nx = v.x; ny = v.y; nz = v.z;
        }
        positions.push(nx, ny, nz);

        // Normal — computed from geometry if available
        if (p.HasNormals()) {
          const n = p.Normal(i);
          const flip = isReversed ? -1 : 1;
          normals.push(n.X() * flip, n.Y() * flip, n.Z() * flip);
        } else {
          normals.push(0, 0, isReversed ? -1 : 1);
        }
      }

      const nt = p.NbTriangles();
      for (let i = 1; i <= nt; i++) {
        const tri = p.Triangle(i);
        const n1 = tri.Value(1) - 1 + offset;
        const n2 = tri.Value(2) - 1 + offset;
        const n3 = tri.Value(3) - 1 + offset;
        if (isReversed) {
          indices.push(n1, n3, n2);
        } else {
          indices.push(n1, n2, n3);
        }
      }

      offset += nn;
    }

    faceExplorer.Next();
  }
  faceExplorer.delete();
  mesher.delete();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  if (!geo.attributes['normal'] || (geo.attributes['normal'] as THREE.BufferAttribute).count === 0) {
    geo.computeVertexNormals();
  }

  // Edge wireframe via edge explorer
  const edgePositions: number[] = [];
  const edgeExplorer = new oc.TopExp_Explorer_2(
    shape as object,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (edgeExplorer.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExplorer.Current());
    const aLoc2 = new oc.TopLoc_Location_1();
    const poly3d = oc.BRep_Tool.Polygon3D(edge, aLoc2);
    if (!poly3d.IsNull()) {
      const ep = poly3d.get();
      const enodes = ep.NbNodes();
      for (let i = 1; i <= enodes; i++) {
        const nd = ep.Nodes().Value(i);
        edgePositions.push(nd.X(), nd.Y(), nd.Z());
        if (i > 1) {
          // Add previous vertex again for line segment
          const prev = ep.Nodes().Value(i - 1);
          edgePositions.splice(edgePositions.length - 3, 0, prev.X(), prev.Y(), prev.Z());
        }
      }
    }
    edgeExplorer.Next();
  }
  edgeExplorer.delete();

  const edgeGeo = new THREE.BufferGeometry();
  if (edgePositions.length > 0) {
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  }

  return { geo, edgeGeo };
}

/** Wraps an OCC shape into a Three.js Group with mesh + edge overlay. */
export function shapeToGroup(
  oc: OCC,
  shape: unknown,
  color: THREE.Color,
  featureId: string,
): THREE.Group {
  const group = new THREE.Group();
  const { geo } = shapeToThreeMesh(oc, shape);

  const mat = new THREE.MeshPhongMaterial({
    color,
    side: THREE.DoubleSide,
    shininess: 60,
    specular: new THREE.Color(0x222222),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData['featureId'] = featureId;
  group.add(mesh);

  // Edges
  const edgesGeo = new THREE.EdgesGeometry(geo, 20);
  const edgesMat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.22,
  });
  group.add(new THREE.LineSegments(edgesGeo, edgesMat));

  return group;
}
