/**
 * UI Button - przycisk akcji
 */

import React from 'react';
import { Button } from '@mui/material';
import * as Icons from '@mui/icons-material';
import { UIControlModel, UIButtonProperties } from '../../../models';
import { useUIEvents } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIButtonProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIButton: React.FC<UIButtonProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIButtonProperties;
  const { handleClick } = useUIEvents(control.events);

  // Dynamiczne ładowanie ikony
  const IconComponent = props.icon
    ? (Icons as Record<string, React.ElementType>)[props.icon]
    : null;

  const icon = IconComponent ? <IconComponent /> : null;

  // Jeśli jest href, użyj linku
  if (props.href) {
    return (
      <Button
        variant={props.variant || 'contained'}
        color={props.color || 'primary'}
        size={props.size || 'medium'}
        disabled={props.disabled || control.disabled}
        fullWidth={props.fullWidth}
        href={props.href}
        startIcon={props.iconPosition === 'start' ? icon : undefined}
        endIcon={props.iconPosition === 'end' ? icon : undefined}
      >
        {props.text || 'Button'}
      </Button>
    );
  }

  return (
    <Button
      variant={props.variant || 'contained'}
      color={props.color || 'primary'}
      size={props.size || 'medium'}
      disabled={props.disabled || control.disabled}
      fullWidth={props.fullWidth}
      onClick={handleClick}
      startIcon={props.iconPosition === 'start' ? icon : undefined}
      endIcon={props.iconPosition === 'end' ? icon : undefined}
    >
      {props.text || 'Button'}
    </Button>
  );
};

// Rejestracja
registerControl('button', UIButton, CONTROL_METADATA.button);
