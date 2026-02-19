/**
 * Models for receipt scanning data
 */

export interface ReceiptItem {
  name: string;
  quantity?: number;
  unit?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  category?: string;
}

export interface ReceiptData {
  storeName?: string;
  date?: string;
  items: ReceiptItem[];
  total?: number;
  currency?: string;
}

export type ReceiptScanStatus = 'idle' | 'preprocessing' | 'scanning' | 'parsed' | 'error';
