/**
 * Markdown Editor Plugin
 *
 * Single persistent virtual tab that tracks the active .md file.
 * Toolbar items (bold, italic, headings, lists…) appear when a .md file is active
 * and emit mde:command events picked up by the mounted MdEditor instance.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { defineEditorPlugin, globalEventBus } from '@mhersztowski/web-client';
import { MdEditor } from '../components/mdeditor';
import { useMqtt } from '../modules/mqttclient/MqttContext';

/* ── Module-level active-file store ─────────────────────────────────────── */

const EDITOR_TAB_URI = 'virtual://markdown-editor';

let _activeUri = '';
const _uriListeners = new Set<() => void>();
let _vfsUnsub: (() => void) | null = null;

function setActiveUri(uri: string) {
  if (_activeUri === uri) return;
  _activeUri = uri;
  _uriListeners.forEach((fn) => fn());
}

function useActiveUri(): string {
  const [uri, setUri] = useState(_activeUri);
  useEffect(() => {
    const fn = () => setUri(_activeUri);
    _uriListeners.add(fn);
    return () => { _uriListeners.delete(fn); };
  }, []);
  return uri;
}

function vfsToMqttPath(uri: string): string {
  if (uri.startsWith('/home/')) return uri.slice('/home/'.length);
  return uri.startsWith('/') ? uri.slice(1) : uri;
}

function isMarkdownUri(uri: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(uri);
}

/* ── SVG icons ───────────────────────────────────────────────────────────── */

const ICON_MD = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <rect x="1" y="2.5" width="14" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
  <path d="M3.5 10.5V5.5l2.5 3 2.5-3v5M11 5.5v5M9.5 8.5H11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_BOLD = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M4.5 3h4a2.5 2.5 0 0 1 0 5H4.5V3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M4.5 8h4.5a2.75 2.75 0 0 1 0 5.5H4.5V8Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
</svg>`;

const ICON_ITALIC = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M6.5 3h4M5.5 13h4M9.5 3l-3 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

const ICON_STRIKE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M5.5 8c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5M5.5 8C5.5 6.62 6.62 5.5 8 5.5s2.5 1.12 2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

const ICON_H1 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M2 3v10M2 8h5M7 3v10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M11 6l1.5-1.5V13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_H2 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M2 3v10M2 8h5M7 3v10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M10.5 7a1.5 1.5 0 0 1 3 0c0 .8-.6 1.4-1.5 2.5H13.5V11h-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_H3 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M2 3v10M2 8h5M7 3v10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M10.5 7a1.5 1.5 0 0 1 3 0 1.5 1.5 0 0 1-1.5 1.5 1.5 1.5 0 0 1 1.5 1.5 1.5 1.5 0 0 1-3 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_BULLET = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <circle cx="3" cy="4.5" r="1" fill="currentColor"/>
  <circle cx="3" cy="8" r="1" fill="currentColor"/>
  <circle cx="3" cy="11.5" r="1" fill="currentColor"/>
  <path d="M6 4.5h7M6 8h7M6 11.5h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

const ICON_ORDERED = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M2 3.5h1.5V7M2 7h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2 9c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5L2 11.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M7 4.5h7M7 8h7M7 11.5h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

const ICON_QUOTE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <path d="M3 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M6 5h7M6 8h7M6 11h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

/* ── Panel component ─────────────────────────────────────────────────────── */

function MarkdownEditorPanel() {
  const { readFile, writeFile, isConnected } = useMqtt();
  const fileUri = useActiveUri();
  const mqttPath = fileUri ? vfsToMqttPath(fileUri) : '';

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFileRef = useRef(readFile);
  useEffect(() => { readFileRef.current = readFile; }, [readFile]);
  const writeFileRef = useRef(writeFile);
  useEffect(() => { writeFileRef.current = writeFile; }, [writeFile]);

  useEffect(() => {
    if (!mqttPath || !isConnected) { setContent(null); return; }
    let cancelled = false;
    setContent(null);
    setError(null);
    readFileRef.current(mqttPath)
      .then((f) => { if (!cancelled) setContent(f.content); })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [isConnected, mqttPath]);

  const handleSave = useCallback(async (markdown: string) => {
    if (!mqttPath) return;
    try { await writeFileRef.current(mqttPath, markdown); }
    catch (e) { console.error('[MarkdownEditorPlugin] save error:', e); }
  }, [mqttPath]);

  if (!fileUri || !isMarkdownUri(fileUri)) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', bgcolor: '#fff' }}>
        <Typography sx={{ color: '#888', fontSize: 13 }}>
          No markdown file is active. Open a .md file first.
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2, bgcolor: '#fff', color: '#c62828', fontFamily: 'monospace', fontSize: 13 }}>
        <Typography sx={{ fontWeight: 600, mb: 0.5, fontSize: 13 }}>Failed to load file</Typography>
        {error}
      </Box>
    );
  }

  if (content === null) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1.5, bgcolor: '#fff' }}>
        <CircularProgress size={20} />
        <Typography sx={{ color: '#888', fontSize: 13 }}>
          {isConnected ? `Loading ${mqttPath}…` : 'Waiting for MQTT connection…'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', bgcolor: '#fff' }}>
      <MdEditor
        key={fileUri}
        initialContent={content}
        onSave={handleSave}
        autoSaveDelay={2000}
      />
    </Box>
  );
}

/* ── Plugin definition ───────────────────────────────────────────────────── */

function emit(type: string) {
  globalEventBus.emit('mde:command', { type });
}

export const MarkdownEditorPlugin = defineEditorPlugin(
  {
    id: 'builtin.markdown-editor',
    name: 'Markdown Editor',
    version: '1.2.0',
    description: 'Single persistent tab that follows the active .md file',
    contributes: ['toolbar', 'commandpalette'],
  },

  (api) => {
    type ToolbarDisposable = ReturnType<typeof api.ui.toolbar.register> | null;

    let disposables: ToolbarDisposable[] = [];

    function clearToolbar() {
      disposables.forEach((d) => d?.dispose());
      disposables = [];
    }

    function buildToolbar() {
      clearToolbar();
      disposables = [
        api.ui.toolbar.register({ id: 'mde.open',    label: 'Open Markdown Editor', icon: ICON_MD,      command: `${api.pluginId}:open`,        group: 'right', order: 110 }),
        api.ui.toolbar.register({ id: 'mde.bold',    label: 'Bold',                 icon: ICON_BOLD,    command: `${api.pluginId}:bold`,        group: 'right', order: 111 }),
        api.ui.toolbar.register({ id: 'mde.italic',  label: 'Italic',               icon: ICON_ITALIC,  command: `${api.pluginId}:italic`,      group: 'right', order: 112 }),
        api.ui.toolbar.register({ id: 'mde.strike',  label: 'Strikethrough',        icon: ICON_STRIKE,  command: `${api.pluginId}:strike`,      group: 'right', order: 113 }),
        api.ui.toolbar.register({ id: 'mde.h1',      label: 'Heading 1',            icon: ICON_H1,      command: `${api.pluginId}:h1`,          group: 'right', order: 114 }),
        api.ui.toolbar.register({ id: 'mde.h2',      label: 'Heading 2',            icon: ICON_H2,      command: `${api.pluginId}:h2`,          group: 'right', order: 115 }),
        api.ui.toolbar.register({ id: 'mde.h3',      label: 'Heading 3',            icon: ICON_H3,      command: `${api.pluginId}:h3`,          group: 'right', order: 116 }),
        api.ui.toolbar.register({ id: 'mde.bullet',  label: 'Bullet List',          icon: ICON_BULLET,  command: `${api.pluginId}:bulletList`,  group: 'right', order: 117 }),
        api.ui.toolbar.register({ id: 'mde.ordered', label: 'Ordered List',         icon: ICON_ORDERED, command: `${api.pluginId}:orderedList`, group: 'right', order: 118 }),
        api.ui.toolbar.register({ id: 'mde.quote',   label: 'Blockquote',           icon: ICON_QUOTE,   command: `${api.pluginId}:blockquote`,  group: 'right', order: 119 }),
      ];
    }

    function updateToolbar(uri: string | undefined) {
      if (uri && isMarkdownUri(uri)) {
        buildToolbar();
      } else {
        clearToolbar();
      }
    }

    function openOrReveal() {
      api.openEditorTab({ uri: EDITOR_TAB_URI, title: 'Markdown Editor', component: MarkdownEditorPanel, toSide: false });
    }

    function handleUri(uri: string) {
      if (uri.startsWith('virtual://')) return;
      updateToolbar(uri);
      if (!isMarkdownUri(uri)) return;
      setActiveUri(uri);
    }

    api.editor.onDidOpenDocument((uri) => handleUri(uri));
    api.editor.onDidChangeModel((uri) => { if (uri) handleUri(uri); });

    _vfsUnsub = globalEventBus.on<{ path: string }>('system:vfs:fileSelected', ({ path }) => handleUri(path));

    // Initial state
    updateToolbar(undefined);

    // Commands
    api.commands.register('open',        openOrReveal);
    api.commands.register('bold',        () => emit('bold'));
    api.commands.register('italic',      () => emit('italic'));
    api.commands.register('strike',      () => emit('strike'));
    api.commands.register('h1',          () => emit('h1'));
    api.commands.register('h2',          () => emit('h2'));
    api.commands.register('h3',          () => emit('h3'));
    api.commands.register('bulletList',  () => emit('bulletList'));
    api.commands.register('orderedList', () => emit('orderedList'));
    api.commands.register('blockquote',  () => emit('blockquote'));

    // Command palette
    api.ui.commandpalette.register({ command: `${api.pluginId}:open`,        title: 'Open Editor',        category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:bold`,        title: 'Bold',               category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:italic`,      title: 'Italic',             category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:strike`,      title: 'Strikethrough',      category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:h1`,          title: 'Heading 1',          category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:h2`,          title: 'Heading 2',          category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:h3`,          title: 'Heading 3',          category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:bulletList`,  title: 'Bullet List',        category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:orderedList`, title: 'Ordered List',       category: 'Markdown' });
    api.ui.commandpalette.register({ command: `${api.pluginId}:blockquote`,  title: 'Blockquote',         category: 'Markdown' });

    api.logger.info('Markdown Editor v1.2 activated');
  },

  () => {
    _vfsUnsub?.();
    _vfsUnsub = null;
    _activeUri = '';
    _uriListeners.forEach(fn => fn());
  },
);
