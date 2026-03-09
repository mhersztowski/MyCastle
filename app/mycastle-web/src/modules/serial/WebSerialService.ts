/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Wraps the Web Serial API for connecting to serial ports.
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
 */

export interface WebSerialOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: ParityType;
  flowControl?: FlowControlType;
}

const DEFAULT_OPTIONS: WebSerialOptions = {
  baudRate: 115200,
};

export class WebSerialService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private onData: ((data: string) => void) | null = null;
  private reading = false;

  get isSupported(): boolean {
    return 'serial' in navigator;
  }

  get isConnected(): boolean {
    return this.port !== null && this.reading;
  }

  setOnData(callback: (data: string) => void): void {
    this.onData = callback;
  }

  async connect(options: WebSerialOptions = DEFAULT_OPTIONS): Promise<void> {
    if (!this.isSupported || !navigator.serial) {
      throw new Error('Web Serial API is not supported in this browser');
    }

    this.port = await navigator.serial.requestPort();
    await this.port.open(options);

    this.reading = true;
    this.readLoop();
  }

  async disconnect(): Promise<void> {
    this.reading = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // ignore
      }
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // ignore
      }
      this.port = null;
    }
  }

  async write(data: string): Promise<void> {
    if (!this.port?.writable) return;

    const writer = this.port.writable.getWriter();
    try {
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(data));
    } finally {
      writer.releaseLock();
    }
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;

    const decoder = new TextDecoder();

    while (this.reading && this.port?.readable) {
      this.reader = this.port.readable.getReader();
      try {
        while (this.reading) {
          const { value, done } = await this.reader!.read();
          if (done) break;
          if (value && this.onData) {
            this.onData(decoder.decode(value));
          }
        }
      } catch {
        // port disconnected or read error
      } finally {
        this.reader?.releaseLock();
        this.reader = null;
      }
    }
  }
}
