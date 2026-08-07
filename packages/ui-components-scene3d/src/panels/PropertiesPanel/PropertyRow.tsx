/**
 * PropertyRow — etykieta i pole w jednym wierszu inspektora.
 *
 * We własnym pliku, bo używa go i sam panel, i sekcje wydzielone obok niego;
 * trzymanie go w `PropertiesPanel.tsx` robiłoby z importu cykl.
 */
import { Box, Typography } from '@mui/material';

export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', minWidth: 50, flexShrink: 0 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}
