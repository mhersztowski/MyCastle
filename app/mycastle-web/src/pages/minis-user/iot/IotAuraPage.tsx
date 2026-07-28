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
  Slider,
  Button,
  Divider,
  Collapse,
  Tabs,
  Tab,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import SendIcon from '@mui/icons-material/Send';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import BugReportIcon from '@mui/icons-material/BugReport';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BlockIcon from '@mui/icons-material/Block';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SettingsIcon from '@mui/icons-material/Settings';
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
import type { AiChatMessage } from '../../../modules/ai/models/AiModels';
import { VFS_TOOLS, executeVfsTool } from './auraVfsTools';
import { codeFromXml, readVfsFile, runVfsJsonQuery, setGlobalFunctionNames, extractGlobalFunctionNames, ComponentHost } from '../../../modules/voiceactions';
import type { VoiceAction, VoiceActionVariant, WakeWord, VfsJsonQueryConfig, ShowComponentConfig } from '../../../modules/voiceactions';
import { useMqtt } from '../../../modules/mqttclient/MqttContext';
import { useFilesystem } from '@mhersztowski/web-client';
import { useAuth } from '../../../modules/auth/AuthContext';
import { variantLogicMode } from '@mhersztowski/core';
// Logika konwersacji (Konwersacja / VFS / Sieć / Komponenty / Funkcje globalne)
// — jedno źródło dla bloczków i dla skryptów automatyzacji.
import { Aura, aura, type AuraHost, type AuraBackgroundAction } from '../../../../../../packages/core/browser/aura/aura';
import { DEFAULT_BACKGROUND_REMINDER, DEFAULT_VOICE_ACTION_COLLECTION, type AuraBackgroundReminder } from '@mhersztowski/core';
import { createAuraServer, type AuraServer } from '../../../modules/voiceactions/auraServerApi';
import { prepareAutomateScript } from '../../../modules/voiceactions/auraScriptRuntime';
import { createAutomateApi, createDisplay, type AutomateApi } from '../../../../../../packages/core/browser/api/api';
import { readAuraScript } from '../../../modules/voiceactions/auraScriptStore';
import { buildRuntimeCode } from '../../../components/mdeditor/extensions/automateScriptCore';
import { AutomateSystemApi } from '../../../modules/automate/engine/AutomateSystemApi';
import { AutomateSandbox } from '../../../modules/automate/engine/AutomateSandbox';

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
  component?: ShowComponentConfig;
  /** 'info' = drobna notka o aktywności agenta (np. odczyt/zapis pliku), renderowana dyskretnie. */
  kind?: 'info';
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

export interface IotAuraPageProps {
  /** Nadpisuje użytkownika z trasy — widget na pulpicie nie ma parametrów routingu. */
  userName?: string;
  /**
   * Widok kompaktowy: ostatnia wiadomość zamiast całej rozmowy, bez paneli
   * konfiguracji. Używany przez widget „Aura" na pulpicie.
   */
  embedded?: boolean;
  /** Czy widget jest rozwinięty na pełny ekran (wtedy pokazujemy pełną konwersację). */
  fullscreen?: boolean;
  /** Podane = w nagłówku pojawia się przycisk pełnego ekranu. */
  onToggleFullscreen?: () => void;
}

const IotAuraPage: React.FC<IotAuraPageProps> = ({
  userName: userNameProp,
  embedded = false,
  fullscreen = false,
  onToggleFullscreen,
}) => {
  const { userName: userNameFromRoute } = useParams<{ userName: string }>();
  const userName = userNameProp ?? userNameFromRoute;
  // Kompaktowy widok obowiązuje tylko w widgecie i tylko poza pełnym ekranem.
  const compact = embedded && !fullscreen;
  const navigate = useNavigate();
  const { aiService, speechService, voiceActionService, wakeWordService } = App.instance;
  const { isConnected } = useMqtt();
  // Skrypty akcji dostają to samo `api`, co blok ```automate``` w notatkach.
  const { dataSource } = useFilesystem();
  const { token } = useAuth();
  const automateApiRef = useRef<AutomateSystemApi | null>(null);
  const automateVarsRef = useRef<Record<string, unknown>>({});
  /** Fasada API backendu dla bloczków „Serwer" — łączy się dopiero przy pierwszym użyciu. */
  const serverApiRef = useRef<AuraServer | null>(null);
  useEffect(() => () => { serverApiRef.current?.dispose(); serverApiRef.current = null; }, []);

  // Konwersacja
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // ── Akcje w tle (`Aura.backgroundAction`) ────────────────────────────────
  // Lista żyje w klasie Aura (skrypt zgłasza akcję i czeka na decyzję), więc tutaj
  // tylko na nią patrzymy przez subskrypcję.
  const [view, setView] = useState<'chat' | 'background'>('chat');
  const [bgActions, setBgActions] = useState<AuraBackgroundAction[]>(() => Aura.backgroundActions());
  useEffect(() => Aura.onBackgroundChange(() => setBgActions(Aura.backgroundActions())), []);
  // Migający wskaźnik gaśnie dopiero po zajrzeniu do listy — zgłoszenie z tła
  // ma zostać zauważone, nawet jeśli akurat trwała rozmowa.
  const hasPendingBg = bgActions.length > 0;

  // Przypomnienie o czekających zgłoszeniach. Ustawienie jedzie z kolekcją akcji
  // głosowych na backend (`voice_actions.json`), więc obowiązuje na każdym
  // urządzeniu — strona i widget na pulpicie czytają to samo źródło.
  const [bgReminder, setBgReminder] = useState<AuraBackgroundReminder>({ ...DEFAULT_BACKGROUND_REMINDER });
  const [bgSettingsOpen, setBgSettingsOpen] = useState(false);
  const saveBgReminder = useCallback((next: AuraBackgroundReminder) => {
    setBgReminder(next);
    if (!userName) return;
    const data = voiceActionService.getData();
    voiceActionService
      .saveConfig(userName, { ...data, backgroundReminder: next })
      .catch((err) => console.warn('[Aura] Zapis ustawień przypomnień:', err));
  }, [userName, voiceActionService]);

  const bgCountRef = useRef(0);
  bgCountRef.current = bgActions.length;
  const lastBgReminderRef = useRef(Date.now());
  useEffect(() => {
    if (!bgReminder.enabled) return;
    lastBgReminderRef.current = Date.now();
    // Tykamy co 15 s i sami sprawdzamy, czy minął interwał — dzięki temu zmiana
    // ustawienia działa od razu i nie gubimy odliczania przy przerysowaniu.
    const id = setInterval(() => {
      if (!bgCountRef.current) return;
      const elapsedMin = (Date.now() - lastBgReminderRef.current) / 60000;
      if (elapsedMin < Math.max(1, bgReminder.minutes)) return;
      lastBgReminderRef.current = Date.now();
      const n = bgCountRef.current;
      // Odmiana: 1 akcja / 2–4 akcje / 5+ akcji (z wyjątkiem nastolatek 12–14).
      const tens = n % 100;
      const unit = n % 10;
      const noun = n === 1 ? 'akcja' : (unit >= 2 && unit <= 4 && (tens < 12 || tens > 14)) ? 'akcje' : 'akcji';
      void Aura.bell()
        .catch(() => {})
        .then(() => Aura.say(`Czeka ${n} ${noun} w tle`))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [bgReminder.enabled, bgReminder.minutes]);
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

  // Panel debug — log cyklu życia mikrofonu (diagnostyka mobile/Android)
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const dbg = useCallback((msg: string) => {
    const d = new Date();
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    const line = `[${ts}] ${msg}`;
    console.log('[Aura-dbg]', line);
    setDebugLog(prev => (prev.length > 400 ? [...prev.slice(-400), line] : [...prev, line]));
  }, []);
  const dbgRef = useRef(dbg);
  useEffect(() => { dbgRef.current = dbg; }, [dbg]);

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
  // Ciągły nasłuch słowa aktywacyjnego przez realtime STT (bez restartu mikrofonu = bez beepa na Androidzie)
  const wakeRealtimeRef = useRef<RealtimeSttService | null>(null);
  // Nasłuch słowa aktywacyjnego przez nagrywanie+transkrypcję chmurową (OpenAI/Google) — bez Web Speech = bez beepa
  const cloudWakeRecorderRef = useRef<AudioRecorder | null>(null);
  const cloudWakeActiveRef = useRef(false);
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
  const googleSearchRef = useRef<{ apiKey?: string; cx?: string; serperKey?: string }>({ apiKey: '', cx: '' });
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
  // Konteksty agenta AI trzyma teraz klasa Aura (browser/aura/aura.ts).
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
    Promise.all([aiService.loadConfig(), speechService.loadConfig(), userName ? voiceActionService.loadConfig(userName) : Promise.resolve({ ...DEFAULT_VOICE_ACTION_COLLECTION })]).then(([ai, speech, va]) => {
      setSttProvider(speech.stt.provider);
      setTtsProvider(speech.tts.provider);
      setAiConfig(ai);
      setSpeechCfg(speech);
      actionsRef.current = va.actions;
      variantsRef.current = va.variants;
      globalXmlRef.current = va.globalXml ?? '';
      googleSearchRef.current = va.googleSearch ?? { apiKey: '', cx: '' };
      setBgReminder(va.backgroundReminder ?? { ...DEFAULT_BACKGROUND_REMINDER });
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

  // ---- Głośność wejścia (gain mikrofonu) / wyjścia (TTS) — pola górnego poziomu stt/tts ----
  const applyInputGain = useCallback((v: number, save: boolean) => {
    setSpeechCfg(prev => {
      const base = prev ?? speechService.getConfig();
      const up: SpeechConfigModel = { ...base, stt: { ...base.stt, inputGain: v } };
      if (save) speechService.saveConfig(up).catch(() => {});
      return up;
    });
  }, [speechService]);
  const applyOutputVolume = useCallback((v: number, save: boolean) => {
    setSpeechCfg(prev => {
      const base = prev ?? speechService.getConfig();
      const up: SpeechConfigModel = { ...base, tts: { ...base.tts, outputVolume: v } };
      if (save) speechService.saveConfig(up).catch(() => {});
      return up;
    });
  }, [speechService]);

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
  // Dyskretna notka o aktywności agenta (odczyt/zapis pliku) — NIE jest wypowiadana przez TTS.
  const appendInfo = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `${Date.now()}-i-${Math.random().toString(36).slice(2, 5)}`, role: 'assistant', kind: 'info', content: text, timestamp: Date.now() }]);
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
        }, inputDeviceRef.current || undefined, fullCfg.inputGain ?? 1).catch(() => done(''));
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

  // ---- Pętla agentowa z narzędziami VFS (dostęp do plików Drive użytkownika) ----
  // Model może wołać list_files/read_file/write_file; wyniki wracają do niego, a w czacie
  // pojawiają się dyskretne notki (📖/📝/📁). Odpowiedź końcowa jest wypowiadana zdaniami.
  const runAiTurnWithTools = useCallback(async (baseMessages: AiChatMessage[]): Promise<string> => {
    const model = ALL_AI_MODELS.find(m => m.id === aiModelId) || CLAUDE_MODELS[0];
    const messages: AiChatMessage[] = [...baseMessages];
    // Dopisz do wiadomości systemowej informację o dostępie do plików.
    const fileHint = ' Masz dostęp do plików użytkownika na Drive przez narzędzia list_files/read_file/write_file — używaj ich, gdy pytanie dotyczy plików, notatek lub danych na dysku.';
    const sysIdx = messages.findIndex(m => m.role === 'system');
    if (sysIdx >= 0 && typeof messages[sysIdx].content === 'string') {
      messages[sysIdx] = { ...messages[sysIdx], content: (messages[sysIdx].content as string) + fileHint };
    } else {
      messages.unshift({ role: 'system', content: fileHint.trim() });
    }

    let finalText = '';
    for (let step = 0; step < 6; step++) {
      const resp = await aiService.chat({ provider: model.provider, model: model.id, messages, tools: VFS_TOOLS, tool_choice: 'auto' });
      if (resp.toolCalls && resp.toolCalls.length) {
        messages.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.toolCalls });
        for (const tc of resp.toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* zły JSON → puste argumenty */ }
          const { result, info } = await executeVfsTool(userName || '', tc.function.name, args);
          appendInfo(info);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
        }
        continue; // odeślij wyniki narzędzi do modelu i powtórz
      }
      finalText = resp.content || '';
      break;
    }

    if (finalText) {
      appendAssistant(finalText);
      // Wypowiedz odpowiedź zdaniami (jak w streamie).
      const parts = finalText.split(/(?<=[.!?…\n])/);
      let buf = '';
      for (const p of parts) { buf += p; if (/[.!?…\n]\s*$/.test(p) && buf.trim()) { enqueueTts(buf.trim()); buf = ''; } }
      if (buf.trim()) enqueueTts(buf.trim());
      await ttsChainRef.current;
    }
    return finalText;
  }, [aiService, aiModelId, userName, appendInfo, appendAssistant, enqueueTts]);

  // ---- Wykonanie logiki konwersacji (wariant Blockly) ----
  const runVoiceActionRef = useRef<(a: VoiceAction, u: string) => Promise<void>>(async () => {});
  const runVoiceAction = useCallback(async (action: VoiceAction, _utterance: string) => {
    if (actionDepthRef.current > 5) return;
    actionDepthRef.current++;
    try {
      const variant =
        variantsRef.current.find(v => v.voiceActionId === action.id && v.language === action.language) ||
        variantsRef.current.find(v => v.voiceActionId === action.id);
      const usesScript = !!variant && variantLogicMode(variant) === 'automate';
      if (!variant || (!usesScript && !variant.blocklyXml.trim())) {
        appendAssistant(`(Akcja „${action.name}" nie ma jeszcze logiki — dodaj bloczki w Edytorze Konwersacji.)`);
        return;
      }
      const globalCode = codeFromXml(globalXmlRef.current);
      // Wariant „skrypt" trzyma logikę w pliku drive/automate/aura/*.md — ten sam
      // format co blok ```automate``` w notatkach, więc kod bierzemy przez
      // buildRuntimeCode (skleja ręczny kod z tym wygenerowanym w Blockly).
      let code: string;
      if (variantLogicMode(variant) === 'automate') {
        if (!variant.scriptPath || !userName) {
          appendAssistant(`(Akcja „${action.name}" nie ma przypisanego pliku skryptu.)`);
          return;
        }
        const file = await readAuraScript(userName, variant.scriptPath);
        code = buildRuntimeCode(file?.code ?? '');
        if (!code.trim()) {
          appendAssistant(`(Skrypt akcji „${action.name}" jest pusty — uzupełnij go w Edytorze Konwersacji.)`);
          return;
        }
      } else {
        code = codeFromXml(variant.blocklyXml);
      }
      // Import modułu Aury jest w skrypcie tylko po to, żeby czytało się jak
      // moduł — sam symbol wstrzykujemy do zasięgu, więc instrukcję usuwamy.
      const fullCode = prepareAutomateScript(`${globalCode}\n${code}`).code;
      console.debug('[Aura] uruchamiam akcję:', action.name, '\nkod:\n', fullCode);
      // Logika Aury żyje w packages/core/browser/aura/aura.ts — tu dostarczamy
      // tylko prymitywy interfejsu (czat, TTS, mikrofon, model AI, VFS).
      const host: AuraHost = {
        appendAssistant,
        appendUser,
        speak: async (text) => { enqueueTts(text); await ttsChainRef.current; },
        capture: (timeoutSec) => captureOneUtterance(timeoutSec),
        setThinking: () => setState('thinking'),
        showComponent: (cfg) => {
          setMessages(prev => [...prev, {
            id: `${Date.now()}-c-${Math.random().toString(36).slice(2, 5)}`,
            role: 'assistant', content: '', timestamp: Date.now(),
            component: cfg as unknown as ShowComponentConfig,
          }]);
        },
        runAction: async (key, utterance) => {
          const target = actionsRef.current.find(a => a.id === key || a.name === key || a.tag === key);
          if (target) await runVoiceActionRef.current(target, utterance);
        },
        askAi: async (messages) => {
          const model = ALL_AI_MODELS.find(m => m.id === aiModelIdRef.current) || CLAUDE_MODELS[0];
          return await streamAiResponse({
            provider: model.provider,
            model: model.id,
            messages: [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }, ...messages],
          });
        },
        readVfsFile: (path) => readVfsFile(path),
        queryVfsJson: (query) => runVfsJsonQuery(query as unknown as VfsJsonQueryConfig),
        getLastUtterance: () => lastUtteranceRef.current,
        setLastUtterance: (text) => { lastUtteranceRef.current = text; },
        getSerperKey: () => googleSearchRef.current.serperKey ?? '',
        debug: (message) => dbgRef.current(message),
      };
      Aura.setHost(host);
      Aura.beginRun();

      setState('thinking');
      try {
        if (usesScript) {
          // Skrypt idzie przez ten sam sandbox co blok w notatce, więc ma `api`
          // i `display`; `aura` dokładamy przez hostScope jako lokalny const.
          if (!automateApiRef.current) {
            automateApiRef.current = new AutomateSystemApi(
              dataSource,
              automateVarsRef.current,
              () => undefined,
              () => userName ?? null,
              () => token ?? null,
            );
          }
          // Granica środowiska: rozmowa nie ma dokumentu markdown, więc to, czego
          // brakuje (np. api.doc), melduje brak zamiast wywracać skrypt.
          const scriptApi = createAutomateApi(
            automateApiRef.current as unknown as Partial<AutomateApi>,
            {
              unavailableReason: 'skrypt uruchomiony w rozmowie z Aurą',
              onUnavailable: (message) => appendAssistant(`⚠️ ${message}`),
            },
          );
          // display.* nie ma tu panelu wyjścia — pozycje lądują w czacie.
          const display = createDisplay({
            push: (item) => {
              switch (item.type) {
                case 'json':
                case 'table':
                  appendAssistant(JSON.stringify(item.data, null, 2));
                  break;
                case 'list':
                  appendAssistant(Array.isArray(item.data)
                    ? item.data.map(i => `• ${String(i)}`).join('\n')
                    : String(item.data ?? ''));
                  break;
                case 'dom':
                  appendAssistant('(display.dom nie jest dostępny w rozmowie z Aurą)');
                  break;
                default:
                  appendAssistant(String(item.data ?? ''));
              }
            },
          });
          // `Server` (browser/server/api.ts) — operacje backendu bez jawnego
          // połączenia; tworzymy raz, żeby akcje dzieliły to samo MQTT.
          if (!serverApiRef.current) {
            serverApiRef.current = createAuraServer(() => ({
              userName: userName ?? '',
              token: token ?? '',
            }));
          }
          await AutomateSandbox.execute(
            fullCode,
            scriptApi as unknown as AutomateSystemApi,
            {},
            automateVarsRef.current,
            undefined,
            { Aura, aura, api: scriptApi, display, Server: serverApiRef.current },
          );
        } else {
          const AsyncFunction = Object.getPrototypeOf(async function () { /* noop */ }).constructor as new (
            ...args: string[]
          ) => (auraAlias: unknown, auraClass: unknown, server: unknown) => Promise<void>;
          if (!serverApiRef.current) {
            serverApiRef.current = createAuraServer(() => ({
              userName: userName ?? '',
              token: token ?? '',
            }));
          }
          const fn = new AsyncFunction('aura', 'Aura', 'Server', fullCode);
          await fn(aura, Aura, serverApiRef.current);
        }
        for (const handler of Aura.pendingHandlers()) { await handler(); }
      } catch (err) {
        console.warn('[Aura] Błąd wykonania konwersacji:', err);
        appendAssistant(`(Błąd skryptu: ${err instanceof Error ? err.message : String(err)})`);
      }
    } finally {
      actionDepthRef.current--;
    }
  }, [captureOneUtterance, appendAssistant, appendUser, enqueueTts, streamAiResponse,
      userName, dataSource, token]);
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

      // 2) Fallback: rozmowa z modelem AI (agent z narzędziami VFS + mowa zdaniami)
      setState('thinking');
      const history = historyRef.current.slice(-20)
        .filter(m => m.kind !== 'info') // notki o plikach nie idą do modelu
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      await runAiTurnWithTools([
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: trimmed },
      ]);
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
  }, [matchAction, appendUser, appendAssistant, runAiTurnWithTools]);

  useEffect(() => { processUserInputRef.current = processUserInput; }, [processUserInput]);

  // ---- Rozpoczęcie pojedynczego cyklu nasłuchu ----
  const armListening = useCallback(async () => {
    if (stateRef.current !== 'idle') { dbgRef.current(`armListening: pominięto (stan=${stateRef.current})`); return; }

    setState('listening');
    setInterimText('');
    setError(null);
    stoppingRef.current = false;

    const provider = sttProviderRef.current;
    const sttFull = speechService.getConfig().stt;
    dbgRef.current(`armListening: provider=${provider} android=${isAndroid} elevenKey=${!!sttFull.elevenlabs.apiKey}`);

    // ElevenLabs Scribe v2 realtime (WebSocket) — transkrypcja na żywo.
    // Na Androidzie wymuszamy realtime (jeśli jest klucz), bo Web Speech restartuje mikrofon (beep/migotanie).
    const useRealtime = !!sttFull.elevenlabs.apiKey && (provider === 'elevenlabs' || isAndroid);
    if (useRealtime) {
      dbgRef.current('armListening → REALTIME (ElevenLabs), mikrofon: START (ciągły)');
      const rt = new RealtimeSttService();
      realtimeRef.current = rt;
      rt.start({
        apiKey: sttFull.elevenlabs.apiKey,
        language: sttFull.elevenlabs.language || 'pol',
        deviceId: inputDeviceRef.current || undefined,
        model: sttFull.elevenlabs.model,
        onPartial: (t) => setInterimText(t),
        onFinal: (t) => {
          dbgRef.current(`realtime onFinal: "${t}" → mikrofon: STOP`);
          rt.stop();
          realtimeRef.current = null;
          handleVoiceFinal(t);
        },
        onError: () => {
          dbgRef.current('realtime onError → mikrofon: STOP, wznawiam');
          rt.stop();
          realtimeRef.current = null;
          setState('idle');
          resumeListeningRef.current();
        },
      }).then(() => dbgRef.current('realtime: połączono (WS otwarty)'))
        .catch(() => {
        dbgRef.current('realtime: BŁĄD połączenia (klucz API?)');
        realtimeRef.current = null;
        setError('ElevenLabs realtime: nie udało się połączyć (sprawdź klucz API)');
        setState('idle');
      });
      return;
    }

    if (provider === 'browser') {
      // Web Speech API — nasłuch ciągły (mikrofon zostaje włączony, brak migotania);
      // po pierwszej finalnej wypowiedzi zatrzymujemy, by przetworzyć/odpowiedzieć.
      dbgRef.current('armListening → BROWSER (Web Speech), recognition.start()');
      const recognition = createBrowserRecognition({
        lang: 'pl-PL',
        continuous: true,
        interimResults: true,
        onResult: (transcript, isFinal) => {
          if (isFinal) {
            dbgRef.current(`browser onResult FINAL: "${transcript}" → abort`);
            const r = recognitionRef.current;
            recognitionRef.current = null;
            r?.abort();
            handleVoiceFinal(transcript);
          } else {
            setInterimText(transcript);
          }
        },
        onError: (err) => {
          dbgRef.current(`browser onError: ${err}`);
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
          dbgRef.current(`browser onEnd (mikrofon: STOP)${recognitionRef.current ? ' → wznawiam' : ''}`);
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
      dbgRef.current('armListening → CHMURA (nagrywanie z auto-stopem po ciszy)');
      try {
        const recorder = new AudioRecorder();
        recorderRef.current = recorder;
        await recorder.start(
          { onSilenceDetected: () => finishCloudUtteranceRef.current(), duration: 800, minRecordingTime: 500 },
          inputDeviceRef.current || undefined,
          sttFull.inputGain ?? 1,
        );
      } catch (err) {
        console.warn('[Aura] Brak dostępu do mikrofonu:', err);
        dbgRef.current(`armListening: BŁĄD mikrofonu chmura: ${err instanceof Error ? err.message : String(err)}`);
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
    dbgRef.current(`stopListening (rec=${!!recognitionRef.current} recorder=${!!recorderRef.current} rt=${!!realtimeRef.current} wakeRt=${!!wakeRealtimeRef.current})`);
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
    if (wakeRealtimeRef.current) {
      wakeRealtimeRef.current.stop();
      wakeRealtimeRef.current = null;
    }
    cloudWakeActiveRef.current = false;
    if (cloudWakeRecorderRef.current) {
      cloudWakeRecorderRef.current.cancel();
      cloudWakeRecorderRef.current = null;
    }
    setInterimText('');
    setState('idle');
  }, []);

  // ---- Przełącznik „Nasłuch" ----
  // Jeśli ustawiono słowo aktywacyjne → tryb wake-word (czeka na słowo, potem tura).
  // Bez słowa aktywacyjnego → tryb ciągły (transkrybuje wszystko).
  const toggleAlwaysOn = useCallback((enabled: boolean) => {
    dbgRef.current(`=== NASŁUCH ${enabled ? 'WŁ' : 'WYŁ'} (provider=${sttProviderRef.current}, android=${isAndroid}) ===`);
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

  // Czy fraza aktywacyjna występuje w wypowiedzi (z rozmyciem)? Zwraca też tekst komendy po frazie.
  const matchWakePhrase = useCallback((raw: string, phrase: string): { hit: boolean; command: string } => {
    const p = normText(phrase);
    const t = normText(raw);
    if (!p) return { hit: false, command: '' };
    const idx = t.indexOf(p);
    if (idx >= 0) {
      return { hit: true, command: t.slice(idx + p.length).trim() };
    }
    // rozmyte dopasowanie po słowach (0.7)
    const pw = p.split(' ').filter(Boolean);
    const tw = t.split(' ').filter(Boolean);
    const m = pw.filter(w => tw.some(x => x.includes(w) || w.includes(x))).length;
    return { hit: pw.length > 0 && m / pw.length >= 0.7, command: '' };
  }, []);

  // Nasłuch słowa aktywacyjnego na CIĄGŁYM strumieniu realtime (ElevenLabs) — bez restartu mikrofonu.
  // Rozwiązuje problem migotania/beepa na Androidzie (Web Speech restartuje SpeechRecognizer).
  const startRealtimeWake = useCallback((phrase: string): boolean => {
    const sttFull = speechService.getConfig().stt;
    const key = sttFull.elevenlabs?.apiKey;
    if (!key) { dbgRef.current('startRealtimeWake: brak klucza ElevenLabs'); return false; }
    // zamknij ewentualny poprzedni strumień
    if (wakeRealtimeRef.current) { wakeRealtimeRef.current.stop(); wakeRealtimeRef.current = null; }
    dbgRef.current('startRealtimeWake: mikrofon WAKE START (ciągły realtime)');
    const rt = new RealtimeSttService();
    wakeRealtimeRef.current = rt;
    rt.start({
      apiKey: key,
      language: sttFull.elevenlabs.language || 'pol',
      deviceId: inputDeviceRef.current || undefined,
      model: sttFull.elevenlabs.model,
      onPartial: () => { /* podgląd pomijamy w trybie wake */ },
      onFinal: (text) => {
        if (stateRef.current !== 'idle') { dbgRef.current(`wake onFinal ignor (stan=${stateRef.current}): "${text}"`); return; }
        if (isSelfEcho(text)) { dbgRef.current(`wake onFinal echo-ignor: "${text}"`); return; }
        const { hit, command } = matchWakePhrase(text, phrase);
        dbgRef.current(`wake onFinal: "${text}" hit=${hit}${hit ? ` cmd="${command}"` : ''}`);
        if (!hit) return;                             // słuchaj dalej (ten sam strumień, brak beepa)
        // wykryto słowo aktywacyjne
        dbgRef.current('wake: WYKRYTO → mikrofon WAKE STOP');
        rt.stop();
        wakeRealtimeRef.current = null;
        setWakeActive(false);
        playWakeSound();
        if (command && command.length >= 2) {
          // komenda już w tej samej wypowiedzi (np. „aura, jaka pogoda") — przetwórz od razu
          processUserInputRef.current(command);
        } else if (stateRef.current === 'idle') {
          armListeningRef.current();
        }
      },
      onError: () => {
        dbgRef.current('wake realtime onError → mikrofon WAKE STOP');
        wakeRealtimeRef.current = null;
        setWakeActive(false);
        // spróbuj ponownie za chwilę, jeśli wciąż w trybie wake
        if (alwaysOnRef.current && wakeModeRef.current) {
          setTimeout(() => { if (alwaysOnRef.current && wakeModeRef.current) startWakeWordRef.current(); }, 1500);
        }
      },
    }).then(() => { dbgRef.current('wake realtime: połączono (WS otwarty, mikrofon otwarty)'); setWakeActive(true); })
      .catch(() => {
        wakeRealtimeRef.current = null;
        setWakeActive(false);
        setError('ElevenLabs realtime (wake): nie udało się połączyć — sprawdź klucz API.');
      });
    return true;
  }, [speechService, isSelfEcho, matchWakePhrase, playWakeSound]);

  // Nasłuch słowa aktywacyjnego przez CHMURĘ (OpenAI/Google): nagrywanie + transkrypcja w pętli.
  // Używa getUserMedia (NIE Web Speech), więc na Androidzie NIE ma systemowego beepa/migotania.
  // Transkrybuje tylko nagrania, w których wykryto mowę (bramka VAD) — brak kosztu na ciszy.
  const startCloudWake = useCallback((phrase: string): boolean => {
    const provider = sttProviderRef.current;
    const fullCfg = speechService.getConfig().stt;
    const sttCfg = fullCfg as unknown as Record<string, { apiKey?: string }>;
    const cloudKey = provider !== 'browser' ? (sttCfg[provider]?.apiKey || '') : '';
    if (!cloudKey) return false; // brak klucza chmurowego → nie ta ścieżka

    cloudWakeActiveRef.current = true;
    dbgRef.current(`startCloudWake: provider=${provider} — pętla nagrywanie+transkrypcja (bez Web Speech, bez beepa)`);

    const loop = () => {
      if (!cloudWakeActiveRef.current || !alwaysOnRef.current || !wakeModeRef.current || stateRef.current !== 'idle') {
        setWakeActive(false);
        return;
      }
      const recorder = new AudioRecorder();
      cloudWakeRecorderRef.current = recorder;
      setWakeActive(true);
      recorder.start({
        onSilenceDetected: async () => {
          let blob: Blob | null = null;
          try { blob = await recorder.stop(); } catch { /* */ }
          cloudWakeRecorderRef.current = null;
          if (!cloudWakeActiveRef.current || !alwaysOnRef.current || !wakeModeRef.current || stateRef.current !== 'idle') {
            setWakeActive(false);
            return;
          }
          // Bramka: transkrybuj tylko gdy była mowa (oszczędza wywołania API na ciszy)
          if (!blob || !recorder.speechDetected) { loop(); return; }
          try {
            const r = await speechService.transcribe({ audio: blob });
            const text = (r.text || '').trim();
            if (!text || isSelfEcho(text)) { dbgRef.current(`cloudWake ignor: "${text}"`); loop(); return; }
            const { hit, command } = matchWakePhrase(text, phrase);
            dbgRef.current(`cloudWake onFinal: "${text}" hit=${hit}${hit ? ` cmd="${command}"` : ''}`);
            if (hit) {
              cloudWakeActiveRef.current = false;
              setWakeActive(false);
              playWakeSound();
              if (command && command.length >= 2) processUserInputRef.current(command);
              else if (stateRef.current === 'idle') armListeningRef.current();
            } else {
              loop(); // słuchaj dalej (nowe nagranie, wciąż getUserMedia — bez beepa)
            }
          } catch (e) {
            dbgRef.current(`cloudWake transcribe błąd: ${e instanceof Error ? e.message : String(e)}`);
            setTimeout(() => loop(), 600);
          }
        },
        duration: 700,
        minRecordingTime: 400,
      }, inputDeviceRef.current || undefined, fullCfg.inputGain ?? 1).catch((e) => {
        dbgRef.current(`cloudWake recorder błąd: ${e instanceof Error ? e.message : String(e)}`);
        cloudWakeRecorderRef.current = null;
        setWakeActive(false);
      });
    };
    loop();
    return true;
  }, [speechService, isSelfEcho, matchWakePhrase, playWakeSound]);

  // Uruchom nasłuch słowa aktywacyjnego; po wykryciu → jedna tura konwersacji.
  const startWakeWordListening = useCallback((): boolean => {
    const phrase = wakeWords.find(w => w.language === wakeLang)?.phrase?.trim();
    if (!phrase) { dbgRef.current('startWakeWord: brak frazy aktywacyjnej'); return false; }

    // Wybór ścieżki nasłuchu słowa aktywacyjnego, tak by NA ANDROIDZIE unikać Web Speech (beep/migotanie):
    //  1) ElevenLabs realtime (ciągły WS) — jeśli jest klucz ElevenLabs.
    //  2) Chmura (OpenAI/Google) — nagrywanie+transkrypcja w pętli (getUserMedia, bez beepa).
    //  3) Web Speech (przeglądarka) — tylko gdy brak kluczy chmurowych (na Androidzie wtedy niestety beep).
    const provider = sttProviderRef.current;
    const fullStt = speechService.getConfig().stt;
    const sttCfg = fullStt as unknown as Record<string, { apiKey?: string }>;
    const hasEleven = !!fullStt.elevenlabs?.apiKey;
    const cloudKey = provider !== 'browser' && provider !== 'elevenlabs' ? (sttCfg[provider]?.apiKey || '') : '';

    if (hasEleven && (isAndroid || provider === 'elevenlabs')) {
      dbgRef.current(`startWakeWord: fraza="${phrase}" → REALTIME (ElevenLabs)`);
      return startRealtimeWake(phrase);
    }
    if (cloudKey) {
      dbgRef.current(`startWakeWord: fraza="${phrase}" → CHMURA (${provider}, nagrywanie+Whisper)`);
      return startCloudWake(phrase);
    }
    dbgRef.current(`startWakeWord: fraza="${phrase}" android=${isAndroid} → BROWSER(WebSpeech)${isAndroid ? ' ⚠️ beep nieunikniony bez klucza chmurowego' : ''}`);

    wakeWordService.configure({
      phrase,
      sensitivity: 0.7,
      lang: langToRecog(wakeLang),
      onWake: () => {
        dbgRef.current('wakeword(browser): WYKRYTO słowo → stop + tura');
        wakeWordService.stop();
        setWakeActive(false);
        playWakeSound();
        if (stateRef.current === 'idle') armListeningRef.current();
      },
      onStatusChange: (listening) => setWakeActive(listening),
      onLog: (m) => dbgRef.current(`wakeword(browser): ${m}`),
    });
    return wakeWordService.start();
  }, [wakeWords, wakeLang, wakeWordService, playWakeSound, speechService, isAndroid, startRealtimeWake, startCloudWake]);
  useEffect(() => { startWakeWordRef.current = startWakeWordListening; }, [startWakeWordListening]);

  // Wznów nasłuch po turze: wake-word (czeka na słowo) lub ciągły.
  const resumeListening = useCallback(() => {
    if (!alwaysOnRef.current) { dbgRef.current('resumeListening: pominięto (Nasłuch wyłączony)'); return; }
    if (wakeModeRef.current) {
      dbgRef.current('resumeListening: tryb WAKE → za 500ms startWakeWord');
      setTimeout(() => startWakeWordRef.current(), 500);
    } else {
      dbgRef.current('resumeListening: tryb CIĄGŁY → za 900ms armListening');
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
      if (wakeRealtimeRef.current) wakeRealtimeRef.current.stop();
      cloudWakeActiveRef.current = false;
      if (cloudWakeRecorderRef.current) cloudWakeRecorderRef.current.cancel();
      if (captureHandleRef.current) captureHandleRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Renderowanie wiadomości ----
  const renderMessage = (msg: ChatMessage) => (
    msg.kind === 'info' ? (
      // Dyskretna notka o aktywności agenta (odczyt/zapis pliku).
      <Box key={msg.id} sx={{ display: 'flex', justifyContent: 'center', my: 0.25 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', bgcolor: 'action.hover', px: 1, py: 0.25, borderRadius: 1, fontSize: 11 }}>
          {msg.content}
        </Typography>
      </Box>
    ) : (
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
        {msg.content && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{msg.content}</Typography>}
        {msg.component && <ComponentHost config={msg.component} userName={userName || ''} />}
        <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', textAlign: 'right', mt: 0.5, fontSize: 10 }}>
          {new Date(msg.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Paper>
      {msg.role === 'user' && <PersonIcon sx={{ color: 'primary.main', mt: 0.5, fontSize: 20 }} />}
    </Box>
    )
  );

  return (
    <Box sx={embedded
      ? { height: '100%', display: 'flex', flexDirection: 'column', p: fullscreen ? 2 : 1, minHeight: 0 }
      : { maxWidth: 900, mx: 'auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Nagłówek */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: compact ? 0.5 : 1.5, mb: 1,
        // W wąskim kafelku pasek musi się zawijać, inaczej przyciski wypadają poza widget.
        flexWrap: compact ? 'wrap' : 'nowrap',
      }}>
        <RecordVoiceOverIcon sx={{ fontSize: compact ? 22 : 34, color: '#7e57c2' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant={compact ? 'subtitle2' : 'h5'} fontWeight={600} sx={{ lineHeight: 1.1 }}>Aura</Typography>
          {!compact && (
            <Typography variant="caption" color="text.secondary">
              Głosowy asystent {userName ? `· ${userName}` : ''}
            </Typography>
          )}
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
        {!compact && wakeWords.length > 1 && (
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

        {!compact && (
          <Tooltip title="Edytor Konwersacji">
            <IconButton onClick={() => navigate(`/user/${userName}/iot/aura/conversation-editor`)} size="small">
              <AccountTreeIcon />
            </IconButton>
          </Tooltip>
        )}

        <Tooltip title="Wyczyść historię">
          <IconButton onClick={clearHistory} size="small"><DeleteSweepIcon /></IconButton>
        </Tooltip>

        {!compact && (
          <Tooltip title="Panel debug mikrofonu">
            <IconButton onClick={() => setDebugOpen(o => !o)} size="small" color={debugOpen ? 'secondary' : 'default'}>
              <BugReportIcon />
            </IconButton>
          </Tooltip>
        )}

        {onToggleFullscreen && (
          <Tooltip title={fullscreen ? 'Zmniejsz' : 'Pełny ekran'}>
            <IconButton onClick={onToggleFullscreen} size="small">
              {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Panel debug — diagnostyka cyklu mikrofonu (mobile/Android) */}
      {!compact && debugOpen && (
        <Paper variant="outlined" sx={{ mb: 1, bgcolor: '#0d1117', color: '#e6edf3' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid #30363d' }}>
            <BugReportIcon sx={{ fontSize: 18, color: '#f0883e' }} />
            <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>
              Debug mikrofonu · android={String(isAndroid)} · micSupported={String(micSupported)} · stt={sttProvider} · elevenKey={String(!!speechCfg?.stt?.elevenlabs?.apiKey)}
            </Typography>
            <Button size="small" variant="outlined" sx={{ color: '#e6edf3', borderColor: '#30363d', minWidth: 0 }}
              onClick={() => {
                const text = debugLog.join('\n');
                navigator.clipboard?.writeText(text).then(
                  () => setDebugLog(l => [...l, '[skopiowano do schowka ✓]']),
                  () => { /* brak clipboard */ },
                );
              }}
            >Kopiuj</Button>
            <Button size="small" variant="outlined" sx={{ color: '#e6edf3', borderColor: '#30363d', minWidth: 0 }}
              onClick={() => setDebugLog([])}
            >Wyczyść</Button>
          </Box>
          <Box sx={{ maxHeight: 220, overflow: 'auto', px: 1, py: 0.5, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {debugLog.length === 0
              ? <span style={{ opacity: 0.5 }}>Log pusty — włącz „Nasłuch", odtwórz problem, potem „Kopiuj" i wyślij mi log.</span>
              : debugLog.map((l, i) => <div key={i}>{l}</div>)}
          </Box>
        </Paper>
      )}

      {/* Panel konfiguracji — w widgecie zbędny, ustawienia zmienia się na stronie Aury. */}
      {!compact && (<>
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

          {/* Siła sygnału: wzmocnienie wejścia (mikrofon) + głośność wyjścia (TTS). */}
          <Grid item xs={12} sm={6} md={6}>
            <Typography variant="caption" color="text.secondary">
              Wzmocnienie mikrofonu (wejście): {(speechCfg?.stt.inputGain ?? 1).toFixed(1)}×
            </Typography>
            <Slider
              size="small"
              min={0}
              max={3}
              step={0.1}
              marks={[{ value: 1, label: '1×' }]}
              value={speechCfg?.stt.inputGain ?? 1}
              onChange={(_, v) => applyInputGain(v as number, false)}
              onChangeCommitted={(_, v) => applyInputGain(v as number, true)}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={6}>
            <Typography variant="caption" color="text.secondary">
              Głośność mowy (wyjście): {Math.round((speechCfg?.tts.outputVolume ?? 1) * 100)}%
            </Typography>
            <Slider
              size="small"
              min={0}
              max={1}
              step={0.05}
              value={speechCfg?.tts.outputVolume ?? 1}
              onChange={(_, v) => applyOutputVolume(v as number, false)}
              onChangeCommitted={(_, v) => applyOutputVolume(v as number, true)}
            />
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
      </>)}

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
      {isAndroid && sttProvider === 'browser' && !speechService.getConfig().stt.elevenlabs?.apiKey && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Na Androidzie STT „Przeglądarka" (Web Speech) <b>restartuje mikrofon po każdej pauzie</b> (ograniczenie systemu —
          stąd migotanie i „ding"). Wpisz <b>klucz API ElevenLabs</b> (albo wybierz Model STT = <b>ElevenLabs Scribe v2 realtime</b>) —
          wtedy Aura sama użyje jednego ciągłego strumienia realtime, bez restartów i dźwięku.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      {/* Przełącznik widoku: rozmowa albo zgłoszenia z tła. Zakładka „W tle"
          pulsuje na czerwono, dopóki jakieś zgłoszenie czeka na decyzję. */}
      <Tabs
        value={view}
        onChange={(_, v) => setView(v)}
        sx={{
          minHeight: 34, mb: 1,
          // Ikona ustawień jest dzieckiem Tabs — flex pozwala dosunąć ją do prawej.
          '& .MuiTabs-flexContainer': { alignItems: 'center' },
          '& .MuiTab-root': { minHeight: 34, py: 0, textTransform: 'none', fontSize: compact ? 12 : 14 },
          '@keyframes bgPulse': {
            '0%, 100%': { color: '#d32f2f', opacity: 1 },
            '50%': { color: '#d32f2f', opacity: 0.35 },
          },
        }}
      >
        <Tab value="chat" label="Konwersacja" />
        <Tab
          value="background"
          label={
            <Badge badgeContent={bgActions.length} color="error" sx={{ '& .MuiBadge-badge': { right: -14, top: 2 } }}>
              W tle
            </Badge>
          }
          sx={hasPendingBg && view !== 'background'
            ? { animation: 'bgPulse 1.1s ease-in-out infinite', fontWeight: 700 }
            : undefined}
        />
        {/* Ustawienia zgłoszeń — jedna ikona zamiast paska z polami; w kafelku
            na pulpicie liczy się każdy milimetr. */}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Ustawienia akcji w tle">
          <IconButton size="small" onClick={() => setBgSettingsOpen(true)} sx={{ alignSelf: 'center' }}>
            <SettingsIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Tabs>

      {/* Dialog ustawień — przypominanie o zgłoszeniach czekających na decyzję. */}
      <Dialog open={bgSettingsOpen} onClose={() => setBgSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Akcje w tle — przypomnienia</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={
              <Switch
                checked={bgReminder.enabled}
                onChange={(_, c) => saveBgReminder({ ...bgReminder, enabled: c })}
              />
            }
            label="Przypominaj głosem o czekających zgłoszeniach"
          />
          <TextField
            fullWidth
            size="small"
            type="number"
            label="Interwał (minuty)"
            sx={{ mt: 2 }}
            value={bgReminder.minutes}
            disabled={!bgReminder.enabled}
            onChange={(e) => saveBgReminder({
              ...bgReminder,
              minutes: Math.min(600, Math.max(1, Number(e.target.value) || 5)),
            })}
            inputProps={{ min: 1, max: 600, step: 1 }}
            helperText="Aura zagra dzwonek i powie, ile zgłoszeń czeka. Ustawienie zapisuje się na serwerze."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBgSettingsOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>

      {view === 'background' && (
        <Paper sx={{ flex: 1, overflow: 'auto', p: compact ? 1 : 2, mb: compact ? 1 : 2, minHeight: 0 }}>
          {bgActions.length === 0 && (
            <Box sx={{ textAlign: 'center', mt: compact ? 2 : 6 }}>
              <PendingActionsIcon sx={{ fontSize: compact ? 32 : 56, color: 'grey.300', mb: 1 }} />
              <Typography variant={compact ? 'caption' : 'body2'} color="text.secondary">
                Brak akcji czekających na decyzję.
              </Typography>
            </Box>
          )}
          {bgActions.map((a) => (
            <Paper
              key={a.id}
              variant="outlined"
              sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, borderColor: 'error.light' }}
            >
              <PendingActionsIcon sx={{ fontSize: 20, color: 'error.main' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{a.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  zgłoszono {new Date(a.createdAt).toLocaleTimeString()}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={() => Aura.resolveBackgroundAction(a.id, 'run')}
              >
                Uruchom
              </Button>
              <Button
                size="small"
                color="inherit"
                startIcon={<BlockIcon />}
                onClick={() => Aura.resolveBackgroundAction(a.id, 'cancel')}
              >
                Odrzuć
              </Button>
            </Paper>
          ))}
        </Paper>
      )}

      {/* Konwersacja — w widgecie pokazujemy tylko ostatnią wypowiedź, żeby
          kafelek nie zamieniał się w nieczytelny pasek tekstu. */}
      {view === 'chat' && (
      <Paper sx={{
        flex: 1, overflow: 'auto', p: compact ? 1 : 2, mb: compact ? 1 : 2,
        bgcolor: 'grey.50', display: 'flex', flexDirection: 'column', gap: 1.5,
        minHeight: 0,
      }}>
        {messages.length === 0 && !interimText && (
          <Box sx={{ textAlign: 'center', mt: compact ? 2 : 8 }}>
            <RecordVoiceOverIcon sx={{ fontSize: compact ? 32 : 64, color: 'grey.300', mb: compact ? 1 : 2 }} />
            <Typography variant={compact ? 'caption' : 'body1'} color="text.secondary">
              {compact
                ? 'Naciśnij mikrofon i mów.'
                : 'Włącz „Nasłuch”, aby Aura stale słuchała — lub naciśnij mikrofon i mów.'}
            </Typography>
          </Box>
        )}

        {(compact ? messages.slice(-1) : messages).map(renderMessage)}

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
      )}

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
                width: compact ? 44 : 56, height: compact ? 44 : 56,
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
