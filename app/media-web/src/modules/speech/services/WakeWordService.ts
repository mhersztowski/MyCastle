/**
 * WakeWordService - continuous listening for activation phrase (like "Alexa", "Hey Castle")
 * Uses Browser SpeechRecognition API in continuous mode
 */

import { createBrowserRecognition } from '../providers/BrowserSttProvider';

export type WakeWordCallback = (transcript: string) => void;

export class WakeWordService {
  private recognition: { start: () => void; stop: () => void; abort: () => void } | null = null;
  private _isListening = false;
  private _wakePhrase = 'hey castle';
  private _sensitivity = 0.7;
  private _lang = 'en-US';
  private _onWake: WakeWordCallback | null = null;
  private _onStatusChange: ((listening: boolean) => void) | null = null;
  private _onLog: ((msg: string) => void) | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  get isListening(): boolean {
    return this._isListening;
  }

  get wakePhrase(): string {
    return this._wakePhrase;
  }

  configure(options: {
    phrase?: string;
    sensitivity?: number;
    lang?: string;
    onWake?: WakeWordCallback;
    onStatusChange?: (listening: boolean) => void;
    onLog?: (msg: string) => void;
  }): void {
    if (options.phrase !== undefined) this._wakePhrase = options.phrase.toLowerCase();
    if (options.sensitivity !== undefined) this._sensitivity = options.sensitivity;
    if (options.lang !== undefined) this._lang = options.lang;
    if (options.onWake !== undefined) this._onWake = options.onWake;
    if (options.onStatusChange !== undefined) this._onStatusChange = options.onStatusChange;
    if (options.onLog !== undefined) this._onLog = options.onLog;
  }

  start(): boolean {
    // Już nasłuchujemy i rozpoznawanie żyje — nic nie rób.
    if (this._isListening && this.recognition) return true;
    this.clearRestart();
    this.setListening(true);
    this.beginRecognition();
    return this._isListening; // false tylko gdy API niedostępne
  }

  // Tworzy ŚWIEŻĄ instancję rozpoznawania i uruchamia ją. Świeża instancja unika
  // zawieszonego stanu Web Speech API po stop/abort/onend — typowego źródła „nie włącza się".
  private beginRecognition(): void {
    if (this.recognition) { try { this.recognition.abort(); } catch { /* ignore */ } this.recognition = null; }

    this.recognition = createBrowserRecognition({
      lang: this._lang,
      continuous: true,
      interimResults: true,
      onResult: (transcript, isFinal) => this.checkWakeWord(transcript, isFinal),
      onError: (error) => {
        console.warn('[WakeWord] Recognition error:', error);
        this._onLog?.(`onError: ${error}`);
        // Twardy błąd uprawnień → zatrzymaj. Pozostałe (aborted/no-speech/network/audio-capture)
        // są przejściowe — wznawiamy, jeśli nadal mamy nasłuchiwać.
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          this.setListening(false);
        } else if (this._isListening) {
          this.scheduleRestart();
        }
      },
      onEnd: () => {
        this._onLog?.(`onEnd (mikrofon STOP)${this._isListening ? ' → restart' : ''}`);
        if (this._isListening) this.scheduleRestart();
      },
    });

    if (!this.recognition) {
      console.error('[WakeWord] SpeechRecognition not supported');
      this._onLog?.('SpeechRecognition NIEDOSTĘPNE');
      this.setListening(false);
      return;
    }

    try {
      this.recognition.start();
      this._onLog?.('recognition.start() (mikrofon START)');
    } catch (err) {
      // „InvalidStateError" = rozpoznawanie już działa → OK. Inny błąd → ponów start.
      if ((err as { name?: string })?.name === 'InvalidStateError') {
        this._onLog?.('start(): już uruchomione (OK)');
      } else {
        console.error('[WakeWord] Failed to start:', err);
        this._onLog?.(`start() błąd → restart: ${String(err)}`);
        this.scheduleRestart();
      }
    }
  }

  stop(): void {
    this.clearRestart();
    this.setListening(false);
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null;
    }
  }

  private checkWakeWord(transcript: string, _isFinal: boolean): void {
    const normalized = transcript.toLowerCase().trim();
    const phrase = this._wakePhrase;

    // Check if the transcript contains the wake phrase
    // Use simple inclusion check with sensitivity threshold
    if (normalized.includes(phrase)) {
      this._onWake?.(transcript);
      // Temporarily stop to avoid re-triggering, then restart
      if (this.recognition) {
        this.recognition.stop();
      }
    } else if (this._sensitivity < 1.0) {
      // Fuzzy matching: check if words from wake phrase appear in transcript
      const phraseWords = phrase.split(/\s+/);
      const transcriptWords = normalized.split(/\s+/);
      const matchCount = phraseWords.filter(pw =>
        transcriptWords.some(tw => tw.includes(pw) || pw.includes(tw))
      ).length;
      const matchRatio = matchCount / phraseWords.length;

      if (matchRatio >= this._sensitivity) {
        this._onWake?.(transcript);
        if (this.recognition) {
          this.recognition.stop();
        }
      }
    }
  }

  private scheduleRestart(): void {
    this.clearRestart();
    // Świeża instancja przy każdym wznowieniu — najpewniejsze wyjście z zawieszonego stanu.
    this.restartTimeout = setTimeout(() => {
      if (this._isListening) this.beginRecognition();
    }, 300);
  }

  private clearRestart(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
  }

  private setListening(value: boolean): void {
    if (this._isListening !== value) {
      this._isListening = value;
      this._onStatusChange?.(value);
    }
  }
}

export const wakeWordService = new WakeWordService();
