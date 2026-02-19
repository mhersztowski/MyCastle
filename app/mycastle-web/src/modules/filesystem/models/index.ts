// Re-export domain models and automate types from core.
// MQTT types (FileData, DirectoryTree, etc.) are excluded to avoid name
// collisions with filesystem's own FileData class — import mqtt types
// from @mhersztowski/core or modules/mqttclient directly.
// Node classes are excluded — they are re-exported from ../nodes/index.ts.
export type {
  PersonModel,
  PersonsModel,
  TaskModel,
  TasksModel,
  TaskComponentModel,
  TaskTestComponentModel,
  TaskIntervalComponentModel,
  TaskSequenceComponentModel,
  ProjectModel,
  ProjectsModel,
  ProjectComponentModel,
  ProjectTestComponentModel,
  EventModel,
  EventsModel,
  EventComponentModel,
  EventTestComponentModel,
  ShoppingItemModel,
  ShoppingListModel,
  ShoppingListsModel,
  FileModel,
  FileComponentModel,
  FileTestComponentModel,
  FileJsonComponentModel,
  FileMarkdownComponentModel,
  DirModel,
  DirComponentModel,
  DirTestComponentModel,
  AutomateVariableDefinition,
  AutomateFlowModel,
  AutomateFlowsModel,
  AutomateNodeType,
  AutomateNodeRuntime,
  AutomateNodePosition,
  AutomateNodeModel,
  AutomateEdgeModel,
  AutomatePortDataType,
  AutomatePortDirection,
  AutomatePortModel,
  AutomateErrorData,
} from '@mhersztowski/core';
export {
  createFlow,
  createFlowsCollection,
  createNode,
  NODE_RUNTIME_MAP,
} from '@mhersztowski/core';

// Frontend-only constants
export { DEFAULT_SHOPPING_CATEGORIES, DEFAULT_SHOPPING_UNITS } from './ShoppingModel';
