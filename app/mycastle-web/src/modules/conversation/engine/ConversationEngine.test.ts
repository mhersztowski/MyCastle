import { ConversationEngine } from './ConversationEngine';
import {
  ConversationConfig,
  ConversationScenario,
  ConversationEngineCallbacks,
  ConversationMessage,
} from '../models/ConversationModels';
import { AiChatResponse, AiToolCall } from '../../ai/models/AiModels';
import { aiService } from '../../ai';
import { actionRegistry } from '../actions/ActionRegistry';

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

vi.mock('../../ai', () => ({
  aiService: { chat: vi.fn() },
}));

vi.mock('../actions/ActionRegistry', () => ({
  actionRegistry: {
    toToolDefinitions: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    execute: vi.fn(),
  },
}));

const mockAiChat = aiService.chat as ReturnType<typeof vi.fn>;
const mockToToolDefinitions = actionRegistry.toToolDefinitions as ReturnType<typeof vi.fn>;
const mockActionGet = actionRegistry.get as ReturnType<typeof vi.fn>;
const mockActionExecute = actionRegistry.execute as ReturnType<typeof vi.fn>;

function createConfig(overrides: Partial<ConversationConfig> = {}): ConversationConfig {
  return {
    type: 'conversation_config',
    agentMode: false,
    activeScenarioId: 'test',
    scenarios: [],
    maxToolCallsPerTurn: 10,
    requireConfirmation: false,
    historyLimit: 50,
    ...overrides,
  };
}

function createScenario(overrides: Partial<ConversationScenario> = {}): ConversationScenario {
  return {
    id: 'test',
    name: 'Test Scenario',
    description: 'A test scenario',
    systemPrompt: 'You are a test assistant.',
    enabledCategories: [],
    ...overrides,
  };
}

function createMockDataSource() {
  return {
    tasks: [] as Array<{ id: string; name: string; description: string; projectId: string }>,
    projects: [] as Array<{ id: string; name: string; description: string }>,
    persons: [] as Array<{ id: string; name: string }>,
    events: [] as Array<{ name: string; startTime: string; endTime: string; taskId: string }>,
    shoppingLists: [] as Array<unknown>,
    getEventsByDate: vi.fn().mockReturnValue([]),
    getActiveShoppingLists: vi.fn().mockReturnValue([]),
  } as any;
}

function createCallbacks(overrides: Partial<ConversationEngineCallbacks> = {}): ConversationEngineCallbacks {
  return {
    onMessage: vi.fn(),
    onToolCallStart: vi.fn(),
    onToolCallComplete: vi.fn(),
    onToolCallError: vi.fn(),
    ...overrides,
  };
}

function createAiResponse(overrides: Partial<AiChatResponse> = {}): AiChatResponse {
  return {
    content: 'AI response text',
    model: 'test-model',
    ...overrides,
  };
}

function createToolCall(overrides: Partial<AiToolCall> = {}): AiToolCall {
  return {
    id: 'tc-1',
    type: 'function',
    function: {
      name: 'test_action',
      arguments: '{"param": "value"}',
    },
    ...overrides,
  };
}

describe('ConversationEngine', () => {
  let engine: ConversationEngine;
  let config: ConversationConfig;
  let scenario: ConversationScenario;
  let callbacks: ConversationEngineCallbacks;
  let dataSource: ReturnType<typeof createMockDataSource>;

  beforeEach(() => {
    vi.clearAllMocks();

    config = createConfig();
    scenario = createScenario();
    callbacks = createCallbacks();
    dataSource = createMockDataSource();

    mockToToolDefinitions.mockReturnValue([]);
    mockAiChat.mockResolvedValue(createAiResponse());

    engine = new ConversationEngine(config, scenario, callbacks, dataSource);
  });

  describe('process - basic', () => {
    it('adds user message to history', async () => {
      await engine.process('Hello');

      const history = engine.getHistory();
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
    });

    it('calls onMessage callback for user message', async () => {
      await engine.process('Hello');

      const onMessage = callbacks.onMessage as ReturnType<typeof vi.fn>;
      const firstCall = onMessage.mock.calls[0][0] as ConversationMessage;
      expect(firstCall.role).toBe('user');
      expect(firstCall.content).toBe('Hello');
    });

    it('sends messages to aiService.chat', async () => {
      await engine.process('Hello');

      expect(mockAiChat).toHaveBeenCalledTimes(1);
      const chatArg = mockAiChat.mock.calls[0][0];
      expect(chatArg.messages).toBeDefined();
      expect(chatArg.messages[0].role).toBe('system');
      expect(chatArg.messages[0].content).toContain('You are a test assistant.');
      expect(chatArg.messages[1].role).toBe('user');
      expect(chatArg.messages[1].content).toBe('Hello');
    });

    it('returns assistant text response when no tool calls', async () => {
      mockAiChat.mockResolvedValue(createAiResponse({ content: 'Hello back!' }));

      const messages = await engine.process('Hello');

      const assistantMsg = messages.find(m => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.content).toBe('Hello back!');
    });

    it('calls onMessage callback for assistant message', async () => {
      mockAiChat.mockResolvedValue(createAiResponse({ content: 'Hello back!' }));

      await engine.process('Hello');

      const onMessage = callbacks.onMessage as ReturnType<typeof vi.fn>;
      // First call: user message, second call: assistant message
      expect(onMessage).toHaveBeenCalledTimes(2);
      const secondCall = onMessage.mock.calls[1][0] as ConversationMessage;
      expect(secondCall.role).toBe('assistant');
      expect(secondCall.content).toBe('Hello back!');
    });
  });

  describe('process - tool calling loop', () => {
    const toolCall = createToolCall();

    it('executes tool calls and sends results back to AI', async () => {
      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockResolvedValue({ success: true });

      // First call returns tool call, second call returns final text
      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Done!' }));

      const messages = await engine.process('Do something');

      expect(mockActionExecute).toHaveBeenCalledWith('test_action', { param: 'value' });
      expect(mockAiChat).toHaveBeenCalledTimes(2);

      // Should contain: user, assistant (with tool calls), tool result, assistant (final)
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].toolCalls).toEqual([toolCall]);
      expect(messages[2].role).toBe('tool');
      expect(messages[2].toolCallId).toBe('tc-1');
      expect(messages[2].toolName).toBe('test_action');
      expect(messages[3].role).toBe('assistant');
      expect(messages[3].content).toBe('Done!');
    });

    it('loops when AI returns more tool calls', async () => {
      const toolCall2 = createToolCall({ id: 'tc-2', function: { name: 'another_action', arguments: '{}' } });

      mockToToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } },
        { type: 'function', function: { name: 'another_action', description: 'test2', parameters: {} } },
      ]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockResolvedValue({ ok: true });

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall2] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'All done!' }));

      const messages = await engine.process('Do two things');

      expect(mockAiChat).toHaveBeenCalledTimes(3);
      expect(mockActionExecute).toHaveBeenCalledTimes(2);

      // user, assistant+tool1, tool1_result, assistant+tool2, tool2_result, assistant_final
      expect(messages).toHaveLength(6);
      expect(messages[5].content).toBe('All done!');
    });

    it('stops looping at maxToolCallsPerTurn limit', async () => {
      config = createConfig({ maxToolCallsPerTurn: 2 });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockResolvedValue({ ok: true });

      // All iterations return tool calls (never a final text response)
      mockAiChat.mockResolvedValue(createAiResponse({ content: '', toolCalls: [toolCall] }));

      await engine.process('Infinite loop');

      // maxToolCallsPerTurn=2, each iteration calls chat once
      expect(mockAiChat).toHaveBeenCalledTimes(2);
    });

    it('calls onToolCallStart and onToolCallComplete callbacks', async () => {
      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockResolvedValue({ result: 42 });

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Done' }));

      await engine.process('Call tool');

      expect(callbacks.onToolCallStart).toHaveBeenCalledWith(toolCall);
      expect(callbacks.onToolCallComplete).toHaveBeenCalledWith(toolCall, { result: 42 });
    });
  });

  describe('process - tool errors', () => {
    const toolCall = createToolCall();

    it('calls onToolCallError on tool failure', async () => {
      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockRejectedValue(new Error('Something went wrong'));

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Error handled' }));

      await engine.process('Fail please');

      expect(callbacks.onToolCallError).toHaveBeenCalledWith(toolCall, 'Something went wrong');
    });

    it('returns JSON error to AI on tool failure', async () => {
      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockRejectedValue(new Error('DB connection lost'));

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Handled' }));

      const messages = await engine.process('Do it');

      const toolMsg = messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      const parsed = JSON.parse(toolMsg!.content);
      expect(parsed).toEqual({ error: 'DB connection lost' });
    });
  });

  describe('confirmation flow', () => {
    const toolCall = createToolCall();

    it('asks for confirmation when action.confirmation is true', async () => {
      const onConfirmationRequired = vi.fn().mockResolvedValue(true);
      callbacks = createCallbacks({ onConfirmationRequired });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: true });
      mockActionExecute.mockResolvedValue({ success: true });

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Confirmed and done' }));

      await engine.process('Delete item');

      expect(onConfirmationRequired).toHaveBeenCalledWith(toolCall, { param: 'value' });
      expect(mockActionExecute).toHaveBeenCalled();
    });

    it('rejects tool call when confirmation denied', async () => {
      const onConfirmationRequired = vi.fn().mockResolvedValue(false);
      callbacks = createCallbacks({ onConfirmationRequired });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: true });

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [toolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Action was rejected' }));

      const messages = await engine.process('Delete item');

      expect(mockActionExecute).not.toHaveBeenCalled();

      const toolMsg = messages.find(m => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      const parsed = JSON.parse(toolMsg!.content);
      expect(parsed.rejected).toBe(true);

      expect(callbacks.onToolCallError).toHaveBeenCalledWith(toolCall, 'rejected');
    });
  });

  describe('history management', () => {
    it('trimHistory keeps messages within limit', async () => {
      // historyLimit=5, trimHistory triggers when history.length > historyLimit * 2 = 10
      config = createConfig({ historyLimit: 5 });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockAiChat.mockResolvedValue(createAiResponse({ content: 'response' }));

      // Each process call adds 2 messages (user + assistant) to history.
      // After 6 calls we have 12 messages > 10 threshold, trim to last 5.
      for (let i = 0; i < 6; i++) {
        await engine.process(`Message ${i}`);
      }

      const history = engine.getHistory();
      expect(history.length).toBe(5);
    });

    it('loadHistory replaces history', async () => {
      const existingMessages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Old message', timestamp: 1000 },
        { id: '2', role: 'assistant', content: 'Old response', timestamp: 2000 },
      ];

      engine.loadHistory(existingMessages);

      const history = engine.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Old message');
      expect(history[1].content).toBe('Old response');
    });

    it('clearHistory empties history', async () => {
      mockAiChat.mockResolvedValue(createAiResponse());

      await engine.process('Hello');
      expect(engine.getHistory().length).toBeGreaterThan(0);

      engine.clearHistory();
      expect(engine.getHistory()).toHaveLength(0);
    });

    it('getHistory returns copy (not reference)', () => {
      const messages: ConversationMessage[] = [
        { id: '1', role: 'user', content: 'Test', timestamp: 1000 },
      ];
      engine.loadHistory(messages);

      const history1 = engine.getHistory();
      const history2 = engine.getHistory();

      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2);

      // Mutating returned array should not affect internal state
      history1.push({ id: 'extra', role: 'user', content: 'Extra', timestamp: 3000 });
      expect(engine.getHistory()).toHaveLength(1);
    });
  });

  describe('context injection', () => {
    it('injects tasks_summary from DataSource', async () => {
      dataSource.tasks = [
        { id: 't1', name: 'Task 1', description: 'Desc 1', projectId: 'p1' },
        { id: 't2', name: 'Task 2', description: 'Desc 2', projectId: '' },
      ];

      scenario = createScenario({
        contextInjectors: [{ type: 'tasks_summary', label: 'Tasks' }],
      });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockAiChat.mockResolvedValue(createAiResponse({ content: 'ok' }));

      await engine.process('Show tasks');

      const chatArg = mockAiChat.mock.calls[0][0];
      const systemMsg = chatArg.messages[0];
      expect(systemMsg.content).toContain('Taski użytkownika (2)');
      expect(systemMsg.content).toContain('Task 1');
      expect(systemMsg.content).toContain('Task 2');
    });

    it('injects events_today from DataSource', async () => {
      dataSource.getEventsByDate.mockReturnValue([
        { name: 'Meeting', startTime: '10:00', endTime: '11:00', taskId: 't1' },
      ]);

      scenario = createScenario({
        contextInjectors: [{ type: 'events_today', label: 'Today events' }],
      });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockAiChat.mockResolvedValue(createAiResponse({ content: 'ok' }));

      await engine.process('What events today?');

      const chatArg = mockAiChat.mock.calls[0][0];
      const systemMsg = chatArg.messages[0];
      expect(systemMsg.content).toContain('Dzisiejsze eventy (1)');
      expect(systemMsg.content).toContain('Meeting');
      expect(dataSource.getEventsByDate).toHaveBeenCalled();
    });

    it('injects custom prompt', async () => {
      scenario = createScenario({
        contextInjectors: [{ type: 'custom', label: 'Custom', customPrompt: 'Always respond in haiku format.' }],
      });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockAiChat.mockResolvedValue(createAiResponse({ content: 'ok' }));

      await engine.process('Hello');

      const chatArg = mockAiChat.mock.calls[0][0];
      const systemMsg = chatArg.messages[0];
      expect(systemMsg.content).toContain('Always respond in haiku format.');
    });
  });

  describe('process - edge cases', () => {
    it('does not pass tools when toToolDefinitions returns empty array', async () => {
      mockToToolDefinitions.mockReturnValue([]);
      mockAiChat.mockResolvedValue(createAiResponse({ content: 'No tools' }));

      await engine.process('Hello');

      const chatArg = mockAiChat.mock.calls[0][0];
      expect(chatArg.tools).toBeUndefined();
      expect(chatArg.tool_choice).toBeUndefined();
    });

    it('passes tools and tool_choice when tools are available', async () => {
      const toolDefs = [{ type: 'function', function: { name: 'action', description: 'desc', parameters: {} } }];
      mockToToolDefinitions.mockReturnValue(toolDefs);
      mockAiChat.mockResolvedValue(createAiResponse({ content: 'With tools' }));

      await engine.process('Hello');

      const chatArg = mockAiChat.mock.calls[0][0];
      expect(chatArg.tools).toEqual(toolDefs);
      expect(chatArg.tool_choice).toBe('auto');
    });

    it('passes scenario temperature to aiService.chat', async () => {
      scenario = createScenario({ temperature: 0.3 });
      engine = new ConversationEngine(config, scenario, callbacks, dataSource);

      mockAiChat.mockResolvedValue(createAiResponse({ content: 'ok' }));

      await engine.process('Hello');

      const chatArg = mockAiChat.mock.calls[0][0];
      expect(chatArg.temperature).toBe(0.3);
    });

    it('handles tool call with malformed JSON arguments gracefully', async () => {
      const badToolCall = createToolCall({
        function: { name: 'test_action', arguments: '{invalid json}' },
      });

      mockToToolDefinitions.mockReturnValue([{ type: 'function', function: { name: 'test_action', description: 'test', parameters: {} } }]);
      mockActionGet.mockReturnValue({ name: 'test_action', confirmation: false });
      mockActionExecute.mockResolvedValue({ ok: true });

      mockAiChat
        .mockResolvedValueOnce(createAiResponse({ content: '', toolCalls: [badToolCall] }))
        .mockResolvedValueOnce(createAiResponse({ content: 'Handled' }));

      await engine.process('Bad args');

      // Should call execute with empty object since JSON parse fails
      expect(mockActionExecute).toHaveBeenCalledWith('test_action', {});
    });

    it('creates messages with uuid and timestamp', async () => {
      mockAiChat.mockResolvedValue(createAiResponse({ content: 'response' }));

      await engine.process('Hello');

      const history = engine.getHistory();
      for (const msg of history) {
        expect(msg.id).toBe('test-uuid');
        expect(typeof msg.timestamp).toBe('number');
        expect(msg.timestamp).toBeGreaterThan(0);
      }
    });
  });
});
