import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Alert, CircularProgress,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { MinisDeviceModel, MinisDeviceDefModel } from '@mhersztowski/core';

interface DeviceStatusInfo {
  deviceId: string;
  status: string;
  lastSeenAt: number;
}

function IotDevicesPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [statuses, setStatuses] = useState<DeviceStatusInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [allDevices, defs, iotStatuses] = await Promise.all([
        minisApi.getUserDevices(userId),
        minisApi.getDeviceDefs(),
        minisApi.getIotDevices(userId),
      ]);
      setDevices(allDevices.filter((d) => d.isIot));
      setDeviceDefs(defs);
      setStatuses(iotStatuses);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const getStatus = (deviceId: string) => {
    const info = statuses.find((s) => s.deviceId === deviceId);
    return info?.status ?? 'UNKNOWN';
  };

  const getLastSeen = (deviceId: string) => {
    const info = statuses.find((s) => s.deviceId === deviceId);
    if (!info || !info.lastSeenAt) return '-';
    return new Date(info.lastSeenAt).toLocaleString();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'ONLINE': return 'success';
      case 'OFFLINE': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>IoT Devices</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress />}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Device</TableCell>
              <TableCell>Serial Number</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last Seen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {devices.map((device) => (
              <TableRow
                key={device.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/user/${userId}/iot/device/${device.id}`)}
              >
                <TableCell>{deviceDefs.find((d) => d.id === device.deviceDefId)?.name ?? device.deviceDefId}</TableCell>
                <TableCell>{device.sn || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={getStatus(device.id)}
                    color={statusColor(getStatus(device.id)) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>{getLastSeen(device.id)}</TableCell>
              </TableRow>
            ))}
            {!loading && devices.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center">No IoT devices found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default IotDevicesPage;
