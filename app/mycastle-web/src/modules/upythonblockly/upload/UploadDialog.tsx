import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Select,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography,
  FormControl,
  InputLabel,
} from '@mui/material';
import { MpySerialReplService } from '../repl/MpySerialReplService';
import { MpyWebReplService } from '../repl/MpyWebReplService';
import { minisApi } from '../../../services/MinisApiService';
import type { MinisDeviceModel } from '@mhersztowski/core';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

type UploadMode = 'run' | 'save';

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  code: string;
  userName?: string;
  board?: string;
  projectId?: string;
  deviceName?: string;
  libraries?: Array<{ url: string; remoteName: string }>;
  extraFiles?: Array<{ name: string; content: string }>;
}

function UploadDialog({ open, onClose, code, userName, board, projectId, deviceName: deviceNameProp, libraries, extraFiles }: UploadDialogProps) {
  const [tab, setTab] = useState(0);
  const [uploadMode, setUploadMode] = useState<UploadMode>('run');
  const [baudRate, setBaudRate] = useState(115200);
  const [webIp, setWebIp] = useState('192.168.4.1');
  const [webPort, setWebPort] = useState(8266);
  const [webPassword, setWebPassword] = useState('');
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [minisConfig, setMinisConfig] = useState<{ deviceName: string; wifiSsid: string; wifiPassword: string; serialNumber: string } | undefined>();

  const effectiveDevice = deviceNameProp ?? selectedDevice;

  const logRef = useRef<HTMLDivElement>(null);

  // Load device list when dialog opens (only if no device passed from parent)
  useEffect(() => {
    if (!open || !userName || deviceNameProp) return;
    minisApi.getUserDevices(userName).then(setDevices).catch(() => setDevices([]));
  }, [open, userName, deviceNameProp]);

  // Auto-fetch minisConfig whenever we know the device
  useEffect(() => {
    if (!open || !userName || !effectiveDevice) {
      setMinisConfig(undefined);
      return;
    }
    minisApi.getDeviceMinisConfig(userName, effectiveDevice)
      .then((cfg) => {
        if (cfg.wifiSsid || cfg.serialNumber) setMinisConfig(cfg);
      })
      .catch(() => setMinisConfig(undefined));
  }, [open, userName, effectiveDevice]);

  const appendLog = (msg: string) => {
    setLog((prev) => prev + msg + '\n');
    requestAnimationFrame(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    });
  };

  const recordLastBuild = async (success: boolean) => {
    if (!userName || !effectiveDevice) return;
    try {
      await minisApi.updateUserDevice(userName, effectiveDevice, {
        lastBuild: { platform: 'micropython', fqbn: board, success, at: Date.now(), projectId },
      });
    } catch { /* non-critical */ }
  };

  const uploadExtraFiles = async (svc: { saveToFile: (name: string, content: string) => Promise<void> }) => {
    for (const file of extraFiles ?? []) {
      appendLog(`Uploading ${file.name}...`);
      await svc.saveToFile(file.name, file.content);
    }
  };

  const uploadLibraries = async (svc: { saveToFile: (name: string, content: string) => Promise<void> }) => {
    for (const lib of libraries ?? []) {
      appendLog(`Fetching ${lib.remoteName}...`);
      const url = lib.url.startsWith('data:')
        ? lib.url
        : lib.url + (lib.url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch ${lib.remoteName}: HTTP ${res.status}`);
      const content = await res.text();
      appendLog(`Saving ${lib.remoteName} to device...`);
      await svc.saveToFile(lib.remoteName, content);
    }
    if (minisConfig) {
      const configContent = [
        `MINIS_DEVICE_NAME = ${JSON.stringify(minisConfig.deviceName)}`,
        `MINIS_WIFI_SSID = ${JSON.stringify(minisConfig.wifiSsid)}`,
        `MINIS_WIFI_PASSWORD = ${JSON.stringify(minisConfig.wifiPassword)}`,
      ].join('\n') + '\n';
      appendLog('Saving MinisConfig.py to device...');
      await svc.saveToFile('MinisConfig.py', configContent);
    }
  };

  // Returns a preamble that injects MinisConfig into sys.modules so the import
  // in the sketch gets the correct values regardless of cached modules on device.
  const buildCodeWithConfig = (originalCode: string) => {
    if (!minisConfig) return originalCode;
    const preamble = [
      'import sys as _sys',
      'class _MC:',
      ` MINIS_DEVICE_NAME=${JSON.stringify(minisConfig.deviceName)}`,
      ` MINIS_WIFI_SSID=${JSON.stringify(minisConfig.wifiSsid)}`,
      ` MINIS_WIFI_PASSWORD=${JSON.stringify(minisConfig.wifiPassword)}`,
      '_sys.modules["MinisConfig"]=_MC',
      '',
    ].join('\n');
    return preamble + originalCode;
  };

  const handleUploadSerial = async () => {
    setBusy(true);
    setLog('');
    const svc = new MpySerialReplService();
    svc.onData((chunk) => appendLog(chunk));
    try {
      appendLog('Connecting via Serial...');
      await svc.connect(baudRate);
      appendLog('Connected.');

      await uploadLibraries(svc);
      await uploadExtraFiles(svc);

      if (uploadMode === 'run') {
        appendLog('Running code...');
        const output = await svc.execCode(buildCodeWithConfig(code));
        if (output) appendLog(output);
        appendLog('Done.');
        await recordLastBuild(true);
      } else {
        appendLog('Saving as main.py...');
        await svc.saveToFile('main.py', code);
        appendLog('Saved. Resetting device...');
        await svc.execCode('import machine; machine.reset()');
        appendLog('Reset sent.');
        await recordLastBuild(true);
      }
    } catch (err) {
      appendLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      await recordLastBuild(false);
    } finally {
      await svc.disconnect();
      setBusy(false);
    }
  };

  const handleUploadWebRepl = async () => {
    setBusy(true);
    setLog('');
    const svc = new MpyWebReplService();
    svc.onData((chunk) => appendLog(chunk));
    try {
      appendLog(`Connecting to ws://${webIp}:${webPort}...`);
      await svc.connect({ ip: webIp, port: webPort, password: webPassword });
      appendLog('Connected.');

      await uploadLibraries(svc);
      await uploadExtraFiles(svc);

      if (uploadMode === 'run') {
        appendLog('Running code...');
        const output = await svc.execCode(buildCodeWithConfig(code));
        if (output) appendLog(output);
        appendLog('Done.');
        await recordLastBuild(true);
      } else {
        appendLog('Saving as main.py...');
        await svc.saveToFile('main.py', code);
        appendLog('Saved. Resetting device...');
        await svc.execCode('import machine; machine.reset()');
        appendLog('Reset sent.');
        await recordLastBuild(true);
      }
    } catch (err) {
      appendLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      await recordLastBuild(false);
    } finally {
      svc.disconnect();
      setBusy(false);
    }
  };

  const handleUpload = () => {
    if (tab === 0) handleUploadSerial();
    else handleUploadWebRepl();
  };

  const handleClose = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload to Device</DialogTitle>
      <DialogContent>
        {/* Backend tabs */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Serial REPL" />
          <Tab label="WebREPL" />
        </Tabs>

        {deviceNameProp ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Device: <strong>{deviceNameProp}</strong>
            {minisConfig && <> · WiFi: <strong>{minisConfig.wifiSsid}</strong></>}
          </Typography>
        ) : userName && devices.length > 0 && (
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Device</InputLabel>
            <Select
              value={selectedDevice}
              label="Device"
              onChange={(e) => setSelectedDevice(e.target.value)}
              renderValue={(v) => {
                const d = devices.find((x) => x.name === v);
                return d ? `${d.name}${d.sn ? ` (${d.sn})` : ''}` : v;
              }}
            >
              <MenuItem value=""><em>— skip —</em></MenuItem>
              {devices.map((d) => (
                <MenuItem key={d.name} value={d.name}>{d.name}{d.sn ? ` (${d.sn})` : ''}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 70 }}>Baud rate:</Typography>
              <Select
                size="small"
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                sx={{ minWidth: 130 }}
              >
                {BAUD_RATES.map((b) => (
                  <MenuItem key={b} value={b}>{b}</MenuItem>
                ))}
              </Select>
            </Box>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              size="small" label="IP Address" value={webIp}
              onChange={(e) => setWebIp(e.target.value)}
            />
            <TextField
              size="small" label="Port" type="number" value={webPort}
              onChange={(e) => setWebPort(Number(e.target.value))}
              sx={{ width: 120 }}
            />
            <TextField
              size="small" label="Password" type="password" value={webPassword}
              onChange={(e) => setWebPassword(e.target.value)}
            />
          </Box>
        )}

        {/* Upload mode */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" gutterBottom>Upload mode:</Typography>
          <RadioGroup
            value={uploadMode}
            onChange={(e) => setUploadMode(e.target.value as UploadMode)}
            row
          >
            <FormControlLabel value="run" control={<Radio size="small" />} label="Run only" />
            <FormControlLabel value="save" control={<Radio size="small" />} label="Save as main.py" />
          </RadioGroup>
          {uploadMode === 'run' && !!libraries?.length && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Libraries ({libraries.map(l => l.remoteName).join(', ')}) will be saved to the device filesystem even in Run mode — required for imports.
            </Alert>
          )}
          {!!extraFiles?.length && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Extra files will also be uploaded: {extraFiles.map(f => f.name).join(', ')}
            </Alert>
          )}
        </Box>

        {/* Log output */}
        <Box
          ref={logRef}
          sx={{
            mt: 2,
            height: 180,
            bgcolor: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'monospace',
            fontSize: 12,
            p: 1,
            overflow: 'auto',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {log || 'Ready.\n'}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>Close</Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={busy || !code}
        >
          {busy ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default UploadDialog;
