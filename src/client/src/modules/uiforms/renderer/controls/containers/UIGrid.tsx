/**
 * UI Grid - siatka layout
 */

import React from 'react';
import { Box } from '@mui/material';
import { UIControlModel, UIGridProperties } from '../../../models';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIGridProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIGrid: React.FC<UIGridProps> = ({ control, children }) => {
  const props = (control.properties || {}) as unknown as UIGridProperties;

  const columns = props.columns || 2;
  const gap = props.gap ?? 8;
  const columnGap = props.columnGap ?? gap;
  const rowGap = props.rowGap ?? gap;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: props.rows ? `repeat(${props.rows}, auto)` : undefined,
        gap: `${rowGap}px ${columnGap}px`,
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
registerControl('grid', UIGrid, CONTROL_METADATA.grid);
