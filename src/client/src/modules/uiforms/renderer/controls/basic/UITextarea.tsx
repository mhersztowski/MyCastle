/**
 * UI Textarea - wieloliniowe pole tekstowe
 */

import React from 'react';
import { TextField } from '@mui/material';
import { UIControlModel, UITextareaProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UITextareaProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UITextarea: React.FC<UITextareaProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UITextareaProperties;
  const { value, onChange, isEditable, handleFocus, handleBlur } = useUIControl<string>(
    control.binding,
    control.events
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
      variant={props.variant || 'outlined'}
      size={props.size || 'medium'}
      disabled={props.disabled || control.disabled || !isEditable}
      required={props.required}
      fullWidth={props.fullWidth ?? true}
      helperText={props.errorText || props.helperText}
      error={!!props.errorText}
      multiline
      rows={props.rows || 4}
      minRows={props.minRows}
      maxRows={props.maxRows}
      inputProps={{
        maxLength: props.maxLength,
      }}
    />
  );
};

// Rejestracja
registerControl('textarea', UITextarea, CONTROL_METADATA.textarea);
