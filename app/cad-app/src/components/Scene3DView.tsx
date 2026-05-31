import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Box, Snackbar, Alert, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';
import FolderIcon from '@mui/icons-material/Folder';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { RichEditor } from '@mhersztowski/ui-components-scene3d';
import { SceneDeserializer, SceneSerializer } from '@mhersztowski/core-scene3d';
import type { Project } from '@mhersztowski/core-cad';
import { cadProjectToSceneJson } from '../bridge/CadToScene';
import { ServerFileBrowser } from './ServerFileBrowser';
import { SCENE_EXT, readFileAt, writeFileAt, vfsListDir, vfsReadFileBin, userProjectsDir } from '../vfs/cadProjectApi';
import type { ActiveTemplate } from './RepositoryPanel';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
};

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
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [audioPickerPath, setAudioPickerPath] = useState(userProjectsDir());
  const [audioPickerEntries, setAudioPickerEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const audioPickerResolveRef = useRef<((path: string | null) => void) | null>(null);

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

  const loadAudioPickerDir = useCallback((path: string) => {
    vfsListDir(path).then(entries => {
      const filtered = entries.filter(e =>
        e.isDir || AUDIO_EXTENSIONS.some(ext => e.name.toLowerCase().endsWith(ext))
      );
      filtered.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setAudioPickerEntries(filtered);
      setAudioPickerPath(path);
    }).catch(() => {
      setAudioPickerEntries([]);
    });
  }, []);

  const handleBrowseAudioFile = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      audioPickerResolveRef.current = resolve;
      const root = userProjectsDir();
      setAudioPickerPath(root);
      loadAudioPickerDir(root);
      setAudioPickerOpen(true);
    });
  }, [loadAudioPickerDir]);

  const handleAudioPickerNavigate = useCallback((dirName: string) => {
    loadAudioPickerDir(`${audioPickerPath}/${dirName}`);
  }, [audioPickerPath, loadAudioPickerDir]);

  const handleAudioPickerUp = useCallback(() => {
    const root = userProjectsDir();
    const parent = audioPickerPath.replace(/\/[^/]+$/, '') || root;
    loadAudioPickerDir(parent.startsWith(root) ? parent : root);
  }, [audioPickerPath, loadAudioPickerDir]);

  const handleAudioPickerSelect = useCallback((name: string) => {
    const vfsPath = `${audioPickerPath}/${name}`;
    const url = `${window.location.origin}/api/vfs/stream?path=${encodeURIComponent(vfsPath)}`;
    audioPickerResolveRef.current?.(url);
    audioPickerResolveRef.current = null;
    setAudioPickerOpen(false);
  }, [audioPickerPath]);

  const handleAudioPickerClose = useCallback(() => {
    audioPickerResolveRef.current?.(null);
    audioPickerResolveRef.current = null;
    setAudioPickerOpen(false);
  }, []);

  const resolveAudioSrc = useCallback(async (src: string): Promise<string> => {
    if (src && !src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
      const bytes = await vfsReadFileBin(src);
      const ext = src.split('.').pop()?.toLowerCase() ?? '';
      const blob = new Blob([bytes], { type: AUDIO_MIME[ext] ?? 'audio/mpeg' });
      return URL.createObjectURL(blob);
    }
    return src;
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
          onBrowseAudioFile={handleBrowseAudioFile}
          resolveAudioSrc={resolveAudioSrc}
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

      <Dialog open={audioPickerOpen} onClose={handleAudioPickerClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {audioPickerPath !== userProjectsDir() && (
            <IconButton size="small" onClick={handleAudioPickerUp} sx={{ p: 0.25, mr: 0.5 }}>
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 500 }}>Select File</Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {audioPickerPath}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, minHeight: 120 }}>
          {audioPickerEntries.length === 0 ? (
            <Box sx={{ px: 2, py: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                No audio files (.mp3, .wav, .ogg, .flac, .aac, .m4a) found here.
              </Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {audioPickerEntries.map(entry => (
                <ListItem key={entry.name} disablePadding>
                  <ListItemButton onClick={() => entry.isDir ? handleAudioPickerNavigate(entry.name) : handleAudioPickerSelect(entry.name)}>
                    {entry.isDir
                      ? <FolderIcon sx={{ fontSize: 16, color: '#ffb74d', mr: 1, flexShrink: 0 }} />
                      : <InsertDriveFileIcon sx={{ fontSize: 16, color: 'text.disabled', mr: 1, flexShrink: 0 }} />
                    }
                    <ListItemText
                      primary={entry.name}
                      slotProps={{ primary: { sx: { fontSize: '0.8rem', color: entry.isDir ? 'text.primary' : 'text.secondary' } } }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

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
