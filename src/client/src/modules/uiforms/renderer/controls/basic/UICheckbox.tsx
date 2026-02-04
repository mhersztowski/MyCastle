/**
 * UI Checkbox - pole wyboru
 */

import React from 'react';
import { FormControlLabel, Checkbox } from '@mui/material';
import { UIControlModel, UICheckboxProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UICheckboxProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UICheckbox: React.FC<UICheckboxProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UICheckboxProperties;
  const { value, onChange, isEditable } = useUIControl<boolean>(
    control.binding,
    control.events
  );

  const checked = value ?? props.checked ?? false;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked, e);
  };

  const checkbox = (
    <Checkbox
      checked={checked}
      onChange={handleChange}
      disabled={props.disabled || control.disabled || !isEditable}
      indeterminate={props.indeterminate}
      color={props.color || 'primary'}
      size={props.size || 'medium'}
    />
  );

  if (props.label) {
    return (
      <FormControlLabel
        control={checkbox}
        label={props.label}
        labelPlacement={props.labelPlacement || 'end'}
        disabled={props.disabled || control.disabled || !isEditable}
      />
    );
  }

  return checkbox;
};

// Rejestracja
registerControl('checkbox', UICheckbox, CONTROL_METADATA.checkbox);
