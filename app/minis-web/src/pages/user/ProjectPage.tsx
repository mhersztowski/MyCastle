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
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
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
import { useMqtt } from '@modules/mqttclient';
import { useAuth } from '@modules/auth/AuthContext';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@modules/editor/core/EditorInstance';
import { ArduBlocklyComponent, type ArduBlocklyService, boardProfiles } from '@modules/ardublockly2';
import { WebSerialTerminal, FlashDialog } from '@modules/serial';

type ViewMode = 'blockly' | 'split' | 'code';

const MIN_PANEL_PX = 200;

function ProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const { readFile, writeFile, listDirectory, isConnected } = useMqtt();
  const { currentUser } = useAuth();
  const serviceRef = useRef<ArduBlocklyService | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const codeEditedRef = useRef(false);
  const suppressEditorChangeRef = useRef(false);
  const suppressBlocklyChangeRef = useRef(false);

  const [board, setBoard] = useState('esp8266_wemos_d1');
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

  // Load sketches list from project examples directory
  const projectBasePath = currentUser?.name && projectId
    ? `Minis/Users/${currentUser.name}/Projects/${projectId}/examples`
    : null;

  useEffect(() => {
    if (!isConnected || !projectBasePath) return;
    listDirectory(projectBasePath).then((tree) => {
      const dirs = (tree.children ?? [])
        .filter((c) => c.type === 'directory')
        .map((c) => c.name);
      setSketches(dirs);
    }).catch(() => setSketches([]));
  }, [isConnected, projectBasePath, listDirectory]);

  const handleLoadSketch = async (sketchName: string) => {
    if (!projectBasePath) return;
    setCurrentSketch(sketchName);
    setCodeEdited(false);

    const blocklyPath = `${projectBasePath}/${sketchName}/${sketchName}.blockly`;
    const inoPath = `${projectBasePath}/${sketchName}/${sketchName}.ino`;

    // Suppress workspace change events during programmatic load
    suppressBlocklyChangeRef.current = true;
    serviceRef.current?.clearWorkspace();
    try {
      const blocklyFile = await readFile(blocklyPath);
      if (serviceRef.current && blocklyFile.content) {
        serviceRef.current.loadFromXml(blocklyFile.content);
      }
    } catch {
      // File not found — workspace already cleared
    }
    suppressBlocklyChangeRef.current = false;

    // Load .ino into code editor, or generate from loaded blockly
    try {
      const inoFile = await readFile(inoPath);
      syncCodeToEditor(inoFile.content);
    } catch {
      if (serviceRef.current) {
        const code = serviceRef.current.generateArduinoCode();
        syncCodeToEditor(code);
      }
    }
  };

  const handleSaveSketch = async () => {
    if (!projectBasePath || !currentSketch) return;
    const blocklyPath = `${projectBasePath}/${currentSketch}/${currentSketch}.blockly`;
    const inoPath = `${projectBasePath}/${currentSketch}/${currentSketch}.ino`;

    const blocklyXml = serviceRef.current?.serializeToXml() ?? '';
    const inoCode = editorRef.current?.getContent() ?? generatedCode;

    await Promise.all([
      writeFile(blocklyPath, blocklyXml),
      writeFile(inoPath, inoCode),
    ]);
    setCodeEdited(false);
  };

  const handleBoardChange = (newBoard: string) => {
    setBoard(newBoard);
    serviceRef.current?.changeBoard(newBoard);
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

          {/* Board selector */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel sx={{ color: 'inherit' }}>Board</InputLabel>
            <Select
              value={board}
              label="Board"
              onChange={(e) => handleBoardChange(e.target.value)}
              sx={{
                color: 'inherit',
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.7)' },
                '.MuiSvgIcon-root': { color: 'inherit' },
              }}
            >
              {Object.entries(boardProfiles).map(([key, profile]) => (
                <MenuItem key={key} value={key}>
                  {profile.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          <ArduBlocklyComponent
            onServiceReady={handleServiceReady}
            initialBoard={board}
            readFile={readFile}
            ready={isConnected}
          />
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

      {/* Bottom status bar */}
      <AppBar
        position="static"
        elevation={0}
        color="default"
        sx={{ borderTop: 1, borderColor: 'divider' }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 36 }}>
          <Tooltip title="Serial Terminal">
            <IconButton size="small" onClick={() => setTerminalOpen(true)}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flash Firmware">
            <IconButton size="small" onClick={() => setFlashOpen(true)}>
              <FlashOn fontSize="small" />
            </IconButton>
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
        onClose={() => setFlashOpen(false)}
      />

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
