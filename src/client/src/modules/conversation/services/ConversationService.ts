/**
 * ConversationService - zarządzanie konfiguracją konwersacji i scenariuszami
 */

import { mqttClient } from '../../mqttclient';
import {
  ConversationConfig,
  ConversationScenario,
  DEFAULT_CONVERSATION_CONFIG,
} from '../models/ConversationModels';

const CONFIG_PATH = 'data/conversation_config.json';

export class ConversationService {
  private config: ConversationConfig = { ...DEFAULT_CONVERSATION_CONFIG };
  private _isLoaded = false;
  private _isLoading = false;

  get loaded(): boolean {
    return this._isLoaded;
  }

  async loadConfig(): Promise<ConversationConfig> {
    if (this._isLoading) {
      while (this._isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.config;
    }

    this._isLoading = true;
    try {
      const file = await mqttClient.readFile(CONFIG_PATH);
      if (file?.content) {
        const data = JSON.parse(file.content) as ConversationConfig;
        this.config = {
          ...DEFAULT_CONVERSATION_CONFIG,
          ...data,
          scenarios: data.scenarios?.length ? data.scenarios : DEFAULT_CONVERSATION_CONFIG.scenarios,
        };
      }
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    } catch (err) {
      console.error('Failed to load conversation_config.json:', err);
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    }
  }

  async saveConfig(config: ConversationConfig): Promise<boolean> {
    this.config = config;
    try {
      await mqttClient.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save conversation_config.json:', err);
      return false;
    }
  }

  getConfig(): ConversationConfig {
    return this.config;
  }

  getActiveScenario(): ConversationScenario {
    const id = this.config.activeScenarioId;
    if (id) {
      const scenario = this.config.scenarios.find(s => s.id === id);
      if (scenario) return scenario;
    }
    return this.config.scenarios[0] || DEFAULT_CONVERSATION_CONFIG.scenarios[0];
  }

  setActiveScenario(id: string): void {
    this.config.activeScenarioId = id;
  }
}

export const conversationService = new ConversationService();
