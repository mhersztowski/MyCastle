/**
 * Read-only Electronics viewer — loads .elec.json and injects into BreadboardCanvas.
 * URL: /viewer/electronics/{vfsPath}  e.g. /viewer/electronics/users/default/projects/myboard
 */

import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { BreadboardCanvas } from '../components/electronics/BreadboardCanvas';
import type { ElectronicsSchema } from '../electronics/types';
import { ELEC_EXT, readFileAt } from '../vfs/cadProjectApi';

interface Props { vfsPath: string }

export function ElectronicsViewerPage({ vfsPath }: Props) {
  const mergeSchemaRef = useRef<((schema: ElectronicsSchema) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = vfsPath.split('/');
    const name = parts.pop()!;
    const dir = '/' + parts.join('/');

    let cancelled = false;
    (async () => {
      try {
        const json = await readFileAt(dir, name, ELEC_EXT);
        if (cancelled) return;
        const schema = JSON.parse(json) as ElectronicsSchema;
        // BreadboardCanvas wires mergeSchemaRef in its own useEffect (runs before this async resolves)
        mergeSchemaRef.current?.(schema);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [vfsPath]);

  const label = vfsPath.split('/').pop() ?? vfsPath;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1a1a1a', color: '#fff' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, height: 36, bgcolor: '#252526', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>Electronics</Typography>
        <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600, color: '#4fc3f7' }}>{label}</Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Open in editor">
          <IconButton size="small" onClick={() => { window.location.href = '/'; }}>
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {error ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        ) : (
          <BreadboardCanvas
            pendingPartId={null}
            onPendingPartConsumed={() => {}}
            mergeSchemaRef={mergeSchemaRef}
          />
        )}
      </Box>
    </Box>
  );
}
