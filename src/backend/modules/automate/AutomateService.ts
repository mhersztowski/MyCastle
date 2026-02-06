/**
 * Backend Automate Service - ładowanie i wykonywanie flow automatyzacji
 * Flows are stored as *.automate.json files anywhere in the filesystem
 */

import { FileSystem, DirectoryTree } from '../filesystem/FileSystem';
import { DataSource } from '../datasource/DataSource';
import { AutomateFlowModel } from './models/AutomateFlowModel';
import { NODE_RUNTIME_MAP } from './models/AutomateNodeModel';
import { BackendAutomateEngine, ExecutionResult } from './engine/BackendAutomateEngine';
import { BackendSystemApi } from './engine/BackendSystemApi';

const FLOW_EXTENSION = '.automate.json';

export class AutomateService {
  private fileSystem: FileSystem;
  private dataSource: DataSource;
  private flows: Map<string, AutomateFlowModel> = new Map();
  private flowPaths: Map<string, string> = new Map(); // flowId -> filePath
  private isLoaded = false;

  constructor(fileSystem: FileSystem, dataSource: DataSource) {
    this.fileSystem = fileSystem;
    this.dataSource = dataSource;
  }

  async initialize(): Promise<void> {
    await this.loadFlows();
    this.isLoaded = true;
  }

  /**
   * Recursively find all .automate.json files in directory tree
   */
  private collectAutomateFiles(tree: DirectoryTree, files: string[]): void {
    if (tree.type === 'file' && tree.name.endsWith(FLOW_EXTENSION)) {
      files.push(tree.path);
    }
    if (tree.children) {
      for (const child of tree.children) {
        this.collectAutomateFiles(child, files);
      }
    }
  }

  private async loadFlows(): Promise<void> {
    try {
      // Scan entire filesystem for .automate.json files
      const tree = await this.fileSystem.listDirectory('');
      const automateFiles: string[] = [];
      this.collectAutomateFiles(tree, automateFiles);

      this.flows.clear();
      this.flowPaths.clear();

      for (const filePath of automateFiles) {
        try {
          const fileData = await this.fileSystem.readFile(filePath);
          const flow = JSON.parse(fileData.content) as AutomateFlowModel;
          this.flows.set(flow.id, flow);
          this.flowPaths.set(flow.id, filePath);
        } catch (err) {
          console.warn(`AutomateService: Failed to load flow ${filePath}:`, err);
        }
      }

      console.log(`AutomateService: Loaded ${this.flows.size} flows from filesystem`);
    } catch (err) {
      console.warn('AutomateService: Failed to scan filesystem for flows:', err);
    }
  }

  /**
   * Get the file path for a flow
   */
  getFlowPath(flowId: string): string | undefined {
    return this.flowPaths.get(flowId);
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
