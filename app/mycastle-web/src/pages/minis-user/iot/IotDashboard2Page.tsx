import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Grid, CircularProgress, Alert,
  Chip, IconButton, Tooltip, Button,
} from '@mui/material';
import {
  Refresh, Settings, Thermostat, Opacity, WbSunny, Bolt,
  ToggleOn, ToggleOff, Sensors, RadioButtonChecked,
  PlayArrow, ArrowDropDown, ElectricMeter,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type {
  IotDeviceConfig, TelemetryRecord, DeviceShare,
  IotEntity, IotSensorEntity, TelemetryMetric,
} from '@mhersztowski/core';
import { loadDashboard2Config } from './dashboard2Config';
import type { Dashboard2Config, D2CardConfig, D2SectionConfig } from './dashboard2Config';

// ── Types ──────────────────────────────────────────────────────────────────

interface DeviceData {
  deviceId: string;
  ownerUserId: string;
  config: IotDeviceConfig | null;
  latest: TelemetryRecord | null;
  status: string;
}

type OnTileCommand = (
  ownerUserId: string,
  deviceId: string,
  commandName: string,
  payload: Record<string, unknown>,
) => void;

function deviceKey(ownerUserId: string, deviceId: string) {
  return `${ownerUserId}/${deviceId}`;
}

// ── Entity icon ────────────────────────────────────────────────────────────

function entityIcon(entity: IotEntity, isActive: boolean) {
  const active = isActive ? 'warning.main' : 'text.disabled';
  const green = isActive ? 'success.main' : 'text.disabled';
  const sx = { fontSize: 22 };

  if (entity.type === 'sensor') {
    const unit = (entity as IotSensorEntity).unit ?? '';
    if (unit === '°C' || unit === '°F') return <Thermostat sx={{ ...sx, color: 'info.main' }} />;
    if (unit === '%') return <Opacity sx={{ ...sx, color: 'info.light' }} />;
    if (unit === 'lx') return <WbSunny sx={{ ...sx, color: 'warning.light' }} />;
    if (['W', 'kW', 'kWh'].includes(unit)) return <Bolt sx={{ ...sx, color: 'warning.main' }} />;
    if (unit === 'V') return <ElectricMeter sx={{ ...sx, color: 'text.secondary' }} />;
    return <Sensors sx={{ ...sx, color: 'text.secondary' }} />;
  }
  if (entity.type === 'binary_sensor') return <RadioButtonChecked sx={{ ...sx, color: green }} />;
  if (entity.type === 'switch') return isActive
    ? <ToggleOn sx={{ ...sx, color: 'success.main' }} />
    : <ToggleOff sx={{ ...sx, color: 'text.disabled' }} />;
  if (entity.type === 'button') return <PlayArrow sx={{ ...sx, color: active }} />;
  if (entity.type === 'select') return <ArrowDropDown sx={{ ...sx, color: 'text.secondary' }} />;
  return <Sensors sx={{ ...sx, color: 'text.secondary' }} />;
}

// ── Entity tile (compact HA-style card) ────────────────────────────────────

interface EntityTileProps {
  card: D2CardConfig;
  entity: IotEntity | undefined;
  metric: TelemetryMetric | undefined;
  isOnline: boolean;
  isSending: boolean;
  onCommand: OnTileCommand;
}

function EntityTile({ card, entity, metric, isOnline, isSending, onCommand }: EntityTileProps) {
  const label = card.label ?? entity?.name ?? card.entityId;

  const isActive = (() => {
    if (!metric) return false;
    if (typeof metric.value === 'boolean') return metric.value;
    if (metric.value === 'on') return true;
    return false;
  })();

  const displayValue = (() => {
    if (!metric) return '—';
    const v = metric.value;
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number') {
      const unit = entity?.type === 'sensor' ? ((entity as IotSensorEntity).unit ?? '') : '';
      return unit ? `${v.toFixed(1)} ${unit}` : v.toFixed(1);
    }
    return String(v);
  })();

  const isSwitch = entity?.type === 'switch';
  const isButton = entity?.type === 'button';
  const canToggle = isSwitch && isOnline && !isSending;

  const handleClick = () => {
    if (!canToggle) return;
    onCommand(card.ownerUserId ?? '', card.deviceId, card.entityId, { state: !isActive });
  };

  const handleButtonPress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline || isSending) return;
    onCommand(card.ownerUserId ?? '', card.deviceId, card.entityId, {});
  };

  const activeBg = isSwitch && isActive ? 'rgba(255, 193, 7, 0.12)' : undefined;

  return (
    <Paper
      variant="outlined"
      onClick={handleClick}
      sx={{
        p: '8px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        cursor: canToggle ? 'pointer' : 'default',
        bgcolor: activeBg,
        opacity: !isOnline ? 0.55 : 1,
        borderRadius: 2,
        minHeight: 52,
        transition: 'background-color 0.15s',
        '&:hover': canToggle ? { bgcolor: 'action.hover' } : {},
      }}
    >
      {entity && entityIcon(entity, isActive)}

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: 'block', lineHeight: 1.2, fontSize: '0.68rem' }}
        >
          {label}
        </Typography>

        {isButton ? (
          <Button
            size="small"
            variant="outlined"
            disabled={!isOnline || isSending}
            onClick={handleButtonPress}
            sx={{ mt: 0.25, py: 0, fontSize: '0.7rem', minWidth: 0 }}
          >
            Press
          </Button>
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, fontSize: '0.82rem' }} noWrap>
            {displayValue}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

// ── Section panel ──────────────────────────────────────────────────────────

interface SectionPanelProps {
  section: D2SectionConfig;
  deviceDataMap: Map<string, DeviceData>;
  sendingKey: string | null;
  onCommand: OnTileCommand;
  userName: string;
}

function SectionPanel({ section, deviceDataMap, sendingKey, onCommand, userName }: SectionPanelProps) {
  return (
    <Paper sx={{ p: 1.5, height: '100%' }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontSize: '0.68rem',
          display: 'block',
          mb: 1,
        }}
      >
        {section.title}
      </Typography>

      <Grid container spacing={0.75}>
        {section.cards.map((card) => {
          const owner = card.ownerUserId ?? userName;
          const data = deviceDataMap.get(deviceKey(owner, card.deviceId));
          const entity = data?.config?.entities?.find((e) => e.id === card.entityId);
          const metric = data?.latest?.metrics.find((m) => m.key === card.entityId);
          const isOnline = data?.status === 'ONLINE';
          const isSending = sendingKey === `${owner}/${card.deviceId}/${card.entityId}`;

          return (
            <Grid item xs={6} key={card.id}>
              <EntityTile
                card={{ ...card, ownerUserId: owner }}
                entity={entity}
                metric={metric}
                isOnline={isOnline ?? false}
                isSending={isSending}
                onCommand={onCommand}
              />
            </Grid>
          );
        })}

        {section.cards.length === 0 && (
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              No cards — add them in Dashboard Settings.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Paper>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const AUTO_REFRESH_MS = 10_000;

function IotDashboard2Page() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();

  const [dashConfig, setDashConfig] = useState<Dashboard2Config>({ sections: [] });
  const [deviceDataMap, setDeviceDataMap] = useState<Map<string, DeviceData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceDataMapRef = useRef<Map<string, DeviceData>>(new Map());

  // Keep ref in sync with state
  useEffect(() => { deviceDataMapRef.current = deviceDataMap; }, [deviceDataMap]);

  // Load dashboard config from localStorage (and reload when window focuses after config edit)
  useEffect(() => {
    if (!userName) return;
    const reload = () => setDashConfig(loadDashboard2Config(userName));
    reload();
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [userName]);

  const loadData = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      // allSettled — a single failing/slow endpoint must NOT blank the dashboard.
      const [devicesR, statusesR, sharedR] = await Promise.allSettled([
        minisApi.getUserDevices(userName),
        minisApi.getIotDevices(userName),
        minisApi.getSharedDevices(userName),
      ]);
      const allDevices = devicesR.status === 'fulfilled' ? devicesR.value : [];
      const iotStatuses = (statusesR.status === 'fulfilled' ? statusesR.value : []) as any[];
      const sharedDevices = sharedR.status === 'fulfilled' ? sharedR.value : [];
      const iotDevices = allDevices.filter((d: any) => d.isIot);

      const newMap = new Map<string, DeviceData>();

      // Per-device fetches are independent — one failing/slow device is skipped,
      // the rest of the dashboard still renders (allSettled, not all).
      await Promise.allSettled([
        ...iotDevices.map(async (device: any) => {
          const [config, latestRaw] = await Promise.all([
            minisApi.getIotConfig(userName, device.name),
            minisApi.getTelemetryLatest(userName, device.name),
          ]);
          const latest = latestRaw && 'metrics' in (latestRaw as any) ? latestRaw as TelemetryRecord : null;
          const statusInfo = (iotStatuses as any[]).find((s) => s.deviceId === device.name);
          newMap.set(deviceKey(userName, device.name), {
            deviceId: device.name,
            ownerUserId: userName,
            config: config as IotDeviceConfig | null,
            latest,
            status: statusInfo?.status ?? 'UNKNOWN',
          });
        }),
        ...sharedDevices.map(async (share: DeviceShare) => {
          const [config, latestRaw] = await Promise.all([
            minisApi.getIotConfig(share.ownerUserId, share.deviceId),
            minisApi.getTelemetryLatest(share.ownerUserId, share.deviceId),
          ]);
          const latest = latestRaw && 'metrics' in (latestRaw as any) ? latestRaw as TelemetryRecord : null;
          newMap.set(deviceKey(share.ownerUserId, share.deviceId), {
            deviceId: share.deviceId,
            ownerUserId: share.ownerUserId,
            config: config as IotDeviceConfig | null,
            latest,
            status: 'UNKNOWN',
          });
        }),
      ]);

      setDeviceDataMap(newMap);
      const online = iotStatuses.filter((s) => s.status === 'ONLINE').length;
      setOnlineCount(online);
      setTotalCount(iotDevices.length);
      const topFailed = [devicesR, statusesR, sharedR].filter((r) => r.status === 'rejected').length;
      setError(topFailed ? 'Część danych IoT jest chwilowo niedostępna — pokazuję to, co się udało.' : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [userName]);

  // Stable refresh — uses ref so interval doesn't need to be recreated
  const refreshTelemetry = useCallback(async () => {
    if (!userName) return;
    const currentMap = deviceDataMapRef.current;
    if (currentMap.size === 0) return;

    const entries = Array.from(currentMap.entries());
    try {
      const [iotStatuses, ...latestResults] = await Promise.all([
        minisApi.getIotDevices(userName),
        ...entries.map(([, d]) => minisApi.getTelemetryLatest(d.ownerUserId, d.deviceId)),
      ]);

      const online = (iotStatuses as any[]).filter((s: any) => s.status === 'ONLINE').length;
      setOnlineCount(online);

      setDeviceDataMap((prev) => {
        const next = new Map(prev);
        entries.forEach(([key, d], i) => {
          const raw = latestResults[i];
          const latest = raw && 'metrics' in (raw as any) ? raw as TelemetryRecord : null;
          const statusInfo = (iotStatuses as any[]).find((s: any) => s.deviceId === d.deviceId);
          next.set(key, { ...d, latest, status: statusInfo?.status ?? d.status });
        });
        return next;
      });
    } catch {
      // silent
    }
  }, [userName]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (deviceDataMap.size === 0) return;
    intervalRef.current = setInterval(refreshTelemetry, AUTO_REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshTelemetry, deviceDataMap.size]);

  const handleCommand: OnTileCommand = async (ownerUserId, deviceId, commandName, payload) => {
    const owner = ownerUserId || userName!;
    const key = `${owner}/${deviceId}/${payload.entity_id ?? commandName}`;
    setSendingKey(key);
    try {
      await minisApi.sendCommand(owner, deviceId, commandName, payload);
      setTimeout(refreshTelemetry, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setSendingKey(null);
    }
  };

  const statusChipColor = onlineCount === totalCount && totalCount > 0 ? 'success' : 'default';

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Dashboard</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {totalCount > 0 && (
            <Chip
              size="small"
              label={`${onlineCount} / ${totalCount} online`}
              color={statusChipColor as any}
              variant="outlined"
            />
          )}
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={loadData} disabled={loading}>
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Dashboard Settings">
            <IconButton size="small" onClick={() => navigate(`/user/${userName}/iot/dashboard2/config`)}>
              <Settings fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading && <CircularProgress size={24} sx={{ mb: 2 }} />}

      {/* Empty state */}
      {!loading && dashConfig.sections.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Dashboard is empty. Add sections and cards in Settings.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Settings />}
            onClick={() => navigate(`/user/${userName}/iot/dashboard2/config`)}
          >
            Open Settings
          </Button>
        </Paper>
      )}

      {/* Sections grid */}
      <Grid container spacing={2}>
        {dashConfig.sections.map((section) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={section.id}>
            <SectionPanel
              section={section}
              deviceDataMap={deviceDataMap}
              sendingKey={sendingKey}
              onCommand={handleCommand}
              userName={userName!}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default IotDashboard2Page;
