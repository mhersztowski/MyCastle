/**
 * Panel sterujący odtwarzaniem — pasek na dole każdej strony.
 *
 * Poza zwykłymi przyciskami ma jedną rzecz, dla której powstał: **notatkę
 * przypiętą do miejsca w nagraniu**. Czas jest brany z odtwarzacza w chwili
 * naciśnięcia, więc notatka odpowiada temu, co słychać, a nie temu, kiedy ktoś
 * skończył pisać. Zapisana notatka staje się zakładką — kliknięcie w nią
 * przewija nagranie do tamtego miejsca.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Avatar, Box, Chip, Collapse, IconButton, InputAdornment, LinearProgress, List, ListItem,
  ListItemButton, ListItemText, Menu, MenuItem, Paper, Slider, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Replay10 as Replay10Icon,
  Forward30 as Forward30Icon,
  NoteAdd as NoteAddIcon,
  Delete as DeleteIcon,
  ExpandLess, ExpandMore, Speed as SpeedIcon,
} from '@mui/icons-material';
import { usePlayer } from '../modules/player/PlayerProvider';
import { api, formatTime, type Note } from '../services/api';

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function PlayerBar() {
  const { current, playing, position, duration, error, rate, toggle, seek, nudge, setRate } = usePlayer();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [rateAnchor, setRateAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * Czas zamrożony w chwili, gdy zaczęto pisać notatkę.
   *
   * Bez tego notatka dostawałaby czas z chwili naciśnięcia „Dodaj" — a między
   * usłyszeniem czegoś ciekawego a dopisaniem zdania mija kilkanaście sekund,
   * przez które nagranie leci dalej.
   */
  const pinnedRef = useRef<number | undefined>(undefined);
  const pinned = pinnedRef.current ?? position;

  useEffect(() => {
    if (!current) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    void api.getNotes(current.id)
      .then((loaded) => { if (!cancelled) setNotes(loaded); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [current?.id]);

  if (!current) return null;

  const total = duration || current.durationSec || 0;

  const handleDraft = (value: string) => {
    // Pierwszy wpisany znak przypina czas; wyczyszczenie pola zwalnia go,
    // żeby następna notatka dostała bieżące miejsce.
    if (!draft && value) pinnedRef.current = position;
    if (!value) pinnedRef.current = undefined;
    setDraft(value);
  };

  const addNote = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const note = await api.addNote(current.id, pinned, text);
      setNotes((prev) => [...prev, note].sort((a, b) => a.timeSec - b.timeSec));
      setDraft('');
      pinnedRef.current = undefined;
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (id: string) => {
    await api.removeNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <Paper
      elevation={8}
      square
      sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', pb: 'env(safe-area-inset-bottom)' }}
    >
      {busy && <LinearProgress />}

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ px: 2, pt: 1.5, maxHeight: 260, overflowY: 'auto' }}>
          {notes.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>
              Brak notatek do tego odcinka. Wpisz coś w polu poniżej — notatka zapamięta miejsce,
              w którym byłeś.
            </Typography>
          ) : (
            <List dense disablePadding>
              {notes.map((note) => (
                <ListItem
                  key={note.id}
                  disablePadding
                  secondaryAction={
                    <IconButton edge="end" size="small" onClick={() => void removeNote(note.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  {/* Notatka jest zakładką: kliknięcie przewija tam, gdzie powstała. */}
                  <ListItemButton onClick={() => seek(note.timeSec)} sx={{ borderRadius: 1 }}>
                    <Chip label={formatTime(note.timeSec)} size="small" sx={{ mr: 1.5, fontVariantNumeric: 'tabular-nums' }} />
                    <ListItemText primary={note.text} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Collapse>

      <Box sx={{ px: 2, py: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            src={current.image || undefined}
            variant="rounded"
            sx={{ width: 44, height: 44, display: { xs: 'none', sm: 'flex' } }}
          />

          <Box sx={{ minWidth: 0, flex: '1 1 220px' }}>
            <Typography variant="subtitle2" noWrap title={current.title}>{current.title}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{current.podcastTitle}</Typography>
          </Box>

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Tooltip title="Cofnij 10 s">
              <IconButton onClick={() => nudge(-10)}><Replay10Icon /></IconButton>
            </Tooltip>
            <IconButton color="primary" onClick={toggle} size="large">
              {playing ? <PauseIcon fontSize="large" /> : <PlayIcon fontSize="large" />}
            </IconButton>
            <Tooltip title="Przewiń 30 s">
              <IconButton onClick={() => nudge(30)}><Forward30Icon /></IconButton>
            </Tooltip>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: '2 1 240px', minWidth: 140 }}>
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(position)}
            </Typography>
            <Slider
              size="small"
              min={0}
              max={total || 1}
              value={Math.min(position, total || 1)}
              onChange={(_, value) => seek(Array.isArray(value) ? value[0] : value)}
              sx={{ mx: 1 }}
            />
            <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(total)}
            </Typography>
          </Stack>

          <Tooltip title="Prędkość odtwarzania">
            <IconButton onClick={(e) => setRateAnchor(e.currentTarget)}>
              <SpeedIcon />
              <Typography variant="caption" sx={{ ml: 0.5 }}>{rate}×</Typography>
            </IconButton>
          </Tooltip>
          <Menu anchorEl={rateAnchor} open={Boolean(rateAnchor)} onClose={() => setRateAnchor(null)}>
            {RATES.map((value) => (
              <MenuItem
                key={value}
                selected={value === rate}
                onClick={() => { setRate(value); setRateAnchor(null); }}
              >
                {value}×
              </MenuItem>
            ))}
          </Menu>

          <Tooltip title={open ? 'Zwiń notatki' : `Notatki (${notes.length})`}>
            <IconButton onClick={() => setOpen(!open)}>
              {open ? <ExpandMore /> : <ExpandLess />}
            </IconButton>
          </Tooltip>
        </Stack>

        <TextField
          fullWidth
          size="small"
          placeholder="Notatka w tym miejscu nagrania…"
          value={draft}
          onChange={(e) => handleDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addNote(); } }}
          sx={{ mt: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {/* Widoczny znacznik czasu mówi wprost, do którego miejsca
                    przypnie się notatka — i że nie ucieka razem z nagraniem. */}
                <Chip label={formatTime(pinned)} size="small" sx={{ fontVariantNumeric: 'tabular-nums' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Dodaj notatkę (Enter)">
                  <span>
                    <IconButton onClick={() => void addNote()} disabled={!draft.trim() || busy} edge="end">
                      <NoteAddIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />

        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
