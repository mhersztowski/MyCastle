import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Close, Delete, Usb, UsbOff } from '@mui/icons-material';
import {
  EspFlashService,
  readFileAsBinaryString,
  type FlashFileEntry,
  type FlashProgress,
  type FlashSettings,
  type FlashState,
} from './EspFlashService';

interface FileRow {
  id: number;
  file: File | null;
  address: string;
}

let rowIdCounter = 0;

function createRow(address = '0x0000'): FileRow {
  return { id: rowIdCounter++, file: null, address };
}

const FLASH_MODES = ['keep', 'qio', 'qout', 'dio', 'dout'];
const FLASH_FREQS = ['keep', '40m', '80m', '26m', '20m'];
const FLASH_SIZES = ['keep', '4MB', '2MB', '8MB', '16MB', '32MB'];
const BAUD_RATES = [115200, 230400, 460800, 921600, 1500000];

interface FlashDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-loaded firmware files (from compiled output). Enables mode selector. */
  initialFiles?: FlashFileEntry[];
}

export function FlashDialog({ open, onClose, initialFiles }: FlashDialogProps) {
  const serviceRef = useRef<EspFlashService | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<FlashState>('idle');
  const [chipName, setChipName] = useState('');
  const [log, setLog] = useState('');
  const [progress, setProgress] = useState<FlashProgress | null>(null);

  // 'compiled' | 'custom' — only relevant when initialFiles is provided
  const [fileMode, setFileMode] = useState<'compiled' | 'custom'>('compiled');
  const [customAddress, setCustomAddress] = useState('0x0000');
  const [customFile, setCustomFile] = useState<File | null>(null);

  const [rows, setRows] = useState<FileRow[]>([createRow()]);
  const [settings, setSettings] = useState<FlashSettings>({
    baudRate: 921600,
    flashMode: 'keep',
    flashFreq: 'keep',
    flashSize: 'keep',
    eraseAll: false,
  });

  // Initialize service
  useEffect(() => {
    const svc = new EspFlashService();
    svc.setOnLog((msg) =>
      setLog((prev) => prev + msg + (msg.endsWith('\n') ? '' : '\n')),
    );
    svc.setOnProgress((p) => setProgress(p));
    svc.setOnStateChange((s) => {
      setState(s);
      if (s === 'connected') setChipName(svc.chipName);
    });
    serviceRef.current = svc;

    return () => {
      svc.disconnect();
      serviceRef.current = null;
    };
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // Reset everything when dialog opens
  useEffect(() => {
    if (open) {
      setLog('');
      setProgress(null);
      setState('idle');
      setChipName('');
      setFileMode('compiled');
      setCustomAddress('0x0000');
      setCustomFile(null);
      setRows([createRow()]);
      setSettings({
        baudRate: 921600,
        flashMode: 'keep',
        flashFreq: 'keep',
        flashSize: 'keep',
        eraseAll: false,
      });
    }
  }, [open]);

  const handleConnect = useCallback(async () => {
    try {
      await serviceRef.current?.connect();
    } catch {
      // error already logged by service
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    await serviceRef.current?.disconnect();
    setChipName('');
    setProgress(null);
  }, []);

  const handleFlash = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;

    let fileEntries: FlashFileEntry[];

    if (initialFiles && initialFiles.length > 0) {
      if (fileMode === 'compiled') {
        fileEntries = initialFiles;
      } else {
        if (!customFile) {
          setLog((prev) => prev + 'No file selected.\n');
          return;
        }
        const data = await readFileAsBinaryString(customFile);
        const address = parseInt(customAddress, 16);
        if (isNaN(address)) {
          setLog((prev) => prev + `Invalid address: ${customAddress}\n`);
          return;
        }
        fileEntries = [{ data, address, name: customFile.name }];
      }
    } else {
      fileEntries = [];
      for (const row of rows) {
        if (!row.file) continue;
        const data = await readFileAsBinaryString(row.file);
        const address = parseInt(row.address, 16);
        if (isNaN(address)) {
          setLog((prev) => prev + `Invalid address: ${row.address}\n`);
          return;
        }
        fileEntries.push({ data, address, name: row.file.name });
      }
    }

    if (fileEntries.length === 0) {
      setLog((prev) => prev + 'No files selected.\n');
      return;
    }

    setProgress(null);

    try {
      await svc.flash(fileEntries, settings);
    } catch {
      // error already logged
    }
  }, [rows, fileMode, customFile, customAddress, settings, initialFiles]);

  const handleClose = useCallback(() => {
    if (state === 'flashing') return; // don't close during flash
    serviceRef.current?.disconnect();
    onClose();
  }, [state, onClose]);

  // --- File rows management (manual mode) ---
  const addRow = () => setRows((r) => [...r, createRow()]);

  const removeRow = (id: number) =>
    setRows((r) => (r.length > 1 ? r.filter((row) => row.id !== id) : r));

  const updateRowFile = (id: number, file: File | null) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, file } : row)));

  const updateRowAddress = (id: number, address: string) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, address } : row)));

  const isConnected = state === 'connected' || state === 'done';
  const isFlashing = state === 'flashing';
  const totalPercent =
    progress && progress.total > 0
      ? Math.round((progress.written / progress.total) * 100)
      : 0;

  const hasInitialFiles = initialFiles && initialFiles.length > 0;

  const flashDisabled =
    !isConnected ||
    isFlashing ||
    (hasInitialFiles
      ? fileMode === 'custom' && !customFile
      : rows.every((r) => !r.file));

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Flash Firmware
        {chipName && (
          <Typography variant="caption" sx={{ ml: 1, color: 'success.main' }}>
            ({chipName})
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <IconButton size="small" onClick={handleClose} disabled={isFlashing}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Connection */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {!isConnected ? (
            <Button
              variant="contained"
              startIcon={<Usb />}
              onClick={handleConnect}
              disabled={state === 'connecting' || isFlashing}
              size="small"
            >
              {state === 'connecting' ? 'Connecting...' : 'Connect'}
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<UsbOff />}
              onClick={handleDisconnect}
              disabled={isFlashing}
              size="small"
            >
              Disconnect
            </Button>
          )}
          <Typography variant="body2" color="text.secondary">
            {state === 'idle' && 'Click Connect to select device'}
            {state === 'connecting' && 'Hold BOOT button on ESP32...'}
            {isConnected && `Connected: ${chipName}`}
            {state === 'flashing' && 'Flashing...'}
            {state === 'error' && 'Error — see log below'}
          </Typography>
        </Box>

        {/* File entries */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Firmware Files
          </Typography>

          {hasInitialFiles ? (
            <>
              <RadioGroup
                row
                value={fileMode}
                onChange={(e) => setFileMode(e.target.value as 'compiled' | 'custom')}
              >
                <FormControlLabel
                  value="compiled"
                  control={<Radio size="small" disabled={isFlashing} />}
                  label="Compiled output"
                />
                <FormControlLabel
                  value="custom"
                  control={<Radio size="small" disabled={isFlashing} />}
                  label="Custom .bin"
                />
              </RadioGroup>

              {fileMode === 'compiled' ? (
                <Box sx={{ mt: 0.5 }}>
                  {initialFiles.map((f, i) => (
                    <Typography key={i} variant="body2" sx={{ mb: 0.5 }}>
                      {f.name} @ 0x{f.address.toString(16).padStart(4, '0')}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                  <TextField
                    label="Offset"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    size="small"
                    sx={{ width: 110 }}
                    disabled={isFlashing}
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    size="small"
                    disabled={isFlashing}
                    sx={{ textTransform: 'none', minWidth: 0, flexGrow: 1, justifyContent: 'flex-start' }}
                  >
                    {customFile ? customFile.name : 'Choose .bin file...'}
                    <input
                      type="file"
                      accept=".bin"
                      hidden
                      onChange={(e) => setCustomFile(e.target.files?.[0] ?? null)}
                    />
                  </Button>
                </Box>
              )}
            </>
          ) : (
            <>
              {rows.map((row) => (
                <Box key={row.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                  <TextField
                    label="Offset"
                    value={row.address}
                    onChange={(e) => updateRowAddress(row.id, e.target.value)}
                    size="small"
                    sx={{ width: 110 }}
                    disabled={isFlashing}
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    size="small"
                    disabled={isFlashing}
                    sx={{ textTransform: 'none', minWidth: 0, flexGrow: 1, justifyContent: 'flex-start' }}
                  >
                    {row.file ? row.file.name : 'Choose .bin file...'}
                    <input
                      type="file"
                      accept=".bin,.elf"
                      hidden
                      onChange={(e) => updateRowFile(row.id, e.target.files?.[0] ?? null)}
                    />
                  </Button>
                  <IconButton
                    size="small"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length <= 1 || isFlashing}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Button
                size="small"
                startIcon={<Add />}
                onClick={addRow}
                disabled={isFlashing}
                sx={{ textTransform: 'none' }}
              >
                Add file
              </Button>
            </>
          )}
        </Box>

        {/* Settings */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Flash Settings
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Baud Rate</InputLabel>
              <Select
                value={settings.baudRate}
                label="Baud Rate"
                onChange={(e) => setSettings((s) => ({ ...s, baudRate: Number(e.target.value) }))}
                disabled={isFlashing}
              >
                {BAUD_RATES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Mode</InputLabel>
              <Select
                value={settings.flashMode}
                label="Mode"
                onChange={(e) => setSettings((s) => ({ ...s, flashMode: e.target.value }))}
                disabled={isFlashing}
              >
                {FLASH_MODES.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m.toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Freq</InputLabel>
              <Select
                value={settings.flashFreq}
                label="Freq"
                onChange={(e) => setSettings((s) => ({ ...s, flashFreq: e.target.value }))}
                disabled={isFlashing}
              >
                {FLASH_FREQS.map((f) => (
                  <MenuItem key={f} value={f}>
                    {f.toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Size</InputLabel>
              <Select
                value={settings.flashSize}
                label="Size"
                onChange={(e) => setSettings((s) => ({ ...s, flashSize: e.target.value }))}
                disabled={isFlashing}
              >
                {FLASH_SIZES.map((sz) => (
                  <MenuItem key={sz} value={sz}>
                    {sz}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={settings.eraseAll}
                  onChange={(e) => setSettings((s) => ({ ...s, eraseAll: e.target.checked }))}
                  size="small"
                  disabled={isFlashing}
                />
              }
              label="Erase all"
              sx={{ '& .MuiTypography-root': { fontSize: 14 } }}
            />
          </Box>
        </Box>

        {/* Progress */}
        {isFlashing && progress && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <LinearProgress
                variant="determinate"
                value={totalPercent}
                sx={{ flexGrow: 1, height: 8, borderRadius: 1 }}
              />
              <Typography variant="caption" sx={{ minWidth: 40 }}>
                {totalPercent}%
              </Typography>
            </Box>
          </Box>
        )}

        {/* Log output */}
        <Box
          ref={logRef}
          sx={{
            bgcolor: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: 'monospace',
            fontSize: 11,
            p: 1,
            borderRadius: 1,
            height: 150,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {log || 'Ready.\n'}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isFlashing}>
          Close
        </Button>
        <Button variant="contained" onClick={handleFlash} disabled={flashDisabled}>
          {isFlashing ? 'Flashing...' : 'Flash'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
