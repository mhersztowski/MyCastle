/**
 * STT Provider - interfejs dla providerów Speech-to-Text
 */

import { SttRequest, SttResponse } from '../models/SpeechModels';

export interface SttProvider {
  transcribe(request: SttRequest, config: Record<string, unknown>): Promise<SttResponse>;
}
