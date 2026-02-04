/**
 * UI Picker Models - modele picker'ów danych
 */

// Bazowe właściwości picker'a (wspólne dla wszystkich)
export interface UIPickerBaseProperties {
  editable?: boolean;
  size?: 'small' | 'medium';
  showClearButton?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  variant?: 'chip' | 'outlined' | 'standard';
}

// Person picker
export interface UIPersonPickerProperties extends UIPickerBaseProperties {
  value?: string;  // Person ID
  filter?: string; // Opcjonalny filtr query
  showAvatar?: boolean;
  showNick?: boolean;
}

// Task picker
export interface UITaskPickerProperties extends UIPickerBaseProperties {
  value?: string;  // Task ID
  projectFilter?: string;  // Opcjonalnie: tylko taski z określonego projektu
  showUnassigned?: boolean;
  showProjectName?: boolean;
  showStatus?: boolean;
}

// Project picker
export interface UIProjectPickerProperties extends UIPickerBaseProperties {
  value?: string;  // Project ID
  showNested?: boolean;  // Pokaż zagnieżdżoną hierarchię projektów
  showTaskCount?: boolean;
  maxDepth?: number;  // Maksymalna głębokość zagnieżdżenia
}

// Type guards
export function isPersonPickerProperties(props: unknown): props is UIPersonPickerProperties {
  return typeof props === 'object' && props !== null &&
    ('showAvatar' in props || 'showNick' in props ||
     (Object.keys(props).length === 0 || 'editable' in props || 'value' in props));
}

export function isTaskPickerProperties(props: unknown): props is UITaskPickerProperties {
  return typeof props === 'object' && props !== null &&
    ('projectFilter' in props || 'showUnassigned' in props || 'showProjectName' in props || 'showStatus' in props);
}

export function isProjectPickerProperties(props: unknown): props is UIProjectPickerProperties {
  return typeof props === 'object' && props !== null &&
    ('showNested' in props || 'showTaskCount' in props || 'maxDepth' in props);
}
