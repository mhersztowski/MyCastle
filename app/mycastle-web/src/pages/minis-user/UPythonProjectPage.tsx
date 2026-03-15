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
  Description,
  Edit as EditIcon,
  Extension,
  FolderOpen,
  Save,
  Settings,
  Terminal as TerminalIcon,
  Upload as UploadIcon,
  VerticalSplit,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import type { MinisDeviceModel } from '@mhersztowski/core';

type ViewMode = 'blockly' | 'split' | 'code';

const MIN_PANEL_PX = 200;

function UPythonProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeEditMode, setReadmeEditMode] = useState(false);
  const [readmeEditValue, setReadmeEditValue] = useState('');
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>(searchParams.get('device') ?? '');
  const [uploadCode, setUploadCode] = useState('');

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

  // Load README
  useEffect(() => {
    if (!userName || !projectId) return;
    minisApi.readProjectReadme(userName, projectId).then(setReadmeContent);
  }, [userName, projectId]);

  // Load devices
  useEffect(() => {
    if (!userName) return;
    minisApi.getUserDevices(userName).then(setDevices).catch(() => setDevices([]));
  }, [userName]);

  const handleSaveReadme = async () => {
    if (!userName || !projectId) return;
    await minisApi.writeProjectReadme(userName, projectId, readmeEditValue);
    setReadmeContent(readmeEditValue);
    setReadmeEditMode(false);
  };

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

  const openUploadDialog = async () => {
    const rawCode = editorRef.current?.getContent() ?? generatedCode;
    let code = rawCode;
    if (userName && selectedDeviceName) {
      try {
        const cfg = await minisApi.getDeviceMinisConfig(userName, selectedDeviceName);
        if (cfg.wifiSsid || cfg.serialNumber) {
          const header = [
            '# === MyCastle Device Configuration (auto-generated) ===',
            `MINIS_WIFI_SSID = ${JSON.stringify(cfg.wifiSsid)}`,
            `MINIS_WIFI_PASSWORD = ${JSON.stringify(cfg.wifiPassword)}`,
            `MINIS_DEVICE_SN = ${JSON.stringify(cfg.serialNumber)}`,
            '# =========================================================',
            '',
          ].join('\n');
          code = header + rawCode;
        }
      } catch { /* non-critical — upload without injection */ }
    }
    setUploadCode(code);
    setUploadOpen(true);
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
    px: { xs: 0.5, sm: 1.5 },
    '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
  });

  const showBlockly = viewMode === 'blockly' || viewMode === 'split';
  // Current Python code for upload
  const codeForUpload = editorRef.current?.getContent() ?? generatedCode;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0 }}>
      {/* Top AppBar */}
      <AppBar position="static" elevation={1} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => navigate(`/user/${userName}/electronics/upython`)}
            sx={{ mr: 1 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ mr: 2, display: { xs: 'none', md: 'block' } }} noWrap>
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
            size="small" variant={readmeOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<Description />}
            onClick={() => setReadmeOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(readmeOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>README</Box>
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
              sx={{ ...btnSx(viewMode === 'split'), display: { xs: 'none', md: 'inline-flex' } }}
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
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mr: 1, display: { xs: 'none', md: 'block' } }}>
              {boardProfiles[board]?.name ?? board}
            </Typography>
          )}
          {/* Upload + Terminal — widoczne tylko na mobilnym */}
          <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
            <Tooltip title={!selectedDeviceName ? 'Select a device first (Config panel)' : 'Upload to device'}>
              <span>
                <IconButton
                  color="inherit"
                  size="small"
                  onClick={openUploadDialog}
                  disabled={(!generatedCode && !codeEdited) || !selectedDeviceName}
                >
                  <UploadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="MicroPython REPL Terminal">
              <IconButton color="inherit" size="small" onClick={() => setReplOpen((v) => !v)}>
                <TerminalIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
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
            <FormControl fullWidth size="small" sx={{ mt: 2 }}>
              <InputLabel>Device</InputLabel>
              <Select
                value={selectedDeviceName}
                label="Device"
                onChange={(e) => setSelectedDeviceName(e.target.value)}
                renderValue={(v) => {
                  const d = devices.find((x) => x.name === v);
                  return d ? `${d.name}${d.sn ? ` (${d.sn})` : ''}` : v;
                }}
              >
                <MenuItem value=""><em>— none —</em></MenuItem>
                {devices.map((d) => (
                  <MenuItem key={d.name} value={d.name}>{d.name}{d.sn ? ` (${d.sn})` : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* README panel */}
        {readmeOpen && (
          <Box
            sx={{
              width: 360, flexShrink: 0,
              borderRight: 1, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>README</Typography>
              {readmeEditMode ? (
                <>
                  <Tooltip title="Save">
                    <IconButton size="small" onClick={handleSaveReadme}><Save fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Cancel">
                    <IconButton size="small" onClick={() => setReadmeEditMode(false)}><Close sx={{ fontSize: 16 }} /></IconButton>
                  </Tooltip>
                </>
              ) : (
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => { setReadmeEditValue(readmeContent ?? ''); setReadmeEditMode(true); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              {readmeEditMode ? (
                <TextField
                  multiline
                  fullWidth
                  minRows={10}
                  value={readmeEditValue}
                  onChange={(e) => setReadmeEditValue(e.target.value)}
                  variant="outlined"
                  size="small"
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                />
              ) : readmeContent ? (
                <Box sx={{ '& h1,h2,h3': { mt: 1, mb: 0.5 }, '& p': { mt: 0, mb: 1 }, '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto', fontSize: 12 }, '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: 12 } }}>
                  <ReactMarkdown remarkPlugins={[remarkBreaks]}>{readmeContent}</ReactMarkdown>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No README yet. Click <EditIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} /> to create one.
                </Typography>
              )}
            </Box>
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
      <AppBar position="static" elevation={0} color="default" sx={{ borderTop: 1, borderColor: 'divider', display: { xs: 'none', sm: 'block' } }}>
        <Toolbar variant="dense" sx={{ minHeight: 36 }}>
          <Tooltip title={!selectedDeviceName ? 'Select a device first (Config panel)' : 'Upload to device'}>
            <span>
              <IconButton
                size="small"
                onClick={openUploadDialog}
                disabled={(!generatedCode && !codeEdited) || !selectedDeviceName}
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
        code={uploadCode}
        userName={userName}
        board={board}
        projectId={projectId}
        deviceName={selectedDeviceName || undefined}
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
