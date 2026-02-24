import { ESPLoader, Transport, type FlashOptions, type IEspLoaderTerminal } from 'esptool-js';

export interface FlashFileEntry {
  data: string; // binary string
  address: number;
  name: string;
}

export interface FlashProgress {
  fileIndex: number;
  written: number;
  total: number;
  percent: number;
}

export type FlashState = 'idle' | 'connecting' | 'connected' | 'flashing' | 'done' | 'error';

export interface FlashSettings {
  baudRate: number;
  flashMode: string;
  flashFreq: string;
  flashSize: string;
  eraseAll: boolean;
}

const DEFAULT_SETTINGS: FlashSettings = {
  baudRate: 921600,
  flashMode: 'keep',
  flashFreq: 'keep',
  flashSize: 'keep',
  eraseAll: false,
};

export class EspFlashService {
  private loader: ESPLoader | null = null;
  private transport: Transport | null = null;
  private onLog: ((msg: string) => void) | null = null;
  private onProgress: ((progress: FlashProgress) => void) | null = null;
  private onStateChange: ((state: FlashState) => void) | null = null;

  chipName = '';

  setOnLog(cb: (msg: string) => void): void {
    this.onLog = cb;
  }

  setOnProgress(cb: (progress: FlashProgress) => void): void {
    this.onProgress = cb;
  }

  setOnStateChange(cb: (state: FlashState) => void): void {
    this.onStateChange = cb;
  }

  private log(msg: string): void {
    this.onLog?.(msg);
  }

  private setState(state: FlashState): void {
    this.onStateChange?.(state);
  }

  private createTerminal(): IEspLoaderTerminal {
    return {
      clean: () => {},
      writeLine: (data: string) => this.log(data),
      write: (data: string) => this.log(data),
    };
  }

  async connect(): Promise<void> {
    if (!navigator.serial) {
      throw new Error('Web Serial API not supported');
    }

    this.setState('connecting');
    this.log('Requesting serial port...');

    try {
      const port = await navigator.serial.requestPort();
      this.transport = new Transport(port);

      this.loader = new ESPLoader({
        transport: this.transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: this.createTerminal(),
      });

      this.log('Connecting to chip...');
      this.chipName = await this.loader.main();
      this.log(`Connected: ${this.chipName}`);

      await this.loader.flashId();

      this.setState('connected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Connection error: ${msg}`);
      this.setState('error');
      throw err;
    }
  }

  async flash(files: FlashFileEntry[], settings: FlashSettings = DEFAULT_SETTINGS): Promise<void> {
    if (!this.loader) {
      throw new Error('Not connected');
    }

    this.setState('flashing');
    this.log('Starting flash...');

    try {
      const flashOptions: FlashOptions = {
        fileArray: files.map((f) => ({ data: f.data, address: f.address })),
        flashSize: settings.flashSize,
        flashMode: settings.flashMode,
        flashFreq: settings.flashFreq,
        eraseAll: settings.eraseAll,
        compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => {
          const percent = total > 0 ? Math.round((written / total) * 100) : 0;
          this.onProgress?.({ fileIndex, written, total, percent });
          this.log(`File ${fileIndex + 1}: ${percent}% (${written}/${total})`);
        },
      };

      await this.loader.writeFlash(flashOptions);
      this.log('Flash complete! Resetting device...');

      await this.loader.after();
      this.log('Done. Device reset.');

      // Disconnect transport so next flash gets a clean connection
      try {
        await this.transport?.disconnect();
      } catch {
        // ignore
      }
      this.transport = null;
      this.loader = null;

      this.setState('done');
      this.log('Ready to flash again — click Connect.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Flash error: ${msg}`);
      this.setState('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport?.disconnect();
    } catch {
      // ignore
    }
    this.transport = null;
    this.loader = null;
    this.chipName = '';
    this.setState('idle');
  }
}

/**
 * Read a File object as a binary string (for esptool-js fileArray.data).
 */
export function readFileAsBinaryString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}
