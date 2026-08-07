import ReactDOM from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { EditorPage } from './pages/EditorPage';
import '@mhersztowski/texteditor/dist/index.css';

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
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <EditorPage />
  </ThemeProvider>,
);
