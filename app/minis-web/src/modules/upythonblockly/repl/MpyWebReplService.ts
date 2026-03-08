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

// WebREPL binary protocol constants
// Request/response type for PUT file operation (same value in both directions)
const WEBREPL_PUT_FILE = 1;

// Response signature bytes: 'W', 'B'
const WEBREPL_RSP_SIG0 = 0x57;
const WEBREPL_RSP_SIG1 = 0x42;

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
   *
   * Request record format (82 bytes, little-endian): <2sBBQLH64s>
   *   [0-1]   sig    'WA' (0x57, 0x41)
   *   [2]     type   1 = PUT_FILE
   *   [3]     flags  0
   *   [4-11]  offset uint64 (always 0 for full upload)
   *   [12-15] size   uint32 (file size in bytes)
   *   [16-17] flen   uint16 (filename length)
   *   [18-81] fname  up to 64 bytes of filename
   *
   * Response record: 8 bytes <2sBBi> — sig 'WB', type, flags, result (>=0 = OK)
   */
  async putFile(destName: string, data: Uint8Array): Promise<void> {
    if (!this.ws || !this.authenticated) throw new Error('Not connected');

    const nameBytes = this.encoder.encode(destName).slice(0, 64);
    const rec = new Uint8Array(82);
    const view = new DataView(rec.buffer);

    rec[0] = 0x57; // 'W'
    rec[1] = 0x41; // 'A'
    rec[2] = WEBREPL_PUT_FILE;
    rec[3] = 0; // flags
    // bytes [4-11] = offset uint64 = 0, already zeroed
    view.setUint32(12, data.length, true); // size
    view.setUint16(16, nameBytes.length, true); // fname_len
    rec.set(nameBytes, 18); // fname

    this.ws.send(rec.buffer);

    // Wait for ACK after header (response sig='WB', type=PUT_FILE, result>=0)
    await this.waitForResponse(WEBREPL_PUT_FILE, 3000);

    // Send data in 1 KB chunks
    const CHUNK = 1024;
    for (let offset = 0; offset < data.length; offset += CHUNK) {
      this.ws.send(data.slice(offset, offset + CHUNK).buffer);
    }

    // Wait for final ACK
    await this.waitForResponse(WEBREPL_PUT_FILE, 5000);
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

  // Response record: 8 bytes — sig 'WB' (0x57,0x42), type, flags, result (int32 LE, >=0 = OK)
  private waitForResponse(recType: number, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        const r = this.lastBinaryResponse;
        if (r && r.length >= 8 && r[0] === WEBREPL_RSP_SIG0 && r[1] === WEBREPL_RSP_SIG1 && r[2] === recType) {
          clearInterval(check);
          clearTimeout(timer);
          this.lastBinaryResponse = null;
          const result = new DataView(r.buffer).getInt32(4, true);
          if (result < 0) {
            reject(new Error(`WebREPL PUT failed (result=${result})`));
          } else {
            resolve();
          }
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
