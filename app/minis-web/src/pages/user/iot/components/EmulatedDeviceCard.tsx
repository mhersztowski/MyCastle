import { Box, Typography, Paper, Chip, IconButton, Tooltip } from '@mui/material';
import { PlayArrow, Stop, Edit, ContentCopy, Delete } from '@mui/icons-material';
import type { EmulatedDeviceConfig, EmulatedDeviceState } from '@modules/iot-emulator';
import { describeGenerator } from '@modules/iot-emulator';
import PendingCommandsList from './PendingCommandsList';

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return '-';
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

interface EmulatedDeviceCardProps {
  config: EmulatedDeviceConfig;
  state: EmulatedDeviceState;
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAckCommand: (commandId: string, status: 'ACKNOWLEDGED' | 'FAILED') => void;
}

function EmulatedDeviceCard({
  config, state, onStart, onStop, onEdit, onDuplicate, onDelete, onAckCommand,
}: EmulatedDeviceCardProps) {
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: state.isRunning ? 'success.main' : 'grey.500',
            flexShrink: 0,
          }}
        />
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', flexGrow: 1 }}>
          {config.name}
        </Typography>
        <Chip
          label={state.isRunning ? 'Running' : 'Stopped'}
          size="small"
          color={state.isRunning ? 'success' : 'default'}
          variant="outlined"
        />
        {state.isRunning && state.isConnected && (
          <Chip label="Connected" size="small" color="primary" variant="outlined" />
        )}
      </Box>

      {/* Device ID and User ID */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Device: <strong>{config.deviceId}</strong> | User: <strong>{config.userId}</strong>
      </Typography>

      {/* Metrics summary */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {config.metrics.length === 0
          ? 'No metrics configured'
          : config.metrics.map((m) => `${m.key}: ${describeGenerator(m.generator)}${m.unit ? ` ${m.unit}` : ''}`).join(' | ')}
      </Typography>

      {/* Stats when running */}
      {state.isRunning && (
        <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Sent: <strong>{state.messagesSent}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Received: <strong>{state.messagesReceived}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Uptime: <strong>{formatUptime(state.startedAt)}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Interval: <strong>{config.telemetryIntervalSec}s</strong>
          </Typography>
        </Box>
      )}

      {/* Action buttons */}
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {state.isRunning ? (
          <Tooltip title="Stop">
            <IconButton size="small" onClick={onStop} color="error">
              <Stop fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Start">
            <IconButton size="small" onClick={onStart} color="success">
              <PlayArrow fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Edit">
          <span>
            <IconButton size="small" onClick={onEdit} disabled={state.isRunning}>
              <Edit fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Duplicate">
          <IconButton size="small" onClick={onDuplicate}>
            <ContentCopy fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <span>
            <IconButton size="small" onClick={onDelete} disabled={state.isRunning} color="error">
              <Delete fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          ACK: {config.commandAckMode}
        </Typography>
      </Box>

      {/* Pending commands (manual mode) */}
      {state.isRunning && config.commandAckMode === 'manual' && (
        <PendingCommandsList
          commands={state.pendingCommands}
          onAck={onAckCommand}
        />
      )}
    </Paper>
  );
}

export default EmulatedDeviceCard;
