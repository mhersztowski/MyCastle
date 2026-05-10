import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Table, TableBody, TableCell, TableHead, TableRow,
  Paper, Chip, Tooltip, CircularProgress, Alert, Divider, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StorageIcon from '@mui/icons-material/Storage';
import type { RetentionPolicy } from '@mhersztowski/core';
import { minisApi } from '../../../services/MinisApiService';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

function RetentionDaysChip({ days }: { days: number }) {
  const color = days <= 7 ? 'default' : days <= 30 ? 'info' : days <= 90 ? 'primary' : 'success';
  return <Chip label={`${days} days`} size="small" color={color} />;
}

export default function IotRetentionPage() {
  const { userName } = useParams<{ userName: string }>();

  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [globalPolicy, setGlobalPolicy] = useState<RetentionPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global policy editor
  const [globalDays, setGlobalDays] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Per-device dialog
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RetentionPolicy | null>(null);
  const [deviceName, setDeviceName] = useState('');
  const [deviceDays, setDeviceDays] = useState('');
  const [savingDevice, setSavingDevice] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RetentionPolicy | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    setError(null);
    try {
      const { policies: list, effective } = await minisApi.getRetentionPolicies(userName);
      const global = list.find((p) => !p.deviceId) ?? null;
      const devicePolicies = list.filter((p) => !!p.deviceId);
      setGlobalPolicy(global);
      setPolicies(devicePolicies);
      setGlobalDays(global ? String(global.retentionDays) : '');
      // suppress effective if it's just the global one re-appearing
      void effective;
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const handleSaveGlobal = async () => {
    if (!userName) return;
    const days = parseInt(globalDays, 10);
    if (!days || days < 1) return;
    setSavingGlobal(true);
    try {
      await minisApi.setRetentionPolicy(userName, days);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleDeleteGlobal = async () => {
    if (!userName) return;
    setSavingGlobal(true);
    try {
      await minisApi.deleteRetentionPolicy(userName);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingGlobal(false);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setDeviceName('');
    setDeviceDays('');
    setDeviceDialogOpen(true);
  };

  const openEdit = (p: RetentionPolicy) => {
    setEditTarget(p);
    setDeviceName(p.deviceId ?? '');
    setDeviceDays(String(p.retentionDays));
    setDeviceDialogOpen(true);
  };

  const handleSaveDevice = async () => {
    if (!userName || !deviceName.trim()) return;
    const days = parseInt(deviceDays, 10);
    if (!days || days < 1) return;
    setSavingDevice(true);
    try {
      await minisApi.setRetentionPolicy(userName, days, deviceName.trim());
      setDeviceDialogOpen(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingDevice(false);
    }
  };

  const handleDeleteDevice = async (p: RetentionPolicy) => {
    if (!userName || !p.deviceId) return;
    try {
      await minisApi.deleteRetentionPolicy(userName, p.deviceId);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">Telemetry Retention</Typography>
        <Typography variant="body2" color="text.secondary">
          Control how long telemetry data is kept. Per-device policies override the global default.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : (
        <>
          {/* Global policy */}
          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>Global Default</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Applies to all devices that don't have a per-device policy.
              {!globalPolicy && ' No global policy set — data is kept indefinitely.'}
            </Typography>
            {globalPolicy && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Current: <RetentionDaysChip days={globalPolicy.retentionDays} /> — last updated {formatDate(globalPolicy.updatedAt)}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <TextField
                label="Retention days"
                value={globalDays}
                onChange={(e) => setGlobalDays(e.target.value.replace(/\D/g, ''))}
                size="small"
                sx={{ width: 160 }}
                InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
                placeholder="e.g. 30"
              />
              <Button
                variant="contained"
                onClick={handleSaveGlobal}
                disabled={savingGlobal || !globalDays || parseInt(globalDays, 10) < 1}
              >
                {savingGlobal ? <CircularProgress size={18} /> : globalPolicy ? 'Update' : 'Set'}
              </Button>
              {globalPolicy && (
                <Button color="error" onClick={handleDeleteGlobal} disabled={savingGlobal}>
                  Clear
                </Button>
              )}
            </Box>
          </Paper>

          <Divider sx={{ mb: 3 }} />

          {/* Per-device policies */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2">Per-Device Policies</Typography>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              Add Override
            </Button>
          </Box>

          {policies.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <StorageIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary" variant="body2">No per-device overrides.</Typography>
            </Paper>
          ) : (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Device</TableCell>
                    <TableCell>Retention</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {policies.map((p) => (
                    <TableRow key={p.deviceId} hover>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">{p.deviceId}</Typography>
                      </TableCell>
                      <TableCell><RetentionDaysChip days={p.retentionDays} /></TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">{formatDate(p.updatedAt)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}

      {/* Add / edit per-device dialog */}
      <Dialog open={deviceDialogOpen} onClose={() => setDeviceDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editTarget ? 'Edit Device Policy' : 'Add Device Override'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Device name"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            disabled={!!editTarget}
            required
            fullWidth
            placeholder="e.g. sensor-01"
            helperText={editTarget ? 'Device name cannot be changed.' : ''}
          />
          <TextField
            label="Retention days"
            value={deviceDays}
            onChange={(e) => setDeviceDays(e.target.value.replace(/\D/g, ''))}
            required
            fullWidth
            InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeviceDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveDevice}
            disabled={savingDevice || !deviceName.trim() || !deviceDays || parseInt(deviceDays, 10) < 1}
          >
            {savingDevice ? <CircularProgress size={18} /> : editTarget ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Remove Device Policy</DialogTitle>
        <DialogContent>
          <Typography>
            Remove the retention override for <strong>{deleteTarget?.deviceId}</strong>?
            The global default will apply instead.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteTarget && handleDeleteDevice(deleteTarget)}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
