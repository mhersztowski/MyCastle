import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Alert, CircularProgress,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { MinisDeviceModel, MinisDeviceDefModel, DeviceShare } from '@mhersztowski/core';

interface DeviceStatusInfo {
  deviceId: string;
  status: string;
  lastSeenAt: number;
}

function IotDevicesPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [deviceDefs, setDeviceDefs] = useState<MinisDeviceDefModel[]>([]);
  const [statuses, setStatuses] = useState<DeviceStatusInfo[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<DeviceShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userName) return;
    setLoading(true);
    try {
      const [allDevices, defs, iotStatuses, sharedDevices] = await Promise.all([
        minisApi.getUserDevices(userName),
        minisApi.getDeviceDefs(),
        minisApi.getIotDevices(userName),
        minisApi.getSharedDevices(userName),
      ]);
      setDevices(allDevices.filter((d) => d.isIot));
      setDeviceDefs(defs);
      setStatuses(iotStatuses);
      setSharedWithMe(sharedDevices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [userName]);

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">IoT Devices</Typography>
      </Box>

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
                onClick={() => navigate(`/user/${userName}/iot/device/${device.name}`)}
              >
                <TableCell>{device.name || deviceDefs.find((d) => d.id === device.deviceDefId)?.name || device.id.slice(0, 8)}</TableCell>
                <TableCell>{device.sn || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={getStatus(device.name)}
                    color={statusColor(getStatus(device.name)) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>{getLastSeen(device.name)}</TableCell>
              </TableRow>
            ))}
            {!loading && devices.length === 0 && (
              <TableRow><TableCell colSpan={4} align="center">No IoT devices found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Shared with me */}
      {sharedWithMe.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Shared</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Device</TableCell>
                  <TableCell>Owner</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sharedWithMe.map((share) => (
                  <TableRow key={share.id}>
                    <TableCell>{share.deviceId}</TableCell>
                    <TableCell>{share.ownerUserId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
}

export default IotDevicesPage;
