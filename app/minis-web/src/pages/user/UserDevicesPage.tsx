import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControlLabel, Switch, Alert, CircularProgress,
} from '@mui/material';
import { Delete, Add, Build } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { minisApi } from '../../services/MinisApiService';
import type { MinisDeviceModel, MinisDeviceDefModel } from '@mhersztowski/core';

interface FormData {
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
}

const emptyForm: FormData = { deviceDefId: '', isAssembled: true, isIot: false, sn: '' };

function UserDevicesPage() {
  const { userId } = useParams<{ userId: string }>();
  const [items, setItems] = useState<MinisDeviceModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [assembleDialogOpen, setAssembleDialogOpen] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [devices, defs] = await Promise.all([
        minisApi.getUserDevices(userId),
        minisApi.getDeviceDefs(),
      ]);
      setItems(devices);
      setDeviceDefs(defs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openAddAssembled = () => {
    setForm({ ...emptyForm, isAssembled: true });
    setAddDialogOpen(true);
  };

  const openAssemble = () => {
    setForm({ ...emptyForm, isAssembled: false });
    setAssembleDialogOpen(true);
  };

  const handleSave = async (assembled: boolean) => {
    if (!userId) return;
    try {
      await minisApi.createUserDevice(userId, { ...form, isAssembled: assembled });
      setAddDialogOpen(false);
      setAssembleDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    try {
      await minisApi.deleteUserDevice(userId, id);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">My Devices</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" startIcon={<Add />} onClick={openAddAssembled}>Add Assembled Device</Button>
          <Button variant="outlined" startIcon={<Build />} onClick={openAssemble}>Assemble Device</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Device Definition</TableCell>
              <TableCell>Serial Number</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{deviceDefs.find(d => d.id === item.deviceDefId)?.name ?? item.deviceDefId}</TableCell>
                <TableCell>{item.sn || '-'}</TableCell>
                <TableCell>
                  {item.isAssembled
                    ? <Chip label="Assembled" color="success" size="small" />
                    : <Chip label="In Progress" color="warning" size="small" />}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setDeleteConfirm(item.id)}><Delete /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center">No devices yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Assembled Device Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Assembled Device</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth select label="Device Definition" value={form.deviceDefId}
            onChange={(e) => setForm({ ...form, deviceDefId: e.target.value })}
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
            onChange={(e) => setForm({ ...form, sn: e.target.value })} sx={{ mb: 2 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => handleSave(true)} disabled={!form.deviceDefId}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* Assemble Device Dialog */}
      <Dialog open={assembleDialogOpen} onClose={() => setAssembleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assemble Device</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth select label="Device Definition" value={form.deviceDefId}
            onChange={(e) => setForm({ ...form, deviceDefId: e.target.value })}
            sx={{ mt: 1, mb: 2 }}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ native: true }}
          >
            <option value=""></option>
            {deviceDefs.map((def) => (
              <option key={def.id} value={def.id}>{def.name}</option>
            ))}
          </TextField>
          <TextField fullWidth label="Serial Number (optional)" value={form.sn}
            onChange={(e) => setForm({ ...form, sn: e.target.value })} sx={{ mb: 2 }} />
          <FormControlLabel
            control={<Switch checked={form.isAssembled} onChange={(e) => setForm({ ...form, isAssembled: e.target.checked })} />}
            label="Mark as assembled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssembleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => handleSave(form.isAssembled)} disabled={!form.deviceDefId}>Start Assembly</Button>
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
