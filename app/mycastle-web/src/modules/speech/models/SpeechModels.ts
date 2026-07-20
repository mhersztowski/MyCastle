/**
 * Speech module - interfejsy modeli danych TTS/STT/Wake Word
 */

export type TtsProviderType = 'openai' | 'browser' | 'google' | 'elevenlabs';
export type SttProviderType = 'openai' | 'browser' | 'google' | 'elevenlabs';

export interface TtsConfig {
  provider: TtsProviderType;
  openai: {
    apiKey: string;
    baseUrl: string;
    model: string;
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    speed: number;
    responseFormat: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  };
  browser: {
    lang: string;
    rate: number;
    pitch: number;
    voiceURI: string;
  };
  // Google Cloud Text-to-Speech (REST v1, klucz API w query stringu)
  google: {
    apiKey: string;
    languageCode: string;
    voiceName: string;
    speakingRate: number;
  };
  // ElevenLabs Text-to-Speech (domyślnie model Eleven Multilingual v3)
  elevenlabs: {
    apiKey: string;
    voiceId: string;
    model: string;
  };
}

export interface SttConfig {
  provider: SttProviderType;
  openai: {
    apiKey: string;
    baseUrl: string;
    model: string;
    language: string;
  };
  browser: {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
  };
  // Google Cloud Speech-to-Text (REST v1, klucz API w query stringu)
  google: {
    apiKey: string;
    languageCode: string;
  };
  // ElevenLabs Speech-to-Text (domyślnie model Scribe v2 realtime)
  elevenlabs: {
    apiKey: string;
    model: string;
    language: string;
  };
}

export interface WakeWordConfig {
  enabled: boolean;
  phrase: string;
  sensitivity: number;
  lang: string;
}

export interface SpeechConfigModel {
  type: 'speech_config';
  tts: TtsConfig;
  stt: SttConfig;
  wakeWord: WakeWordConfig;
}

export interface TtsRequest {
  text: string;
  voice?: string;
  speed?: number;
  model?: string;
}

export interface SttRequest {
  audio: Blob;
  language?: string;
  model?: string;
}

export interface SttResponse {
  text: string;
  language?: string;
  duration?: number;
}

export const DEFAULT_SPEECH_CONFIG: SpeechConfigModel = {
  type: 'speech_config',
  tts: {
    provider: 'browser',
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'tts-1',
      voice: 'alloy',
      speed: 1.0,
      responseFormat: 'mp3',
    },
    browser: {
      lang: 'pl-PL',
      rate: 1.0,
      pitch: 1.0,
      voiceURI: '',
    },
    google: {
      apiKey: '',
      languageCode: 'pl-PL',
      voiceName: 'pl-PL-Wavenet-A',
      speakingRate: 1.0,
    },
    elevenlabs: {
      apiKey: '',
      voiceId: 'JBFqnCBsd6RMkjVDRZzb',
      model: 'eleven_v3',
    },
  },
  stt: {
    provider: 'browser',
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
      language: 'pl',
    },
    browser: {
      lang: 'pl-PL',
      continuous: false,
      interimResults: true,
    },
    google: {
      apiKey: '',
      languageCode: 'pl-PL',
    },
    elevenlabs: {
      apiKey: '',
      model: 'scribe_v2_realtime',
      language: 'pol',
    },
  },
  wakeWord: {
    enabled: false,
    phrase: 'hey castle',
    sensitivity: 0.7,
    lang: 'en-US',
  },
};
