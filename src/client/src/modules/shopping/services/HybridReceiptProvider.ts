/**
 * HybridReceiptProvider - OCR on backend for text extraction, then AI for structured parsing.
 * Cheaper than AI Vision (text-only prompt, no image tokens).
 */

import { aiService } from '../../ai';
import { AiChatMessage } from '../../ai/models/AiModels';
import { blobToBase64DataUrl } from '../../ai/utils/imageUtils';
import { ReceiptData, ReceiptItem } from '../models/ReceiptModels';
import { ReceiptScanProvider } from './ReceiptScanProvider';
import { DEFAULT_SHOPPING_CATEGORIES, DEFAULT_SHOPPING_UNITS } from '../../filesystem/models/ShoppingModel';

interface OcrBackendResponse {
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}

const HYBRID_SYSTEM_PROMPT = `Jesteś ekspertem od analizy paragonów sklepowych (polskich).
Otrzymasz tekst rozpoznany przez OCR z paragonu. Tekst może zawierać błędy rozpoznawania.
Twoim zadaniem jest wyodrębnić strukturalne dane z tego tekstu.

Zwróć dane w formacie JSON (i TYLKO JSON, bez markdown, bez komentarzy):
{
  "storeName": "nazwa sklepu lub null",
  "date": "data paragonu w formacie YYYY-MM-DD lub null",
  "items": [
    {
      "name": "nazwa produktu",
      "quantity": 1,
      "unit": "szt|kg|g|l|ml|opak lub null",
      "price": 5.99,
      "originalPrice": 7.99,
      "discount": 2.00,
      "category": "nabiał|pieczywo|mięso|warzywa|owoce|napoje|chemia|higiena|mrożonki|przekąski|inne"
    }
  ],
  "total": 45.99,
  "currency": "PLN"
}

Wskazówki:
- "price" to ZAWSZE cena końcowa (po rabacie), faktycznie zapłacona
- "originalPrice" i "discount" podaj TYLKO gdy produkt ma rabat
- Linie z "RABAT", "OPUST", "UPUST" to rabaty — dołącz do produktu, którego dotyczą
- Ignoruj linie: "PARAGON FISKALNY", "NIP", "SUMA", stopkę
- Tekst OCR może mieć błędy — staraj się odgadnąć prawidłowe nazwy
- Dopasuj kategorię. Dostępne: ${DEFAULT_SHOPPING_CATEGORIES.join(', ')}
- Dostępne jednostki: ${DEFAULT_SHOPPING_UNITS.join(', ')}`;

export class HybridReceiptProvider implements ReceiptScanProvider {
  async scan(imageBlobs: Blob[]): Promise<ReceiptData> {
    if (imageBlobs.length === 0) throw new Error('Brak zdjęć do analizy');

    // Ensure AI config is loaded (hybrid needs AI for text analysis)
    if (!aiService.loaded) {
      await aiService.loadConfig();
    }
    if (!aiService.isConfigured()) {
      throw new Error('AI nie jest skonfigurowane. Przejdź do Settings > AI Settings.');
    }

    // Step 1: Send images to backend OCR for text extraction
    const base64Images = await Promise.all(
      imageBlobs.map(async (blob) => {
        const dataUrl = await blobToBase64DataUrl(blob);
        return dataUrl;
      })
    );

    const httpUrl = import.meta.env.VITE_HTTP_URL || 'http://localhost:3001';
    const ocrResponse = await fetch(`${httpUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: base64Images }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      throw new Error(`OCR backend error (${ocrResponse.status}): ${errorText}`);
    }

    const ocrResult: OcrBackendResponse = await ocrResponse.json();

    if (!ocrResult.success || !ocrResult.text) {
      throw new Error(ocrResult.error || 'Nie udało się rozpoznać tekstu z paragonu');
    }

    // Step 2: Send OCR text to AI for structured parsing (no image = cheaper)
    const messages: AiChatMessage[] = [
      { role: 'system', content: HYBRID_SYSTEM_PROMPT },
      { role: 'user', content: `Oto tekst rozpoznany z paragonu przez OCR:\n\n${ocrResult.text}\n\nPrzeanalizuj ten tekst i wyodrębnij dane w formacie JSON. Zwróć TYLKO obiekt JSON.` },
    ];

    const aiResponse = await aiService.chat({
      messages,
      temperature: 0.1,
      maxTokens: 4096,
    });

    return this.parseResponse(aiResponse.content);
  }

  private parseResponse(responseText: string): ReceiptData {
    let jsonStr = responseText.trim();

    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed);
    } catch {
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);
          return this.validateAndNormalize(parsed);
        } catch {
          // Fall through
        }
      }
      throw new Error('Nie udało się odczytać danych z paragonu');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private validateAndNormalize(data: any): ReceiptData {
    const items: ReceiptItem[] = [];

    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.name && typeof item.price === 'number') {
          const receiptItem: ReceiptItem = {
            name: String(item.name).trim(),
            quantity: typeof item.quantity === 'number' ? item.quantity : 1,
            unit: this.normalizeUnit(item.unit),
            price: Math.round(item.price * 100) / 100,
            category: this.normalizeCategory(item.category),
          };
          if (typeof item.originalPrice === 'number' && item.originalPrice > item.price) {
            receiptItem.originalPrice = Math.round(item.originalPrice * 100) / 100;
          }
          if (typeof item.discount === 'number' && item.discount > 0) {
            receiptItem.discount = Math.round(item.discount * 100) / 100;
          }
          if (receiptItem.originalPrice && !receiptItem.discount) {
            receiptItem.discount = Math.round((receiptItem.originalPrice - receiptItem.price) * 100) / 100;
          } else if (receiptItem.discount && !receiptItem.originalPrice) {
            receiptItem.originalPrice = Math.round((receiptItem.price + receiptItem.discount) * 100) / 100;
          }
          items.push(receiptItem);
        }
      }
    }

    if (items.length === 0) {
      throw new Error('Nie znaleziono produktów na paragonie');
    }

    return {
      storeName: data.storeName || undefined,
      date: data.date || undefined,
      items,
      total: typeof data.total === 'number'
        ? Math.round(data.total * 100) / 100
        : undefined,
      currency: data.currency || 'PLN',
    };
  }

  private normalizeUnit(unit: string | null | undefined): string | undefined {
    if (!unit) return undefined;
    const lower = unit.toLowerCase().trim();
    const match = DEFAULT_SHOPPING_UNITS.find(u => u === lower);
    return match || undefined;
  }

  private normalizeCategory(category: string | null | undefined): string {
    if (!category) return 'inne';
    const lower = category.toLowerCase().trim();
    const match = DEFAULT_SHOPPING_CATEGORIES.find(c => c === lower);
    return match || 'inne';
  }
}
