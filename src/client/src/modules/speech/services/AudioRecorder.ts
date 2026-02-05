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
  private silenceCheckTimer: number | null = null;
  private silenceStart: number | null = null;
  private recordingStartTime = 0;
  private silenceCallbackFired = false;

  get isRecording(): boolean {
    return this._isRecording;
  }

  async start(silenceOptions?: SilenceDetectionOptions): Promise<void> {
    if (this._isRecording) return;

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
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
