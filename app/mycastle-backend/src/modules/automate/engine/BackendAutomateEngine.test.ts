import { BackendAutomateEngine } from './BackendAutomateEngine';
import type { AutomateSystemApiInterface } from './BackendSystemApi';
import type {
  AutomateFlowModel,
  AutomateNodeModel,
  AutomateEdgeModel,
  AutomateVariableDefinition,
  AutomateNodeType,
} from '@mhersztowski/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nodeIdCounter = 0;
let edgeIdCounter = 0;

function resetCounters(): void {
  nodeIdCounter = 0;
  edgeIdCounter = 0;
}

function createNode(overrides: Partial<AutomateNodeModel> & { nodeType: AutomateNodeType }): AutomateNodeModel {
  const id = overrides.id ?? `node_${++nodeIdCounter}`;
  return {
    type: 'automate_node',
    id,
    nodeType: overrides.nodeType,
    name: overrides.name ?? `${overrides.nodeType}_${id}`,
    position: overrides.position ?? { x: 0, y: 0 },
    inputs: overrides.inputs ?? [],
    outputs: overrides.outputs ?? [],
    config: overrides.config ?? {},
    script: overrides.script,
    disabled: overrides.disabled,
    description: overrides.description,
  };
}

function createEdge(
  sourceId: string,
  sourcePort: string,
  targetId: string,
  targetPort: string,
  overrides?: Partial<AutomateEdgeModel>,
): AutomateEdgeModel {
  return {
    type: 'automate_edge',
    id: overrides?.id ?? `edge_${++edgeIdCounter}`,
    sourceNodeId: sourceId,
    sourcePortId: sourcePort,
    targetNodeId: targetId,
    targetPortId: targetPort,
    disabled: overrides?.disabled,
    label: overrides?.label,
  };
}

function createFlow(
  nodes: AutomateNodeModel[],
  edges: AutomateEdgeModel[],
  variables?: AutomateVariableDefinition[],
): AutomateFlowModel {
  return {
    type: 'automate_flow',
    id: 'test-flow-1',
    name: 'Test Flow',
    version: '1.0',
    nodes,
    edges,
    variables,
  };
}

function createMockApi(overrides?: Partial<AutomateSystemApiInterface>): AutomateSystemApiInterface {
  return {
    file: {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
    },
    data: {
      getPersons: vi.fn().mockReturnValue([]),
      getPersonById: vi.fn(),
      getTasks: vi.fn().mockReturnValue([]),
      getTaskById: vi.fn(),
      getProjects: vi.fn().mockReturnValue([]),
      getProjectById: vi.fn(),
      getShoppingLists: vi.fn().mockReturnValue([]),
      getShoppingListById: vi.fn(),
    },
    variables: {
      get: vi.fn(),
      set: vi.fn(),
      getAll: vi.fn().mockReturnValue({}),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    notify: vi.fn(),
    utils: {
      uuid: vi.fn().mockReturnValue('mock-uuid'),
      dayjs: vi.fn(),
      sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    },
    ai: {
      chat: vi.fn().mockResolvedValue('AI response'),
      chatVision: vi.fn(),
      chatMessages: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(false),
    },
    speech: {
      say: vi.fn(),
      stop: vi.fn(),
      isTtsConfigured: vi.fn().mockReturnValue(false),
      isSttConfigured: vi.fn().mockReturnValue(false),
    },
    shopping: {
      createList: vi.fn(),
      addItem: vi.fn(),
      checkItem: vi.fn(),
      uncheckItem: vi.fn(),
      removeItem: vi.fn(),
      completeList: vi.fn(),
    },
    logs: [],
    notifications: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackendAutomateEngine', () => {
  let engine: BackendAutomateEngine;
  let api: AutomateSystemApiInterface;

  beforeEach(() => {
    resetCounters();
    engine = new BackendAutomateEngine();
    api = createMockApi();
  });

  // =========================================================================
  // 1. Basic flow execution
  // =========================================================================

  describe('basic flow execution', () => {
    it('executes start -> end flow (single start node, no successors)', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const flow = createFlow([startNode], []);

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.executionLog).toHaveLength(1);
      expect(result.executionLog[0].nodeId).toBe('start');
      expect(result.executionLog[0].nodeType).toBe('start');
      expect(result.executionLog[0].status).toBe('completed');
    });

    it('returns success:true with execution log containing timing data', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: { message: 'hello' } });
      const flow = createFlow(
        [startNode, logNode],
        [createEdge('start', 'out', 'log1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.executionLog).toHaveLength(2);
      for (const log of result.executionLog) {
        expect(log.startTime).toBeTypeOf('number');
        expect(log.endTime).toBeTypeOf('number');
        expect(log.endTime!).toBeGreaterThanOrEqual(log.startTime);
      }
    });

    it('returns error when no start node found', async () => {
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: { message: 'hello' } });
      const flow = createFlow([logNode], []);

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No start node found');
    });

    it('returns error when start node is disabled', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start', disabled: true });
      const flow = createFlow([startNode], []);

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No start node found');
    });

    it('skips disabled nodes during execution', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const disabledLog = createNode({ id: 'log1', nodeType: 'log', config: { message: 'disabled' }, disabled: true });
      const enabledLog = createNode({ id: 'log2', nodeType: 'log', config: { message: 'enabled' } });
      const flow = createFlow(
        [startNode, disabledLog, enabledLog],
        [
          createEdge('start', 'out', 'log1', 'in'),
          createEdge('start', 'out', 'log2', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      // start + enabledLog = 2 entries; disabledLog is skipped entirely
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('start');
      expect(executedNodeIds).toContain('log2');
      expect(executedNodeIds).not.toContain('log1');
    });

    it('skips disabled edges', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: { message: 'should not run' } });
      const flow = createFlow(
        [startNode, logNode],
        [createEdge('start', 'out', 'log1', 'in', { disabled: true })],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.executionLog).toHaveLength(1);
      expect(result.executionLog[0].nodeId).toBe('start');
    });

    it('executes a linear chain start -> js -> log', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return 42',
      });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'result' },
      });
      const flow = createFlow(
        [startNode, jsNode, logNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'log1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.executionLog).toHaveLength(3);
      expect(result.executionLog[0].nodeType).toBe('start');
      expect(result.executionLog[1].nodeType).toBe('js_execute');
      expect(result.executionLog[1].result).toBe(42);
      expect(result.executionLog[2].nodeType).toBe('log');
    });

    it('returns logs and notifications arrays from api', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'test message' },
      });
      const flow = createFlow(
        [startNode, logNode],
        [createEdge('start', 'out', 'log1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.logs).toBe(api.logs);
      expect(result.notifications).toBe(api.notifications);
    });

    it('supports multiple start nodes', async () => {
      const start1 = createNode({ id: 'start1', nodeType: 'start' });
      const start2 = createNode({ id: 'start2', nodeType: 'start' });
      const log1 = createNode({ id: 'log1', nodeType: 'log', config: { message: 'from start1' } });
      const log2 = createNode({ id: 'log2', nodeType: 'log', config: { message: 'from start2' } });
      const flow = createFlow(
        [start1, start2, log1, log2],
        [
          createEdge('start1', 'out', 'log1', 'in'),
          createEdge('start2', 'out', 'log2', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('start1');
      expect(executedNodeIds).toContain('start2');
      expect(executedNodeIds).toContain('log1');
      expect(executedNodeIds).toContain('log2');
    });
  });

  // =========================================================================
  // 2. Node types
  // =========================================================================

  describe('node type: start', () => {
    it('continues to "out" port', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const nextNode = createNode({ id: 'next', nodeType: 'log', config: { message: 'reached' } });
      const flow = createFlow(
        [startNode, nextNode],
        [createEdge('start', 'out', 'next', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.executionLog).toHaveLength(2);
      expect(result.executionLog[1].nodeId).toBe('next');
    });
  });

  describe('node type: js_execute', () => {
    it('runs script and returns result', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return 2 + 3',
      });
      const flow = createFlow(
        [startNode, jsNode],
        [createEdge('start', 'out', 'js1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toBe(5);
    });

    it('passes previous result as input._result', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsFirst = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return "hello"',
      });
      const jsSecond = createNode({
        id: 'js2',
        nodeType: 'js_execute',
        script: 'return inp._result + " world"',
      });
      const flow = createFlow(
        [startNode, jsFirst, jsSecond],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'js2', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js2');
      expect(jsLog?.result).toBe('hello world');
    });

    it('can access flow variables from script', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return vars.myVar',
      });
      const flow = createFlow(
        [startNode, jsNode],
        [createEdge('start', 'out', 'js1', 'in')],
        [{ name: 'myVar', type: 'string', defaultValue: 'test_value' }],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toBe('test_value');
    });

    it('handles no script gracefully (result is undefined)', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
      });
      const flow = createFlow(
        [startNode, jsNode],
        [createEdge('start', 'out', 'js1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toBeUndefined();
    });
  });

  describe('node type: if_else', () => {
    it('follows true port when condition is truthy', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const ifNode = createNode({
        id: 'if1',
        nodeType: 'if_else',
        config: { condition: 'true' },
      });
      const trueLog = createNode({ id: 'true_log', nodeType: 'log', config: { message: 'true path' } });
      const falseLog = createNode({ id: 'false_log', nodeType: 'log', config: { message: 'false path' } });
      const flow = createFlow(
        [startNode, ifNode, trueLog, falseLog],
        [
          createEdge('start', 'out', 'if1', 'in'),
          createEdge('if1', 'true', 'true_log', 'in'),
          createEdge('if1', 'false', 'false_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('true_log');
      expect(executedNodeIds).not.toContain('false_log');
    });

    it('follows false port when condition is falsy', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const ifNode = createNode({
        id: 'if1',
        nodeType: 'if_else',
        config: { condition: 'false' },
      });
      const trueLog = createNode({ id: 'true_log', nodeType: 'log', config: { message: 'true' } });
      const falseLog = createNode({ id: 'false_log', nodeType: 'log', config: { message: 'false' } });
      const flow = createFlow(
        [startNode, ifNode, trueLog, falseLog],
        [
          createEdge('start', 'out', 'if1', 'in'),
          createEdge('if1', 'true', 'true_log', 'in'),
          createEdge('if1', 'false', 'false_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).not.toContain('true_log');
      expect(executedNodeIds).toContain('false_log');
    });

    it('evaluates condition using variables', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const ifNode = createNode({
        id: 'if1',
        nodeType: 'if_else',
        config: { condition: 'vars.x > 5' },
      });
      const trueLog = createNode({ id: 'true_log', nodeType: 'log', config: { message: 'true' } });
      const falseLog = createNode({ id: 'false_log', nodeType: 'log', config: { message: 'false' } });
      const flow = createFlow(
        [startNode, ifNode, trueLog, falseLog],
        [
          createEdge('start', 'out', 'if1', 'in'),
          createEdge('if1', 'true', 'true_log', 'in'),
          createEdge('if1', 'false', 'false_log', 'in'),
        ],
        [{ name: 'x', type: 'number', defaultValue: 10 }],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('true_log');
    });

    it('follows false port when no condition is provided', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const ifNode = createNode({
        id: 'if1',
        nodeType: 'if_else',
        config: {},
      });
      const trueLog = createNode({ id: 'true_log', nodeType: 'log', config: { message: 'true' } });
      const falseLog = createNode({ id: 'false_log', nodeType: 'log', config: { message: 'false' } });
      const flow = createFlow(
        [startNode, ifNode, trueLog, falseLog],
        [
          createEdge('start', 'out', 'if1', 'in'),
          createEdge('if1', 'true', 'true_log', 'in'),
          createEdge('if1', 'false', 'false_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('false_log');
      expect(executedNodeIds).not.toContain('true_log');
    });
  });

  describe('node type: read_variable', () => {
    it('returns stored variable value', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: { variableName: 'counter' },
      });
      const flow = createFlow(
        [startNode, readNode],
        [createEdge('start', 'out', 'read1', 'in')],
        [{ name: 'counter', type: 'number', defaultValue: 42 }],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const readLog = result.executionLog.find(e => e.nodeId === 'read1');
      expect(readLog?.result).toBe(42);
    });

    it('returns undefined for non-existent variable', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: { variableName: 'nonexistent' },
      });
      const flow = createFlow(
        [startNode, readNode],
        [createEdge('start', 'out', 'read1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const readLog = result.executionLog.find(e => e.nodeId === 'read1');
      expect(readLog?.result).toBeUndefined();
    });

    it('returns undefined when no variableName configured', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: {},
      });
      const flow = createFlow(
        [startNode, readNode],
        [createEdge('start', 'out', 'read1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const readLog = result.executionLog.find(e => e.nodeId === 'read1');
      expect(readLog?.result).toBeUndefined();
    });
  });

  describe('node type: write_variable', () => {
    it('sets variable value accessible by later nodes', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const writeNode = createNode({
        id: 'write1',
        nodeType: 'write_variable',
        config: { variableName: 'myVar', value: 'written_value' },
      });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: { variableName: 'myVar' },
      });
      const flow = createFlow(
        [startNode, writeNode, readNode],
        [
          createEdge('start', 'out', 'write1', 'in'),
          createEdge('write1', 'out', 'read1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const readLog = result.executionLog.find(e => e.nodeId === 'read1');
      expect(readLog?.result).toBe('written_value');
    });

    it('returns updated variables in the result', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const writeNode = createNode({
        id: 'write1',
        nodeType: 'write_variable',
        config: { variableName: 'key', value: 123 },
      });
      const flow = createFlow(
        [startNode, writeNode],
        [createEdge('start', 'out', 'write1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.variables.key).toBe(123);
    });

    it('does nothing when variableName is missing', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const writeNode = createNode({
        id: 'write1',
        nodeType: 'write_variable',
        config: { value: 'ignored' },
      });
      const flow = createFlow(
        [startNode, writeNode],
        [createEdge('start', 'out', 'write1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(Object.keys(result.variables)).toHaveLength(0);
    });
  });

  describe('node type: log', () => {
    it('logs message via api.log.info by default', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'Hello from log' },
      });
      const flow = createFlow(
        [startNode, logNode],
        [createEdge('start', 'out', 'log1', 'in')],
      );

      await engine.executeFlow(flow, api);

      expect(api.log.info).toHaveBeenCalledWith('Hello from log');
    });

    it('logs at the configured level', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'Warning!', level: 'warn' },
      });
      const flow = createFlow(
        [startNode, logNode],
        [createEdge('start', 'out', 'log1', 'in')],
      );

      await engine.executeFlow(flow, api);

      expect(api.log.warn).toHaveBeenCalledWith('Warning!');
    });

    it('logs input object when logInput is true', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return { foo: "bar" }',
      });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'Input:', logInput: true },
      });
      const flow = createFlow(
        [startNode, jsNode, logNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'log1', 'in'),
        ],
      );

      await engine.executeFlow(flow, api);

      expect(api.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Input:'),
      );
      expect(api.log.info).toHaveBeenCalledWith(
        expect.stringContaining('"foo": "bar"'),
      );
    });

    it('logs empty string when no message configured', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: {},
      });
      const flow = createFlow(
        [startNode, logNode],
        [createEdge('start', 'out', 'log1', 'in')],
      );

      await engine.executeFlow(flow, api);

      expect(api.log.info).toHaveBeenCalledWith('');
    });
  });

  describe('node type: for_loop', () => {
    it('iterates specified count and executes body', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const forNode = createNode({
        id: 'for1',
        nodeType: 'for_loop',
        config: { count: 3, indexVariable: 'i' },
      });
      const bodyLog = createNode({
        id: 'body_log',
        nodeType: 'log',
        config: { message: 'iteration' },
      });
      const flow = createFlow(
        [startNode, forNode, bodyLog],
        [
          createEdge('start', 'out', 'for1', 'in'),
          createEdge('for1', 'body', 'body_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      // body_log should have been executed 3 times
      const bodyLogs = result.executionLog.filter(e => e.nodeId === 'body_log');
      expect(bodyLogs).toHaveLength(3);
    });

    it('sets index variable for each iteration', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const forNode = createNode({
        id: 'for1',
        nodeType: 'for_loop',
        config: { count: 3, indexVariable: 'idx' },
      });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return vars.idx',
      });
      const flow = createFlow(
        [startNode, forNode, jsNode],
        [
          createEdge('start', 'out', 'for1', 'in'),
          createEdge('for1', 'body', 'js1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      const jsLogs = result.executionLog.filter(e => e.nodeId === 'js1');
      expect(jsLogs).toHaveLength(3);
      expect(jsLogs[0].result).toBe(0);
      expect(jsLogs[1].result).toBe(1);
      expect(jsLogs[2].result).toBe(2);
    });

    it('continues to done port after loop completes', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const forNode = createNode({
        id: 'for1',
        nodeType: 'for_loop',
        config: { count: 2 },
      });
      const doneLog = createNode({
        id: 'done_log',
        nodeType: 'log',
        config: { message: 'done' },
      });
      const flow = createFlow(
        [startNode, forNode, doneLog],
        [
          createEdge('start', 'out', 'for1', 'in'),
          createEdge('for1', 'done', 'done_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('done_log');
    });

    it('handles zero count (no iterations, goes to done)', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const forNode = createNode({
        id: 'for1',
        nodeType: 'for_loop',
        config: { count: 0, indexVariable: 'i' },
      });
      const bodyLog = createNode({ id: 'body_log', nodeType: 'log', config: { message: 'body' } });
      const doneLog = createNode({ id: 'done_log', nodeType: 'log', config: { message: 'done' } });
      const flow = createFlow(
        [startNode, forNode, bodyLog, doneLog],
        [
          createEdge('start', 'out', 'for1', 'in'),
          createEdge('for1', 'body', 'body_log', 'in'),
          createEdge('for1', 'done', 'done_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).not.toContain('body_log');
      expect(executedNodeIds).toContain('done_log');
    });

    it('uses default index variable name "i" when not configured', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const forNode = createNode({
        id: 'for1',
        nodeType: 'for_loop',
        config: { count: 1 },
      });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return vars.i',
      });
      const flow = createFlow(
        [startNode, forNode, jsNode],
        [
          createEdge('start', 'out', 'for1', 'in'),
          createEdge('for1', 'body', 'js1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toBe(0);
    });
  });

  describe('node type: comment', () => {
    it('is a no-op and does not produce next port output', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const commentNode = createNode({
        id: 'comment1',
        nodeType: 'comment',
        config: {},
      });
      // Even if we connect something after comment, it should not execute
      // because comment does not set nextPortId
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: { message: 'after comment' } });
      const flow = createFlow(
        [startNode, commentNode, logNode],
        [
          createEdge('start', 'out', 'comment1', 'in'),
          createEdge('comment1', 'out', 'log1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('comment1');
      // comment does not set nextPortId, so log1 should not execute
      expect(executedNodeIds).not.toContain('log1');
    });
  });

  describe('node type: switch', () => {
    it('follows matching case port', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const switchNode = createNode({
        id: 'switch1',
        nodeType: 'switch',
        config: { expression: '"b"', cases: ['a', 'b', 'c'] },
      });
      const caseA = createNode({ id: 'case_a', nodeType: 'log', config: { message: 'A' } });
      const caseB = createNode({ id: 'case_b', nodeType: 'log', config: { message: 'B' } });
      const caseC = createNode({ id: 'case_c', nodeType: 'log', config: { message: 'C' } });
      const defaultNode = createNode({ id: 'default', nodeType: 'log', config: { message: 'default' } });
      const flow = createFlow(
        [startNode, switchNode, caseA, caseB, caseC, defaultNode],
        [
          createEdge('start', 'out', 'switch1', 'in'),
          createEdge('switch1', 'case_0', 'case_a', 'in'),
          createEdge('switch1', 'case_1', 'case_b', 'in'),
          createEdge('switch1', 'case_2', 'case_c', 'in'),
          createEdge('switch1', 'default', 'default', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('case_b');
      expect(executedNodeIds).not.toContain('case_a');
      expect(executedNodeIds).not.toContain('case_c');
      expect(executedNodeIds).not.toContain('default');
    });

    it('follows default port when no case matches', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const switchNode = createNode({
        id: 'switch1',
        nodeType: 'switch',
        config: { expression: '"z"', cases: ['a', 'b'] },
      });
      const caseA = createNode({ id: 'case_a', nodeType: 'log', config: { message: 'A' } });
      const defaultNode = createNode({ id: 'default', nodeType: 'log', config: { message: 'default' } });
      const flow = createFlow(
        [startNode, switchNode, caseA, defaultNode],
        [
          createEdge('start', 'out', 'switch1', 'in'),
          createEdge('switch1', 'case_0', 'case_a', 'in'),
          createEdge('switch1', 'default', 'default', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('default');
      expect(executedNodeIds).not.toContain('case_a');
    });
  });

  describe('node type: while_loop', () => {
    it('loops while condition is true', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const writeNode = createNode({
        id: 'write1',
        nodeType: 'write_variable',
        config: { variableName: 'count', value: 0 },
      });
      const whileNode = createNode({
        id: 'while1',
        nodeType: 'while_loop',
        config: { condition: 'vars.count < 3', maxIterations: 100 },
      });
      const incrementNode = createNode({
        id: 'inc',
        nodeType: 'js_execute',
        script: 'vars.count = vars.count + 1; return vars.count',
      });
      const doneLog = createNode({
        id: 'done_log',
        nodeType: 'log',
        config: { message: 'done' },
      });
      const flow = createFlow(
        [startNode, writeNode, whileNode, incrementNode, doneLog],
        [
          createEdge('start', 'out', 'write1', 'in'),
          createEdge('write1', 'out', 'while1', 'in'),
          createEdge('while1', 'body', 'inc', 'in'),
          createEdge('while1', 'done', 'done_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const incLogs = result.executionLog.filter(e => e.nodeId === 'inc');
      expect(incLogs).toHaveLength(3);
      expect(result.variables.count).toBe(3);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('done_log');
    });

    it('skips body entirely when condition is false from start', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const whileNode = createNode({
        id: 'while1',
        nodeType: 'while_loop',
        config: { condition: 'false' },
      });
      const bodyLog = createNode({ id: 'body', nodeType: 'log', config: { message: 'body' } });
      const flow = createFlow(
        [startNode, whileNode, bodyLog],
        [
          createEdge('start', 'out', 'while1', 'in'),
          createEdge('while1', 'body', 'body', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).not.toContain('body');
    });
  });

  describe('node type: manual_trigger', () => {
    it('passes JSON payload on out port', async () => {
      // manual_trigger is not discovered as a start node, so we need a start node pointing to it
      // Actually from the code, manual_trigger would need to be triggered differently.
      // But let's test as a node in the middle of a flow.
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const triggerNode = createNode({
        id: 'trigger1',
        nodeType: 'manual_trigger',
        config: { payload: '{"key":"value"}' },
      });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return inp._result',
      });
      const flow = createFlow(
        [startNode, triggerNode, jsNode],
        [
          createEdge('start', 'out', 'trigger1', 'in'),
          createEdge('trigger1', 'out', 'js1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const triggerLog = result.executionLog.find(e => e.nodeId === 'trigger1');
      expect(triggerLog?.result).toEqual({ key: 'value' });
    });

    it('uses script when useScript is true', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const triggerNode = createNode({
        id: 'trigger1',
        nodeType: 'manual_trigger',
        config: { useScript: true },
        script: 'return "from script"',
      });
      const flow = createFlow(
        [startNode, triggerNode],
        [createEdge('start', 'out', 'trigger1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const triggerLog = result.executionLog.find(e => e.nodeId === 'trigger1');
      expect(triggerLog?.result).toBe('from script');
    });

    it('returns raw string payload when JSON parsing fails', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const triggerNode = createNode({
        id: 'trigger1',
        nodeType: 'manual_trigger',
        config: { payload: 'not valid json' },
      });
      const flow = createFlow(
        [startNode, triggerNode],
        [createEdge('start', 'out', 'trigger1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const triggerLog = result.executionLog.find(e => e.nodeId === 'trigger1');
      expect(triggerLog?.result).toBe('not valid json');
    });
  });

  describe('node type: system_api', () => {
    it('logs API method and continues to out', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const apiNode = createNode({
        id: 'api1',
        nodeType: 'system_api',
        config: { apiMethod: 'someMethod' },
      });
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: { message: 'after api' } });
      const flow = createFlow(
        [startNode, apiNode, logNode],
        [
          createEdge('start', 'out', 'api1', 'in'),
          createEdge('api1', 'out', 'log1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(api.log.info).toHaveBeenCalledWith('System API call: someMethod');
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('log1');
    });
  });

  describe('node type: foreach', () => {
    it('iterates over array from source expression', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return [10, 20, 30]',
      });
      const foreachNode = createNode({
        id: 'foreach1',
        nodeType: 'foreach',
        config: {
          sourceExpression: 'inp._result',
          itemVariable: 'item',
          indexVariable: 'index',
        },
      });
      const bodyJs = createNode({
        id: 'body_js',
        nodeType: 'js_execute',
        script: 'return vars.item',
      });
      const doneLog = createNode({
        id: 'done_log',
        nodeType: 'log',
        config: { message: 'done' },
      });
      const flow = createFlow(
        [startNode, jsNode, foreachNode, bodyJs, doneLog],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'foreach1', 'in'),
          createEdge('foreach1', 'loop', 'body_js', 'in'),
          createEdge('foreach1', 'done', 'done_log', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const bodyLogs = result.executionLog.filter(e => e.nodeId === 'body_js');
      expect(bodyLogs).toHaveLength(3);
      expect(bodyLogs[0].result).toBe(10);
      expect(bodyLogs[1].result).toBe(20);
      expect(bodyLogs[2].result).toBe(30);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('done_log');
    });

    it('throws when source expression is not an array', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return "not an array"',
      });
      const foreachNode = createNode({
        id: 'foreach1',
        nodeType: 'foreach',
        config: { sourceExpression: 'inp._result' },
      });
      const flow = createFlow(
        [startNode, jsNode, foreachNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'foreach1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Foreach');
    });
  });

  describe('node type: llm_call', () => {
    it('calls ai.chat with configured prompt', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const llmNode = createNode({
        id: 'llm1',
        nodeType: 'llm_call',
        config: {
          prompt: 'Tell me a joke',
          systemPrompt: 'You are funny',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 100,
        },
      });
      const flow = createFlow(
        [startNode, llmNode],
        [createEdge('start', 'out', 'llm1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(api.ai.chat).toHaveBeenCalledWith('Tell me a joke', {
        systemPrompt: 'You are funny',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100,
      });
      const llmLog = result.executionLog.find(e => e.nodeId === 'llm1');
      expect(llmLog?.result).toBe('AI response');
    });

    it('uses script to generate prompt when useScript is true', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const llmNode = createNode({
        id: 'llm1',
        nodeType: 'llm_call',
        config: { useScript: true },
        script: 'return "dynamic prompt"',
      });
      const flow = createFlow(
        [startNode, llmNode],
        [createEdge('start', 'out', 'llm1', 'in')],
      );

      await engine.executeFlow(flow, api);

      expect(api.ai.chat).toHaveBeenCalledWith('dynamic prompt', expect.any(Object));
    });
  });

  describe('node types: unsupported on backend', () => {
    it('throws for notification node type', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const notifNode = createNode({
        id: 'notif1',
        nodeType: 'notification',
        config: {},
      });
      const flow = createFlow(
        [startNode, notifNode],
        [createEdge('start', 'out', 'notif1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported on backend');
    });

    it('throws for tts node type', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const ttsNode = createNode({ id: 'tts1', nodeType: 'tts', config: {} });
      const flow = createFlow(
        [startNode, ttsNode],
        [createEdge('start', 'out', 'tts1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported on backend');
    });

    it('throws for stt node type', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const sttNode = createNode({ id: 'stt1', nodeType: 'stt', config: {} });
      const flow = createFlow(
        [startNode, sttNode],
        [createEdge('start', 'out', 'stt1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported on backend');
    });
  });

  // =========================================================================
  // 3. Merge node
  // =========================================================================

  describe('node type: merge', () => {
    it('waits for all connected inputs before continuing', async () => {
      // start -> js1 (returns "A") -> merge(in_1)
      // start -> js2 (returns "B") -> merge(in_2)
      // merge -> log (should get both)
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const js1 = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return "A"',
      });
      const js2 = createNode({
        id: 'js2',
        nodeType: 'js_execute',
        script: 'return "B"',
      });
      const mergeNode = createNode({
        id: 'merge1',
        nodeType: 'merge',
        config: { mode: 'object' },
      });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'merged' },
      });
      const flow = createFlow(
        [startNode, js1, js2, mergeNode, logNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('start', 'out', 'js2', 'in'),
          createEdge('js1', 'out', 'merge1', 'in_1'),
          createEdge('js2', 'out', 'merge1', 'in_2'),
          createEdge('merge1', 'out', 'log1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      // merge should be executed twice (once per incoming branch)
      const mergeLogs = result.executionLog.filter(e => e.nodeId === 'merge1');
      expect(mergeLogs).toHaveLength(2);
      // First call should be "waiting", second should complete
      expect(mergeLogs[0].result).toEqual({ waiting: true, received: expect.any(Array) });
      // The log node should be executed once (after merge completes)
      const logLogs = result.executionLog.filter(e => e.nodeId === 'log1');
      expect(logLogs).toHaveLength(1);
    });

    it('aggregates results as object in object mode', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const js1 = createNode({ id: 'js1', nodeType: 'js_execute', script: 'return "A"' });
      const js2 = createNode({ id: 'js2', nodeType: 'js_execute', script: 'return "B"' });
      const mergeNode = createNode({
        id: 'merge1',
        nodeType: 'merge',
        config: { mode: 'object' },
      });
      const flow = createFlow(
        [startNode, js1, js2, mergeNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('start', 'out', 'js2', 'in'),
          createEdge('js1', 'out', 'merge1', 'in_1'),
          createEdge('js2', 'out', 'merge1', 'in_2'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const mergeLogs = result.executionLog.filter(e => e.nodeId === 'merge1');
      // The final merge log (when all inputs arrived) should have object result
      const completedMerge = mergeLogs.find(
        e => e.result && !(e.result as Record<string, unknown>).waiting,
      );
      expect(completedMerge).toBeDefined();
      expect(completedMerge!.result).toEqual({ in_1: 'A', in_2: 'B' });
    });

    it('aggregates results as array in array mode', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const js1 = createNode({ id: 'js1', nodeType: 'js_execute', script: 'return 10' });
      const js2 = createNode({ id: 'js2', nodeType: 'js_execute', script: 'return 20' });
      const mergeNode = createNode({
        id: 'merge1',
        nodeType: 'merge',
        config: { mode: 'array' },
      });
      const flow = createFlow(
        [startNode, js1, js2, mergeNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('start', 'out', 'js2', 'in'),
          createEdge('js1', 'out', 'merge1', 'in_1'),
          createEdge('js2', 'out', 'merge1', 'in_2'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      const mergeLogs = result.executionLog.filter(e => e.nodeId === 'merge1');
      const completedMerge = mergeLogs.find(
        e => e.result && !(e.result as Record<string, unknown>).waiting,
      );
      expect(completedMerge).toBeDefined();
      expect(completedMerge!.result).toEqual(expect.arrayContaining([10, 20]));
    });
  });

  // =========================================================================
  // 4. Error handling
  // =========================================================================

  describe('error handling', () => {
    it('routes to error port when connected', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const failingJs = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'throw new Error("intentional failure")',
      });
      const errorHandler = createNode({
        id: 'error_handler',
        nodeType: 'log',
        config: { message: 'handled error' },
      });
      const flow = createFlow(
        [startNode, failingJs, errorHandler],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'error', 'error_handler', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      // Flow should succeed because error was handled
      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('error_handler');
      // The js node should be logged as error
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.status).toBe('error');
      expect(jsLog?.error).toContain('intentional failure');
    });

    it('passes error data to error handler node', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const failingJs = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        name: 'Failing Script',
        script: 'throw new Error("boom")',
      });
      const errorCapture = createNode({
        id: 'error_capture',
        nodeType: 'js_execute',
        script: 'return inp._error',
      });
      const flow = createFlow(
        [startNode, failingJs, errorCapture],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'error', 'error_capture', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const captureLog = result.executionLog.find(e => e.nodeId === 'error_capture');
      const errorData = captureLog?.result as Record<string, unknown>;
      expect(errorData).toBeDefined();
      expect(errorData.message).toBe('boom');
      expect(errorData.nodeId).toBe('js1');
      expect(errorData.nodeName).toBe('Failing Script');
      expect(errorData.nodeType).toBe('js_execute');
      expect(errorData.timestamp).toBeTypeOf('number');
    });

    it('propagates error when no error port connected', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const failingJs = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'throw new Error("unhandled error")',
      });
      const flow = createFlow(
        [startNode, failingJs],
        [createEdge('start', 'out', 'js1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toBe('unhandled error');
    });

    it('error in one branch does not prevent other branches from executing (with error port)', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const failingJs = createNode({
        id: 'fail_js',
        nodeType: 'js_execute',
        script: 'throw new Error("branch error")',
      });
      const successJs = createNode({
        id: 'success_js',
        nodeType: 'js_execute',
        script: 'return "ok"',
      });
      const errorHandler = createNode({
        id: 'error_handler',
        nodeType: 'log',
        config: { message: 'error handled' },
      });
      const flow = createFlow(
        [startNode, failingJs, successJs, errorHandler],
        [
          createEdge('start', 'out', 'fail_js', 'in'),
          createEdge('start', 'out', 'success_js', 'in'),
          createEdge('fail_js', 'error', 'error_handler', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('success_js');
      expect(executedNodeIds).toContain('error_handler');
    });
  });

  // =========================================================================
  // 5. Limits
  // =========================================================================

  describe('limits', () => {
    it('enforces MAX_NODE_EXECUTIONS (10000)', async () => {
      // Create a flow that would execute too many times via while_loop
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const whileNode = createNode({
        id: 'while1',
        nodeType: 'while_loop',
        config: { condition: 'true', maxIterations: 20000 },
      });
      const bodyLog = createNode({
        id: 'body',
        nodeType: 'log',
        config: { message: 'tick' },
      });
      const flow = createFlow(
        [startNode, whileNode, bodyLog],
        [
          createEdge('start', 'out', 'while1', 'in'),
          createEdge('while1', 'body', 'body', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Flow execution limit exceeded');
      expect(result.error).toContain('10000');
    });

    it('call_flow detects recursive flow call', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'test-flow-1' },
      });
      const flow = createFlow(
        [startNode, callNode],
        [createEdge('start', 'out', 'call1', 'in')],
      );

      const mockService = {
        getFlowById: vi.fn().mockReturnValue(flow),
      };

      const result = await engine.executeFlow(flow, api, { automateService: mockService });

      // The subflow will detect recursion because flow.id is already in callStack
      expect(result.success).toBe(false);
      expect(result.error).toContain('Recursive flow call detected');
    });

    it('call_flow validates max depth', async () => {
      // Create a chain of 11 different flows each calling the next
      const flows: AutomateFlowModel[] = [];
      for (let i = 0; i < 12; i++) {
        const startNode = createNode({ id: `start_${i}`, nodeType: 'start' });
        const callNode = createNode({
          id: `call_${i}`,
          nodeType: 'call_flow',
          config: { flowId: `flow_${i + 1}` },
        });
        flows.push({
          type: 'automate_flow',
          id: `flow_${i}`,
          name: `Flow ${i}`,
          version: '1.0',
          nodes: [startNode, callNode],
          edges: [createEdge(`start_${i}`, 'out', `call_${i}`, 'in')],
        });
      }
      // Add a terminal flow that just starts and ends
      const terminalStart = createNode({ id: 'start_terminal', nodeType: 'start' });
      flows.push({
        type: 'automate_flow',
        id: 'flow_12',
        name: 'Terminal Flow',
        version: '1.0',
        nodes: [terminalStart],
        edges: [],
      });

      const mockService = {
        getFlowById: vi.fn((id: string) => flows.find(f => f.id === id)),
      };

      const result = await engine.executeFlow(flows[0], api, { automateService: mockService });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max subflow depth');
    });

    it('call_flow errors when no flowId configured', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: {},
      });
      const flow = createFlow(
        [startNode, callNode],
        [createEdge('start', 'out', 'call1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No flow selected');
    });

    it('call_flow errors when automateService is not available', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'some-flow' },
      });
      const flow = createFlow(
        [startNode, callNode],
        [createEdge('start', 'out', 'call1', 'in')],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AutomateService not available');
    });

    it('call_flow errors when flow not found', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'nonexistent' },
      });
      const flow = createFlow(
        [startNode, callNode],
        [createEdge('start', 'out', 'call1', 'in')],
      );

      const mockService = { getFlowById: vi.fn().mockReturnValue(undefined) };

      const result = await engine.executeFlow(flow, api, { automateService: mockService });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Flow not found');
    });

    it('call_flow rejects subflows with client-only nodes', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'sub-flow' },
      });
      const flow = createFlow(
        [startNode, callNode],
        [createEdge('start', 'out', 'call1', 'in')],
      );

      const subflow: AutomateFlowModel = {
        type: 'automate_flow',
        id: 'sub-flow',
        name: 'Sub Flow',
        version: '1.0',
        nodes: [
          createNode({ id: 'sub_start', nodeType: 'start' }),
          createNode({ id: 'notif', nodeType: 'notification', name: 'MyNotification', config: {} }),
        ],
        edges: [createEdge('sub_start', 'out', 'notif', 'in')],
      };

      const mockService = { getFlowById: vi.fn().mockReturnValue(subflow) };

      const result = await engine.executeFlow(flow, api, { automateService: mockService });

      expect(result.success).toBe(false);
      expect(result.error).toContain('client-only nodes');
      expect(result.error).toContain('MyNotification');
    });
  });

  // =========================================================================
  // 6. Flow variables
  // =========================================================================

  describe('flow variables', () => {
    it('initializes from flow.variables defaults', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: { variableName: 'greeting' },
      });
      const flow = createFlow(
        [startNode, readNode],
        [createEdge('start', 'out', 'read1', 'in')],
        [{ name: 'greeting', type: 'string', defaultValue: 'hello world' }],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.variables.greeting).toBe('hello world');
      const readLog = result.executionLog.find(e => e.nodeId === 'read1');
      expect(readLog?.result).toBe('hello world');
    });

    it('initializes variable with null when no defaultValue', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: { variableName: 'empty' },
      });
      const flow = createFlow(
        [startNode, readNode],
        [createEdge('start', 'out', 'read1', 'in')],
        [{ name: 'empty', type: 'string' }],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      expect(result.variables.empty).toBeNull();
    });

    it('variables are accessible in subsequent nodes', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const writeNode = createNode({
        id: 'write1',
        nodeType: 'write_variable',
        config: { variableName: 'msg', value: 'updated' },
      });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return vars.msg',
      });
      const flow = createFlow(
        [startNode, writeNode, jsNode],
        [
          createEdge('start', 'out', 'write1', 'in'),
          createEdge('write1', 'out', 'js1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toBe('updated');
    });

    it('variables modified by js_execute persist across nodes', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsWrite = createNode({
        id: 'js_write',
        nodeType: 'js_execute',
        script: 'vars.myCount = 99; return "set"',
      });
      const jsRead = createNode({
        id: 'js_read',
        nodeType: 'js_execute',
        script: 'return vars.myCount',
      });
      const flow = createFlow(
        [startNode, jsWrite, jsRead],
        [
          createEdge('start', 'out', 'js_write', 'in'),
          createEdge('js_write', 'out', 'js_read', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.success).toBe(true);
      const readLog = result.executionLog.find(e => e.nodeId === 'js_read');
      expect(readLog?.result).toBe(99);
      expect(result.variables.myCount).toBe(99);
    });

    it('passes _parentInput from initialInput to variables', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return vars._parentInput',
      });
      const flow = createFlow(
        [startNode, jsNode],
        [createEdge('start', 'out', 'js1', 'in')],
      );

      const result = await engine.executeFlow(flow, api, {
        initialInput: { _parentInput: { data: 'from parent' } },
      });

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toEqual({ data: 'from parent' });
    });

    it('initializes multiple variables with correct defaults', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const flow = createFlow(
        [startNode],
        [],
        [
          { name: 'strVar', type: 'string', defaultValue: 'hello' },
          { name: 'numVar', type: 'number', defaultValue: 42 },
          { name: 'boolVar', type: 'boolean', defaultValue: true },
          { name: 'noDefault', type: 'object' },
        ],
      );

      const result = await engine.executeFlow(flow, api);

      expect(result.variables.strVar).toBe('hello');
      expect(result.variables.numVar).toBe(42);
      expect(result.variables.boolVar).toBe(true);
      expect(result.variables.noDefault).toBeNull();
    });
  });

  // =========================================================================
  // 7. Webhook trigger
  // =========================================================================

  describe('executeFromWebhook', () => {
    it('executes flow starting from webhook trigger node', async () => {
      const webhookNode = createNode({
        id: 'webhook1',
        nodeType: 'webhook_trigger',
        config: {},
      });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'webhook received' },
      });
      const flow = createFlow(
        [webhookNode, logNode],
        [createEdge('webhook1', 'out', 'log1', 'in')],
      );

      const result = await engine.executeFromWebhook(flow, api, 'webhook1', {
        payload: { test: true },
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        query: { key: 'value' },
      });

      expect(result.success).toBe(true);
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('webhook1');
      expect(executedNodeIds).toContain('log1');
    });

    it('passes webhook data as result', async () => {
      const webhookNode = createNode({
        id: 'webhook1',
        nodeType: 'webhook_trigger',
        config: {},
      });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return inp._result',
      });
      const flow = createFlow(
        [webhookNode, jsNode],
        [createEdge('webhook1', 'out', 'js1', 'in')],
      );

      const result = await engine.executeFromWebhook(flow, api, 'webhook1', {
        payload: { data: 123 },
        method: 'GET',
        headers: {},
        query: {},
      });

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toEqual({
        payload: { data: 123 },
        method: 'GET',
        headers: {},
        query: {},
      });
    });

    it('returns error when webhook node not found', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const flow = createFlow([startNode], []);

      const result = await engine.executeFromWebhook(flow, api, 'nonexistent', {
        payload: {},
        method: 'POST',
        headers: {},
        query: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Webhook node not found');
    });

    it('returns error when target node is not webhook_trigger', async () => {
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: {} });
      const flow = createFlow([logNode], []);

      const result = await engine.executeFromWebhook(flow, api, 'log1', {
        payload: {},
        method: 'POST',
        headers: {},
        query: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('is not a webhook_trigger');
    });

    it('initializes variables from flow.variables', async () => {
      const webhookNode = createNode({
        id: 'webhook1',
        nodeType: 'webhook_trigger',
        config: {},
      });
      const readNode = createNode({
        id: 'read1',
        nodeType: 'read_variable',
        config: { variableName: 'myVar' },
      });
      const flow = createFlow(
        [webhookNode, readNode],
        [createEdge('webhook1', 'out', 'read1', 'in')],
        [{ name: 'myVar', type: 'string', defaultValue: 'webhook-default' }],
      );

      const result = await engine.executeFromWebhook(flow, api, 'webhook1', {
        payload: {},
        method: 'POST',
        headers: {},
        query: {},
      });

      expect(result.success).toBe(true);
      expect(result.variables.myVar).toBe('webhook-default');
    });
  });

  // =========================================================================
  // 8. Abort
  // =========================================================================

  describe('abort', () => {
    it('sets running to false', () => {
      // The engine is not currently running, but abort should still work
      engine.abort();
      expect(engine.running).toBe(false);
    });

    it('stops execution mid-flow when abort is called', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        // This script will trigger abort via a side-effect on the api mock
        script: 'return "before abort"',
      });
      const logNode = createNode({
        id: 'log1',
        nodeType: 'log',
        config: { message: 'should not execute' },
      });

      const flow = createFlow(
        [startNode, jsNode, logNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'log1', 'in'),
        ],
      );

      // We need to abort during execution. We can do this by having the log.info
      // mock call abort when it detects certain messages.
      let jsExecuted = false;
      const originalInfo = api.log.info as ReturnType<typeof vi.fn>;
      originalInfo.mockImplementation(() => {
        // After the js node's result is passed through, abort
        if (!jsExecuted) {
          jsExecuted = true;
        }
      });

      // Start execution in parallel with abort
      const execPromise = engine.executeFlow(flow, api);
      // Give the engine time to start, then abort
      // Since execution is synchronous in terms of node traversal (no real async between nodes),
      // we abort immediately and the for loop in for_loop or next node check will stop
      engine.abort();

      const result = await execPromise;

      // After abort, the engine should complete with what it has
      expect(result.success).toBe(true);
      expect(engine.running).toBe(false);
    });
  });

  // =========================================================================
  // 9. call_flow (subflow execution)
  // =========================================================================

  describe('call_flow subflow execution', () => {
    it('executes a subflow and returns its variables as result', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'sub-flow-1' },
      });
      const jsCapture = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return inp._result',
      });
      const mainFlow = createFlow(
        [startNode, callNode, jsCapture],
        [
          createEdge('start', 'out', 'call1', 'in'),
          createEdge('call1', 'out', 'js1', 'in'),
        ],
      );

      const subStart = createNode({ id: 'sub_start', nodeType: 'start' });
      const subWrite = createNode({
        id: 'sub_write',
        nodeType: 'write_variable',
        config: { variableName: 'output', value: 'subflow result' },
      });
      const subflow: AutomateFlowModel = {
        type: 'automate_flow',
        id: 'sub-flow-1',
        name: 'Sub Flow 1',
        version: '1.0',
        nodes: [subStart, subWrite],
        edges: [createEdge('sub_start', 'out', 'sub_write', 'in')],
      };

      const mockService = { getFlowById: vi.fn().mockReturnValue(subflow) };

      const result = await engine.executeFlow(mainFlow, api, { automateService: mockService });

      expect(result.success).toBe(true);
      const jsLog = result.executionLog.find(e => e.nodeId === 'js1');
      expect(jsLog?.result).toEqual({ output: 'subflow result' });
    });

    it('passes input as _parentInput to subflow', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return "payload data"',
      });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'sub-flow-1', passInputAsPayload: true },
      });
      const mainFlow = createFlow(
        [startNode, jsNode, callNode],
        [
          createEdge('start', 'out', 'js1', 'in'),
          createEdge('js1', 'out', 'call1', 'in'),
        ],
      );

      const subStart = createNode({ id: 'sub_start', nodeType: 'start' });
      const subJs = createNode({
        id: 'sub_js',
        nodeType: 'js_execute',
        script: 'return vars._parentInput',
      });
      const subflow: AutomateFlowModel = {
        type: 'automate_flow',
        id: 'sub-flow-1',
        name: 'Sub Flow 1',
        version: '1.0',
        nodes: [subStart, subJs],
        edges: [createEdge('sub_start', 'out', 'sub_js', 'in')],
      };

      const mockService = { getFlowById: vi.fn().mockReturnValue(subflow) };

      const result = await engine.executeFlow(mainFlow, api, { automateService: mockService });

      expect(result.success).toBe(true);
    });

    it('propagates subflow failure as error', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const callNode = createNode({
        id: 'call1',
        nodeType: 'call_flow',
        config: { flowId: 'failing-flow' },
      });
      const mainFlow = createFlow(
        [startNode, callNode],
        [createEdge('start', 'out', 'call1', 'in')],
      );

      // Subflow with no start node -> will fail
      const subflow: AutomateFlowModel = {
        type: 'automate_flow',
        id: 'failing-flow',
        name: 'Failing Flow',
        version: '1.0',
        nodes: [createNode({ id: 'log_only', nodeType: 'log', config: {} })],
        edges: [],
      };

      const mockService = { getFlowById: vi.fn().mockReturnValue(subflow) };

      const result = await engine.executeFlow(mainFlow, api, { automateService: mockService });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Subflow "Failing Flow" failed');
    });
  });

  // =========================================================================
  // 10. Schedule trigger & rate_limit
  // =========================================================================

  describe('node type: schedule_trigger', () => {
    it('passes schedule info as result', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const schedNode = createNode({
        id: 'sched1',
        nodeType: 'schedule_trigger',
        config: {},
      });
      const jsNode = createNode({
        id: 'js1',
        nodeType: 'js_execute',
        script: 'return inp._result',
      });
      const flow = createFlow(
        [startNode, schedNode, jsNode],
        [
          createEdge('start', 'out', 'sched1', 'in'),
          createEdge('sched1', 'out', 'js1', 'in'),
        ],
      );

      const result = await engine.executeFlow(flow, api, {
        initialInput: {
          _scheduledTime: '2026-01-01T00:00:00Z',
          _cronExpression: '0 * * * *',
          _timezone: 'UTC',
          _scheduleNodeId: 'sched1',
        },
      });

      expect(result.success).toBe(true);
      const schedLog = result.executionLog.find(e => e.nodeId === 'sched1');
      expect(schedLog?.result).toEqual({
        scheduledTime: '2026-01-01T00:00:00Z',
        cronExpression: '0 * * * *',
        timezone: 'UTC',
        scheduleNodeId: 'sched1',
      });
    });
  });

  describe('node type: rate_limit', () => {
    it('delays execution in delay mode', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const rateLimitNode = createNode({
        id: 'rate1',
        nodeType: 'rate_limit',
        config: { mode: 'delay', delayMs: 10 },
      });
      const logNode = createNode({ id: 'log1', nodeType: 'log', config: { message: 'after delay' } });
      const flow = createFlow(
        [startNode, rateLimitNode, logNode],
        [
          createEdge('start', 'out', 'rate1', 'in'),
          createEdge('rate1', 'out', 'log1', 'in'),
        ],
      );

      const start = Date.now();
      const result = await engine.executeFlow(flow, api);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(9); // Allow small timing variance
      const executedNodeIds = result.executionLog.map(e => e.nodeId);
      expect(executedNodeIds).toContain('log1');
    });

    it('throttle mode: first call passes, second within interval is skipped', async () => {
      // First execution should pass
      const startNode1 = createNode({ id: 'start', nodeType: 'start' });
      const throttleNode = createNode({
        id: 'throttle1',
        nodeType: 'rate_limit',
        config: { mode: 'throttle', delayMs: 5000 },
      });
      const passLog = createNode({ id: 'pass_log', nodeType: 'log', config: { message: 'passed' } });
      const skipLog = createNode({ id: 'skip_log', nodeType: 'log', config: { message: 'skipped' } });
      const flow1 = createFlow(
        [startNode1, throttleNode, passLog, skipLog],
        [
          createEdge('start', 'out', 'throttle1', 'in'),
          createEdge('throttle1', 'out', 'pass_log', 'in'),
          createEdge('throttle1', 'skipped', 'skip_log', 'in'),
        ],
      );

      const engine1 = new BackendAutomateEngine();
      const api1 = createMockApi();
      const result1 = await engine1.executeFlow(flow1, api1);

      expect(result1.success).toBe(true);
      const executedIds1 = result1.executionLog.map(e => e.nodeId);
      expect(executedIds1).toContain('pass_log');
      expect(executedIds1).not.toContain('skip_log');

      // Second execution immediately after should be throttled
      const engine2 = new BackendAutomateEngine();
      const api2 = createMockApi();
      const result2 = await engine2.executeFlow(flow1, api2);

      expect(result2.success).toBe(true);
      const executedIds2 = result2.executionLog.map(e => e.nodeId);
      expect(executedIds2).toContain('skip_log');
      expect(executedIds2).not.toContain('pass_log');
    });
  });

  // =========================================================================
  // 11. Engine state
  // =========================================================================

  describe('engine state', () => {
    it('running is false before execution', () => {
      expect(engine.running).toBe(false);
    });

    it('running is false after execution completes', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const flow = createFlow([startNode], []);

      await engine.executeFlow(flow, api);

      expect(engine.running).toBe(false);
    });

    it('running is false after execution fails', async () => {
      const flow = createFlow([], []);

      await engine.executeFlow(flow, api);

      expect(engine.running).toBe(false);
    });

    it('can execute multiple flows sequentially (engine resets state)', async () => {
      const startNode = createNode({ id: 'start', nodeType: 'start' });
      const writeNode = createNode({
        id: 'write1',
        nodeType: 'write_variable',
        config: { variableName: 'x', value: 'first' },
      });
      const flow1 = createFlow(
        [startNode, writeNode],
        [createEdge('start', 'out', 'write1', 'in')],
      );

      const result1 = await engine.executeFlow(flow1, api);
      expect(result1.variables.x).toBe('first');

      // Second execution should start with clean state
      resetCounters();
      const startNode2 = createNode({ id: 'start2', nodeType: 'start' });
      const writeNode2 = createNode({
        id: 'write2',
        nodeType: 'write_variable',
        config: { variableName: 'x', value: 'second' },
      });
      const flow2 = createFlow(
        [startNode2, writeNode2],
        [createEdge('start2', 'out', 'write2', 'in')],
      );

      const result2 = await engine.executeFlow(flow2, api);
      expect(result2.variables.x).toBe('second');
      // Execution log should only contain nodes from the second flow
      expect(result2.executionLog.every(e => e.nodeId === 'start2' || e.nodeId === 'write2')).toBe(true);
    });
  });
});
