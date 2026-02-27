import { useState, useEffect, useMemo } from 'react';
import { CompositeFS, RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { MonacoMultiEditor, remoteFsProvider, defaultProviderRegistry } from '@mhersztowski/web-client';
import { useAuth } from '../../modules/auth';
import '@modules/editor/monacoWorkers';

function MonacoEditorPage() {
  const { token } = useAuth();

  const [{ cfs, remote }] = useState(() => {
    const cfs = new CompositeFS();
    const remote = new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined });
    cfs.mount('/server', remote);
    return { cfs, remote };
  });

  useEffect(() => {
    remote.setToken(token ?? undefined);
  }, [token, remote]);

  const registry = useMemo(
    () => [remoteFsProvider, ...defaultProviderRegistry],
    [],
  );

  return (
    <MonacoMultiEditor
      provider={cfs as FileSystemProvider}
      height="100vh"
      providerRegistry={registry}
    />
  );
}

export default MonacoEditorPage;
