import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Chip, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Alert as MuiAlert, CircularProgress, Tabs, Tab,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton,
} from '@mui/material';
import { Delete } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { Alert, AlertRule, MinisDeviceModel, MinisDeviceDefModel } from '@mhersztowski/core';

function IotAlertsPage() {
  const { userName } = useParams<{ userName: string }>();
  const [tab, setTab] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ name: '', metricKey: '', conditionOp: '>', conditionValue: '', severity: 'WARNING', cooldownMinutes: '15', deviceId: '' });

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [alertsList, rulesList, allDevices, defs] = await Promise.all([
        minisApi.getAlerts(userName),
        minisApi.getAlertRules(userName),
        minisApi.getUserDevices(userName),
        minisApi.getDeviceDefs(userName),
      ]);
      setAlerts(alertsList);
      setRules(rulesList);
      setDevices(allDevices);
      setDeviceDefs(defs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  const resolveDeviceName = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (device?.name) return device.name;
    if (device) return deviceDefs.find((d) => d.id === device.deviceDefId)?.name || deviceId.slice(0, 8);
    return deviceId.slice(0, 8);
  };

  const handleAcknowledge = async (alertId: string) => {
    if (!userName) return;
    try {
      await minisApi.acknowledgeAlert(userName, alertId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleResolve = async (alertId: string) => {
    if (!userName) return;
    try {
      await minisApi.resolveAlert(userName, alertId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleCreateRule = async () => {
    if (!userName) return;
    try {
      await minisApi.createAlertRule(userName, {
        name: ruleForm.name,
        metricKey: ruleForm.metricKey,
        conditionOp: ruleForm.conditionOp as AlertRule['conditionOp'],
        conditionValue: parseFloat(ruleForm.conditionValue),
        severity: ruleForm.severity as AlertRule['severity'],
        cooldownMinutes: parseInt(ruleForm.cooldownMinutes, 10),
        isActive: true,
        deviceId: ruleForm.deviceId || undefined,
      });
      setRuleDialogOpen(false);
      setRuleForm({ name: '', metricKey: '', conditionOp: '>', conditionValue: '', severity: 'WARNING', cooldownMinutes: '15', deviceId: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!userName) return;
    try {
      await minisApi.deleteAlertRule(userName, ruleId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>IoT Alerts</Typography>

      {error && <MuiAlert severity="error" sx={{ mb: 2 }}>{error}</MuiAlert>}
      {loading && <CircularProgress />}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Alerts (${alerts.length})`} />
        <Tab label={`Rules (${rules.length})`} />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Message</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Fired At</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell>{resolveDeviceName(alert.deviceId)}</TableCell>
                  <TableCell>{alert.message}</TableCell>
                  <TableCell>
                    <Chip
                      label={alert.severity} size="small"
                      color={alert.severity === 'CRITICAL' ? 'error' : alert.severity === 'WARNING' ? 'warning' : 'info'}
                    />
                  </TableCell>
                  <TableCell>{alert.status}</TableCell>
                  <TableCell>{new Date(alert.triggeredAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {alert.status === 'OPEN' && (
                      <Button size="small" onClick={() => handleAcknowledge(alert.id)}>ACK</Button>
                    )}
                    {(alert.status === 'OPEN' || alert.status === 'ACKNOWLEDGED') && (
                      <Button size="small" onClick={() => handleResolve(alert.id)}>Resolve</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {alerts.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">No alerts</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && (
        <>
          <Box sx={{ mb: 2 }}>
            <Button variant="contained" onClick={() => setRuleDialogOpen(true)}>Add Rule</Button>
          </Box>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Metric</TableCell>
                  <TableCell>Condition</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>{rule.metricKey}</TableCell>
                    <TableCell>{rule.conditionOp} {rule.conditionValue}</TableCell>
                    <TableCell>
                      <Chip
                        label={rule.severity} size="small"
                        color={rule.severity === 'CRITICAL' ? 'error' : rule.severity === 'WARNING' ? 'warning' : 'info'}
                      />
                    </TableCell>
                    <TableCell>{rule.deviceId ? resolveDeviceName(rule.deviceId) : 'All'}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleDeleteRule(rule.id)}><Delete /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center">No rules</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Create Rule Dialog */}
      <Dialog open={ruleDialogOpen} onClose={() => setRuleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Alert Rule</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Metric Key" value={ruleForm.metricKey} onChange={(e) => setRuleForm({ ...ruleForm, metricKey: e.target.value })} sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField select label="Operator" value={ruleForm.conditionOp} onChange={(e) => setRuleForm({ ...ruleForm, conditionOp: e.target.value })} SelectProps={{ native: true }} sx={{ width: 100 }}>
              {['>', '<', '>=', '<=', '==', '!='].map((op) => <option key={op} value={op}>{op}</option>)}
            </TextField>
            <TextField fullWidth label="Value" type="number" value={ruleForm.conditionValue} onChange={(e) => setRuleForm({ ...ruleForm, conditionValue: e.target.value })} />
          </Box>
          <TextField fullWidth select label="Severity" value={ruleForm.severity} onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value })} SelectProps={{ native: true }} sx={{ mb: 2 }}>
            {['INFO', 'WARNING', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
          </TextField>
          <TextField fullWidth label="Cooldown (minutes)" type="number" value={ruleForm.cooldownMinutes} onChange={(e) => setRuleForm({ ...ruleForm, cooldownMinutes: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="Device ID (optional, empty = all)" value={ruleForm.deviceId} onChange={(e) => setRuleForm({ ...ruleForm, deviceId: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateRule} disabled={!ruleForm.name || !ruleForm.metricKey || !ruleForm.conditionValue}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default IotAlertsPage;
