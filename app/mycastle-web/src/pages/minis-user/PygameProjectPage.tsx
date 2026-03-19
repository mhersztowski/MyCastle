import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  Close,
  Code,
  ContentCopy,
  Download,
  FolderOpen,
  Refresh,
  Save,
  VerticalSplit,
} from '@mui/icons-material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import { PygameBlocklyComponent, type PygameBlocklyService } from '@modules/pygameblockly';
import type { PygameMode } from '@modules/pygameblockly';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';

type ViewMode = 'blockly' | 'split' | 'code';
const MIN_PANEL_PX = 200;

function PygameProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const serviceRef = useRef<PygameBlocklyService | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const codeEditedRef = useRef(false);
  const suppressEditorChangeRef = useRef(false);
  const suppressBlocklyChangeRef = useRef(false);

  const [pygameMode, setPygameMode] = useState<PygameMode>('native');
  const [newSketchName, setNewSketchName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('blockly');
  const [codeEdited, setCodeEdited] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [syncing, setSyncing] = useState(false);
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(true);
  const initialSketch = searchParams.get('sketch');

  useEffect(() => { codeEditedRef.current = codeEdited; }, [codeEdited]);

  // ---- load sketch list ----
  const loadSketches = useCallback(async () => {
    if (!userName || !projectId) return;
    try {
      const list = await minisApi.listProjectSketches(userName, projectId);
      setSketches(list);
    } catch (e) {
      console.error('[PygameProject] Failed to load sketches', e);
    }
  }, [userName, projectId]);

  useEffect(() => { loadSketches(); }, [loadSketches]);

  // ---- open sketch ----
  const openSketch = useCallback(async (sketchName: string) => {
    if (!userName || !projectId || !serviceRef.current) return;
    try {
      const content = await minisApi.getProjectSketch(userName, projectId, sketchName);
      setCurrentSketch(sketchName);
      const isXml = content.trimStart().startsWith('<xml') || content.trimStart().startsWith('<block');

      suppressBlocklyChangeRef.current = true;
      if (isXml) {
        serviceRef.current.loadFromXml(content);
      } else {
        serviceRef.current.clearWorkspace();
        suppressEditorChangeRef.current = true;
        editorRef.current?.setValue(content);
        suppressEditorChangeRef.current = false;
        setGeneratedCode(content);
      }
      suppressBlocklyChangeRef.current = false;

      const code = serviceRef.current.generateCode();
      setGeneratedCode(code);
      suppressEditorChangeRef.current = true;
      editorRef.current?.setValue(code);
      suppressEditorChangeRef.current = false;
      setCodeEdited(false);
      codeEditedRef.current = false;
    } catch (e) {
      console.error('[PygameProject] Failed to open sketch', e);
    }
  }, [userName, projectId]);

  // ---- auto-open initial sketch ----
  useEffect(() => {
    if (initialSketch && serviceRef.current?.isInitialized) {
      openSketch(initialSketch);
    }
  }, [initialSketch, openSketch]);

  // ---- blockly change → update editor ----
  const handleBlocklyChange = useCallback(() => {
    if (suppressBlocklyChangeRef.current || !serviceRef.current) return;
    const code = serviceRef.current.generateCode();
    setGeneratedCode(code);
    if (!codeEditedRef.current) {
      suppressEditorChangeRef.current = true;
      editorRef.current?.setValue(code);
      suppressEditorChangeRef.current = false;
    }
  }, []);

  const handleServiceReady = useCallback((service: PygameBlocklyService) => {
    serviceRef.current = service;
    service.onWorkspaceChange(handleBlocklyChange);
    if (initialSketch) openSketch(initialSketch);
  }, [handleBlocklyChange, initialSketch, openSketch]);

  // ---- editor mount ----
  const handleEditorMount = useCallback((instance: EditorInstance) => {
    editorRef.current = instance;
    instance.onDidChangeContent(() => {
      if (suppressEditorChangeRef.current) return;
      setCodeEdited(true);
      codeEditedRef.current = true;
      setGeneratedCode(instance.getValue());
    });
    if (generatedCode) {
      suppressEditorChangeRef.current = true;
      instance.setValue(generatedCode);
      suppressEditorChangeRef.current = false;
    }
  }, [generatedCode]);

  // ---- save sketch ----
  const saveSketch = useCallback(async () => {
    if (!userName || !projectId || !currentSketch || !serviceRef.current) return;
    setSyncing(true);
    try {
      // Save XML blocks
      const xml = serviceRef.current.serializeToXml();
      await minisApi.saveProjectSketch(userName, projectId, currentSketch, xml);
      // Save generated code alongside (with .py extension)
      const pyName = currentSketch.replace(/\.xml$/, '') + '.py';
      const code = codeEditedRef.current
        ? editorRef.current?.getValue() ?? generatedCode
        : generatedCode;
      await minisApi.saveProjectSketch(userName, projectId, pyName, code).catch(() => {/* optional */});
      setCodeEdited(false);
      codeEditedRef.current = false;
    } catch (e) {
      console.error('[PygameProject] Save failed', e);
    } finally {
      setSyncing(false);
    }
  }, [userName, projectId, currentSketch, generatedCode]);

  // ---- new sketch ----
  const createSketch = useCallback(async () => {
    if (!userName || !projectId || !newSketchName.trim()) return;
    const name = newSketchName.trim().replace(/\.xml$/, '') + '.xml';
    try {
      await minisApi.saveProjectSketch(userName, projectId, name, '<xml xmlns="https://developers.google.com/blockly/xml"></xml>');
      setNewSketchName('');
      await loadSketches();
      if (serviceRef.current) openSketch(name);
    } catch (e) {
      console.error('[PygameProject] Failed to create sketch', e);
    }
  }, [userName, projectId, newSketchName, loadSketches, openSketch]);

  // ---- mode switch ----
  const handleModeChange = (mode: PygameMode) => {
    setPygameMode(mode);
    serviceRef.current?.setMode(mode);
    if (!codeEditedRef.current && serviceRef.current) {
      const code = serviceRef.current.generateCode();
      setGeneratedCode(code);
      suppressEditorChangeRef.current = true;
      editorRef.current?.setValue(code);
      suppressEditorChangeRef.current = false;
    }
  };

  // ---- download ----
  const downloadCode = () => {
    const code = editorRef.current?.getValue() ?? generatedCode;
    const ext = pygameMode === 'web' ? 'web.py' : 'py';
    const fname = (currentSketch ?? 'game').replace(/\.xml$/, '') + '.' + ext;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  };

  // ---- copy ----
  const copyCode = () => {
    const code = editorRef.current?.getValue() ?? generatedCode;
    navigator.clipboard.writeText(code).catch(() => {});
  };

  // ---- draggable split ----
  const dragging = useRef(false);
  const containerWidthRef = useRef(0);
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    containerWidthRef.current = (e.currentTarget.parentElement?.offsetWidth ?? 800);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging.current) return;
    const rect = document.getElementById('pg-split-container')?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(MIN_PANEL_PX, Math.min(e.clientX - rect.left, rect.width - MIN_PANEL_PX)) / rect.width;
    setSplitRatio(ratio);
    serviceRef.current?.resize();
    editorRef.current?.layout();
  };
  const onMouseUp = () => {
    dragging.current = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  const showBlockly = viewMode !== 'code';
  const showCode = viewMode !== 'blockly';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#1e1e1e' }}>
      {/* AppBar */}
      <AppBar position="static" sx={{ bgcolor: '#252526', boxShadow: 1 }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <IconButton size="small" color="inherit" onClick={() => navigate(`/user/${userName}/electronics/pygame`)}>
            <ArrowBack />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#fff', mr: 1 }}>
            Pygame Blockly
          </Typography>
          {currentSketch && (
            <Chip label={currentSketch} size="small" sx={{ bgcolor: '#3e3e42', color: '#ccc' }} />
          )}

          {/* Mode selector */}
          <ButtonGroup size="small" sx={{ ml: 1 }}>
            <Button
              variant={pygameMode === 'native' ? 'contained' : 'outlined'}
              onClick={() => handleModeChange('native')}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              native
            </Button>
            <Button
              variant={pygameMode === 'web' ? 'contained' : 'outlined'}
              color="success"
              onClick={() => handleModeChange('web')}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              web (pygbag)
            </Button>
          </ButtonGroup>

          <Box sx={{ flex: 1 }} />

          {/* View mode */}
          <ButtonGroup size="small">
            <Tooltip title="Blockly only">
              <Button variant={viewMode === 'blockly' ? 'contained' : 'outlined'} onClick={() => setViewMode('blockly')}>
                🧩
              </Button>
            </Tooltip>
            <Tooltip title="Split view">
              <Button variant={viewMode === 'split' ? 'contained' : 'outlined'} onClick={() => setViewMode('split')}>
                <VerticalSplit fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Code only">
              <Button variant={viewMode === 'code' ? 'contained' : 'outlined'} onClick={() => setViewMode('code')}>
                <Code fontSize="small" />
              </Button>
            </Tooltip>
          </ButtonGroup>

          <Tooltip title="Copy code">
            <IconButton size="small" color="inherit" onClick={copyCode}><ContentCopy fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Download .py">
            <IconButton size="small" color="inherit" onClick={downloadCode}><Download fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title={currentSketch ? 'Save sketch' : 'Select a sketch first'}>
            <span>
              <IconButton
                size="small"
                color={codeEdited ? 'warning' : 'inherit'}
                onClick={saveSketch}
                disabled={!currentSketch || syncing}
              >
                {syncing ? <CircularProgress size={16} color="inherit" /> : <Save fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <AccountMenu />
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sketches sidebar */}
        {sketchesOpen && (
          <Box sx={{
            width: 180, flexShrink: 0, bgcolor: '#252526', borderRight: '1px solid #3e3e42',
            display: 'flex', flexDirection: 'column',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 1, gap: 0.5 }}>
              <FolderOpen fontSize="small" sx={{ color: '#ccc' }} />
              <Typography variant="caption" sx={{ color: '#ccc', flex: 1 }}>Sketches</Typography>
              <IconButton size="small" onClick={loadSketches} sx={{ color: '#ccc' }}><Refresh fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => setSketchesOpen(false)} sx={{ color: '#ccc' }}><Close fontSize="small" /></IconButton>
            </Box>
            <Box sx={{ display: 'flex', px: 1, py: 0.5, gap: 0.5 }}>
              <TextField
                size="small"
                placeholder="New sketch…"
                value={newSketchName}
                onChange={(e) => setNewSketchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createSketch()}
                inputProps={{ style: { fontSize: 12, padding: '4px 6px' } }}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { bgcolor: '#1e1e1e' } }}
              />
              <IconButton size="small" onClick={createSketch} disabled={!newSketchName.trim()} sx={{ color: '#ccc' }}>
                <Add fontSize="small" />
              </IconButton>
            </Box>
            <List dense sx={{ flex: 1, overflow: 'auto' }}>
              {sketches.filter((s) => s.endsWith('.xml')).map((s) => (
                <ListItemButton
                  key={s}
                  selected={currentSketch === s}
                  onClick={() => {
                    if (codeEditedRef.current) { setConfirmOpen(true); return; }
                    openSketch(s);
                  }}
                  sx={{ py: 0.5, px: 1 }}
                >
                  <ListItemText primary={s.replace(/\.xml$/, '')} primaryTypographyProps={{ fontSize: 12, color: '#ccc' }} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )}

        {!sketchesOpen && (
          <Tooltip title="Show sketches">
            <IconButton size="small" sx={{ m: 0.5, color: '#ccc', alignSelf: 'flex-start' }} onClick={() => setSketchesOpen(true)}>
              <FolderOpen fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Main area: Blockly + Code */}
        <Box
          id="pg-split-container"
          sx={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}
        >
          {/* Blockly */}
          {showBlockly && (
            <Box sx={{ width: showCode ? `${splitRatio * 100}%` : '100%', overflow: 'hidden' }}>
              <PygameBlocklyComponent
                mode={pygameMode}
                onServiceReady={handleServiceReady}
                ready={true}
              />
            </Box>
          )}

          {/* Drag handle */}
          {viewMode === 'split' && (
            <Box
              onMouseDown={onMouseDown}
              sx={{
                width: 6, bgcolor: '#3e3e42', cursor: 'col-resize', flexShrink: 0,
                '&:hover': { bgcolor: '#0e639c' },
              }}
            />
          )}

          {/* Monaco editor */}
          {showCode && (
            <Box
              ref={editorContainerRef}
              sx={{ width: showBlockly ? `${(1 - splitRatio) * 100}%` : '100%', overflow: 'hidden' }}
            >
              <EditorInstance
                language="python"
                theme="vs-dark"
                onMount={handleEditorMount}
                options={{ fontSize: 13, minimap: { enabled: false }, wordWrap: 'on' }}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Confirm discard dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>The code editor has unsaved changes. Opening another sketch will discard them.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => { setConfirmOpen(false); setCodeEdited(false); codeEditedRef.current = false; }}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PygameProjectPage;
