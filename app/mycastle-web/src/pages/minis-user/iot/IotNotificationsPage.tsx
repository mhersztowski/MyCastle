import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Switch, FormControlLabel, Table, TableBody,
  TableCell, TableHead, TableRow, Paper, Chip, Tooltip, CircularProgress,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WebhookIcon from '@mui/icons-material/Webhook';
import type { NotificationChannel } from '@mhersztowski/core';
import { minisApi } from '../../../services/MinisApiService';

export default function IotNotificationsPage() {
  const { userName } = useParams<{ userName: string }>();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NotificationChannel | null>(null);
  const [form, setForm] = useState({ name: '', webhookUrl: '', secret: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    setError(null);
    try {
      const list = await minisApi.listNotificationChannels(userName);
      setChannels(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: '', webhookUrl: '', secret: '', isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (ch: NotificationChannel) => {
    setEditTarget(ch);
    setForm({ name: ch.name, webhookUrl: ch.webhookUrl, secret: ch.secret ?? '', isActive: ch.isActive });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!userName || !form.name || !form.webhookUrl) return;
    setSaving(true);
    try {
      if (editTarget) {
        await minisApi.updateNotificationChannel(userName, editTarget.id, {
          name: form.name,
          webhookUrl: form.webhookUrl,
          secret: form.secret || null,
          isActive: form.isActive,
        });
      } else {
        await minisApi.createNotificationChannel(userName, {
          name: form.name,
          webhookUrl: form.webhookUrl,
          secret: form.secret || undefined,
        });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteNotificationChannel(userName, id);
      setDeleteId(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5">Notification Channels</Typography>
          <Typography variant="body2" color="text.secondary">
            Webhook endpoints that receive alerts from your IoT alert rules.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Channel
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : channels.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <WebhookIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No notification channels configured.</Typography>
          <Typography variant="body2" color="text.secondary">
            Add a webhook URL to receive alert notifications.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Webhook URL</TableCell>
                <TableCell>Secret</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {channels.map((ch) => (
                <TableRow key={ch.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WebhookIcon fontSize="small" color="action" />
                      <Typography variant="body2" fontWeight={500}>{ch.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ch.webhookUrl}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {ch.secret ? <Chip label="Set" size="small" color="info" /> : <Typography variant="body2" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip label={ch.isActive ? 'Active' : 'Disabled'} size="small" color={ch.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(ch)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteId(ch.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? 'Edit Channel' : 'New Notification Channel'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required fullWidth />
          <TextField label="Webhook URL" value={form.webhookUrl} onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))} required fullWidth placeholder="https://hooks.example.com/..." helperText="POST request will be sent with JSON payload when an alert fires." />
          <TextField label="HMAC Secret (optional)" value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} fullWidth helperText="If set, X-MyCastle-Signature: sha256=<hmac> header is added to every request." />
          {editTarget && (
            <FormControlLabel control={<Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />} label="Active" />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name || !form.webhookUrl}>
            {saving ? <CircularProgress size={18} /> : editTarget ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete Channel</DialogTitle>
        <DialogContent><Typography>This channel will be removed from all alert rules referencing it.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
