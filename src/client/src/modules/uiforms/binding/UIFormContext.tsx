/**
 * UI Form Context - context dla danych formularza i data binding
 */

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { UIFormModel } from '../models';

export type UIFormMode = 'view' | 'edit' | 'design';

export interface UIFormContextValue {
  // Form data
  form: UIFormModel | null;
  data: Record<string, unknown>;
  mode: UIFormMode;

  // Data operations
  updateData: (path: string, value: unknown) => void;
  getData: (path: string) => unknown;

  // Callback operations
  triggerCallback: (name: string, ...args: unknown[]) => unknown;
  registerCallback: (name: string, callback: (...args: unknown[]) => unknown) => void;
  unregisterCallback: (name: string) => void;

  // Selection (for design mode)
  selectedControlId: string | null;
  setSelectedControlId: (id: string | null) => void;
}

export const UIFormContext = createContext<UIFormContextValue | null>(null);

/**
 * Hook do używania kontekstu formularza
 */
export function useUIFormContext(): UIFormContextValue {
  const context = useContext(UIFormContext);
  if (!context) {
    throw new Error('useUIFormContext must be used within UIFormContext.Provider');
  }
  return context;
}

/**
 * Hook do opcjonalnego używania kontekstu formularza
 * Zwraca null jeśli nie jest w providerze (przydatne dla design mode)
 */
export function useUIFormContextOptional(): UIFormContextValue | null {
  return useContext(UIFormContext);
}

/**
 * Hook do pobierania wartości z data path
 */
export function useFormData<T = unknown>(path: string, defaultValue?: T): T {
  const { getData } = useUIFormContext();
  const value = getData(path);
  return (value as T) ?? (defaultValue as T);
}

/**
 * Hook do aktualizacji wartości
 */
export function useFormDataUpdate(path: string): (value: unknown) => void {
  const { updateData } = useUIFormContext();
  return useCallback((value: unknown) => {
    updateData(path, value);
  }, [updateData, path]);
}

// Helper functions for nested data access

/**
 * Pobierz wartość z zagnieżdżonej ścieżki (np. "person.address.city")
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;

    // Handle array index (e.g., "items[0]")
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      const arr = (current as Record<string, unknown>)[key];
      if (!Array.isArray(arr)) return undefined;
      current = arr[parseInt(index, 10)];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Ustaw wartość w zagnieżdżonej ścieżce (immutable)
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const parts = path.split('.');
  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    // Handle array index
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      const arr = current[key];
      if (!Array.isArray(arr)) {
        current[key] = [];
      }
      const newArr = [...(current[key] as unknown[])];
      const idx = parseInt(index, 10);
      if (newArr[idx] === undefined || typeof newArr[idx] !== 'object') {
        newArr[idx] = {};
      } else {
        newArr[idx] = { ...(newArr[idx] as Record<string, unknown>) };
      }
      current[key] = newArr;
      current = newArr[idx] as Record<string, unknown>;
    } else {
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      } else {
        current[part] = { ...(current[part] as Record<string, unknown>) };
      }
      current = current[part] as Record<string, unknown>;
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const [, key, index] = arrayMatch;
    const arr = current[key];
    const newArr = Array.isArray(arr) ? [...arr] : [];
    newArr[parseInt(index, 10)] = value;
    current[key] = newArr;
  } else {
    current[lastPart] = value;
  }

  return result;
}

// Provider component

interface UIFormProviderProps {
  form: UIFormModel | null;
  data: Record<string, unknown>;
  mode?: UIFormMode;
  onChange?: (data: Record<string, unknown>) => void;
  onCallback?: (name: string, ...args: unknown[]) => unknown;
  children: React.ReactNode;
}

export const UIFormProvider: React.FC<UIFormProviderProps> = ({
  form,
  data,
  mode = 'view',
  onChange,
  onCallback,
  children,
}) => {
  const [selectedControlId, setSelectedControlId] = React.useState<string | null>(null);
  const callbackRegistry = React.useRef<Map<string, (...args: unknown[]) => unknown>>(new Map());

  const updateData = useCallback((path: string, value: unknown) => {
    if (onChange) {
      const newData = setNestedValue(data, path, value);
      onChange(newData);
    }
  }, [data, onChange]);

  const getData = useCallback((path: string): unknown => {
    return getNestedValue(data, path);
  }, [data]);

  const triggerCallback = useCallback((name: string, ...args: unknown[]): unknown => {
    // First check external callback handler
    if (onCallback) {
      const result = onCallback(name, ...args);
      if (result !== undefined) return result;
    }

    // Then check registered callbacks
    const callback = callbackRegistry.current.get(name);
    if (callback) {
      return callback(...args);
    }

    console.warn(`Callback not found: ${name}`);
    return undefined;
  }, [onCallback]);

  const registerCallback = useCallback((name: string, callback: (...args: unknown[]) => unknown) => {
    callbackRegistry.current.set(name, callback);
  }, []);

  const unregisterCallback = useCallback((name: string) => {
    callbackRegistry.current.delete(name);
  }, []);

  const contextValue = useMemo<UIFormContextValue>(() => ({
    form,
    data,
    mode,
    updateData,
    getData,
    triggerCallback,
    registerCallback,
    unregisterCallback,
    selectedControlId,
    setSelectedControlId,
  }), [
    form,
    data,
    mode,
    updateData,
    getData,
    triggerCallback,
    registerCallback,
    unregisterCallback,
    selectedControlId,
  ]);

  return (
    <UIFormContext.Provider value={contextValue}>
      {children}
    </UIFormContext.Provider>
  );
};
