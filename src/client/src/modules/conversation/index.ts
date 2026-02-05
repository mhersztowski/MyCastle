/**
 * Conversation Module - konwersacje z tool calling i scenariuszami
 */

export { ConversationEngine } from './engine/ConversationEngine';
export { actionRegistry } from './actions/ActionRegistry';
export { ActionRegistry } from './actions/ActionRegistry';
export { initializeActions } from './actions/initActions';
export { conversationService, ConversationService } from './services/ConversationService';
export { conversationHistoryService, ConversationHistoryService } from './services/ConversationHistoryService';
export type {
  ConversationAction,
  ConversationActionCategory,
  ConversationMessage,
  ConversationScenario,
  ConversationConfig,
  ConversationHistoryModel,
  ConversationEngineCallbacks,
  ContextInjector,
} from './models/ConversationModels';
export { DEFAULT_CONVERSATION_CONFIG, DEFAULT_SCENARIOS } from './models/ConversationModels';
