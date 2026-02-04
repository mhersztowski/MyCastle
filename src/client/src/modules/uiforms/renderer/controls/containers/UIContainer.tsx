/**
 * UI Container - kontener z anchor layout
 */

import React from 'react';
import { Box } from '@mui/material';
import { UIControlModel, UIContainerProperties } from '../../../models';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIContainerProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIContainer: React.FC<UIContainerProps> = ({ control, children }) => {
  const props = (control.properties || {}) as unknown as UIContainerProperties;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: props.backgroundColor,
        borderRadius: props.borderRadius ? `${props.borderRadius}px` : undefined,
        border: props.border,
        padding: props.padding ? `${props.padding}px` : undefined,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {children}
    </Box>
  );
};

// Rejestracja
registerControl('container', UIContainer, CONTROL_METADATA.container);
