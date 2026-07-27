/**
 * Strona „Rysik” — edytor dokumentów `.qmd` z blokami scen.
 *
 * Układ: struktura dokumentu i zmienne (lewo) · scena aktywnego bloku (środek) ·
 * inspektor generowany z manifestu (prawo). Wszystkie mutacje przechodzą przez
 * jeden store z transakcjami, niezależnie od tego, czy przyszły z panelu,
 * z gizmo w scenie, czy z suwaka zmiennej.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, List, ListItemButton, ListItemText, Snackbar, TextField, Tooltip, Typography,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import CodeIcon from '@mui/icons-material/Code';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import VideocamIcon from '@mui/icons-material/Videocam';
import ExtensionIcon from '@mui/icons-material/Extension';
import { RysikStore } from '../store';
import { allBlocks, parseDocument, serializeDocument } from '../serialize';
import { useStoreRevision } from './useStore';
import { DocumentPanel } from './DocumentPanel';
import { VarsPanel } from './VarsPanel';
import { PropertyPanel } from './PropertyPanel';
import { BlockHost } from './BlockHost';
import { STARTER_DOCUMENT } from '../starter';
import { listRysikDocs, readRysikDoc, writeRysikDoc } from '../vfs';
import { writeQuartoExtension } from '../quarto/install';
import type { SceneBlock } from '../blocks/SceneBlock';
import type { Primitive } from '../types';

export function RysikView() {
  const [store] = useState(() => new RysikStore(parseDocument(STARTER_DOCUMENT)));
  const revision = useStoreRevision(store);
  const doc = store.getDoc();

  const blocks = useMemo(() => allBlocks(doc), [doc, revision]);
  const [selectedUid, setSelectedUid] = useState<string | null>(() => blocks[0]?.uid ?? null);
  const [selection, setSelection] = useState<string | null>(null);
  const [docName, setDocName] = useState<string>('teren');
  const [status, setStatus] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, Primitive> | null>(null);

  const [openDialog, setOpenDialog] = useState(false);
  const [saveAsDialog, setSaveAsDialog] = useState(false);
  const [sourceDialog, setSourceDialog] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [docList, setDocList] = useState<string[]>([]);

  const sceneRef = useRef<SceneBlock | null>(null);
  const activeBlock = blocks.find(b => b.uid === selectedUid) ?? blocks[0] ?? null;

  // Blok mógł zniknąć (undo dodania) — zaznaczenie musi za tym nadążyć.
  useEffect(() => {
    if (selectedUid && !blocks.some(b => b.uid === selectedUid)) {
      setSelectedUid(blocks[0]?.uid ?? null);
      setSelection(null);
    }
  }, [blocks, selectedUid]);

  const save = useCallback(async (name: string) => {
    try {
      await writeRysikDoc(name, serializeDocument(store.getDoc()));
      setDocName(name);
      setStatus(`Zapisano ${name}.qmd`);
    } catch (e) {
      setStatus(`Błąd zapisu: ${(e as Error).message}`);
    }
  }, [store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo(); else store.undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(docName);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, save, docName]);

  const openDocList = async (): Promise<void> => {
    setOpenDialog(true);
    try {
      setDocList(await listRysikDocs());
    } catch {
      setDocList([]);
    }
  };

  const openDoc = async (name: string): Promise<void> => {
    try {
      const text = await readRysikDoc(name);
      store.replaceDoc(parseDocument(text));
      setDocName(name);
      setSelectedUid(allBlocks(store.getDoc())[0]?.uid ?? null);
      setSelection(null);
      setOpenDialog(false);
      setStatus(`Wczytano ${name}.qmd`);
    } catch (e) {
      setStatus(`Błąd odczytu: ${(e as Error).message}`);
    }
  };

  const showSource = (): void => {
    setSourceText(serializeDocument(store.getDoc()));
    setSourceDialog(true);
  };

  const applySource = (): void => {
    store.replaceDoc(parseDocument(sourceText));
    setSelectedUid(allBlocks(store.getDoc())[0]?.uid ?? null);
    setSelection(null);
    setSourceDialog(false);
  };

  /** Kamera to stan sesji — do pliku trafia dopiero po jawnym poleceniu. */
  const pinCamera = (): void => {
    if (!activeBlock) return;
    const state = sceneRef.current?.getCamera();
    if (!state) { setStatus('Ten blok nie ma kamery'); return; }
    store.set(
      ['blocks', activeBlock.uid, 'extras', 'camera'],
      { position: state.position, target: state.target, fov: state.fov },
      'Widok początkowy',
    );
    setStatus('Zapisano bieżący widok jako początkowy');
  };

  const takeSnapshot = async (): Promise<void> => {
    const blob = await sceneRef.current?.snapshot();
    if (!blob) { setStatus('Nie udało się wykonać zrzutu'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docName}-${activeBlock?.label ?? 'blok'}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Zrzut zapisany na dysku');
  };

  const installExtension = async (): Promise<void> => {
    try {
      const dir = await writeQuartoExtension();
      setStatus(`Rozszerzenie Quarto zapisane w ${dir}`);
    } catch (e) {
      setStatus(`Błąd zapisu rozszerzenia: ${(e as Error).message}`);
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Pasek narzędzi */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5,
        borderBottom: '1px solid rgba(255,255,255,0.08)', bgcolor: 'background.paper',
      }}>
        <Tooltip title="Nowy dokument">
          <IconButton size="small" onClick={() => { store.replaceDoc(parseDocument(STARTER_DOCUMENT)); setDocName('teren'); }}>
            <NoteAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Otwórz">
          <IconButton size="small" onClick={openDocList}><FolderOpenIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Zapisz (Ctrl+S)">
          <IconButton size="small" onClick={() => void save(docName)}><SaveIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Button size="small" sx={{ fontSize: 11 }} onClick={() => setSaveAsDialog(true)}>Zapisz jako…</Button>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title={store.undoLabel ? `Cofnij: ${store.undoLabel}` : 'Cofnij'}>
          <span>
            <IconButton size="small" disabled={!store.canUndo} onClick={() => store.undo()}><UndoIcon fontSize="small" /></IconButton>
          </span>
        </Tooltip>
        <Tooltip title={store.redoLabel ? `Ponów: ${store.redoLabel}` : 'Ponów'}>
          <span>
            <IconButton size="small" disabled={!store.canRedo} onClick={() => store.redo()}><RedoIcon fontSize="small" /></IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Podgląd źródła .qmd">
          <IconButton size="small" onClick={showSource}><CodeIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Ustaw bieżący widok jako początkowy">
          <IconButton size="small" onClick={pinCamera}><VideocamIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Zrzut sceny (PNG)">
          <IconButton size="small" onClick={() => void takeSnapshot()}><PhotoCameraIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Tooltip title="Zapisz rozszerzenie Quarto do VFS">
          <IconButton size="small" onClick={() => void installExtension()}><ExtensionIcon fontSize="small" /></IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 11, color: 'text.secondary', fontFamily: 'monospace' }}>
          {docName}.qmd
        </Typography>
      </Box>

      {/* Trzy kolumny */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box sx={{
          width: 260, display: 'flex', flexDirection: 'column', overflow: 'auto',
          borderRight: '1px solid rgba(255,255,255,0.08)', bgcolor: 'background.paper',
        }}>
          <DocumentPanel store={store} selectedUid={selectedUid} onSelectBlock={uid => { setSelectedUid(uid); setSelection(null); }} />
          <Divider />
          <VarsPanel store={store} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {activeBlock ? (
              <BlockHost
                key={activeBlock.uid}
                store={store}
                block={activeBlock}
                selection={selection}
                onSelect={setSelection}
                onPick={setPick}
                sceneRef={sceneRef}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                  Dodaj blok, żeby zobaczyć scenę.
                </Typography>
              </Box>
            )}
          </Box>
          <Box sx={{
            px: 1, py: 0.25, borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', gap: 2, bgcolor: 'background.paper',
          }}>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
              {selection ? `zaznaczono: ${selection}` : 'brak zaznaczenia'}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', fontFamily: 'monospace' }}>
              {pick ? Object.entries(pick).map(([k, v]) => `${k}=${v}`).join('  ') : ''}
            </Typography>
          </Box>
        </Box>

        <Box sx={{
          width: 320, overflow: 'auto',
          borderLeft: '1px solid rgba(255,255,255,0.08)', bgcolor: 'background.paper',
        }}>
          <PropertyPanel store={store} block={activeBlock} selection={selection} onSelect={setSelection} />
        </Box>
      </Box>

      {/* Dialogi */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 15 }}>Otwórz dokument</DialogTitle>
        <DialogContent dividers>
          <List dense>
            {docList.map(name => (
              <ListItemButton key={name} onClick={() => void openDoc(name)}>
                <ListItemText primary={`${name}.qmd`} primaryTypographyProps={{ fontSize: 13 }} />
              </ListItemButton>
            ))}
            {docList.length === 0 && (
              <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Brak dokumentów w katalogu rysik/.</Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenDialog(false)}>Zamknij</Button></DialogActions>
      </Dialog>

      <Dialog open={saveAsDialog} onClose={() => setSaveAsDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 15 }}>Zapisz jako</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" label="Nazwa" value={docName}
            onChange={e => setDocName(e.target.value)}
            helperText="Plik trafi do users/{user}/rysik/{nazwa}.qmd"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveAsDialog(false)}>Anuluj</Button>
          <Button variant="contained" onClick={() => { setSaveAsDialog(false); void save(docName); }}>Zapisz</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sourceDialog} onClose={() => setSourceDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontSize: 15 }}>Źródło .qmd</DialogTitle>
        <DialogContent dividers>
          <TextField
            fullWidth multiline minRows={20} value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            InputProps={{ sx: { fontSize: 12, fontFamily: 'monospace' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSourceDialog(false)}>Zamknij</Button>
          <Button variant="contained" onClick={applySource}>Zastosuj do dokumentu</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(status)}
        autoHideDuration={3000}
        onClose={() => setStatus(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setStatus(null)} sx={{ fontSize: 12 }}>{status}</Alert>
      </Snackbar>
    </Box>
  );
}
