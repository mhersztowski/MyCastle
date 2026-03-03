/**
 * MicroPython Serial REPL service using the Web Serial API.
 *
 * Protocol:
 *   1. Send Ctrl+C x2 → interrupt running program
 *   2. Send Ctrl+A   → enter raw REPL mode (waits for ">")
 *   3. Send code + Ctrl+D → execute
 *   4. Read output until Ctrl+D marker
 *   5. Send Ctrl+B   → exit raw REPL back to normal REPL
 *
 * For saving to a file:
 *   Execute a small MicroPython script that writes the code to a file.
 */

export type DataHandler = (chunk: string) => void;

export class MpySerialReplService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private dataHandlers: DataHandler[] = [];
  private readLoopActive = false;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  get isConnected(): boolean {
    return this.port !== null;
  }

  /** Open a serial port. Prompts the browser port picker if no port is provided. */
  async connect(baudRate = 115200): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported in this browser');
    }
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate });
    this.writer = this.port.writable!.getWriter();
    this.reader = this.port.readable!.getReader();
    this.readLoopActive = true;
    this.startReadLoop();
  }

  /** Disconnect cleanly. */
  async disconnect(): Promise<void> {
    this.readLoopActive = false;
    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); } catch { /* ignore */ }
    try { this.writer?.releaseLock(); } catch { /* ignore */ }
    try { await this.port?.close(); } catch { /* ignore */ }
    this.reader = null;
    this.writer = null;
    this.port = null;
  }

  /** Register a callback for incoming serial data. */
  onData(handler: DataHandler): () => void {
    this.dataHandlers.push(handler);
    return () => { this.dataHandlers = this.dataHandlers.filter((h) => h !== handler); };
  }

  /** Send raw bytes. */
  async write(data: Uint8Array | string): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    const bytes = typeof data === 'string' ? this.encoder.encode(data) : data;
    await this.writer.write(bytes);
  }

  /** Interrupt running code (Ctrl+C x2). */
  async interrupt(): Promise<void> {
    await this.write(new Uint8Array([0x03, 0x03]));
    await this.delay(200);
  }

  /**
   * Execute code in raw REPL mode.
   * Returns stdout output as a string.
   */
  async execCode(code: string): Promise<string> {
    if (!this.writer) throw new Error('Not connected');

    // Stop running program
    await this.interrupt();

    // Enter raw REPL (Ctrl+A)
    await this.write(new Uint8Array([0x01]));
    await this.delay(200);

    // Send code followed by Ctrl+D (execute)
    await this.write(code);
    await this.write(new Uint8Array([0x04]));

    // Collect output until we see the raw REPL "OK" and end markers
    const output = await this.readUntilCtrlD(3000);

    // Exit raw REPL (Ctrl+B)
    await this.write(new Uint8Array([0x02]));

    return output;
  }

  /**
   * Save code to a file on the device using raw REPL file operations.
   * Uses chunked write to handle long scripts safely.
   */
  async saveToFile(filename: string, code: string): Promise<void> {
    // Escape single quotes in code so it can be passed inside f(write('...')
    const lines = code.split('\n');
    let script = `f = open(${JSON.stringify(filename)}, 'w')\n`;
    for (const line of lines) {
      // Escape backslashes and quotes for safe embedding
      const escaped = line.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      script += `f.write('${escaped}\\n')\n`;
    }
    script += `f.close()\n`;
    await this.execCode(script);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private startReadLoop(): void {
    const loop = async () => {
      while (this.readLoopActive && this.reader) {
        try {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            const text = this.decoder.decode(value);
            this.dataHandlers.forEach((h) => h(text));
          }
        } catch {
          break;
        }
      }
    };
    loop().catch(() => { /* connection closed */ });
  }

  private async readUntilCtrlD(timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      const timer = setTimeout(() => {
        cleanup();
        resolve(output);
      }, timeoutMs);

      const cleanup = this.onData((chunk) => {
        output += chunk;
        // Raw REPL output format: "OK<stdout>\x04<stderr>\x04"
        // We stop collecting after the first \x04 (end of stdout)
        if (output.includes('\x04')) {
          clearTimeout(timer);
          cleanup();
          // Extract stdout part (between "OK" and first \x04)
          const okIdx = output.indexOf('OK');
          const endIdx = output.indexOf('\x04');
          resolve(okIdx !== -1 && endIdx > okIdx ? output.slice(okIdx + 2, endIdx) : output);
        }
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
