/**
 * TTS Provider - interfejs dla providerów Text-to-Speech
 */

import { TtsRequest } from '../models/SpeechModels';

export interface TtsProvider {
  speak(request: TtsRequest, config: Record<string, unknown>): Promise<void>;
  stop(): void;
  readonly isSpeaking: boolean;
}
