import { AutomateNodeModel } from './AutomateNodeModel';
import { AutomateEdgeModel } from './AutomateEdgeModel';

export interface AutomateVariableDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
}

export interface AutomateFlowModel {
  type: 'automate_flow';
  id: string;
  name: string;
  description?: string;
  version: string;
  runtime?: 'client' | 'backend' | 'universal';
  nodes: AutomateNodeModel[];
  edges: AutomateEdgeModel[];
  variables?: AutomateVariableDefinition[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface AutomateFlowsModel {
  type: 'automate_flows';
  flows: AutomateFlowModel[];
}
