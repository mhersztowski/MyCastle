/**
 * AI Settings Page - konfiguracja providera AI
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import { aiService } from '../../modules/ai';
import { AiConfigModel, AiProviderType, DEFAULT_AI_CONFIG } from '../../modules/ai/models/AiModels';
import { useMqtt } from '../../modules/mqttclient';

const PROVIDER_LABELS: Record<AiProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  ollama: 'Ollama (local)',
  custom: 'Custom (OpenAI-compatible)',
};

const AiSettingsPage: React.FC = () => {
  const { isConnected } = useMqtt();
  const [config, setConfig] = useState<AiConfigModel>({ ...DEFAULT_AI_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    aiService.loadConfig().then((loaded) => {
      setConfig(loaded);
      setLoading(false);
    });
  }, [isConnected]);

  const activeProvider = config.provider;
  const providerConfig = config.providers[activeProvider];

  const updateProvider = useCallback((provider: AiProviderType) => {
    setConfig(prev => ({ ...prev, provider }));
    setSaveMessage(null);
    setTestResult(null);
  }, []);

  const updateProviderConfig = useCallback((field: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [prev.provider]: {
          ...prev.providers[prev.provider],
          [field]: value,
        },
      },
    }));
    setSaveMessage(null);
  }, []);

  const updateDefaults = useCallback((field: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      defaults: { ...prev.defaults, [field]: value },
    }));
    setSaveMessage(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    const success = await aiService.saveConfig(config);
    setSaving(false);
    setSaveMessage(success
      ? { type: 'success', text: 'Konfiguracja zapisana' }
      : { type: 'error', text: 'Blad zapisu konfiguracji' }
    );
  }, [config]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    // Save first so the test uses current config
    await aiService.saveConfig(config);
    const result = await aiService.testConnection();
    setTestResult(result);
    setTesting(false);
  }, [config]);

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
        <PsychologyIcon sx={{ fontSize: 32, color: '#e91e63' }} />
        <Typography variant="h5" fontWeight={600}>AI Settings</Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Provider</Typography>

        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel>Provider</InputLabel>
          <Select
            value={activeProvider}
            label="Provider"
            onChange={e => updateProvider(e.target.value as AiProviderType)}
          >
            {(Object.keys(PROVIDER_LABELS) as AiProviderType[]).map(key => (
              <MenuItem key={key} value={key}>{PROVIDER_LABELS[key]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {activeProvider !== 'ollama' && (
          <TextField
            label="API Key"
            type={showApiKey ? 'text' : 'password'}
            value={providerConfig.apiKey}
            onChange={e => updateProviderConfig('apiKey', e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}

        <TextField
          label="Base URL"
          value={providerConfig.baseUrl}
          onChange={e => updateProviderConfig('baseUrl', e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          placeholder={DEFAULT_AI_CONFIG.providers[activeProvider]?.baseUrl || 'https://...'}
        />

        <TextField
          label="Default Model"
          value={providerConfig.defaultModel}
          onChange={e => updateProviderConfig('defaultModel', e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          placeholder={DEFAULT_AI_CONFIG.providers[activeProvider]?.defaultModel || 'model-name'}
        />

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Defaults</Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Temperature: {config.defaults.temperature}
          </Typography>
          <Slider
            value={config.defaults.temperature}
            onChange={(_, v) => updateDefaults('temperature', v as number)}
            min={0}
            max={2}
            step={0.1}
            valueLabelDisplay="auto"
            size="small"
            sx={{ maxWidth: 400 }}
          />
        </Box>

        <TextField
          label="Max Tokens"
          type="number"
          value={config.defaults.maxTokens}
          onChange={e => updateDefaults('maxTokens', parseInt(e.target.value) || 2048)}
          size="small"
          sx={{ width: 200 }}
        />
      </Paper>

      {/* Actions */}
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
          Test Connection
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

export default AiSettingsPage;
