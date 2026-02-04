/**
 * UI Slider - suwak
 */

import React from 'react';
import { Box, Slider } from '@mui/material';
import { UIControlModel, UISliderProperties } from '../../../models';
import { useUIControl } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UISliderProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UISlider: React.FC<UISliderProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UISliderProperties;
  const { value, onChange, isEditable } = useUIControl<number | number[]>(
    control.binding,
    control.events
  );

  const sliderValue = value ?? props.value ?? (props.min ?? 0);

  const handleChange = (_: Event, newValue: number | number[]) => {
    onChange(newValue);
  };

  // Przygotuj marks
  const marks = props.marks === true
    ? undefined  // Auto marks
    : Array.isArray(props.marks)
      ? props.marks
      : props.marks === false
        ? []
        : undefined;

  return (
    <Box sx={{ width: '100%', px: 1 }}>
      <Slider
        value={sliderValue}
        onChange={handleChange}
        min={props.min ?? 0}
        max={props.max ?? 100}
        step={props.step ?? 1}
        marks={marks}
        disabled={props.disabled || control.disabled || !isEditable}
        orientation={props.orientation || 'horizontal'}
        valueLabelDisplay={props.valueLabelDisplay || 'auto'}
        color={props.color || 'primary'}
        size={props.size || 'medium'}
        track={props.track}
      />
    </Box>
  );
};

// Rejestracja
registerControl('slider', UISlider, CONTROL_METADATA.slider);
