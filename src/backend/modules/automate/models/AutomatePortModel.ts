export type AutomatePortDataType = 'flow' | 'string' | 'number' | 'boolean' | 'object' | 'any';

export type AutomatePortDirection = 'input' | 'output';

export interface AutomatePortModel {
  id: string;
  name: string;
  direction: AutomatePortDirection;
  dataType: AutomatePortDataType;
  required?: boolean;
  multiple?: boolean;
}
