import type { CSSProperties, MutableRefObject, ReactNode, MouseEvent } from 'react';

// ─── Theme Configuration ──────────────────────────────────────────

export interface ThemeColors {
  primary: string;
  primaryVariant: string;
  secondary: string;
  secondaryVariant: string;
  background: string;
  surface: string;
  error: string;
  onPrimary: string;
  onSecondary: string;
  onBackground: string;
  onSurface: string;
  onError: string;
  border: string;
  divider: string;
}

export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ThemeTypography {
  fontFamily: string;
  fontSize: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  fontWeight: {
    light: number;
    regular: number;
    medium: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface ThemeShadows {
  sm: string;
  md: string;
  lg: string;
}

export interface ThemeBorderRadius {
  sm: string;
  md: string;
  lg: string;
  full: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  typography: ThemeTypography;
  shadows: ThemeShadows;
  borderRadius: ThemeBorderRadius;
}

// ─── Utility Types ────────────────────────────────────────────────

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ─── Library Configuration ────────────────────────────────────────

export interface LibConfig {
  theme: ThemeConfig;
  locale?: string;
  debug?: boolean;
}

export type PartialLibConfig = DeepPartial<LibConfig>;

// ─── Component Prop Types ─────────────────────────────────────────

export interface ButtonProps {
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
}

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  type?: 'text' | 'number' | 'password' | 'email';
  className?: string;
  style?: CSSProperties;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
  className?: string;
}

// ─── Scene Tree Data Types ───────────────────────────────────────

export interface SceneTreeNodeData {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  children?: SceneTreeNodeData[];
  metadata?: Record<string, unknown>;
}

// ─── Panel Prop Types ─────────────────────────────────────────────

export interface SceneTreePanelProps {
  nodes?: SceneTreeNodeData[];
  onNodeSelect?: (nodeId: string) => void;
  onNodeVisibilityToggle?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  onNodeAdd?: (type: string, parentId?: string) => void;
  onNodeDelete?: (nodeId: string) => void;
  onNodeRename?: (nodeId: string, newName: string) => void;
  onNodeReparent?: (nodeId: string, newParentId: string | null) => void;
  onNodeDuplicate?: (nodeId: string) => void;
  onNodeCut?: (nodeId: string) => void;
  onNodeCopy?: (nodeId: string) => void;
  onNodePaste?: () => void;
  onImportMesh?: (parentId?: string) => void;
  onCreatePrefab?: (nodeId: string) => void;
  canPaste?: boolean;
  className?: string;
}

export interface SelectedNodeTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SelectedNodeGeometryAttributes {
  indexCount?: number;
  positionCount?: number;
  normalCount?: number;
  uvCount?: number;
}

export interface SceneGeometryEntry {
  nodeId: string;
  nodeName: string;
  geoId: string;
  geoType: string;
}

export interface SelectedNodeGeometry {
  /** UUID of the geometry data-block (same on nodes sharing geometry). */
  geoId?: string;
  geoType: string;
  params: Record<string, number>;
  code?: string;
  /** Opaque — cast to GeoNodeGraph in consumers that depend on core-scene3d. */
  nodesGraph?: unknown;
  vertexCount?: number;
  indexCount?: number;
  fileName?: string;
  attributes?: SelectedNodeGeometryAttributes;
  bounds?: [number, number, number];
}

export type MaterialType =
  | 'MeshBasicMaterial'
  | 'MeshDepthMaterial'
  | 'MeshNormalMaterial'
  | 'MeshLambertMaterial'
  | 'MeshMatcapMaterial'
  | 'MeshPhongMaterial'
  | 'MeshToonMaterial'
  | 'MeshStandardMaterial'
  | 'MeshPhysicalMaterial'
  | 'ShadowMaterial';

export type MaterialSide = 'front' | 'back' | 'double';
export type MaterialBlending = 'normal' | 'additive' | 'subtractive' | 'multiply';

export interface SelectedNodeMaterial {
  matId?: string;
  matType: MaterialType;

  color: string;
  opacity: number;
  transparent: boolean;
  wireframe: boolean;
  side: MaterialSide;
  blending: MaterialBlending;
  depthTest: boolean;
  depthWrite: boolean;
  alphaTest: number;
  vertexColors: boolean;
  forceSinglePass: boolean;

  emissive?: string;
  emissiveIntensity?: number;
  reflectivity?: number;
  flatShading?: boolean;

  specular?: string;
  shininess?: number;

  roughness?: number;
  metalness?: number;

  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  dispersion?: number;
  iridescence?: number;
  iridescenceIOR?: number;
  thinFilmThicknessMin?: number;
  thinFilmThicknessMax?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: string;
  transmission?: number;
  attenuationDistance?: number;
  attenuationColor?: string;
  thickness?: number;

  depthPacking?: 'basic' | 'rgba';
}

export interface SelectedNodeLight {
  lightType: string;
  color: string;
  groundColor?: string;
  intensity: number;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  shadowIntensity?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
  shadowRadius?: number;
}

export interface SelectedNodeObject {
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  renderOrder: number;
  userData: string;
}

export interface SelectedNodeCamera {
  cameraType: 'perspective' | 'orthographic';
  fov: number;
  near: number;
  far: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SelectedNodeAudio {
  src: string;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  positional: boolean;
  rolloffFactor: number;
  maxDistance: number;
  refDistance: number;
  distanceModel: 'linear' | 'inverse' | 'exponential';
  coneInnerAngle: number;
  coneOuterAngle: number;
  coneOuterGain: number;
}

export interface SelectedNodeData {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  transform: SelectedNodeTransform;
  object?: SelectedNodeObject;
  geometry?: SelectedNodeGeometry;
  material?: SelectedNodeMaterial;
  light?: SelectedNodeLight;
  camera?: SelectedNodeCamera;
  audio?: SelectedNodeAudio;
}

// ─── Scene Settings ───────────────────────────────────────────

export type SceneBackgroundType = 'default' | 'solid';
export type SceneEnvironmentPreset = 'none' | 'apartment' | 'city' | 'dawn' | 'forest' | 'lobby' | 'night' | 'park' | 'studio' | 'sunset' | 'warehouse';
export type SceneFogType = 'none' | 'linear' | 'exp2';

export interface SceneSettings {
  backgroundType: SceneBackgroundType;
  backgroundColor: string;
  environmentPreset: SceneEnvironmentPreset;
  fogType: SceneFogType;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  fogDensity: number;
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundType: 'default',
  backgroundColor: '#1a1a2e',
  environmentPreset: 'none',
  fogType: 'none',
  fogColor: '#aaaaaa',
  fogNear: 1,
  fogFar: 100,
  fogDensity: 0.02,
};

export interface PropertiesPanelProps {
  node?: SelectedNodeData | null;
  onPropertyChange?: (nodeId: string, property: string, value: unknown) => void;
  onNodeRename?: (nodeId: string, newName: string) => void;
  activeCameraNodeId?: string | null;
  onSetActiveCamera?: (nodeId: string | null) => void;
  sceneSettings?: SceneSettings;
  onSceneSettingsChange?: (settings: SceneSettings) => void;
  /** Opens a file picker for audio files; resolves to a VFS path or null if cancelled. */
  onBrowseAudioFile?: () => Promise<string | null>;
  /** Opens the geometry node graph editor for a mesh node. Receives nodeId + current nodesGraph (opaque — cast to GeoNodeGraph in consumers). */
  onEditGeometryNodes?: (nodeId: string, currentGraph: unknown) => void;
  /** Opens the Blender-style mesh edit mode for a mesh node. */
  onEditMesh?: (nodeId: string) => void;
  /** All mesh nodes in the scene — for geometry linking. */
  sceneGeometries?: SceneGeometryEntry[];
  /** Assigns geometry from sourceNodeId to targetNodeId (copies descriptor incl. same id). */
  onAssignGeometry?: (targetNodeId: string, sourceNodeId: string) => void;
  className?: string;
}

export interface SettingsPanelProps {
  className?: string;
}

// ─── Editor Prop Types ────────────────────────────────────────────

export interface SimpleEditorProps {
  className?: string;
  style?: CSSProperties;
}

export interface RichEditorProps {
  className?: string;
  style?: CSSProperties;
  /** Serialized SceneGraph JSON (from SceneSerializer.toJSON) used to pre-populate the scene on mount. */
  initialSceneData?: string;
  /** Pass a ref; its `.current` will be set to a `fitScene()` function for imperative camera fit. */
  fitSceneRef?: MutableRefObject<(() => void) | null>;
  /** Pass a ref; its `.current` will be set to a `mergeScene(json)` function that adds nodes from a serialized SceneGraph into the current scene without replacing it. */
  mergeSceneRef?: MutableRefObject<((json: string) => void) | null>;
  /** Called on mount and after every scene change with the current serialized SceneGraph JSON. */
  onSceneChange?: (json: string) => void;
  /** Called when the user clicks the Y=0 floor plane (template placement mode). wx/wz = world X/Z coordinates. */
  onPlaneClick?: (wx: number, wz: number) => void;
  /** Opens the geometry node graph editor for a mesh node with 'nodes' geometry type. */
  onEditGeometryNodes?: (nodeId: string, currentGraph: unknown) => void;
  /** Opens the Blender-style mesh edit mode for the selected mesh node. */
  onEditMesh?: (nodeId: string) => void;
  /** If provided, its .current will be set to a function that applies a property change to a node — lets external dialogs write back into the scene graph. */
  propertyChangeRef?: MutableRefObject<((nodeId: string, property: string, value: unknown) => void) | null>;
  /** If provided, its .current will be set to a function that returns the GeometryDescriptor (as unknown) for a given nodeId — lets external dialogs read geometry for edit mode. */
  getNodeGeometryRef?: MutableRefObject<((nodeId: string) => unknown) | null>;
  /** Called when a prefab is created or renamed. data = JSON.stringify(PrefabEntry). */
  onSavePrefab?: (id: string, name: string, data: string) => Promise<void>;
  /** Called when a prefab is deleted. */
  onDeletePrefab?: (id: string) => Promise<void>;
  /** JSON-serialized PrefabEntry[] — overrides prefabs embedded in the scene JSON on mount. */
  initialPrefabs?: string;
}

// ─── Viewer Prop Types ────────────────────────────────────────────

export interface RichViewerProps {
  className?: string;
  style?: CSSProperties;
  showControls?: boolean;
}

// ─── Toolbar Prop Types ───────────────────────────────────────────

export type TransformMode = 'translate' | 'rotate' | 'scale';

export type CameraPresetName = 'standard' | 'blender' | 'maya' | 'cad';

export interface CameraPresetConfig {
  label: string;
  description: string;
  mouseButtons: {
    LEFT: number | null;
    MIDDLE: number | null;
    RIGHT: number | null;
  };
}

export interface ToolbarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  type?: 'button' | 'separator';
  tooltip?: string;
}

export interface ToolbarProps {
  items?: ToolbarItem[];
  className?: string;
}
