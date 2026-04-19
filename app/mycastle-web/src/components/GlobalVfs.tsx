import { lazy, Suspense } from 'react';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';

// Lazy-load VfsView so Monaco is not bundled into the initial chunk.
// VfsView imports @monaco-editor/react which pulls in the full Monaco bundle (~10 MB).
// Eager loading crashes iOS Safari due to memory pressure on page load.
const VfsView = lazy(() => import('./VfsView').then((m) => ({ default: m.VfsView })));

export function GlobalVfs() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('vfs');
  const isVisible = state === 'open' || state === 'minimized';

  return (
    <GlobalWindow
      windowName="vfs"
      title="VFS Explorer"
      open={state === 'open'}
      minimized={state === 'minimized'}
      onClose={() => close('vfs')}
      onMinimize={() => minimize('vfs')}
      onRestore={() => restore('vfs')}
      defaultWidth={1100}
      defaultHeight={700}
    >
      {isVisible && (
        <Suspense fallback={null}>
          <VfsView />
        </Suspense>
      )}
    </GlobalWindow>
  );
}
