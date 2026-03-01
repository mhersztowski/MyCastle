import { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { TypeDocViewer } from '@mhersztowski/web-client';
import type { TypeDocProject } from '@mhersztowski/web-client';

export default function DocsPage({ height = 'calc(100vh - 100px)' }: { height?: string }) {
  const [data, setData] = useState<TypeDocProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/docs.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load docs.json: ${res.status}`);
        return res.json();
      })
      .then((json) => setData(json as TypeDocProject))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading documentation...</Typography>
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error || 'Failed to load documentation data'}
        <Typography variant="body2" sx={{ mt: 1 }}>
          Make sure docs.json is available. Generate it with: pnpm gendocs
        </Typography>
      </Alert>
    );
  }

  return (
    <Box sx={{ height }}>
      <TypeDocViewer data={data} />
    </Box>
  );
}
