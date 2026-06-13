/**
 * Help browser for the Automate Script fullscreen editor.
 *
 * Left pane:  a (lazily expanded) filesystem tree rooted at the user's
 *             `drive/public/doc/` directory — folders expand on click, Markdown
 *             files are selectable.
 * Right pane: a Markdown viewer rendering whichever `.md` file is clicked on
 *             the left.
 *
 * Reads go straight through the REST VFS (`/api/users/{u}/vfs/*`) — no MQTT, no
 * preloaded tree — so the help works the moment the backend HTTP layer is alive.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton,
  Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const ACCENT = '#4caf50';
const DOC_ROOT = 'drive/public/doc';

export interface AutomateHelpBrowserDialogProps {
  open: boolean;
  onClose: () => void;
  userName: string;
}

// VFS entry types as returned by the backend readdir endpoint.
const FILE = 1;
const DIR = 2;

interface TreeNode {
  name: string;
  /** Path relative to the user root, e.g. `drive/public/doc/guide/intro.md`. */
  path: string;
  type: 'file' | 'dir';
  /** Lazily loaded children — undefined = not loaded yet. */
  children?: TreeNode[];
  loading?: boolean;
}

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);

/** List a directory (relative to the user root) → sorted child nodes. */
async function readDir(userName: string, relPath: string): Promise<TreeNode[]> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readdir`, window.location.origin);
  u.searchParams.set('path', `/data/Minis/Users/${userName}/${relPath}/`);
  const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
  if (!r.ok) return [];
  const j = await r.json() as { entries?: Array<{ name: string; type: number }> };
  const entries = j.entries ?? [];
  const dirs = entries
    .filter((e) => e.type === DIR)
    .map<TreeNode>((e) => ({ name: e.name, path: `${relPath}/${e.name}`, type: 'dir' }));
  const files = entries
    .filter((e) => e.type === FILE && isMarkdown(e.name))
    .map<TreeNode>((e) => ({ name: e.name, path: `${relPath}/${e.name}`, type: 'file' }));
  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name);
  return [...dirs.sort(byName), ...files.sort(byName)];
}

/** Read a text file (relative to the user root) → UTF-8 string. */
async function readText(userName: string, relPath: string): Promise<string> {
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readFile`, window.location.origin);
  u.searchParams.set('path', `/data/Minis/Users/${userName}/${relPath}`);
  const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json() as { data?: string };
  if (!j.data) return '';
  const binary = atob(j.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const AutomateHelpBrowserDialog: React.FC<AutomateHelpBrowserDialogProps> = ({ open, onClose, userName }) => {
  // Phone/tablet: show one pane at a time (tree → tap file → viewer with a back
  // button). Two narrow side-by-side columns are unusable on small screens.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [roots, setRoots] = useState<TreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [docLoading, setDocLoading] = useState(false);

  // Load the doc-root listing once when the dialog opens.
  useEffect(() => {
    if (!open || !userName) return;
    let cancelled = false;
    setRoots(null);
    setTreeError(null);
    setExpanded(new Set());
    setSelected(null);
    setMarkdown('');
    readDir(userName, DOC_ROOT)
      .then((nodes) => { if (!cancelled) setRoots(nodes); })
      .catch(() => { if (!cancelled) setTreeError('Nie udało się wczytać katalogu pomocy.'); });
    return () => { cancelled = true; };
  }, [open, userName]);

  // Recursively patch a node's children into the tree by path.
  const setChildren = useCallback((path: string, children: TreeNode[]) => {
    const patch = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => {
      if (n.path === path) return { ...n, children, loading: false };
      if (n.type === 'dir' && n.children) return { ...n, children: patch(n.children) };
      return n;
    });
    setRoots((prev) => (prev ? patch(prev) : prev));
  }, []);

  const setLoading = useCallback((path: string, loading: boolean) => {
    const patch = (nodes: TreeNode[]): TreeNode[] => nodes.map((n) => {
      if (n.path === path) return { ...n, loading };
      if (n.type === 'dir' && n.children) return { ...n, children: patch(n.children) };
      return n;
    });
    setRoots((prev) => (prev ? patch(prev) : prev));
  }, []);

  const findNode = useCallback((nodes: TreeNode[] | null, path: string): TreeNode | undefined => {
    if (!nodes) return undefined;
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.type === 'dir' && n.children) {
        const hit = findNode(n.children, path);
        if (hit) return hit;
      }
    }
    return undefined;
  }, []);

  const toggleDir = useCallback(async (node: TreeNode) => {
    const next = new Set(expanded);
    if (next.has(node.path)) {
      next.delete(node.path);
      setExpanded(next);
      return;
    }
    next.add(node.path);
    setExpanded(next);
    // Lazy-load children the first time the folder is opened.
    const current = findNode(roots, node.path);
    if (current && current.children === undefined && !current.loading) {
      setLoading(node.path, true);
      try {
        const children = await readDir(userName, node.path);
        setChildren(node.path, children);
      } catch {
        setChildren(node.path, []);
      }
    }
  }, [expanded, findNode, roots, setChildren, setLoading, userName]);

  const openFile = useCallback(async (node: TreeNode) => {
    setSelected(node.path);
    setDocLoading(true);
    try {
      const text = await readText(userName, node.path);
      setMarkdown(text);
    } catch {
      setMarkdown(`> ⚠️ Nie udało się wczytać pliku **${node.name}**.`);
    } finally {
      setDocLoading(false);
    }
  }, [userName]);

  // Tighter indentation + smaller icons/text on phones/tablets so file names
  // stay readable in the narrow tree column.
  const step = isMobile ? 0.75 : 1.5;
  const basePad = isMobile ? 0.5 : 1;
  const iconSize = isMobile ? '1rem' : undefined;

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode => nodes.map((node) => {
    const isOpen = expanded.has(node.path);
    const isSel = selected === node.path;
    return (
      <React.Fragment key={node.path}>
        <Box
          onClick={() => (node.type === 'dir' ? void toggleDir(node) : void openFile(node))}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? 0.4 : 0.75,
            pl: basePad + depth * step,
            pr: 0.5,
            py: 0.5,
            cursor: 'pointer',
            userSelect: 'none',
            borderRadius: 1,
            bgcolor: isSel ? 'rgba(76,175,80,0.18)' : 'transparent',
            '&:hover': { bgcolor: isSel ? 'rgba(76,175,80,0.24)' : 'action.hover' },
          }}
        >
          {node.type === 'dir'
            ? (isOpen ? <FolderOpenIcon sx={{ color: '#ffb74d', fontSize: iconSize, flexShrink: 0 }} fontSize="small" />
              : <FolderIcon sx={{ color: '#ffb74d', fontSize: iconSize, flexShrink: 0 }} fontSize="small" />)
            : <DescriptionIcon sx={{ color: ACCENT, fontSize: iconSize, flexShrink: 0 }} fontSize="small" />}
          <Typography
            variant="body2"
            sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: isMobile ? '0.78rem' : undefined, fontWeight: isSel ? 600 : 400 }}
          >
            {node.name}
          </Typography>
          {node.loading && <CircularProgress size={12} sx={{ flexShrink: 0 }} />}
        </Box>
        {node.type === 'dir' && isOpen && node.children && node.children.length > 0
          && renderNodes(node.children, depth + 1)}
        {node.type === 'dir' && isOpen && node.children && node.children.length === 0 && (
          <Typography variant="caption" sx={{ pl: basePad + (depth + 1) * step, color: 'text.disabled', display: 'block', py: 0.25 }}>
            (pusty)
          </Typography>
        )}
      </React.Fragment>
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{ sx: isMobile ? undefined : { height: '85vh' } }}
    >
      <DialogTitle sx={{ py: 1.25, pr: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <HelpOutlineIcon sx={{ color: ACCENT }} />
          <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Pomoc — {DOC_ROOT}
          </Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, display: 'flex', minHeight: 0 }}>
        {/* Left: filesystem tree — kept narrow on phones/tablets so the markdown
            viewer keeps most of the width (both panes stay visible, no extra taps). */}
        <Box sx={{
          width: { xs: 116, sm: 200, md: 300 },
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          overflow: 'auto',
          py: 1,
        }}>
          {roots === null && !treeError && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          )}
          {treeError && (
            <Typography variant="body2" color="error" sx={{ px: 2, py: 1 }}>{treeError}</Typography>
          )}
          {roots && roots.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
              Brak plików w {DOC_ROOT}.
            </Typography>
          )}
          {roots && roots.length > 0 && renderNodes(roots, 0)}
        </Box>

        {/* Right: markdown viewer — takes the remaining width beside the tree. */}
        <Box sx={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          position: 'relative',
        }}>
          {docLoading && (
            <Box sx={{ position: 'absolute', top: 8, right: 12 }}><CircularProgress size={18} /></Box>
          )}
          {!selected ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
              <Typography variant="body2">Wybierz plik z drzewka po lewej.</Typography>
            </Box>
          ) : (
            <Box
              sx={{
                px: 3, py: 2,
                '& h1': { fontSize: '1.5rem', mt: 0, mb: 1.5, fontWeight: 700 },
                '& h2': { fontSize: '1.2rem', mt: 3, mb: 1, fontWeight: 700, color: ACCENT },
                '& h3': { fontSize: '1rem', mt: 2, mb: 0.75, fontWeight: 600 },
                '& h4': { fontSize: '0.9rem', mt: 1.5, mb: 0.5, fontWeight: 600 },
                '& p': { my: 1, lineHeight: 1.6 },
                '& ul, & ol': { my: 1, pl: 3 },
                '& li': { my: 0.25 },
                '& code': {
                  bgcolor: 'rgba(76,175,80,0.12)', color: '#2e7d32',
                  px: 0.5, py: 0.1, borderRadius: 0.5, fontSize: '0.85em',
                  fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
                },
                '& pre': {
                  bgcolor: '#0e2912', color: '#d7ffdd', p: 1.5, borderRadius: 1,
                  overflow: 'auto', fontSize: '0.85em', lineHeight: 1.5, my: 1.5,
                  '& code': { bgcolor: 'transparent', color: 'inherit', p: 0, fontSize: 'inherit' },
                },
                '& table': { borderCollapse: 'collapse', my: 1.5, fontSize: '0.85em', width: '100%' },
                '& th, & td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, textAlign: 'left' },
                '& th': { bgcolor: 'action.hover', fontWeight: 600 },
                '& blockquote': {
                  borderLeft: '3px solid', borderLeftColor: ACCENT, pl: 1.5, my: 1.5,
                  color: 'text.secondary', fontStyle: 'italic',
                },
                '& a': { color: ACCENT, textDecoration: 'underline' },
                '& img': { maxWidth: '100%' },
                '& hr': { my: 2, border: 'none', borderTop: '1px solid', borderColor: 'divider' },
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {markdown}
              </ReactMarkdown>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default AutomateHelpBrowserDialog;
