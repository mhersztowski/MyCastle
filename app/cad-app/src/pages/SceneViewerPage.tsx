/**
 * Full-screen read-only Three.js viewer for a CAD project loaded from cad-backend.
 *
 * URL pattern: /viewer/scene/:projectName
 * The project name is URL-decoded from the last path segment.
 */

import { useEffect, useState } from 'react';
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { SimpleViewer, SceneDeserializer } from '@mhersztowski/core-scene3d';
import type { SceneGraph } from '@mhersztowski/core-scene3d';
import { Project } from '@mhersztowski/core-cad';
import { readProject, readSceneProject } from '../vfs/cadProjectApi';
import { loadProjectFromText } from '../io/CadExporter';
import { cadProjectToSceneGraph } from '../bridge/CadToScene';

interface Props {
  projectName: string;
}

export function SceneViewerPage({ projectName }: Props) {
  const [sceneGraph, setSceneGraph] = useState<SceneGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Prefer the saved Scene3D JSON (.scene.json); fall back to CAD conversion
        let graph: SceneGraph;
        try {
          const sceneJson = await readSceneProject(projectName);
          graph = SceneDeserializer.deserialize(sceneJson);
        } catch {
          // No .scene.json — convert from CAD project
          const cadJson = await readProject(projectName);
          if (cancelled) return;
          const proj = new Project();
          loadProjectFromText(cadJson, proj);
          graph = cadProjectToSceneGraph(proj);
        }
        if (!cancelled) setSceneGraph(graph);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectName]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1a1a1a', color: '#fff' }}>
      {/* Minimal top bar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5,
        height: 36, bgcolor: '#252526', borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ fontSize: 12, color: 'text.secondary' }}>
          Scene viewer
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 600, color: '#4fc3f7' }}>
          {projectName}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Open in editor">
          <IconButton size="small" onClick={() => { window.location.href = '/'; }}>
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Viewer area */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!sceneGraph && !error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
            <CircularProgress size={32} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Loading "{projectName}"…
            </Typography>
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography sx={{ color: 'error.main', fontSize: 14 }}>
              Failed to load project: {error}
            </Typography>
          </Box>
        )}

        {sceneGraph && (
          <SimpleViewer
            sceneGraph={sceneGraph}
            showGrid
            cameraPreset="cad"
            autoFit
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </Box>
    </Box>
  );
}
