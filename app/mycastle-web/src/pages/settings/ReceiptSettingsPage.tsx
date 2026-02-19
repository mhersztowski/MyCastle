/**
 * Receipt Settings Page - konfiguracja silnika skanowania paragonow
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import { receiptScannerService } from '../../modules/shopping/services/ReceiptScannerService';
import { checkOcrBackendStatus } from '../../modules/shopping/services/LocalOcrReceiptProvider';
import {
  ReceiptScanConfigModel,
  ReceiptScanEngine,
  DEFAULT_RECEIPT_SCAN_CONFIG,
  ENGINE_LABELS,
  ENGINE_DESCRIPTIONS,
} from '../../modules/shopping/models/ReceiptScanConfigModel';
import { useMqtt } from '../../modules/mqttclient';

const ReceiptSettingsPage: React.FC = () => {
  const { isConnected } = useMqtt();
  const [config, setConfig] = useState<ReceiptScanConfigModel>({ ...DEFAULT_RECEIPT_SCAN_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [ocrAvailable, setOcrAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    receiptScannerService.loadConfig(true).then((loaded) => {
      setConfig(loaded);
      setLoading(false);
    });
  }, [isConnected]);

  useEffect(() => {
    checkOcrBackendStatus().then(status => {
      setOcrAvailable(status.available);
    });
  }, []);

  const updateEngine = useCallback((engine: ReceiptScanEngine) => {
    setConfig(prev => ({ ...prev, engine }));
    setSaveMessage(null);
    setTestResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    const success = await receiptScannerService.saveConfig(config);
    setSaving(false);
    setSaveMessage(success
      ? { type: 'success', text: 'Konfiguracja zapisana' }
      : { type: 'error', text: 'Blad zapisu konfiguracji' }
    );
  }, [config]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    if (config.engine === 'ai_vision') {
      setTestResult({ success: true, message: 'AI Vision wymaga skonfigurowanego providera AI (Settings > AI Settings).' });
      setTesting(false);
      return;
    }

    try {
      const status = await checkOcrBackendStatus();
      if (status.available) {
        setTestResult({ success: true, message: `OCR backend dostepny. Jezyki: ${status.languages.join(', ')}` });
      } else {
        setTestResult({ success: false, message: 'OCR backend niedostepny. Sprawdz czy serwer jest uruchomiony.' });
      }
    } catch (err) {
      setTestResult({ success: false, message: `Blad polaczenia z backendem: ${err}` });
    }
    setTesting(false);
  }, [config.engine]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ReceiptLongIcon sx={{ fontSize: 32, color: '#4caf50' }} />
        <Typography variant="h5" fontWeight={600}>Receipt Settings</Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Silnik skanowania</Typography>

        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel>Silnik</InputLabel>
          <Select
            value={config.engine}
            label="Silnik"
            onChange={e => updateEngine(e.target.value as ReceiptScanEngine)}
          >
            {(Object.keys(ENGINE_LABELS) as ReceiptScanEngine[]).map(key => (
              <MenuItem key={key} value={key}>{ENGINE_LABELS[key]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
          <Typography variant="body2" color="text.secondary">
            {ENGINE_DESCRIPTIONS[config.engine]}
          </Typography>
        </Paper>

        {ocrAvailable !== null && (
          <Box sx={{ mb: 2 }}>
            <Chip
              label={ocrAvailable ? 'OCR backend dostepny' : 'OCR backend niedostepny'}
              color={ocrAvailable ? 'success' : 'warning'}
              size="small"
              variant="outlined"
            />
          </Box>
        )}
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
        >
          Save
        </Button>
        <Button
          variant="outlined"
          startIcon={testing ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          onClick={handleTest}
          disabled={testing}
        >
          Test
        </Button>
      </Box>

      {saveMessage && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
          {saveMessage.text}
        </Alert>
      )}

      {testResult && (
        <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mb: 2 }}>
          {testResult.message}
        </Alert>
      )}
    </Box>
  );
};

export default ReceiptSettingsPage;
