/**
 * AiVisionReceiptProvider - uses AI vision (multimodal) to extract receipt data.
 * Extracted from the original ReceiptScannerService.
 */

import { aiService } from '../../ai';
import { AiChatMessage, AiContentBlock } from '../../ai/models/AiModels';
import { resizeImageToBase64 } from '../../ai/utils/imageUtils';
import { ReceiptData, ReceiptItem } from '../models/ReceiptModels';
import { ReceiptScanProvider } from './ReceiptScanProvider';
import { DEFAULT_SHOPPING_CATEGORIES, DEFAULT_SHOPPING_UNITS } from '../../filesystem/models/ShoppingModel';

const RECEIPT_SYSTEM_PROMPT = `Jesteś ekspertem od analizy paragonów sklepowych (polskich).
Twoim zadaniem jest wyodrębnić dane z paragonu na zdjęciu (lub zdjęciach).

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

Wskazówki dotyczące cen i rabatów:
- WAŻNE: "price" to ZAWSZE cena końcowa (po rabacie/upuście), czyli kwota faktycznie zapłacona za tę pozycję
- "originalPrice" to cena przed rabatem (cena regularna). Podaj TYLKO gdy produkt ma rabat/upust. Jeśli brak rabatu, pomiń to pole
- "discount" to kwota rabatu/upustu (liczba dodatnia). Podaj TYLKO gdy produkt ma rabat. Jeśli brak rabatu, pomiń to pole
- Zależność: price = originalPrice - discount

Jak rozpoznać rabaty na polskich paragonach:
- Linia z gwiazdką (*) przy cenie oznacza cenę po rabacie — to jest "price"
- Linie typu "RABAT", "OPUST", "UPUST", "ZNIŻKA", "OBNIŻKA" pod produktem to kwota rabatu
- Linie z ujemną kwotą (np. "-2.00") pod produktem to rabat
- Linia "Cena regular." lub "Cena przed" to cena oryginalna (originalPrice)
- Jeśli widzisz dwie ceny przy produkcie: wyższa to originalPrice, niższa (lub oznaczona *) to price
- NIE twórz osobnej pozycji dla linii rabatu — dołącz rabat do produktu, którego dotyczy

Pozostałe wskazówki:
- Cena ("price") to łączna cena za daną pozycję (ilość * cena jednostkowa po rabacie)
- Jeśli nie widzisz ilości, przyjmij 1 szt
- Dopasuj kategorię na podstawie nazwy produktu. Dostępne kategorie: ${DEFAULT_SHOPPING_CATEGORIES.join(', ')}
- Dostępne jednostki: ${DEFAULT_SHOPPING_UNITS.join(', ')}
- Ignoruj linie typu "PARAGON FISKALNY", "NIP", "SUMA", datę i stopkę — wyodrębnij tylko produkty
- Nazwy produktów mogą być skrócone na paragonie — zachowaj je jak są
- Jeśli otrzymasz wiele zdjęć, to jest ten sam paragon sfotografowany w częściach (np. długi paragon). Połącz dane ze wszystkich zdjęć w jeden wynik. Unikaj duplikatów produktów widocznych na nakładających się fragmentach.`;

const RECEIPT_USER_PROMPT_SINGLE = 'Przeanalizuj ten paragon i wyodrębnij dane w formacie JSON. Zwróć TYLKO obiekt JSON.';
const RECEIPT_USER_PROMPT_MULTI = 'Przeanalizuj te zdjęcia paragonu (kolejne fragmenty tego samego paragonu) i wyodrębnij dane w formacie JSON. Połącz produkty ze wszystkich zdjęć. Zwróć TYLKO obiekt JSON.';

export class AiVisionReceiptProvider implements ReceiptScanProvider {
  async scan(imageBlobs: Blob[]): Promise<ReceiptData> {
    if (imageBlobs.length === 0) throw new Error('Brak zdjęć do analizy');

    // Ensure AI config is loaded before scanning
    if (!aiService.loaded) {
      await aiService.loadConfig();
    }
    if (!aiService.isConfigured()) {
      throw new Error('AI nie jest skonfigurowane. Przejdź do Settings > AI Settings.');
    }

    const base64Urls = await Promise.all(
      imageBlobs.map(blob => resizeImageToBase64(blob, {
        maxDimension: 1536,
        quality: 0.85,
      }))
    );

    const isMulti = base64Urls.length > 1;
    const content: AiContentBlock[] = [
      { type: 'text', text: isMulti ? RECEIPT_USER_PROMPT_MULTI : RECEIPT_USER_PROMPT_SINGLE },
      ...base64Urls.map(url => ({
        type: 'image_url' as const,
        image_url: { url, detail: 'high' as const },
      })),
    ];

    const messages: AiChatMessage[] = [
      { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
      { role: 'user', content },
    ];

    const response = await aiService.chat({
      messages,
      temperature: 0.1,
      maxTokens: 4096,
    });

    return this.parseResponse(response.content);
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
