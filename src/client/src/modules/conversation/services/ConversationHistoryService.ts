/**
 * ConversationHistoryService - persystencja historii konwersacji
 */

import { mqttClient } from '../../mqttclient';
import {
  ConversationHistoryModel,
  ConversationMessage,
} from '../models/ConversationModels';

const HISTORY_PATH = 'data/conversation_history.json';

export class ConversationHistoryService {
  async loadHistory(scenarioId?: string): Promise<ConversationMessage[]> {
    try {
      const file = await mqttClient.readFile(HISTORY_PATH);
      if (!file?.content) return [];

      const data = JSON.parse(file.content) as ConversationHistoryModel;
      if (scenarioId && data.scenarioId !== scenarioId) return [];
      return data.messages || [];
    } catch {
      return [];
    }
  }

  async saveHistory(messages: ConversationMessage[], scenarioId?: string): Promise<boolean> {
    try {
      const data: ConversationHistoryModel = {
        type: 'conversation_history',
        scenarioId,
        messages,
        updatedAt: Date.now(),
      };
      await mqttClient.writeFile(HISTORY_PATH, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save conversation history:', err);
      return false;
    }
  }

  async clearHistory(scenarioId?: string): Promise<boolean> {
    return this.saveHistory([], scenarioId);
  }
}

export const conversationHistoryService = new ConversationHistoryService();
