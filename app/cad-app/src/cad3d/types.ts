export type SketchPlane = 'XY' | 'XZ' | 'YZ' | 'face';
export type FeatureType = 'sketch' | 'extrude' | 'pocket' | 'hole' | 'groove' | 'loft_cut' | 'sweep_cut' | 'mirror' | 'revolve' | 'shell' | 'loft' | 'sweep' | 'helix' | 'datum_point' | 'datum_line' | 'datum_plane' | 'datum_cs';
/** Typy konstrukcyjne „datum" (odniesienia) — nie tworzą bryły, tylko pomoc geometryczną. */
export const DATUM_TYPES: ReadonlySet<FeatureType> = new Set<FeatureType>(['datum_point', 'datum_line', 'datum_plane', 'datum_cs']);
export type Vec3 = [number, number, number];
export type HoleDepthType  = 'dimension' | 'through_all';
export type HoleDrillPoint = 'flat' | 'angled';
export type HoleCounterType = 'none' | 'countersink' | 'counterbore';
export type SweepCornerStyle     = 'transformed' | 'round' | 'right_angle';
export type HelixMode = 'pitch_height' | 'pitch_turns' | 'turns_height';
export type HelixAxis = 'sketch_vertical' | 'sketch_horizontal' | 'X' | 'Y' | 'Z';
export type SweepOrientationMode = 'standard' | 'fixed' | 'frenet';
export type SweepTransformMode   = 'constant' | 'inscribed';
export type ExtrudeType = 'dimension' | 'symmetric' | 'through_all';
export type ExtrudeDirection = 'normal' | 'X' | 'Y' | 'Z';
export type RevolveType = 'dimension' | 'symmetric' | 'through_all';
export type RevolveAxis = 'sketch_vertical' | 'sketch_horizontal' | 'X' | 'Y' | 'Z';

interface BaseFeature {
  id: string;
  type: FeatureType;
  name: string;
  enabled: boolean;
}

export interface SketchFeature extends BaseFeature {
  type: 'sketch';
  plane: SketchPlane;
  offset: number;               // used for XY/XZ/YZ preset planes
  planeMatrix?: number[];       // 16-element column-major Matrix4 for plane='face'
  projectData: string | null;   // serialized Project.toJSON()
}

export interface ExtrudeFeature extends BaseFeature {
  type: 'extrude';
  sketchId: string | null;
  entityIds: string[];
  extrudeType: ExtrudeType;
  height: number;
  symmetric: boolean;     // "symmetric to plane" — only applies when extrudeType='dimension'
  reversed: boolean;
  direction: ExtrudeDirection;
  taper: number;          // draft angle in degrees; 0 = no taper
}

export interface PocketFeature extends BaseFeature {
  type: 'pocket';
  sketchId: string | null;
  entityIds: string[];
  extrudeType: ExtrudeType;
  height: number;
  symmetric: boolean;
  reversed: boolean;
  direction: ExtrudeDirection;
  taper: number;
}

export interface MirrorFeature extends BaseFeature {
  type: 'mirror';
  plane: 'XY' | 'XZ' | 'YZ';
}

export interface RevolveFeature extends BaseFeature {
  type: 'revolve';
  sketchId: string | null;
  entityIds: string[];
  revolveType: RevolveType;
  axis: RevolveAxis;
  angle: number;
  symmetric: boolean;
  reversed: boolean;
  segments: number;
}

export interface ShellFeature extends BaseFeature {
  type: 'shell';
  thickness: number;
}

export interface LoftSection {
  sketchId: string;
}

export interface LoftFeature extends BaseFeature {
  type: 'loft';
  sections: LoftSection[];
  ruled: boolean;
  closed: boolean;
}

export interface SweepFeature extends BaseFeature {
  type: 'sweep';
  profileSketchId: string | null;  // cross-section profile sketch
  pathSketchId: string | null;     // path sketch (line/arc/polyline entities form the spine)
  cornerStyle: SweepCornerStyle;
  orientationMode: SweepOrientationMode;
  transformMode: SweepTransformMode;
}

export interface HelixFeature extends BaseFeature {
  type: 'helix';
  profileSketchId: string | null;
  axis: HelixAxis;
  mode: HelixMode;
  pitch: number;
  height: number;
  turns: number;
  radius: number;
  taper: number;       // taper half-angle in degrees; 0 = cylinder
  leftHanded: boolean;
  reversed: boolean;
}

export interface HoleFeature extends BaseFeature {
  type: 'hole';
  sketchId: string | null;
  diameter: number;
  depthType: HoleDepthType;
  depth: number;
  reversed: boolean;
  tapered: boolean;
  taperAngle: number;          // full included angle of taper cone (degrees)

  drillPoint: HoleDrillPoint;
  drillPointAngle: number;     // included angle of drill tip (default 118°)

  counterType: HoleCounterType;
  counterDiameter: number;     // CS / CB outer diameter
  counterDepth: number;        // CB axial depth (0 for CS)
  counterAngle: number;        // CS included angle (default 90°)
}

export interface GrooveFeature extends BaseFeature {
  type: 'groove';
  sketchId: string | null;
  entityIds: string[];
  revolveType: RevolveType;
  axis: RevolveAxis;
  angle: number;
  symmetric: boolean;
  reversed: boolean;
  segments: number;
}

export interface LoftCutFeature extends BaseFeature {
  type: 'loft_cut';
  sections: LoftSection[];
  ruled: boolean;
  closed: boolean;
}

export interface SweepCutFeature extends BaseFeature {
  type: 'sweep_cut';
  profileSketchId: string | null;
  pathSketchId: string | null;
  cornerStyle: SweepCornerStyle;
  orientationMode: SweepOrientationMode;
  transformMode: SweepTransformMode;
}

// ── Datum / odniesienia (FreeCAD-like) ──────────────────────────────────────────

export interface DatumPointFeature extends BaseFeature {
  type: 'datum_point';
  position: Vec3;
}
export interface DatumLineFeature extends BaseFeature {
  type: 'datum_line';
  position: Vec3;            // punkt początkowy
  direction: Vec3;          // kierunek (zostanie znormalizowany przy renderze)
  length: number;
}
export interface DatumPlaneFeature extends BaseFeature {
  type: 'datum_plane';
  position: Vec3;
  normal: Vec3;             // wektor normalny płaszczyzny
  size: number;            // bok kwadratu wizualizacji
}
export interface DatumCsFeature extends BaseFeature {
  type: 'datum_cs';
  position: Vec3;
  rotation: Vec3;          // Euler w stopniach (XYZ)
  size: number;            // długość osi
}

export type Feature = SketchFeature | ExtrudeFeature | PocketFeature | HoleFeature | GrooveFeature | LoftCutFeature | SweepCutFeature | MirrorFeature | RevolveFeature | ShellFeature | LoftFeature | SweepFeature | HelixFeature | DatumPointFeature | DatumLineFeature | DatumPlaneFeature | DatumCsFeature;

export interface FeatureTree {
  version: 1;
  features: Feature[];
}

export function makeId(): string {
  return crypto.randomUUID();
}

export function defaultSketch(plane: SketchPlane = 'XY', offset = 0, planeMatrix?: number[]): SketchFeature {
  const label = plane === 'face' ? 'Sketch (face)'
    : offset !== 0 ? `Sketch (${plane}+${offset})`
    : `Sketch (${plane})`;
  return { id: makeId(), type: 'sketch', name: label, enabled: true, plane, offset, planeMatrix, projectData: null };
}

export function defaultExtrude(sketchId: string | null, entityIds: string[]): ExtrudeFeature {
  return {
    id: makeId(), type: 'extrude', name: 'Extrude', enabled: true,
    sketchId, entityIds,
    extrudeType: 'dimension',
    height: 50,
    symmetric: false,
    reversed: false,
    direction: 'normal',
    taper: 0,
  };
}

export function defaultLoftCut(): LoftCutFeature {
  return { id: makeId(), type: 'loft_cut', name: 'Loft Cut', enabled: true, sections: [], ruled: false, closed: false };
}

export function defaultGroove(sketchId: string | null, entityIds: string[]): GrooveFeature {
  return {
    id: makeId(), type: 'groove', name: 'Groove', enabled: true,
    sketchId, entityIds,
    revolveType: 'dimension',
    axis: 'sketch_vertical',
    angle: 360,
    symmetric: false,
    reversed: false,
    segments: 32,
  };
}

export function defaultHole(sketchId: string | null): HoleFeature {
  return {
    id: makeId(), type: 'hole', name: 'Hole', enabled: true,
    sketchId,
    diameter: 6,
    depthType: 'dimension',
    depth: 25,
    reversed: false,
    tapered: false,
    taperAngle: 90,
    drillPoint: 'angled',
    drillPointAngle: 118,
    counterType: 'none',
    counterDiameter: 10,
    counterDepth: 3,
    counterAngle: 90,
  };
}

export function defaultPocket(sketchId: string | null, entityIds: string[]): PocketFeature {
  return {
    id: makeId(), type: 'pocket', name: 'Pocket', enabled: true,
    sketchId, entityIds,
    extrudeType: 'dimension',
    height: 5,
    symmetric: false,
    reversed: false,
    direction: 'normal',
    taper: 0,
  };
}

export function defaultMirror(): MirrorFeature {
  return { id: makeId(), type: 'mirror', name: 'Mirror', enabled: true, plane: 'YZ' };
}

export function defaultRevolve(sketchId: string | null, entityIds: string[]): RevolveFeature {
  return {
    id: makeId(), type: 'revolve', name: 'Revolve', enabled: true,
    sketchId, entityIds,
    revolveType: 'dimension',
    axis: 'sketch_vertical',
    angle: 360,
    symmetric: false,
    reversed: false,
    segments: 32,
  };
}

export function defaultShell(): ShellFeature {
  return { id: makeId(), type: 'shell', name: 'Shell', enabled: true, thickness: 5 };
}

export function defaultSweep(): SweepFeature {
  return {
    id: makeId(), type: 'sweep', name: 'Sweep', enabled: true,
    profileSketchId: null,
    pathSketchId: null,
    cornerStyle: 'transformed',
    orientationMode: 'standard',
    transformMode: 'constant',
  };
}

export function defaultSweepCut(): SweepCutFeature {
  return {
    id: makeId(), type: 'sweep_cut', name: 'Sweep Cut', enabled: true,
    profileSketchId: null,
    pathSketchId: null,
    cornerStyle: 'transformed',
    orientationMode: 'standard',
    transformMode: 'constant',
  };
}

export function defaultLoft(): LoftFeature {
  return { id: makeId(), type: 'loft', name: 'Loft', enabled: true, sections: [], ruled: false, closed: false };
}

export function defaultHelix(): HelixFeature {
  return {
    id: makeId(), type: 'helix', name: 'Helix', enabled: true,
    profileSketchId: null,
    axis: 'Y',
    mode: 'pitch_height',
    pitch: 10,
    height: 50,
    turns: 5,
    radius: 20,
    taper: 0,
    leftHanded: false,
    reversed: false,
  };
}

export function defaultDatumPoint(): DatumPointFeature {
  return { id: makeId(), type: 'datum_point', name: 'Punkt odniesienia', enabled: true, position: [0, 0, 0] };
}
export function defaultDatumLine(): DatumLineFeature {
  return { id: makeId(), type: 'datum_line', name: 'Linia odniesienia', enabled: true, position: [0, 0, 0], direction: [1, 0, 0], length: 100 };
}
export function defaultDatumPlane(): DatumPlaneFeature {
  return { id: makeId(), type: 'datum_plane', name: 'Płaszczyzna odniesienia', enabled: true, position: [0, 0, 0], normal: [0, 0, 1], size: 100 };
}
export function defaultDatumCs(): DatumCsFeature {
  return { id: makeId(), type: 'datum_cs', name: 'Układ współrzędnych', enabled: true, position: [0, 0, 0], rotation: [0, 0, 0], size: 60 };
}

export const EMPTY_TREE: FeatureTree = { version: 1, features: [] };
