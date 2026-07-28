/**
 * EmbedInNotesDialog — „Embed in Notes" dla wszystkich rodzajów projektów.
 *
 * Okno daje dwa adresy do tego samego pliku:
 *   • snippet `@[cad:…]` — osadzenie READ-ONLY w notatce (viewer),
 *   • „Edytor URL" — adres `/open/…`, który otwiera EDYTOR z tym projektem.
 *
 * Przy otwarciu okno samo ustawia się na bieżącą zakładkę edytora i zaznacza
 * plik, który jest właśnie otwarty (o ile widok zgłosił go przez `FileOps`) —
 * najczęstszy przypadek to „udostępnij to, na co patrzę".
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton,
  InputAdornment, List, ListItemButton, ListItemText, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import {
  CAD_EXT, CAD3D_EXT, ELEC_EXT, PCB_EXT, MAP_EXT, NOTES_EXT,
  getCurrentUserId, userRootDir, listFilesRecursive, listScene3dProjects, listScene3dFiles,
} from '../vfs/cadProjectApi';
import { buildOpenUrl, modeForFile } from '../vfs/openTarget';
import { useFileOps } from '../fileops/FileOpsContext';

/** Rodzaje projektów, które da się osadzić — jedno miejsce prawdy dla zakładek i rozszerzeń. */
export const EMBED_KINDS = [
  { mode: 'cad', label: 'CAD 2D', ext: CAD_EXT },
  { mode: 'cad3d', label: 'CAD 3D', ext: CAD3D_EXT },
  { mode: 'scene3d', label: 'Scene 3D', ext: '.scene.json' },
  { mode: 'electronics', label: 'Electronics', ext: ELEC_EXT },
  { mode: 'pcb', label: 'PCB', ext: PCB_EXT },
  { mode: 'map', label: 'Map', ext: MAP_EXT },
  { mode: 'notes', label: 'Notes', ext: NOTES_EXT },
  { mode: 'lego', label: 'Lego', ext: '.lego.json' },
] as const;

export type EmbedMode = typeof EMBED_KINDS[number]['mode'];

/** Czy dla danego trybu edytora mamy zakładkę w tym oknie. */
export function isEmbeddableMode(mode: string): mode is EmbedMode {
  return EMBED_KINDS.some(k => k.mode === mode);
}

interface Entry { name: string; path: string }

export function EmbedInNotesDialog({ open, onClose, editorMode }: {
  open: boolean;
  onClose: () => void;
  /** Tryb, w którym jest edytor — okno startuje na tej zakładce. */
  editorMode: string;
}) {
  const fileOps = useFileOps();
  const [mode, setMode] = useState<EmbedMode>(isEmbeddableMode(editorMode) ? editorMode : 'cad');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'snippet' | 'url' | null>(null);

  const ext = EMBED_KINDS.find(k => k.mode === mode)!.ext;

  // Otwarcie okna = powrót do zakładki bieżącego trybu; ręczna zmiana zakładki
  // w trakcie ma zostać uszanowana, dlatego zależność to samo `open`.
  useEffect(() => {
    if (!open) return;
    setCopied(null);
    if (isEmbeddableMode(editorMode)) setMode(editorMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    setSelected('');
    const userId = getCurrentUserId();

    void (async () => {
      const found: Entry[] = [];
      try {
        if (mode === 'scene3d') {
          // Scene 3D ma własne REST-owe API projektów (katalog = projekt).
          const projects = await listScene3dProjects();
          await Promise.all(projects.map(async p => {
            try {
              for (const f of await listScene3dFiles(p.name)) {
                found.push({ name: `${p.name} / ${f.name}`, path: `users/${userId}/scene3d/${p.name}/${f.name}` });
              }
            } catch { /* projekt bez plików — pomijamy */ }
          }));
        } else {
          // Skan od katalogu użytkownika, żeby pliki z podkatalogów też były widoczne.
          const files = await listFilesRecursive(userRootDir(userId), ext);
          for (const f of files) found.push({ name: f.name, path: `users/${userId}/${f.name}` });
        }
      } catch { /* brak backendu → pusta lista i komunikat niżej */ }
      if (cancelled) return;
      setEntries(found);

      // Domyślny wybór: plik otwarty w edytorze. Najpierw po pełnej ścieżce
      // (jednoznaczna), potem po nazwie — nie każdy widok zgłasza ścieżkę.
      const ops = fileOps.get(mode);
      const currentPath = ops?.currentPath?.replace(/^\/+/, '') ?? '';
      const currentName = ops?.currentName ?? '';
      const byPath = currentPath
        ? found.find(e => currentPath === e.path || currentPath === `${e.path}${ext}`)
        : undefined;
      const baseName = currentName.replace(ext, '');
      const byName = !byPath && baseName
        ? found.find(e => e.path.endsWith(`/${baseName}`) || e.name === baseName || e.name.endsWith(`/ ${currentName}`))
        : undefined;
      setSelected((byPath ?? byName)?.path ?? '');
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const snippet = selected
    ? `@[cad:${mode}:${window.location.origin}/viewer/${mode}/${selected}]`
    : '';

  /**
   * Adres edytora. Ścieżki z listy są bez rozszerzenia (viewer dokleja je sam),
   * a `/open/…` rozpoznaje tryb właśnie po rozszerzeniu — więc dokładamy je tutaj.
   */
  const editorUrl = useMemo(() => {
    if (!selected) return '';
    const withExt = modeForFile(selected) ? selected : `${selected}${ext}`;
    // Scene 3D bywa zapisany jako zwykły `.json` — wtedy adres edytora nie zadziała.
    if (!modeForFile(withExt)) return '';
    return `${window.location.origin}${buildOpenUrl(withExt)}`;
  }, [selected, ext]);

  const copy = (text: string, which: 'snippet' | 'url') => {
    void navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAdornment = (text: string, which: 'snippet' | 'url') => (
    <InputAdornment position="end">
      <Tooltip title={copied === which ? 'Skopiowano!' : 'Kopiuj'}>
        <IconButton size="small" onClick={() => copy(text, which)}>
          {copied === which
            ? <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
            : <ContentCopyIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>
    </InputAdornment>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Typography fontWeight={600}>Embed in Notes</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
        <Tabs
          value={mode}
          onChange={(_, v: EmbedMode) => { setMode(v); setCopied(null); }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 0.5, minHeight: 32, '& .MuiTab-root': { minHeight: 32, fontSize: 11, px: 1 } }}
        >
          {EMBED_KINDS.map(k => <Tab key={k.mode} value={k.mode} label={k.label} />)}
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            {entries.length === 0 ? (
              <ListItemButton disabled>
                <ListItemText primary="Brak projektów" secondary={`Zapisz plik ${ext} na serwerze`} />
              </ListItemButton>
            ) : entries.map(e => (
              <ListItemButton
                key={e.path}
                selected={selected === e.path}
                onClick={() => { setSelected(e.path); setCopied(null); }}
              >
                <ListItemText
                  primary={e.name}
                  secondary={e.path}
                  secondaryTypographyProps={{ sx: { fontSize: 9, opacity: 0.55 } }}
                />
              </ListItemButton>
            ))}
          </List>
        )}

        <TextField
          label="Embed snippet"
          value={snippet}
          size="small"
          fullWidth
          placeholder="Wybierz projekt powyżej"
          InputProps={{ readOnly: true, endAdornment: snippet ? copyAdornment(snippet, 'snippet') : undefined }}
        />

        <TextField
          label="Edytor URL"
          value={editorUrl}
          size="small"
          fullWidth
          placeholder={selected ? 'Ten typ pliku nie ma adresu edytora' : 'Wybierz projekt powyżej'}
          helperText="Otwiera edytor z tym projektem (adres /open/…)"
          InputProps={{ readOnly: true, endAdornment: editorUrl ? copyAdornment(editorUrl, 'url') : undefined }}
        />
      </DialogContent>
    </Dialog>
  );
}
