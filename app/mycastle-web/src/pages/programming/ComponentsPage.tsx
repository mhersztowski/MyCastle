import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Container, Typography, TextField, Button, IconButton, Paper, Stack, Tooltip, Divider,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import WidgetsIcon from '@mui/icons-material/Widgets';
import { GlobalWindow } from '../../components/GlobalWindow';
import { readUserJson, writeUserJson, readUserFileText } from '../../services/userJson';
import { runBrowserComponent, type RunHandle } from '../../modules/component-runner/runBrowserComponent';
import { BUILTIN_COMPONENTS, BuiltinComponentView } from '../../modules/voiceactions';

interface ComponentEntry {
  id: string;
  name: string;    // user-given display name
  path: string;    // VFS path relative to the user home, e.g. `drive/mdscript/lit/05-qt-canvas.js`
  width: number;   // floating-window size
  height: number;
}

const STORE = 'programming/components.json';
const DEF_W = 520;
const DEF_H = 460;

/** Backfill older/partial entries so name + size always exist. */
function normalizeEntry(e: Partial<ComponentEntry> & { label?: string }): ComponentEntry {
  const path = String(e.path ?? '').replace(/^\/+/, '');
  return {
    id: e.id ?? crypto.randomUUID(),
    name: (e.name ?? e.label ?? path.split('/').pop() ?? path).trim() || 'Komponent',
    path,
    width: Number(e.width) > 0 ? Number(e.width) : DEF_W,
    height: Number(e.height) > 0 ? Number(e.height) : DEF_H,
  };
}

/** One floating window that loads + runs a Lit/Qt component into its body. */
function ComponentWindow({
  userName, name, path, width, height, onClose,
}: { userName: string; name: string; path: string; width: number; height: number; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ładowanie…');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const code = await readUserFileText(userName, path);
        if (code == null) throw new Error(`Nie znaleziono pliku: ${path}`);
        await new Promise((r) => requestAnimationFrame(r)); // host <div> mounted
        if (!alive || !hostRef.current) return;
        setStatus('Uruchamianie…');
        handleRef.current = await runBrowserComponent(code, {
          host: hostRef.current,
          userName,
          fileName: path,
          log: (lvl, txt) => { if (lvl === 'error') setError(txt); },
        });
        if (alive) setStatus('');
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : String(e)); setStatus(''); }
      }
    })();
    return () => { alive = false; handleRef.current?.stop(); };
  }, [userName, path]);

  return (
    <GlobalWindow title={name} open onClose={onClose} defaultWidth={width} defaultHeight={height}>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
        <Box ref={hostRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1, display: 'flex', flexDirection: 'column' }} />
        {status && <Box sx={{ px: 1, py: 0.5, fontSize: 12, color: 'text.secondary' }}>{status}</Box>}
        {error && (
          <Box sx={{ px: 1, py: 0.75, fontSize: 12, color: 'error.main', borderTop: 1, borderColor: 'divider', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error}
          </Box>
        )}
      </Box>
    </GlobalWindow>
  );
}

export default function ComponentsPage() {
  const params = useParams<{ userName: string }>();
  const userName = params.userName
    || (() => { try { return (JSON.parse(localStorage.getItem('minis_current_user') || '{}') as { name?: string }).name || ''; } catch { return ''; } })();

  const [entries, setEntries] = useState<ComponentEntry[]>([]);
  const [draft, setDraft] = useState({ name: '', path: '', width: String(DEF_W), height: String(DEF_H) });
  const [windows, setWindows] = useState<{ id: string; entry: ComponentEntry }[]>([]);
  const loaded = useRef(false);

  // Load list from the backend VFS.
  useEffect(() => {
    if (!userName) return;
    readUserJson<{ components?: (Partial<ComponentEntry> & { label?: string })[] }>(userName, STORE)
      .then((d) => { if (Array.isArray(d?.components)) setEntries(d!.components!.map(normalizeEntry)); })
      .catch(() => { /* fresh */ })
      .finally(() => { loaded.current = true; });
  }, [userName]);

  // Persist list to the backend VFS on every change.
  const persist = useCallback((next: ComponentEntry[]) => {
    setEntries(next);
    if (userName && loaded.current) writeUserJson(userName, STORE, { components: next }).catch(() => { /* offline */ });
  }, [userName]);

  const add = () => {
    const path = draft.path.trim().replace(/^\/+/, '');
    if (!path) return;
    const w = Math.max(200, parseInt(draft.width, 10) || DEF_W);
    const h = Math.max(160, parseInt(draft.height, 10) || DEF_H);
    const name = draft.name.trim() || (path.split('/').pop() ?? path);
    persist([...entries, { id: crypto.randomUUID(), name, path, width: w, height: h }]);
    setDraft({ name: '', path: '', width: String(DEF_W), height: String(DEF_H) });
  };
  const update = (id: string, patch: Partial<ComponentEntry>) =>
    persist(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => persist(entries.filter((e) => e.id !== id));
  const run = (entry: ComponentEntry) => setWindows((w) => [...w, { id: crypto.randomUUID(), entry }]);
  const closeWindow = (id: string) => setWindows((w) => w.filter((x) => x.id !== id));

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <WidgetsIcon color="primary" />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Komponenty Lit</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Lista (zapisywana na backendzie) plików z komponentami Lit/Qt. Podaj nazwę, ścieżkę VFS
        (względem katalogu domowego, np. <code>drive/mdscript/lit/05-qt-canvas.js</code>) oraz rozmiar okna.
        „Run" uruchamia komponent — tak jak „Uruchom w przeglądarce" w Drive — i osadza go jako
        pływające, przesuwalne okno.
      </Typography>

      {/* Add form */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField
            size="small" label="Nazwa" sx={{ width: { sm: 180 } }}
            value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <TextField
            size="small" label="Ścieżka" fullWidth placeholder="drive/mdscript/lit/05-qt-canvas.js"
            value={draft.path} onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          />
          <TextField
            size="small" label="Szer." type="number" sx={{ width: 90 }} inputProps={{ min: 200 }}
            value={draft.width} onChange={(e) => setDraft((d) => ({ ...d, width: e.target.value }))}
          />
          <TextField
            size="small" label="Wys." type="number" sx={{ width: 90 }} inputProps={{ min: 160 }}
            value={draft.height} onChange={(e) => setDraft((d) => ({ ...d, height: e.target.value }))}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={add} disabled={!draft.path.trim()}>Dodaj</Button>
        </Stack>
      </Paper>

      {/* List */}
      <Paper variant="outlined">
        {entries.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>Brak komponentów. Dodaj powyżej.</Box>
        ) : entries.map((e, i) => (
          <Box key={e.id}>
            {i > 0 && <Divider />}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ px: 2, py: 1 }}>
              <TextField
                size="small" variant="standard" sx={{ width: { sm: 180 } }}
                value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })}
              />
              <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }} title={e.path}>{e.path}</Typography>
              <TextField
                size="small" label="Szer." type="number" sx={{ width: 84 }} inputProps={{ min: 200 }}
                value={e.width} onChange={(ev) => update(e.id, { width: Math.max(200, parseInt(ev.target.value, 10) || DEF_W) })}
              />
              <TextField
                size="small" label="Wys." type="number" sx={{ width: 84 }} inputProps={{ min: 160 }}
                value={e.height} onChange={(ev) => update(e.id, { height: Math.max(160, parseInt(ev.target.value, 10) || DEF_H) })}
              />
              <Tooltip title="Run — osadź jako pływające okno">
                <span><Button size="small" variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => run(e)} disabled={!e.path}>Run</Button></span>
              </Tooltip>
              <Tooltip title="Usuń z listy">
                <IconButton size="small" onClick={() => remove(e.id)} sx={{ color: 'error.main' }}><DeleteOutlineIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ))}
      </Paper>

      {/* Wbudowane komponenty (React) */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1 }}>Wbudowane komponenty</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Gotowe komponenty React (funkcjonalne). Dostępne też w Edytorze Konwersacji (bloczek „Wyświetl komponent").
      </Typography>
      <Paper variant="outlined">
        {BUILTIN_COMPONENTS.map((b, i) => (
          <Box key={b.id}>
            {i > 0 && <Divider />}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{b.name}</Typography>
              <BuiltinComponentView id={b.id} />
            </Stack>
          </Box>
        ))}
      </Paper>

      {/* Floating component windows */}
      {windows.map((w) => (
        <ComponentWindow
          key={w.id}
          userName={userName}
          name={w.entry.name}
          path={w.entry.path}
          width={w.entry.width}
          height={w.entry.height}
          onClose={() => closeWindow(w.id)}
        />
      ))}
    </Container>
  );
}
