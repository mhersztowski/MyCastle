import { useState, useRef, useCallback, useEffect, memo, type ComponentType } from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import type { FileSystemProvider } from '@mhersztowski/core';
import { decodeText, encodeText, FileType } from '@mhersztowski/core';

import { VfsExplorer } from '../vfs/VfsExplorer';
import type { VfsProviderDef } from '../vfs/providerRegistry';
import type { OutputLine } from '../vfs/project/types';
import { EditorInstance } from './core/EditorInstance';
import { ModelManager } from './core/ModelManager';
import { KeyMod, KeyCode } from './core/CommandRegistry';
import type { DocumentUri } from './utils/types';
import { createDocumentUri } from './utils/types';
import { AgentPanel } from './agent/ui/AgentPanel';
import type { AgentConfig } from './agent/types';
import { BottomPanel } from './BottomPanel';
import type { BottomTab } from './BottomPanel';
import * as monaco from 'monaco-editor';
import type { IPlugin, ContextMenuContribution, CommandPaletteContribution } from './plugins/types';
import {
  globalPluginRegistry,
  globalCommandRegistry,
  globalEventBus,
  useToolbarItems,
  useStatusBarPluginItems,
  useSidebarContributions,
  useContextMenuContributions,
  useCommandPaletteContributions,
  usePlugins,
} from './plugins';

/* ── Types ── */

export interface MonacoMultiEditorProps {
  provider: FileSystemProvider;
  height?: number | string;
  readOnly?: boolean;
  providerRegistry?: VfsProviderDef[];
  onFileSave?: (path: string, content: Uint8Array) => void | Promise<void>;
  /** Plugin instances to activate when the editor mounts. */
  plugins?: IPlugin[];
  enableAgent?: boolean;
  defaultAgentConfig?: Partial<AgentConfig>;
  /** Extra context injected into agent system prompt (workspace structure, user info, etc.). */
  agentClaudeMd?: string;
  /** Auth token forwarded to the agent for authenticated web-fetch calls. */
  agentAuthToken?: string;
  /** Base URL for agent web-fetch proxy endpoint (e.g. '/api/web-fetch'). */
  agentWebFetchUrl?: string;
  enableTerminal?: boolean;
  terminalWsUrl?: string;
  terminalToken?: string;
  /** Called when the user clicks the configure button in the terminal header. */
  onTerminalConfigRequest?: () => void;
  /** Passed through to VfsExplorer so project action buttons can make authenticated API calls. */
  projectDeps?: import('../vfs/project/types').ProjectDeps;
  /** Passed through to VfsExplorer — called when a project action with hasDialog=true is clicked. */
  onDialogAction?: import('../vfs/types').VfsExplorerProps['onDialogAction'];
  /** Built-in mount presets always shown in the VFS mount manager (cannot be deleted by user). */
  defaultMountPresets?: import('../vfs/vfsMountPresets').VfsMountPreset[];
}

interface TabInfo {
  path: string;
  label: string;
  modified: boolean;
  uri: DocumentUri;
  /** When set, the tab renders a React component instead of Monaco (no VFS backing). */
  virtual?: { component: ComponentType };
}

interface EditorGroup {
  id: string;
  tabs: TabInfo[];
  activeTab: string | null;
  /** Flex size weight (default 1). Adjusted by group splitters. */
  size: number;
}

// Built-in panels + any string id contributed by a plugin
type SidebarPanel = 'explorer' | 'search' | 'extensions' | string | null;

/* ── Search types ── */

interface SearchMatch {
  line: number;
  col: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

interface FileSearchResult {
  path: string;
  matches: SearchMatch[];
  collapsed: boolean;
}

/* ── Language map ── */

const extensionToLanguage: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  json: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', mdx: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp', ino: 'cpp',
  sh: 'shell', bash: 'shell',
  yml: 'yaml', yaml: 'yaml',
  xml: 'xml', svg: 'xml',
  sql: 'sql',
  dockerfile: 'dockerfile',
  txt: 'plaintext',
};

function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop() ?? '';
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return extensionToLanguage[ext] ?? 'plaintext';
}

function fileLabel(path: string): string {
  return path.split('/').pop() ?? path;
}

let nextGroupId = 1;
function makeGroupId() { return `g${nextGroupId++}`; }

/* ── SVG Icons ── */

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ display: 'block' }}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <rect x="1" y="2" width="14" height="12" rx="1" stroke="#ccc" strokeWidth="1.2" />
      <line x1="8" y1="2" x2="8" y2="14" stroke="#ccc" strokeWidth="1.2" />
    </svg>
  );
}

function ExplorerIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path d="M3 4h7l2 2h9v13H3V4z" stroke={active ? '#fff' : '#858585'} strokeWidth="1.5" fill="none" />
      <path d="M3 9h18" stroke={active ? '#fff' : '#858585'} strokeWidth="1.2" />
    </svg>
  );
}

function SearchIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <circle cx="10.5" cy="10.5" r="5.5" stroke={active ? '#fff' : '#858585'} strokeWidth="1.5" />
      <path d="M14.5 14.5L19 19" stroke={active ? '#fff' : '#858585'} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExtensionsIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <rect x="4" y="10" width="6" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
      <rect x="10" y="4" width="6" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
      <rect x="10" y="10" width="6" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
      <rect x="16" y="10" width="4" height="6" rx="1" stroke={active ? '#fff' : '#858585'} strokeWidth="1.3" />
    </svg>
  );
}

function SearchInputIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <circle cx="10.5" cy="10.5" r="5.5" stroke="#858585" strokeWidth="1.5" />
      <path d="M14.5 14.5L19 19" stroke="#858585" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AgentIcon({ active }: { active?: boolean }) {
  const c = active ? '#fff' : '#858585';
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <path d="M12 2L14 8L20 8L15 12L17 18L12 14L7 18L9 12L4 8L10 8Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function TerminalIcon({ active }: { active?: boolean }) {
  const c = active ? '#fff' : '#858585';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d="M2 3l5 5-5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 13h6" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ── Go to File Dialog ── */

interface GoToFileDialogProps {
  open: boolean;
  files: string[];
  loading: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

function GoToFileDialog({ open, files, loading, onClose, onSelect }: GoToFileDialogProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = (() => {
    if (!query.trim()) return files.slice(0, 60);
    const q = query.toLowerCase();
    return files.filter(f => {
      const name = f.split('/').pop()?.toLowerCase() ?? '';
      return name.includes(q) || f.toLowerCase().includes(q);
    }).slice(0, 60);
  })();

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', pt: '8vh' }}>
      {/* Backdrop */}
      <Box onClick={onClose} sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.45)' }} />
      <Box sx={{
        position: 'relative',
        width: 580,
        maxWidth: '92vw',
        bgcolor: '#252526',
        border: '1px solid #454545',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      }}>
        {/* Input row */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.75, borderBottom: '1px solid #3c3c3c', gap: 1 }}>
          <SearchInputIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && filtered.length > 0) { e.preventDefault(); onSelect(filtered[activeIdx]); }
            }}
            placeholder="Go to file..."
            style={{ flexGrow: 1, background: 'transparent', border: 'none', outline: 'none', color: '#ccc', fontSize: 14, fontFamily: 'inherit' }}
          />
          {loading && <CircularProgress size={14} sx={{ color: '#858585', flexShrink: 0 }} />}
          <Typography component="span" sx={{ fontSize: 11, color: '#606060', flexShrink: 0 }}>
            {filtered.length} / {files.length}
          </Typography>
        </Box>
        {/* Results */}
        <Box ref={listRef} sx={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {filtered.map((path, idx) => (
            <Box
              key={path}
              onClick={() => onSelect(path)}
              sx={{
                px: 2, py: 0.75, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 0.125,
                bgcolor: idx === activeIdx ? '#2a2d2e' : 'transparent',
                '&:hover': { bgcolor: '#2a2d2e' },
              }}
            >
              <Typography sx={{ fontSize: 13, color: '#ccc', fontWeight: idx === activeIdx ? 500 : 400 }}>
                {path.split('/').pop()}
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#606060' }}>{path}</Typography>
            </Box>
          ))}
          {filtered.length === 0 && !loading && (
            <Box sx={{ px: 2, py: 2, color: '#606060', fontSize: 13, textAlign: 'center' }}>
              No files found
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

/* ── Constants ── */

const MIN_PANEL_PX = 180;
const ACTIVITY_BAR_W = 48;
const MENU_BAR_H = 30;
const STATUS_BAR_H = 22;

/* ── VFS search helpers ── */

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','ico','bmp','webp','svg',
  'bin','exe','dll','so','wasm','pdf','zip','tar','gz','7z',
  'mp3','mp4','webm','wav','ogg','ttf','woff','woff2','eot',
]);
const SKIP_DIRS = new Set([
  '.git','node_modules','__pycache__','.venv','venv',
  'dist','build','.next','.cache','coverage','.turbo',
]);

async function walkVfsForSearch(
  provider: FileSystemProvider,
  dirPath: string,
  regex: RegExp,
  results: FileSearchResult[],
): Promise<void> {
  let entries: { name: string; type: FileType }[];
  try { entries = await provider.readDirectory(dirPath); }
  catch { return; }

  for (const { name, type: fileType } of entries) {
    const full = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
    if (fileType === FileType.Directory) {
      if (!SKIP_DIRS.has(name)) await walkVfsForSearch(provider, full, regex, results);
    } else {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (BINARY_EXTS.has(ext)) continue;
      try {
        const text = decodeText(await provider.readFile(full));
        const lines = text.split('\n');
        const matches: SearchMatch[] = [];
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const re = new RegExp(regex.source, regex.flags.replace('g', '') + 'g');
          let m: RegExpExecArray | null;
          while ((m = re.exec(lineText)) !== null) {
            matches.push({ line: i + 1, col: m.index + 1, lineText, matchStart: m.index, matchEnd: m.index + m[0].length });
          }
        }
        if (matches.length > 0) results.push({ path: full, matches, collapsed: false });
      } catch { /* skip unreadable */ }
    }
  }
}


/* ── Kbd shortcut label ── */

function Kbd({ children }: { children: string }) {
  return (
    <Typography component="span" sx={{ color: '#6e6e6e', fontSize: 12, ml: 'auto', pl: 3, whiteSpace: 'nowrap' }}>
      {children}
    </Typography>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
const mod = isMac ? '\u2318' : 'Ctrl+';
function useIsMobile() {
  // Touch device (phone/tablet) OR narrow window — catches landscape phones too
  const detect = () =>
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.innerWidth < 900;
  const [mobile, setMobile] = useState(detect);
  useEffect(() => {
    const fn = () => setMobile(detect);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

/* ── EditorGroupPane ── */

interface EditorGroupPaneProps {
  group: EditorGroup;
  isActive: boolean;
  modelManager: ModelManager;
  readOnly: boolean;
  onTabSwitch: (groupId: string, path: string) => void;
  onTabClose: (groupId: string, path: string) => void;
  onFocus: (groupId: string) => void;
  onSave: (groupId: string) => Promise<void>;
  onSplit: (groupId: string) => void;
  onCursorChange: (groupId: string, ln: number, col: number) => void;
  onContentChange: (groupId: string, path: string) => void;
  navPendingRef?: React.MutableRefObject<{ path: string; line: number; col: number } | null>;
  /* ── VSCode-like features ── */
  minimapEnabled: boolean;
  wordWrap: 'off' | 'on';
  showBreadcrumbs: boolean;
  formatOnSave: boolean;
  onGoToFile: () => void;
  onToggleMinimap: () => void;
  onToggleWordWrap: () => void;
  /* ── Plugin contribution points ── */
  pluginContextMenuItems: ContextMenuContribution[];
  pluginCommandPaletteItems: CommandPaletteContribution[];
}

const EditorGroupPane = memo(function EditorGroupPane({
  group,
  isActive,
  modelManager,
  readOnly,
  onTabSwitch,
  onTabClose,
  onFocus,
  onSave,
  onSplit,
  onCursorChange,
  onContentChange,
  navPendingRef,
  minimapEnabled,
  wordWrap,
  showBreadcrumbs,
  formatOnSave,
  onGoToFile,
  onToggleMinimap,
  onToggleWordWrap,
  pluginContextMenuItems,
  pluginCommandPaletteItems,
}: EditorGroupPaneProps) {
  const editorRef = useRef<EditorInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewStateRef = useRef<Map<string, { scrollTop: number; scrollLeft: number; lineNumber: number; column: number }>>(new Map());
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const groupIdRef = useRef(group.id);
  groupIdRef.current = group.id;

  // Stable refs for callbacks used inside once-only useEffect
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const formatOnSaveRef = useRef(formatOnSave);
  formatOnSaveRef.current = formatOnSave;
  const onGoToFileRef = useRef(onGoToFile);
  onGoToFileRef.current = onGoToFile;
  const onToggleMinimapRef = useRef(onToggleMinimap);
  onToggleMinimapRef.current = onToggleMinimap;
  const onToggleWordWrapRef = useRef(onToggleWordWrap);
  onToggleWordWrapRef.current = onToggleWordWrap;

  // Track previous active tab for view state saving
  const prevActiveTabRef = useRef<string | null>(null);

  // Create editor
  useEffect(() => {
    const container = containerRef.current;
    if (!container || editorRef.current) return;

    const editor = EditorInstance.create(container, {
      theme: 'vs-dark',
      readOnly,
      minimap: { enabled: false },
      wordWrap: 'off',
      fontSize: 14,
    });
    editorRef.current = editor;

    const saveAction = editor.getMonacoEditor().addAction({
      id: 'file.save',
      label: 'File: Save',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: async () => {
        if (formatOnSaveRef.current) {
          const fmt = editor.getMonacoEditor().getAction('editor.action.formatDocument');
          if (fmt) {
            try { await fmt.run(); } catch { /* ignore */ }
          }
        }
        saveRef.current(groupIdRef.current);
      },
    });

    const splitAction = editor.getMonacoEditor().addAction({
      id: 'editor.splitRight',
      label: 'View: Split Editor Right',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Backslash],
      run: () => { onSplit(groupIdRef.current); },
    });

    const goToFileAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.quickOpen',
      label: 'Go to File...',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyP],
      run: () => { onGoToFileRef.current(); },
    });

    const toggleMinimapAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.view.toggleMinimap',
      label: 'View: Toggle Minimap',
      run: () => { onToggleMinimapRef.current(); },
    });

    const toggleWordWrapAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.view.toggleWordWrap',
      label: 'View: Toggle Word Wrap',
      keybindings: [KeyMod.Alt | KeyCode.KeyZ],
      run: () => { onToggleWordWrapRef.current(); },
    });

    const formatDocAction = editor.getMonacoEditor().addAction({
      id: 'mycastle.formatDocument',
      label: 'Format Document',
      keybindings: [KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF],
      run: async () => {
        const fmt = editor.getMonacoEditor().getAction('editor.action.formatDocument');
        if (fmt) { try { await fmt.run(); } catch { /* ignore */ } }
      },
    });

    // Command palette is handled at MonacoMultiEditor level (custom overlay)

    return () => {
      saveAction.dispose();
      splitAction.dispose();
      goToFileAction.dispose();
      toggleMinimapAction.dispose();
      toggleWordWrapAction.dispose();
      formatDocAction.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync minimap / wordWrap / theme options whenever they change
  useEffect(() => {
    editorRef.current?.updateOptions({ minimap: { enabled: minimapEnabled }, wordWrap });
  }, [minimapEnabled, wordWrap]);

  // Register plugin context-menu contributions as Monaco actions
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const disposables = pluginContextMenuItems.map((item) =>
      editor.getMonacoEditor().addAction({
        id: `plugin.cm.${item.id}`,
        label: item.label,
        contextMenuGroupId: item.group ?? 'plugin',
        contextMenuOrder: item.order ?? 0,
        run: () => {
          globalCommandRegistry.execute(item.command).catch((e) =>
            console.error('[Plugin] contextmenu command error:', e),
          );
        },
      }),
    );
    return () => disposables.forEach((d) => d.dispose());
  }, [pluginContextMenuItems]);

  // Register plugin command-palette contributions as Monaco actions (visible in F1)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const disposables = pluginCommandPaletteItems.map((item) =>
      editor.getMonacoEditor().addAction({
        id: `plugin.cp.${item.command}`,
        label: item.category ? `${item.category}: ${item.title}` : item.title,
        run: () => {
          globalCommandRegistry.execute(item.command).catch((e) =>
            console.error('[Plugin] commandpalette command error:', e),
          );
        },
      }),
    );
    return () => disposables.forEach((d) => d.dispose());
  }, [pluginCommandPaletteItems]);

  // Emit cursor position to plugin event bus
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('cursorPositionChanged', (pos) => {
      globalEventBus.emit('system:editor:cursorMoved', pos);
    });
    return () => sub.dispose();
  }, []);

  // Track cursor position → parent
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('cursorPositionChanged', (pos) => {
      onCursorChange(group.id, pos.lineNumber, pos.column);
    });
    return () => sub.dispose();
  }, [group.id, onCursorChange]);

  // Track content changes → parent + emit to plugin event bus
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('contentChanged', () => {
      if (group.activeTab) onContentChange(group.id, group.activeTab);
      globalEventBus.emit('system:editor:contentChanged', { text: editor.getContent() });
    });
    return () => sub.dispose();
  }, [group.id, group.activeTab, onContentChange]);

  // Track focus → parent
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('focusChanged', ({ focused }) => {
      if (focused) onFocus(group.id);
    });
    return () => sub.dispose();
  }, [group.id, onFocus]);

  // Switch model when activeTab changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Virtual tab — clear Monaco model, nothing else to do
    const activeTabInfo = group.tabs.find(t => t.path === group.activeTab);
    if (activeTabInfo?.virtual) {
      // Blur Monaco before hiding it. On Android, hiding a focused element without
      // moving focus explicitly causes the browser to auto-focus the next available
      // input (TipTap's contenteditable), which triggers the soft keyboard and a
      // viewport resize that looks like a "flash and reset".
      (document.activeElement as HTMLElement | null)?.blur();
      editor.setModel(null);
      return;
    }

    // Save previous tab's view state
    const prevTab = prevActiveTabRef.current;
    if (prevTab && prevTab !== group.activeTab) {
      const pos = editor.getCursorPosition();
      const me = editor.getMonacoEditor();
      viewStateRef.current.set(prevTab, {
        scrollTop: me.getScrollTop(),
        scrollLeft: me.getScrollLeft(),
        lineNumber: pos?.lineNumber ?? 1,
        column: pos?.column ?? 1,
      });
    }
    prevActiveTabRef.current = group.activeTab;

    if (!group.activeTab) {
      editor.setModel(null);
      return;
    }

    const tabInfo = group.tabs.find(t => t.path === group.activeTab);
    if (!tabInfo) return;

    const model = modelManager.getModel(tabInfo.uri);
    if (model) {
      editor.setModel(model);
      // Notify plugins about the model change with the actual text
      globalEventBus.emit('system:editor:modelChanged', {
        uri: group.activeTab,
        text: model.getValue(),
      });

      // Check pending navigation from Find in Files (takes priority over saved view state)
      const nav = navPendingRef?.current;
      if (nav && nav.path === group.activeTab) {
        navPendingRef!.current = null;
        requestAnimationFrame(() => {
          const me = editorRef.current?.getMonacoEditor();
          if (!me) return;
          me.setPosition({ lineNumber: nav.line, column: nav.col });
          me.revealLineInCenter(nav.line);
          editorRef.current?.focus();
        });
      } else {
        const vs = viewStateRef.current.get(group.activeTab);
        if (vs) {
          editor.setCursorPosition(vs.lineNumber, vs.column);
          editor.getMonacoEditor().setScrollPosition({ scrollTop: vs.scrollTop, scrollLeft: vs.scrollLeft });
        }
        editor.focus();
      }
    }
  }, [group.activeTab, group.tabs, modelManager, navPendingRef]);

  // Layout on resize
  useEffect(() => {
    const raf = requestAnimationFrame(() => { editorRef.current?.layout(); });
    return () => cancelAnimationFrame(raf);
  });

  const activeTabIndex = group.tabs.findIndex(t => t.path === group.activeTab);

  const handleTabMouseDown = useCallback((path: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.stopPropagation();
      e.preventDefault();
      onTabClose(group.id, path);
    }
  }, [group.id, onTabClose]);

  return (
    <Box
      onClick={() => onFocus(group.id)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: MIN_PANEL_PX,
        flex: `${group.size} 1 0`,
        borderTop: isActive ? '2px solid #007acc' : '2px solid transparent',
      }}
    >
      {/* Tab bar */}
      {group.tabs.length > 0 && (
        <Box sx={{ bgcolor: '#252526', borderBottom: '1px solid #3c3c3c', display: 'flex', alignItems: 'center' }}>
          <Tabs
            value={activeTabIndex >= 0 ? activeTabIndex : false}
            onChange={(_, idx) => { if (group.tabs[idx]) onTabSwitch(group.id, group.tabs[idx].path); }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 35,
              flexGrow: 1,
              '& .MuiTabs-indicator': { bgcolor: '#007acc', height: 2 },
              '& .MuiTab-root': {
                minHeight: 35,
                py: 0,
                px: 1.5,
                textTransform: 'none',
                color: '#969696',
                fontSize: 13,
                '&.Mui-selected': { color: '#ffffff' },
              },
            }}
          >
            {group.tabs.map((tab) => (
              <Tab
                key={tab.path}
                onMouseDown={(e) => handleTabMouseDown(tab.path, e)}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {tab.label}{tab.modified ? ' \u25CF' : ''}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onTabClose(group.id, tab.path); }}
                      sx={{
                        p: 0.25,
                        ml: 0.5,
                        color: '#969696',
                        '&:hover': { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.1)' },
                      }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Box>
                }
              />
            ))}
          </Tabs>
          {/* Split button in tab bar */}
          <IconButton
            size="small"
            title="Split Editor Right"
            onClick={() => onSplit(group.id)}
            sx={{ color: '#858585', mx: 0.5, '&:hover': { color: '#ccc' } }}
          >
            <SplitIcon />
          </IconButton>
        </Box>
      )}

      {/* Breadcrumbs */}
      {showBreadcrumbs && group.activeTab && (
        <Box sx={{
          bgcolor: '#1e1e1e',
          borderBottom: '1px solid #2d2d2d',
          px: 1.5,
          py: 0.375,
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {group.activeTab.split('/').filter(Boolean).map((segment, idx, arr) => (
            <Box key={idx} sx={{ display: 'flex', alignItems: 'center', flexShrink: idx < arr.length - 1 ? 1 : 0, minWidth: 0 }}>
              {idx > 0 && (
                <Typography sx={{ color: '#606060', fontSize: 12, mx: 0.5, flexShrink: 0 }}>›</Typography>
              )}
              <Typography sx={{
                fontSize: 12,
                color: idx === arr.length - 1 ? '#ccc' : '#858585',
                fontWeight: idx === arr.length - 1 ? 500 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {segment}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Virtual tab content (rendered instead of Monaco) */}
      {(() => {
        const activeVirtual = group.tabs.find(t => t.path === group.activeTab)?.virtual;
        if (!activeVirtual) return null;
        const VirtualComponent = activeVirtual.component;
        return (
          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <VirtualComponent />
          </Box>
        );
      })()}

      {/* Monaco container — always mounted (preserves editor instance), hidden when virtual tab is active */}
      <Box
        ref={containerRef}
        sx={{
          flexGrow: 1,
          overflow: 'hidden',
          display: group.tabs.find(t => t.path === group.activeTab)?.virtual
            ? 'none'
            : group.tabs.length > 0 ? 'block' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {group.tabs.length === 0 && (
          <Typography sx={{ color: '#5a5a5a', fontSize: 14, textAlign: 'center', userSelect: 'none' }}>
            Double-click a file to open it
          </Typography>
        )}
      </Box>
    </Box>
  );
});

/* ── Main Component ── */

export function MonacoMultiEditor({
  provider,
  height = '100%',
  readOnly = false,
  providerRegistry,
  onFileSave,
  plugins,
  enableAgent = false,
  defaultAgentConfig,
  agentClaudeMd,
  agentAuthToken,
  agentWebFetchUrl,
  enableTerminal = false,
  terminalWsUrl,
  terminalToken,
  onTerminalConfigRequest,
  projectDeps,
  onDialogAction,
  defaultMountPresets,
}: MonacoMultiEditorProps) {
  const [groups, setGroups] = useState<EditorGroup[]>(() => [{ id: makeGroupId(), tabs: [], activeTab: null, size: 1 }]);
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0].id);
  const [splitRatio, setSplitRatio] = useState(() => window.innerWidth < 900 ? 0.65 : 0.25);
  const explorerRefreshRef = useRef<(() => void) | null>(null);
  const explorerRevealRef = useRef<((paths: string[]) => Promise<void>) | null>(null);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>('explorer');
  const [cursorInfo, setCursorInfo] = useState({ ln: 1, col: 1 });
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchUseRegex, setSearchUseRegex] = useState(false);
  const [searchDir, setSearchDir] = useState('/');
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  // ── VSCode-like feature toggles ──
  const [minimapEnabled, setMinimapEnabled] = useState(false);
  const [wordWrap, setWordWrap] = useState<'off' | 'on'>('off');
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);
  const [formatOnSave, setFormatOnSave] = useState(false);
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'vs'>('vs-dark');

  // ── Command Palette ──
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [cmdPaletteQuery, setCmdPaletteQuery] = useState('');

  // ── Go to File ──
  const [goToFileOpen, setGoToFileOpen] = useState(false);
  const [allVfsFiles, setAllVfsFiles] = useState<string[]>([]);
  const [goToFileLoading, setGoToFileLoading] = useState(false);

  // ── Menu anchors ──
  const [viewMenuAnchor, setViewMenuAnchor] = useState<null | HTMLElement>(null);

  const isMobile = useIsMobile();
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [agentPanelWidth, setAgentPanelWidth] = useState(380);
  const agentPanelWidthRef = useRef(380);
  // Unified bottom panel (terminal + output tabs)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(220);
  const bottomPanelHeightRef = useRef(220);
  const [bottomTabs, setBottomTabs] = useState<BottomTab[]>(
    enableTerminal ? [{ id: 'terminal-1', type: 'terminal', label: 'bash' }] : [],
  );
  const [activeBottomTabId, setActiveBottomTabId] = useState(enableTerminal ? 'terminal-1' : '');
  const currentOutputTabIdRef = useRef<string | null>(null);
  const mainAreaRef = useRef<HTMLDivElement | null>(null);

  // Menu anchors
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null);
  const [editMenuAnchor, setEditMenuAnchor] = useState<null | HTMLElement>(null);

  const modelManagerRef = useRef<ModelManager | null>(null);
  const splitterContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingNavRef = useRef<{ path: string; line: number; col: number } | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const activeGroupIdRef = useRef(activeGroupId);
  activeGroupIdRef.current = activeGroupId;

  // Initialize ModelManager once
  if (!modelManagerRef.current) {
    modelManagerRef.current = new ModelManager();
  }

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? groups[0];
  const activeTabObj = activeGroup?.tabs.find(t => t.path === activeGroup.activeTab);
  const activeLang = activeTabObj ? detectLanguage(activeTabObj.path) : '';
  const sidebarOpen = sidebarPanel !== null;

  // Sync Monaco global theme
  useEffect(() => {
    monaco.editor.setTheme(editorTheme);
  }, [editorTheme]);

  const handleToggleMinimap = useCallback(() => setMinimapEnabled(v => !v), []);
  const handleToggleWordWrap = useCallback(() => setWordWrap(v => v === 'off' ? 'on' : 'off'), []);

  // ── Plugin system ──────────────────────────────────────────────────────────

  // Register and activate plugins — re-runs when the set of plugin ids changes
  // (handles HMR / dynamically added plugins without re-registering existing ones)
  const pluginIdsKey = (plugins ?? []).map((p) => p.manifest.id).join(',');
  useEffect(() => {
    if (!plugins?.length) return;
    const disposables = plugins.map((p) => {
      if (globalPluginRegistry.getPlugin(p.manifest.id)) return null; // already registered
      try { return globalPluginRegistry.register(p); }
      catch (e) { console.warn('[MonacoMultiEditor] Plugin register error:', e); return null; }
    });
    globalPluginRegistry.activateAll();
    return () => {
      disposables.forEach((d) => d?.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginIdsKey]);

  // system:editor:modelChanged is now emitted directly from EditorGroupPane
  // when editor.setModel() is called — more reliable than tracking state here.

  // Listen for command palette open request
  useEffect(() => {
    const unsub = globalEventBus.on('system:editor:openCommandPalette', () => {
      setCmdPaletteQuery('');
      setCmdPaletteOpen(true);
    });
    return unsub;
  }, []);

  // Listen for plugin requests to open a sidebar panel
  useEffect(() => {
    const unsub = globalEventBus.on<{ panelId: string }>('system:ui:openSidebar', ({ panelId }) => {
      setSidebarPanel(panelId);
    });
    return unsub;
  }, []);

  // Listen for plugin requests to open a virtual editor tab
  useEffect(() => {
    const unsub = globalEventBus.on<{
      uri: string;
      title: string;
      component: ComponentType;
      toSide: boolean;
    }>('system:editor:openVirtualTab', ({ uri, title, component, toSide }) => {
      const currentGroups = groupsRef.current;
      const currentActiveId = activeGroupIdRef.current;

      // If this virtual tab is already open somewhere, just switch to it
      for (const g of currentGroups) {
        if (g.tabs.some(t => t.path === uri)) {
          setGroups(prev => prev.map(g2 =>
            g2.tabs.some(t => t.path === uri) ? { ...g2, activeTab: uri } : g2,
          ));
          setActiveGroupId(g.id);
          return;
        }
      }

      const virtualTab: TabInfo = {
        path: uri,
        label: title,
        modified: false,
        uri: createDocumentUri(uri),
        virtual: { component },
      };

      if (toSide) {
        const newGroupId = makeGroupId();
        const activeIdx = currentGroups.findIndex(g => g.id === currentActiveId);
        const insertAt = activeIdx >= 0 ? activeIdx + 1 : currentGroups.length;
        setGroups(prev => {
          const updated = [...prev];
          updated.splice(insertAt, 0, {
            id: newGroupId,
            tabs: [virtualTab],
            activeTab: uri,
            size: 1,
          });
          return updated;
        });
        setActiveGroupId(newGroupId);
      } else {
        setGroups(prev => prev.map(g =>
          g.id === currentActiveId
            ? { ...g, tabs: [...g.tabs, virtualTab], activeTab: uri }
            : g,
        ));
      }
    });
    return unsub;
  }, []);

  // Plugin contribution hooks
  const pluginToolbarItems = useToolbarItems();
  const pluginStatusBarItems = useStatusBarPluginItems();
  const pluginSidebarPanels = useSidebarContributions();
  const pluginContextMenuItems = useContextMenuContributions();
  const pluginCommandPaletteItems = useCommandPaletteContributions();
  const pluginInfos = usePlugins(() => globalPluginRegistry.getPlugins());

  // Open a file — always opens in the active group
  const handleFileOpen = useCallback(async (path: string) => {
    const mm = modelManagerRef.current;
    if (!mm) return;

    setGroups(prev => {
      const groupIdx = prev.findIndex(g => g.id === activeGroupId);
      if (groupIdx === -1) return prev;
      const group = prev[groupIdx];

      // Already open in this group
      if (group.tabs.find(t => t.path === path)) {
        const updated = [...prev];
        updated[groupIdx] = { ...group, activeTab: path };
        return updated;
      }

      return prev; // will add after async read
    });

    // Check if tab already exists in active group
    const currentGroups = groups;
    const group = currentGroups.find(g => g.id === activeGroupId);
    if (group?.tabs.find(t => t.path === path)) {
      setGroups(prev => prev.map(g =>
        g.id === activeGroupId ? { ...g, activeTab: path } : g
      ));
      return;
    }

    // Read file and create model
    const data = await provider.readFile(path);
    const content = decodeText(data);
    const language = detectLanguage(path);
    const uri = `file://${path}`;
    mm.createModel(content, language, uri);
    const docUri = createDocumentUri(uri);

    const newTab: TabInfo = { path, label: fileLabel(path), modified: false, uri: docUri };

    setGroups(prev => prev.map(g => {
      if (g.id !== activeGroupId) return g;
      if (g.tabs.find(t => t.path === path)) return { ...g, activeTab: path };
      return { ...g, tabs: [...g.tabs, newTab], activeTab: path };
    }));
  }, [provider, groups, activeGroupId]);

  // Go to File — walk VFS to collect files, then show dialog
  const handleGoToFileOpen = useCallback(async () => {
    setGoToFileOpen(true);
    if (allVfsFiles.length > 0) return;
    setGoToFileLoading(true);
    const files: string[] = [];
    async function walk(dir: string) {
      let entries: { name: string; type: FileType }[];
      try { entries = await provider.readDirectory(dir); } catch { return; }
      for (const { name, type: ft } of entries) {
        const full = dir === '/' ? `/${name}` : `${dir}/${name}`;
        if (ft === FileType.Directory) {
          if (!SKIP_DIRS.has(name)) await walk(full);
        } else {
          files.push(full);
        }
      }
    }
    try {
      await walk('/');
      files.sort();
      setAllVfsFiles(files);
    } catch { /* ignore */ } finally {
      setGoToFileLoading(false);
    }
  }, [allVfsFiles.length, provider]);

  const handleGoToFileSelect = useCallback((path: string) => {
    setGoToFileOpen(false);
    handleFileOpen(path);
  }, [handleFileOpen]);

  // Tab switch within a group
  const handleTabSwitch = useCallback((groupId: string, path: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, activeTab: path } : g
    ));
    setActiveGroupId(groupId);
  }, []);

  // Close a tab within a group
  const handleTabClose = useCallback((groupId: string, path: string) => {
    setGroups(prev => {
      const groupIdx = prev.findIndex(g => g.id === groupId);
      if (groupIdx === -1) return prev;
      const group = prev[groupIdx];
      const tabIndex = group.tabs.findIndex(t => t.path === path);
      if (tabIndex === -1) return prev;

      const newTabs = group.tabs.filter(t => t.path !== path);

      // Check if this file is still open in another group
      const tab = group.tabs[tabIndex];
      const stillOpenElsewhere = prev.some((g, i) => i !== groupIdx && g.tabs.some(t => t.path === path));
      if (!stillOpenElsewhere && !tab.virtual) {
        modelManagerRef.current?.disposeModel(tab.uri);
      }

      let newActiveTab = group.activeTab;
      if (group.activeTab === path) {
        if (newTabs.length > 0) {
          const nextIdx = Math.min(tabIndex, newTabs.length - 1);
          newActiveTab = newTabs[nextIdx].path;
        } else {
          newActiveTab = null;
        }
      }

      // If group becomes empty and there's more than 1 group, remove it
      if (newTabs.length === 0 && prev.length > 1) {
        const remaining = prev.filter(g => g.id !== groupId);
        return remaining;
      }

      const updated = [...prev];
      updated[groupIdx] = { ...group, tabs: newTabs, activeTab: newActiveTab };
      return updated;
    });

  }, []);

  // Ensure activeGroupId is valid after groups change
  useEffect(() => {
    if (!groups.find(g => g.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? '');
    }
  }, [groups, activeGroupId]);

  const closeAllTabs = useCallback(() => {
    const mm = modelManagerRef.current;
    for (const group of groups) {
      for (const tab of group.tabs) {
        mm?.disposeModel(tab.uri);
      }
    }
    const firstId = groups[0]?.id ?? makeGroupId();
    setGroups([{ id: firstId, tabs: [], activeTab: null, size: 1 }]);
    setActiveGroupId(firstId);
  }, [groups]);

  // Focus a group
  const handleGroupFocus = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
  }, []);

  // Save in a group
  const handleGroupSave = useCallback(async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group?.activeTab) return;

    const path = group.activeTab;
    const tabInfo = group.tabs.find(t => t.path === path);
    if (!tabInfo) return;

    const mm = modelManagerRef.current;
    const model = mm?.getModel(tabInfo.uri);
    if (!model) return;

    const content = model.getValue();
    const encoded = encodeText(content);

    if (onFileSave) {
      await onFileSave(path, encoded);
    } else if (provider.writeFile) {
      await provider.writeFile(path, encoded, { overwrite: true, create: true });
    }

    setGroups(prev => prev.map(g => ({
      ...g,
      tabs: g.tabs.map(t => t.path === path ? { ...t, modified: false } : t),
    })));

    globalEventBus.emit('system:editor:didSave', { uri: path });
  }, [groups, onFileSave, provider]);

  // Split editor — duplicate active tab into a new group to the right
  const handleSplit = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group?.activeTab) return;

    const activeTabInfo = group.tabs.find(t => t.path === group.activeTab);
    if (!activeTabInfo) return;

    const newGroup: EditorGroup = {
      id: makeGroupId(),
      tabs: [{ ...activeTabInfo }],
      activeTab: activeTabInfo.path,
      size: 1,
    };

    setGroups(prev => {
      const idx = prev.findIndex(g => g.id === groupId);
      const updated = [...prev];
      updated.splice(idx + 1, 0, newGroup);
      return updated;
    });
    setActiveGroupId(newGroup.id);
  }, [groups]);

  // Cursor change from a group
  const handleCursorChange = useCallback((_: string, ln: number, col: number) => {
    setCursorInfo({ ln, col });
  }, []);

  // Group splitter drag — resize adjacent editor groups
  const editorGroupsContainerRef = useRef<HTMLDivElement | null>(null);
  const handleGroupSplitterMouseDown = useCallback((e: React.MouseEvent, leftGroupId: string, rightGroupId: string) => {
    e.preventDefault();
    const container = editorGroupsContainerRef.current;
    if (!container) return;

    // Snapshot current values from ref (always fresh)
    const snap = groupsRef.current;
    const leftGroup = snap.find(g => g.id === leftGroupId);
    const rightGroup = snap.find(g => g.id === rightGroupId);
    if (!leftGroup || !rightGroup) return;

    const containerWidth = container.getBoundingClientRect().width;
    const splitterCount = snap.length - 1;
    const availableWidth = containerWidth - splitterCount * 5;
    const totalSizeAll = snap.reduce((s, g) => s + g.size, 0);
    const pxPerUnit = availableWidth / totalSizeAll;
    const minUnits = MIN_PANEL_PX / pxPerUnit;

    const startX = e.clientX;
    const leftStart = leftGroup.size;
    const combined = leftGroup.size + rightGroup.size;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const delta = dx / pxPerUnit;
      let newLeft = leftStart + delta;
      let newRight = combined - newLeft;

      if (newLeft < minUnits) { newLeft = minUnits; newRight = combined - minUnits; }
      if (newRight < minUnits) { newRight = minUnits; newLeft = combined - minUnits; }

      setGroups(prev => prev.map(g => {
        if (g.id === leftGroupId) return { ...g, size: newLeft };
        if (g.id === rightGroupId) return { ...g, size: newRight };
        return g;
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Content change → mark tab modified in all groups that have this path open
  const handleContentChange = useCallback((_: string, path: string) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      tabs: g.tabs.map(t => t.path === path ? { ...t, modified: true } : t),
    })));
  }, []);

  // Find in Files — walk VFS and collect matches
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchDone(false);
    setSearchResults([]);
    try {
      let pattern = q;
      if (!searchUseRegex) pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (searchWholeWord) pattern = `\\b${pattern}\\b`;
      const flags = searchCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      const results: FileSearchResult[] = [];
      const rootDir = searchDir.trim() || '/';
      await walkVfsForSearch(provider, rootDir, regex, results);
      setSearchResults(results);
      setSearchDone(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchDir, searchCaseSensitive, searchWholeWord, searchUseRegex, provider]);

  // Navigate to a match — open file if needed, then navigate to line/col
  const handleGoToMatch = useCallback(async (path: string, line: number, col: number) => {
    pendingNavRef.current = { path, line, col };
    const group = groupsRef.current.find(g => g.id === activeGroupId);
    if (group?.tabs.find(t => t.path === path)) {
      // Already open — switch tab (model-switch effect fires and picks up pendingNavRef)
      setGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, activeTab: path } : g));
    } else {
      await handleFileOpen(path);
    }
  }, [activeGroupId, handleFileOpen]);

  // Toggle a file result collapsed/expanded
  const toggleResultCollapse = useCallback((path: string) => {
    setSearchResults(prev => prev.map(r => r.path === path ? { ...r, collapsed: !r.collapsed } : r));
  }, []);

  // Replace all matches in a single file
  const handleReplaceInFile = useCallback(async (result: FileSearchResult) => {
    const mm = modelManagerRef.current;
    const uri = `file://${result.path}`;
    const docUri = createDocumentUri(uri);
    const model = mm?.getModel(docUri);

    let text: string;
    if (model) {
      text = model.getValue();
    } else {
      text = decodeText(await provider.readFile(result.path));
    }

    const q = searchQuery.trim();
    if (!q) return;
    let pattern = q;
    if (!searchUseRegex) pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (searchWholeWord) pattern = `\\b${pattern}\\b`;
    const flags = searchCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);
    const replaced = text.replace(regex, replaceQuery);

    if (model) {
      model.setValue(replaced);
      setGroups(prev => prev.map(g => ({
        ...g,
        tabs: g.tabs.map(t => t.path === result.path ? { ...t, modified: true } : t),
      })));
    }
    const encoded = encodeText(replaced);
    if (onFileSave) {
      await onFileSave(result.path, encoded);
    } else if (provider.writeFile) {
      await provider.writeFile(result.path, encoded, { overwrite: true, create: true });
    }

    setSearchResults(prev => prev.filter(r => r.path !== result.path));
  }, [searchQuery, replaceQuery, searchCaseSensitive, searchWholeWord, searchUseRegex, provider, onFileSave]);

  // Replace all matches across all files
  const handleReplaceAll = useCallback(async () => {
    for (const result of searchResults) {
      await handleReplaceInFile(result);
    }
  }, [searchResults, handleReplaceInFile]);

  // Agent wrote files → reload any open tabs whose content changed + reveal in file explorer
  const handleAgentFileWritten = useCallback(async (paths: string[]) => {
    // Reveal written paths in the VFS explorer (refresh + expand ancestor dirs)
    explorerRevealRef.current?.(paths).catch(() => {});

    const mm = modelManagerRef.current;
    if (!mm) return;
    for (const path of paths) {
      const uri = `file://${path}`;
      const docUri = createDocumentUri(uri);
      const model = mm.getModel(docUri);
      if (!model) continue; // not open in any tab, nothing to reload
      try {
        const data = await provider.readFile(path);
        const content = decodeText(data);
        model.setValue(content);
        // Mark the tab as clean — agent already persisted it to VFS
        setGroups(prev => prev.map(g => ({
          ...g,
          tabs: g.tabs.map(t => t.path === path ? { ...t, modified: false } : t),
        })));
      } catch { /* file deleted or unreadable — leave tab as-is */ }
    }
  }, [provider]);

  // Splitter drag (sidebar) — shared logic for mouse and touch
  const startSplitterDrag = useCallback((startClientX: number) => {
    const container = splitterContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const startRatio = splitRatio;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const applyDelta = (clientX: number) => {
      const dx = clientX - startClientX;
      const newRatio = startRatio + dx / containerRect.width;
      const minRatio = MIN_PANEL_PX / containerRect.width;
      const maxRatio = 1 - minRatio;
      setSplitRatio(Math.min(maxRatio, Math.max(minRatio, newRatio)));
    };

    const onMouseMove = (ev: MouseEvent) => applyDelta(ev.clientX);
    const onTouchMove = (ev: TouchEvent) => { ev.preventDefault(); applyDelta(ev.touches[0].clientX); };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', cleanup);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', cleanup);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', cleanup);
  }, [splitRatio]);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startSplitterDrag(e.clientX);
  }, [startSplitterDrag]);

  const handleSplitterTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    startSplitterDrag(e.touches[0].clientX);
  }, [startSplitterDrag]);

  // Agent panel splitter drag
  const handleAgentSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = agentPanelWidthRef.current;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newWidth = Math.max(280, startWidth - dx);
      agentPanelWidthRef.current = newWidth;
      setAgentPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Bottom panel splitter drag
  const handleBottomSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = mainAreaRef.current;
    if (!container) return;
    const startY = e.clientY;
    const startHeight = bottomPanelHeightRef.current;
    const maxHeight = container.getBoundingClientRect().height * 0.7;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    const onMouseMove = (ev: MouseEvent) => {
      const newH = Math.max(80, Math.min(maxHeight, startHeight + (startY - ev.clientY)));
      bottomPanelHeightRef.current = newH;
      setBottomPanelHeight(newH);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Tab management
  const handleAddTerminal = useCallback(() => {
    const id = `terminal-${Date.now()}`;
    const n = bottomTabs.filter(t => t.type === 'terminal').length + 1;
    setBottomTabs(prev => [...prev, { id, type: 'terminal', label: `bash ${n}` }]);
    setActiveBottomTabId(id);
    setBottomPanelOpen(true);
  }, [bottomTabs]);

  const handleCloseTab = useCallback((id: string) => {
    setBottomTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) { setBottomPanelOpen(false); return prev; }
      return next;
    });
    setActiveBottomTabId(prev => {
      if (prev !== id) return prev;
      const idx = bottomTabs.findIndex(t => t.id === id);
      const remaining = bottomTabs.filter(t => t.id !== id);
      if (remaining.length === 0) return '';
      return remaining[Math.max(0, idx - 1)].id;
    });
  }, [bottomTabs]);

  // VfsExplorer → bottom panel output callbacks
  const handleOutputLine = useCallback((line: OutputLine) => {
    const tabId = currentOutputTabIdRef.current;
    if (!tabId) return;
    setBottomTabs(prev => prev.map(t =>
      t.id === tabId && t.type === 'output' ? { ...t, lines: [...t.lines, line] } : t,
    ));
  }, []);

  const handleActionRunningChange = useCallback((running: boolean, actionLabel?: string) => {
    if (running) {
      const tabId = `output-${Date.now()}`;
      currentOutputTabIdRef.current = tabId;
      setBottomTabs(prev => [...prev, { id: tabId, type: 'output', label: actionLabel ?? 'Output', lines: [], running: true }]);
      setActiveBottomTabId(tabId);
      setBottomPanelOpen(true);
    } else {
      const tabId = currentOutputTabIdRef.current;
      if (tabId) {
        setBottomTabs(prev => prev.map(t =>
          t.id === tabId && t.type === 'output' ? { ...t, running: false } : t,
        ));
      }
    }
  }, []);

  // Activity bar toggle
  const togglePanel = useCallback((panel: SidebarPanel) => {
    setSidebarPanel(prev => prev === panel ? null : panel);
  }, []);

  // Editor commands for Edit menu — trigger on the active group's editor
  // Focus the active group's editor so keyboard shortcuts work from menu
  const focusActiveEditor = useCallback(() => {
    const containers = splitterContainerRef.current?.querySelectorAll<HTMLElement>('.monaco-editor');
    if (containers) {
      for (const el of containers) {
        const textarea = el.querySelector('textarea');
        if (textarea) { textarea.focus(); break; }
      }
    }
  }, []);

  // Trigger format document on the focused Monaco editor
  const triggerFormatDocument = useCallback(() => {
    const containers = splitterContainerRef.current?.querySelectorAll<HTMLElement>('.monaco-editor');
    if (containers) {
      for (const el of containers) {
        const textarea = el.querySelector('textarea');
        if (textarea) {
          textarea.focus();
          // Dispatch keyboard event for Shift+Alt+F which our registered action listens to
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', altKey: true, shiftKey: true, bubbles: true }));
          break;
        }
      }
    }
  }, []);

  /* ── Menu item style ── */
  const menuItemSx = {
    fontSize: 13,
    py: 0.5,
    px: 2,
    minHeight: 28,
    '&.Mui-disabled': { opacity: 0.4 },
  } as const;

  // Filtered command palette items
  const filteredCmdItems = cmdPaletteQuery.trim()
    ? pluginCommandPaletteItems.filter(item => {
        const q = cmdPaletteQuery.toLowerCase();
        const label = (item.category ? `${item.category}: ${item.title}` : item.title).toLowerCase();
        return label.includes(q);
      })
    : pluginCommandPaletteItems;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, overflow: 'hidden', bgcolor: '#1e1e1e', position: 'relative' }}>

      {/* ── Command Palette Overlay ── */}
      {cmdPaletteOpen && (
        <Box
          onClick={() => setCmdPaletteOpen(false)}
          sx={{
            position: 'absolute', inset: 0, zIndex: 9999,
            bgcolor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            ...(isMobile
              ? { alignItems: 'flex-end', justifyContent: 'center' }
              : { justifyContent: 'center', alignItems: 'flex-start' }),
          }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              bgcolor: '#252526',
              border: '1px solid #454545',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              ...(isMobile
                ? { borderRadius: '12px 12px 0 0', maxHeight: '70vh', width: '100%' }
                : { borderRadius: 1, width: 560, maxWidth: '90vw', maxHeight: '60vh' }),
            }}
          >
            {/* On mobile: no text input (prevents keyboard → viewport shrink → scroll reset).
                On desktop: standard searchable text field. */}
            {isMobile ? (
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #454545', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 13, color: '#858585' }}>Commands</Typography>
                <Box
                  component="button"
                  onClick={() => setCmdPaletteOpen(false)}
                  sx={{ background: 'none', border: 'none', color: '#858585', fontSize: 20, cursor: 'pointer', lineHeight: 1, p: 0, touchAction: 'manipulation' }}
                >×</Box>
              </Box>
            ) : (
              <TextField
                autoFocus
                fullWidth
                placeholder="Type a command…"
                value={cmdPaletteQuery}
                onChange={(e) => setCmdPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCmdPaletteOpen(false);
                  if (e.key === 'Enter' && filteredCmdItems.length > 0) {
                    globalCommandRegistry.execute(filteredCmdItems[0].command).catch(console.error);
                    setCmdPaletteOpen(false);
                  }
                }}
                slotProps={{
                  input: {
                    sx: {
                      color: '#ccc', fontSize: 14, px: 1.5, py: 1,
                      '& input': { p: 0 },
                    },
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                  borderBottom: '1px solid #454545',
                }}
              />
            )}
            <Box sx={{ overflowY: 'auto' }}>
              {filteredCmdItems.length === 0 ? (
                <Box sx={{ px: 2, py: 1.5, color: '#858585', fontSize: 13 }}>No commands found</Box>
              ) : (
                filteredCmdItems.map((item) => {
                  const label = item.category ? `${item.category}: ${item.title}` : item.title;
                  return (
                    <Box
                      key={item.command}
                      onClick={() => {
                        globalCommandRegistry.execute(item.command).catch(console.error);
                        setCmdPaletteOpen(false);
                      }}
                      sx={{
                        px: 2, py: isMobile ? 1.5 : 1, fontSize: 13, color: '#ccc', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                      }}
                    >
                      <Typography sx={{ fontSize: isMobile ? 15 : 13 }}>{label}</Typography>
                      {item.keybinding && !isMobile && (
                        <Typography sx={{ fontSize: 11, color: '#858585', ml: 2, flexShrink: 0 }}>
                          {item.keybinding}
                        </Typography>
                      )}
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Menu Bar ── */}
      <Box sx={{
        height: MENU_BAR_H,
        bgcolor: '#333333',
        display: 'flex',
        alignItems: 'center',
        px: 0.5,
        flexShrink: 0,
        borderBottom: '1px solid #2b2b2b',
        userSelect: 'none',
      }}>
        {/* File menu */}
        <Box
          onClick={(e) => setFileMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          File
        </Box>
        <Menu
          anchorEl={fileMenuAnchor}
          open={Boolean(fileMenuAnchor)}
          onClose={() => setFileMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 220 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { handleGroupSave(activeGroupId); setFileMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Save</ListItemText><Kbd>{`${mod}S`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { handleSplit(activeGroupId); setFileMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Split Editor Right</ListItemText><Kbd>{`${mod}\\`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { if (activeGroup?.activeTab) handleTabClose(activeGroupId, activeGroup.activeTab); setFileMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Close Editor</ListItemText><Kbd>{`${mod}W`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { closeAllTabs(); setFileMenuAnchor(null); }} disabled={groups.every(g => g.tabs.length === 0)}>
            <ListItemText>Close All Editors</ListItemText>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { handleGoToFileOpen(); setFileMenuAnchor(null); }}>
            <ListItemText>Go to File...</ListItemText><Kbd>{`${mod}P`}</Kbd>
          </MenuItem>
        </Menu>

        {/* Edit menu */}
        <Box
          onClick={(e) => setEditMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Edit
        </Box>
        <Menu
          anchorEl={editMenuAnchor}
          open={Boolean(editMenuAnchor)}
          onClose={() => setEditMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 220 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { focusActiveEditor(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Undo</ListItemText><Kbd>{`${mod}Z`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { focusActiveEditor(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Redo</ListItemText><Kbd>{`${mod}${isMac ? '\u21E7Z' : 'Y'}`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { focusActiveEditor(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Find</ListItemText><Kbd>{`${mod}F`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { focusActiveEditor(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab}>
            <ListItemText>Replace</ListItemText><Kbd>{`${mod}H`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { togglePanel('search'); setShowReplace(false); setEditMenuAnchor(null); }}>
            <ListItemText>Find in Files</ListItemText><Kbd>{`${mod}Shift+F`}</Kbd>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { togglePanel('search'); setShowReplace(true); setEditMenuAnchor(null); }}>
            <ListItemText>Replace in Files</ListItemText><Kbd>{`${mod}Shift+H`}</Kbd>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { triggerFormatDocument(); setEditMenuAnchor(null); }} disabled={!activeGroup?.activeTab || readOnly}>
            <ListItemText>Format Document</ListItemText><Kbd>{`Shift+Alt+F`}</Kbd>
          </MenuItem>
        </Menu>

        {/* View menu */}
        <Box
          onClick={(e) => setViewMenuAnchor(e.currentTarget)}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          View
        </Box>
        <Menu
          anchorEl={viewMenuAnchor}
          open={Boolean(viewMenuAnchor)}
          onClose={() => setViewMenuAnchor(null)}
          slotProps={{
            paper: { sx: { bgcolor: '#252526', color: '#ccc', border: '1px solid #454545', minWidth: 240 } },
          }}
        >
          <MenuItem sx={menuItemSx} onClick={() => { handleToggleMinimap(); setViewMenuAnchor(null); }}>
            <ListItemText>Toggle Minimap</ListItemText>
            <Typography sx={{ fontSize: 12, color: minimapEnabled ? '#4fc3f7' : '#858585', ml: 2 }}>{minimapEnabled ? '✓' : ''}</Typography>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { handleToggleWordWrap(); setViewMenuAnchor(null); }}>
            <ListItemText>Toggle Word Wrap</ListItemText>
            <Kbd>{`Alt+Z`}</Kbd>
            <Typography sx={{ fontSize: 12, color: wordWrap === 'on' ? '#4fc3f7' : '#858585', ml: 1 }}>{wordWrap === 'on' ? '✓' : ''}</Typography>
          </MenuItem>
          <MenuItem sx={menuItemSx} onClick={() => { setShowBreadcrumbs(v => !v); setViewMenuAnchor(null); }}>
            <ListItemText>Toggle Breadcrumbs</ListItemText>
            <Typography sx={{ fontSize: 12, color: showBreadcrumbs ? '#4fc3f7' : '#858585', ml: 2 }}>{showBreadcrumbs ? '✓' : ''}</Typography>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { setEditorTheme(v => v === 'vs-dark' ? 'vs' : 'vs-dark'); setViewMenuAnchor(null); }}>
            <ListItemText>{editorTheme === 'vs-dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}</ListItemText>
          </MenuItem>
          <Divider sx={{ borderColor: '#454545', my: 0.5 }} />
          <MenuItem sx={menuItemSx} onClick={() => { setFormatOnSave(v => !v); setViewMenuAnchor(null); }}>
            <ListItemText>Format on Save</ListItemText>
            <Typography sx={{ fontSize: 12, color: formatOnSave ? '#4fc3f7' : '#858585', ml: 2 }}>{formatOnSave ? '✓' : ''}</Typography>
          </MenuItem>
        </Menu>

        {/* Command Palette — direct menu bar item */}
        <Box sx={{ width: '1px', height: 14, bgcolor: '#555', mx: 0.5, flexShrink: 0 }} />
        <Box
          onClick={() => globalEventBus.emit('system:editor:openCommandPalette', {})}
          sx={{
            px: 1, py: 0.25, borderRadius: 0.5, cursor: 'pointer', color: '#ccc', fontSize: 13,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          Command Palette
        </Box>

      </Box>

      {/* ── Toolbar (below menu bar) — only shown when plugins contribute items ── */}
      {pluginToolbarItems.length > 0 && (
        <Box sx={{
          bgcolor: '#2d2d2d',
          borderBottom: '1px solid #2b2b2b',
          px: 0.5,
          display: 'flex',
          alignItems: 'center',
          height: 32,
          flexShrink: 0,
          gap: 0.25,
        }}>
          {pluginToolbarItems.map((item) => (
            <Tooltip key={item.id} title={item.label}>
              <Box
                onClick={() => globalCommandRegistry.execute(item.command).catch(console.error)}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 0.5, cursor: 'pointer',
                  color: '#ccc', userSelect: 'none', flexShrink: 0,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                }}
              >
                {item.icon.startsWith('<svg') ? (
                  <Box component="span" sx={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    dangerouslySetInnerHTML={{ __html: item.icon }} />
                ) : (
                  <Typography sx={{ fontSize: 13 }}>{item.icon}</Typography>
                )}
              </Box>
            </Tooltip>
          ))}
        </Box>
      )}

      {/* ── Main area wrapper (editors + terminal) ── */}
      <Box ref={mainAreaRef} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>

      {/* ── Mobile full-screen agent panel (replaces editors on mobile when open) ── */}
      {enableAgent && isMobile && agentPanelOpen && (
        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden', bgcolor: '#1e1e1e' }}>
          <button
            type="button"
            onClick={() => setAgentPanelOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 16px', height: 44, flexShrink: 0,
              background: '#252526', border: 'none', borderBottom: '1px solid #3c3c3c',
              color: '#ccc', fontSize: 13, cursor: 'pointer', width: '100%',
              touchAction: 'manipulation', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
            <span>AI Agent</span>
          </button>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <AgentPanel
              provider={provider}
              defaultConfig={defaultAgentConfig}
              onFileOpen={handleFileOpen}
              injectedClaudeMd={agentClaudeMd}
              authToken={agentAuthToken}
              webFetchUrl={agentWebFetchUrl}
              onFileWritten={handleAgentFileWritten}
            />
          </Box>
        </Box>
      )}

      {/* ── Editors area: Activity Bar + Sidebar + Splitter + Editor Groups ── */}
      <Box ref={splitterContainerRef} sx={{ display: isMobile && agentPanelOpen ? 'none' : 'flex', flexGrow: 1, overflow: 'hidden' }}>

        {/* Activity Bar */}
        <Box sx={{
          width: ACTIVITY_BAR_W,
          bgcolor: '#333333',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 0.5,
          flexShrink: 0,
          borderRight: '1px solid #2b2b2b',
        }}>
          {([
            ['explorer', ExplorerIcon, 'Explorer'],
            ['search', SearchIcon, 'Search'],
            ['extensions', ExtensionsIcon, 'Extensions'],
          ] as const).map(([panel, Icon, title]) => (
            <Box
              key={panel}
              onClick={() => togglePanel(panel)}
              title={title}
              sx={{
                width: ACTIVITY_BAR_W,
                height: ACTIVITY_BAR_W,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderLeft: sidebarPanel === panel ? '2px solid #fff' : '2px solid transparent',
                opacity: sidebarPanel === panel ? 1 : 0.6,
                '&:hover': { opacity: 1 },
              }}
            >
              <Icon active={sidebarPanel === panel} />
            </Box>
          ))}

          {/* Plugin sidebar contributions */}
          {pluginSidebarPanels.map((panel) => (
            <Box
              key={panel.id}
              onClick={() => togglePanel(panel.id)}
              title={panel.title}
              sx={{
                width: ACTIVITY_BAR_W,
                height: ACTIVITY_BAR_W,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderLeft: sidebarPanel === panel.id ? '2px solid #fff' : '2px solid transparent',
                opacity: sidebarPanel === panel.id ? 1 : 0.6,
                '&:hover': { opacity: 1 },
                userSelect: 'none',
                color: sidebarPanel === panel.id ? '#fff' : '#858585',
                '& svg': { width: 24, height: 24, stroke: 'currentColor' },
              }}
            >
              {panel.icon.trimStart().startsWith('<svg') ? (
                <Box
                  dangerouslySetInnerHTML={{ __html: panel.icon }}
                  sx={{ display: 'flex', alignItems: 'center' }}
                />
              ) : (
                <Box sx={{ fontSize: 13, fontWeight: 700 }}>{panel.icon}</Box>
              )}
            </Box>
          ))}
        </Box>

        {/* Sidebar panel */}
        {sidebarOpen && (
          <Box sx={{
            width: `${splitRatio * 100}%`,
            flexShrink: 0,
            overflow: 'hidden',
            minWidth: MIN_PANEL_PX,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#252526',
          }}>
            {/* Sidebar header */}
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid #3c3c3c', display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb', flex: 1 }}>
                {sidebarPanel === 'explorer' && 'Explorer'}
                {sidebarPanel === 'search' && 'Search'}
                {sidebarPanel === 'extensions' && 'Extensions'}
                {sidebarPanel !== 'explorer' && sidebarPanel !== 'search' && sidebarPanel !== 'extensions' && (
                  pluginSidebarPanels.find(p => p.id === sidebarPanel)?.title ?? sidebarPanel
                )}
              </Typography>
              {sidebarPanel === 'explorer' && (
                <Box
                  component="button"
                  onClick={() => explorerRefreshRef.current?.()}
                  title="Refresh Explorer"
                  sx={{
                    all: 'unset', cursor: 'pointer', color: '#858585', p: 0.25, borderRadius: 0.5, lineHeight: 0,
                    '&:hover': { color: '#ccc', bgcolor: 'rgba(255,255,255,0.06)' },
                    touchAction: 'manipulation',
                  }}
                >
                  {/* Refresh icon */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.6 0 3 .67 4 1.74" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    <path d="M12 1v3.5H8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Box>
              )}
            </Box>

            {/* Sidebar content */}
            <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: sidebarPanel === 'explorer' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <VfsExplorer
                  provider={provider}
                  rootPath="/"
                  height="100%"
                  onFileOpen={handleFileOpen}
                  readOnly={readOnly}
                  showBreadcrumbs={false}
                  providerRegistry={providerRegistry}
                  defaultMountPresets={defaultMountPresets}
                  refreshRef={explorerRefreshRef}
                  revealPathsRef={explorerRevealRef}
                  selectedPath={activeGroup.activeTab ?? undefined}
                  projectDeps={projectDeps}
                  onDialogAction={onDialogAction}
                  onOutputLine={handleOutputLine}
                  onActionRunningChange={handleActionRunningChange}
                  hideOutput
                />
              </Box>

              {sidebarPanel === 'search' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  {/* Search inputs */}
                  <Box sx={{ p: 1, flexShrink: 0 }}>
                    {/* Search row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      {/* Toggle replace */}
                      <Box
                        onClick={() => setShowReplace(v => !v)}
                        title={showReplace ? 'Collapse Replace' : 'Expand Replace'}
                        sx={{ color: '#858585', cursor: 'pointer', fontSize: 14, lineHeight: 1, px: 0.25, '&:hover': { color: '#ccc' } }}
                      >
                        {showReplace ? '▾' : '▸'}
                      </Box>

                      <TextField
                        size="small"
                        placeholder="Search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        fullWidth
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <SearchInputIcon />
                              </InputAdornment>
                            ),
                            endAdornment: (
                              <InputAdornment position="end">
                                <Box sx={{ display: 'flex', gap: 0.25 }}>
                                  <Tooltip title="Match Case">
                                    <Box
                                      onClick={() => setSearchCaseSensitive(v => !v)}
                                      sx={{
                                        px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                        color: searchCaseSensitive ? '#fff' : '#858585',
                                        bgcolor: searchCaseSensitive ? '#007acc' : 'transparent',
                                        '&:hover': { bgcolor: searchCaseSensitive ? '#007acc' : 'rgba(255,255,255,0.1)' },
                                        userSelect: 'none',
                                      }}
                                    >Aa</Box>
                                  </Tooltip>
                                  <Tooltip title="Match Whole Word">
                                    <Box
                                      onClick={() => setSearchWholeWord(v => !v)}
                                      sx={{
                                        px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                        color: searchWholeWord ? '#fff' : '#858585',
                                        bgcolor: searchWholeWord ? '#007acc' : 'transparent',
                                        '&:hover': { bgcolor: searchWholeWord ? '#007acc' : 'rgba(255,255,255,0.1)' },
                                        userSelect: 'none',
                                      }}
                                    >ab</Box>
                                  </Tooltip>
                                  <Tooltip title="Use Regular Expression">
                                    <Box
                                      onClick={() => setSearchUseRegex(v => !v)}
                                      sx={{
                                        px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                        color: searchUseRegex ? '#fff' : '#858585',
                                        bgcolor: searchUseRegex ? '#007acc' : 'transparent',
                                        '&:hover': { bgcolor: searchUseRegex ? '#007acc' : 'rgba(255,255,255,0.1)' },
                                        userSelect: 'none',
                                      }}
                                    >.*</Box>
                                  </Tooltip>
                                </Box>
                              </InputAdornment>
                            ),
                            sx: {
                              fontSize: 13, bgcolor: '#3c3c3c', color: '#ccc',
                              '& fieldset': { border: 'none' }, borderRadius: 0.5,
                            },
                          },
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                      />
                    </Box>

                    {/* Replace row */}
                    <Collapse in={showReplace}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Box sx={{ width: 18 }} /> {/* indent to align with search input */}
                        <TextField
                          size="small"
                          placeholder="Replace"
                          value={replaceQuery}
                          onChange={(e) => setReplaceQuery(e.target.value)}
                          fullWidth
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: 13, bgcolor: '#3c3c3c', color: '#ccc',
                                '& fieldset': { border: 'none' }, borderRadius: 0.5,
                              },
                            },
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        />
                      </Box>
                    </Collapse>

                    {/* Directory filter */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Box sx={{ width: 18 }} />
                      <TextField
                        size="small"
                        placeholder="Search in folder (default: /)"
                        value={searchDir}
                        onChange={(e) => setSearchDir(e.target.value)}
                        fullWidth
                        slotProps={{
                          input: {
                            sx: {
                              fontSize: 12, bgcolor: '#3c3c3c', color: '#ccc',
                              '& fieldset': { border: 'none' }, borderRadius: 0.5,
                            },
                          },
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                      />
                    </Box>

                    {/* Action buttons */}
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, ml: '22px' }}>
                      <Box
                        onClick={handleSearch}
                        sx={{
                          px: 1, py: 0.375, borderRadius: 0.5, cursor: 'pointer', fontSize: 12,
                          bgcolor: '#007acc', color: '#fff', userSelect: 'none',
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          '&:hover': { bgcolor: '#005f9e' },
                          opacity: searchLoading ? 0.6 : 1,
                          pointerEvents: searchLoading ? 'none' : undefined,
                        }}
                      >
                        {searchLoading && <CircularProgress size={10} sx={{ color: '#fff' }} />}
                        Find All
                      </Box>
                      {showReplace && (
                        <Box
                          onClick={handleReplaceAll}
                          sx={{
                            px: 1, py: 0.375, borderRadius: 0.5, cursor: 'pointer', fontSize: 12,
                            bgcolor: '#3c3c3c', color: '#ccc', userSelect: 'none',
                            border: '1px solid #555',
                            '&:hover': { bgcolor: '#4c4c4c' },
                            opacity: searchResults.length === 0 ? 0.4 : 1,
                            pointerEvents: searchResults.length === 0 ? 'none' : undefined,
                          }}
                        >
                          Replace All
                        </Box>
                      )}
                    </Box>

                    {/* Status */}
                    {searchError && (
                      <Typography sx={{ color: '#f48771', fontSize: 11, mt: 0.5, ml: '22px' }}>
                        {searchError}
                      </Typography>
                    )}
                    {searchDone && !searchLoading && (
                      <Typography sx={{ color: '#858585', fontSize: 11, mt: 0.5, ml: '22px' }}>
                        {searchResults.length === 0
                          ? 'No results found.'
                          : `${searchResults.reduce((n, r) => n + r.matches.length, 0)} results in ${searchResults.length} file${searchResults.length !== 1 ? 's' : ''}`}
                      </Typography>
                    )}
                  </Box>

                  {/* Results list */}
                  <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    {searchResults.map((result) => (
                      <Box key={result.path}>
                        {/* File header */}
                        <Box
                          onClick={() => toggleResultCollapse(result.path)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.5,
                            px: 1, py: 0.5, cursor: 'pointer',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                            borderTop: '1px solid #2d2d2d',
                          }}
                        >
                          <Typography sx={{ fontSize: 11, color: '#ccc', mr: 0.25 }}>
                            {result.collapsed ? '▸' : '▾'}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: '#ccc', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={result.path}>
                            {result.path.split('/').pop()}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: '#858585', flexShrink: 0 }}>
                            {result.matches.length}
                          </Typography>
                          {showReplace && (
                            <Tooltip title="Replace in this file">
                              <Box
                                onClick={(e) => { e.stopPropagation(); handleReplaceInFile(result); }}
                                sx={{
                                  ml: 0.5, px: 0.5, py: 0.125, borderRadius: 0.5, cursor: 'pointer', fontSize: 11,
                                  color: '#858585', '&:hover': { color: '#ccc', bgcolor: 'rgba(255,255,255,0.1)' },
                                  userSelect: 'none',
                                }}
                              >↺</Box>
                            </Tooltip>
                          )}
                        </Box>
                        <Typography
                          sx={{ fontSize: 10, color: '#606060', px: 1, pb: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: result.collapsed ? 'none' : 'block' }}
                          title={result.path}
                        >
                          {result.path}
                        </Typography>

                        {/* Match lines */}
                        <Collapse in={!result.collapsed}>
                          {result.matches.map((match, mi) => (
                            <Box
                              key={mi}
                              onClick={() => handleGoToMatch(result.path, match.line, match.col)}
                              sx={{
                                pl: 2.5, pr: 1, py: 0.25, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 0.75,
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                              }}
                            >
                              <Typography sx={{ fontSize: 10, color: '#606060', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                                {match.line}
                              </Typography>
                              <Typography
                                sx={{ fontSize: 12, color: '#ccc', overflow: 'hidden', whiteSpace: 'nowrap', fontFamily: 'monospace' }}
                                component="span"
                              >
                                {match.lineText.slice(0, match.matchStart)}
                                <Box
                                  component="span"
                                  sx={{ bgcolor: 'rgba(234,92,0,0.5)', borderRadius: '2px', color: '#fff' }}
                                >
                                  {match.lineText.slice(match.matchStart, match.matchEnd)}
                                </Box>
                                {match.lineText.slice(match.matchEnd)}
                              </Typography>
                            </Box>
                          ))}
                        </Collapse>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {sidebarPanel === 'extensions' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                  {pluginInfos.length === 0 ? (
                    <Box sx={{ p: 2 }}>
                      <Typography sx={{ color: '#858585', fontSize: 13 }}>No plugins installed.</Typography>
                    </Box>
                  ) : (
                    pluginInfos.map((info) => (
                      <Box
                        key={info.manifest.id}
                        sx={{
                          px: 1.5, py: 1,
                          borderBottom: '1px solid #2d2d2d',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: 13, color: '#ccc', flexGrow: 1 }}>
                            {info.manifest.name}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: '#606060' }}>
                            v{info.manifest.version}
                          </Typography>
                          <Box
                            onClick={() => {
                              if (info.state === 'active') {
                                globalPluginRegistry.deactivate(info.manifest.id);
                              } else if (info.state === 'inactive') {
                                globalPluginRegistry.activate(info.manifest.id);
                              }
                            }}
                            sx={{
                              px: 0.75, py: 0.25, borderRadius: 0.5,
                              cursor: info.state === 'activating' || info.state === 'deactivating' ? 'default' : 'pointer',
                              fontSize: 11,
                              color: info.state === 'active' ? '#4fc3f7' : info.state === 'error' ? '#f48771' : '#858585',
                              border: '1px solid',
                              borderColor: info.state === 'active' ? '#4fc3f7' : info.state === 'error' ? '#f48771' : '#555',
                              userSelect: 'none',
                              '&:hover': { opacity: 0.8 },
                            }}
                          >
                            {info.state === 'active' ? 'Disable' : info.state === 'error' ? 'Error' : info.state === 'activating' ? '...' : 'Enable'}
                          </Box>
                        </Box>
                        {info.manifest.description && (
                          <Typography sx={{ fontSize: 11, color: '#606060', mt: 0.25 }}>
                            {info.manifest.description}
                          </Typography>
                        )}
                        {info.error && (
                          <Typography sx={{ fontSize: 11, color: '#f48771', mt: 0.25 }}>
                            {info.error.message}
                          </Typography>
                        )}
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {/* Plugin sidebar panels */}
              {pluginSidebarPanels.map((panel) => (
                sidebarPanel === panel.id && (
                  <Box key={panel.id} sx={{ flexGrow: 1, overflow: 'auto' }}>
                    <panel.component />
                  </Box>
                )
              ))}
            </Box>
          </Box>
        )}

        {/* Sidebar splitter */}
        {sidebarOpen && (
          <Box
            onMouseDown={handleSplitterMouseDown}
            onTouchStart={handleSplitterTouchStart}
            sx={{
              width: isMobile ? 10 : 5,
              cursor: 'col-resize',
              bgcolor: '#2d2d2d',
              flexShrink: 0,
              touchAction: 'none',
              '&:hover': { bgcolor: '#007acc' },
              '&:active': { bgcolor: '#007acc' },
              transition: 'background-color 0.15s',
            }}
          />
        )}

        {/* Editor groups area */}
        <Box ref={editorGroupsContainerRef} sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', minWidth: MIN_PANEL_PX }}>
          {groups.map((group, idx) => (
            <Box key={group.id} sx={{ display: 'contents' }}>
              {/* Group splitter (between groups) */}
              {idx > 0 && (
                <Box
                  onMouseDown={(e) => handleGroupSplitterMouseDown(e, groups[idx - 1].id, group.id)}
                  sx={{
                    width: 5,
                    cursor: 'col-resize',
                    bgcolor: '#2d2d2d',
                    flexShrink: 0,
                    '&:hover': { bgcolor: '#007acc' },
                    transition: 'background-color 0.15s',
                  }}
                />
              )}
              <EditorGroupPane
                group={group}
                isActive={group.id === activeGroupId}
                modelManager={modelManagerRef.current!}
                readOnly={readOnly}
                onTabSwitch={handleTabSwitch}
                onTabClose={handleTabClose}
                onFocus={handleGroupFocus}
                onSave={handleGroupSave}
                onSplit={handleSplit}
                onCursorChange={handleCursorChange}
                onContentChange={handleContentChange}
                navPendingRef={group.id === activeGroupId ? pendingNavRef : undefined}
                minimapEnabled={minimapEnabled}
                wordWrap={wordWrap}
                showBreadcrumbs={showBreadcrumbs}
                formatOnSave={formatOnSave}
                onGoToFile={handleGoToFileOpen}
                onToggleMinimap={handleToggleMinimap}
                onToggleWordWrap={handleToggleWordWrap}
                pluginContextMenuItems={pluginContextMenuItems}
                pluginCommandPaletteItems={pluginCommandPaletteItems}
              />
            </Box>
          ))}
        </Box>

        {/* Agent panel splitter (desktop only) */}
        {enableAgent && agentPanelOpen && !isMobile && (
          <Box
            onMouseDown={handleAgentSplitterMouseDown}
            sx={{
              width: 5,
              cursor: 'col-resize',
              bgcolor: '#2d2d2d',
              flexShrink: 0,
              '&:hover': { bgcolor: '#007acc' },
              transition: 'background-color 0.15s',
            }}
          />
        )}

        {/* Agent panel — inline on desktop */}
        {enableAgent && agentPanelOpen && !isMobile && (
          <Box sx={{
            width: agentPanelWidth,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <AgentPanel
              provider={provider}
              defaultConfig={defaultAgentConfig}
              onFileOpen={handleFileOpen}
              injectedClaudeMd={agentClaudeMd}
              authToken={agentAuthToken}
              webFetchUrl={agentWebFetchUrl}
              onFileWritten={handleAgentFileWritten}
            />
          </Box>
        )}


        {/* Right Activity Bar (Agent) */}
        {enableAgent && (
          <Box sx={{
            width: ACTIVITY_BAR_W,
            bgcolor: '#333333',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 0.5,
            flexShrink: 0,
            borderLeft: '1px solid #2b2b2b',
          }}>
            <Box
              onClick={() => setAgentPanelOpen(p => !p)}
              title="AI Agent (Ctrl+Shift+I)"
              sx={{
                width: ACTIVITY_BAR_W,
                height: ACTIVITY_BAR_W,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRight: agentPanelOpen ? '2px solid #fff' : '2px solid transparent',
                opacity: agentPanelOpen ? 1 : 0.6,
                '&:hover': { opacity: 1 },
              }}
            >
              <AgentIcon active={agentPanelOpen} />
            </Box>
          </Box>
        )}
      </Box>

      {/* ── Bottom panel (terminal + output tabs) ── */}
      {bottomPanelOpen && (
        <>
          <Box
            onMouseDown={handleBottomSplitterMouseDown}
            sx={{ height: 5, cursor: 'row-resize', bgcolor: '#2d2d2d', flexShrink: 0, '&:hover': { bgcolor: '#007acc' }, transition: 'background-color 0.15s' }}
          />
          <Box sx={{ height: bottomPanelHeight, flexShrink: 0, overflow: 'hidden', borderTop: '1px solid #3c3c3c' }}>
            <BottomPanel
              tabs={bottomTabs}
              activeTabId={activeBottomTabId}
              onTabChange={setActiveBottomTabId}
              onAddTerminal={handleAddTerminal}
              onCloseTab={handleCloseTab}
              wsUrl={terminalWsUrl}
              token={terminalToken}
              onConfigRequest={onTerminalConfigRequest}
              enableTerminal={enableTerminal}
            />
          </Box>
        </>
      )}

      </Box>

      {/* ── Status Bar ── */}
      <Box sx={{
        height: STATUS_BAR_H,
        bgcolor: '#007acc',
        display: 'flex',
        alignItems: 'center',
        px: 1.5,
        flexShrink: 0,
        gap: 2,
        userSelect: 'none',
      }}>
        <Box
          onClick={() => setBottomPanelOpen(p => !p)}
          title="Toggle Output Panel"
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
            px: 0.5, borderRadius: 0.5,
            opacity: bottomPanelOpen ? 1 : 0.7,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', opacity: 1 },
          }}
        >
          <TerminalIcon active />
          <Typography sx={{ fontSize: 11, color: '#fff' }}>{enableTerminal ? 'Terminal' : 'Output'}</Typography>
        </Box>
        {activeGroup?.activeTab ? (
          <>
            <Typography sx={{ fontSize: 12, color: '#fff' }}>
              Ln {cursorInfo.ln}, Col {cursorInfo.col}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#fff' }}>UTF-8</Typography>
            <Typography sx={{ fontSize: 12, color: '#fff', textTransform: 'capitalize' }}>{activeLang}</Typography>
            {groups.length > 1 && (
              <Typography sx={{ fontSize: 12, color: '#fff', opacity: 0.7 }}>
                Group {groups.findIndex(g => g.id === activeGroupId) + 1}/{groups.length}
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: '#fff', opacity: 0.7 }}>Ready</Typography>
        )}

        {/* Plugin statusbar items — left-aligned */}
        {pluginStatusBarItems
          .filter(item => item.alignment !== 'right')
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .map((item) => (
            <Tooltip key={item.id} title={item.tooltip ?? ''}>
              <Typography
                onClick={item.command ? () => globalCommandRegistry.execute(item.command!).catch(console.error) : undefined}
                sx={{
                  fontSize: 12, color: '#fff', cursor: item.command ? 'pointer' : 'default',
                  '&:hover': item.command ? { opacity: 0.8 } : undefined,
                }}
              >
                {item.text}
              </Typography>
            </Tooltip>
          ))
        }

        <Box sx={{ flexGrow: 1 }} />

        {/* Plugin statusbar items — right-aligned */}
        {pluginStatusBarItems
          .filter(item => item.alignment === 'right')
          .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
          .map((item) => (
            <Tooltip key={item.id} title={item.tooltip ?? ''}>
              <Typography
                onClick={item.command ? () => globalCommandRegistry.execute(item.command!).catch(console.error) : undefined}
                sx={{
                  fontSize: 12, color: '#fff', cursor: item.command ? 'pointer' : 'default',
                  '&:hover': item.command ? { opacity: 0.8 } : undefined,
                }}
              >
                {item.text}
              </Typography>
            </Tooltip>
          ))
        }

        {activeTabObj?.modified && (
          <Typography sx={{ fontSize: 12, color: '#fff' }}>Modified</Typography>
        )}
      </Box>

      {/* ── Go to File Dialog ── */}
      <GoToFileDialog
        open={goToFileOpen}
        files={allVfsFiles}
        loading={goToFileLoading}
        onClose={() => setGoToFileOpen(false)}
        onSelect={handleGoToFileSelect}
      />
    </Box>
  );
}

