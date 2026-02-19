/**
 * UI Form Renderer - główny renderer formularza UI
 */

import React, { useMemo } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { UIFormModel } from '../models';
import { UIFormProvider, UIFormMode } from '../binding';
import { UIControlRenderer } from './UIControlRenderer';

interface UIFormRendererProps {
  form: UIFormModel;
  data?: Record<string, unknown>;
  mode?: UIFormMode;
  onChange?: (data: Record<string, unknown>) => void;
  onCallback?: (name: string, ...args: unknown[]) => unknown;
  showBorder?: boolean;
  elevation?: number;
}

export const UIFormRenderer: React.FC<UIFormRendererProps> = ({
  form,
  data: externalData,
  mode = 'view',
  onChange,
  onCallback,
  showBorder = false,
  elevation = 0,
}) => {
  // Inicjalizuj dane z defaultów schema jeśli nie podano
  const data = useMemo(() => {
    if (externalData) return externalData;

    // Generuj domyślne dane z schema
    const defaults: Record<string, unknown> = {};
    if (form.dataSchema) {
      for (const [key, field] of Object.entries(form.dataSchema)) {
        if (field.default !== undefined) {
          defaults[key] = field.default;
        } else {
          // Type-appropriate defaults
          switch (field.type) {
            case 'string': defaults[key] = ''; break;
            case 'number': defaults[key] = 0; break;
            case 'boolean': defaults[key] = false; break;
            case 'array': defaults[key] = []; break;
            case 'object': defaults[key] = {}; break;
            case 'date': defaults[key] = null; break;
          }
        }
      }
    }
    return defaults;
  }, [externalData, form.dataSchema]);

  // Style kontenera formularza
  const containerStyles = useMemo(() => {
    const styles: Record<string, unknown> = {
      position: 'relative',
      overflow: 'hidden',
    };

    // Wymiary
    if (form.settings?.width) {
      styles.width = typeof form.settings.width === 'number'
        ? `${form.settings.width}px`
        : form.settings.width;
    } else {
      styles.width = '100%';
    }

    if (form.settings?.height) {
      styles.height = typeof form.settings.height === 'number'
        ? `${form.settings.height}px`
        : form.settings.height;
    } else {
      styles.height = 'auto';
      styles.minHeight = 100;
    }

    // Background
    if (form.settings?.backgroundColor) {
      styles.backgroundColor = form.settings.backgroundColor;
    }

    // Padding
    if (form.settings?.padding) {
      styles.padding = form.settings.padding;
    }

    return styles;
  }, [form.settings]);

  const content = (
    <UIFormProvider
      form={form}
      data={data}
      mode={mode}
      onChange={onChange}
      onCallback={onCallback}
    >
      <Box
        sx={containerStyles}
        data-ui-form={form.id}
        data-ui-form-name={form.name}
      >
        <UIControlRenderer control={form.root} />
      </Box>
    </UIFormProvider>
  );

  // Opcjonalnie opakuj w Paper
  if (showBorder || elevation > 0) {
    return (
      <Paper elevation={elevation} sx={{ overflow: 'hidden' }}>
        {content}
      </Paper>
    );
  }

  return content;
};

/**
 * Komponent pomocniczy - wyświetla formularz lub placeholder
 */
interface UIFormDisplayProps {
  form: UIFormModel | null | undefined;
  data?: Record<string, unknown>;
  mode?: UIFormMode;
  onChange?: (data: Record<string, unknown>) => void;
  onCallback?: (name: string, ...args: unknown[]) => unknown;
  placeholder?: React.ReactNode;
  showBorder?: boolean;
  elevation?: number;
}

export const UIFormDisplay: React.FC<UIFormDisplayProps> = ({
  form,
  placeholder,
  ...props
}) => {
  if (!form) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: 'center',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'grey.50',
        }}
      >
        {placeholder || (
          <Typography variant="body2" color="text.secondary">
            No form selected
          </Typography>
        )}
      </Box>
    );
  }

  return <UIFormRenderer form={form} {...props} />;
};

/**
 * Hook do ładowania i renderowania formularza
 */
export function useUIForm(formId: string | null) {
  const [form, setForm] = React.useState<UIFormModel | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!formId) {
      setForm(null);
      return;
    }

    const loadForm = async () => {
      setLoading(true);
      setError(null);

      try {
        // Import dynamiczny żeby uniknąć circular dependency
        const { uiFormService } = await import('../services');

        // Załaduj formularze jeśli nie załadowane
        if (!uiFormService.loaded) {
          await uiFormService.loadForms();
        }

        const formNode = uiFormService.getFormById(formId);
        if (formNode) {
          setForm(formNode.toModel());
        } else {
          setError(`Form not found: ${formId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load form');
      } finally {
        setLoading(false);
      }
    };

    loadForm();
  }, [formId]);

  return { form, loading, error };
}
