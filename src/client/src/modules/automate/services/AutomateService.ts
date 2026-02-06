/**
 * Automate Service - CRUD dla flow automatyzacji
 * Flows are stored as *.automate.json files anywhere in the filesystem
 */

import { AutomateFlowModel, AutomateFlowsModel } from '../models';
import { AutomateFlowNode } from '../nodes';
import { mqttClient, DirectoryTree } from '../../mqttclient';

const FLOW_EXTENSION = '.automate.json';
const DEFAULT_AUTOMATIONS_DIR = 'data/automations';
const LEGACY_AUTOMATIONS_PATH = 'data/automations.json';

export class AutomateService {
  private flows: Map<string, AutomateFlowNode> = new Map();
  private flowPaths: Map<string, string> = new Map(); // flowId -> filePath
  private isLoaded = false;
  private isLoading = false;
  private migrationDone = false;

  /**
   * Get the file path for a flow
   */
  getFlowPath(flowId: string): string | undefined {
    return this.flowPaths.get(flowId);
  }

  /**
   * Get default path for new flow
   */
  private getDefaultFlowPath(flowId: string): string {
    return `${DEFAULT_AUTOMATIONS_DIR}/${flowId}${FLOW_EXTENSION}`;
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

  /**
   * Migrate from legacy formats to .automate.json
   */
  private async migrateFromLegacy(): Promise<boolean> {
    if (this.migrationDone) return false;
    this.migrationDone = true;

    let migrated = false;

    // Migrate from automations.json
    try {
      const legacyFile = await mqttClient.readFile(LEGACY_AUTOMATIONS_PATH);
      if (legacyFile?.content) {
        const data = JSON.parse(legacyFile.content) as AutomateFlowsModel;
        if (data.flows && data.flows.length > 0) {
          console.log(`Migrating ${data.flows.length} flows from legacy automations.json...`);
          for (const model of data.flows) {
            const filePath = this.getDefaultFlowPath(model.id);
            await mqttClient.writeFile(filePath, JSON.stringify(model, null, 2));
            console.log(`  Migrated flow: ${model.name} -> ${filePath}`);
          }
          await mqttClient.deleteFile(LEGACY_AUTOMATIONS_PATH);
          console.log('Legacy automations.json removed.');
          migrated = true;
        }
      }
    } catch {
      // Legacy file doesn't exist - OK
    }

    // Migrate from data/automations/*.json to *.automate.json
    try {
      const tree = await mqttClient.listDirectory(DEFAULT_AUTOMATIONS_DIR);
      if (tree.children) {
        for (const child of tree.children) {
          if (child.type === 'file' && child.name.endsWith('.json') && !child.name.endsWith(FLOW_EXTENSION)) {
            try {
              const file = await mqttClient.readFile(child.path);
              if (file?.content) {
                const model = JSON.parse(file.content) as AutomateFlowModel;
                if (model.type === 'automate_flow') {
                  const newPath = child.path.replace(/\.json$/, FLOW_EXTENSION);
                  await mqttClient.writeFile(newPath, file.content);
                  await mqttClient.deleteFile(child.path);
                  console.log(`  Renamed: ${child.path} -> ${newPath}`);
                  migrated = true;
                }
              }
            } catch (err) {
              console.warn(`Failed to migrate ${child.path}:`, err);
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist - OK
    }

    return migrated;
  }

  async loadFlows(): Promise<AutomateFlowNode[]> {
    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.getAllFlows();
    }

    this.isLoading = true;

    try {
      // Try to migrate from legacy format first
      await this.migrateFromLegacy();

      // Scan entire filesystem for .automate.json files
      const tree = await mqttClient.listDirectory('');
      const automateFiles: string[] = [];
      this.collectAutomateFiles(tree, automateFiles);

      this.flows.clear();
      this.flowPaths.clear();

      for (const filePath of automateFiles) {
        try {
          const file = await mqttClient.readFile(filePath);
          if (file?.content) {
            const model = JSON.parse(file.content) as AutomateFlowModel;
            const node = AutomateFlowNode.fromModel(model);
            this.flows.set(node.id, node);
            this.flowPaths.set(node.id, filePath);
          }
        } catch (err) {
          console.error(`Failed to load flow ${filePath}:`, err);
        }
      }

      console.log(`AutomateService: Loaded ${this.flows.size} flows from filesystem`);
      this.isLoaded = true;
      this.isLoading = false;
      return Array.from(this.flows.values());
    } catch (err) {
      console.warn('Failed to scan filesystem for flows:', err);
      this.isLoaded = true;
      this.isLoading = false;
      return [];
    }
  }

  getFlowById(id: string): AutomateFlowNode | undefined {
    return this.flows.get(id);
  }

  getAllFlows(): AutomateFlowNode[] {
    return Array.from(this.flows.values());
  }

  async saveFlow(flow: AutomateFlowNode, customPath?: string): Promise<boolean> {
    this.flows.set(flow.id, flow);
    flow.markClean();
    return this.persistFlow(flow, customPath);
  }

  async createFlow(model: AutomateFlowModel, customPath?: string): Promise<AutomateFlowNode> {
    const node = AutomateFlowNode.fromModel(model);
    this.flows.set(node.id, node);
    await this.persistFlow(node, customPath);
    return node;
  }

  async deleteFlow(id: string): Promise<boolean> {
    const filePath = this.flowPaths.get(id);
    const deleted = this.flows.delete(id);
    this.flowPaths.delete(id);

    if (deleted && filePath) {
      try {
        await mqttClient.deleteFile(filePath);
        return true;
      } catch (err) {
        console.error(`Failed to delete flow file ${filePath}:`, err);
        return false;
      }
    }
    return deleted;
  }

  hasFlow(id: string): boolean {
    return this.flows.has(id);
  }

  get loaded(): boolean {
    return this.isLoaded;
  }

  async duplicateFlow(id: string, newId: string, newName?: string, customPath?: string): Promise<AutomateFlowNode | null> {
    const original = this.flows.get(id);
    if (!original) return null;

    const clone = original.clone();
    clone.id = newId;
    if (newName) {
      clone.name = newName;
    }
    clone.createdAt = new Date().toISOString();
    clone.updatedAt = new Date().toISOString();

    this.flows.set(clone.id, clone);
    await this.persistFlow(clone, customPath);
    return clone;
  }

  searchFlows(query: string): AutomateFlowNode[] {
    if (!query.trim()) {
      return this.getAllFlows();
    }
    return Array.from(this.flows.values()).filter(flow => flow.matches(query));
  }

  clear(): void {
    this.flows.clear();
    this.isLoaded = false;
  }

  async reload(): Promise<AutomateFlowNode[]> {
    this.clear();
    return this.loadFlows();
  }

  private async persistFlow(flow: AutomateFlowNode, customPath?: string): Promise<boolean> {
    const model = flow.toModel();

    // Use custom path, existing path, or generate default
    let filePath = customPath;
    if (!filePath) {
      filePath = this.flowPaths.get(flow.id) || this.getDefaultFlowPath(flow.id);
    }

    // Ensure path has correct extension
    if (!filePath.endsWith(FLOW_EXTENSION)) {
      filePath = filePath.replace(/\.json$/, '') + FLOW_EXTENSION;
    }

    try {
      await mqttClient.writeFile(filePath, JSON.stringify(model, null, 2));
      this.flowPaths.set(flow.id, filePath);
      return true;
    } catch (err) {
      console.error(`Failed to save flow ${flow.id} to ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Move flow to a new path
   */
  async moveFlow(id: string, newPath: string): Promise<boolean> {
    const flow = this.flows.get(id);
    const oldPath = this.flowPaths.get(id);
    if (!flow) return false;

    // Ensure correct extension
    if (!newPath.endsWith(FLOW_EXTENSION)) {
      newPath = newPath.replace(/\.json$/, '') + FLOW_EXTENSION;
    }

    try {
      // Save to new path
      await mqttClient.writeFile(newPath, JSON.stringify(flow.toModel(), null, 2));
      this.flowPaths.set(id, newPath);

      // Delete old path if different
      if (oldPath && oldPath !== newPath) {
        await mqttClient.deleteFile(oldPath);
      }

      return true;
    } catch (err) {
      console.error(`Failed to move flow ${id} to ${newPath}:`, err);
      return false;
    }
  }
}

export const automateService = new AutomateService();
