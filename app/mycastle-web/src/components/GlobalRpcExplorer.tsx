import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

const RpcExplorerPage = lazy(() => import('../pages/minis-user/tools/RpcExplorerPage'));

export function GlobalRpcExplorer() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('rpcExplorer');

  return (
    <GlobalWindow
      windowName="rpcExplorer"
      title="RPC Explorer"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('rpcExplorer')}
      onMinimize={() => minimize('rpcExplorer')}
      onRestore={() => restore('rpcExplorer')}
      defaultWidth={1000}
      defaultHeight={700}
    >
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
          <RpcExplorerPage />
        </Box>
      </Suspense>
    </GlobalWindow>
  );
}
