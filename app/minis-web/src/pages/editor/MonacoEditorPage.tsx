import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Alert, IconButton, Toolbar, Typography } from '@mui/material';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useMqtt } from '@modules/mqttclient';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@modules/editor/core/EditorInstance';
import { CommandRegistry, KeyMod, KeyCode, createKeybinding } from '@modules/editor/core/CommandRegistry';
import { EditorStateManager, LocalStorageStateStorage } from '@modules/editor/state/EditorStateManager';
import { StatusBar } from '@modules/editor/ui/StatusBar';

const languageMap: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  html: 'html',
  css: 'css',
  md: 'markdown',
  cpp: 'cpp',
  h: 'cpp',
  c: 'c',
  py: 'python',
};

function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop() || '';
  return languageMap[extension] || 'plaintext';
}

function MonacoEditorPage() {
  const { '*': filePath } = useParams();
  const navigate = useNavigate();
  const { isConnected, readFile, writeFile } = useMqtt();

  const editorInstanceRef = useRef<EditorInstance | null>(null);
  const commandRegistryRef = useRef<CommandRegistry | null>(null);
  const stateManagerRef = useRef<EditorStateManager | null>(null);
  const statusBarRef = useRef<StatusBar | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const statusBarContainerRef = useRef<HTMLDivElement>(null);

  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modified, setModified] = useState(false);
  const [fileLoaded, setFileLoaded] = useState(false);

  // Load file content when connected
  useEffect(() => {
    if (!isConnected || !filePath) return;

    setLoading(true);
    setError(null);

    readFile(filePath)
      .then((file) => {
        setContent(file.content || '');
        setFileLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isConnected, filePath, readFile]);

  // Initialize editor module components after file is loaded
  useEffect(() => {
    if (!fileLoaded || !containerRef.current || !statusBarContainerRef.current) return;

    const language = getLanguageFromPath(filePath || '');

    const editorInstance = EditorInstance.create(containerRef.current, {
      value: content,
      language,
      theme: 'vs',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      wordWrap: 'on',
    });

    const commandRegistry = new CommandRegistry();

    const stateManager = new EditorStateManager();
    stateManager.setStorage(new LocalStorageStateStorage());
    stateManager.createAutosave(editorInstance.getId(), () => editorInstance.getState());

    const statusBar = new StatusBar(statusBarContainerRef.current);
    statusBar.createItem({ id: 'language', alignment: 'right', text: language });
    const cursorItem = statusBar.createItem({ id: 'cursor', alignment: 'right', text: 'Ln 1, Col 1' });

    editorInstance.on('contentChanged', () => {
      setModified(true);
    });

    editorInstance.on('cursorPositionChanged', (pos) => {
      cursorItem.text = `Ln ${pos.lineNumber}, Col ${pos.column}`;
    });

    editorInstanceRef.current = editorInstance;
    commandRegistryRef.current = commandRegistry;
    stateManagerRef.current = stateManager;
    statusBarRef.current = statusBar;

    return () => {
      statusBar.dispose();
      stateManager.dispose();
      commandRegistry.dispose();
      editorInstance.dispose();
      editorInstanceRef.current = null;
      commandRegistryRef.current = null;
      stateManagerRef.current = null;
      statusBarRef.current = null;
    };
  }, [fileLoaded, content, filePath]);

  const handleSave = useCallback(async () => {
    if (!isConnected || !filePath || !editorInstanceRef.current) return;

    setSaving(true);
    setError(null);

    try {
      const currentContent = editorInstanceRef.current.getContent();
      await writeFile(filePath, currentContent);
      setModified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [isConnected, filePath, writeFile]);

  // Register Ctrl+S command via CommandRegistry
  useEffect(() => {
    const commandRegistry = commandRegistryRef.current;
    const editorInstance = editorInstanceRef.current;
    if (!commandRegistry || !editorInstance) return;

    const disposable = commandRegistry.registerCommand(
      {
        id: 'minis.save',
        label: 'Save File',
        keybinding: createKeybinding(KeyMod.CtrlCmd, KeyCode.KeyS),
      },
      () => handleSave()
    );

    return () => disposable.dispose();
  }, [handleSave, fileLoaded]);

  if (!filePath) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography color="text.secondary">
          No file specified. Use /user/editor/monaco/path/to/file
        </Typography>
      </Box>
    );
  }

  if (!isConnected || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar
        variant="dense"
        sx={{ backgroundColor: 'background.paper', borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
      >
        <IconButton size="small" onClick={() => navigate(-1)} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="body2" sx={{ flex: 1 }} noWrap>
          {filePath}
          {modified && ' *'}
        </Typography>
        <IconButton size="small" onClick={handleSave} disabled={saving || !modified}>
          <SaveIcon />
        </IconButton>
      </Toolbar>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box ref={containerRef} sx={{ flex: 1 }} />
      <Box ref={statusBarContainerRef} />
    </Box>
  );
}

export default MonacoEditorPage;
