/**
 * PolishReceiptParser - regex-based parser for Polish receipt OCR text.
 *
 * Handles typical Polish receipt formats:
 * - Product lines: "NAZWA PRODUKTU  qty x unit_price  TOTAL A"
 * - Simple format: "NAZWA  CENA"
 * - Discounts: "RABAT/OPUST/UPUST  -KWOTA"
 * - Total: "SUMA/RAZEM  KWOTA"
 * - Date: "DD-MM-YYYY" or "DD.MM.YYYY"
 * - Tax markers: A, B, C, D after price
 */

export interface ParsedReceiptItem {
  name: string;
  quantity?: number;
  unit?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
}

export interface ParsedReceipt {
  storeName?: string;
  date?: string;
  items: ParsedReceiptItem[];
  total?: number;
  currency: string;
}

// Tax marker pattern at end of line
const TAX_MARKER = /\s+[A-D]\s*$/;

// Price pattern: digits with comma or dot as decimal separator
const PRICE_PATTERN = /(\d+)[.,](\d{2})/;

// Quantity line: "2 x 3,49" or "2 * 3,49" or "2 szt x 3,49" or "0,450 kg x 8,99"
const QTY_LINE_PATTERN = /(\d+[.,]?\d*)\s*(szt|kg|g|l|ml|opak|op)?\s*[x*]\s*(\d+[.,]\d{2})/i;

// Discount patterns
const DISCOUNT_PATTERNS = [
  /^(?:RABAT|OPUST|UPUST|OBNIŻKA|OBNI[ZŻ]KA|ZNIZKA|ZNIŻKA|ZNI[ZŻ]KA)/i,
  /^-\s*\d+[.,]\d{2}/,
];

// Total patterns
const TOTAL_PATTERNS = [
  /^(?:SUMA|RAZEM|DO\s*ZAPŁATY|DO\s*ZAP[ŁL]ATY|NALEŻNOŚĆ|NALE[ZŻ]NO[SŚ][CĆ])\s/i,
  /^(?:SUMA\s*PLN|RAZEM\s*PLN)/i,
];

// Lines to skip (headers, footers, fiscal data)
const SKIP_PATTERNS = [
  /^PARAGON\s*FISKALNY/i,
  /^NIP/i,
  /^nr\s*sys/i,
  /^KASA/i,
  /^KASJER/i,
  /^SPRZEDA/i,
  /^ZMIANA/i,
  /^\*{3,}/,
  /^-{3,}/,
  /^={3,}/,
  /^PTU/i,
  /^STAWKA/i,
  /^NETTO/i,
  /^BRUTTO/i,
  /^RESZTA/i,
  /^GOTÓWKA/i,
  /^GOT[OÓ]WKA/i,
  /^KARTA/i,
  /^PŁATNOŚĆ/i,
  /^P[ŁL]ATNO[SŚ][CĆ]/i,
  /^WYDANO/i,
  /^BLIK/i,
  /^TERMINAL/i,
  /^NUMER\s*TRANS/i,
  /^#\d+/,
  /^DZIĘKUJEMY/i,
  /^DZI[EĘ]KUJEMY/i,
  /^ZAPRASZAMY/i,
  /^\s*$/,
];

// Date patterns
const DATE_PATTERNS = [
  /(\d{2})[-./](\d{2})[-./](\d{4})/,
  /(\d{4})[-./](\d{2})[-./](\d{2})/,
];

function parsePrice(str: string): number {
  const match = str.match(PRICE_PATTERN);
  if (!match) return 0;
  return parseFloat(`${match[1]}.${match[2]}`);
}

function findAllPrices(line: string): number[] {
  const prices: number[] = [];
  const regex = /(\d+)[.,](\d{2})/g;
  let m;
  while ((m = regex.exec(line)) !== null) {
    prices.push(parseFloat(`${m[1]}.${m[2]}`));
  }
  return prices;
}

export class PolishReceiptParser {
  parse(ocrText: string): ParsedReceipt {
    const lines = ocrText.split('\n').map(l => l.trim());
    const items: ParsedReceiptItem[] = [];
    let storeName: string | undefined;
    let date: string | undefined;
    let total: number | undefined;

    // Extract date
    for (const line of lines) {
      for (const dp of DATE_PATTERNS) {
        const m = line.match(dp);
        if (m) {
          if (m[1].length === 4) {
            // YYYY-MM-DD
            date = `${m[1]}-${m[2]}-${m[3]}`;
          } else {
            // DD-MM-YYYY -> YYYY-MM-DD
            date = `${m[3]}-${m[2]}-${m[1]}`;
          }
          break;
        }
      }
      if (date) break;
    }

    // Extract store name: first non-empty line before "PARAGON FISKALNY" or first meaningful line
    const paragonIdx = lines.findIndex(l => /PARAGON\s*FISKALNY/i.test(l));
    if (paragonIdx > 0) {
      // Lines before "PARAGON FISKALNY" that are non-empty
      const headerLines = lines.slice(0, paragonIdx).filter(l => l.length > 1);
      if (headerLines.length > 0) {
        storeName = headerLines[0];
      }
    } else if (lines.length > 0 && lines[0].length > 1) {
      storeName = lines[0];
    }

    // Parse items and total
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip known non-product lines
      if (SKIP_PATTERNS.some(p => p.test(line))) continue;

      // Check for total
      if (TOTAL_PATTERNS.some(p => p.test(line))) {
        const prices = findAllPrices(line);
        if (prices.length > 0) {
          total = prices[prices.length - 1];
        }
        continue;
      }

      // Check for discount line — attach to previous item
      if (DISCOUNT_PATTERNS.some(p => p.test(line))) {
        const prices = findAllPrices(line);
        if (prices.length > 0 && items.length > 0) {
          const lastItem = items[items.length - 1];
          const discountAmount = prices[prices.length - 1];
          lastItem.discount = discountAmount;
          lastItem.originalPrice = Math.round((lastItem.price + discountAmount) * 100) / 100;
        }
        continue;
      }

      // Try to parse as product line
      const item = this.parseProductLine(line, lines[i + 1]);
      if (item) {
        items.push(item);
        // If the next line was a quantity line, skip it
        if (i + 1 < lines.length && QTY_LINE_PATTERN.test(lines[i + 1])) {
          i++;
        }
      }
    }

    return {
      storeName,
      date,
      items,
      total,
      currency: 'PLN',
    };
  }

  private parseProductLine(line: string, nextLine?: string): ParsedReceiptItem | null {
    // Remove tax marker from end
    const cleanLine = line.replace(TAX_MARKER, '').trim();
    if (!cleanLine) return null;

    const prices = findAllPrices(cleanLine);
    if (prices.length === 0) {
      // No price on this line — might be a name-only line with qty on next line
      if (nextLine) {
        const qtyMatch = nextLine.match(QTY_LINE_PATTERN);
        if (qtyMatch) {
          const qty = parseFloat(qtyMatch[1].replace(',', '.'));
          const unit = qtyMatch[2]?.toLowerCase();
          const unitPrice = parseFloat(qtyMatch[3].replace(',', '.'));
          const totalPrice = Math.round(qty * unitPrice * 100) / 100;
          return {
            name: cleanLine,
            quantity: qty,
            unit: unit || undefined,
            price: totalPrice,
          };
        }
      }
      return null;
    }

    // Check if this line has a quantity pattern embedded
    const qtyMatch = cleanLine.match(QTY_LINE_PATTERN);
    if (qtyMatch) {
      // Extract name: everything before the quantity
      const qtyIdx = cleanLine.indexOf(qtyMatch[0]);
      let name = cleanLine.substring(0, qtyIdx).trim();
      if (!name) {
        // Name might be on the line itself without clear separator
        name = cleanLine.replace(qtyMatch[0], '').trim();
        // Remove trailing price
        name = name.replace(/\s+\d+[.,]\d{2}\s*$/, '').trim();
      }
      if (!name) return null;

      const qty = parseFloat(qtyMatch[1].replace(',', '.'));
      const unit = qtyMatch[2]?.toLowerCase();
      // The total price is the last price on the line
      const totalPrice = prices[prices.length - 1];

      return {
        name,
        quantity: qty,
        unit: unit || undefined,
        price: totalPrice,
      };
    }

    // Simple format: "NAME  PRICE"
    // The price is the last number on the line
    const totalPrice = prices[prices.length - 1];
    // Name is everything before the last price occurrence
    const lastPriceMatch = cleanLine.match(/(\d+[.,]\d{2})\s*$/);
    if (!lastPriceMatch) return null;

    const priceIdx = cleanLine.lastIndexOf(lastPriceMatch[1]);
    let name = cleanLine.substring(0, priceIdx).trim();

    // If there are multiple prices, the first might be quantity-related
    if (prices.length >= 2 && name) {
      // Remove any trailing price from the name
      name = name.replace(/\s+\d+[.,]\d{2}\s*$/, '').trim();
    }

    if (!name || name.length < 2) return null;

    // Check if the name looks like a non-product line (too many digits, etc.)
    if (/^\d{5,}/.test(name)) return null;

    return {
      name,
      quantity: 1,
      price: totalPrice,
    };
  }
}
