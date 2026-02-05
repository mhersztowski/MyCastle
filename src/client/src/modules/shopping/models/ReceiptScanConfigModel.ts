/**
 * Configuration model for receipt scanning engine selection.
 */

export type ReceiptScanEngine = 'ai_vision' | 'local_ocr' | 'hybrid';

export interface ReceiptScanConfigModel {
  engine: ReceiptScanEngine;
}

export const DEFAULT_RECEIPT_SCAN_CONFIG: ReceiptScanConfigModel = {
  engine: 'ai_vision',
};

export const ENGINE_LABELS: Record<ReceiptScanEngine, string> = {
  ai_vision: 'AI Vision',
  local_ocr: 'Lokalne OCR',
  hybrid: 'Hybrydowe (OCR + AI)',
};

export const ENGINE_DESCRIPTIONS: Record<ReceiptScanEngine, string> = {
  ai_vision: 'Wysyła zdjęcie paragonu do modelu AI z obsługą obrazów (OpenAI, Anthropic, Ollama). Wymaga skonfigurowanego providera AI.',
  local_ocr: 'Rozpoznawanie tekstu lokalnie na serwerze (Tesseract.js + Sharp). Nie wymaga AI, działa offline. Mniej dokładne przy nieczytelnych paragonach.',
  hybrid: 'Rozpoznawanie tekstu na serwerze (OCR), następnie AI analizuje tekst (bez wysyłania obrazu). Tańsze niż AI Vision, lepsze niż samo OCR.',
};
