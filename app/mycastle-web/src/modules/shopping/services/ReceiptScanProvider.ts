/**
 * Interface for receipt scanning providers.
 */

import { ReceiptData } from '../models/ReceiptModels';

export interface ReceiptScanProvider {
  scan(imageBlobs: Blob[]): Promise<ReceiptData>;
}
