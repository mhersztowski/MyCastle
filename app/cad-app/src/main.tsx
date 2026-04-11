import ReactDOM from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ConfigProvider } from '@mhersztowski/ui-core';
import App from './App';
import 'allotment/dist/style.css';
import '@mhersztowski/ui-components-scene3d/styles.css';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4fc3f7' },
    background: { default: '#1a1a1a', paper: '#252526' },
  },
  typography: {
    fontSize: 12,
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
  },
  components: {
    MuiButton: { defaultProps: { size: 'small' } },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
    MuiAccordion: { defaultProps: { disableGutters: true } },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </ThemeProvider>
);
