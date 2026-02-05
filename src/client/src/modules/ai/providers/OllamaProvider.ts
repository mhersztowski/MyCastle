/**
 * Ollama provider (lokalne modele)
 */

import { AiChatRequest, AiChatResponse, AiProviderConfig } from '../models/AiModels';
import { AiProvider } from './AiProvider';

export class OllamaProvider implements AiProvider {
  async chat(request: AiChatRequest, config: AiProviderConfig): Promise<AiChatResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      model: request.model || config.defaultModel,
      messages: request.messages.map(m => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg: Record<string, any> = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      stream: false,
      options: {
        temperature: request.temperature,
        num_predict: request.maxTokens,
      },
    };

    if (request.tools?.length) {
      body.tools = request.tools;
    }

    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || '',
      model: data.model || request.model || config.defaultModel,
      usage: data.prompt_eval_count ? {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      } : undefined,
      finishReason: data.done ? 'stop' : undefined,
      toolCalls: data.message?.tool_calls || undefined,
    };
  }
}
