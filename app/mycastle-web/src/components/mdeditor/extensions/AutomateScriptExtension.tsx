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
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import SettingsIcon from '@mui/icons-material/Settings';
import LabelIcon from '@mui/icons-material/Label';
import Editor from '@monaco-editor/react';

import { listUmlProjects } from './umlBlockly';
import { emptyScene, normalizeScene, type QObjectScene } from './qobjectScene';
import { readUserJson } from '../../../services/userJson';

import { editorOverlay } from '../editorOverlayState';
import { useAuth } from '../../../modules/auth/AuthContext';
import { preloadLibrariesForCode } from './automateLibraries';

// Lazy — picker only loads when the user clicks "Użyj biblioteki".
const AutomateLibraryPickerDialog = lazy(() => import('./AutomateLibraryPickerDialog'));
// Settings dialog is small but only ever opens on user click — lazy-load to
// keep the initial document parse cheap (every script block in the doc would
// otherwise pull this code).
const AutomateScriptSettingsDialog = lazy(() => import('./AutomateScriptSettingsDialog'));
// Update Script dialog — lazy, opens only when user clicks the button in settings.
const AutomateUpdateScriptDialog = lazy(() => import('./AutomateUpdateScriptDialog'));
// Pełnoekranowy edytor skryptu — ten sam komponent obsługuje logikę akcji w Aurze.
const AutomateScriptEditorDialog = lazy(() => import('./AutomateScriptEditorDialog'));
import type { AutomateScriptSettings } from './AutomateScriptEditorDialog';
import { useAutomateDocument } from './AutomateDocumentContext';
// Wspólny rdzeń (Monaco setup, markery Blockly, lista dołączonych plików,
// renderer wyników) — dzielony z edytorem skryptu używanym poza TipTapem.
import {
  DisplayOutput,
  buildRuntimeCode,
  joinBlockly,
  registerLibraryTypes,
  setupAutomateMonacoWithDisplay,
  splitBlockly,
} from './automateScriptCore';
import { useMdViewSettings } from '../mdViewSettings';

// Node View Component
// Akcje bloczka automatyzacji wyzwalane z menu bloczka (⋮): Run / Editor / Ustawienia.
export const AUTOMATE_ACTION_EVENT = 'md-automate-action';
export interface AutomateActionEventDetail { pos: number; action: 'run' | 'edit' | 'settings' }

const AutomateScriptNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, getPos }) => {
  const { minimalView } = useMdViewSettings();
  const blockId = useRef(node.attrs.blockId || crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9));
  // textareaRef removed — the inline code surface is now Monaco. Cursor /
  // focus tracking handled internally by Monaco; no React ref needed
  // beyond what `onMount` captures for the fullscreen path.

  const {
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    setBlockScene,
    runBlock,
    getBlockState,
    blocks,
  } = useAutomateDocument();

  const [code, setCode] = useState(node.attrs.code as string || '');
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  // Suppress the MdEditor bubble menu while the fullscreen script editor is open.
  useEffect(() => {
    if (!editorDialogOpen) return;
    editorOverlay.enter();
    return () => editorOverlay.exit();
  }, [editorDialogOpen]);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  // Consolidated settings dialog (Auto / view mode / library / tags) opened
  // from a single ⚙ button — both in the in-doc header and the fullscreen
  // editor title bar. Previously those settings were scattered across the
  // header bar; that worked but discoverability was poor and tags had no
  // home at all. One button, one dialog.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateScriptOpen, setUpdateScriptOpen] = useState(false);
  // viewMode controls how the block renders inside the markdown document.
  // 'code' = current full UI (header + textarea + output panel).
  // 'html' = compact view that only shows the script's result rendered as HTML
  //         — useful for blocks that mostly produce a visual (Three.js scene,
  //         report-style table) where the code itself is just plumbing.
  const viewMode = (node.attrs.viewMode as 'code' | 'html') || 'code';
  const { currentUser } = useAuth();
  const userName = (currentUser as { name?: string } | null)?.name ?? '';
  const autorun = node.attrs.autorun as boolean;
  // Tags — empty array fallback (older saved blocks won't have the attr).
  // The settings dialog edits this array via updateAttributes({ tags: … })
  // and the markdown converter round-trips it as `t=a,b,c` in the fence
  // params.
  const tags: string[] = Array.isArray(node.attrs.tags) ? (node.attrs.tags as string[]) : [];
  // Optional fixed height — null means "auto" (current behaviour). When a
  // number, applied as `height` on Paper, and the content slots flex inside.
  const windowHeight: number | null = typeof node.attrs.windowHeight === 'number'
    ? node.attrs.windowHeight : null;
  // Selected UML projects (Programming/Uml) whose classes become Blockly blocks.
  const umlProjects: string[] = Array.isArray(node.attrs.umlProjects) ? (node.attrs.umlProjects as string[]) : [];

  // Ścieżka pliku JSON ze sceną obiektów QObject (wybierana w ustawieniach).
  const scenePath: string = typeof node.attrs.scenePath === 'string' ? node.attrs.scenePath : '';
  // Plik `.automate`, z którego blok bierze kod (pusty = kod żyje w dokumencie).
  const scriptFile: string = typeof node.attrs.scriptFile === 'string' ? node.attrs.scriptFile : '';
  // Scena wczytana z pliku — edytowana w panelu QObject, zapisywana przy „Zapisz".
  const [qobjScene, setQobjScene] = useState<QObjectScene>(() => emptyScene());

  // Available UML projects (for the settings picker) — loaded when the dialog opens.
  const [availableUmlProjects, setAvailableUmlProjects] = useState<string[]>([]);

  useEffect(() => {
    if (!settingsOpen || !userName) return;
    let alive = true;
    listUmlProjects(userName).then((files) => { if (alive) setAvailableUmlProjects(files); });
    return () => { alive = false; };
  }, [settingsOpen, userName]);

  // Wczytaj scenę QObject z pliku: przy montażu bloku (żeby autorun/Run miały
  // scenę dla api.scripts.getRoot()) oraz przy otwarciu edytora / zmianie pliku.
  // Brak pliku → pusta scena.
  useEffect(() => {
    if (!userName || !scenePath) { setQobjScene(emptyScene()); return; }
    let alive = true;
    readUserJson<unknown>(userName, scenePath)
      .then((raw) => { if (alive) setQobjScene(raw ? normalizeScene(raw) : emptyScene()); })
      .catch(() => { if (alive) setQobjScene(emptyScene()); });
    return () => { alive = false; };
  }, [editorDialogOpen, userName, scenePath]);

  // Rejestruj korzenie sceny dla tego bloku, by api.scripts.getRoot() w
  // uruchamianym skrypcie zwracał root aktualnej (także edytowanej) sceny.
  useEffect(() => {
    setBlockScene(blockId.current, qobjScene.roots);
  }, [qobjScene, setBlockScene]);

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

  // Sync code to context when it changes. Register the *runtime* code (Blockly
  // blocks combined with the normal body) so cross-block references and
  // override-less runs use the combined script.
  useEffect(() => {
    updateBlockCode(blockId.current, buildRuntimeCode(code));
  }, [code, updateBlockCode]);

  // Autorun — run script automatically once on document load.
  //
  // History of bugs this is designed to avoid:
  //   1. `triggeredRef` based gating fired before registerBlock's setBlocks
  //      committed, so runBlock saw "not found" and the ref then permanently
  //      blocked subsequent attempts. Autorun never ran.
  //   2. getBlockState-gated retry race'd against blocksRef sync (useEffect
  //      runs after render), so runBlock read undefined from the ref even
  //      though React state already had the block.
  //
  // Current design:
  //   - Depend directly on `blocks` Map (not a derived selector). Every
  //     setBlocks downstream re-fires this effect.
  //   - Read block from `blocks` (state, not ref) so we see the committed
  //     entry as soon as React renders it.
  //   - `runBlock` now ALSO accepts a missing-from-ref block as long as
  //     codeOverride is provided (see AutomateDocumentContext) — so even
  //     if blocksRef hasn't sync'd yet, autorun will execute against the
  //     code we pass.
  //   - Gate by `status !== 'idle'` — once runBlock flips status, this
  //     effect short-circuits (idempotent).
  useEffect(() => {
    if (!autorun || !code) return;
    const block = blocks.get(blockId.current);
    if (!block) return;                  // registerBlock setBlocks not committed yet
    if (block.status !== 'idle') return; // already ran (running / completed / error)
    runBlock(blockId.current, buildRuntimeCode(code));
  }, [autorun, code, blocks, runBlock]);

  const blockState = getBlockState(blockId.current);
  const status = blockState?.status || 'idle';
  const output = blockState?.output || [];
  const logs = blockState?.logs || [];
  const error = blockState?.error;
  const result = blockState?.result;

  // handleCodeChange / handleKeyDown removed — they were textarea-only.
  // Monaco handles change events through its `onChange` prop (inline call
  // sets code + persists), Ctrl+Enter through `editor.addCommand` in
  // onMount (see render below), and Tab insertion is native to Monaco.

  const handleRun = useCallback(() => {
    // Library preload is handled INSIDE runBlock now (see runBlock in
    // AutomateDocumentContext), so CDN/CORS failures surface as a block
    // error rather than getting swallowed by a `.finally` chain here.
    void runBlock(blockId.current, buildRuntimeCode(code));
  }, [code, runBlock]);

  const openEditorDialog = useCallback(() => setEditorDialogOpen(true), []);

  // Akcje z menu bloczka (⋮): odpal właściwy handler, gdy zdarzenie dotyczy TEGO węzła.
  useEffect(() => {
    const onAction = (e: Event) => {
      const d = (e as CustomEvent<AutomateActionEventDetail>).detail;
      if (!d || typeof getPos !== 'function' || d.pos !== getPos()) return;
      if (d.action === 'run') handleRun();
      else if (d.action === 'edit') openEditorDialog();
      else if (d.action === 'settings') setSettingsOpen(true);
    };
    window.addEventListener(AUTOMATE_ACTION_EVENT, onAction);
    return () => window.removeEventListener(AUTOMATE_ACTION_EVENT, onAction);
  }, [getPos, handleRun, openEditorDialog]);

  /** Wywoływane przez picker bibliotek i „Aktualizuj skrypt" (dostępne też
   *  spod ⚙ w nagłówku bloku) — zapis idzie od razu do atrybutów węzła. */
  const persistCode = useCallback((newCode: string) => {
    setCode(newCode);
    updateAttributes({ code: newCode });
    updateBlockCode(blockId.current, buildRuntimeCode(newCode));
  }, [updateAttributes, updateBlockCode]);

  const handleLibraryChange = useCallback((newCode: string) => {
    persistCode(newCode);
    // Wstępne pobranie z CDN, żeby runtime był gotowy zanim ktoś kliknie Run.
    void preloadLibrariesForCode(newCode);
  }, [persistCode]);

  const handleUpdateScript = useCallback((newCode: string) => persistCode(newCode), [persistCode]);

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
          // Fixed-height mode: convert Paper into a flex column so children
          // (header / editor / output) divvy up the explicit height. The
          // header has natural size; the editor slot gets flex:1; the
          // output panel keeps its intrinsic size at the bottom. When
          // windowHeight is null we leave everything as auto-sizing.
          ...(windowHeight ? {
            height: windowHeight,
            display: 'flex',
            flexDirection: 'column',
          } : {}),
        }}
        className="automate-script-wrapper"
      >
        {/* Header bar — ukryty w widoku minimalnym (akcje dostępne w menu ⋮ bloczka). */}
        {!minimalView && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          // Roomier gap between header items — the previous default of 0
          // packed icons shoulder-to-shoulder, hard to tap on mobile and
          // visually noisy on desktop. 0.75 (~6px) keeps the bar compact
          // while making each control feel like a distinct hit target.
          gap: 0.75,
          px: 1,
          py: 0.5,
          bgcolor: '#1e1e1e',
          color: '#d4d4d4',
        }}>
          <SmartToyIcon sx={{ fontSize: 16, color: '#4caf50' }} />
          <Typography variant="caption" sx={{ color: '#d4d4d4' }}>
            Skrypt Automate
          </Typography>
          {/* Inline status chips — make it visible at a glance whether
              autorun is on, the block is in HTML view mode, and what tags
              it has, without having to open the settings dialog.
              Per-chip `ml` was removed: the parent `gap: 0.75` on the
              header Box is now the single source of spacing so the dist
              between every element is consistent. */}
          {autorun && (
            <Box sx={{
              px: 0.75, py: 0.1, borderRadius: 0.5,
              bgcolor: 'rgba(76,175,80,0.18)', color: '#4caf50',
              fontSize: '0.6rem', fontWeight: 600, letterSpacing: 0.3,
            }}>
              AUTO
            </Box>
          )}
          {viewMode === 'html' && (
            <Box sx={{
              px: 0.75, py: 0.1, borderRadius: 0.5,
              bgcolor: 'rgba(255,193,7,0.18)', color: '#ffb300',
              fontSize: '0.6rem', fontWeight: 600, letterSpacing: 0.3,
            }}>
              HTML
            </Box>
          )}
          {tags.length > 0 && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.25,
              color: '#9e9e9e', fontSize: '0.6rem',
            }}>
              <LabelIcon sx={{ fontSize: 12 }} />
              {tags.slice(0, 3).join(', ')}
              {tags.length > 3 && ` +${tags.length - 3}`}
            </Box>
          )}
          <Box sx={{ flex: 1 }} />
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
          {/* Consolidated settings — Auto / view mode / library / tags.
              Replaces the previous header-mounted Auto switch and the
              standalone HTML/Code toggle. The chips above keep status
              visible without forcing the dialog open. */}
          <Tooltip title="Ustawienia skryptu">
            <IconButton
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{ color: '#d4d4d4', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <SettingsIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {/* Help + Clear used to live here. Removed per user request —
              docs are still available from the fullscreen editor's (?) icon
              and the output footer panel has its own clear control next to
              the Tabs. The inline header was getting cramped; trimming to
              Run / Edit / Settings keeps it scannable. */}
        </Box>
        )}

        {/* ── Surface decision matrix ──────────────────────────────────────
              The component has three possible content surfaces below the
              header and they're mutually exclusive in the layout but the
              triggers overlap, so we compute them up front:

                showCodeEditor      — textarea with source. Only in auto-
                                      height + code view mode. Fixed-height
                                      hides the editor entirely because a
                                      cramped textarea isn't actually
                                      useful — author edits in fullscreen
                                      anyway.
                showOutputCanvas    — the "rendering" surface: display.dom /
                                      display.html items + result fallback +
                                      error. Used by HTML view mode AND by
                                      fixed-height code mode (the latter is
                                      the "I want a Three.js canvas in my
                                      doc" case).
                showFooterOutputPanel — the bottom output footer (used for
                                      auto-height code mode when the script
                                      has produced anything, since the
                                      textarea takes the main surface).

              Designing this as three booleans rather than nested ternaries
              makes the layout easier to follow and dramatically reduces
              the chance that two surfaces render simultaneously and double
              up the displayed output.                                       */}
        {viewMode === 'code' && !windowHeight && (
          // Monaco editor in the inline NodeView — same syntax highlighting,
          // IntelliSense and TypeScript language service as the fullscreen
          // dialog (and the Electronics/Editor surface). Previously this
          // slot was a plain <textarea> with hand-tuned font/colour —
          // identical visually but no markers, no completions, no go-to-
          // definition. Reusing setupAutomateMonacoWithDisplay means the
          // ambient `api.*` / `display.*` types light up here too.
          //
          // Height is computed from line count so the editor auto-grows
          // up to ~20 lines, then internal scroll takes over. That matches
          // the textarea behaviour (resize handle replaced by smart sizing).
          <Box sx={{ position: 'relative', borderTop: '1px solid', borderColor: 'divider' }}>
            {(() => {
              const LINE_HEIGHT = 19;
              const PAD_V = 16;
              const lines = code.split('\n').length;
              const visibleLines = Math.min(20, Math.max(4, lines + 1));
              const editorHeight = visibleLines * LINE_HEIGHT + PAD_V;
              return (
                <Editor
                  height={editorHeight}
                  defaultLanguage="typescript"
                  // Hide the persisted Blockly state marker from the inline view.
                  value={splitBlockly(code).body}
                  theme="vs-dark"
                  beforeMount={setupAutomateMonacoWithDisplay}
                  onMount={(monacoEditor, monaco) => {
                    // Re-register .d.ts stubs for any `// @library:` markers
                    // already in this block so completions are live from
                    // first keystroke (same as fullscreen mount).
                    registerLibraryTypes(monaco, code);
                    // Ctrl+Enter → Run, matching the convention from the
                    // fullscreen editor and every other code surface in
                    // the app. Editor has command priority so the parent
                    // TipTap document doesn't steal the keypress.
                    monacoEditor.addCommand(
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                      () => { handleRun(); },
                    );
                  }}
                  onChange={(value) => {
                    // The inline editor edits the normal body; keep the stored
                    // Blockly state + generated code untouched.
                    const prev = splitBlockly(code);
                    const v = joinBlockly(value ?? '', prev.state, prev.blocklyCode);
                    setCode(v);
                    updateAttributes({ code: v });
                    updateBlockCode(blockId.current, buildRuntimeCode(v));
                  }}
                  options={{
                    // Compact inline view: kill the chrome that's only
                    // useful in a full IDE surface. Folding stays on for
                    // long blocks; word wrap so the editor doesn't get a
                    // horizontal scrollbar inside markdown narrow column.
                    minimap:         { enabled: false },
                    lineNumbers:     'off',
                    glyphMargin:     false,
                    folding:         true,
                    wordWrap:        'on',
                    scrollBeyondLastLine: false,
                    overviewRulerLanes: 0,
                    renderLineHighlight:  'gutter',
                    fontFamily:      "'Fira Code', 'Monaco', 'Consolas', 'Courier New', monospace",
                    fontSize:        13,
                    lineHeight:      LINE_HEIGHT,
                    tabSize:         2,
                    automaticLayout: true,
                    padding:         { top: 8, bottom: 8 },
                    fixedOverflowWidgets: true,
                  }}
                />
              );
            })()}
          </Box>
        )}

        {/* Output canvas — HTML view OR fixed-height code view.
            Priority of content sources:
              1. `display.dom(...)` / `display.html(...)` items (live-mount
                 path — Three.js canvases land here).
              2. `result` (string → HTML, anything else → JSON pretty).
              3. Error banner.
              4. Empty-state hint.
            `dangerouslySetInnerHTML` is fine — input is user-authored in
            the same document, no cross-origin / untrusted content. */}
        {(viewMode === 'html' || (viewMode === 'code' && !!windowHeight)) && (
          <Box sx={{
            p: 1.5,
            minHeight: 60,
            bgcolor: 'background.paper',
            // Fixed-height: fill remaining flex slot and scroll inside —
            // critical for canvases that should respect the user-set viewport.
            ...(windowHeight ? { flex: 1, minHeight: 0, overflow: 'auto' } : {}),
          }}>
            {error ? (
              <Alert severity="error" sx={{ fontSize: '0.85em' }}>{error}</Alert>
            ) : output.length > 0 ? (
              <DisplayOutput items={output} />
            ) : result === undefined || result === null ? (
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                Brak wyniku. Uruchom skrypt (▶) — w tym widoku pokazują się
                elementy z display.html / display.dom oraz zwrócona wartość.
                Edycja kodu źródłowego w pełnoekranowym edytorze (⛶).
              </Typography>
            ) : typeof result === 'string' ? (
              <div dangerouslySetInnerHTML={{ __html: result }} />
            ) : (
              <Box component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.78em', m: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(result, null, 2)}
              </Box>
            )}
          </Box>
        )}

        {/* Footer output panel — only for auto-height code mode. In HTML
            view OR fixed-height code mode the canvas above already shows
            output, so a second panel would double up the rendering. */}
        {hasOutput && viewMode === 'code' && !windowHeight && (
          <Box sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            maxHeight: 300,
            overflow: 'auto',
          }}>
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

      {/* Pełnoekranowy edytor — wspólny komponent, tej samej klasy co edytor
          logiki akcji w Edytorze Konwersacji. */}
      <Suspense fallback={null}>
        {editorDialogOpen && (
          <AutomateScriptEditorDialog
            open={editorDialogOpen}
            onClose={() => setEditorDialogOpen(false)}
            blockId={blockId.current}
            code={code}
            onCodeChange={(next: string) => persistCode(next)}
            settings={{ autorun, viewMode, tags, windowHeight, umlProjects, scenePath, scriptFile }}
            onSettingsChange={(patch: Partial<AutomateScriptSettings>) => updateAttributes(patch)}
            userName={userName}
          />
        )}
      </Suspense>

      {/* ── Wybór biblioteki (otwierany z dialogu ustawień) ── */}
      <Suspense fallback={null}>
        {libraryPickerOpen && (
          <AutomateLibraryPickerDialog
            open={libraryPickerOpen}
            onClose={() => setLibraryPickerOpen(false)}
            code={code}
            onChange={handleLibraryChange}
          />
        )}
      </Suspense>

      {/* ── Settings dialog ── */}
      {/* Opens from both the in-doc header ⚙ and the fullscreen editor
          title bar ⚙. Owns no persistence — every change is forwarded
          straight to updateAttributes so it round-trips through Markdown.
          The library picker is launched FROM here (button inside the
          dialog), which means it stacks on top of the settings dialog —
          that's fine, Library picker is modal on its own and closing it
          drops us back here. */}
      <Suspense fallback={null}>
        {settingsOpen && (
          <AutomateScriptSettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            autorun={autorun}
            viewMode={viewMode}
            tags={tags}
            windowHeight={windowHeight}
            onAutorunChange={(v) => updateAttributes({ autorun: v })}
            onViewModeChange={(v) => updateAttributes({ viewMode: v })}
            onTagsChange={(next) => updateAttributes({ tags: next })}
            onWindowHeightChange={(next) => updateAttributes({ windowHeight: next })}
            onOpenLibraryPicker={() => setLibraryPickerOpen(true)}
            onOpenUpdateScript={() => { setSettingsOpen(false); setUpdateScriptOpen(true); }}
            availableUmlProjects={availableUmlProjects}
            umlProjects={umlProjects}
            onUmlProjectsChange={(next) => updateAttributes({ umlProjects: next })}
            scenePath={scenePath}
            onScenePathChange={(next) => updateAttributes({ scenePath: next })}
            scriptFile={scriptFile}
            onScriptFileChange={(next) => updateAttributes({ scriptFile: next })}
          />
        )}
        {updateScriptOpen && (
          <AutomateUpdateScriptDialog
            open={updateScriptOpen}
            onClose={() => setUpdateScriptOpen(false)}
            currentCode={code}
            onChange={handleUpdateScript}
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
      // Free-form labels for grouping / filtering scripts (no UI semantics
      // yet — the settings dialog edits them, the Markdown serializer
      // round-trips them as `t=a,b,c` in the fence params, and downstream
      // tooling can index on them).
      tags: { default: [] as string[] },
      // Optional fixed height (in px) for the in-doc component. `null` =
      // auto-size (current default behaviour: textarea grows up to 400px
      // and the output panel sits below). When set, the whole Paper becomes
      // a flex column of that exact height — useful for embedded canvases
      // (Three.js viewports, dashboards) where you want a stable layout.
      windowHeight: { default: null as number | null },
      // UML project file names (drive/uml/*.umlproj.json) whose classes are
      // turned into Blockly block categories in the visual editor.
      umlProjects: { default: [] as string[] },
      // Ścieżka pliku JSON ze sceną obiektów QObject (względna do home usera).
      scenePath: { default: '' },
      // Powiązany plik `.automate` (ścieżka względem drive użytkownika). Gdy
      // ustawiony, to on jest źródłem kodu — blok trzyma kopię, żeby dokument
      // dało się otworzyć i uruchomić bez dostępu do pliku.
      scriptFile: { default: '' },
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
          // Tags arrive as `data-tags="a,b,c"` (URL-encoded comma-separated).
          // Decode here so callers see a real array; skip empties so we don't
          // surface phantom `['']` from a leading/trailing comma.
          const tagsRaw = element.getAttribute('data-tags') || '';
          const tags = tagsRaw
            ? tagsRaw.split(',').map(t => decodeURIComponent(t.trim())).filter(Boolean)
            : [];
          // windowHeight: parse number or null. Bad/garbage values fall back
          // to null so the block doesn't render at a broken height.
          const whRaw = element.getAttribute('data-window-height');
          const whNum = whRaw ? Number(whRaw) : NaN;
          const windowHeight = Number.isFinite(whNum) && whNum > 0 ? whNum : null;
          const umlRaw = element.getAttribute('data-uml-projects') || '';
          const umlProjects = umlRaw
            ? umlRaw.split(',').map(t => decodeURIComponent(t.trim())).filter(Boolean)
            : [];
          return {
            blockId: element.getAttribute('data-block-id') || '',
            code: element.getAttribute('data-code')
              ? decodeURIComponent(element.getAttribute('data-code') || '')
              : '',
            autorun: element.getAttribute('data-autorun') === 'true',
            viewMode: vm === 'html' ? 'html' : 'code',
            tags,
            windowHeight,
            umlProjects,
            scenePath: element.getAttribute('data-scene-path')
              ? decodeURIComponent(element.getAttribute('data-scene-path') || '')
              : '',
            scriptFile: element.getAttribute('data-script-file')
              ? decodeURIComponent(element.getAttribute('data-script-file') || '')
              : '',
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
    // Persist tags into the DOM attr so turndown / markdownConverter can
    // pick them up. Each tag is URL-encoded individually so commas inside
    // a tag couldn't ever survive (they shouldn't — settings dialog
    // normalises them — but defensive cheap encoding doesn't hurt).
    const tagsArr: string[] = Array.isArray(node.attrs.tags) ? node.attrs.tags : [];
    if (tagsArr.length > 0) {
      attrs['data-tags'] = tagsArr.map(t => encodeURIComponent(t)).join(',');
    }
    if (typeof node.attrs.windowHeight === 'number' && node.attrs.windowHeight > 0) {
      attrs['data-window-height'] = String(node.attrs.windowHeight);
    }
    const umlArr: string[] = Array.isArray(node.attrs.umlProjects) ? node.attrs.umlProjects : [];
    if (umlArr.length > 0) {
      attrs['data-uml-projects'] = umlArr.map(p => encodeURIComponent(p)).join(',');
    }
    if (typeof node.attrs.scenePath === 'string' && node.attrs.scenePath) {
      attrs['data-scene-path'] = encodeURIComponent(node.attrs.scenePath);
    }
    if (typeof node.attrs.scriptFile === 'string' && node.attrs.scriptFile) {
      attrs['data-script-file'] = encodeURIComponent(node.attrs.scriptFile);
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
