/**
 * OcrService - Tesseract.js OCR with Sharp image preprocessing for receipt scanning.
 */

import Tesseract from 'tesseract.js';
import sharp from 'sharp';

export interface OcrResult {
  text: string;
  confidence: number;
}

export class OcrService {
  private worker: Tesseract.Worker | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    this.worker = await Tesseract.createWorker('pol');
    this.initialized = true;
    console.log('OCR Service initialized (language: pol)');
  }

  isAvailable(): boolean {
    return this.initialized && this.worker !== null;
  }

  async processImage(imageBase64: string): Promise<OcrResult> {
    if (!this.worker) {
      throw new Error('OCR Service not initialized');
    }

    const buffer = this.decodeBase64(imageBase64);
    const preprocessed = await this.preprocessImage(buffer);

    const { data } = await this.worker.recognize(preprocessed);

    return {
      text: data.text,
      confidence: data.confidence,
    };
  }

  async processMultipleImages(images: string[]): Promise<OcrResult> {
    if (images.length === 0) {
      throw new Error('No images provided');
    }

    const results: OcrResult[] = [];
    for (const img of images) {
      const result = await this.processImage(img);
      results.push(result);
    }

    return {
      text: results.map(r => r.text).join('\n---\n'),
      confidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
    };
  }

  private decodeBase64(base64: string): Buffer {
    // Handle data URL format: data:image/jpeg;base64,/9j/4AAQ...
    const match = base64.match(/^data:[^;]+;base64,(.+)$/);
    const raw = match ? match[1] : base64;
    return Buffer.from(raw, 'base64');
  }

  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.5 })
      .threshold(160)
      .png()
      .toBuffer();
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}
