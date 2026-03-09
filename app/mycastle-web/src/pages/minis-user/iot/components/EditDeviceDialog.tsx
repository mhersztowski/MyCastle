import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import type { EmulatedDeviceConfig, CommandAckMode } from '@modules/iot-emulator';
import { DEVICE_PRESETS } from '@modules/iot-emulator';
import MetricConfigEditor from './MetricConfigEditor';

interface EditDeviceDialogProps {
  open: boolean;
  config?: EmulatedDeviceConfig;
  userId: string;
  onSave: (config: EmulatedDeviceConfig) => void;
  onClose: () => void;
}

const ACK_MODES: { value: CommandAckMode; label: string; description: string }[] = [
  { value: 'auto-ack', label: 'Auto ACK', description: 'Automatically acknowledges received commands' },
  { value: 'auto-fail', label: 'Auto Fail', description: 'Automatically fails received commands' },
  { value: 'manual', label: 'Manual', description: 'Commands queue for manual ACK/Fail' },
];

function EditDeviceDialog({ open, config, userId, onSave, onClose }: EditDeviceDialogProps) {
  const isEdit = !!config;
  const [form, setForm] = useState<EmulatedDeviceConfig>({
    id: '',
    deviceId: '',
    userId: '',
    name: '',
    metrics: [],
    telemetryIntervalSec: 10,
    heartbeatIntervalSec: 60,
    commandAckMode: 'auto-ack',
    commandAckDelaySec: 1,
    rssi: -50,
    battery: 85,
  });

  useEffect(() => {
    if (open) {
      if (config) {
        setForm(structuredClone(config));
      } else {
        setForm({
          id: crypto.randomUUID(),
          deviceId: `dev-emu-${Date.now().toString(36)}`,
          userId,
          name: '',
          metrics: [],
          telemetryIntervalSec: 10,
          heartbeatIntervalSec: 60,
          commandAckMode: 'auto-ack',
          commandAckDelaySec: 1,
          rssi: -50,
          battery: 85,
        });
      }
    }
  }, [open, config, userId]);

  const handlePreset = (presetKey: string) => {
    const preset = DEVICE_PRESETS[presetKey];
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || preset.name,
      metrics: structuredClone(preset.metrics),
      telemetryIntervalSec: preset.telemetryIntervalSec,
      heartbeatIntervalSec: preset.heartbeatIntervalSec,
    }));
  };

  const handleSave = () => {
    onSave(form);
    onClose();
  };

  const isValid = form.name.trim() && form.deviceId.trim() && form.metrics.length > 0 &&
    form.metrics.every((m) => m.key.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Emulated Device' : 'Create Emulated Device'}</DialogTitle>
      <DialogContent>
        {/* Preset selector */}
        {!isEdit && (
          <TextField
            select
            fullWidth
            label="Load Preset"
            value=""
            onChange={(e) => handlePreset(e.target.value)}
            size="small"
            sx={{ mt: 1, mb: 2 }}
          >
            <MenuItem value="" disabled>Select a preset...</MenuItem>
            {Object.entries(DEVICE_PRESETS).map(([key, preset]) => (
              <MenuItem key={key} value={key}>{preset.name}</MenuItem>
            ))}
          </TextField>
        )}

        {/* Basic fields */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, mt: isEdit ? 1 : 0 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            size="small"
            fullWidth
            placeholder="My Temperature Sensor"
          />
          <TextField
            label="Device ID"
            value={form.deviceId}
            onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
            size="small"
            fullWidth
            placeholder="dev-emu-1"
          />
        </Box>

        <TextField
          label="User ID"
          value={form.userId}
          onChange={(e) => setForm({ ...form, userId: e.target.value })}
          size="small"
          fullWidth
          sx={{ mb: 2 }}
        />

        {/* Metrics */}
        <MetricConfigEditor
          metrics={form.metrics}
          onChange={(metrics) => setForm({ ...form, metrics })}
        />

        {/* Timing */}
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Timing</Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Telemetry Interval (s)"
            type="number"
            value={form.telemetryIntervalSec}
            onChange={(e) => setForm({ ...form, telemetryIntervalSec: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            size="small"
            sx={{ width: 180 }}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Heartbeat Interval (s)"
            type="number"
            value={form.heartbeatIntervalSec}
            onChange={(e) => setForm({ ...form, heartbeatIntervalSec: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            size="small"
            sx={{ width: 180 }}
            inputProps={{ min: 1 }}
          />
        </Box>

        {/* Command ACK */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Command Response</Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            select
            label="ACK Mode"
            value={form.commandAckMode}
            onChange={(e) => setForm({ ...form, commandAckMode: e.target.value as CommandAckMode })}
            size="small"
            sx={{ width: 180 }}
            helperText={ACK_MODES.find((m) => m.value === form.commandAckMode)?.description}
          >
            {ACK_MODES.map((mode) => (
              <MenuItem key={mode.value} value={mode.value}>{mode.label}</MenuItem>
            ))}
          </TextField>
          {form.commandAckMode !== 'manual' && (
            <TextField
              label="ACK Delay (s)"
              type="number"
              value={form.commandAckDelaySec}
              onChange={(e) => setForm({ ...form, commandAckDelaySec: Math.max(0, parseFloat(e.target.value) || 0) })}
              size="small"
              sx={{ width: 130 }}
              inputProps={{ min: 0, step: 0.5 }}
            />
          )}
        </Box>

        {/* Advanced */}
        <Accordion disableGutters variant="outlined" sx={{ mt: 1 }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle2">Advanced</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label="RSSI (dBm)"
                type="number"
                value={form.rssi}
                onChange={(e) => setForm({ ...form, rssi: parseInt(e.target.value, 10) || -50 })}
                size="small"
                sx={{ width: 120 }}
              />
              <TextField
                label="Battery (%)"
                type="number"
                value={form.battery}
                onChange={(e) => setForm({ ...form, battery: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })}
                size="small"
                sx={{ width: 120 }}
                inputProps={{ min: 0, max: 100 }}
              />
            </Box>
            <TextField
              label="Broker URL (override)"
              value={form.brokerUrl || ''}
              onChange={(e) => setForm({ ...form, brokerUrl: e.target.value || undefined })}
              size="small"
              fullWidth
              placeholder="ws://localhost:1902/mqtt (auto-detected if empty)"
            />
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!isValid}>
          {isEdit ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default EditDeviceDialog;
