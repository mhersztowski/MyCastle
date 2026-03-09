import { useState, useMemo, useEffect, useCallback } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { RemoteFS, encodeText, decodeText, mjdDocumentSchema } from '@mhersztowski/core';
import type { MjdDocument } from '@mhersztowski/core';
import { MjdDataEditor, VfsFileDialog } from '@mhersztowski/web-client';
import { GlobalWindow } from './GlobalWindow';
import { useGlobalWindows } from './GlobalWindowsContext';
import { useAuth } from '../modules/auth';

export function GlobalMjdDataEditor() {
  const { windows, getParams, close, minimize, restore } = useGlobalWindows();
  const { token } = useAuth();
  const state = windows.get('mjdDataEditor');
  const params = getParams('mjdDataEditor');

  const [definition, setDefinition] = useState<MjdDocument | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [currentDataPath, setCurrentDataPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const remote = useMemo(() => new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined }), []);

  useEffect(() => {
    remote.setToken(token ?? undefined);
  }, [token, remote]);

  const loadMjdAndData = useCallback(async (mjdPath: string, dataPath: string) => {
    setError(null);
    setSaveSuccess(null);
    try {
      // Load definition
      const mjdBytes = await remote.readFile(mjdPath);
      const mjdJson = JSON.parse(decodeText(mjdBytes));
      const parsed = mjdDocumentSchema.safeParse(mjdJson);
      if (!parsed.success) {
        setError(`Invalid .mjd file: ${parsed.error.message}`);
        return;
      }
      const def = parsed.data as MjdDocument;
      setDefinition(def);
      setCurrentDataPath(dataPath);

      // Load data (may not exist yet)
      try {
        const dataBytes = await remote.readFile(dataPath);
        setData(JSON.parse(decodeText(dataBytes)) as Record<string, unknown>);
      } catch {
        // Data file doesn't exist — start with defaults
        const defaults: Record<string, unknown> = {};
        for (const field of def.fields) {
          if (field.defaultValue !== undefined) defaults[field.name] = field.defaultValue;
        }
        setData(defaults);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    }
  }, [remote]);

  // Load from VFS when params change
  useEffect(() => {
    if (!params || !state) {
      setDefinition(null);
      setData({});
      setCurrentDataPath(null);
      return;
    }
    loadMjdAndData(params.mjdPath, params.dataPath);
  }, [params, state, loadMjdAndData]);

  const handleLoadSelect = (mjdPath: string) => {
    setLoadDialogOpen(false);
    // Derive data path: same base name but .json extension
    const dataPath = mjdPath.replace(/\.mjd$/, '.data.json');
    loadMjdAndData(mjdPath, dataPath);
  };

  const handleSave = useCallback(async () => {
    if (!currentDataPath) return;
    setError(null);
    setSaveSuccess(null);
    try {
      const content = JSON.stringify(data, null, 2);
      await remote.writeFile!(currentDataPath, encodeText(content), { create: true, overwrite: true });
      setSaveSuccess(`Saved: ${currentDataPath}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [data, currentDataPath, remote]);

  const dataFileName = currentDataPath?.split('/').pop();

  return (
    <>
      <GlobalWindow
        windowName="mjdDataEditor"
        title={dataFileName ? `MJD Data: ${dataFileName}` : 'MJD Data Editor'}
        open={state === 'open'}
        minimized={state === 'minimized'}
        onClose={() => close('mjdDataEditor')}
        onMinimize={() => minimize('mjdDataEditor')}
        onRestore={() => restore('mjdDataEditor')}
        defaultWidth={800}
        defaultHeight={600}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 1, display: 'flex', gap: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
            <Button variant="outlined" size="small" onClick={() => setLoadDialogOpen(true)}>Load</Button>
            <Button variant="contained" size="small" onClick={handleSave} disabled={!definition}>Save</Button>
            {saveSuccess && <Alert severity="success" sx={{ py: 0, flex: 1 }} onClose={() => setSaveSuccess(null)}>{saveSuccess}</Alert>}
            {error && <Alert severity="error" sx={{ py: 0, flex: 1 }} onClose={() => setError(null)}>{error}</Alert>}
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {definition ? (
              <MjdDataEditor definition={definition} value={data} onChange={setData} />
            ) : (
              <Box sx={{ p: 3 }}>
                <Typography color="text.secondary">
                  Load a .mjd definition to start editing data
                </Typography>
              </Box>
            )}
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
    </>
  );
}
