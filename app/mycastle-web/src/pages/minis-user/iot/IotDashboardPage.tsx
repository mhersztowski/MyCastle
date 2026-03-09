import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Typography, Chip, Paper, Grid, Alert, CircularProgress,
  Card, CardContent, Button, ButtonGroup,
} from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import { EntityWidget } from './EntityWidgets';
import type { OnCommand } from './EntityWidgets';
import type {
  MinisDeviceModel, MinisDeviceDefModel,
  IotDeviceConfig, TelemetryRecord, IotActuatorCapability, DeviceShare,
} from '@mhersztowski/core';

interface DeviceStatusInfo {
  deviceId: string;
  status: string;
  lastSeenAt: number;
}

interface DeviceCardData {
  device: MinisDeviceModel;
  config: IotDeviceConfig | null;
  latest: TelemetryRecord | null;
  history?: TelemetryRecord[];
  isShared?: boolean;
  ownerUserId?: string;
}

const AUTO_REFRESH_MS = 10_000;
const SPARKLINE_LIMIT = 20;

function IotDashboardPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [statuses, setStatuses] = useState<DeviceStatusInfo[]>([]);
  const [cards, setCards] = useState<DeviceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingCmd, setSendingCmd] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFull = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [allDevices, defs, iotStatuses, sharedDevices] = await Promise.all([
        minisApi.getUserDevices(userName),
        minisApi.getDeviceDefs(),
        minisApi.getIotDevices(userName),
        minisApi.getSharedDevices(userName),
      ]);
      const iotDevices = allDevices.filter((d) => d.isIot);
      setDeviceDefs(defs);
      setStatuses(iotStatuses);

      const now = Date.now();
      const ownCards = await Promise.all(
        iotDevices.map(async (device) => {
          const [config, latestRaw, history] = await Promise.all([
            minisApi.getIotConfig(userName, device.name),
            minisApi.getTelemetryLatest(userName, device.name),
            minisApi.getTelemetryHistory(userName, device.name, now - 600_000, now, SPARKLINE_LIMIT),
          ]);
          const latest = latestRaw && 'metrics' in latestRaw ? latestRaw as TelemetryRecord : null;
          return { device, config, latest, history } as DeviceCardData;
        }),
      );

      const sharedCards = await Promise.all(
        sharedDevices.map(async (share: DeviceShare) => {
          const [config, latestRaw, history] = await Promise.all([
            minisApi.getIotConfig(share.ownerUserId, share.deviceId),
            minisApi.getTelemetryLatest(share.ownerUserId, share.deviceId),
            minisApi.getTelemetryHistory(share.ownerUserId, share.deviceId, now - 600_000, now, SPARKLINE_LIMIT),
          ]);
          const latest = latestRaw && 'metrics' in latestRaw ? latestRaw as TelemetryRecord : null;
          const device: MinisDeviceModel = {
            type: 'device',
            id: share.deviceId,
            name: share.deviceId,
            deviceDefId: '',
            isAssembled: true,
            isIot: true,
            sn: '',
          };
          return { device, config, latest, history, isShared: true, ownerUserId: share.ownerUserId } as DeviceCardData;
        }),
      );

      setCards([...ownCards, ...sharedCards]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  const refreshTelemetry = useCallback(async () => {
    if (!userName || cards.length === 0) return;
    try {
      const now = Date.now();
      const [updatedStatuses, ...results] = await Promise.all([
        minisApi.getIotDevices(userName),
        ...cards.flatMap((c) => {
          const owner = c.ownerUserId ?? userName;
          return [
            minisApi.getTelemetryLatest(owner, c.device.name),
            minisApi.getTelemetryHistory(owner, c.device.name, now - 600_000, now, SPARKLINE_LIMIT),
          ];
        }),
      ]);
      setStatuses(updatedStatuses);
      setCards((prev) =>
        prev.map((card, i) => {
          const latestRaw = results[i * 2];
          const history = results[i * 2 + 1] as TelemetryRecord[];
          const latest = latestRaw && 'metrics' in (latestRaw as any) ? latestRaw as TelemetryRecord : null;
          return { ...card, latest, history };
        }),
      );
    } catch {
      // silent
    }
  }, [userName, cards]);

  useEffect(() => { loadFull(); }, [loadFull]);

  useEffect(() => {
    if (cards.length === 0) return;
    intervalRef.current = setInterval(refreshTelemetry, AUTO_REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshTelemetry, cards.length]);

  const getStatus = (deviceId: string) => statuses.find((s) => s.deviceId === deviceId)?.status ?? 'UNKNOWN';

  const statusColor = (status: string) => {
    switch (status) {
      case 'ONLINE': return 'success';
      case 'OFFLINE': return 'error';
      default: return 'default';
    }
  };

  const statusDot = (status: string) => {
    const color = status === 'ONLINE' ? '#4caf50' : status === 'OFFLINE' ? '#f44336' : '#9e9e9e';
    return <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', bgcolor: color, mr: 1 }} />;
  };

  const getDeviceName = (device: MinisDeviceModel) =>
    device.name || deviceDefs.find((d) => d.id === device.deviceDefId)?.name || device.id.slice(0, 8);

  const handleSendCommand = async (ownerUser: string, deviceName: string, commandName: string, payload: Record<string, unknown>) => {
    setSendingCmd(`${deviceName}:${commandName}`);
    try {
      await minisApi.sendCommand(ownerUser, deviceName, commandName, payload);
      // Quick refresh to pick up state change from emulator
      setTimeout(refreshTelemetry, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setSendingCmd(null);
    }
  };

  const getActuatorControl = (cap: IotActuatorCapability) => {
    const entries = Object.entries(cap.payloadSchema);
    if (entries.length === 1 && typeof entries[0][1] === 'boolean') {
      return { type: 'toggle' as const, field: entries[0][0] };
    }
    return { type: 'button' as const };
  };

  // Extract sparkline history values for a given metric key
  const getMetricHistory = (history: TelemetryRecord[] | undefined, metricKey: string): number[] => {
    if (!history) return [];
    const values: number[] = [];
    // History is sorted DESC, reverse for chronological order
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i].metrics.find((m) => m.key === metricKey);
      if (m && typeof m.value === 'number') values.push(m.value);
    }
    return values;
  };

  const renderDeviceCard = (cardData: DeviceCardData) => {
    const { device, config, latest, history, isShared, ownerUserId } = cardData;
    const status = isShared ? 'UNKNOWN' : getStatus(device.name);
    const isOffline = status !== 'ONLINE';
    const entities = config?.entities ?? [];
    const hasEntities = entities.length > 0;

    // Old capability-based rendering (fallback)
    const sensors = config?.capabilities.filter((c) => c.type === 'sensor') ?? [];
    const actuators = isShared ? [] : (config?.capabilities.filter((c) => c.type === 'actuator') as IotActuatorCapability[] ?? []);

    const ownerUser = ownerUserId ?? userName!;
    const onEntityCommand: OnCommand = (_entityId, commandName, payload) => {
      handleSendCommand(ownerUser, device.name, commandName, payload);
    };

    return (
      <Grid item xs={12} sm={6} md={4} key={`${isShared ? 'shared-' : ''}${device.name}`}>
        <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', ...(isShared ? { borderLeft: '3px solid', borderColor: 'info.main' } : {}) }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {statusDot(status)}
              <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
                {getDeviceName(device)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              {isShared && <Chip label={`Shared by ${ownerUserId}`} color="info" size="small" />}
              {!isShared && <Chip label={status} color={statusColor(status) as any} size="small" />}
            </Box>
          </Box>

          {/* Entity-based rendering */}
          {hasEntities && (
            <Grid container spacing={1} sx={{ mb: 2 }}>
              {entities.map((entity) => {
                const metric = latest?.metrics.find((m) => m.key === entity.id);
                const metricHistory = entity.type === 'sensor' ? getMetricHistory(history, entity.id) : undefined;
                const isControlDisabled = isOffline || isShared || !!sendingCmd;
                return (
                  <Grid item xs={6} key={entity.id}>
                    <EntityWidget
                      entity={entity}
                      metric={metric}
                      history={metricHistory}
                      onCommand={onEntityCommand}
                      disabled={isControlDisabled}
                    />
                  </Grid>
                );
              })}
            </Grid>
          )}

          {/* Capability-based rendering (fallback when no entities) */}
          {!hasEntities && sensors.length > 0 && (
            <Grid container spacing={1} sx={{ mb: 2 }}>
              {sensors.map((sensor) => {
                const metric = latest?.metrics.find((m) => m.key === sensor.metricKey);
                const value = metric
                  ? typeof metric.value === 'number' ? metric.value.toFixed(1) : String(metric.value)
                  : '--';
                return (
                  <Grid item xs={6} sm={4} key={sensor.metricKey}>
                    <Card variant="outlined">
                      <CardContent sx={{ textAlign: 'center', py: 1, px: 1, '&:last-child': { pb: 1 } }}>
                        <Typography variant="h5" sx={{ fontWeight: 500 }}>{value}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {sensor.unit ? `${sensor.unit} ` : ''}{sensor.label}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}

          {/* No config message */}
          {!config && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No IoT config — configure capabilities on the device page.
            </Typography>
          )}

          {/* Actuator Controls (fallback when no entities) */}
          {!hasEntities && actuators.length > 0 && (
            <Box sx={{ mb: 2 }}>
              {actuators.map((actuator) => {
                const control = getActuatorControl(actuator);
                const cmdKey = (payload: Record<string, unknown>) => `${device.name}:${actuator.commandName}:${JSON.stringify(payload)}`;

                if (control.type === 'toggle') {
                  return (
                    <Box key={actuator.commandName} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="body2" sx={{ minWidth: 60 }}>{actuator.label}:</Typography>
                      <ButtonGroup size="small" disabled={isOffline}>
                        <Button
                          variant="contained" color="success"
                          disabled={isOffline || sendingCmd === cmdKey({ [control.field]: true })}
                          onClick={() => handleSendCommand(ownerUser, device.name, actuator.commandName, { [control.field]: true })}
                        >
                          ON
                        </Button>
                        <Button
                          variant="contained" color="error"
                          disabled={isOffline || sendingCmd === cmdKey({ [control.field]: false })}
                          onClick={() => handleSendCommand(ownerUser, device.name, actuator.commandName, { [control.field]: false })}
                        >
                          OFF
                        </Button>
                      </ButtonGroup>
                    </Box>
                  );
                }

                return (
                  <Box key={actuator.commandName} sx={{ mb: 1 }}>
                    <Button
                      size="small" variant="outlined"
                      disabled={isOffline || sendingCmd === cmdKey(actuator.payloadSchema)}
                      onClick={() => handleSendCommand(ownerUser, device.name, actuator.commandName, actuator.payloadSchema)}
                    >
                      {actuator.label}
                    </Button>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Footer */}
          {!isShared && (
            <Box sx={{ mt: 'auto', pt: 1 }}>
              <Button
                size="small"
                onClick={() => navigate(`/user/${userName}/iot/device/${device.name}`)}
              >
                Open Device
              </Button>
            </Box>
          )}
        </Paper>
      </Grid>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">IoT Dashboard</Typography>
        <Button startIcon={<Refresh />} onClick={loadFull}>Refresh</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      {!loading && cards.length === 0 && (
        <Typography color="text.secondary">No IoT devices found. Add devices and mark them as IoT.</Typography>
      )}

      <Grid container spacing={3}>
        {cards.filter((c) => !c.isShared).map(renderDeviceCard)}
      </Grid>

      {cards.some((c) => c.isShared) && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Shared</Typography>
          <Grid container spacing={3}>
            {cards.filter((c) => c.isShared).map(renderDeviceCard)}
          </Grid>
        </Box>
      )}
    </Box>
  );
}

export default IotDashboardPage;
