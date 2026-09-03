/**
 * AudioRecorder - wrapper on MediaRecorder API for capturing microphone audio
 * Supports optional silence detection via AudioContext + AnalyserNode
 */

export interface SilenceDetectionOptions {
  /** Called once when silence is detected after speech */
  onSilenceDetected: () => void;
  /** RMS threshold below which audio is considered silence (0-1). Default: 0.015 */
  threshold?: number;
  /** Duration of continuous silence (ms) before triggering. Default: 1500 */
  duration?: number;
  /** Minimum recording time (ms) before silence detection activates. Default: 1000 */
  minRecordingTime?: number;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private _isRecording = false;

  // Silence detection
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  // Wzmocnienie wejścia (gain) — osobny kontekst przetwarzania mikrofonu.
  private gainContext: AudioContext | null = null;
  private silenceCheckTimer: number | null = null;
  private silenceStart: number | null = null;
  private recordingStartTime = 0;
  private silenceCallbackFired = false;
  private _speechDetected = false;

  get isRecording(): boolean {
    return this._isRecording;
  }

  /** Czy w trakcie nagrania wykryto mowę (RMS powyżej progu). Przydatne do bramkowania transkrypcji. */
  get speechDetected(): boolean {
    return this._speechDetected;
  }

  async start(silenceOptions?: SilenceDetectionOptions, deviceId?: string, inputGain = 1): Promise<void> {
    if (this._isRecording) return;

    /*
     * Przetwarzanie mikrofonu włączamy jawnie — `audio: true` zostawia je
     * ustawieniom sterownika, które na Androidzie bywają wyłączone. Skutkiem
     * jest ciche nagranie z echem z głośnika i szumem pokoju, na którym
     * rozpoznawanie zaczyna zgadywać.
     */
    const audioConstraints: MediaTrackConstraints = {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000,
    };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    // WebView i starsze Androidy potrafią wspierać wyłącznie `audio/mp4`;
    // `MediaRecorder` z nieobsługiwanym typem rzuca przy tworzeniu.
    const mimeType = [
      'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus',
    ].find((typ) => MediaRecorder.isTypeSupported(typ)) ?? '';

    // Wzmocnienie sygnału: routujemy mikrofon przez GainNode i nagrywamy wzmocniony strumień.
    // Detekcja ciszy działa dalej na surowym `this.stream`.
    let recordStream: MediaStream = this.stream;
    if (inputGain && Math.abs(inputGain - 1) > 0.01) {
      try {
        this.gainContext = new AudioContext();
        const src = this.gainContext.createMediaStreamSource(this.stream);
        const gainNode = this.gainContext.createGain();
        gainNode.gain.value = Math.max(0, Math.min(4, inputGain));
        const dest = this.gainContext.createMediaStreamDestination();
        src.connect(gainNode);
        gainNode.connect(dest);
        recordStream = dest.stream;
      } catch { recordStream = this.stream; }
    }

    this.mediaRecorder = mimeType
      ? new MediaRecorder(recordStream, { mimeType })
      : new MediaRecorder(recordStream);
    this.chunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start();
    this._isRecording = true;
    this.recordingStartTime = Date.now();

    if (silenceOptions) {
      this.startSilenceDetection(silenceOptions);
    }
  }

  private startSilenceDetection(options: SilenceDetectionOptions): void {
    if (!this.stream) return;

    const threshold = options.threshold ?? 0.015;
    const duration = options.duration ?? 1500;
    const minRecordingTime = options.minRecordingTime ?? 1000;

    this.silenceCallbackFired = false;
    this.silenceStart = null;
    this._speechDetected = false;

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.fftSize);

      this.silenceCheckTimer = window.setInterval(() => {
        if (!this._isRecording || !this.analyser || this.silenceCallbackFired) {
          return;
        }

        const elapsed = Date.now() - this.recordingStartTime;
        if (elapsed < minRecordingTime) return;

        this.analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        if (rms < threshold) {
          if (this.silenceStart === null) {
            this.silenceStart = Date.now();
          } else if (Date.now() - this.silenceStart >= duration) {
            this.silenceCallbackFired = true;
            options.onSilenceDetected();
          }
        } else {
          this._speechDetected = true;
          this.silenceStart = null;
        }
      }, 100);
    } catch (err) {
      console.warn('[AudioRecorder] Silence detection setup failed:', err);
    }
  }

  async stop(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      if (!this.mediaRecorder || !this._isRecording) {
        reject(new Error('Not recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder.onerror = () => {
        this.cleanup();
        reject(new Error('Recording error'));
      };

      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this._isRecording) {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this._isRecording = false;

    if (this.silenceCheckTimer !== null) {
      window.clearInterval(this.silenceCheckTimer);
      this.silenceCheckTimer = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.gainContext) {
      this.gainContext.close().catch(() => {});
      this.gainContext = null;
    }
    this.analyser = null;
    this.silenceStart = null;

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
