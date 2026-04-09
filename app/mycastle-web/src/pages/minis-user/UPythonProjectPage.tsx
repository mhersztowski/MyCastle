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
  Divider,
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
  Refresh,
  Save,
  Settings,
  SmartToy,
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
  HARDWARE_CATEGORY_NAMES,
} from '@modules/upythonblockly';
import { MpyReplTerminal } from '@modules/upythonblockly/repl';
import { UploadDialog } from '@modules/upythonblockly/upload';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';
import type { MinisDeviceModel } from '@mhersztowski/core';
import { MemoryFS } from '@mhersztowski/core';
import { AgentPanel, DEFAULT_AGENT_CONFIG } from '@mhersztowski/web-client';

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
  const isLoadingSketchRef = useRef(false);
  // When Blockly init is delayed (WebView), sketch API call may complete first.
  // Store the XML here and apply it once the service is ready.
  const queuedSketchXmlRef = useRef<string | null>(null);
  const hiddenCategoriesRef = useRef<Set<string>>(
    (() => {
      const stored = localStorage.getItem('upython_hidden_cats');
      if (stored !== null) return new Set<string>(JSON.parse(stored) as string[]);
      return new Set<string>(HARDWARE_CATEGORY_NAMES);
    })(),
  );

  // In React Native WebView the native layout may not be finalised when JS starts,
  // so Blockly.inject() would read height=0. Delay init until layout settles.
  const isWebView = typeof navigator !== 'undefined' && navigator.userAgent.includes('MyCastleMobile');
  const [blocklyReady, setBlocklyReady] = useState(!isWebView);
  useEffect(() => {
    if (!isWebView) return;
    const t = setTimeout(() => setBlocklyReady(true), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [board, setBoard] = useState<string>('rp2040_pico');
  const [newSketchName, setNewSketchName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('blockly');
  const [codeEdited, setCodeEdited] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [replOpen, setReplOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
  );
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeEditMode, setReadmeEditMode] = useState(false);
  const [readmeEditValue, setReadmeEditValue] = useState('');
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>(searchParams.get('device') ?? '');
  const initialSketch = searchParams.get('sketch');
  const [uploadCode, setUploadCode] = useState('');
  const [projectLibraries, setProjectLibraries] = useState<Array<{ url: string; remoteName: string }>>([]);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('upython_hidden_cats');
    if (stored !== null) return new Set<string>(JSON.parse(stored) as string[]);
    // Default: all hardware categories hidden
    return new Set<string>(HARDWARE_CATEGORY_NAMES);
  });
  const [loadKey, setLoadKey] = useState(0);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentFs, setAgentFs] = useState<MemoryFS | null>(null);
  const [agentFsVersion, setAgentFsVersion] = useState(0);
  const [agentApiKey, setAgentApiKey] = useState('');

  // Keep ref in sync for use inside Blockly listener
  useEffect(() => {
    codeEditedRef.current = codeEdited;
  }, [codeEdited]);

  // After each sketch load, keep isLoadingSketchRef true for a bit longer to absorb any
  // deferred Blockly workspace events, then do a final isDirty reset.
  useEffect(() => {
    if (loadKey === 0) return;
    setIsDirty(false);
    const t = setTimeout(() => {
      isLoadingSketchRef.current = false;
      setIsDirty(false);
    }, 100);
    return () => clearTimeout(t);
  }, [loadKey]);

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

    // Apply persisted toolbox visibility on init
    if (hiddenCategoriesRef.current.size > 0) {
      service.updateToolboxVisibility(hiddenCategoriesRef.current);
    }

    // If a sketch was fetched before Blockly was ready (WebView delay), load it now.
    if (queuedSketchXmlRef.current) {
      const xml = queuedSketchXmlRef.current;
      queuedSketchXmlRef.current = null;
      suppressBlocklyChangeRef.current = true;
      service.loadFromXml(xml);
      suppressBlocklyChangeRef.current = false;
      setTimeout(() => service.rerenderBlocks(), 300);
    }

    service.onWorkspaceChange(() => {
      if (suppressBlocklyChangeRef.current) return;
      if (codeEditedRef.current) {
        setConfirmOpen(true);
        return;
      }
      const code = service.generateCode();
      syncCodeToEditor(code);
      if (!isLoadingSketchRef.current) setIsDirty(true);
    });

    const code = service.generateCode();
    syncCodeToEditor(code);
    setIsDirty(false);
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
      if (isLoadingSketchRef.current) return;
      setCodeEdited(true);
      setIsDirty(true);
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

  // Resolve board from project.boardProfileKey
  useEffect(() => {
    if (!userName || !projectId) return;
    (async () => {
      try {
        const projects = await minisApi.getUserProjects(userName);
        const project = projects.find((p) => p.id === projectId);
        if (!project) return;
        const boardKey = project.boardProfileKey;
        if (boardKey && boardProfiles[boardKey]) {
          setBoard(boardKey);
          serviceRef.current?.changeBoard(boardKey);
        }
        const libs = (project as unknown as Record<string, unknown>).libraries as Array<{ url?: string; remoteName?: string; name?: string }> | undefined;
        if (libs?.length) {
          setProjectLibraries(
            libs.filter(l => l.url).map(l => ({
              url: l.url!,
              remoteName: l.remoteName ?? (l.url!.split('/').pop() ?? l.name ?? 'lib.py'),
            }))
          );
        }
      } catch { /* ignore */ }
    })();
  }, [userName, projectId]);

  // Load sketches list, auto-open sketch from URL param or first
  useEffect(() => {
    if (!userName || !projectId) return;
    minisApi.listSketches(userName, projectId)
      .then((list) => {
        setSketches(list);
        if (list.length > 0) {
          const target = initialSketch && list.includes(initialSketch) ? initialSketch : list[0];
          handleLoadSketch(target);
        }
      })
      .catch(() => setSketches([]));
  }, [userName, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-generate MinisConfig.py in sketch directory when device or sketch changes
  useEffect(() => {
    if (!userName || !projectId || !selectedDeviceName || !currentSketch) return;
    minisApi.getDeviceMinisConfig(userName, selectedDeviceName)
      .then((cfg) => {
        if (!cfg.deviceName && !cfg.serialNumber) return;
        const configContent = [
          `MINIS_DEVICE_NAME = ${JSON.stringify(cfg.deviceName || cfg.serialNumber)}`,
          `MINIS_WIFI_SSID = ${JSON.stringify(cfg.wifiSsid)}`,
          `MINIS_WIFI_PASSWORD = ${JSON.stringify(cfg.wifiPassword)}`,
        ].join('\n') + '\n';
        return minisApi.writeSketchFile(userName, projectId, currentSketch, 'MinisConfig.py', configContent);
      })
      .catch(() => { /* non-critical */ });
  }, [selectedDeviceName, currentSketch]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setIsDirty(false);
    isLoadingSketchRef.current = true;

    suppressBlocklyChangeRef.current = true;
    serviceRef.current?.clearWorkspace();
    let xmlLoaded = false;
    try {
      const xmlContent = await minisApi.readSketchFile(
        userName, projectId, sketchName, `${sketchName}.blockly`,
      );
      if (xmlContent) {
        if (serviceRef.current) {
          serviceRef.current.loadFromXml(xmlContent);
          xmlLoaded = true;
        } else {
          // Blockly not ready yet (WebView delay) — queue for handleServiceReady
          queuedSketchXmlRef.current = xmlContent;
          xmlLoaded = true;
        }
      }
    } catch {
      // File not found — workspace already cleared
    }
    suppressBlocklyChangeRef.current = false;

    if (xmlLoaded && serviceRef.current) {
      // Regenerate from blockly so code always matches current blocks (handles legacy shadows etc.)
      syncCodeToEditor(serviceRef.current.generateCode());
    } else {
      try {
        const pyContent = await minisApi.readSketchFile(
          userName, projectId, sketchName, `${sketchName}.py`,
        );
        syncCodeToEditor(pyContent);
      } catch {
        if (serviceRef.current) syncCodeToEditor(serviceRef.current.generateCode());
      }
    }
    // Increment loadKey — the useEffect on loadKey will do the final isDirty reset and
    // clear isLoadingSketchRef after 100ms (enough to absorb deferred Blockly events).
    setIsDirty(false);
    setLoadKey((k) => k + 1);
    // Re-render blocks after loading to fix layout issues in WebView where getBBox()
    // may return stale/zero values causing blocks to overlap.
    setTimeout(() => serviceRef.current?.rerenderBlocks(), 300);
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
    setIsDirty(false);
  };

  const openUploadDialog = () => {
    setUploadCode(editorRef.current?.getContent() ?? generatedCode);
    setUploadOpen(true);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOpen(false);
    setCodeEdited(false);
    setIsDirty(false);
    if (serviceRef.current) {
      syncCodeToEditor(serviceRef.current.generateCode());
    }
  };

  const handleOpenAgent = useCallback(async () => {
    const code = editorRef.current?.getContent() ?? generatedCode;
    const xml = serviceRef.current?.serializeToXml() ?? '';
    const sketchName = currentSketch ?? 'sketch';

    const apiKey = await minisApi.getAnthropicKey().catch(() => '');

    const fs = new MemoryFS();
    const enc = new TextEncoder();
    await fs.mkdir(`/${sketchName}`);
    await fs.writeFile(`/${sketchName}/${sketchName}.py`, enc.encode(code), { create: true, overwrite: true });
    if (xml) {
      await fs.writeFile(`/${sketchName}/${sketchName}.blockly`, enc.encode(xml), { create: true, overwrite: true });
    }

    setAgentApiKey(apiKey);
    setAgentFs(fs);
    setAgentFsVersion((v) => v + 1);
    setAgentOpen(true);
  }, [generatedCode, currentSketch]);

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
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
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
            size="small" variant={agentOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<SmartToy />}
            onClick={() => {
              if (agentOpen) { setAgentOpen(false); } else { void handleOpenAgent(); }
            }}
            sx={{ ml: 1, ...btnSx(agentOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>AI</Box>
          </Button>

          <Button
            size="small" variant={sketchesOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<FolderOpen />}
            onClick={() => setSketchesOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(sketchesOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sketches{currentSketch ? `: ${currentSketch}` : ''}</Box>
          </Button>

          <Tooltip title="Sync sketches from GitHub">
            <span>
              <Button
                size="small" variant="outlined" color="inherit"
                startIcon={syncing ? <CircularProgress size={14} color="inherit" /> : <Refresh />}
                onClick={async () => {
                  if (!userName || !projectId) return;
                  setSyncing(true);
                  try {
                    await minisApi.syncProjectFromGithub(userName, projectId);
                    const list = await minisApi.listSketches(userName, projectId);
                    setSketches(list);
                  } catch (err) {
                    console.error('Sync failed:', err);
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                sx={{ ml: 1, ...btnSx(false) }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sync</Box>
              </Button>
            </span>
          </Tooltip>

          <Tooltip title={isDirty && currentSketch ? 'Unsaved changes' : ''}>
            <span>
              <Button
                size="small"
                variant={isDirty && currentSketch ? 'contained' : 'outlined'}
                color={isDirty && currentSketch ? 'warning' : 'inherit'}
                startIcon={<Save />}
                onClick={handleSaveSketch}
                disabled={!currentSketch}
                sx={{ ml: 1, ...(isDirty && currentSketch ? {} : btnSx(false)) }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Save</Box>
              </Button>
            </span>
          </Tooltip>

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
      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Configuration panel */}
        {configOpen && (
          <Box
            sx={{
              width: { xs: '100%', sm: 280 }, maxWidth: { xs: 320, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
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
            <Divider sx={{ mt: 2, mb: 1 }} />
            <Typography variant="subtitle2" gutterBottom>Hardware Categories</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {HARDWARE_CATEGORY_NAMES.map((name) => {
                const visible = !hiddenCategories.has(name);
                return (
                  <Button
                    key={name}
                    size="small"
                    variant={visible ? 'contained' : 'outlined'}
                    onClick={() => {
                      const next = new Set(hiddenCategories);
                      if (visible) { next.add(name); } else { next.delete(name); }
                      hiddenCategoriesRef.current = next;
                      setHiddenCategories(next);
                      localStorage.setItem('upython_hidden_cats', JSON.stringify([...next]));
                      serviceRef.current?.updateToolboxVisibility(next);
                    }}
                    sx={{ textTransform: 'none', fontSize: '0.7rem', px: 0.75, py: 0.25, minWidth: 0 }}
                  >
                    {name}
                  </Button>
                );
              })}
            </Box>
          </Box>
        )}

        {/* README panel */}
        {readmeOpen && (
          <Box
            sx={{
              width: { xs: '100%', sm: 360 }, maxWidth: { xs: 400, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
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

        {/* AI Agent panel */}
        {agentOpen && agentFs && (
          <Box
            sx={{
              width: { xs: '100%', sm: 380 }, maxWidth: { xs: 420, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
              borderRight: 1, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            <AgentPanel
              key={agentFsVersion}
              provider={agentFs}
              providerVersion={agentFsVersion}
              defaultConfig={{
                providerType: 'anthropic',
                providers: {
                  ...DEFAULT_AGENT_CONFIG.providers,
                  anthropic: {
                    ...DEFAULT_AGENT_CONFIG.providers.anthropic,
                    apiKey: agentApiKey,
                  },
                },
              }}
            />
          </Box>
        )}

        {/* Sketches panel */}
        {sketchesOpen && (
          <Box
            sx={{
              width: { xs: '100%', sm: 220 }, maxWidth: { xs: 280, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
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
              height: '100%',
              flexShrink: 0,
            }}
          >
            <UPythonBlocklyComponent
              onServiceReady={handleServiceReady}
              initialBoard={board}
              ready={blocklyReady}
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
        libraries={projectLibraries}
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
