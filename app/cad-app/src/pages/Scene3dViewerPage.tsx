/**
 * Read-only Scene3D viewer — loads main.json from the scene3d project API.
 * URL: /viewer/scene3d/{vfsPath}  e.g. /viewer/scene3d/users/default/scene3d/my-scene
 */

import { useEffect, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { SimpleViewer, SceneDeserializer } from '@mhersztowski/core-scene3d';
import type { SceneGraph } from '@mhersztowski/core-scene3d';
import { readScene3dFile } from '../vfs/cadProjectApi';

interface Props { vfsPath: string }

export function Scene3dViewerPage({ vfsPath }: Props) {
  const [sceneGraph, setSceneGraph] = useState<SceneGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // URL: /viewer/scene3d/users/default/scene3d/{project}/{file}
    const parts = vfsPath.split('/');
    const file        = parts.pop()!;   // e.g. 'main'
    const projectName = parts.pop()!;   // e.g. 'Test22'

    let cancelled = false;
    (async () => {
      try {
        const json = await readScene3dFile(projectName, file);
        if (cancelled) return;
        setSceneGraph(SceneDeserializer.deserialize(json));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [vfsPath]);

  const parts = vfsPath.split('/');
  const file        = parts[parts.length - 1];
  const projectName = parts[parts.length - 2] ?? '';
  const label = projectName ? `${projectName} / ${file}` : file;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1a1a1a', color: '#fff' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, height: 36, bgcolor: '#252526', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>Scene 3D</Typography>
        <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600, color: '#4fc3f7' }}>{label}</Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Open in editor">
          <IconButton size="small" onClick={() => { window.location.href = '/'; }}>
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!sceneGraph && !error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
            <CircularProgress size={32} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Loading "{label}"…</Typography>
          </Box>
        )}
        {error && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>Failed to load: {error}</Typography>
          </Box>
        )}
        {sceneGraph && (
          <SimpleViewer sceneGraph={sceneGraph} showGrid cameraPreset="cad" autoFit style={{ width: '100%', height: '100%' }} />
        )}
      </Box>
    </Box>
  );
}
