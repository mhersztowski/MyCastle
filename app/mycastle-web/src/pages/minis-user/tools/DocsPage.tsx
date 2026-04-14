import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  Typography,
} from '@mui/material';
import {
  Autorenew as AutorenewIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { TypeDocViewer } from '@mhersztowski/web-client';
import type { TypeDocProject } from '@mhersztowski/web-client';
import { minisApi } from '../../../services/MinisApiService';

export default function DocsPage({ height = 'calc(100vh - 100px)' }: { height?: string }) {
  const [data, setData] = useState<TypeDocProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ success: boolean; output: string } | null>(null);
  const [genOutputOpen, setGenOutputOpen] = useState(false);

  const loadDocs = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/docs.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load docs.json: ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json as TypeDocProject))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const result = await minisApi.generateDocs();
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      setGenResult({ success: result.exitCode === 0, output });
      setGenOutputOpen(true);
      if (result.exitCode === 0) {
        // Reload docs after successful generation (small delay for file write to complete)
        setTimeout(() => loadDocs(), 500);
      }
    } catch (err) {
      setGenResult({ success: false, output: err instanceof Error ? err.message : String(err) });
      setGenOutputOpen(true);
    } finally {
      setGenerating(false);
    }
  }, [loadDocs]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          API Documentation (TypeDoc)
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={generating ? <CircularProgress size={14} /> : <AutorenewIcon fontSize="small" />}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Generate Docs'}
        </Button>
      </Box>

      {/* Generation result */}
      {genResult && (
        <Box sx={{ flexShrink: 0, px: 2, pt: 1 }}>
          <Alert
            severity={genResult.success ? 'success' : 'error'}
            action={
              genResult.output ? (
                <IconButton size="small" onClick={() => setGenOutputOpen((v) => !v)}>
                  {genOutputOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              ) : undefined
            }
            onClose={() => setGenResult(null)}
          >
            {genResult.success ? 'Documentation generated successfully.' : 'Documentation generation failed.'}
          </Alert>
          <Collapse in={genOutputOpen}>
            <Box
              component="pre"
              sx={{
                mt: 1,
                mb: 1,
                p: 1,
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                fontSize: '0.7rem',
                overflowX: 'auto',
                maxHeight: 200,
                overflowY: 'auto',
                fontFamily: 'monospace',
              }}
            >
              {genResult.output || '(no output)'}
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Docs viewer */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Loading documentation…</Typography>
          </Box>
        ) : error || !data ? (
          <Alert severity="info" sx={{ m: 2 }}>
            {error ?? 'No documentation loaded yet.'}
            <Typography variant="body2" sx={{ mt: 1 }}>
              Click <strong>Generate Docs</strong> above to build it from source.
            </Typography>
          </Alert>
        ) : (
          <TypeDocViewer data={data} />
        )}
      </Box>
    </Box>
  );
}
