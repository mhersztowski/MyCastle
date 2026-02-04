/**
 * UI Label - tekst / nagłówek
 */

import React from 'react';
import { Typography } from '@mui/material';
import { UIControlModel, UILabelProperties } from '../../../models';
import { useUIBinding } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UILabelProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UILabel: React.FC<UILabelProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UILabelProperties;
  const { value } = useUIBinding<string>(control.binding);

  // Użyj wartości z bindingu lub z properties
  const text = value ?? props.text ?? '';

  return (
    <Typography
      variant={props.variant || 'body1'}
      sx={{
        color: props.color,
        textAlign: props.align,
        fontWeight: props.fontWeight,
        ...(props.noWrap ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
      }}
    >
      {text}
    </Typography>
  );
};

// Rejestracja
registerControl('label', UILabel, CONTROL_METADATA.label);
