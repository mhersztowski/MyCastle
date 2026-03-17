import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, IconButton, TextField,
  Grid, CircularProgress, Divider, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  Add, Delete, Edit, ArrowUpward, ArrowDownward, ArrowBack,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { IotDeviceConfig } from '@mhersztowski/core';
import {
  loadDashboard2Config, saveDashboard2Config, makeId,
} from './dashboard2Config';
import type { Dashboard2Config, D2SectionConfig, D2CardConfig } from './dashboard2Config';

// ── Types ──────────────────────────────────────────────────────────────────

interface DeviceOption {
  deviceId: string;
  ownerUserId: string;
  config: IotDeviceConfig | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function swapItems<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ── Main page ──────────────────────────────────────────────────────────────

function IotDashboard2ConfigPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();

  const [config, setConfig] = useState<Dashboard2Config>({ sections: [] });
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);

  // Section rename inline editing
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Add Section dialog
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  // Add Card dialog
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addCardSectionId, setAddCardSectionId] = useState('');
  const [addCardCompositeDevice, setAddCardCompositeDevice] = useState(''); // "ownerUserId/deviceId"
  const [addCardEntityId, setAddCardEntityId] = useState('');
  const [addCardLabel, setAddCardLabel] = useState('');

  // Load config + devices
  useEffect(() => {
    if (!userName) return;
    setConfig(loadDashboard2Config(userName));

    const fetchDevices = async () => {
      try {
        const [allDevices, sharedDevices] = await Promise.all([
          minisApi.getUserDevices(userName),
          minisApi.getSharedDevices(userName),
        ]);
        const iotDevices = allDevices.filter((d: any) => d.isIot);
        const options: DeviceOption[] = await Promise.all([
          ...iotDevices.map(async (d: any) => {
            const cfg = await minisApi.getIotConfig(userName, d.name).catch(() => null);
            return { deviceId: d.name, ownerUserId: userName, config: cfg as IotDeviceConfig | null };
          }),
          ...sharedDevices.map(async (share: any) => {
            const cfg = await minisApi.getIotConfig(share.ownerUserId, share.deviceId).catch(() => null);
            return { deviceId: share.deviceId, ownerUserId: share.ownerUserId, config: cfg as IotDeviceConfig | null };
          }),
        ]);
        setDeviceOptions(options);
      } catch {}
      setLoadingDevices(false);
    };
    fetchDevices();
  }, [userName]);

  // Auto-save whenever config changes
  const updateConfig = useCallback((next: Dashboard2Config) => {
    setConfig(next);
    if (userName) saveDashboard2Config(userName, next);
  }, [userName]);

  // ── Section operations ────────────────────────────────────────────────

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) return;
    const section: D2SectionConfig = { id: makeId(), title: newSectionTitle.trim(), cards: [] };
    updateConfig({ ...config, sections: [...config.sections, section] });
    setNewSectionTitle('');
    setAddSectionOpen(false);
  };

  const handleRenameSection = (sectionId: string) => {
    if (!editingTitle.trim()) return;
    updateConfig({
      ...config,
      sections: config.sections.map((s) => s.id === sectionId ? { ...s, title: editingTitle.trim() } : s),
    });
    setEditingSectionId(null);
  };

  const handleRemoveSection = (sectionId: string) => {
    updateConfig({ ...config, sections: config.sections.filter((s) => s.id !== sectionId) });
  };

  const handleMoveSection = (index: number, dir: -1 | 1) => {
    updateConfig({ ...config, sections: swapItems(config.sections, index, index + dir) });
  };

  // ── Card operations ───────────────────────────────────────────────────

  const openAddCard = (sectionId: string) => {
    setAddCardSectionId(sectionId);
    setAddCardCompositeDevice('');
    setAddCardEntityId('');
    setAddCardLabel('');
    setAddCardOpen(true);
  };

  const handleAddCard = () => {
    if (!addCardSectionId || !addCardCompositeDevice || !addCardEntityId) return;
    const [ownerUserId, deviceId] = addCardCompositeDevice.split('/');
    const card: D2CardConfig = {
      id: makeId(),
      deviceId,
      ownerUserId: ownerUserId !== userName ? ownerUserId : undefined,
      entityId: addCardEntityId,
      label: addCardLabel.trim() || undefined,
    };
    updateConfig({
      ...config,
      sections: config.sections.map((s) =>
        s.id === addCardSectionId ? { ...s, cards: [...s.cards, card] } : s
      ),
    });
    setAddCardOpen(false);
  };

  const handleRemoveCard = (sectionId: string, cardId: string) => {
    updateConfig({
      ...config,
      sections: config.sections.map((s) =>
        s.id === sectionId ? { ...s, cards: s.cards.filter((c) => c.id !== cardId) } : s
      ),
    });
  };

  const handleMoveCard = (sectionId: string, index: number, dir: -1 | 1) => {
    updateConfig({
      ...config,
      sections: config.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return { ...s, cards: swapItems(s.cards, index, index + dir) };
      }),
    });
  };

  // ── Derived data for Add Card dialog ──────────────────────────────────

  const selectedDevice = deviceOptions.find(
    (d) => `${d.ownerUserId}/${d.deviceId}` === addCardCompositeDevice
  );
  const availableEntities = selectedDevice?.config?.entities ?? [];

  const getCardDisplayLabel = (card: D2CardConfig): string => {
    if (card.label) return card.label;
    const owner = card.ownerUserId ?? userName ?? '';
    const opt = deviceOptions.find((d) => d.deviceId === card.deviceId && d.ownerUserId === owner);
    return opt?.config?.entities?.find((e) => e.id === card.entityId)?.name ?? card.entityId;
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Dashboard Settings</Typography>
        <Button
          startIcon={<ArrowBack />}
          size="small"
          onClick={() => navigate(`/user/${userName}/iot/dashboard2`)}
        >
          Back to Dashboard
        </Button>
      </Box>

      {loadingDevices && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">Loading devices…</Typography>
        </Box>
      )}

      {/* Section list */}
      {config.sections.map((section, sIdx) => (
        <Paper key={section.id} sx={{ p: 2, mb: 2 }}>
          {/* Section header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            {editingSectionId === section.id ? (
              <>
                <TextField
                  size="small"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSection(section.id);
                    if (e.key === 'Escape') setEditingSectionId(null);
                  }}
                  autoFocus
                  sx={{ flex: 1 }}
                />
                <Button size="small" variant="contained" onClick={() => handleRenameSection(section.id)}>
                  Save
                </Button>
                <Button size="small" onClick={() => setEditingSectionId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                  {section.title}
                </Typography>
                <Tooltip title="Rename">
                  <IconButton
                    size="small"
                    onClick={() => { setEditingSectionId(section.id); setEditingTitle(section.title); }}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Move up">
                  <span>
                    <IconButton size="small" disabled={sIdx === 0} onClick={() => handleMoveSection(sIdx, -1)}>
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span>
                    <IconButton
                      size="small"
                      disabled={sIdx === config.sections.length - 1}
                      onClick={() => handleMoveSection(sIdx, 1)}
                    >
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove section">
                  <IconButton size="small" color="error" onClick={() => handleRemoveSection(section.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>

          <Divider sx={{ mb: 1.5 }} />

          {/* Cards */}
          {section.cards.length > 0 && (
            <Grid container spacing={1} sx={{ mb: 1.5 }}>
              {section.cards.map((card, cIdx) => (
                <Grid item xs={12} sm={6} md={4} key={card.id}>
                  <Paper
                    variant="outlined"
                    sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: 1.5 }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                        {getCardDisplayLabel(card)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {card.deviceId} · {card.entityId}
                        {card.ownerUserId && ` · shared by ${card.ownerUserId}`}
                      </Typography>
                    </Box>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton
                          size="small"
                          disabled={cIdx === 0}
                          onClick={() => handleMoveCard(section.id, cIdx, -1)}
                        >
                          <ArrowUpward sx={{ fontSize: 14 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          disabled={cIdx === section.cards.length - 1}
                          onClick={() => handleMoveCard(section.id, cIdx, 1)}
                        >
                          <ArrowDownward sx={{ fontSize: 14 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Remove card">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveCard(section.id, card.id)}
                      >
                        <Delete sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          )}

          {section.cards.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              No cards yet.
            </Typography>
          )}

          <Button
            size="small"
            startIcon={<Add />}
            onClick={() => openAddCard(section.id)}
            disabled={loadingDevices || deviceOptions.length === 0}
          >
            Add Card
          </Button>
        </Paper>
      ))}

      {/* Add Section button */}
      <Button
        variant="outlined"
        startIcon={<Add />}
        onClick={() => { setNewSectionTitle(''); setAddSectionOpen(true); }}
      >
        Add Section
      </Button>

      {/* ── Add Section dialog ─────────────────────────────────────────── */}
      <Dialog open={addSectionOpen} onClose={() => setAddSectionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Section</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Section name"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSection()}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddSectionOpen(false)}>Cancel</Button>
          <Button onClick={handleAddSection} variant="contained" disabled={!newSectionTitle.trim()}>
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Add Card dialog ────────────────────────────────────────────── */}
      <Dialog open={addCardOpen} onClose={() => setAddCardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Card</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Device</InputLabel>
            <Select
              value={addCardCompositeDevice}
              label="Device"
              onChange={(e) => {
                setAddCardCompositeDevice(e.target.value as string);
                setAddCardEntityId('');
              }}
            >
              {deviceOptions.map((d) => {
                const key = `${d.ownerUserId}/${d.deviceId}`;
                const suffix = d.ownerUserId !== userName ? ` (shared by ${d.ownerUserId})` : '';
                return (
                  <MenuItem key={key} value={key}>
                    {d.deviceId}{suffix}
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small" disabled={!addCardCompositeDevice}>
            <InputLabel>Entity</InputLabel>
            <Select
              value={addCardEntityId}
              label="Entity"
              onChange={(e) => setAddCardEntityId(e.target.value as string)}
            >
              {availableEntities.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name} <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>({e.type})</Typography>
                </MenuItem>
              ))}
              {addCardCompositeDevice && availableEntities.length === 0 && (
                <MenuItem disabled>No entities configured on this device</MenuItem>
              )}
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Custom label (optional)"
            value={addCardLabel}
            onChange={(e) => setAddCardLabel(e.target.value)}
            fullWidth
            helperText="Leave empty to use the entity name"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCardOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddCard}
            variant="contained"
            disabled={!addCardCompositeDevice || !addCardEntityId}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default IotDashboard2ConfigPage;
