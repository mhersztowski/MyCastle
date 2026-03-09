import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

const DocsPage = lazy(() => import('../pages/minis-user/tools/DocsPage'));

export function GlobalApiDocs() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('apiDocs');

  return (
    <GlobalWindow
      windowName="apiDocs"
      title="API Docs"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('apiDocs')}
      onMinimize={() => minimize('apiDocs')}
      onRestore={() => restore('apiDocs')}
      defaultWidth={900}
      defaultHeight={700}
    >
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        <Box sx={{ height: '100%' }}>
          <DocsPage height="100%" />
        </Box>
      </Suspense>
    </GlobalWindow>
  );
}
