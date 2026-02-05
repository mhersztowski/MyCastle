/**
 * AI Provider - interfejs abstrakcji providera
 */

import { AiChatRequest, AiChatResponse, AiProviderConfig } from '../models/AiModels';

export interface AiProvider {
  chat(request: AiChatRequest, config: AiProviderConfig): Promise<AiChatResponse>;
}
