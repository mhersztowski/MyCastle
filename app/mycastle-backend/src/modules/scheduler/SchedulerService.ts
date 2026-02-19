/**
 * SchedulerService - zarządza cron jobami dla automatyzacji
 * Skanuje flow w poszukiwaniu schedule_trigger nodów i rejestruje cron tasks
 */

import * as cron from 'node-cron';
import { AutomateService } from '../automate/AutomateService';
import { FileSystem } from '../filesystem/FileSystem';
import { ExecutionResult } from '../automate/engine/BackendAutomateEngine';

export interface ScheduleJob {
  flowId: string;
  flowName: string;
  nodeId: string;
  nodeName: string;
  cronExpression: string;
  timezone: string;
  task: cron.ScheduledTask;
  enabled: boolean;
  lastRun?: number;
  lastResult?: 'success' | 'error';
}

export interface ScheduleExecutionRecord {
  flowId: string;
  nodeId: string;
  executedAt: number;
  completedAt: number;
  success: boolean;
  error?: string;
}

export class SchedulerService {
  private automateService: AutomateService;
  private fileSystem: FileSystem;
  private jobs: Map<string, ScheduleJob> = new Map();
  private executionHistory: ScheduleExecutionRecord[] = [];
  private maxHistorySize = 100;

  constructor(automateService: AutomateService, fileSystem: FileSystem) {
    this.automateService = automateService;
    this.fileSystem = fileSystem;
  }

  async initialize(): Promise<void> {
    await this.scanAndRegisterSchedules();
  }

  /**
   * Scan all flows and register schedule_trigger nodes
   */
  async scanAndRegisterSchedules(): Promise<void> {
    // Stop all existing jobs first
    this.stopAllJobs();

    const flows = this.automateService.getAllFlows();

    for (const flow of flows) {
      // Find all schedule_trigger nodes in this flow
      const scheduleTriggers = flow.nodes.filter(
        node => node.nodeType === 'schedule_trigger' && !node.disabled
      );

      for (const node of scheduleTriggers) {
        const cronExpression = node.config.cronExpression as string;
        const timezone = (node.config.timezone as string) || 'UTC';
        const enabled = node.config.enabled !== false;

        if (!cronExpression) {
          console.warn(`SchedulerService: Node ${node.name} in flow ${flow.name} has no cron expression`);
          continue;
        }

        if (!cron.validate(cronExpression)) {
          console.warn(`SchedulerService: Invalid cron expression "${cronExpression}" in node ${node.name}`);
          continue;
        }

        if (enabled) {
          this.registerJob(flow.id, flow.name, node.id, node.name, cronExpression, timezone);
        }
      }
    }

    console.log(`SchedulerService: Registered ${this.jobs.size} active schedules`);
  }

  /**
   * Register a cron job for a schedule_trigger node
   */
  private registerJob(
    flowId: string,
    flowName: string,
    nodeId: string,
    nodeName: string,
    cronExpression: string,
    timezone: string
  ): void {
    const jobKey = `${flowId}:${nodeId}`;

    // Prevent duplicate registration
    if (this.jobs.has(jobKey)) {
      return;
    }

    try {
      const task = cron.schedule(
        cronExpression,
        async () => {
          await this.executeScheduledFlow(flowId, nodeId, jobKey);
        },
        {
          timezone,
        }
      );

      const job: ScheduleJob = {
        flowId,
        flowName,
        nodeId,
        nodeName,
        cronExpression,
        timezone,
        task,
        enabled: true,
      };

      this.jobs.set(jobKey, job);
      console.log(`SchedulerService: Registered schedule "${nodeName}" (${cronExpression}) for flow "${flowName}"`);
    } catch (err) {
      console.error(`SchedulerService: Failed to register schedule for ${flowName}:${nodeName}:`, err);
    }
  }

  /**
   * Execute a flow triggered by schedule
   */
  private async executeScheduledFlow(flowId: string, nodeId: string, jobKey: string): Promise<void> {
    const job = this.jobs.get(jobKey);
    if (!job) return;

    const executedAt = Date.now();
    console.log(`SchedulerService: Executing scheduled flow "${job.flowName}" (trigger: ${job.nodeName})`);

    try {
      const result: ExecutionResult = await this.automateService.executeFlow(flowId, {
        _scheduledTime: executedAt,
        _scheduleNodeId: nodeId,
        _cronExpression: job.cronExpression,
        _timezone: job.timezone,
      });

      const completedAt = Date.now();
      job.lastRun = completedAt;
      job.lastResult = result.success ? 'success' : 'error';

      // Record execution
      this.addExecutionRecord({
        flowId,
        nodeId,
        executedAt,
        completedAt,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        console.log(`SchedulerService: Flow "${job.flowName}" completed successfully (${completedAt - executedAt}ms)`);
      } else {
        console.error(`SchedulerService: Flow "${job.flowName}" failed: ${result.error}`);
      }
    } catch (err) {
      const completedAt = Date.now();
      job.lastRun = completedAt;
      job.lastResult = 'error';

      const errorMsg = err instanceof Error ? err.message : String(err);
      this.addExecutionRecord({
        flowId,
        nodeId,
        executedAt,
        completedAt,
        success: false,
        error: errorMsg,
      });

      console.error(`SchedulerService: Flow "${job.flowName}" execution error:`, err);
    }
  }

  /**
   * Add execution record to history (with max size limit)
   */
  private addExecutionRecord(record: ScheduleExecutionRecord): void {
    this.executionHistory.push(record);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Stop all registered jobs
   */
  private stopAllJobs(): void {
    for (const [key, job] of this.jobs) {
      try {
        job.task.stop();
      } catch (err) {
        console.warn(`SchedulerService: Error stopping job ${key}:`, err);
      }
    }
    this.jobs.clear();
  }

  /**
   * Reload all schedules (called when flows are modified)
   */
  async reload(): Promise<void> {
    console.log('SchedulerService: Reloading schedules...');
    await this.scanAndRegisterSchedules();
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): ScheduleJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): ScheduleExecutionRecord[] {
    return [...this.executionHistory];
  }

  /**
   * Get job status
   */
  getJobStatus(flowId: string, nodeId: string): ScheduleJob | undefined {
    return this.jobs.get(`${flowId}:${nodeId}`);
  }
}
