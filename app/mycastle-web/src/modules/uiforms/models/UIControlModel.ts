/**
 * UI Control Model - bazowy model dla wszystkich kontrolek UI
 * Inspirowany systemem Control z Godot Engine
 */

// Typy kontrolek
export type UIControlType =
  // Kontenery
  | 'container' | 'vbox' | 'hbox' | 'grid' | 'margin' | 'scroll'
  // Bazowe
  | 'label' | 'button' | 'input' | 'textarea' | 'checkbox' | 'radio' | 'select'
  // Picker'y danych
  | 'personPicker' | 'taskPicker' | 'projectPicker'
  // Zaawansowane
  | 'tabs' | 'accordion' | 'slider' | 'progress' | 'table';

// Godot-like anchor presets
export type UIAnchorPreset =
  | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  | 'centerLeft' | 'centerRight' | 'centerTop' | 'centerBottom'
  | 'center'
  | 'leftWide' | 'topWide' | 'rightWide' | 'bottomWide'
  | 'vcenterWide' | 'hcenterWide'
  | 'fullRect'
  | 'custom';

// Size flags (jak w Godot)
export type UISizeFlag = 'fill' | 'expand' | 'shrinkCenter' | 'shrinkEnd';

// Anchors (0-1 normalizowane względem rodzica)
export interface UIAnchors {
  left: number;   // 0 = lewa krawędź rodzica, 1 = prawa
  top: number;    // 0 = góra, 1 = dół
  right: number;
  bottom: number;
}

// Offsets (piksele od pozycji anchor)
export interface UIOffsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Minimalny rozmiar
export interface UIMinSize {
  width?: number;
  height?: number;
}

// Flagi rozmiaru
export interface UISizeFlags {
  horizontal?: UISizeFlag;
  vertical?: UISizeFlag;
  stretchRatio?: number;  // Proporcja przy expand
}

// Data binding
export interface UIDataBinding {
  field: string;           // Ścieżka do pola danych (np. "person.name")
  mode: 'oneWay' | 'twoWay' | 'oneTime';
  transform?: string;      // Opcjonalna nazwa funkcji transformującej
}

// Event bindings
export interface UIEventBindings {
  onClick?: string;
  onChange?: string;
  onFocus?: string;
  onBlur?: string;
  onSubmit?: string;
}

// Bazowy model kontrolki UI
export interface UIControlModel {
  type: 'ui_control';
  id: string;
  name: string;
  controlType: UIControlType;

  // Layout - Godot-like anchors system
  anchors: UIAnchors;
  offsets: UIOffsets;
  anchorPreset?: UIAnchorPreset;

  // Size constraints
  minSize?: UIMinSize;
  sizeFlags?: UISizeFlags;

  // Visibility & interaction
  visible?: boolean;
  disabled?: boolean;

  // Hierarchy
  children?: UIControlModel[];

  // Control-specific properties
  properties?: Record<string, unknown>;

  // Data binding
  binding?: UIDataBinding;

  // Event handlers (nazwy callback'ów)
  events?: UIEventBindings;
}

// Predefiniowane wartości anchors dla presetów
export const ANCHOR_PRESETS: Record<UIAnchorPreset, UIAnchors> = {
  topLeft: { left: 0, top: 0, right: 0, bottom: 0 },
  topRight: { left: 1, top: 0, right: 1, bottom: 0 },
  bottomLeft: { left: 0, top: 1, right: 0, bottom: 1 },
  bottomRight: { left: 1, top: 1, right: 1, bottom: 1 },
  centerLeft: { left: 0, top: 0.5, right: 0, bottom: 0.5 },
  centerRight: { left: 1, top: 0.5, right: 1, bottom: 0.5 },
  centerTop: { left: 0.5, top: 0, right: 0.5, bottom: 0 },
  centerBottom: { left: 0.5, top: 1, right: 0.5, bottom: 1 },
  center: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
  leftWide: { left: 0, top: 0, right: 0, bottom: 1 },
  topWide: { left: 0, top: 0, right: 1, bottom: 0 },
  rightWide: { left: 1, top: 0, right: 1, bottom: 1 },
  bottomWide: { left: 0, top: 1, right: 1, bottom: 1 },
  vcenterWide: { left: 0, top: 0.5, right: 1, bottom: 0.5 },
  hcenterWide: { left: 0.5, top: 0, right: 0.5, bottom: 1 },
  fullRect: { left: 0, top: 0, right: 1, bottom: 1 },
  custom: { left: 0, top: 0, right: 0, bottom: 0 },
};

// Helper do tworzenia domyślnych anchors i offsets
export function createDefaultAnchors(): UIAnchors {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

export function createDefaultOffsets(): UIOffsets {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

// Helper do aplikowania presetu
export function applyAnchorPreset(preset: UIAnchorPreset): UIAnchors {
  return { ...ANCHOR_PRESETS[preset] };
}

// Helper do tworzenia nowej kontrolki
export function createControl(
  controlType: UIControlType,
  id: string,
  name: string,
  preset: UIAnchorPreset = 'topLeft',
  offsets: Partial<UIOffsets> = {}
): UIControlModel {
  return {
    type: 'ui_control',
    id,
    name,
    controlType,
    anchors: applyAnchorPreset(preset),
    offsets: { ...createDefaultOffsets(), ...offsets },
    anchorPreset: preset,
  };
}
