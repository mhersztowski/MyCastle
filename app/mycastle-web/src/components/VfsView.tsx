import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Box, Button, Chip, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, Dialog, AppBar, Toolbar, Typography, useMediaQuery, useTheme, Snackbar, Alert, LinearProgress } from '@mui/material';
import { Add as AddIcon, Storage as StorageIcon, Code as CodeIcon, Close as CloseIcon, Save as SaveIcon, ArrowBack as ArrowBackIcon, SmartToy as SmartToyIcon, CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { CompositeFS, RemoteFS, GitHubFS, encodeText, decodeText } from '@mhersztowski/core';
import type { FileSystemProvider, FileSystemCapabilities, FileStat, DirectoryEntry, VfsEvent, FileChangeEvent, WriteFileOptions, DeleteOptions, RenameOptions } from '@mhersztowski/core';
import MonacoEditor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';

/** Wraps a provider and prefixes all path operations with a fixed base path. */
class SubpathFS implements FileSystemProvider {
  readonly scheme: string;
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]>;
  constructor(private readonly inner: FileSystemProvider, private readonly prefix: string) {
    this.scheme = inner.scheme;
    this.onDidChangeFile = inner.onDidChangeFile;
  }
  get capabilities(): FileSystemCapabilities { return this.inner.capabilities; }
  private p(path: string): string { return path === '/' ? this.prefix : this.prefix + path; }
  stat(path: string): Promise<FileStat> { return this.inner.stat(this.p(path)); }
  readDirectory(path: string): Promise<DirectoryEntry[]> { return this.inner.readDirectory(this.p(path)); }
  readFile(path: string): Promise<Uint8Array> { return this.inner.readFile(this.p(path)); }
  writeFile(path: string, content: Uint8Array, opts?: WriteFileOptions) { return this.inner.writeFile!(this.p(path), content, opts); }
  mkdir(path: string) { return this.inner.mkdir!(this.p(path)); }
  delete(path: string, opts?: DeleteOptions) { return this.inner.delete!(this.p(path), opts); }
  rename(o: string, n: string, opts?: RenameOptions) { return this.inner.rename!(this.p(o), this.p(n), opts); }
}

import { VfsExplorer, defaultProviderRegistry, remoteFsProvider, AgentPanel, ChatSessionViewer } from '@mhersztowski/web-client';
import type { ChatSession } from '@mhersztowski/web-client';
import { useAuth } from '../modules/auth';
import { useGlobalWindows } from './GlobalWindowsContext';

interface PresetMount {
  id: string;
  label: string;
  mountPath: string;
}

const PRESET_MOUNTS: PresetMount[] = [
  { id: 'admin',         label: 'Admin',         mountPath: '/admin' },
  { id: 'mycastle',      label: 'MyCastle',      mountPath: '/mycastle' },
  { id: 'minisprojects', label: 'MinisProjects', mountPath: '/minisprojects' },
];

interface EditorTab {
  path: string;
  content: string;
  isDirty: boolean;
  tabType?: 'code' | 'chat';
  chatSession?: ChatSession;
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html',
    py: 'python', sh: 'shell', bash: 'shell', yaml: 'yaml', yml: 'yaml',
    cpp: 'cpp', c: 'c', h: 'cpp', hpp: 'cpp', rs: 'rust', go: 'go',
    xml: 'xml', sql: 'sql', toml: 'ini',
  };
  return map[ext] ?? 'plaintext';
}

export function VfsView() {
  const { token, isAdmin, currentUser } = useAuth();
  const { getParams } = useGlobalWindows();

  const [{ cfs, remote }] = useState(() => {
    const cfs = new CompositeFS();
    const remote = new RemoteFS({ baseUrl: '/api/vfs' });
    return { cfs, remote };
  });

  // Synchronous token update — must happen before any child effects fire
  remote.setToken(token ?? undefined);

  const registry = useMemo(
    () => [remoteFsProvider, ...defaultProviderRegistry],
    [],
  );

  const [mountVersion, setMountVersion] = useState(0);
  const [activeMounts, setActiveMounts] = useState<PresetMount[]>([]);
  const [mountMenuAnchor, setMountMenuAnchor] = useState<HTMLElement | null>(null);
  const homeMountedRef = useRef(false);

  // Auto-mount user's home directory once token and user are available
  useEffect(() => {
    if (!currentUser || !token || homeMountedRef.current) return;
    homeMountedRef.current = true;
    cfs.mount('/home', new SubpathFS(remote, `/data/Minis/Users/${currentUser.name}`));
    setMountVersion(v => v + 1);
  }, [currentUser, token, cfs, remote]);

  // Auto-mount device VFS when opened via openWithParams('vfs', ...)
  const deviceParams = getParams('vfs');
  const prevDeviceMountRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deviceParams) return;
    // Unmount previous device mount if path changed
    if (prevDeviceMountRef.current && prevDeviceMountRef.current !== deviceParams.mountPath) {
      try { cfs.unmount(prevDeviceMountRef.current); } catch { /* ignore */ }
    }
    cfs.mount(deviceParams.mountPath, deviceParams.provider);
    prevDeviceMountRef.current = deviceParams.mountPath;
    setActiveMounts(prev => {
      const filtered = prev.filter(m => m.id !== '__device__');
      return [...filtered, { id: '__device__', label: deviceParams.label, mountPath: deviceParams.mountPath }];
    });
    setMountVersion(v => v + 1);
  }, [deviceParams, cfs]);

  /* ── Preset mounts ── */

  const handleMount = useCallback((preset: PresetMount) => {
    setMountMenuAnchor(null);
    let provider: FileSystemProvider;
    if (preset.id === 'admin') {
      provider = new SubpathFS(
        new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined }),
        '/data/Minis/Admin',
      );
    } else if (preset.id === 'mycastle') {
      provider = new GitHubFS({ owner: 'mhersztowski', repo: 'MyCastle' });
    } else {
      provider = new GitHubFS({ owner: 'mhersztowski', repo: 'MinisProjects' });
    }
    cfs.mount(preset.mountPath, provider);
    setActiveMounts(prev => [...prev, preset]);
    setMountVersion(v => v + 1);
  }, [cfs, token]);

  const handleUnmount = useCallback((preset: PresetMount) => {
    cfs.unmount(preset.mountPath);
    setActiveMounts(prev => prev.filter(m => m.id !== preset.id));
    setMountVersion(v => v + 1);
  }, [cfs]);

  const availablePresets = PRESET_MOUNTS.filter(p => {
    if (p.id === 'admin' && !isAdmin) return false;
    return !activeMounts.some(m => m.id === p.id);
  });

  /* ── Editor tabs ── */

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [mobileAgentOpen, setMobileAgentOpen] = useState(false);
  const [opLoading, setOpLoading] = useState(false);

  /* ── Drag-and-drop upload ── */
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const dropTargetPathRef = useRef('/');

  const uploadEntry = useCallback(async (entry: FileSystemEntry, basePath: string): Promise<number> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      const data = await file.arrayBuffer();
      await cfs.writeFile!(`${basePath}/${entry.name}`, new Uint8Array(data), { overwrite: true });
      return 1;
    }
    if (entry.isDirectory) {
      const dirPath = `${basePath}/${entry.name}`;
      try { await cfs.mkdir!(dirPath); } catch { /* already exists */ }
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      let count = 0;
      for (const child of children) count += await uploadEntry(child, dirPath);
      return count;
    }
    return 0;
  }, [cfs]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const items = Array.from(e.dataTransfer.items).filter(i => i.kind === 'file');
    if (!items.length) return;
    const entries = items.map(i => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[];
    const total = entries.length;
    setUploadProgress({ done: 0, total });
    let done = 0;
    let totalFiles = 0;
    try {
      for (const entry of entries) {
        totalFiles += await uploadEntry(entry, dropTargetPathRef.current);
        done++;
        setUploadProgress({ done, total });
      }
      setMountVersion(v => v + 1);
      setSnackbar({ message: `Uploaded ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`, severity: 'success' });
    } catch (err) {
      setSnackbar({ message: err instanceof Error ? err.message : 'Upload failed', severity: 'error' });
    } finally {
      setUploadProgress(null);
    }
  }, [uploadEntry]);
  const activeTab = tabs.find(t => t.path === activeTabPath);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleFileOpen = useCallback(async (path: string) => {
    // Focus existing tab if already open
    if (tabs.some(t => t.path === path)) {
      setActiveTabPath(path);
      if (isMobile) setMobileEditorOpen(true);
      return;
    }
    setOpLoading(true);
    try {
      const data = await cfs.readFile(path);
      const content = decodeText(data);
      // Detect chat session files
      if (path.endsWith('.chat.json')) {
        try {
          const session = JSON.parse(content) as ChatSession;
          if (session.type === 'chat_session') {
            setTabs(prev => [...prev, { path, content, isDirty: false, tabType: 'chat', chatSession: session }]);
            setActiveTabPath(path);
            if (isMobile) setMobileEditorOpen(true);
            return;
          }
        } catch { /* fall through to normal code tab */ }
      }
      setTabs(prev => [...prev, { path, content, isDirty: false }]);
      setActiveTabPath(path);
      if (isMobile) setMobileEditorOpen(true);
    } catch {
      // Binary or unreadable — skip silently
    } finally {
      setOpLoading(false);
    }
  }, [cfs, tabs, isMobile]);

  const closeTab = useCallback((path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs(prev => {
      const idx = prev.findIndex(t => t.path === path);
      const next = prev.filter(t => t.path !== path);
      if (activeTabPath === path) {
        setActiveTabPath(next[Math.max(0, idx - 1)]?.path ?? next[0]?.path ?? null);
      }
      return next;
    });
  }, [activeTabPath]);

  const handleSave = useCallback(async () => {
    if (!activeTabPath || !editorRef.current) return;
    const content = editorRef.current.getValue();
    setOpLoading(true);
    try {
      await cfs.writeFile!(activeTabPath, encodeText(content), { overwrite: true });
      setTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content, isDirty: false } : t));
    } catch {
      // ignore
    } finally {
      setOpLoading(false);
    }
  }, [activeTabPath, cfs]);

  // Stable ref so the Monaco keybinding always calls the latest handleSave
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleEditorMount = useCallback((
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => {
    editorRef.current = editor;
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => handleSaveRef.current(),
    );
  }, []);

  const handleEditorChange = useCallback(() => {
    setTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, isDirty: true } : t));
  }, [activeTabPath]);

  const renderTabBar = () => (
    <Box sx={{
      display: 'flex',
      alignItems: 'stretch',
      overflowX: 'auto',
      flexShrink: 0,
      bgcolor: '#1e1e1e',
      borderBottom: '1px solid #333',
      '&::-webkit-scrollbar': { height: 3 },
      '&::-webkit-scrollbar-thumb': { bgcolor: '#555' },
    }}>
      {tabs.map(tab => {
        const name = tab.path.split('/').pop() ?? tab.path;
        const isActive = tab.path === activeTabPath;
        return (
          <Box
            key={tab.path}
            onClick={() => setActiveTabPath(tab.path)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              cursor: 'pointer',
              flexShrink: 0,
              maxWidth: 200,
              minWidth: 80,
              bgcolor: isActive ? '#1e1e1e' : '#2d2d2d',
              borderRight: '1px solid #333',
              borderTop: isActive ? '1px solid #007fd4' : '1px solid transparent',
              color: isActive ? '#fff' : '#aaa',
              fontSize: 12,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              '&:hover': { bgcolor: '#252525', color: '#fff' },
              userSelect: 'none',
            }}
          >
            {tab.isDirty && (
              <Box component="span" sx={{ color: '#e2c08d', fontSize: 16, lineHeight: 1, mt: '-1px' }}>●</Box>
            )}
            <Tooltip title={tab.path} placement="bottom" enterDelay={800}>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {name}
              </Box>
            </Tooltip>
            <IconButton
              size="small"
              onClick={e => closeTab(tab.path, e)}
              sx={{ p: 0.25, color: 'inherit', opacity: 0.6, '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.1)' }, flexShrink: 0 }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );

  const renderEditor = () => (
    <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: '#1e1e1e', height: '100%' }}>
      {activeTab?.tabType === 'chat' && activeTab.chatSession ? (
        <ChatSessionViewer session={activeTab.chatSession} onFileClick={handleFileOpen} />
      ) : activeTab ? (
        <MonacoEditor
          key={activeTabPath}
          defaultValue={activeTab.content}
          language={getLanguage(activeTabPath ?? '')}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 13, fontFamily: 'monospace' }}>
          Double-click a file to open it
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', flexDirection: 'column' }}>
      {/* Mount toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0, flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={e => setMountMenuAnchor(e.currentTarget)}
          disabled={availablePresets.length === 0}
          sx={{ fontSize: 12, py: 0.25 }}
        >
          Mount
        </Button>
        {activeMounts.map(m => (
          <Chip
            key={m.id}
            label={m.label}
            size="small"
            onDelete={() => handleUnmount(m)}
            sx={{ fontSize: 11 }}
          />
        ))}
        <Menu
          anchorEl={mountMenuAnchor}
          open={Boolean(mountMenuAnchor)}
          onClose={() => setMountMenuAnchor(null)}
        >
          {availablePresets.map(preset => (
            <MenuItem key={preset.id} onClick={() => handleMount(preset)}>
              <ListItemIcon>
                {preset.id === 'admin'
                  ? <StorageIcon fontSize="small" />
                  : <CodeIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{preset.label}</ListItemText>
            </MenuItem>
          ))}
        </Menu>
        {isMobile && (
          <IconButton size="small" onClick={() => setMobileAgentOpen(true)} sx={{ ml: 'auto' }}>
            <SmartToyIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {opLoading && <LinearProgress sx={{ height: 2, flexShrink: 0 }} />}

      {/* Main content row */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* VFS Explorer — full width on mobile, fixed 240px on desktop */}
        <Box
          sx={{
            position: 'relative',
            width: isMobile ? '100%' : 240,
            flexShrink: 0,
            overflow: 'hidden',
            borderRight: isMobile ? 0 : 1,
            borderColor: 'divider',
          }}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <VfsExplorer
            key={`${token ? 'authed' : 'anon'}-${mountVersion}`}
            provider={cfs as FileSystemProvider}
            rootPath="/"
            height="100%"
            onFileOpen={handleFileOpen}
            providerRegistry={registry}
            onDirectoryChange={path => { dropTargetPathRef.current = path; }}
            onMountsChanged={() => setMountVersion(v => v + 1)}
          />
          {/* Drag-over overlay */}
          {isDragOver && (
            <Box sx={{
              position: 'absolute', inset: 0, zIndex: 10,
              bgcolor: 'action.hover', border: '2px dashed', borderColor: 'primary.main',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <CloudUploadIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="caption" color="primary">Drop to upload</Typography>
            </Box>
          )}
          {/* Upload progress bar */}
          {uploadProgress && (
            <LinearProgress
              variant="determinate"
              value={(uploadProgress.done / uploadProgress.total) * 100}
              sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
            />
          )}
        </Box>

        {/* Desktop editor panel */}
        {!isMobile && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {renderTabBar()}
            {renderEditor()}
          </Box>
        )}

        {/* Desktop agent panel */}
        {!isMobile && (
          <Box sx={{ width: 320, flexShrink: 0, borderLeft: 1, borderColor: 'divider', overflow: 'hidden' }}>
            <AgentPanel
              provider={cfs as FileSystemProvider}
              onFileOpen={handleFileOpen}
              providerVersion={mountVersion}
            />
          </Box>
        )}
      </Box>

      {/* Mobile agent dialog */}
      {isMobile && (
        <Dialog
          fullScreen
          open={mobileAgentOpen}
          onClose={() => setMobileAgentOpen(false)}
          sx={{ '& .MuiDialog-paper': { display: 'flex', flexDirection: 'column' } }}
        >
          <AppBar position="static" sx={{ bgcolor: '#2d2d2d', boxShadow: 'none', borderBottom: '1px solid #444', flexShrink: 0, pt: 'env(safe-area-inset-top)' }}>
            <Toolbar variant="dense" sx={{ gap: 1, minHeight: 48 }}>
              <IconButton edge="start" color="inherit" onClick={() => setMobileAgentOpen(false)} size="small">
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="body2" sx={{ flex: 1, fontSize: 13, fontWeight: 600 }}>AI Agent</Typography>
            </Toolbar>
          </AppBar>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <AgentPanel
              provider={cfs as FileSystemProvider}
              onFileOpen={(path) => { setMobileAgentOpen(false); handleFileOpen(path); }}
              providerVersion={mountVersion}
            />
          </Box>
        </Dialog>
      )}

      {/* Mobile fullscreen editor dialog */}
      {isMobile && (
        <Dialog
          fullScreen
          open={mobileEditorOpen}
          onClose={() => setMobileEditorOpen(false)}
          sx={{ '& .MuiDialog-paper': { bgcolor: '#1e1e1e', display: 'flex', flexDirection: 'column' } }}
        >
          {/* Dialog AppBar */}
          <AppBar position="static" sx={{ bgcolor: '#2d2d2d', boxShadow: 'none', borderBottom: '1px solid #444', flexShrink: 0, pt: 'env(safe-area-inset-top)' }}>
            <Toolbar variant="dense" sx={{ gap: 1, minHeight: 48 }}>
              <IconButton edge="start" color="inherit" onClick={() => setMobileEditorOpen(false)} size="small">
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="body2" noWrap sx={{ flex: 1, fontSize: 13 }}>
                {activeTabPath ? (activeTabPath.split('/').pop() ?? activeTabPath) : 'Editor'}
                {activeTab?.isDirty && ' ●'}
              </Typography>
              <IconButton
                color="inherit"
                size="small"
                onClick={handleSave}
                disabled={!activeTab?.isDirty}
              >
                <SaveIcon fontSize="small" />
              </IconButton>
            </Toolbar>
          </AppBar>

          {/* Tab bar inside dialog */}
          {renderTabBar()}

          {/* Editor */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {renderEditor()}
          </Box>
        </Dialog>
      )}
      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
