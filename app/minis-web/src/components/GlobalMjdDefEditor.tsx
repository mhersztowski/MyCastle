import { useState, useMemo, useEffect, useCallback } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { RemoteFS, createMjdDocument, generateJsonSchema, encodeText, decodeText, mjdDocumentSchema } from '@mhersztowski/core';
import type { MjdDocument } from '@mhersztowski/core';
import { MjdDefEditor, VfsFileDialog } from '@mhersztowski/web-client';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';
import { useAuth } from '../modules/auth';

export function GlobalMjdDefEditor() {
  const { windows, getParams, close, minimize, restore } = useGlobalWindows();
  const { token } = useAuth();
  const state = windows.get('mjdDefEditor');
  const params = getParams('mjdDefEditor');

  const [doc, setDoc] = useState<MjdDocument>(createMjdDocument());
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const remote = useMemo(() => new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined }), []);

  useEffect(() => {
    remote.setToken(token ?? undefined);
  }, [token, remote]);

  // Load from VFS when params change
  useEffect(() => {
    if (!params || !state) {
      setDoc(createMjdDocument());
      setCurrentFilePath(null);
      return;
    }

    setCurrentFilePath(params.mjdPath);
    let cancelled = false;
    (async () => {
      try {
        const bytes = await remote.readFile(params.mjdPath);
        const json = JSON.parse(decodeText(bytes));
        const parsed = mjdDocumentSchema.safeParse(json);
        if (!cancelled) {
          setDoc(parsed.success ? (parsed.data as MjdDocument) : createMjdDocument());
        }
      } catch {
        if (!cancelled) {
          setDoc(createMjdDocument());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [params, state, remote]);

  const loadFromVfs = useCallback(async (mjdPath: string) => {
    try {
      const bytes = await remote.readFile(mjdPath);
      const json = JSON.parse(decodeText(bytes));
      const parsed = mjdDocumentSchema.safeParse(json);
      setDoc(parsed.success ? (parsed.data as MjdDocument) : createMjdDocument());
      setCurrentFilePath(mjdPath);
      setSaveSuccess(null);
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to load file');
    }
  }, [remote]);

  const saveToVfs = useCallback(async (basePath: string) => {
    setSaveError(null);
    setSaveSuccess(null);

    const base = basePath.replace(/\.(mjd|json)$/, '');
    const mjdPath = `${base}.mjd`;
    const schemaPath = `${base}.json`;

    try {
      const mjdContent = JSON.stringify(doc, null, 2);
      const schemaContent = JSON.stringify(generateJsonSchema(doc), null, 2);

      await remote.writeFile!(mjdPath, encodeText(mjdContent), { create: true, overwrite: true });
      await remote.writeFile!(schemaPath, encodeText(schemaContent), { create: true, overwrite: true });

      setCurrentFilePath(mjdPath);
      setSaveSuccess(`Saved: ${mjdPath}, ${schemaPath}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [doc, remote]);

  const handleSave = useCallback(() => {
    if (currentFilePath) {
      saveToVfs(currentFilePath);
    } else {
      setSaveDialogOpen(true);
    }
  }, [currentFilePath, saveToVfs]);

  const handleLoadSelect = (path: string) => {
    setLoadDialogOpen(false);
    loadFromVfs(path);
  };

  const handleSaveSelect = (path: string) => {
    setSaveDialogOpen(false);
    saveToVfs(path);
  };

  const fileName = currentFilePath?.split('/').pop();

  return (
    <>
      <GlobalWindow
        windowName="mjdDefEditor"
        title={fileName ? `MJD Def: ${fileName}` : 'MJD Definition Editor'}
        open={state === 'open'}
        minimized={state === 'minimized'}
        onClose={() => close('mjdDefEditor')}
        onMinimize={() => minimize('mjdDefEditor')}
        onRestore={() => restore('mjdDefEditor')}
        defaultWidth={900}
        defaultHeight={650}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
            <Button variant="outlined" size="small" onClick={() => setLoadDialogOpen(true)}>Load</Button>
            <Button variant="contained" size="small" onClick={handleSave}>Save</Button>
            <Button variant="outlined" size="small" onClick={() => setSaveDialogOpen(true)}>Save As</Button>
            {saveSuccess && <Alert severity="success" sx={{ py: 0, flex: 1 }} onClose={() => setSaveSuccess(null)}>{saveSuccess}</Alert>}
            {saveError && <Alert severity="error" sx={{ py: 0, flex: 1 }} onClose={() => setSaveError(null)}>{saveError}</Alert>}
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <MjdDefEditor value={doc} onChange={setDoc} />
          </Box>
        </Box>
      </GlobalWindow>

      <VfsFileDialog
        open={loadDialogOpen}
        onClose={() => setLoadDialogOpen(false)}
        onSelect={handleLoadSelect}
        provider={remote}
        mode="load"
        extensions={['.mjd']}
        title="Open MJD Definition"
        initialPath="/data"
      />

      <VfsFileDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSelect={handleSaveSelect}
        provider={remote}
        mode="save"
        extensions={['.mjd']}
        title="Save MJD Definition"
        initialPath="/data"
      />
    </>
  );
}
