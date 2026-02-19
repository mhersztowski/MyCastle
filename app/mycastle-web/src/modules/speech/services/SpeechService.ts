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

const SPEECH_CONFIG_PATH = 'data/speech_config.json';

function createTtsProvider(providerType: TtsProviderType): TtsProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAiTtsProvider();
    case 'browser':
      return new BrowserTtsProvider();
  }
}

function createSttProvider(providerType: SttProviderType): SttProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAiSttProvider();
    case 'browser':
      return new BrowserSttProvider();
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
          tts: { ...DEFAULT_SPEECH_CONFIG.tts, ...data.tts, openai: { ...DEFAULT_SPEECH_CONFIG.tts.openai, ...data.tts?.openai }, browser: { ...DEFAULT_SPEECH_CONFIG.tts.browser, ...data.tts?.browser } },
          stt: { ...DEFAULT_SPEECH_CONFIG.stt, ...data.stt, openai: { ...DEFAULT_SPEECH_CONFIG.stt.openai, ...data.stt?.openai }, browser: { ...DEFAULT_SPEECH_CONFIG.stt.browser, ...data.stt?.browser } },
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

  isTtsConfigured(): boolean {
    if (this.config.tts.provider === 'browser') return true;
    return !!this.config.tts.openai.apiKey;
  }

  isSttConfigured(): boolean {
    if (this.config.stt.provider === 'browser') return true;
    return !!this.config.stt.openai.apiKey;
  }

  async speak(request: TtsRequest): Promise<void> {
    if (!this._isLoaded) {
      await this.loadConfig();
    }

    if (!this.ttsProvider) {
      this.ttsProvider = createTtsProvider(this.config.tts.provider);
    }

    const providerConfig = this.config.tts.provider === 'openai'
      ? this.config.tts.openai as unknown as Record<string, unknown>
      : this.config.tts.browser as unknown as Record<string, unknown>;

    return this.ttsProvider.speak(request, providerConfig);
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
    const providerConfig = this.config.stt.provider === 'openai'
      ? this.config.stt.openai as unknown as Record<string, unknown>
      : this.config.stt.browser as unknown as Record<string, unknown>;

    return provider.transcribe(request, providerConfig);
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
      // For OpenAI, check API key
      if (!this.config.stt.openai.apiKey) {
        return { success: false, message: 'API key not configured' };
      }
      return { success: true, message: 'OpenAI Whisper configured' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const speechService = new SpeechService();
