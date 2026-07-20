/**
 * ElevenLabs STT Provider - Speech-to-Text via ElevenLabs Scribe API
 * POST /v1/speech-to-text z FormData -> { text }
 * Domyślny model: scribe_v2_realtime
 */

import { SttProvider } from './SttProvider';
import { SttRequest, SttResponse } from '../models/SpeechModels';

export class ElevenLabsSttProvider implements SttProvider {
  async transcribe(request: SttRequest, config: Record<string, unknown>): Promise<SttResponse> {
    const apiKey = config.apiKey as string;
    if (!apiKey) {
      throw new Error('ElevenLabs STT: brak klucza API');
    }
    const modelId = request.model || config.model as string || 'scribe_v2_realtime';
    const language = request.language || config.language as string;

    const formData = new FormData();
    formData.append('file', request.audio, 'audio.webm');
    formData.append('model_id', modelId);
    if (language) {
      formData.append('language_code', language);
    }

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs STT error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      text: (data.text || '').trim(),
      language: data.language_code || language,
    };
  }
}
