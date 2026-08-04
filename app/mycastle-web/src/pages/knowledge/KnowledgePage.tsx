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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { KnowledgeCatalog, ReaderView, type SolutionDraft } from '@mhersztowski/sci-blocks';
// Style KaTeX — wzory w trybie czytania składa `sci-blocks`, ale arkusz ładuje
// host. Ta strona nie montuje MdEditora (który robi to przy okazji), więc musi
// zadbać o to sama; bez tego ułamki rozsypują się na osobne wiersze.
import 'katex/dist/katex.min.css';
import {
  buildIndex, dueFor, emptyProgress, isRead, markRead, readingStats, recordAttempt,
  resolveReference, summarize, unmarkRead,
  recordSolution, solutionsFor,
  type KnowledgeIndex, type Progress, type Quality, type RevisionSettings,
} from '@mhersztowski/sci-core';
import { ROOT, ROOT_LABEL, collectMarkdown, relativeToRoot } from './knowledgeFiles';
import { splitLibrary } from './books';
import { blockFenceFor } from './odsylacze';
import { BookShelf } from './BookShelf';
import { PanelPowtorek } from './PanelPowtorek';
import {
  findKnowledgeOwnerOf, publicKnowledgeOwner, readPublicDocument, readPublicKnowledge,
} from './publicKnowledge';
import { useAuth } from '../../modules/auth';
import { mqttClient, useMqtt } from '../../modules/mqttclient';
import { createModelWorker } from '../../workers';
import { buildArchive, saveArchive } from './downloadBase';
import { loadProgress, saveProgress, revisionSettings } from './progressStore';

interface LoadedFile {
  path: string;
  markdown: string;
}

export const KnowledgePage: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState<LoadedFile[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  /**
   * Skan katalogu czeka na broker.
   *
   * Strona bywa otwierana **z linku** — z dymka odsyłacza, z zakładki, przez
   * wklejenie adresu — a wtedy montuje się razem z całą aplikacją, zanim MQTT
   * zdąży się połączyć. Bez tego warunku pierwszy odczyt leciał od razu
   * i kończył się „Not connected to MQTT broker", choć chwilę później
   * połączenie już było.
   */
  const { isConnected } = useMqtt();
  const { token, currentUser } = useAuth();

  /**
   * Zalogowany czyta **własną** bazę przez sesję; gość — publiczną, po HTTP.
   *
   * Bez konta nie ma czyich postępów zapisywać, więc tryb publiczny jest tylko
   * do odczytu. Właściciela bazy dla gościa bierzemy z adresu albo z konfiguracji
   * wdrożenia — adres `/knowledge/book/...` sam z siebie nie mówi, czyją bazę
   * otworzyć.
   */
  /**
   * Właściciel bazy wskazany w adresie: `/knowledge/u/{kto}/…`.
   *
   * Jawne wskazanie zamiast zgadywania. Pierwsza wersja próbowała domyślnego
   * konta i na instalacji, gdzie biblioteka leżała gdzie indziej, dawała
   * „nie ma dokumentu" bez żadnej wskazówki. Adres z właścicielem jest przy
   * okazji linkiem, który da się komuś wysłać.
   */
  const owner = params.owner;

  /**
   * Publiczny znaczy „cudza albo niczyja baza", a nie „adres ma użytkownika".
   *
   * Zalogowany otwierający `/knowledge/u/{swoja-nazwa}/…` czyta **własną**
   * bibliotekę — przez sesję, z zapisem postępów i przyciskiem „przeczytałem".
   * Bez tego rozróżnienia link skopiowany z paska adresu odbierałby autorowi
   * jego własne statystyki.
   */
  const publiczny = !token || (!!owner && owner !== currentUser?.name);

  /**
   * Właściciel ustalony w trakcie wczytywania.
   *
   * Adres bez `u/{kto}` daje się otworzyć (strona sama znajduje właściciela),
   * ale wtedy **każdy kolejny link z katalogu** też byłby bez niego — i szukanie
   * powtarzałoby się przy każdym kliknięciu. Zapamiętany właściciel wchodzi do
   * adresu, więc po pierwszym wejściu wszystkie linki są już jednoznaczne
   * i nadają się do wysłania komuś.
   */
  const [wykryty, setWykryty] = useState<string | undefined>();
  const wlascicielBazy = owner ?? wykryty;

  /**
   * Przedrostek tras — **zawsze** z właścicielem, także dla zalogowanego.
   *
   * Adres bez użytkownika działa, ale nie da się go nikomu wysłać: po otwarciu
   * u kogoś innego wskazywałby jego bazę albo nic. Skoro strona wie, czyją
   * bibliotekę pokazuje, ma to napisać w adresie — wtedy każdy link z katalogu
   * jest od razu linkiem do udostępnienia.
   */
  const wlascicielDoUrl = wlascicielBazy ?? (publiczny ? undefined : currentUser?.name);
  const baseUrl = wlascicielDoUrl
    ? `/knowledge/u/${encodeURIComponent(wlascicielDoUrl)}`
    : '/knowledge';

  // Ścieżka dokumentu jest resztą adresu po `/knowledge/`.
  const open = params['*'] || undefined;

  useEffect(() => {
    let anulowane = false;

    if (publiczny) {
      void (async () => {
        // Gdy adres nie niesie właściciela, a wskazuje konkretny dokument —
        // szukamy tego, który go ma. Inaczej stary link kończyłby się
        // komunikatem „nie ma dokumentu" przy pierwszej z brzegu bazie.
        const wlasciciel = owner
          ? owner
          : (open ? await findKnowledgeOwnerOf(open) : undefined) ?? await publicKnowledgeOwner();
        if (anulowane) return;
        if (!wlasciciel) {
          setError('Nie wiadomo, czyją bazę pokazać — otwórz adres postaci /knowledge/u/{użytkownik}/…');
          return;
        }
        setWykryty(wlasciciel);
        /**
         * Najpierw otwarty dokument, potem reszta biblioteki.
         *
         * Publiczna baza podręcznika to 248 plików i 3,5 MB. Czytelnik, który
         * wszedł prosto w link do podrozdziału, ma zobaczyć swój tekst od razu —
         * katalog i odsyłacze do innych dokumentów mogą dojść chwilę później.
         */
        if (open) {
          const jeden = await readPublicDocument(wlasciciel, open);
          if (!anulowane && jeden) setFiles([jeden]);
        }

        try {
          const wczytane = await readPublicKnowledge(wlasciciel);
          if (!anulowane) setFiles(wczytane);
        } catch (e) {
          // Gdy pojedynczy dokument już się pokazał, awaria reszty nie ma prawa
          // go zabrać — czytelnik czyta dalej, tylko bez katalogu.
          if (!anulowane && !open) setError((e as Error).message);
        }
      })();
      return () => { anulowane = true; };
    }

    if (!isConnected) return undefined;

    const wczytaj = async () => {
      try {
        // Wprost przez klienta MQTT, nie przez `filesystemService`: ten drugi
        // szuka pliku w drzewie po ścieżce **względnej**, a czyta go po
        // **pełnej**, więc działa tylko wtedy, gdy wczytano cały Drive.
        // Tutaj wczytujemy jeden katalog, a węzły drzewa niosą pełne ścieżki.
        //
        // Gdy katalog bazy jeszcze nie istnieje (nowy użytkownik), listowanie
        // rzuca błąd. Zamiast pokazać awarię — zakładamy katalog dla użytkownika.
        // VFS nie ma osobnego `mkdir`, więc tworzymy go zapisem placeholdera
        // (backend zakłada katalogi nadrzędne przy zapisie). `.keep` nie jest
        // plikiem `.md`, więc nie pojawi się jako dokument — baza startuje pusta
        // i strona pokazuje stan „Baza wiedzy jest pusta".
        const tree = await mqttClient.listDirectory(ROOT).catch(async () => {
          await mqttClient.writeFile(`${ROOT}/.keep`, '');
          return mqttClient.listDirectory(ROOT);
        });
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
  }, [isConnected, publiczny, owner, open]);

  /**
   * Podział na materiał do nauki i na książki.
   *
   * Indeks ścieżki nauki powstaje **tylko** z materiału autorskiego. Przepisany
   * podręcznik to setki podrozdziałów ułożonych w kolejności druku, a nie
   * nauki — w grafie prerekwizytów zalałyby wszystko, a w katalogu przestałoby
   * być widać, czego się uczyć.
   *
   * Książki nie znikają: dostają własną sekcję z drzewem katalogów i dają się
   * czytać tym samym czytnikiem.
   */
  const { learning, books } = useMemo(() => splitLibrary(files ?? []), [files]);

  const index: KnowledgeIndex | undefined = useMemo(
    () => (files ? buildIndex(learning) : undefined),
    [files, learning],
  );

  /**
   * Drugi indeks — **z książkami** — dla wszystkiego, co pyta „gdzie to jest".
   *
   * Odsunięcie książek od ścieżki nauki miało oczyścić katalog i graf
   * prerekwizytów. Zabrało przy okazji coś, czego zabrać nie miało: cele
   * odsyłaczy. Wzór „(15-6)" stoi w podrozdziale podręcznika, więc bez tego
   * indeksu odsyłacz do niego nie miał czego znaleźć i dymek pokazywał pustkę.
   *
   * Dwa indeksy, a nie jeden z filtrem przy użyciu: katalog i graf pytają
   * o „czego się uczyć", odsyłacz i powtórki pytają o „gdzie to jest" — i to są
   * różne pytania.
   *
   * **Powtórki należą do tej drugiej grupy** i wzięcie tu `index` było błędem:
   * `Pytania.md`, `Zadania.md`, `Prawa.md` i `Slownik.md` istnieją **wyłącznie**
   * w książkach, więc trzy z czterech rodzajów czynności wychodziły puste,
   * a przyciski nieaktywne — bez żadnego komunikatu, bo pusta lista wygląda
   * tak samo jak „nic nie zalega".
   */
  const indexPelny: KnowledgeIndex | undefined = useMemo(
    () => (files ? buildIndex(files) : undefined),
    [files],
  );
  const bodies = useMemo(
    () => Object.fromEntries((files ?? []).map((f) => [f.path, f.markdown])),
    [files],
  );

  const openDocument = useCallback(
    (path: string, kotwica?: string) => navigate(`${baseUrl}/${path}${kotwica ? `#ref-${kotwica}` : ''}`),
    [navigate, baseUrl],
  );

  /**
   * Przewinięcie do kotwicy z adresu.
   *
   * Odsyłacz z innego dokumentu (albo z edytora) niesie `#ref-<identyfikator>`;
   * bez tego czytelnik lądował na początku dokumentu i musiał sam szukać wzoru,
   * do którego kliknął. Czekamy na `markdown`, bo wcześniej elementu jeszcze
   * nie ma w drzewie.
   */
  const { hash } = useLocation();
  const otwartyDokument = open ? bodies[open] : undefined;
  useEffect(() => {
    if (!hash || !otwartyDokument) return undefined;
    // Jedna klatka zwłoki: bloki montują się po pierwszym renderze dokumentu.
    const id = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [hash, otwartyDokument]);

  /**
   * Rozwiązywanie odsyłaczy `[[id]]` — wzorów i haseł słownika.
   *
   * Tylko strona ma indeks całej bazy, więc bez tego czytnik pokazywałby każdy
   * odsyłacz między dokumentami jako prowadzący w próżnię. Cel odnajdujemy po
   * **identyfikatorze**, nigdy po ścieżce — dlatego przeniesienie katalogu
   * z książką niczego nie psuje.
   */
  const rozwiazOdsylacz = useCallback((id: string) => {
    if (!indexPelny) return undefined;

    const cel = resolveReference(id, {
      formulaHome: indexPelny.formulaHome,
      termHome: indexPelny.termHome,
      documentTitles: new Map(indexPelny.documents.map((d) => [d.path, d.meta.title ?? d.path])),
    }, open ?? '');
    if (!cel.found || !cel.path) return undefined;

    // Treść bloku wyciągamy ze źródła dokumentu docelowego — z niej powstaje
    // podgląd pod kursorem.
    const zrodlo = bodies[cel.path] ?? '';
    const fence = blockFenceFor(cel.kind, id);

    return {
      code: fence.exec(zrodlo)?.[1],
      kind: cel.kind,
      documentTitle: cel.documentTitle,
      sameDocument: cel.sameDocument,
    };
  }, [indexPelny, bodies, open]);

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

  /**
   * Oznaczenie podrozdziału jako przeczytanego.
   *
   * Idzie do tego samego pliku co wyniki zadań — dwa pliki znaczyłyby dwa
   * miejsca do zsynchronizowania między telefonem a komputerem.
   */
  const oznaczPrzeczytane = useCallback((path: string, read: boolean) => {
    setProgress((poprzedni) => {
      const nowy = read ? markRead(poprzedni, path, Date.now()) : unmarkRead(poprzedni, path);
      void saveProgress(mqttClient, nowy);
      return nowy;
    });
  }, []);

  /**
   * Zmiana odstępów powtórek.
   *
   * Idzie do tego samego pliku co wyniki i ślady czytania — osobny plik
   * znaczyłby drugie miejsce do zsynchronizowania między telefonem a komputerem.
   */
  const zapiszNastawy = useCallback((next: RevisionSettings) => {
    setProgress((poprzedni) => {
      const nowy = { ...poprzedni, revision: next };
      void saveProgress(mqttClient, nowy);
      return nowy;
    });
  }, []);

  /**
   * Zapis podejścia do zadania: treść, tryb i wynik.
   *
   * **Datę stempluje host**, nie blok — czas wykonania jest faktem o nauce,
   * a nie czymś, co komponent widoku ma prawo ustalać. Idzie do tego samego
   * pliku co reszta postępów.
   */
  const zapiszRozwiazanie = useCallback((exerciseId: string, draft: SolutionDraft) => {
    setProgress((poprzedni) => {
      const nowy = recordSolution(poprzedni, exerciseId, { ...draft, at: Date.now() });
      void saveProgress(mqttClient, nowy);
      return nowy;
    });
  }, []);

  /** Statystyka liczona wobec **obecnej** zawartości bazy, nie wobec śladów. */
  const statystykaCzytania = useMemo(
    () => readingStats(progress, (index?.documents ?? []).map((d) => d.path)),
    [progress, index],
  );

  /**
   * Tryb czytania: przewijanie albo strony.
   *
   * Do wyboru, nie na sztywno: strony są lepsze do lektury ciągiem (nie gubią
   * miejsca i pokazują postęp), ale przewijanie wygrywa, gdy czytelnik skacze
   * po dokumencie za odsyłaczami. Wybór zostaje w przeglądarce — to ustawienie
   * oglądania, nie treści.
   */
  const [stronami, setStronami] = useState(() => {
    try { return localStorage.getItem('knowledge:paged') === '1'; } catch { return false; }
  });
  const przelaczTryb = useCallback(() => {
    setStronami((p) => {
      try { localStorage.setItem('knowledge:paged', p ? '0' : '1'); } catch { /* prywatny tryb */ }
      return !p;
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

  /**
   * Wysokość okna czytania — od górnej krawędzi kontenera do dołu ekranu.
   *
   * Mierzona po zamontowaniu i przy każdej zmianie rozmiaru, bo wszystko, co
   * stoi wyżej, potrafi urosnąć: tytuł łamie się na dwa wiersze, pasek
   * przycisków zawija się na wąskim ekranie.
   */
  const ramkaCzytnika = useRef<HTMLDivElement>(null);
  const [wysokoscCzytnika, setWysokoscCzytnika] = useState('calc(100vh - 160px)');

  useLayoutEffect(() => {
    if (!stronami) return undefined;
    const zmierz = () => {
      const gora = ramkaCzytnika.current?.getBoundingClientRect().top ?? 0;
      // Margines na dolny odstęp strony — bez niego ostatni wiersz dotyka krawędzi.
      setWysokoscCzytnika(`${Math.max(320, Math.round(window.innerHeight - gora - 12))}px`);
    };
    zmierz();
    window.addEventListener('resize', zmierz);
    return () => window.removeEventListener('resize', zmierz);
  }, [stronami, open, otwartyDokument]);



  if (error) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }} p={3}>
        <Typography color="error">Nie udało się wczytać bazy wiedzy: {error}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Baza mieszka w katalogu <code>{ROOT_LABEL}</code> w Drive. Utwórz go i dodaj pierwszy dokument `.md`.
        </Typography>
      </Box>
    );
  }

  if (!index) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }} p={3} display="flex" alignItems="center" gap={2}>
        <CircularProgress size={20} />
        <Typography variant="body2">
          {isConnected ? 'Wczytuję bazę wiedzy…' : 'Łączę z serwerem…'}
        </Typography>
      </Box>
    );
  }

  // Pusto znaczy „nie ma **niczego**" — także wtedy, gdy indeks nauki jest
  // pusty, bo cała baza to przepisane książki. Sam brak materiału autorskiego
  // nie jest pustą bazą, tylko biblioteką bez własnych notatek.
  if (!index.documents.length && !books.length) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }} p={3}>
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
    <Box sx={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
      <Box p={2} maxWidth={1100} mx="auto">
        {/*
          Belka zostaje widoczna przy przewijaniu — na każdej szerokości i w obu
          trybach czytania. Powrót do katalogu i przełącznik trybu to jedyne
          wyjścia z dokumentu; schowane pod kilkoma ekranami tekstu zmuszały do
          przewijania na sam początek, żeby cokolwiek zrobić.

          `sticky`, nie `fixed`: belka ma zostać w kolumnie treści (wyśrodkowanej,
          o ograniczonej szerokości), a `fixed` wyrwałby ją z tego układu i kazał
          powtarzać marginesy ręcznie dla każdej szerokości ekranu.

          Ujemne marginesy z dopełnieniem odtwarzają odstęp strony — bez nich
          tekst prześwitywałby po bokach belki przy przewijaniu.
        */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            mx: -2,
            px: 2,
            pt: 1,
            pb: 1.5,
            mb: 1,
            bgcolor: 'background.default',
            borderBottom: '1px solid',
            borderColor: 'divider',
            flexWrap: 'wrap',
            rowGap: 1,
          }}
        >
          <Typography variant="h6" sx={{ flex: 1, minWidth: 120 }}>Baza wiedzy</Typography>
          {open && (
            <Button size="small" onClick={() => navigate(baseUrl)}>← katalog</Button>
          )}
          {open && (
            <Button
              size="small"
              onClick={przelaczTryb}
              title={stronami
                ? 'Strony: klik z boku przewraca, wysokość strony to wysokość ekranu'
                : 'Przewijanie: dokument jednym ciągiem'}
            >
              {stronami ? '▤ strony' : '↕ przewijanie'}
            </Button>
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
          /*
            W trybie stron czytnik musi znać wysokość, na której ma dzielić.
            Wysokość jest **mierzona**, a nie odjęta na oko: nad czytnikiem stoi
            pasek aplikacji, nagłówek bazy, przyciski „katalog"/„strony" i tytuł
            dokumentu, a każde z nich zmienia wysokość zależnie od szerokości
            okna i długości tytułu. Stała „minus 160 px" była w tym miejscu
            zgadywaniem i o tyle właśnie ucinała ostatnią stronę.
          */
          <Box ref={ramkaCzytnika} sx={stronami ? { height: wysokoscCzytnika, minHeight: 320 } : undefined}>
          <ReaderView
            markdown={markdown}
            path={open}
            workerFactory={createModelWorker}
            onAttempt={zapiszProbe}
            resolveRef={rozwiazOdsylacz}
            onNavigate={(id) => {
              const cel = indexPelny?.anchors.get(id)?.path;
              if (cel && cel !== open) openDocument(cel, id);
            }}
            paged={stronami}
            // Bez konta nie ma gdzie zapisać, że ktoś przeczytał — przycisk
            // byłby wtedy obietnicą bez pokrycia.
            read={publiczny ? undefined : isRead(progress, open)}
            onRead={publiczny ? undefined : (read) => oznaczPrzeczytane(open, read)}
            // Bez konta nie ma gdzie zapisać rozwiązania, więc okno i historia
            // byłyby obietnicą bez pokrycia — tak samo jak „przeczytałem".
            solutionStore={publiczny ? undefined : {
              get: (id) => solutionsFor(progress, id),
              save: zapiszRozwiazanie,
            }}
          />
          </Box>
        )}

        {open && !markdown && (
          <Typography color="error">Nie ma dokumentu „{open}" w bazie.</Typography>
        )}

        {!open && !publiczny && indexPelny && (
          <PanelPowtorek
            index={indexPelny}
            progress={progress}
            settings={revisionSettings(progress)}
            onSettings={zapiszNastawy}
            onOpen={openDocument}
            onAttempt={(id, quality) => zapiszProbe({ id, quality })}
          />
        )}

        {!open && (
          <PanelPostepow progress={progress} onOpen={openDocument} czytanie={statystykaCzytania} />
        )}

        {!open && <BookShelf files={books} onOpen={openDocument} />}

        {!open && (
          <KnowledgeCatalog index={index} bodies={bodies} onOpen={openDocument} active={open} />
        )}
      </Box>
    </Box>
  );
};

/**
 * Pasek postępów nad katalogiem.
 *
 * Pokazuje się dopiero, gdy jest co pokazywać — pusty licznik „0 zadań" na
 * pierwszym wejściu jest szumem, nie informacją.
 */
const PanelPostepow: React.FC<{
  progress: Progress;
  onOpen: (path: string) => void;
  czytanie: ReturnType<typeof readingStats>;
}> = ({ progress, onOpen, czytanie }) => {
  const teraz = Date.now();
  const podsumowanie = summarize(progress, teraz);
  // Panel ma sens, gdy jest co pokazać: albo rozwiązane zadania, albo
  // przeczytane podrozdziały. Sam licznik „0" na pierwszym wejściu to szum.
  if (!podsumowanie.seen && !czytanie.read) return null;

  // Identyfikator zadania to `ścieżka:zadanie` — do otwarcia potrzebna sama ścieżka.
  const doPowtorki = dueFor(progress, teraz);
  const dokumenty = [...new Set(doPowtorki.map((id) => id.split(':')[0]))];

  return (
    <Box mb={2} p={1.5} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        {czytanie.total > 0 && (
          <Typography variant="body2" color="text.secondary">
            przeczytane: <strong>{czytanie.read}</strong> z {czytanie.total}
            {' ('}{czytanie.percent}{' %)'}
          </Typography>
        )}
        {podsumowanie.seen > 0 && (
        <Typography variant="body2" color="text.secondary">
          rozwiązane: <strong>{podsumowanie.seen}</strong>
          {' · '}opanowane: <strong>{podsumowanie.mastered}</strong>
          {podsumowanie.struggling > 0 && <> · sprawiają kłopot: <strong>{podsumowanie.struggling}</strong></>}
        </Typography>
        )}
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
