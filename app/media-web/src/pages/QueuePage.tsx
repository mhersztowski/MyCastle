/**
 * Lista odtwarzanych na całej szerokości — ten sam zbiór, co panel na stronie
 * Podcasts, tylko z miejscem na dłuższe tytuły i datę dodania.
 */

import { useEffect, useState } from 'react';
import {
  Avatar, Box, Divider, IconButton, List, ListItem, ListItemAvatar, ListItemButton,
  ListItemText, Paper, Typography,
} from '@mui/material';
import { Delete as DeleteIcon, PlayArrow as PlayIcon } from '@mui/icons-material';
import { api, formatTime, type QueueItem } from '../services/api';
import { usePlayer } from '../modules/player/PlayerProvider';

export function QueuePage() {
  const { play, current } = usePlayer();
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => { void api.getQueue().then(setQueue).catch(() => {}); }, []);

  const remove = async (id: string) => setQueue(await api.dequeue(id));

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>Lista odtwarzanych</Typography>
      <Paper variant="outlined">
        <List disablePadding>
          {queue.map((item, index) => (
            <Box key={item.id}>
              {index > 0 && <Divider component="li" />}
              <ListItem
                secondaryAction={
                  <IconButton edge="end" onClick={() => void remove(item.id)}><DeleteIcon /></IconButton>
                }
              >
                <ListItemButton selected={current?.id === item.id} onClick={() => play(item)}>
                  <ListItemAvatar>
                    <Avatar src={item.image || undefined} variant="rounded"><PlayIcon /></Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={item.title}
                    secondary={[
                      item.podcastTitle,
                      item.durationSec ? formatTime(item.durationSec) : null,
                      item.positionSec > 0 ? `wznów od ${formatTime(item.positionSec)}` : null,
                    ].filter(Boolean).join(' · ')}
                  />
                </ListItemButton>
              </ListItem>
            </Box>
          ))}
          {queue.length === 0 && (
            <ListItem><ListItemText secondary="Lista jest pusta — dodaj odcinki na stronie Podcasts." /></ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
}
