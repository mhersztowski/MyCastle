/**
 * Markdown Editor Plugin
 *
 * Single persistent virtual tab that tracks the active .md file.
 * When any .md file is activated (VFS click, tab switch, command palette),
 * the tab opens/reveals and reloads content for that file.
 *
 * Path mapping: VFS path `/home/md/foo.md` → MQTT path `md/foo.md`
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { defineEditorPlugin, globalEventBus } from '@mhersztowski/web-client';
import { MdEditor } from '../components/mdeditor';
import { useMqtt } from '../modules/mqttclient/MqttContext';

/* ── Module-level active-file store ─────────────────────────────────────── */
// Only .md URIs are stored here. Non-.md file activation is ignored so the
// tab keeps showing the last markdown file when the user switches to e.g. a .ts file.

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

  // Reload whenever the active file or connection changes
  useEffect(() => {
    if (!mqttPath || !isConnected) {
      setContent(null);
      return;
    }
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
      {/* key forces TipTap to remount when switching files — clean slate, no stale state */}
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

export const MarkdownEditorPlugin = defineEditorPlugin(
  {
    id: 'builtin.markdown-editor',
    name: 'Markdown Editor',
    version: '1.1.0',
    description: 'Single persistent tab that follows the active .md file',
    contributes: ['commandpalette'],
  },

  (api) => {
    function openOrReveal() {
      api.openEditorTab({
        uri: EDITOR_TAB_URI,
        title: 'Markdown Editor',
        component: MarkdownEditorPanel,
        toSide: false,
      });
    }

    function handleUri(uri: string) {
      if (uri.startsWith('virtual://')) return;
      if (!isMarkdownUri(uri)) return;
      setActiveUri(uri);
    }

    api.editor.onDidOpenDocument((uri) => handleUri(uri));
    api.editor.onDidChangeModel((uri) => handleUri(uri));

    _vfsUnsub = globalEventBus.on<{ path: string }>('system:vfs:fileSelected', ({ path }) => handleUri(path));

    api.commands.register('open', openOrReveal);
    api.ui.commandpalette.register({
      command: `${api.pluginId}:open`,
      title: 'Open Editor',
      category: 'Markdown',
    });

    api.logger.info('Markdown Editor v1.1 activated');
  },

  () => {
    _vfsUnsub?.();
    _vfsUnsub = null;
    _activeUri = '';
    _uriListeners.forEach(fn => fn());
  },
);
