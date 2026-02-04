/**
 * UI Input Models - modele kontrolek input
 */

// Label
export interface UILabelProperties {
  text: string;
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption' | 'overline';
  color?: string;
  align?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'medium' | 'bold';
  noWrap?: boolean;
}

// Button
export interface UIButtonProperties {
  text: string;
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'inherit';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: string;
  iconPosition?: 'start' | 'end';
  href?: string;
}

// Input (TextField)
export interface UIInputProperties {
  placeholder?: string;
  label?: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'search';
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  errorText?: string;
  autoFocus?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
}

// Textarea (wieloliniowy input)
export interface UITextareaProperties {
  placeholder?: string;
  label?: string;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  errorText?: string;
  rows?: number;
  minRows?: number;
  maxRows?: number;
  maxLength?: number;
}

// Checkbox
export interface UICheckboxProperties {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'default';
  size?: 'small' | 'medium';
  labelPlacement?: 'end' | 'start' | 'top' | 'bottom';
}

// Radio group
export interface UIRadioProperties {
  label?: string;
  options: UIRadioOption[];
  value?: string;
  disabled?: boolean;
  row?: boolean;
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'default';
  size?: 'small' | 'medium';
}

export interface UIRadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// Select (dropdown)
export interface UISelectProperties {
  label?: string;
  placeholder?: string;
  options: UISelectOption[];
  value?: string | string[];
  multiple?: boolean;
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  helperText?: string;
  errorText?: string;
}

export interface UISelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

// Slider
export interface UISliderProperties {
  min?: number;
  max?: number;
  step?: number;
  value?: number | number[];
  marks?: boolean | UISliderMark[];
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  valueLabelDisplay?: 'auto' | 'on' | 'off';
  color?: 'primary' | 'secondary';
  size?: 'small' | 'medium';
  track?: 'normal' | 'inverted' | false;
}

export interface UISliderMark {
  value: number;
  label?: string;
}

// Progress
export interface UIProgressProperties {
  value?: number;
  variant?: 'determinate' | 'indeterminate' | 'buffer' | 'query';
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'inherit';
  type?: 'linear' | 'circular';
  size?: number;  // Dla circular
  thickness?: number;
  showLabel?: boolean;
}

// Table
export interface UITableProperties {
  columns: UITableColumn[];
  data?: unknown[];
  dataBinding?: string;  // Ścieżka do tablicy w danych formularza
  selectable?: boolean;
  selectMode?: 'single' | 'multiple';
  pagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  sortable?: boolean;
  stickyHeader?: boolean;
  size?: 'small' | 'medium';
  hover?: boolean;
}

export interface UITableColumn {
  id: string;
  header: string;
  field: string;
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: string;  // Nazwa custom renderera
  format?: 'text' | 'number' | 'date' | 'currency' | 'boolean';
}

// Type guards
export function isLabelProperties(props: unknown): props is UILabelProperties {
  return typeof props === 'object' && props !== null && 'text' in props;
}

export function isButtonProperties(props: unknown): props is UIButtonProperties {
  return typeof props === 'object' && props !== null && 'text' in props && !('variant' in props && (props as { variant?: string }).variant?.startsWith('h'));
}

export function isInputProperties(props: unknown): props is UIInputProperties {
  return typeof props === 'object' && props !== null && ('placeholder' in props || 'label' in props) && !('rows' in props);
}

export function isTextareaProperties(props: unknown): props is UITextareaProperties {
  return typeof props === 'object' && props !== null && 'rows' in props;
}

export function isCheckboxProperties(props: unknown): props is UICheckboxProperties {
  return typeof props === 'object' && props !== null && ('checked' in props || 'indeterminate' in props);
}

export function isRadioProperties(props: unknown): props is UIRadioProperties {
  return typeof props === 'object' && props !== null && 'options' in props && !('multiple' in props);
}

export function isSelectProperties(props: unknown): props is UISelectProperties {
  return typeof props === 'object' && props !== null && 'options' in props && !('row' in props);
}

export function isSliderProperties(props: unknown): props is UISliderProperties {
  return typeof props === 'object' && props !== null && ('min' in props || 'max' in props || 'step' in props);
}

export function isProgressProperties(props: unknown): props is UIProgressProperties {
  return typeof props === 'object' && props !== null && ('variant' in props && ['determinate', 'indeterminate', 'buffer', 'query'].includes((props as { variant?: string }).variant || ''));
}

export function isTableProperties(props: unknown): props is UITableProperties {
  return typeof props === 'object' && props !== null && 'columns' in props;
}
