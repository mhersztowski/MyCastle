/**
 * UI Scroll - przewijalny kontener
 */

import React from 'react';
import { Box } from '@mui/material';
import { UIControlModel, UIScrollProperties } from '../../../models';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIScrollProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIScroll: React.FC<UIScrollProps> = ({ control, children }) => {
  const props = (control.properties || {}) as unknown as UIScrollProperties;

  const horizontal = props.horizontal ?? false;
  const vertical = props.vertical ?? true;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        maxHeight: props.maxHeight,
        maxWidth: props.maxWidth,
        overflowX: horizontal ? 'auto' : 'hidden',
        overflowY: vertical ? 'auto' : 'hidden',
        // Pokaż scrollbar zawsze lub tylko gdy potrzebny
        ...(props.alwaysShowScrollbar
          ? {
              '&::-webkit-scrollbar': { width: 8, height: 8 },
              '&::-webkit-scrollbar-track': { bgcolor: 'grey.100' },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.400', borderRadius: 1 },
            }
          : {}),
      }}
    >
      {children}
    </Box>
  );
};

// Rejestracja
registerControl('scroll', UIScroll, CONTROL_METADATA.scroll);
