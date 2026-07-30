/**
 * SceneRunDialog — pełnoekranowy podgląd „Run": scena uruchomiona razem z
 * powiązanym z nią skryptem TypeScript (`SceneGraph.script`).
 *
 * Scena jest deserializowana z JSON-a NA NOWO przy każdym starcie, więc skrypt
 * nigdy nie zmienia dokumentu otwartego w edytorze — „Restart" wraca do stanu
 * wyjściowego bez ryzyka utraty pracy.
 *
 * Re-render Reacta jest wywoływany tylko przy zmianach STRUKTURY grafu (dodanie
 * lub usunięcie węzła). Transformacje i materiały `SceneNode` przepisuje wprost
 * na obiekt Three, więc animacja 60 fps nie potrzebuje ani jednego renderu
 * Reacta — pełny bump co klatkę przebudowywałby całą scenę w SimpleViewerze.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Dialog, IconButton, Tooltip, Typography, Button, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ReplayIcon from '@mui/icons-material/Replay';
import StopIcon from '@mui/icons-material/Stop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';
import { SimpleViewer, SceneDeserializer, type SceneGraph } from '@mhersztowski/core-scene3d';
import { runSceneScript } from '../scene-script/runSceneScript';
import type { SceneScriptLogEntry, SceneScriptSession } from '../scene-script/sceneScript';

interface Props {
  open: boolean;
  /** JSON sceny (dokładnie to, co zapisuje edytor). */
  sceneJson: string | undefined;
  /** Ścieżka VFS skryptu — tylko do pokazania w nagłówku. */
  scriptPath: string | null;
  /** Źródło skryptu wczytane przez hosta z VFS. */
  scriptCode: string | null;
  onClose: () => void;
}

const LEVEL_COLOR: Record<SceneScriptLogEntry['level'], string> = {
  log: '#d0d0d0', info: '#4fc3f7', warn: '#ffb74d', error: '#ef5350',
};

export function SceneRunDialog({ open, sceneJson, scriptPath, scriptCode, onClose }: Props) {
  const [graph, setGraph] = useState<SceneGraph | null>(null);
  const [version, setVersion] = useState(0);
  const [logs, setLogs] = useState<SceneScriptLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [runToken, setRunToken] = useState(0);
  const sessionRef = useRef<SceneScriptSession | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((entry: SceneScriptLogEntry) => {
    // Skrypt w pętli może logować bez opamiętania — trzymamy ostatnie 300 wpisów.
    setLogs((prev) => (prev.length > 300 ? [...prev.slice(-299), entry] : [...prev, entry]));
  }, []);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setRunning(false);
  }, []);

  // Start / restart: świeży graf z JSON-a + świeża sesja skryptu.
  useEffect(() => {
    if (!open) return;
    stopSession();
    setLogs([]);
    if (!sceneJson) {
      setGraph(null);
      appendLog({ level: 'warn', text: 'Scena jest pusta — nie ma czego uruchomić.' });
      return;
    }

    let cancelled = false;
    let fresh: SceneGraph;
    try {
      fresh = SceneDeserializer.deserialize(sceneJson);
    } catch (e) {
      setGraph(null);
      appendLog({ level: 'error', text: `Nie udało się odczytać sceny: ${(e as Error).message}` });
      return;
    }

    // Bump tylko na zmianach strukturalnych (patrz nagłówek pliku).
    let idsKey = '';
    const structuralKey = () => {
      const ids: string[] = [];
      fresh.traverse((n) => ids.push(n.id));
      return ids.join(',');
    };
    idsKey = structuralKey();
    fresh.onChange = () => {
      const key = structuralKey();
      if (key !== idsKey) { idsKey = key; setVersion((v) => v + 1); }
    };

    setGraph(fresh);
    setVersion((v) => v + 1);

    if (!scriptCode) {
      appendLog({ level: 'info', text: scriptPath
        ? `Skrypt „${scriptPath}" jest pusty — scena działa bez logiki.`
        : 'Scena nie ma powiązanego skryptu (ustaw go w Settings → Scene script).' });
      return;
    }

    setRunning(true);
    // Pierwsza klatka SimpleViewera musi przypiąć `_threeObject`, inaczej
    // `scene.object(...)` w ciele skryptu zwróci null.
    const startAfterFirstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        runSceneScript({
          graph: fresh,
          code: scriptCode,
          fileName: scriptPath?.split('/').pop() ?? 'scene-script.ts',
          onLog: appendLog,
        }).then((session) => {
          if (cancelled) { session.stop(); return; }
          sessionRef.current = session;
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(startAfterFirstFrame);
      fresh.onChange = null;
      stopSession();
    };
  }, [open, sceneJson, scriptCode, scriptPath, runToken, appendLog, stopSession]);

  useEffect(() => { if (showConsole) logsEndRef.current?.scrollIntoView({ block: 'end' }); }, [logs, showConsole]);

  const handleClose = useCallback(() => { stopSession(); onClose(); }, [stopSession, onClose]);

  return (
    <Dialog open={open} onClose={handleClose} fullScreen PaperProps={{ sx: { bgcolor: '#0f0f0f' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* ── Pasek narzędzi ─────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid rgba(255,255,255,0.1)', bgcolor: '#1a1a1a', flexShrink: 0 }}>
          <Chip
            size="small"
            color={running ? 'success' : 'default'}
            icon={running ? <PlayArrowIcon sx={{ fontSize: 14 }} /> : <StopIcon sx={{ fontSize: 14 }} />}
            label={running ? 'Uruchomiona' : 'Zatrzymana'}
            sx={{ height: 22, fontSize: '0.68rem' }}
          />
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {scriptPath ?? 'bez skryptu'}
          </Typography>
          <Button
            size="small"
            startIcon={<ReplayIcon sx={{ fontSize: 14 }} />}
            onClick={() => setRunToken((t) => t + 1)}
            sx={{ fontSize: '0.7rem', textTransform: 'none' }}
          >
            Restart
          </Button>
          <Button
            size="small"
            startIcon={<StopIcon sx={{ fontSize: 14 }} />}
            onClick={stopSession}
            disabled={!running}
            sx={{ fontSize: '0.7rem', textTransform: 'none' }}
          >
            Stop
          </Button>
          <Tooltip title={showConsole ? 'Ukryj konsolę' : 'Pokaż konsolę'}>
            <IconButton size="small" onClick={() => setShowConsole((v) => !v)} sx={{ color: showConsole ? 'primary.main' : 'text.disabled' }}>
              <TerminalIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zamknij">
            <IconButton size="small" onClick={handleClose} sx={{ color: 'text.secondary' }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* ── Widok sceny ────────────────────────────────── */}
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {graph ? (
            <SimpleViewer
              sceneGraph={graph}
              version={version}
              showGrid={false}
              autoFit
              showAxesGizmo={false}
              width="100%"
              height="100%"
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>Brak sceny do uruchomienia.</Typography>
            </Box>
          )}
        </Box>

        {/* ── Konsola skryptu ────────────────────────────── */}
        {showConsole && (
          <Box sx={{ height: 160, flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.1)', bgcolor: '#101010', overflowY: 'auto', px: 1, py: 0.5 }}>
            {logs.length === 0 ? (
              <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: 'monospace' }}>
                (konsola skryptu)
              </Typography>
            ) : logs.map((entry, i) => (
              <Typography
                key={i}
                sx={{ fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: LEVEL_COLOR[entry.level] }}
              >
                {entry.text}
              </Typography>
            ))}
            <div ref={logsEndRef} />
          </Box>
        )}
      </Box>
    </Dialog>
  );
}
