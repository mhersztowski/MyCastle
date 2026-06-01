import { useEffect, useState } from 'react';
import { RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { TextEditorWorkspace, SubpathFS } from '@mhersztowski/texteditor';
import { getCurrentUserId } from '../vfs/cadProjectApi';
import '../editor/monacoWorkers';

/**
 * Code editor side panel — one shared instance reused across every cad-app mode.
 * Mounts the current user's directory on the cad-backend VFS — RemoteFS
 * (`/api/vfs`) scoped through SubpathFS to `/users/{userId}` — so the editor
 * opens straight into the user's own files (their `projects/` folder) instead
 * of the shared VFS root.
 *
 * Uses the full TextEditorWorkspace (plugins + IntelliSense). The AI agent and
 * integrated terminal are disabled — cad-app has its own AI panel and the
 * cad-backend exposes no terminal endpoint.
 */
export function CodeEditorPanel() {
  const [provider] = useState<FileSystemProvider>(
    () => new SubpathFS(new RemoteFS({ baseUrl: '/api/vfs' }), `/users/${getCurrentUserId()}`),
  );

  // The user directory may not exist yet on a fresh backend (no project saved).
  // Create it so the file explorer can list the root instead of failing 404.
  useEffect(() => {
    provider.mkdir?.('/').catch(() => {});
  }, [provider]);

  return (
    <TextEditorWorkspace
      provider={provider}
      height="100%"
      projectDeps={{
        // Same-origin: Vite proxies /api/* → cad-backend (port 1897 internal).
        // Passing userName lets NodeJsProject build the correct /api/users/{id}/nodejs/run URL.
        baseUrl: '',
        userName: getCurrentUserId(),
      }}
    />
  );
}
