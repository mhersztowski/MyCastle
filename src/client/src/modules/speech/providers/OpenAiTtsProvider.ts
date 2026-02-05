/**
 * OpenAI TTS Provider - Text-to-Speech via OpenAI API
 * POST /v1/audio/speech -> binary audio blob -> play via Audio element
 */

import { TtsProvider } from './TtsProvider';
import { TtsRequest } from '../models/SpeechModels';

export class OpenAiTtsProvider implements TtsProvider {
  private currentAudio: HTMLAudioElement | null = null;
  private _isSpeaking = false;

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async speak(request: TtsRequest, config: Record<string, unknown>): Promise<void> {
    this.stop();

    const apiKey = config.apiKey as string;
    const baseUrl = config.baseUrl as string || 'https://api.openai.com/v1';
    const model = request.model || config.model as string || 'tts-1';
    const voice = request.voice || config.voice as string || 'alloy';
    const speed = request.speed ?? config.speed as number ?? 1.0;
    const responseFormat = config.responseFormat as string || 'mp3';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: request.text,
        voice,
        speed,
        response_format: responseFormat,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS error (${response.status}): ${errorText}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      this._isSpeaking = true;

      audio.onended = () => {
        this._isSpeaking = false;
        this.currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        resolve();
      };

      audio.onerror = (e) => {
        this._isSpeaking = false;
        this.currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        reject(new Error(`Audio playback error: ${e}`));
      };

      audio.play().catch(err => {
        this._isSpeaking = false;
        this.currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this._isSpeaking = false;
    }
  }
}
