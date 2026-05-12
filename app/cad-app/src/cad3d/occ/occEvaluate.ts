import * as THREE from 'three';
import { Project } from '@mhersztowski/core-cad';
import { getOcc, type OCC } from './occLoader';
import {
  OccScope, sketchToWorldTrsf, entitiesToWires, wiresToFace,
  entitiesToProfile2D, shapeToGroup,
} from './occConvert';
import type {
  ExtrudeFeature, FeatureTree, GrooveFeature, HelixFeature,
  HoleFeature, LoftCutFeature, LoftFeature, MirrorFeature, PocketFeature,
  RevolveFeature, ShellFeature, SketchFeature, SweepCutFeature, SweepFeature,
} from '../types';

const SOLID_COLOR = new THREE.Color('#4fc3f7');

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadSketchProject(sketch: SketchFeature): Project | null {
  if (!sketch.projectData) return null;
  try { return Project.fromJSON(JSON.parse(sketch.projectData)); } catch { return null; }
}

function sketchEntities(sketch: SketchFeature): Record<string, unknown>[] {
  const p = loadSketchProject(sketch);
  if (!p) return [];
  return p.entityRegistry.getAll() as unknown as Record<string, unknown>[];
}

function resolveEntities(entityIds: string[], project: Project): Record<string, unknown>[] {
  if (entityIds.length === 0) return project.entityRegistry.getAll() as unknown as Record<string, unknown>[];
  return entityIds
    .map(id => project.entityRegistry.get(id) as unknown as Record<string, unknown> | undefined)
    .filter((e): e is Record<string, unknown> => !!e);
}

/** Applies a gp_Trsf to a shape and returns the transformed shape. */
function transformShape(oc: OCC, shape: unknown, trsf: unknown, sc: OccScope): unknown {
  const builder = sc.track(new oc.BRepBuilderAPI_Transform_2(shape as object, trsf as object, false));
  return builder.Shape();
}

/** Builds an extruded solid from a face + direction vector. */
function extrudeToSolid(oc: OCC, face: unknown, dx: number, dy: number, dz: number, sc: OccScope): unknown | null {
  try {
    const vec = sc.track(new oc.gp_Vec_4(dx, dy, dz));
    const prism = sc.track(new oc.BRepPrimAPI_MakePrism_1(face as object, vec, false, true));
    prism.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!prism.IsDone()) return null;
    return prism.Shape();
  } catch { return null; }
}

/** CSG subtract: base - tool. Returns new shape or null on failure. */
function csgCut(oc: OCC, base: unknown, tool: unknown, sc: OccScope): unknown | null {
  try {
    const cutter = sc.track(new oc.BRepAlgoAPI_Cut_3(
      base as object, tool as object, sc.track(new oc.Message_ProgressRange_1()),
    ));
    cutter.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!cutter.IsDone()) return null;
    return cutter.Shape();
  } catch { return null; }
}

/** CSG fuse: A + B. */
function csgFuse(oc: OCC, a: unknown, b: unknown, sc: OccScope): unknown | null {
  try {
    const fuser = sc.track(new oc.BRepAlgoAPI_Fuse_3(
      a as object, b as object, sc.track(new oc.Message_ProgressRange_1()),
    ));
    fuser.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!fuser.IsDone()) return null;
    return fuser.Shape();
  } catch { return null; }
}

// ── Feature evaluators ─────────────────────────────────────────────────────────

function evalExtrude(oc: OCC, feature: ExtrudeFeature, project: Project, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    let entities: Record<string, unknown>[];
    let sketchRef: SketchFeature | undefined;

    if (feature.sketchId) {
      sketchRef = tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined;
      entities = sketchRef ? sketchEntities(sketchRef) : [];
    } else {
      entities = resolveEntities(feature.entityIds, project);
    }

    const wires = entitiesToWires(oc, entities, sc);
    const face = wiresToFace(oc, wires, sc);
    if (!face) return null;

    const depth = feature.extrudeType === 'through_all' ? 10000 : Math.abs(feature.height);
    const offset = feature.extrudeType === 'symmetric' || (feature.extrudeType === 'dimension' && feature.symmetric)
      ? -depth / 2 : feature.reversed ? -depth : 0;

    // Extrude in local +Z (normal to sketch plane) — symmetry/reverse via offset translation
    let solid = extrudeToSolid(oc, face, 0, 0, depth, sc);
    if (!solid) return null;

    // Translate for offset
    if (offset !== 0) {
      const t = sc.track(new oc.gp_Trsf_1());
      t.SetTranslation_1(sc.track(new oc.gp_Vec_4(0, 0, offset)));
      solid = transformShape(oc, solid, t, sc);
    }

    // Apply sketch plane transform
    const trsf = sketchToWorldTrsf(oc, sketchRef ?? { plane: 'XY', offset: 0 });
    const finalShape = transformShape(oc, solid, trsf, sc);
    return finalShape;
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalRevolve(oc: OCC, feature: RevolveFeature, project: Project, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    let entities: Record<string, unknown>[];
    let sketchRef: SketchFeature | undefined;

    if (feature.sketchId) {
      sketchRef = tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined;
      entities = sketchRef ? sketchEntities(sketchRef) : [];
    } else {
      entities = resolveEntities(feature.entityIds, project);
    }

    const profile = entitiesToProfile2D(entities);
    if (profile.length < 2) return null;

    // Build wire from profile points
    const wb = sc.track(new oc.BRepBuilderAPI_MakeWire_1());
    for (let i = 0; i < profile.length - 1; i++) {
      wb.Add_1(sc.track(new oc.BRepBuilderAPI_MakeEdge_3(
        sc.track(new oc.gp_Pnt_3(profile[i].x, profile[i].y, 0)),
        sc.track(new oc.gp_Pnt_3(profile[i + 1].x, profile[i + 1].y, 0)),
      )).Edge());
    }
    const wire = wb.Wire();

    const revolveType = feature.revolveType ?? 'dimension';
    const angleDeg = revolveType === 'through_all' ? 360 : Math.max(1, Math.min(360, feature.angle));
    const angleRad = (angleDeg * Math.PI) / 180;
    const isSymmetric = revolveType === 'symmetric' || (revolveType === 'dimension' && feature.symmetric);
    const reversed = feature.reversed;

    // Axis in local sketch space (Y axis by default for 'sketch_vertical')
    let axDir: [number, number, number] = [0, 1, 0];
    if (feature.axis === 'sketch_horizontal' || feature.axis === 'X') axDir = [1, 0, 0];
    else if (feature.axis === 'Z') axDir = [0, 0, 1];

    let phiStart = 0;
    if (isSymmetric) phiStart = -angleRad / 2;
    else if (reversed) phiStart = -angleRad;

    // If symmetric or reversed, pre-rotate wire so revol starts at correct angle
    let workWire: unknown = wire;
    if (phiStart !== 0) {
      const rt = sc.track(new oc.gp_Trsf_1());
      rt.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(
          sc.track(new oc.gp_Pnt_3(0, 0, 0)),
          sc.track(new oc.gp_Dir_4(...axDir)),
        )),
        phiStart,
      );
      workWire = transformShape(oc, wire, rt, sc);
    }

    const revol = sc.track(new oc.BRepPrimAPI_MakeRevol_1(
      workWire as object,
      sc.track(new oc.gp_Ax1_2(
        sc.track(new oc.gp_Pnt_3(0, 0, 0)),
        sc.track(new oc.gp_Dir_4(...axDir)),
      )),
      angleRad,
      true,
    ));
    revol.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!revol.IsDone()) return null;

    const solid = revol.Shape();
    const trsf = sketchToWorldTrsf(oc, sketchRef ?? { plane: 'XY', offset: 0 });
    return transformShape(oc, solid, trsf, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalLoft(oc: OCC, feature: LoftFeature, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    const sections = feature.sections;
    if (sections.length < 2) return null;

    const loftBuilder = sc.track(new oc.BRepOffsetAPI_ThruSections(true, feature.ruled, 1e-6));

    for (const sec of sections) {
      const sketch = tree.features.find(f => f.id === sec.sketchId && f.type === 'sketch') as SketchFeature | undefined;
      if (!sketch) continue;

      const entities = sketchEntities(sketch);
      const wires = entitiesToWires(oc, entities, sc);
      if (wires.length === 0) continue;

      // Transform wire to world space
      const trsf = sketchToWorldTrsf(oc, sketch);
      const worldWire = transformShape(oc, wires[0] as unknown, trsf, sc);
      loftBuilder.AddWire(worldWire as object);
    }

    if (feature.closed) loftBuilder.SetClosing(true);
    loftBuilder.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!loftBuilder.IsDone()) return null;
    return loftBuilder.Shape();
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalSweep(oc: OCC, feature: SweepFeature, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    const profileSketch = feature.profileSketchId
      ? tree.features.find(f => f.id === feature.profileSketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;
    const pathSketch = feature.pathSketchId
      ? tree.features.find(f => f.id === feature.pathSketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;
    if (!profileSketch || !pathSketch) return null;

    // Build profile face
    const profEntities = sketchEntities(profileSketch);
    const profWires = entitiesToWires(oc, profEntities, sc);
    const profFace = wiresToFace(oc, profWires, sc);
    if (!profFace) return null;
    const profTrsf = sketchToWorldTrsf(oc, profileSketch);
    const worldProfFace = transformShape(oc, profFace, profTrsf, sc);

    // Build path wire
    const pathEntities = sketchEntities(pathSketch);
    const pathWires = entitiesToWires(oc, pathEntities, sc);
    // Collect chain wires too — any open segments
    const allPathWires = [...pathWires];
    if (allPathWires.length === 0) return null;

    const pathTrsf = sketchToWorldTrsf(oc, pathSketch);
    const worldPathWire = transformShape(oc, allPathWires[0] as unknown, pathTrsf, sc);

    const pipe = sc.track(new oc.BRepOffsetAPI_MakePipe_1(worldPathWire as object, worldProfFace as object));
    pipe.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!pipe.IsDone()) return null;
    return pipe.Shape();
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalHelix(oc: OCC, feature: HelixFeature, tree: FeatureTree): unknown | null {
  const sc = new OccScope();
  try {
    const { mode, pitch, height, turns, radius, taper, leftHanded, reversed } = feature;

    let h: number, t: number;
    if (mode === 'pitch_height') { h = height; t = h / Math.max(0.001, pitch); }
    else if (mode === 'pitch_turns') { t = Math.max(0.25, turns); h = Math.max(0.001, pitch) * t; }
    else { t = Math.max(0.25, turns); h = height; }

    const steps = Math.max(16, Math.round(t * 32));
    const taperRad = (taper * Math.PI) / 180;
    const dir = leftHanded ? -1 : 1;

    const pts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const angle = frac * t * Math.PI * 2 * dir;
      const y = frac * h;
      const r = Math.max(0.001, radius + y * Math.tan(taperRad));
      pts.push({ x: Math.cos(angle) * r, y, z: Math.sin(angle) * r });
    }
    if (reversed) pts.reverse();

    // Build BSpline wire through helix points
    const ptArr = sc.track(new oc.TColgp_Array1OfPnt_2(1, pts.length));
    for (let i = 0; i < pts.length; i++) {
      ptArr.SetValue(i + 1, sc.track(new oc.gp_Pnt_3(pts[i].x, pts[i].y, pts[i].z)));
    }
    const interp = sc.track(new oc.GeomAPI_PointsToBSpline_2(ptArr, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-3));
    if (!interp.IsDone()) return null;
    const helixCurve = interp.Curve();

    const helixEdge = sc.track(new oc.BRepBuilderAPI_MakeEdge_24(helixCurve)).Edge();
    const spineWire = sc.track(new oc.BRepBuilderAPI_MakeWire_2(helixEdge)).Wire();

    // Profile
    const profileSketch = feature.profileSketchId
      ? tree.features.find(f => f.id === feature.profileSketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;

    if (!profileSketch) {
      // Fallback: thin tube
      const tube = sc.track(new oc.BRepOffsetAPI_MakePipe_1(spineWire, spineWire));
      if (!tube.IsDone()) return null;
      return tube.Shape();
    }

    const profEntities = sketchEntities(profileSketch);
    const profWires = entitiesToWires(oc, profEntities, sc);
    const profFace = wiresToFace(oc, profWires, sc);
    if (!profFace) return null;

    const pipe = sc.track(new oc.BRepOffsetAPI_MakePipe_1(spineWire, profFace as object));
    pipe.Build(sc.track(new oc.Message_ProgressRange_1()));
    if (!pipe.IsDone()) return null;

    // Axis rotation
    let solid: unknown = pipe.Shape();
    const axis = feature.axis ?? 'Y';
    if (axis === 'sketch_horizontal' || axis === 'X') {
      const rt = sc.track(new oc.gp_Trsf_1());
      rt.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(sc.track(new oc.gp_Pnt_3(0,0,0)), sc.track(new oc.gp_Dir_4(0,0,1)))),
        -Math.PI / 2,
      );
      solid = transformShape(oc, solid, rt, sc);
    } else if (axis === 'Z') {
      const rt = sc.track(new oc.gp_Trsf_1());
      rt.SetRotation_1(
        sc.track(new oc.gp_Ax1_2(sc.track(new oc.gp_Pnt_3(0,0,0)), sc.track(new oc.gp_Dir_4(1,0,0)))),
        Math.PI / 2,
      );
      solid = transformShape(oc, solid, rt, sc);
    }

    return solid;
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalPocket(oc: OCC, feature: PocketFeature, project: Project, tree: FeatureTree, accumulated: unknown): unknown | null {
  const sc = new OccScope();
  try {
    // Reuse extrude geometry builder
    const asExtrude: ExtrudeFeature = { ...feature, type: 'extrude' };
    const tool = evalExtrude(oc, asExtrude, project, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalHole(oc: OCC, feature: HoleFeature, tree: FeatureTree, accumulated: unknown): unknown | null {
  const sc = new OccScope();
  try {
    const sketch = feature.sketchId
      ? tree.features.find(f => f.id === feature.sketchId && f.type === 'sketch') as SketchFeature | undefined
      : undefined;
    if (!sketch) return null;

    const sketchTrsf = sketchToWorldTrsf(oc, sketch);
    const r = Math.max(0.1, feature.diameter / 2);
    const through = feature.depthType === 'through_all';
    const depth = through ? 10000 : Math.max(0.1, feature.depth);

    // Get hole centers from sketch circles
    const entities = sketchEntities(sketch);
    const centers: Array<{ x: number; y: number }> = [];
    for (const e of entities) {
      if (e['type'] === 'circle') centers.push({ x: e['cx'] as number, y: e['cy'] as number });
    }
    if (centers.length === 0) centers.push({ x: 0, y: 0 });

    const holeGeos: unknown[] = [];

    for (const center of centers) {
      // Build bore cylinder (in sketch-local space, drilling in -Z)
      const ax2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)),
        sc.track(new oc.gp_Dir_4(0, 0, -1)), // drills in -Z
      ));

      let rTop = r, rBot = r;
      if (!through && feature.tapered && feature.taperAngle > 0) {
        const half = ((feature.taperAngle / 2) * Math.PI) / 180;
        rBot = r + depth * Math.tan(half);
      }

      const boreCyl = sc.track(new oc.BRepPrimAPI_MakeCone_4(ax2, rTop, rBot, depth));
      boreCyl.Build(sc.track(new oc.Message_ProgressRange_1()));
      let holeShape: unknown = boreCyl.Shape();

      // Counterbore
      if (feature.counterType === 'counterbore' && feature.counterDepth > 0) {
        const cbR = Math.max(r + 0.01, feature.counterDiameter / 2);
        const cbD = feature.counterDepth;
        const cbAx2 = sc.track(new oc.gp_Ax2_3(
          sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)),
          sc.track(new oc.gp_Dir_4(0, 0, -1)),
        ));
        const cbCyl = sc.track(new oc.BRepPrimAPI_MakeCylinder_3(cbAx2, cbR, cbD));
        cbCyl.Build(sc.track(new oc.Message_ProgressRange_1()));
        const fused = csgFuse(oc, holeShape, cbCyl.Shape(), sc);
        if (fused) holeShape = fused;
      }

      // Countersink
      if (feature.counterType === 'countersink') {
        const csR = Math.max(r + 0.01, feature.counterDiameter / 2);
        const csHalf = ((feature.counterAngle / 2) * Math.PI) / 180;
        const csD = (csR - r) / Math.tan(csHalf);
        if (csD > 0.001) {
          const csAx2 = sc.track(new oc.gp_Ax2_3(
            sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)),
            sc.track(new oc.gp_Dir_4(0, 0, -1)),
          ));
          const cone = sc.track(new oc.BRepPrimAPI_MakeCone_4(csAx2, csR, r, csD));
          cone.Build(sc.track(new oc.Message_ProgressRange_1()));
          const fused = csgFuse(oc, holeShape, cone.Shape(), sc);
          if (fused) holeShape = fused;
        }
      }

      if (feature.reversed) {
        const rt = sc.track(new oc.gp_Trsf_1());
        rt.SetRotation_1(
          sc.track(new oc.gp_Ax1_2(sc.track(new oc.gp_Pnt_3(center.x, center.y, 0)), sc.track(new oc.gp_Dir_4(1,0,0)))),
          Math.PI,
        );
        holeShape = transformShape(oc, holeShape, rt, sc);
      }

      // Apply sketch plane transform
      holeGeos.push(transformShape(oc, holeShape, sketchTrsf, sc));
    }

    // Fuse all hole geometries together, then subtract from accumulated
    let allHoles = holeGeos[0];
    for (let i = 1; i < holeGeos.length; i++) {
      const f = csgFuse(oc, allHoles, holeGeos[i], sc);
      if (f) allHoles = f;
    }

    return csgCut(oc, accumulated, allHoles, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalGroove(oc: OCC, feature: GrooveFeature, project: Project, tree: FeatureTree, accumulated: unknown): unknown | null {
  const asRevolve: RevolveFeature = { ...feature, type: 'revolve' };
  const sc = new OccScope();
  try {
    const tool = evalRevolve(oc, asRevolve, project, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalLoftCut(oc: OCC, feature: LoftCutFeature, tree: FeatureTree, accumulated: unknown): unknown | null {
  const asLoft: LoftFeature = { ...feature, type: 'loft' };
  const sc = new OccScope();
  try {
    const tool = evalLoft(oc, asLoft, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalSweepCut(oc: OCC, feature: SweepCutFeature, tree: FeatureTree, accumulated: unknown): unknown | null {
  const asSweep: SweepFeature = { ...feature, type: 'sweep' };
  const sc = new OccScope();
  try {
    const tool = evalSweep(oc, asSweep, tree);
    if (!tool) return null;
    return csgCut(oc, accumulated, tool, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalMirror(oc: OCC, feature: MirrorFeature, accumulated: unknown): unknown | null {
  const sc = new OccScope();
  try {
    const trsf = sc.track(new oc.gp_Trsf_1());
    let mirrorAx2: unknown;

    if (feature.plane === 'XY') {
      mirrorAx2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(0, 0, 0)),
        sc.track(new oc.gp_Dir_4(0, 0, 1)),
      ));
    } else if (feature.plane === 'XZ') {
      mirrorAx2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(0, 0, 0)),
        sc.track(new oc.gp_Dir_4(0, 1, 0)),
      ));
    } else {
      mirrorAx2 = sc.track(new oc.gp_Ax2_3(
        sc.track(new oc.gp_Pnt_3(0, 0, 0)),
        sc.track(new oc.gp_Dir_4(1, 0, 0)),
      ));
    }

    trsf.SetMirror_2(mirrorAx2 as object);
    const mirrored = transformShape(oc, accumulated, trsf, sc);
    return csgFuse(oc, accumulated, mirrored, sc);
  } catch {
    return null;
  } finally {
    sc.dispose();
  }
}

function evalShell(oc: OCC, feature: ShellFeature, accumulated: unknown): unknown | null {
  const sc = new OccScope();
  try {
    const offset = sc.track(new oc.BRepOffsetAPI_MakeOffsetShape());
    offset.PerformByJoin(
      accumulated as object,
      -Math.abs(feature.thickness),
      1e-3,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      sc.track(new oc.Message_ProgressRange_1()),
    );
    if (!offset.IsDone()) return accumulated; // fallback: return unchanged
    return offset.Shape();
  } catch {
    return accumulated;
  } finally {
    sc.dispose();
  }
}

// ── Main async evaluator ───────────────────────────────────────────────────────

export async function evaluateFeatureTreeOcc(
  tree: FeatureTree,
  project: Project,
  sketchWireframeRoot: THREE.Object3D,
): Promise<THREE.Object3D> {
  const oc = await getOcc();
  const root = new THREE.Group();
  root.name = 'cad3d-occ-root';

  // Add sketch wireframes (kept from existing Three.js code)
  root.add(sketchWireframeRoot);

  let accumulated: unknown | null = null;

  for (const feature of tree.features) {
    if (!feature.enabled) continue;
    if (feature.type === 'sketch') continue; // handled by sketchWireframeRoot

    let result: unknown | null = null;
    let isModifier = false;

    switch (feature.type) {
      case 'extrude':
        result = evalExtrude(oc, feature as ExtrudeFeature, project, tree);
        break;
      case 'revolve':
        result = evalRevolve(oc, feature as RevolveFeature, project, tree);
        break;
      case 'loft':
        result = evalLoft(oc, feature as LoftFeature, tree);
        break;
      case 'sweep':
        result = evalSweep(oc, feature as SweepFeature, tree);
        break;
      case 'helix':
        result = evalHelix(oc, feature as HelixFeature, tree);
        break;

      // Subtractive / modifier operations
      case 'pocket':
        isModifier = true;
        if (accumulated) {
          const next = evalPocket(oc, feature as PocketFeature, project, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'hole':
        isModifier = true;
        if (accumulated) {
          const next = evalHole(oc, feature as HoleFeature, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'groove':
        isModifier = true;
        if (accumulated) {
          const next = evalGroove(oc, feature as GrooveFeature, project, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'loft_cut':
        isModifier = true;
        if (accumulated) {
          const next = evalLoftCut(oc, feature as LoftCutFeature, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'sweep_cut':
        isModifier = true;
        if (accumulated) {
          const next = evalSweepCut(oc, feature as SweepCutFeature, tree, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'mirror':
        isModifier = true;
        if (accumulated) {
          const next = evalMirror(oc, feature as MirrorFeature, accumulated);
          if (next) accumulated = next;
        }
        break;
      case 'shell':
        isModifier = true;
        if (accumulated) {
          const next = evalShell(oc, feature as ShellFeature, accumulated);
          if (next) accumulated = next;
        }
        break;
    }

    if (!isModifier && result) {
      if (accumulated) {
        // Fuse additive features
        const sc = new OccScope();
        try {
          const fused = csgFuse(oc, accumulated, result, sc);
          if (fused) accumulated = fused;
          else {
            // Fuse failed — add as separate solid
            root.add(shapeToGroup(oc, result, SOLID_COLOR, feature.id));
          }
        } finally {
          sc.dispose();
        }
      } else {
        accumulated = result;
      }
    }
  }

  if (accumulated) {
    try {
      root.add(shapeToGroup(oc, accumulated, SOLID_COLOR, 'solid'));
    } catch (err) {
      console.warn('OCC tessellation failed:', err);
    }
  }

  return root;
}
