/**
 * CastleAgentPage - głosowy asystent łączący Wake Word + STT + AI + TTS
 * Pipeline: Wake Word / Mic click -> STT -> AI (LLM) -> TTS -> display
 * Tryb Agent: tool calling z akcjami systemowymi i scenariuszami
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Paper,
  Tooltip,
  Chip,
  TextField,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import StopIcon from '@mui/icons-material/Stop';
import HearingIcon from '@mui/icons-material/Hearing';
import HearingDisabledIcon from '@mui/icons-material/HearingDisabled';
import SendIcon from '@mui/icons-material/Send';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import CastleIcon from '@mui/icons-material/Castle';
import BuildIcon from '@mui/icons-material/Build';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChatIcon from '@mui/icons-material/Chat';
import { useNavigate } from 'react-router-dom';
import { aiService } from '../../modules/ai';
import { AiToolCall } from '../../modules/ai/models/AiModels';
import { speechService, wakeWordService, AudioRecorder, createBrowserRecognition } from '../../modules/speech';
import { useFilesystem } from '../../modules/filesystem';
import { useMqtt } from '../../modules/mqttclient/MqttContext';
import {
  ConversationEngine,
  conversationService,
  conversationHistoryService,
  initializeActions,
} from '../../modules/conversation';
import type {
  ConversationMessage,
  ConversationScenario,
  ConversationConfig,
} from '../../modules/conversation';

type AgentState = 'idle' | 'listening' | 'processing_stt' | 'thinking' | 'speaking';

const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Gotowy',
  listening: 'Słucham...',
  processing_stt: 'Przetwarzanie mowy...',
  thinking: 'Myślę...',
  speaking: 'Mówię...',
};

const STATE_COLORS: Record<AgentState, string> = {
  idle: '#9e9e9e',
  listening: '#f44336',
  processing_stt: '#ff9800',
  thinking: '#2196f3',
  speaking: '#4caf50',
};

interface PendingConfirmation {
  toolCall: AiToolCall;
  args: Record<string, unknown>;
  resolve: (confirmed: boolean) => void;
}

const CastleAgentPage: React.FC = () => {
  const navigate = useNavigate();
  const { dataSource } = useFilesystem();
  const { isConnected } = useMqtt();

  // Core state
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [speechConfigured, setSpeechConfigured] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Agent mode state
  const [agentMode, setAgentMode] = useState(false);
  const [convConfig, setConvConfig] = useState<ConversationConfig | null>(null);
  const [activeScenario, setActiveScenario] = useState<ConversationScenario | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [systemPrompt, setSystemPrompt] = useState(
    'Jesteś Castle - osobistym asystentem głosowym. Odpowiadaj krótko, naturalnie i pomocnie. Mów po polsku, chyba że użytkownik mówi inaczej.'
  );

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const conversationRef = useRef<ConversationMessage[]>([]);
  const stopListeningRef = useRef<() => void>(() => {});
  const isStoppingRef = useRef(false);
  const engineRef = useRef<ConversationEngine | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    conversationRef.current = messages;
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText]);

  // Load configs when MQTT is connected
  useEffect(() => {
    if (!isConnected) return;
    Promise.all([
      aiService.loadConfig(),
      speechService.loadConfig(),
      conversationService.loadConfig(),
    ]).then(() => {
      setAiConfigured(aiService.isConfigured());
      setSpeechConfigured(speechService.isTtsConfigured());
      const config = conversationService.getConfig();
      setConvConfig(config);
      setAgentMode(config.agentMode);
      setActiveScenario(conversationService.getActiveScenario());
    });
  }, [isConnected]);

  // Initialize/reinitialize engine when agent mode or scenario changes
  useEffect(() => {
    if (agentMode && convConfig && activeScenario && dataSource) {
      initializeActions(dataSource, navigate);

      const engine = new ConversationEngine(
        convConfig,
        activeScenario,
        {
          onMessage: (msg) => {
            setMessages(prev => [...prev, msg]);
          },
          onToolCallStart: () => {},
          onToolCallComplete: () => {},
          onToolCallError: () => {},
          onConfirmationRequired: (toolCall, args) => {
            return new Promise<boolean>((resolve) => {
              setPendingConfirmation({ toolCall, args, resolve });
            });
          },
        },
        dataSource,
      );

      // Load persisted history
      conversationHistoryService.loadHistory(activeScenario.id).then(history => {
        if (history.length > 0) {
          engine.loadHistory(history);
          setMessages(history);
        }
      });

      engineRef.current = engine;

      // Show greeting if new conversation
      if (messages.length === 0 && activeScenario.greeting) {
        // Greeting will show in empty state
      }
    } else {
      engineRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentMode, activeScenario?.id, convConfig, dataSource]);

  // Save history on page unload / component unmount
  useEffect(() => {
    const saveOnUnload = () => {
      if (agentMode && engineRef.current) {
        conversationHistoryService.saveHistory(
          engineRef.current.getHistory(),
          activeScenario?.id
        );
      }
    };
    window.addEventListener('beforeunload', saveOnUnload);
    return () => {
      window.removeEventListener('beforeunload', saveOnUnload);
      saveOnUnload();
    };
  }, [agentMode, activeScenario?.id]);

  // Process user input - agent mode or simple chat
  const processUserInput = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setAgentState('thinking');
    setError(null);

    try {
      if (agentMode && engineRef.current) {
        // Agent mode: use ConversationEngine (it manages messages internally)
        const newMessages = await engineRef.current.process(text);

        // TTS the last assistant message
        const lastAssistant = [...newMessages].reverse().find(m => m.role === 'assistant' && m.content);
        if (lastAssistant && speechConfigured) {
          setAgentState('speaking');
          try {
            await speechService.speak({ text: lastAssistant.content });
          } catch (ttsErr) {
            console.warn('[CastleAgent] TTS error:', ttsErr);
          }
        }
      } else {
        // Simple chat mode
        const userMsg: ConversationMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          role: 'user',
          content: text,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);

        const history = conversationRef.current.slice(-20).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const response = await aiService.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: text },
          ],
        });

        const assistantMsg: ConversationMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);

        if (speechConfigured) {
          setAgentState('speaking');
          try {
            await speechService.speak({ text: response.content });
          } catch (ttsErr) {
            console.warn('[CastleAgent] TTS error:', ttsErr);
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      const errorMsg: ConversationMessage = {
        id: `${Date.now()}-err`,
        role: 'assistant',
        content: `Przepraszam, wystąpił błąd: ${errMsg}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setAgentState('idle');
    }
  }, [agentMode, systemPrompt, speechConfigured]);

  // Start listening (STT)
  const startListening = useCallback(async () => {
    if (agentState !== 'idle') return;

    setAgentState('listening');
    setInterimText('');
    setError(null);

    const config = speechService.getConfig();

    if (config.stt.provider === 'openai') {
      try {
        const recorder = new AudioRecorder();
        await recorder.start({
          onSilenceDetected: () => {
            stopListeningRef.current();
          },
        });
        recorderRef.current = recorder;
      } catch {
        setError('Brak dostępu do mikrofonu');
        setAgentState('idle');
      }
    } else {
      const recognition = createBrowserRecognition({
        lang: config.stt.browser.lang,
        continuous: false,
        interimResults: true,
        onResult: (transcript, isFinal) => {
          if (isFinal) {
            setInterimText('');
            setAgentState('idle');
            recognitionRef.current = null;
            processUserInput(transcript);
          } else {
            setInterimText(transcript);
          }
        },
        onError: (error) => {
          console.error('[CastleAgent] STT error:', error);
          if (error !== 'no-speech') {
            setError(`Błąd rozpoznawania mowy: ${error}`);
          }
          setAgentState('idle');
          setInterimText('');
          recognitionRef.current = null;
        },
        onEnd: () => {
          if (recognitionRef.current) {
            recognitionRef.current = null;
            setAgentState('idle');
            setInterimText('');
          }
        },
      });

      if (recognition) {
        recognition.start();
        recognitionRef.current = recognition;
      } else {
        setError('Speech Recognition API niedostępne w tej przeglądarce');
        setAgentState('idle');
      }
    }
  }, [agentState, processUserInput]);

  // Stop listening
  const stopListening = useCallback(async () => {
    if (agentState !== 'listening' || isStoppingRef.current) return;
    isStoppingRef.current = true;

    const config = speechService.getConfig();

    if (config.stt.provider === 'openai' && recorderRef.current) {
      setAgentState('processing_stt');
      try {
        const audioBlob = await recorderRef.current.stop();
        recorderRef.current = null;
        const result = await speechService.transcribe({ audio: audioBlob });
        if (result.text.trim()) {
          await processUserInput(result.text);
        } else {
          setAgentState('idle');
        }
      } catch {
        setError('Błąd transkrypcji audio');
        setAgentState('idle');
        recorderRef.current = null;
      }
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    isStoppingRef.current = false;
  }, [agentState, processUserInput]);

  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  const stopSpeaking = useCallback(() => {
    speechService.stopSpeaking();
    setAgentState('idle');
  }, []);

  const handleMicClick = useCallback(() => {
    if (agentState === 'listening') {
      stopListening();
    } else if (agentState === 'speaking') {
      stopSpeaking();
    } else if (agentState === 'idle') {
      startListening();
    }
  }, [agentState, startListening, stopListening, stopSpeaking]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim() || agentState !== 'idle') return;
    const text = textInput.trim();
    setTextInput('');
    processUserInput(text);
  }, [textInput, agentState, processUserInput]);

  const playWakeSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(600, ctx.currentTime);
      osc1.connect(gain);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.12);

      const gain2 = ctx.createGain();
      gain2.connect(ctx.destination);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(900, ctx.currentTime + 0.12);
      osc2.connect(gain2);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.3);

      osc2.onended = () => ctx.close();
    } catch {
      // AudioContext not available
    }
  }, []);

  const toggleWakeWord = useCallback(() => {
    if (wakeWordActive) {
      wakeWordService.stop();
      setWakeWordActive(false);
    } else {
      const config = speechService.getConfig();
      wakeWordService.configure({
        phrase: config.wakeWord.phrase,
        sensitivity: config.wakeWord.sensitivity,
        lang: config.wakeWord.lang,
        onWake: () => {
          playWakeSound();
          startListening();
        },
        onStatusChange: (isListening) => {
          setWakeWordActive(isListening);
        },
      });
      const started = wakeWordService.start();
      if (!started) {
        setError('Wake Word niedostępny - sprawdź uprawnienia mikrofonu');
      }
    }
  }, [wakeWordActive, startListening, playWakeSound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wakeWordService.stop();
      speechService.stopSpeaking();
      if (recorderRef.current) recorderRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    if (engineRef.current) {
      engineRef.current.clearHistory();
    }
    if (agentMode) {
      conversationHistoryService.clearHistory(activeScenario?.id);
    }
  }, [agentMode, activeScenario?.id]);

  const handleAgentModeToggle = useCallback((enabled: boolean) => {
    setAgentMode(enabled);
    setMessages([]);
    if (convConfig) {
      const updated = { ...convConfig, agentMode: enabled };
      setConvConfig(updated);
      conversationService.saveConfig(updated);
    }
  }, [convConfig]);

  const handleScenarioChange = useCallback((scenarioId: string) => {
    if (!convConfig) return;
    const scenario = convConfig.scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      setActiveScenario(scenario);
      conversationService.setActiveScenario(scenarioId);
      setMessages([]);
      if (engineRef.current) {
        engineRef.current.clearHistory();
      }
    }
  }, [convConfig]);

  // Render a single message
  const renderMessage = (msg: ConversationMessage) => {
    // Tool result messages
    if (msg.role === 'tool') {
      return (
        <Box key={msg.id} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-start', ml: 3 }}>
          <Accordion
            elevation={0}
            sx={{
              maxWidth: '75%',
              bgcolor: '#f5f5f5',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '8px !important',
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BuildIcon sx={{ fontSize: 16, color: '#ff9800' }} />
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  {msg.toolName || 'tool'}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 11 }}>
                {formatToolResult(msg.content)}
              </Typography>
            </AccordionDetails>
          </Accordion>
        </Box>
      );
    }

    // Assistant message with tool calls (before tool results)
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return (
        <Box key={msg.id} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-start' }}>
          <SmartToyIcon sx={{ color: '#00bcd4', mt: 0.5, fontSize: 20 }} />
          <Box sx={{ maxWidth: '75%' }}>
            {msg.content && (
              <Paper elevation={0} sx={{ p: 1.5, mb: 0.5, bgcolor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>
              </Paper>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {msg.toolCalls.map(tc => (
                <Chip
                  key={tc.id}
                  icon={<BuildIcon sx={{ fontSize: '14px !important' }} />}
                  label={tc.function.name}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 11, height: 24 }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      );
    }

    // Regular user/assistant messages
    return (
      <Box
        key={msg.id}
        sx={{
          display: 'flex',
          gap: 1,
          justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
        }}
      >
        {msg.role === 'assistant' && (
          <SmartToyIcon sx={{ color: '#00bcd4', mt: 0.5, fontSize: 20 }} />
        )}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            maxWidth: '75%',
            bgcolor: msg.role === 'user' ? 'primary.main' : 'white',
            color: msg.role === 'user' ? 'white' : 'text.primary',
            borderRadius: 2,
            border: msg.role === 'assistant' ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {msg.content}
          </Typography>
          <Typography
            variant="caption"
            sx={{ opacity: 0.6, display: 'block', textAlign: 'right', mt: 0.5, fontSize: 10 }}
          >
            {new Date(msg.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Paper>
        {msg.role === 'user' && (
          <PersonIcon sx={{ color: 'primary.main', mt: 0.5, fontSize: 20 }} />
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <CastleIcon sx={{ fontSize: 32, color: '#00bcd4' }} />
        <Typography variant="h5" fontWeight={600} sx={{ flex: 1 }}>Castle Agent</Typography>

        <Chip
          label={STATE_LABELS[agentState]}
          size="small"
          sx={{
            bgcolor: STATE_COLORS[agentState] + '20',
            color: STATE_COLORS[agentState],
            fontWeight: 600,
            animation: agentState !== 'idle' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
          }}
        />

        {/* Agent Mode Toggle */}
        <Tooltip title={agentMode ? 'Tryb Agent (z akcjami)' : 'Tryb Chat (prosty)'}>
          <FormControlLabel
            control={
              <Switch
                checked={agentMode}
                onChange={(_, checked) => handleAgentModeToggle(checked)}
                size="small"
                color="secondary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {agentMode ? <SmartToyIcon sx={{ fontSize: 18 }} /> : <ChatIcon sx={{ fontSize: 18 }} />}
                <Typography variant="caption">{agentMode ? 'Agent' : 'Chat'}</Typography>
              </Box>
            }
            sx={{ mr: 0, ml: 0.5 }}
          />
        </Tooltip>

        <Tooltip title={wakeWordActive ? `Wake word aktywny ("${speechService.getConfig().wakeWord.phrase}")` : 'Włącz wake word'}>
          <IconButton onClick={toggleWakeWord} color={wakeWordActive ? 'primary' : 'default'} size="small">
            {wakeWordActive ? <HearingIcon /> : <HearingDisabledIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Ustawienia agenta">
          <IconButton onClick={() => setShowSettings(!showSettings)} size="small">
            <SettingsIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Wyczyść historię">
          <IconButton onClick={clearHistory} size="small">
            <DeleteSweepIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Ustawienia Speech">
          <IconButton onClick={() => navigate('/settings/speech')} size="small">
            <VolumeUpIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Scenario selector (agent mode only) */}
      {agentMode && convConfig && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>Scenariusz:</Typography>
          <Select
            value={activeScenario?.id || ''}
            onChange={(e) => handleScenarioChange(e.target.value)}
            size="small"
            sx={{ minWidth: 180, height: 30, fontSize: 13 }}
          >
            {convConfig.scenarios.map(s => (
              <MenuItem key={s.id} value={s.id} sx={{ fontSize: 13 }}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
          {activeScenario && (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {activeScenario.description}
            </Typography>
          )}
        </Box>
      )}

      {/* Config warnings */}
      {!aiConfigured && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          AI nie jest skonfigurowane. <Typography component="span" sx={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/settings/ai')}>Przejdź do AI Settings</Typography>
        </Alert>
      )}

      {/* Settings panel */}
      {showSettings && (
        <Paper sx={{ p: 2, mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            {agentMode ? 'System Prompt (scenariusza)' : 'System Prompt'}
          </Typography>
          <TextField
            value={agentMode ? (activeScenario?.systemPrompt || '') : systemPrompt}
            onChange={e => {
              if (!agentMode) {
                setSystemPrompt(e.target.value);
              }
            }}
            fullWidth
            multiline
            rows={3}
            size="small"
            placeholder="Instrukcja systemowa dla AI..."
            disabled={agentMode}
            helperText={agentMode ? 'Edytuj scenariusze w konfiguracji' : undefined}
          />
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Conversation */}
      <Paper
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          mb: 2,
          bgcolor: 'grey.50',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {messages.length === 0 && !interimText && (
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <CastleIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              {agentMode && activeScenario?.greeting
                ? activeScenario.greeting
                : 'Naciśnij mikrofon lub wpisz wiadomość aby rozpocząć'}
            </Typography>
            {agentMode && (
              <Chip
                label={`Tryb Agent: ${activeScenario?.name || 'Ogólny'}`}
                size="small"
                color="secondary"
                variant="outlined"
                sx={{ mt: 1 }}
              />
            )}
            {speechService.getConfig().wakeWord.enabled && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Lub powiedz &quot;{speechService.getConfig().wakeWord.phrase}&quot;
              </Typography>
            )}
          </Box>
        )}

        {messages.map(renderMessage)}

        {/* Interim text (live STT preview) */}
        {interimText && (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Paper
              elevation={0}
              sx={{ p: 1.5, maxWidth: '75%', bgcolor: 'primary.light', color: 'white', borderRadius: 2, opacity: 0.7 }}
            >
              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                {interimText}...
              </Typography>
            </Paper>
            <PersonIcon sx={{ color: 'primary.light', mt: 0.5, fontSize: 20 }} />
          </Box>
        )}

        {/* Thinking indicator */}
        {agentState === 'thinking' && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <SmartToyIcon sx={{ color: '#00bcd4', fontSize: 20 }} />
            <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="body2" color="text.secondary">
                {agentMode ? 'Przetwarzam...' : 'Myślę...'}
              </Typography>
            </Paper>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Paper>

      {/* Input area */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Tooltip title={
          agentState === 'listening' ? 'Nagrywam (auto-stop po ciszy lub kliknij)'
          : agentState === 'speaking' ? 'Zatrzymaj mówienie'
          : 'Naciśnij aby mówić'
        }>
          <IconButton
            onClick={handleMicClick}
            disabled={agentState === 'processing_stt' || agentState === 'thinking'}
            sx={{
              width: 56,
              height: 56,
              bgcolor: agentState === 'listening' ? 'error.main'
                : agentState === 'speaking' ? 'success.main'
                : 'primary.main',
              color: 'white',
              '&:hover': {
                bgcolor: agentState === 'listening' ? 'error.dark'
                  : agentState === 'speaking' ? 'success.dark'
                  : 'primary.dark',
              },
              '&.Mui-disabled': { bgcolor: 'grey.300', color: 'white' },
              animation: agentState === 'listening' ? 'pulse-mic 1s ease-in-out infinite' : 'none',
              '@keyframes pulse-mic': {
                '0%,100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.1)' },
              },
            }}
          >
            {agentState === 'listening' ? <MicOffIcon /> :
             agentState === 'speaking' ? <StopIcon /> :
             (agentState === 'processing_stt' || agentState === 'thinking') ? <CircularProgress size={24} sx={{ color: 'white' }} /> :
             <MicIcon />}
          </IconButton>
        </Tooltip>

        <TextField
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleTextSubmit();
            }
          }}
          placeholder={agentMode ? 'Wpisz polecenie...' : 'Wpisz wiadomość...'}
          fullWidth
          size="small"
          disabled={agentState !== 'idle'}
          multiline
          maxRows={3}
        />

        <Tooltip title="Wyślij">
          <span>
            <IconButton
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || agentState !== 'idle'}
              color="primary"
            >
              <SendIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!pendingConfirmation}
        onClose={() => {
          pendingConfirmation?.resolve(false);
          setPendingConfirmation(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BuildIcon color="warning" />
          Potwierdzenie akcji
        </DialogTitle>
        <DialogContent>
          {pendingConfirmation && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Agent chce wykonać: <strong>{pendingConfirmation.toolCall.function.name}</strong>
              </Typography>
              <Paper sx={{ p: 2, bgcolor: 'grey.50', mt: 1 }}>
                <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {JSON.stringify(pendingConfirmation.args, null, 2)}
                </Typography>
              </Paper>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              pendingConfirmation?.resolve(false);
              setPendingConfirmation(null);
            }}
            color="inherit"
          >
            Odrzuć
          </Button>
          <Button
            onClick={() => {
              pendingConfirmation?.resolve(true);
              setPendingConfirmation(null);
            }}
            variant="contained"
            color="primary"
          >
            Potwierdź
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

function formatToolResult(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

export default CastleAgentPage;
