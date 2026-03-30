import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Chip, Paper, Grid, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, IconButton, Divider,
} from '@mui/material';
import { Refresh, Send, FolderOpen, Close, Code, Keyboard, Mouse, Tv, Monitor } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { RemoteFS } from '@mhersztowski/core';
import { VfsExplorer } from '@mhersztowski/web-client';
import { minisApi } from '../../../services/MinisApiService';
import { useAuth } from '../../../modules/auth';
import { useGlobalWindows } from '../../../components/GlobalWindowsContext';
import { EntityWidget, Sparkline } from './EntityWidgets';
import type { OnCommand } from './EntityWidgets';
import type { TelemetryRecord, DeviceCommand, IotDeviceConfig, Alert as AlertModel, MinisDeviceModel, MinisDeviceDefModel } from '@mhersztowski/core';

function IotDevicePage() {
  const { userName, deviceName } = useParams<{ userName: string; deviceName: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { openWithParams } = useGlobalWindows();
  const [config, setConfig] = useState<IotDeviceConfig | null>(null);
  const [latestTelemetry, setLatestTelemetry] = useState<TelemetryRecord | null>(null);
  const [history, setHistory] = useState<TelemetryRecord[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [extensions, setExtensions] = useState<Array<{ type: string }>>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [cmdDialogOpen, setCmdDialogOpen] = useState(false);
  const [cmdName, setCmdName] = useState('');
  const [cmdPayload, setCmdPayload] = useState('{}');
  const [vfsDialogOpen, setVfsDialogOpen] = useState(false);
  const [vkbdDialogOpen, setVkbdDialogOpen] = useState(false);
  const [vmouseDialogOpen, setVmouseDialogOpen] = useState(false);
  const [deviceStatuses, setDeviceStatuses] = useState<Array<{ deviceId: string; status: string; lastSeenAt: number }>>([]);
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);

  const load = useCallback(async () => {
    if (!userName || !deviceName) return;
    if (!initialLoadDone.current) setLoading(true);
    try {
      const now = Date.now();
      const [cfg, latest, hist, cmds, alertsList, statuses, allDevices, defs, exts] = await Promise.all([
        minisApi.getIotConfig(userName, deviceName),
        minisApi.getTelemetryLatest(userName, deviceName),
        minisApi.getTelemetryHistory(userName, deviceName, now - 3600000, now, 100),
        minisApi.getCommands(userName, deviceName),
        minisApi.getAlerts(userName),
        minisApi.getIotDevices(userName),
        minisApi.getUserDevices(userName),
        minisApi.getDeviceDefs(userName),
        minisApi.getIotExtensions(userName, deviceName),
      ]);
      setConfig(cfg);
      setExtensions(exts);
      setLatestTelemetry('metrics' in latest ? latest as TelemetryRecord : null);
      setHistory(hist);
      setCommands(cmds);
      setAlerts(alertsList.filter((a) => a.deviceId === deviceName));
      setDeviceStatuses(statuses);
      setDevices(allDevices);
      setDeviceDefs(defs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      initialLoadDone.current = true;
      setLoading(false);
    }
  }, [userName, deviceName]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleSendCommand = async () => {
    if (!userName || !deviceName || !cmdName) return;
    try {
      let payload = {};
      try { payload = JSON.parse(cmdPayload); } catch { /* keep empty */ }
      await minisApi.sendCommand(userName, deviceName, cmdName, payload);
      setCmdDialogOpen(false);
      setCmdName('');
      setCmdPayload('{}');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    }
  };

  const handleEntityCommand: OnCommand = async (_entityId, commandName, payload) => {
    if (!userName || !deviceName) return;
    try {
      await minisApi.sendCommand(userName, deviceName, commandName, payload);
      // Quick refresh to pick up state change from emulator
      setTimeout(load, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    if (!userName) return;
    try {
      await minisApi.acknowledgeAlert(userName, alertId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledge failed');
    }
  };

  const currentDevice = devices.find((d) => d.name === deviceName);
  const deviceStatus = deviceStatuses.find((s) => s.deviceId === deviceName);
  const statusLabel = deviceStatus?.status ?? 'OFFLINE';
  const statusColor = statusLabel === 'ONLINE' ? 'success' : statusLabel === 'OFFLINE' ? 'error' : 'default';
  const deviceDisplayName = currentDevice?.name || deviceDefs.find((d) => d.id === currentDevice?.deviceDefId)?.name || deviceName;
  const isOffline = statusLabel !== 'ONLINE';

  const entities = config?.entities ?? [];
  const hasEntities = entities.length > 0;
  const hasVfs = extensions.some((e) => e.type === 'vfs');
  const hasVkbd = extensions.some((e) => e.type === 'vkbd');
  const hasVmouse = extensions.some((e) => e.type === 'vmouse');
  const hasSmartDisplay = extensions.some((e) => e.type === 'smart-display');
  const hasDisplay = extensions.some((e) => e.type === 'display');

  const vfsProvider = useMemo(() => {
    if (!userName || !deviceName) return null;
    return new RemoteFS({
      baseUrl: `/api/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/vfs`,
      token: token ?? undefined,
    });
  }, [userName, deviceName, token]);

  const getMetricHistory = (metricKey: string): number[] => {
    const values: number[] = [];
    for (let i = Math.min(history.length - 1, 19); i >= 0; i--) {
      const m = history[i].metrics.find((m) => m.key === metricKey);
      if (m && typeof m.value === 'number') values.push(m.value);
    }
    return values;
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4">{deviceDisplayName}</Typography>
          <Chip label={statusLabel} color={statusColor as any} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {hasSmartDisplay && (
            <Button
              startIcon={<Tv />}
              variant="contained"
              onClick={() => navigate(`/user/${userName}/iot/smart-display/${deviceName}`)}
            >
              Smart Display
            </Button>
          )}
          {hasDisplay && (
            <Button
              startIcon={<Monitor />}
              variant="contained"
              onClick={() => navigate(`/user/${userName}/iot/virtual-display/${deviceName}`)}
            >
              Virtual Display
            </Button>
          )}
          {hasVfs && vfsProvider && (
            <Button
              startIcon={<Code />}
              variant="outlined"
              onClick={() => openWithParams('vfs', {
                provider: vfsProvider,
                mountPath: '/device',
                label: deviceName!,
              })}
            >
              Editor
            </Button>
          )}
          {hasVkbd && (
            <Button startIcon={<Keyboard />} variant="outlined" onClick={() => setVkbdDialogOpen(true)} disabled={isOffline}>
              Keyboard
            </Button>
          )}
          {hasVmouse && (
            <Button startIcon={<Mouse />} variant="outlined" onClick={() => setVmouseDialogOpen(true)} disabled={isOffline}>
              Mouse
            </Button>
          )}
          <Button startIcon={<Refresh />} onClick={load}>Refresh</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Entity Widgets */}
        {hasEntities && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Entities</Typography>
              <Grid container spacing={2}>
                {entities.map((entity) => {
                  const metric = latestTelemetry?.metrics.find((m) => m.key === entity.id);
                  const metricHistory = entity.type === 'sensor' ? getMetricHistory(entity.id) : undefined;
                  return (
                    <Grid item xs={12} sm={6} md={4} key={entity.id}>
                      <EntityWidget
                        entity={entity}
                        metric={metric}
                        history={metricHistory}
                        onCommand={handleEntityCommand}
                        disabled={isOffline}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>
          </Grid>
        )}

        {/* Latest Metrics */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Latest Metrics</Typography>
            {latestTelemetry ? (
              <Grid container spacing={2}>
                {latestTelemetry.metrics.map((m) => {
                  const sparkValues = getMetricHistory(m.key);
                  return (
                    <Grid item xs={6} sm={4} key={m.key}>
                      <Card variant="outlined">
                        <CardContent sx={{ textAlign: 'center', py: 1, '&:last-child': { pb: 1 } }}>
                          <Typography variant="body2" color="text.secondary">{m.key}</Typography>
                          <Typography variant="h5">
                            {typeof m.value === 'number' ? m.value.toFixed(1) : String(m.value)}
                          </Typography>
                          {m.unit && <Typography variant="caption" color="text.secondary">{m.unit}</Typography>}
                          {sparkValues.length >= 2 && (
                            <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
                              <Sparkline values={sparkValues} width={100} height={30} />
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
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
                {hasEntities && <Typography variant="body2"><strong>Entities:</strong> {entities.length}</Typography>}
              </Box>
            ) : (
              <Typography color="text.secondary">No config set</Typography>
            )}
          </Paper>
        </Grid>

        {/* Extensions */}
        {extensions.length > 0 && (
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>Extensions</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {extensions.map((ext) => (
                  <Chip key={ext.type} label={ext.type} color="primary" size="small" />
                ))}
                {hasVfs && (
                  <Button size="small" startIcon={<FolderOpen />} onClick={() => setVfsDialogOpen(true)} sx={{ ml: 1 }}>
                    Browse Files
                  </Button>
                )}
                {hasVkbd && (
                  <Button size="small" startIcon={<Keyboard />} onClick={() => setVkbdDialogOpen(true)} disabled={isOffline} sx={{ ml: 1 }}>
                    Keyboard
                  </Button>
                )}
                {hasVmouse && (
                  <Button size="small" startIcon={<Mouse />} onClick={() => setVmouseDialogOpen(true)} disabled={isOffline} sx={{ ml: 1 }}>
                    Mouse
                  </Button>
                )}
              </Box>
            </Paper>
          </Grid>
        )}

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

      {/* VFS Browser Dialog */}
      <Dialog open={vfsDialogOpen} onClose={() => setVfsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Device Files — {deviceName}
          <IconButton size="small" onClick={() => setVfsDialogOpen(false)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: 500 }}>
          {vfsProvider && (
            <VfsExplorer
              provider={vfsProvider}
              rootPath="/"
              height="100%"
            />
          )}
        </DialogContent>
      </Dialog>

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

      {/* Virtual Keyboard Dialog */}
      {hasVkbd && userName && deviceName && (
        <VirtualKeyboardDialog
          open={vkbdDialogOpen}
          onClose={() => setVkbdDialogOpen(false)}
          userName={userName}
          deviceName={deviceName}
        />
      )}

      {/* Virtual Mouse Dialog */}
      {hasVmouse && userName && deviceName && (
        <VirtualMouseDialog
          open={vmouseDialogOpen}
          onClose={() => setVmouseDialogOpen(false)}
          userName={userName}
          deviceName={deviceName}
        />
      )}
    </Box>
  );
}

// ─── VirtualKeyboardDialog ────────────────────────────────────────────────────

const HOTKEY_PRESETS: Array<{ label: string; keys: string[] }> = [
  { label: 'Ctrl+C',   keys: ['ctrl', 'c'] },
  { label: 'Ctrl+V',   keys: ['ctrl', 'v'] },
  { label: 'Ctrl+Z',   keys: ['ctrl', 'z'] },
  { label: 'Ctrl+A',   keys: ['ctrl', 'a'] },
  { label: 'Ctrl+S',   keys: ['ctrl', 's'] },
  { label: 'Ctrl+X',   keys: ['ctrl', 'x'] },
  { label: 'Alt+F4',   keys: ['alt', 'f4'] },
  { label: 'Alt+Tab',  keys: ['alt', 'tab'] },
  { label: 'Win+D',    keys: ['win', 'd'] },
  { label: 'Win+L',    keys: ['win', 'l'] },
];

const SPECIAL_KEYS: Array<{ label: string; key: string }> = [
  { label: 'Esc',    key: 'esc' },
  { label: 'Tab',    key: 'tab' },
  { label: 'Enter',  key: 'enter' },
  { label: '⌫',      key: 'backspace' },
  { label: 'Del',    key: 'delete' },
  { label: 'Space',  key: 'space' },
  { label: '↑',      key: 'up' },
  { label: '↓',      key: 'down' },
  { label: '←',      key: 'left' },
  { label: '→',      key: 'right' },
  { label: 'Home',   key: 'home' },
  { label: 'End',    key: 'end' },
  { label: 'PgUp',   key: 'pageup' },
  { label: 'PgDn',   key: 'pagedown' },
];

function VirtualKeyboardDialog({ open, onClose, userName, deviceName }: {
  open: boolean; onClose: () => void; userName: string; deviceName: string;
}) {
  const [typeText, setTypeText] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const send = async (op: string, params: Record<string, unknown>) => {
    try {
      await minisApi.extRequest(userName, deviceName, 'vkbd', { op, ...params });
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Error');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Virtual Keyboard — {deviceName}
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        {status && <Alert severity="error" sx={{ mb: 2 }}>{status}</Alert>}

        {/* Type text */}
        <Typography variant="subtitle2" gutterBottom>Type Text</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small" fullWidth label="Text to type" value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { send('type_text', { text: typeText }); setTypeText(''); } }}
          />
          <Button variant="contained" onClick={() => { send('type_text', { text: typeText }); setTypeText(''); }} disabled={!typeText}>
            Send
          </Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Special keys */}
        <Typography variant="subtitle2" gutterBottom>Special Keys</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {SPECIAL_KEYS.map(({ label, key }) => (
            <Button key={key} size="small" variant="outlined" onClick={() => send('key_press', { key })}
              sx={{ minWidth: 52, fontFamily: 'monospace' }}>
              {label}
            </Button>
          ))}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Hotkeys */}
        <Typography variant="subtitle2" gutterBottom>Hotkeys</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {HOTKEY_PRESETS.map(({ label, keys }) => (
            <Button key={label} size="small" variant="outlined" onClick={() => send('hotkey', { keys })}
              sx={{ fontFamily: 'monospace' }}>
              {label}
            </Button>
          ))}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Custom key */}
        <Typography variant="subtitle2" gutterBottom>Custom Key</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" label="Key name (e.g. f5, ctrl)" value={customKey}
            onChange={(e) => setCustomKey(e.target.value)} sx={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && customKey) { send('key_press', { key: customKey }); } }}
          />
          <Button variant="outlined" onClick={() => send('key_press', { key: customKey })} disabled={!customKey}>Press</Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── VirtualMouseDialog ───────────────────────────────────────────────────────

function VirtualMouseDialog({ open, onClose, userName, deviceName }: {
  open: boolean; onClose: () => void; userName: string; deviceName: string;
}) {
  const [posX, setPosX] = useState('');
  const [posY, setPosY] = useState('');
  const [step, setStep] = useState('50');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [screenSize, setScreenSize] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const send = async (op: string, params: Record<string, unknown> = {}) => {
    try {
      const res = await minisApi.extRequest(userName, deviceName, 'vmouse', { op, ...params });
      setStatus(null);
      return (res as { data?: unknown }).data;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Error');
      return undefined;
    }
  };

  const refreshPos = async () => {
    const data = await send('get_pos') as { x: number; y: number } | undefined;
    if (data) setCursorPos(data);
  };

  const refreshSize = async () => {
    const data = await send('get_size') as { width: number; height: number } | undefined;
    if (data) setScreenSize(data);
  };

  const px = parseInt(step) || 50;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Virtual Mouse — {deviceName}
        <IconButton size="small" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        {status && <Alert severity="error" sx={{ mb: 2 }}>{status}</Alert>}

        {/* Info */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          <Typography variant="body2">
            Cursor: {cursorPos ? `(${cursorPos.x}, ${cursorPos.y})` : '—'}
          </Typography>
          <Typography variant="body2">
            Screen: {screenSize ? `${screenSize.width}×${screenSize.height}` : '—'}
          </Typography>
          <Button size="small" startIcon={<Refresh />} onClick={() => { refreshPos(); refreshSize(); }}>
            Refresh
          </Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Click buttons */}
        <Typography variant="subtitle2" gutterBottom>Click</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="outlined" onClick={() => send('click', { button: 'left' })}>Left</Button>
          <Button variant="outlined" onClick={() => send('double_click', { button: 'left' })}>Double</Button>
          <Button variant="outlined" onClick={() => send('click', { button: 'right' })}>Right</Button>
          <Button variant="outlined" onClick={() => send('click', { button: 'middle' })}>Middle</Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Scroll */}
        <Typography variant="subtitle2" gutterBottom>Scroll</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button variant="outlined" onClick={() => send('scroll', { dy: 3 })}>↑ Up</Button>
          <Button variant="outlined" onClick={() => send('scroll', { dy: -3 })}>↓ Down</Button>
          <Button variant="outlined" onClick={() => send('scroll', { dx: 3 })}>→ Right</Button>
          <Button variant="outlined" onClick={() => send('scroll', { dx: -3 })}>← Left</Button>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* D-pad move */}
        <Typography variant="subtitle2" gutterBottom>
          Move relative
          <TextField size="small" label="step px" value={step} onChange={(e) => setStep(e.target.value)}
            sx={{ ml: 1, width: 80 }} inputProps={{ style: { padding: '4px 8px' } }} />
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.5, width: 160, mb: 2 }}>
          <Box />
          <Button variant="outlined" size="small" onClick={() => send('move_rel', { dx: 0, dy: -px })}>↑</Button>
          <Box />
          <Button variant="outlined" size="small" onClick={() => send('move_rel', { dx: -px, dy: 0 })}>←</Button>
          <Button variant="outlined" size="small" onClick={() => { refreshPos(); }}>•</Button>
          <Button variant="outlined" size="small" onClick={() => send('move_rel', { dx: px, dy: 0 })}>→</Button>
          <Box />
          <Button variant="outlined" size="small" onClick={() => send('move_rel', { dx: 0, dy: px })}>↓</Button>
          <Box />
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* Absolute move */}
        <Typography variant="subtitle2" gutterBottom>Move to position</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" label="X" value={posX} onChange={(e) => setPosX(e.target.value)} sx={{ width: 80 }} />
          <TextField size="small" label="Y" value={posY} onChange={(e) => setPosY(e.target.value)} sx={{ width: 80 }} />
          <Button variant="contained"
            onClick={() => send('move', { x: parseInt(posX), y: parseInt(posY) })}
            disabled={!posX || !posY}>
            Move
          </Button>
          <Button variant="outlined"
            onClick={() => send('click', { button: 'left', x: parseInt(posX), y: parseInt(posY) })}
            disabled={!posX || !posY}>
            Click here
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default IotDevicePage;
