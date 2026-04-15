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

function rlog(tag: string, msg: unknown) {
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  console.log(`[${tag}]`, text);
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, msg: text }),
  }).catch(() => {});
}

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

  // Keep readFile/writeFile in refs so reference changes don't re-trigger the effect.
  const readFileRef = useRef(readFile);
  useEffect(() => { readFileRef.current = readFile; }, [readFile]);
  const writeFileRef = useRef(writeFile);
  useEffect(() => { writeFileRef.current = writeFile; }, [writeFile]);

  const hasLoadedRef = useRef(false);

  useEffect(() => {
    rlog('MDE', `effect run isConnected=${isConnected} mqttPath=${mqttPath} hasLoaded=${hasLoadedRef.current}`);
    if (!isConnected || !mqttPath) return;
    let cancelled = false;
    if (!hasLoadedRef.current) {
      rlog('MDE', 'first load — resetting state');
      setContent(null);
      setError(null);
    }
    rlog('MDE', `reading file: ${mqttPath}`);
    readFileRef.current(mqttPath)
      .then((f) => {
        if (cancelled) { rlog('MDE', 'cancelled after read'); return; }
        rlog('MDE', `file loaded, length=${f.content.length}`);
        hasLoadedRef.current = true;
        setContent(f.content);
      })
      .catch((e) => { if (!cancelled) { rlog('MDE', `error: ${e}`); setError(String(e)); } });
    return () => { rlog('MDE', 'load effect cleanup'); cancelled = true; };
  }, [isConnected, mqttPath]);

  const handleSave = useCallback(async (markdown: string) => {
    if (!mqttPath) return;
    try {
      await writeFileRef.current(mqttPath, markdown);
    } catch (e) {
      console.error('[MarkdownEditorPlugin] save error:', e);
    }
  }, [mqttPath]);

  rlog('MDE', `render: content=${content === null ? 'null' : 'loaded('+content.length+')'} error=${error} fileUri=${fileUri}`);

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

  // Mount MdEditor only when content is ready — TipTap initialises with real content
  // from the start, so it is immediately interactive on Android.
  return (
    <Box sx={{ height: '100%', overflow: 'hidden', bgcolor: '#fff' }}>
      <MdEditor
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
