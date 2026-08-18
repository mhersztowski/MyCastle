/**
 * Strona Podcasts: szukanie, odcinki i lista odtwarzanych obok siebie.
 *
 * Trzy widoki dzielą jedną kolumnę po lewej, bo to jedna czynność rozłożona
 * na kroki — szukam podkastu, wybieram odcinek, dodaję do listy. Lista
 * odtwarzanych jest po prawej i nie znika przy przechodzeniu między krokami:
 * to do niej dokłada się kolejne odcinki, więc musi być widoczna w trakcie.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
  Divider, Grid, IconButton, InputAdornment, LinearProgress, List, ListItem, ListItemAvatar,
  ListItemButton, ListItemText, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Search as SearchIcon,
  ArrowBack as ArrowBackIcon,
  PlaylistAdd as PlaylistAddIcon,
  PlayArrow as PlayIcon,
  Delete as DeleteIcon,
  Podcasts as PodcastsIcon,
} from '@mui/icons-material';
import { api, formatTime, type Episode, type Feed, type PodcastResult, type QueueItem } from '../services/api';
import { usePlayer } from '../modules/player/PlayerProvider';

export function PodcastsPage() {
  const { play, current } = usePlayer();

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PodcastResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchInfo, setSearchInfo] = useState<{ failed: string[]; podcastIndexEnabled: boolean }>();
  const [error, setError] = useState<string>();

  const [feed, setFeed] = useState<Feed>();
  const [loadingFeed, setLoadingFeed] = useState(false);

  const [queue, setQueue] = useState<QueueItem[]>([]);

  const refreshQueue = useCallback(() => {
    void api.getQueue().then(setQueue).catch(() => {});
  }, []);

  useEffect(refreshQueue, [refreshQueue]);

  const search = async () => {
    const phrase = term.trim();
    if (!phrase) return;
    setSearching(true);
    setError(undefined);
    setFeed(undefined);
    try {
      const response = await api.searchPodcasts(phrase);
      setResults(response.results);
      setSearchInfo({ failed: response.failed, podcastIndexEnabled: response.podcastIndexEnabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const openFeed = async (podcast: PodcastResult) => {
    setLoadingFeed(true);
    setError(undefined);
    try {
      setFeed(await api.loadFeed(podcast.feedUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFeed(false);
    }
  };

  const addToQueue = async (episode: Episode) => {
    if (!feed) return;
    setQueue(await api.enqueue({
      id: episode.id,
      title: episode.title,
      podcastTitle: feed.title,
      image: episode.image || feed.image,
      mediaUrl: episode.mediaUrl,
      mediaType: episode.mediaType,
      durationSec: episode.durationSec,
      feedUrl: feed.feedUrl,
    }));
  };

  const removeFromQueue = async (id: string) => setQueue(await api.dequeue(id));

  return (
    <Grid container spacing={2}>
      {/* Lewa kolumna — szukanie i odcinki */}
      <Grid item xs={12} md={7} lg={8}>
        <TextField
          fullWidth
          placeholder="Szukaj podkastu…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void search(); }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            endAdornment: (
              <InputAdornment position="end">
                <Button variant="contained" onClick={() => void search()} disabled={searching || !term.trim()}>
                  Szukaj
                </Button>
              </InputAdornment>
            ),
          }}
        />

        {searching && <LinearProgress sx={{ mt: 1 }} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        {searchInfo && !searchInfo.podcastIndexEnabled && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Szukam wyłącznie w katalogu iTunes. Podcast Index dołoży wyniki spoza ekosystemu Apple —
            wystarczy wpisać klucze <code>PODCASTINDEX_KEY</code> i <code>PODCASTINDEX_SECRET</code>
            {' '}w <code>app/media-backend/.env</code>.
          </Alert>
        )}
        {searchInfo?.failed.map((failure) => (
          <Alert key={failure} severity="warning" sx={{ mt: 1 }}>Katalog nie odpowiedział — {failure}</Alert>
        ))}

        {/* Odcinki wybranego podkastu */}
        {feed ? (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <IconButton onClick={() => setFeed(undefined)} size="small"><ArrowBackIcon /></IconButton>
              <Avatar src={feed.image || undefined} variant="rounded" />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" noWrap>{feed.title}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{feed.author}</Typography>
              </Box>
            </Stack>

            <Paper variant="outlined">
              <List dense disablePadding>
                {feed.episodes.map((episode, index) => (
                  <Box key={episode.id}>
                    {index > 0 && <Divider component="li" />}
                    <ListItem
                      secondaryAction={
                        <Tooltip title="Dodaj do listy odtwarzanych">
                          <IconButton edge="end" onClick={() => void addToQueue(episode)}>
                            <PlaylistAddIcon />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemText
                        primary={episode.title}
                        secondary={[
                          episode.published,
                          episode.durationSec ? formatTime(episode.durationSec) : null,
                        ].filter(Boolean).join(' · ')}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  </Box>
                ))}
                {feed.episodes.length === 0 && (
                  <ListItem><ListItemText secondary="Kanał nie zawiera odcinków z plikiem dźwiękowym." /></ListItem>
                )}
              </List>
            </Paper>
          </Box>
        ) : (
          <>
            {loadingFeed && <Box sx={{ mt: 3, textAlign: 'center' }}><CircularProgress /></Box>}
            <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
              {results.map((podcast) => (
                <Grid item xs={12} sm={6} lg={4} key={`${podcast.source}-${podcast.id}-${podcast.feedUrl}`}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardActionArea onClick={() => void openFeed(podcast)} sx={{ height: '100%' }}>
                      <CardContent>
                        <Stack direction="row" spacing={1.5}>
                          <Avatar src={podcast.image || undefined} variant="rounded" sx={{ width: 56, height: 56 }}>
                            <PodcastsIcon />
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap title={podcast.title}>{podcast.title}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {podcast.author}
                            </Typography>
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                              <Chip label={podcast.source === 'itunes' ? 'iTunes' : 'Podcast Index'} size="small" />
                              {podcast.episodeCount ? <Chip label={`${podcast.episodeCount} odc.`} size="small" variant="outlined" /> : null}
                            </Stack>
                          </Box>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {!searching && results.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
                Wpisz frazę, żeby przeszukać katalogi podkastów.
              </Typography>
            )}
          </>
        )}
      </Grid>

      {/* Prawa kolumna — lista odtwarzanych */}
      <Grid item xs={12} md={5} lg={4}>
        <Paper variant="outlined">
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle1">Lista odtwarzanych</Typography>
            <Typography variant="caption" color="text.secondary">
              {queue.length === 0 ? 'pusta' : `${queue.length} pozycji`}
            </Typography>
          </Box>
          <Divider />
          <List dense disablePadding sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {queue.map((item) => (
              <ListItem
                key={item.id}
                disablePadding
                secondaryAction={
                  <IconButton edge="end" size="small" onClick={() => void removeFromQueue(item.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
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
                      // Zapamiętane miejsce mówi wprost, że odcinek jest w połowie
                      // — inaczej lista wygląda jak zbiór nietkniętych pozycji.
                      item.positionSec > 0 ? `wznów od ${formatTime(item.positionSec)}` : null,
                    ].filter(Boolean).join(' · ')}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {queue.length === 0 && (
              <ListItem>
                <ListItemText secondary="Dodaj odcinek przyciskiem obok jego tytułu." />
              </ListItem>
            )}
          </List>
        </Paper>
      </Grid>
    </Grid>
  );
}
