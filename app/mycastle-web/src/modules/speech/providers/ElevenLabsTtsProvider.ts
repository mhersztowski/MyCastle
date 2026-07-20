/**
 * ElevenLabs TTS Provider - Text-to-Speech via ElevenLabs API
 * POST /v1/text-to-speech/{voiceId} -> binary audio (mp3) -> play via Audio element
 * Domyślny model: eleven_multilingual_v3
 */

import { TtsProvider } from './TtsProvider';
import { TtsRequest } from '../models/SpeechModels';

export class ElevenLabsTtsProvider implements TtsProvider {
  private currentAudio: HTMLAudioElement | null = null;
  private _isSpeaking = false;

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async speak(request: TtsRequest, config: Record<string, unknown>): Promise<void> {
    this.stop();

    const apiKey = config.apiKey as string;
    if (!apiKey) {
      throw new Error('ElevenLabs TTS: brak klucza API');
    }
    const voiceId = request.voice || config.voiceId as string;
    if (!voiceId) {
      throw new Error('ElevenLabs TTS: brak voiceId');
    }
    const modelId = request.model || config.model as string || 'eleven_multilingual_v3';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: modelId,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS error (${response.status}): ${errorText}`);
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
