/**
 * Full-surface loading overlay shown while Pyodide (the Python runtime) and its
 * packages download/boot. Driven by PyodideRuntime progress messages.
 */
import React from 'react';
import { Box, CircularProgress, Typography, LinearProgress } from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import type { PyodideProgress } from './PyodideRuntime';

const PHASE_TITLE: Record<string, string> = {
  runtime: 'Ładowanie Pythona…',
  packages: 'Ładowanie pakietów…',
  running: 'Uruchamianie…',
  ready: 'Gotowe',
  error: 'Błąd Pyodide',
  idle: 'Przygotowanie…',
};

export const PyodideLoadingOverlay: React.FC<{ progress: PyodideProgress }> = ({ progress }) => {
  const isError = progress.phase === 'error';
  return (
    <Box
      sx={{
        position: 'absolute', inset: 0, zIndex: 30,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, p: 3, textAlign: 'center',
        bgcolor: 'rgba(20,20,24,0.92)', color: '#fff', backdropFilter: 'blur(2px)',
      }}
    >
      <MemoryIcon sx={{ fontSize: 40, color: isError ? 'error.main' : '#4fc3f7' }} />
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {PHASE_TITLE[progress.phase] ?? 'Ładowanie…'}
      </Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 420 }}>
        {progress.message}
      </Typography>
      {isError ? null : (
        <Box sx={{ width: 260, mt: 1 }}>
          {progress.phase === 'runtime' || progress.phase === 'packages'
            ? <LinearProgress />
            : <CircularProgress size={24} sx={{ mx: 'auto', display: 'block' }} />}
        </Box>
      )}
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>
        Python działa w tle (Web Worker) — interfejs pozostaje responsywny.
      </Typography>
    </Box>
  );
};

export default PyodideLoadingOverlay;
