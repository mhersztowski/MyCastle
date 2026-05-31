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

export interface SelectedNodeGeometry {
  geoType: string;
  params: Record<string, number>;
  vertexCount?: number;
  indexCount?: number;
  fileName?: string;
  attributes?: SelectedNodeGeometryAttributes;
  bounds?: [number, number, number];
}

export interface SelectedNodeMaterial {
  color: string;
  opacity: number;
  wireframe: boolean;
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
