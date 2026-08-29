/**
 * RealtimeSttService - transkrypcja w czasie rzeczywistym przez WebSocket
 * (ElevenLabs Scribe v2 realtime, ~150 ms latencji).
 *
 * Przepływ:
 *  1) mint tokenu single-use: POST /v1/single-use-token/realtime_scribe (xi-api-key)
 *  2) WS: wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=...&audio_format=pcm_16000&commit_strategy=vad
 *  3) mikrofon → PCM16 @16 kHz → base64 → wiadomości input_audio_chunk
 *  4) odbiór partial_transcript (podgląd) i committed_transcript (finał, po ciszy VAD)
 *
 * Uwaga: WebSocket w przeglądarce nie ustawia nagłówków, dlatego auth przez token.
 */

export interface RealtimeSttOptions {
  apiKey: string;
  language?: string;    // ISO, np. 'pl' / 'pol'
  deviceId?: string;
  model?: string;       // domyślnie scribe_v2_realtime
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: Error) => void;
}

function downsampleTo16k(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / 16000;
  const outLen = ratio <= 1 ? input.length : Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0, count = 0;
    for (let j = start; j < end && j < input.length; j++) { sum += input[j]; count++; }
    const s = count ? sum / count : (input[start] || 0);
    const c = Math.max(-1, Math.min(1, s));
    out[i] = c < 0 ? c * 0x8000 : c * 0x7fff;
  }
  return out;
}

function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class RealtimeSttService {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private mute: GainNode | null = null;
  private _active = false;

  get active(): boolean {
    return this._active;
  }

  async start(opts: RealtimeSttOptions): Promise<void> {
    // 1) token single-use (15 min)
    const tokenResp = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': opts.apiKey },
    });
    if (!tokenResp.ok) {
      throw new Error(`ElevenLabs token error (${tokenResp.status}): ${await tokenResp.text()}`);
    }
    const { token } = await tokenResp.json();
    if (!token) throw new Error('ElevenLabs: brak tokenu w odpowiedzi');

    // 2) WebSocket
    const params = new URLSearchParams({
      token,
      model_id: opts.model || 'scribe_v2_realtime',
      audio_format: 'pcm_16000',
      commit_strategy: 'vad',
    });
    if (opts.language) params.set('language_code', opts.language);

    const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`);
    this.ws = ws;

    ws.onmessage = (e) => {
      let msg: { message_type?: string; text?: string; error?: string };
      try { msg = JSON.parse(e.data as string); } catch { return; }
      switch (msg.message_type) {
        case 'partial_transcript':
          opts.onPartial?.(msg.text || '');
          break;
        case 'committed_transcript':
        case 'committed_transcript_with_timestamps':
          if (msg.text && msg.text.trim()) opts.onFinal(msg.text.trim());
          break;
        case 'error':
          opts.onError?.(new Error(msg.error || 'ElevenLabs realtime error'));
          break;
      }
    };
    ws.onerror = () => opts.onError?.(new Error('ElevenLabs realtime: błąd WebSocket'));

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onclose = () => reject(new Error('ElevenLabs realtime: połączenie zamknięte'));
      setTimeout(() => reject(new Error('ElevenLabs realtime: timeout połączenia')), 6000);
    });
    ws.onclose = () => { if (this._active) this.stop(); };

    // 3) mikrofon → PCM16 @16k → WS
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : true,
    });
    this.ctx = new AudioContext();
    const inRate = this.ctx.sampleRate;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    // wycisz przejście (żeby mikrofon nie leciał na głośniki), ale utrzymaj przetwarzanie
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.mute);
    this.mute.connect(this.ctx.destination);

    this.processor.onaudioprocess = (ev) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = ev.inputBuffer.getChannelData(0);
      const pcm = inRate === 16000 ? floatToPcm16(input) : downsampleTo16k(input, inRate);
      this.ws.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: pcm16ToBase64(pcm),
        sample_rate: 16000,
      }));
    };

    this._active = true;
  }

  stop(): void {
    this._active = false;
    if (this.processor) { this.processor.onaudioprocess = null; try { this.processor.disconnect(); } catch { /* */ } this.processor = null; }
    if (this.source) { try { this.source.disconnect(); } catch { /* */ } this.source = null; }
    if (this.mute) { try { this.mute.disconnect(); } catch { /* */ } this.mute = null; }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      try { ws.close(); } catch { /* */ }
    }
  }
}

function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const c = Math.max(-1, Math.min(1, input[i]));
    out[i] = c < 0 ? c * 0x8000 : c * 0x7fff;
  }
  return out;
}
