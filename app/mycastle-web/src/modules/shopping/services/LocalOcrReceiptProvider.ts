/**
 * LocalOcrReceiptProvider - sends images to backend OCR (Tesseract.js) for local processing.
 */

import { blobToBase64DataUrl } from '../../ai/utils/imageUtils';
import { getHttpUrl } from '../../../utils/urlHelper';
import { ReceiptData, ReceiptItem } from '../models/ReceiptModels';
import { ReceiptScanProvider } from './ReceiptScanProvider';
import { DEFAULT_SHOPPING_UNITS } from '../../filesystem/models/ShoppingModel';

interface BackendParsedItem {
  name: string;
  quantity?: number;
  unit?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
}

interface BackendParsedReceipt {
  storeName?: string;
  date?: string;
  items: BackendParsedItem[];
  total?: number;
  currency: string;
}

interface OcrBackendResponse {
  success: boolean;
  text?: string;
  parsed?: BackendParsedReceipt;
  confidence?: number;
  error?: string;
}

export class LocalOcrReceiptProvider implements ReceiptScanProvider {
  async scan(imageBlobs: Blob[]): Promise<ReceiptData> {
    if (imageBlobs.length === 0) throw new Error('Brak zdjęć do analizy');

    const base64Images = await Promise.all(
      imageBlobs.map(async (blob) => {
        const dataUrl = await blobToBase64DataUrl(blob);
        return dataUrl;
      })
    );

    const httpUrl = getHttpUrl();
    const response = await fetch(`${httpUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: base64Images }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR backend error (${response.status}): ${errorText}`);
    }

    const result: OcrBackendResponse = await response.json();

    if (!result.success || !result.parsed) {
      throw new Error(result.error || 'Nie udało się przetworzyć paragonu (OCR)');
    }

    return this.toReceiptData(result.parsed);
  }

  private toReceiptData(parsed: BackendParsedReceipt): ReceiptData {
    const items: ReceiptItem[] = parsed.items
      .filter(item => item.name && typeof item.price === 'number')
      .map(item => {
        const receiptItem: ReceiptItem = {
          name: item.name.trim(),
          quantity: item.quantity || 1,
          unit: this.normalizeUnit(item.unit),
          price: Math.round(item.price * 100) / 100,
          category: 'inne',
        };
        if (item.originalPrice && item.originalPrice > item.price) {
          receiptItem.originalPrice = Math.round(item.originalPrice * 100) / 100;
        }
        if (item.discount && item.discount > 0) {
          receiptItem.discount = Math.round(item.discount * 100) / 100;
        }
        if (receiptItem.originalPrice && !receiptItem.discount) {
          receiptItem.discount = Math.round((receiptItem.originalPrice - receiptItem.price) * 100) / 100;
        } else if (receiptItem.discount && !receiptItem.originalPrice) {
          receiptItem.originalPrice = Math.round((receiptItem.price + receiptItem.discount) * 100) / 100;
        }
        return receiptItem;
      });

    if (items.length === 0) {
      throw new Error('Nie znaleziono produktów na paragonie (OCR)');
    }

    return {
      storeName: parsed.storeName || undefined,
      date: parsed.date || undefined,
      items,
      total: typeof parsed.total === 'number'
        ? Math.round(parsed.total * 100) / 100
        : undefined,
      currency: parsed.currency || 'PLN',
    };
  }

  private normalizeUnit(unit: string | null | undefined): string | undefined {
    if (!unit) return undefined;
    const lower = unit.toLowerCase().trim();
    const match = DEFAULT_SHOPPING_UNITS.find(u => u === lower);
    return match || undefined;
  }
}

export async function checkOcrBackendStatus(): Promise<{ available: boolean; languages: string[] }> {
  try {
    const httpUrl = getHttpUrl();
    const response = await fetch(`${httpUrl}/ocr/status`);
    if (!response.ok) return { available: false, languages: [] };
    return await response.json();
  } catch {
    return { available: false, languages: [] };
  }
}
