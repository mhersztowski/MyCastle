import { SchedulerService } from './SchedulerService';
import type { AutomateFlowModel, AutomateNodeModel } from '@mhersztowski/core';
import type { ExecutionResult } from '@mhersztowski/core-backend';

// --- Helpers ---

function createScheduleNode(
  id: string,
  name: string,
  config: Record<string, unknown> = {},
  disabled = false,
): AutomateNodeModel {
  return {
    type: 'automate_node',
    id,
    nodeType: 'schedule_trigger',
    name,
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    config: {
      cronExpression: '*/5 * * * *',
      timezone: 'UTC',
      enabled: true,
      ...config,
    },
    disabled,
  };
}

function createFlow(
  id: string,
  name: string,
  nodes: AutomateNodeModel[] = [],
): AutomateFlowModel {
  return {
    type: 'automate_flow',
    id,
    name,
    version: '1.0',
    nodes,
    edges: [],
  };
}

function createMockAutomateService(flows: AutomateFlowModel[] = []) {
  return {
    getAllFlows: vi.fn().mockReturnValue(flows),
    executeFlow: vi.fn<(flowId: string, inputVars?: Record<string, unknown>) => Promise<ExecutionResult>>()
      .mockResolvedValue({
        success: true,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
      }),
  };
}

function createMockFileSystem() {
  return {} as any;
}

// --- Tests ---

describe('SchedulerService', () => {
  let service: SchedulerService;
  let mockAutomate: ReturnType<typeof createMockAutomateService>;
  let mockFs: ReturnType<typeof createMockFileSystem>;

  beforeEach(() => {
    mockAutomate = createMockAutomateService();
    mockFs = createMockFileSystem();
    service = new SchedulerService(mockAutomate as any, mockFs);
  });

  afterEach(() => {
    service.shutdown();
  });

  // -------------------------
  // scanAndRegisterSchedules
  // -------------------------

  describe('scanAndRegisterSchedules', () => {
    it('registers cron jobs for schedule_trigger nodes', async () => {
      const node1 = createScheduleNode('n1', 'Every 5 min', { cronExpression: '*/5 * * * *' });
      const node2 = createScheduleNode('n2', 'Every hour', { cronExpression: '0 * * * *' });
      const flow = createFlow('f1', 'My Flow', [node1, node2]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      const jobs = service.getActiveJobs();
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.nodeId).sort()).toEqual(['n1', 'n2']);
      expect(jobs[0].flowId).toBe('f1');
      expect(jobs[0].enabled).toBe(true);
    });

    it('skips disabled nodes (node.disabled === true)', async () => {
      const enabled = createScheduleNode('n1', 'Enabled');
      const disabled = createScheduleNode('n2', 'Disabled', {}, true);
      const flow = createFlow('f1', 'Flow', [enabled, disabled]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      const jobs = service.getActiveJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].nodeId).toBe('n1');
    });

    it('skips nodes with enabled === false in config', async () => {
      const node = createScheduleNode('n1', 'Config Disabled', { enabled: false });
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      expect(service.getActiveJobs()).toHaveLength(0);
    });

    it('skips nodes without a cron expression', async () => {
      const node = createScheduleNode('n1', 'No cron', {
        cronExpression: undefined,
      });
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      expect(service.getActiveJobs()).toHaveLength(0);
    });

    it('skips nodes with empty cron expression', async () => {
      const node = createScheduleNode('n1', 'Empty cron', {
        cronExpression: '',
      });
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      expect(service.getActiveJobs()).toHaveLength(0);
    });

    it('skips nodes with an invalid cron expression', async () => {
      const node = createScheduleNode('n1', 'Bad cron', {
        cronExpression: 'invalid cron',
      });
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      expect(service.getActiveJobs()).toHaveLength(0);
    });

    it('prevents duplicate registration for the same flowId:nodeId', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      // Return two identical flows to simulate duplicates
      mockAutomate.getAllFlows.mockReturnValue([flow, flow]);

      await service.scanAndRegisterSchedules();

      // stopAllJobs clears jobs, then re-registers. Two identical flows
      // with the same node id should only register once due to duplicate check.
      expect(service.getActiveJobs()).toHaveLength(1);
    });

    it('stops existing jobs before re-scan', async () => {
      const node1 = createScheduleNode('n1', 'First');
      const flow1 = createFlow('f1', 'Flow1', [node1]);
      mockAutomate.getAllFlows.mockReturnValue([flow1]);

      await service.scanAndRegisterSchedules();
      expect(service.getActiveJobs()).toHaveLength(1);
      const firstJob = service.getActiveJobs()[0];
      const stopSpy = vi.spyOn(firstJob.task, 'stop');

      // Re-scan with different flows
      const node2 = createScheduleNode('n2', 'Second');
      const flow2 = createFlow('f2', 'Flow2', [node2]);
      mockAutomate.getAllFlows.mockReturnValue([flow2]);

      await service.scanAndRegisterSchedules();

      expect(stopSpy).toHaveBeenCalled();
      const jobs = service.getActiveJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].nodeId).toBe('n2');
    });
  });

  // -------------------------
  // shutdown
  // -------------------------

  describe('shutdown', () => {
    it('stops all running jobs and clears jobs map', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();
      expect(service.getActiveJobs()).toHaveLength(1);

      service.shutdown();

      expect(service.getActiveJobs()).toHaveLength(0);
    });
  });

  // -------------------------
  // reload
  // -------------------------

  describe('reload', () => {
    it('calls scanAndRegisterSchedules again', async () => {
      const node1 = createScheduleNode('n1', 'Old');
      const flow1 = createFlow('f1', 'OldFlow', [node1]);
      mockAutomate.getAllFlows.mockReturnValue([flow1]);

      await service.scanAndRegisterSchedules();
      expect(service.getActiveJobs()).toHaveLength(1);
      expect(service.getActiveJobs()[0].nodeName).toBe('Old');

      // Change what getAllFlows returns
      const node2 = createScheduleNode('n2', 'New');
      const flow2 = createFlow('f2', 'NewFlow', [node2]);
      mockAutomate.getAllFlows.mockReturnValue([flow2]);

      await service.reload();

      const jobs = service.getActiveJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].nodeName).toBe('New');
      expect(jobs[0].flowName).toBe('NewFlow');
    });
  });

  // -------------------------
  // Execution history
  // -------------------------

  describe('execution history', () => {
    it('records execution results when cron callback fires', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      // Directly invoke the private method to simulate cron firing
      const executeMethod = (service as any).executeScheduledFlow.bind(service);
      await executeMethod('f1', 'n1', 'f1:n1');

      expect(mockAutomate.executeFlow).toHaveBeenCalledWith('f1', expect.objectContaining({
        _scheduleNodeId: 'n1',
        _cronExpression: '*/5 * * * *',
        _timezone: 'UTC',
      }));

      const history = service.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].flowId).toBe('f1');
      expect(history[0].nodeId).toBe('n1');
      expect(history[0].success).toBe(true);
      expect(history[0].executedAt).toBeLessThanOrEqual(history[0].completedAt);
    });

    it('records error when executeFlow fails', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);
      mockAutomate.executeFlow.mockRejectedValueOnce(new Error('Network failure'));

      await service.scanAndRegisterSchedules();

      const executeMethod = (service as any).executeScheduledFlow.bind(service);
      await executeMethod('f1', 'n1', 'f1:n1');

      const history = service.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe('Network failure');
    });

    it('records error when executeFlow returns success: false', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);
      mockAutomate.executeFlow.mockResolvedValueOnce({
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
        error: 'Flow logic error',
      });

      await service.scanAndRegisterSchedules();

      const executeMethod = (service as any).executeScheduledFlow.bind(service);
      await executeMethod('f1', 'n1', 'f1:n1');

      const history = service.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe('Flow logic error');

      // Verify job lastResult is updated
      const job = service.getJobStatus('f1', 'n1');
      expect(job?.lastResult).toBe('error');
    });

    it('enforces maxHistorySize of 100', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      const executeMethod = (service as any).executeScheduledFlow.bind(service);

      // Execute 101 times
      for (let i = 0; i < 101; i++) {
        await executeMethod('f1', 'n1', 'f1:n1');
      }

      const history = service.getExecutionHistory();
      expect(history).toHaveLength(100);
    });

    it('getExecutionHistory returns a copy (not a reference)', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      const executeMethod = (service as any).executeScheduledFlow.bind(service);
      await executeMethod('f1', 'n1', 'f1:n1');

      const history1 = service.getExecutionHistory();
      const history2 = service.getExecutionHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);

      // Mutating the returned array should not affect internal state
      history1.push({
        flowId: 'fake',
        nodeId: 'fake',
        executedAt: 0,
        completedAt: 0,
        success: true,
      });
      expect(service.getExecutionHistory()).toHaveLength(1);
    });
  });

  // -------------------------
  // getActiveJobs
  // -------------------------

  describe('getActiveJobs', () => {
    it('returns list of registered jobs across multiple flows', async () => {
      const node1 = createScheduleNode('n1', 'Trigger A', { cronExpression: '*/10 * * * *' });
      const node2 = createScheduleNode('n2', 'Trigger B', { cronExpression: '0 0 * * *' });
      const flow1 = createFlow('f1', 'Flow1', [node1]);
      const flow2 = createFlow('f2', 'Flow2', [node2]);
      mockAutomate.getAllFlows.mockReturnValue([flow1, flow2]);

      await service.scanAndRegisterSchedules();

      const jobs = service.getActiveJobs();
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.flowName).sort()).toEqual(['Flow1', 'Flow2']);
      expect(jobs.every(j => j.cronExpression && j.timezone === 'UTC')).toBe(true);
    });

    it('returns empty array when no jobs registered', () => {
      expect(service.getActiveJobs()).toEqual([]);
    });
  });

  // -------------------------
  // getJobStatus
  // -------------------------

  describe('getJobStatus', () => {
    it('returns the job for a given flowId:nodeId', async () => {
      const node = createScheduleNode('n1', 'Trigger', { cronExpression: '0 * * * *' });
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.scanAndRegisterSchedules();

      const job = service.getJobStatus('f1', 'n1');
      expect(job).toBeDefined();
      expect(job!.flowId).toBe('f1');
      expect(job!.nodeId).toBe('n1');
      expect(job!.cronExpression).toBe('0 * * * *');
      expect(job!.nodeName).toBe('Trigger');
    });

    it('returns undefined for an unknown flowId:nodeId', async () => {
      expect(service.getJobStatus('nonexistent', 'node')).toBeUndefined();
    });
  });

  // -------------------------
  // initialize
  // -------------------------

  describe('initialize', () => {
    it('calls scanAndRegisterSchedules', async () => {
      const node = createScheduleNode('n1', 'Trigger');
      const flow = createFlow('f1', 'Flow', [node]);
      mockAutomate.getAllFlows.mockReturnValue([flow]);

      await service.initialize();

      expect(service.getActiveJobs()).toHaveLength(1);
      expect(mockAutomate.getAllFlows).toHaveBeenCalled();
    });
  });
});
