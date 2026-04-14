/**
 * FormEngine Designer Page
 * Route: /designer/form/*  (the wildcard becomes the VFS file path)
 * Stores form JSON in VFS under the path provided in the URL.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_FORM_JSON = JSON.stringify({
  version: '1',
  tooltipType: 'MuiTooltip',
  modalType: 'MuiDialog',
  form: { key: 'Screen', type: 'Screen', props: {} },
  localization: {},
  languages: [{ code: 'en', dialect: 'US', name: 'English', description: 'American English', bidi: 'ltr' }],
  defaultLanguage: 'en-US',
});
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Snackbar, Alert, Typography, IconButton, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { FormBuilder } from '@react-form-builder/designer';
import { builderView } from '@react-form-builder/components-material-ui';
import { useMinimalTopBarSlot } from '../../components/MinimalTopBarContext';
import { useMqtt } from '../../modules/mqttclient';

export default function FormEngineDesignerPage() {
  const params = useParams<{ '*': string }>();
  const rawPath = params['*'] ?? '';
  const navigate = useNavigate();
  const { readFile, writeFile } = useMqtt();

  const filePath = rawPath.endsWith('.form.json') ? rawPath : `${rawPath}.form.json`;

  const [loading, setLoading] = useState(true);
  const [initialJson, setInitialJson] = useState<string | undefined>(undefined);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const pendingJson = useRef<string | null>(null);
  // Load form from VFS on mount
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    readFile(filePath)
      .then((fileData) => {
        setInitialJson(fileData.content);
      })
      .catch(() => {
        // New form
        setInitialJson(undefined);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const handleSave = useCallback(async () => {
    if (pendingJson.current === null) return;
    try {
      await writeFile(filePath, pendingJson.current);
      setSnack({ msg: 'Saved', severity: 'success' });
    } catch {
      setSnack({ msg: 'Save failed', severity: 'error' });
    }
  }, [filePath, writeFile]);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // Toolbar slot
  useMinimalTopBarSlot(
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
      <IconButton color="inherit" size="small" onClick={() => navigate(-1)}>
        <ArrowBackIcon />
      </IconButton>
      <Typography variant="subtitle1" sx={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}>
        {filePath}
      </Typography>
      <Tooltip title="Save (Ctrl+S)">
        <IconButton color="inherit" size="small" onClick={handleSave}>
          <SaveIcon />
        </IconButton>
      </Tooltip>
    </Box>,
    [filePath, handleSave, navigate],
  );

  // Stable reference — only changes when the loaded content changes.
  const getForm = useCallback(async () => initialJson ?? EMPTY_FORM_JSON, [initialJson]);

  const handleFormSchemaChange = useCallback((json: string) => {
    pendingJson.current = json;
  }, []);

  // Remount FormBuilder when the file path changes so stale form state is discarded.
  const builderKey = useMemo(() => filePath, [filePath]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <FormBuilder
          key={builderKey}
          view={builderView}
          getForm={getForm}
          onFormSchemaChange={handleFormSchemaChange}
        />
      </Box>

      <Snackbar
        open={!!snack}
        autoHideDuration={2500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
