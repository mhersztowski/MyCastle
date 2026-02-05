/**
 * Backend Automate Service - ładowanie i wykonywanie flow automatyzacji
 */

import { FileSystem } from '../filesystem/FileSystem';
import { DataSource } from '../datasource/DataSource';
import { AutomateFlowModel, AutomateFlowsModel } from './models/AutomateFlowModel';
import { NODE_RUNTIME_MAP } from './models/AutomateNodeModel';
import { BackendAutomateEngine, ExecutionResult } from './engine/BackendAutomateEngine';
import { BackendSystemApi } from './engine/BackendSystemApi';

const AUTOMATIONS_PATH = 'data/automations.json';

export class AutomateService {
  private fileSystem: FileSystem;
  private dataSource: DataSource;
  private flows: Map<string, AutomateFlowModel> = new Map();
  private isLoaded = false;

  constructor(fileSystem: FileSystem, dataSource: DataSource) {
    this.fileSystem = fileSystem;
    this.dataSource = dataSource;
  }

  async initialize(): Promise<void> {
    await this.loadFlows();
    this.isLoaded = true;
  }

  private async loadFlows(): Promise<void> {
    try {
      const fileData = await this.fileSystem.readFile(AUTOMATIONS_PATH);
      const data = JSON.parse(fileData.content) as AutomateFlowsModel;

      this.flows.clear();
      if (data.flows) {
        for (const flow of data.flows) {
          this.flows.set(flow.id, flow);
        }
      }
      console.log(`AutomateService: Loaded ${this.flows.size} flows`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('AutomateService: Failed to load automations.json:', err);
      }
    }
  }

  async reload(): Promise<void> {
    await this.loadFlows();
  }

  async executeFlow(flowId: string, inputVars?: Record<string, unknown>): Promise<ExecutionResult> {
    const flow = this.flows.get(flowId);
    if (!flow) {
      return {
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
        error: `Flow not found: ${flowId}`,
      };
    }

    // Validate: check for client-only nodes
    const clientOnlyNodes = flow.nodes.filter(n => {
      const runtime = NODE_RUNTIME_MAP[n.nodeType];
      return runtime === 'client' && !n.disabled;
    });

    if (clientOnlyNodes.length > 0) {
      const nodeNames = clientOnlyNodes.map(n => `${n.name} (${n.nodeType})`).join(', ');
      return {
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
        error: `Flow contains client-only nodes that cannot run on backend: ${nodeNames}`,
      };
    }

    // Merge input variables with flow defaults
    const variables: Record<string, unknown> = {};
    if (flow.variables) {
      for (const v of flow.variables) {
        variables[v.name] = v.defaultValue ?? null;
      }
    }
    if (inputVars) {
      Object.assign(variables, inputVars);
    }

    const api = new BackendSystemApi(this.fileSystem, this.dataSource, variables);
    const engine = new BackendAutomateEngine();

    console.log(`AutomateService: Executing flow "${flow.name}" (${flowId})`);
    const result = await engine.executeFlow(flow, api);
    console.log(`AutomateService: Flow "${flow.name}" completed: success=${result.success}`);

    return result;
  }

  getFlowById(id: string): AutomateFlowModel | undefined {
    return this.flows.get(id);
  }

  getAllFlows(): AutomateFlowModel[] {
    return Array.from(this.flows.values());
  }

  get loaded(): boolean {
    return this.isLoaded;
  }
}
