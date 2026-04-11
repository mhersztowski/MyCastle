import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  Delete as DeleteIcon,
  Download,
  ExpandLess,
  ExpandMore,
  FolderOpen,
  InsertDriveFile,
  MoreVert,
  OpenInNew,
  Refresh,
  Save,
  SmartToy,
  VerticalSplit,
} from '@mui/icons-material';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import { AgentPanel, DEFAULT_AGENT_CONFIG } from '@mhersztowski/web-client';
import { MemoryFS, FileType } from '@mhersztowski/core';
import { PygameBlocklyComponent, type PygameBlocklyService } from '@modules/pygameblockly';
import type { PygameMode } from '@modules/pygameblockly';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';
import { BuildOutputPanel } from '../../components/BuildOutputPanel';
import { useAuth } from '../../modules/auth';

type ViewMode = 'blockly' | 'split' | 'code';
const MIN_PANEL_PX = 200;

function PygameProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, token } = useAuth();

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

  // Sketch file expand/collapse
  const [sketchFiles, setSketchFiles] = useState<Map<string, string[]>>(new Map());
  const [expandedSketches, setExpandedSketches] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // AI Agent
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentFs, setAgentFs] = useState<MemoryFS | null>(null);
  const [agentFsVersion, setAgentFsVersion] = useState(0);
  const [agentApiKey, setAgentApiKey] = useState('');

  useEffect(() => { codeEditedRef.current = codeEdited; }, [codeEdited]);

  // ---- sync agent FS writes back to server ----
  useEffect(() => {
    if (!agentFs || !userName || !projectId) return;

    const syncAll = async () => {
      try {
        const rootEntries = await agentFs.readDirectory('/');
        for (const entry of rootEntries) {
          if (entry.type !== FileType.Directory) continue;
          const sketchName = entry.name;
          let fileEntries: { name: string; type: FileType }[] = [];
          try { fileEntries = await agentFs.readDirectory(`/${sketchName}`); } catch { continue; }
          for (const fileEntry of fileEntries) {
            if (fileEntry.type !== FileType.File) continue;
            const fileName = fileEntry.name;
            if (!fileName.endsWith('.py') && !fileName.endsWith('.blockly')) continue;
            try {
              const data = await agentFs.readFile(`/${sketchName}/${fileName}`);
              const content = new TextDecoder().decode(data);
              await minisApi.writePygameSketchFile(userName, projectId, sketchName, fileName, content);
            } catch { /* ignore */ }
          }
        }
        const list = await minisApi.listPygameSketches(userName, projectId);
        setSketches(list);
      } catch { /* ignore */ }
    };

    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSyncAll = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(syncAll, 1000);
    };

    const sub = agentFs.onDidChangeFile(() => scheduleSyncAll());
    return () => {
      sub.dispose();
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [agentFs, userName, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [viewMode, splitRatio, sketchesOpen, agentOpen]);

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

  // ---- toggle sketch expand ----
  const handleToggleSketchExpand = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setExpandedSketches((prev) => {
      const next = new Set(prev);
      if (next.has(sketchName)) { next.delete(sketchName); return next; }
      next.add(sketchName);
      return next;
    });
    if (!sketchFiles.has(sketchName)) {
      const files = await minisApi.listPygameSketchFiles(userName, projectId, sketchName).catch(() => [] as string[]);
      setSketchFiles((prev) => new Map(prev).set(sketchName, files));
    }
  };

  // ---- load specific sketch file ----
  const handleLoadSketchFile = async (sketchName: string, fileName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    setCodeEdited(false);
    codeEditedRef.current = false;

    if (fileName.endsWith('.blockly')) {
      suppressBlocklyChangeRef.current = true;
      serviceRef.current?.clearWorkspace();
      try {
        const xml = await minisApi.readPygameSketchFile(userName, projectId, sketchName, fileName);
        if (xml && serviceRef.current) {
          serviceRef.current.loadFromXml(xml);
          syncCodeToEditor(serviceRef.current.generateCode());
        }
      } catch { /* ignore */ }
      suppressBlocklyChangeRef.current = false;
      setViewMode('blockly');
    } else if (fileName.endsWith('.py')) {
      try {
        const content = await minisApi.readPygameSketchFile(userName, projectId, sketchName, fileName);
        syncCodeToEditor(content);
      } catch { /* ignore */ }
      setViewMode('code');
    }
  };

  // ---- delete sketch file ----
  const handleDeleteSketchFile = async (sketchName: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userName || !projectId) return;
    if (!window.confirm(`Delete ${fileName} from sketch "${sketchName}"?`)) return;
    try {
      await minisApi.deletePygameSketchFile(userName, projectId, sketchName, fileName);
      setSketchFiles((prev) => {
        const next = new Map(prev);
        next.set(sketchName, (next.get(sketchName) ?? []).filter((f) => f !== fileName));
        return next;
      });
    } catch { /* ignore */ }
  };

  // ---- drag & drop files onto sketch ----
  const handleDropOnSketch = async (sketchName: string, dt: DataTransfer) => {
    if (!userName || !projectId) return;
    const files = Array.from(dt.files);
    for (const file of files) {
      const text = await file.text().catch(() => null);
      if (text === null) continue;
      await minisApi.writePygameSketchFile(userName, projectId, sketchName, file.name, text).catch(() => {});
    }
    const updated = await minisApi.listPygameSketchFiles(userName, projectId, sketchName).catch(() => [] as string[]);
    setSketchFiles((prev) => new Map(prev).set(sketchName, updated));
    setExpandedSketches((prev) => new Set(prev).add(sketchName));
  };

  // ---- run in browser (pygbag build) ----
  const handleRunInBrowser = useCallback(async () => {
    if (!userName || !projectId || !currentSketch) return;
    setBuilding(true);
    setBuildOutput('');
    setBuildSuccess(null);
    setBuildPanelOpen(true);
    try {
      // Use editor content if manually edited, otherwise regenerate from Blockly in web mode
      const service = serviceRef.current;
      let webCode = editorRef.current?.getContent() ?? generatedCode;
      if (service && !codeEditedRef.current) {
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

  // ---- open AI agent ----
  const handleOpenAgent = useCallback(async () => {
    const code = editorRef.current?.getContent() ?? generatedCode;
    const xml = serviceRef.current?.serializeToXml() ?? '';
    const sketchName = currentSketch ?? 'sketch';

    const apiKey = await minisApi.getAnthropicKey().catch(() => '');

    const memFs = new MemoryFS();
    const enc = new TextEncoder();

    const claudeMd = [
      '# Pygame Project',
      '',
      'This is a Pygame / pygbag project. The file system contains sketch directories.',
      '',
      '## File system structure',
      '```',
      '/{sketchName}/          ← sketch directory (one per sketch)',
      '  {sketchName}.py       ← main Python/Pygame code file',
      '  {sketchName}.blockly  ← optional Blockly XML (do not edit manually)',
      '```',
      '',
      `## Current sketch: \`${sketchName}\``,
      `The active sketch is at \`/${sketchName}/${sketchName}.py\`.`,
      '',
      '## Rules',
      '- To create a new sketch called `foo`: create directory `/foo/` and file `/foo/foo.py`.',
      '- The main code file MUST have the same name as its parent directory (e.g. `/foo/foo.py`).',
      '- Never place `.py` files directly at the root `/` — they must be inside a sketch directory.',
      '- Do not create files outside of sketch directories.',
      '- For pygbag (web) compatibility use `async def main()` + `asyncio.run(main())`.',
    ].join('\n');
    await memFs.writeFile('/CLAUDE.md', enc.encode(claudeMd), { create: true, overwrite: true });

    const allSketches = await minisApi.listPygameSketches(userName!, projectId!).catch(() => [] as string[]);
    for (const sName of allSketches) {
      await memFs.mkdir(`/${sName}`);
      const files = await minisApi.listPygameSketchFiles(userName!, projectId!, sName).catch(() => [] as string[]);
      for (const fileName of files) {
        if (sName === sketchName && (fileName === `${sketchName}.py` || fileName === `${sketchName}.blockly`)) continue;
        const content = await minisApi.readPygameSketchFile(userName!, projectId!, sName, fileName).catch(() => null);
        if (content !== null) await memFs.writeFile(`/${sName}/${fileName}`, enc.encode(content), { create: true, overwrite: true });
      }
    }

    if (!allSketches.includes(sketchName)) await memFs.mkdir(`/${sketchName}`);
    await memFs.writeFile(`/${sketchName}/${sketchName}.py`, enc.encode(code), { create: true, overwrite: true });
    if (xml) {
      await memFs.writeFile(`/${sketchName}/${sketchName}.blockly`, enc.encode(xml), { create: true, overwrite: true });
    }

    setAgentApiKey(apiKey);
    setAgentFs(memFs);
    setAgentFsVersion((v) => v + 1);
    setAgentOpen(true);
  }, [generatedCode, currentSketch]);

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
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: '#1e1e1e' }}>
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

          {isAdmin && (
            <Tooltip title="AI Agent">
              <IconButton
                size="small" color="inherit"
                onClick={() => { if (agentOpen) { setAgentOpen(false); } else { void handleOpenAgent(); } }}
                sx={{ bgcolor: agentOpen ? 'action.selected' : undefined }}
              >
                <SmartToy fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

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
        {/* AI Agent panel */}
        {isAdmin && agentOpen && agentFs && (
          <Box sx={{
            width: 380, flexShrink: 0, bgcolor: '#1e1e1e',
            borderRight: '1px solid #3e3e42',
            display: 'flex', flexDirection: 'column',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 1, pt: 1, pb: 0.5, borderBottom: '1px solid #3e3e42' }}>
              <SmartToy sx={{ fontSize: 16, color: '#ccc', mr: 0.5 }} />
              <Typography variant="caption" sx={{ color: '#ccc', flex: 1 }}>AI Agent</Typography>
              <IconButton size="small" onClick={() => setAgentOpen(false)} sx={{ color: '#ccc' }}><Close fontSize="small" /></IconButton>
            </Box>
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <AgentPanel
                key={agentFsVersion}
                provider={agentFs}
                providerVersion={agentFsVersion}
                webFetchUrl="/api/web-fetch"
                authToken={token ?? undefined}
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
          </Box>
        )}

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
              {sketches.map((s) => {
                const expanded = expandedSketches.has(s);
                const files = sketchFiles.get(s) ?? [];
                return (
                  <Box key={s}>
                    <ListItemButton
                      selected={currentSketch === s}
                      onClick={() => {
                        if (codeEditedRef.current) { setConfirmOpen(true); return; }
                        handleLoadSketch(s);
                      }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(s); }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => { e.preventDefault(); setDropTarget(null); void handleDropOnSketch(s, e.dataTransfer); }}
                      sx={{
                        py: 0.5, px: 1, pr: 0.5,
                        outline: dropTarget === s ? '2px dashed' : 'none',
                        outlineColor: '#0e639c',
                      }}
                    >
                      <ListItemText primary={s} primaryTypographyProps={{ fontSize: 12, color: '#ccc', noWrap: true }} sx={{ flexGrow: 1, minWidth: 0 }} />
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); void handleToggleSketchExpand(s); }}
                        sx={{ color: '#ccc', p: 0.25 }}
                      >
                        {expanded ? <ExpandLess fontSize="inherit" /> : <ExpandMore fontSize="inherit" />}
                      </IconButton>
                    </ListItemButton>
                    <Collapse in={expanded} unmountOnExit>
                      <List dense disablePadding>
                        {files.map((file) => (
                          <ListItemButton
                            key={file}
                            onClick={() => void handleLoadSketchFile(s, file)}
                            sx={{ pl: 3, py: 0.25, pr: 0.5 }}
                          >
                            <InsertDriveFile sx={{ fontSize: 13, mr: 0.5, color: '#888', flexShrink: 0 }} />
                            <ListItemText
                              primary={file}
                              primaryTypographyProps={{ fontSize: 11, color: '#aaa', noWrap: true }}
                              sx={{ flexGrow: 1, minWidth: 0 }}
                            />
                            <IconButton
                              size="small"
                              onClick={(e) => void handleDeleteSketchFile(s, file, e)}
                              sx={{ p: 0.25, opacity: 0.5, color: '#ccc', '&:hover': { opacity: 1, color: '#f44' } }}
                            >
                              <DeleteIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          </ListItemButton>
                        ))}
                        {files.length === 0 && (
                          <Typography sx={{ pl: 3.5, py: 0.5, fontSize: 11, color: '#666' }}>empty</Typography>
                        )}
                      </List>
                    </Collapse>
                  </Box>
                );
              })}
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
