/**
 * KasiaPage — panel asystentki.
 *
 * Strona jest **oknem na stan serwera**, nie miejscem, gdzie ten stan mieszka.
 * Kasia działa w backendzie także wtedy, gdy nikt nie ma otwartej karty —
 * przypomina o spotkaniach, myśli z własnej inicjatywy. Dlatego panel nie trzyma
 * własnej kopii rozmowy ani ustawień: czyta stan i odsyła polecenia.
 *
 * Odświeżanie jest odpytywaniem co kilka sekund, a nie strumieniem zdarzeń.
 * Świadomie: Kasia odzywa się najwyżej kilka razy dziennie, a odpytywanie działa
 * bez utrzymywania połączenia — także przez WebView w aplikacji mobilnej,
 * gdzie zerwane połączenia są normą, a nie awarią.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton,
  MenuItem, Paper, Select, Stack, Switch, Tab, Tabs, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import MicIcon from '@mui/icons-material/Mic';
import HearingIcon from '@mui/icons-material/Hearing';
import HearingDisabledIcon from '@mui/icons-material/HearingDisabled';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import {
  api, type RodzajSpotkania, type StanKasi, type TrybDostepnosci,
} from '../services/api';
import { KasiaGlosPanel } from './KasiaGlosPanel';
import { KasiaModelPanel } from './KasiaModelPanel';
import { useMowa } from '../modules/kasia/useMowa';

/** Co ile odpytujemy serwer o nowy stan. */
const ODSWIEZANIE_MS = 5000;

const OPIS_TRYBU: Record<TrybDostepnosci, { etykieta: string; ikona: JSX.Element }> = {
  'dostepny': { etykieta: 'Dostępny', ikona: <CheckCircleIcon fontSize="small" /> },
  'nie-przeszkadzac': { etykieta: 'Nie przeszkadzać', ikona: <DoNotDisturbOnIcon fontSize="small" /> },
  'spie': { etykieta: 'Śpię', ikona: <BedtimeIcon fontSize="small" /> },
};

const NAZWA_SPOTKANIA: Record<RodzajSpotkania, string> = {
  HersztuMorning: 'Poranne',
  HersztuEvening: 'Wieczorne',
  HersztuWeekly: 'Tygodniowe',
};

const DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

function godzinaZnacznika(o: number): string {
  return new Date(o).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export function KasiaPage() {
  const [stan, setStan] = useState<StanKasi | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [tekst, setTekst] = useState('');
  const [wysylanie, setWysylanie] = useState(false);
  const [zakladka, setZakladka] = useState(0);

  const dolRozmowy = useRef<HTMLDivElement>(null);

  // Po zawołaniu hak sam zaczyna nagrywać pytanie; tutaj tylko czyścimy pole,
  // żeby dyktowanie nie doklejało się do niedokończonego zdania.
  const mowa = useMowa(() => setTekst(''));

  /*
   * Ostatnia przeczytana wypowiedź — bez tego odpytywanie co pięć sekund
   * kazałoby Kasi czytać tę samą wiadomość w kółko, bo stan przychodzi na nowo
   * przy każdym odświeżeniu.
   */
  const ostatniaPrzeczytana = useRef<string | null>(null);

  const odswiez = useCallback(async () => {
    try {
      setStan(await api.kasiaStan());
      setBlad(null);
    } catch (err) {
      setBlad((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void odswiez();
    const id = setInterval(() => void odswiez(), ODSWIEZANIE_MS);
    return () => clearInterval(id);
  }, [odswiez]);

  /*
   * Przewijamy na dół przy każdej nowej wiadomości — także przy tej, która
   * przyszła z odpytywania. Wypowiedź z inicjatywy Kasi ma być widoczna bez
   * sięgania po pasek przewijania, bo inaczej cała inicjatywa nie ma sensu.
   */
  const liczbaWiadomosci = stan?.rozmowa.length ?? 0;
  useEffect(() => {
    dolRozmowy.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liczbaWiadomosci]);

  // Czytanie na głos nowych wypowiedzi Kasi — także tych z jej inicjatywy.
  const ostatnia = stan?.rozmowa.at(-1);
  useEffect(() => {
    if (!mowa.czytaj || !ostatnia || ostatnia.rola !== 'assistant') return;
    if (ostatniaPrzeczytana.current === ostatnia.id) return;
    ostatniaPrzeczytana.current = ostatnia.id;
    void mowa.powiedz(ostatnia.tresc);
  }, [ostatnia, mowa]);

  const wyslij = async () => {
    const tresc = tekst.trim();
    if (!tresc || wysylanie) return;
    setWysylanie(true);
    setTekst('');
    try {
      await api.kasiaPowiedz(tresc);
      await odswiez();
    } catch (err) {
      setBlad((err as Error).message);
      setTekst(tresc);   // nie gubimy tego, co użytkownik napisał
    } finally {
      setWysylanie(false);
    }
  };

  /** Dyktowanie: naciśnięcie zaczyna nagrywanie, kolejne kończy i wstawia tekst. */
  const przelaczMikrofon = async () => {
    if (mowa.nagrywa) {
      const rozpoznane = await mowa.zakonczNagrywanie();
      // Dopisujemy do tego, co już jest w polu — dyktowanie bywa uzupełnieniem,
      // a nie zastąpieniem tego, co użytkownik zdążył napisać.
      if (rozpoznane) setTekst((t) => (t ? `${t} ${rozpoznane}` : rozpoznane));
    } else {
      await mowa.nagrywaj();
    }
  };

  const zmienTryb = async (tryb: TrybDostepnosci) => {
    try {
      setStan(await api.kasiaDostepnosc(tryb));
    } catch (err) {
      setBlad((err as Error).message);
    }
  };

  const zmienSpotkanie = async (
    rodzaj: RodzajSpotkania,
    zmiany: { godzina?: string; dzienTygodnia?: number; wlaczone?: boolean },
  ) => {
    try {
      setStan(await api.kasiaSpotkanie(rodzaj, zmiany));
    } catch (err) {
      setBlad((err as Error).message);
    }
  };

  if (!stan) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        {blad ? <Alert severity="error">{blad}</Alert> : <CircularProgress />}
      </Box>
    );
  }

  const tryb = stan.dostepnosc.tryb;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      {blad && <Alert severity="warning" onClose={() => setBlad(null)}>{blad}</Alert>}

      {/* — Dostępność — */}
      <Paper sx={{ p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
          <Typography variant="body2" color="text.secondary">Jestem:</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={tryb}
            onChange={(_, v: TrybDostepnosci | null) => v && void zmienTryb(v)}
          >
            {(Object.keys(OPIS_TRYBU) as TrybDostepnosci[]).map((t) => (
              <ToggleButton key={t} value={t} sx={{ gap: 0.5 }}>
                {OPIS_TRYBU[t].ikona}{OPIS_TRYBU[t].etykieta}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {tryb !== 'dostepny' && (
            <Typography variant="caption" color="text.secondary">
              {stan.dostepnosc.do
                ? `do ${godzinaZnacznika(stan.dostepnosc.do)}`
                : 'do odwołania'}
              {' — Kasia nie zaczepia, ale odpowiada zagadnięta'}
            </Typography>
          )}

        </Stack>
      </Paper>

      {/*
        Zakładki obejmują **także rozmowę**, a nie tylko ustawienia.
        Wcześniej ustawienia rozwijały się nad rozmową i obie rzeczy były na
        ekranie naraz — przy rozwiniętych promptach panel rozmowy wchodził na
        treść ustawień, bo kontener ma stałą wysokość, a zawartość nie.
        Jedna lista zakładek znaczy, że w danej chwili widać dokładnie jedno.
      */}
      <Paper>
        <Tabs value={zakladka} onChange={(_, v: number) => setZakladka(v)} variant="scrollable">
          <Tab label="Rozmowa" />
          <Tab label="Zachowanie" />
          <Tab label="Model" />
          <Tab label="Głos" />
        </Tabs>
      </Paper>

      {/*
        Zakładki poza rozmową przewijają się same i nie mają dolnego paska,
        więc dostają `overflowY` i pełną wysokość pozostałą po nagłówkach.
        `minHeight: 0` jest konieczne: element w kolumnie flex domyślnie nie
        kurczy się poniżej swojej treści, więc bez tego przewijanie przenosi się
        na całą stronę i pasek wpisywania ucieka poza ekran.
      */}
      {zakladka === 1 && (
        <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
          <Ustawienia stan={stan} onZmiana={setStan} onBlad={setBlad} onSpotkanie={zmienSpotkanie} />
        </Box>
      )}
      {zakladka === 2 && (
        <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
          <KasiaModelPanel stan={stan} onZmiana={setStan} onBlad={setBlad} />
        </Box>
      )}
      {/* Panel głosu ma własne wczytywanie i zapis — dlatego nie dostaje stanu Kasi. */}
      {zakladka === 3 && (
        <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
          <KasiaGlosPanel />
        </Box>
      )}

      {/* — Rozmowa — */}
      {zakladka === 0 && (
      <Paper sx={{ flexGrow: 1, minHeight: 0, p: 2, overflowY: 'auto' }}>
        {stan.rozmowa.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            Jeszcze nie rozmawialiście. Napisz coś albo poczekaj — Kasia sama
            odezwie się przy najbliższym spotkaniu.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {stan.rozmowa.filter((w) => w.rola !== 'system').map((w) => (
              <Box
                key={w.id}
                sx={{
                  alignSelf: w.rola === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  bgcolor: w.rola === 'user' ? 'primary.main' : 'action.hover',
                  color: w.rola === 'user' ? 'primary.contrastText' : 'text.primary',
                  px: 1.5, py: 1, borderRadius: 2,
                }}
              >
                {w.zInicjatywy && (
                  <Chip
                    size="small" icon={<AutoAwesomeIcon />} label="z inicjatywy"
                    sx={{ mb: 0.5, height: 20, fontSize: 11 }}
                  />
                )}
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{w.tresc}</Typography>
                <Typography variant="caption" sx={{ opacity: 0.6 }}>
                  {godzinaZnacznika(w.o)}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
        <div ref={dolRozmowy} />
      </Paper>
      )}

      {/*
        Brak HTTPS wyjaśniamy raz, na widoku rozmowy: bez tego przyciski mowy
        są po prostu szare i nic nie mówią, co wygląda na awarię.
      */}
      {zakladka === 0 && !mowa.mikrofonMozliwy && mowa.gotowa && (
        <Alert severity="info" variant="outlined">
          {mowa.powodBrakuMikrofonu}
        </Alert>
      )}

      {mowa.blad && zakladka === 0 && (
        <Alert severity="warning" onClose={() => { /* znika przy następnej próbie */ }}>
          {mowa.blad}
        </Alert>
      )}

      {/* — Wpisywanie — tylko przy rozmowie, bo w ustawieniach nie ma do kogo pisać. */}
      {zakladka === 0 && (
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <Tooltip title={mowa.czytaj ? 'Kasia czyta odpowiedzi' : 'Kasia milczy (tylko tekst)'}>
          <span>
            <IconButton
              onClick={() => { mowa.przelaczCzytanie(); }}
              disabled={!mowa.gotowa}
              color={mowa.czytaj ? 'primary' : 'default'}
            >
              {mowa.czytaj ? <VolumeUpIcon /> : <VolumeOffIcon />}
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title={
          !mowa.mikrofonMozliwy ? (mowa.powodBrakuMikrofonu ?? 'Mikrofon niedostępny')
            : mowa.nagrywa ? 'Zakończ i rozpoznaj' : 'Dyktuj'
        }>
          <span>
            <IconButton
              onClick={() => void przelaczMikrofon()}
              disabled={!mowa.gotowa || !mowa.mikrofonMozliwy}
              color={mowa.nagrywa ? 'error' : 'default'}
            >
              <MicIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* Nasłuch słowa aktywującego — widoczny tylko, gdy włączony w panelu Głos. */}
        {mowa.konfiguracja.wakeWord?.enabled && (
          <Tooltip title={
            !mowa.mikrofonMozliwy ? (mowa.powodBrakuMikrofonu ?? 'Mikrofon niedostępny')
              : mowa.nasluchuje
                ? `Nasłuchuję „${mowa.konfiguracja.wakeWord.phrase}" (${mowa.opisSciezkiNasluchu}) — dotknij, by wyciszyć`
                : `Włącz nasłuch „${mowa.konfiguracja.wakeWord.phrase}"`
          }>
            <span>
              <IconButton
                onClick={() => mowa.przelaczNasluch()}
                disabled={!mowa.gotowa || !mowa.mikrofonMozliwy}
                color={mowa.nasluchuje ? 'success' : 'default'}
              >
                {mowa.nasluchuje ? <HearingIcon /> : <HearingDisabledIcon />}
              </IconButton>
            </span>
          </Tooltip>
        )}

        <TextField
          fullWidth size="small" multiline maxRows={4}
          placeholder={mowa.nagrywa ? 'Słucham…' : 'Napisz do Kasi…'}
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            // Enter wysyła, Shift+Enter łamie wiersz — jak w każdym komunikatorze.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void wyslij(); }
          }}
        />
        <Button
          variant="contained" onClick={() => void wyslij()}
          disabled={wysylanie || !tekst.trim()}
          sx={{ minWidth: 56 }}
        >
          {wysylanie ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
        </Button>
      </Stack>
      )}
    </Box>
  );
}

/**
 * Wpisanie wagi.
 *
 * Osobne pole, choć wagę można też podać Kasi w rozmowie: przy niedzielnym
 * spotkaniu wygodniej wpisać liczbę niż formułować zdanie, a pomiar zapisany
 * tą drogą trafia dokładnie tam, gdzie trzeba, bez pośrednictwa modelu — który
 * mógłby odczytać „84,6" jako „84" albo pominąć wpis.
 */
function Waga({ onBlad }: { onBlad: (b: string) => void }) {
  const [kg, setKg] = useState('');
  const [zapisano, setZapisano] = useState<number | null>(null);
  const [zapisuje, setZapisuje] = useState(false);

  const zapisz = async () => {
    // Przecinek dziesiętny jest tym, co Polak wpisze z klawiatury.
    const wartosc = Number(kg.replace(',', '.'));
    if (!Number.isFinite(wartosc)) { onBlad('To nie jest liczba.'); return; }

    setZapisuje(true);
    try {
      const w = await api.kasiaWaga(wartosc);
      setZapisano(w.pomiarow);
      setKg('');
    } catch (err) {
      onBlad((err as Error).message);
    } finally {
      setZapisuje(false);
    }
  };

  return (
    <>
      <Typography variant="subtitle2">Waga</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small" label="kg" value={kg} sx={{ width: 120 }}
          onChange={(e) => setKg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void zapisz(); }}
        />
        <Button size="small" onClick={() => void zapisz()} disabled={zapisuje || !kg.trim()}>
          {zapisuje ? 'Zapisuję…' : 'Zapisz pomiar'}
        </Button>
        {zapisano != null && (
          <Typography variant="caption" color="text.secondary">
            zapisano — pomiarów: {zapisano}
          </Typography>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Trafia do MyCastle (`data/waga.json`), więc widać go też na telefonie.
        Kasia omawia trend w niedzielę, ze średnich tygodniowych — nie z ostatniego pomiaru.
      </Typography>
    </>
  );
}

/**
 * Podgląd danych z MyCastle.
 *
 * Ładowany **na żądanie**, nie przy otwarciu zakładki: pobranie kilkunastu
 * plików przez brokera kosztuje sekundę i nie ma po co robić tego komuś, kto
 * przyszedł zmienić godzinę spotkania.
 */
function PodgladDanych({ onBlad }: { onBlad: (b: string) => void }) {
  const [opis, setOpis] = useState<string | null>(null);
  const [laduje, setLaduje] = useState(false);

  const pobierz = async () => {
    setLaduje(true);
    try {
      setOpis((await api.kasiaDane()).opis);
    } catch (err) {
      onBlad((err as Error).message);
    } finally {
      setLaduje(false);
    }
  };

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Co Kasia wie o dniu</Typography>
        <Button size="small" onClick={() => void pobierz()} disabled={laduje}>
          {laduje ? 'Pobieram…' : 'Sprawdź'}
        </Button>
      </Stack>
      {opis && (
        <Box
          component="pre"
          sx={{
            m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1,
            fontSize: 12, whiteSpace: 'pre-wrap', overflowX: 'auto',
          }}
        >
          {opis}
        </Box>
      )}
      {opis === null && !laduje && (
        <Typography variant="caption" color="text.secondary">
          To dokładnie ten tekst, który dostaje model — pozwala odróżnić błąd
          rozumowania Kasi od złych danych.
        </Typography>
      )}
    </>
  );
}

// ── Ustawienia ───────────────────────────────────────────────────────────────

interface UstawieniaProps {
  stan: StanKasi;
  onZmiana: (s: StanKasi) => void;
  onBlad: (b: string) => void;
  onSpotkanie: (r: RodzajSpotkania, z: { godzina?: string; dzienTygodnia?: number; wlaczone?: boolean }) => void;
}

function Ustawienia({ stan, onZmiana, onBlad, onSpotkanie }: UstawieniaProps) {
  /*
   * Prompty edytujemy w stanie lokalnym i zapisujemy przyciskiem.
   *
   * Zapis po każdym znaku przepisywałby plik kilkanaście razy na sekundę,
   * a odpytywanie co pięć sekund podmieniałoby tekst pod kursorem w trakcie
   * pisania — to drugie jest gorsze, bo wygląda na zjadanie liter.
   */
  const [init, setInit] = useState(stan.ustawienia.promptInit);
  const [update, setUpdate] = useState(stan.ustawienia.promptUpdate);
  const [coMin, setCoMin] = useState(String(stan.ustawienia.inicjatywaCoMin));
  const [zapisywanie, setZapisywanie] = useState(false);

  const zapisz = async () => {
    setZapisywanie(true);
    try {
      onZmiana(await api.kasiaUstawienia({
        promptInit: init,
        promptUpdate: update,
        inicjatywaCoMin: Math.max(0, Number(coMin) || 0),
      }));
    } catch (err) {
      onBlad((err as Error).message);
    } finally {
      setZapisywanie(false);
    }
  };

  const usunFragment = async (id: string, zrodlo: string) => {
    try {
      onZmiana(await api.kasiaUsunFragment(id, zrodlo));
    } catch (err) {
      onBlad((err as Error).message);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2">Spotkania</Typography>
        {stan.spotkania.map((s) => (
          <Stack key={s.rodzaj} direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Switch
              size="small" checked={s.wlaczone}
              onChange={(e) => onSpotkanie(s.rodzaj, { wlaczone: e.target.checked })}
            />
            <Typography variant="body2" sx={{ minWidth: 96 }}>
              {NAZWA_SPOTKANIA[s.rodzaj]}
            </Typography>
            <TextField
              size="small" type="time" value={s.godzina}
              onChange={(e) => onSpotkanie(s.rodzaj, { godzina: e.target.value })}
              sx={{ width: 120 }}
            />
            {s.dzienTygodnia != null && (
              <Select
                size="small" value={s.dzienTygodnia}
                onChange={(e) => onSpotkanie(s.rodzaj, { dzienTygodnia: Number(e.target.value) })}
                sx={{ minWidth: 130 }}
              >
                {DNI.map((d, i) => <MenuItem key={d} value={i}>{d}</MenuItem>)}
              </Select>
            )}
            {!s.uzgodnione && (
              <Tooltip title="Godzina domyślna — Kasia dopyta, czy pasuje">
                <Chip size="small" label="nieuzgodnione" variant="outlined" />
              </Tooltip>
            )}
          </Stack>
        ))}

        <Divider />

        <Waga onBlad={onBlad} />

        <Divider />

        <PodgladDanych onBlad={onBlad} />

        <Divider />

        <Typography variant="subtitle2">Inicjatywa</Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <TextField
            size="small" type="number" label="co ile minut" value={coMin}
            onChange={(e) => setCoMin(e.target.value)} sx={{ width: 140 }}
          />
          <Typography variant="caption" color="text.secondary">
            0 wyłącza samodzielne odzywanie się
          </Typography>
        </Stack>

        <TextField
          label="Prompt — kim jest Kasia (init)" multiline minRows={6} size="small"
          value={init} onChange={(e) => setInit(e.target.value)}
        />
        <TextField
          label="Prompt inicjatywy (update)" multiline minRows={4} size="small"
          value={update} onChange={(e) => setUpdate(e.target.value)}
          helperText="Model odpowiada MILCZ, gdy nie ma powodu się odezwać."
        />

        <Box>
          <Button variant="contained" size="small" onClick={() => void zapisz()} disabled={zapisywanie}>
            {zapisywanie ? 'Zapisywanie…' : 'Zapisz'}
          </Button>
        </Box>

        {stan.fragmenty.length > 0 && (
          <>
            <Divider />
            <Typography variant="subtitle2">
              Dołożone przez skrypty ({stan.fragmenty.length})
            </Typography>
            {stan.fragmenty.map((f) => (
              <Stack key={`${f.zrodlo}:${f.id}`} direction="row" alignItems="flex-start" spacing={1}>
                <Chip size="small" label={f.kind} variant="outlined" />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="body2">{f.tekst}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {f.zrodlo}
                    {f.wygasaO && ` · wygasa ${godzinaZnacznika(f.wygasaO)}`}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => void usunFragment(f.id, f.zrodlo)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </>
        )}
      </Stack>
    </Paper>
  );
}
