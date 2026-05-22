import ReactDOM from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ConfigProvider } from '@mhersztowski/ui-core';
import App from './App';
import { SceneViewerPage } from './pages/SceneViewerPage';
import { VrViewerPage } from './pages/VrViewerPage';
import 'allotment/dist/style.css';
import '@mhersztowski/ui-components-scene3d/styles.css';
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
    MuiAccordion: { defaultProps: { disableGutters: true } },
  },
});

// Simple path-based routing without react-router.
// /viewer/scene/:projectName?dir=  → SceneViewerPage
// /viewer/vr/:projectName?dir=     → VrViewerPage
// everything else                  → App (editor)
const path = window.location.pathname;
const sceneMatch = /^\/viewer\/scene\/(.+)$/.exec(path);
const vrMatch    = /^\/viewer\/vr\/(.+)$/.exec(path);
// Optional VFS directory the project lives in (defaults applied by the page).
const viewerDir = new URLSearchParams(window.location.search).get('dir') ?? undefined;

function Root() {
  if (sceneMatch) return <SceneViewerPage projectName={decodeURIComponent(sceneMatch[1])} dir={viewerDir} />;
  if (vrMatch)    return <VrViewerPage    projectName={decodeURIComponent(vrMatch[1])} dir={viewerDir} />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <ConfigProvider>
      <Root />
    </ConfigProvider>
  </ThemeProvider>
);
