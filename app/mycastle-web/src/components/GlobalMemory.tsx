/**
 * Memory as a Global Window — same MemoryPage component used by the
 * `/user/:userName/pim/memory` route, but rendered in a floating window so
 * the user can keep their knowledge-test panel open across pages.
 *
 * MemoryPage falls back to the logged-in userName via useAuth when no URL
 * param is present, so we don't need to pass anything from here.
 */

import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

const MemoryPage = lazy(() => import('../pages/memory/MemoryPage'));

export function GlobalMemory() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('memory');

  return (
    <GlobalWindow
      windowName="memory"
      title="Memory"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('memory')}
      onMinimize={() => minimize('memory')}
      onRestore={() => restore('memory')}
      defaultWidth={1000}
      defaultHeight={750}
    >
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <MemoryPage />
        </Box>
      </Suspense>
    </GlobalWindow>
  );
}
