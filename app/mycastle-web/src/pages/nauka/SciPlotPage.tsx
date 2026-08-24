/**
 * SciPlotPage — kalkulator wykresów na całej stronie.
 *
 * Ten sam komponent, który siedzi w bloku `sci-plot` w notatkach; różnica jest
 * jedna i dotyczy tego, gdzie trafia dokument. W notatce wraca do treści bloku,
 * tutaj — do pliku w Drive. Sam kalkulator o tym nie wie i nie musi.
 *
 * Zapis jest **na żądanie**, nie po każdej zmianie. Wykres bywa polem do prób:
 * połowa wpisanych wierszy nigdy nie ma zostać, a automatyczny zapis zamieniłby
 * każdą próbę w plik do posprzątania.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Snackbar, Stack, TextField, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useParams } from 'react-router-dom';
import { SciPlot } from '@mhersztowski/sci-blocks';
import {
  createPlotDocument, parsePlotDocument, serializePlotDocument, type PlotDocument,
} from '@mhersztowski/sci-core';
import { useFilesystem } from '@modules/filesystem';

/** Domyślne miejsce zapisu — obok notatek, nie w katalogu technicznym. */
const DOMYSLNA_SCIEZKA = 'wykresy/wykres.sciplot.json';

export default function SciPlotPage() {
  const { userName } = useParams<{ userName: string }>();
  const { readFile, writeFile } = useFilesystem();

  const [sciezka, setSciezka] = useState(DOMYSLNA_SCIEZKA);
  const [dokument, setDokument] = useState<PlotDocument>(() => createPlotDocument());
  const [komunikat, setKomunikat] = useState<string>();
  const [blad, setBlad] = useState<string>();
  /** Najnowszy dokument — czytany przy zapisie, bez renderu po każdej zmianie. */
  const biezacyRef = useRef(dokument);

  /*
   * Klucz komponentu zmienia się przy wczytaniu z pliku.
   *
   * `SciPlot` czyta dokument początkowy raz i dalej trzyma własny stan — inaczej
   * wpisywany wzór cofałby się przy każdym renderze rodzica. Otwarcie innego
   * pliku musi więc zbudować kalkulator od nowa, a nie podmienić mu prop.
   */
  const [klucz, setKlucz] = useState(0);

  const zmien = useCallback((next: PlotDocument) => { biezacyRef.current = next; }, []);

  const wczytaj = useCallback(async () => {
    try {
      const plik = await readFile(sciezka);
      if (!plik) {
        setBlad(`Nie ma pliku ${sciezka}. Zapisz najpierw wykres pod tą nazwą.`);
        return;
      }
      // `FileData` trzyma bajty, nie łańcuch — `toString()` dekoduje je jako UTF-8.
      const wczytany = parsePlotDocument(plik.toString());
      setDokument(wczytany);
      biezacyRef.current = wczytany;
      setKlucz((k) => k + 1);
      setKomunikat(`Wczytano ${sciezka}`);
    } catch (err) {
      setBlad(`Nie udało się wczytać: ${(err as Error).message}`);
    }
  }, [readFile, sciezka]);

  const zapisz = useCallback(async () => {
    try {
      await writeFile(sciezka, serializePlotDocument(biezacyRef.current));
      setKomunikat(`Zapisano ${sciezka}`);
    } catch (err) {
      setBlad(`Nie udało się zapisać: ${(err as Error).message}`);
    }
  }, [writeFile, sciezka]);

  // Skrót Ctrl/Cmd+S — przy pracy z wykresem ręka i tak jest na klawiaturze.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void zapisz();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zapisz]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1, p: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
        <Typography variant="h6" sx={{ mr: 1 }}>SciPlot</Typography>
        <TextField
          size="small"
          label="Plik w Drive"
          value={sciezka}
          onChange={(e) => setSciezka(e.target.value)}
          sx={{ minWidth: 320 }}
        />
        <Button startIcon={<FolderOpenIcon />} onClick={() => void wczytaj()}>Wczytaj</Button>
        <Button startIcon={<SaveIcon />} variant="contained" onClick={() => void zapisz()}>Zapisz</Button>
        <Typography variant="caption" color="text.secondary">
          użytkownik: {userName}
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SciPlot key={klucz} initialDocument={dokument} onDocumentChange={zmien} height="100%" />
      </Box>

      <Snackbar
        open={Boolean(komunikat)}
        autoHideDuration={2500}
        onClose={() => setKomunikat(undefined)}
        message={komunikat}
      />
      <Snackbar open={Boolean(blad)} autoHideDuration={5000} onClose={() => setBlad(undefined)}>
        <Alert severity="error" onClose={() => setBlad(undefined)}>{blad}</Alert>
      </Snackbar>
    </Box>
  );
}
