import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  Switch,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  Build,
  Close,
  CloseFullscreen,
  Code,
  Delete as DeleteIcon,
  Description,
  Edit as EditIcon,
  ExpandLess,
  ExpandMore,
  Extension,
  FlashOn,
  FolderOpen,
  InsertDriveFile,
  Memory,
  OpenInFull,
  Refresh,
  Save,
  Settings,
  Terminal as TerminalIcon,
  VerticalSplit,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import { ArduBlocklyComponent, type ArduBlocklyService, boardProfiles } from '@modules/ardublockly2';
import { WebSerialTerminal, FlashDialog, type FlashFileEntry } from '@modules/serial';
import { minisApi } from '../../services/MinisApiService';
import { useAuth } from '../../modules/auth';
import { AccountMenu } from '../../components/AccountMenu';
import { BuildOutputPanel } from '../../components/BuildOutputPanel';
import { ArduinoWasmRuntime } from '../../components/ArduinoWasmRuntime';
import type { MinisDeviceModel, MinisProjectLibrary } from '@mhersztowski/core';

type ViewMode = 'blockly' | 'split' | 'code';

// ─── Arduino examples browser ────────────────────────────────────────────────

type ExampleEntry = { name: string; filePath: string };
type ExampleLibEntry = { name: string; examples: ExampleEntry[] };

interface ExamplesDialogProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  onOpenExample: (content: string, name: string) => void;
}

function ExamplesDialog({ open, onClose, userName, onOpenExample }: ExamplesDialogProps) {
  const { token } = useAuth();
  const [libraries, setLibraries] = useState<ExampleLibEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [code, setCode] = useState('');
  const [loadingCode, setLoadingCode] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(null); setSelectedPath(null); setCode(''); setFilter('');
    fetch(`/api/users/${encodeURIComponent(userName)}/arduino-local-examples`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json() as Promise<{ libraries?: ExampleLibEntry[] }>)
      .then(data => setLibraries(data.libraries ?? []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, userName, token]);

  const loadCode = (filePath: string, name: string) => {
    setSelectedPath(filePath); setSelectedName(name); setLoadingCode(true); setCode('');
    fetch(`/api/users/${encodeURIComponent(userName)}/arduino-example-content?path=${encodeURIComponent(filePath)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json() as Promise<{ content?: string }>)
      .then(d => setCode(d.content ?? ''))
      .catch((e: unknown) => setCode(`// Error: ${String(e)}`))
      .finally(() => setLoadingCode(false));
  };

  const toggle = (name: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(name)) n.delete(name); else n.add(name);
    return n;
  });

  const filterLow = filter.toLowerCase();
  const filteredLibs = filter
    ? libraries
        .map(lib => ({ ...lib, examples: lib.examples.filter(e => e.name.toLowerCase().includes(filterLow) || lib.name.toLowerCase().includes(filterLow)) }))
        .filter(lib => lib.examples.length)
    : libraries;

  return (
    <Dialog open={open} onClose={onClose} fullScreen>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense">
          <IconButton edge="start" onClick={onClose} size="small" sx={{ mr: 1 }}><Close /></IconButton>
          <Typography variant="subtitle1" sx={{ flexGrow: 1, color: 'text.primary' }}>
            Arduino Examples — drive/git/arduino
          </Typography>
          {selectedPath && code && (
            <Button size="small" variant="contained" sx={{ mr: 1 }} onClick={() => { onOpenExample(code, selectedName); onClose(); }}>
              Open in sketch
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
        {/* Left: library tree */}
        <Box sx={{ width: 280, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ p: 1 }}>
            <TextField
              size="small" fullWidth placeholder="Filter…"
              value={filter} onChange={e => setFilter(e.target.value)}
              sx={{ '& .MuiInputBase-input': { fontSize: 12 } }}
              InputProps={{ endAdornment: filter ? <IconButton size="small" onClick={() => setFilter('')}><Close sx={{ fontSize: 14 }} /></IconButton> : undefined }}
            />
          </Box>
          <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={24} /></Box>}
            {error && <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>}
            {!loading && filteredLibs.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No examples found.</Typography>}
            <List dense disablePadding>
              {filteredLibs.map(lib => (
                <React.Fragment key={lib.name}>
                  <ListItemButton dense onClick={() => toggle(lib.name)} sx={{ py: 0.5 }}>
                    <Box sx={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      {expanded.has(lib.name) ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
                    </Box>
                    <FolderOpen sx={{ fontSize: 14, mr: 0.75, color: 'primary.main' }} />
                    <ListItemText primary={lib.name} primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }} />
                  </ListItemButton>
                  <Collapse in={expanded.has(lib.name)} unmountOnExit>
                    {lib.examples.map(ex => (
                      <ListItemButton
                        key={ex.filePath} dense
                        selected={selectedPath === ex.filePath}
                        onClick={() => loadCode(ex.filePath, ex.name)}
                        sx={{ pl: 4, py: 0.25 }}
                      >
                        <InsertDriveFile sx={{ fontSize: 12, mr: 0.75, color: 'text.secondary' }} />
                        <ListItemText primary={ex.name} primaryTypographyProps={{ fontSize: 12 }} />
                      </ListItemButton>
                    ))}
                  </Collapse>
                </React.Fragment>
              ))}
            </List>
          </Box>
        </Box>
        {/* Right: code preview */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#1e1e1e' }}>
          {!selectedPath && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography color="text.secondary" variant="body2">Select an example from the list</Typography>
            </Box>
          )}
          {selectedPath && loadingCode && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {selectedPath && !loadingCode && (
            <Box
              component="pre"
              sx={{
                flexGrow: 1, m: 0, p: 2, overflowY: 'auto',
                fontFamily: '"Fira Code", "Consolas", monospace', fontSize: 13, lineHeight: 1.5,
                color: '#d4d4d4', bgcolor: '#1e1e1e', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            >
              {code}
            </Box>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}

// ─── Local drive library picker ───────────────────────────────────────────────

type LocalLibEntry = { name: string; relPath: string; isLib: boolean; libName?: string; depends?: string[]; children?: LocalLibEntry[] };

interface LocalLibPickerProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  onSelect: (libs: MinisProjectLibrary[], missing: string[]) => void;
}

function LocalLibPickerDialog({ open, onClose, userName, onSelect }: LocalLibPickerProps) {
  const { token } = useAuth();
  const [entries, setEntries] = useState<LocalLibEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    fetch(`/api/users/${encodeURIComponent(userName)}/arduino-local-libs`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json() as Promise<{ entries?: LocalLibEntry[] }>)
      .then(data => setEntries(data.entries ?? []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, userName, token]);

  // Build flat map: libName (from library.properties name=) → entry
  const libNameMap = React.useMemo(() => {
    const map = new Map<string, LocalLibEntry>();
    const flatten = (es: LocalLibEntry[]) => {
      for (const e of es) {
        if (e.isLib && e.libName) map.set(e.libName, e);
        if (e.children) flatten(e.children);
      }
    };
    flatten(entries);
    return map;
  }, [entries]);

  const handleSelect = (entry: LocalLibEntry) => {
    const toAdd: MinisProjectLibrary[] = [];
    const missing: string[] = [];
    const visited = new Set<string>();
    const queue: LocalLibEntry[] = [entry];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current.relPath)) continue;
      visited.add(current.relPath);
      toAdd.push({ url: `drive://${current.relPath}` });
      for (const dep of current.depends ?? []) {
        const found = libNameMap.get(dep);
        if (found && !visited.has(found.relPath)) {
          queue.push(found);
        } else if (!found && !missing.includes(dep)) {
          missing.push(dep);
        }
      }
    }
    onSelect(toAdd, missing);
    onClose();
  };

  const toggleExpand = (relPath: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath); else next.add(relPath);
      return next;
    });
  };

  const renderEntry = (entry: LocalLibEntry, depth = 0): ReactNode => (
    <React.Fragment key={entry.relPath}>
      <ListItemButton
        dense
        sx={{ pl: 1 + depth * 2 }}
        onClick={() => {
          if (entry.children?.length && !entry.isLib) toggleExpand(entry.relPath);
          else handleSelect(entry);
        }}
      >
        <Box sx={{ width: 28, flexShrink: 0 }}>
          {(entry.children?.length ?? 0) > 0 && !entry.isLib ? (
            <IconButton size="small" sx={{ p: 0 }} onClick={e => { e.stopPropagation(); toggleExpand(entry.relPath); }}>
              {expanded.has(entry.relPath) ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
            </IconButton>
          ) : null}
        </Box>
        <FolderOpen sx={{ fontSize: 15, mr: 0.75, color: entry.isLib ? 'success.main' : 'text.secondary', flexShrink: 0 }} />
        <ListItemText
          primary={entry.libName ?? entry.name}
          secondary={entry.isLib ? (entry.depends?.length ? `depends: ${entry.depends.join(', ')}` : 'library.properties ✓') : undefined}
          primaryTypographyProps={{ fontSize: 13 }}
          secondaryTypographyProps={{ fontSize: 10, color: entry.depends?.length ? 'info.main' : 'success.main' }}
          sx={{ my: 0 }}
        />
        {entry.isLib && (
          <Button
            size="small"
            variant="outlined"
            sx={{ fontSize: 11, ml: 1, flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); handleSelect(entry); }}
          >
            Add
          </Button>
        )}
      </ListItemButton>
      {(entry.children?.length ?? 0) > 0 && (
        <Collapse in={expanded.has(entry.relPath)} unmountOnExit>
          {entry.children!.map(child => renderEntry(child, depth + 1))}
        </Collapse>
      )}
    </React.Fragment>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FolderOpen fontSize="small" />
          Local Arduino libraries
        </Box>
        <Typography variant="caption" color="text.secondary" display="block">
          drive/git/arduino/
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, minHeight: 180 }}>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={28} /></Box>}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {!loading && !error && entries.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No directories found in drive/git/arduino/.
          </Typography>
        )}
        {!loading && entries.length > 0 && (
          <List dense disablePadding>
            {entries.map(e => renderEntry(e))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

const MIN_PANEL_PX = 200;

function ProjectPage({ mode = 'blockly' }: { mode?: 'blockly' | 'code' }) {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const serviceRef = useRef<ArduBlocklyService | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const generatedCodeRef = useRef('');
  const codeEditedRef = useRef(false);
  const currentSketchRef = useRef<string | null>(null);
  const suppressEditorChangeRef = useRef(false);
  const suppressBlocklyChangeRef = useRef(false);
  const savedBlocklyXmlRef = useRef<string | null>(null);

  const lastSourceStorageKey = projectId ? `arduino_last_source_${projectId}` : null;
  const [sketchLastSource, setSketchLastSource] = useState<Map<string, 'blockly' | 'code'>>(() => {
    if (!projectId) return new Map();
    try {
      const raw = localStorage.getItem(`arduino_last_source_${projectId}`);
      if (raw) return new Map(JSON.parse(raw) as [string, 'blockly' | 'code'][]);
    } catch { /* ignore */ }
    return new Map();
  });

  const [board, setBoard] = useState<string | null>(null);
  const [newSketchName, setNewSketchName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(mode === 'code' ? 'code' : 'blockly');
  const [codeEdited, setCodeEdited] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [flashOpen, setFlashOpen] = useState(false);
  const [wasmOpen, setWasmOpen] = useState(false);
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
  );
  const [expandedSketches, setExpandedSketches] = useState<Set<string>>(new Set());
  const [sketchFiles, setSketchFiles] = useState<Map<string, string[]>>(new Map());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileOutput, setCompileOutput] = useState('');
  const [compileSuccess, setCompileSuccess] = useState<boolean | null>(null);
  const [compileOutputOpen, setCompileOutputOpen] = useState(false);
  const [flashFiles, setFlashFiles] = useState<FlashFileEntry[] | undefined>(undefined);
  const [saveBeforeCompileOpen, setSaveBeforeCompileOpen] = useState(false);
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>(() => {
    const fromUrl = searchParams.get('device');
    if (fromUrl) return fromUrl;
    return (projectId ? localStorage.getItem(`arduino_device_${projectId}`) : null) ?? '';
  });
  const initialSketch = searchParams.get('sketch');
  const [libraries, setLibraries] = useState<MinisProjectLibrary[]>([]);
  const [useMinisC, setUseMinisC] = useState(false);
  const [libInput, setLibInput] = useState('');
  const [libSaving, setLibSaving] = useState(false);
  const [localLibPickerOpen, setLocalLibPickerOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [missingDepsMsg, setMissingDepsMsg] = useState<string | null>(null);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readmeExpanded, setReadmeExpanded] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeEditMode, setReadmeEditMode] = useState(false);
  const [readmeEditValue, setReadmeEditValue] = useState('');

  useEffect(() => {
    setViewMode(mode === 'code' ? 'code' : 'blockly');
  }, [mode]);

  // Keep refs in sync with state for use inside async callbacks / stale closures
  useEffect(() => {
    codeEditedRef.current = codeEdited;
  }, [codeEdited]);

  useEffect(() => {
    currentSketchRef.current = currentSketch;
  }, [currentSketch]);

  // Persist sketchLastSource to localStorage
  useEffect(() => {
    if (!lastSourceStorageKey) return;
    try {
      localStorage.setItem(lastSourceStorageKey, JSON.stringify([...sketchLastSource]));
    } catch { /* ignore */ }
  }, [sketchLastSource, lastSourceStorageKey]);

  // Sync generated code to Monaco editor
  const syncCodeToEditor = useCallback((code: string) => {
    generatedCodeRef.current = code;
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
      setIsDirty(true);
      setSketchLastSource((prev) => {
        const s = currentSketchRef.current;
        if (!s) return prev;
        const next = new Map(prev);
        next.set(s, 'blockly');
        return next;
      });
    });

    // Restore workspace XML if returning from code-only view
    if (savedBlocklyXmlRef.current) {
      suppressBlocklyChangeRef.current = true;
      service.loadFromXml(savedBlocklyXmlRef.current);
      suppressBlocklyChangeRef.current = false;
      savedBlocklyXmlRef.current = null;
    }

    const code = service.generateArduinoCode();
    syncCodeToEditor(code);
  }, [syncCodeToEditor]);

  const showCode = mode === 'code' || viewMode === 'split';
  const showBlockly = mode !== 'code' && (viewMode === 'blockly' || viewMode === 'split');

  // Initialize/dispose Monaco editor when code panel is visible
  useEffect(() => {
    if (!showCode || !editorContainerRef.current) return;

    const editor = EditorInstance.create(editorContainerRef.current, {
      value: generatedCodeRef.current,
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
      setIsDirty(true);
      setSketchLastSource((prev) => {
        const s = currentSketchRef.current;
        if (!s) return prev;
        const next = new Map(prev);
        next.set(s, 'code');
        return next;
      });
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

  // Resolve board from project.boardProfileKey
  useEffect(() => {
    if (!userName || !projectId) return;
    (async () => {
      try {
        const projects = await minisApi.getUserProjects(userName);
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (!project) return;
        const boardKey = project.boardProfileKey;
        if (boardKey && boardProfiles[boardKey]) {
          setBoard(boardKey);
          serviceRef.current?.changeBoard(boardKey);
        }
        if (project.libraries) setLibraries(project.libraries);
        if ('useMinisC' in project) setUseMinisC(!!(project as { useMinisC?: boolean }).useMinisC);
      } catch { /* ignore */ }
    })();
  }, [userName, projectId]);

  // Load sketches list via REST API, auto-open sketch from URL param or first
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

  // Load devices for selector
  useEffect(() => {
    if (!userName) return;
    minisApi.getUserDevices(userName).then(setDevices).catch(() => setDevices([]));
  }, [userName]);

  // Persist selected device to localStorage so it survives view-mode remounts
  useEffect(() => {
    if (!projectId) return;
    if (selectedDeviceName) {
      localStorage.setItem(`arduino_device_${projectId}`, selectedDeviceName);
    } else {
      localStorage.removeItem(`arduino_device_${projectId}`);
    }
  }, [projectId, selectedDeviceName]);

  // Restore compileSuccess from device's lastBuild when sketch is loaded
  useEffect(() => {
    if (!selectedDeviceName || !projectId || !currentSketch) return;
    if (compileSuccess !== null) return; // Don't override a fresh in-session result
    const device = devices.find(d => d.name === selectedDeviceName);
    const lb = device?.lastBuild;
    if (lb?.success && lb.projectId === projectId && lb.sketchName === currentSketch) {
      setCompileSuccess(true);
    }
  }, [devices, selectedDeviceName, projectId, currentSketch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddLibrary = () => {
    const val = libInput.trim();
    if (!val) return;
    let entry: MinisProjectLibrary;
    if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('git@')) {
      entry = { url: val };
    } else {
      // support "Name@version" or "Name version" or just "Name"
      const atMatch = val.match(/^([^@]+)@(.+)$/);
      const spaceMatch = val.match(/^(\S+)\s+(\S+)$/);
      if (atMatch) entry = { name: atMatch[1].trim(), version: atMatch[2].trim() };
      else if (spaceMatch) entry = { name: spaceMatch[1], version: spaceMatch[2] };
      else entry = { name: val };
    }
    setLibraries((prev) => [...prev, entry]);
    setLibInput('');
  };

  const handleRemoveLibrary = (index: number) => {
    setLibraries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveLibraries = async () => {
    if (!userName || !projectId) return;
    setLibSaving(true);
    try {
      await minisApi.updateProjectLibraries(userName, projectId, libraries);
    } finally {
      setLibSaving(false);
    }
  };

  const handleToggleMinisC = async (enabled: boolean) => {
    if (!userName || !projectId) return;
    setUseMinisC(enabled);
    try {
      await minisApi.updateProjectUseMinisC(userName, projectId, enabled);
    } catch {
      setUseMinisC(!enabled); // revert on error
    }
  };

  const handleSaveReadme = async () => {
    if (!userName || !projectId) return;
    await minisApi.writeProjectReadme(userName, projectId, readmeEditValue);
    setReadmeContent(readmeEditValue);
    setReadmeEditMode(false);
  };

  const handleLoadSketch = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    currentSketchRef.current = sketchName;
    setCodeEdited(false);
    setIsDirty(false);
    codeEditedRef.current = false;
    setCompileOutput('');
    setCompileSuccess(null);
    setCompileOutputOpen(false);

    // Read sketch metadata to know what was last modified
    let lastModified: 'blockly' | 'cpp' = 'blockly';
    try {
      const meta = await minisApi.readSketchFile(userName, projectId, sketchName, `${sketchName}.meta.json`);
      const parsed = JSON.parse(meta) as { lastModified?: string };
      if (parsed.lastModified === 'cpp') lastModified = 'cpp';
    } catch { /* no meta = default blockly */ }

    // Sync sketchLastSource from persisted meta so file highlighting is correct across machines
    setSketchLastSource(prev => {
      const next = new Map(prev);
      next.set(sketchName, lastModified === 'cpp' ? 'code' : 'blockly');
      return next;
    });

    // Suppress workspace change events during the entire load sequence
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

    // Load .ino into code editor, or generate from loaded blockly
    try {
      const inoContent = await minisApi.readSketchFile(userName, projectId, sketchName, `${sketchName}.ino`);
      syncCodeToEditor(inoContent);
      if (lastModified === 'cpp') {
        setCodeEdited(true);
        codeEditedRef.current = true;
      }
    } catch {
      if (serviceRef.current) {
        const code = serviceRef.current.generateArduinoCode();
        syncCodeToEditor(code);
      }
    } finally {
      suppressBlocklyChangeRef.current = false;
    }

    setIsDirty(false);
  };

  const handleToggleSketchExpand = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setExpandedSketches((prev) => {
      const next = new Set(prev);
      if (next.has(sketchName)) { next.delete(sketchName); return next; }
      next.add(sketchName);
      return next;
    });
    if (!sketchFiles.has(sketchName)) {
      const files = await minisApi.listSketchFiles(userName, projectId, sketchName).catch(() => [] as string[]);
      setSketchFiles((prev) => new Map(prev).set(sketchName, files));
    }
  };

  const handleLoadSketchFile = async (sketchName: string, fileName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    currentSketchRef.current = sketchName;
    setCodeEdited(false);
    setIsDirty(false);

    if (fileName.endsWith('.blockly')) {
      suppressBlocklyChangeRef.current = true;
      serviceRef.current?.clearWorkspace();
      try {
        const xml = await minisApi.readSketchFile(userName, projectId, sketchName, fileName);
        if (xml && serviceRef.current) {
          serviceRef.current.loadFromXml(xml);
          syncCodeToEditor(serviceRef.current.generateArduinoCode());
        }
      } catch { /* ignore */ }
      suppressBlocklyChangeRef.current = false;
      // Navigate to blockly view
      if (mode === 'code') {
        const p = new URLSearchParams({ sketch: sketchName });
        if (selectedDeviceName) p.set('device', selectedDeviceName);
        window.location.href = `/user/${userName}/project/${projectId}?${p.toString()}`;
      }
    } else if (fileName.endsWith('.ino')) {
      try {
        const content = await minisApi.readSketchFile(userName, projectId, sketchName, fileName);
        syncCodeToEditor(content);
      } catch { /* ignore */ }
      if (mode === 'blockly') {
        const p = new URLSearchParams({ sketch: sketchName });
        if (selectedDeviceName) p.set('device', selectedDeviceName);
        window.location.href = `/user/${userName}/project/${projectId}/code?${p.toString()}`;
      }
    }
  };

  const handleDeleteSketchFile = async (sketchName: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userName || !projectId) return;
    if (!window.confirm(`Delete ${fileName} from sketch "${sketchName}"?`)) return;
    try {
      await minisApi.deleteSketchFile(userName, projectId, sketchName, fileName);
      setSketchFiles((prev) => {
        const next = new Map(prev);
        next.set(sketchName, (next.get(sketchName) ?? []).filter((f) => f !== fileName));
        return next;
      });
    } catch { /* ignore */ }
  };

  const handleDropOnSketch = async (sketchName: string, dt: DataTransfer) => {
    if (!userName || !projectId) return;
    const files = Array.from(dt.files);
    for (const file of files) {
      const text = await file.text().catch(() => null);
      if (text === null) continue;
      await minisApi.writeSketchFile(userName, projectId, sketchName, file.name, text).catch(() => {});
    }
    const updated = await minisApi.listSketchFiles(userName, projectId, sketchName).catch(() => [] as string[]);
    setSketchFiles((prev) => new Map(prev).set(sketchName, updated));
    setExpandedSketches((prev) => new Set(prev).add(sketchName));
  };

  const handleNewSketch = () => {
    const name = newSketchName.trim();
    if (!name) return;
    setCurrentSketch(name);
    currentSketchRef.current = name;
    if (!sketches.includes(name)) setSketches((prev) => [...prev, name]);
    setNewSketchName('');
  };

  const handleSaveSketch = async () => {
    if (!userName || !projectId || !currentSketch) return;

    const blocklyXml = serviceRef.current?.serializeToXml() ?? '';
    const inoCode = editorRef.current?.getContent() ?? generatedCode;
    const lastModified = codeEditedRef.current ? 'cpp' : 'blockly';
    const meta = JSON.stringify({ lastModified });

    await Promise.all([
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.blockly`, blocklyXml),
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.ino`, inoCode),
      minisApi.writeSketchFile(userName, projectId, currentSketch, `${currentSketch}.meta.json`, meta),
    ]);
    if (!sketches.includes(currentSketch)) setSketches((prev) => [...prev, currentSketch]);
    setCodeEdited(false);
    setIsDirty(false);
  };

  const switchToView = (target: ViewMode) => {
    if (target === viewMode) return;
    if (target === 'code' && mode === 'blockly') {
      handleSaveSketch().then(() => {
        const p = new URLSearchParams({ sketch: currentSketch ?? '' });
        if (selectedDeviceName) p.set('device', selectedDeviceName);
        window.location.href = `/user/${userName}/project/${projectId}/code?${p.toString()}`;
      });
      return;
    }
    if (target === 'blockly' && mode === 'code') {
      handleSaveSketch().then(() => {
        const p = new URLSearchParams({ sketch: currentSketch ?? '' });
        if (selectedDeviceName) p.set('device', selectedDeviceName);
        window.location.href = `/user/${userName}/project/${projectId}?${p.toString()}`;
      });
      return;
    }
    if (showBlockly && target === 'code' && serviceRef.current) {
      savedBlocklyXmlRef.current = serviceRef.current.serializeToXml();
    }
    setViewMode(target);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOpen(false);
    setCodeEdited(false);
    setIsDirty(false);
    if (serviceRef.current) {
      const code = serviceRef.current.generateArduinoCode();
      syncCodeToEditor(code);
    }
  };

  const doCompile = async () => {
    const sk = currentSketchRef.current;
    if (!sk || !userName || !projectId) return;
    setCompiling(true);
    setCompileOutput('');
    setCompileSuccess(null);
    setCompileOutputOpen(true);

    try {
      await handleSaveSketch();
      if (!board) {
        setCompileOutput('Error: No board configured. Set board profile in project settings.');
        setCompileSuccess(false);
        return;
      }
      const fqbn = boardProfiles[board]?.compilerFlag;
      if (!fqbn) {
        setCompileOutput('Error: Unknown board FQBN');
        setCompileSuccess(false);
        return;
      }

      const params = new URLSearchParams({ sketchName: sk, fqbn });
      if (selectedDeviceName) params.set('deviceName', selectedDeviceName);
      const url = `/api/users/${encodeURIComponent(userName)}/project-arduino/${encodeURIComponent(projectId)}/compile?${params}`;

      const resp = await fetch(url, {
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token ?? ''}` },
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text();
        setCompileOutput(text || `HTTP ${resp.status}`);
        setCompileSuccess(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let success = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)\ndata: (.+)$/s);
          if (!eventMatch) continue;
          const [, evType, rawData] = eventMatch;
          try {
            const data = JSON.parse(rawData) as Record<string, unknown>;
            if (evType === 'output') {
              setCompileOutput((prev) => prev + (data.chunk as string));
            } else if (evType === 'done') {
              success = data.success as boolean;
              setCompileSuccess(success);
              if (selectedDeviceName) {
                const buildEntry = { platform: 'arduino', fqbn, at: Date.now(), success, projectId, sketchName: sk };
                setDevices(prev => prev.map(d => d.name === selectedDeviceName ? { ...d, lastBuild: buildEntry } : d));
              }
            }
          } catch { /* ignore malformed events */ }
        }
      }
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
    minWidth: { xs: 'auto' },
    px: { xs: 0.5, sm: 1.5 },
    '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Top AppBar */}
      <AppBar position="static" elevation={1} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => isDirty ? setBackConfirmOpen(true) : navigate(`/user/${userName}/electronics/arduino`)}
            sx={{ mr: 1 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ mr: 2, display: { xs: 'none', md: 'block' } }} noWrap>
            Project
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
            size="small" variant="outlined" color="inherit"
            startIcon={<InsertDriveFile />}
            onClick={() => setExamplesOpen(true)}
            sx={{ ml: 1, ...btnSx(false) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Examples</Box>
          </Button>

          <Button
            size="small" variant={sketchesOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<FolderOpen />}
            onClick={() => setSketchesOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(sketchesOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sketches{currentSketch ? `: ${currentSketch}` : ''}</Box>
          </Button>

          {/* Sync from GitHub */}
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
              onClick={() => switchToView('blockly')}
              sx={btnSx(viewMode === 'blockly')}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Blockly</Box>
            </Button>
            <Button
              variant={viewMode === 'split' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<VerticalSplit />}
              onClick={() => switchToView('split')}
              sx={{ ...btnSx(viewMode === 'split'), display: { xs: 'none', md: 'inline-flex' } }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Split</Box>
            </Button>
            <Button
              variant={viewMode === 'code' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<Code />}
              onClick={() => switchToView('code')}
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
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              ID: {projectId}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Board: {board ? (boardProfiles[board]?.name ?? board) : 'Loading...'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              FQBN: {board ? (boardProfiles[board]?.compilerFlag ?? '—') : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Platform: Arduino
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

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>Libraries</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Enter a GitHub URL or library name (optionally add @version).
            </Typography>

            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField
                size="small"
                placeholder="Name@version or URL"
                value={libInput}
                onChange={(e) => setLibInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddLibrary(); }}
                sx={{ flexGrow: 1, '& .MuiInputBase-input': { fontSize: 12 } }}
                InputProps={{
                  endAdornment: libInput ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setLibInput('')}>
                        <Close sx={{ fontSize: 14 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                }}
              />
              <Tooltip title="Add library">
                <IconButton size="small" onClick={handleAddLibrary}><Add fontSize="small" /></IconButton>
              </Tooltip>
              <Tooltip title="Browse local drive (drive/git/arduino)">
                <IconButton size="small" onClick={() => setLocalLibPickerOpen(true)}>
                  <FolderOpen fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5, minHeight: 24 }}>
              {libraries.map((lib, i) => {
                let label: string;
                if (lib.url?.startsWith('drive://')) {
                  label = `📁 ${lib.url.split('/').pop() ?? lib.url.slice('drive://'.length)}`;
                } else if (lib.url) {
                  label = lib.url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
                } else {
                  label = `${lib.name ?? ''}${lib.version ? `@${lib.version}` : ''}`;
                }
                return (
                  <Chip
                    key={i}
                    label={label}
                    size="small"
                    onDelete={() => handleRemoveLibrary(i)}
                    sx={{ maxWidth: 220, fontSize: 11 }}
                  />
                );
              })}
            </Box>

            <Button
              size="small"
              variant="outlined"
              startIcon={libSaving ? <CircularProgress size={12} /> : <Save fontSize="small" />}
              onClick={handleSaveLibraries}
              disabled={libSaving}
              fullWidth
            >
              Save libraries
            </Button>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>MinisC VM</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Automatically include the MinisC C++ runtime when compiling.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={useMinisC}
                  onChange={(e) => handleToggleMinisC(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Use MinisC VM</Typography>}
            />
          </Box>
        )}

        {/* README panel */}
        {readmeOpen && (
          <Box
            sx={{
              width: readmeExpanded ? '100%' : { xs: '100%', sm: 360 },
              maxWidth: readmeExpanded ? '100%' : { xs: 400, sm: 'none' },
              flexShrink: readmeExpanded ? 1 : 0,
              position: { xs: 'absolute', sm: readmeExpanded ? 'absolute' : 'relative' },
              zIndex: readmeExpanded ? 1200 : { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0, right: readmeExpanded ? 0 : 'auto',
              borderRight: readmeExpanded ? 0 : 1, borderColor: 'divider',
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
                <>
                  <Tooltip title={readmeExpanded ? 'Collapse' : 'Expand'}>
                    <IconButton size="small" onClick={() => setReadmeExpanded((v) => !v)}>
                      {readmeExpanded ? <CloseFullscreen fontSize="small" /> : <OpenInFull fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => { setReadmeEditValue(readmeContent ?? ''); setReadmeEditMode(true); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              {readmeEditMode ? (
                <TextField
                  multiline fullWidth minRows={10}
                  value={readmeEditValue}
                  onChange={(e) => setReadmeEditValue(e.target.value)}
                  variant="outlined" size="small"
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                />
              ) : readmeContent ? (
                <Box sx={{ '& h1,h2,h3': { mt: 1, mb: 0.5 }, '& p': { mt: 0, mb: 1 }, '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto', fontSize: 12 }, '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: 12 }, '& table': { borderCollapse: 'collapse', width: '100%', fontSize: 12, mb: 1 }, '& th,td': { border: 1, borderColor: 'divider', px: 1, py: 0.5 }, '& th': { bgcolor: 'action.hover', fontWeight: 'bold' } }}>
                  <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>{readmeContent}</ReactMarkdown>
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
              {sketches.map((name) => {
                const expanded = expandedSketches.has(name);
                const files = sketchFiles.get(name) ?? [];
                const lastSrc = sketchLastSource.get(name) ?? 'blockly';
                return (
                  <Box key={name}>
                    <ListItemButton
                      selected={currentSketch === name}
                      onClick={() => handleLoadSketch(name)}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(name); }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => { e.preventDefault(); setDropTarget(null); void handleDropOnSketch(name, e.dataTransfer); }}
                      sx={{
                        pr: 0.5,
                        outline: dropTarget === name ? '2px dashed' : 'none',
                        outlineColor: 'primary.main',
                      }}
                    >
                      <ListItemText
                        primary={name}
                        primaryTypographyProps={{ fontSize: 13, noWrap: true }}
                        sx={{ flexGrow: 1, minWidth: 0 }}
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); void handleToggleSketchExpand(name); }}
                        sx={{ ml: 0.5, p: 0.25 }}
                      >
                        {expanded ? <ExpandLess fontSize="inherit" /> : <ExpandMore fontSize="inherit" />}
                      </IconButton>
                    </ListItemButton>
                    <Collapse in={expanded} unmountOnExit>
                      <List dense disablePadding>
                        {files.map((file) => {
                          const isLastEdited =
                            (lastSrc === 'code' && file === `${name}.ino`) ||
                            (lastSrc === 'blockly' && file === `${name}.blockly`);
                          const isOpen = isLastEdited && name === currentSketch;
                          const fileColor = isOpen ? 'error.main' : isLastEdited ? 'primary.main' : 'text.primary';
                          return (
                            <ListItemButton
                              key={file}
                              onClick={() => void handleLoadSketchFile(name, file)}
                              sx={{ pl: 3.5, py: 0.25, pr: 0.5 }}
                            >
                              <InsertDriveFile sx={{ fontSize: 14, mr: 0.75, color: fileColor, flexShrink: 0 }} />
                              <ListItemText
                                primary={file}
                                primaryTypographyProps={{ fontSize: 11, noWrap: true, color: fileColor, fontWeight: isLastEdited ? 600 : 400 }}
                                sx={{ flexGrow: 1, minWidth: 0 }}
                              />
                              <IconButton
                                size="small"
                                onClick={(e) => void handleDeleteSketchFile(name, file, e)}
                                sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                              >
                                <DeleteIcon sx={{ fontSize: 13 }} />
                              </IconButton>
                            </ListItemButton>
                          );
                        })}
                        {files.length === 0 && (
                          <Typography sx={{ pl: 4, py: 0.5, fontSize: 11, color: 'text.disabled' }}>
                            empty
                          </Typography>
                        )}
                      </List>
                    </Collapse>
                  </Box>
                );
              })}
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
          {/* Blockly panel — unmounted in code-only view to free memory */}
          {showBlockly && (
            <Box
              sx={{
                position: 'relative', overflow: 'hidden',
                width: viewMode === 'split' ? `${splitRatio * 100}%` : '100%',
                height: '100%',
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
          )}

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
              sx={{ flexGrow: 1, overflow: 'hidden', minWidth: MIN_PANEL_PX, height: '100%' }}
            />
          )}
        </Box>
      </Box>

      {/* Compile output panel */}
      {/* Build Output — floating panel (consistent with WebSerialTerminal / MpyReplTerminal) */}
      <BuildOutputPanel
        open={compileOutputOpen}
        onClose={() => setCompileOutputOpen(false)}
        output={compileOutput}
        compiling={compiling}
        success={compileSuccess}
      />

      {/* Bottom status bar */}
      <AppBar position="static" elevation={0} color="default" sx={{ borderTop: 1, borderColor: 'divider' }}>
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
            <IconButton size="small" onClick={() => { setFlashOpen(false); setTerminalOpen(true); }}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={
            !selectedDeviceName ? 'Select a device first (Config panel)' :
            !board || !boardProfiles[board]?.flashConfig ? 'Flash not supported for this board' :
            !compileSuccess ? 'Compile the project first' :
            'Flash'
          }>
            <span>
              <IconButton
                size="small"
                disabled={!board || !boardProfiles[board]?.flashConfig || !compileSuccess || !selectedDeviceName}
                onClick={async () => {
                  if (!userName || !projectId || !currentSketch || !board) return;
                  const fc = boardProfiles[board]?.flashConfig;
                  if (!fc) return;
                  const fileName = fc.filePattern.replace('{sketch}', currentSketch);
                  try {
                    const data = await minisApi.fetchOutputBinary(userName, projectId, fileName);
                    setFlashFiles([{ data, address: fc.offset, name: fileName }]);
                    setTerminalOpen(false);
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
          <Tooltip title={!currentSketch ? 'Select a sketch first' : 'Simulate in browser (WebAssembly)'}>
            <span>
              <IconButton
                size="small"
                disabled={!currentSketch}
                onClick={() => setWasmOpen(true)}
                color={wasmOpen ? 'primary' : 'default'}
              >
                <Memory fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {board ? (boardProfiles[board]?.name ?? board) : '—'}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Serial Terminal panel */}
      <WebSerialTerminal open={terminalOpen} onClose={() => setTerminalOpen(false)} />

      {/* WASM simulator */}
      {wasmOpen && userName && projectId && currentSketch && (
        <ArduinoWasmRuntime
          open={wasmOpen}
          onClose={() => setWasmOpen(false)}
          userName={userName}
          projectName={projectId}
          sketchName={currentSketch}
        />
      )}

      {/* Flash Firmware dialog */}
      <FlashDialog
        open={flashOpen}
        onClose={() => { setFlashOpen(false); setFlashFiles(undefined); }}
        initialFiles={flashFiles}
        userName={userName}
        deviceName={selectedDeviceName || undefined}
        fqbn={board ? (boardProfiles[board]?.compilerFlag ?? undefined) : undefined}
        projectId={projectId}
      />

      {/* Back confirmation dialog */}
      <Dialog open={backConfirmOpen} onClose={() => setBackConfirmOpen(false)}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText>You have unsaved changes. Leave without saving?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackConfirmOpen(false)}>Stay</Button>
          <Button color="warning" variant="contained" onClick={() => navigate(`/user/${userName}/electronics/arduino`)}>Leave</Button>
        </DialogActions>
      </Dialog>

      {/* Save before compile dialog */}
      <Dialog open={saveBeforeCompileOpen} onClose={() => setSaveBeforeCompileOpen(false)}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText>You have unsaved code changes. Save and compile?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveBeforeCompileOpen(false)}>Cancel</Button>
          <Button onClick={() => { setSaveBeforeCompileOpen(false); doCompile(); }} variant="contained">
            Save & Compile
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm overwrite dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Overwrite manual changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have manually edited the code. Blockly changes will regenerate the code and overwrite your edits. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmOverwrite} color="warning" variant="contained">Overwrite</Button>
        </DialogActions>
      </Dialog>

      {/* Local drive library picker */}
      <LocalLibPickerDialog
        open={localLibPickerOpen}
        onClose={() => setLocalLibPickerOpen(false)}
        userName={userName ?? ''}
        onSelect={(libs, missing) => {
          setLibraries(prev => [...prev, ...libs]);
          if (missing.length) {
            setMissingDepsMsg(`Dependencies not found on disk: ${missing.join(', ')}`);
          }
        }}
      />

      <Snackbar
        open={!!missingDepsMsg}
        autoHideDuration={8000}
        onClose={() => setMissingDepsMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="warning" onClose={() => setMissingDepsMsg(null)} sx={{ width: '100%' }}>
          {missingDepsMsg}
        </Alert>
      </Snackbar>

      {/* Arduino examples browser */}
      <ExamplesDialog
        open={examplesOpen}
        onClose={() => setExamplesOpen(false)}
        userName={userName ?? ''}
        onOpenExample={(content) => {
          editorRef.current?.setContent(content);
          setCodeEdited(true);
          codeEditedRef.current = true;
          setIsDirty(true);
          setViewMode('code');
          setExamplesOpen(false);
        }}
      />
    </Box>
  );
}

export default ProjectPage;
