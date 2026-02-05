/**
 * Automate Service - CRUD dla flow automatyzacji
 */

import { AutomateFlowModel, AutomateFlowsModel } from '../models';
import { AutomateFlowNode } from '../nodes';
import { mqttClient } from '../../mqttclient';

const AUTOMATIONS_PATH = 'data/automations.json';

export class AutomateService {
  private flows: Map<string, AutomateFlowNode> = new Map();
  private isLoaded = false;
  private isLoading = false;

  async loadFlows(): Promise<AutomateFlowNode[]> {
    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.getAllFlows();
    }

    this.isLoading = true;

    try {
      const file = await mqttClient.readFile(AUTOMATIONS_PATH);

      if (!file || !file.content) {
        this.isLoaded = true;
        this.isLoading = false;
        return [];
      }

      const data = JSON.parse(file.content) as AutomateFlowsModel;

      this.flows.clear();
      if (data.flows) {
        for (const model of data.flows) {
          const node = AutomateFlowNode.fromModel(model);
          this.flows.set(node.id, node);
        }
      }

      this.isLoaded = true;
      this.isLoading = false;
      return Array.from(this.flows.values());
    } catch (err) {
      console.error('Failed to load automations.json:', err);
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

  async saveFlow(flow: AutomateFlowNode): Promise<boolean> {
    this.flows.set(flow.id, flow);
    flow.markClean();
    return this.persistFlows();
  }

  async createFlow(model: AutomateFlowModel): Promise<AutomateFlowNode> {
    const node = AutomateFlowNode.fromModel(model);
    this.flows.set(node.id, node);
    await this.persistFlows();
    return node;
  }

  async deleteFlow(id: string): Promise<boolean> {
    const deleted = this.flows.delete(id);
    if (deleted) {
      return this.persistFlows();
    }
    return false;
  }

  hasFlow(id: string): boolean {
    return this.flows.has(id);
  }

  get loaded(): boolean {
    return this.isLoaded;
  }

  async duplicateFlow(id: string, newId: string, newName?: string): Promise<AutomateFlowNode | null> {
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
    await this.persistFlows();
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

  private async persistFlows(): Promise<boolean> {
    const data: AutomateFlowsModel = {
      type: 'automate_flows',
      flows: Array.from(this.flows.values()).map(node => node.toModel()),
    };

    try {
      await mqttClient.writeFile(AUTOMATIONS_PATH, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save automations.json:', err);
      return false;
    }
  }
}

export const automateService = new AutomateService();
