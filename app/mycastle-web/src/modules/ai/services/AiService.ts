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

/** Iteruje po liniach `data:` ze strumienia SSE odpowiedzi fetch. */
async function* sseData(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

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

    const providerType = request.provider || this.config.provider;
    const providerConfig = this.config.providers[providerType];
    const provider = createProvider(providerType);

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

  /**
   * Streaming chat — wywołuje onDelta(fragment) w miarę spływania tokenów,
   * zwraca pełną odpowiedź. Obsługuje OpenAI i Anthropic (SSE). Dla pozostałych
   * providerów robi fallback do zwykłego chat() i emituje całość jednorazowo.
   *
   * Uproszczone: obsługuje wiadomości z treścią tekstową (bez narzędzi/multimodal).
   */
  async chatStream(request: AiChatRequest, onDelta: (text: string) => void): Promise<AiChatResponse> {
    if (!this._isLoaded) await this.loadConfig();

    const providerType = request.provider || this.config.provider;
    const cfg = this.config.providers[providerType];
    const model = request.model || cfg.defaultModel;
    const temperature = request.temperature ?? this.config.defaults.temperature;
    const maxTokens = request.maxTokens ?? this.config.defaults.maxTokens;
    const asText = (c: unknown) => (typeof c === 'string' ? c : JSON.stringify(c));

    // Providery bez streamingu → fallback
    if (providerType === 'ollama') {
      const res = await this.chat(request);
      onDelta(res.content);
      return res;
    }

    if (providerType === 'anthropic') {
      const systemParts = request.messages.filter(m => m.role === 'system').map(m => asText(m.content));
      const msgs = request.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: asText(m.content) }));
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        messages: msgs,
        stream: true,
      };
      if (systemParts.length) body.system = systemParts.join('\n\n');
      const response = await fetch(`${cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`);
      }
      let content = '';
      for await (const data of sseData(response)) {
        if (data === '[DONE]') break;
        try {
          const ev = JSON.parse(data);
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
            content += ev.delta.text;
            onDelta(ev.delta.text);
          }
        } catch { /* pomiń niekompletną linię */ }
      }
      return { content, model };
    }

    // OpenAI-compatible (openai / custom)
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map(m => ({ role: m.role, content: asText(m.content) })),
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`);
    }
    let content = '';
    for await (const data of sseData(response)) {
      if (data === '[DONE]') break;
      try {
        const ev = JSON.parse(data);
        const delta = ev.choices?.[0]?.delta?.content;
        if (delta) { content += delta; onDelta(delta); }
      } catch { /* pomiń niekompletną linię */ }
    }
    return { content, model };
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
