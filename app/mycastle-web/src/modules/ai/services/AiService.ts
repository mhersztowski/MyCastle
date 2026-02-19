/**
 * AI Service - zarzadzanie konfiguracją i wywolaniami AI
 * Wzorzec jak AutomateService/UIFormService
 */

import { mqttClient } from '../../mqttclient';
import {
  AiConfigModel,
  AiChatRequest,
  AiChatResponse,
  AiProviderType,
  AiProviderConfig,
  DEFAULT_AI_CONFIG,
} from '../models/AiModels';
import { AiProvider } from '../providers/AiProvider';
import { OpenAiProvider } from '../providers/OpenAiProvider';
import { AnthropicProvider } from '../providers/AnthropicProvider';
import { OllamaProvider } from '../providers/OllamaProvider';

const AI_CONFIG_PATH = 'data/ai_config.json';

function createProvider(providerType: AiProviderType): AiProvider {
  switch (providerType) {
    case 'openai':
      return new OpenAiProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'custom':
      return new OpenAiProvider();
  }
}

export class AiService {
  private config: AiConfigModel = { ...DEFAULT_AI_CONFIG };
  private _isLoaded = false;
  private _isLoading = false;

  get loaded(): boolean {
    return this._isLoaded;
  }

  async loadConfig(): Promise<AiConfigModel> {
    if (this._isLoading) {
      while (this._isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.config;
    }

    this._isLoading = true;
    try {
      const file = await mqttClient.readFile(AI_CONFIG_PATH);
      if (file?.content) {
        const data = JSON.parse(file.content) as AiConfigModel;
        this.config = { ...DEFAULT_AI_CONFIG, ...data, providers: { ...DEFAULT_AI_CONFIG.providers, ...data.providers } };
      }
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    } catch (err) {
      console.error('Failed to load ai_config.json:', err);
      this._isLoaded = true;
      this._isLoading = false;
      return this.config;
    }
  }

  async saveConfig(config: AiConfigModel): Promise<boolean> {
    this.config = config;
    try {
      await mqttClient.writeFile(AI_CONFIG_PATH, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save ai_config.json:', err);
      return false;
    }
  }

  getConfig(): AiConfigModel {
    return this.config;
  }

  getActiveProviderConfig(): AiProviderConfig {
    return this.config.providers[this.config.provider];
  }

  isConfigured(): boolean {
    const providerConfig = this.getActiveProviderConfig();
    if (this.config.provider === 'ollama') {
      return !!providerConfig.baseUrl;
    }
    return !!providerConfig.apiKey;
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    if (!this._isLoaded) {
      await this.loadConfig();
    }

    const providerConfig = this.getActiveProviderConfig();
    const provider = createProvider(this.config.provider);

    const mergedRequest: AiChatRequest = {
      messages: request.messages,
      model: request.model || providerConfig.defaultModel,
      temperature: request.temperature ?? this.config.defaults.temperature,
      maxTokens: request.maxTokens ?? this.config.defaults.maxTokens,
      tools: request.tools,
      tool_choice: request.tool_choice,
    };

    return provider.chat(mergedRequest, providerConfig);
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.chat({
        messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
        maxTokens: 10,
      });
      return { success: true, message: `Response: "${response.content}" (model: ${response.model})` };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const aiService = new AiService();
