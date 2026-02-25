import { describe, it, expect, beforeEach } from 'vitest';
import { PolishReceiptParser } from './PolishReceiptParser';

let parser: PolishReceiptParser;

beforeEach(() => {
  parser = new PolishReceiptParser();
});

describe('PolishReceiptParser', () => {
  describe('date extraction', () => {
    it('parses DD-MM-YYYY format', () => {
      const result = parser.parse('Sklep ABC\n15-03-2024\nMLEKO 3,49 A');
      expect(result.date).toBe('2024-03-15');
    });

    it('parses DD.MM.YYYY format', () => {
      const result = parser.parse('Sklep ABC\n15.03.2024\nMLEKO 3,49 A');
      expect(result.date).toBe('2024-03-15');
    });

    it('parses DD/MM/YYYY format', () => {
      const result = parser.parse('Sklep ABC\n15/03/2024\nMLEKO 3,49 A');
      expect(result.date).toBe('2024-03-15');
    });

    it('parses YYYY-MM-DD format', () => {
      const result = parser.parse('Sklep ABC\n2024-03-15\nMLEKO 3,49 A');
      expect(result.date).toBe('2024-03-15');
    });

    it('returns undefined when no date found', () => {
      const result = parser.parse('Sklep ABC\nMLEKO 3,49 A');
      expect(result.date).toBeUndefined();
    });

    it('takes the first date found in the receipt', () => {
      const result = parser.parse('Data: 01-06-2024\nWydano: 02-06-2024');
      expect(result.date).toBe('2024-06-01');
    });
  });

  describe('store name extraction', () => {
    it('extracts store name before PARAGON FISKALNY', () => {
      const result = parser.parse('Biedronka\nul. Testowa 1\nPARAGON FISKALNY\nMLEKO 3,49 A');
      expect(result.storeName).toBe('Biedronka');
    });

    it('falls back to first line when no PARAGON FISKALNY', () => {
      const result = parser.parse('Lidl\nMLEKO 3,49 A');
      expect(result.storeName).toBe('Lidl');
    });

    it('skips empty lines before PARAGON FISKALNY', () => {
      const result = parser.parse('\nZabka\nPARAGON FISKALNY\nMLEKO 3,49 A');
      expect(result.storeName).toBe('Zabka');
    });

    it('returns undefined when first line is too short', () => {
      const result = parser.parse('\nMLEKO 3,49 A');
      expect(result.storeName).toBeUndefined();
    });
  });

  describe('simple product line parsing', () => {
    it('parses "NAME PRICE" format', () => {
      const result = parser.parse('MLEKO 3,49 A');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        name: 'MLEKO',
        quantity: 1,
        price: 3.49,
      });
    });

    it('parses product with multi-word name', () => {
      const result = parser.parse('SER ZOLTY GOUDA 12,99 A');
      expect(result.items[0].name).toBe('SER ZOLTY GOUDA');
      expect(result.items[0].price).toBe(12.99);
    });

    it('strips tax marker from line', () => {
      const result = parser.parse('CHLEB 4,29 B');
      expect(result.items[0]).toEqual({
        name: 'CHLEB',
        quantity: 1,
        price: 4.29,
      });
    });

    it('rejects lines with no price', () => {
      const result = parser.parse('SOME HEADER TEXT');
      expect(result.items).toHaveLength(0);
    });

    it('rejects names shorter than 2 characters', () => {
      const result = parser.parse('A 3,49');
      expect(result.items).toHaveLength(0);
    });

    it('rejects digit-only names (barcodes)', () => {
      const result = parser.parse('5900000000123 3,49');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('quantity format parsing', () => {
    it('parses "QTY x UNIT_PRICE TOTAL" on a single line', () => {
      const result = parser.parse('BANANY 2 x 3,49 6,98 A');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        name: 'BANANY',
        quantity: 2,
        unit: undefined,
        price: 6.98,
      });
    });

    it('parses quantity with szt unit', () => {
      const result = parser.parse('JOGURT 3 szt x 2,50 7,50 A');
      expect(result.items[0].quantity).toBe(3);
      expect(result.items[0].unit).toBe('szt');
      expect(result.items[0].price).toBe(7.50);
    });

    it('parses quantity with kg unit (decimal qty)', () => {
      const result = parser.parse('JABLKA 0,450 kg x 8,99 4,05 A');
      expect(result.items[0].quantity).toBeCloseTo(0.45);
      expect(result.items[0].unit).toBe('kg');
      expect(result.items[0].price).toBe(4.05);
    });

    it('parses quantity with * as multiply operator', () => {
      const result = parser.parse('WODA 2 * 1,99 3,98 A');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].price).toBe(3.98);
    });
  });

  describe('multiline name + quantity parsing', () => {
    it('parses name on line 1 and quantity on line 2', () => {
      const text = 'POMIDORY MALINOWE\n0,450 kg x 8,99 4,05 A';
      const result = parser.parse(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        name: 'POMIDORY MALINOWE',
        quantity: 0.45,
        unit: 'kg',
        price: 4.05,
      });
    });

    it('skips the consumed quantity line', () => {
      const text = 'POMIDORY MALINOWE\n0,450 kg x 8,99 4,05 A\nCHLEB 4,29 B';
      const result = parser.parse(text);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].name).toBe('POMIDORY MALINOWE');
      expect(result.items[1].name).toBe('CHLEB');
    });
  });

  describe('discount handling', () => {
    it('attaches RABAT to previous item', () => {
      const text = 'MLEKO 3,49 A\nRABAT -0,50';
      const result = parser.parse(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].discount).toBe(0.50);
      expect(result.items[0].originalPrice).toBe(3.99);
      expect(result.items[0].price).toBe(3.49);
    });

    it('attaches OPUST to previous item', () => {
      const text = 'CHLEB 4,29 B\nOPUST -1,00';
      const result = parser.parse(text);
      expect(result.items[0].discount).toBe(1.00);
      expect(result.items[0].originalPrice).toBe(5.29);
    });

    it('handles discount starting with minus sign', () => {
      const text = 'JOGURT 2,99 A\n-0,30';
      const result = parser.parse(text);
      expect(result.items[0].discount).toBe(0.30);
      expect(result.items[0].originalPrice).toBe(3.29);
    });

    it('ignores discount when there is no previous item', () => {
      const text = 'RABAT -0,50\nMLEKO 3,49 A';
      const result = parser.parse(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].discount).toBeUndefined();
    });
  });

  describe('total extraction', () => {
    it('extracts SUMA total', () => {
      const result = parser.parse('MLEKO 3,49 A\nSUMA 3,49');
      expect(result.total).toBe(3.49);
    });

    it('extracts RAZEM total', () => {
      const result = parser.parse('MLEKO 3,49 A\nRAZEM 3,49');
      expect(result.total).toBe(3.49);
    });

    it('extracts DO ZAPLATY total', () => {
      const result = parser.parse('MLEKO 3,49 A\nDO ZAPŁATY 3,49');
      expect(result.total).toBe(3.49);
    });

    it('extracts SUMA PLN total', () => {
      const result = parser.parse('MLEKO 3,49 A\nSUMA PLN 3,49');
      expect(result.total).toBe(3.49);
    });

    it('returns undefined when no total found', () => {
      const result = parser.parse('MLEKO 3,49 A');
      expect(result.total).toBeUndefined();
    });
  });

  describe('skip patterns', () => {
    it('skips NIP line', () => {
      const result = parser.parse('NIP 123-456-78-90\nMLEKO 3,49 A');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('MLEKO');
    });

    it('skips KASJER line', () => {
      const result = parser.parse('KASJER: Jan Kowalski\nMLEKO 3,49 A');
      expect(result.items).toHaveLength(1);
    });

    it('skips separator lines', () => {
      const result = parser.parse('***********\n-----------\n===========\nMLEKO 3,49 A');
      expect(result.items).toHaveLength(1);
    });

    it('skips GOTOWKA and KARTA lines', () => {
      const result = parser.parse('MLEKO 3,49 A\nGOTÓWKA 3,49\nKARTA 3,49');
      expect(result.items).toHaveLength(1);
    });

    it('skips empty lines', () => {
      const result = parser.parse('MLEKO 3,49 A\n\n   \nCHLEB 4,29 B');
      expect(result.items).toHaveLength(2);
    });
  });

  describe('currency', () => {
    it('always returns PLN', () => {
      const result = parser.parse('MLEKO 3,49');
      expect(result.currency).toBe('PLN');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = parser.parse('');
      expect(result.items).toHaveLength(0);
      expect(result.storeName).toBeUndefined();
      expect(result.date).toBeUndefined();
      expect(result.total).toBeUndefined();
      expect(result.currency).toBe('PLN');
    });

    it('handles receipt with only headers and no products', () => {
      const text = [
        'Biedronka',
        'PARAGON FISKALNY',
        'NIP 123-456-78-90',
        '15-03-2024',
        'KASJER: Anna',
      ].join('\n');
      const result = parser.parse(text);
      expect(result.storeName).toBe('Biedronka');
      expect(result.date).toBe('2024-03-15');
      expect(result.items).toHaveLength(0);
      expect(result.total).toBeUndefined();
    });
  });

  describe('full receipt integration', () => {
    it('parses a realistic Biedronka receipt', () => {
      const receipt = [
        'Biedronka',
        'ul. Przykladowa 15',
        'PARAGON FISKALNY',
        'NIP 527-10-11-529',
        '15-03-2024 12:34',
        'KASJER: 012 Anna',
        '-------------------------------',
        'MLEKO 2% 1L 3,49 A',
        'CHLEB RAZOWY 4,29 B',
        'RABAT -0,50',
        'BANANY',
        '0,450 kg x 8,99 4,05 A',
        'JOGURT NATURALNY 2 szt x 2,50 5,00 A',
        'SER GOUDA 12,99 A',
        '-------------------------------',
        'SUMA PLN 29,32',
        'GOTÓWKA 30,00',
        'RESZTA 0,68',
        'DZIĘKUJEMY ZA ZAKUPY',
      ].join('\n');

      const result = parser.parse(receipt);

      expect(result.storeName).toBe('Biedronka');
      expect(result.date).toBe('2024-03-15');
      expect(result.currency).toBe('PLN');
      expect(result.total).toBe(29.32);

      expect(result.items).toHaveLength(5);

      // Simple item
      expect(result.items[0]).toEqual({
        name: 'MLEKO 2% 1L',
        quantity: 1,
        price: 3.49,
      });

      // Item with discount
      expect(result.items[1].name).toBe('CHLEB RAZOWY');
      expect(result.items[1].price).toBe(4.29);
      expect(result.items[1].discount).toBe(0.50);
      expect(result.items[1].originalPrice).toBe(4.79);

      // Multiline: name + qty line
      expect(result.items[2].name).toBe('BANANY');
      expect(result.items[2].quantity).toBeCloseTo(0.45);
      expect(result.items[2].unit).toBe('kg');
      expect(result.items[2].price).toBe(4.05);

      // Inline quantity with unit
      expect(result.items[3].name).toBe('JOGURT NATURALNY');
      expect(result.items[3].quantity).toBe(2);
      expect(result.items[3].unit).toBe('szt');
      expect(result.items[3].price).toBe(5.00);

      // Simple item
      expect(result.items[4]).toEqual({
        name: 'SER GOUDA',
        quantity: 1,
        price: 12.99,
      });
    });
  });
});
