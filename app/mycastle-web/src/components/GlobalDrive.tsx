/**
 * Drive as a Global Window — same DrivePage component used by the regular
 * `/user/:userName/pim/drive` route, but rendered in a floating, resizable
 * window so the user can keep it open across page navigations.
 *
 * DrivePage falls back to the logged-in userName via useAuth when no URL
 * param is present, so we don't need to pass anything from here.
 */

import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

const DrivePage = lazy(() => import('../pages/drive/DrivePage'));

export function GlobalDrive() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('drive');

  return (
    <GlobalWindow
      windowName="drive"
      title="Drive"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('drive')}
      onMinimize={() => minimize('drive')}
      onRestore={() => restore('drive')}
      defaultWidth={1100}
      defaultHeight={750}
    >
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <DrivePage />
        </Box>
      </Suspense>
    </GlobalWindow>
  );
}
