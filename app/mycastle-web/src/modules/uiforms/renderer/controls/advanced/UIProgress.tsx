/**
 * UI Progress - pasek postępu
 */

import React from 'react';
import { Box, LinearProgress, CircularProgress, Typography } from '@mui/material';
import { UIControlModel, UIProgressProperties } from '../../../models';
import { useUIBinding } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UIProgressProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

export const UIProgress: React.FC<UIProgressProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UIProgressProperties;
  const { value: boundValue } = useUIBinding<number>(control.binding);

  const value = boundValue ?? props.value ?? 0;
  const type = props.type || 'linear';
  const variant = props.variant || 'determinate';

  if (type === 'circular') {
    return (
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress
          variant={variant as 'determinate' | 'indeterminate'}
          value={value}
          color={props.color || 'primary'}
          size={props.size || 40}
          thickness={props.thickness || 3.6}
        />
        {props.showLabel && variant === 'determinate' && (
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {`${Math.round(value)}%`}
            </Typography>
          </Box>
        )}
      </Box>
    );
  }

  // Linear progress
  return (
    <Box sx={{ width: '100%' }}>
      <LinearProgress
        variant={variant}
        value={value}
        color={props.color || 'primary'}
      />
      {props.showLabel && variant === 'determinate' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {`${Math.round(value)}%`}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// Rejestracja
registerControl('progress', UIProgress, CONTROL_METADATA.progress);
