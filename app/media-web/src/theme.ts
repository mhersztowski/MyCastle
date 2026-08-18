import { createTheme } from '@mui/material/styles';

/**
 * Motyw zgodny z MyCastle: ten sam błękit paska, ta sama zaokrąglona geometria.
 * Ciemny tryb wchodzi tu jedną linią, gdy będzie potrzebny — na razie aplikacja
 * ma wyglądać jak reszta rodziny, a ta jest jasna.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    background: { default: '#f5f5f5' },
  },
  shape: { borderRadius: 8 },
});
