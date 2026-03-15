import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControlLabel, Switch, Alert, CircularProgress,
  Select, MenuItem, InputLabel, FormControl, Stack,
  Drawer, Divider,
} from '@mui/material';
import { Delete, Add, Build, SmartToy, Share, LocationOn, Close, OpenInNew } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { UserPublic } from '../../services/MinisApiService';
import { DEVICE_PRESETS } from '@modules/iot-emulator';
import type { EmulatedDeviceConfig } from '@modules/iot-emulator';
import type { MinisDeviceModel, MinisDeviceDefModel, IotCapability, DeviceShare, MinisLocalizationModel } from '@mhersztowski/core';

const EMULATOR_STORAGE_KEY = 'minis-iot-emulator-configs';

interface FormData {
  name: string;
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
}

interface EditPanelForm {
  name: string;
  sn: string;
  description: string;
  isAssembled: boolean;
  isIot: boolean;
}

const emptyForm: FormData = { name: '', deviceDefId: '', isAssembled: true, isIot: false, sn: '' };

function getEmulatorConfigs(): EmulatedDeviceConfig[] {
  try {
    const raw = localStorage.getItem(EMULATOR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function UserDevicesPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<MinisDeviceModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [emulatorDeviceIds, setEmulatorDeviceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [emulatorDialogDevice, setEmulatorDialogDevice] = useState<MinisDeviceModel | null>(null);
  const [emulatorPreset, setEmulatorPreset] = useState('');
  const [emulatorSaving, setEmulatorSaving] = useState(false);
  const [shareDialogDevice, setShareDialogDevice] = useState<MinisDeviceModel | null>(null);
  const [shareDeviceShares, setShareDeviceShares] = useState<DeviceShare[]>([]);
  const [shareUsers, setShareUsers] = useState<UserPublic[]>([]);
  const [shareTargetUserId, setShareTargetUserId] = useState('');
  const [shareSaving, setShareSaving] = useState(false);
  const [sharedDeviceIds, setSharedDeviceIds] = useState<Set<string>>(new Set());
  const [sharedWithMe, setSharedWithMe] = useState<DeviceShare[]>([]);
  const [localizations, setLocalizations] = useState<MinisLocalizationModel[]>([]);
  const [editPanelDevice, setEditPanelDevice] = useState<MinisDeviceModel | null>(null);
  const [editPanelForm, setEditPanelForm] = useState<EditPanelForm>({ name: '', sn: '', description: '', isAssembled: true, isIot: false });
  const [editPanelSaving, setEditPanelSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [devices, defs, myShares, sharedDevices, locs] = await Promise.all([
        minisApi.getUserDevices(userName),
        minisApi.getDeviceDefs(),
        minisApi.getMyShares(userName),
        minisApi.getSharedDevices(userName),
        minisApi.getLocalizations(userName),
      ]);
      setItems(devices);
      setDeviceDefs(defs);
      setEmulatorDeviceIds(new Set(getEmulatorConfigs().map((c) => c.deviceId)));
      setSharedDeviceIds(new Set(myShares.map((s) => s.deviceId)));
      setSharedWithMe(sharedDevices);
      setLocalizations(locs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!userName) return;
    setSaving(true);
    try {
      await minisApi.createUserDevice(userName, {
        name: form.name,
        deviceDefId: form.deviceDefId,
        isAssembled: form.isAssembled,
        isIot: form.isIot,
        sn: form.sn,
      });
      setAddDialogOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddEmulator = async () => {
    if (!userName || !emulatorDialogDevice || !emulatorPreset) return;
    setEmulatorSaving(true);
    try {
      const preset = DEVICE_PRESETS[emulatorPreset];
      const device = emulatorDialogDevice;
      const deviceName = device.name || `${preset.name} (${device.id.slice(0, 8)})`;

      if (!device.name) {
        await minisApi.updateUserDevice(userName, device.name, { name: deviceName });
      }

      // Create IoT config with sensor capabilities from preset metrics
      const capabilities: IotCapability[] = preset.metrics.map((m) => ({
        type: 'sensor' as const,
        metricKey: m.key,
        unit: m.unit,
        label: m.key.charAt(0).toUpperCase() + m.key.slice(1).replace(/_/g, ' '),
      }));
      await minisApi.saveIotConfig(userName, device.name, {
        topicPrefix: `minis/${userName}/${device.name}`,
        heartbeatIntervalSec: preset.heartbeatIntervalSec,
        capabilities,
        entities: preset.entities ?? [],
      });

      const emulatorConfig: EmulatedDeviceConfig = {
        id: crypto.randomUUID(),
        deviceId: device.name,
        userId: userName,
        name: deviceName,
        metrics: structuredClone(preset.metrics),
        telemetryIntervalSec: preset.telemetryIntervalSec,
        heartbeatIntervalSec: preset.heartbeatIntervalSec,
        commandAckMode: 'auto-ack',
        commandAckDelaySec: 1,
        rssi: -50,
        battery: 100,
      };

      const existing = getEmulatorConfigs();
      existing.push(emulatorConfig);
      localStorage.setItem(EMULATOR_STORAGE_KEY, JSON.stringify(existing));

      setEmulatorDialogDevice(null);
      setEmulatorPreset('');
      navigate(`/user/${userName}/iot/emulator`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create emulator');
    } finally {
      setEmulatorSaving(false);
    }
  };

  const handleToggleAssembled = async (device: MinisDeviceModel) => {
    if (!userName) return;
    try {
      await minisApi.updateUserDevice(userName, device.name, { isAssembled: !device.isAssembled });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const openShareDialog = async (device: MinisDeviceModel) => {
    if (!userName) return;
    setShareDialogDevice(device);
    setShareTargetUserId('');
    try {
      const [shares, users] = await Promise.all([
        minisApi.getDeviceShares(userName, device.name),
        minisApi.getUsers(),
      ]);
      setShareDeviceShares(shares);
      setShareUsers(users.filter((u) => u.name !== userName));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    }
  };

  const handleAddShare = async () => {
    if (!userName || !shareDialogDevice || !shareTargetUserId) return;
    setShareSaving(true);
    try {
      const share = await minisApi.createDeviceShare(userName, shareDialogDevice.name, shareTargetUserId);
      setShareDeviceShares((prev) => [...prev, share]);
      setShareTargetUserId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setShareSaving(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!userName || !shareDialogDevice) return;
    try {
      await minisApi.deleteDeviceShare(userName, shareDialogDevice.name, shareId);
      setShareDeviceShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  const handleDelete = async (name: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteUserDevice(userName, name);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const openEditPanel = (device: MinisDeviceModel) => {
    setEditPanelDevice(device);
    setEditPanelForm({
      name: device.name,
      sn: device.sn,
      description: device.description ?? '',
      isAssembled: device.isAssembled,
      isIot: device.isIot,
    });
  };

  const handleEditPanelSave = async () => {
    if (!userName || !editPanelDevice) return;
    setEditPanelSaving(true);
    try {
      await minisApi.updateUserDevice(userName, editPanelDevice.name, {
        sn: editPanelForm.sn,
        description: editPanelForm.description || undefined,
        isAssembled: editPanelForm.isAssembled,
        isIot: editPanelForm.isIot,
      });
      setEditPanelDevice(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setEditPanelSaving(false);
    }
  };

  const getLocalization = (localizationId?: string) =>
    localizationId ? localizations.find((l) => l.id === localizationId) : undefined;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">My Devices</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => { setForm(emptyForm); setAddDialogOpen(true); }}>
          Add Device
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Serial Number</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Localization</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Last Build</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover sx={{ cursor: 'pointer' }}
                onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; openEditPanel(item); }}
              >
                <TableCell>{item.name || deviceDefs.find(d => d.id === item.deviceDefId)?.name || item.id.slice(0, 8)}</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{item.sn || '-'}</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  {(() => {
                    const loc = getLocalization(item.localizationId);
                    if (!loc) return '-';
                    if (loc.typ === 'place') return loc.place ? `${loc.name} (${loc.place})` : loc.name;
                    if (loc.geo) return `${loc.name} (${loc.geo.lat}, ${loc.geo.lon})`;
                    return loc.name;
                  })()}
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {item.lastBuild
                      ? <Chip
                          label={`${item.lastBuild.platform}${item.lastBuild.version ? ` v${item.lastBuild.version}` : ''}`}
                          color={item.lastBuild.success ? 'success' : 'error'}
                          size="small"
                          title={new Date(item.lastBuild.at).toLocaleString()}
                        />
                      : <Chip label="No build" size="small" />}
                    {item.lastBuild?.projectId && (
                      <IconButton
                        size="small"
                        title="Open project"
                        onClick={(e) => {
                          e.stopPropagation();
                          const route = item.lastBuild!.platform === 'micropython' ? 'upython-project' : 'project';
                          navigate(`/user/${userName}/${route}/${item.lastBuild!.projectId}?device=${item.name}`);
                        }}
                      >
                        <OpenInNew sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  {item.isIot && (
                    <IconButton size="small" title="Share device" onClick={() => openShareDialog(item)}>
                      <Share color={sharedDeviceIds.has(item.name) ? 'primary' : 'action'} />
                    </IconButton>
                  )}
                  {item.isIot && !emulatorDeviceIds.has(item.name) && (
                    <IconButton
                      size="small"
                      title="Add emulator"
                      onClick={() => { setEmulatorDialogDevice(item); setEmulatorPreset(''); }}
                    >
                      <SmartToy />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    title="Manage localization"
                    onClick={() => navigate(`/user/${userName}/localization`)}
                  >
                    <LocationOn color={item.localizationId ? 'primary' : 'action'} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title={item.isAssembled ? 'Mark as not assembled' : 'Mark as assembled'}
                    onClick={() => handleToggleAssembled(item)}
                  >
                    <Build color={item.isAssembled ? 'success' : 'action'} />
                  </IconButton>
                  <IconButton size="small" onClick={() => setDeleteConfirm(item.name)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">No devices yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Shared with me */}
      {sharedWithMe.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Shared with me</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Device</TableCell>
                  <TableCell>Owner</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sharedWithMe.map((share) => (
                  <TableRow key={share.id}>
                    <TableCell>{share.deviceId}</TableCell>
                    <TableCell>{share.ownerUserId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Edit Device Panel */}
      <Drawer anchor="right" open={!!editPanelDevice} onClose={() => setEditPanelDevice(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, p: 3 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{editPanelDevice?.name}</Typography>
          <IconButton onClick={() => setEditPanelDevice(null)}><Close /></IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <TextField fullWidth label="Device Name" value={editPanelForm.name} disabled sx={{ mb: 2 }}
          helperText="Name cannot be changed"
        />
        <TextField fullWidth label="Serial Number" value={editPanelForm.sn}
          onChange={(e) => setEditPanelForm((f) => ({ ...f, sn: e.target.value }))} sx={{ mb: 2 }} />
        <TextField fullWidth multiline minRows={4} label="Description (Markdown)" value={editPanelForm.description}
          onChange={(e) => setEditPanelForm((f) => ({ ...f, description: e.target.value }))} sx={{ mb: 2 }} />
        <FormControlLabel
          control={<Switch checked={editPanelForm.isAssembled}
            onChange={(e) => setEditPanelForm((f) => ({ ...f, isAssembled: e.target.checked }))} />}
          label="Assembled" sx={{ mb: 1, display: 'block' }}
        />
        <FormControlLabel
          control={<Switch checked={editPanelForm.isIot}
            onChange={(e) => setEditPanelForm((f) => ({ ...f, isIot: e.target.checked }))} />}
          label="IoT Device" sx={{ mb: 2, display: 'block' }}
        />
        {editPanelDevice?.lastBuild && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Last Build</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={`${editPanelDevice.lastBuild.platform}${editPanelDevice.lastBuild.version ? ` v${editPanelDevice.lastBuild.version}` : ''}`}
                color={editPanelDevice.lastBuild.success ? 'success' : 'error'}
                size="small"
              />
              {editPanelDevice.lastBuild.fqbn && (
                <Chip label={editPanelDevice.lastBuild.fqbn} size="small" variant="outlined" />
              )}
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {new Date(editPanelDevice.lastBuild.at).toLocaleString()}
              </Typography>
            </Box>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={() => setEditPanelDevice(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditPanelSave} disabled={editPanelSaving}>
            {editPanelSaving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </Drawer>

      {/* Add Device Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Device</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth select label="Device Definition" value={form.deviceDefId}
            onChange={(e) => {
              const defId = e.target.value;
              const defName = deviceDefs.find((d) => d.id === defId)?.name ?? '';
              const autoName = defName && form.sn ? `${defName}-${form.sn}` : defName;
              setForm((f) => ({ ...f, deviceDefId: defId, name: autoName || f.name }));
            }}
            sx={{ mt: 1, mb: 2 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {deviceDefs.map((def) => (
              <option key={def.id} value={def.id}>{def.name}</option>
            ))}
          </TextField>
          <TextField fullWidth label="Serial Number" value={form.sn}
            onChange={(e) => {
              const sn = e.target.value;
              const defName = deviceDefs.find((d) => d.id === form.deviceDefId)?.name ?? '';
              const autoName = defName && sn ? `${defName}-${sn}` : defName;
              setForm((f) => ({ ...f, sn, name: autoName || f.name }));
            }} sx={{ mb: 2 }} />
          <TextField fullWidth label="Device Name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={form.isAssembled} onChange={(e) => setForm({ ...form, isAssembled: e.target.checked })} />}
            label="Assembled"
            sx={{ mb: 1, display: 'block' }}
          />
          <FormControlLabel
            control={<Switch checked={form.isIot} onChange={(e) => setForm({ ...form, isIot: e.target.checked })} />}
            label="IoT Device"
            sx={{ mb: 1, display: 'block' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.deviceDefId || saving}>
            {saving ? 'Creating...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Emulator Dialog */}
      <Dialog open={!!emulatorDialogDevice} onClose={() => setEmulatorDialogDevice(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Emulator — {emulatorDialogDevice?.name || emulatorDialogDevice?.id.slice(0, 8)}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth select label="Emulator Preset" value={emulatorPreset}
            onChange={(e) => setEmulatorPreset(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {Object.entries(DEVICE_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.name}</option>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmulatorDialogDevice(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddEmulator} disabled={!emulatorPreset || emulatorSaving}>
            {emulatorSaving ? 'Creating...' : 'Create & Open Emulator'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share Device Dialog */}
      <Dialog open={!!shareDialogDevice} onClose={() => setShareDialogDevice(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Share Device — {shareDialogDevice?.name || shareDialogDevice?.id.slice(0, 8)}</DialogTitle>
        <DialogContent>
          {shareDeviceShares.length > 0 && (
            <Box sx={{ mb: 2, mt: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Shared with:</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {shareDeviceShares.map((share) => (
                  <Chip
                    key={share.id}
                    label={share.targetUserId}
                    onDelete={() => handleRemoveShare(share.id)}
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Stack>
            </Box>
          )}
          {shareDeviceShares.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Not shared with anyone yet.
            </Typography>
          )}
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Add user</InputLabel>
            <Select
              value={shareTargetUserId}
              label="Add user"
              onChange={(e) => setShareTargetUserId(e.target.value)}
            >
              {shareUsers
                .filter((u) => !shareDeviceShares.some((s) => s.targetUserId === u.name))
                .map((u) => (
                  <MenuItem key={u.name} value={u.name}>{u.name}</MenuItem>
                ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDialogDevice(null)}>Close</Button>
          <Button
            variant="contained"
            onClick={handleAddShare}
            disabled={!shareTargetUserId || shareSaving}
          >
            {shareSaving ? 'Sharing...' : 'Share'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Remove Device?</DialogTitle>
        <DialogContent><Typography>Are you sure you want to remove this device?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UserDevicesPage;
