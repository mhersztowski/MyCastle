/**
 * ElevenLabs STT Provider - Speech-to-Text via ElevenLabs Scribe API
 * POST /v1/speech-to-text z FormData -> { text }
 * Domyślny model: scribe_v2
 *
 * **Nie `scribe_v2_realtime`** — ta nazwa istnieje wyłącznie po stronie
 * strumienia (`/v1/single-use-token/realtime_scribe`), a REST odpowiada na nią
 * błędem 400: „'scribe_v2_realtime' is not a valid model_id".
 *
 * Konfiguracja trzyma jedną nazwę modelu dla obu dróg, więc odmianę
 * strumieniową trzeba tu sprowadzić do zwykłej. Bez tego dyktowanie przez
 * ElevenLabs nie działa nigdzie, gdzie ustawiono model realtime — a to jest
 * ustawienie domyślne.
 */

import { SttProvider } from './SttProvider';
import { SttRequest, SttResponse } from '../models/SpeechModels';

export class ElevenLabsSttProvider implements SttProvider {
  async transcribe(request: SttRequest, config: Record<string, unknown>): Promise<SttResponse> {
    const apiKey = config.apiKey as string;
    if (!apiKey) {
      throw new Error('ElevenLabs STT: brak klucza API');
    }
    const zadany = request.model || (config.model as string) || 'scribe_v2';
    /*
     * `…_realtime` to nazwa dla strumienia; REST zna tylko wersję bez sufiksu.
     * Zamiana zamiast odmowy, bo to ten sam model — użytkownik nie powinien
     * musieć wiedzieć, którą drogą akurat idzie rozpoznawanie.
     */
    const modelId = zadany.replace(/_realtime$/, '');
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
