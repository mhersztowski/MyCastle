/**
 * UI Margin - kontener z marginesami
 */

import React from 'react';
import { Box } from '@mui/material';
import { UIControlModel, UIMarginProperties } from '../../../models';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIMarginProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIMargin: React.FC<UIMarginProps> = ({ control, children }) => {
  const props = (control.properties || {}) as unknown as UIMarginProperties;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        paddingLeft: props.marginLeft ? `${props.marginLeft}px` : undefined,
        paddingTop: props.marginTop ? `${props.marginTop}px` : undefined,
        paddingRight: props.marginRight ? `${props.marginRight}px` : undefined,
        paddingBottom: props.marginBottom ? `${props.marginBottom}px` : undefined,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </Box>
  );
};

// Rejestracja
registerControl('margin', UIMargin, CONTROL_METADATA.margin);
