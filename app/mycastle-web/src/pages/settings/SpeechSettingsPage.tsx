/**
 * Speech Settings Page - konfiguracja TTS, STT i Wake Word
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
  Switch,
  FormControlLabel,
} from '@mui/material';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import MicIcon from '@mui/icons-material/Mic';

import { speechService } from '../../modules/speech';
import {
  SpeechConfigModel,
  TtsProviderType,
  SttProviderType,
  DEFAULT_SPEECH_CONFIG,
} from '../../modules/speech/models/SpeechModels';
import { useMqtt } from '../../modules/mqttclient';

const TTS_PROVIDER_LABELS: Record<TtsProviderType, string> = {
  openai: 'OpenAI TTS',
  browser: 'Browser (Web Speech API)',
};

const STT_PROVIDER_LABELS: Record<SttProviderType, string> = {
  openai: 'OpenAI Whisper',
  browser: 'Browser (Speech Recognition)',
};

const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

const SpeechSettingsPage: React.FC = () => {
  const { isConnected } = useMqtt();
  const [config, setConfig] = useState<SpeechConfigModel>({ ...DEFAULT_SPEECH_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ttsTestResult, setTtsTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sttTestResult, setSttTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingTts, setTestingTts] = useState(false);
  const [testingStt, setTestingStt] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    speechService.loadConfig().then((loaded) => {
      setConfig(loaded);
      setLoading(false);
    });
  }, [isConnected]);

  const updateTts = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      tts: { ...prev.tts, [field]: value },
    }));
    setSaveMessage(null);
  }, []);

  const updateTtsOpenai = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      tts: { ...prev.tts, openai: { ...prev.tts.openai, [field]: value } },
    }));
    setSaveMessage(null);
  }, []);

  const updateTtsBrowser = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      tts: { ...prev.tts, browser: { ...prev.tts.browser, [field]: value } },
    }));
    setSaveMessage(null);
  }, []);

  const updateStt = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      stt: { ...prev.stt, [field]: value },
    }));
    setSaveMessage(null);
  }, []);

  const updateSttOpenai = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      stt: { ...prev.stt, openai: { ...prev.stt.openai, [field]: value } },
    }));
    setSaveMessage(null);
  }, []);

  const updateSttBrowser = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      stt: { ...prev.stt, browser: { ...prev.stt.browser, [field]: value } },
    }));
    setSaveMessage(null);
  }, []);

  const updateWakeWord = useCallback((field: string, value: unknown) => {
    setConfig(prev => ({
      ...prev,
      wakeWord: { ...prev.wakeWord, [field]: value },
    }));
    setSaveMessage(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    const success = await speechService.saveConfig(config);
    setSaving(false);
    setSaveMessage(success
      ? { type: 'success', text: 'Konfiguracja zapisana' }
      : { type: 'error', text: 'Blad zapisu konfiguracji' }
    );
  }, [config]);

  const handleTestTts = useCallback(async () => {
    setTestingTts(true);
    setTtsTestResult(null);
    await speechService.saveConfig(config);
    const result = await speechService.testTts();
    setTtsTestResult(result);
    setTestingTts(false);
  }, [config]);

  const handleTestStt = useCallback(async () => {
    setTestingStt(true);
    setSttTestResult(null);
    await speechService.saveConfig(config);
    const result = await speechService.testStt();
    setSttTestResult(result);
    setTestingStt(false);
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
        <RecordVoiceOverIcon sx={{ fontSize: 32, color: '#00bcd4' }} />
        <Typography variant="h5" fontWeight={600}>Speech Settings</Typography>
      </Box>

      {/* TTS Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Text-to-Speech (TTS)
        </Typography>

        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>TTS Provider</InputLabel>
          <Select
            value={config.tts.provider}
            label="TTS Provider"
            onChange={e => updateTts('provider', e.target.value)}
          >
            {(Object.keys(TTS_PROVIDER_LABELS) as TtsProviderType[]).map(key => (
              <MenuItem key={key} value={key}>{TTS_PROVIDER_LABELS[key]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {config.tts.provider === 'openai' && (
          <>
            <TextField
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={config.tts.openai.apiKey}
              onChange={e => updateTtsOpenai('apiKey', e.target.value)}
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

            <TextField
              label="Base URL"
              value={config.tts.openai.baseUrl}
              onChange={e => updateTtsOpenai('baseUrl', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              label="Model"
              value={config.tts.openai.model}
              onChange={e => updateTtsOpenai('model', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              placeholder="tts-1 | tts-1-hd"
            />

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Voice</InputLabel>
              <Select
                value={config.tts.openai.voice}
                label="Voice"
                onChange={e => updateTtsOpenai('voice', e.target.value)}
              >
                {OPENAI_VOICES.map(v => (
                  <MenuItem key={v} value={v}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Speed: {config.tts.openai.speed}
              </Typography>
              <Slider
                value={config.tts.openai.speed}
                onChange={(_, v) => updateTtsOpenai('speed', v as number)}
                min={0.25}
                max={4.0}
                step={0.25}
                valueLabelDisplay="auto"
                size="small"
                sx={{ maxWidth: 400 }}
              />
            </Box>

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Audio Format</InputLabel>
              <Select
                value={config.tts.openai.responseFormat}
                label="Audio Format"
                onChange={e => updateTtsOpenai('responseFormat', e.target.value)}
              >
                <MenuItem value="mp3">MP3</MenuItem>
                <MenuItem value="opus">Opus</MenuItem>
                <MenuItem value="aac">AAC</MenuItem>
                <MenuItem value="flac">FLAC</MenuItem>
                <MenuItem value="wav">WAV</MenuItem>
              </Select>
            </FormControl>
          </>
        )}

        {config.tts.provider === 'browser' && (
          <>
            <TextField
              label="Language"
              value={config.tts.browser.lang}
              onChange={e => updateTtsBrowser('lang', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              placeholder="pl-PL, en-US, de-DE..."
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Rate: {config.tts.browser.rate}
              </Typography>
              <Slider
                value={config.tts.browser.rate}
                onChange={(_, v) => updateTtsBrowser('rate', v as number)}
                min={0.1}
                max={3.0}
                step={0.1}
                valueLabelDisplay="auto"
                size="small"
                sx={{ maxWidth: 400 }}
              />
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Pitch: {config.tts.browser.pitch}
              </Typography>
              <Slider
                value={config.tts.browser.pitch}
                onChange={(_, v) => updateTtsBrowser('pitch', v as number)}
                min={0}
                max={2}
                step={0.1}
                valueLabelDisplay="auto"
                size="small"
                sx={{ maxWidth: 400 }}
              />
            </Box>
          </>
        )}

        <Button
          variant="outlined"
          startIcon={testingTts ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          onClick={handleTestTts}
          disabled={testingTts}
          size="small"
        >
          Test TTS
        </Button>

        {ttsTestResult && (
          <Alert severity={ttsTestResult.success ? 'success' : 'error'} sx={{ mt: 1 }}>
            {ttsTestResult.message}
          </Alert>
        )}
      </Paper>

      {/* STT Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Speech-to-Text (STT)
        </Typography>

        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>STT Provider</InputLabel>
          <Select
            value={config.stt.provider}
            label="STT Provider"
            onChange={e => updateStt('provider', e.target.value)}
          >
            {(Object.keys(STT_PROVIDER_LABELS) as SttProviderType[]).map(key => (
              <MenuItem key={key} value={key}>{STT_PROVIDER_LABELS[key]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {config.stt.provider === 'openai' && (
          <>
            <TextField
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={config.stt.openai.apiKey}
              onChange={e => updateSttOpenai('apiKey', e.target.value)}
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

            <TextField
              label="Base URL"
              value={config.stt.openai.baseUrl}
              onChange={e => updateSttOpenai('baseUrl', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
            />

            <TextField
              label="Model"
              value={config.stt.openai.model}
              onChange={e => updateSttOpenai('model', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              placeholder="whisper-1"
            />

            <TextField
              label="Language"
              value={config.stt.openai.language}
              onChange={e => updateSttOpenai('language', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              placeholder="pl, en, de..."
            />
          </>
        )}

        {config.stt.provider === 'browser' && (
          <>
            <TextField
              label="Language"
              value={config.stt.browser.lang}
              onChange={e => updateSttBrowser('lang', e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              placeholder="pl-PL, en-US, de-DE..."
            />

            <FormControlLabel
              control={
                <Switch
                  checked={config.stt.browser.continuous}
                  onChange={e => updateSttBrowser('continuous', e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">Continuous mode</Typography>}
              sx={{ mb: 1 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={config.stt.browser.interimResults}
                  onChange={e => updateSttBrowser('interimResults', e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">Interim results</Typography>}
              sx={{ mb: 2 }}
            />
          </>
        )}

        <Button
          variant="outlined"
          startIcon={testingStt ? <CircularProgress size={16} /> : <MicIcon />}
          onClick={handleTestStt}
          disabled={testingStt}
          size="small"
        >
          Test STT
        </Button>

        {sttTestResult && (
          <Alert severity={sttTestResult.success ? 'success' : 'error'} sx={{ mt: 1 }}>
            {sttTestResult.message}
          </Alert>
        )}
      </Paper>

      {/* Wake Word Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Wake Word Detection
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={config.wakeWord.enabled}
              onChange={e => updateWakeWord('enabled', e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="body2">Enable wake word detection</Typography>}
          sx={{ mb: 2 }}
        />

        <TextField
          label="Wake Phrase"
          value={config.wakeWord.phrase}
          onChange={e => updateWakeWord('phrase', e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          placeholder="hey castle, alexa, ok computer..."
          disabled={!config.wakeWord.enabled}
        />

        <TextField
          label="Language"
          value={config.wakeWord.lang}
          onChange={e => updateWakeWord('lang', e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          placeholder="en-US, pl-PL..."
          disabled={!config.wakeWord.enabled}
        />

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Sensitivity: {config.wakeWord.sensitivity}
          </Typography>
          <Slider
            value={config.wakeWord.sensitivity}
            onChange={(_, v) => updateWakeWord('sensitivity', v as number)}
            min={0.3}
            max={1.0}
            step={0.05}
            valueLabelDisplay="auto"
            size="small"
            sx={{ maxWidth: 400 }}
            disabled={!config.wakeWord.enabled}
          />
          <Typography variant="caption" color="text.secondary">
            Lower = more fuzzy matching, Higher = exact match required
          </Typography>
        </Box>
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
      </Box>

      {saveMessage && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }}>
          {saveMessage.text}
        </Alert>
      )}
    </Box>
  );
};

export default SpeechSettingsPage;
