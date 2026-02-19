/**
 * UI Input - pole tekstowe
 */

import React from 'react';
import { TextField } from '@mui/material';
import { UIControlModel, UIInputProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIInputProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIInput: React.FC<UIInputProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIInputProperties;
  const { value, onChange, isEditable, handleFocus, handleBlur } = useUIControl<string>(
    control.binding,
    control.events
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value, e);
  };

  return (
    <TextField
      value={value ?? ''}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      label={props.label}
      placeholder={props.placeholder}
      type={props.type || 'text'}
      variant={props.variant || 'outlined'}
      size={props.size || 'medium'}
      disabled={props.disabled || control.disabled || !isEditable}
      required={props.required}
      fullWidth={props.fullWidth ?? true}
      helperText={props.errorText || props.helperText}
      error={!!props.errorText}
      autoFocus={props.autoFocus}
      inputProps={{
        maxLength: props.maxLength,
        minLength: props.minLength,
        pattern: props.pattern,
      }}
    />
  );
};

// Rejestracja
registerControl('input', UIInput, CONTROL_METADATA.input);
