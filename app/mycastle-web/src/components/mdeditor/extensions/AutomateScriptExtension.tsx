/**
 * Automate Script Extension - rozszerzenie Tiptap do wykonywalnych blokow skryptowych
 * Format markdown: ```automate:blockId\ncode\n```
 */

import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Switch,
  Tab,
  Tabs,
  Badge,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import CodeIcon from '@mui/icons-material/Code';
import HtmlIcon from '@mui/icons-material/Html';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorTypes } from 'monaco-editor';

import { useAuth } from '../../../modules/auth/AuthContext';

// Lazy — the docs string (`docs/MDScript.md`) is in its own chunk so users
// who never click (?) don't pay for it. We reuse the same dialog wrapper as
// Plugin Script because the docs file covers in-editor scripting in general
// (both block types follow the same `display.*` / return-value convention).
const MdScriptHelpDialog = lazy(() => import('./MdScriptHelpDialog'));

// Lazy — file picker only loads when the user clicks "Dołącz plik".
const AutomateIncludeFileDialog = lazy(() => import('./AutomateIncludeFileDialog'));

import { setupAutomateMonaco, mergeExtraLibs } from '../../../modules/automate/designer/automateMonacoSetup';
import { LIBRARIES, parseLibrariesFromCode, preloadLibrariesForCode } from './automateLibraries';

// Lazy — picker only loads when the user clicks "Użyj biblioteki".
const AutomateLibraryPickerDialog = lazy(() => import('./AutomateLibraryPickerDialog'));
import { useAutomateDocument, DisplayItem } from './AutomateDocumentContext';

const DISPLAY_API_TYPES = `
/**
 * API wyswietlania wynikow w panelu output bloku skryptowego.
 * Dostepne tylko w blokach skryptowych osadzonych w markdown.
 */
interface DisplayApi {
  /**
   * Wyswietl tekst w panelu output.
   * @param str - Tekst do wyswietlenia
   * @example display.text('Wynik: 42');
   */
  text(str: string): void;

  /**
   * Wyswietl tabele w panelu output.
   * @param data - Tablica obiektow lub tablica tablic
   * @example
   * display.table([
   *   { imie: 'Jan', wiek: 30 },
   *   { imie: 'Anna', wiek: 25 },
   * ]);
   */
  table(data: Record<string, any>[] | any[][]): void;

  /**
   * Wyswietl liste w panelu output.
   * @param items - Tablica elementow
   * @example display.list(['Element 1', 'Element 2', 'Element 3']);
   */
  list(items: any[]): void;

  /**
   * Wyswietl sformatowany JSON w panelu output.
   * @param obj - Obiekt do wyswietlenia
   * @example display.json({ klucz: 'wartosc', nested: { a: 1 } });
   */
  json(obj: any): void;

  /**
   * Wyswietl surowy fragment HTML. Renderowany przez dangerouslySetInnerHTML.
   * @param markup - String HTML do wyswietlenia
   * @example display.html('<div style="color:red">Alert!</div>');
   */
  html(markup: string): void;

  /**
   * Zamontuj zywy element DOM (z animacjami, event handlerami).
   * Idealny dla Three.js — przekaz \`renderer.domElement\` zeby zachowac
   * animacje w trybie HTML widoku.
   * @param element - HTMLElement do zamontowania
   * @example
   * const r = new THREE.WebGLRenderer();
   * r.setSize(400, 300);
   * r.setAnimationLoop(() => r.render(scene, camera));
   * display.dom(r.domElement);
   */
  dom(element: HTMLElement): void;
}

/**
 * API wyswietlania wynikow - renderuje dane bezposrednio pod blokiem skryptowym.
 *
 * Dostepne metody:
 * - \`display.text(str)\` - tekst
 * - \`display.table(data)\` - tabela
 * - \`display.list(items)\` - lista
 * - \`display.json(obj)\` - sformatowany JSON
 * - \`display.html(markup)\` - raw HTML
 * - \`display.dom(element)\` - zywy element DOM (np. canvas Three.js)
 */
declare const display: DisplayApi;
`;

/**
 * Register Automate API + `display` API types so Monaco offers completions
 * for `api.*`, `input`, `variables`, and `display.*` inside the script
 * dialog. Goes through the merge helper so we don't wipe out libs added by
 * other plugins (TypeScriptIntelliSensePlugin in particular). Safe to call
 * on every `beforeMount` — the merge is idempotent.
 */
function setupAutomateMonacoWithDisplay(monaco: Monaco): void {
  setupAutomateMonaco(monaco);
  mergeExtraLibs(monaco, new Map([
    ['file:///automate-display-api.d.ts', DISPLAY_API_TYPES],
  ]));
}

/**
 * Pull in the .d.ts stubs for every library referenced by `// @library: foo`
 * in the current code. Re-uses the same model-based registration as the
 * Automate API types so re-registering is a no-op (no worker restart) when
 * the same set of libraries comes back. Called from the Monaco editor's
 * `onMount` and after each user edit that might add a new marker.
 */
function registerLibraryTypes(monaco: Monaco, code: string): void {
  const libs = parseLibrariesFromCode(code);
  if (libs.length === 0) return;
  const map = new Map<string, string>();
  for (const libId of libs) {
    const entry = LIBRARIES[libId];
    if (entry) map.set(entry.typesDtsPath, entry.typesDtsContent);
  }
  if (map.size > 0) mergeExtraLibs(monaco, map);
}

// Komponent renderujacy wyniki display
const DisplayOutput: React.FC<{ items: DisplayItem[] }> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <Box sx={{ p: 1 }}>
      {items.map((item, i) => {
        switch (item.type) {
          case 'text':
            return (
              <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {String(item.data)}
              </Typography>
            );

          case 'table': {
            const data = item.data as Record<string, unknown>[] | unknown[][];
            if (!Array.isArray(data) || data.length === 0) return null;

            // Detect if array of objects or array of arrays
            const isObjectArray = typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]);
            const headers = isObjectArray
              ? Object.keys(data[0] as Record<string, unknown>)
              : (data[0] as unknown[]).map((_, idx) => `${idx}`);

            return (
              <Table key={i} size="small" sx={{ my: 0.5 }}>
                <TableHead>
                  <TableRow>
                    {headers.map((h, hi) => (
                      <TableCell key={hi} sx={{ fontWeight: 600, fontSize: '0.75rem', py: 0.5 }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((row, ri) => (
                    <TableRow key={ri}>
                      {isObjectArray
                        ? headers.map((h, hi) => (
                            <TableCell key={hi} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                              {String((row as Record<string, unknown>)[h] ?? '')}
                            </TableCell>
                          ))
                        : (row as unknown[]).map((cell, ci) => (
                            <TableCell key={ci} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                              {String(cell ?? '')}
                            </TableCell>
                          ))
                      }
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          }

          case 'list': {
            const listItems = item.data as unknown[];
            if (!Array.isArray(listItems)) return null;

            return (
              <List key={i} dense disablePadding sx={{ my: 0.5 }}>
                {listItems.map((li, idx) => (
                  <ListItem key={idx} disablePadding sx={{ pl: 1 }}>
                    <ListItemText
                      primary={String(li)}
                      primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
                    />
                  </ListItem>
                ))}
              </List>
            );
          }

          case 'json':
            return (
              <Box
                key={i}
                sx={{
                  bgcolor: '#f5f5f5',
                  borderRadius: 0.5,
                  p: 1,
                  my: 0.5,
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem', m: 0, whiteSpace: 'pre-wrap' }}
                >
                  {JSON.stringify(item.data, null, 2)}
                </Typography>
              </Box>
            );

          case 'html':
            // `display.html(str)` — raw HTML rendered as-is. Trusted input (the
            // author wrote it themselves), so dangerouslySetInnerHTML is OK.
            return (
              <Box
                key={i}
                sx={{ my: 0.5, p: 0.5 }}
                dangerouslySetInnerHTML={{ __html: String(item.data ?? '') }}
              />
            );

          case 'dom':
            // `display.dom(element)` — mount a live HTMLElement. We use a ref
            // callback + appendChild so the element keeps its event listeners
            // and animation loops (essential for Three.js: the WebGLRenderer's
            // canvas needs to remain in the DOM to keep painting).
            return (
              <Box
                key={i}
                sx={{ my: 0.5, display: 'flex', justifyContent: 'center' }}
                ref={(host: HTMLDivElement | null) => {
                  if (!host) return;
                  const el = item.data as HTMLElement | null;
                  if (el && host.firstChild !== el) {
                    host.innerHTML = '';
                    host.appendChild(el);
                  }
                }}
              />
            );

          default:
            return null;
        }
      })}
    </Box>
  );
};

// Node View Component
const AutomateScriptNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const blockId = useRef(node.attrs.blockId || crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autorunTriggeredRef = useRef(false);

  const {
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    runBlock,
    getBlockState,
    clearBlockOutput,
  } = useAutomateDocument();

  const [code, setCode] = useState(node.attrs.code as string || '');
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  // viewMode controls how the block renders inside the markdown document.
  // 'code' = current full UI (header + textarea + output panel).
  // 'html' = compact view that only shows the script's result rendered as HTML
  //         — useful for blocks that mostly produce a visual (Three.js scene,
  //         report-style table) where the code itself is just plumbing.
  const viewMode = (node.attrs.viewMode as 'code' | 'html') || 'code';
  // Hold on to the Monaco editor instance so the include-file picker can
  // insert text at the actual cursor position (rather than blind-appending
  // to `dialogCode`, which would lose cursor context the user just set).
  const monacoEditorRef = useRef<MonacoEditorTypes.IStandaloneCodeEditor | null>(null);
  // The full Monaco namespace — needed to re-register library .d.ts stubs
  // when the user types a `// @library:` marker into the editor by hand
  // (or pastes code that already has one).
  const monacoRef = useRef<Monaco | null>(null);
  const { currentUser } = useAuth();
  const userName = (currentUser as { name?: string } | null)?.name ?? '';
  const [dialogCode, setDialogCode] = useState('');
  // Active tab in the dialog's bottom panel — 'output' shows display.* /
  // return value, 'logs' shows api.log.*. Default to output because that's
  // where most scripts surface visible results.
  const [dialogTab, setDialogTab] = useState<'output' | 'logs'>('output');
  const autorun = node.attrs.autorun as boolean;

  // Assign blockId if not set
  useEffect(() => {
    if (!node.attrs.blockId) {
      updateAttributes({ blockId: blockId.current });
    }
  }, [node.attrs.blockId, updateAttributes]);

  // Register block on mount
  useEffect(() => {
    const id = blockId.current;
    registerBlock(id);
    return () => unregisterBlock(id);
  }, [registerBlock, unregisterBlock]);

  // Sync code to context when it changes
  useEffect(() => {
    updateBlockCode(blockId.current, code);
  }, [code, updateBlockCode]);

  // Autorun effect - run script automatically when loaded if autorun is enabled
  useEffect(() => {
    if (autorun && code && !autorunTriggeredRef.current) {
      autorunTriggeredRef.current = true;
      runBlock(blockId.current);
    }
  }, [autorun, code, runBlock]);

  // Reset autorun trigger when blockId changes
  useEffect(() => {
    autorunTriggeredRef.current = false;
  }, [node.attrs.blockId]);

  const blockState = getBlockState(blockId.current);
  const status = blockState?.status || 'idle';
  const output = blockState?.output || [];
  const logs = blockState?.logs || [];
  const error = blockState?.error;
  const result = blockState?.result;

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setCode(newCode);
    updateAttributes({ code: newCode });
  }, [updateAttributes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter - run script
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      runBlock(blockId.current);
      return;
    }

    // Tab - insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      updateAttributes({ code: newCode });
      // Restore cursor position
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
      return;
    }

    // Prevent Tiptap from capturing keys while typing
    e.stopPropagation();
  }, [code, updateAttributes, runBlock]);

  const handleRun = useCallback(() => {
    // Preload CDN libraries declared via `// @library:` markers before
    // running — same mechanism as the fullscreen dialog Run button.
    void preloadLibrariesForCode(code).finally(() => runBlock(blockId.current));
  }, [code, runBlock]);

  const handleClear = useCallback(() => {
    clearBlockOutput(blockId.current);
  }, [clearBlockOutput]);

  const openEditorDialog = useCallback(() => {
    setDialogCode(code);
    setEditorDialogOpen(true);
  }, [code]);

  const handleEditorDialogSave = useCallback(() => {
    setCode(dialogCode);
    updateAttributes({ code: dialogCode });
    setEditorDialogOpen(false);
  }, [dialogCode, updateAttributes]);

  /** Save + run inside the fullscreen dialog — keeps the dialog open so the
   *  user sees the output panel below the editor without losing context. */
  const handleEditorDialogRun = useCallback(() => {
    setCode(dialogCode);
    updateAttributes({ code: dialogCode });
    // useAutomateDocument's runBlock reads the block's persisted code, so the
    // updateAttributes above must land before runBlock fires. updateAttributes
    // is synchronous in TipTap (mutates state immediately), so we can call
    // runBlock in the same tick.
    //
    // Preload any `// @library: foo` libraries first — they're CDN-injected
    // script tags that need to land before AsyncFunction body executes. We
    // fire-and-forget the run; if the preload throws, runBlock would still
    // attempt to execute and surface the error in the standard error path.
    void preloadLibrariesForCode(dialogCode).finally(() => runBlock(blockId.current));
  }, [dialogCode, updateAttributes, runBlock]);

  /** Library picker callback — receives a fresh code body with `// @library:`
   *  marker(s) inserted. Mirror the change into both the local `dialogCode`
   *  (so the editor reflects it immediately) and the TipTap attribute (so the
   *  marker survives save / reload). */
  const handleLibraryChange = useCallback((newCode: string) => {
    setDialogCode(newCode);
    setCode(newCode);
    updateAttributes({ code: newCode });
    // Best-effort: also kick off a CDN preload so the runtime is ready by
    // the time the user clicks Run. Ignored on failure — the actual run
    // path retries and surfaces errors properly.
    void preloadLibrariesForCode(newCode);
  }, [updateAttributes]);

  /** Insert the picker's chosen file contents at the cursor (or replace
   *  current selection). Goes through `executeEdits` so it lands in Monaco's
   *  undo stack — the author can Ctrl+Z out of an accidental include. */
  const handleIncludeInsert = useCallback((content: string) => {
    const editor = monacoEditorRef.current;
    if (!editor) {
      // Fallback if editor ref wasn't captured (shouldn't happen post-mount):
      // append at end so the file isn't lost.
      setDialogCode(prev => prev + content);
      return;
    }
    const sel = editor.getSelection();
    const model = editor.getModel();
    if (!sel || !model) return;
    editor.executeEdits('automate-include', [{
      range: sel,
      text: content,
      forceMoveMarkers: true,
    }]);
    editor.focus();
    // Synchronise our React mirror — onChange will fire too, but updating
    // here avoids a one-frame race where dialogCode is stale.
    setDialogCode(model.getValue());
  }, []);

  // When a run produces logs but no visible output, auto-switch to the Logs
  // tab so users don't think the script silently did nothing. Only triggers
  // on transitions (new logs since last status change), not while the user
  // is manually browsing tabs.
  useEffect(() => {
    if (!editorDialogOpen) return;
    if (status !== 'completed' && status !== 'error') return;
    const hasVisible = output.length > 0 || result !== undefined;
    if (logs.length > 0 && !hasVisible) {
      setDialogTab('logs');
    }
  }, [editorDialogOpen, status, logs.length, output.length, result]);

  const hasOutput = output.length > 0 || logs.length > 0 || !!error || result !== undefined;

  return (
    <NodeViewWrapper data-block-id={node.attrs.blockId || undefined}>
      <Paper
        elevation={selected ? 3 : 1}
        sx={{
          border: selected ? '2px solid' : '1px solid',
          borderColor: selected ? 'success.main' : 'grey.300',
          overflow: 'hidden',
          my: 1,
        }}
        className="automate-script-wrapper"
      >
        {/* Header bar */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          bgcolor: '#1e1e1e',
          color: '#d4d4d4',
        }}>
          <SmartToyIcon sx={{ fontSize: 16, mr: 0.5, color: '#4caf50' }} />
          <Typography variant="caption" sx={{ flex: 1, color: '#d4d4d4' }}>
            Skrypt automatyzacji
          </Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autorun}
                onChange={(e) => updateAttributes({ autorun: e.target.checked })}
                sx={{
                  '& .MuiSwitch-thumb': { bgcolor: autorun ? '#4caf50' : '#757575' },
                  '& .MuiSwitch-track': { bgcolor: autorun ? 'rgba(76,175,80,0.5)' : 'rgba(255,255,255,0.2)' },
                }}
              />
            }
            label={<Typography variant="caption" sx={{ color: '#d4d4d4', fontSize: '0.65rem' }}>Auto</Typography>}
            sx={{ mr: 0.5, ml: 0 }}
          />
          <Tooltip title="Uruchom (Ctrl+Enter)">
            <span>
              <IconButton
                size="small"
                onClick={handleRun}
                disabled={status === 'running'}
                sx={{ color: '#4caf50', '&:hover': { bgcolor: 'rgba(76,175,80,0.1)' } }}
              >
                {status === 'running' ? (
                  <CircularProgress size={14} sx={{ color: '#4caf50' }} />
                ) : (
                  <PlayArrowIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Edytor z podpowiedziami">
            <IconButton
              size="small"
              onClick={openEditorDialog}
              sx={{ color: '#d4d4d4', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <OpenInFullIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {/* View-mode toggle: 'code' (full editor surface) ↔ 'html' (only
              the rendered output, treated as HTML). Switching is a single
              attribute flip; we keep the script body untouched so the user
              can swap back to edit. */}
          <Tooltip title={viewMode === 'code' ? 'Widok: HTML (renderuj wynik)' : 'Widok: Kod (edycja)'}>
            <IconButton
              size="small"
              onClick={() => updateAttributes({ viewMode: viewMode === 'code' ? 'html' : 'code' })}
              sx={{ color: '#d4d4d4', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              {viewMode === 'code' ? <HtmlIcon sx={{ fontSize: 16 }} /> : <CodeIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Dokumentacja Automate Script">
            <IconButton
              size="small"
              onClick={() => setHelpOpen(true)}
              sx={{ color: '#d4d4d4', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <HelpOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Wyczysc wyjscie">
            <span>
              <IconButton
                size="small"
                onClick={handleClear}
                disabled={!hasOutput}
                sx={{
                  color: hasOutput ? '#d4d4d4' : '#555555',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                  '&.Mui-disabled': { color: '#555555' },
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Code editor — only rendered in 'code' view mode. The 'html' mode
            hides the editor surface entirely (the user re-enters editing by
            toggling back or via the fullscreen editor dialog). */}
        {viewMode === 'code' && (
          <Box sx={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={code}
              onChange={handleCodeChange}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 80,
                maxHeight: 400,
                padding: '12px',
                fontFamily: "'Fira Code', 'Monaco', 'Consolas', 'Courier New', monospace",
                fontSize: '0.875em',
                lineHeight: 1.6,
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                border: 'none',
                outline: 'none',
                resize: 'vertical',
                tabSize: 2,
                boxSizing: 'border-box',
                display: 'block',
              }}
            />
          </Box>
        )}

        {/* HTML view — surfaces only the visual output, no code or logs. Three
            sources, in priority order:
              1. `display.dom(...)` / `display.html(...)` items, mounted as-is
                 (this is the live-canvas path — Three.js works here because we
                 appendChild the renderer's domElement and never serialise it).
              2. `result` returned from the script — if a string, treated as
                 HTML; otherwise JSON-pretty-printed as a debugging fallback.
              3. Empty-state hint.
            `dangerouslySetInnerHTML` is acceptable because the rendered HTML
            is user-authored in this same document — there's no cross-origin
            / untrusted input.
        */}
        {viewMode === 'html' && (
          <Box sx={{ p: 1.5, minHeight: 60, bgcolor: 'background.paper' }}>
            {error ? (
              <Alert severity="error" sx={{ fontSize: '0.85em' }}>{error}</Alert>
            ) : output.length > 0 ? (
              // display.* items take priority because that's the only path
              // that supports live DOM mounting. Re-use DisplayOutput so the
              // 'dom'/'html' renderers above are the single source of truth.
              <DisplayOutput items={output} />
            ) : result === undefined || result === null ? (
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                Brak wyniku. Uruchom skrypt (▶) — w trybie HTML widoczne są elementy z display.html / display.dom oraz zwrócona wartość.
              </Typography>
            ) : typeof result === 'string' ? (
              <div dangerouslySetInnerHTML={{ __html: result }} />
            ) : (
              // Non-string return — pretty-print as JSON inside a <pre> so the
              // user still sees something useful instead of "[object Object]".
              <Box component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.78em', m: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(result, null, 2)}
              </Box>
            )}
          </Box>
        )}

        {/* Output panel */}
        {hasOutput && (
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', maxHeight: 300, overflow: 'auto' }}>
            {error && (
              <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>
                {error}
              </Alert>
            )}
            <DisplayOutput items={output} />
            {result !== undefined && output.length === 0 && !error && (
              <Box sx={{ p: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  Wynik: {typeof result === 'object' ? JSON.stringify(result) : String(result)}
                </Typography>
              </Box>
            )}
            {logs.length > 0 && (
              <Box sx={{ p: 1, bgcolor: '#fafafa', borderTop: '1px solid', borderColor: 'divider' }}>
                {logs.map((log, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: log.level === 'error' ? 'error.main'
                        : log.level === 'warn' ? 'warning.main'
                        : log.level === 'debug' ? 'info.main'
                        : 'text.secondary',
                    }}
                  >
                    [{log.level}] {log.message}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* Monaco editor dialog — fullScreen so the user has the entire viewport
          for editing. The 80vh + lg dialog felt cramped for longer scripts and
          left awkward dead space on wide monitors. */}
      <Dialog
        open={editorDialogOpen}
        onClose={() => setEditorDialogOpen(false)}
        fullScreen
      >
        <DialogTitle sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon sx={{ color: '#4caf50' }} />
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            Edytor skryptu
          </Typography>
          {/* "Include file" button — pulls from drive/mdscript/, inserts at
              cursor. Disabled when we don't yet know the user (rare race
              during initial auth load). */}
          <Tooltip title="Dołącz plik z drive/mdscript/">
            <span>
              <IconButton size="small" onClick={() => setIncludeOpen(true)} disabled={!userName}>
                <AttachFileIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {/* "Use library" button — opens the catalog picker (Three.js etc.).
              Selecting a library inserts a `// @library:` marker that the
              runtime preloader + IntelliSense both react to. */}
          <Tooltip title="Użyj biblioteki (Three.js, …)">
            <IconButton size="small" onClick={() => setLibraryPickerOpen(true)}>
              <LibraryAddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Dokumentacja Automate Script">
            <IconButton size="small" onClick={() => setHelpOpen(true)}>
              <HelpOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Box wrapper ensures the Editor expands to fill remaining flex space
              regardless of fullScreen dialog's inner padding/border math. */}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              // Even though the script runs as plain JavaScript at runtime,
              // we use the TypeScript language service here so that ambient
              // declarations from `automate-api.d.ts` (registered as TS models
              // via createModel) are visible. The JS service treats JS and TS
              // models as separate compilation contexts — `declare const api`
              // in a .ts model is invisible from a .js model, which is why
              // user-defined classes (handled locally) showed completions but
              // `api.*` (resolved through the ambient .d.ts) did not.
              defaultLanguage="typescript"
              value={dialogCode}
              onChange={value => {
                const v = value || '';
                setDialogCode(v);
                // Refresh library .d.ts stubs in case the user just typed a
                // `// @library: foo` marker (or removed one). Cheap because
                // the underlying createModel paths are idempotent.
                if (monacoRef.current) registerLibraryTypes(monacoRef.current, v);
              }}
              beforeMount={setupAutomateMonacoWithDisplay}
              onMount={(editor, monaco) => {
                // Capture the editor + Monaco singleton so the include-file
                // picker can insert at cursor and the library picker can
                // re-register .d.ts stubs without going through beforeMount.
                monacoEditorRef.current = editor;
                monacoRef.current = monaco;

                // Register .d.ts stubs for any `// @library: foo` markers
                // already in the script so completions on `THREE.…` etc.
                // light up immediately on open.
                registerLibraryTypes(monaco, dialogCode);

                // Ctrl+Enter inside the editor runs the script without forcing
                // the user back to the toolbar — matches the in-block textarea
                // shortcut and the convention every code editor in the app
                // uses (Plugin Script, Jupyter-style cells, …).
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                  () => { handleEditorDialogRun(); },
                );

                // Diagnostic probe (kept from the previous debug session — it
                // surfaces worker setup issues in the console so we don't have
                // to manually re-instrument when something goes sideways).
                const model = editor.getModel();
                if (!model) { console.warn('[AutomateMonaco] onMount: no model'); return; }
                // eslint-disable-next-line no-console
                console.log('[AutomateMonaco] onMount: model uri=', model.uri.toString(),
                  '| lang=', model.getLanguageId());
                void (async () => {
                  try {
                    const getWorker = await monaco.languages.typescript.getJavaScriptWorker();
                    const proxy = await Promise.race([
                      getWorker(model.uri),
                      new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('worker getProxy timeout')), 5000)),
                    ]);
                    // eslint-disable-next-line no-console
                    console.log('[AutomateMonaco] JS worker responsive:', typeof proxy);
                  } catch (err) {
                    console.warn('[AutomateMonaco] JS worker probe FAILED:', (err as Error).message);
                  }
                })();
              }}
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                automaticLayout: true,
              }}
              theme="vs-dark"
            />
          </Box>

          {/* Bottom panel — tabbed Output / Logs. Always visible inside the
              fullscreen dialog (even when empty) so the user has a stable
              "this is where results land" anchor instead of UI jumping around
              when the first run produces output. Capped at 40% of dialog
              height so the editor stays usable for long output. */}
          <Box
            sx={{
              flex: '0 0 auto',
              maxHeight: '40%',
              minHeight: 160,
              overflow: 'hidden',
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Tabs
              value={dialogTab}
              onChange={(_, v) => setDialogTab(v)}
              variant="standard"
              sx={{
                minHeight: 36,
                borderBottom: 1,
                borderColor: 'divider',
                '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' },
              }}
            >
              {/* Badge shows count of "interesting" items so the user can see
                  at a glance whether there's anything in the inactive tab. */}
              <Tab
                value="output"
                label={
                  <Badge
                    color="primary"
                    badgeContent={output.length + (result !== undefined ? 1 : 0) + (error ? 1 : 0)}
                    sx={{ '& .MuiBadge-badge': { right: -14, top: 4 } }}
                  >
                    Output
                  </Badge>
                }
              />
              <Tab
                value="logs"
                label={
                  <Badge
                    color="secondary"
                    badgeContent={logs.length}
                    sx={{ '& .MuiBadge-badge': { right: -14, top: 4 } }}
                  >
                    Logi
                  </Badge>
                }
              />
            </Tabs>

            {/* Output tab — display.* items, return value, error alert. */}
            {dialogTab === 'output' && (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {!hasOutput && (
                  <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: 'block', fontStyle: 'italic' }}>
                    Brak wyników. Uruchom skrypt aby zobaczyć output (display.*, return value).
                  </Typography>
                )}
                {error && (
                  <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>
                    {error}
                  </Alert>
                )}
                <DisplayOutput items={output} />
                {result !== undefined && output.length === 0 && !error && (
                  <Box sx={{ p: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      Wynik: {typeof result === 'object' ? JSON.stringify(result) : String(result)}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {/* Logs tab — api.log.* output, colour-coded per level. */}
            {dialogTab === 'logs' && (
              <Box sx={{ flex: 1, overflow: 'auto', bgcolor: '#fafafa' }}>
                {logs.length === 0 ? (
                  <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: 'block', fontStyle: 'italic' }}>
                    Brak logów. Użyj api.log.info / warn / error / debug w kodzie.
                  </Typography>
                ) : (
                  <Box sx={{ p: 1 }}>
                    {logs.map((log, i) => (
                      <Typography
                        key={i}
                        variant="caption"
                        sx={{
                          display: 'block',
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          lineHeight: 1.5,
                          color: log.level === 'error' ? 'error.main'
                            : log.level === 'warn' ? 'warning.main'
                            : log.level === 'debug' ? 'info.main'
                            : 'text.primary',
                        }}
                      >
                        <Box component="span" sx={{ color: 'text.disabled', mr: 1 }}>
                          [{log.level}]
                        </Box>
                        {log.message}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          {/* Run lives next to Save because it's the dialog's primary action
              once a user has finished typing. Disabled while a run is in
              flight to avoid stacked overlapping executions. */}
          <Tooltip title="Uruchom (Ctrl+Enter)">
            <span>
              <Button
                onClick={handleEditorDialogRun}
                disabled={status === 'running'}
                startIcon={status === 'running'
                  ? <CircularProgress size={14} sx={{ color: '#4caf50' }} />
                  : <PlayArrowIcon />}
                sx={{ color: '#4caf50' }}
              >
                {status === 'running' ? 'Uruchamiam…' : 'Uruchom'}
              </Button>
            </span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setEditorDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleEditorDialogSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* ── Help dialog ── */}
      {/* Mounted only when helpOpen flips true so the chunk fetches lazily on
          first click. `Suspense fallback={null}` because the chunk is small —
          a brief inline loader would flash and be more annoying than absent. */}
      <Suspense fallback={null}>
        {helpOpen && (
          <MdScriptHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
        )}
      </Suspense>

      {/* ── Include-file picker ── */}
      <Suspense fallback={null}>
        {includeOpen && (
          <AutomateIncludeFileDialog
            open={includeOpen}
            onClose={() => setIncludeOpen(false)}
            userName={userName}
            onInsert={(content) => handleIncludeInsert(content)}
          />
        )}
      </Suspense>

      {/* ── Library picker ── */}
      <Suspense fallback={null}>
        {libraryPickerOpen && (
          <AutomateLibraryPickerDialog
            open={libraryPickerOpen}
            onClose={() => setLibraryPickerOpen(false)}
            code={dialogCode || code}
            onChange={handleLibraryChange}
          />
        )}
      </Suspense>
    </NodeViewWrapper>
  );
};

// Tiptap Extension
export const AutomateScriptBlock = Node.create({
  name: 'automateScriptBlock',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: '' },
      code: { default: '' },
      autorun: { default: false },
      // 'code' (current default) shows the full editor surface in the doc.
      // 'html' renders only the script's return value as HTML — for visual
      // blocks (Three.js etc.) where the code is plumbing.
      viewMode: { default: 'code' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="automate-script-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          const vm = element.getAttribute('data-view-mode');
          return {
            blockId: element.getAttribute('data-block-id') || '',
            code: element.getAttribute('data-code')
              ? decodeURIComponent(element.getAttribute('data-code') || '')
              : '',
            autorun: element.getAttribute('data-autorun') === 'true',
            viewMode: vm === 'html' ? 'html' : 'code',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = {
      'data-type': 'automate-script-block',
      'data-autorun': node.attrs.autorun ? 'true' : 'false',
      'data-view-mode': node.attrs.viewMode === 'html' ? 'html' : 'code',
    };

    if (node.attrs.blockId) {
      attrs['data-block-id'] = node.attrs.blockId;
    }
    if (node.attrs.code) {
      attrs['data-code'] = encodeURIComponent(node.attrs.code);
    }

    return ['div', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AutomateScriptNodeView);
  },

  addCommands() {
    return {
      insertAutomateScript: (code: string = '', blockId?: string) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            code,
            blockId: blockId || crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
          },
        });
      },
    };
  },
});

// Deklaracja typow dla komend
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    automateScriptBlock: {
      insertAutomateScript: (code?: string, blockId?: string) => ReturnType;
    };
  }
}

export default AutomateScriptBlock;
