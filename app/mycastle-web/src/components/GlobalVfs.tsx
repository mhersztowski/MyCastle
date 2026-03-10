import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';
import { VfsView } from './VfsView';

export function GlobalVfs() {
  const { windows, close, minimize, restore } = useGlobalWindows();
  const state = windows.get('vfs');

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
      <VfsView />
    </GlobalWindow>
  );
}
