/**
 * Markdown Editor Plugin
 *
 * Opens the MdEditor component (TipTap-based rich markdown editor) as a
 * virtual editor tab for the currently active .md file in the Monaco editor.
 *
 * Path mapping: VFS path `/home/md/foo.md` → MQTT path `md/foo.md`
 * (strips the `/home/` mount prefix that UserDataEditorPage uses).
 *
 * Commands:
 *  - Command Palette: "Markdown: Open Editor"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { defineEditorPlugin } from '@mhersztowski/web-client';
import { MdEditor } from '../components/mdeditor';
import { useMqtt } from '../modules/mqttclient/MqttContext';

/* ── Module-level active-file store ─────────────────────────────────────── */
// Shared between activate() and the panel component (same pattern as MarkdownPreviewPlugin).

let _activeVfsUri = '';

const _uriListeners = new Set<() => void>();

function setActiveUri(uri: string) {
  _activeVfsUri = uri;
  _uriListeners.forEach((fn) => fn());
}

function useActiveUri(): string {
  const [uri, setUri] = useState(_activeVfsUri);
  useEffect(() => {
    const fn = () => setUri(_activeVfsUri);
    _uriListeners.add(fn);
    return () => { _uriListeners.delete(fn); };
  }, []);
  return uri;
}

/** Convert a VFS uri like `/home/md/foo.md` to an MQTT-relative path `md/foo.md`. */
function vfsToMqttPath(uri: string): string {
  if (uri.startsWith('/home/')) return uri.slice('/home/'.length);
  // Fallback: strip leading slash
  return uri.startsWith('/') ? uri.slice(1) : uri;
}

function isMarkdownUri(uri: string): boolean {
  return /\.(md|mdx|markdown)$/i.test(uri);
}

/* ── Panel component ─────────────────────────────────────────────────────── */

function MarkdownEditorPanel() {
  const { readFile, writeFile, isConnected } = useMqtt();
  const activeUri = useActiveUri();

  // Snapshot the URI at mount time so the tab stays bound to one file
  const fileUriRef = useRef(activeUri || _activeVfsUri);
  const fileUri = fileUriRef.current;
  const mqttPath = fileUri ? vfsToMqttPath(fileUri) : '';

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !mqttPath) return;
    setContent(null);
    setError(null);
    readFile(mqttPath)
      .then((f) => setContent(f.content))
      .catch((e) => setError(String(e)));
  }, [isConnected, mqttPath, readFile]);

  const handleSave = useCallback(async (markdown: string) => {
    if (!mqttPath) return;
    try {
      await writeFile(mqttPath, markdown);
    } catch (e) {
      console.error('[MarkdownEditorPlugin] save error:', e);
    }
  }, [mqttPath, writeFile]);

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

let _editorCounter = 0;

export const MarkdownEditorPlugin = defineEditorPlugin(
  {
    id: 'builtin.markdown-editor',
    name: 'Markdown Editor',
    version: '1.0.0',
    description: 'Opens the TipTap markdown editor for the currently active .md file',
    contributes: ['commandpalette'],
  },

  (api) => {
    // Track the active file URI — ignore virtual tabs (preview, editor panels, etc.)
    api.editor.onDidOpenDocument((uri) => {
      if (!uri.startsWith('virtual://')) setActiveUri(uri);
    });

    api.editor.onDidChangeModel((uri) => {
      if (!uri.startsWith('virtual://')) setActiveUri(uri);
    });

    api.commands.register('open', () => {
      api.openEditorTab({
        uri: `virtual://markdown-editor/${++_editorCounter}`,
        title: _activeVfsUri ? `MD: ${_activeVfsUri.split('/').pop()}` : 'Markdown Editor',
        component: MarkdownEditorPanel,
        toSide: false,
      });
    });

    api.ui.commandpalette.register({
      command: `${api.pluginId}:open`,
      title: 'Open Editor',
      category: 'Markdown',
    });

    api.logger.info('Markdown Editor activated');
  },

  () => { /* nothing to clean up */ },
);
