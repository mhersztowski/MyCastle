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
  MoreVert,
  OpenInNew,
  Refresh,
  Save,
  VerticalSplit,
} from '@mui/icons-material';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import { PygameBlocklyComponent, type PygameBlocklyService } from '@modules/pygameblockly';
import type { PygameMode } from '@modules/pygameblockly';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';
import { BuildOutputPanel } from '../../components/BuildOutputPanel';

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
  const [building, setBuilding] = useState(false);
  const [buildOutput, setBuildOutput] = useState('');
  const [buildSuccess, setBuildSuccess] = useState<boolean | null>(null);
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<null | HTMLElement>(null);
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(true);
  const initialSketch = searchParams.get('sketch');

  useEffect(() => { codeEditedRef.current = codeEdited; }, [codeEdited]);

  // ---- sync code to editor ----
  const syncCodeToEditor = useCallback((code: string) => {
    setGeneratedCode(code);
    if (editorRef.current) {
      suppressEditorChangeRef.current = true;
      editorRef.current.setContent(code);
      suppressEditorChangeRef.current = false;
    }
  }, []);

  // ---- service ready ----
  const handleServiceReady = useCallback((service: PygameBlocklyService) => {
    serviceRef.current = service;
    service.onWorkspaceChange(() => {
      if (suppressBlocklyChangeRef.current) return;
      if (!codeEditedRef.current) {
        syncCodeToEditor(service.generateCode());
      }
    });
    syncCodeToEditor(service.generateCode());
  }, [syncCodeToEditor]);

  // ---- Monaco editor lifecycle ----
  const showCode = viewMode === 'code' || viewMode === 'split';

  useEffect(() => {
    if (!showCode || !editorContainerRef.current) return;

    const editor = EditorInstance.create(editorContainerRef.current, {
      value: generatedCode,
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      wordWrap: 'off',
    });

    editor.on('contentChanged', () => {
      if (suppressEditorChangeRef.current) return;
      setCodeEdited(true);
      codeEditedRef.current = true;
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, [showCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- resize blockly when panels change ----
  useEffect(() => {
    const timer = setTimeout(() => { serviceRef.current?.resize(); }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, splitRatio, sketchesOpen]);

  // ---- load sketch list ----
  const loadSketches = useCallback(async () => {
    if (!userName || !projectId) return;
    try {
      const list = await minisApi.listPygameSketches(userName, projectId);
      setSketches(list);
    } catch (e) {
      console.error('[PygameProject] Failed to load sketches', e);
    }
  }, [userName, projectId]);

  useEffect(() => {
    if (!userName || !projectId) return;
    minisApi.listPygameSketches(userName, projectId)
      .then((list) => {
        setSketches(list);
        if (list.length > 0) {
          const target = initialSketch && list.includes(initialSketch) ? initialSketch : list[0];
          handleLoadSketch(target);
        }
      })
      .catch(() => setSketches([]));
  }, [userName, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- load sketch ----
  const handleLoadSketch = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    setCodeEdited(false);
    codeEditedRef.current = false;

    suppressBlocklyChangeRef.current = true;
    serviceRef.current?.clearWorkspace();
    try {
      const xmlContent = await minisApi.readPygameSketchFile(
        userName, projectId, sketchName, `${sketchName}.blockly`,
      );
      if (serviceRef.current && xmlContent) {
        serviceRef.current.loadFromXml(xmlContent);
      }
    } catch {
      // File not found — workspace already cleared
    }
    suppressBlocklyChangeRef.current = false;

    try {
      const pyContent = await minisApi.readPygameSketchFile(
        userName, projectId, sketchName, `${sketchName}.py`,
      );
      syncCodeToEditor(pyContent);
    } catch {
      if (serviceRef.current) {
        syncCodeToEditor(serviceRef.current.generateCode());
      }
    }
  };

  // ---- new sketch ----
  const handleNewSketch = () => {
    const name = newSketchName.trim();
    if (!name) return;
    setCurrentSketch(name);
    if (!sketches.includes(name)) setSketches((prev) => [...prev, name]);
    setNewSketchName('');
    serviceRef.current?.clearWorkspace?.();
    if (serviceRef.current) syncCodeToEditor(serviceRef.current.generateCode());
  };

  // ---- save sketch ----
  const handleSaveSketch = useCallback(async () => {
    if (!userName || !projectId || !currentSketch) return;
    setSyncing(true);
    try {
      const blocklyXml = serviceRef.current?.serializeToXml() ?? '';
      const pyCode = editorRef.current?.getContent() ?? generatedCode;
      await Promise.all([
        minisApi.writePygameSketchFile(userName, projectId, currentSketch, `${currentSketch}.blockly`, blocklyXml),
        minisApi.writePygameSketchFile(userName, projectId, currentSketch, `${currentSketch}.py`, pyCode),
      ]);
      if (!sketches.includes(currentSketch)) setSketches((prev) => [...prev, currentSketch]);
      setCodeEdited(false);
      codeEditedRef.current = false;
    } catch (e) {
      console.error('[PygameProject] Save failed', e);
    } finally {
      setSyncing(false);
    }
  }, [userName, projectId, currentSketch, generatedCode, sketches]);

  // ---- run in browser (pygbag build) ----
  const handleRunInBrowser = useCallback(async () => {
    if (!userName || !projectId || !currentSketch) return;
    setBuilding(true);
    setBuildOutput('');
    setBuildSuccess(null);
    setBuildPanelOpen(true);
    try {
      // Generate web-mode code without changing the current UI mode
      const service = serviceRef.current;
      let webCode = generatedCode;
      if (service) {
        const prevMode = service.mode;
        service.setMode('web');
        webCode = service.generateCode();
        service.setMode(prevMode);
      }
      const result = await minisApi.buildPygameSketch(userName, projectId, currentSketch, webCode);
      setBuildOutput(result.output);
      setBuildSuccess(result.success);
      if (result.success) {
        window.location.href = minisApi.getPygameWebBuildUrl(userName, projectId, currentSketch);
      }
    } catch (e) {
      setBuildOutput(String(e));
      setBuildSuccess(false);
    } finally {
      setBuilding(false);
    }
  }, [userName, projectId, currentSketch]);

  // ---- mode switch ----
  const handleModeChange = (mode: PygameMode) => {
    setPygameMode(mode);
    serviceRef.current?.setMode(mode);
    if (!codeEditedRef.current && serviceRef.current) {
      syncCodeToEditor(serviceRef.current.generateCode());
    }
  };

  // ---- download ----
  const downloadCode = () => {
    const code = editorRef.current?.getContent() ?? generatedCode;
    const ext = pygameMode === 'web' ? 'web.py' : 'py';
    const fname = (currentSketch ?? 'game') + '.' + ext;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    URL.revokeObjectURL(url);
  };

  // ---- copy ----
  const copyCode = () => {
    const code = editorRef.current?.getContent() ?? generatedCode;
    navigator.clipboard.writeText(code).catch(() => {});
  };

  // ---- draggable split ----
  const splitterContainerRef = useRef<HTMLDivElement>(null);

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitterContainerRef.current;
    if (!container) return;
    const startX = e.clientX;
    const containerRect = container.getBoundingClientRect();
    const startRatio = splitRatio;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newRatio = startRatio + dx / containerRect.width;
      const minRatio = MIN_PANEL_PX / containerRect.width;
      const maxRatio = 1 - minRatio;
      setSplitRatio(Math.max(minRatio, Math.min(maxRatio, newRatio)));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const showBlockly = viewMode !== 'code';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0, bgcolor: '#1e1e1e' }}>
      {/* AppBar */}
      <AppBar position="static" sx={{ bgcolor: '#252526', boxShadow: 1, paddingTop: 'env(safe-area-inset-top)' }}>
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

          <Tooltip title="Actions">
            <IconButton size="small" color="inherit" onClick={(e) => setMoreMenuAnchor(e.currentTarget)}>
              <MoreVert fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={moreMenuAnchor}
            open={Boolean(moreMenuAnchor)}
            onClose={() => setMoreMenuAnchor(null)}
          >
            <MenuItem onClick={() => { copyCode(); setMoreMenuAnchor(null); }}>
              <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>Copy code
            </MenuItem>
            <MenuItem onClick={() => { downloadCode(); setMoreMenuAnchor(null); }}>
              <ListItemIcon><Download fontSize="small" /></ListItemIcon>Download .py
            </MenuItem>
            <MenuItem
              disabled={!currentSketch || syncing}
              onClick={() => { handleSaveSketch(); setMoreMenuAnchor(null); }}
              sx={{ color: codeEdited ? 'warning.main' : undefined }}
            >
              <ListItemIcon sx={{ color: codeEdited ? 'warning.main' : undefined }}>
                {syncing ? <CircularProgress size={16} /> : <Save fontSize="small" />}
              </ListItemIcon>Save sketch
            </MenuItem>
            <MenuItem
              disabled={!currentSketch || building}
              onClick={() => { handleRunInBrowser(); setMoreMenuAnchor(null); }}
              sx={{ color: 'success.main' }}
            >
              <ListItemIcon sx={{ color: 'success.main' }}>
                {building ? <CircularProgress size={16} color="inherit" /> : <OpenInNew fontSize="small" />}
              </ListItemIcon>Run in browser
            </MenuItem>
          </Menu>
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
                onKeyDown={(e) => e.key === 'Enter' && handleNewSketch()}
                inputProps={{ style: { fontSize: 12, padding: '4px 6px', color: '#ccc' } }}
                sx={{
                  flex: 1,
                  '& .MuiOutlinedInput-root': { bgcolor: '#1e1e1e' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '& input::placeholder': { color: '#666', opacity: 1 },
                }}
              />
              <IconButton size="small" onClick={handleNewSketch} disabled={!newSketchName.trim()} sx={{ color: '#ccc' }}>
                <Add fontSize="small" />
              </IconButton>
            </Box>
            <List dense sx={{ flex: 1, overflow: 'auto' }}>
              {sketches.map((s) => (
                <ListItemButton
                  key={s}
                  selected={currentSketch === s}
                  onClick={() => {
                    if (codeEditedRef.current) { setConfirmOpen(true); return; }
                    handleLoadSketch(s);
                  }}
                  sx={{ py: 0.5, px: 1 }}
                >
                  <ListItemText primary={s} primaryTypographyProps={{ fontSize: 12, color: '#ccc' }} />
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
          ref={splitterContainerRef}
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
              onMouseDown={handleSplitterMouseDown}
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
            />
          )}
        </Box>
      </Box>

      <BuildOutputPanel
        open={buildPanelOpen}
        onClose={() => setBuildPanelOpen(false)}
        output={buildOutput}
        compiling={building}
        success={buildSuccess}
      />

      {/* Confirm discard dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>The code editor has unsaved changes. Opening another sketch will discard them.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => {
            setConfirmOpen(false);
            setCodeEdited(false);
            codeEditedRef.current = false;
          }}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PygameProjectPage;
