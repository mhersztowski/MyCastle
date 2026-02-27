/**
 * Agent engine — agentic tool-calling loop over VFS.
 */

import type { FileSystemProvider } from '@mhersztowski/core';
import type { AiProvider, AiProviderConfig, AiChatMessage, AgentMessage } from '../types';
import { buildVfsToolDefinitions } from '../tools/vfsTools';
import { executeVfsTool } from '../tools/toolExecutor';

export interface AgentEngineCallbacks {
  onMessage: (message: AgentMessage) => void;
  onProcessingChange: (processing: boolean) => void;
}

export class AgentEngine {
  private history: AgentMessage[] = [];
  private nextId = 1;
  private allAffectedFiles = new Set<string>();

  private aiProvider: AiProvider;
  private config: AiProviderConfig;
  private maxIterations: number;
  private temperature: number;
  private maxTokens: number;

  constructor(
    private provider: FileSystemProvider,
    private callbacks: AgentEngineCallbacks,
    aiProvider: AiProvider,
    config: AiProviderConfig,
    maxIterations = 15,
    temperature = 0.2,
    maxTokens = 4096,
  ) {
    this.aiProvider = aiProvider;
    this.config = config;
    this.maxIterations = maxIterations;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
  }

  updateConfig(
    aiProvider: AiProvider,
    config: AiProviderConfig,
    maxIterations?: number,
    temperature?: number,
    maxTokens?: number,
  ): void {
    this.aiProvider = aiProvider;
    this.config = config;
    if (maxIterations !== undefined) this.maxIterations = maxIterations;
    if (temperature !== undefined) this.temperature = temperature;
    if (maxTokens !== undefined) this.maxTokens = maxTokens;
  }

  async process(userMessage: string): Promise<void> {
    this.callbacks.onProcessingChange(true);
    try {
      const userMsg = this.createMessage('user', userMessage);
      this.history.push(userMsg);
      this.callbacks.onMessage(userMsg);

      const tools = buildVfsToolDefinitions(this.provider);
      const systemPrompt = this.buildSystemPrompt();

      let iteration = 0;
      while (iteration < this.maxIterations) {
        iteration++;
        const messages = this.buildAiMessages(systemPrompt);

        const response = await this.aiProvider.chat({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
        }, this.config);

        if (response.toolCalls?.length) {
          // Assistant wants to use tools
          const assistantMsg = this.createMessage('assistant', response.content || '');
          assistantMsg.toolCalls = response.toolCalls;
          this.history.push(assistantMsg);
          this.callbacks.onMessage(assistantMsg);

          for (const toolCall of response.toolCalls) {
            const { result, affectedFiles } = await executeVfsTool(toolCall, this.provider);
            for (const f of affectedFiles) this.allAffectedFiles.add(f);

            const toolMsg = this.createMessage('tool', result);
            toolMsg.toolCallId = toolCall.id;
            toolMsg.toolName = toolCall.function.name;
            toolMsg.affectedFiles = affectedFiles;
            this.history.push(toolMsg);
            this.callbacks.onMessage(toolMsg);
          }
        } else {
          // Final text response
          const assistantMsg = this.createMessage('assistant', response.content);
          assistantMsg.affectedFiles = [...this.allAffectedFiles];
          this.history.push(assistantMsg);
          this.callbacks.onMessage(assistantMsg);
          break;
        }
      }
    } finally {
      this.callbacks.onProcessingChange(false);
    }
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  getAffectedFiles(): string[] {
    return [...this.allAffectedFiles];
  }

  clearHistory(): void {
    this.history = [];
    this.allAffectedFiles.clear();
    this.nextId = 1;
  }

  private buildSystemPrompt(): string {
    const readOnly = this.provider.capabilities.readonly;
    return [
      'You are an AI coding assistant embedded in a code editor with access to a virtual file system (VFS).',
      'You can read, search, and browse files using the provided VFS tools.',
      readOnly
        ? 'The file system is READ-ONLY. You cannot create, edit, or delete files.'
        : 'You can also create, edit, and delete files using the VFS tools.',
      'When asked about code, use the VFS tools to explore and understand the codebase before answering.',
      'When making changes, explain what you are doing and why.',
      'Always respond in the same language the user uses.',
      'Be concise and precise.',
    ].join('\n');
  }

  private buildAiMessages(systemPrompt: string): AiChatMessage[] {
    const messages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }];

    const slice = this.history.slice(-50);
    for (const msg of slice) {
      const aiMsg: AiChatMessage = { role: msg.role, content: msg.content };
      if (msg.toolCalls) aiMsg.tool_calls = msg.toolCalls;
      if (msg.toolCallId) aiMsg.tool_call_id = msg.toolCallId;
      messages.push(aiMsg);
    }
    return messages;
  }

  private createMessage(role: 'user' | 'assistant' | 'tool', content: string): AgentMessage {
    return {
      id: `agent-${this.nextId++}`,
      role,
      content,
      timestamp: Date.now(),
    };
  }
}
