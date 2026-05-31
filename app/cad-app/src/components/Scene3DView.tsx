import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Box, Snackbar, Alert, IconButton, Tooltip } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import { RichEditor } from '@mhersztowski/ui-components-scene3d';
import { SceneDeserializer, SceneSerializer } from '@mhersztowski/core-scene3d';
import type { Project } from '@mhersztowski/core-cad';
import { cadProjectToSceneJson } from '../bridge/CadToScene';
import { ServerFileBrowser } from './ServerFileBrowser';
import { SCENE_EXT, readFileAt, writeFileAt } from '../vfs/cadProjectApi';
import type { ActiveTemplate } from './RepositoryPanel';

interface Props {
  project: Project;
  /** When set by AI agent writing /scene.json — auto-loads into RichEditor */
  externalSceneData?: string;
  /** Increment to force reload even when externalSceneData content is unchanged */
  externalSceneKey?: number;
  /** Pass a ref to get access to mergeScene(json) — adds nodes without replacing the scene */
  mergeSceneRef?: React.MutableRefObject<((json: string) => void) | null>;
  /** Called whenever the active scene JSON changes (AI load or CAD import) */
  onSceneDataChange?: (json: string) => void;
  /** Armed template for serial placement — clicking Y=0 floor merges the scene template at that position. */
  placementTemplate?: ActiveTemplate | null;
}

export function Scene3DView({ project, externalSceneData, externalSceneKey, mergeSceneRef: externalMergeRef, onSceneDataChange, placementTemplate }: Props) {
  const [editorKey, setEditorKey] = useState('initial');
  const [sceneData, setSceneData] = useState<string | undefined>(undefined);
  const mergeSceneRef = useRef<((json: string) => void) | null>(null);
  const sceneJsonRef = useRef<string | undefined>(undefined);

  // Forward internal mergeSceneRef to the external ref passed by parent
  useEffect(() => {
    if (!externalMergeRef) return;
    const sync = () => { externalMergeRef.current = mergeSceneRef.current; };
    sync();
    const id = setInterval(sync, 200);
    return () => { clearInterval(id); externalMergeRef.current = null; };
  }, [externalMergeRef]);
  const [serverMode, setServerMode] = useState<'open' | 'save' | null>(null);
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [debugLog, setDebugLog] = useState(false);

  // Auto-load scene written by AI agent (or inserted from Templates panel)
  useEffect(() => {
    if (!externalSceneData) return;
    setSceneData(externalSceneData);
    setEditorKey(`ai-${Date.now()}`);
  }, [externalSceneData, externalSceneKey]);

  const handleImport = useCallback(() => {
    if (project.entityRegistry.getAll().length === 0) return;
    const json = cadProjectToSceneJson(project);
    setSceneData(json);
    setEditorKey(`import-${Date.now()}`);
  }, [project]);

  const handleSceneChange = useCallback((json: string) => {
    sceneJsonRef.current = json;
    onSceneDataChange?.(json);
  }, [onSceneDataChange]);

  const handlePlaneClick = useCallback(async (wx: number, wz: number) => {
    if (!placementTemplate || placementTemplate.mode !== 'scene3d') return;
    const fileUrl = placementTemplate.sceneFile;
    if (!fileUrl || !mergeSceneRef.current) return;
    const url = fileUrl.startsWith('http') ? fileUrl : `${placementTemplate.rawBase.replace(/\/$/, '')}/${fileUrl}`;
    try {
      const json = await fetch(url).then(r => r.text());
      const graph = SceneDeserializer.deserialize(json);
      const children = graph.root.children;
      if (children.length > 0) {
        let sx = 0, sz = 0;
        for (const child of children) { sx += child.position[0]; sz += child.position[2]; }
        const cx = sx / children.length;
        const cz = sz / children.length;
        for (const child of children) {
          child.setPosition([child.position[0] + (wx - cx), child.position[1], child.position[2] + (wz - cz)]);
        }
      }
      mergeSceneRef.current(SceneSerializer.serialize(graph));
    } catch (e) {
      console.error('[Scene3DView] placement failed', e);
    }
  }, [placementTemplate, mergeSceneRef]);

  const handleReadScene = useCallback(async (dir: string, name: string) => {
    const json = await readFileAt(dir, name, SCENE_EXT);
    sceneJsonRef.current = json;
    setSceneData(json);
    setEditorKey(`server-open-${Date.now()}`);
  }, []);

  const handleWriteScene = useCallback(async (dir: string, name: string) => {
    const json = sceneJsonRef.current;
    if (!json) throw new Error('No scene data to save.');
    await writeFileAt(dir, name, SCENE_EXT, json);
  }, []);

  const cadCount = project.entityRegistry.getAll().length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RichEditor fills the rest — includes SceneTree, viewport, Properties panels */}
      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <RichEditor
          key={editorKey}
          initialSceneData={sceneData}
          mergeSceneRef={mergeSceneRef}
          onSceneChange={handleSceneChange}
          onOpenFromServer={() => setServerMode('open')}
          onSaveToServer={() => setServerMode('save')}
          onImportFromCad={handleImport}
          cadEntityCount={cadCount}
          onPlaneClick={placementTemplate?.mode === 'scene3d' ? handlePlaneClick : undefined}
          style={{ height: '100%' }}
          debugLog={debugLog}
        />
        {/* Debug toggle — visible on mobile for diagnosing gizmo/touch issues */}
        <Tooltip title={debugLog ? 'Hide debug log' : 'Show debug log'}>
          <IconButton
            size="small"
            onClick={() => setDebugLog(v => !v)}
            sx={{
              position: 'absolute', bottom: 8, right: 8, zIndex: 30,
              bgcolor: debugLog ? 'rgba(255,80,80,0.25)' : 'rgba(0,0,0,0.4)',
              border: '1px solid', borderColor: debugLog ? 'error.main' : 'rgba(255,255,255,0.15)',
              color: debugLog ? 'error.main' : 'text.disabled',
              '&:hover': { bgcolor: debugLog ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.1)' },
            }}
          >
            <BugReportIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {serverMode === 'open' && (
        <ServerFileBrowser
          open
          mode="open"
          title="Open Scene 3D from Server"
          extension={SCENE_EXT}
          storageKey="cad.projectBrowser.dir"
          onClose={() => setServerMode(null)}
          onOpen={handleReadScene}
          onDone={name => { setServerMode(null); setToast({ msg: `Opened scene: ${name}`, severity: 'success' }); }}
        />
      )}

      {serverMode === 'save' && (
        <ServerFileBrowser
          open
          mode="save"
          title="Save Scene 3D to Server"
          extension={SCENE_EXT}
          storageKey="cad.projectBrowser.dir"
          onClose={() => setServerMode(null)}
          onSave={handleWriteScene}
          onDone={name => { setServerMode(null); setToast({ msg: `Saved scene: ${name}`, severity: 'success' }); }}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
