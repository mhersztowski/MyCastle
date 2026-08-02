/**
 * KnowledgePage — baza wiedzy nad katalogiem `knowledge/` w Drive.
 *
 * Strona jest cienka z założenia: wczytuje pliki z VFS i oddaje je komponentom
 * z `sci-blocks`. Cała logika — indeks, wyszukiwanie, graf, tryb czytania —
 * mieszka w pakietach, więc ta sama baza da się później wyeksportować
 * statycznie bez przepisywania czegokolwiek.
 *
 * Dwa tryby, jeden adres: katalog pod `/knowledge`, dokument pod
 * `/knowledge/{ścieżka}`. Dzięki temu link do artykułu da się wysłać, a
 * przycisk „wstecz" w przeglądarce robi to, czego się po nim spodziewamy.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { KnowledgeCatalog, ReaderView } from '@mhersztowski/sci-blocks';
// Style KaTeX — wzory w trybie czytania składa `sci-blocks`, ale arkusz ładuje
// host. Ta strona nie montuje MdEditora (który robi to przy okazji), więc musi
// zadbać o to sama; bez tego ułamki rozsypują się na osobne wiersze.
import 'katex/dist/katex.min.css';
import {
  buildIndex, dueFor, emptyProgress, recordAttempt, summarize,
  type KnowledgeIndex, type Progress, type Quality,
} from '@mhersztowski/sci-core';
import { ROOT, ROOT_LABEL, collectMarkdown, relativeToRoot } from './knowledgeFiles';
import { mqttClient } from '../../modules/mqttclient';
import { createModelWorker } from '../../workers';
import { buildArchive, saveArchive } from './downloadBase';
import { loadProgress, saveProgress } from './progressStore';

interface LoadedFile {
  path: string;
  markdown: string;
}

export const KnowledgePage: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState<LoadedFile[] | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Ścieżka dokumentu jest resztą adresu po `/knowledge/`.
  const open = params['*'] || undefined;

  useEffect(() => {
    let anulowane = false;

    const wczytaj = async () => {
      try {
        // Wprost przez klienta MQTT, nie przez `filesystemService`: ten drugi
        // szuka pliku w drzewie po ścieżce **względnej**, a czyta go po
        // **pełnej**, więc działa tylko wtedy, gdy wczytano cały Drive.
        // Tutaj wczytujemy jeden katalog, a węzły drzewa niosą pełne ścieżki.
        const tree = await mqttClient.listDirectory(ROOT);
        const markdowny = collectMarkdown(tree);

        const wczytane: LoadedFile[] = [];
        for (const path of markdowny) {
          const file = await mqttClient.readFile(path);
          // Ścieżki w indeksie są względne wobec katalogu bazy — inaczej
          // prerekwizyty i linki musiałyby znać miejsce montowania.
          if (file?.content) wczytane.push({ path: relativeToRoot(path), markdown: file.content });
        }

        if (!anulowane) setFiles(wczytane);
      } catch (e) {
        if (!anulowane) setError((e as Error).message);
      }
    };

    void wczytaj();
    return () => { anulowane = true; };
  }, []);

  const index: KnowledgeIndex | undefined = useMemo(
    () => (files ? buildIndex(files) : undefined),
    [files],
  );
  const bodies = useMemo(
    () => Object.fromEntries((files ?? []).map((f) => [f.path, f.markdown])),
    [files],
  );

  const openDocument = useCallback((path: string) => navigate(`/knowledge/${path}`), [navigate]);

  // Postępy nauki: wczytywane raz, zapisywane po każdej rozwiązanej próbie.
  const [progress, setProgress] = useState<Progress>(emptyProgress);

  useEffect(() => { void loadProgress(mqttClient).then(setProgress); }, []);

  const zapiszProbe = useCallback((attempt: { id: string; quality: Quality }) => {
    setProgress((poprzedni) => {
      const nowy = recordAttempt(poprzedni, attempt.id, { quality: attempt.quality, at: Date.now() });
      // Zapis w tle: czytelnik ma zobaczyć werdykt od razu, a nie po powrocie
      // z serwera. Utracony zapis nadrabia następna próba, bo idzie cały stan.
      void saveProgress(mqttClient, nowy);
      return nowy;
    });
  }, []);

  const [pakowanie, setPakowanie] = useState(false);
  const [bladPakowania, setBladPakowania] = useState<string | undefined>();

  /**
   * Pobranie bazy jako archiwum działające bez serwera.
   *
   * Strony powstają tu i teraz z wczytanych dokumentów, więc archiwum jest
   * zawsze zgodne z tym, co czytelnik widzi na ekranie.
   */
  const pobierzBaze = useCallback(async () => {
    if (!files) return;
    setPakowanie(true);
    setBladPakowania(undefined);
    try {
      saveArchive(await buildArchive(files.map((f) => ({ path: f.path, markdown: f.markdown }))));
    } catch (e) {
      setBladPakowania((e as Error).message);
    } finally {
      setPakowanie(false);
    }
  }, [files]);

  if (error) {
    return (
      <Box p={3}>
        <Typography color="error">Nie udało się wczytać bazy wiedzy: {error}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Baza mieszka w katalogu <code>{ROOT_LABEL}</code> w Drive. Utwórz go i dodaj pierwszy dokument `.md`.
        </Typography>
      </Box>
    );
  }

  if (!index) {
    return (
      <Box p={3} display="flex" alignItems="center" gap={2}>
        <CircularProgress size={20} />
        <Typography variant="body2">Wczytuję bazę wiedzy…</Typography>
      </Box>
    );
  }

  if (!index.documents.length) {
    return (
      <Box p={3}>
        <Typography variant="h6">Baza wiedzy jest pusta</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Dodaj plik `.md` w katalogu <code>{ROOT_LABEL}</code> w Drive. Dokument z blokami
          <code> formula</code> i <code> sim</code> od razu pojawi się w katalogu.
        </Typography>
      </Box>
    );
  }

  const markdown = open ? bodies[open] : undefined;

  return (
    <Box p={2} maxWidth={1100} mx="auto">
      <Stack direction="row" spacing={1} alignItems="center" mb={2}>
        <Typography variant="h6" sx={{ flex: 1 }}>Baza wiedzy</Typography>
        {open && (
          <Button size="small" onClick={() => navigate('/knowledge')}>← katalog</Button>
        )}
        {!open && (
          <Button
            size="small"
            onClick={pobierzBaze}
            disabled={pakowanie}
            title="Archiwum ze stronami i symulacjami — działa bez serwera, także z dysku"
          >
            {pakowanie ? 'pakuję…' : '⤓ pobierz bazę'}
          </Button>
        )}
      </Stack>

      {bladPakowania && (
        <Typography color="error" variant="body2" mb={2}>{bladPakowania}</Typography>
      )}

      {open && markdown && (
        <ReaderView
          markdown={markdown}
          path={open}
          workerFactory={createModelWorker}
          onAttempt={zapiszProbe}
        />
      )}

      {open && !markdown && (
        <Typography color="error">Nie ma dokumentu „{open}" w bazie.</Typography>
      )}

      {!open && <PanelPostepow progress={progress} onOpen={openDocument} />}

      {!open && (
        <KnowledgeCatalog index={index} bodies={bodies} onOpen={openDocument} active={open} />
      )}
    </Box>
  );
};

/**
 * Pasek postępów nad katalogiem.
 *
 * Pokazuje się dopiero, gdy jest co pokazywać — pusty licznik „0 zadań" na
 * pierwszym wejściu jest szumem, nie informacją.
 */
const PanelPostepow: React.FC<{ progress: Progress; onOpen: (path: string) => void }> = ({
  progress, onOpen,
}) => {
  const teraz = Date.now();
  const podsumowanie = summarize(progress, teraz);
  if (!podsumowanie.seen) return null;

  // Identyfikator zadania to `ścieżka:zadanie` — do otwarcia potrzebna sama ścieżka.
  const doPowtorki = dueFor(progress, teraz);
  const dokumenty = [...new Set(doPowtorki.map((id) => id.split(':')[0]))];

  return (
    <Box mb={2} p={1.5} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          rozwiązane: <strong>{podsumowanie.seen}</strong>
          {' · '}opanowane: <strong>{podsumowanie.mastered}</strong>
          {podsumowanie.struggling > 0 && <> · sprawiają kłopot: <strong>{podsumowanie.struggling}</strong></>}
        </Typography>
        {doPowtorki.length > 0 && (
          <Typography variant="body2">
            do powtórki teraz: <strong>{doPowtorki.length}</strong>
          </Typography>
        )}
      </Stack>

      {dokumenty.length > 0 && (
        <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
          {dokumenty.map((path) => (
            <Button key={path} size="small" variant="outlined" onClick={() => onOpen(path)}>
              {path.replace(/\.md$/, '')}
            </Button>
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default KnowledgePage;
