/**
 * UI Radio - grupa radio button
 */

import React from 'react';
import {
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import { UIControlModel, UIRadioProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIRadioProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIRadio: React.FC<UIRadioProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIRadioProperties;
  const { value, onChange, isEditable } = useUIControl<string>(
    control.binding,
    control.events
  );

  const selectedValue = value ?? props.value ?? '';
  const options = props.options || [];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value, e);
  };

  return (
    <FormControl
      component="fieldset"
      disabled={props.disabled || control.disabled || !isEditable}
    >
      {props.label && (
        <FormLabel component="legend">{props.label}</FormLabel>
      )}
      <RadioGroup
        value={selectedValue}
        onChange={handleChange}
        row={props.row}
      >
        {options.map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={
              <Radio
                color={props.color || 'primary'}
                size={props.size || 'medium'}
              />
            }
            label={option.label}
            disabled={option.disabled}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
};

// Rejestracja
registerControl('radio', UIRadio, CONTROL_METADATA.radio);
