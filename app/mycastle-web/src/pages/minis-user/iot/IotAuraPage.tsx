/**
 * IotAuraPage - Aura: głosowy asystent (jak Amazon Alexa)
 *
 * Pipeline: (ciągłe) nasłuch mikrofonu -> STT -> AI (LLM) -> TTS -> odtworzenie.
 * Aura stale nasłuchuje na mikrofon i prowadzi konwersację z modelem AI.
 *
 * Konfigurowalne opcje:
 *  - Audio Input  (wybór mikrofonu)
 *  - Audio Output (wybór głośnika)
 *  - Model STT: Google STT / ElevenLabs Scribe v2 realtime / OpenAI Whisper / przeglądarka
 *  - Model TTS: Google TTS / ElevenLabs Multilingual v3 / OpenAI / przeglądarka
 *  - Model AI: ChatGPT (OpenAI) oraz Claude (w tym Claude Haiku 4.5)
 *
 * Na razie: prosta konwersacja z modelem AI (bez tool-callingu).
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
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  ListSubheader,
  InputLabel,
  FormControl,
  Grid,
  Button,
  Divider,
  Collapse,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import SendIcon from '@mui/icons-material/Send';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import SettingsVoiceIcon from '@mui/icons-material/SettingsVoice';
import HearingIcon from '@mui/icons-material/Hearing';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ScienceIcon from '@mui/icons-material/Science';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useParams, useNavigate } from 'react-router-dom';
import { App } from '../../../App';
import { AudioRecorder, createBrowserRecognition, RealtimeSttService } from '../../../modules/speech';
import type { TtsProviderType, SttProviderType, SpeechConfigModel } from '../../../modules/speech';
import type { AiProviderType, AiConfigModel } from '../../../modules/ai';
import { codeFromXml, readVfsFile, runVfsJsonQuery, setGlobalFunctionNames, extractGlobalFunctionNames } from '../../../modules/voiceactions';
import type { VoiceAction, VoiceActionVariant, WakeWord, VfsJsonQueryConfig } from '../../../modules/voiceactions';
import { useMqtt } from '../../../modules/mqttclient/MqttContext';

// ---- Stan asystenta ----
type AuraState = 'idle' | 'listening' | 'processing_stt' | 'thinking' | 'speaking';

const STATE_LABELS: Record<AuraState, string> = {
  idle: 'Gotowy',
  listening: 'Słucham...',
  processing_stt: 'Rozpoznaję mowę...',
  thinking: 'Myślę...',
  speaking: 'Mówię...',
};

const STATE_COLORS: Record<AuraState, string> = {
  idle: '#9e9e9e',
  listening: '#f44336',
  processing_stt: '#ff9800',
  thinking: '#2196f3',
  speaking: '#4caf50',
};

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ---- Modele AI (ChatGPT + Claude) ----
interface AiModelOption {
  id: string;
  label: string;
  provider: AiProviderType;
}

const OPENAI_MODELS: AiModelOption[] = [
  { id: 'gpt-4o', label: 'ChatGPT — GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', label: 'ChatGPT — GPT-4o mini', provider: 'openai' },
  { id: 'gpt-4.1', label: 'ChatGPT — GPT-4.1', provider: 'openai' },
];

const CLAUDE_MODELS: AiModelOption[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'anthropic' },
];

const ALL_AI_MODELS: AiModelOption[] = [...OPENAI_MODELS, ...CLAUDE_MODELS];

/** Normalizacja tekstu do dopasowań (małe litery, tylko litery/cyfry/spacje). */
const normText = (s: string): string =>
  s.toLowerCase().replace(/[^0-9a-ząćęłńóśźż ]/gi, ' ').replace(/\s+/g, ' ').trim();

// ---- Opcje STT / TTS ----
const STT_OPTIONS: { value: SttProviderType; label: string }[] = [
  { value: 'browser', label: 'Przeglądarka (Web Speech)' },
  { value: 'google', label: 'Google STT' },
  { value: 'elevenlabs', label: 'ElevenLabs Scribe v2 realtime' },
  { value: 'openai', label: 'OpenAI Whisper' },
];

const TTS_OPTIONS: { value: TtsProviderType; label: string }[] = [
  { value: 'browser', label: 'Przeglądarka (Web Speech)' },
  { value: 'google', label: 'Google TTS' },
  { value: 'elevenlabs', label: 'ElevenLabs (Eleven v3)' },
  { value: 'openai', label: 'OpenAI TTS' },
];

// Modele ElevenLabs (stan: lipiec 2026) - identyfikatory z dokumentacji ElevenLabs
const ELEVEN_TTS_MODELS: { id: string; label: string }[] = [
  { id: 'eleven_v3', label: 'Eleven v3 (najnowszy, ekspresyjny)' },
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (stabilny)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (najszybszy, ~75ms)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (jakość/szybkość)' },
];

const ELEVEN_STT_MODELS: { id: string; label: string }[] = [
  { id: 'scribe_v2', label: 'Scribe v2 (najnowszy)' },
  { id: 'scribe_v2_realtime', label: 'Scribe v2 realtime' },
];

const DEFAULT_SYSTEM_PROMPT =
  'Jesteś Aura — głosowym asystentem domowym w stylu Amazon Alexa. ' +
  'Odpowiadaj krótko, naturalnie i pomocnie, tak jakbyś mówił na głos. ' +
  'Mów po polsku, chyba że użytkownik mówi w innym języku.';

const IotAuraPage: React.FC = () => {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const { aiService, speechService, voiceActionService, wakeWordService } = App.instance;
  const { isConnected } = useMqtt();

  // Konwersacja
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<AuraState>('idle');
  const [interimText, setInterimText] = useState('');
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Tryb ciągłego nasłuchu (jak Alexa)
  const [alwaysOn, setAlwaysOn] = useState(false);

  // Słowo aktywacyjne (wake word) — konfigurowane w Edytorze Konwersacji, per język
  const [wakeWords, setWakeWords] = useState<WakeWord[]>([]);
  const [wakeLang, setWakeLang] = useState('pl');
  const [wakeActive, setWakeActive] = useState(false);

  // Wybory
  const [aiModelId, setAiModelId] = useState<string>('claude-haiku-4-5');
  const [sttProvider, setSttProvider] = useState<SttProviderType>('browser');
  const [ttsProvider, setTtsProvider] = useState<TtsProviderType>('browser');
  const [inputDeviceId, setInputDeviceId] = useState<string>('');
  const [outputDeviceId, setOutputDeviceId] = useState<string>('');
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  // Dostęp do mikrofonu wymaga bezpiecznego kontekstu (https lub localhost)
  const [micSupported] = useState<boolean>(
    typeof navigator !== 'undefined' && !!navigator.mediaDevices,
  );
  const [browserSttSupported] = useState<boolean>(
    typeof window !== 'undefined' &&
      !!((window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition),
  );
  const [isAndroid] = useState<boolean>(
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent),
  );

  // Konfiguracja kluczy API (edytowalne kopie configów AI i mowy)
  const [aiConfig, setAiConfig] = useState<AiConfigModel | null>(null);
  const [speechCfg, setSpeechCfg] = useState<SpeechConfigModel | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'ai' | 'tts' | 'stt' | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Refs (dostęp z callbacków asynchronicznych)
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const realtimeRef = useRef<RealtimeSttService | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const stateRef = useRef<AuraState>('idle');
  const alwaysOnRef = useRef(false);
  const sttProviderRef = useRef<SttProviderType>('browser');
  const inputDeviceRef = useRef<string>('');
  const stoppingRef = useRef(false);
  // Refy krzyżowe (unikanie forward-referencji między callbackami)
  const processUserInputRef = useRef<(text: string) => void>(() => {});
  const armListeningRef = useRef<() => void>(() => {});
  const finishCloudUtteranceRef = useRef<() => void>(() => {});
  // Runtime konwersacji (akcje głosowe z Edytora Konwersacji)
  const actionsRef = useRef<VoiceAction[]>([]);
  const variantsRef = useRef<VoiceActionVariant[]>([]);
  const globalXmlRef = useRef<string>('');
  const lastUtteranceRef = useRef<string>('');
  const actionDepthRef = useRef<number>(0);
  const captureHandleRef = useRef<{ stop: () => void } | null>(null);
  // Gdy trwa przechwytywanie (blok Nasłuchuj/Zapytaj) — pozwala nakarmić je tekstem z pola.
  const pendingCaptureRef = useRef<((t: string) => void) | null>(null);
  // Kolejka TTS (łańcuch) — zdania odtwarzane po kolei, nakładają się na streaming LLM.
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve());
  // Ochrona przed sprzężeniem: mikrofon łapiący własną mowę TTS (echo).
  const lastSpokenRef = useRef<string>('');
  const clearSpokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tryb nasłuchu: wake-word (czeka na słowo) vs ciągły. Refy krzyżowe.
  const wakeModeRef = useRef(false);
  const startWakeWordRef = useRef<() => boolean>(() => false);
  const resumeListeningRef = useRef<() => void>(() => {});
  // Runtime agenta AI (bloki AgentNewChat / AgentSendPrompt / Odpowiedź agenta AI)
  const agentChatsRef = useRef<Record<string, { role: 'user' | 'assistant'; content: string }[]>>({});
  const currentAgentChatRef = useRef<string>('default');
  const agentResponseRef = useRef<string>('');
  const aiModelIdRef = useRef<string>('claude-haiku-4-5');

  // Synchronizacja refów
  useEffect(() => { historyRef.current = messages; }, [messages]);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { alwaysOnRef.current = alwaysOn; }, [alwaysOn]);
  useEffect(() => { sttProviderRef.current = sttProvider; }, [sttProvider]);
  useEffect(() => { inputDeviceRef.current = inputDeviceId; }, [inputDeviceId]);
  useEffect(() => { aiModelIdRef.current = aiModelId; }, [aiModelId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText]);

  // ---- Ładowanie konfiguracji po połączeniu MQTT ----
  useEffect(() => {
    if (!isConnected) return;
    Promise.all([aiService.loadConfig(), speechService.loadConfig(), userName ? voiceActionService.loadConfig(userName) : Promise.resolve({ type: 'voice_actions' as const, actions: [], variants: [], wakeWords: [], globalXml: '' })]).then(([ai, speech, va]) => {
      setSttProvider(speech.stt.provider);
      setTtsProvider(speech.tts.provider);
      setAiConfig(ai);
      setSpeechCfg(speech);
      actionsRef.current = va.actions;
      variantsRef.current = va.variants;
      globalXmlRef.current = va.globalXml ?? '';
      setGlobalFunctionNames(extractGlobalFunctionNames(va.globalXml ?? ''));
      const ww = va.wakeWords ?? [];
      setWakeWords(ww);
      if (ww.length && !ww.some(w => w.language === 'pl')) setWakeLang(ww[0].language);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // ---- Enumeracja urządzeń audio ----
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter(d => d.kind === 'audioinput'));
      setOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
    } catch (err) {
      console.warn('[Aura] Nie można wylistować urządzeń:', err);
    }
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    refreshDevices();
    md.addEventListener?.('devicechange', refreshDevices);
    return () => {
      md.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  // ---- Zapis wyboru providera STT/TTS do konfiguracji ----
  const persistSpeechProviders = useCallback((stt: SttProviderType, tts: TtsProviderType) => {
    const base = speechCfg ?? speechService.getConfig();
    const updated: SpeechConfigModel = {
      ...base,
      stt: { ...base.stt, provider: stt },
      tts: { ...base.tts, provider: tts },
    };
    setSpeechCfg(updated);
    speechService.saveConfig(updated).catch(err => console.warn('[Aura] Zapis speech_config:', err));
  }, [speechCfg, speechService]);

  // Provider AI wynikający z wybranego modelu
  const selectedAiModel = ALL_AI_MODELS.find(m => m.id === aiModelId) || CLAUDE_MODELS[0];
  const aiProvider = selectedAiModel.provider;

  // ---- Aktualizacja kluczy w lokalnych kopiach configów ----
  const setAiApiKey = useCallback((provider: AiProviderType, value: string) => {
    setAiConfig(prev => prev && ({
      ...prev,
      providers: { ...prev.providers, [provider]: { ...prev.providers[provider], apiKey: value } },
    }));
  }, []);

  const setSttField = useCallback((field: string, value: string) => {
    setSpeechCfg(prev => {
      if (!prev) return prev;
      const sub = (prev.stt as unknown as Record<string, Record<string, unknown>>)[sttProvider];
      return {
        ...prev,
        stt: { ...prev.stt, [sttProvider]: { ...sub, [field]: value } },
      } as SpeechConfigModel;
    });
  }, [sttProvider]);

  const setTtsField = useCallback((field: string, value: string) => {
    setSpeechCfg(prev => {
      if (!prev) return prev;
      const sub = (prev.tts as unknown as Record<string, Record<string, unknown>>)[ttsProvider];
      return {
        ...prev,
        tts: { ...prev.tts, [ttsProvider]: { ...sub, [field]: value } },
      } as SpeechConfigModel;
    });
  }, [ttsProvider]);

  // ---- Zapis wszystkich kluczy / konfiguracji ----
  const saveAll = useCallback(async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const promises: Promise<unknown>[] = [];
      if (aiConfig) promises.push(aiService.saveConfig(aiConfig));
      if (speechCfg) {
        const withProviders: SpeechConfigModel = {
          ...speechCfg,
          stt: { ...speechCfg.stt, provider: sttProvider },
          tts: { ...speechCfg.tts, provider: ttsProvider },
        };
        setSpeechCfg(withProviders);
        promises.push(speechService.saveConfig(withProviders));
      }
      await Promise.all(promises);
      setTestResult({ ok: true, text: 'Zapisano konfigurację.' });
    } catch (err) {
      setTestResult({ ok: false, text: `Błąd zapisu: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  }, [aiConfig, speechCfg, sttProvider, ttsProvider, aiService, speechService]);

  // ---- Testy providerów (zapisują konfigurację, potem sprawdzają) ----
  const runTest = useCallback(async (kind: 'ai' | 'tts' | 'stt') => {
    setTesting(kind);
    setTestResult(null);
    try {
      await saveAll();
      if (kind === 'ai') {
        const res = await aiService.chat({
          provider: aiProvider,
          model: selectedAiModel.id,
          maxTokens: 20,
          messages: [{ role: 'user', content: 'Odpowiedz jednym słowem: OK' }],
        });
        setTestResult({ ok: true, text: `AI (${selectedAiModel.label}) odpowiedziało: „${res.content.trim()}"` });
      } else if (kind === 'tts') {
        const res = await speechService.testTts();
        setTestResult({ ok: res.success, text: `TTS: ${res.message}` });
      } else {
        const res = await speechService.testStt();
        setTestResult({ ok: res.success, text: `STT: ${res.message}` });
      }
    } catch (err) {
      setTestResult({ ok: false, text: `Test nieudany: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setTesting(null);
    }
  }, [saveAll, aiService, speechService, aiProvider, selectedAiModel]);

  // ---- Pomocnicze: dodawanie wiadomości ----
  const appendAssistant = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-a-${Math.random().toString(36).slice(2, 5)}`, role: 'assistant', content: text, timestamp: Date.now() }]);
  }, []);
  const appendUser = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-u-${Math.random().toString(36).slice(2, 5)}`, role: 'user', content: text, timestamp: Date.now() }]);
  }, []);

  // ---- Dopasowanie wypowiedzi do akcji głosowej (aktywatory) ----
  const matchAction = useCallback((utteranceRaw: string): VoiceAction | null => {
    const norm = normText(utteranceRaw);
    if (!norm) return null;
    const padded = ` ${norm} `;
    const words = norm.split(' ').filter(Boolean);
    // 1) dokładne aktywatory — jako całe słowa/fraza (bez fałszywych trafień typu „tak" w „kontakt")
    for (const a of actionsRef.current) {
      for (const s of (a.activatorStrings ?? [])) {
        const ss = normText(s);
        if (ss && padded.includes(` ${ss} `)) return a;
      }
    }
    // 2) aktywatory podobne (rozmyte — pokrycie CAŁYCH słów >= 60%)
    for (const a of actionsRef.current) {
      for (const s of (a.activatorsSimilarStringsArray ?? [])) {
        const pw = normText(s).split(' ').filter(Boolean);
        if (!pw.length) continue;
        const hit = pw.filter(w => words.includes(w)).length;
        if (hit / pw.length >= 0.6) return a;
      }
    }
    return null;
  }, []);

  // ---- Przechwycenie jednej wypowiedzi (dla bloków „Zapytaj" / „Nasłuchuj") ----
  const captureOneUtterance = useCallback((timeoutSec = 0): Promise<string> => {
    return new Promise<string>((resolve) => {
      setState('listening');
      setInterimText('');
      const provider = sttProviderRef.current;
      const fullCfg = speechService.getConfig().stt;
      // Fallback: jeśli provider chmurowy nie ma klucza API — użyj STT przeglądarki
      const sttCfg = fullCfg as unknown as Record<string, { apiKey?: string }>;
      const cloudKey = provider !== 'browser' ? (sttCfg[provider]?.apiKey || '') : '';
      const useRealtime = provider === 'elevenlabs' && !!cloudKey; // Scribe v2 realtime (WS)
      const useBrowser = !useRealtime && (provider === 'browser' || !cloudKey);
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = (text: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        const h = captureHandleRef.current;
        captureHandleRef.current = null;
        pendingCaptureRef.current = null;
        setInterimText('');
        h?.stop(); // zawsze przerwij trwający nasłuch (mowa lub tekst z pola)
        resolve(text.trim());
      };
      // Umożliw nakarmienie tekstem z pola podczas nasłuchu
      pendingCaptureRef.current = (t: string) => done(t);
      if (timeoutSec > 0) {
        timer = setTimeout(() => done(''), timeoutSec * 1000);
      }
      if (useRealtime) {
        // ElevenLabs Scribe v2 realtime (WebSocket) — transkrypcja w trakcie mówienia
        const rt = new RealtimeSttService();
        captureHandleRef.current = { stop: () => rt.stop() };
        rt.start({
          apiKey: cloudKey,
          language: fullCfg.elevenlabs.language || 'pol',
          deviceId: inputDeviceRef.current || undefined,
          model: fullCfg.elevenlabs.model,
          onPartial: (t) => setInterimText(t),
          onFinal: (t) => done(t),
          onError: () => done(''),
        }).catch(() => done(''));
      } else if (useBrowser) {
        const rec = createBrowserRecognition({
          lang: 'pl-PL', continuous: false, interimResults: true,
          onResult: (t, isFinal) => { if (isFinal) done(t); else setInterimText(t); },
          onError: () => done(''),
          onEnd: () => done(''),
        });
        if (!rec) { done(''); return; }
        captureHandleRef.current = { stop: () => rec.abort() };
        rec.start();
      } else {
        const recorder = new AudioRecorder();
        captureHandleRef.current = { stop: () => recorder.cancel() };
        recorder.start({
          onSilenceDetected: async () => {
            try {
              const blob = await recorder.stop();
              const r = await speechService.transcribe({ audio: blob });
              done(r.text);
            } catch { done(''); }
          },
          duration: 800,
          minRecordingTime: 500,
        }, inputDeviceRef.current || undefined).catch(() => done(''));
      }
    });
  }, [speechService]);

  // ---- Kolejka TTS: zdania odtwarzane sekwencyjnie (łańcuch obietnic) ----
  const enqueueTts = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setState('speaking');
    // Zapamiętaj wypowiadany tekst (ochrona przed echem); wyczyść po chwili od zakończenia.
    lastSpokenRef.current = normText(`${lastSpokenRef.current} ${t}`).slice(-400);
    if (clearSpokenTimerRef.current) clearTimeout(clearSpokenTimerRef.current);
    ttsChainRef.current = ttsChainRef.current
      .then(() => speechService.speak({ text: t }).catch(() => {}))
      .then(() => {
        if (clearSpokenTimerRef.current) clearTimeout(clearSpokenTimerRef.current);
        clearSpokenTimerRef.current = setTimeout(() => { lastSpokenRef.current = ''; }, 1800);
      });
  }, [speechService]);

  // Czy wypowiedź to echo naszej własnej mowy (TTS złapane przez mikrofon)?
  const isSelfEcho = useCallback((text: string): boolean => {
    const t = normText(text);
    const spoken = lastSpokenRef.current;
    if (!t || !spoken) return false;
    return spoken.includes(t) || t.includes(spoken);
  }, []);

  // Obsługa finalnej wypowiedzi z nasłuchu ciągłego (z guardem echa/pustki).
  const handleVoiceFinal = useCallback((text: string) => {
    setInterimText('');
    setState('idle');
    const t = text.trim();
    if (!t || isSelfEcho(t)) {
      // ignoruj echo/pustkę; wznów nasłuch (wake lub ciągły)
      resumeListeningRef.current();
      return;
    }
    processUserInputRef.current(t);
  }, [isSelfEcho]);

  // ---- Streaming odpowiedzi AI: pokazuje tekst na bieżąco i mówi zdaniami ----
  const streamAiResponse = useCallback(async (request: Parameters<typeof aiService.chatStream>[0]): Promise<string> => {
    const msgId = `${Date.now()}-a-stream-${Math.random().toString(36).slice(2, 5)}`;
    setMessages(prev => [...prev, { id: msgId, role: 'assistant', content: '', timestamp: Date.now() }]);
    let buffer = '';
    let full = '';
    const drain = (final: boolean) => {
      for (;;) {
        const m = buffer.match(/[.!?…\n]/);
        if (!m || m.index === undefined) break;
        const cut = m.index + 1;
        const sentence = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut);
        if (sentence) enqueueTts(sentence);
      }
      if (final && buffer.trim()) { enqueueTts(buffer.trim()); buffer = ''; }
    };
    try {
      const res = await aiService.chatStream(request, (delta) => {
        full += delta;
        buffer += delta;
        setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, content: full } : m)));
        drain(false);
      });
      full = res.content || full;
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, content: full } : m)));
    } catch (err) {
      const em = err instanceof Error ? err.message : String(err);
      full = full || `Przepraszam, wystąpił błąd: ${em}`;
      setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, content: full } : m)));
    }
    drain(true);
    await ttsChainRef.current; // poczekaj aż mowa się dokończy
    return full;
  }, [aiService, enqueueTts]);

  // ---- Wykonanie logiki konwersacji (wariant Blockly) ----
  const runVoiceActionRef = useRef<(a: VoiceAction, u: string) => Promise<void>>(async () => {});
  const runVoiceAction = useCallback(async (action: VoiceAction, _utterance: string) => {
    if (actionDepthRef.current > 5) return;
    actionDepthRef.current++;
    try {
      const variant =
        variantsRef.current.find(v => v.voiceActionId === action.id && v.language === action.language) ||
        variantsRef.current.find(v => v.voiceActionId === action.id);
      if (!variant || !variant.blocklyXml.trim()) {
        appendAssistant(`(Akcja „${action.name}" nie ma jeszcze logiki — dodaj bloczki w Edytorze Konwersacji.)`);
        return;
      }
      const globalCode = codeFromXml(globalXmlRef.current);
      const code = codeFromXml(variant.blocklyXml);
      const fullCode = `${globalCode}\n${code}`;
      console.debug('[Aura] uruchamiam akcję:', action.name, '\nkod:\n', fullCode);
      const handlers: Array<() => Promise<void>> = [];
      const globals: Record<string, (...a: unknown[]) => Promise<unknown>> = {};
      const aura = {
        _globals: globals,
        callGlobal: async (name: unknown, ...args: unknown[]): Promise<unknown> => {
          const fn = globals[String(name)];
          if (typeof fn === 'function') return await fn(...args);
          console.warn('[Aura] brak funkcji globalnej:', name);
          return undefined;
        },
        onActivator: (_phrase: string, fn: () => Promise<void>) => { handlers.push(fn); },
        say: async (text: unknown) => {
          const t = String(text ?? '');
          appendAssistant(t);
          if (t.trim()) { enqueueTts(t); await ttsChainRef.current; }
        },
        ask: async (text: unknown): Promise<string> => {
          const t = String(text ?? '');
          appendAssistant(t);
          if (t.trim()) { enqueueTts(t); await ttsChainRef.current; }
          const answer = await captureOneUtterance();
          if (answer) { appendUser(answer); lastUtteranceRef.current = answer; }
          return answer;
        },
        lastUtterance: () => lastUtteranceRef.current,
        utteranceContains: (t: unknown) => lastUtteranceRef.current.toLowerCase().includes(String(t ?? '').toLowerCase()),
        callAction: async (id: unknown) => {
          const key = String(id);
          const target = actionsRef.current.find(a => a.id === key || a.name === key || a.tag === key);
          if (target) await runVoiceActionRef.current(target, lastUtteranceRef.current);
        },
        wait: (s: unknown) => new Promise<void>(r => setTimeout(r, (Number(s) || 0) * 1000)),
        // Zakończ konwersację — pokaż tekst na stronie (bez odczytu głosem)
        endConversation: (msg: unknown) => {
          const t = String(msg ?? '').trim();
          if (t) appendAssistant(t);
        },
        // Nasłuchuj z limitem czasu — zwraca rozpoznany tekst
        listen: async (timeout: unknown): Promise<string> => {
          const secs = Number(timeout) || 0;
          appendAssistant(`🎧 Słucham${secs ? ` (do ${secs}s)` : ''}... powiedz lub wpisz odpowiedź.`);
          const t = await captureOneUtterance(secs);
          if (t) { appendUser(t); lastUtteranceRef.current = t; }
          else appendAssistant('(nie usłyszałem odpowiedzi)');
          return t;
        },
        // Nowy kontekst rozmowy z agentem AI
        agentNewChat: async (id: unknown) => {
          const key = String(id ?? '') || 'default';
          agentChatsRef.current[key] = [];
          currentAgentChatRef.current = key;
        },
        // Wyślij prompt do agenta AI (z pamięcią kontekstu), zapisz odpowiedź
        agentSendPrompt: async (prompt: unknown) => {
          const p = String(prompt ?? '');
          const key = currentAgentChatRef.current;
          const hist = agentChatsRef.current[key] || (agentChatsRef.current[key] = []);
          hist.push({ role: 'user', content: p });
          const model = ALL_AI_MODELS.find(m => m.id === aiModelIdRef.current) || CLAUDE_MODELS[0];
          setState('thinking');
          const content = await streamAiResponse({
            provider: model.provider,
            model: model.id,
            messages: [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...hist],
          });
          hist.push({ role: 'assistant', content });
          agentResponseRef.current = content;
        },
        // Ostatnia odpowiedź agenta AI (zmienna „Odpowiedź agenta AI")
        agentResponse: () => agentResponseRef.current,
        // VFS: wczytaj plik (treść tekstowa)
        vfsReadFile: async (path: unknown) => await readVfsFile(String(path ?? '')),
        // VFS: wczytaj JSON z okrojeniem ścieżki i filtrami (cfg może być stringiem JSON)
        vfsReadJson: async (cfg: unknown) => {
          let parsed: VfsJsonQueryConfig;
          try { parsed = (typeof cfg === 'string' ? JSON.parse(cfg || '{}') : cfg) as VfsJsonQueryConfig; }
          catch { return null; }
          if (!parsed || !parsed.path) return null;
          return await runVfsJsonQuery(parsed);
        },
      };
      setState('thinking');
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () { /* noop */ }).constructor as new (arg: string, body: string) => (aura: unknown) => Promise<void>;
        const fn = new AsyncFunction('aura', fullCode);
        await fn(aura);
        for (const h of handlers) { await h(); }
      } catch (err) {
        console.warn('[Aura] Błąd wykonania konwersacji:', err);
      }
    } finally {
      actionDepthRef.current--;
    }
  }, [captureOneUtterance, appendAssistant, appendUser, enqueueTts, streamAiResponse]);
  useEffect(() => { runVoiceActionRef.current = runVoiceAction; }, [runVoiceAction]);

  // ---- Przetwarzanie wypowiedzi: najpierw akcje głosowe, potem model AI ----
  const processUserInput = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    lastUtteranceRef.current = trimmed;

    appendUser(trimmed);
    setError(null);

    try {
      // 1) Spróbuj dopasować do akcji głosowej z Edytora Konwersacji
      const matched = matchAction(trimmed);
      console.debug('[Aura] akcje:', actionsRef.current.length, 'dopasowano:', matched?.name ?? '(brak → AI)');
      if (matched) {
        await runVoiceActionRef.current(matched, trimmed);
        return;
      }

      // 2) Fallback: rozmowa z modelem AI (streaming + mowa zdaniami)
      const model = ALL_AI_MODELS.find(m => m.id === aiModelId) || CLAUDE_MODELS[0];
      setState('thinking');
      const history = historyRef.current.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      await streamAiResponse({
        provider: model.provider,
        model: model.id,
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: trimmed },
        ],
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      appendAssistant(`Przepraszam, wystąpił błąd: ${errMsg}`);
    } finally {
      setState('idle');
      // Wznów nasłuch (wake-word lub ciągły) — z cooldownem by uniknąć echa/pętli
      resumeListeningRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiModelId, matchAction, appendUser, appendAssistant, streamAiResponse]);

  useEffect(() => { processUserInputRef.current = processUserInput; }, [processUserInput]);

  // ---- Rozpoczęcie pojedynczego cyklu nasłuchu ----
  const armListening = useCallback(async () => {
    if (stateRef.current !== 'idle') return;

    setState('listening');
    setInterimText('');
    setError(null);
    stoppingRef.current = false;

    const provider = sttProviderRef.current;
    const sttFull = speechService.getConfig().stt;

    // ElevenLabs Scribe v2 realtime (WebSocket) — transkrypcja na żywo
    if (provider === 'elevenlabs' && sttFull.elevenlabs.apiKey) {
      const rt = new RealtimeSttService();
      realtimeRef.current = rt;
      rt.start({
        apiKey: sttFull.elevenlabs.apiKey,
        language: sttFull.elevenlabs.language || 'pol',
        deviceId: inputDeviceRef.current || undefined,
        model: sttFull.elevenlabs.model,
        onPartial: (t) => setInterimText(t),
        onFinal: (t) => {
          rt.stop();
          realtimeRef.current = null;
          handleVoiceFinal(t);
        },
        onError: () => {
          rt.stop();
          realtimeRef.current = null;
          setState('idle');
          resumeListeningRef.current();
        },
      }).catch(() => {
        realtimeRef.current = null;
        setError('ElevenLabs realtime: nie udało się połączyć (sprawdź klucz API)');
        setState('idle');
      });
      return;
    }

    if (provider === 'browser') {
      // Web Speech API — nasłuch ciągły (mikrofon zostaje włączony, brak migotania);
      // po pierwszej finalnej wypowiedzi zatrzymujemy, by przetworzyć/odpowiedzieć.
      const recognition = createBrowserRecognition({
        lang: 'pl-PL',
        continuous: true,
        interimResults: true,
        onResult: (transcript, isFinal) => {
          if (isFinal) {
            const r = recognitionRef.current;
            recognitionRef.current = null;
            r?.abort();
            handleVoiceFinal(transcript);
          } else {
            setInterimText(transcript);
          }
        },
        onError: (err) => {
          recognitionRef.current = null;
          setInterimText('');
          if (err !== 'no-speech' && err !== 'aborted') {
            setError(`Błąd rozpoznawania mowy: ${err}`);
          }
          setState('idle');
          // Ponów nasłuch (wake lub ciągły), chyba że brak uprawnień
          if (err !== 'not-allowed') resumeListeningRef.current();
        },
        onEnd: () => {
          // Jeśli zakończono bez wyniku — ponów (wake lub ciągły)
          if (recognitionRef.current) {
            recognitionRef.current = null;
            setState('idle');
            resumeListeningRef.current();
          }
        },
      });

      if (recognition) {
        recognition.start();
        recognitionRef.current = recognition;
      } else {
        setError('Web Speech API niedostępne w tej przeglądarce');
        setState('idle');
      }
    } else {
      // Providery chmurowe: nagrywanie z auto-stopem po ciszy, następnie transkrypcja
      try {
        const recorder = new AudioRecorder();
        recorderRef.current = recorder;
        await recorder.start(
          { onSilenceDetected: () => finishCloudUtteranceRef.current(), duration: 800, minRecordingTime: 500 },
          inputDeviceRef.current || undefined,
        );
      } catch (err) {
        console.warn('[Aura] Brak dostępu do mikrofonu:', err);
        setError('Brak dostępu do wybranego mikrofonu');
        setState('idle');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { armListeningRef.current = armListening; }, [armListening]);

  // Wyodrębnij funkcję do finalizacji nagrania chmurowego (używana też z armListening)
  const finishCloudUtterance = useCallback(async () => {
    if (stoppingRef.current || !recorderRef.current) return;
    stoppingRef.current = true;
    setState('processing_stt');
    try {
      const audioBlob = await recorderRef.current.stop();
      recorderRef.current = null;
      const result = await speechService.transcribe({ audio: audioBlob });
      handleVoiceFinal(result.text);
    } catch (err) {
      console.warn('[Aura] Błąd transkrypcji:', err);
      setError('Błąd transkrypcji audio');
      recorderRef.current = null;
      setState('idle');
      resumeListeningRef.current();
    } finally {
      stoppingRef.current = false;
    }
  }, [speechService]);

  useEffect(() => { finishCloudUtteranceRef.current = finishCloudUtterance; }, [finishCloudUtterance]);

  // ---- Zatrzymanie nasłuchu ----
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      const r = recognitionRef.current;
      recognitionRef.current = null;
      r.abort();
    }
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
    }
    if (realtimeRef.current) {
      realtimeRef.current.stop();
      realtimeRef.current = null;
    }
    setInterimText('');
    setState('idle');
  }, []);

  // ---- Przełącznik „Nasłuch" ----
  // Jeśli ustawiono słowo aktywacyjne → tryb wake-word (czeka na słowo, potem tura).
  // Bez słowa aktywacyjnego → tryb ciągły (transkrybuje wszystko).
  const toggleAlwaysOn = useCallback((enabled: boolean) => {
    setAlwaysOn(enabled);
    alwaysOnRef.current = enabled;
    if (!enabled) {
      wakeModeRef.current = false;
      stopListening();
      wakeWordService.stop();
      setWakeActive(false);
      speechService.stopSpeaking();
      return;
    }
    const phrase = wakeWords.find(w => w.language === wakeLang)?.phrase?.trim();
    if (phrase && micSupported) {
      wakeModeRef.current = true;
      const ok = startWakeWordRef.current();
      if (!ok) {
        wakeModeRef.current = false;
        setError('Wake word niedostępny — sprawdź mikrofon/przeglądarkę. Przechodzę na nasłuch ciągły.');
        if (stateRef.current === 'idle') armListeningRef.current();
      }
    } else {
      wakeModeRef.current = false;
      if (stateRef.current === 'idle') armListeningRef.current();
    }
  }, [wakeWords, wakeLang, micSupported, wakeWordService, speechService, stopListening]);

  // ---- Słowo aktywacyjne (wake word) ----
  const langToRecog = (l: string): string =>
    ({ pl: 'pl-PL', en: 'en-US', de: 'de-DE', es: 'es-ES' } as Record<string, string>)[l] || 'pl-PL';

  const playWakeSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => ctx.close();
    } catch { /* brak AudioContext */ }
  }, []);

  const wakePhrase = wakeWords.find(w => w.language === wakeLang)?.phrase?.trim() || '';

  // Uruchom nasłuch słowa aktywacyjnego; po wykryciu → jedna tura konwersacji.
  const startWakeWordListening = useCallback((): boolean => {
    const phrase = wakeWords.find(w => w.language === wakeLang)?.phrase?.trim();
    if (!phrase) return false;
    wakeWordService.configure({
      phrase,
      sensitivity: 0.7,
      lang: langToRecog(wakeLang),
      onWake: () => {
        wakeWordService.stop();
        setWakeActive(false);
        playWakeSound();
        if (stateRef.current === 'idle') armListeningRef.current();
      },
      onStatusChange: (listening) => setWakeActive(listening),
    });
    return wakeWordService.start();
  }, [wakeWords, wakeLang, wakeWordService, playWakeSound]);
  useEffect(() => { startWakeWordRef.current = startWakeWordListening; }, [startWakeWordListening]);

  // Wznów nasłuch po turze: wake-word (czeka na słowo) lub ciągły.
  const resumeListening = useCallback(() => {
    if (!alwaysOnRef.current) return;
    if (wakeModeRef.current) {
      setTimeout(() => startWakeWordRef.current(), 500);
    } else {
      setTimeout(() => armListeningRef.current(), 900);
    }
  }, []);
  useEffect(() => { resumeListeningRef.current = resumeListening; }, [resumeListening]);

  // Zmiana języka słowa aktywacyjnego podczas nasłuchu wake → zrestartuj z nową frazą.
  useEffect(() => {
    if (alwaysOnRef.current && wakeModeRef.current && stateRef.current === 'idle') {
      wakeWordService.stop();
      startWakeWordRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeLang]);

  // ---- Ręczne kliknięcie mikrofonu (pojedyncze pytanie) ----
  const handleMicClick = useCallback(() => {
    if (state === 'listening') {
      if (sttProviderRef.current === 'browser' || realtimeRef.current) {
        stopListening();
      } else {
        finishCloudUtterance();
      }
    } else if (state === 'speaking') {
      speechService.stopSpeaking();
      setState('idle');
    } else if (state === 'idle') {
      armListeningRef.current();
    }
  }, [state, stopListening, finishCloudUtterance, speechService]);

  // ---- Wysłanie tekstu ----
  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim()) return;
    const text = textInput.trim();
    setTextInput('');
    // Jeśli trwa blok Nasłuchuj/Zapytaj — nakarm go wpisanym tekstem
    if (pendingCaptureRef.current) {
      pendingCaptureRef.current(text);
      return;
    }
    if (state === 'thinking' || state === 'processing_stt') return;
    if (state === 'listening') stopListening();
    processUserInputRef.current(text);
  }, [textInput, state, stopListening]);

  // ---- Czyszczenie ----
  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // ---- Cleanup ----
  useEffect(() => {
    return () => {
      alwaysOnRef.current = false;
      wakeWordService.stop();
      speechService.stopSpeaking();
      if (recognitionRef.current) recognitionRef.current.abort();
      if (recorderRef.current) recorderRef.current.cancel();
      if (realtimeRef.current) realtimeRef.current.stop();
      if (captureHandleRef.current) captureHandleRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Renderowanie wiadomości ----
  const renderMessage = (msg: ChatMessage) => (
    <Box
      key={msg.id}
      sx={{ display: 'flex', gap: 1, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
    >
      {msg.role === 'assistant' && <SmartToyIcon sx={{ color: '#7e57c2', mt: 0.5, fontSize: 20 }} />}
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
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>
        <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', textAlign: 'right', mt: 0.5, fontSize: 10 }}>
          {new Date(msg.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Paper>
      {msg.role === 'user' && <PersonIcon sx={{ color: 'primary.main', mt: 0.5, fontSize: 20 }} />}
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <RecordVoiceOverIcon sx={{ fontSize: 34, color: '#7e57c2' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.1 }}>Aura</Typography>
          <Typography variant="caption" color="text.secondary">
            Głosowy asystent {userName ? `· ${userName}` : ''}
          </Typography>
        </Box>

        <Chip
          label={STATE_LABELS[state]}
          size="small"
          sx={{
            bgcolor: STATE_COLORS[state] + '20',
            color: STATE_COLORS[state],
            fontWeight: 600,
            animation: state !== 'idle' ? 'pulse 1.5s ease-in-out infinite' : 'none',
            '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
          }}
        />

        <Tooltip title={
          alwaysOn
            ? (wakePhrase ? `Nasłuch: czeka na słowo „${wakePhrase}"` : 'Nasłuch ciągły aktywny')
            : (wakePhrase ? `Włącz nasłuch — czeka na słowo aktywacyjne „${wakePhrase}"` : 'Włącz nasłuch ciągły (bez słowa aktywacyjnego)')
        }>
          <FormControlLabel
            control={<Switch checked={alwaysOn} onChange={(_, c) => toggleAlwaysOn(c)} color="secondary" disabled={!micSupported} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {alwaysOn && wakeActive
                  ? <HearingIcon sx={{ fontSize: 18, color: STATE_COLORS.listening }} />
                  : <SettingsVoiceIcon sx={{ fontSize: 18 }} />}
                <Typography variant="caption">Nasłuch</Typography>
              </Box>
            }
            sx={{ mr: 0 }}
          />
        </Tooltip>

        {/* Język słowa aktywacyjnego (gdy skonfigurowano >1 język) */}
        {wakeWords.length > 1 && (
          <Select
            value={wakeLang}
            onChange={(e) => setWakeLang(e.target.value)}
            size="small"
            sx={{ height: 30, fontSize: 12 }}
          >
            {Array.from(new Set(wakeWords.map(w => w.language))).map(l => (
              <MenuItem key={l} value={l} sx={{ fontSize: 12 }}>{l}</MenuItem>
            ))}
          </Select>
        )}

        <Tooltip title="Edytor Konwersacji">
          <IconButton onClick={() => navigate(`/user/${userName}/iot/aura/conversation-editor`)} size="small">
            <AccountTreeIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Wyczyść historię">
          <IconButton onClick={clearHistory} size="small"><DeleteSweepIcon /></IconButton>
        </Tooltip>
      </Box>

      {/* Panel konfiguracji */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6} md={4}>
            <FormControl size="small" fullWidth>
              <InputLabel>Model AI</InputLabel>
              <Select label="Model AI" value={aiModelId} onChange={e => setAiModelId(e.target.value)}>
                <ListSubheader>ChatGPT</ListSubheader>
                {OPENAI_MODELS.map(m => <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>)}
                <ListSubheader>Claude</ListSubheader>
                {CLAUDE_MODELS.map(m => <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <FormControl size="small" fullWidth>
              <InputLabel>Model STT (mowa → tekst)</InputLabel>
              <Select
                label="Model STT (mowa → tekst)"
                value={sttProvider}
                onChange={e => {
                  const v = e.target.value as SttProviderType;
                  setSttProvider(v);
                  persistSpeechProviders(v, ttsProvider);
                }}
              >
                {STT_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <FormControl size="small" fullWidth>
              <InputLabel>Model TTS (tekst → mowa)</InputLabel>
              <Select
                label="Model TTS (tekst → mowa)"
                value={ttsProvider}
                onChange={e => {
                  const v = e.target.value as TtsProviderType;
                  setTtsProvider(v);
                  persistSpeechProviders(sttProvider, v);
                }}
              >
                {TTS_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={6}>
            <FormControl size="small" fullWidth>
              <InputLabel>Audio Input (mikrofon)</InputLabel>
              <Select
                label="Audio Input (mikrofon)"
                value={inputDeviceId}
                onChange={e => setInputDeviceId(e.target.value)}
                onOpen={refreshDevices}
              >
                <MenuItem value="">Domyślny</MenuItem>
                {inputDevices.map(d => (
                  <MenuItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Mikrofon ${d.deviceId.slice(0, 6)}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md={6}>
            <FormControl size="small" fullWidth>
              <InputLabel>Audio Output (głośnik)</InputLabel>
              <Select
                label="Audio Output (głośnik)"
                value={outputDeviceId}
                onChange={e => setOutputDeviceId(e.target.value)}
                onOpen={refreshDevices}
              >
                <MenuItem value="">Domyślny</MenuItem>
                {outputDevices.map(d => (
                  <MenuItem key={d.deviceId} value={d.deviceId}>
                    {d.label || `Głośnik ${d.deviceId.slice(0, 6)}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Wybór mikrofonu dotyczy providerów chmurowych (Google / ElevenLabs / OpenAI). Providery chmurowe wymagają skonfigurowania kluczy API poniżej.
        </Typography>

        <Divider sx={{ my: 1.5 }} />
        <Button
          size="small"
          startIcon={<VpnKeyIcon />}
          endIcon={<ExpandMoreIcon sx={{ transform: showKeys ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
          onClick={() => setShowKeys(v => !v)}
        >
          Klucze API i testy
        </Button>

        <Collapse in={showKeys}>
          <Grid container spacing={1.5} sx={{ mt: 0.25 }}>
            {/* Klucz API modelu AI */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small" type="password"
                label={`Klucz API — ${aiProvider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (ChatGPT)'}`}
                placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                value={aiConfig?.providers[aiProvider]?.apiKey ?? ''}
                onChange={e => setAiApiKey(aiProvider, e.target.value)}
                autoComplete="off"
              />
            </Grid>

            {/* Klucz API STT (tylko providery chmurowe) */}
            {sttProvider !== 'browser' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth size="small" type="password"
                  label={`Klucz API — STT (${STT_OPTIONS.find(o => o.value === sttProvider)?.label})`}
                  value={((speechCfg?.stt as unknown as Record<string, { apiKey?: string }>)?.[sttProvider]?.apiKey) ?? ''}
                  onChange={e => setSttField('apiKey', e.target.value)}
                  autoComplete="off"
                />
              </Grid>
            )}

            {/* Klucz API TTS (tylko providery chmurowe) */}
            {ttsProvider !== 'browser' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth size="small" type="password"
                  label={`Klucz API — TTS (${TTS_OPTIONS.find(o => o.value === ttsProvider)?.label})`}
                  value={((speechCfg?.tts as unknown as Record<string, { apiKey?: string }>)?.[ttsProvider]?.apiKey) ?? ''}
                  onChange={e => setTtsField('apiKey', e.target.value)}
                  autoComplete="off"
                />
              </Grid>
            )}

            {/* ElevenLabs STT: wybór modelu */}
            {sttProvider === 'elevenlabs' && (
              <Grid item xs={12} md={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Model ElevenLabs STT</InputLabel>
                  <Select
                    label="Model ElevenLabs STT"
                    value={speechCfg?.stt.elevenlabs.model ?? 'scribe_v2'}
                    onChange={e => setSttField('model', e.target.value)}
                  >
                    {ELEVEN_STT_MODELS.map(m => <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* ElevenLabs TTS: wybór modelu */}
            {ttsProvider === 'elevenlabs' && (
              <Grid item xs={12} md={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Model ElevenLabs TTS</InputLabel>
                  <Select
                    label="Model ElevenLabs TTS"
                    value={speechCfg?.tts.elevenlabs.model ?? 'eleven_v3'}
                    onChange={e => setTtsField('model', e.target.value)}
                  >
                    {ELEVEN_TTS_MODELS.map(m => <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* ElevenLabs: identyfikator głosu dla TTS */}
            {ttsProvider === 'elevenlabs' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth size="small"
                  label="ElevenLabs Voice ID"
                  value={speechCfg?.tts.elevenlabs.voiceId ?? ''}
                  onChange={e => setTtsField('voiceId', e.target.value)}
                />
              </Grid>
            )}
          </Grid>

          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={saveAll} disabled={saving || !aiConfig}>
              Zapisz
            </Button>
            <Button variant="outlined" size="small"
              startIcon={testing === 'ai' ? <CircularProgress size={16} /> : <ScienceIcon />}
              onClick={() => runTest('ai')} disabled={testing !== null || saving || !aiConfig}>
              Test AI
            </Button>
            <Button variant="outlined" size="small"
              startIcon={testing === 'tts' ? <CircularProgress size={16} /> : <ScienceIcon />}
              onClick={() => runTest('tts')} disabled={testing !== null || saving}>
              Test TTS
            </Button>
            <Button variant="outlined" size="small"
              startIcon={testing === 'stt' ? <CircularProgress size={16} /> : <ScienceIcon />}
              onClick={() => runTest('stt')} disabled={testing !== null || saving}>
              Test STT
            </Button>
          </Box>

          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mt: 1 }} onClose={() => setTestResult(null)}>
              {testResult.text}
            </Alert>
          )}
        </Collapse>
      </Paper>

      {!micSupported && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Mikrofon jest niedostępny w tym kontekście. Przeglądarka udostępnia mikrofon tylko przez
          <b> HTTPS</b> lub <b>localhost</b>. Na telefonie łączysz się po zwykłym http, więc funkcje głosowe
          są wyłączone — możesz nadal pisać do Aury tekstem. Aby mówić, otwórz stronę po HTTPS lub przez localhost.
        </Alert>
      )}
      {micSupported && !browserSttSupported && sttProvider === 'browser' && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Ta przeglądarka nie wspiera rozpoznawania mowy (Web Speech API). Wybierz chmurowy model STT
          (Google / ElevenLabs / OpenAI) z kluczem API, albo pisz tekstem.
        </Alert>
      )}
      {isAndroid && sttProvider === 'browser' && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Na Androidzie STT „Przeglądarka" (Web Speech) <b>restartuje mikrofon po każdej pauzie</b> (ograniczenie systemu —
          stąd migotanie i „ding"). Dla <b>stabilnego mikrofonu</b> wybierz Model STT = <b>ElevenLabs Scribe v2 realtime</b>
          (z kluczem API) — jeden ciągły strumień, bez restartów.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      {/* Konwersacja */}
      <Paper sx={{ flex: 1, overflow: 'auto', p: 2, mb: 2, bgcolor: 'grey.50', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {messages.length === 0 && !interimText && (
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <RecordVoiceOverIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Włącz „Nasłuch”, aby Aura stale słuchała — lub naciśnij mikrofon i mów.
            </Typography>
          </Box>
        )}

        {messages.map(renderMessage)}

        {interimText && (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Paper elevation={0} sx={{ p: 1.5, maxWidth: '75%', bgcolor: 'primary.light', color: 'white', borderRadius: 2, opacity: 0.7 }}>
              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{interimText}...</Typography>
            </Paper>
            <PersonIcon sx={{ color: 'primary.light', mt: 0.5, fontSize: 20 }} />
          </Box>
        )}

        {state === 'thinking' && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <SmartToyIcon sx={{ color: '#7e57c2', fontSize: 20 }} />
            <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="body2" color="text.secondary">Myślę...</Typography>
            </Paper>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Paper>

      {/* Panel wejścia */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Tooltip title={
          state === 'listening' ? 'Nagrywam — kliknij, aby zakończyć'
            : state === 'speaking' ? 'Zatrzymaj mówienie'
              : 'Naciśnij, aby mówić'
        }>
          <span>
            <IconButton
              onClick={handleMicClick}
              disabled={!micSupported || state === 'processing_stt' || state === 'thinking'}
              sx={{
                width: 56, height: 56,
                bgcolor: state === 'listening' ? 'error.main' : state === 'speaking' ? 'success.main' : 'primary.main',
                color: 'white',
                '&:hover': { bgcolor: state === 'listening' ? 'error.dark' : state === 'speaking' ? 'success.dark' : 'primary.dark' },
                '&.Mui-disabled': { bgcolor: 'grey.300', color: 'white' },
                animation: state === 'listening' ? 'pulse-mic 1s ease-in-out infinite' : 'none',
                '@keyframes pulse-mic': { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.1)' } },
              }}
            >
              {state === 'listening' ? <MicOffIcon />
                : (state === 'processing_stt' || state === 'thinking') ? <CircularProgress size={24} sx={{ color: 'white' }} />
                  : <MicIcon />}
            </IconButton>
          </span>
        </Tooltip>

        <TextField
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
          placeholder="Napisz wiadomość do Aury..."
          fullWidth size="small" multiline maxRows={3}
          disabled={state === 'thinking' || state === 'processing_stt'}
        />

        <Tooltip title="Wyślij">
          <span>
            <IconButton onClick={handleTextSubmit} disabled={!textInput.trim() || state === 'thinking' || state === 'processing_stt'} color="primary">
              <SendIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default IotAuraPage;
