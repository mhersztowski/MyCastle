/**
 * UI Form Model - model całego formularza UI
 */

import { UIControlModel } from './UIControlModel';

// Ustawienia formularza
export interface UIFormSettings {
  width?: number | string;
  height?: number | string;
  backgroundColor?: string;
  padding?: number;
}

// Definicja callback'a
export interface UICallbackDefinition {
  name: string;
  parameters?: string[];
  body?: string;      // Dla inline forms: ciało funkcji
  handler?: string;   // Dla file-based: referencja do zewnętrznego handlera
}

// Definicja pola danych
export interface UIDataField {
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  default?: unknown;
  required?: boolean;
  validation?: string;
}

// Model formularza UI
export interface UIFormModel {
  type: 'ui_form';
  id: string;
  name: string;
  description?: string;
  version: string;

  // Root control (zazwyczaj kontener)
  root: UIControlModel;

  // Ustawienia formularza
  settings?: UIFormSettings;

  // Zdefiniowane callback'i
  callbacks?: Record<string, UICallbackDefinition>;

  // Schema danych dla bindingu
  dataSchema?: Record<string, UIDataField>;
}

// Kolekcja formularzy (jak PersonsModel)
export interface UIFormsModel {
  type: 'ui_forms';
  forms: UIFormModel[];
}

// Helper do tworzenia nowego formularza
export function createForm(
  id: string,
  name: string,
  root: UIControlModel,
  options: Partial<Omit<UIFormModel, 'type' | 'id' | 'name' | 'root'>> = {}
): UIFormModel {
  return {
    type: 'ui_form',
    id,
    name,
    version: '1.0',
    root,
    ...options,
  };
}

// Helper do tworzenia pustej kolekcji formularzy
export function createFormsCollection(forms: UIFormModel[] = []): UIFormsModel {
  return {
    type: 'ui_forms',
    forms,
  };
}
