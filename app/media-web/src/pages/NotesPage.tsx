/**
 * Wszystkie notatki, pogrupowane po odcinkach.
 *
 * Notatki przeżywają usunięcie odcinka z listy odtwarzanych — dotyczą nagrania,
 * a nie miejsca w kolejce — więc muszą mieć własne miejsce, gdzie da się je
 * przejrzeć po fakcie.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Box, Chip, Divider, IconButton, List, ListItem, ListItemButton, ListItemText,
  Paper, Typography,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { api, formatTime, type Note, type QueueItem } from '../services/api';
import { usePlayer } from '../modules/player/PlayerProvider';

export function NotesPage() {
  const { play, current, seek } = usePlayer();
  const [notes, setNotes] = useState<Note[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    void api.getAllNotes().then(setNotes).catch(() => {});
    // Kolejka daje tytuły do identyfikatorów odcinków i pozwala włączyć
    // nagranie, gdy notatka dotyczy czegoś, co akurat nie gra.
    void api.getQueue().then(setQueue).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const byEpisode = new Map<string, Note[]>();
    for (const note of notes) {
      const list = byEpisode.get(note.episodeId) ?? [];
      list.push(note);
      byEpisode.set(note.episodeId, list);
    }
    for (const list of byEpisode.values()) list.sort((a, b) => a.timeSec - b.timeSec);
    return [...byEpisode.entries()];
  }, [notes]);

  const remove = async (id: string) => {
    await api.removeNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  /** Skok do miejsca notatki: gdy odcinek nie gra, najpierw go włącz. */
  const jump = (episodeId: string, timeSec: number) => {
    if (current?.id === episodeId) {
      seek(timeSec);
      return;
    }
    const item = queue.find((q) => q.id === episodeId);
    if (item) play({ ...item, positionSec: timeSec });
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Notatki</Typography>
      {grouped.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Notatki dodaje się w panelu odtwarzania — zapamiętują miejsce w nagraniu.
        </Typography>
      )}
      {grouped.map(([episodeId, list]) => {
        const item = queue.find((q) => q.id === episodeId);
        return (
          <Paper variant="outlined" key={episodeId} sx={{ mb: 2 }}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2">{item?.title ?? 'Odcinek spoza listy'}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item?.podcastTitle ?? episodeId}
              </Typography>
            </Box>
            <Divider />
            <List dense disablePadding>
              {list.map((note) => (
                <ListItem
                  key={note.id}
                  disablePadding
                  secondaryAction={
                    <IconButton edge="end" size="small" onClick={() => void remove(note.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemButton onClick={() => jump(episodeId, note.timeSec)}>
                    <Chip label={formatTime(note.timeSec)} size="small" sx={{ mr: 1.5, fontVariantNumeric: 'tabular-nums' }} />
                    <ListItemText primary={note.text} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        );
      })}
    </Box>
  );
}
