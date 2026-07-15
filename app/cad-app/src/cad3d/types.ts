export type SketchPlane = 'XY' | 'XZ' | 'YZ' | 'face';
export type FeatureType = 'sketch' | 'extrude' | 'pocket' | 'hole' | 'groove' | 'loft_cut' | 'sweep_cut' | 'mirror' | 'revolve' | 'shell' | 'loft' | 'sweep' | 'helix' | 'fillet' | 'chamfer' | 'linear_pattern' | 'polar_pattern' | 'datum_point' | 'datum_line' | 'datum_plane' | 'datum_cs';
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

/** FreeCAD-style Revolution Type: Angle / To last / To first / Up to face / Two angles */
export type RevolveTypeExt = 'angle' | 'to_last' | 'to_first' | 'up_to_face' | 'two_angles';
/** FreeCAD-style Axis: Base X/Y/Z + Select reference (datum_line lub datum_cs oś Z) */
export type RevolveAxisExt = 'X' | 'Y' | 'Z' | 'datum_reference' | 'sketch_vertical' | 'sketch_horizontal';

interface BaseFeature {
  id: string;
  type: FeatureType;
  name: string;
  enabled: boolean;
}

/**
 * Parametryczna referencja sketcha do face bryły. Zapisujemy WORLD-SPACE hints
 * (normal + centroid) z momentu tworzenia sketcha. Przy każdej ewaluacji drzewa
 * odnajdujemy w aktualnej bryle face najbliższą do tych hints i przeliczamy
 * `planeMatrix` — dzięki temu sketch podąża za face gdy parent extrude/pocket
 * zostanie zmieniony (np. wysokość bryły).
 */
export interface FaceRef {
  hintNormal: Vec3;   // world normal face w momencie tworzenia sketcha
  hintPoint: Vec3;    // world centroid face w momencie tworzenia sketcha
}

export interface SketchFeature extends BaseFeature {
  type: 'sketch';
  plane: SketchPlane;
  offset: number;
  planeMatrix?: number[];
  faceRef?: FaceRef;
  projectData: string | null;   // serialized Project.toJSON()
  /** 2D geometric constraints (FreeCAD-style — coincident, horizontal, parallel, etc.).
   *  Solver (sketchConstraints.solveConstraints) runs on sketch entities przed
   *  generowaniem geometry OCC. */
  constraints?: import('./sketchConstraints').SketchConstraint[];
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

export type MirrorMode = 'content' | 'tool_shapes';
export type MirrorPlaneMode = 'XY' | 'XZ' | 'YZ' | 'datum_plane';

export interface MirrorFeature extends BaseFeature {
  type: 'mirror';
  plane: 'XY' | 'XZ' | 'YZ';                   // legacy — plane preset gdy planeMode = XY/XZ/YZ
  planeMode?: MirrorPlaneMode;                 // rozszerzenie: XY/XZ/YZ preset lub 'datum_plane' → planeId
  datumPlaneId?: string;                       // ID DatumPlaneFeature (gdy planeMode='datum_plane')
  mode?: MirrorMode;                           // 'content' — mirror akumulacji (dotychczasowe), 'tool_shapes' — tylko wybrane feature (featureIds)
  featureIds?: string[];                       // dla mode='tool_shapes' — które feature mają być mirrored
  autoRefresh?: boolean;                       // "Przelicz po zmianie" (domyślnie true)
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
  // ── FreeCAD-style rozszerzenia (opcjonalne dla backward compat) ──────────────
  /** Type Angle/To last/To first/Up to face/Two angles */
  revolveTypeExt?: RevolveTypeExt;
  /** Axis (X/Y/Z world, datum_reference, lub sketch axis) */
  axisExt?: RevolveAxisExt;
  /** ID datum_line lub datum_cs (gdy axisExt='datum_reference') */
  axisRefId?: string;
  /** Drugi kąt (dla revolveTypeExt='two_angles') */
  angle2?: number;
  /** Auto-recompute po zmianie parametrów (checkbox "Recompute on change") */
  autoRefresh?: boolean;
}

/** Chamfer type — Equal distance (symetryczna) lub Two distances (różna z każdej strony). */
export type ChamferType = 'equal' | 'two_distances';

/** Pattern mode — 'content' transformuje akumulację (jak Mirror), 'tool_shapes' replikuje wybrane features. */
export type PatternMode = 'content' | 'tool_shapes';
/** Pattern direction — oś w local sketch (H/V) lub world (X/Y/Z) lub normal sketch (dla Polar). */
export type PatternDirection = 'sketch_horizontal' | 'sketch_vertical' | 'sketch_normal' | 'X' | 'Y' | 'Z';

export interface LinearPatternFeature extends BaseFeature {
  type: 'linear_pattern';
  mode: PatternMode;
  featureIds: string[];   // dla mode='tool_shapes'
  direction: PatternDirection;
  reversed: boolean;
  length: number;          // całkowita długość (mm) od pierwszej do ostatniej kopii
  occurrences: number;     // liczba kopii (>=2, wliczając original)
  // Direction 2 (opcjonalna druga oś — dla 2D grid)
  direction2Enabled: boolean;
  direction2?: PatternDirection;
  length2?: number;
  occurrences2?: number;
  autoRefresh: boolean;
}

export interface PolarPatternFeature extends BaseFeature {
  type: 'polar_pattern';
  mode: PatternMode;
  featureIds: string[];
  axis: PatternDirection;  // oś obrotu (sketch_normal, X, Y, Z)
  reversed: boolean;
  angle: number;           // całkowity kąt (deg) — 360° dla pełnego obrotu
  occurrences: number;     // liczba kopii wliczając original
  autoRefresh: boolean;
}

export interface FilletFeature extends BaseFeature {
  type: 'fillet';
  radius: number;
  useAllEdges: boolean;
  /** Lista edge'ów bryły do zaokrąglenia (gdy useAllEdges=false). Analogicznie do Shell.facesToRemove. */
  edges?: FaceRef[];    // reuse FaceRef bo edge hint = midpoint + tangent direction
  autoRefresh?: boolean;
}

export interface ChamferFeature extends BaseFeature {
  type: 'chamfer';
  size: number;
  size2?: number;       // dla type='two_distances'
  chamferType: ChamferType;
  useAllEdges: boolean;
  edges?: FaceRef[];    // edge hints
  autoRefresh?: boolean;
}

/** Sposób offset przy Shell — Skin (klasyczny), Pipe (rurowy), RectoVerso (dwustronny). */
export type ShellMode = 'skin' | 'pipe' | 'recto_verso';
/** Typ złącza dla wewnętrznych ostrych krawędzi — Arc (zaokrąglone), Intersection (proste). */
export type ShellJoinType = 'arc' | 'intersection';

export interface ShellFeature extends BaseFeature {
  type: 'shell';
  thickness: number;
  // FreeCAD-style rozszerzenia (opcjonalne dla backward compat)
  /** Lista face'ów bryły które zostaną USUNIĘTE (otwarte) w wyniku Shell.
   *  Bez tego shell tworzy zamkniętą wewnątrz jamę (pustą, ale bez dostępu). */
  facesToRemove?: FaceRef[];
  mode?: ShellMode;
  joinType?: ShellJoinType;
  intersection?: boolean;
  /** Kierunek offset — inwards = do wnętrza (tworzy jamę), outwards = na zewnątrz. */
  inwards?: boolean;
  autoRefresh?: boolean;
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

export type Feature = SketchFeature | ExtrudeFeature | PocketFeature | HoleFeature | GrooveFeature | LoftCutFeature | SweepCutFeature | MirrorFeature | RevolveFeature | ShellFeature | LoftFeature | SweepFeature | HelixFeature | FilletFeature | ChamferFeature | LinearPatternFeature | PolarPatternFeature | DatumPointFeature | DatumLineFeature | DatumPlaneFeature | DatumCsFeature;

export interface FeatureTree {
  version: 1;
  features: Feature[];
}

export function makeId(): string {
  return crypto.randomUUID();
}

export function defaultSketch(plane: SketchPlane = 'XY', offset = 0, planeMatrix?: number[], faceRef?: FaceRef): SketchFeature {
  const label = plane === 'face' ? 'Sketch (face)'
    : offset !== 0 ? `Sketch (${plane}+${offset})`
    : `Sketch (${plane})`;
  return { id: makeId(), type: 'sketch', name: label, enabled: true, plane, offset, planeMatrix, faceRef, projectData: null };
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
  // Klasyczny CAD default dla Pocket: symmetric=true rozciąga pocket na obie strony
  // płaszczyzny szkicu (od -depth/2 do +depth/2). Dzięki temu dziura zawsze jest
  // widoczna niezależnie od tego czy sketch jest w środku bryły (plane XY) czy
  // na jej powierzchni (plane 'face'). Bez symmetric pocket ląduje asymetrycznie
  // po jednej stronie sketch plane, co dla szkicu na face bryły daje trudno
  // widoczny efekt (dziura znika w głąb bryły lub wystaje poza nią).
  return {
    id: makeId(), type: 'pocket', name: 'Pocket', enabled: true,
    sketchId, entityIds,
    extrudeType: 'dimension',
    height: 50,
    symmetric: true,
    reversed: false,
    direction: 'normal',
    taper: 0,
  };
}

export function defaultMirror(): MirrorFeature {
  return {
    id: makeId(),
    type: 'mirror',
    name: 'Mirror',
    enabled: true,
    plane: 'YZ',
    planeMode: 'YZ',
    mode: 'content',
    featureIds: [],
    autoRefresh: true,
  };
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
    // FreeCAD-style defaults
    revolveTypeExt: 'angle',
    axisExt: 'Y',
    autoRefresh: true,
  };
}

export function defaultShell(): ShellFeature {
  return {
    id: makeId(), type: 'shell', name: 'Shell', enabled: true, thickness: 5,
    facesToRemove: [],
    mode: 'skin',
    joinType: 'arc',
    intersection: false,
    inwards: true,
    autoRefresh: true,
  };
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

export function defaultFillet(): FilletFeature {
  return {
    id: makeId(), type: 'fillet', name: 'Fillet', enabled: true,
    radius: 2,
    useAllEdges: true,
    edges: [],
    autoRefresh: true,
  };
}

export function defaultLinearPattern(): LinearPatternFeature {
  return {
    id: makeId(), type: 'linear_pattern', name: 'LinearPattern', enabled: true,
    mode: 'tool_shapes',
    featureIds: [],
    direction: 'sketch_horizontal',
    reversed: false,
    length: 100,
    occurrences: 2,
    direction2Enabled: false,
    direction2: 'sketch_vertical',
    length2: 100,
    occurrences2: 2,
    autoRefresh: true,
  };
}

export function defaultPolarPattern(): PolarPatternFeature {
  return {
    id: makeId(), type: 'polar_pattern', name: 'PolarPattern', enabled: true,
    mode: 'tool_shapes',
    featureIds: [],
    axis: 'sketch_normal',
    reversed: false,
    angle: 360,
    occurrences: 4,
    autoRefresh: true,
  };
}

export function defaultChamfer(): ChamferFeature {
  return {
    id: makeId(), type: 'chamfer', name: 'Chamfer', enabled: true,
    size: 1,
    size2: 1,
    chamferType: 'equal',
    useAllEdges: true,
    edges: [],
    autoRefresh: true,
  };
}

export function defaultDatumPoint(position: Vec3 = [0, 0, 0]): DatumPointFeature {
  return { id: makeId(), type: 'datum_point', name: 'Punkt odniesienia', enabled: true, position };
}
export function defaultDatumLine(position: Vec3 = [0, 0, 0], direction: Vec3 = [1, 0, 0], length = 100): DatumLineFeature {
  return { id: makeId(), type: 'datum_line', name: 'Linia odniesienia', enabled: true, position, direction, length };
}
export function defaultDatumPlane(position: Vec3 = [0, 0, 0], normal: Vec3 = [0, 0, 1], size = 100): DatumPlaneFeature {
  return { id: makeId(), type: 'datum_plane', name: 'Płaszczyzna odniesienia', enabled: true, position, normal, size };
}
export function defaultDatumCs(position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0], size = 60): DatumCsFeature {
  return { id: makeId(), type: 'datum_cs', name: 'Układ współrzędnych', enabled: true, position, rotation, size };
}

export const EMPTY_TREE: FeatureTree = { version: 1, features: [] };
