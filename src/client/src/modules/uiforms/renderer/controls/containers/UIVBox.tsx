/**
 * UI VBox - vertical layout (kolumna)
 */

import React from 'react';
import { Box } from '@mui/material';
import { UIControlModel, UIVBoxProperties } from '../../../models';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIVBoxProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIVBox: React.FC<UIVBoxProps> = ({ control, children }) => {
  const props = (control.properties || {}) as unknown as UIVBoxProperties;

  // Mapuj alignment na flexbox align-items
  const alignItems = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
  }[props.alignment || 'stretch'];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: props.gap !== undefined ? `${props.gap}px` : '8px',
        alignItems,
        width: '100%',
        height: '100%',
        padding: props.padding ? `${props.padding}px` : undefined,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </Box>
  );
};

// Rejestracja
registerControl('vbox', UIVBox, CONTROL_METADATA.vbox);
