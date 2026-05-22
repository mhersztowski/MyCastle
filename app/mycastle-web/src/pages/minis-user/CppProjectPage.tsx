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
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  ChevronRight,
  Delete as DeleteIcon,
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
import { CppIntelliSense } from '@mhersztowski/texteditor';

// ── Language map ──────────────────────────────────────────────────────────────

const EXT_LANG: Record<string, string> = {
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  cmake: 'cmake', txt: 'plaintext',
  md: 'markdown', json: 'json', py: 'python',
};

function langForFile(name: string): string {
  if (name.toLowerCase() === 'cmakelists.txt') return 'cmake';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

function isCppFile(name: string): boolean {
  const lang = langForFile(name);
  return lang === 'cpp' || lang === 'c';
}

// ── File tree ─────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
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

// ── Page ──────────────────────────────────────────────────────────────────────

function CppProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const currentFileRef = useRef<string | null>(null);  // "sketchName/fileName"
  const currentSketchRef = useRef<string | null>(null);
  const contentCacheRef = useRef<Map<string, string>>(new Map());
  const intellisenseRef = useRef<CppIntelliSense | null>(null);

  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchFiles, setSketchFiles] = useState<string[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSketchDialog, setNewSketchDialog] = useState(false);
  const [newSketchName, setNewSketchName] = useState('');
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [deleteFileConfirm, setDeleteFileConfirm] = useState<string | null>(null);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => { currentSketchRef.current = currentSketch; }, [currentSketch]);

  // ── Build IntelliSense readIncludeFile callback ───────────────────────────
  // Reads a header file relative to the current sketch from the REST API.
  const readIncludeFile = useCallback(async (relativePath: string): Promise<string | null> => {
    if (!userName || !projectId || !currentSketchRef.current) return null;
    const cacheKey = `${currentSketchRef.current}/${relativePath}`;
    const cached = contentCacheRef.current.get(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const content = await minisApi.readUpythonSketchFile(userName, projectId, currentSketchRef.current, relativePath);
      contentCacheRef.current.set(cacheKey, content);
      return content;
    } catch {
      return null;
    }
  }, [userName, projectId]);

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
    editor.on('contentChanged', () => {
      setIsDirty(true);
      // Debounced IntelliSense refresh on content change
      const content = editor.getContent();
      intellisenseRef.current?.onFileOpened(content);
    });

    // Create and activate IntelliSense
    const intellisense = new CppIntelliSense(readIncludeFile);
    intellisense.activate();
    intellisenseRef.current = intellisense;

    return () => {
      intellisense.dispose();
      intellisenseRef.current = null;
      editor.dispose();
      editorRef.current = null;
    };
  }, [readIncludeFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load sketches ─────────────────────────────────────────────────────────
  const loadSketches = useCallback(async () => {
    if (!userName || !projectId) return;
    try {
      const list = await minisApi.listUpythonSketches(userName, projectId);
      setSketches(list);
      if (list.length > 0 && !currentSketchRef.current) setCurrentSketch(list[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sketches');
    }
  }, [userName, projectId]);

  useEffect(() => { loadSketches(); }, [loadSketches]);

  // ── Load files for current sketch ─────────────────────────────────────────
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
    currentSketchRef.current = sketch;
    setCurrentFile(fileName);
    setIsDirty(false);
    editorRef.current?.setContent(content);
    editorRef.current?.setLanguage(langForFile(fileName));

    // Trigger immediate IntelliSense parse for C/C++ files
    if (isCppFile(fileName)) {
      intellisenseRef.current?.onFileOpenedImmediate(content);
    }
  }, [userName, projectId]);

  useEffect(() => {
    if (!userName || !projectId || !currentSketch) return;
    contentCacheRef.current.clear();
    setCurrentFile(null);
    currentFileRef.current = null;
    minisApi.listUpythonSketchFiles(userName, projectId, currentSketch)
      .then((files) => {
        setSketchFiles(files);
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

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!userName || !projectId || !currentSketchRef.current || !currentFileRef.current) return;
    const content = editorRef.current?.getContent() ?? '';
    setSaving(true);
    try {
      const fileName = currentFileRef.current.split('/').slice(1).join('/');
      await minisApi.writeUpythonSketchFile(userName, projectId, currentSketchRef.current, fileName, content);
      contentCacheRef.current.set(currentFileRef.current, content);
      setIsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [userName, projectId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // ── New sketch ────────────────────────────────────────────────────────────
  const handleNewSketch = async () => {
    if (!userName || !projectId || !newSketchName.trim()) return;
    const name = newSketchName.trim();
    const starterContent = [
      '#include <iostream>',
      '#include "utils.h"',
      '',
      'int main() {',
      '    std::cout << "Hello, World!" << std::endl;',
      '    return 0;',
      '}',
      '',
    ].join('\n');
    try {
      await minisApi.writeUpythonSketchFile(userName, projectId, name, 'main.cpp', starterContent);
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

  const _token = token; // used only to satisfy auth context dependency

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      {/* AppBar */}
      <AppBar position="static" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <IconButton edge="start" color="inherit" onClick={() => navigate(`/user/${userName}/electronics/cpp`)}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 1 }}>
            {projectId}
          </Typography>

          {sketches.length > 1 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {sketches.map((s) => (
                <Button
                  key={s}
                  size="small"
                  variant={currentSketch === s ? 'contained' : 'outlined'}
                  color="inherit"
                  onClick={() => setCurrentSketch(s)}
                  sx={{ minWidth: 0, px: 1, py: 0, textTransform: 'none', fontSize: 12 }}
                >
                  {s}
                </Button>
              ))}
            </Box>
          )}

          <Tooltip title="New sketch">
            <IconButton color="inherit" size="small" onClick={() => { setNewSketchName(''); setNewSketchDialog(true); }}>
              <Add />
            </IconButton>
          </Tooltip>

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Save (Ctrl+S)">
            <span>
              <IconButton color="inherit" size="small" onClick={handleSave} disabled={!isDirty || saving}>
                {saving ? <CircularProgress size={18} color="inherit" /> : <Save />}
              </IconButton>
            </span>
          </Tooltip>

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
            C++ · {currentSketch ?? '—'}
          </Typography>
        </Box>

        {/* Monaco editor */}
        <Box ref={editorContainerRef} sx={{ flexGrow: 1, overflow: 'hidden' }} />
      </Box>

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
            autoFocus fullWidth label="File name (e.g. utils.h, math.cpp)"
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
          <Button color="error" variant="contained" onClick={() => deleteFileConfirm && handleDeleteFile(deleteFileConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Suppress unused variable warning */}
      {_token && null}
    </Box>
  );
}

export default CppProjectPage;
