import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Typography, Button, Grid, Paper, Chip, Alert,
} from '@mui/material';
import { Add, PlayArrow, Stop } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { EmulatorService } from '@modules/iot-emulator';
import type { EmulatedDeviceConfig, EmulatedDeviceState, ActivityLogEntry, EmulatorEventType } from '@modules/iot-emulator';
import EmulatedDeviceCard from './components/EmulatedDeviceCard';
import EditDeviceDialog from './components/EditDeviceDialog';
import ActivityLog from './components/ActivityLog';

function IotEmulatorPage() {
  const { userId } = useParams<{ userId: string }>();
  const serviceRef = useRef<EmulatorService | null>(null);

  // Initialize service once
  if (!serviceRef.current) {
    serviceRef.current = new EmulatorService();
  }
  const service = serviceRef.current;

  const [configs, setConfigs] = useState<EmulatedDeviceConfig[]>([]);
  const [states, setStates] = useState<Map<string, EmulatedDeviceState>>(new Map());
  const [log, setLog] = useState<ActivityLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<{ open: boolean; config?: EmulatedDeviceConfig }>({ open: false });

  // Periodically refresh states for uptime counter
  const refreshStates = useCallback(() => {
    setStates(new Map(service.getAllStates()));
    setConnected(service.isConnected());
  }, [service]);

  useEffect(() => {
    const handler = (event: EmulatorEventType) => {
      if (event === 'configsChanged') setConfigs(service.getConfigs());
      if (event === 'stateChange') refreshStates();
      if (event === 'logEntry') setLog([...service.getActivityLog()]);
    };

    service.on(handler);
    setConfigs(service.getConfigs());
    refreshStates();

    // Refresh uptime every second
    const uptimeInterval = setInterval(refreshStates, 1000);

    return () => {
      service.off(handler);
      clearInterval(uptimeInterval);
      service.dispose();
    };
  }, [service, refreshStates]);

  const handleStart = async (configId: string) => {
    try {
      setError(null);
      await service.startDevice(configId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start device');
    }
  };

  const handleStop = (configId: string) => {
    service.stopDevice(configId);
  };

  const handleStartAll = async () => {
    try {
      setError(null);
      await service.startAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start devices');
    }
  };

  const handleStopAll = () => {
    service.stopAll();
  };

  const handleSave = (config: EmulatedDeviceConfig) => {
    if (service.getConfig(config.id)) {
      service.updateConfig(config.id, config);
    } else {
      service.addConfig(config);
    }
  };

  const handleDelete = (configId: string) => {
    service.removeConfig(configId);
  };

  const handleDuplicate = (configId: string) => {
    service.duplicateConfig(configId);
  };

  const handleAckCommand = (configId: string, commandId: string, status: 'ACKNOWLEDGED' | 'FAILED') => {
    service.ackCommand(configId, commandId, status);
  };

  const anyRunning = Array.from(states.values()).some((s) => s.isRunning);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4">IoT Emulator</Typography>
          <Chip
            label={connected ? 'MQTT Connected' : 'MQTT Disconnected'}
            size="small"
            color={connected ? 'success' : 'default'}
            variant="outlined"
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<Add />}
            variant="contained"
            onClick={() => setEditDialog({ open: true })}
          >
            Add Device
          </Button>
          {configs.length > 0 && (
            <>
              <Button
                startIcon={<PlayArrow />}
                onClick={handleStartAll}
                disabled={configs.length === 0}
                color="success"
                variant="outlined"
              >
                Start All
              </Button>
              <Button
                startIcon={<Stop />}
                onClick={handleStopAll}
                disabled={!anyRunning}
                color="error"
                variant="outlined"
              >
                Stop All
              </Button>
            </>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Device cards */}
        <Grid item xs={12} md={7}>
          {configs.length === 0 && (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                No emulated devices configured yet.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setEditDialog({ open: true })}
              >
                Create Your First Device
              </Button>
            </Paper>
          )}
          {configs.map((config) => (
            <EmulatedDeviceCard
              key={config.id}
              config={config}
              state={states.get(config.id) ?? {
                configId: config.id,
                isRunning: false,
                isConnected: false,
                startedAt: null,
                messagesSent: 0,
                messagesReceived: 0,
                lastTelemetrySentAt: null,
                lastHeartbeatSentAt: null,
                pendingCommands: [],
              }}
              onStart={() => handleStart(config.id)}
              onStop={() => handleStop(config.id)}
              onEdit={() => setEditDialog({ open: true, config })}
              onDuplicate={() => handleDuplicate(config.id)}
              onDelete={() => handleDelete(config.id)}
              onAckCommand={(cmdId, status) => handleAckCommand(config.id, cmdId, status)}
            />
          ))}
        </Grid>

        {/* Activity log */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <ActivityLog entries={log} onClear={() => service.clearLog()} />
          </Paper>
        </Grid>
      </Grid>

      {/* Edit dialog */}
      <EditDeviceDialog
        open={editDialog.open}
        config={editDialog.config}
        userId={userId || ''}
        onSave={handleSave}
        onClose={() => setEditDialog({ open: false })}
      />
    </Box>
  );
}

export default IotEmulatorPage;
