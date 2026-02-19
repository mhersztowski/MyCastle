/**
 * useUIBinding - hook do reaktywnego bindingu danych
 */

import { useCallback, useMemo } from 'react';
import { UIDataBinding } from '../models';
import { useUIFormContextOptional } from './UIFormContext';

export interface UIBindingResult<T = unknown> {
  value: T | undefined;
  onChange: (newValue: T) => void;
  isEditable: boolean;
  isBound: boolean;
}

/**
 * Hook do bindowania kontrolki do danych formularza
 * Works without context (returns defaults for design mode preview)
 */
export function useUIBinding<T = unknown>(binding?: UIDataBinding): UIBindingResult<T> {
  const context = useUIFormContextOptional();
  const data = context?.data ?? {};
  const updateData = context?.updateData ?? (() => {});
  const mode = context?.mode ?? 'view';

  // Pobierz wartość ze ścieżki
  const value = useMemo((): T | undefined => {
    if (!binding?.field) return undefined;
    return getValueByPath(data, binding.field) as T | undefined;
  }, [data, binding?.field]);

  // Funkcja do aktualizacji wartości
  const onChange = useCallback((newValue: T) => {
    if (!binding?.field) return;
    if (binding.mode === 'oneTime') return;
    if (mode === 'view') return;

    updateData(binding.field, newValue);
  }, [binding, updateData, mode]);

  // Czy kontrolka jest edytowalna
  const isEditable = useMemo(() => {
    if (mode === 'view') return false;
    if (!binding) return true; // Bez bindingu - edytowalna
    if (binding.mode === 'oneWay' || binding.mode === 'oneTime') return false;
    return true;
  }, [mode, binding]);

  // Czy ma binding
  const isBound = binding?.field !== undefined;

  return {
    value,
    onChange,
    isEditable,
    isBound,
  };
}

/**
 * Hook do triggerowania eventów kontrolki
 * Works without context (returns no-op handlers for design mode preview)
 */
export function useUIEvents(events?: {
  onClick?: string;
  onChange?: string;
  onFocus?: string;
  onBlur?: string;
  onSubmit?: string;
}) {
  const context = useUIFormContextOptional();
  const triggerCallback = context?.triggerCallback ?? (() => undefined);

  const handleClick = useCallback((e?: React.MouseEvent) => {
    if (events?.onClick) {
      triggerCallback(events.onClick, e);
    }
  }, [events?.onClick, triggerCallback]);

  const handleChange = useCallback((value: unknown, e?: React.ChangeEvent) => {
    if (events?.onChange) {
      triggerCallback(events.onChange, value, e);
    }
  }, [events?.onChange, triggerCallback]);

  const handleFocus = useCallback((e?: React.FocusEvent) => {
    if (events?.onFocus) {
      triggerCallback(events.onFocus, e);
    }
  }, [events?.onFocus, triggerCallback]);

  const handleBlur = useCallback((e?: React.FocusEvent) => {
    if (events?.onBlur) {
      triggerCallback(events.onBlur, e);
    }
  }, [events?.onBlur, triggerCallback]);

  const handleSubmit = useCallback((data?: unknown, e?: React.FormEvent) => {
    if (events?.onSubmit) {
      triggerCallback(events.onSubmit, data, e);
    }
  }, [events?.onSubmit, triggerCallback]);

  return {
    handleClick: events?.onClick ? handleClick : undefined,
    handleChange: events?.onChange ? handleChange : undefined,
    handleFocus: events?.onFocus ? handleFocus : undefined,
    handleBlur: events?.onBlur ? handleBlur : undefined,
    handleSubmit: events?.onSubmit ? handleSubmit : undefined,
    hasClickHandler: !!events?.onClick,
    hasChangeHandler: !!events?.onChange,
    hasFocusHandler: !!events?.onFocus,
    hasBlurHandler: !!events?.onBlur,
    hasSubmitHandler: !!events?.onSubmit,
  };
}

/**
 * Hook łączący binding i events
 */
export function useUIControl<T = unknown>(
  binding?: UIDataBinding,
  events?: {
    onClick?: string;
    onChange?: string;
    onFocus?: string;
    onBlur?: string;
    onSubmit?: string;
  }
) {
  const bindingResult = useUIBinding<T>(binding);
  const eventsResult = useUIEvents(events);

  // Połącz onChange z binding i events
  const combinedOnChange = useCallback((newValue: T, e?: React.ChangeEvent) => {
    bindingResult.onChange(newValue);
    if (eventsResult.handleChange) {
      eventsResult.handleChange(newValue, e);
    }
  }, [bindingResult, eventsResult]);

  return {
    ...bindingResult,
    ...eventsResult,
    onChange: combinedOnChange,
  };
}

// Helper - pobierz wartość ze ścieżki
function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
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
