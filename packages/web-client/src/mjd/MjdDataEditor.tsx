import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { MjdDocument, MjdFieldDef, MjdFieldType } from '@mhersztowski/core';
import { getFieldsForView } from '@mhersztowski/core';

export interface MjdDataEditorProps {
  definition: MjdDocument;
  value: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

// --- Field Controls ---

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: MjdFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = field.label ?? field.name;
  const helperText = field.description;

  switch (field.type) {
    case 'string':
      return (
        <TextField
          label={label}
          helperText={helperText}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          fullWidth
          size="small"
        />
      );
    case 'number':
      return (
        <TextField
          label={label}
          helperText={helperText}
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          required={field.required}
          fullWidth
          size="small"
        />
      );
    case 'boolean':
      return (
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
            />
          }
          label={<>
            {label}
            {helperText && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{helperText}</Typography>}
          </>}
        />
      );
    case 'date':
      return (
        <TextField
          label={label}
          helperText={helperText}
          type="datetime-local"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      );
    case 'enum':
      return (
        <FormControl fullWidth size="small" required={field.required}>
          <InputLabel>{label}</InputLabel>
          <Select
            value={(value as string) ?? ''}
            label={label}
            onChange={(e) => onChange(e.target.value)}
          >
            {(field.options ?? []).map((opt) => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
          {helperText && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{helperText}</Typography>}
        </FormControl>
      );
    case 'array':
      return (
        <ArrayFieldControl
          field={field}
          value={value as unknown[] | undefined}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

function ArrayFieldControl({
  field,
  value,
  onChange,
}: {
  field: MjdFieldDef;
  value: unknown[] | undefined;
  onChange: (v: unknown) => void;
}) {
  const items = value ?? [];
  const itemType = field.itemType ?? 'string';
  const label = field.label ?? field.name;

  const updateItem = (index: number, val: unknown) => {
    const next = [...items];
    next[index] = val;
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    onChange([...items, getDefaultForType(itemType)]);
  };

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>{label}</Typography>
      {field.description && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>{field.description}</Typography>
      )}
      {items.map((item, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <Box sx={{ flex: 1 }}>
            <FieldControl
              field={{ ...field, name: `${field.name}[${i}]`, type: itemType, label: `#${i + 1}`, description: undefined, tags: [] }}
              value={item}
              onChange={(v) => updateItem(i, v)}
            />
          </Box>
          <IconButton size="small" onClick={() => removeItem(i)} title="Remove">
            <Typography variant="body2">{'\u2715'}</Typography>
          </IconButton>
        </Box>
      ))}
      <Button size="small" onClick={addItem}>+ Add item</Button>
    </Box>
  );
}

function getDefaultForType(type: MjdFieldType): unknown {
  switch (type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'date': return '';
    case 'enum': return '';
    case 'array': return [];
  }
}

// --- Main Component ---

export function MjdDataEditor({ definition, value, onChange }: MjdDataEditorProps) {
  const [selectedView, setSelectedView] = useState<string>(definition.views[0]?.name ?? '');

  const visibleFields = useMemo(() => {
    const view = definition.views.find((v) => v.name === selectedView);
    if (!view) return definition.fields;
    return getFieldsForView(definition, view.tag);
  }, [definition, selectedView]);

  const updateFieldValue = useCallback((fieldName: string, fieldValue: unknown) => {
    onChange({ ...value, [fieldName]: fieldValue });
  }, [value, onChange]);

  return (
    <Box sx={{ p: 2 }}>
      {/* View selector */}
      {definition.views.length > 0 && (
        <FormControl size="small" sx={{ mb: 2, minWidth: 200 }}>
          <InputLabel>View</InputLabel>
          <Select
            value={selectedView}
            label="View"
            onChange={(e) => setSelectedView(e.target.value)}
          >
            {definition.views.map((v) => (
              <MenuItem key={v.name} value={v.name}>{v.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Fields */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleFields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            value={value[field.name]}
            onChange={(v) => updateFieldValue(field.name, v)}
          />
        ))}
        {visibleFields.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No fields in this view
          </Typography>
        )}
      </Box>
    </Box>
  );
}
