import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  ButtonGroup,
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
  Extension,
  FolderOpen,
  Save,
  Settings,
  Terminal as TerminalIcon,
  Upload as UploadIcon,
  VerticalSplit,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import {
  UPythonBlocklyComponent,
  type UPythonBlocklyService,
  boardProfiles,
  socToUPythonBoardKey,
} from '@modules/upythonblockly';
import { MpyReplTerminal } from '@modules/upythonblockly/repl';
import { UploadDialog } from '@modules/upythonblockly/upload';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';

type ViewMode = 'blockly' | 'split' | 'code';

const MIN_PANEL_PX = 200;

function UPythonProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const serviceRef = useRef<UPythonBlocklyService | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const codeEditedRef = useRef(false);
  const suppressEditorChangeRef = useRef(false);
  const suppressBlocklyChangeRef = useRef(false);

  const [board, setBoard] = useState<string>('rp2040_pico');
  const [newSketchName, setNewSketchName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('blockly');
  const [codeEdited, setCodeEdited] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [replOpen, setReplOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(true);

  // Keep ref in sync for use inside Blockly listener
  useEffect(() => {
    codeEditedRef.current = codeEdited;
  }, [codeEdited]);

  // Sync generated code to Monaco editor
  const syncCodeToEditor = useCallback((code: string) => {
    setGeneratedCode(code);
    if (editorRef.current) {
      suppressEditorChangeRef.current = true;
      editorRef.current.setContent(code);
      suppressEditorChangeRef.current = false;
    }
  }, []);

  const handleServiceReady = useCallback((service: UPythonBlocklyService) => {
    serviceRef.current = service;

    service.onWorkspaceChange(() => {
      if (suppressBlocklyChangeRef.current) return;
      if (codeEditedRef.current) {
        setConfirmOpen(true);
        return;
      }
      const code = service.generateCode();
      syncCodeToEditor(code);
    });

    const code = service.generateCode();
    syncCodeToEditor(code);
  }, [syncCodeToEditor]);

  // Initialize/dispose Monaco editor when code panel is visible
  const showCode = viewMode === 'code' || viewMode === 'split';

  useEffect(() => {
    if (!showCode || !editorContainerRef.current) return;

    const editor = EditorInstance.create(editorContainerRef.current, {
      value: generatedCode,
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      wordWrap: 'off',
      readOnly: false,
    });

    editor.on('contentChanged', () => {
      if (suppressEditorChangeRef.current) return;
      setCodeEdited(true);
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, [showCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize Blockly when panels change
  useEffect(() => {
    const timer = setTimeout(() => {
      serviceRef.current?.resize();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, splitRatio, configOpen, sketchesOpen]);

  // Resolve board from ProjectDef → ModuleDef → soc
  useEffect(() => {
    if (!userName || !projectId) return;
    (async () => {
      try {
        const [projects, projectDefs, moduleDefs] = await Promise.all([
          minisApi.getUserProjects(userName),
          minisApi.getProjectDefs(),
          minisApi.getModuleDefs(),
        ]);
        const project = projects.find((p) => p.id === projectId);
        if (!project) return;
        const projectDef = projectDefs.find((d) => d.id === project.projectDefId);
        if (!projectDef) return;
        const moduleDef = moduleDefs.find((m) => m.id === projectDef.moduleDefId);
        if (!moduleDef?.soc) return;
        const boardKey = socToUPythonBoardKey[moduleDef.soc];
        if (boardKey && boardProfiles[boardKey]) {
          setBoard(boardKey);
          serviceRef.current?.changeBoard(boardKey);
        }
      } catch { /* ignore */ }
    })();
  }, [userName, projectId]);

  // Load sketches list
  useEffect(() => {
    if (!userName || !projectId) return;
    minisApi.listSketches(userName, projectId)
      .then(setSketches)
      .catch(() => setSketches([]));
  }, [userName, projectId]);

  const handleLoadSketch = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    setCodeEdited(false);

    suppressBlocklyChangeRef.current = true;
    serviceRef.current?.clearWorkspace();
    try {
      const xmlContent = await minisApi.readSketchFile(
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
      const pyContent = await minisApi.readSketchFile(
        userName, projectId, sketchName, `${sketchName}.py`,
      );
      syncCodeToEditor(pyContent);
    } catch {
      if (serviceRef.current) {
        syncCodeToEditor(serviceRef.current.generateCode());
      }
    }
  };

  const handleNewSketch = () => {
    const name = newSketchName.trim();
    if (!name) return;
    setCurrentSketch(name);
    if (!sketches.includes(name)) setSketches((prev) => [...prev, name]);
    setNewSketchName('');
  };

  const handleSaveSketch = async () => {
    if (!userName || !projectId || !currentSketch) return;

    const blocklyXml = serviceRef.current?.serializeToXml() ?? '';
    const pyCode = editorRef.current?.getContent() ?? generatedCode;

    await Promise.all([
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.blockly`, blocklyXml),
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.py`, pyCode),
    ]);
    if (!sketches.includes(currentSketch)) setSketches((prev) => [...prev, currentSketch]);
    setCodeEdited(false);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOpen(false);
    setCodeEdited(false);
    if (serviceRef.current) {
      syncCodeToEditor(serviceRef.current.generateCode());
    }
  };

  // --- Splitter drag ---
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
      setSplitRatio(Math.min(maxRatio, Math.max(minRatio, newRatio)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      serviceRef.current?.resize();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const btnSx = (active: boolean) => ({
    bgcolor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
    borderColor: 'rgba(255,255,255,0.4)',
    color: 'inherit',
    minWidth: { xs: 'auto' },
    px: { xs: 0.75, sm: 1.5 },
  });

  const showBlockly = viewMode === 'blockly' || viewMode === 'split';
  // Current Python code for upload
  const codeForUpload = editorRef.current?.getContent() ?? generatedCode;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top AppBar */}
      <AppBar position="static" elevation={1}>
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => navigate(`/user/${userName}/electronics/upython`)}
            sx={{ mr: 1 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ mr: 2 }} noWrap>
            uPython Project
          </Typography>

          <Button
            size="small" variant={configOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<Settings />}
            onClick={() => setConfigOpen((v) => !v)}
            sx={btnSx(configOpen)}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Config</Box>
          </Button>

          <Button
            size="small" variant={sketchesOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<FolderOpen />}
            onClick={() => setSketchesOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(sketchesOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sketches{currentSketch ? `: ${currentSketch}` : ''}</Box>
          </Button>

          <Button
            size="small" variant="outlined" color="inherit"
            startIcon={<Save />}
            onClick={handleSaveSketch}
            disabled={!currentSketch}
            sx={{ ml: 1, ...btnSx(false) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Save</Box>
          </Button>

          <Box sx={{ flexGrow: 1 }} />

          <ButtonGroup size="small">
            <Button
              variant={viewMode === 'blockly' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<Extension />}
              onClick={() => setViewMode('blockly')}
              sx={btnSx(viewMode === 'blockly')}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Blockly</Box>
            </Button>
            <Button
              variant={viewMode === 'split' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<VerticalSplit />}
              onClick={() => setViewMode('split')}
              sx={btnSx(viewMode === 'split')}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Split</Box>
            </Button>
            <Button
              variant={viewMode === 'code' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<Code />}
              onClick={() => setViewMode('code')}
              sx={btnSx(viewMode === 'code')}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Code{codeEdited ? ' *' : ''}</Box>
            </Button>
          </ButtonGroup>

          <Box sx={{ flexGrow: 1 }} />

          {board && (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mr: 1 }}>
              {boardProfiles[board]?.name ?? board}
            </Typography>
          )}
          <AccountMenu userName={userName} />
        </Toolbar>
      </AppBar>

      {/* Content area */}
      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Configuration panel */}
        {configOpen && (
          <Box
            sx={{
              width: 280, flexShrink: 0,
              borderRight: 1, borderColor: 'divider',
              overflow: 'auto', bgcolor: 'background.paper', p: 2,
            }}
          >
            <Typography variant="subtitle2" gutterBottom>Configuration</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Board: {board ? (boardProfiles[board]?.name ?? board) : 'Loading...'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Chip: {board ? (boardProfiles[board]?.chipName ?? '—') : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Platform: MicroPython
            </Typography>
          </Box>
        )}

        {/* Sketches panel */}
        {sketchesOpen && (
          <Box
            sx={{
              width: 220, flexShrink: 0,
              borderRight: 1, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>Sketches</Typography>
            <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 0.5 }}>
              <TextField
                size="small"
                placeholder="new sketch name"
                value={newSketchName}
                onChange={(e) => setNewSketchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNewSketch(); }}
                inputProps={{ style: { fontSize: 12, padding: '4px 8px' } }}
                sx={{ flexGrow: 1 }}
              />
              <Tooltip title="Create sketch">
                <span>
                  <IconButton size="small" onClick={handleNewSketch} disabled={!newSketchName.trim()}>
                    <Add fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <List dense sx={{ flexGrow: 1, overflow: 'auto' }}>
              {sketches.map((name) => (
                <ListItemButton
                  key={name}
                  selected={currentSketch === name}
                  onClick={() => handleLoadSketch(name)}
                >
                  <ListItemText primary={name} />
                </ListItemButton>
              ))}
              {sketches.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
                  No sketches yet
                </Typography>
              )}
            </List>
          </Box>
        )}

        {/* Editor area */}
        <Box
          ref={splitterContainerRef}
          sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}
        >
          {/* Blockly panel */}
          <Box
            sx={{
              position: 'relative', overflow: 'hidden',
              display: showBlockly ? 'block' : 'none',
              width: viewMode === 'split' ? `${splitRatio * 100}%` : '100%',
              flexShrink: 0,
            }}
          >
            <UPythonBlocklyComponent
              onServiceReady={handleServiceReady}
              initialBoard={board}
            />
          </Box>

          {/* Splitter handle */}
          {viewMode === 'split' && (
            <Box
              onMouseDown={handleSplitterMouseDown}
              sx={{
                width: 6, cursor: 'col-resize', bgcolor: 'divider', flexShrink: 0,
                '&:hover': { bgcolor: 'primary.main' },
                transition: 'background-color 0.15s',
              }}
            />
          )}

          {/* Code panel */}
          {showCode && (
            <Box
              ref={editorContainerRef}
              sx={{ flexGrow: 1, overflow: 'hidden', minWidth: MIN_PANEL_PX }}
            />
          )}
        </Box>
      </Box>

      {/* REPL Terminal panel */}
      {replOpen && (
        <Box sx={{ height: 300, borderTop: 1, borderColor: 'divider', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
              MicroPython REPL
            </Typography>
            <IconButton size="small" onClick={() => setReplOpen(false)}>
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
            <MpyReplTerminal
              height="100%"
              code={codeForUpload}
            />
          </Box>
        </Box>
      )}

      {/* Bottom status bar */}
      <AppBar position="static" elevation={0} color="default" sx={{ borderTop: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense" sx={{ minHeight: 36 }}>
          <Tooltip title="Upload to device">
            <span>
              <IconButton
                size="small"
                onClick={() => setUploadOpen(true)}
                disabled={!generatedCode && !codeEdited}
              >
                <UploadIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="MicroPython REPL Terminal">
            <IconButton size="small" onClick={() => setReplOpen((v) => !v)}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {boardProfiles[board]?.name ?? board}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        code={codeForUpload}
      />

      {/* Confirm overwrite dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Overwrite manual changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have manually edited the code. Blockly changes will regenerate the code and overwrite
            your edits. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmOverwrite} color="warning" variant="contained">
            Overwrite
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UPythonProjectPage;
