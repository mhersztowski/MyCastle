/**
 * Pełnoekranowy edytor skryptu automatyzacji.
 *
 * Wyjęty z NodeView bloku ```automate```, bo używają go dwa miejsca:
 *  • blok skryptu w edytorze markdown (AutomateScriptExtension),
 *  • logika akcji głosowej w Edytorze Konwersacji (Aura).
 *
 * Komponent nie wie nic o TipTapie ani o Voice Actions — dostaje kod i
 * ustawienia w propsach, a zmiany oddaje przez `onCodeChange` /
 * `onSettingsChange`. Wykonanie skryptu bierze z `useAutomateDocument()`,
 * więc każdy host musi być owinięty w `AutomateDocumentProvider`.
 */

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Badge, Box, Button, CircularProgress, Dialog, Divider,
  IconButton, List, ListItem, ListItemIcon, ListItemText, Tab, Tabs, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExtensionIcon from '@mui/icons-material/Extension';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CodeIcon from '@mui/icons-material/Code';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import Editor from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorTypes } from 'monaco-editor';

import { MonacoSelectionHandles } from '../../../pages/drive/MonacoSelectionHandles';
import { preloadLibrariesForCode } from './automateLibraries';
import { useAutomateDocument } from './AutomateDocumentContext';
import { listUmlProjects, loadUmlClasses, type UmlClassDef } from './umlBlockly';
import { parseQObjects } from './qobjectSource';
import { emptyScene, normalizeScene, type QObjectScene } from './qobjectScene';
import { readUserJson, writeUserJson } from '../../../services/userJson';
import { readAutomateFile, writeAutomateFile } from '../../../modules/voiceactions/auraScriptStore';
import { EMPTY_AUTOMATE_FILE } from '../../../modules/voiceactions/auraScriptFile';
import {
  DisplayOutput,
  buildRuntimeCode,
  joinBlockly,
  parseEmbeddedFiles,
  registerLibraryTypes,
  removeEmbeddedBlock,
  setupAutomateMonacoWithDisplay,
  splitBlockly,
} from './automateScriptCore';

const AutomateHelpBrowserDialog = lazy(() => import('./AutomateHelpBrowserDialog'));
const AutomateQObjectPanel = lazy(() => import('./AutomateQObjectPanel'));
const QObjectSceneBuilderDialog = lazy(() => import('./QObjectSceneBuilderDialog'));
const AutomateIncludeFileDialog = lazy(() => import('./AutomateIncludeFileDialog'));
const AutomateBlocklyEditor = lazy(() => import('./AutomateBlocklyEditor'));
const AutomateLibraryPickerDialog = lazy(() => import('./AutomateLibraryPickerDialog'));
const AutomateScriptSettingsDialog = lazy(() => import('./AutomateScriptSettingsDialog'));
const AutomateUpdateScriptDialog = lazy(() => import('./AutomateUpdateScriptDialog'));

/** Ustawienia bloku edytowane w dialogu ⚙ — identyczne z atrybutami węzła TipTap. */
export interface AutomateScriptSettings {
  autorun: boolean;
  viewMode: 'code' | 'html';
  tags: string[];
  /** `null` = auto-rozmiar. */
  windowHeight: number | null;
  umlProjects: string[];
  scenePath: string;
  /** Powiązany plik `.automate` (ścieżka względem drive). Pusty = kod w dokumencie. */
  scriptFile: string;
}

export const DEFAULT_AUTOMATE_SETTINGS: AutomateScriptSettings = {
  autorun: false,
  viewMode: 'code',
  tags: [],
  windowHeight: null,
  umlProjects: [],
  scenePath: '',
  scriptFile: '',
};

export interface AutomateScriptEditorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Identyfikator bloku w rejestrze wykonania (AutomateDocumentContext). */
  blockId: string;
  /** Ostatnio zapisany kod — źródło prawdy hosta. */
  code: string;
  /** Zapis kodu (Zapisz / Uruchom / wstawki z pickerów). */
  onCodeChange: (code: string) => void;
  settings: AutomateScriptSettings;
  onSettingsChange: (patch: Partial<AutomateScriptSettings>) => void;
  userName: string;
  /** Podtytuł w pasku — np. nazwa akcji głosowej albo ścieżka pliku. */
  subtitle?: string;
  /** Dokłada do palety Blockly kategorie „Aura: …" — używane przez Edytor
   *  Konwersacji, gdzie skrypt steruje rozmową. */
  auraBlocks?: boolean;
  /** Czy edytor stoi na pełnym ekranie (w oknie) — steruje ikoną przełącznika. */
  fullscreen?: boolean;
  /** Podane = w pasku pojawia się przycisk pełnego ekranu. Bufor jest zapisywany
   *  przed przełączeniem, bo zmiana miejsca w drzewie przemontowuje edytor. */
  onToggleFullscreen?: () => void;
  /** Ukrywa „Wyjdź" — w wariancie osadzonym nie ma czego zamykać. */
  hideClose?: boolean;
}

const OUTPUT_PANEL_KEY = 'automate-output-panel-height';

export const AutomateScriptEditor: React.FC<AutomateScriptEditorDialogProps> = ({
  open,
  onClose,
  blockId,
  code,
  onCodeChange,
  settings,
  onSettingsChange,
  userName,
  subtitle,
  auraBlocks,
  fullscreen,
  onToggleFullscreen,
  hideClose,
}) => {
  const {
    updateBlockCode,
    setBlockScene,
    restoreScene,
    stopBlock,
    runBlock,
    getBlockState,
    clearBlockOutput,
    getScriptRoots,
  } = useAutomateDocument();

  const [dialogCode, setDialogCode] = useState(code);
  // Bufor edycji startuje od aktualnie zapisanego kodu przy każdym otwarciu —
  // inaczej po zamknięciu bez zapisu wracalibyśmy do porzuconej wersji.
  useEffect(() => { if (open) setDialogCode(code); }, [open, code]);

  // Gdy blok wskazuje plik `.automate`, to plik jest źródłem prawdy: przy
  // otwarciu nadpisuje kopię trzymaną w dokumencie (ktoś mógł go zmienić
  // w Drive albo z innego bloku wskazującego ten sam plik).
  const [fileBusy, setFileBusy] = useState(false);
  useEffect(() => {
    if (!open || !userName || !settings.scriptFile) return;
    let alive = true;
    setFileBusy(true);
    readAutomateFile(userName, settings.scriptFile)
      .then(file => {
        if (!alive || !file) return;
        setDialogCode(file.code);
        if (file.code !== code) onCodeChange(file.code);
      })
      .catch(() => { /* brak pliku — zostaje kopia z dokumentu */ })
      .finally(() => { if (alive) setFileBusy(false); });
    return () => { alive = false; };
    // `code`/`onCodeChange` celowo poza zależnościami — ładujemy raz na otwarcie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userName, settings.scriptFile]);

  const [dialogEditMode, setDialogEditMode] = useState<'code' | 'blockly' | 'blocklyCode'>('code');
  const [dialogTab, setDialogTab] = useState<'output' | 'logs' | 'included'>('output');
  const [outputPanelVisible, setOutputPanelVisible] = useState(true);
  const [helpBrowserOpen, setHelpBrowserOpen] = useState(false);
  const [qobjectPanelOpen, setQobjectPanelOpen] = useState(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateScriptOpen, setUpdateScriptOpen] = useState(false);
  const [sceneBuilderOpen, setSceneBuilderOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const monacoEditorRef = useRef<MonacoEditorTypes.IStandaloneCodeEditor | null>(null);
  const [monacoEditorInstance, setMonacoEditorInstance] = useState<MonacoEditorTypes.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const umlProjectsKey = settings.umlProjects.join(',');
  const [availableUmlProjects, setAvailableUmlProjects] = useState<string[]>([]);
  const [umlClasses, setUmlClasses] = useState<UmlClassDef[]>([]);

  // Scena QObject wczytywana z pliku wskazanego w ustawieniach; edytowana w
  // panelu inspektora i zapisywana razem z kodem.
  const [qobjScene, setQobjScene] = useState<QObjectScene>(() => emptyScene());
  const [sceneDirty, setSceneDirty] = useState(false);
  const sceneSnapshotRef = useRef<string | null>(null);

  const [outputPanelHeight, setOutputPanelHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(OUTPUT_PANEL_KEY);
      const n = saved ? parseInt(saved, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 300;
    } catch { return 300; }
  });
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(OUTPUT_PANEL_KEY, String(outputPanelHeight)); } catch { /* full storage */ }
    }, 300);
    return () => clearTimeout(t);
  }, [outputPanelHeight]);

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: outputPanelHeight };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [outputPanelHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const y = 'touches' in e ? e.touches[0]?.clientY ?? d.startY : e.clientY;
      const delta = d.startY - y;   // dragging up grows the panel
      const max = Math.max(160, window.innerHeight * 0.8);
      setOutputPanelHeight(Math.max(80, Math.min(max, d.startHeight + delta)));
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  // Lista projektów UML — potrzebna dopiero, gdy użytkownik otworzy ustawienia.
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

  useEffect(() => {
    if (!open) return;
    setSceneDirty(false);
    if (!userName || !settings.scenePath) { setQobjScene(emptyScene()); return; }
    let alive = true;
    readUserJson<unknown>(userName, settings.scenePath)
      .then((raw) => { if (alive) { setQobjScene(raw ? normalizeScene(raw) : emptyScene()); setSceneDirty(false); } })
      .catch(() => { if (alive) setQobjScene(emptyScene()); });
    return () => { alive = false; };
  }, [open, userName, settings.scenePath]);

  // Dopóki edytor jest otwarty, to on jest właścicielem sceny widzianej przez
  // `api.scripts.getRoot()` — host rejestruje swoją kopię dopiero po zamknięciu.
  useEffect(() => {
    if (!open) return;
    setBlockScene(blockId, qobjScene.roots);
  }, [open, blockId, qobjScene, setBlockScene]);

  const blockState = getBlockState(blockId);
  const status = blockState?.status || 'idle';
  const output = blockState?.output || [];
  const logs = blockState?.logs || [];
  const error = blockState?.error;
  const result = blockState?.result;
  const hasOutput = output.length > 0 || logs.length > 0 || !!error || result !== undefined;

  const embeddedFiles = useMemo(() => parseEmbeddedFiles(dialogCode), [dialogCode]);
  const isDirty = open && dialogCode !== code;

  /** Wspólna ścieżka zapisu: host + rejestr wykonania dostają tę samą wersję. */
  const persistCode = useCallback((next: string) => {
    onCodeChange(next);
    updateBlockCode(blockId, buildRuntimeCode(next));
  }, [blockId, onCodeChange, updateBlockCode]);

  const handleSave = useCallback(() => {
    persistCode(dialogCode);
    // Powiązany plik dostaje tę samą treść — to on jest źródłem przy kolejnym
    // otwarciu, więc rozjazd z dokumentem byłby cichą utratą zmian.
    if (userName && settings.scriptFile) {
      void writeAutomateFile(userName, settings.scriptFile, {
        ...EMPTY_AUTOMATE_FILE,
        code: dialogCode,
        settings: { ...EMPTY_AUTOMATE_FILE.settings, autorun: settings.autorun, viewMode: settings.viewMode, tags: settings.tags },
      }).catch((e) => console.warn('Zapis pliku .automate nie powiódł się:', e));
    }
    if (userName && settings.scenePath) {
      writeUserJson(userName, settings.scenePath, qobjScene)
        .then(() => setSceneDirty(false))
        .catch((e) => console.warn('Zapis sceny QObject nie powiódł się:', e));
    } else {
      setSceneDirty(false);
    }
  }, [dialogCode, persistCode, userName, settings.scenePath, qobjScene]);

  const handleRun = useCallback(() => {
    persistCode(dialogCode);
    const runtime = buildRuntimeCode(dialogCode);
    // Snapshot sceny — Stop przywróci ją do stanu z momentu uruchomienia.
    sceneSnapshotRef.current = JSON.stringify(qobjScene);
    setRunning(true);
    void runBlock(blockId, runtime);
  }, [blockId, dialogCode, persistCode, qobjScene, runBlock]);

  const handleStop = useCallback(() => {
    stopBlock(blockId);
    restoreScene();
    const snap = sceneSnapshotRef.current;
    if (snap) {
      try {
        setQobjScene(normalizeScene(JSON.parse(snap)));
        setSceneDirty(true);
      } catch { /* uszkodzony snapshot — ignoruj */ }
    }
    setRunning(false);
  }, [blockId, restoreScene, stopBlock]);

  const handleClear = useCallback(() => clearBlockOutput(blockId), [blockId, clearBlockOutput]);

  const handleLibraryChange = useCallback((newCode: string) => {
    setDialogCode(newCode);
    persistCode(newCode);
    void preloadLibrariesForCode(newCode);
  }, [persistCode]);

  const handleUpdateScript = useCallback((newCode: string) => {
    setDialogCode(newCode);
    persistCode(newCode);
  }, [persistCode]);

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
      persistCode(newCode);
    } else {
      const newCode = generated + separator + (dialogCode || '');
      setDialogCode(newCode);
      persistCode(newCode);
    }
  }, [dialogCode, persistCode]);

  /** Wstawka idzie przez `executeEdits`, żeby wylądowała w historii undo Monaco. */
  const handleIncludeInsert = useCallback((content: string) => {
    const editor = monacoEditorRef.current;
    if (!editor) {
      setDialogCode(prev => prev + content);
      return;
    }
    const sel = editor.getSelection();
    const model = editor.getModel();
    if (!sel || !model) return;
    editor.executeEdits('automate-include', [{ range: sel, text: content, forceMoveMarkers: true }]);
    editor.focus();
    setDialogCode(model.getValue());
  }, []);

  const handleIncludeImport = useCallback((url: string, sourcePath: string, exports: string[]) => {
    const basename = sourcePath.split('/').pop() ?? 'mod';
    const stem = basename.replace(/\.(module\.)?(m?js|ts)$/i, '').replace(/\.module$/, '');
    const varName = stem
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '')
      + 'Module';
    const destructure = exports.length > 0
      ? `const { ${exports.join(', ')} } = ${varName};\n`
      : `// dostęp: ${varName}.<nazwa eksportu> — destrukturyzuj wg potrzeb\n`;
    handleIncludeInsert(
      `\n// ─── import: ${sourcePath} ───\n` +
      `const ${varName} = await import('${url}');\n` +
      destructure +
      `// ----- import ${sourcePath}\n`,
    );
  }, [handleIncludeInsert]);

  /** Monaco gubi wklejanie na Androidzie — czytamy schowek jawnie. */
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

  // Wynik pusty, ale są logi → przełącz na Logi, żeby użytkownik nie pomyślał,
  // że skrypt nic nie zrobił.
  useEffect(() => {
    if (!open) return;
    if (status !== 'completed' && status !== 'error') return;
    const hasVisible = output.length > 0 || result !== undefined;
    if (logs.length > 0 && !hasVisible) setDialogTab('logs');
  }, [open, status, logs.length, output.length, result]);

  /** Zapis przed zmianą miejsca w drzewie — remount wyczyściłby bufor edycji. */
  const handleToggleFullscreen = useCallback(() => {
    if (dialogCode !== code) persistCode(dialogCode);
    onToggleFullscreen?.();
  }, [code, dialogCode, persistCode, onToggleFullscreen]);

  if (!open) return null;

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ py: 1, px: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
          <SmartToyIcon sx={{ color: '#4caf50' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>Edytor Automate</Typography>
            {(subtitle || settings.scriptFile) && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace' }}>
                {settings.scriptFile ? `drive/${settings.scriptFile}${fileBusy ? ' — wczytywanie…' : ''}` : subtitle}
              </Typography>
            )}
          </Box>
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
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
          <Tooltip title="Uruchom (Ctrl+Enter) — zapisuje snapshot sceny">
            <span>
              <IconButton
                onClick={handleRun}
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
              <IconButton onClick={handleStop} disabled={!running} size="small" sx={{ color: '#e57373' }}>
                <StopIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={(isDirty || sceneDirty) ? 'Zapisz zmiany — kod i scenę QObject (dialog pozostanie otwarty)' : 'Brak niezapisanych zmian'}>
            <span>
              <Button onClick={handleSave} variant="contained" size="small" disabled={!isDirty && !sceneDirty}>
                Zapisz
              </Button>
            </span>
          </Tooltip>
          {onToggleFullscreen && (
            <Tooltip title={fullscreen ? 'Zmniejsz edytor' : 'Pełny ekran'}>
              <IconButton size="small" onClick={handleToggleFullscreen}>
                {fullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {!hideClose && <Button onClick={onClose} size="small">Wyjdź</Button>}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
            {/* minWidth:0 pozwala Monaco skurczyć się, gdy obok stoi inspektor QObject. */}
            <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              {dialogEditMode === 'blockly' ? (
                <Suspense fallback={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress /></Box>}>
                  <AutomateBlocklyEditor
                    // Remount przy zmianie wyboru UML — definicje bloków i toolbox się odświeżają.
                    key={`uml:${umlProjectsKey}:${umlClasses.length}:aura:${auraBlocks ? 1 : 0}`}
                    initialState={splitBlockly(dialogCode).state}
                    onChange={(js, state) => {
                      // Blockly nigdy nie nadpisuje ręcznego kodu — trzyma swój
                      // stan i wygenerowany JS w markerze, łączonym przy starcie.
                      const body = splitBlockly(dialogCode).body;
                      setDialogCode(joinBlockly(body, state, js));
                    }}
                    umlClasses={umlClasses}
                    auraBlocks={auraBlocks}
                  />
                </Suspense>
              ) : (
                <Editor
                  key={dialogEditMode}
                  height="100%"
                  // TypeScript (nie JS) — inaczej ambient .d.ts z api.* są niewidoczne.
                  defaultLanguage="typescript"
                  value={dialogEditMode === 'blocklyCode' ? buildRuntimeCode(dialogCode) : splitBlockly(dialogCode).body}
                  onChange={value => {
                    if (dialogEditMode === 'blocklyCode') return;   // podgląd tylko do odczytu
                    const prev = splitBlockly(dialogCode);
                    const v = joinBlockly(value || '', prev.state, prev.blocklyCode);
                    setDialogCode(v);
                    if (monacoRef.current) registerLibraryTypes(monacoRef.current, v);
                  }}
                  beforeMount={setupAutomateMonacoWithDisplay}
                  onMount={(editor, monaco) => {
                    monacoEditorRef.current = editor;
                    monacoRef.current = monaco;
                    setMonacoEditorInstance(editor);
                    editor.onDidDispose(() => setMonacoEditorInstance(null));
                    registerLibraryTypes(monaco, dialogCode);
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { handleRun(); });
                  }}
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                    automaticLayout: true,
                    readOnly: dialogEditMode === 'blocklyCode',
                  }}
                  theme="vs-dark"
                />
              )}
            </Box>

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

          {/* Uchwyty zaznaczenia pod dotyk (Android) — te same co w edytorze Drive. */}
          <MonacoSelectionHandles editor={monacoEditorInstance} />

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
                '&::before': { content: '""', position: 'absolute', inset: '-4px 0' },
              }}
            />
          )}

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
            <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
              <Tabs
                value={dialogTab}
                onChange={(_, v) => setDialogTab(v)}
                variant="standard"
                sx={{ minHeight: 36, flex: 1, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
              >
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
                    <Badge color="secondary" badgeContent={logs.length} sx={{ '& .MuiBadge-badge': { right: -14, top: 4 } }}>
                      Logi
                    </Badge>
                  }
                />
                <Tab
                  value="included"
                  label={
                    <Badge color="success" badgeContent={embeddedFiles.length || undefined} sx={{ '& .MuiBadge-badge': { right: -14, top: 4 } }}>
                      Included
                    </Badge>
                  }
                />
              </Tabs>
              <Tooltip title="Wyczyść output i logi">
                <span>
                  <IconButton size="small" onClick={handleClear} disabled={!hasOutput && logs.length === 0} sx={{ mx: 0.5 }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={outputPanelVisible ? 'Ukryj panel wyników' : 'Pokaż panel wyników'}>
                <IconButton size="small" onClick={() => setOutputPanelVisible(v => !v)} sx={{ mr: 1 }}>
                  {outputPanelVisible ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>

            {/* Błąd zawsze nad zawartością zakładki — awaria nie może się schować. */}
            {outputPanelVisible && error && (
              <Alert severity="error" sx={{ borderRadius: 0, py: 0.25 }}>{error}</Alert>
            )}

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
                        <Box component="span" sx={{ color: 'text.disabled', mr: 1 }}>[{log.level}]</Box>
                        {log.message}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {outputPanelVisible && dialogTab === 'included' && (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {embeddedFiles.length === 0 ? (
                  <Typography variant="caption" color="text.disabled" sx={{ p: 1.5, display: 'block', fontStyle: 'italic' }}>
                    Brak dołączonych plików. Użyj przycisku 📎, aby wstawić plik z drive/mdscript/.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {embeddedFiles.map((file, idx) => (
                      <ListItem
                        key={idx}
                        secondaryAction={
                          <Tooltip title="Usuń dołączony blok z kodu">
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
                            : <AttachFileIcon sx={{ fontSize: 16, color: '#81c784' }} />}
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
        </Box>
      </Box>

      <Suspense fallback={null}>
        {helpBrowserOpen && (
          <AutomateHelpBrowserDialog open={helpBrowserOpen} onClose={() => setHelpBrowserOpen(false)} userName={userName} />
        )}
        {includeOpen && (
          <AutomateIncludeFileDialog
            open={includeOpen}
            onClose={() => setIncludeOpen(false)}
            userName={userName}
            onInsert={(content) => handleIncludeInsert(content)}
            onInsertImport={(url, sourcePath, exports) => handleIncludeImport(url, sourcePath, exports)}
          />
        )}
        {libraryPickerOpen && (
          <AutomateLibraryPickerDialog
            open={libraryPickerOpen}
            onClose={() => setLibraryPickerOpen(false)}
            code={dialogCode || code}
            onChange={handleLibraryChange}
          />
        )}
        {settingsOpen && (
          <AutomateScriptSettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            autorun={settings.autorun}
            viewMode={settings.viewMode}
            tags={settings.tags}
            windowHeight={settings.windowHeight}
            onAutorunChange={(v) => onSettingsChange({ autorun: v })}
            onViewModeChange={(v) => onSettingsChange({ viewMode: v })}
            onTagsChange={(next) => onSettingsChange({ tags: next })}
            onWindowHeightChange={(next) => onSettingsChange({ windowHeight: next })}
            onOpenLibraryPicker={() => setLibraryPickerOpen(true)}
            onOpenUpdateScript={() => { setSettingsOpen(false); setUpdateScriptOpen(true); }}
            availableUmlProjects={availableUmlProjects}
            umlProjects={settings.umlProjects}
            onUmlProjectsChange={(next) => onSettingsChange({ umlProjects: next })}
            scenePath={settings.scenePath}
            onScenePathChange={(next) => onSettingsChange({ scenePath: next })}
            scriptFile={settings.scriptFile}
            onScriptFileChange={(next) => onSettingsChange({ scriptFile: next })}
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
    </>
  );
};

/**
 * Wariant okienkowy — ta sama zawartość w pełnoekranowym `Dialog`. Używa go blok
 * w notatce; Edytor Konwersacji osadza `AutomateScriptEditor` wprost w panelu.
 */
const AutomateScriptEditorDialog: React.FC<AutomateScriptEditorDialogProps> = (props) => (
  <Dialog
    open={props.open}
    onClose={props.onClose}
    fullScreen
    // Blockly renderuje edytory pól w WidgetDiv/DropDownDiv doklejanym do
    // document.body — focus trap MUI blokowałby w nich pisanie.
    disableEnforceFocus
    disableAutoFocus
    disableRestoreFocus
  >
    <AutomateScriptEditor {...props} />
  </Dialog>
);

export default AutomateScriptEditorDialog;
