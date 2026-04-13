import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  Build,
  ChevronRight,
  Delete as DeleteIcon,
  Download,
  Folder,
  FolderOpen,
  InsertDriveFile,
  Save,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import { minisApi } from '../../services/MinisApiService';
import { useAuth } from '../../modules/auth';
import { AccountMenu } from '../../components/AccountMenu';
import { BuildOutputPanel } from '../../components/BuildOutputPanel';

const PICO_BOARDS: Record<string, { name: string }> = {
  pico:    { name: 'Pico (RP2040)' },
  pico_w:  { name: 'Pico W (RP2040+WiFi)' },
  pico2:   { name: 'Pico 2 (RP2350)' },
  pico2_w: { name: 'Pico 2 W (RP2350+WiFi)' },
};
const DEFAULT_BOARD = 'pico2';

const EDITOR_LANGUAGE: Record<string, string> = {
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cmake: 'cmake',
  txt: 'plaintext',
  md: 'markdown',
  json: 'json',
  py: 'python',
};

// ── File tree ─────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;       // full relative path (e.g. "src/main.c")
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split('/');
    let nodes = root;
    let accumulated = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      const isLast = i === parts.length - 1;

      let node = nodes.find((n) => n.name === part);
      if (!node) {
        node = { name: part, path: accumulated, isDir: !isLast, children: [] };
        nodes.push(node);
      }
      nodes = node.children;
    }
  }

  // Sort: dirs first, then files, both alphabetically
  const sortNodes = (ns: TreeNode[]) => {
    ns.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    ns.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

interface FileTreeProps {
  nodes: TreeNode[];
  depth: number;
  selectedFile: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
}

function FileTreeNodes({ nodes, depth, selectedFile, expandedDirs, onToggleDir, onSelectFile, onDeleteFile }: FileTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        const indent = depth * 12;
        if (node.isDir) {
          const expanded = expandedDirs.has(node.path);
          return (
            <Box key={node.path}>
              <ListItemButton
                dense
                onClick={() => onToggleDir(node.path)}
                sx={{ pl: `${8 + indent}px`, pr: 0.5, py: 0.25 }}
              >
                <ChevronRight
                  fontSize="small"
                  sx={{
                    mr: 0.25, flexShrink: 0, color: 'text.secondary', fontSize: 14,
                    transform: expanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                />
                {expanded
                  ? <FolderOpen fontSize="small" sx={{ mr: 0.5, color: 'warning.light', flexShrink: 0, fontSize: 16 }} />
                  : <Folder fontSize="small" sx={{ mr: 0.5, color: 'warning.light', flexShrink: 0, fontSize: 16 }} />
                }
                <ListItemText
                  primary={node.name}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true, fontWeight: 500 }}
                />
              </ListItemButton>
              {expanded && (
                <FileTreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  selectedFile={selectedFile}
                  expandedDirs={expandedDirs}
                  onToggleDir={onToggleDir}
                  onSelectFile={onSelectFile}
                  onDeleteFile={onDeleteFile}
                />
              )}
            </Box>
          );
        }
        return (
          <ListItemButton
            key={node.path}
            dense
            selected={selectedFile === node.path}
            onClick={() => onSelectFile(node.path)}
            sx={{ pl: `${8 + indent}px`, pr: 0.5, py: 0.25 }}
          >
            <InsertDriveFile fontSize="small" sx={{ mr: 0.5, color: 'text.secondary', flexShrink: 0, fontSize: 16 }} />
            <ListItemText
              primary={node.name}
              primaryTypographyProps={{ variant: 'body2', noWrap: true }}
            />
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onDeleteFile(node.path); }}
              sx={{ opacity: 0, '.MuiListItemButton-root:hover &': { opacity: 0.5 }, '&:hover': { opacity: 1 } }}
            >
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </ListItemButton>
        );
      })}
    </>
  );
}

function langForFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (name.toLowerCase() === 'cmakelists.txt') return 'cmake';
  return EDITOR_LANGUAGE[ext] ?? 'plaintext';
}

function PicoSdkProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const currentFileRef = useRef<string | null>(null);
  const contentCacheRef = useRef<Map<string, string>>(new Map());

  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchFiles, setSketchFiles] = useState<string[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newSketchDialog, setNewSketchDialog] = useState(false);
  const [newSketchName, setNewSketchName] = useState('');
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [deleteFileConfirm, setDeleteFileConfirm] = useState<string | null>(null);

  const [boardKey, setBoardKey] = useState<string>(() =>
    projectId ? (localStorage.getItem(`picosdk_board_${projectId}`) ?? DEFAULT_BOARD) : DEFAULT_BOARD
  );

  const [building, setBuilding] = useState(false);
  const [buildOutput, setBuildOutput] = useState('');
  const [buildSuccess, setBuildSuccess] = useState<boolean | null>(null);
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  const [uf2Url, setUf2Url] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  // ── Editor setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorContainerRef.current) return;
    const editor = EditorInstance.create(editorContainerRef.current, {
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      automaticLayout: true,
    });
    editorRef.current = editor;
    editor.on('contentChanged', () => setIsDirty(true));
    return () => { editor.dispose(); editorRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load sketches ─────────────────────────────────────────────────────────
  const loadSketches = useCallback(async () => {
    if (!userName || !projectId) return;
    try {
      const list = await minisApi.listUpythonSketches(userName, projectId);
      setSketches(list);
      if (list.length > 0 && !currentSketch) setCurrentSketch(list[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sketches');
    }
  }, [userName, projectId, currentSketch]);

  useEffect(() => { loadSketches(); }, [loadSketches]);

  // ── Load files for current sketch ─────────────────────────────────────────
  useEffect(() => {
    if (!userName || !projectId || !currentSketch) return;
    contentCacheRef.current.clear();
    setCurrentFile(null);
    currentFileRef.current = null;
    minisApi.listUpythonSketchFiles(userName, projectId, currentSketch)
      .then((files) => {
        setSketchFiles(files);
        // Auto-expand all directories found in file paths
        const dirs = new Set<string>();
        for (const f of files) {
          const parts = f.split('/');
          for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
        }
        setExpandedDirs(dirs);
        if (files.length > 0) openFile(currentSketch, files[0]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load files'));
  }, [currentSketch]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFile = useCallback(async (sketch: string, fileName: string) => {
    if (!userName || !projectId) return;
    const cacheKey = `${sketch}/${fileName}`;
    let content = contentCacheRef.current.get(cacheKey);
    if (content === undefined) {
      try {
        content = await minisApi.readUpythonSketchFile(userName, projectId, sketch, fileName);
        contentCacheRef.current.set(cacheKey, content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read file');
        return;
      }
    }
    currentFileRef.current = cacheKey;
    setCurrentFile(fileName);
    setIsDirty(false);
    editorRef.current?.setContent(content);
    editorRef.current?.setLanguage(langForFile(fileName));
  }, [userName, projectId]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!userName || !projectId || !currentSketch || !currentFileRef.current) return;
    const content = editorRef.current?.getContent() ?? '';
    setSaving(true);
    try {
      const fileName = currentFileRef.current.split('/').slice(1).join('/');
      await minisApi.writeUpythonSketchFile(userName, projectId, currentSketch, fileName, content);
      contentCacheRef.current.set(currentFileRef.current, content);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [userName, projectId, currentSketch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // ── Build (SSE streaming) ──────────────────────────────────────────────────
  const handleBuild = async () => {
    if (!userName || !projectId || !currentSketch) return;
    if (isDirty) await handleSave();
    setBuilding(true);
    setBuildOutput('');
    setBuildSuccess(null);
    setUf2Url(null);
    setBuildPanelOpen(true);

    const authToken = token ?? '';
    const params = new URLSearchParams({ sketchName: currentSketch, boardKey });
    const url = `/api/users/${encodeURIComponent(userName)}/project-upython/${encodeURIComponent(projectId)}/build-pico?${params}`;

    try {
      const resp = await fetch(url, {
        headers: { Accept: 'text/event-stream', Authorization: `Bearer ${authToken}` },
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text();
        setBuildOutput(text);
        setBuildSuccess(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE events
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)\ndata: (.+)$/s);
          if (!eventMatch) continue;
          const [, evType, rawData] = eventMatch;
          try {
            const data = JSON.parse(rawData);
            if (evType === 'output') {
              setBuildOutput((prev) => prev + (data.chunk as string));
            } else if (evType === 'done') {
              setBuildSuccess(data.success as boolean);
              if (data.uf2Url) setUf2Url(data.uf2Url as string);
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err) {
      setBuildOutput(err instanceof Error ? err.message : 'Build failed');
      setBuildSuccess(false);
    } finally {
      setBuilding(false);
    }
  };

  // ── Download UF2 (with auth header) ──────────────────────────────────────
  const handleDownloadUf2 = async () => {
    if (!uf2Url || !token) return;
    try {
      const resp = await fetch(uf2Url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) { setError(`Download failed: ${resp.status}`); return; }
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${projectId}.uf2`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  // ── New sketch ────────────────────────────────────────────────────────────
  const handleNewSketch = async () => {
    if (!userName || !projectId || !newSketchName.trim()) return;
    const name = newSketchName.trim();
    try {
      await minisApi.writeUpythonSketchFile(userName, projectId, name, 'main.c', '// Pico SDK project\n#include "pico/stdlib.h"\n\nint main() {\n    stdio_init_all();\n    while (true) {\n        // your code\n    }\n}\n');
      setNewSketchDialog(false);
      setNewSketchName('');
      setSketches((prev) => [...prev, name]);
      setCurrentSketch(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sketch');
    }
  };

  // ── New file ──────────────────────────────────────────────────────────────
  const handleNewFile = async () => {
    if (!userName || !projectId || !currentSketch || !newFileName.trim()) return;
    const name = newFileName.trim();
    try {
      await minisApi.writeUpythonSketchFile(userName, projectId, currentSketch, name, '');
      setNewFileDialog(false);
      setNewFileName('');
      setSketchFiles((prev) => [...prev, name]);
      openFile(currentSketch, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create file');
    }
  };

  // ── Delete file ───────────────────────────────────────────────────────────
  const handleDeleteFile = async (fileName: string) => {
    if (!userName || !projectId || !currentSketch) return;
    try {
      await minisApi.deleteUpythonSketchFile(userName, projectId, currentSketch, fileName);
      setDeleteFileConfirm(null);
      setSketchFiles((prev) => prev.filter((f) => f !== fileName));
      if (currentFile === fileName) {
        setCurrentFile(null);
        currentFileRef.current = null;
        editorRef.current?.setContent('');
        editorRef.current?.setLanguage('plaintext');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar position="static" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <IconButton edge="start" color="inherit" onClick={() => navigate(`/user/${userName}/electronics/picosdk`)}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 1 }}>
            {projectId}
          </Typography>

          {/* Sketch selector */}
          {sketches.length > 0 && (
            <Select
              size="small" value={currentSketch ?? ''}
              onChange={(e) => setCurrentSketch(e.target.value)}
              sx={{ minWidth: 140, color: 'inherit', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' }, '& .MuiSvgIcon-root': { color: 'inherit' } }}
            >
              {sketches.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          )}
          <Tooltip title="New sketch">
            <IconButton color="inherit" size="small" onClick={() => { setNewSketchName(''); setNewSketchDialog(true); }}>
              <Add />
            </IconButton>
          </Tooltip>

          <Select
            size="small" value={boardKey}
            onChange={(e) => {
              setBoardKey(e.target.value);
              if (projectId) localStorage.setItem(`picosdk_board_${projectId}`, e.target.value);
              setBuildSuccess(null);
              setUf2Url(null);
            }}
            sx={{ minWidth: 160, color: 'inherit', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.4)' }, '& .MuiSvgIcon-root': { color: 'inherit' } }}
          >
            {Object.entries(PICO_BOARDS).map(([key, b]) => (
              <MenuItem key={key} value={key}>{b.name}</MenuItem>
            ))}
          </Select>

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Save (Ctrl+S)">
            <span>
              <IconButton color="inherit" size="small" onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? <CircularProgress size={18} color="inherit" /> : <Save />}
              </IconButton>
            </span>
          </Tooltip>

          <Button
            variant="contained"
            color={buildSuccess === false ? 'error' : buildSuccess === true ? 'success' : 'secondary'}
            size="small"
            startIcon={building ? <CircularProgress size={16} color="inherit" /> : <Build />}
            onClick={handleBuild}
            disabled={building || !currentSketch}
          >
            Build
          </Button>

          {uf2Url && (
            <Tooltip title="Download UF2">
              <Button
                variant="outlined" color="inherit" size="small"
                startIcon={<Download />}
                onClick={handleDownloadUf2}
              >
                UF2
              </Button>
            </Tooltip>
          )}

          <AccountMenu />
        </Toolbar>
      </AppBar>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 1, mt: 0.5 }}>
          {error}
        </Alert>
      )}

      {/* Body */}
      <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        {/* File sidebar */}
        <Box sx={{
          width: 200, flexShrink: 0, borderRight: 1, borderColor: 'divider',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Files
            </Typography>
            <Tooltip title="New file">
              <IconButton size="small" onClick={() => { setNewFileName(''); setNewFileDialog(true); }} disabled={!currentSketch}>
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <List dense disablePadding sx={{ flexGrow: 1, overflowY: 'auto' }}>
            <FileTreeNodes
              nodes={buildTree(sketchFiles)}
              depth={0}
              selectedFile={currentFile}
              expandedDirs={expandedDirs}
              onToggleDir={(p) => setExpandedDirs((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p); else next.add(p);
                return next;
              })}
              onSelectFile={(p) => currentSketch && openFile(currentSketch, p)}
              onDeleteFile={(p) => setDeleteFileConfirm(p)}
            />
            {currentSketch && sketchFiles.length === 0 && (
              <Typography variant="caption" sx={{ p: 1, color: 'text.secondary', display: 'block' }}>
                No files
              </Typography>
            )}
          </List>
          <Divider />
          <Typography variant="caption" sx={{ p: 1, color: 'text.secondary' }}>
            {PICO_BOARDS[boardKey]?.name ?? boardKey}
          </Typography>
        </Box>

        {/* Monaco editor */}
        <Box ref={editorContainerRef} sx={{ flexGrow: 1, overflow: 'hidden' }} />
      </Box>

      {/* Build output panel */}
      <BuildOutputPanel
        open={buildPanelOpen}
        onClose={() => setBuildPanelOpen(false)}
        output={buildOutput}
        compiling={building}
        success={buildSuccess}
      />

      {/* New sketch dialog */}
      <Dialog open={newSketchDialog} onClose={() => setNewSketchDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Sketch</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            autoFocus fullWidth label="Sketch Name" value={newSketchName}
            onChange={(e) => setNewSketchName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNewSketch(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewSketchDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleNewSketch} disabled={!newSketchName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* New file dialog */}
      <Dialog open={newFileDialog} onClose={() => setNewFileDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New File</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            autoFocus fullWidth label="File Name (e.g. main.c, CMakeLists.txt)"
            value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNewFile(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFileDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleNewFile} disabled={!newFileName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete file confirmation */}
      <Dialog open={!!deleteFileConfirm} onClose={() => setDeleteFileConfirm(null)}>
        <DialogTitle>Delete File?</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteFileConfirm}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteFileConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteFileConfirm && handleDeleteFile(deleteFileConfirm)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default PicoSdkProjectPage;
