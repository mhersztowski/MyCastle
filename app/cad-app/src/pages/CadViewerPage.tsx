/**
 * Read-only CAD 2D viewer — renders project as inline SVG.
 * URL: /viewer/cad/{vfsPath}  e.g. /viewer/cad/users/default/projects/mypart
 */

import { useEffect, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Project } from '@mhersztowski/core-cad';
import { CAD_EXT, readFileAt } from '../vfs/cadProjectApi';
import { loadProjectFromText, buildSVGString } from '../io/CadExporter';

interface Props { vfsPath: string }

export function CadViewerPage({ vfsPath }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parts = vfsPath.split('/');
    const name = parts.pop()!;
    const dir = '/' + parts.join('/');

    let cancelled = false;
    (async () => {
      try {
        const json = await readFileAt(dir, name, CAD_EXT);
        if (cancelled) return;
        const proj = new Project();
        loadProjectFromText(json, proj);
        setSvg(buildSVGString(proj));
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
        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>CAD 2D</Typography>
        <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600, color: '#4fc3f7' }}>{label}</Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Open in editor">
          <IconButton size="small" onClick={() => { window.location.href = '/'; }}>
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
        {!svg && !error && <CircularProgress size={32} />}
        {error && <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>}
        {svg && (
          <Box
            dangerouslySetInnerHTML={{ __html: svg }}
            sx={{ width: '100%', height: '100%', '& svg': { display: 'block' } }}
          />
        )}
      </Box>
    </Box>
  );
}
