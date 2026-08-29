/**
 * KasiaModelPanel — wybór modelu językowego.
 *
 * Odpowiednik konfiguracji modelu AI w Aurze, z jedną zasadniczą różnicą:
 * **klucz API zostaje na serwerze**. Aura woła model wprost z przeglądarki, więc
 * klucz musi tam być. Kasia myśli po stronie backendu (także przy zamkniętej
 * karcie), więc klucz nigdy nie wraca w odpowiedzi `GET /api/kasia/stan` —
 * panel widzi tylko, czy jakiś jest ustawiony.
 *
 * Stąd puste pole klucza po wczytaniu: nie jest to błąd wczytywania, tylko
 * jedyny stan, jaki panel może pokazać, nie znając wartości. Puste pole przy
 * zapisie znaczy „zostaw dotychczasowy".
 */

import { useState } from 'react';
import {
  Alert, Box, Button, Chip, FormControl, InputAdornment, InputLabel, IconButton,
  MenuItem, Paper, Select, Stack, TextField, Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { api, type StanKasi } from '../services/api';

type Dostawca = 'anthropic' | 'openai' | 'ollama';

const NAZWY: Record<Dostawca, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  ollama: 'Ollama (lokalnie)',
};

/** Podpowiedzi modeli — pole zostaje tekstowe, bo lista modeli zmienia się częściej niż kod. */
const PODPOWIEDZI: Record<Dostawca, string[]> = {
  anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  ollama: ['llama3.2', 'qwen2.5', 'mistral'],
};

interface Props {
  stan: StanKasi;
  onZmiana: (s: StanKasi) => void;
  onBlad: (b: string) => void;
}

export function KasiaModelPanel({ stan, onZmiana, onBlad }: Props) {
  const [dostawca, setDostawca] = useState<Dostawca>(stan.ustawienia.dostawca);
  const [model, setModel] = useState(stan.ustawienia.model);
  const [adres, setAdres] = useState(stan.ustawienia.adresModelu);
  const [klucz, setKlucz] = useState('');
  const [widocznyKlucz, setWidocznyKlucz] = useState(false);
  const [zapisywanie, setZapisywanie] = useState(false);
  const [wynik, setWynik] = useState<{ gotowy: boolean; brakuje: string | null } | null>(null);

  /*
   * Zmiana dostawcy czyści model i adres do jego wartości domyślnych.
   * Backend robi to samo po swojej stronie — tutaj chodzi o to, żeby pola
   * na ekranie od razu pokazywały, co naprawdę zostanie zapisane.
   */
  const zmienDostawce = (d: Dostawca) => {
    setDostawca(d);
    setModel(PODPOWIEDZI[d][0]);
    setAdres(d === 'anthropic' ? 'https://api.anthropic.com'
      : d === 'openai' ? 'https://api.openai.com/v1'
        : 'http://localhost:11434/v1');
  };

  const zapisz = async () => {
    setZapisywanie(true);
    try {
      const odp = await api.kasiaModel({ dostawca, model, adres, klucz: klucz || undefined });
      setWynik({ gotowy: odp.gotowy, brakuje: odp.brakuje });
      setKlucz('');   // nie trzymamy klucza w pamięci przeglądarki dłużej niż trzeba
      onZmiana(await api.kasiaStan());
    } catch (err) {
      onBlad((err as Error).message);
    } finally {
      setZapisywanie(false);
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2">Model językowy</Typography>

        <Alert severity="info" variant="outlined">
          Klucz API zostaje na serwerze i nigdy nie wraca do przeglądarki — Kasia
          myśli po stronie backendu, także gdy ta karta jest zamknięta. Puste pole
          przy zapisie znaczy „zostaw dotychczasowy klucz".
        </Alert>

        <FormControl size="small" fullWidth>
          <InputLabel>Dostawca</InputLabel>
          <Select
            label="Dostawca" value={dostawca}
            onChange={(e) => zmienDostawce(e.target.value as Dostawca)}
          >
            {(Object.keys(NAZWY) as Dostawca[]).map((d) => (
              <MenuItem key={d} value={d}>{NAZWY[d]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small" label="Model" value={model}
          onChange={(e) => setModel(e.target.value)}
          helperText={`Np.: ${PODPOWIEDZI[dostawca].join(', ')}`}
        />

        <TextField
          size="small" label="Adres API" value={adres}
          onChange={(e) => setAdres(e.target.value)}
          helperText="Zmień, gdy używasz LiteLLM, vLLM albo Ollamy na innym hoście."
        />

        {dostawca !== 'ollama' && (
          <TextField
            size="small" label="Klucz API"
            type={widocznyKlucz ? 'text' : 'password'}
            value={klucz} onChange={(e) => setKlucz(e.target.value)}
            placeholder="zostaw puste, żeby nie zmieniać"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setWidocznyKlucz((w) => !w)}>
                    {widocznyKlucz ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}

        <Box>
          <Button variant="contained" size="small" onClick={() => void zapisz()} disabled={zapisywanie}>
            {zapisywanie ? 'Zapisywanie…' : 'Zapisz i sprawdź'}
          </Button>
        </Box>

        {wynik && (
          <Alert severity={wynik.gotowy ? 'success' : 'warning'}>
            {wynik.gotowy
              ? 'Model skonfigurowany — Kasia może myśleć i prowadzić spotkania.'
              : `Kasia jeszcze nie może myśleć: ${wynik.brakuje ?? 'brak konfiguracji'}.`}
          </Alert>
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">Obecnie:</Typography>
          <Chip size="small" label={`${NAZWY[stan.ustawienia.dostawca]} · ${stan.ustawienia.model}`} />
        </Stack>
      </Stack>
    </Paper>
  );
}
