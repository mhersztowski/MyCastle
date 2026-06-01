import ReactDOM from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ConfigProvider } from '@mhersztowski/ui-core';
import App from './App';
import { SceneViewerPage } from './pages/SceneViewerPage';
import { Scene3dViewerPage } from './pages/Scene3dViewerPage';
import { CadViewerPage } from './pages/CadViewerPage';
import { Cad3dViewerPage } from './pages/Cad3dViewerPage';
import { ElectronicsViewerPage } from './pages/ElectronicsViewerPage';
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
// /viewer/scene3d/*    → Scene3dViewerPage  (scene3d project by VFS path)
// /viewer/cad/*        → CadViewerPage      (CAD 2D, inline SVG)
// /viewer/cad3d/*      → Cad3dViewerPage    (CAD 3D via bridge)
// /viewer/electronics/* → ElectronicsViewerPage
// /viewer/scene/*      → SceneViewerPage    (legacy — .scene.json companion)
// /viewer/vr/*         → VrViewerPage
// everything else      → App (editor)
const path = window.location.pathname;
const scene3dMatch     = /^\/viewer\/scene3d\/(.+)$/.exec(path);
const cadMatch         = /^\/viewer\/cad\/(.+)$/.exec(path);
const cad3dMatch       = /^\/viewer\/cad3d\/(.+)$/.exec(path);
const electronicsMatch = /^\/viewer\/electronics\/(.+)$/.exec(path);
const sceneMatch       = /^\/viewer\/scene\/(.+)$/.exec(path);
const vrMatch          = /^\/viewer\/vr\/(.+)$/.exec(path);
const viewerDir        = new URLSearchParams(window.location.search).get('dir') ?? undefined;

function Root() {
  if (scene3dMatch)     return <Scene3dViewerPage     vfsPath={decodeURIComponent(scene3dMatch[1])} />;
  if (cadMatch)         return <CadViewerPage         vfsPath={decodeURIComponent(cadMatch[1])} />;
  if (cad3dMatch)       return <Cad3dViewerPage        vfsPath={decodeURIComponent(cad3dMatch[1])} />;
  if (electronicsMatch) return <ElectronicsViewerPage  vfsPath={decodeURIComponent(electronicsMatch[1])} />;
  if (sceneMatch)       return <SceneViewerPage projectName={decodeURIComponent(sceneMatch[1])} dir={viewerDir} />;
  if (vrMatch)          return <VrViewerPage    projectName={decodeURIComponent(vrMatch[1])} dir={viewerDir} />;
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
