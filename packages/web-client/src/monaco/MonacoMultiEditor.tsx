import { useState, useRef, useCallback, useEffect, memo } from 'react';
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
import type { FileSystemProvider } from '@mhersztowski/core';
import { decodeText, encodeText } from '@mhersztowski/core';

import { VfsExplorer } from '../vfs/VfsExplorer';
import type { VfsProviderDef } from '../vfs/providerRegistry';
import { EditorInstance } from './core/EditorInstance';
import { ModelManager } from './core/ModelManager';
import { KeyMod, KeyCode } from './core/CommandRegistry';
import type { DocumentUri } from './utils/types';
import { createDocumentUri } from './utils/types';

/* ── Types ── */

export interface MonacoMultiEditorProps {
  provider: FileSystemProvider;
  height?: number | string;
  readOnly?: boolean;
  providerRegistry?: VfsProviderDef[];
  onFileSave?: (path: string, content: Uint8Array) => void | Promise<void>;
}

interface TabInfo {
  path: string;
  label: string;
  modified: boolean;
  uri: DocumentUri;
}

interface EditorGroup {
  id: string;
  tabs: TabInfo[];
  activeTab: string | null;
  /** Flex size weight (default 1). Adjusted by group splitters. */
  size: number;
}

type SidebarPanel = 'explorer' | 'search' | 'extensions' | null;

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

/* ── Constants ── */

const MIN_PANEL_PX = 180;
const ACTIVITY_BAR_W = 48;
const MENU_BAR_H = 30;
const STATUS_BAR_H = 22;

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
}: EditorGroupPaneProps) {
  const editorRef = useRef<EditorInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewStateRef = useRef<Map<string, { scrollTop: number; scrollLeft: number; lineNumber: number; column: number }>>(new Map());
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const groupIdRef = useRef(group.id);
  groupIdRef.current = group.id;

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
      fontSize: 14,
    });
    editorRef.current = editor;

    const saveAction = editor.getMonacoEditor().addAction({
      id: 'file.save',
      label: 'Save File',
      keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
      run: () => { saveRef.current(groupIdRef.current); },
    });

    const splitAction = editor.getMonacoEditor().addAction({
      id: 'editor.splitRight',
      label: 'Split Editor Right',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Backslash],
      run: () => { onSplit(groupIdRef.current); },
    });

    return () => {
      saveAction.dispose();
      splitAction.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Track content changes → parent
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sub = editor.on('contentChanged', () => {
      if (group.activeTab) onContentChange(group.id, group.activeTab);
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
      const vs = viewStateRef.current.get(group.activeTab);
      if (vs) {
        editor.setCursorPosition(vs.lineNumber, vs.column);
        editor.getMonacoEditor().setScrollPosition({ scrollTop: vs.scrollTop, scrollLeft: vs.scrollLeft });
      }
      editor.focus();
    }
  }, [group.activeTab, group.tabs, modelManager]);

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

      {/* Editor container */}
      <Box
        ref={containerRef}
        sx={{
          flexGrow: 1,
          overflow: 'hidden',
          display: group.tabs.length > 0 ? 'block' : 'flex',
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
}: MonacoMultiEditorProps) {
  const [groups, setGroups] = useState<EditorGroup[]>(() => [{ id: makeGroupId(), tabs: [], activeTab: null, size: 1 }]);
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0].id);
  const [splitRatio, setSplitRatio] = useState(0.25);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>('explorer');
  const [cursorInfo, setCursorInfo] = useState({ ln: 1, col: 1 });
  const [searchQuery, setSearchQuery] = useState('');

  // Menu anchors
  const [fileMenuAnchor, setFileMenuAnchor] = useState<null | HTMLElement>(null);
  const [editMenuAnchor, setEditMenuAnchor] = useState<null | HTMLElement>(null);

  const modelManagerRef = useRef<ModelManager | null>(null);
  const splitterContainerRef = useRef<HTMLDivElement | null>(null);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  // Initialize ModelManager once
  if (!modelManagerRef.current) {
    modelManagerRef.current = new ModelManager();
  }

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? groups[0];
  const activeTabObj = activeGroup?.tabs.find(t => t.path === activeGroup.activeTab);
  const activeLang = activeTabObj ? detectLanguage(activeTabObj.path) : '';
  const sidebarOpen = sidebarPanel !== null;

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
      const stillOpenElsewhere = prev.some((g, i) => i !== groupIdx && g.tabs.some(t => t.path === path));
      if (!stillOpenElsewhere) {
        const tab = group.tabs[tabIndex];
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

  // Splitter drag (sidebar)
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitterContainerRef.current;
    if (!container) return;

    const startX = e.clientX;
    const containerRect = container.getBoundingClientRect();
    const startRatio = splitRatio;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

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
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [splitRatio]);

  // Activity bar toggle
  const togglePanel = useCallback((panel: SidebarPanel) => {
    setSidebarPanel(prev => prev === panel ? null : panel);
  }, []);

  // Editor commands for Edit menu — trigger on the active group's editor
  // Focus the active group's editor so keyboard shortcuts work from menu
  const focusActiveEditor = useCallback(() => {
    const containers = splitterContainerRef.current?.querySelectorAll<HTMLElement>('.monaco-editor');
    if (containers) {
      // Focus the first monaco editor in the active group area
      for (const el of containers) {
        const textarea = el.querySelector('textarea');
        if (textarea) { textarea.focus(); break; }
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, overflow: 'hidden', bgcolor: '#1e1e1e' }}>

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
        </Menu>
      </Box>

      {/* ── Main area: Activity Bar + Sidebar + Splitter + Editor Groups ── */}
      <Box ref={splitterContainerRef} sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

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
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid #3c3c3c' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#bbb' }}>
                {sidebarPanel === 'explorer' && 'Explorer'}
                {sidebarPanel === 'search' && 'Search'}
                {sidebarPanel === 'extensions' && 'Extensions'}
              </Typography>
            </Box>

            {/* Sidebar content */}
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
              {sidebarPanel === 'explorer' && (
                <VfsExplorer
                  provider={provider}
                  rootPath="/"
                  height="100%"
                  onFileOpen={handleFileOpen}
                  readOnly={readOnly}
                  showBreadcrumbs={false}
                  providerRegistry={providerRegistry}
                />
              )}

              {sidebarPanel === 'search' && (
                <Box sx={{ p: 1 }}>
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
                        sx: {
                          fontSize: 13,
                          bgcolor: '#3c3c3c',
                          color: '#ccc',
                          '& fieldset': { border: 'none' },
                          borderRadius: 0.5,
                        },
                      },
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery) {
                        focusActiveEditor();
                      }
                    }}
                  />
                  <Typography sx={{ color: '#6e6e6e', fontSize: 12, mt: 1.5, px: 0.5 }}>
                    Type and press Enter to search in editor.
                  </Typography>
                </Box>
              )}

              {sidebarPanel === 'extensions' && (
                <Box sx={{ p: 2, color: '#6e6e6e', fontSize: 13 }}>
                  <Typography sx={{ color: '#858585', fontSize: 13 }}>
                    Language support loaded from Monaco Editor.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* Sidebar splitter */}
        {sidebarOpen && (
          <Box
            onMouseDown={handleSplitterMouseDown}
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
              />
            </Box>
          ))}
        </Box>
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
            <Box sx={{ flexGrow: 1 }} />
            {activeTabObj?.modified && (
              <Typography sx={{ fontSize: 12, color: '#fff' }}>Modified</Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: '#fff', opacity: 0.7 }}>Ready</Typography>
        )}
      </Box>
    </Box>
  );
}

