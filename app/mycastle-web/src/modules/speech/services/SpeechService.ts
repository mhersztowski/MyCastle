/**
 * SpeechService - zarządzanie konfiguracją i wywołaniami TTS/STT
 * Wzorzec jak AiService - singleton z loadConfig/saveConfig
 */

import { mqttClient } from '../../mqttclient';
import {
  SpeechConfigModel,
  TtsRequest,
  SttRequest,
  SttResponse,
  TtsProviderType,
  SttProviderType,
  DEFAULT_SPEECH_CONFIG,
} from '../models/SpeechModels';
import { TtsProvider } from '../providers/TtsProvider';
import { SttProvider } from '../providers/SttProvider';
import { OpenAiTtsProvider } from '../providers/OpenAiTtsProvider';
import { BrowserTtsProvider } from '../providers/BrowserTtsProvider';
import { OpenAiSttProvider } from '../providers/OpenAiSttProvider';
import { BrowserSttProvider } from '../providers/BrowserSttProvider';
import { GoogleTtsProvider } from '../providers/GoogleTtsProvider';
import { GoogleSttProvider } from '../providers/GoogleSttProvider';
import { ElevenLabsTtsProvider } from '../providers/ElevenLabsTtsProvider';
import { ElevenLabsSttProvider } from '../providers/ElevenLabsSttProvider';

const SPEECH_CONFIG_PATH = 'data/speech_config.json';

function createTtsProvider(providerType: TtsProviderType): TtsProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAiTtsProvider();
    case 'browser':
      return new BrowserTtsProvider();
    case 'google':
      return new GoogleTtsProvider();
    case 'elevenlabs':
      return new ElevenLabsTtsProvider();
  }
}

function createSttProvider(providerType: SttProviderType): SttProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAiSttProvider();
    case 'browser':
      return new BrowserSttProvider();
    case 'google':
      return new GoogleSttProvider();
    case 'elevenlabs':
      return new ElevenLabsSttProvider();
  }
}

export class SpeechService {
  private config: SpeechConfigModel = { ...DEFAULT_SPEECH_CONFIG };
  private _isLoaded = false;
  private _isLoading = false;
  private ttsProvider: TtsProvider | null = null;

  get loaded(): boolean {
    return this._isLoaded;
  }

  async loadConfig(): Promise<SpeechConfigModel> {
    if (this._isLoading) {
      while (this._isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.config;
    }

    this._isLoading = true;
    try {
      const file = await mqttClient.readFile(SPEECH_CONFIG_PATH);
      if (file?.content) {
        const data = JSON.parse(file.content) as SpeechConfigModel;
        this.config = {
          ...DEFAULT_SPEECH_CONFIG,
          ...data,
          tts: {
            ...DEFAULT_SPEECH_CONFIG.tts,
            ...data.tts,
            openai: { ...DEFAULT_SPEECH_CONFIG.tts.openai, ...data.tts?.openai },
            browser: { ...DEFAULT_SPEECH_CONFIG.tts.browser, ...data.tts?.browser },
            google: { ...DEFAULT_SPEECH_CONFIG.tts.google, ...data.tts?.google },
            elevenlabs: { ...DEFAULT_SPEECH_CONFIG.tts.elevenlabs, ...data.tts?.elevenlabs },
          },
          stt: {
            ...DEFAULT_SPEECH_CONFIG.stt,
            ...data.stt,
            openai: { ...DEFAULT_SPEECH_CONFIG.stt.openai, ...data.stt?.openai },
            browser: { ...DEFAULT_SPEECH_CONFIG.stt.browser, ...data.stt?.browser },
            google: { ...DEFAULT_SPEECH_CONFIG.stt.google, ...data.stt?.google },
            elevenlabs: { ...DEFAULT_SPEECH_CONFIG.stt.elevenlabs, ...data.stt?.elevenlabs },
          },
          wakeWord: { ...DEFAULT_SPEECH_CONFIG.wakeWord, ...data.wakeWord },
        };
      }
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    } catch (err) {
      console.error('Failed to load speech_config.json:', err);
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    }
  }

  async saveConfig(config: SpeechConfigModel): Promise<boolean> {
    this.config = config;
    this.ttsProvider = null;
    try {
      await mqttClient.writeFile(SPEECH_CONFIG_PATH, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save speech_config.json:', err);
      return false;
    }
  }

  getConfig(): SpeechConfigModel {
    return this.config;
  }

  private ttsProviderConfig(): Record<string, unknown> {
    const tts = this.config.tts;
    return (tts[tts.provider] ?? tts.browser) as unknown as Record<string, unknown>;
  }

  private sttProviderConfig(): Record<string, unknown> {
    const stt = this.config.stt;
    return (stt[stt.provider] ?? stt.browser) as unknown as Record<string, unknown>;
  }

  isTtsConfigured(): boolean {
    if (this.config.tts.provider === 'browser') return true;
    return !!(this.ttsProviderConfig().apiKey);
  }

  isSttConfigured(): boolean {
    if (this.config.stt.provider === 'browser') return true;
    return !!(this.sttProviderConfig().apiKey);
  }

  async speak(request: TtsRequest): Promise<void> {
    if (!this._isLoaded) {
      await this.loadConfig();
    }

    if (!this.ttsProvider) {
      this.ttsProvider = createTtsProvider(this.config.tts.provider);
    }

    return this.ttsProvider.speak(request, this.ttsProviderConfig());
  }

  stopSpeaking(): void {
    this.ttsProvider?.stop();
  }

  get isSpeaking(): boolean {
    return this.ttsProvider?.isSpeaking ?? false;
  }

  async transcribe(request: SttRequest): Promise<SttResponse> {
    if (!this._isLoaded) {
      await this.loadConfig();
    }

    const provider = createSttProvider(this.config.stt.provider);
    return provider.transcribe(request, this.sttProviderConfig());
  }

  async testTts(): Promise<{ success: boolean; message: string }> {
    try {
      await this.speak({ text: 'Test speech synthesis.' });
      return { success: true, message: 'TTS working' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async testStt(): Promise<{ success: boolean; message: string }> {
    try {
      // For browser STT, just check if the API is available
      if (this.config.stt.provider === 'browser') {
        const win = window as unknown as Record<string, unknown>;
        if (win.SpeechRecognition || win.webkitSpeechRecognition) {
          return { success: true, message: 'Browser Speech Recognition available' };
        }
        return { success: false, message: 'Speech Recognition API not supported in this browser' };
      }
      // Providery chmurowe (openai / google / elevenlabs) — sprawdź klucz API
      const provider = this.config.stt.provider;
      if (!this.sttProviderConfig().apiKey) {
        return { success: false, message: `Brak klucza API dla providera "${provider}"` };
      }
      return { success: true, message: `Provider "${provider}" skonfigurowany (klucz API ustawiony)` };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const speechService = new SpeechService();
