import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, IconButton, TextField, MenuItem,
  Select, FormControl, InputLabel, CircularProgress, Alert, Divider,
  Stack, Chip, Dialog, DialogTitle, DialogContent, List, ListItemButton,
  ListItemText, ListItemIcon, Accordion, AccordionSummary, AccordionDetails,
  Tooltip, FormControlLabel, Checkbox,
} from '@mui/material';
import { Add, Delete, ArrowUpward, ArrowDownward, Save, Image as ImageIcon, FolderOpen, ExpandMore, Photo } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import type { SmartDisplayConfig, SmartDisplayView, SmartDisplayViewType } from '@mhersztowski/core';
import { DEFAULT_SMART_DISPLAY_CONFIG } from '@mhersztowski/core';
import { minisApi } from '../../../services/MinisApiService';

const VIEW_TYPE_LABELS: Record<SmartDisplayViewType, string> = {
  clock:          'Clock',
  text:           'Text',
  metric:         'Metric',
  image:          'Image',
  'random-image': 'Random Image',
  weather:        'Weather',
};

async function fetchDataFiles(): Promise<string[]> {
  const res = await fetch('/api/data-files');
  if (!res.ok) return [];
  const data = await res.json();
  return data.files ?? [];
}

function ImagePickerDialog({ current, onSelect, onClose }: {
  current: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDataFiles().then(f => { setFiles(f); setLoading(false); });
  }, []);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Select image</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {loading && <Box sx={{ p: 2 }}><CircularProgress size={24} /></Box>}
        {!loading && files.length === 0 && (
          <Typography sx={{ p: 2 }} color="text.secondary">No image files found in data directory.</Typography>
        )}
        <List dense>
          {files.map((f) => (
            <ListItemButton key={f} selected={f === current} onClick={() => { onSelect(f); onClose(); }}>
              <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={f} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}

const CYCLE_OPTIONS = [
  { value: 60_000,       label: '1 minute' },
  { value: 300_000,      label: '5 minutes' },
  { value: 900_000,      label: '15 minutes' },
  { value: 1_800_000,    label: '30 minutes' },
  { value: 3_600_000,    label: '1 hour' },
];

function ViewRow({
  view,
  index,
  total,
  onChange,
  onDelete,
  onMove,
}: {
  view: SmartDisplayView;
  index: number;
  total: number;
  onChange: (v: SmartDisplayView) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        {/* Order */}
        <Stack direction="column" justifyContent="center">
          <IconButton size="small" onClick={() => onMove(-1)} disabled={index === 0}><ArrowUpward fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => onMove(1)} disabled={index === total - 1}><ArrowDownward fontSize="small" /></IconButton>
        </Stack>

        {/* Type */}
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Type</InputLabel>
          <Select
            value={view.type}
            label="Type"
            onChange={(e) => onChange({ ...view, type: e.target.value as SmartDisplayViewType })}
          >
            {Object.entries(VIEW_TYPE_LABELS).map(([v, l]) => (
              <MenuItem key={v} value={v}>{l}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Label */}
        <TextField
          size="small"
          label="Label"
          value={view.label ?? ''}
          onChange={(e) => onChange({ ...view, label: e.target.value })}
          sx={{ width: 160 }}
        />

        {/* Type-specific fields */}
        {view.type === 'text' && (
          <>
            <TextField
              size="small"
              label="Text"
              value={view.text ?? ''}
              onChange={(e) => onChange({ ...view, text: e.target.value })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Subtext"
              value={view.subtext ?? ''}
              onChange={(e) => onChange({ ...view, subtext: e.target.value })}
              sx={{ flex: 1 }}
            />
          </>
        )}
        {view.type === 'metric' && (
          <>
            <TextField
              size="small"
              label="Device"
              value={view.metricDevice ?? ''}
              onChange={(e) => onChange({ ...view, metricDevice: e.target.value })}
              sx={{ width: 180 }}
              placeholder="(this device)"
            />
            <TextField
              size="small"
              label="Metric key"
              value={view.metricKey ?? ''}
              onChange={(e) => onChange({ ...view, metricKey: e.target.value })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Unit"
              value={view.metricUnit ?? ''}
              onChange={(e) => onChange({ ...view, metricUnit: e.target.value })}
              sx={{ width: 80 }}
            />
          </>
        )}
        {view.type === 'random-image' && (
          <>
          <TextField
            size="small"
            label="Immich shared album URL"
            value={view.albumShareUrl ?? ''}
            onChange={(e) => onChange({ ...view, albumShareUrl: e.target.value })}
            sx={{ flex: 1 }}
            placeholder="https://photos.example.com/share/xyz"
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={view.ttsDescription ?? false}
                onChange={(e) => onChange({ ...view, ttsDescription: e.target.checked })}
              />
            }
            label="TTS description"
            sx={{ whiteSpace: 'nowrap' }}
          />
          </>
        )}
        {view.type === 'weather' && (
          <>
            <TextField
              size="small"
              label="Location name"
              value={view.weatherLocationName ?? ''}
              onChange={(e) => onChange({ ...view, weatherLocationName: e.target.value })}
              sx={{ width: 180 }}
              placeholder="Warsaw"
            />
            <TextField
              size="small"
              label="Latitude"
              type="number"
              value={view.weatherLat ?? ''}
              onChange={(e) => onChange({ ...view, weatherLat: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
              sx={{ width: 100 }}
              placeholder="52.23"
            />
            <TextField
              size="small"
              label="Longitude"
              type="number"
              value={view.weatherLon ?? ''}
              onChange={(e) => onChange({ ...view, weatherLon: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
              sx={{ width: 100 }}
              placeholder="21.01"
            />
          </>
        )}
        {view.type === 'clock' && <Box sx={{ flex: 1 }} />}
        {view.type === 'image' && (
          <>
            <TextField
              size="small"
              label="Image path"
              value={view.imagePath ?? ''}
              onChange={(e) => onChange({ ...view, imagePath: e.target.value })}
              sx={{ flex: 1 }}
              placeholder="Public/photo.jpg"
            />
            <Button
              size="small"
              startIcon={<FolderOpen />}
              variant="outlined"
              onClick={() => setPickerOpen(true)}
            >
              Browse
            </Button>
            {pickerOpen && (
              <ImagePickerDialog
                current={view.imagePath ?? ''}
                onSelect={(p) => onChange({ ...view, imagePath: p })}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </>
        )}

        <IconButton color="error" onClick={onDelete}><Delete /></IconButton>
      </Stack>
    </Paper>
  );
}

// --- Immich integration ---

interface ImmichAlbum {
  id: string;
  albumName: string;
  albumThumbnailAssetId: string | null;
  assetCount: number;
}

interface ImmichAsset {
  id: string;
  originalFileName: string;
  type: 'IMAGE' | 'VIDEO';
}

function ImmichThumbnail({ serverUrl, assetId, accessToken, size = 90 }: {
  serverUrl: string; assetId: string; accessToken: string; size?: number;
}) {
  const src = `/api/immich/assets/${assetId}/thumbnail?immichUrl=${encodeURIComponent(serverUrl)}&accessToken=${encodeURIComponent(accessToken)}&size=thumbnail`;

  return <Box component="img" src={src} sx={{ width: size, height: size, objectFit: 'cover', borderRadius: 1, display: 'block' }} />;
}

function ImmichSection({ onAddView }: { onAddView: (view: SmartDisplayView) => void }) {
  const [serverUrl, setServerUrl] = useState('https://photos.hersztowski.org');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [albums, setAlbums] = useState<ImmichAlbum[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<ImmichAlbum | null>(null);
  const [assets, setAssets] = useState<ImmichAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const connect = async () => {
    setConnecting(true);
    setConnError(null);
    try {
      const loginResp = await fetch('/api/immich/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immichUrl: serverUrl, email, password }),
      });
      if (!loginResp.ok) throw new Error(`Login failed (${loginResp.status})`);
      const { accessToken: token } = await loginResp.json();

      const qs = `immichUrl=${encodeURIComponent(serverUrl)}&accessToken=${encodeURIComponent(token)}`;
      const albumsResp = await fetch(`/api/immich/albums?${qs}`);
      if (!albumsResp.ok) throw new Error(`Albums fetch failed (${albumsResp.status})`);
      const albumsData: ImmichAlbum[] = await albumsResp.json();

      setAccessToken(token);
      setAlbums(albumsData.sort((a, b) => a.albumName.localeCompare(b.albumName)));
      setSelectedAlbum(null);
      setAssets([]);
    } catch (e) {
      setConnError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const openAlbum = async (album: ImmichAlbum) => {
    setSelectedAlbum(album);
    setLoadingAssets(true);
    setAssets([]);
    try {
      const qs = `immichUrl=${encodeURIComponent(serverUrl)}&accessToken=${encodeURIComponent(accessToken)}`;
      const resp = await fetch(`/api/immich/albums/${album.id}?${qs}`);
      if (!resp.ok) throw new Error(`Album load failed (${resp.status})`);
      const data = await resp.json();
      setAssets((data.assets as ImmichAsset[]).filter(a => a.type === 'IMAGE'));
    } catch (e) {
      setConnError(e instanceof Error ? e.message : 'Failed to load album');
    } finally {
      setLoadingAssets(false);
    }
  };

  const usePhoto = async (asset: ImmichAsset) => {
    setDownloading(asset.id);
    setConnError(null);
    try {
      const resp = await fetch('/api/immich/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immichUrl: serverUrl, assetId: asset.id, accessToken }),
      });
      if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
      const { path: imgPath } = await resp.json();
      onAddView({
        id: crypto.randomUUID(),
        type: 'image',
        label: asset.originalFileName.replace(/\.[^.]+$/, ''),
        imagePath: imgPath,
      });
    } catch (e) {
      setConnError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Accordion sx={{ mt: 3 }}>
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Photo fontSize="small" />
          <Typography variant="h6">Photos (Immich)</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" sx={{ mb: 2 }}>
          <TextField
            size="small"
            label="Server URL"
            value={serverUrl}
            onChange={e => setServerUrl(e.target.value)}
            sx={{ width: 280 }}
          />
          <TextField
            size="small"
            label="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            sx={{ width: 200 }}
          />
          <TextField
            size="small"
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            sx={{ width: 160 }}
          />
          <Button
            variant="outlined"
            onClick={connect}
            disabled={connecting || !email || !password}
            startIcon={connecting ? <CircularProgress size={16} /> : undefined}
          >
            {accessToken ? 'Reconnect' : 'Connect'}
          </Button>
        </Stack>

        {connError && <Alert severity="error" sx={{ mb: 2 }}>{connError}</Alert>}

        {accessToken && !selectedAlbum && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {albums.length} album{albums.length !== 1 ? 's' : ''}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {albums.map(album => (
                <Tooltip key={album.id} title={`${album.assetCount} photos`}>
                  <Box onClick={() => openAlbum(album)} sx={{ cursor: 'pointer', width: 90, textAlign: 'center' }}>
                    {album.albumThumbnailAssetId ? (
                      <ImmichThumbnail serverUrl={serverUrl} assetId={album.albumThumbnailAssetId} accessToken={accessToken} />
                    ) : (
                      <Box sx={{ width: 90, height: 90, bgcolor: 'grey.800', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ImageIcon color="disabled" />
                      </Box>
                    )}
                    <Typography variant="caption" noWrap sx={{ display: 'block', mt: 0.5 }}>{album.albumName}</Typography>
                    <Typography variant="caption" color="text.secondary">{album.assetCount}</Typography>
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </>
        )}

        {accessToken && selectedAlbum && (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
              <Button size="small" onClick={() => { setSelectedAlbum(null); setAssets([]); }}>← Albums</Button>
              <Typography variant="body2" color="text.secondary">
                {selectedAlbum.albumName} — {assets.length} photo{assets.length !== 1 ? 's' : ''}
              </Typography>
              {loadingAssets && <CircularProgress size={18} />}
            </Stack>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {assets.map(asset => (
                <Tooltip key={asset.id} title={`Add: ${asset.originalFileName}`}>
                  <Box sx={{ position: 'relative', width: 90, height: 90 }}>
                    <ImmichThumbnail serverUrl={serverUrl} assetId={asset.id} accessToken={accessToken} />
                    <Box
                      onClick={() => !downloading && usePhoto(asset)}
                      sx={{
                        position: 'absolute', inset: 0, borderRadius: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: 'rgba(0,0,0,0.55)',
                        opacity: 0, transition: 'opacity .15s',
                        cursor: downloading ? 'default' : 'pointer',
                        '&:hover': { opacity: 1 },
                      }}
                    >
                      {downloading === asset.id
                        ? <CircularProgress size={24} sx={{ color: 'white' }} />
                        : <Add sx={{ color: 'white' }} />}
                    </Box>
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function SmartDisplayPage() {
  const { userName, deviceName } = useParams<{ userName: string; deviceName: string }>();
  const [config, setConfig] = useState<SmartDisplayConfig>(DEFAULT_SMART_DISPLAY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);

  const save = useCallback(async (cfg: SmartDisplayConfig) => {
    if (!userName || !deviceName) return;
    setSaving(true);
    try {
      await minisApi.saveSmartDisplayConfig(userName, deviceName, cfg);
      setSavedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [userName, deviceName]);

  // Auto-save with 800ms debounce on every config change after first load
  const updateConfig = useCallback((next: SmartDisplayConfig) => {
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 800);
  }, [save]);

  useEffect(() => {
    if (!userName || !deviceName) return;
    minisApi.getSmartDisplayConfig(userName, deviceName)
      .then((cfg) => { setConfig(cfg); isFirstLoad.current = false; })
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [userName, deviceName]);

  const addView = (view: SmartDisplayView = { id: crypto.randomUUID(), type: 'clock' }) => {
    updateConfig({ ...config, views: [...config.views, view] });
  };

  const updateView = (index: number, view: SmartDisplayView) => {
    const views = [...config.views];
    views[index] = view;
    updateConfig({ ...config, views });
  };

  const deleteView = (index: number) => {
    updateConfig({ ...config, views: config.views.filter((_, i) => i !== index) });
  };

  const moveView = (index: number, dir: -1 | 1) => {
    const views = [...config.views];
    const target = index + dir;
    if (target < 0 || target >= views.length) return;
    [views[index], views[target]] = [views[target], views[index]];
    updateConfig({ ...config, views });
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Smart Display — {deviceName}</Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          {saving && <CircularProgress size={18} />}
          {savedAt && !saving && <Chip label={`Saved ${savedAt.toLocaleTimeString()}`} size="small" color="success" variant="outlined" />}
          <Button startIcon={<Save />} variant="outlined" onClick={() => save(config)} disabled={saving}>
            Save now
          </Button>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Cycle duration</Typography>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Duration per view</InputLabel>
          <Select
            value={config.cycleDurationMs}
            label="Duration per view"
            onChange={(e) => updateConfig({ ...config, cycleDurationMs: Number(e.target.value) })}
          >
            {CYCLE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Views ({config.views.length})</Typography>
          <Button startIcon={<Add />} variant="contained" onClick={() => addView()}>Add view</Button>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={1.5}>
          {config.views.length === 0 && (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No views defined. Add a view to start the cycle.
            </Typography>
          )}
          {config.views.map((view, i) => (
            <ViewRow
              key={view.id}
              view={view}
              index={i}
              total={config.views.length}
              onChange={(v) => updateView(i, v)}
              onDelete={() => deleteView(i)}
              onMove={(dir) => moveView(i, dir)}
            />
          ))}
        </Stack>
      </Paper>
      <ImmichSection onAddView={addView} />
    </Box>
  );
}

export default SmartDisplayPage;
