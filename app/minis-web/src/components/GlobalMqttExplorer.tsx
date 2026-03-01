import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

const MqttExplorerPage = lazy(() => import('../pages/user/tools/MqttExplorerPage'));

export function GlobalMqttExplorer() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('mqttExplorer');

  return (
    <GlobalWindow
      windowName="mqttExplorer"
      title="MQTT Explorer"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('mqttExplorer')}
      onMinimize={() => minimize('mqttExplorer')}
      onRestore={() => restore('mqttExplorer')}
      defaultWidth={1100}
      defaultHeight={750}
    >
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        <Box sx={{ height: '100%', overflow: 'auto', p: 2 }}>
          <MqttExplorerPage />
        </Box>
      </Suspense>
    </GlobalWindow>
  );
}
