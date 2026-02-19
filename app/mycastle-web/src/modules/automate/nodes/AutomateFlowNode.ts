/**
 * Automate Flow Node - runtime state wrapper dla AutomateFlowModel
 */

import {
  NodeBase,
  AutomateFlowModel,
  AutomateVariableDefinition,
  AutomateNodeModel,
  AutomateEdgeModel,
} from '@mhersztowski/core';

export class AutomateFlowNode extends NodeBase<AutomateFlowModel> {
  id: string;
  name: string;
  description?: string;
  version: string;
  runtime?: 'client' | 'backend' | 'universal';
  nodes: AutomateNodeModel[];
  edges: AutomateEdgeModel[];
  variables: AutomateVariableDefinition[];
  viewport?: { x: number; y: number; zoom: number };
  createdAt?: string;
  updatedAt?: string;

  constructor(model: AutomateFlowModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.description = model.description;
    this.version = model.version;
    this.runtime = model.runtime;
    this.nodes = model.nodes.map(n => ({ ...n }));
    this.edges = model.edges.map(e => ({ ...e }));
    this.variables = (model.variables || []).map(v => ({ ...v }));
    this.viewport = model.viewport ? { ...model.viewport } : undefined;
    this.createdAt = model.createdAt;
    this.updatedAt = model.updatedAt;
  }

  static fromModel(model: AutomateFlowModel): AutomateFlowNode {
    return new AutomateFlowNode(model);
  }

  getDisplayName(): string {
    return this.name;
  }

  toModel(): AutomateFlowModel {
    const model: AutomateFlowModel = {
      type: 'automate_flow',
      id: this.id,
      name: this.name,
      version: this.version,
      nodes: this.nodes.map(n => ({ ...n })),
      edges: this.edges.map(e => ({ ...e })),
    };

    if (this.description) model.description = this.description;
    if (this.runtime) model.runtime = this.runtime;
    if (this.variables.length > 0) model.variables = this.variables.map(v => ({ ...v }));
    if (this.viewport) model.viewport = { ...this.viewport };
    if (this.createdAt) model.createdAt = this.createdAt;
    if (this.updatedAt) model.updatedAt = this.updatedAt;

    return model;
  }

  clone(): AutomateFlowNode {
    return AutomateFlowNode.fromModel(this.toModel());
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      this.id.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  getNodeById(nodeId: string): AutomateNodeModel | undefined {
    return this.nodes.find(n => n.id === nodeId);
  }

  getEdgesForNode(nodeId: string): AutomateEdgeModel[] {
    return this.edges.filter(e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId);
  }
}
