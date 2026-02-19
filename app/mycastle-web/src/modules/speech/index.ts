export { SpeechService, speechService } from './services/SpeechService';
export { AudioRecorder } from './services/AudioRecorder';
export { WakeWordService, wakeWordService } from './services/WakeWordService';
export type { WakeWordCallback } from './services/WakeWordService';
export { createBrowserRecognition } from './providers/BrowserSttProvider';
export type {
  TtsProviderType,
  SttProviderType,
  TtsConfig,
  SttConfig,
  WakeWordConfig,
  SpeechConfigModel,
  TtsRequest,
  SttRequest,
  SttResponse,
} from './models/SpeechModels';
export { DEFAULT_SPEECH_CONFIG } from './models/SpeechModels';
