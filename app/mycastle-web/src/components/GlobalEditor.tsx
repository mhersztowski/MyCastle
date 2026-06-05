/**
 * Workspace editor (UserDataEditorPage) wrapped as a Global Window.
 * Same component as the `/user/:userName/electronics/editor` route — Monaco
 * MultiEditor with VFS sidebar, project integration, AI agent panel, all
 * the active plugins (markdown, ts-intellisense, minislib graph, …).
 *
 * Default size is larger than other Global windows because the editor needs
 * room for sidebar + tabs + content + optional AI panel.
 */

import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

const UserDataEditorPage = lazy(() => import('../pages/workspace/UserDataEditorPage'));

export function GlobalEditor() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('editor');

  return (
    <GlobalWindow
      windowName="editor"
      title="Editor"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('editor')}
      onMinimize={() => minimize('editor')}
      onRestore={() => restore('editor')}
      defaultWidth={1400}
      defaultHeight={850}
    >
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}>
        <Box sx={{ height: '100%', overflow: 'hidden' }}>
          <UserDataEditorPage />
        </Box>
      </Suspense>
    </GlobalWindow>
  );
}
