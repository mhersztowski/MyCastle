/**
 * Google TTS Provider - Text-to-Speech via Google Cloud Text-to-Speech REST API
 * POST /v1/text:synthesize?key=API_KEY -> { audioContent: base64 } -> play via Audio element
 */

import { TtsProvider } from './TtsProvider';
import { TtsRequest } from '../models/SpeechModels';

export class GoogleTtsProvider implements TtsProvider {
  private currentAudio: HTMLAudioElement | null = null;
  private _isSpeaking = false;

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async speak(request: TtsRequest, config: Record<string, unknown>): Promise<void> {
    this.stop();

    const apiKey = config.apiKey as string;
    if (!apiKey) {
      throw new Error('Google TTS: brak klucza API');
    }
    const languageCode = config.languageCode as string || 'pl-PL';
    const voiceName = config.voiceName as string || 'pl-PL-Wavenet-A';
    const speakingRate = request.speed ?? config.speakingRate as number ?? 1.0;

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: request.text },
          voice: { languageCode, name: request.voice || voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google TTS error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.audioContent) {
      throw new Error('Google TTS: brak audioContent w odpowiedzi');
    }

    const audioUrl = `data:audio/mp3;base64,${data.audioContent}`;

    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.volume = Math.max(0, Math.min(1, Number(config.outputVolume ?? 1)));
      this.currentAudio = audio;
      this._isSpeaking = true;

      audio.onended = () => {
        this._isSpeaking = false;
        this.currentAudio = null;
        resolve();
      };
      audio.onerror = (e) => {
        this._isSpeaking = false;
        this.currentAudio = null;
        reject(new Error(`Audio playback error: ${e}`));
      };
      audio.play().catch(err => {
        this._isSpeaking = false;
        this.currentAudio = null;
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
