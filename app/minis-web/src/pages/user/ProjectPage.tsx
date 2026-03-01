import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  ButtonGroup,
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
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
  Build,
  Close,
  Code,
  Extension,
  FlashOn,
  FolderOpen,
  Save,
  Settings,
  VerticalSplit,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import { ArduBlocklyComponent, type ArduBlocklyService, boardProfiles, socToBoardKey } from '@modules/ardublockly2';
import { WebSerialTerminal, FlashDialog, type FlashFileEntry } from '@modules/serial';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';

type ViewMode = 'blockly' | 'split' | 'code';

const MIN_PANEL_PX = 200;

function ProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const serviceRef = useRef<ArduBlocklyService | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const codeEditedRef = useRef(false);
  const suppressEditorChangeRef = useRef(false);
  const suppressBlocklyChangeRef = useRef(false);

  const [board, setBoard] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('blockly');
  const [codeEdited, setCodeEdited] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [compileOutput, setCompileOutput] = useState('');
  const [compileSuccess, setCompileSuccess] = useState<boolean | null>(null);
  const [compileOutputOpen, setCompileOutputOpen] = useState(false);
  const [flashFiles, setFlashFiles] = useState<FlashFileEntry[] | undefined>(undefined);
  const [saveBeforeCompileOpen, setSaveBeforeCompileOpen] = useState(false);
  const compileOutputRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state for use inside Blockly listener
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

  const handleServiceReady = useCallback((service: ArduBlocklyService) => {
    serviceRef.current = service;

    service.onWorkspaceChange(() => {
      if (suppressBlocklyChangeRef.current) return;
      if (codeEditedRef.current) {
        setConfirmOpen(true);
        return;
      }
      const code = service.generateArduinoCode();
      syncCodeToEditor(code);
    });

    const code = service.generateArduinoCode();
    syncCodeToEditor(code);
  }, [syncCodeToEditor]);

  // Initialize/dispose Monaco editor when code panel is visible
  const showCode = viewMode === 'code' || viewMode === 'split';

  useEffect(() => {
    if (!showCode || !editorContainerRef.current) return;

    const editor = EditorInstance.create(editorContainerRef.current, {
      value: generatedCode,
      language: 'cpp',
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

  // Resize Blockly when switching to/from split
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
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        const projectDef = projectDefs.find(d => d.id === project.projectDefId);
        if (!projectDef) return;
        const moduleDef = moduleDefs.find(m => m.id === projectDef.moduleDefId);
        if (!moduleDef?.soc) return;
        const boardKey = socToBoardKey[moduleDef.soc];
        if (boardKey && boardProfiles[boardKey]) {
          setBoard(boardKey);
          serviceRef.current?.changeBoard(boardKey);
        }
      } catch { /* ignore */ }
    })();
  }, [userName, projectId]);

  // Load sketches list via REST API
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

    // Suppress workspace change events during programmatic load
    suppressBlocklyChangeRef.current = true;
    serviceRef.current?.clearWorkspace();
    try {
      const blocklyContent = await minisApi.readSketchFile(userName, projectId, sketchName, `${sketchName}.blockly`);
      if (serviceRef.current && blocklyContent) {
        serviceRef.current.loadFromXml(blocklyContent);
      }
    } catch {
      // File not found — workspace already cleared
    }
    suppressBlocklyChangeRef.current = false;

    // Load .ino into code editor, or generate from loaded blockly
    try {
      const inoContent = await minisApi.readSketchFile(userName, projectId, sketchName, `${sketchName}.ino`);
      syncCodeToEditor(inoContent);
    } catch {
      if (serviceRef.current) {
        const code = serviceRef.current.generateArduinoCode();
        syncCodeToEditor(code);
      }
    }
  };

  const handleSaveSketch = async () => {
    if (!userName || !projectId || !currentSketch) return;

    const blocklyXml = serviceRef.current?.serializeToXml() ?? '';
    const inoCode = editorRef.current?.getContent() ?? generatedCode;

    await Promise.all([
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.blockly`, blocklyXml),
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.ino`, inoCode),
    ]);
    setCodeEdited(false);
  };

  const switchToView = (mode: ViewMode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOpen(false);
    setCodeEdited(false);
    if (serviceRef.current) {
      const code = serviceRef.current.generateArduinoCode();
      syncCodeToEditor(code);
    }
  };

  const handleCancelOverwrite = () => {
    setConfirmOpen(false);
  };

  const doCompile = async () => {
    if (!currentSketch || !userName || !projectId || !board) return;
    setCompiling(true);
    setCompileOutput('');
    setCompileSuccess(null);
    setCompileOutputOpen(true);

    try {
      await handleSaveSketch();
      const fqbn = boardProfiles[board]?.compilerFlag;
      if (!fqbn) {
        setCompileOutput('Error: Unknown board FQBN');
        setCompileSuccess(false);
        return;
      }
      const result = await minisApi.compileProject(userName, projectId, currentSketch, fqbn);
      setCompileOutput(result.output);
      setCompileSuccess(result.success);
    } catch (err) {
      setCompileOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setCompileSuccess(false);
    } finally {
      setCompiling(false);
    }
  };

  const handleCompile = () => {
    if (codeEdited) {
      setSaveBeforeCompileOpen(true);
    } else {
      doCompile();
    }
  };

  // Auto-scroll compile output
  useEffect(() => {
    if (compileOutputRef.current) {
      compileOutputRef.current.scrollTop = compileOutputRef.current.scrollHeight;
    }
  }, [compileOutput]);

  // --- Splitter drag handling ---
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
  });

  const showBlockly = viewMode === 'blockly' || viewMode === 'split';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top AppBar */}
      <AppBar position="static" elevation={1}>
        <Toolbar variant="dense">
          <IconButton color="inherit" edge="start" onClick={() => navigate(`/user/${userName}/main`)} sx={{ mr: 1 }}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ mr: 2 }} noWrap>
            Project
          </Typography>

          {/* Configuration toggle */}
          <Button
            size="small"
            variant={configOpen ? 'contained' : 'outlined'}
            color="inherit"
            startIcon={<Settings />}
            onClick={() => setConfigOpen((v) => !v)}
            sx={btnSx(configOpen)}
          >
            Configuration
          </Button>

          {/* Sketches toggle */}
          <Button
            size="small"
            variant={sketchesOpen ? 'contained' : 'outlined'}
            color="inherit"
            startIcon={<FolderOpen />}
            onClick={() => setSketchesOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(sketchesOpen) }}
          >
            Sketches{currentSketch ? `: ${currentSketch}` : ''}
          </Button>

          {/* Save */}
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<Save />}
            onClick={handleSaveSketch}
            disabled={!currentSketch}
            sx={{ ml: 1, ...btnSx(false) }}
          >
            Save
          </Button>

          <Box sx={{ flexGrow: 1 }} />

          {/* Blockly / Split / Code toggle — centered */}
          <ButtonGroup size="small">
            <Button
              variant={viewMode === 'blockly' ? 'contained' : 'outlined'}
              color="inherit"
              startIcon={<Extension />}
              onClick={() => switchToView('blockly')}
              sx={btnSx(viewMode === 'blockly')}
            >
              Blockly
            </Button>
            <Button
              variant={viewMode === 'split' ? 'contained' : 'outlined'}
              color="inherit"
              startIcon={<VerticalSplit />}
              onClick={() => switchToView('split')}
              sx={btnSx(viewMode === 'split')}
            >
              Split
            </Button>
            <Button
              variant={viewMode === 'code' ? 'contained' : 'outlined'}
              color="inherit"
              startIcon={<Code />}
              onClick={() => switchToView('code')}
              sx={btnSx(viewMode === 'code')}
            >
              Code{codeEdited ? ' *' : ''}
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
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Configuration panel */}
        {configOpen && (
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'auto',
              bgcolor: 'background.paper',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Configuration
            </Typography>

            <Typography variant="body2" sx={{ mb: 1 }}>
              Board: {board ? (boardProfiles[board]?.name ?? board) : 'Loading...'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              FQBN: {board ? (boardProfiles[board]?.compilerFlag ?? 'unknown') : '—'}
            </Typography>
          </Box>
        )}

        {/* Sketches panel */}
        {sketchesOpen && (
          <Box
            sx={{
              width: 220,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="subtitle2" sx={{ p: 2, pb: 0 }}>
              Sketches
            </Typography>
            <List dense>
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
                  No sketches found
                </Typography>
              )}
            </List>
          </Box>
        )}

        {/* Editor area */}
        <Box
          ref={splitterContainerRef}
          sx={{
            flexGrow: 1,
            display: 'flex',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
        {/* Blockly panel */}
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            display: showBlockly ? 'block' : 'none',
            width: viewMode === 'split' ? `${splitRatio * 100}%` : '100%',
            flexShrink: 0,
          }}
        >
          {board && (
            <ArduBlocklyComponent
              onServiceReady={handleServiceReady}
              initialBoard={board}
            />
          )}
        </Box>

        {/* Splitter handle */}
        {viewMode === 'split' && (
          <Box
            onMouseDown={handleSplitterMouseDown}
            sx={{
              width: 6,
              cursor: 'col-resize',
              bgcolor: 'divider',
              flexShrink: 0,
              '&:hover': { bgcolor: 'primary.main' },
              transition: 'background-color 0.15s',
            }}
          />
        )}

        {/* Code panel */}
        {showCode && (
          <Box
            ref={editorContainerRef}
            sx={{
              flexGrow: 1,
              overflow: 'hidden',
              minWidth: MIN_PANEL_PX,
            }}
          />
        )}
        </Box>
      </Box>

      {/* Compile output panel */}
      {compileOutputOpen && (
        <Box
          sx={{
            height: 200,
            borderTop: 2,
            borderColor: compileSuccess === true ? 'success.main' : compileSuccess === false ? 'error.main' : 'divider',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
              {compiling ? 'Compiling...' : compileSuccess === true ? 'Compilation succeeded' : compileSuccess === false ? 'Compilation failed' : 'Build Output'}
            </Typography>
            <IconButton size="small" onClick={() => setCompileOutputOpen(false)}>
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Box
            ref={compileOutputRef}
            sx={{
              flexGrow: 1,
              bgcolor: '#1e1e1e',
              color: '#d4d4d4',
              fontFamily: 'monospace',
              fontSize: 12,
              p: 1,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {compiling && !compileOutput ? 'Compiling...\n' : compileOutput || 'Ready.\n'}
          </Box>
        </Box>
      )}

      {/* Bottom status bar */}
      <AppBar
        position="static"
        elevation={0}
        color="default"
        sx={{ borderTop: 1, borderColor: 'divider' }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 36 }}>
          <Tooltip title="Compile">
            <span>
              <IconButton
                size="small"
                onClick={handleCompile}
                disabled={!currentSketch || compiling}
                color={compileSuccess === false ? 'error' : compileSuccess === true ? 'success' : 'default'}
              >
                {compiling ? <CircularProgress size={16} /> : <Build fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Serial Terminal">
            <IconButton size="small" onClick={() => setTerminalOpen(true)}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={board && boardProfiles[board]?.flashConfig ? 'Flash Firmware' : 'Flash not supported for this board'}>
            <span>
              <IconButton
                size="small"
                disabled={!board || !boardProfiles[board]?.flashConfig || !compileSuccess}
                onClick={async () => {
                  if (!userName || !projectId || !currentSketch || !board) return;
                  const fc = boardProfiles[board]?.flashConfig;
                  if (!fc) return;
                  const fileName = fc.filePattern.replace('{sketch}', currentSketch);
                  try {
                    const data = await minisApi.fetchOutputBinary(userName, projectId, fileName);
                    setFlashFiles([{ data, address: fc.offset, name: fileName }]);
                    setFlashOpen(true);
                  } catch (err) {
                    setCompileOutput(`Flash error: ${err instanceof Error ? err.message : String(err)}`);
                    setCompileSuccess(false);
                    setCompileOutputOpen(true);
                  }
                }}
              >
                <FlashOn fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {board}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Serial Terminal panel */}
      <WebSerialTerminal
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
      />

      {/* Flash Firmware dialog */}
      <FlashDialog
        open={flashOpen}
        onClose={() => { setFlashOpen(false); setFlashFiles(undefined); }}
        initialFiles={flashFiles}
      />

      {/* Save before compile dialog */}
      <Dialog open={saveBeforeCompileOpen} onClose={() => setSaveBeforeCompileOpen(false)}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved code changes. Save and compile?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveBeforeCompileOpen(false)}>Cancel</Button>
          <Button
            onClick={() => { setSaveBeforeCompileOpen(false); doCompile(); }}
            variant="contained"
          >
            Save & Compile
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm overwrite dialog */}
      <Dialog open={confirmOpen} onClose={handleCancelOverwrite}>
        <DialogTitle>Overwrite manual changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have manually edited the code. Blockly changes will regenerate the code and overwrite your edits. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelOverwrite}>Cancel</Button>
          <Button onClick={handleConfirmOverwrite} color="warning" variant="contained">
            Overwrite
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ProjectPage;
