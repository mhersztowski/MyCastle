/**
 * Node model - blok w grafie automatyzacji
 */

import { AutomatePortModel } from './AutomatePortModel';

export type AutomateNodeType =
  | 'start'
  | 'manual_trigger'
  | 'js_execute'
  | 'system_api'
  | 'if_else'
  | 'switch'
  | 'for_loop'
  | 'while_loop'
  | 'read_variable'
  | 'write_variable'
  | 'log'
  | 'notification'
  | 'llm_call'
  | 'tts'
  | 'stt'
  | 'comment';

export interface AutomateNodePosition {
  x: number;
  y: number;
}

export interface AutomateNodeModel {
  type: 'automate_node';
  id: string;
  nodeType: AutomateNodeType;
  name: string;
  description?: string;
  position: AutomateNodePosition;
  width?: number;
  height?: number;
  inputs: AutomatePortModel[];
  outputs: AutomatePortModel[];
  config: Record<string, unknown>;
  script?: string;
  disabled?: boolean;
}

export function createNode(
  id: string,
  nodeType: AutomateNodeType,
  name: string,
  position: AutomateNodePosition,
  inputs: AutomatePortModel[],
  outputs: AutomatePortModel[],
  config: Record<string, unknown> = {},
): AutomateNodeModel {
  return {
    type: 'automate_node',
    id,
    nodeType,
    name,
    position,
    inputs,
    outputs,
    config,
  };
}
