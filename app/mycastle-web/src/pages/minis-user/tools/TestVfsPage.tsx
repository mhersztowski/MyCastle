import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
  TextField,
  Alert,
  Chip,
} from '@mui/material';
import {
  CreateNewFolder as CreateNewFolderIcon,
  NoteAdd as NoteAddIcon,
} from '@mui/icons-material';
import { CompositeFS, RemoteFS, encodeText, decodeText } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import { VfsExplorer, defaultProviderRegistry, remoteFsProvider } from '@mhersztowski/web-client';
import { useAuth } from '../../../modules/auth';

export default function TestVfsPage() {
  const { token } = useAuth();

  const [{ cfs, remote }] = useState(() => {
    const cfs = new CompositeFS();
    const remote = new RemoteFS({ baseUrl: '/api/vfs', token: token ?? undefined });
    cfs.mount('/server', remote);
    return { cfs, remote };
  });

  // Keep token in sync
  useEffect(() => {
    remote.setToken(token ?? undefined);
  }, [token, remote]);

  const registry = useMemo(
    () => [remoteFsProvider, ...defaultProviderRegistry],
    [],
  );

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Subscribe to VFS events
  useEffect(() => {
    const disposable = cfs.onDidChangeFile(events => {
      for (const e of events) {
        addLog(`${e.type === 1 ? 'CREATED' : e.type === 2 ? 'CHANGED' : 'DELETED'}: ${e.path}`);
      }
    });
    return () => disposable.dispose();
  }, [cfs, addLog]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const handleFileSelect = useCallback(async (path: string) => {
    setSelectedFile(path);
    try {
      const stat = await cfs.stat(path);
      if (stat.type === 1) { // File
        const data = await cfs.readFile(path);
        setFileContent(decodeText(data));
      } else {
        const entries = await cfs.readDirectory(path);
        setFileContent(`[Directory] ${entries.length} entries:\n${entries.map(e => `  ${e.type === 2 ? '📁' : '📄'} ${e.name}`).join('\n')}`);
      }
    } catch {
      setFileContent(null);
    }
  }, [cfs]);

  const handleFileOpen = useCallback(async (path: string) => {
    setSelectedFile(path);
    try {
      const data = await cfs.readFile(path);
      setFileContent(decodeText(data));
      addLog(`Opened: ${path}`);
    } catch {
      setFileContent(null);
    }
  }, [cfs, addLog]);

  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) return;
    const path = newFileName.startsWith('/') ? newFileName : `/${newFileName}`;
    try {
      await cfs.writeFile!(path, encodeText(newFileContent || ''), { overwrite: true });
      setNewFileName('');
      setNewFileContent('');
      addLog(`Created file: ${path}`);
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [cfs, newFileName, newFileContent, addLog]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFileName.trim()) return;
    const path = newFileName.startsWith('/') ? newFileName : `/${newFileName}`;
    try {
      await cfs.mkdir!(path);
      setNewFileName('');
      addLog(`Created folder: ${path}`);
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [cfs, newFileName, addLog]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        VFS Explorer
        <Chip label="CompositeFS" size="small" color="info" />
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        Server filesystem mounted at /server. Use the mount panel to add more providers (MemoryFS, GitHubFS, Local Directory).
        Right-click for context menu.
      </Alert>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {/* Left: Explorer */}
        <Paper sx={{ flex: '0 0 350px', p: 0, overflow: 'hidden' }}>
          <Box sx={{
            '& .vfs-explorer': {
              '--vfs-bg': 'var(--mui-palette-background-paper, #1e1e1e)',
              '--vfs-text': 'var(--mui-palette-text-primary, #ccc)',
              '--vfs-selected-bg': 'var(--mui-palette-action-selected, #264f78)',
              '--vfs-hover-bg': 'var(--mui-palette-action-hover, rgba(255,255,255,0.04))',
            } as any
          }}>
            <VfsExplorer
              provider={cfs as FileSystemProvider}
              rootPath="/"
              height={500}
              onFileSelect={handleFileSelect}
              onFileOpen={handleFileOpen}
              providerRegistry={registry}
            />
          </Box>
        </Paper>

        {/* Right: Details + Operations */}
        <Box sx={{ flex: 1, minWidth: 300 }}>
          {/* File Preview */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              {selectedFile ? `Preview: ${selectedFile}` : 'Select a file to preview'}
            </Typography>
            <Box
              sx={{
                bgcolor: 'grey.900',
                color: 'grey.300',
                p: 1.5,
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 200,
                overflow: 'auto',
                minHeight: 60,
              }}
            >
              {fileContent ?? 'No content'}
            </Box>
          </Paper>

          {/* Manual Operations */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Manual Operations</Typography>
            <Stack spacing={1.5}>
              <TextField
                size="small"
                label="Path"
                placeholder="/server/data/path/to/file.txt"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label="Content (for files)"
                placeholder="File content..."
                value={newFileContent}
                onChange={e => setNewFileContent(e.target.value)}
                multiline
                rows={2}
                fullWidth
              />
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<NoteAddIcon />}
                  onClick={handleCreateFile}
                  disabled={!newFileName.trim()}
                >
                  Create File
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CreateNewFolderIcon />}
                  onClick={handleCreateFolder}
                  disabled={!newFileName.trim()}
                >
                  Create Folder
                </Button>
              </Stack>
            </Stack>
          </Paper>

          {/* Event Log */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Event Log
              <Chip label={log.length} size="small" variant="outlined" />
              {log.length > 0 && (
                <Button size="small" onClick={() => setLog([])} sx={{ ml: 'auto' }}>
                  Clear
                </Button>
              )}
            </Typography>
            <Box
              sx={{
                bgcolor: 'grey.900',
                color: 'grey.400',
                p: 1,
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: 12,
                maxHeight: 180,
                overflow: 'auto',
                minHeight: 40,
              }}
            >
              {log.length === 0 ? (
                <span style={{ color: '#666' }}>Perform operations to see events...</span>
              ) : (
                log.map((entry, i) => <div key={i}>{entry}</div>)
              )}
              <div ref={logEndRef} />
            </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}
