/**
 * ElevenLabs TTS Provider - Text-to-Speech via ElevenLabs API.
 *
 * Niska latencja: używa endpointu strumieniowego `/stream` i odtwarza audio
 * w miarę spływania (MediaSource) — zamiast czekać na cały plik mp3.
 * Fallback do pełnego bloba, gdy MediaSource/'audio/mpeg' niedostępne.
 *
 * Domyślny model: eleven_multilingual_v3 (najszybszy: eleven_flash_v2_5).
 */

import { TtsProvider } from './TtsProvider';
import { TtsRequest } from '../models/SpeechModels';

const MIME = 'audio/mpeg';

export class ElevenLabsTtsProvider implements TtsProvider {
  private currentAudio: HTMLAudioElement | null = null;
  private currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private currentUrl: string | null = null;
  private _isSpeaking = false;

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async speak(request: TtsRequest, config: Record<string, unknown>): Promise<void> {
    this.stop();

    const apiKey = config.apiKey as string;
    if (!apiKey) throw new Error('ElevenLabs TTS: brak klucza API');
    const voiceId = request.voice || (config.voiceId as string);
    if (!voiceId) throw new Error('ElevenLabs TTS: brak voiceId');
    const modelId = request.model || (config.model as string) || 'eleven_v3';

    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream` +
      `?output_format=mp3_44100_128`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: MIME,
      },
      body: JSON.stringify({ text: request.text, model_id: modelId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS error (${response.status}): ${errorText}`);
    }

    const canStream =
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported(MIME) &&
      !!response.body;

    if (canStream) {
      return this.playStream(response.body as ReadableStream<Uint8Array>);
    }
    const blob = await response.blob();
    return this.playBlob(blob);
  }

  /** Odtwarzanie strumieniowe (MediaSource) — najniższa latencja time-to-first-audio. */
  private playStream(body: ReadableStream<Uint8Array>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const mediaSource = new MediaSource();
      const audio = new Audio();
      const url = URL.createObjectURL(mediaSource);
      this.currentAudio = audio;
      this.currentUrl = url;
      this._isSpeaking = true;
      audio.src = url;

      const reader = body.getReader();
      this.currentReader = reader;
      let finished = false;

      const finish = (err?: Error) => {
        if (finished) return;
        finished = true;
        this._isSpeaking = false;
        this.currentAudio = null;
        this.currentReader = null;
        if (this.currentUrl) { URL.revokeObjectURL(this.currentUrl); this.currentUrl = null; }
        if (err) reject(err); else resolve();
      };

      audio.onended = () => finish();
      audio.onerror = () => finish(new Error('ElevenLabs TTS: błąd odtwarzania'));

      mediaSource.addEventListener('sourceopen', async () => {
        let sb: SourceBuffer;
        try {
          sb = mediaSource.addSourceBuffer(MIME);
        } catch (e) {
          finish(e instanceof Error ? e : new Error('SourceBuffer error'));
          return;
        }
        const queue: Uint8Array[] = [];
        let readerDone = false;
        let started = false;

        const pump = () => {
          if (sb.updating) return;
          if (queue.length) {
            const chunk = queue.shift()!;
            try { sb.appendBuffer(chunk as unknown as BufferSource); } catch { /* ignore */ }
            if (!started) { started = true; audio.play().catch(() => {}); }
            return;
          }
          if (readerDone && mediaSource.readyState === 'open') {
            try { mediaSource.endOfStream(); } catch { /* ignore */ }
          }
        };
        sb.addEventListener('updateend', pump);

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) { readerDone = true; pump(); break; }
            if (value) { queue.push(value); pump(); }
          }
        } catch {
          readerDone = true;
          try { pump(); } catch { /* ignore */ }
        }
      });
    });
  }

  /** Fallback: pełny blob → odtworzenie. */
  private playBlob(blob: Blob): Promise<void> {
    const audioUrl = URL.createObjectURL(blob);
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      this.currentUrl = audioUrl;
      this._isSpeaking = true;
      const done = (err?: Error) => {
        this._isSpeaking = false;
        this.currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        this.currentUrl = null;
        if (err) reject(err); else resolve();
      };
      audio.onended = () => done();
      audio.onerror = () => done(new Error('ElevenLabs TTS: błąd odtwarzania'));
      audio.play().catch(err => done(err instanceof Error ? err : new Error(String(err))));
    });
  }

  stop(): void {
    if (this.currentReader) {
      this.currentReader.cancel().catch(() => {});
      this.currentReader = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
    this._isSpeaking = false;
  }
}
