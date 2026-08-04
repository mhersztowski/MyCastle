/**
 * PanelPowtorek — „czym się teraz zająć" w bazie wiedzy.
 *
 * Cztery rodzaje czynności mają różny rytm, więc każdy ma **własny odstęp
 * i własną liczbę pozycji**, ustawiane przez czytelnika i zapisywane na
 * serwerze razem z postępami. Sztywne liczby w kodzie znaczyłyby, że autor
 * programu wie lepiej od uczącego się, ile mu potrzeba.
 *
 * Panel nie liczy nic sam: dobór pozycji robi `planRevision` w `sci-core`,
 * a co w tej bazie jest czym — `buildRevisionSource`. Tutaj zostaje wyłącznie
 * to, co widać.
 *
 * Test praw i pojęć jest **samooceną**, nie automatem: hasła są zdaniami, nie
 * liczbami, więc nie ma czego porównać. Czytelnik przypomina sobie treść,
 * odsłania ją i mówi, jak poszło — a stopniowanie („bez zaglądania"/„z trudem"/
 * „nie pamiętam") wchodzi wprost do harmonogramu jako jakość odpowiedzi.
 */
import { useMemo, useState, type FC } from 'react';
import {
  Box, Button, Chip, Collapse, Paper, Slider, Stack, Typography,
} from '@mui/material';
import {
  planRevision, dueCount, ACTIVITY_KINDS, DAY,
  type ActivityKind, type RevisionSettings, type RevisionItem,
  type KnowledgeIndex, type ProgressWithRevision, type Quality,
} from '@mhersztowski/sci-core';
import { buildRevisionSource } from './revisionSource';

const NAZWA: Record<ActivityKind, string> = {
  subsection: 'Przypomnienie podrozdziału',
  questions: 'Pytania do rozdziału',
  exercises: 'Rozwiąż zadania',
  test: 'Test z praw i pojęć',
};

const IKONA: Record<ActivityKind, string> = {
  subsection: '📖', questions: '❓', exercises: '✎', test: '◈',
};

export interface PanelPowtorekProps {
  index: KnowledgeIndex;
  progress: ProgressWithRevision;
  settings: RevisionSettings;
  onSettings: (next: RevisionSettings) => void;
  /** Otwarcie dokumentu; `anchor` przewija do konkretnego zadania. */
  onOpen: (path: string, anchor?: string) => void;
  /** Wynik testu — ta sama ścieżka co próba rozwiązania zadania. */
  onAttempt: (id: string, quality: Quality) => void;
  /** Zegar wstrzykiwany — inaczej testu tego panelu nie da się napisać. */
  now?: number;
}

export const PanelPowtorek: FC<PanelPowtorekProps> = ({
  index, progress, settings, onSettings, onOpen, onAttempt, now = Date.now(),
}) => {
  const [czynnosc, setCzynnosc] = useState<ActivityKind | null>(null);
  const [nastawy, setNastawy] = useState(false);

  const plan = useMemo(
    () => planRevision(buildRevisionSource(index), progress, settings, now),
    [index, progress, settings, now],
  );
  const czeka = useMemo(() => dueCount(plan), [plan]);
  const razem = ACTIVITY_KINDS.reduce((s, k) => s + czeka[k], 0);

  // Panel pokazuje się dopiero, gdy jest co powtarzać — pusta lista na pierwszym
  // wejściu to szum, nie informacja.
  if (razem === 0 && !nastawy) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={1.5} flexWrap="wrap" rowGap={1}>
        <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 140 }}>
          Powtórki
        </Typography>
        <Button size="small" onClick={() => setNastawy((n) => !n)}>
          {nastawy ? 'ukryj odstępy' : '⚙ odstępy'}
        </Button>
      </Stack>

      <Collapse in={nastawy}>
        <Box mb={2}>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Po ilu dniach rodzaj wraca i ile pozycji pokazać naraz. Ustawienia
            zapisują się na serwerze razem z postępami.
          </Typography>
          {ACTIVITY_KINDS.map((kind) => (
            <Stack
              key={kind}
              direction="row"
              spacing={2}
              alignItems="center"
              flexWrap="wrap"
              rowGap={1}
              mb={1}
            >
              <Typography variant="body2" sx={{ minWidth: 210 }}>
                {IKONA[kind]} {NAZWA[kind]}
              </Typography>
              <Box sx={{ width: 170 }}>
                <Typography variant="caption" color="text.secondary">
                  odstęp: {settings.intervalDays[kind]} dni
                </Typography>
                <Slider
                  size="small"
                  min={1}
                  max={90}
                  value={settings.intervalDays[kind]}
                  onChange={(_e, v) => onSettings({
                    ...settings,
                    intervalDays: { ...settings.intervalDays, [kind]: v as number },
                  })}
                />
              </Box>
              <Box sx={{ width: 140 }}>
                <Typography variant="caption" color="text.secondary">
                  pozycji: {settings.batchSize[kind]}
                </Typography>
                <Slider
                  size="small"
                  min={1}
                  max={12}
                  value={settings.batchSize[kind]}
                  onChange={(_e, v) => onSettings({
                    ...settings,
                    batchSize: { ...settings.batchSize, [kind]: v as number },
                  })}
                />
              </Box>
            </Stack>
          ))}
        </Box>
      </Collapse>

      <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1} mb={czynnosc ? 2 : 0}>
        {ACTIVITY_KINDS.map((kind) => (
          <Button
            key={kind}
            size="small"
            variant={czynnosc === kind ? 'contained' : 'outlined'}
            disabled={plan[kind].length === 0}
            onClick={() => setCzynnosc(czynnosc === kind ? null : kind)}
          >
            {IKONA[kind]} {NAZWA[kind]}
            {czeka[kind] > 0 && (
              <Chip size="small" label={czeka[kind]} sx={{ ml: 1, height: 18 }} />
            )}
          </Button>
        ))}
      </Stack>

      {czynnosc && czynnosc !== 'test' && (
        <ListaDoOtwarcia pozycje={plan[czynnosc]} kind={czynnosc} onOpen={onOpen} now={now} />
      )}
      {czynnosc === 'test' && (
        <Test pozycje={plan.test} index={index} onAttempt={onAttempt} />
      )}
    </Paper>
  );
};

/** Ile dni temu — „nigdy" jest tu treścią, nie brakiem danych. */
function kiedy(lastAt: number, now: number): string {
  if (!lastAt) return 'nigdy';
  const dni = Math.floor((now - lastAt) / DAY);
  if (dni === 0) return 'dziś';
  if (dni === 1) return 'wczoraj';
  return `${dni} dni temu`;
}

const ListaDoOtwarcia: FC<{
  pozycje: RevisionItem[];
  kind: ActivityKind;
  onOpen: (path: string, anchor?: string) => void;
  now: number;
}> = ({ pozycje, kind, onOpen, now }) => (
  <Stack spacing={0.5}>
    {kind === 'exercises' && pozycje.length > 0 && (
      // Zadania są z jednego dokumentu — mówimy to wprost, bo lista sama tego
      // nie pokazuje, a to wybór, nie przypadek.
      <Typography variant="caption" color="text.secondary">
        Zadania z najdawniej ruszanego zestawu — powtórka wraca do materiału,
        nie do przypadkowych rachunków.
      </Typography>
    )}
    {pozycje.map((p) => (
      <Stack
        key={`${p.path}:${p.id ?? ''}`}
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {p.title}
        </Typography>
        <Typography variant="caption" color={p.lastAt ? 'text.secondary' : 'warning.main'}>
          {kiedy(p.lastAt, now)}
        </Typography>
        <Button size="small" onClick={() => onOpen(p.path, p.id)}>
          otwórz
        </Button>
      </Stack>
    ))}
  </Stack>
);

/**
 * Test: pytanie po pytaniu, z odsłonięciem i samooceną.
 *
 * Stopniowanie zamiast „dobrze/źle", bo harmonogram liczy odstęp z jakości
 * odpowiedzi — przypomnienie z trudem nie dowodzi tego samego, co bez zaglądania.
 */
const Test: FC<{
  pozycje: RevisionItem[];
  index: KnowledgeIndex;
  onAttempt: (id: string, quality: Quality) => void;
}> = ({ pozycje, index, onAttempt }) => {
  const [nr, setNr] = useState(0);
  const [odslonieta, setOdslonieta] = useState(false);
  const pytanie = pozycje[nr];

  const tresc = useMemo(() => {
    if (!pytanie?.id) return undefined;
    const dokument = index.documents.find((d) => d.path === pytanie.path);
    return dokument?.laws.find((l) => l.id === pytanie.id)?.statement
      ?? dokument?.terms.find((t) => t.id === pytanie.id)?.definition;
  }, [pytanie, index]);

  if (!pytanie) {
    return <Typography variant="body2" color="text.secondary">Nic do sprawdzenia.</Typography>;
  }

  const oceń = (quality: Quality) => {
    onAttempt(`${pytanie.path}:${pytanie.id}`, quality);
    setOdslonieta(false);
    setNr((n) => n + 1);
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {nr + 1} z {pozycje.length}
      </Typography>
      <Typography variant="subtitle2" sx={{ mt: 0.5, mb: 1 }}>
        {pytanie.title}
      </Typography>

      {!odslonieta && (
        <Button size="small" variant="outlined" onClick={() => setOdslonieta(true)}>
          pokaż treść
        </Button>
      )}

      {odslonieta && (
        <>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {tresc ?? 'Brak treści w bazie.'}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
            <Button size="small" variant="contained" onClick={() => oceń('perfect')}>
              pamiętałem
            </Button>
            <Button size="small" onClick={() => oceń('hinted')}>z trudem</Button>
            <Button size="small" color="warning" onClick={() => oceń('wrong')}>
              nie pamiętam
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
};
