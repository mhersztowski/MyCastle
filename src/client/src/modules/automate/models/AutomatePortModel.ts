/**
 * Port model - punkt połączenia na nodzie
 */

export type AutomatePortDataType = 'flow' | 'string' | 'number' | 'boolean' | 'object' | 'any' | 'error';

export type AutomatePortDirection = 'input' | 'output';

export interface AutomatePortModel {
  id: string;
  name: string;
  direction: AutomatePortDirection;
  dataType: AutomatePortDataType;
  required?: boolean;
  multiple?: boolean;
}

/**
 * Dane przekazywane przez port error
 */
export interface AutomateErrorData {
  message: string;
  stack?: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  timestamp: number;
  input?: unknown;
}
