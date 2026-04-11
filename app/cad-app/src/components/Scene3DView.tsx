import { useRef, useState, useCallback, useEffect } from 'react';
import { Box, Button, Divider, Tooltip, Typography } from '@mui/material';
import DownloadingIcon from '@mui/icons-material/Downloading';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { RichEditor } from '@mhersztowski/ui-components-scene3d';
import type { Project } from '@mhersztowski/core-cad';
import { cadProjectToSceneJson } from '../bridge/CadToScene';

interface Props {
  project: Project;
  /** When set by AI agent writing /scene.json — auto-loads into RichEditor */
  externalSceneData?: string;
  /** Called whenever the active scene JSON changes (AI load or CAD import) */
  onSceneDataChange?: (json: string) => void;
}

export function Scene3DView({ project, externalSceneData, onSceneDataChange }: Props) {
  const [editorKey, setEditorKey] = useState('initial');
  const [sceneData, setSceneData] = useState<string | undefined>(undefined);
  const [entityCount, setEntityCount] = useState(0);
  const fitSceneRef = useRef<(() => void) | null>(null);

  // Auto-load scene written by AI agent
  useEffect(() => {
    if (!externalSceneData) return;
    setSceneData(externalSceneData);
    setEntityCount(-1); // mark as AI-generated (non-zero to enable Fit button)
    setEditorKey(`ai-${Date.now()}`);
  }, [externalSceneData]);

  const handleImport = useCallback(() => {
    const count = project.entityRegistry.getAll().length;
    if (count === 0) return;
    const json = cadProjectToSceneJson(project);
    setSceneData(json);
    setEntityCount(count);
    setEditorKey(`import-${Date.now()}`);
  }, [project]);

  const cadCount = project.entityRegistry.getAll().length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Bridge toolbar */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
        bgcolor: '#1e2a1e', borderBottom: '1px solid rgba(255,255,255,0.08)',
        minHeight: 36,
      }}>
        <Tooltip title="Convert all visible CAD entities to Three.js meshes and reload the scene">
          <span>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<DownloadingIcon />}
              onClick={handleImport}
              disabled={cadCount === 0}
              sx={{ fontSize: 11, py: 0.25 }}
            >
              Import from CAD ({cadCount} entities)
            </Button>
          </span>
        </Tooltip>

        {entityCount > 0 && (
          <Typography variant="caption" sx={{ color: 'success.main' }}>
            ✓ Loaded {entityCount} entities
          </Typography>
        )}

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

        <Tooltip title="Fit camera to show the entire scene">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FitScreenIcon sx={{ fontSize: 15 }} />}
              onClick={() => fitSceneRef.current?.()}
              disabled={entityCount === 0 && !externalSceneData}
              sx={{ fontSize: 11, py: 0.25, borderColor: 'rgba(255,255,255,0.2)', color: 'text.secondary' }}
            >
              Fit to scene
            </Button>
          </span>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        <Tooltip title="CAD Y axis → Three.js Z axis. Extrude height → Y axis. Use the CAD panel to set extrudeHeight on entities for solid 3D objects.">
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled', cursor: 'help' }} />
        </Tooltip>
      </Box>

      {/* RichEditor fills the rest — includes SceneTree, viewport, Properties panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <RichEditor
          key={editorKey}
          initialSceneData={sceneData}
          fitSceneRef={fitSceneRef}
          onSceneChange={onSceneDataChange}
          style={{ height: '100%' }}
        />
      </Box>
    </Box>
  );
}
