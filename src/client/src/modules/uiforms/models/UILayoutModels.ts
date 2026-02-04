/**
 * UI Layout Models - modele kontenerów
 */

import { UIControlModel } from './UIControlModel';

// Container - podstawowy kontener z anchor layout
export interface UIContainerProperties {
  backgroundColor?: string;
  borderRadius?: number;
  border?: string;
  padding?: number;
}

// VBox - vertical layout
export interface UIVBoxProperties {
  gap?: number;
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  padding?: number;
}

// HBox - horizontal layout
export interface UIHBoxProperties {
  gap?: number;
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
  wrap?: boolean;
  padding?: number;
}

// Grid layout
export interface UIGridProperties {
  columns: number;
  rows?: number;
  gap?: number;
  columnGap?: number;
  rowGap?: number;
  padding?: number;
}

// Margin container
export interface UIMarginProperties {
  marginLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
}

// Scroll container
export interface UIScrollProperties {
  horizontal?: boolean;
  vertical?: boolean;
  alwaysShowScrollbar?: boolean;
  maxHeight?: number | string;
  maxWidth?: number | string;
}

// Tabs container
export interface UITabsProperties {
  activeTab?: number;
  tabs: UITabDefinition[];
  variant?: 'standard' | 'scrollable' | 'fullWidth';
  centered?: boolean;
}

export interface UITabDefinition {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  content: UIControlModel;
}

// Accordion
export interface UIAccordionProperties {
  allowMultiple?: boolean;
  expandedItems?: string[];
  items: UIAccordionItem[];
}

export interface UIAccordionItem {
  id: string;
  header: string;
  icon?: string;
  disabled?: boolean;
  defaultExpanded?: boolean;
  content: UIControlModel;
}

// Type guards
export function isVBoxProperties(props: unknown): props is UIVBoxProperties {
  return typeof props === 'object' && props !== null && 'gap' in props;
}

export function isHBoxProperties(props: unknown): props is UIHBoxProperties {
  return typeof props === 'object' && props !== null && ('gap' in props || 'justify' in props);
}

export function isGridProperties(props: unknown): props is UIGridProperties {
  return typeof props === 'object' && props !== null && 'columns' in props;
}

export function isTabsProperties(props: unknown): props is UITabsProperties {
  return typeof props === 'object' && props !== null && 'tabs' in props;
}

export function isAccordionProperties(props: unknown): props is UIAccordionProperties {
  return typeof props === 'object' && props !== null && 'items' in props;
}
