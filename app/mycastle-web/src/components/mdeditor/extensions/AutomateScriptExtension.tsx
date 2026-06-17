/**
 * Automate Script Extension - rozszerzenie Tiptap do wykonywalnych blokow skryptowych
 * Format markdown: ```automate:blockId\ncode\n```
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Divider,
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
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  Tab,
  Tabs,
  Badge,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExtensionIcon from '@mui/icons-material/Extension';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import SettingsIcon from '@mui/icons-material/Settings';
import LabelIcon from '@mui/icons-material/Label';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CodeIcon from '@mui/icons-material/Code';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorTypes } from 'monaco-editor';

import { useAuth } from '../../../modules/auth/AuthContext';

// Lazy — the docs string (`docs/MDScript.md`) is in its own chunk so users
// who never click help don't pay for it.
// Help browser (filesystem tree of drive/public/doc + markdown viewer) — lazy
// so its react-markdown chunk loads only when the user opens the help window.
const AutomateHelpBrowserDialog = lazy(() => import('./AutomateHelpBrowserDialog'));
// Inspektor QObject (drzewo obiektów parsowanych ze źródła) — lazy.
const AutomateQObjectPanel = lazy(() => import('./AutomateQObjectPanel'));

// Wizualny builder sceny QWidget — lazy, ciężki komponent.
const QObjectSceneBuilderDialog = lazy(() => import('./QObjectSceneBuilderDialog'));

// Lazy — file picker only loads when the user clicks "Dołącz plik".
const AutomateIncludeFileDialog = lazy(() => import('./AutomateIncludeFileDialog'));

// Lazy — Blockly is heavy; only loaded when the user switches to block mode.
const AutomateBlocklyEditor = lazy(() => import('./AutomateBlocklyEditor'));

import { listUmlProjects, loadUmlClasses, type UmlClassDef } from './umlBlockly';
import { parseQObjects } from './qobjectSource';
import { emptyScene, normalizeScene, type QObjectScene } from './qobjectScene';
import { readUserJson, writeUserJson } from '../../../services/userJson';

import { setupAutomateMonaco, mergeExtraLibs } from '../../../modules/automate/designer/automateMonacoSetup';
import { editorOverlay } from '../editorOverlayState';
import { MonacoSelectionHandles } from '../../../pages/drive/MonacoSelectionHandles';
import { LIBRARIES, parseLibrariesFromCode, preloadLibrariesForCode } from './automateLibraries';

// Lazy — picker only loads when the user clicks "Użyj biblioteki".
const AutomateLibraryPickerDialog = lazy(() => import('./AutomateLibraryPickerDialog'));
// Settings dialog is small but only ever opens on user click — lazy-load to
// keep the initial document parse cheap (every script block in the doc would
// otherwise pull this code).
const AutomateScriptSettingsDialog = lazy(() => import('./AutomateScriptSettingsDialog'));
// Update Script dialog — lazy, opens only when user clicks the button in settings.
const AutomateUpdateScriptDialog = lazy(() => import('./AutomateUpdateScriptDialog'));
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

// ── Embedded-file helpers ──────────────────────────────────────────────────
// Parses blocks delimited by the markers that AutomateIncludeFileDialog and
// handleIncludeImport insert, so the "Included" tab can list them and let the
// author remove specific blocks in one click.
//
// Inline include markers (inserted by AutomateIncludeFileDialog):
//   // ─── included: PATH ───
//   <file content>
//   // ----- PATH
//
// Module import markers (inserted by handleIncludeImport):
//   // ─── import: PATH ───
//   const xModule = await import('url');
//   const { … } = xModule;
//   // ----- import PATH

interface EmbeddedFile {
  path: string;
  type: 'included' | 'import';
  startLine: number;   // index of the opening marker line
  endLine: number;     // index of the closing marker line
}

function parseEmbeddedFiles(code: string): EmbeddedFile[] {
  if (!code) return [];
  const lines = code.split('\n');
  const result: EmbeddedFile[] = [];
  const BOX = '─'; // ─ (U+2500 BOX DRAWINGS LIGHT HORIZONTAL)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inline include start: // ─── included: PATH ───
    const incMatch = line.match(new RegExp(`^// ${BOX}{3} included: (.+?) ${BOX}{3}\\s*$`));
    if (incMatch) {
      const path = incMatch[1];
      const endMarker = `// ----- ${path}`;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimEnd() === endMarker) {
          result.push({ path, type: 'included', startLine: i, endLine: j });
          break;
        }
      }
      continue;
    }

    // Module import start: // ─── import: PATH ───
    const impMatch = line.match(new RegExp(`^// ${BOX}{3} import: (.+?) ${BOX}{3}\\s*$`));
    if (impMatch) {
      const path = impMatch[1];
      const endMarker = `// ----- import ${path}`;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimEnd() === endMarker) {
          result.push({ path, type: 'import', startLine: i, endLine: j });
          break;
        }
      }
    }
  }

  return result;
}

// Remove the lines from startLine to endLine inclusive, plus any empty line
// immediately preceding the block (the snippet is inserted with a leading \n).
function removeEmbeddedBlock(code: string, file: EmbeddedFile): string {
  const lines = code.split('\n');
  let from = file.startLine;
  if (from > 0 && lines[from - 1].trim() === '') from--;
  return [...lines.slice(0, from), ...lines.slice(file.endLine + 1)].join('\n');
}

// ── Blockly persistence + runtime combination ────────────────────────────────
// The Blockly side (block layout + the JS it generates) is stored OUT of the
// visible script, in a trailing `//@blockly <base64>` comment marker holding
// `{ s: workspaceState, c: generatedCode }`. The code editor only ever shows
// the user's *normal* hand-written body — Blockly never overwrites it. At run
// time the two are combined (`buildRuntimeCode`): the Blockly-generated code is
// concatenated with the normal body. External libraries (`// @library: …`) live
// only in the normal body and so appear once in the combined runtime code.
const BLOCKLY_MARKER_RE = /\n*\/\/@blockly\s+([A-Za-z0-9+/=]+)\s*$/;

interface BlocklySplit { body: string; state: string | null; blocklyCode: string }

/** Splits script text into the normal body and the stored Blockly state + generated code. */
function splitBlockly(full: string): BlocklySplit {
  const m = full.match(BLOCKLY_MARKER_RE);
  if (!m || m.index === undefined) return { body: full, state: null, blocklyCode: '' };
  let state: string | null = null;
  let blocklyCode = '';
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    const obj = JSON.parse(json) as { s?: string | null; c?: string; blocks?: unknown; languageVersion?: unknown };
    if (obj && (obj.s !== undefined || obj.c !== undefined)) {
      state = obj.s ?? null;
      blocklyCode = obj.c ?? '';
    } else if (obj && (obj.blocks !== undefined || obj.languageVersion !== undefined)) {
      // Legacy marker: the payload was the raw workspace state (generated code
      // lived inline in the body back then). Keep the layout editable.
      state = json;
    }
  } catch { /* malformed marker → ignore */ }
  return { body: full.slice(0, m.index).replace(/\n+$/, ''), state, blocklyCode };
}

/** Re-attaches the Blockly marker to a normal body (no-op when there's nothing to store). */
function joinBlockly(body: string, state: string | null, blocklyCode: string): string {
  if (!state && !blocklyCode) return body;
  try {
    const payload = JSON.stringify({ s: state ?? null, c: blocklyCode ?? '' });
    return `${body}\n//@blockly ${btoa(unescape(encodeURIComponent(payload)))}`;
  } catch { return body; }
}

/** The actual script to execute: the normal body first (it usually declares the
 *  classes/functions/setup), then the Blockly-generated code which uses them.
 *  Body-first avoids `class`/`const` temporal-dead-zone errors when the blocks
 *  reference something defined in the normal code. */
function buildRuntimeCode(full: string): string {
  const { body, blocklyCode } = splitBlockly(full);
  if (!blocklyCode) return body;
  return body ? `${body}\n${blocklyCode}` : blocklyCode;
}

// Komponent renderujacy wyniki display
const DisplayOutput: React.FC<{ items: DisplayItem[] }> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <Box sx={{ p: 1 }}>
      {items.map((item) => {
        switch (item.type) {
          case 'text':
            return (
              <Typography key={item.id} variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
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
              <Table key={item.id} size="small" sx={{ my: 0.5 }}>
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
              <List key={item.id} dense disablePadding sx={{ my: 0.5 }}>
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
                key={item.id}
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
                key={item.id}
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
                key={item.id}
                // `min-width: 0` na dziecku flexa jest kluczowe dla komponentów
                // rysujących na <canvas> (qt-canvas, Three.js): bez tego
                // min-content flex-itema = intrinsic szerokość backing-bufora
                // canvasu (w*devicePixelRatio = 2× na Retinie), więc element
                // rośnie do 2× szerokości panelu → współrzędne myszy w osi X
                // rozjeżdżają się o połowę. `min-width: 0` pozwala uszanować
                // width:100% zamiast min-content.
                sx={{ my: 0.5, display: 'flex', justifyContent: 'center', '& > *': { minWidth: 0, maxWidth: '100%' } }}
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
  // textareaRef removed — the inline code surface is now Monaco. Cursor /
  // focus tracking handled internally by Monaco; no React ref needed
  // beyond what `onMount` captures for the fullscreen path.

  const {
    registerBlock,
    unregisterBlock,
    updateBlockCode,
    setBlockScene,
    restoreScene,
    stopBlock,
    runBlock,
    getBlockState,
    clearBlockOutput,
    getScriptRoots,
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
  const [helpBrowserOpen, setHelpBrowserOpen] = useState(false);
  // Panel inspektora QObject (drzewo obiektów ze źródła) — domyślnie ukryty.
  const [qobjectPanelOpen, setQobjectPanelOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  // Consolidated settings dialog (Auto / view mode / library / tags) opened
  // from a single ⚙ button — both in the in-doc header and the fullscreen
  // editor title bar. Previously those settings were scattered across the
  // header bar; that worked but discoverability was poor and tags had no
  // home at all. One button, one dialog.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateScriptOpen, setUpdateScriptOpen] = useState(false);
  const [sceneBuilderOpen, setSceneBuilderOpen] = useState(false);
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
  // Editor instance held in state (not just the ref) so MonacoSelectionHandles
  // re-renders and mounts its touch pins once the editor is ready.
  const [monacoEditorInstance, setMonacoEditorInstance] = useState<MonacoEditorTypes.IStandaloneCodeEditor | null>(null);
  // The full Monaco namespace — needed to re-register library .d.ts stubs
  // when the user types a `// @library:` marker into the editor by hand
  // (or pastes code that already has one).
  const monacoRef = useRef<Monaco | null>(null);
  const { currentUser } = useAuth();
  const userName = (currentUser as { name?: string } | null)?.name ?? '';
  const [dialogCode, setDialogCode] = useState('');
  // Fullscreen editor view: 'code' = Monaco source editor, 'blockly' = visual
  // block editor (default JS blocks) that generates the JS into dialogCode.
  const [dialogEditMode, setDialogEditMode] = useState<'code' | 'blockly' | 'blocklyCode'>('code');
  // Active tab in the dialog's bottom panel — 'output' shows display.* /
  // return value, 'logs' shows api.log.*. Default to output because that's
  // where most scripts surface visible results.
  const [dialogTab, setDialogTab] = useState<'output' | 'logs' | 'included'>('output');
  // Whether the output/logs panel is visible in fullscreen dialog.
  const [outputPanelVisible, setOutputPanelVisible] = useState(true);
  // Output panel height — persisted across dialog opens. Initialised once
  // from localStorage; the actual clamp (min 80 / max 80% of viewport) is
  // applied during drag, so a previously-saved-then-shrunken-viewport value
  // can't lock the user out of the editor.
  const OUTPUT_PANEL_KEY = 'automate-output-panel-height';
  const [outputPanelHeight, setOutputPanelHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(OUTPUT_PANEL_KEY);
      const n = saved ? parseInt(saved, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 300;
    } catch { return 300; }
  });
  // Persist after the drag settles, not on every move — avoids hammering
  // localStorage during fast drags.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(OUTPUT_PANEL_KEY, String(outputPanelHeight)); } catch { /* full storage */ }
    }, 300);
    return () => clearTimeout(t);
  }, [outputPanelHeight]);
  // Refs for the drag — kept out of state so move events don't re-render.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: outputPanelHeight };
    // Document-level cursor + select disable so the experience matches
    // VSCode's split bars (cursor doesn't flicker when sliding over the
    // editor or empty areas).
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [outputPanelHeight]);

  // Mouse/Touch move + up handlers — installed on window so a drag started
  // on the divider keeps tracking even if the cursor leaves it. Cleanup
  // restores cursor/select when the user releases.
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const y = 'touches' in e ? e.touches[0]?.clientY ?? d.startY : e.clientY;
      const delta = d.startY - y;   // dragging up grows the panel
      const max = Math.max(160, window.innerHeight * 0.8);
      const next = Math.max(80, Math.min(max, d.startHeight + delta));
      setOutputPanelHeight(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, []);
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
  const umlProjectsKey = umlProjects.join(',');

  // Ścieżka pliku JSON ze sceną obiektów QObject (wybierana w ustawieniach).
  const scenePath: string = typeof node.attrs.scenePath === 'string' ? node.attrs.scenePath : '';
  // Scena wczytana z pliku — edytowana w panelu QObject, zapisywana przy „Zapisz".
  const [qobjScene, setQobjScene] = useState<QObjectScene>(() => emptyScene());
  // Czy scena ma niezapisane zmiany (edycja w panelu nie zmienia kodu, więc
  // potrzebny osobny flag, żeby aktywować przycisk „Zapisz").
  const [sceneDirty, setSceneDirty] = useState(false);
  // Snapshot sceny (JSON) z momentu ostatniego Run — Stop przywraca do niego.
  const sceneSnapshotRef = useRef<string | null>(null);
  // Czy trwa przebieg (od Run do Stop) — steruje aktywnością przycisku Stop.
  const [running, setRunning] = useState(false);

  // Available UML projects (for the settings picker) — loaded when the dialog opens.
  const [availableUmlProjects, setAvailableUmlProjects] = useState<string[]>([]);
  // Parsed UML classes from the selected projects — fed to the Blockly editor.
  const [umlClasses, setUmlClasses] = useState<UmlClassDef[]>([]);

  useEffect(() => {
    if (!settingsOpen || !userName) return;
    let alive = true;
    listUmlProjects(userName).then((files) => { if (alive) setAvailableUmlProjects(files); });
    return () => { alive = false; };
  }, [settingsOpen, userName]);

  useEffect(() => {
    if (!userName || !umlProjectsKey) { setUmlClasses([]); return; }
    let alive = true;
    loadUmlClasses(userName, umlProjectsKey.split(',')).then((classes) => { if (alive) setUmlClasses(classes); });
    return () => { alive = false; };
  }, [userName, umlProjectsKey]);

  // Wczytaj scenę QObject z pliku: przy montażu bloku (żeby autorun/Run miały
  // scenę dla api.scripts.getRoot()) oraz przy otwarciu edytora / zmianie pliku.
  // Brak pliku → pusta scena.
  useEffect(() => {
    setSceneDirty(false);
    if (!userName || !scenePath) { setQobjScene(emptyScene()); return; }
    let alive = true;
    readUserJson<unknown>(userName, scenePath)
      .then((raw) => { if (alive) { setQobjScene(raw ? normalizeScene(raw) : emptyScene()); setSceneDirty(false); } })
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

  const handleClear = useCallback(() => {
    clearBlockOutput(blockId.current);
  }, [clearBlockOutput]);

  const openEditorDialog = useCallback(() => {
    setDialogCode(code);
    setEditorDialogOpen(true);
  }, [code]);

  // Dirty = there are unsaved changes. `code` is the last-persisted version
  // (the source of truth in TipTap attrs); `dialogCode` is the in-flight
  // edit buffer in the fullscreen dialog. They diverge as soon as the user
  // types and converge again when Save (or Save+Run) lands.
  const isDirty = editorDialogOpen && dialogCode !== code;

  const handleEditorDialogSave = useCallback(() => {
    // Save WITHOUT closing — user explicitly asked to keep the dialog open
    // so they can hit Run / continue editing right after persisting. Exit
    // is a separate button now. `setCode` syncs local state with the
    // freshly-saved value so isDirty flips back to false next render.
    setCode(dialogCode);
    updateAttributes({ code: dialogCode });
    updateBlockCode(blockId.current, buildRuntimeCode(dialogCode));
    // Zapisz też scenę QObject do wybranego pliku JSON (jeśli ustawiony).
    if (userName && scenePath) {
      writeUserJson(userName, scenePath, qobjScene)
        .then(() => setSceneDirty(false))
        .catch((e) => console.warn('Zapis sceny QObject nie powiódł się:', e));
    } else {
      setSceneDirty(false);
    }
  }, [dialogCode, updateAttributes, updateBlockCode, userName, scenePath, qobjScene]);

  /** Save + run inside the fullscreen dialog — keeps the dialog open so the
   *  user sees the output panel below the editor without losing context. */
  const handleEditorDialogRun = useCallback(() => {
    setCode(dialogCode);
    updateAttributes({ code: dialogCode });
    const runtime = buildRuntimeCode(dialogCode);
    updateBlockCode(blockId.current, runtime);
    // Snapshot sceny QObject (zapisany stan) — Stop przywróci scenę do tej formy.
    sceneSnapshotRef.current = JSON.stringify(qobjScene);
    setRunning(true);
    // Pass the combined runtime code (Blockly blocks + normal body) as override
    // so runBlock executes the freshly-edited buffer regardless of whether the
    // context's block.code has committed yet.
    // Library preload happens inside runBlock now (uniform error path).
    void runBlock(blockId.current, runtime);
  }, [dialogCode, updateAttributes, updateBlockCode, runBlock, qobjScene]);

  /** Stop — przywraca scenę QObject do stanu zapisanego przy ostatnim Run
   *  (snapshot). Nie ubija samego skryptu (runtime nie wspiera przerwania), ale
   *  cofa zmiany sceny do zapisanej formy i odświeża panel. */
  const handleStop = useCallback(() => {
    // 1) Przerwij wykonanie skryptu: abort + wyczyszczenie timerów/rAF/onStop.
    stopBlock(blockId.current);
    // 2) Cofnij zmiany na ŻYWYCH obiektach sceny (te z getRoot, na canvasie).
    restoreScene();
    // 3) Przywróć też dane sceny w panelu/edytorze do snapshotu z Run.
    const snap = sceneSnapshotRef.current;
    if (snap) {
      try {
        setQobjScene(normalizeScene(JSON.parse(snap)));
        setSceneDirty(true);
      } catch { /* uszkodzony snapshot — ignoruj */ }
    }
    setRunning(false);
  }, [restoreScene, stopBlock]);

  /** Library picker callback — receives a fresh code body with `// @library:`
   *  marker(s) inserted. Mirror the change into both the local `dialogCode`
   *  (so the editor reflects it immediately) and the TipTap attribute (so the
   *  marker survives save / reload). */
  const handleLibraryChange = useCallback((newCode: string) => {
    setDialogCode(newCode);
    setCode(newCode);
    updateAttributes({ code: newCode });
    updateBlockCode(blockId.current, buildRuntimeCode(newCode));
    // Best-effort: also kick off a CDN preload so the runtime is ready by
    // the time the user clicks Run. Ignored on failure — the actual run
    // path retries and surfaces errors properly.
    void preloadLibrariesForCode(newCode);
  }, [updateAttributes, updateBlockCode]);

  /** Called by AutomateUpdateScriptDialog when a browser script is
   *  embedded or updated in-place. Persists immediately (same as library
   *  change) so the block is saved without requiring the fullscreen editor. */
  const handleUpdateScript = useCallback((newCode: string) => {
    setDialogCode(newCode);
    setCode(newCode);
    updateAttributes({ code: newCode });
    updateBlockCode(blockId.current, buildRuntimeCode(newCode));
  }, [updateAttributes, updateBlockCode]);

  /** Called by QObjectSceneBuilderDialog — inserts generated init/modify code
   *  at the top of the script body so the user can review and run it. */
  const handleSceneBuilderCode = useCallback((generated: string) => {
    const editor = monacoEditorRef.current;
    const separator = '\n\n';
    if (editor) {
      const pos = editor.getPosition();
      const range = pos
        ? { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }
        : { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
      editor.executeEdits('scene-builder', [{ range, text: generated + separator, forceMoveMarkers: true }]);
      const newCode = editor.getValue();
      setDialogCode(newCode);
      setCode(newCode);
      updateAttributes({ code: newCode });
      updateBlockCode(blockId.current, buildRuntimeCode(newCode));
    } else {
      const newCode = generated + separator + (dialogCode || '');
      setDialogCode(newCode);
      setCode(newCode);
      updateAttributes({ code: newCode });
      updateBlockCode(blockId.current, buildRuntimeCode(newCode));
    }
  }, [dialogCode, updateAttributes, updateBlockCode]);

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

  /** Paste from the system clipboard into the editor at the cursor.
   *  Monaco's built-in paste is unreliable on mobile (Android) — the hidden
   *  textarea often never receives the clipboard event — so we read the
   *  clipboard explicitly and insert via executeEdits. Falls back to a prompt
   *  when the Clipboard API is blocked (no permission / insecure context). */
  const handlePasteFromClipboard = useCallback(async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      const manual = window.prompt('Schowek niedostępny — wklej tekst ręcznie:', '');
      if (manual == null) return;
      text = manual;
    }
    if (!text) return;
    const editor = monacoEditorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) { setDialogCode(prev => prev + text); return; }
    // Insert at the current selection, or at end-of-document if the user
    // hasn't placed a cursor yet (common right after opening on mobile).
    const sel = editor.getSelection();
    const full = model.getFullModelRange();
    const range = sel ?? {
      startLineNumber: full.endLineNumber, startColumn: full.endColumn,
      endLineNumber: full.endLineNumber, endColumn: full.endColumn,
    };
    editor.executeEdits('automate-paste', [{ range, text, forceMoveMarkers: true }]);
    editor.focus();
    setDialogCode(model.getValue());
  }, []);

  /** Insert a `await import(url)` snippet at the cursor. Picker passes the
   *  HTTP URL (already pointing at `/public/drive/users/{u}/...`), the
   *  source filename for the marker comment, and the list of named exports
   *  it detected by parsing the file. We generate a module-variable name
   *  (filename → camelCase) plus a destructure line listing every export —
   *  the author doesn't have to copy names by hand. */
  const handleIncludeImport = useCallback((url: string, sourcePath: string, exports: string[]) => {
    // 'drive/public/lit/components/clock.module.js' → 'clockModule'
    const basename = sourcePath.split('/').pop() ?? 'mod';
    const stem = basename.replace(/\.(module\.)?(m?js|ts)$/i, '').replace(/\.module$/, '');
    const varName = stem
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      + 'Module';

    // If the picker found named exports, generate the destructure line so
    // identifiers like CLOCK_TAG are immediately in scope. Otherwise leave a
    // hint comment — the author can add by hand once they know the shape.
    const destructure = exports.length > 0
      ? `const { ${exports.join(', ')} } = ${varName};\n`
      : `// dostęp: ${varName}.<nazwa eksportu> — destrukturyzuj wg potrzeb\n`;

    const snippet =
      `\n// ─── import: ${sourcePath} ───\n` +
      `const ${varName} = await import('${url}');\n` +
      destructure +
      `// ----- import ${sourcePath}\n`;
    handleIncludeInsert(snippet);
  }, [handleIncludeInsert]);

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

  // Parse embedded file blocks from the live editor code so the Included tab
  // stays in sync with edits without requiring a separate "scan" action.
  const embeddedFiles = useMemo(() => parseEmbeddedFiles(dialogCode), [dialogCode]);

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
        {/* Header bar */}
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
            Skrypt automatyzacji
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

      {/* Monaco editor dialog — fullScreen so the user has the entire viewport
          for editing. The 80vh + lg dialog felt cramped for longer scripts and
          left awkward dead space on wide monitors. */}
      <Dialog
        open={editorDialogOpen}
        onClose={() => setEditorDialogOpen(false)}
        fullScreen
        // Blockly renders its field editors (text input, variable dropdown,
        // etc.) in a WidgetDiv/DropDownDiv appended to document.body — OUTSIDE
        // this dialog. MUI's focus trap would block typing/selecting in them,
        // so disable it (and auto/restore focus) while the dialog is open.
        disableEnforceFocus
        disableAutoFocus
        disableRestoreFocus
      >
        <DialogTitle sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SmartToyIcon sx={{ color: '#4caf50' }} />
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
            Edytor skryptu
          </Typography>
          {/* View toggle (icons only):
              Code        — normal source editor (the hand-written body)
              Blockly     — visual block editor
              Blockly Code— read/edit the JS generated by the blocks */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={dialogEditMode}
            onChange={(_e, v) => { if (v) setDialogEditMode(v); }}
            sx={{ mr: 0.5, '& .MuiToggleButton-root': { py: 0.25, px: 0.75 } }}
          >
            <ToggleButton value="code">
              <Tooltip title="Kod źródłowy"><CodeIcon fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="blockly">
              <Tooltip title="Blockly (programowanie graficzne)"><ExtensionIcon fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="blocklyCode">
              <Tooltip title="Połączony kod wyjściowy (źródłowy + Blockly) — podgląd"><IntegrationInstructionsIcon fontSize="small" /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
          {/* "Include file" button — pulls from drive/mdscript/, inserts at
              cursor. Disabled when we don't yet know the user (rare race
              during initial auth load). */}
          <Tooltip title="Wklej ze schowka (działa na mobile)">
            <IconButton size="small" onClick={() => void handlePasteFromClipboard()}>
              <ContentPasteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Dołącz plik z drive/mdscript/">
            <span>
              <IconButton size="small" onClick={() => setIncludeOpen(true)} disabled={!userName}>
                <AttachFileIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {/* Settings — same dialog as the in-doc header button. The
              dedicated Library button used to live here; it moved into
              the settings dialog so all per-block knobs are reachable
              from a single ⚙. */}
          <Tooltip title="Ustawienia skryptu">
            <IconButton size="small" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={qobjectPanelOpen ? 'Ukryj drzewo obiektów QObject' : 'Pokaż drzewo obiektów QObject'}>
            <IconButton
              size="small"
              onClick={() => setQobjectPanelOpen((v) => !v)}
              color={qobjectPanelOpen ? 'primary' : 'default'}
            >
              <AccountTreeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="QWidget Scene Builder — wizualny konstruktor GUI (QLabel, QPushButton, QSlider…)">
            <IconButton size="small" onClick={() => setSceneBuilderOpen(true)}>
              <ViewQuiltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Pomoc — przeglądarka dokumentacji (drive/public/doc)">
            <span>
              <IconButton size="small" onClick={() => setHelpBrowserOpen(true)} disabled={!userName}>
                <MenuBookIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {/* Primary actions moved up here from the bottom DialogActions —
              users on long scripts no longer need to scroll past code +
              output to hit Run/Save. Divider gives them visual weight so
              they don't blend with the icon-only utilities to the left. */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
          {/* Run / Stop — tylko ikony. Run robi snapshot sceny QObject i uruchamia;
              Stop przywraca scenę do zapisanego stanu (snapshotu z momentu Run). */}
          <Tooltip title="Uruchom (Ctrl+Enter) — zapisuje snapshot sceny">
            <span>
              <IconButton
                onClick={handleEditorDialogRun}
                disabled={status === 'running'}
                size="small"
                sx={{ color: '#4caf50' }}
              >
                {status === 'running'
                  ? <CircularProgress size={16} sx={{ color: '#4caf50' }} />
                  : <PlayArrowIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Stop — przerwij skrypt i przywróć scenę QObject">
            <span>
              <IconButton
                onClick={handleStop}
                disabled={!running}
                size="small"
                sx={{ color: '#e57373' }}
              >
                <StopIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={(isDirty || sceneDirty) ? 'Zapisz zmiany — kod i scenę QObject (dialog pozostanie otwarty)' : 'Brak niezapisanych zmian'}>
            <span>
              <Button
                onClick={handleEditorDialogSave}
                variant="contained"
                size="small"
                disabled={!isDirty && !sceneDirty}
              >
                Zapisz
              </Button>
            </span>
          </Tooltip>
          <Button
            onClick={() => setEditorDialogOpen(false)}
            size="small"
          >
            Wyjdź
          </Button>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Wiersz: [edytor] [opcjonalny panel inspektora QObject po prawej]. */}
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
          {/* Box wrapper ensures the Editor expands to fill remaining flex space
              regardless of fullScreen dialog's inner padding/border math.
              minWidth:0 pozwala edytorowi skurczyć się w wierszu flex, gdy obok
              jest panel inspektora QObject (bez tego Monaco trzyma intrinsic
              szerokość i wypycha panel poza ekran). */}
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            {dialogEditMode === 'blockly' ? (
              <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress /></Box>}>
                <AutomateBlocklyEditor
                  // Re-mount when the UML selection changes so block defs + toolbox refresh.
                  key={`uml:${umlProjectsKey}:${umlClasses.length}`}
                  initialState={splitBlockly(dialogCode).state}
                  onChange={(js, state) => {
                    // Blockly never overwrites the normal code — it only stores
                    // its workspace state + generated code in the marker. The two
                    // are combined at run time (buildRuntimeCode). External
                    // libraries stay in the normal body only.
                    const body = splitBlockly(dialogCode).body;
                    setDialogCode(joinBlockly(body, state, js));
                  }}
                  umlClasses={umlClasses}
                />
              </Suspense>
            ) : (
            <Editor
              // Remount when switching Code ↔ Blockly Code so Monaco swaps the
              // shown content cleanly instead of fighting the controlled value.
              key={dialogEditMode}
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
              // 'code' shows the editable hand-written body. 'blocklyCode' shows
              // the FINAL combined source that actually runs — the hand-written
              // body joined with the Blockly-generated code (buildRuntimeCode),
              // i.e. the output script. It's a read-only preview (you can't
              // unambiguously split an edited merge back into body + blocks).
              value={dialogEditMode === 'blocklyCode' ? buildRuntimeCode(dialogCode) : splitBlockly(dialogCode).body}
              onChange={value => {
                // 'blocklyCode' is a read-only preview of the merged output —
                // ignore stray change events. Only the 'code' view edits the body.
                if (dialogEditMode === 'blocklyCode') return;
                const prev = splitBlockly(dialogCode);
                const v = joinBlockly(value || '', prev.state, prev.blocklyCode);
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
                // Expose the instance to React so the touch selection handles
                // (Android-style drag pins) mount. Cleared on dispose.
                setMonacoEditorInstance(editor);
                editor.onDidDispose(() => setMonacoEditorInstance(null));

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
                    // Probe the worker matching the model's actual language.
                    // The editor now defaults to TypeScript (so ambient .d.ts
                    // declarations are visible), and calling getJavaScriptWorker
                    // for a TS model returns undefined → the old probe always
                    // failed with `(err as Error).message === undefined`, even
                    // though IntelliSense was fine.
                    const lang = model.getLanguageId();
                    const getWorker = lang === 'typescript'
                      ? await monaco.languages.typescript.getTypeScriptWorker()
                      : await monaco.languages.typescript.getJavaScriptWorker();
                    const proxy = await Promise.race([
                      getWorker(model.uri),
                      new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('worker getProxy timeout')), 5000)),
                    ]);
                    // eslint-disable-next-line no-console
                    console.log(`[AutomateMonaco] ${lang} worker responsive:`, typeof proxy);
                  } catch (err) {
                    console.warn('[AutomateMonaco] worker probe FAILED:', (err as Error).message);
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
                // Połączony kod wyjściowy to tylko podgląd — nie do edycji.
                readOnly: dialogEditMode === 'blocklyCode',
              }}
              theme="vs-dark"
            />
            )}
          </Box>

          {/* Panel inspektora QObject — po prawej, domyślnie ukryty. Parsuje
              body skryptu i pozwala na operacje na hierarchii (edytują body). */}
          {qobjectPanelOpen && (
            <Suspense fallback={null}>
              <AutomateQObjectPanel
                scene={qobjScene}
                onSceneChange={(s) => { setQobjScene(s); setSceneDirty(true); }}
                {...(() => { const p = parseQObjects(splitBlockly(dialogCode).body); return { classes: p.classes, classProperties: p.classProperties }; })()}
                onClose={() => setQobjectPanelOpen(false)}
              />
            </Suspense>
          )}
          </Box>

          {/* Touch-friendly draggable selection handles (Android-style pins) —
              the same component used by the Drive Monaco editor. */}
          <MonacoSelectionHandles editor={monacoEditorInstance} />

          {/* Resizer — only visible when the output panel is open. */}
          {outputPanelVisible && (
            <Box
              onMouseDown={onDividerMouseDown}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (!t) return;
                dragRef.current = { startY: t.clientY, startHeight: outputPanelHeight };
              }}
              sx={{
                flex: '0 0 auto',
                height: 5,
                cursor: 'ns-resize',
                bgcolor: 'divider',
                opacity: 0.5,
                transition: 'opacity 0.15s, background 0.15s',
                '&:hover, &:active': { opacity: 1, bgcolor: 'primary.main' },
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: '-4px 0',
                },
              }}
            />
          )}

          {/* Bottom panel — tabbed Output / Logs. Collapsible via the
              ExpandMore/ExpandLess toggle in the tabs header. Height is
              user-resizable via the divider above. */}
          <Box
            sx={{
              flex: '0 0 auto',
              height: outputPanelVisible ? outputPanelHeight : 'auto',
              minHeight: outputPanelVisible ? 80 : 0,
              overflow: 'hidden',
              bgcolor: 'background.paper',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Tabs header with "Wyczyść" action on the right. The Tabs no
                longer own the bottom border — the parent row does — so the
                clear button shares the same baseline without a visible seam. */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Tabs
                value={dialogTab}
                onChange={(_, v) => setDialogTab(v)}
                variant="standard"
                sx={{
                  minHeight: 36,
                  flex: 1,
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
                <Tab
                  value="included"
                  label={
                    <Badge
                      color="success"
                      badgeContent={embeddedFiles.length || undefined}
                      sx={{ '& .MuiBadge-badge': { right: -14, top: 4 } }}
                    >
                      Included
                    </Badge>
                  }
                />
              </Tabs>
              {/* Clear — wipes BOTH tabs at once (display items, logs, result,
                  error). Disabled when there's nothing to clear so accidental
                  clicks while writing a script don't fire. */}
              <Tooltip title="Wyczyść output i logi">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleClear}
                    disabled={!hasOutput && logs.length === 0}
                    sx={{ mx: 0.5 }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={outputPanelVisible ? 'Hide output panel' : 'Show output panel'}>
                <IconButton
                  size="small"
                  onClick={() => setOutputPanelVisible(v => !v)}
                  sx={{ mr: 1 }}
                >
                  {outputPanelVisible ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>

            {/* Error banner — ALWAYS shown above the tab content (not gated by
                the active tab or hasOutput), so a failure is never hidden no
                matter which tab the author is on. */}
            {outputPanelVisible && error && (
              <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>{error}</Alert>
            )}

            {/* Output tab — display.* items, return value. */}
            {outputPanelVisible && dialogTab === 'output' && (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {!hasOutput && (
                  <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: 'block', fontStyle: 'italic' }}>
                    Brak wyników. Uruchom skrypt aby zobaczyć output (display.*, return value).
                  </Typography>
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
            {outputPanelVisible && dialogTab === 'logs' && (
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

            {/* Included tab — lists every embedded file block with a Remove button.
                Removing a block deletes the marker lines from dialogCode; the Monaco
                editor re-syncs automatically because it's controlled (value={dialogCode}). */}
            {outputPanelVisible && dialogTab === 'included' && (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {embeddedFiles.length === 0 ? (
                  <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: 'block', fontStyle: 'italic' }}>
                    No embedded files. Use the attach button (📎) to include files from drive/mdscript/.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {embeddedFiles.map((file, idx) => (
                      <ListItem
                        key={idx}
                        secondaryAction={
                          <Tooltip title="Remove embedded block from code">
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => setDialogCode(prev => removeEmbeddedBlock(prev, file))}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        }
                        sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                      >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {file.type === 'import'
                            ? <CodeIcon sx={{ fontSize: 16, color: '#4fc3f7' }} />
                            : <AttachFileIcon sx={{ fontSize: 16, color: '#81c784' }} />
                          }
                        </ListItemIcon>
                        <ListItemText
                          primary={file.path}
                          secondary={file.type === 'import' ? 'module import' : 'inline include'}
                          primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace', fontSize: '0.78rem', noWrap: true }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        {/* DialogActions removed — primary actions (Uruchom / Zapisz / Wyjdź)
            now live in the DialogTitle row at the top of the dialog so the
            user doesn't have to scroll past long output to reach them. */}
      </Dialog>

      {/* ── Help browser (drive/public/doc tree + markdown viewer) ── */}
      <Suspense fallback={null}>
        {helpBrowserOpen && (
          <AutomateHelpBrowserDialog
            open={helpBrowserOpen}
            onClose={() => setHelpBrowserOpen(false)}
            userName={userName}
          />
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
            onInsertImport={(url, sourcePath, exports) => handleIncludeImport(url, sourcePath, exports)}
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
        {sceneBuilderOpen && (
          <QObjectSceneBuilderDialog
            open={sceneBuilderOpen}
            onClose={() => setSceneBuilderOpen(false)}
            onInsertCode={handleSceneBuilderCode}
            getLiveRoots={getScriptRoots}
            initialRoots={qobjScene.roots}
            onRootsChange={(newRoots) => {
              setQobjScene(prev => ({ ...prev, roots: newRoots }));
              setSceneDirty(true);
            }}
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
