import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Chip, Paper, Grid, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent,
} from '@mui/material';
import { Refresh, Send } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { TelemetryRecord, DeviceCommand, IotDeviceConfig, Alert as AlertModel } from '@mhersztowski/core';

function IotDevicePage() {
  const { userId, deviceId } = useParams<{ userId: string; deviceId: string }>();
  const [config, setConfig] = useState<IotDeviceConfig | null>(null);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryRecord | null>(null);
  const [history, setHistory] = useState<TelemetryRecord[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cmdDialogOpen, setCmdDialogOpen] = useState(false);
  const [cmdName, setCmdName] = useState('');
  const [cmdPayload, setCmdPayload] = useState('{}');
  const [deviceStatuses, setDeviceStatuses] = useState<Array<{ deviceId: string; status: string; lastSeenAt: number }>>([]);

  const load = useCallback(async () => {
    if (!userId || !deviceId) return;
    setLoading(true);
    try {
      const now = Date.now();
      const [cfg, latest, hist, cmds, alertsList, statuses] = await Promise.all([
        minisApi.getIotConfig(userId, deviceId),
        minisApi.getTelemetryLatest(userId, deviceId),
        minisApi.getTelemetryHistory(userId, deviceId, now - 3600000, now, 100),
        minisApi.getCommands(userId, deviceId),
        minisApi.getAlerts(userId),
        minisApi.getIotDevices(userId),
      ]);
      setConfig(cfg);
      setLatestTelemetry('metrics' in latest ? latest as TelemetryRecord : null);
      setHistory(hist);
      setCommands(cmds);
      setAlerts(alertsList.filter((a) => a.deviceId === deviceId));
      setDeviceStatuses(statuses);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userId, deviceId]);

  useEffect(() => { load(); }, [load]);

  const handleSendCommand = async () => {
    if (!userId || !deviceId || !cmdName) return;
    try {
      let payload = {};
      try { payload = JSON.parse(cmdPayload); } catch { /* keep empty */ }
      await minisApi.sendCommand(userId, deviceId, cmdName, payload);
      setCmdDialogOpen(false);
      setCmdName('');
      setCmdPayload('{}');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    if (!userId) return;
    try {
      await minisApi.acknowledgeAlert(userId, alertId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledge failed');
    }
  };

  const deviceStatus = deviceStatuses.find((s) => s.deviceId === deviceId);
  const statusLabel = deviceStatus?.status ?? 'UNKNOWN';
  const statusColor = statusLabel === 'ONLINE' ? 'success' : statusLabel === 'OFFLINE' ? 'error' : 'default';

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4">Device: {deviceId}</Typography>
          <Chip label={statusLabel} color={statusColor as any} />
        </Box>
        <Button startIcon={<Refresh />} onClick={load}>Refresh</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Latest Metrics */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Latest Metrics</Typography>
            {latestTelemetry ? (
              <Grid container spacing={2}>
                {latestTelemetry.metrics.map((m) => (
                  <Grid item xs={6} sm={4} key={m.key}>
                    <Card variant="outlined">
                      <CardContent sx={{ textAlign: 'center', py: 1, '&:last-child': { pb: 1 } }}>
                        <Typography variant="body2" color="text.secondary">{m.key}</Typography>
                        <Typography variant="h5">
                          {typeof m.value === 'number' ? m.value.toFixed(1) : String(m.value)}
                        </Typography>
                        {m.unit && <Typography variant="caption" color="text.secondary">{m.unit}</Typography>}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography color="text.secondary">No telemetry data</Typography>
            )}
          </Paper>
        </Grid>

        {/* Device Config */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Configuration</Typography>
            {config ? (
              <Box>
                <Typography variant="body2"><strong>Topic Prefix:</strong> {config.topicPrefix}</Typography>
                <Typography variant="body2"><strong>Heartbeat Interval:</strong> {config.heartbeatIntervalSec}s</Typography>
                <Typography variant="body2"><strong>Capabilities:</strong> {config.capabilities.length}</Typography>
              </Box>
            ) : (
              <Typography color="text.secondary">No config set</Typography>
            )}
          </Paper>
        </Grid>

        {/* Telemetry History */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Telemetry History (last hour)</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Metrics</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.slice(0, 20).map((record, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(record.timestamp).toLocaleTimeString()}</TableCell>
                      <TableCell>
                        {record.metrics.map((m) => `${m.key}: ${typeof m.value === 'number' ? m.value.toFixed(1) : m.value}${m.unit ? ` ${m.unit}` : ''}`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 && (
                    <TableRow><TableCell colSpan={2} align="center">No telemetry data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Commands */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Commands</Typography>
              <Button size="small" startIcon={<Send />} onClick={() => setCmdDialogOpen(true)}>Send</Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {commands.slice(0, 10).map((cmd) => (
                    <TableRow key={cmd.id}>
                      <TableCell>{cmd.name}</TableCell>
                      <TableCell>
                        <Chip label={cmd.status} size="small" color={cmd.status === 'ACKNOWLEDGED' ? 'success' : cmd.status === 'FAILED' ? 'error' : 'default'} />
                      </TableCell>
                      <TableCell>{new Date(cmd.createdAt).toLocaleTimeString()}</TableCell>
                    </TableRow>
                  ))}
                  {commands.length === 0 && (
                    <TableRow><TableCell colSpan={3} align="center">No commands</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Alerts */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Alerts</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Message</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alerts.slice(0, 10).map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>{alert.message}</TableCell>
                      <TableCell>
                        <Chip
                          label={alert.severity} size="small"
                          color={alert.severity === 'CRITICAL' ? 'error' : alert.severity === 'WARNING' ? 'warning' : 'info'}
                        />
                      </TableCell>
                      <TableCell>{alert.status}</TableCell>
                      <TableCell>
                        {alert.status === 'OPEN' && (
                          <Button size="small" onClick={() => handleAcknowledgeAlert(alert.id)}>ACK</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {alerts.length === 0 && (
                    <TableRow><TableCell colSpan={4} align="center">No alerts</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Send Command Dialog */}
      <Dialog open={cmdDialogOpen} onClose={() => setCmdDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Command</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Command Name" value={cmdName}
            onChange={(e) => setCmdName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth label="Payload (JSON)" value={cmdPayload}
            onChange={(e) => setCmdPayload(e.target.value)}
            multiline rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCmdDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSendCommand} disabled={!cmdName}>Send</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default IotDevicePage;
