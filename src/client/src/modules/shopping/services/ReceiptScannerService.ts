/**
 * ReceiptScannerService - delegates receipt scanning to the configured provider.
 * Supports: AI Vision, Local OCR, Hybrid (OCR + AI text).
 */

import { mqttClient } from '../../mqttclient';
import { ReceiptData } from '../models/ReceiptModels';
import { ReceiptScanConfigModel, ReceiptScanEngine, DEFAULT_RECEIPT_SCAN_CONFIG } from '../models/ReceiptScanConfigModel';
import { ReceiptScanProvider } from './ReceiptScanProvider';
import { AiVisionReceiptProvider } from './AiVisionReceiptProvider';
import { LocalOcrReceiptProvider } from './LocalOcrReceiptProvider';
import { HybridReceiptProvider } from './HybridReceiptProvider';

const RECEIPT_SCAN_CONFIG_PATH = 'data/receipt_scan_config.json';

export class ReceiptScannerService {
  private config: ReceiptScanConfigModel = { ...DEFAULT_RECEIPT_SCAN_CONFIG };
  private _isLoaded = false;
  private _isLoading = false;

  async loadConfig(forceReload = false): Promise<ReceiptScanConfigModel> {
    if (this._isLoaded && !forceReload) {
      return this.config;
    }

    if (this._isLoading) {
      while (this._isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.config;
    }

    this._isLoading = true;
    try {
      const file = await mqttClient.readFile(RECEIPT_SCAN_CONFIG_PATH);
      if (file?.content) {
        const data = JSON.parse(file.content) as ReceiptScanConfigModel;
        this.config = { ...DEFAULT_RECEIPT_SCAN_CONFIG, ...data };
      }
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    } catch {
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    }
  }

  async saveConfig(config: ReceiptScanConfigModel): Promise<boolean> {
    this.config = config;
    try {
      await mqttClient.writeFile(RECEIPT_SCAN_CONFIG_PATH, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save receipt_scan_config.json:', err);
      return false;
    }
  }

  getConfig(): ReceiptScanConfigModel {
    return this.config;
  }

  getEngine(): ReceiptScanEngine {
    return this.config.engine;
  }

  setEngine(engine: ReceiptScanEngine): void {
    this.config.engine = engine;
  }

  isLoaded(): boolean {
    return this._isLoaded;
  }

  async scanReceipt(imageBlobs: Blob | Blob[]): Promise<ReceiptData> {
    const blobs = Array.isArray(imageBlobs) ? imageBlobs : [imageBlobs];
    if (blobs.length === 0) throw new Error('Brak zdjęć do analizy');

    const provider = this.getProvider();
    return provider.scan(blobs);
  }

  private getProvider(): ReceiptScanProvider {
    switch (this.config.engine) {
      case 'ai_vision':
        return new AiVisionReceiptProvider();
      case 'local_ocr':
        return new LocalOcrReceiptProvider();
      case 'hybrid':
        return new HybridReceiptProvider();
      default:
        return new AiVisionReceiptProvider();
    }
  }
}

export const receiptScannerService = new ReceiptScannerService();
