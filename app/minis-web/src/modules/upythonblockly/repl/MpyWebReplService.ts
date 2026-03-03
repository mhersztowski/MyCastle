/**
 * MicroPython WebREPL service using the WebSocket API.
 *
 * WebREPL is a browser-based REPL for MicroPython devices over WiFi.
 * Default port: 8266.  The device must have WebREPL enabled and configured
 * with a password.
 *
 * Auth flow: device sends "Password: ", client replies with password + "\r\n".
 * After auth, the session behaves like a serial REPL.
 *
 * File upload uses the WebREPL binary protocol (PUT operation).
 */

export type DataHandler = (chunk: string) => void;

export interface WebReplConnectOptions {
  ip: string;
  port?: number;
  password: string;
}

const WEBREPL_PUTFILE_REQ = 1;
const WEBREPL_PUTFILE_RSP = 2;

export class MpyWebReplService {
  private ws: WebSocket | null = null;
  private dataHandlers: DataHandler[] = [];
  private connectHandlers: Array<() => void> = [];
  private disconnectHandlers: Array<() => void> = [];
  private authenticated = false;
  private pendingAuth: { password: string; resolve: () => void; reject: (e: Error) => void } | null = null;
  private readonly encoder = new TextEncoder();

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authenticated;
  }

  /** Connect to a WebREPL device. */
  async connect({ ip, port = 8266, password }: WebReplConnectOptions): Promise<void> {
    const url = `ws://${ip}:${port}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';
      this.authenticated = false;
      this.pendingAuth = { password, resolve, reject };

      this.ws.onopen = () => {
        // Auth challenge ("Password: ") will arrive in onmessage
      };

      this.ws.onmessage = (ev) => this.handleMessage(ev);

      this.ws.onerror = () => {
        reject(new Error(`WebSocket error connecting to ${url}`));
      };

      this.ws.onclose = () => {
        this.authenticated = false;
        this.disconnectHandlers.forEach((h) => h());
      };
    });
  }

  /** Disconnect from WebREPL. */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.authenticated = false;
  }

  onData(handler: DataHandler): () => void {
    this.dataHandlers.push(handler);
    return () => { this.dataHandlers = this.dataHandlers.filter((h) => h !== handler); };
  }

  onConnect(handler: () => void): () => void {
    this.connectHandlers.push(handler);
    return () => { this.connectHandlers = this.connectHandlers.filter((h) => h !== handler); };
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectHandlers.push(handler);
    return () => { this.disconnectHandlers = this.disconnectHandlers.filter((h) => h !== handler); };
  }

  /** Send raw text to the REPL. */
  async send(text: string): Promise<void> {
    if (!this.ws || !this.authenticated) throw new Error('Not connected');
    this.ws.send(this.encoder.encode(text));
  }

  /** Interrupt running code (Ctrl+C x2). */
  async interrupt(): Promise<void> {
    await this.send('\x03\x03');
    await this.delay(200);
  }

  /** Execute code via raw REPL over WebSocket. Returns stdout output. */
  async execCode(code: string): Promise<string> {
    await this.interrupt();
    // Enter raw REPL
    await this.send('\x01');
    await this.delay(200);
    // Send code + Ctrl+D
    await this.send(code);
    await this.send('\x04');
    const output = await this.readUntilCtrlD(5000);
    // Exit raw REPL
    await this.send('\x02');
    return output;
  }

  /** Save code to a file using raw REPL file-write commands. */
  async saveToFile(filename: string, code: string): Promise<void> {
    const lines = code.split('\n');
    let script = `f = open(${JSON.stringify(filename)}, 'w')\n`;
    for (const line of lines) {
      const escaped = line.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      script += `f.write('${escaped}\\n')\n`;
    }
    script += `f.close()\n`;
    await this.execCode(script);
  }

  /**
   * Upload a binary file via WebREPL binary PUT protocol.
   * Sends the 1-packet binary handshake followed by data chunks.
   */
  async putFile(destName: string, data: Uint8Array): Promise<void> {
    if (!this.ws || !this.authenticated) throw new Error('Not connected');

    // Build request record (128 bytes):
    // [0]: rec type (1=put)
    // [1]: reserved
    // [2..3]: file size (LE)  ... actually spec uses [2..5] for size
    // [10..n]: filename
    const nameBytes = this.encoder.encode(destName);
    const rec = new Uint8Array(128);
    rec[0] = WEBREPL_PUTFILE_REQ;
    rec[1] = 0;
    // File size (LE 4 bytes at offset 2)
    const size = data.length;
    rec[2] = size & 0xff;
    rec[3] = (size >> 8) & 0xff;
    rec[4] = (size >> 16) & 0xff;
    rec[5] = (size >> 24) & 0xff;
    // Filename length at offset 6 (LE 2 bytes)
    rec[6] = nameBytes.length & 0xff;
    rec[7] = (nameBytes.length >> 8) & 0xff;
    // Filename at offset 8
    rec.set(nameBytes.slice(0, 120), 8);

    this.ws.send(rec.buffer);

    // Wait for "OK" response
    await this.waitForResponse(WEBREPL_PUTFILE_RSP, 3000);

    // Send data in 1 KB chunks
    const CHUNK = 1024;
    for (let offset = 0; offset < data.length; offset += CHUNK) {
      this.ws.send(data.slice(offset, offset + CHUNK).buffer);
    }

    // Wait for final OK
    await this.waitForResponse(WEBREPL_PUTFILE_RSP, 5000);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data === 'string') {
      // Text frame — part of the REPL session
      if (!this.authenticated) {
        if (ev.data.includes('Password:')) {
          this.ws!.send(this.encoder.encode(this.pendingAuth!.password + '\r\n'));
        } else if (ev.data.includes('WebREPL connected') || ev.data.includes('>>>')) {
          this.authenticated = true;
          const pa = this.pendingAuth!;
          this.pendingAuth = null;
          this.connectHandlers.forEach((h) => h());
          pa.resolve();
        } else if (ev.data.includes('Access denied')) {
          const pa = this.pendingAuth!;
          this.pendingAuth = null;
          pa.reject(new Error('WebREPL authentication failed: wrong password'));
        }
      } else {
        this.dataHandlers.forEach((h) => h(ev.data));
      }
    } else {
      // Binary frame — WebREPL file transfer response
      const arr = new Uint8Array(ev.data as ArrayBuffer);
      this.lastBinaryResponse = arr;
    }
  }

  private lastBinaryResponse: Uint8Array | null = null;

  private waitForResponse(recType: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (this.lastBinaryResponse && this.lastBinaryResponse[0] === recType) {
          clearInterval(check);
          clearTimeout(timer);
          this.lastBinaryResponse = null;
          resolve();
        }
      }, 50);
      const timer = setTimeout(() => {
        clearInterval(check);
        reject(new Error('WebREPL response timeout'));
      }, timeoutMs);
    });
  }

  private readUntilCtrlD(timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
      let output = '';
      const timer = setTimeout(() => { cleanup(); resolve(output); }, timeoutMs);
      const cleanup = this.onData((chunk) => {
        output += chunk;
        if (output.includes('\x04')) {
          clearTimeout(timer);
          cleanup();
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
