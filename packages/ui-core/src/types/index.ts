import type { CSSProperties, ReactNode, MouseEvent } from 'react';

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

export interface SelectedNodeMaterial {
  color: string;
  opacity: number;
  wireframe: boolean;
}

export interface SelectedNodeLight {
  lightType: string;
  color: string;
  intensity: number;
}

export interface SelectedNodeData {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  transform: SelectedNodeTransform;
  material?: SelectedNodeMaterial;
  light?: SelectedNodeLight;
}

export interface PropertiesPanelProps {
  node?: SelectedNodeData | null;
  onPropertyChange?: (nodeId: string, property: string, value: unknown) => void;
  onNodeRename?: (nodeId: string, newName: string) => void;
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
