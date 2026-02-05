/**
 * ConversationEngine - silnik konwersacji z tool calling loop
 */

import { v4 as uuidv4 } from 'uuid';
import { aiService } from '../../ai';
import { AiChatMessage, AiToolCall } from '../../ai/models/AiModels';
import { DataSource } from '../../filesystem/data/DataSource';
import { actionRegistry } from '../actions/ActionRegistry';
import {
  ConversationConfig,
  ConversationMessage,
  ConversationScenario,
  ConversationEngineCallbacks,
  ContextInjector,
} from '../models/ConversationModels';

export class ConversationEngine {
  private config: ConversationConfig;
  private scenario: ConversationScenario;
  private history: ConversationMessage[] = [];
  private callbacks: ConversationEngineCallbacks;
  private dataSource: DataSource;

  constructor(
    config: ConversationConfig,
    scenario: ConversationScenario,
    callbacks: ConversationEngineCallbacks,
    dataSource: DataSource,
  ) {
    this.config = config;
    this.scenario = scenario;
    this.callbacks = callbacks;
    this.dataSource = dataSource;
  }

  async process(userMessage: string): Promise<ConversationMessage[]> {
    const newMessages: ConversationMessage[] = [];

    // 1. User message
    const userMsg = this.createMessage('user', userMessage);
    this.history.push(userMsg);
    newMessages.push(userMsg);
    this.callbacks.onMessage?.(userMsg);

    // 2. Build AI request
    const systemPrompt = this.buildSystemPrompt();
    const tools = actionRegistry.toToolDefinitions(this.scenario.enabledCategories);
    const messages = this.buildAiMessages(systemPrompt);

    let iteration = 0;
    let currentMessages = messages;

    // 3. Tool calling loop
    while (iteration < this.config.maxToolCallsPerTurn) {
      iteration++;

      const response = await aiService.chat({
        messages: currentMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: this.scenario.temperature,
      });

      if (response.toolCalls?.length) {
        // Assistant wants to call tools
        const assistantMsg = this.createMessage('assistant', response.content || '');
        assistantMsg.toolCalls = response.toolCalls;
        this.history.push(assistantMsg);
        newMessages.push(assistantMsg);
        this.callbacks.onMessage?.(assistantMsg);

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
          const toolResult = await this.executeToolCall(toolCall);
          const toolMsg = this.createMessage('tool', toolResult);
          toolMsg.toolCallId = toolCall.id;
          toolMsg.toolName = toolCall.function.name;
          this.history.push(toolMsg);
          newMessages.push(toolMsg);
          this.callbacks.onMessage?.(toolMsg);
        }

        // Rebuild messages for next iteration
        currentMessages = this.buildAiMessages(systemPrompt);
      } else {
        // Final text response
        const assistantMsg = this.createMessage('assistant', response.content);
        this.history.push(assistantMsg);
        newMessages.push(assistantMsg);
        this.callbacks.onMessage?.(assistantMsg);
        break;
      }
    }

    // Trim history to limit
    this.trimHistory();

    return newMessages;
  }

  private async executeToolCall(toolCall: AiToolCall): Promise<string> {
    this.callbacks.onToolCallStart?.(toolCall);

    try {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        parsedArgs = {};
      }

      // Check if confirmation is required
      const action = actionRegistry.get(toolCall.function.name);
      const needsConfirmation = action?.confirmation || this.config.requireConfirmation;

      if (needsConfirmation && this.callbacks.onConfirmationRequired) {
        const confirmed = await this.callbacks.onConfirmationRequired(toolCall, parsedArgs);
        if (!confirmed) {
          const result = JSON.stringify({ rejected: true, reason: 'Użytkownik odrzucił akcję' });
          this.callbacks.onToolCallError?.(toolCall, 'rejected');
          return result;
        }
      }

      const result = await actionRegistry.execute(toolCall.function.name, parsedArgs);
      const resultStr = JSON.stringify(result);
      this.callbacks.onToolCallComplete?.(toolCall, result);
      return resultStr;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.callbacks.onToolCallError?.(toolCall, errorMsg);
      return JSON.stringify({ error: errorMsg });
    }
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [this.scenario.systemPrompt];

    if (this.scenario.contextInjectors?.length) {
      const context = this.buildContextInjections(this.scenario.contextInjectors);
      if (context) {
        parts.push('\n--- Aktualny kontekst systemu ---');
        parts.push(context);
      }
    }

    return parts.join('\n');
  }

  private buildContextInjections(injectors: ContextInjector[]): string {
    const parts: string[] = [];

    for (const inj of injectors) {
      switch (inj.type) {
        case 'tasks_summary': {
          const tasks = this.dataSource.tasks.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            projectId: t.projectId,
          }));
          parts.push(`Taski użytkownika (${tasks.length}): ${JSON.stringify(tasks)}`);
          break;
        }
        case 'events_today': {
          const events = this.dataSource.getEventsByDate(new Date());
          const mapped = events.map(e => ({
            name: e.name,
            startTime: e.startTime,
            endTime: e.endTime,
            taskId: e.taskId,
          }));
          parts.push(`Dzisiejsze eventy (${mapped.length}): ${JSON.stringify(mapped)}`);
          break;
        }
        case 'projects_summary': {
          const projects = this.dataSource.projects.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
          }));
          parts.push(`Projekty (${projects.length}): ${JSON.stringify(projects)}`);
          break;
        }
        case 'custom':
          if (inj.customPrompt) parts.push(inj.customPrompt);
          break;
      }
    }

    return parts.join('\n');
  }

  private buildAiMessages(systemPrompt: string): AiChatMessage[] {
    const messages: AiChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Take last N messages from history
    const historySlice = this.history.slice(-this.config.historyLimit);

    for (const msg of historySlice) {
      const aiMsg: AiChatMessage = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.toolCalls) aiMsg.tool_calls = msg.toolCalls;
      if (msg.toolCallId) aiMsg.tool_call_id = msg.toolCallId;
      messages.push(aiMsg);
    }

    return messages;
  }

  private createMessage(role: 'user' | 'assistant' | 'tool', content: string): ConversationMessage {
    return {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
    };
  }

  private trimHistory(): void {
    if (this.history.length > this.config.historyLimit * 2) {
      this.history = this.history.slice(-this.config.historyLimit);
    }
  }

  loadHistory(messages: ConversationMessage[]): void {
    this.history = [...messages];
  }

  clearHistory(): void {
    this.history = [];
  }

  getHistory(): ConversationMessage[] {
    return [...this.history];
  }
}
