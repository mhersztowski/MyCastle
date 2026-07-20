/**
 * Google STT Provider - Speech-to-Text via Google Cloud Speech-to-Text REST API
 * POST /v1/speech:recognize?key=API_KEY z audio (base64) -> transkrypcja
 */

import { SttProvider } from './SttProvider';
import { SttRequest, SttResponse } from '../models/SpeechModels';

/** Konwersja Blob -> base64 (bez prefiksu data:) */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export class GoogleSttProvider implements SttProvider {
  async transcribe(request: SttRequest, config: Record<string, unknown>): Promise<SttResponse> {
    const apiKey = config.apiKey as string;
    if (!apiKey) {
      throw new Error('Google STT: brak klucza API');
    }
    const languageCode = request.language || config.languageCode as string || 'pl-PL';

    const audioBase64 = await blobToBase64(request.audio);

    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            languageCode,
            enableAutomaticPunctuation: true,
          },
          audio: { content: audioBase64 },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google STT error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const text = (data.results || [])
      .map((r: { alternatives?: { transcript?: string }[] }) => r.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();

    return { text, language: languageCode };
  }
}
