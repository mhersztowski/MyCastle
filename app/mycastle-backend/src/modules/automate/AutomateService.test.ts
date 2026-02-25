import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AutomateService } from './AutomateService';
import { FileSystem, DataSource } from '@mhersztowski/core-backend';
import type { AutomateFlowModel, AutomateNodeModel } from '@mhersztowski/core';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// --- Test fixtures ---

function makeNode(
  id: string,
  nodeType: AutomateNodeModel['nodeType'],
  name: string,
  config: Record<string, unknown> = {},
): AutomateNodeModel {
  return {
    type: 'automate_node',
    id,
    nodeType,
    name,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    config,
  };
}

function makeSimpleFlow(id: string, name: string): AutomateFlowModel {
  return {
    type: 'automate_flow',
    id,
    name,
    version: '1.0',
    nodes: [
      makeNode('start-1', 'start', 'Start'),
      makeNode('log-1', 'log', 'Log Hello', { message: 'Hello from flow' }),
    ],
    edges: [
      {
        type: 'automate_edge',
        id: 'edge-1',
        sourceNodeId: 'start-1',
        sourcePortId: 'out',
        targetNodeId: 'log-1',
        targetPortId: 'in',
      },
    ],
    variables: [],
  };
}

function makeWebhookFlow(
  id: string,
  name: string,
  options: { secret?: string; allowedMethods?: string[] } = {},
): AutomateFlowModel {
  return {
    type: 'automate_flow',
    id,
    name,
    version: '1.0',
    nodes: [
      makeNode('webhook-1', 'webhook_trigger', 'Webhook Trigger', {
        secret: options.secret,
        allowedMethods: options.allowedMethods,
      }),
      makeNode('log-1', 'log', 'Log Webhook', { message: 'Got webhook' }),
    ],
    edges: [
      {
        type: 'automate_edge',
        id: 'edge-1',
        sourceNodeId: 'webhook-1',
        sourcePortId: 'out',
        targetNodeId: 'log-1',
        targetPortId: 'in',
      },
    ],
    variables: [],
  };
}

// --- Test setup ---

let tmpDir: string;
let fileSystem: FileSystem;
let dataSource: DataSource;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'automate-svc-test-'));
  fileSystem = new FileSystem(tmpDir);
  await fileSystem.initialize();

  // Create a mock DataSource (AutomateService needs it but tests here
  // don't exercise DataSource-specific functionality heavily)
  dataSource = {
    persons: [],
    tasks: [],
    projects: [],
    shoppingLists: [],
    events: [],
    getPersonById: () => undefined,
    getTaskById: () => undefined,
    getProjectById: () => undefined,
    getShoppingListById: () => undefined,
    getEventsByDate: () => [],
    findPersons: () => [],
    findTasks: () => [],
    findProjects: () => [],
    findEvents: () => [],
    findShoppingLists: () => [],
    getTasksByProjectId: () => [],
    getUnassignedTasks: () => [],
    findProjectByIdDeep: () => undefined,
    getAllProjectsFlat: () => [],
    getActiveShoppingLists: () => [],
    getCompletedShoppingLists: () => [],
    getShoppingItemsByPersonId: () => [],
    getEventsByTaskId: () => [],
    getLastEventByTaskId: () => undefined,
    isLoaded: true,
    getStats: () => ({ persons: 0, tasks: 0, projects: 0, events: 0, shoppingLists: 0 }),
    calendar: { clear: () => {}, getItems: () => [], addItem: () => {} },
    clear: () => {},
    initialize: async () => {},
    onFileChanged: async () => {},
    // Minis stubs
    minisModuleDefs: [],
    minisModules: [],
    minisDeviceDefs: [],
    minisDevices: [],
    minisProjectDefs: [],
    minisProjects: [],
    users: [],
    getMinisModuleDefById: () => undefined,
    findMinisModuleDefs: () => [],
    getMinisModuleById: () => undefined,
    findMinisModules: () => [],
    getMinisDeviceDefById: () => undefined,
    findMinisDeviceDefs: () => [],
    getMinisDeviceById: () => undefined,
    findMinisDevices: () => [],
    getMinisProjectDefById: () => undefined,
    findMinisProjectDefs: () => [],
    getMinisProjectById: () => undefined,
    findMinisProjects: () => [],
    getUserById: () => undefined,
    findUsers: () => [],
  } as unknown as DataSource;

  // Seed filesystem with test .automate.json files

  // Flow 1: simple flow in root
  const simpleFlow = makeSimpleFlow('flow-simple-1', 'Simple Flow');
  await fileSystem.writeFile('flows/simple.automate.json', JSON.stringify(simpleFlow));

  // Flow 2: webhook flow (no secret) in nested dir
  const webhookFlowNoSecret = makeWebhookFlow('flow-webhook-no-secret', 'Webhook No Secret');
  await fileSystem.writeFile('flows/webhooks/no-secret.automate.json', JSON.stringify(webhookFlowNoSecret));

  // Flow 3: webhook flow (with secret)
  const webhookFlowWithSecret = makeWebhookFlow('flow-webhook-with-secret', 'Webhook With Secret', {
    secret: 'my-secret-token',
    allowedMethods: ['GET', 'POST'],
  });
  await fileSystem.writeFile('flows/webhooks/with-secret.automate.json', JSON.stringify(webhookFlowWithSecret));

  // Flow 4: invalid JSON file (should be skipped)
  await fileSystem.writeFile('flows/broken.automate.json', '{ invalid json !!!');

  // Flow 5: webhook flow with default methods (no allowedMethods configured)
  const webhookFlowDefaultMethods = makeWebhookFlow('flow-webhook-default-methods', 'Webhook Default Methods');
  await fileSystem.writeFile('flows/webhooks/default-methods.automate.json', JSON.stringify(webhookFlowDefaultMethods));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// --- Tests ---

describe('AutomateService', () => {
  describe('initialize / loadFlows', () => {
    it('discovers .automate.json files recursively in the filesystem', async () => {
      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();

      const flows = service.getAllFlows();
      // 4 valid flows (simple, webhook-no-secret, webhook-with-secret, webhook-default-methods)
      // broken.automate.json should be skipped
      expect(flows.length).toBe(4);
    });

    it('loads flow models from valid JSON', async () => {
      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();

      const flow = service.getFlowById('flow-simple-1');
      expect(flow).toBeDefined();
      expect(flow!.name).toBe('Simple Flow');
      expect(flow!.type).toBe('automate_flow');
      expect(flow!.nodes).toHaveLength(2);
      expect(flow!.edges).toHaveLength(1);
    });

    it('skips invalid JSON files gracefully (logs warning but does not crash)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();

      // Should have logged a warning about the broken file
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load flow'),
        expect.anything(),
      );

      // Service should still work
      expect(service.loaded).toBe(true);
      expect(service.getAllFlows().length).toBe(4);

      warnSpy.mockRestore();
    });

    it('reports correct flow count and sets loaded flag', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const service = new AutomateService(fileSystem, dataSource);
      expect(service.loaded).toBe(false);

      await service.initialize();

      expect(service.loaded).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 4 flows'),
      );

      logSpy.mockRestore();
    });
  });

  describe('getAllFlows / getFlowById', () => {
    let service: AutomateService;

    beforeAll(async () => {
      service = new AutomateService(fileSystem, dataSource);
      await service.initialize();
    });

    it('returns all loaded flows', () => {
      const flows = service.getAllFlows();
      expect(flows).toHaveLength(4);

      const ids = flows.map(f => f.id).sort();
      expect(ids).toEqual([
        'flow-simple-1',
        'flow-webhook-default-methods',
        'flow-webhook-no-secret',
        'flow-webhook-with-secret',
      ]);
    });

    it('returns flow by ID', () => {
      const flow = service.getFlowById('flow-webhook-with-secret');
      expect(flow).toBeDefined();
      expect(flow!.name).toBe('Webhook With Secret');
    });

    it('returns undefined for unknown ID', () => {
      const flow = service.getFlowById('nonexistent-flow-id');
      expect(flow).toBeUndefined();
    });
  });

  describe('executeFlow', () => {
    let service: AutomateService;

    beforeAll(async () => {
      service = new AutomateService(fileSystem, dataSource);
      await service.initialize();
    });

    it('executes flow by ID successfully', async () => {
      // Suppress console output from engine
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await service.executeFlow('flow-simple-1');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.executionLog.length).toBeGreaterThan(0);
      // The start node + log node should have been executed
      const nodeTypes = result.executionLog.map(l => l.nodeType);
      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('log');

      logSpy.mockRestore();
    });

    it('returns error for unknown flow ID', async () => {
      const result = await service.executeFlow('does-not-exist');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Flow not found: does-not-exist');
      expect(result.executionLog).toEqual([]);
    });
  });

  describe('validateWebhookSecret', () => {
    let service: AutomateService;

    beforeAll(async () => {
      service = new AutomateService(fileSystem, dataSource);
      await service.initialize();
    });

    it('returns true when no secret configured on node', () => {
      const result = service.validateWebhookSecret(
        'flow-webhook-no-secret',
        'webhook-1',
        undefined,
      );
      expect(result).toBe(true);
    });

    it('returns true when token matches secret', () => {
      const result = service.validateWebhookSecret(
        'flow-webhook-with-secret',
        'webhook-1',
        'my-secret-token',
      );
      expect(result).toBe(true);
    });

    it('returns false when token does not match secret', () => {
      const result = service.validateWebhookSecret(
        'flow-webhook-with-secret',
        'webhook-1',
        'wrong-token',
      );
      expect(result).toBe(false);
    });

    it('returns false for non-existent flow', () => {
      const result = service.validateWebhookSecret(
        'nonexistent-flow',
        'webhook-1',
        'any-token',
      );
      expect(result).toBe(false);
    });

    it('returns false for non-existent node in valid flow', () => {
      const result = service.validateWebhookSecret(
        'flow-webhook-with-secret',
        'nonexistent-node',
        'my-secret-token',
      );
      expect(result).toBe(false);
    });

    it('returns false when node is not a webhook_trigger', () => {
      // flow-simple-1 has a "start" node and a "log" node, neither is webhook_trigger
      const result = service.validateWebhookSecret(
        'flow-simple-1',
        'log-1',
        undefined,
      );
      expect(result).toBe(false);
    });
  });

  describe('getWebhookAllowedMethods', () => {
    let service: AutomateService;

    beforeAll(async () => {
      service = new AutomateService(fileSystem, dataSource);
      await service.initialize();
    });

    it('returns configured methods', () => {
      const methods = service.getWebhookAllowedMethods(
        'flow-webhook-with-secret',
        'webhook-1',
      );
      expect(methods).toEqual(['GET', 'POST']);
    });

    it('defaults to [POST] when not configured', () => {
      const methods = service.getWebhookAllowedMethods(
        'flow-webhook-default-methods',
        'webhook-1',
      );
      expect(methods).toEqual(['POST']);
    });

    it('returns null for non-existent flow', () => {
      const methods = service.getWebhookAllowedMethods(
        'nonexistent-flow',
        'webhook-1',
      );
      expect(methods).toBeNull();
    });

    it('returns null for non-existent node', () => {
      const methods = service.getWebhookAllowedMethods(
        'flow-webhook-with-secret',
        'nonexistent-node',
      );
      expect(methods).toBeNull();
    });

    it('returns null when node is not a webhook_trigger', () => {
      const methods = service.getWebhookAllowedMethods(
        'flow-simple-1',
        'start-1',
      );
      expect(methods).toBeNull();
    });
  });

  describe('reload', () => {
    it('reloads flows from filesystem', async () => {
      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();
      expect(service.getAllFlows()).toHaveLength(4);

      // Modify a flow on disk (change name)
      const updatedFlow = makeSimpleFlow('flow-simple-1', 'Simple Flow UPDATED');
      await fileSystem.writeFile('flows/simple.automate.json', JSON.stringify(updatedFlow));
      // Clear filesystem cache so re-read picks up new content
      fileSystem.clearCache();

      await service.reload();

      const flow = service.getFlowById('flow-simple-1');
      expect(flow).toBeDefined();
      expect(flow!.name).toBe('Simple Flow UPDATED');

      // Restore original for other tests
      const original = makeSimpleFlow('flow-simple-1', 'Simple Flow');
      await fileSystem.writeFile('flows/simple.automate.json', JSON.stringify(original));
      fileSystem.clearCache();
    });

    it('picks up newly added files', async () => {
      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();
      const initialCount = service.getAllFlows().length;

      // Add a new flow file
      const newFlow = makeSimpleFlow('flow-new-dynamic', 'Dynamic Flow');
      await fileSystem.writeFile('flows/dynamic.automate.json', JSON.stringify(newFlow));
      fileSystem.clearCache();

      await service.reload();

      expect(service.getAllFlows()).toHaveLength(initialCount + 1);
      expect(service.getFlowById('flow-new-dynamic')).toBeDefined();
      expect(service.getFlowById('flow-new-dynamic')!.name).toBe('Dynamic Flow');

      // Clean up: remove added file and reload
      await fileSystem.deleteFile('flows/dynamic.automate.json');
      fileSystem.clearCache();
      await service.reload();
    });
  });

  describe('getFlowPath', () => {
    it('returns the file path for a loaded flow', async () => {
      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();

      const flowPath = service.getFlowPath('flow-simple-1');
      expect(flowPath).toBeDefined();
      expect(flowPath).toContain('simple.automate.json');
    });

    it('returns undefined for unknown flow ID', async () => {
      const service = new AutomateService(fileSystem, dataSource);
      await service.initialize();

      const flowPath = service.getFlowPath('nonexistent');
      expect(flowPath).toBeUndefined();
    });
  });
});
