/**
 * OpenAI STT Provider - Speech-to-Text via OpenAI Whisper API
 * POST /v1/audio/transcriptions with FormData -> JSON response
 */

import { SttProvider } from './SttProvider';
import { SttRequest, SttResponse } from '../models/SpeechModels';

export class OpenAiSttProvider implements SttProvider {
  async transcribe(request: SttRequest, config: Record<string, unknown>): Promise<SttResponse> {
    const apiKey = config.apiKey as string;
    const baseUrl = config.baseUrl as string || 'https://api.openai.com/v1';
    const model = request.model || config.model as string || 'whisper-1';
    const language = request.language || config.language as string;

    const formData = new FormData();
    formData.append('file', request.audio, 'audio.webm');
    formData.append('model', model);
    formData.append('response_format', 'verbose_json');
    if (language) {
      formData.append('language', language);
    }

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Whisper error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      text: data.text || '',
      language: data.language,
      duration: data.duration,
    };
  }
}
