/**
 * UI HBox - horizontal layout (wiersz)
 */

import React from 'react';
import { Box } from '@mui/material';
import { UIControlModel, UIHBoxProperties } from '../../../models';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIHBoxProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIHBox: React.FC<UIHBoxProps> = ({ control, children }) => {
  const props = (control.properties || {}) as unknown as UIHBoxProperties;

  // Mapuj alignment na flexbox align-items
  const alignItems = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
  }[props.alignment || 'center'];

  // Mapuj justify na flexbox justify-content
  const justifyContent = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    spaceBetween: 'space-between',
    spaceAround: 'space-around',
  }[props.justify || 'start'];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: props.wrap ? 'wrap' : 'nowrap',
        gap: props.gap !== undefined ? `${props.gap}px` : '8px',
        alignItems,
        justifyContent,
        width: '100%',
        padding: props.padding ? `${props.padding}px` : undefined,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </Box>
  );
};

// Rejestracja
registerControl('hbox', UIHBox, CONTROL_METADATA.hbox);
