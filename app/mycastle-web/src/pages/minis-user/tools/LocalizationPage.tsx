import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, CircularProgress,
  Stack, Chip, Divider, FormControlLabel, Checkbox,
  Accordion, AccordionSummary, AccordionDetails, Select, MenuItem, InputLabel, FormControl,
  Popover,
} from '@mui/material';
import { Add, Edit, Delete, ExpandMore, SmartToy, InfoOutlined } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { useParams } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { MinisLocalizationModel, MinisDeviceModel } from '@mhersztowski/core';

interface LocalizationForm {
  name: string;
  typ: 'place' | 'geo';
  place: string;
  lat: string;
  lon: string;
  device: string;
}

const emptyForm = (deviceName = ''): LocalizationForm => ({
  name: '',
  typ: 'place',
  place: '',
  lat: '',
  lon: '',
  device: deviceName,
});

function formFromModel(loc: MinisLocalizationModel): LocalizationForm {
  return {
    name: loc.name,
    typ: loc.typ,
    place: loc.place ?? '',
    lat: loc.geo?.lat.toString() ?? '',
    lon: loc.geo?.lon.toString() ?? '',
    device: loc.device,
  };
}

function buildModel(form: LocalizationForm): Omit<MinisLocalizationModel, 'type' | 'id'> {
  return {
    name: form.name,
    typ: form.typ,
    place: form.typ === 'place' ? form.place || null : null,
    geo: form.typ === 'geo'
      ? { lat: parseFloat(form.lat) || 0, lon: parseFloat(form.lon) || 0 }
      : null,
    device: form.device,
  };
}

interface LocFormFieldsProps {
  form: LocalizationForm;
  devices: MinisDeviceModel[];
  onChange: (f: LocalizationForm) => void;
  showDevice?: boolean;
}

function LocFormFields({ form, devices, onChange, showDevice = true }: LocFormFieldsProps) {
  return (
    <>
      {showDevice && (
        <TextField
          fullWidth select label="Device" value={form.device}
          onChange={(e) => {
            const deviceId = e.target.value;
            const deviceName = devices.find((d) => d.id === deviceId)?.name ?? '';
            onChange({ ...form, device: deviceId, name: form.name || deviceName });
          }}
          sx={{ mt: 1, mb: 2 }}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ native: true }}
        >
          <option value=""></option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </TextField>
      )}
      <TextField
        fullWidth label="Location Name" value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth select label="Type" value={form.typ}
        onChange={(e) => onChange({ ...form, typ: e.target.value as 'place' | 'geo' })}
        sx={{ mb: 2 }}
        InputLabelProps={{ shrink: true }}
        SelectProps={{ native: true }}
      >
        <option value="place">Place</option>
        <option value="geo">Geo</option>
      </TextField>
      {form.typ === 'place' && (
        <TextField
          fullWidth label="Place" value={form.place}
          onChange={(e) => onChange({ ...form, place: e.target.value })}
          sx={{ mb: 2 }}
        />
      )}
      {form.typ === 'geo' && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField fullWidth label="Latitude" value={form.lat} type="number"
            onChange={(e) => onChange({ ...form, lat: e.target.value })} />
          <TextField fullWidth label="Longitude" value={form.lon} type="number"
            onChange={(e) => onChange({ ...form, lon: e.target.value })} />
        </Stack>
      )}
    </>
  );
}

function LocalizationPage() {
  const { userName } = useParams<{ userName: string }>();
  const [localizations, setLocalizations] = useState<MinisLocalizationModel[]>([]);
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<LocalizationForm>(emptyForm());
  const [addSaving, setAddSaving] = useState(false);

  const [editLoc, setEditLoc] = useState<MinisLocalizationModel | null>(null);
  const [editForm, setEditForm] = useState<LocalizationForm>(emptyForm());
  const [editSaving, setEditSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const [filterType, setFilterType] = useState<'all' | 'place' | 'geo'>('all');
  const [filterName, setFilterName] = useState('');
  const [groupByPlace, setGroupByPlace] = useState(false);

  const [aiModel, setAiModel] = useState<'openai' | 'anthropic'>(() =>
    (localStorage.getItem('loc-ai-model') as 'openai' | 'anthropic') ?? 'openai');
  const [aiKey, setAiKey] = useState(() => localStorage.getItem('loc-ai-key') ?? '');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMatchIds, setAiMatchIds] = useState<Set<string> | null>(null);

  const [descAnchor, setDescAnchor] = useState<HTMLElement | null>(null);
  const [descText, setDescText] = useState('');

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [locs, devs] = await Promise.all([
        minisApi.getLocalizations(userName),
        minisApi.getUserDevices(userName),
      ]);
      setLocalizations(locs);
      setDevices(devs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!userName) return;
    setAddSaving(true);
    try {
      const created = await minisApi.createLocalization(userName, buildModel(addForm));
      // assign localizationId to the device
      if (addForm.device) {
        const devName = devices.find((d) => d.id === addForm.device)?.name;
        if (devName) await minisApi.updateUserDevice(userName, devName, { localizationId: created.id });
      }
      setAddOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setAddSaving(false);
    }
  };

  const openEdit = (loc: MinisLocalizationModel) => {
    setEditLoc(loc);
    setEditForm(formFromModel(loc));
  };

  const handleEdit = async () => {
    if (!userName || !editLoc) return;
    setEditSaving(true);
    try {
      const updated = buildModel(editForm);
      // if device changed, update old device to remove localizationId and new device to set it
      if (editForm.device !== editLoc.device) {
        if (editLoc.device) {
          const oldName = devices.find((d) => d.id === editLoc.device)?.name;
          if (oldName) await minisApi.updateUserDevice(userName, oldName, { localizationId: undefined });
        }
        if (editForm.device) {
          const newName = devices.find((d) => d.id === editForm.device)?.name;
          if (newName) await minisApi.updateUserDevice(userName, newName, { localizationId: editLoc.id });
        }
      }
      await minisApi.updateLocalization(userName, editLoc.id, updated);
      setEditLoc(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!userName || !deleteId) return;
    setDeleteSaving(true);
    try {
      const loc = localizations.find((l) => l.id === deleteId);
      // remove localizationId from the device it was attached to
      if (loc?.device) {
        const devName = devices.find((d) => d.id === loc.device)?.name;
        if (devName) await minisApi.updateUserDevice(userName, devName, { localizationId: undefined });
      }
      await minisApi.deleteLocalization(userName, deleteId);
      setDeleteId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleteSaving(false);
    }
  };

  const getDeviceName = (deviceId: string) => devices.find((d) => d.id === deviceId)?.name ?? deviceId;

  const buildAiContext = () => {
    return localizations.map((loc) => {
      const dev = devices.find((d) => d.id === loc.device);
      const lines = [
        `ID: ${loc.id}`,
        `Name: ${loc.name}`,
        `Type: ${loc.typ}`,
        loc.place ? `Place: ${loc.place}` : null,
        loc.geo ? `Geo: lat=${loc.geo.lat}, lon=${loc.geo.lon}` : null,
        `Device: ${loc.device}`,
        dev ? `Device SN: ${dev.sn || '—'}` : null,
        dev?.description ? `Device description: ${dev.description}` : null,
        dev ? `Device assembled: ${dev.isAssembled}, IoT: ${dev.isIot}` : null,
      ].filter(Boolean).join(', ');
      return lines;
    }).join('\n');
  };

  const handleAiSearch = async () => {
    if (!aiPrompt.trim() || !aiKey.trim()) return;
    localStorage.setItem('loc-ai-key', aiKey);
    localStorage.setItem('loc-ai-model', aiModel);
    setAiSearching(true);
    setAiError(null);
    setAiMatchIds(null);
    try {
      const context = buildAiContext();
      const systemPrompt = `You are a search assistant. You will be given a list of localizations (each with device data) and a user query. Return ONLY a JSON array of matching localization IDs (strings). If nothing matches, return an empty array []. Do not explain, just return the JSON array.`;
      const userPrompt = `Localizations:\n${context}\n\nQuery: ${aiPrompt.trim()}`;
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JSON.parse(sessionStorage.getItem('minis_current_user') ?? '{}').token ?? ''}` },
        body: JSON.stringify({ model: aiModel, apiKey: aiKey, systemPrompt, userPrompt }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'AI error');
      const jsonMatch = data.result?.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) throw new Error('AI did not return a valid JSON array');
      const ids: string[] = JSON.parse(jsonMatch[0]);
      setAiMatchIds(new Set(ids));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI search failed');
    } finally {
      setAiSearching(false);
    }
  };

  const filtered = localizations.filter((loc) => {
    if (aiMatchIds !== null && !aiMatchIds.has(loc.id)) return false;
    if (filterType !== 'all' && loc.typ !== filterType) return false;
    if (filterName) {
      const q = filterName.toLowerCase();
      const placeMatch = loc.place?.toLowerCase().includes(q) ?? false;
      if (!loc.name.toLowerCase().includes(q) && !placeMatch) return false;
    }
    return true;
  });

  const groups = filtered.reduce<Record<string, MinisLocalizationModel[]>>((acc, loc) => {
    const key = groupByPlace ? (loc.place ?? '') : '__all__';
    (acc[key] = acc[key] ?? []).push(loc);
    return acc;
  }, {});
  const groupKeys = groupByPlace
    ? Object.keys(groups).sort((a, b) => {
        if (a === '') return 1;
        if (b === '') return -1;
        return a.localeCompare(b);
      })
    : Object.keys(groups);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Localizations</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setAddForm(emptyForm()); setAddOpen(true); }}>
          Add Localization
        </Button>
      </Box>

      <Accordion sx={{ mb: 2 }} disableGutters>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartToy fontSize="small" />
            <Typography variant="subtitle2">AI Search</Typography>
            {aiMatchIds !== null && (
              <Chip size="small" color="primary" label={`${aiMatchIds.size} match${aiMatchIds.size !== 1 ? 'es' : ''}`} />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Model</InputLabel>
                <Select value={aiModel} label="Model"
                  onChange={(e) => setAiModel(e.target.value as 'openai' | 'anthropic')}>
                  <MenuItem value="openai">OpenAI (gpt-4o-mini)</MenuItem>
                  <MenuItem value="anthropic">Anthropic (haiku)</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" label="API Key" type="password" value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                sx={{ flexGrow: 1 }}
                inputProps={{ autoComplete: 'off' }}
              />
            </Stack>
            <TextField
              size="small" multiline minRows={2} fullWidth
              label="Prompt — describe what you're looking for"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              helperText={`Context sent to AI: ${localizations.length} localizations with device data (name, place, geo, device SN, description)`}
            />
            {aiError && <Alert severity="error">{aiError}</Alert>}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="small" startIcon={aiSearching ? <CircularProgress size={14} color="inherit" /> : <SmartToy />}
                onClick={handleAiSearch} disabled={aiSearching || !aiPrompt.trim() || !aiKey.trim()}>
                {aiSearching ? 'Searching…' : 'Search'}
              </Button>
              {aiMatchIds !== null && (
                <Button size="small" onClick={() => setAiMatchIds(null)}>Clear AI filter</Button>
              )}
            </Stack>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems="center">
        <TextField
          label="Filter by name / place" size="small" value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <TextField
          select label="Type" size="small" value={filterType}
          onChange={(e) => setFilterType(e.target.value as 'all' | 'place' | 'geo')}
          InputLabelProps={{ shrink: true }}
          SelectProps={{ native: true }}
          sx={{ minWidth: 120 }}
        >
          <option value="all">All</option>
          <option value="place">Place</option>
          <option value="geo">Geo</option>
        </TextField>
        <FormControlLabel
          control={<Checkbox checked={groupByPlace} onChange={(e) => setGroupByPlace(e.target.checked)} />}
          label="Group by Place"
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      {!loading && filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>No localizations yet</Typography>
      )}

      {groupKeys.map((groupKey, gi) => (
        <Box key={groupKey} sx={{ mb: 3 }}>
          {groupByPlace && (
            <>
              {gi > 0 && <Divider sx={{ mb: 2 }} />}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {groupKey || '(no place)'}
                </Typography>
                <Chip size="small" label={groups[groupKey].length} />
              </Box>
            </>
          )}
          <TableContainer component={Paper} variant={groupByPlace ? 'outlined' : 'elevation'}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Details</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups[groupKey].map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell>{loc.name}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {getDeviceName(loc.device)}
                        {(() => {
                          const dev = devices.find((d) => d.id === loc.device);
                          return dev?.description ? (
                            <IconButton size="small"
                              onClick={(e) => { e.stopPropagation(); setDescText(dev.description!); setDescAnchor(e.currentTarget); }}
                            >
                              <InfoOutlined fontSize="inherit" color="info" />
                            </IconButton>
                          ) : null;
                        })()}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={loc.typ === 'place' ? 'Place' : 'Geo'}
                        color={loc.typ === 'geo' ? 'info' : 'default'}
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {loc.typ === 'place' && (loc.place ?? '—')}
                      {loc.typ === 'geo' && loc.geo && `${loc.geo.lat}, ${loc.geo.lon}`}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" title="Edit" onClick={() => openEdit(loc)}><Edit /></IconButton>
                      <IconButton size="small" title="Delete" onClick={() => setDeleteId(loc.id)}><Delete /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}

      {/* Device description popover */}
      <Popover
        open={Boolean(descAnchor)}
        anchorEl={descAnchor}
        onClose={() => setDescAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { maxWidth: 420, maxHeight: 360, overflow: 'auto', p: 2 } }}
      >
        <Box sx={{
          '& h1,& h2,& h3': { mt: 1, mb: 0.5, fontSize: '1rem', fontWeight: 'bold' },
          '& p': { mt: 0, mb: 1 },
          '& ul,& ol': { pl: 2, mb: 1 },
          '& code': { fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
          '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto' },
        }}>
          <ReactMarkdown remarkPlugins={[remarkBreaks]}>{descText}</ReactMarkdown>
        </Box>
      </Popover>

      {/* Add Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Localization</DialogTitle>
        <DialogContent>
          <LocFormFields form={addForm} devices={devices} onChange={setAddForm} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={!addForm.name || addSaving}>
            {addSaving ? 'Saving...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editLoc} onClose={() => setEditLoc(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Localization — {editLoc?.name}</DialogTitle>
        <DialogContent>
          <LocFormFields form={editForm} devices={devices} onChange={setEditForm} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditLoc(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} disabled={!editForm.name || editSaving}>
            {editSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete Localization?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{localizations.find((l) => l.id === deleteId)?.name}</strong>?
            The device will lose its localization reference.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteSaving}>
            {deleteSaving ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LocalizationPage;
