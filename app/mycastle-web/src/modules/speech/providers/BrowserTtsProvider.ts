/**
 * Browser TTS Provider - Text-to-Speech via Web Speech API (speechSynthesis)
 * Fallback provider that works without API keys
 */

import { TtsProvider } from './TtsProvider';
import { TtsRequest } from '../models/SpeechModels';

export class BrowserTtsProvider implements TtsProvider {
  private _isSpeaking = false;

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async speak(request: TtsRequest, config: Record<string, unknown>): Promise<void> {
    if (!window.speechSynthesis) {
      throw new Error('Browser Speech Synthesis API is not supported');
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = config.lang as string || 'pl-PL';
    utterance.rate = request.speed ?? config.rate as number ?? 1.0;
    utterance.pitch = config.pitch as number ?? 1.0;

    const voiceURI = config.voiceURI as string;
    if (voiceURI) {
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === voiceURI);
      if (voice) {
        utterance.voice = voice;
      }
    }

    return new Promise<void>((resolve, reject) => {
      this._isSpeaking = true;

      utterance.onend = () => {
        this._isSpeaking = false;
        resolve();
      };

      utterance.onerror = (e) => {
        this._isSpeaking = false;
        reject(new Error(`Speech synthesis error: ${e.error}`));
      };

      speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (window.speechSynthesis) {
      speechSynthesis.cancel();
      this._isSpeaking = false;
    }
  }
}
