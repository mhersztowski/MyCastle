/**
 * AI module - interfejsy modeli danych
 */

export type AiProviderType = 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}

export interface AiDefaults {
  temperature: number;
  maxTokens: number;
}

export interface AiConfigModel {
  type: 'ai_config';
  provider: AiProviderType;
  providers: Record<AiProviderType, AiProviderConfig>;
  defaults: AiDefaults;
}

export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ===== MULTIMODAL CONTENT =====

export interface AiTextContentBlock {
  type: 'text';
  text: string;
}

export interface AiImageContentBlock {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type AiContentBlock = AiTextContentBlock | AiImageContentBlock;
export type AiMessageContent = string | AiContentBlock[];

export function getTextContent(content: AiMessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b): b is AiTextContentBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// ===== MESSAGES =====

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: AiMessageContent;
  tool_calls?: AiToolCall[];
  tool_call_id?: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: AiToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
}

export interface AiChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  toolCalls?: AiToolCall[];
}

export const DEFAULT_AI_CONFIG: AiConfigModel = {
  type: 'ai_config',
  provider: 'openai',
  providers: {
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
    },
    anthropic: {
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-sonnet-4-20250514',
    },
    ollama: {
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3',
    },
    custom: {
      apiKey: '',
      baseUrl: '',
      defaultModel: '',
    },
  },
  defaults: {
    temperature: 0.7,
    maxTokens: 2048,
  },
};
