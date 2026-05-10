import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Switch, FormControlLabel, Select, MenuItem,
  InputLabel, FormControl, Table, TableBody, TableCell, TableHead,
  TableRow, Paper, Chip, Tooltip, CircularProgress, Alert, Divider,

} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import AutomationIcon from '@mui/icons-material/AutoMode';
import type { IotAutomation, IotAutomationTrigger, IotAutomationAction, NotificationChannel } from '@mhersztowski/core';
import { minisApi } from '../../../services/MinisApiService';

type TriggerType = 'cron' | 'telemetry';
type ActionType = 'send_command' | 'notify';

interface FormState {
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  cronExpr: string;
  cronTz: string;
  telDeviceId: string;
  telMetricKey: string;
  telOp: string;
  telValue: string;
  actions: IotAutomationAction[];
}

const BLANK: FormState = {
  name: '', enabled: true,
  triggerType: 'cron', cronExpr: '0 * * * *', cronTz: 'UTC',
  telDeviceId: '', telMetricKey: '', telOp: '>', telValue: '0',
  actions: [],
};

function formToAutomation(f: FormState): { trigger: IotAutomationTrigger; actions: IotAutomationAction[]; name: string; enabled: boolean } {
  const trigger: IotAutomationTrigger = f.triggerType === 'cron'
    ? { type: 'cron', expression: f.cronExpr, timezone: f.cronTz || 'UTC' }
    : { type: 'telemetry', deviceId: f.telDeviceId || undefined, metricKey: f.telMetricKey, op: f.telOp as any, value: parseFloat(f.telValue) };
  return { name: f.name, enabled: f.enabled, trigger, actions: f.actions };
}

function automationToForm(a: IotAutomation): FormState {
  const t = a.trigger;
  return {
    name: a.name, enabled: a.enabled,
    triggerType: t.type,
    cronExpr: t.type === 'cron' ? t.expression : '0 * * * *',
    cronTz: t.type === 'cron' ? (t.timezone ?? 'UTC') : 'UTC',
    telDeviceId: t.type === 'telemetry' ? (t.deviceId ?? '') : '',
    telMetricKey: t.type === 'telemetry' ? t.metricKey : '',
    telOp: t.type === 'telemetry' ? t.op : '>',
    telValue: t.type === 'telemetry' ? String(t.value) : '0',
    actions: a.actions,
  };
}

export default function IotAutomationsPage() {
  const { userName } = useParams<{ userName: string }>();
  const [automations, setAutomations] = useState<IotAutomation[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<IotAutomation | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    setError(null);
    try {
      const [autos, chans] = await Promise.all([
        minisApi.listIotAutomations(userName),
        minisApi.listNotificationChannels(userName),
      ]);
      setAutomations(autos);
      setChannels(chans);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditTarget(null); setForm(BLANK); setDialogOpen(true); };
  const openEdit = (a: IotAutomation) => { setEditTarget(a); setForm(automationToForm(a)); setDialogOpen(true); };

  const setF = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const addAction = (type: ActionType) => {
    const action: IotAutomationAction = type === 'send_command'
      ? { type: 'send_command', deviceId: '', commandName: '' }
      : { type: 'notify', channelId: channels[0]?.id ?? '', message: '' };
    setF('actions', [...form.actions, action]);
  };

  const updateAction = (i: number, patch: Partial<IotAutomationAction>) =>
    setF('actions', form.actions.map((a, idx) => idx === i ? { ...a, ...patch } as IotAutomationAction : a));

  const removeAction = (i: number) => setF('actions', form.actions.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!userName || !form.name) return;
    setSaving(true);
    try {
      const data = formToAutomation(form);
      if (editTarget) {
        await minisApi.updateIotAutomation(userName, editTarget.id, data);
      } else {
        await minisApi.createIotAutomation(userName, data);
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
      await minisApi.deleteIotAutomation(userName, id);
      setDeleteId(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const triggerLabel = (a: IotAutomation) => {
    if (a.trigger.type === 'cron') return `cron: ${a.trigger.expression}`;
    const t = a.trigger;
    return `${t.metricKey} ${t.op} ${t.value}${t.deviceId ? ` (${t.deviceId})` : ''}`;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5">IoT Automations</Typography>
          <Typography variant="body2" color="text.secondary">
            Trigger device commands or webhook notifications on a schedule or when telemetry conditions are met.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add Automation</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : automations.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <AutomationIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No automations yet.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Trigger</TableCell>
                <TableCell>Actions</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {automations.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell><Typography variant="body2" fontWeight={500}>{a.name}</Typography></TableCell>
                  <TableCell>
                    <Chip label={a.trigger.type} size="small" color={a.trigger.type === 'cron' ? 'primary' : 'secondary'} sx={{ mr: 0.5 }} />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{triggerLabel(a)}</Typography>
                  </TableCell>
                  <TableCell>
                    {a.actions.map((act, i) => (
                      <Chip key={i} label={act.type === 'send_command' ? `cmd:${act.commandName}` : `notify`} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell>
                    {a.lastRunAt ? (
                      <Box>
                        <Typography variant="caption">{new Date(a.lastRunAt).toLocaleString()}</Typography>
                        {a.lastRunResult && (
                          <Chip label={a.lastRunResult} size="small" color={a.lastRunResult === 'success' ? 'success' : 'error'} sx={{ ml: 0.5 }} />
                        )}
                      </Box>
                    ) : <Typography variant="caption" color="text.disabled">Never</Typography>}
                  </TableCell>
                  <TableCell><Chip label={a.enabled ? 'Enabled' : 'Disabled'} size="small" color={a.enabled ? 'success' : 'default'} /></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(a)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteId(a.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editTarget ? 'Edit Automation' : 'New Automation'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setF('name', e.target.value)} required sx={{ flex: 1 }} />
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => setF('enabled', e.target.checked)} />} label="Enabled" sx={{ alignSelf: 'center' }} />
          </Box>

          <Divider>Trigger</Divider>

          <FormControl fullWidth>
            <InputLabel>Trigger Type</InputLabel>
            <Select value={form.triggerType} label="Trigger Type" onChange={(e) => setF('triggerType', e.target.value as TriggerType)}>
              <MenuItem value="cron">Cron Schedule</MenuItem>
              <MenuItem value="telemetry">Telemetry Condition</MenuItem>
            </Select>
          </FormControl>

          {form.triggerType === 'cron' ? (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label="Cron Expression" value={form.cronExpr} onChange={(e) => setF('cronExpr', e.target.value)} sx={{ flex: 2 }} helperText="e.g. 0 * * * * (every hour)" />
              <TextField label="Timezone" value={form.cronTz} onChange={(e) => setF('cronTz', e.target.value)} sx={{ flex: 1 }} placeholder="UTC" />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <TextField label="Device ID (optional)" value={form.telDeviceId} onChange={(e) => setF('telDeviceId', e.target.value)} sx={{ flex: 2, minWidth: 180 }} />
              <TextField label="Metric Key" value={form.telMetricKey} onChange={(e) => setF('telMetricKey', e.target.value)} required sx={{ flex: 2, minWidth: 140 }} />
              <FormControl sx={{ flex: 1, minWidth: 80 }}>
                <InputLabel>Op</InputLabel>
                <Select value={form.telOp} label="Op" onChange={(e) => setF('telOp', e.target.value)}>
                  {['>', '<', '>=', '<=', '==', '!='].map((op) => <MenuItem key={op} value={op}>{op}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Value" value={form.telValue} onChange={(e) => setF('telValue', e.target.value)} type="number" sx={{ flex: 1, minWidth: 80 }} />
            </Box>
          )}

          <Divider>Actions</Divider>

          {form.actions.map((action, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Chip label={action.type} size="small" />
                <IconButton size="small" color="error" onClick={() => removeAction(i)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
              {action.type === 'send_command' ? (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField label="Device ID" value={action.deviceId} onChange={(e) => updateAction(i, { deviceId: e.target.value })} size="small" sx={{ flex: 1 }} />
                  <TextField label="Command Name" value={action.commandName} onChange={(e) => updateAction(i, { commandName: e.target.value })} size="small" sx={{ flex: 1 }} />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Channel</InputLabel>
                    <Select value={action.channelId} label="Channel" onChange={(e) => updateAction(i, { channelId: e.target.value })}>
                      {channels.map((ch) => <MenuItem key={ch.id} value={ch.id}>{ch.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField label="Message" value={action.message} onChange={(e) => updateAction(i, { message: e.target.value })} size="small" sx={{ flex: 2 }} />
                </Box>
              )}
            </Paper>
          ))}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => addAction('send_command')}>Add Send Command</Button>
            <Button size="small" startIcon={<AddIcon />} onClick={() => addAction('notify')} disabled={channels.length === 0}>Add Notify</Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name}>
            {saving ? <CircularProgress size={18} /> : editTarget ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete Automation</DialogTitle>
        <DialogContent><Typography>This automation will be permanently removed.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
