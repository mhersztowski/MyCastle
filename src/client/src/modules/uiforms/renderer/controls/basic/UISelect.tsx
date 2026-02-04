/**
 * UI Select - lista rozwijana
 */

import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  ListSubheader,
  SelectChangeEvent,
} from '@mui/material';
import { UIControlModel, UISelectProperties, UISelectOption } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UISelectProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UISelect: React.FC<UISelectProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UISelectProperties;
  const { value, onChange, isEditable } = useUIControl<string | string[]>(
    control.binding,
    control.events
  );

  const selectedValue = value ?? props.value ?? (props.multiple ? [] : '');
  const options = props.options || [];

  const handleChange = (e: SelectChangeEvent<string | string[]>) => {
    onChange(e.target.value);
  };

  // Grupuj opcje jeśli mają pole group
  const groupedOptions = React.useMemo(() => {
    const groups = new Map<string, UISelectOption[]>();
    const ungrouped: UISelectOption[] = [];

    for (const option of options) {
      if (option.group) {
        const group = groups.get(option.group) || [];
        group.push(option);
        groups.set(option.group, group);
      } else {
        ungrouped.push(option);
      }
    }

    return { groups, ungrouped };
  }, [options]);

  // Renderuj opcje (z grupami lub bez)
  const renderOptions = () => {
    const items: React.ReactNode[] = [];

    // Najpierw niezgrupowane
    for (const option of groupedOptions.ungrouped) {
      items.push(
        <MenuItem key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </MenuItem>
      );
    }

    // Potem grupy
    for (const [groupName, groupOptions] of groupedOptions.groups) {
      items.push(
        <ListSubheader key={`group-${groupName}`}>{groupName}</ListSubheader>
      );
      for (const option of groupOptions) {
        items.push(
          <MenuItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </MenuItem>
        );
      }
    }

    return items;
  };

  const labelId = `${control.id}-label`;

  return (
    <FormControl
      variant={props.variant || 'outlined'}
      size={props.size || 'medium'}
      fullWidth={props.fullWidth ?? true}
      disabled={props.disabled || control.disabled || !isEditable}
      required={props.required}
      error={!!props.errorText}
    >
      {props.label && (
        <InputLabel id={labelId}>{props.label}</InputLabel>
      )}
      <Select
        labelId={labelId}
        value={selectedValue}
        onChange={handleChange}
        label={props.label}
        multiple={props.multiple}
        displayEmpty={!!props.placeholder}
        renderValue={(selected) => {
          if (props.multiple && Array.isArray(selected) && selected.length === 0) {
            return <em>{props.placeholder}</em>;
          }
          if (!props.multiple && selected === '') {
            return <em>{props.placeholder}</em>;
          }

          // Znajdź etykiety dla wybranych wartości
          if (props.multiple && Array.isArray(selected)) {
            return selected
              .map(v => options.find(o => o.value === v)?.label ?? v)
              .join(', ');
          }
          return options.find(o => o.value === selected)?.label ?? selected;
        }}
      >
        {props.placeholder && !props.multiple && (
          <MenuItem value="" disabled>
            <em>{props.placeholder}</em>
          </MenuItem>
        )}
        {renderOptions()}
      </Select>
      {(props.errorText || props.helperText) && (
        <FormHelperText>{props.errorText || props.helperText}</FormHelperText>
      )}
    </FormControl>
  );
};

// Rejestracja
registerControl('select', UISelect, CONTROL_METADATA.select);
